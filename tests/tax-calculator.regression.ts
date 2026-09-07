/**
 * tests/tax-calculator.regression.ts
 *
 * Memvalidasi perhitungan terhadap contoh penetapan resmi dalam
 * Surat Edaran No. 900.1.13.1/2741/BPAD2.1 (Pedoman Pergub 54/2026).
 */

import assert from "node:assert/strict"
import { calculateTax } from "../src/lib/tax-calculator.ts"
import type { TaxCalculatorInput } from "../src/types/tax.ts"

function pass(name: string) {
  console.log(`  ✓  ${name}`)
}

// ---------------------------------------------------------------------------
// Fixture dasar untuk Innova Venturer (NJKB 329.000.000, bobot 1,05)
// ---------------------------------------------------------------------------
const innoBase: Omit<TaxCalculatorInput, "jatuhTempoPajak" | "jatuhTempoStnk"> = {
  njkb: 329_000_000,
  njub: 0,
  bobot: 1.05,
  jenisKendaraan: "MINIBUS",
  tanggalBayar: new Date("2026-10-01T00:00:00"),
  isDomisiliGempa: true,   // Contoh 1–5 pakai diskon 75% (gempa)
  isTembakRu: false,
}

// ---------------------------------------------------------------------------
// Contoh 1: Minibus tunggakan 4 tahun, gempa 75%
// Masa PKB: 1 Mar 2022; Bayar: 1 Okt 2026 → tunggakan 2022,23,24,25
// ---------------------------------------------------------------------------
{
  const r = calculateTax({
    ...innoBase,
    jatuhTempoPajak: new Date("2022-03-01T00:00:00"),
    jatuhTempoStnk: new Date("2022-03-01T00:00:00"),
  })
  // PKB berjalan: (329e6 × 1,05) × 1,2% = 4.145.400
  assert.equal(r.pkbBerjalan, 4_145_400, "Contoh 1 - pkbBerjalan")
  // PKB tunggak post-2025: 4.145.400 × 25% = 1.036.350
  assert.equal(r.pkbTunggakanPost2025, 1_036_350, "Contoh 1 - pkbPost2025")
  // PKB tunggak pra-2025: 3 thn × 1,5% × 329e6×1,05 = 15.545.250 × 25% = 3.886.312,5 → ~3.886.313
  // Dokumen: 3.886.313 (pembulatan)
  assert.ok(
    Math.abs(r.pkbTunggakanPra2025 - 3_886_312.5) < 1,
    "Contoh 1 - pkbPra2025"
  )
  // Opsen berjalan: 4.145.400 × 66% = 2.735.964
  assert.equal(r.opsenBerjalan, 2_735_964, "Contoh 1 - opsenBerjalan")
  // Opsen tunggak: 1.036.350 × 66% = 683.991
  assert.equal(r.opsenTunggakan, 683_991, "Contoh 1 - opsenTunggakan")
  // Terlambat (1 Mar 26 → 1 Okt 26 = 7 bulan > 6) → denda SWDKLLJ Rp100.000
  assert.equal(r.dendaSwdkllj, 100_000, "Contoh 1 - dendaSwdkllj")
  // SWDKLLJ tunggak: 4 thn × 143.000 = 572.000
  assert.equal(r.swdklljTunggakan, 572_000, "Contoh 1 - swdklljTunggakan")
  pass("Contoh 1 – Minibus 4 thn tunggak, gempa 75%")
}

// ---------------------------------------------------------------------------
// Contoh 4: Minibus tunggakan 1 tahun, gempa 75%
// Masa PKB: 1 Mar 2025; Bayar: 1 Okt 2026 → tunggakan 2025
// ---------------------------------------------------------------------------
{
  const r = calculateTax({
    ...innoBase,
    jatuhTempoPajak: new Date("2025-03-01T00:00:00"),
    jatuhTempoStnk: new Date("2025-03-01T00:00:00"),
  })
  assert.equal(r.pkbBerjalan, 4_145_400, "Contoh 4 - pkbBerjalan")
  assert.equal(r.pkbTunggakanPost2025, 1_036_350, "Contoh 4 - pkbPost2025")
  assert.equal(r.pkbTunggakanPra2025, 0, "Contoh 4 - pkbPra2025")
  assert.equal(r.opsenTunggakan, 683_991, "Contoh 4 - opsenTunggakan")
  assert.equal(r.tahunTunggakan, 1, "Contoh 4 - tahunTunggakan")
  // Denda Opsen: 19 bln × 1% × 2.735.964 = 519.833
  assert.equal(r.bulanTerlambat, 7, "Contoh 4 - bulanTerlambat")
  assert.equal(r.swdklljTunggakan, 143_000, "Contoh 4 - swdklljTunggakan")
  pass("Contoh 4 – Minibus 1 thn tunggak, gempa 75%")
}

