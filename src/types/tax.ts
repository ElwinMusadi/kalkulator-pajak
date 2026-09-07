// ============================================================
// Tipe data untuk Kalkulator Pajak Kendaraan (Pergub NTT 54/2026)
// ============================================================

/** Jenis kendaraan yang didukung oleh kalkulator */
export type JenisKendaraan =
  | "SEPEDA MOTOR"
  | "MINIBUS"
  | "PICK UP"
  | "SEDAN"
  | "JEEP"
  | "LIGHT TRUCK"
  | "MICROBUS"
  | "TRUCK"

/** Peta bobot per jenis kendaraan */
export const BOBOT_MAP: Record<JenisKendaraan, number> = {
  "SEPEDA MOTOR": 1.0,
  MINIBUS: 1.05,
  "PICK UP": 1.085,
  SEDAN: 1.025,
  JEEP: 1.05,
  "LIGHT TRUCK": 1.3,
  MICROBUS: 1.085,
  TRUCK: 1.4,
}

/** Data kendaraan dari API /api/njkb/:nopol */
export interface VehicleData {
  nopol: string
  nama: string | null
  jenis: string | null
  jatuhTempoStnk: string | null   // ISO YYYY-MM-DD
  jatuhTempoPajak: string | null  // ISO YYYY-MM-DD
  njkb: number
  njub: number
  bobot: number
}

/** Input untuk fungsi calculateTax */
export interface TaxCalculatorInput {
  njkb: number
  njub: number   // Nilai Jual Ubah Bentuk; 0 jika tidak ada
  bobot: number
  jenisKendaraan: JenisKendaraan
  jatuhTempoPajak: Date   // SD Notice — tanggal jatuh tempo pajak
  jatuhTempoStnk: Date    // SD STNK — tanggal berakhir STNK
  tanggalBayar: Date
  isDomisiliGempa: boolean
  isTembakRu: boolean
}

/** Rincian komponen pajak hasil kalkulasi */
export interface TaxCalculationResult {
  // PKB
  pkbBerjalan: number
  pkbDiscount: number              // Persentase diskon PKB berjalan (0–0.2)
  pkbTunggakanPra2025: number      // PKB tunggakan dengan tarif 1,5% (sebelum 5 Jan 2025)
  pkbTunggakanPost2025: number     // PKB tunggakan dengan tarif 1,2% (mulai 5 Jan 2025)
  tahunTunggakanPra: number        // Jumlah tahun tunggakan pra-cutoff
  tahunTunggakanPost: number       // Jumlah tahun tunggakan post-cutoff
  tahunTunggakan: number           // Total tahun tunggakan (max 4)

  // Denda PKB — selalu 0 (tax amnesty)
  dendaPkb: number

  // Opsen PKB
  opsenBerjalan: number
  opsenTunggakan: number

  // Denda Opsen PKB — selalu 0 (Tax Amnesty)
  dendaOpsen: number
  bulanTerlambat: number

  // SWDKLLJ
  swdklljBerjalan: number
  swdklljTunggakan: number
  dendaSwdkllj: number

  // PNBP (hanya jika STNK jatuh tempo ≤ 90 hari)
  biayaStnk: number
  biayaTnkb: number

  // Biaya tambahan
  biayaTembakRu: number

  // Grand total
  total: number
}

/** Status lookup Nopol */
export type NopolLookupStatus =
  | "idle"
  | "loading"
  | "found"
  | "not_found"
  | "error"
