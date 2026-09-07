/**
 * scripts/seed-d1.ts
 *
 * Memproses data-kendaraan/Data Kendaraan New.xlsx lalu menghasilkan file SQL
 * bertahap yang siap diimpor ke Cloudflare D1. File pertama menghapus seluruh
 * data lama sehingga hasil import selalu mencerminkan workbook terbaru.
 *
 * Jalankan:
 *   npm run seed
 *   Get-ChildItem ./seed/vehicles/*.sql | Sort-Object Name | ForEach-Object {
 *     npx wrangler d1 execute kalkulator-pajak-db --remote --file=$_.FullName
 *   }
 */

import * as fs from "fs"
import * as path from "path"
import { fileURLToPath } from "url"
import XLSX from "xlsx"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const EXCEL_PATH = path.resolve(
  __dirname,
  "../data-kendaraan/Data Kendaraan New.xlsx"
)
const OUTPUT_DIR = path.resolve(__dirname, "../seed/vehicles")
const ROWS_PER_FILE = 50_000
const ROWS_PER_INSERT = 500

type ExcelRow = Record<string, unknown>

function parseRupiah(raw: unknown): number {
  if (raw === null || raw === undefined || raw === "") return 0
  if (typeof raw === "number") return Math.round(raw)
  const digits = String(raw).replace(/[^0-9]/g, "")
  return digits ? Number.parseInt(digits, 10) : 0
}

function parseBobot(raw: unknown): number {
  if (raw === null || raw === undefined || raw === "") return 1
  if (typeof raw === "number") {
    if (raw > 0 && raw <= 3) return raw
    return raw >= 1_000 ? raw / 1_000 : 1
  }

  const value = Number.parseFloat(String(raw).trim().replace(",", "."))
  if (Number.isNaN(value)) return 1
  if (value >= 1 && value <= 3) return value
  return value >= 1_000 ? value / 1_000 : 1
}

function parseDate(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === "") return null

  if (typeof raw === "number") {
    const date = XLSX.SSF.parse_date_code(raw)
    if (!date || date.y < 2000 || date.y > 2100) return null
    return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`
  }

  const value = String(raw).trim()
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) {
    const [, year, month, day] = iso
    const yearNumber = Number(year)
    return yearNumber >= 2000 && yearNumber <= 2100 ? `${year}-${month}-${day}` : null
  }

  const match = value.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/)
  if (!match) return null

  const [, day, month, year] = match
  const yearNumber = Number(year)
  return yearNumber >= 2000 && yearNumber <= 2100
    ? `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`
    : null
}

function normalizeNopol(raw: unknown): string {
  return String(raw ?? "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9]/g, "")
}

function sqlString(value: string | null): string {
  return value === null ? "NULL" : `'${value.replace(/'/g, "''")}'`
}

function rowToValues(row: ExcelRow, headers: Record<string, string>): string | null {
  const nopol = normalizeNopol(row[headers.nopol])
  const njkb = parseRupiah(row[headers.njkb])

  if (!nopol || njkb <= 0) return null

  const nama = String(row[headers.nama] ?? "").trim() || null
  const jenis = String(row[headers.jenis] ?? "").trim() || null
  const jatuhTempoStnk = parseDate(row[headers.jatuhTempoStnk])
  const jatuhTempoPajak = parseDate(row[headers.jatuhTempoPajak])
  const njub = parseRupiah(row[headers.njub])
  const bobot = parseBobot(row[headers.bobot])

  return `(${sqlString(nopol)}, ${sqlString(nama)}, ${sqlString(jenis)}, ${sqlString(jatuhTempoStnk)}, ${sqlString(jatuhTempoPajak)}, ${njkb}, ${njub}, ${bobot})`
}

function findHeaders(firstRow: ExcelRow): Record<string, string> {
  const normalized = new Map(
    Object.keys(firstRow).map((key) => [key.trim().toLowerCase(), key])
  )

  function requireHeader(...candidates: string[]): string {
    for (const candidate of candidates) {
      const found = normalized.get(candidate.toLowerCase())
      if (found) return found
    }
    throw new Error(`Header Excel tidak ditemukan: ${candidates.join(" / ")}`)
  }

  return {
    nopol: requireHeader("nopol", "nomor polisi", "no. polisi"),
    nama: requireHeader("nama"),
    jenis: requireHeader("jenis"),
    jatuhTempoStnk: requireHeader("jt_stnk", "sd stnk"),
    jatuhTempoPajak: requireHeader("jt_pajak", "sd notice"),
    njkb: requireHeader("nilai_jual", "njkb"),
    njub: requireHeader("njub"),
    bobot: requireHeader("bobot"),
  }
}