// ---------------------------------------------------------------------------
// Contoh 5: Minibus terlambat (bukan tunggakan), gempa 75%
// Masa PKB: 1 Mar 2026; Bayar: 1 Okt 2026 → berjalan, terlambat 7 bln
// ---------------------------------------------------------------------------
{
  const r = calculateTax({
    ...innoBase,
    jatuhTempoPajak: new Date("2026-03-01T00:00:00"),
    jatuhTempoStnk: new Date("2026-03-01T00:00:00"),
  })
  // Tanpa tunggakan, DP × 82,5% × 1,2%
  assert.ok(
    Math.abs(r.pkbBerjalan - 3_419_955) < 1,
    "Contoh 5 - pkbBerjalan"
  )
  assert.equal(r.tahunTunggakan, 0, "Contoh 5 - tahunTunggakan")
  // Opsen berjalan: 3.419.955 × 66% = 2.257.170
  assert.ok(
    Math.abs(r.opsenBerjalan - 2_257_170.3) < 1,
    "Contoh 5 - opsenBerjalan"
  )
  // Terlambat 7 bulan → denda SWDKLLJ roda 4+ > 6 bln: Rp100.000
  assert.equal(r.dendaSwdkllj, 100_000, "Contoh 5 - dendaSwdkllj")
  // Denda Opsen: 7 bln × 1% × opsenBerjalan
  assert.ok(
    Math.abs(r.dendaOpsen - r.opsenBerjalan * 0.07) < 1,
    "Contoh 5 - dendaOpsen"
  )
  pass("Contoh 5 – Minibus terlambat tanpa tunggakan, gempa 75%")
}

// ---------------------------------------------------------------------------
// Contoh 10: Motor terlambat tanpa tunggakan, gempa 75%
// NJKB 10.900.000, bobot 1; Masa PKB 1 Mar 2026; Bayar 1 Okt 2026 (7 bln)
// ---------------------------------------------------------------------------
{
  const r = calculateTax({
    njkb: 10_900_000,
    njub: 0,
    bobot: 1,
    jenisKendaraan: "SEPEDA MOTOR",
    jatuhTempoPajak: new Date("2026-03-01T00:00:00"),
    jatuhTempoStnk: new Date("2026-03-01T00:00:00"),
    tanggalBayar: new Date("2026-10-01T00:00:00"),
    isDomisiliGempa: true,
    isTembakRu: false,
  })
  // DP × 82,5% × 1,2%
  assert.ok(
    Math.abs(r.pkbBerjalan - 107_910) < 1,
    "Contoh 10 - pkbBerjalan"
  )
  // Opsen: 107.910 × 66% = 71.220,6 ≈ 71.221
  assert.ok(
    Math.abs(r.opsenBerjalan - 71_220.6) < 1,
    "Contoh 10 - opsenBerjalan"
  )
  // Terlambat 7 bulan → denda SWDKLLJ motor >6 bln: Rp24.000
  assert.equal(r.dendaSwdkllj, 24_000, "Contoh 10 - dendaSwdkllj")
  // Denda Opsen: 7 bln × 1% × opsenBerjalan ≈ Rp4.985
  assert.ok(
    Math.abs(r.dendaOpsen - r.opsenBerjalan * 0.07) < 1,
    "Contoh 10 - dendaOpsen"
  )
  pass("Contoh 10 – Motor terlambat tanpa tunggakan, gempa 75%")
}

// ---------------------------------------------------------------------------
// Contoh 11: Minibus tunggakan 4 tahun, NON-gempa (diskon 50%)
// Masa PKB: 1 Mar 2022; Bayar: 1 Okt 2026
// ---------------------------------------------------------------------------
{
  const r = calculateTax({
    njkb: 329_000_000,
    njub: 0,
    bobot: 1.05,
    jenisKendaraan: "MINIBUS",
    jatuhTempoPajak: new Date("2022-03-01T00:00:00"),
    jatuhTempoStnk: new Date("2022-03-01T00:00:00"),
    tanggalBayar: new Date("2026-10-01T00:00:00"),
    isDomisiliGempa: false,
    isTembakRu: false,
  })
  // PKB tunggak post-2025: 4.145.400 × 50% = 2.072.700
  assert.equal(r.pkbTunggakanPost2025, 2_072_700, "Contoh 11 - pkbPost2025")
  // PKB tunggak pra-2025: 3 thn × 15.545.250 × 50% = 7.772.625
  assert.ok(
    Math.abs(r.pkbTunggakanPra2025 - 7_772_625) < 1,
    "Contoh 11 - pkbPra2025"
  )
  // Opsen tunggak: 2.072.700 × 66% = 1.367.982
  assert.equal(r.opsenTunggakan, 1_367_982, "Contoh 11 - opsenTunggakan")
  pass("Contoh 11 – Minibus 4 thn tunggak, non-gempa 50%")
}

