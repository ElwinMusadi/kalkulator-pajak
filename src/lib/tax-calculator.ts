/**
 * src/lib/tax-calculator.ts
 *
 * Kalkulasi PKB & Opsen berdasarkan Pergub NTT No. 54 Tahun 2026.
 * Mengacu pada Surat Edaran Nomor 900.1.13.1/2741/BPAD2.1 beserta
 * seluruh contoh penetapan (Contoh 1–14) yang terlampir.
 */

import type { TaxCalculatorInput, TaxCalculationResult } from "@/types/tax"

/** Tanggal cutoff berlakunya Opsen PKB dan tarif PKB 1,2% */
const CUTOFF_OPSEN = new Date("2025-01-05T00:00:00")

// ---------------------------------------------------------------------------
// Utilitas tanggal
// ---------------------------------------------------------------------------

/**
 * Jumlah bulan kalender antara dua tanggal, dibulatkan ke atas.
 * Digunakan untuk menghitung denda Opsen dan denda SWDKLLJ.
 */
function bulanKalender(dari: Date, hingga: Date): number {
  const tahun = hingga.getFullYear() - dari.getFullYear()
  const bulan = hingga.getMonth() - dari.getMonth()
  const hari = hingga.getDate() - dari.getDate()
  const total = tahun * 12 + bulan + (hari > 0 ? 1 : 0)
  return Math.max(0, total)
}

// ---------------------------------------------------------------------------
// Struktur periode pajak internal
// ---------------------------------------------------------------------------

interface TaxPeriod {
  start: Date     // Tanggal awal periode
  tarifPkb: 0.015 | 0.012
  kenaOpsen: boolean
  status: "tunggakan" | "berjalan"
}

/**
 * Menghasilkan daftar periode pajak dari awal jatuh tempo hingga
 * tahun bayar. Maksimal 4 tunggakan + 1 berjalan.
 */
function buildTaxPeriods(
  jatuhTempoPajak: Date,
  tanggalBayar: Date
): TaxPeriod[] {
  const tahunBayar = tanggalBayar.getFullYear()
  const tahunAwal = jatuhTempoPajak.getFullYear()

  // Semua tahun sebelum tahun bayar = tunggakan
  const semuaTunggakan: TaxPeriod[] = []
  for (let tahun = tahunAwal; tahun < tahunBayar; tahun++) {
    const start = new Date(jatuhTempoPajak)
    start.setFullYear(tahun)
    semuaTunggakan.push({
      start,
      tarifPkb: start < CUTOFF_OPSEN ? 0.015 : 0.012,
      kenaOpsen: start >= CUTOFF_OPSEN,
      status: "tunggakan",
    })
  }

  // Maksimal 4 tunggakan terakhir
  const tunggakan =
    semuaTunggakan.length > 4
      ? semuaTunggakan.slice(-4)
      : semuaTunggakan

  // Periode berjalan
  const berjalanStart = new Date(jatuhTempoPajak)
  berjalanStart.setFullYear(tahunBayar)

  const berjalan: TaxPeriod = {
    start: berjalanStart,
    tarifPkb: berjalanStart < CUTOFF_OPSEN ? 0.015 : 0.012,
    kenaOpsen: berjalanStart >= CUTOFF_OPSEN,
    status: "berjalan",
  }

  return [...tunggakan, berjalan]
}

// ---------------------------------------------------------------------------
// Fungsi utama
// ---------------------------------------------------------------------------

