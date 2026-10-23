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

/**
 * Warna plat (TNKB) yang menentukan tarif PKB.
 * - putih / hitam: kendaraan pribadi/badan — tarif 1,5% (sebelum 5 Jan 2025) / 1,2%.
 * - merah: kendaraan dinas pemerintah — tarif 0,5% untuk semua periode.
 * Plat kuning (angkutan umum) sengaja tidak didukung: dihitung di loket
 * karena menyesuaikan penetapan Jasa Raharja.
 */
export type WarnaPlat = "putih" | "hitam" | "merah"

export const WARNA_PLAT_OPTIONS: readonly WarnaPlat[] = ["putih", "hitam", "merah"]

export const WARNA_PLAT_LABEL: Record<WarnaPlat, string> = {
  putih: "Putih",
  hitam: "Hitam",
  merah: "Merah",
}

/** Default bila sumber data tidak menyediakan warna plat; petugas dapat mengoreksi. */
export const DEFAULT_WARNA_PLAT: WarnaPlat = "putih"

/** Tarif PKB plat merah (kendaraan dinas), berlaku untuk seluruh periode. */
export const TARIF_PKB_PLAT_MERAH = 0.005

export function isWarnaPlat(value: unknown): value is WarnaPlat {
  return typeof value === "string" && (WARNA_PLAT_OPTIONS as readonly string[]).includes(value)
}

const WARNA_PLAT_TOKENS: Record<string, WarnaPlat> = {
  PUTIH: "putih",
  WHITE: "putih",
  HITAM: "hitam",
  BLACK: "hitam",
  MERAH: "merah",
  RED: "merah",
}
const WARNA_TIDAK_DIDUKUNG = new Set(["KUNING", "YELLOW", "HIJAU", "GREEN", "BIRU", "BLUE"])

/**
 * Normalisasi teks warna plat dari sumber eksternal ("PUTIH", "Merah", "red",
 * "TNKB HITAM", "DASAR MERAH TULISAN PUTIH", ...).
 *
 * Aturan (gagal aman → null; frontend memakai default dan user dapat mengubah):
 * - Mengandung warna yang tidak didukung (KUNING/HIJAU/BIRU) → null.
 * - Bila ada kata "DASAR", warna dasar plat (token setelahnya) yang dipakai.
 * - Selain itu tepat satu warna yang dikenali → warna tersebut; lebih dari satu
 *   warna berbeda (ambigu) → null.
 */
export function normalizeWarnaPlat(raw: unknown): WarnaPlat | null {
  if (typeof raw !== "string") return null
  const tokens = raw.toUpperCase().split(/[^A-Z]+/).filter(Boolean)
  if (tokens.length === 0) return null
  if (tokens.some((token) => WARNA_TIDAK_DIDUKUNG.has(token))) return null

  const dasarIndex = tokens.indexOf("DASAR")
  if (dasarIndex >= 0) {
    const dasar = WARNA_PLAT_TOKENS[tokens[dasarIndex + 1] ?? ""]
    if (dasar) return dasar
  }

  const found = new Set(
    tokens.map((token) => WARNA_PLAT_TOKENS[token]).filter((warna): warna is WarnaPlat => Boolean(warna)),
  )
  return found.size === 1 ? [...found][0] : null
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
  /**
   * Warna plat (TNKB). null = sumber tidak menyediakan / nilai tidak dikenali;
   * frontend memakai DEFAULT_WARNA_PLAT dan user dapat mengubah manual.
   */
  warnaPlat?: WarnaPlat | null
  /** Label UPT asal dari Data Potensi, bukan alamat lengkap pemilik. */
  originUpt?: string | null
  /** Waktu sinkronisasi dataset pusat (ISO), null bila tidak tersedia. */
  syncedAt?: string | null
  source?: "d1" | "api"
  njkbStatus?: "matched" | "not_found" | "reference_unavailable" | "conflict" | "ambiguous"
}

/**
 * Mode kompatibilitas sumber data. Lookup produksi selalu memakai API Data
 * Kendaraan; nilai lama dipertahankan untuk adapter/test historis dan klien lama.
 */
export type VehicleDataSourceMode = "d1" | "api" | "d1_then_api" | "api_then_d1"

/** Sumber aktif tunggal. Mode lama dipertahankan sebagai tipe kompatibilitas. */
export const DEFAULT_VEHICLE_DATA_SOURCE_MODE: VehicleDataSourceMode = "api"

