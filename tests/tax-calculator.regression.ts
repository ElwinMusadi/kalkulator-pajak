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
  // Denda Opsen berjalan maupun tunggakan dihapus melalui Tax Amnesty.
  assert.equal(r.dendaOpsen, 0, "Contoh 5 - dendaOpsen Tax Amnesty")
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
  // Denda Opsen berjalan maupun tunggakan dihapus melalui Tax Amnesty.
  assert.equal(r.dendaOpsen, 0, "Contoh 10 - dendaOpsen Tax Amnesty")
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

// ---------------------------------------------------------------------------
// Mutasi Masuk Luar Daerah: diskon PKB berjalan 50%.
// Diskon ini menggantikan diskon pembayaran awal.
// ---------------------------------------------------------------------------
{
  const r = calculateTax({
    njkb: 100_000_000,
    njub: 0,
    bobot: 1.05,
    jenisKendaraan: "MINIBUS",
    jatuhTempoPajak: new Date("2026-12-01T00:00:00"),
    jatuhTempoStnk: new Date("2027-12-01T00:00:00"),
    tanggalBayar: new Date("2026-09-03T00:00:00"),
    isDomisiliGempa: false,
    isMutasiMasuk: true,
    isTembakRu: false,
  })
  // (100.000.000 × 1,05 × 82,5%) × 1,2% × 50% = 519.750
  assert.equal(r.pkbDiscount, 0.5, "Mutasi - diskon harus 50%")
  assert.equal(r.isMutasiMasuk, true, "Mutasi - flag tersimpan di hasil")
  assert.equal(r.pkbBerjalan, 519_750, "Mutasi - PKB berjalan diskon 50%")
  assert.equal(r.opsenBerjalan, 343_035, "Mutasi - Opsen dari PKB setelah diskon")
  pass("Mutasi Masuk – diskon PKB berjalan 50%")
}

// ---------------------------------------------------------------------------
// Tembak RU/STNK: biaya dan total berubah sesuai kategori kendaraan
// ---------------------------------------------------------------------------
{
  const input: TaxCalculatorInput = {
    njkb: 10_000_000,
    njub: 0,
    bobot: 1,
    jenisKendaraan: "SEPEDA MOTOR",
    jatuhTempoPajak: new Date("2026-09-03T00:00:00"),
    jatuhTempoStnk: new Date("2027-09-03T00:00:00"),
    tanggalBayar: new Date("2026-09-03T00:00:00"),
    isDomisiliGempa: false,
    isTembakRu: false,
  }
  const tanpaTembakRu = calculateTax(input)
  const denganTembakRu = calculateTax({ ...input, isTembakRu: true })

  assert.equal(denganTembakRu.biayaTembakRu, 150_000, "Tembak RU motor - biaya")
  assert.equal(
    denganTembakRu.total - tanpaTembakRu.total,
    150_000,
    "Tembak RU motor - total bertambah sesuai biaya"
  )
  pass("Tembak RU/STNK – biaya dan total motor")
}

// ---------------------------------------------------------------------------
// Warna Plat (TNKB)
// Kasus acuan user: DH3088WK — sepeda motor plat merah, NJKB 12.100.000,
// bobot 1, jatuh tempo PKB & STNK 29 Nov 2026.
// Aturan: plat merah tarif 0,5% untuk semua periode; insentif Pergub 54,
// Opsen 66%, SWDKLLJ, dan PNBP sama seperti plat putih/hitam.
// ---------------------------------------------------------------------------
const dh3088wk: TaxCalculatorInput = {
  njkb: 12_100_000,
  njub: 0,
  bobot: 1,
  jenisKendaraan: "SEPEDA MOTOR",
  jatuhTempoPajak: new Date("2026-11-29T00:00:00"),
  jatuhTempoStnk: new Date("2026-11-29T00:00:00"),
  tanggalBayar: new Date("2026-10-14T00:00:00"), // 46 hari sebelum JT
  isDomisiliGempa: false,
  isTembakRu: false,
}

