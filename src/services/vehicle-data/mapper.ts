import { BOBOT_MAP } from "../../types/tax"
import type { VehicleData, VehicleLookupResult } from "../../types/tax"
import { normalizeNopol, parseApiDate } from "./utils"

export type OfficialNjkbStatus =
  | "matched"
  | "not_found"
  | "reference_unavailable"
  | "conflict"
  | "ambiguous"

interface OfficialNjkbApiResponse {
  status?: unknown
  vehicle_status?: unknown
  njkb_status?: unknown
  nopol?: unknown
  vehicle?: {
    category?: unknown
    category_raw?: unknown
    type?: unknown
  } | null
  registration?: {
    stnk_valid_until?: unknown
  } | null
  tax?: {
    notice_valid_until?: unknown
  } | null
  owner?: {
    name?: unknown
  } | null
  njkb?: {
    value?: unknown
    weight?: unknown
  } | null
}

const SAFE_NJKB_STATUS_MESSAGES: Record<
  Exclude<OfficialNjkbStatus, "matched" | "not_found">,
  string
> = {
  reference_unavailable:
    "Referensi NJKB belum tersedia untuk kendaraan tersebut.",
  conflict: "Data kendaraan bertentangan dengan referensi NJKB.",
  ambiguous: "Referensi NJKB kendaraan memerlukan pemeriksaan manual.",
}

/**
 * Parse decimal string Rupiah menjadi integer tanpa binary floating point.
 * Contoh: "150000000.00" -> 150000000.
 * Nilai dengan fraksi Rupiah non-zero ditolak agar tidak ada pembulatan diam-diam.
 */
export function parseDecimalRupiahToInteger(raw: unknown): number | null {
  if (typeof raw !== "string") return null
  const value = raw.trim()
  const match = value.match(/^(\d+)(?:\.(\d+))?$/)
  if (!match) return null

  const [, whole, fraction = ""] = match
  if (fraction && /[1-9]/.test(fraction)) return null

  const integer = Number(whole)
  return Number.isSafeInteger(integer) && integer > 0 ? integer : null
}

/**
 * Parse decimal string bobot resmi. Bobot harus positif dan finite.
 * Konversi number diperlukan karena kontrak VehicleData frontend menggunakan number.
 */
export function parseOfficialWeight(raw: unknown): number | null {
  if (typeof raw !== "string") return null
  const value = raw.trim()
  if (!/^\d+(?:\.\d+)?$/.test(value)) return null

  const weight = Number(value)
  return Number.isFinite(weight) && weight > 0 ? weight : null
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : null
}

/**
 * Mapping kontrak resmi NJKB API NTT ke VehicleData.
 *
 * Mengakomodasi pemisahan status:
 * 1. `vehicle_status`: status keberadaan kendaraan di BPAD.
 * 2. `njkb_status`: status pencocokan tabel referensi NJKB.
 *
 * Kasus penting:
 * - `vehicle_status=found` + `njkb_status=matched`: Kendaraan ditemukan, NJKB ditemukan.
 * - `vehicle_status=found` + `njkb_status=not_found`: Kendaraan ditemukan, tetapi NJKB tidak tersedia (njkb=0).
 * - `vehicle_status=not_found`: Kendaraan tidak ditemukan di BPAD.
 */
