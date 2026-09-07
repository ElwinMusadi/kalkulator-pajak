/**
 * scripts/seed-d1.ts
 *
 * Membaca Data Potensi September.xlsx dan menghasilkan seed/vehicles.sql
 * berisi INSERT ... ON CONFLICT DO UPDATE ke tabel vehicle_njkb.
 *
 * Jalankan:
 *   npx tsx scripts/seed-d1.ts
 *   npx wrangler d1 execute kalkulator-pajak-db --file=./seed/vehicles.sql [--remote]
 */

import * as fs from "fs"
import * as path from "path"
import { fileURLToPath } from "url"
import XLSX from "xlsx"

// ---------------------------------------------------------------------------
// Konfigurasi path (ESM-compatible __dirname)
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const EXCEL_PATH = path.resolve(__dirname, "../Data Potensi September.xlsx")
const OUTPUT_SQL = path.resolve(__dirname, "../seed/vehicles.sql")

// ---------------------------------------------------------------------------
// Fungsi parsing nilai uang: "11.500.000" atau "27,000,000" → 11500000
// ---------------------------------------------------------------------------
function parseRupiah(raw: unknown): number {
  if (raw === null || raw === undefined) return 0
  // Jika sudah number (Excel number cell)
  if (typeof raw === "number") return Math.round(raw)
  const str = String(raw).trim()
  // Hapus semua karakter bukan digit
  const cleaned = str.replace(/[^0-9]/g, "")
  return cleaned === "" ? 0 : parseInt(cleaned, 10)
}

// ---------------------------------------------------------------------------
// Fungsi parsing bobot: "1,050" → 1.05 | "1,000" → 1.0 | 1.05 → 1.05
// ---------------------------------------------------------------------------
function parseBobot(raw: unknown): number {
  if (raw === null || raw === undefined) return 1.0
  if (typeof raw === "number") {
    // Excel mungkin menyimpan sebagai 1.05 langsung
    if (raw > 0 && raw <= 3) return raw
    // Atau sebagai 1050 (ribuan) → normalisasi
    if (raw >= 1000) return raw / 1000
    return 1.0
  }
  const str = String(raw).trim()
  // Format "1,050" atau "1,300" — koma sebagai separator ribuan dalam format id
  // Deteksi: jika ada koma dan 3 digit setelahnya → separator ribuan → ganti dengan titik
  const normalized = str.replace(",", ".")
  const val = parseFloat(normalized)
  // Nilai bobot seharusnya antara 1.0 - 2.0
  if (!isNaN(val) && val >= 1 && val <= 3) return val
  // Fallback: jika > 3 mungkin format ribuan (e.g. 1050 → 1.05)
  if (!isNaN(val) && val >= 1000) return val / 1000
  return 1.0
}

