/**
 * src/lib/tax-calculator.ts
 *
 * Logika murni kalkulasi PKB & Opsen berdasarkan Pergub NTT No. 54 Tahun 2026.
 * Diadaptasi dari hitungPajak() pada index.html — rumus tidak diubah.
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
  // Hitung periode tunggakan
  //
  // Mulai dari tanggal jatuh tempo pajak (berjalanStart).
  // Setiap periode = 1 tahun.
  // Periode yang sudah lewat (nextPeriod <= tanggalBayar) → masuk tunggakan.
  // -----------------------------------------------------------------------
  let currentPeriodStart = new Date(jatuhTempoPajak)
  const allPastPeriods: Date[] = []

  while (true) {
    const nextPeriod = new Date(currentPeriodStart)
    nextPeriod.setFullYear(nextPeriod.getFullYear() + 1)
    if (nextPeriod > tanggalBayar) break
    allPastPeriods.push(new Date(currentPeriodStart))
    currentPeriodStart = nextPeriod
  }

  const berjalanStart = currentPeriodStart

  // Maksimal 4 tahun tunggakan (aturan max 5 tahun = 4 tunggakan + 1 berjalan)
  const tunggakanYears =
    allPastPeriods.length > 4 ? allPastPeriods.slice(-4) : allPastPeriods

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

    // Opsen hanya berlaku untuk periode setelah cutoff
    if (period >= CUTOFF_OPSEN) {
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

  // Denda SWDKLLJ — berdasarkan keterlambatan dari berjalanStart
  const delayDays = Math.floor(
    (tanggalBayar.getTime() - berjalanStart.getTime()) / (1000 * 60 * 60 * 24)
  )

  let dendaSwdkllj = 0
  if (delayDays > 0) {
    const delayMonths = Math.ceil(delayDays / 30)
    if (isMotor) {
      if (delayMonths <= 3) dendaSwdkllj = 8_000
      else if (delayMonths <= 6) dendaSwdkllj = 16_000
      else if (delayMonths <= 9) dendaSwdkllj = 24_000
      else dendaSwdkllj = 32_000
    } else {
      if (delayMonths <= 3) dendaSwdkllj = 35_000
      else if (delayMonths <= 6) dendaSwdkllj = 70_000
      else dendaSwdkllj = 100_000
    }
  }

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