// Default tanpa warnaPlat = putih → hasil identik dengan sebelum fitur ini.
{
  const tanpa = calculateTax(dh3088wk)
  const putih = calculateTax({ ...dh3088wk, warnaPlat: "putih" })
  const hitam = calculateTax({ ...dh3088wk, warnaPlat: "hitam" })
  assert.equal(tanpa.warnaPlat, "putih")
  assert.equal(tanpa.tarifPkbBerjalan, 0.012)
  assert.deepEqual(putih, tanpa, "Plat putih = default")
  assert.deepEqual({ ...hitam, warnaPlat: "putih" }, tanpa, "Plat hitam = plat putih")
  pass("Warna plat – default putih; plat hitam identik dengan plat putih")
}

// DH3088WK plat merah, bayar 46 hari sebelum JT (motor 31–60 hari → diskon 15%).
{
  const r = calculateTax({ ...dh3088wk, warnaPlat: "merah" })
  // DP = 82,5% × 12.100.000 = 9.982.500; PKB = 9.982.500 × 0,5% = 49.912,5; × 85% = 42.425,625
  assert.equal(r.tarifPkbBerjalan, 0.005, "DH3088WK - tarif 0,5%")
  assert.equal(r.pkbDiscount, 0.15, "DH3088WK - diskon bayar awal 15% tetap berlaku")
  assert.ok(Math.abs(r.pkbBerjalan - 42_425.625) < 1e-6, "DH3088WK - pkbBerjalan")
  assert.ok(Math.abs(r.opsenBerjalan - 42_425.625 * 0.66) < 1e-6, "DH3088WK - opsen 66%")
  assert.equal(r.swdklljBerjalan, 35_000, "DH3088WK - SWDKLLJ sama")
  assert.equal(r.biayaStnk, 100_000, "DH3088WK - PNBP STNK (STNK ≤ 90 hari)")
  assert.equal(r.biayaTnkb, 60_000, "DH3088WK - PNBP TNKB")

  // Plat merah ≈ 0,5/1,2 PKB plat putih untuk kondisi yang sama.
  const putih = calculateTax({ ...dh3088wk, warnaPlat: "putih" })
  assert.ok(Math.abs(r.pkbBerjalan / putih.pkbBerjalan - 0.5 / 1.2) < 1e-9, "Rasio merah/putih")
  // Komponen di luar PKB & Opsen tidak berubah.
  assert.equal(r.swdklljBerjalan + r.biayaStnk + r.biayaTnkb, putih.swdklljBerjalan + putih.biayaStnk + putih.biayaTnkb)
  pass("DH3088WK plat merah – tarif 0,5%, diskon 15%, Opsen/SWDKLLJ/PNBP sama")
}

// Plat merah dengan tunggakan pra & pasca 5 Jan 2025: 0,5% untuk semua periode,
// diskon tunggakan Pergub 54 tetap berlaku.
{
  const r = calculateTax({
    ...dh3088wk,
    jatuhTempoPajak: new Date("2023-11-29T00:00:00"),
    jatuhTempoStnk: new Date("2023-11-29T00:00:00"),
    tanggalBayar: new Date("2026-12-15T00:00:00"),
    warnaPlat: "merah",
  })
  const pkbPenuh = 12_100_000 * 0.005 // 60.500 per tahun
  // Tunggakan 2023, 2024 (pra) dan 2025 (pasca); diskon non-gempa 50%.
  assert.equal(r.tahunTunggakanPra, 2)
  assert.equal(r.tahunTunggakanPost, 1)
  assert.ok(Math.abs(r.pkbTunggakanPra2025 - 2 * pkbPenuh * 0.5) < 1e-6, "Tunggak pra 0,5% (bukan 1,5%)")
  assert.ok(Math.abs(r.pkbTunggakanPost2025 - pkbPenuh * 0.5) < 1e-6, "Tunggak pasca 0,5%")
  assert.ok(Math.abs(r.opsenTunggakan - pkbPenuh * 0.5 * 0.66) < 1e-6, "Opsen tunggak hanya pasca")
  // Ada tunggakan → DP berjalan 100%, tanpa diskon bayar awal.
  assert.ok(Math.abs(r.pkbBerjalan - pkbPenuh) < 1e-6, "PKB berjalan 0,5% × DP 100%")
  assert.equal(r.dendaPkb, 0, "Denda PKB tetap dihapus")
  pass("Plat merah tunggakan – 0,5% semua periode, diskon tunggakan & hapus denda berlaku")
}