function createInsert(values: string[]): string {
  return `INSERT INTO vehicle_njkb (
  nopol, nama, jenis, jatuh_tempo_stnk, jatuh_tempo_pajak, njkb, njub, bobot
) VALUES
${values.join(",\n")}
ON CONFLICT(nopol) DO UPDATE SET
  nama = excluded.nama,
  jenis = excluded.jenis,
  jatuh_tempo_stnk = excluded.jatuh_tempo_stnk,
  jatuh_tempo_pajak = excluded.jatuh_tempo_pajak,
  njkb = excluded.njkb,
  njub = excluded.njub,
  bobot = excluded.bobot,
  updated_at = CURRENT_TIMESTAMP;\n\n`
}

function ensureCleanOutputDirectory(): void {
  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true })
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })
}

function main(): void {
  if (!fs.existsSync(EXCEL_PATH)) {
    throw new Error(`File tidak ditemukan: ${EXCEL_PATH}`)
  }

  console.log(`Membaca workbook: ${EXCEL_PATH}`)
  const workbook = XLSX.readFile(EXCEL_PATH, { raw: true })
  const sheetName = workbook.SheetNames[0]
  const worksheet = workbook.Sheets[sheetName]
  const range = XLSX.utils.decode_range(worksheet["!ref"] ?? "A1")
  const totalRows = range.e.r

  // Ambil satu baris data untuk memvalidasi header yang sebenarnya.
  const firstDataRow = XLSX.utils.sheet_to_json<ExcelRow>(worksheet, {
    range: 0,
    raw: true,
    defval: null,
  })[0]
  if (!firstDataRow) throw new Error("Workbook tidak memiliki data kendaraan.")

  const headers = findHeaders(firstDataRow)
  const excelHeaders = Object.keys(firstDataRow)
  console.log(`Sheet: ${sheetName}; baris data: ${totalRows.toLocaleString("id-ID")}`)
  console.log(`Kolom terdeteksi: ${JSON.stringify(headers)}`)

  ensureCleanOutputDirectory()

  let fileIndex = 1
  let fileRows = 0
  let validRows = 0
  let skippedRows = 0
  let currentOutput = ""
  let values: string[] = []

  const openFile = () => {
    const fileName = `${String(fileIndex).padStart(4, "0")}.sql`
    currentOutput = path.join(OUTPUT_DIR, fileName)
    const prefix = `-- Auto-generated from Data Kendaraan New.xlsx\n-- File ${fileIndex}; jalankan berurutan.\n${fileIndex === 1 ? "\n-- Menimpa seluruh dataset sebelumnya.\nDELETE FROM vehicle_njkb;\n\n" : ""}`
    fs.writeFileSync(currentOutput, prefix)
    fileRows = 0
  }

  const flushInsert = () => {
    if (!values.length) return
    fs.appendFileSync(currentOutput, createInsert(values))
    values = []
  }

  const closeFile = () => {
    flushInsert()
    if (fileRows > 0) {
      console.log(`  ${path.basename(currentOutput)}: ${fileRows.toLocaleString("id-ID")} data`)
      fileIndex++
    } else {
      fs.rmSync(currentOutput, { force: true })
    }
  }

  openFile()

  // Baca per blok supaya workbook besar tidak membuat array 955 ribu objek tambahan.
  const READ_CHUNK_SIZE = 10_000
  for (let startRow = 1; startRow <= range.e.r; startRow += READ_CHUNK_SIZE) {
    const endRow = Math.min(startRow + READ_CHUNK_SIZE - 1, range.e.r)
    const rawChunk = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      range: { s: { r: startRow, c: range.s.c }, e: { r: endRow, c: range.e.c } },
      raw: true,
      defval: null,
      blankrows: false,
    })
    const chunk = rawChunk.map((cells) =>
      Object.fromEntries(excelHeaders.map((header, index) => [header, cells[index] ?? null]))
    )

    for (const row of chunk) {
      const value = rowToValues(row, headers)
      if (!value) {
        skippedRows++
        continue
      }

      values.push(value)
      fileRows++
      validRows++

      if (values.length === ROWS_PER_INSERT) flushInsert()
      if (fileRows === ROWS_PER_FILE) {
        closeFile()
        openFile()
      }
    }
  }

  closeFile()

  const manifest = {
    source: path.relative(path.resolve(__dirname, ".."), EXCEL_PATH),
    generatedAt: new Date().toISOString(),
    validRows,
    skippedRows,
    sqlFiles: fileIndex - 1,
    importCommand: "Get-ChildItem ./seed/vehicles/*.sql | Sort-Object Name | ForEach-Object { npx wrangler d1 execute kalkulator-pajak-db --remote --file=$_.FullName }",
  }
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`
  )

  console.log("\nSeed SQL selesai dibuat.")
  console.log(`  Valid: ${validRows.toLocaleString("id-ID")}`)
  console.log(`  Dilewati: ${skippedRows.toLocaleString("id-ID")}`)
  console.log(`  File SQL: ${manifest.sqlFiles}`)
  console.log("\nImport remote D1:")
  console.log(manifest.importCommand)
}

main()