// ---------------------------------------------------------------------------
// Cutoff tanggal tepat di batas
// ---------------------------------------------------------------------------
{
  // Masa pajak mulai 4 Januari 2025 → tarif 1,5%, tanpa Opsen
  const r4jan = calculateTax({
    njkb: 10_000_000,
    njub: 0,
    bobot: 1,
    jenisKendaraan: "SEPEDA MOTOR",
    jatuhTempoPajak: new Date("2025-01-04T00:00:00"),
    jatuhTempoStnk: new Date("2026-01-04T00:00:00"),
    tanggalBayar: new Date("2026-09-03T00:00:00"),
    isDomisiliGempa: false,
    isTembakRu: false,
  })
  // Tunggakan 1 tahun: 2025 → start 4 Jan 2025 < cutoff → tarif 1,5%
  assert.ok(r4jan.pkbTunggakanPra2025 > 0, "cutoff - pra2025 tarif 1,5%")
  assert.equal(r4jan.pkbTunggakanPost2025, 0, "cutoff - tidak ada post2025")
  assert.equal(r4jan.opsenTunggakan, 0, "cutoff - tidak ada opsen tunggak")

  // Masa pajak mulai 5 Januari 2025 → tarif 1,2%, kena Opsen
  const r5jan = calculateTax({
    njkb: 10_000_000,
    njub: 0,
    bobot: 1,
    jenisKendaraan: "SEPEDA MOTOR",
    jatuhTempoPajak: new Date("2025-01-05T00:00:00"),
    jatuhTempoStnk: new Date("2026-01-05T00:00:00"),
    tanggalBayar: new Date("2026-09-03T00:00:00"),
    isDomisiliGempa: false,
    isTembakRu: false,
  })
  assert.equal(r5jan.pkbTunggakanPra2025, 0, "cutoff - tidak ada pra2025")
  assert.ok(r5jan.pkbTunggakanPost2025 > 0, "cutoff - post2025 tarif 1,2%")
  assert.ok(r5jan.opsenTunggakan > 0, "cutoff - opsen tunggak ada")

  pass("Cutoff 5 Jan 2025 – tarif dan opsen tunggakan")
}

// ---------------------------------------------------------------------------
// NJUB masuk dasar pengenaan
// ---------------------------------------------------------------------------
{
  const tanpaUb = calculateTax({
    njkb: 10_000_000,
    njub: 0,
    bobot: 1,
    jenisKendaraan: "SEPEDA MOTOR",
    jatuhTempoPajak: new Date("2026-09-03T00:00:00"),
    jatuhTempoStnk: new Date("2027-09-03T00:00:00"),
    tanggalBayar: new Date("2026-09-03T00:00:00"),
    isDomisiliGempa: false,
    isTembakRu: false,
  })
  const denganUb = calculateTax({
    njkb: 10_000_000,
    njub: 2_000_000,
    bobot: 1,
    jenisKendaraan: "SEPEDA MOTOR",
    jatuhTempoPajak: new Date("2026-09-03T00:00:00"),
    jatuhTempoStnk: new Date("2027-09-03T00:00:00"),
    tanggalBayar: new Date("2026-09-03T00:00:00"),
    isDomisiliGempa: false,
    isTembakRu: false,
  })
  // (10e6 + 2e6) × 1 = 12e6 vs 10e6 → berjalan lebih tinggi
  assert.ok(
    denganUb.pkbBerjalan > tanpaUb.pkbBerjalan,
    "NJUB - PKB berjalan lebih tinggi"
  )
  assert.ok(
    denganUb.opsenBerjalan > tanpaUb.opsenBerjalan,
    "NJUB - Opsen berjalan lebih tinggi"
  )
  pass("NJUB – masuk dasar pengenaan")
}

console.log("\nSemua regression test: PASS ✓\n")