// Periode berjalan sebelum 5 Jan 2025 (bayar 2024): putih 1,5% tanpa Opsen,
// merah tetap 0,5% tanpa Opsen; tidak ada pengurang DP 17,5%.
{
  const base: TaxCalculatorInput = {
    ...dh3088wk,
    jatuhTempoPajak: new Date("2024-06-01T00:00:00"),
    jatuhTempoStnk: new Date("2024-06-01T00:00:00"),
    tanggalBayar: new Date("2024-05-20T00:00:00"),
  }
  const putih = calculateTax({ ...base, warnaPlat: "putih" })
  const merah = calculateTax({ ...base, warnaPlat: "merah" })
  assert.equal(putih.tarifPkbBerjalan, 0.015, "Pra-cutoff putih 1,5%")
  assert.equal(merah.tarifPkbBerjalan, 0.005, "Pra-cutoff merah 0,5%")
  assert.equal(merah.opsenBerjalan, 0, "Pra-cutoff tanpa Opsen")
  // DP 100% (tanpa 17,5%), diskon motor 0–30 hari 10%.
  assert.ok(Math.abs(merah.pkbBerjalan - 12_100_000 * 0.005 * 0.9) < 1e-6, "Pra-cutoff merah PKB")
  pass("Periode berjalan pra-5 Jan 2025 – putih 1,5%, merah 0,5%, tanpa Opsen")
}

// Plat merah dengan fasilitas: gempa 75%, Mutasi Masuk 50%, Tembak RU.
{
  const tunggak: TaxCalculatorInput = {
    ...dh3088wk,
    jatuhTempoPajak: new Date("2025-11-29T00:00:00"),
    jatuhTempoStnk: new Date("2025-11-29T00:00:00"),
    tanggalBayar: new Date("2026-12-15T00:00:00"),
    warnaPlat: "merah",
  }
  const gempa = calculateTax({ ...tunggak, isDomisiliGempa: true })
  assert.ok(Math.abs(gempa.pkbTunggakanPost2025 - 12_100_000 * 0.005 * 0.25) < 1e-6, "Merah + gempa 75%")

  const mutasi = calculateTax({ ...dh3088wk, warnaPlat: "merah", isMutasiMasuk: true })
  assert.equal(mutasi.pkbDiscount, 0.5, "Merah + mutasi 50%")
  assert.ok(Math.abs(mutasi.pkbBerjalan - 12_100_000 * 0.825 * 0.005 * 0.5) < 1e-6, "Merah + mutasi PKB")

  const tembak = calculateTax({ ...dh3088wk, warnaPlat: "merah", isTembakRu: true })
  assert.equal(tembak.biayaTembakRu, 150_000, "Merah + Tembak RU motor")

  // Nilai null runtime diperlakukan sebagai default putih.
  const nullPlat = calculateTax({ ...dh3088wk, warnaPlat: null as unknown as undefined })
  assert.equal(nullPlat.warnaPlat, "putih", "warnaPlat null → putih")
  pass("Plat merah + gempa/mutasi/Tembak RU; warnaPlat null aman → putih")
}