// ---------------------------------------------------------------------------
// Fungsi normalisasi tanggal ke ISO YYYY-MM-DD
// ---------------------------------------------------------------------------
function parseDate(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === "") return null

  // Excel date serial number
  if (typeof raw === "number") {
    // XLSX dapat memberikan Date object via sheet_to_json dengan dateNF
    const date = XLSX.SSF.parse_date_code(raw)
    if (date) {
      const y = date.y
      const m = String(date.m).padStart(2, "0")
      const d = String(date.d).padStart(2, "0")
      return `${y}-${m}-${d}`
    }
    return null
  }

  const str = String(raw).trim()
  if (str === "" || str === "--") return null

  // Format ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.substring(0, 10)

  // Format DD/MM/YYYY atau DD-MM-YYYY
  const ddmmyyyy = str.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/)
  if (ddmmyyyy) {
    const [, d, m, y] = ddmmyyyy
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`
  }

  return null
}

// ---------------------------------------------------------------------------
// Normalisasi Nopol: uppercase, hapus spasi dan karakter non-alfanumerik
// ---------------------------------------------------------------------------
function normalizeNopol(raw: unknown): string {
  return String(raw ?? "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9]/g, "")
}

// ---------------------------------------------------------------------------
// Escape string untuk SQL
// ---------------------------------------------------------------------------
function sqlStr(val: string | null | undefined): string {
  if (val === null || val === undefined) return "NULL"
  return `'${String(val).replace(/'/g, "''")}'`
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  if (!fs.existsSync(EXCEL_PATH)) {
    console.error(`❌ File tidak ditemukan: ${EXCEL_PATH}`)
    process.exit(1)
  }

  console.log(`📂 Membaca: ${EXCEL_PATH}`)
  const workbook = XLSX.readFile(EXCEL_PATH, { cellDates: false, raw: true })

  // Cari sheet "Data Potensi" atau gunakan sheet pertama
  const targetSheet =
    workbook.SheetNames.find((n) =>
      n.toLowerCase().includes("data potensi")
    ) ?? workbook.SheetNames[0]

  console.log(`📋 Menggunakan sheet: "${targetSheet}"`)
  const worksheet = workbook.Sheets[targetSheet]

  // Konversi ke JSON — header pada baris pertama
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    raw: true,
    defval: null,
  })

  console.log(`📊 Total baris: ${rows.length}`)

  // Mapping header — case-insensitive, trim spasi
  function findKey(row: Record<string, unknown>, candidates: string[]): string | undefined {
    const keys = Object.keys(row)
    for (const candidate of candidates) {
      const found = keys.find(
        (k) => k.trim().toLowerCase() === candidate.toLowerCase()
      )
      if (found !== undefined) return found
    }
    return undefined
  }

  const statements: string[] = []
  let validCount = 0
  let skipCount = 0
  const seenNopol = new Set<string>()

  for (const row of rows) {
    const nopolKey = findKey(row, ["nopol", "nomor polisi", "no. polisi"])
    const namaKey = findKey(row, ["nama"])
    const jenisKey = findKey(row, ["jenis"])
    const sdStnkKey = findKey(row, ["sd stnk"])
    const sdNoticeKey = findKey(row, ["sd notice"])
    const njkbKey = findKey(row, ["njkb"])
    const njubKey = findKey(row, ["njub"])
    const bobotKey = findKey(row, ["bobot"])

    if (!nopolKey || !njkbKey) {
      skipCount++
      continue
    }

    const nopol = normalizeNopol(row[nopolKey])
    if (!nopol) {
      skipCount++
      continue
    }

    const njkb = parseRupiah(njkbKey ? row[njkbKey] : null)
    if (njkb <= 0) {
      skipCount++
      continue
    }

    // Hanya simpan satu baris per Nopol (duplikasi di Excel → UPSERT akan overwrite)
    // Tapi kita tandai yang pertama dijumpai agar log lebih informatif
    const isDuplicate = seenNopol.has(nopol)
    if (!isDuplicate) seenNopol.add(nopol)

    const nama = namaKey ? String(row[namaKey] ?? "").trim() || null : null
    const jenis = jenisKey ? String(row[jenisKey] ?? "").trim() || null : null
    const stnk = sdStnkKey ? parseDate(row[sdStnkKey]) : null
    const notice = sdNoticeKey ? parseDate(row[sdNoticeKey]) : null
    const njub = njubKey ? parseRupiah(row[njubKey]) : 0
    const bobot = bobotKey ? parseBobot(row[bobotKey]) : 1.0

    const sql = `INSERT INTO vehicle_njkb (nopol, nama, jenis, jatuh_tempo_stnk, jatuh_tempo_pajak, njkb, njub, bobot)
VALUES (${sqlStr(nopol)}, ${sqlStr(nama)}, ${sqlStr(jenis)}, ${sqlStr(stnk)}, ${sqlStr(notice)}, ${njkb}, ${njub}, ${bobot})
ON CONFLICT(nopol) DO UPDATE SET
  nama              = excluded.nama,
  jenis             = excluded.jenis,
  jatuh_tempo_stnk  = excluded.jatuh_tempo_stnk,
  jatuh_tempo_pajak = excluded.jatuh_tempo_pajak,
  njkb              = excluded.njkb,
  njub              = excluded.njub,
  bobot             = excluded.bobot,
  updated_at        = CURRENT_TIMESTAMP;`

    statements.push(sql)
    validCount++
  }

  // Tulis ke file SQL
  const outputDir = path.dirname(OUTPUT_SQL)
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })

  const header = `-- Auto-generated by scripts/seed-d1.ts
-- Sumber: Data Potensi September.xlsx
-- Total: ${validCount} kendaraan unik (${seenNopol.size} nopol)
-- Tanggal: ${new Date().toISOString()}

`
  fs.writeFileSync(OUTPUT_SQL, header + statements.join("\n\n") + "\n")

  console.log(`\n✅ Selesai!`)
  console.log(`   Valid     : ${validCount} baris`)
  console.log(`   Dilewati  : ${skipCount} baris`)
  console.log(`   Nopol unik: ${seenNopol.size}`)
  console.log(`   Output    : ${OUTPUT_SQL}`)
  console.log(`\nLangkah selanjutnya:`)
  console.log(`  npx wrangler d1 execute kalkulator-pajak-db --file=./schema.sql --remote`)
  console.log(`  npx wrangler d1 execute kalkulator-pajak-db --file=./seed/vehicles.sql --remote`)
}

main()
