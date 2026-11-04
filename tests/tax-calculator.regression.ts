/**
 * tests/tax-calculator.regression.ts
 *
 * Memvalidasi perhitungan terhadap contoh penetapan resmi dalam
 * Surat Edaran No. 900.1.13.1/2741/BPAD2.1 (Pedoman Pergub 54/2026;
 * tanggal bayar 1 Sep – 31 Okt 2026) serta ketentuan Pergub 64/2026
 * (tanggal bayar 1 Nov – 31 Des 2026) di bagian akhir berkas.
 */

import assert from "node:assert/strict"
import { parseISO } from "date-fns"
import { resolvePergub } from "../src/lib/pergub.ts"
import { dendaSwdklljFor, golonganSwdkllj } from "../src/lib/swdkllj.ts"
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
  assert.equal(r.isDomisiliGempa, true, "Status gempa mengikuti hasil perhitungan")
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
// diskon tunggakan Pergub 54 tetap berlaku (bayar dalam masa Pergub 54).
{
  const r = calculateTax({
    ...dh3088wk,
    jatuhTempoPajak: new Date("2023-11-29T00:00:00"),
    jatuhTempoStnk: new Date("2023-11-29T00:00:00"),
    tanggalBayar: new Date("2026-10-15T00:00:00"),
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
// Tanggal 2024 di luar masa berlaku Pergub → aturan dipaksa lewat override.
{
  const base: TaxCalculatorInput = {
    ...dh3088wk,
    jatuhTempoPajak: new Date("2024-06-01T00:00:00"),
    jatuhTempoStnk: new Date("2024-06-01T00:00:00"),
    tanggalBayar: new Date("2024-05-20T00:00:00"),
    pergub: "54-2026",
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
    tanggalBayar: new Date("2026-10-15T00:00:00"),
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
  assert.equal(lintasTahun.pkbDiscount, 0, "lintasTahun > 90 hari: tidak ada diskon bayar awal")
  assert.equal(lintasTahun.bulanTerlambat, 0, "lintasTahun sebelum jatuh tempo: bukan keterlambatan")
  assert.equal(lintasTahun.dendaSwdkllj, 0, "lintasTahun sebelum jatuh tempo: denda SWDKLLJ harus Rp0")
  assert.equal(lintasTahun.tahunTunggakan, 0, "lintasTahun: tidak ada tunggakan")

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

// Metadata wilayah gempa untuk badge: tampil walaupun belum ada tunggakan,
// tetapi tidak mengesankan diskon 75% berlaku pada PKB berjalan.
{
  const biasa = calculateTax(dh3088wk)
  const gempa = calculateTax({ ...dh3088wk, isDomisiliGempa: true })
  assert.equal(gempa.isDomisiliGempa, true)
  assert.equal(biasa.isDomisiliGempa, false)
  assert.equal(gempa.tahunTunggakan, 0)
  assert.equal(gempa.total, biasa.total, "Tanpa tunggakan: toggle gempa tidak mengubah total")
  assert.equal(gempa.pkbBerjalan, biasa.pkbBerjalan)
  pass("Metadata gempa – badge tanpa tunggakan tidak mengubah PKB berjalan atau total")
}

// ---------------------------------------------------------------------------
// Transisi lintas tahun (cross-year boundary) & pembayaran awal ≤ 90 hari
// Kasus referensi: JT 5 Jan 2027 dibayar 19 Okt 2026 (78 hari sebelum JT).
// ---------------------------------------------------------------------------
{
  // 1. Fixture Mobil (Innova Venturer): diskon 10%, tanpa tunggakan/keterlambatan/denda SWDKLLJ,
  //    STNK ≤ 90 hari (78 hari) mempertahankan PNBP STNK 200rb & TNKB 100rb.
  const innovaCrossYear = calculateTax({
    ...innoBase,
    jatuhTempoPajak: new Date("2027-01-05T00:00:00"),
    jatuhTempoStnk: new Date("2027-01-05T00:00:00"),
    tanggalBayar: new Date("2026-10-19T00:00:00"),
    isDomisiliGempa: false,
    warnaPlat: "putih",
  })
  assert.equal(innovaCrossYear.hariMenujuJatuhTempo, 78)
  assert.equal(innovaCrossYear.tahunTunggakan, 0)
  assert.equal(innovaCrossYear.tahunTunggakanPra, 0)
  assert.equal(innovaCrossYear.tahunTunggakanPost, 0)
  assert.equal(innovaCrossYear.bulanTerlambat, 0)
  assert.equal(innovaCrossYear.dendaOpsen, 0)
  assert.equal(innovaCrossYear.dendaPkb, 0)
  assert.equal(innovaCrossYear.dendaSwdkllj, 0)
  assert.equal(innovaCrossYear.pkbDiscount, 0.1, "Mobil 78 hari (≤ 90 hari): diskon PKB berjalan 10%")
  // DP = 329.000.000 × 1,05 × 82,5% = 284.996.250
  // PKB base = 284.996.250 × 1,2% = 3.419.955
  // PKB berjalan = 3.419.955 × 90% = 3.077.959,5
  assert.equal(innovaCrossYear.pkbBerjalan, 3_077_959.5)
  // Opsen berjalan = 3.077.959,5 × 66% = 2.031.453,27
  assert.equal(innovaCrossYear.opsenBerjalan, 2_031_453.27)
  assert.equal(innovaCrossYear.swdklljBerjalan, 143_000)
  assert.equal(innovaCrossYear.swdklljTunggakan, 0)
  assert.equal(innovaCrossYear.biayaStnk, 200_000, "STNK 78 hari (≤ 90 hari): PNBP STNK mobil 200rb")
  assert.equal(innovaCrossYear.biayaTnkb, 100_000, "STNK 78 hari (≤ 90 hari): PNBP TNKB mobil 100rb")
  assert.equal(innovaCrossYear.totalBiayaLayanan, 0)
  assert.equal(
    innovaCrossYear.total,
    3_077_959.5 + 2_031_453.27 + 143_000 + 200_000 + 100_000,
    "Grand total Innova lintas tahun 78 hari tepat 5.552.412,77",
  )

  // Fixture Mobil sederhana NJKB 10.000.000 bobot 1,05
  const simpleCarCrossYear = calculateTax({
    njkb: 10_000_000,
    njub: 0,
    bobot: 1.05,
    jenisKendaraan: "MINIBUS",
    jatuhTempoPajak: new Date("2027-01-05T00:00:00"),
    jatuhTempoStnk: new Date("2027-01-05T00:00:00"),
    tanggalBayar: new Date("2026-10-19T00:00:00"),
    isDomisiliGempa: false,
    isTembakRu: false,
    warnaPlat: "putih",
  })
  assert.equal(simpleCarCrossYear.pkbDiscount, 0.1)
  assert.equal(simpleCarCrossYear.pkbBerjalan, 93_555) // 10e6 * 1.05 * 0.825 * 0.012 * 0.9
  assert.equal(simpleCarCrossYear.opsenBerjalan, 61_746.3)
  assert.equal(simpleCarCrossYear.dendaSwdkllj, 0)
  assert.equal(simpleCarCrossYear.bulanTerlambat, 0)
  assert.equal(simpleCarCrossYear.biayaStnk, 200_000)
  assert.equal(simpleCarCrossYear.biayaTnkb, 100_000)
  assert.equal(simpleCarCrossYear.total, 93_555 + 61_746.3 + 143_000 + 200_000 + 100_000)

  // 2. Fixture Motor sintetik (NJKB 10.000.000, bobot 1,0): diskon motor 61–90 hari = 20%
  const motorCrossYear = calculateTax({
    njkb: 10_000_000,
    njub: 0,
    bobot: 1.0,
    jenisKendaraan: "SEPEDA MOTOR",
    jatuhTempoPajak: new Date("2027-01-05T00:00:00"),
    jatuhTempoStnk: new Date("2027-01-05T00:00:00"),
    tanggalBayar: new Date("2026-10-19T00:00:00"),
    isDomisiliGempa: false,
    isTembakRu: false,
    warnaPlat: "putih",
  })
  assert.equal(motorCrossYear.hariMenujuJatuhTempo, 78)
  assert.equal(motorCrossYear.pkbDiscount, 0.2, "Motor 78 hari (61–90 hari): diskon 20%")
  // DP = 10.000.000 × 1,0 × 82,5% = 8.250.000
  // PKB base = 8.250.000 × 1,2% = 99.000
  // PKB berjalan = 99.000 × 80% = 79.200
  assert.equal(motorCrossYear.pkbBerjalan, 79_200)
  assert.equal(motorCrossYear.opsenBerjalan, 52_272)
  assert.equal(motorCrossYear.swdklljBerjalan, 35_000)
  assert.equal(motorCrossYear.bulanTerlambat, 0)
  assert.equal(motorCrossYear.dendaSwdkllj, 0)
  assert.equal(motorCrossYear.biayaStnk, 100_000, "STNK motor ≤ 90 hari: 100rb")
  assert.equal(motorCrossYear.biayaTnkb, 60_000, "TNKB motor ≤ 90 hari: 60rb")
  assert.equal(motorCrossYear.total, 79_200 + 52_272 + 35_000 + 100_000 + 60_000)

  // 3. Objek Date hasil parsing ISO (seperti diterima dari API melalui parseISO)
  const motorParsedDate = calculateTax({
    njkb: 10_000_000,
    njub: 0,
    bobot: 1.0,
    jenisKendaraan: "SEPEDA MOTOR",
    jatuhTempoPajak: parseISO("2027-01-05"),
    jatuhTempoStnk: parseISO("2027-01-05"),
    tanggalBayar: parseISO("2026-10-19"),
    isDomisiliGempa: false,
    isTembakRu: false,
  })
  assert.deepEqual(motorParsedDate, motorCrossYear, "Date dari parseISO identik dengan Date constructor")

  pass("Lintas tahun 78 hari – Mobil diskon 10%, Motor diskon 20%, tanpa denda SWDKLLJ, PNBP STNK/TNKB sesuai")
}

// ---------------------------------------------------------------------------
// Ambang batas tanggal (90/91, 60/61, 30/31, hari jatuh tempo, jam/siang/sore, immutability)
// Menguji perhitungan hari kalender lokal murni (bebas efek jam/DST).
// ---------------------------------------------------------------------------
{
  const jtPajak = new Date("2027-01-05T00:00:00")
  const jtStnk = new Date("2027-01-05T00:00:00")
  const baseMotor: TaxCalculatorInput = {
    njkb: 10_000_000,
    njub: 0,
    bobot: 1.0,
    jenisKendaraan: "SEPEDA MOTOR",
    jatuhTempoPajak: jtPajak,
    jatuhTempoStnk: jtStnk,
    tanggalBayar: new Date("2026-10-19T00:00:00"),
    isDomisiliGempa: false,
    isTembakRu: false,
    warnaPlat: "putih",
  }

  // 91 hari sebelum JT (2026-10-06): > 90 hari → diskon 0%, PNBP STNK 0, tanpa denda
  const d91 = calculateTax({ ...baseMotor, tanggalBayar: new Date("2026-10-06T00:00:00") })
  assert.equal(d91.hariMenujuJatuhTempo, 91)
  assert.equal(d91.pkbDiscount, 0, "> 90 hari: diskon 0%")
  assert.equal(d91.biayaStnk, 0, "> 90 hari: PNBP STNK 0")
  assert.equal(d91.biayaTnkb, 0, "> 90 hari: PNBP TNKB 0")
  assert.equal(d91.bulanTerlambat, 0)
  assert.equal(d91.dendaSwdkllj, 0)

  // 91 hari sebelum JT dibayar sore hari (2026-10-06T15:45:00): tetap 91 hari kalender
  const d91Afternoon = calculateTax({ ...baseMotor, tanggalBayar: new Date("2026-10-06T15:45:00") })
  assert.equal(d91Afternoon.hariMenujuJatuhTempo, 91)
  assert.equal(d91Afternoon.pkbDiscount, 0)
  assert.equal(d91Afternoon.biayaStnk, 0)
  assert.equal(d91Afternoon.biayaTnkb, 0)
  assert.equal(d91Afternoon.bulanTerlambat, 0)
  assert.equal(d91Afternoon.dendaSwdkllj, 0)

  // 90 hari sebelum JT (2026-10-07T00:00:00): batas awal diskon motor 20% & PNBP STNK berlaku
  const d90 = calculateTax({ ...baseMotor, tanggalBayar: new Date("2026-10-07T00:00:00") })
  assert.equal(d90.hariMenujuJatuhTempo, 90)
  assert.equal(d90.pkbDiscount, 0.2, "Tepat 90 hari: diskon motor 20%")
  assert.equal(d90.biayaStnk, 100_000, "Tepat 90 hari: PNBP STNK motor 100rb")
  assert.equal(d90.biayaTnkb, 60_000, "Tepat 90 hari: PNBP TNKB motor 60rb")
  assert.equal(d90.bulanTerlambat, 0)
  assert.equal(d90.dendaSwdkllj, 0)

  // 90 hari sebelum JT dibayar malam hari (2026-10-07T23:59:59): tetap 90 hari kalender
  const d90Night = calculateTax({ ...baseMotor, tanggalBayar: new Date("2026-10-07T23:59:59") })
  assert.equal(d90Night.hariMenujuJatuhTempo, 90)
  assert.equal(d90Night.pkbDiscount, 0.2)
  assert.equal(d90Night.biayaStnk, 100_000)

  // 61 hari sebelum JT (2026-11-05T00:00:00): diskon motor 20%
  const d61 = calculateTax({ ...baseMotor, tanggalBayar: new Date("2026-11-05T00:00:00") })
  assert.equal(d61.hariMenujuJatuhTempo, 61)
  assert.equal(d61.pkbDiscount, 0.2, "61 hari: diskon motor 20%")

  // 60 hari sebelum JT (2026-11-06T00:00:00): transisi ke tier 31–60 hari → diskon motor 15%
  const d60 = calculateTax({ ...baseMotor, tanggalBayar: new Date("2026-11-06T00:00:00") })
  assert.equal(d60.hariMenujuJatuhTempo, 60)
  assert.equal(d60.pkbDiscount, 0.15, "60 hari: diskon motor 15%")
  assert.equal(d60.pkbBerjalan, 84_150) // 99.000 * 0.85
  assert.equal(d60.opsenBerjalan, 55_539) // 84.150 * 0.66
  assert.equal(d60.bulanTerlambat, 0)
  assert.equal(d60.dendaSwdkllj, 0)

  // 31 hari sebelum JT (2026-12-05T00:00:00): diskon motor 15%
  const d31 = calculateTax({ ...baseMotor, tanggalBayar: new Date("2026-12-05T00:00:00") })
  assert.equal(d31.hariMenujuJatuhTempo, 31)
  assert.equal(d31.pkbDiscount, 0.15, "31 hari: diskon motor 15%")

  // 30 hari sebelum JT (2026-12-06T00:00:00): transisi ke tier ≤ 30 hari → diskon motor 10%
  const d30 = calculateTax({ ...baseMotor, tanggalBayar: new Date("2026-12-06T00:00:00") })
  assert.equal(d30.hariMenujuJatuhTempo, 30)
  assert.equal(d30.pkbDiscount, 0.1, "30 hari: diskon motor 10%")
  assert.equal(d30.pkbBerjalan, 89_100) // 99.000 * 0.9
  assert.equal(d30.opsenBerjalan, 58_806) // 89.100 * 0.66
  assert.equal(d30.bulanTerlambat, 0)
  assert.equal(d30.dendaSwdkllj, 0)

  // Tanggal Januari 2027 di luar masa berlaku Pergub → aturan dipaksa lewat
  // override (tier diskon dan denda SWDKLLJ sama pada kedua Pergub).
  // Hari Jatuh Tempo pagi hari (2027-01-05T00:00:00): 0 hari → diskon 10%, bukan terlambat
  const d0Morning = calculateTax({ ...baseMotor, pergub: "64-2026", tanggalBayar: new Date("2027-01-05T00:00:00") })
  assert.equal(d0Morning.hariMenujuJatuhTempo, 0)
  assert.equal(d0Morning.pkbDiscount, 0.1, "0 hari pagi: diskon 10%")
  assert.equal(d0Morning.bulanTerlambat, 0)
  assert.equal(d0Morning.dendaSwdkllj, 0)

  // Hari Jatuh Tempo sore hari (2027-01-05T16:30:00): tetap 0 hari kalender lokal
  const d0Afternoon = calculateTax({ ...baseMotor, pergub: "64-2026", tanggalBayar: new Date("2027-01-05T16:30:00") })
  assert.equal(d0Afternoon.hariMenujuJatuhTempo, 0)
  assert.equal(d0Afternoon.pkbDiscount, 0.1, "0 hari sore: diskon 10%")
  assert.equal(d0Afternoon.bulanTerlambat, 0)
  assert.equal(d0Afternoon.dendaSwdkllj, 0)

  // 1 hari lewat jatuh tempo (2027-01-06T00:00:00): diskon 0%, denda SWDKLLJ motor tier 1 (Rp8.000)
  const dLate1 = calculateTax({ ...baseMotor, pergub: "64-2026", tanggalBayar: new Date("2027-01-06T00:00:00") })
  assert.equal(dLate1.hariMenujuJatuhTempo, -1)
  assert.equal(dLate1.pkbDiscount, 0, "Lewat JT: diskon 0%")
  assert.equal(dLate1.bulanTerlambat, 1)
  assert.equal(dLate1.dendaSwdkllj, 8_000, "1 hari terlambat: denda SWDKLLJ motor 8rb")

  // Immutability: input Date objects tidak boleh dimutasi oleh calculateTax
  const p1 = new Date("2027-01-05T14:30:00")
  const s1 = new Date("2027-01-05T14:30:00")
  const b1 = new Date("2026-10-19T09:15:00")
  const p1Time = p1.getTime()
  const s1Time = s1.getTime()
  const b1Time = b1.getTime()
  calculateTax({
    ...baseMotor,
    jatuhTempoPajak: p1,
    jatuhTempoStnk: s1,
    tanggalBayar: b1,
  })
  assert.equal(p1.getTime(), p1Time, "jatuhTempoPajak tidak dimutasi")
  assert.equal(s1.getTime(), s1Time, "jatuhTempoStnk tidak dimutasi")
  assert.equal(b1.getTime(), b1Time, "tanggalBayar tidak dimutasi")

  pass("Ambang batas tanggal – 90/91, 60/61, 30/31, due date sore, 91 sore, STNK cutoff, immutability")
}

// ===========================================================================
// Pergub 64/2026 (berlaku 1 Nov – 31 Des 2026)
// - Pasal 3: pengurangan DP 17,5% untuk masa yang kena Opsen.
// - Pasal 5: diskon bayar awal 10/15/20% (roda 2–3), 10% (roda 4+).
// - Pasal 6 & 10: payment online 5% (roda 2–3) / 2% (roda 4+), diakumulasikan.
// - Pasal 7: Mutasi Masuk 50% (tidak dapat dibayar via payment online).
// - Pasal 8: pokok PKB tunggakan dihapus 100%; DP tahun berjalan 100%.
// - SWDKLLJ: pokok berjalan & tunggakan dipungut; denda hanya masa berjalan.
// ===========================================================================
const near = (actual: number, expected: number, message: string) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${message}: ${actual} ≠ ${expected}`)

// Masa berlaku: batas hari kalender lokal, di luar masa → tanpa aturan.
{
  assert.equal(resolvePergub(new Date("2026-08-31T23:59:59")), null, "31 Agt: belum berlaku")
  assert.equal(resolvePergub(new Date("2026-09-01T00:00:00"))?.id, "54-2026")
  assert.equal(resolvePergub(new Date("2026-10-31T23:59:59"))?.id, "54-2026")
  assert.equal(resolvePergub(new Date("2026-11-01T00:00:00"))?.id, "64-2026")
  assert.equal(resolvePergub(new Date("2026-12-31T23:59:59"))?.id, "64-2026")
  assert.equal(resolvePergub(new Date("2027-01-01T00:00:00")), null, "1 Jan 2027: berakhir")
  assert.equal(resolvePergub(new Date("bukan tanggal")), null, "Tanggal tidak valid")
  assert.throws(
    () => calculateTax({ ...dh3088wk, tanggalBayar: new Date("2027-01-01T00:00:00") }),
    RangeError,
    "Di luar masa berlaku tanpa override harus ditolak",
  )
  assert.equal(calculateTax(dh3088wk).pergub, "54-2026", "Bayar 14 Okt → Pergub 54")
  pass("Pergub – masa berlaku 54 (1 Sep–31 Okt) & 64 (1 Nov–31 Des), di luar masa ditolak")
}

// Minibus menunggak 4 tahun (padanan Contoh 1), bayar loket 2 Nov 2026.
// Tunggakan dihapus 100% tanpa membedakan wilayah gempa.
{
  const input: TaxCalculatorInput = {
    ...innoBase,
    jatuhTempoPajak: new Date("2022-03-01T00:00:00"),
    jatuhTempoStnk: new Date("2022-03-01T00:00:00"),
    tanggalBayar: new Date("2026-11-02T00:00:00"),
  }
  const r = calculateTax(input)
  assert.equal(r.pergub, "64-2026")
  assert.equal(r.diskonTunggakan, 1, "Tunggakan dihapus 100%")
  // DP tahun berjalan 100% (Pasal 8 ayat 3): (329e6 × 1,05) × 1,2% = 4.145.400
  assert.equal(r.pkbBerjalan, 4_145_400, "PKB berjalan DP 100%")
  assert.equal(r.pkbDiscount, 0)
  assert.equal(r.pkbTunggakanPra2025, 0)
  assert.equal(r.pkbTunggakanPost2025, 0)
  assert.equal(r.opsenTunggakan, 0, "Opsen tunggakan ikut 0")
  assert.equal(r.opsenBerjalan, 2_735_964)
  assert.equal(r.tahunTunggakan, 4)
  assert.equal(r.tahunTunggakanPra, 3)
  assert.equal(r.tahunTunggakanPost, 1)
  assert.equal(r.dendaPkb, 0)
  assert.equal(r.dendaOpsen, 0)
  // SWDKLLJ: pokok tunggakan tetap; denda hanya masa berjalan
  // (1 Mar 2026 → 2 Nov 2026 = 9 bulan → mobil Rp100.000).
  assert.equal(r.swdklljTunggakan, 572_000, "Pokok SWDKLLJ tunggakan tetap dipungut")
  assert.equal(r.bulanTerlambat, 9)
  assert.equal(r.dendaSwdkllj, 100_000, "Denda SWDKLLJ berjalan tetap dipungut")
  assert.equal(r.dendaSwdklljTunggakanDihapus, true)
  assert.equal(r.biayaStnk, 200_000)
  assert.equal(r.biayaTnkb, 100_000)
  assert.equal(r.total, 4_145_400 + 2_735_964 + 143_000 + 572_000 + 100_000 + 200_000 + 100_000)
  // Toggle gempa tidak berpengaruh dan tidak tercatat sebagai dipakai.
  assert.equal(r.isDomisiliGempa, false, "Gempa tidak berlaku pada Pergub 64")
  assert.deepEqual(calculateTax({ ...input, isDomisiliGempa: false }), r, "Gempa = non-gempa")

  // Bayar online: diskon 2% pada pokok PKB berjalan, Opsen mengikuti.
  const online = calculateTax({ ...input, isBayarOnline: true })
  assert.equal(online.pkbDiscount, 0.02)
  assert.equal(online.diskonPaymentOnline, 0.02)
  assert.equal(online.isBayarOnline, true)
  near(online.pkbBerjalan, 4_062_492, "Minibus tunggak online - PKB berjalan")
  near(online.opsenBerjalan, 4_062_492 * 0.66, "Minibus tunggak online - Opsen")
  assert.equal(online.pkbTunggakanPost2025 + online.pkbTunggakanPra2025, 0)
  pass("Pergub 64 – Minibus 4 thn tunggak: tunggakan dihapus 100%, DP 100%, online 2%")
}

// Sepeda motor menunggak 4 tahun (padanan Contoh 6), bayar online.
{
  const r = calculateTax({
    njkb: 10_900_000,
    njub: 0,
    bobot: 1,
    jenisKendaraan: "SEPEDA MOTOR",
    jatuhTempoPajak: new Date("2022-03-01T00:00:00"),
    jatuhTempoStnk: new Date("2022-03-01T00:00:00"),
    tanggalBayar: new Date("2026-11-02T00:00:00"),
    isDomisiliGempa: false,
    isBayarOnline: true,
    isTembakRu: false,
  })
  // 10.900.000 × 1,2% = 130.800 × 95% = 124.260
  assert.equal(r.pkbDiscount, 0.05)
  near(r.pkbBerjalan, 124_260, "Motor tunggak online - PKB berjalan")
  near(r.opsenBerjalan, 124_260 * 0.66, "Motor tunggak online - Opsen")
  assert.equal(r.opsenTunggakan, 0)
  assert.equal(r.swdklljTunggakan, 140_000, "4 thn × 35.000")
  // Denda berjalan 9 bulan → motor 7–9 bulan Rp24.000.
  assert.equal(r.dendaSwdkllj, 24_000)
  assert.equal(r.biayaStnk + r.biayaTnkb, 160_000)
  pass("Pergub 64 – Motor 4 thn tunggak online: diskon 5%, tunggakan dihapus, denda SWDKLLJ berjalan")
}

// Sepeda motor terlambat tanpa tunggakan (padanan Contoh 10): DP 17,5%,
// tanpa diskon bayar awal; online tetap mendapat 5%.
{
  const input: TaxCalculatorInput = {
    njkb: 10_900_000,
    njub: 0,
    bobot: 1,
    jenisKendaraan: "SEPEDA MOTOR",
    jatuhTempoPajak: new Date("2026-03-01T00:00:00"),
    jatuhTempoStnk: new Date("2026-03-01T00:00:00"),
    tanggalBayar: new Date("2026-11-02T00:00:00"),
    isDomisiliGempa: false,
    isTembakRu: false,
  }
  const loket = calculateTax(input)
  assert.equal(loket.pkbDiscount, 0)
  near(loket.pkbBerjalan, 107_910, "Motor terlambat loket - PKB (DP 82,5%)")
  assert.equal(loket.dendaSwdkllj, 24_000)
  assert.equal(loket.dendaSwdklljTunggakanDihapus, false, "Tanpa tunggakan: tidak ada baris dihapus")

  const online = calculateTax({ ...input, isBayarOnline: true })
  assert.equal(online.pkbDiscount, 0.05)
  near(online.pkbBerjalan, 107_910 * 0.95, "Motor terlambat online - PKB")
  near(online.opsenBerjalan, 107_910 * 0.95 * 0.66, "Motor terlambat online - Opsen")
  pass("Pergub 64 – Motor terlambat: DP 17,5%, loket tanpa diskon, online 5%")
}

// Taat pajak bayar awal + online: persen dijumlahkan (Pasal 10).
// JT 15 Jan 2027, bayar 2 Nov 2026 → 74 hari sebelum JT.
{
  const motor: TaxCalculatorInput = {
    njkb: 10_000_000,
    njub: 0,
    bobot: 1,
    jenisKendaraan: "SEPEDA MOTOR",
    jatuhTempoPajak: new Date("2027-01-15T00:00:00"),
    jatuhTempoStnk: new Date("2027-01-15T00:00:00"),
    tanggalBayar: new Date("2026-11-02T00:00:00"),
    isDomisiliGempa: false,
    isTembakRu: false,
  }
  const loket = calculateTax(motor)
  assert.equal(loket.hariMenujuJatuhTempo, 74)
  assert.equal(loket.pkbDiscount, 0.2, "Motor 61–90 hari: 20%")
  near(loket.pkbBerjalan, 79_200, "Motor loket - PKB")

  const online = calculateTax({ ...motor, isBayarOnline: true })
  assert.equal(online.pkbDiscount, 0.25, "Motor 20% + online 5% = 25%")
  assert.equal(online.diskonPaymentOnline, 0.05)
  near(online.pkbBerjalan, 74_250, "Motor online - PKB 99.000 × 75%")
  near(online.opsenBerjalan, 49_005, "Motor online - Opsen")

  // 0–30 hari: 10% + 5% = tepat 0,15 (tanpa galat float).
  const dekat = calculateTax({ ...motor, isBayarOnline: true, tanggalBayar: new Date("2026-12-20T00:00:00") })
  assert.equal(dekat.pkbDiscount, 0.15, "Motor 10% + online 5% = 0,15")

  // Roda 4+: 10% + online 2% = 12%.
  const mobil = calculateTax({
    ...motor,
    bobot: 1.05,
    jenisKendaraan: "MINIBUS",
    isBayarOnline: true,
  })
  assert.equal(mobil.pkbDiscount, 0.12, "Mobil 10% + online 2% = 12%")
  assert.equal(mobil.diskonPaymentOnline, 0.02)
  near(mobil.pkbBerjalan, 103_950 * 0.88, "Mobil online - PKB")
  pass("Pergub 64 – Bayar awal + online diakumulasikan: motor 25%/15%, mobil 12%")
}

// Mutasi Masuk: 50% saja, payment online diabaikan.
{
  const r = calculateTax({
    njkb: 100_000_000,
    njub: 0,
    bobot: 1.05,
    jenisKendaraan: "MINIBUS",
    jatuhTempoPajak: new Date("2026-12-01T00:00:00"),
    jatuhTempoStnk: new Date("2027-12-01T00:00:00"),
    tanggalBayar: new Date("2026-11-02T00:00:00"),
    isDomisiliGempa: false,
    isMutasiMasuk: true,
    isBayarOnline: true,
    isTembakRu: false,
  })
  assert.equal(r.pkbDiscount, 0.5, "Mutasi tetap 50%")
  assert.equal(r.isBayarOnline, false, "Mutasi tidak dapat dibayar online")
  assert.equal(r.diskonPaymentOnline, 0)
  assert.equal(r.pkbBerjalan, 519_750)
  pass("Pergub 64 – Mutasi Masuk 50%, payment online diabaikan")
}

// Plat merah menunggak pada masa Pergub 64: tunggakan pra & pasca dihapus,
// PKB berjalan 0,5% × DP 100%; denda SWDKLLJ berjalan 1 bulan (Rp8.000).
{
  const r = calculateTax({
    ...dh3088wk,
    jatuhTempoPajak: new Date("2023-11-29T00:00:00"),
    jatuhTempoStnk: new Date("2023-11-29T00:00:00"),
    tanggalBayar: new Date("2026-12-15T00:00:00"),
    warnaPlat: "merah",
  })
  assert.equal(r.pergub, "64-2026")
  assert.equal(r.tahunTunggakanPra, 2)
  assert.equal(r.tahunTunggakanPost, 1)
  assert.equal(r.pkbTunggakanPra2025 + r.pkbTunggakanPost2025 + r.opsenTunggakan, 0)
  near(r.pkbBerjalan, 12_100_000 * 0.005, "Plat merah - PKB berjalan")
  assert.equal(r.swdklljTunggakan, 105_000)
  assert.equal(r.dendaSwdkllj, 8_000)
  assert.equal(r.dendaSwdklljTunggakanDihapus, true)
  pass("Pergub 64 – Plat merah menunggak: tunggakan dihapus, tarif 0,5%")
}

// ===========================================================================
// SWDKLLJ per golongan Jasa Raharja (tarif per 1 Juni 2017)
// Pokok = SW + KD Rp3.000; denda ≤ 3 / 4–6 / 7–9 / > 9 bulan.
// ===========================================================================
{
  const g = (jenis: TaxCalculatorInput["jenisKendaraan"], cc?: number) => golonganSwdkllj(jenis, cc)
  // Sepeda motor: A ≤ 50 cc, C1 s.d. 250 cc, C2 di atasnya; tanpa CC → C1.
  assert.equal(g("SEPEDA MOTOR", 50), "A")
  assert.equal(g("SEPEDA MOTOR", 51), "C1")
  assert.equal(g("SEPEDA MOTOR", 250), "C1")
  assert.equal(g("SEPEDA MOTOR", 251), "C2")
  assert.equal(g("SEPEDA MOTOR"), "C1")
  // Mobil barang: DP s.d. 2.400 cc, F di atasnya; tanpa CC → pick up/light truck DP, truck F.
  for (const jenis of ["PICK UP", "LIGHT TRUCK", "TRUCK"] as const) {
    assert.equal(g(jenis, 2_400), "DP", `${jenis} 2.400 cc`)
    assert.equal(g(jenis, 2_401), "F", `${jenis} 2.401 cc`)
  }
  assert.equal(g("PICK UP"), "DP")
  assert.equal(g("LIGHT TRUCK"), "DP")
  assert.equal(g("TRUCK"), "F")
  // Penumpang bukan angkutan umum: DP berapa pun CC-nya; microbus EP.
  for (const jenis of ["MINIBUS", "SEDAN", "JEEP"] as const) {
    assert.equal(g(jenis, 3_000), "DP", `${jenis} 3.000 cc`)
  }
  assert.equal(g("MICROBUS", 2_000), "EP")
  // CC tidak valid diperlakukan kosong.
  assert.equal(g("SEPEDA MOTOR", 0), "C1")
  assert.equal(g("TRUCK", Number.NaN), "F")

  // Denda per golongan untuk 1, 4, 7, dan 10 bulan terlambat.
  const denda = (gol: Parameters<typeof dendaSwdklljFor>[0]) => [1, 4, 7, 10].map((b) => dendaSwdklljFor(gol, b))
  assert.deepEqual(denda("A"), [0, 0, 0, 0])
  assert.deepEqual(denda("C1"), [8_000, 16_000, 24_000, 32_000])
  assert.deepEqual(denda("C2"), [20_000, 40_000, 60_000, 80_000])
  assert.deepEqual(denda("DP"), [35_000, 70_000, 100_000, 100_000])
  assert.deepEqual(denda("EP"), [37_500, 75_000, 100_000, 100_000])
  assert.deepEqual(denda("F"), [40_000, 80_000, 100_000, 100_000])
  assert.equal(dendaSwdklljFor("F", 0), 0, "Tidak terlambat → tanpa denda")
  pass("SWDKLLJ – golongan dari jenis dan CC, denda per golongan")
}

// Truck 4 tahun menunggak (bayar 2 Nov 2026, JT 1 Mar 2022, Pergub 64): golongan F.
{
  const truck: TaxCalculatorInput = {
    njkb: 400_000_000,
    njub: 0,
    bobot: 1.4,
    jenisKendaraan: "TRUCK",
    isiSilinder: 7_684,
    jatuhTempoPajak: new Date("2022-03-01T00:00:00"),
    jatuhTempoStnk: new Date("2022-03-01T00:00:00"),
    tanggalBayar: new Date("2026-11-02T00:00:00"),
    isDomisiliGempa: false,
    isTembakRu: false,
  }
  const r = calculateTax(truck)
  assert.equal(r.golonganSwdkllj, "F")
  assert.equal(r.swdklljBerjalan, 163_000, "Truck: SW 160.000 + KD 3.000")
  assert.equal(r.swdklljTunggakan, 4 * 163_000)
  assert.equal(r.dendaSwdkllj, 100_000, "9 bulan terlambat → F Rp100.000")
  // Tanpa CC truck tetap F; komponen lain tidak bergantung golongan.
  const tanpaCc = calculateTax({ ...truck, isiSilinder: undefined })
  assert.equal(tanpaCc.golonganSwdkllj, "F")
  assert.equal(tanpaCc.total, r.total)
  pass("SWDKLLJ – truck golongan F Rp163.000, tunggakan 4 × Rp163.000")
}

// Pick up 2.477 cc (F) vs 2.393 cc (DP), motor 300 cc (C2), motor 50 cc (A), microbus (EP).
{
  const pickUp: TaxCalculatorInput = {
    njkb: 200_000_000,
    njub: 0,
    bobot: 1.085,
    jenisKendaraan: "PICK UP",
    jatuhTempoPajak: new Date("2026-09-01T00:00:00"),
    jatuhTempoStnk: new Date("2030-09-01T00:00:00"),
    tanggalBayar: new Date("2026-11-02T00:00:00"),
    isDomisiliGempa: false,
    isTembakRu: false,
  }
  // 1 Sep → 2 Nov 2026 = 3 bulan kalender terlambat → denda kolom pertama.
  const besar = calculateTax({ ...pickUp, isiSilinder: 2_477 })
  assert.equal(besar.bulanTerlambat, 3)
  assert.equal(besar.golonganSwdkllj, "F")
  assert.equal(besar.swdklljBerjalan + besar.dendaSwdkllj, 163_000 + 40_000)
  const kecil = calculateTax({ ...pickUp, isiSilinder: 2_393 })
  assert.equal(kecil.golonganSwdkllj, "DP")
  assert.equal(kecil.swdklljBerjalan + kecil.dendaSwdkllj, 143_000 + 35_000)
  assert.equal(besar.total - kecil.total, 20_000 + 5_000, "Selisih hanya pada SWDKLLJ")

  const motor: TaxCalculatorInput = { ...pickUp, njkb: 60_000_000, bobot: 1, jenisKendaraan: "SEPEDA MOTOR" }
  const motorBesar = calculateTax({ ...motor, isiSilinder: 300 })
  assert.equal(motorBesar.golonganSwdkllj, "C2")
  assert.equal(motorBesar.swdklljBerjalan + motorBesar.dendaSwdkllj, 83_000 + 20_000)
  const motorKecil = calculateTax({ ...motor, isiSilinder: 49 })
  assert.equal(motorKecil.golonganSwdkllj, "A")
  assert.equal(motorKecil.swdklljBerjalan, 3_000, "Golongan A: SW bebas, hanya KD")
  assert.equal(motorKecil.dendaSwdkllj, 0, "Golongan A tanpa denda")

  const microbus = calculateTax({ ...pickUp, jenisKendaraan: "MICROBUS", isiSilinder: 2_000 })
  assert.equal(microbus.golonganSwdkllj, "EP")
  assert.equal(microbus.swdklljBerjalan + microbus.dendaSwdkllj, 153_000 + 37_500)
  pass("SWDKLLJ – pick up DP/F menurut CC, motor C2 dan A, microbus EP")
}

// Payment online tidak berlaku pada masa Pergub 54.
{
  const tanpa = calculateTax(dh3088wk)
  const online = calculateTax({ ...dh3088wk, isBayarOnline: true })
  assert.equal(online.pergub, "54-2026")
  assert.equal(online.isBayarOnline, false)
  assert.deepEqual(online, tanpa, "Online diabaikan pada Pergub 54")
  pass("Pergub 54 – payment online diabaikan")
}

console.log("\nSemua regression test: PASS ✓\n")