export function mapApiResponseToVehicleData(
  json: unknown,
  searchedNopol: string,
): VehicleLookupResult {
  if (json === null || typeof json !== "object" || Array.isArray(json)) {
    return {
      status: "error",
      error: "Response NJKB API tidak valid.",
      message: "Response NJKB API tidak valid.",
    }
  }

  const payload = json as OfficialNjkbApiResponse

  // 1. Periksa status kendaraan di BPAD terlebih dahulu
  const vehicleStatus = payload.vehicle_status
  const topStatus = payload.status

  if (
    vehicleStatus === "not_found" ||
    topStatus === "vehicle_not_found"
  ) {
    return {
      status: "not_found",
      message: "Data kendaraan tidak ditemukan.",
    }
  }

  if (topStatus === "invalid_request") {
    return {
      status: "error",
      error: "Format NOPOL tidak valid.",
      message: "Format NOPOL tidak valid.",
    }
  }

  const nopol = normalizeNopol(payload.nopol ?? searchedNopol)
  if (!nopol || nopol.length < 4) {
    return {
      status: "error",
      error: "Response NJKB API tidak valid: nomor polisi tidak valid.",
      message: "Response NJKB API tidak valid: nomor polisi tidak valid.",
    }
  }

  const nama = nullableString(payload.owner?.name)
  // Form kalkulator menggunakan klasifikasi BPAD mentah (MINIBUS, SEPEDA MOTOR, dll.).
  // `category` adalah kelompok umum seperti MOBIL PENUMPANG dan tidak cocok dengan opsi form.
  const categoryRaw = nullableString(payload.vehicle?.category_raw)
  const jenis = categoryRaw ?? nullableString(payload.vehicle?.category)
  const jatuhTempoStnk = parseApiDate(payload.registration?.stnk_valid_until)
  const jatuhTempoPajak = parseApiDate(payload.tax?.notice_valid_until)

  // 2. Evaluasi njkb_status secara terpisah
  const njkbStatus = payload.njkb_status

  // Kasus A: NJKB matched (referensi NJKB ditemukan)
  if (njkbStatus === "matched") {
    if (!payload.njkb || typeof payload.njkb !== "object") {
      return {
        status: "error",
        error: "Response NJKB API tidak valid: data NJKB tidak tersedia.",
        message: "Response NJKB API tidak valid: data NJKB tidak tersedia.",
      }
    }

    const njkb = parseDecimalRupiahToInteger(payload.njkb.value)
    const bobot = parseOfficialWeight(payload.njkb.weight)

    if (!njkb || !bobot) {
      return {
        status: "error",
        error:
          "Response NJKB API tidak valid: nilai NJKB atau bobot tidak valid.",
        message:
          "Response NJKB API tidak valid: nilai NJKB atau bobot tidak valid.",
      }
    }

    const vehicleData: VehicleData = {
      nopol,
      nama,
      jenis,
      jatuhTempoStnk,
      jatuhTempoPajak,
      njkb,
      njub: 0,
      bobot,
      source: "api",
      njkbStatus: "matched",
    }

    return {
      status: "found",
      source: "api",
      data: vehicleData,
    }
  }

  // Kasus B: Kendaraan ditemukan di BPAD, tetapi referensi NJKB tidak ditemukan (not_found)
  // Ini BUKAN vehicle not_found. Data kendaraan dan pemilik tetap diteruskan dengan njkb = 0
  if (njkbStatus === "not_found") {
    const bobot =
      parseOfficialWeight(payload.njkb?.weight) ??
      (categoryRaw && categoryRaw in BOBOT_MAP
        ? BOBOT_MAP[categoryRaw as keyof typeof BOBOT_MAP]
        : null) ??
      (jenis && jenis in BOBOT_MAP
        ? BOBOT_MAP[jenis as keyof typeof BOBOT_MAP]
        : null) ??
      1.0

    const vehicleData: VehicleData = {
      nopol,
      nama,
      jenis,
      jatuhTempoStnk,
      jatuhTempoPajak,
      njkb: 0,
      njub: 0,
      bobot,
      source: "api",
      njkbStatus: "not_found",
    }

    return {
      status: "found",
      source: "api",
      data: vehicleData,
    }
  }

  // Kasus C: reference_unavailable, conflict, ambiguous
  if (
    njkbStatus === "reference_unavailable" ||
    njkbStatus === "conflict" ||
    njkbStatus === "ambiguous"
  ) {
    return {
      status: "error",
      error: SAFE_NJKB_STATUS_MESSAGES[njkbStatus],
      message: SAFE_NJKB_STATUS_MESSAGES[njkbStatus],
    }
  }

  // Kasus D: status NJKB tidak dikenali
  return {
    status: "error",
    error: "Response NJKB API tidak valid: njkb_status tidak dikenali.",
    message: "Response NJKB API tidak valid: njkb_status tidak dikenali.",
  }
}