export const VEHICLE_DATA_SOURCE_MODES: readonly VehicleDataSourceMode[] = [
  "d1",
  "api",
  "d1_then_api",
  "api_then_d1",
]

/** Metadata aman untuk kegagalan lookup; bukan detail error upstream mentah. */
export type VehicleLookupErrorCode =
  | "NJKB_CONFIG_ERROR"
  | "NJKB_CLIENT_TIMEOUT"
  | "NJKB_UPSTREAM_TIMEOUT"
  | "NJKB_UPSTREAM_HTTP_ERROR"
  | "NJKB_NETWORK_ERROR"
  | "NJKB_INVALID_PAYLOAD"
  /** Upstream 403 `region_not_allowed`: nopol di luar wilayah UPT kunci API. */
  | "NJKB_REGION_NOT_ALLOWED"

/** Hasil pencarian data kendaraan dari sumber data */
export type VehicleLookupResult =
  | {
      status: "found"
      data: VehicleData
      source: "d1" | "api"
    }
  | {
      status: "not_found"
      message?: string
    }
  | {
      status: "error"
      error: Error | string
      message?: string
      code?: VehicleLookupErrorCode
      httpStatus?: 403 | 500 | 502 | 503 | 504
      upstreamStatus?: number
    }

/**
 * Biaya layanan BBN & Mutasi (bagian 5). Nominal diisi manual oleh petugas
 * karena bersifat dinamis; kosong/0 berarti tidak dikenakan.
 */
export const BIAYA_LAYANAN_KEYS = [
  "pendaftaranBbn",
  "bpkb",
  "cekFisik",
  "mutasiMasuk",
  "mutasiKeluar",
  "arsipFiskal",
] as const
export type BiayaLayananKey = (typeof BIAYA_LAYANAN_KEYS)[number]

export const BIAYA_LAYANAN_LABEL: Record<BiayaLayananKey, string> = {
  pendaftaranBbn: "Biaya Pendaftaran BBN",
  bpkb: "Biaya BPKB",
  cekFisik: "Biaya Cek Fisik / Cek Fisik Bantuan",
  mutasiMasuk: "Biaya Mutasi Masuk",
  mutasiKeluar: "Biaya Mutasi Keluar",
  arsipFiskal: "Biaya Arsip STNK & BPKB (Fiskal)",
}

/** Batas atas per biaya (pengaman salah ketik), dalam Rupiah. */
export const BIAYA_LAYANAN_MAX = 100_000_000

export type BiayaLayanan = Partial<Record<BiayaLayananKey, number>>

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
  isMutasiMasuk?: boolean // Pengurangan PKB berjalan 50% untuk Mutasi Masuk Luar Daerah
  isTembakRu: boolean
  /** Warna plat (TNKB); default "putih". Plat merah → tarif PKB 0,5% semua periode. */
  warnaPlat?: WarnaPlat
  /** Biaya BBN & Mutasi (bagian 5); nilai kosong/≤0/tidak valid diabaikan. */
  biayaLayanan?: BiayaLayanan
}

/** Rincian komponen pajak hasil kalkulasi */
export interface TaxCalculationResult {
  // PKB
  pkbBerjalan: number
  pkbDiscount: number              // Persentase diskon PKB berjalan (0–0.5)
  isMutasiMasuk: boolean
  /** Pilihan wilayah gempa yang benar-benar digunakan pada hasil perhitungan. */
  isDomisiliGempa: boolean
  pkbTunggakanPra2025: number      // PKB tunggakan periode sebelum 5 Jan 2025 (tanpa Opsen)
  pkbTunggakanPost2025: number     // PKB tunggakan periode mulai 5 Jan 2025 (kena Opsen)
  warnaPlat: WarnaPlat             // Warna plat yang dipakai dalam perhitungan
  tarifPkbBerjalan: number         // Tarif PKB periode berjalan (0.012 / 0.015 / 0.005)
  /**
   * Selisih hari dari tanggal bayar ke tanggal Jatuh Tempo Pajak yang diisi.
   * Positif = sebelum jatuh tempo; negatif = sudah lewat. Informasi tampilan
   * saja (status "Pajak Aktif" bila > 90 hari) — tidak memengaruhi nominal.
   */
  hariMenujuJatuhTempo: number
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

  // Biaya BBN & Mutasi (bagian 5) — setiap key selalu ada; 0 = tidak dikenakan
  biayaLayanan: Record<BiayaLayananKey, number>
  totalBiayaLayanan: number

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