// hariMenujuJatuhTempo — dasar status "Pajak Aktif" (> 90 hari, tanpa tunggakan).
// Diukur ke tanggal Jatuh Tempo Pajak yang diisi; informasi tampilan saja.
{
  const jt = new Date("2026-12-15T00:00:00")
  const base: TaxCalculatorInput = {
    ...dh3088wk,
    jatuhTempoPajak: jt,
    jatuhTempoStnk: jt,
  }
  const hari = (bayar: string) => calculateTax({ ...base, tanggalBayar: new Date(`${bayar}T00:00:00`) })

  // 15 Des 2026 − 15 Sep 2026 = 91 hari → Pajak Aktif; tanpa diskon bayar awal (> 90).
  const aktif = hari("2026-09-15")
  assert.equal(aktif.hariMenujuJatuhTempo, 91)
  assert.equal(aktif.tahunTunggakan, 0)
  assert.equal(aktif.pkbDiscount, 0, "> 90 hari: tidak ada diskon bayar awal")
  assert.ok(aktif.total > 0, "Biaya tetap dihitung saat Pajak Aktif")

  // Tepat 90 hari → bukan Pajak Aktif; diskon motor 61–90 hari 20%.
  const batas = hari("2026-09-16")
  assert.equal(batas.hariMenujuJatuhTempo, 90)
  assert.equal(batas.pkbDiscount, 0.2)

  // Jatuh tempo di tahun berikutnya diukur ke tanggal yang diisi (bukan tahun bayar).
  const lintasTahun = calculateTax({
    ...base,
    jatuhTempoPajak: new Date("2027-03-01T00:00:00"),
    tanggalBayar: new Date("2026-11-30T00:00:00"),
  })
  assert.equal(lintasTahun.hariMenujuJatuhTempo, 91)

  // Sudah lewat jatuh tempo → negatif.
  assert.ok(hari("2026-12-20").hariMenujuJatuhTempo < 0)
  pass("hariMenujuJatuhTempo – 91 hari aktif, 90 hari diskon 20%, lintas tahun, lewat JT negatif")
}

// Biaya BBN & Mutasi (bagian 5): nominal manual ditambahkan apa adanya ke
// total; tidak mengubah komponen pajak lain.
{
  const tanpa = calculateTax(dh3088wk)
  assert.equal(tanpa.totalBiayaLayanan, 0, "Default tanpa biaya layanan")
  assert.ok(Object.values(tanpa.biayaLayanan).every((v) => v === 0))

  const dengan = calculateTax({
    ...dh3088wk,
    biayaLayanan: {
      pendaftaranBbn: 50_000,
      bpkb: 225_000,
      cekFisik: 30_000,
      mutasiMasuk: 150_000,
      mutasiKeluar: 0,
      arsipFiskal: 75_000,
    },
  })
  assert.equal(dengan.totalBiayaLayanan, 530_000)
  assert.equal(dengan.biayaLayanan.bpkb, 225_000)
  assert.equal(dengan.biayaLayanan.mutasiKeluar, 0)
  assert.equal(dengan.total, tanpa.total + 530_000, "Total bertambah tepat sebesar biaya layanan")
  // Komponen pajak tidak berubah.
  assert.equal(dengan.pkbBerjalan, tanpa.pkbBerjalan)
  assert.equal(dengan.opsenBerjalan, tanpa.opsenBerjalan)
  assert.equal(dengan.swdklljBerjalan, tanpa.swdklljBerjalan)
  assert.equal(dengan.biayaStnk + dengan.biayaTnkb, tanpa.biayaStnk + tanpa.biayaTnkb)

  // Nilai negatif / NaN / Infinity diabaikan (pengaman runtime).
  const rusak = calculateTax({
    ...dh3088wk,
    biayaLayanan: { pendaftaranBbn: -10_000, bpkb: Number.NaN, cekFisik: Number.POSITIVE_INFINITY, arsipFiskal: 20_000 },
  })
  assert.equal(rusak.totalBiayaLayanan, 20_000)
  const batas = calculateTax({
    ...dh3088wk,
    biayaLayanan: {
      pendaftaranBbn: 100_000_000,
      bpkb: 100_000_001,
      cekFisik: 1.5,
      mutasiMasuk: Number.MAX_SAFE_INTEGER + 1,
      arsipFiskal: 0,
      // Field tak dikenal harus diabaikan, termasuk saat input berasal dari JS.
      tidakDikenal: 123_000,
    } as NonNullable<TaxCalculatorInput["biayaLayanan"]>,
  })
  assert.equal(batas.totalBiayaLayanan, 100_000_000)
  assert.equal(batas.biayaLayanan.bpkb, 0)
  assert.equal(batas.biayaLayanan.cekFisik, 0)
  assert.equal(batas.total, tanpa.total + 100_000_000)
  pass("Biaya BBN & Mutasi – dijumlahkan ke total, komponen pajak tetap, nilai tidak valid diabaikan")
}

console.log("\nSemua regression test: PASS ✓\n")