export function calculateTax(input: TaxCalculatorInput): TaxCalculationResult {
  const {
    njkb,
    njub,
    bobot,
    jenisKendaraan,
    jatuhTempoPajak,
    jatuhTempoStnk,
    tanggalBayar,
    isDomisiliGempa,
    isMutasiMasuk = false,
    isTembakRu,
  } = input

  const isMotor = jenisKendaraan === "SEPEDA MOTOR"
  const swdklljBase = isMotor ? 35_000 : 143_000

  /** Dasar pengenaan penuh (termasuk NJUB jika ada ubah bentuk) */
  const dasarPenuh = (njkb + njub) * bobot

  // -----------------------------------------------------------------------
  // Bangun periode
  // -----------------------------------------------------------------------
  const semua = buildTaxPeriods(jatuhTempoPajak, tanggalBayar)
  const tunggakanPeriods = semua.filter((p) => p.status === "tunggakan")
  const berjalanPeriod = semua.find((p) => p.status === "berjalan")!

  // -----------------------------------------------------------------------
  // PKB & Opsen Tunggakan
  // -----------------------------------------------------------------------
  const diskonTunggakan = isDomisiliGempa ? 0.75 : 0.5

  let pkbTunggakanPra2025 = 0
  let pkbTunggakanPost2025 = 0
  let opsenTunggakan = 0
  let tahunTunggakanPra = 0
  let tahunTunggakanPost = 0

  for (const period of tunggakanPeriods) {
    const pkbPokok = dasarPenuh * period.tarifPkb
    const pkbDiskon = pkbPokok * (1 - diskonTunggakan)

    if (period.kenaOpsen) {
      pkbTunggakanPost2025 += pkbDiskon
      opsenTunggakan += pkbDiskon * 0.66
      tahunTunggakanPost++
    } else {
      pkbTunggakanPra2025 += pkbDiskon
      tahunTunggakanPra++
    }
  }

  const tahunTunggakan = tunggakanPeriods.length
  const pkbTunggakan = pkbTunggakanPra2025 + pkbTunggakanPost2025

  // -----------------------------------------------------------------------
  // PKB Berjalan
  // -----------------------------------------------------------------------
  // Pengurang dasar pengenaan 17,5% hanya berlaku jika:
  //   (a) tidak ada tunggakan, DAN
  //   (b) masa pajak berjalan sudah masuk rezim Opsen (≥ 5 Jan 2025)
  const adaTunggakan = tahunTunggakan > 0
  const boolOpsenBerjalan = berjalanPeriod.kenaOpsen

  const faktorDpBerjalan =
    !adaTunggakan && boolOpsenBerjalan ? 0.825 : 1.0
  const dpBerjalan = dasarPenuh * faktorDpBerjalan

  const basePkbBerjalan = dpBerjalan * berjalanPeriod.tarifPkb

  // Diskon PKB berjalan: hanya bila tidak ada tunggakan dan bayar sebelum jatuh tempo
  const hariMenujuJT = Math.floor(
    (berjalanPeriod.start.getTime() - tanggalBayar.getTime()) /
      (1000 * 60 * 60 * 24)
  )

  // Mutasi Masuk Luar Daerah: diskon PKB berjalan 50% sesuai Pergub.
  // Diskon ini menggantikan diskon pembayaran awal 10%/15%/20%.
  let pkbDiscount = isMutasiMasuk ? 0.5 : 0
  if (!isMutasiMasuk && !adaTunggakan && hariMenujuJT >= 0) {
    if (isMotor) {
      if (hariMenujuJT <= 30) pkbDiscount = 0.1
      else if (hariMenujuJT <= 60) pkbDiscount = 0.15
      else if (hariMenujuJT <= 90) pkbDiscount = 0.2
    } else {
      if (hariMenujuJT <= 90) pkbDiscount = 0.1
    }
  }

  const pkbBerjalan = basePkbBerjalan * (1 - pkbDiscount)

  // -----------------------------------------------------------------------
  // Opsen PKB Berjalan
  // -----------------------------------------------------------------------
  const opsenBerjalan = boolOpsenBerjalan ? pkbBerjalan * 0.66 : 0

  // -----------------------------------------------------------------------
  // Denda PKB & Opsen PKB
  // Seluruh denda, baik periode berjalan maupun tunggakan, dihapus
  // melalui Tax Amnesty. Jumlah bulan tetap dihitung untuk denda SWDKLLJ.
  // -----------------------------------------------------------------------
  const bulanTerlambat = Math.min(
    24,
    bulanKalender(berjalanPeriod.start, tanggalBayar)
  )
  const dendaOpsen = 0

  // -----------------------------------------------------------------------
  // SWDKLLJ
  // -----------------------------------------------------------------------
  const swdklljBerjalan = swdklljBase
  const swdklljTunggakan = tahunTunggakan * swdklljBase

  // Denda SWDKLLJ tetap dipungut (bukan bagian Tax Amnesty).
  // Referensi: semua contoh 1–14 dalam pedoman tetap mencantumkan denda ini.
  let dendaSwdkllj = 0
  if (bulanTerlambat > 0) {
    if (isMotor) {
      if (bulanTerlambat <= 3) dendaSwdkllj = 8_000
      else if (bulanTerlambat <= 6) dendaSwdkllj = 16_000
      else if (bulanTerlambat <= 9) dendaSwdkllj = 24_000
      else dendaSwdkllj = 32_000
    } else {
      if (bulanTerlambat <= 3) dendaSwdkllj = 35_000
      else if (bulanTerlambat <= 6) dendaSwdkllj = 70_000
      else dendaSwdkllj = 100_000
    }
  }

  // -----------------------------------------------------------------------
  // PNBP STNK & TNKB
  // Dikenakan bila STNK jatuh tempo ≤ 90 hari dari tanggal bayar
  // (artinya STNK sudah kadaluarsa atau hampir kadaluarsa)
  // -----------------------------------------------------------------------
  const hariMenujuStnk = Math.floor(
    (jatuhTempoStnk.getTime() - tanggalBayar.getTime()) /
      (1000 * 60 * 60 * 24)
  )
  let biayaStnk = 0
  let biayaTnkb = 0
  if (hariMenujuStnk <= 90) {
    biayaStnk = isMotor ? 100_000 : 200_000
    biayaTnkb = isMotor ? 60_000 : 100_000
  }

  // -----------------------------------------------------------------------
  // Biaya Tembak RU / STNK (opsional)
  // -----------------------------------------------------------------------
  const biayaTembakRu = isTembakRu ? (isMotor ? 150_000 : 250_000) : 0

  // -----------------------------------------------------------------------
  // Grand Total
  // -----------------------------------------------------------------------
  const total =
    pkbBerjalan +
    pkbTunggakan +
    0 +              // denda PKB → tax amnesty = Rp0
    opsenBerjalan +
    opsenTunggakan +
    swdklljBerjalan +
    swdklljTunggakan +
    dendaSwdkllj +
    biayaStnk +
    biayaTnkb +
    biayaTembakRu

  return {
    pkbBerjalan,
    pkbDiscount,
    isMutasiMasuk,
    pkbTunggakanPra2025,
    pkbTunggakanPost2025,
    tahunTunggakanPra,
    tahunTunggakanPost,
    tahunTunggakan,
    dendaPkb: 0,
    opsenBerjalan,
    opsenTunggakan,
    dendaOpsen,
    bulanTerlambat,
    swdklljBerjalan,
    swdklljTunggakan,
    dendaSwdkllj,
    biayaStnk,
    biayaTnkb,
    biayaTembakRu,
    total,
  }
}
