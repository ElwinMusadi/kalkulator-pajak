/**
 * src/lib/tax-calculator.ts
 *
 * Logika murni kalkulasi PKB & Opsen berdasarkan Pergub NTT No. 54 Tahun 2026.
 * Diadaptasi dari hitungPajak() pada index.html dengan periodisasi tunggakan
 * berdasarkan tahun pajak sesuai ketentuan Pergub.
 */

import type { TaxCalculatorInput, TaxCalculationResult } from "@/types/tax"

/** Tanggal cutoff berlakunya opsen (5 Januari 2025) */
const CUTOFF_OPSEN = new Date("2025-01-05")

/**
 * Fungsi utama — menerima input tervalidasi, mengembalikan rincian pajak.
 */
export function calculateTax(input: TaxCalculatorInput): TaxCalculationResult {
  const {
    njkb,
    bobot,
    jenisKendaraan,
    jatuhTempoPajak,
    jatuhTempoStnk,
    tanggalBayar,
    isDomisiliGempa,
    isTembakRu,
  } = input

  const isMotor = jenisKendaraan === "SEPEDA MOTOR"
  const swdklljBase = isMotor ? 35_000 : 143_000

  // -----------------------------------------------------------------------
  // Hitung periode tunggakan berdasarkan TAHUN PAJAK.
  //
  // Tahun pembayaran adalah periode berjalan, walaupun tanggal anniversary
  // jatuh tempo periode itu belum terlewati. Semua tahun sebelumnya adalah
  // tunggakan, maksimal empat tahun terakhir.
  // Contoh bayar 03/09/2026 dengan jatuh tempo awal 22/10/2024:
  //   2024 dan 2025 = tunggakan; 2026 = berjalan.
  // -----------------------------------------------------------------------
  const tahunBayar = tanggalBayar.getFullYear()
  const tahunAwalPajak = jatuhTempoPajak.getFullYear()
  const semuaTahunTunggakan: Date[] = []

  for (let tahun = tahunAwalPajak; tahun < tahunBayar; tahun++) {
    const period = new Date(jatuhTempoPajak)
    period.setFullYear(tahun)
    semuaTahunTunggakan.push(period)
  }

  // Maksimal 4 tahun tunggakan (aturan max 5 tahun = 4 tunggakan + 1 berjalan)
  const tunggakanYears =
    semuaTahunTunggakan.length > 4
      ? semuaTahunTunggakan.slice(-4)
      : semuaTahunTunggakan

  const berjalanStart = new Date(jatuhTempoPajak)
  berjalanStart.setFullYear(tahunBayar)


  // -----------------------------------------------------------------------
  // PKB & Opsen Tunggakan
  // -----------------------------------------------------------------------
  const diskonTunggakan = isDomisiliGempa ? 0.75 : 0.5

  let totalPkbTunggakan = 0
  let totalOpsenTunggakan = 0

  for (const period of tunggakanYears) {
    const tarif = period < CUTOFF_OPSEN ? 0.015 : 0.012
    const dp = njkb * bobot
    const pkbPeriod = dp * tarif
    const discountedPkb = pkbPeriod * (1 - diskonTunggakan)

    totalPkbTunggakan += discountedPkb

    // Opsen berlaku untuk tahun pajak mulai 2025.
    // Periode 2025 tetap terkena opsen meski anniversary jatuh tempo
    // berada sebelum 5 Januari 2025 (mis. 22 Oktober 2025).
    if (period.getFullYear() >= CUTOFF_OPSEN.getFullYear()) {
      totalOpsenTunggakan += discountedPkb * 0.66
    }
  }

  // -----------------------------------------------------------------------
  // PKB Berjalan
  // -----------------------------------------------------------------------
  // Dasar pengenaan berjalan: jika ada tunggakan → NJKB penuh
  // Jika tidak ada tunggakan → NJKB × 0.825 (pengurang 17.5%)
  const dpBerjalan =
    tunggakanYears.length > 0 ? njkb * bobot : njkb * bobot * 0.825

  const basePkbBerjalan = dpBerjalan * 0.012

  // Diskon PKB berjalan berdasarkan jarak hari menuju jatuh tempo
  const daysToJatuhTempo = Math.floor(
    (berjalanStart.getTime() - tanggalBayar.getTime()) / (1000 * 60 * 60 * 24)
  )

  let pkbDiscount = 0
  if (daysToJatuhTempo >= 0 && tunggakanYears.length === 0) {
    if (isMotor) {
      if (daysToJatuhTempo <= 30) pkbDiscount = 0.1
      else if (daysToJatuhTempo <= 60) pkbDiscount = 0.15
      else if (daysToJatuhTempo <= 90) pkbDiscount = 0.2
    } else {
      if (daysToJatuhTempo <= 90) pkbDiscount = 0.1
    }
  }

  const pkbBerjalan = basePkbBerjalan * (1 - pkbDiscount)

  // -----------------------------------------------------------------------
  // Opsen PKB Berjalan (66% dari PKB berjalan)
  // -----------------------------------------------------------------------
  const opsenBerjalan = pkbBerjalan * 0.66

  // -----------------------------------------------------------------------
  // SWDKLLJ
  // -----------------------------------------------------------------------
  const swdklljBerjalan = swdklljBase
  const swdklljTunggakan = tunggakanYears.length * swdklljBase

  // Tax Amnesty Pergub 54/2026 menghapus seluruh denda SWDKLLJ atas
  // tunggakan. Pokok SWDKLLJ berjalan dan tunggakan tetap ditagihkan.
  const dendaSwdkllj = 0

  // -----------------------------------------------------------------------
  // PNBP STNK & TNKB
  // HANYA dikenakan jika STNK jatuh tempo ≤ 90 hari dari tanggal bayar
  // -----------------------------------------------------------------------
  const daysToStnk = Math.floor(
    (jatuhTempoStnk.getTime() - tanggalBayar.getTime()) / (1000 * 60 * 60 * 24)
  )

  let biayaStnk = 0
  let biayaTnkb = 0
  if (daysToStnk <= 90) {
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
    totalPkbTunggakan +
    0 + // denda PKB → tax amnesty = Rp0
    opsenBerjalan +
    totalOpsenTunggakan +
    swdklljBerjalan +
    swdklljTunggakan +
    dendaSwdkllj +
    biayaStnk +
    biayaTnkb +
    biayaTembakRu

  return {
    pkbBerjalan,
    pkbDiscount,
    pkbTunggakan: totalPkbTunggakan,
    tahunTunggakan: tunggakanYears.length,
    dendaPkb: 0,
    opsenBerjalan,
    opsenTunggakan: totalOpsenTunggakan,
    swdklljBerjalan,
    swdklljTunggakan,
    dendaSwdkllj,
    biayaStnk,
    biayaTnkb,
    biayaTembakRu,
    total,
  }
}
