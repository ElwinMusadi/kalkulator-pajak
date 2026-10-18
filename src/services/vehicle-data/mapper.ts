import { BOBOT_MAP, normalizeWarnaPlat } from "../../types/tax"
import type { VehicleData, VehicleLookupResult } from "../../types/tax"
import { normalizeNopol, parseApiDate } from "./utils"

export type OfficialNjkbStatus =
  | "matched"
  | "not_found"
  | "reference_unavailable"
  | "conflict"
  | "ambiguous"

type UnknownRecord = Record<string, unknown>

/**
 * Bentuk payload API Data Kendaraan pusat (seluruh field `unknown`: payload
 * eksternal tidak dipercaya dan selalu divalidasi sebelum dipakai).
 */
interface OfficialNjkbApiResponse {
  status?: unknown
  vehicle_status?: unknown
  njkb_status?: unknown
  nopol?: unknown
  vehicle?: unknown // { category?, category_raw?, type?, plate_color? }
  registration?: unknown // { stnk_valid_until?, plate_color? }
  tax?: unknown // { notice_valid_until? }
  owner?: unknown // { name? }
  njkb?: unknown // { value?, weight? }
  /** Data Potensi pusat: { njub?: "35000000.00", synced_at?: ISO string }. */
  potensi?: unknown
  /** Data administratif: { origin_upt?: label UPT asal }. */
  administrative?: unknown
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

/** Panjang maksimum label UPT asal yang diteruskan ke frontend. */
export const ORIGIN_UPT_MAX_LENGTH = 120

type LookupError = Extract<VehicleLookupResult, { status: "error" }>

function invalidPayload(detail?: string): LookupError {
  const message = detail
    ? `Response NJKB API tidak valid: ${detail}.`
    : "Response NJKB API tidak valid."
  return {
    status: "error",
    code: "NJKB_INVALID_PAYLOAD",
    httpStatus: 502,
    error: message,
    message,
  }
}

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null
}

/** Field kontainer opsional: undefined/null boleh, selain objek → payload invalid. */
function isMalformedContainer(value: unknown): boolean {
  return value !== undefined && value !== null && asRecord(value) === null
}

const DECIMAL_RUPIAH = /^(\d{1,16})(?:\.(\d{1,6}))?$/

/**
 * Parse decimal string Rupiah utuh (bukan negatif) tanpa binary floating point.
 * Contoh: "35000000.00" -> 35000000, "0.00" -> 0.
 * Ditolak (null): non-string (termasuk number), kosong, negatif, notasi
 * eksponen, pemisah ribuan, atau fraksi Rupiah non-zero.
 */
export function parseNonNegativeDecimalRupiah(raw: unknown): number | null {
  if (typeof raw !== "string") return null
  const match = raw.trim().match(DECIMAL_RUPIAH)
  if (!match) return null

  const [, whole, fraction = ""] = match
  if (fraction && /[1-9]/.test(fraction)) return null

  const integer = Number(whole)
  return Number.isSafeInteger(integer) && integer >= 0 ? integer : null
}

/**
 * Parse decimal string Rupiah positif (NJKB matched). Nilai 0 ditolak.
 * Contoh: "150000000.00" -> 150000000.
 */
export function parseDecimalRupiahToInteger(raw: unknown): number | null {
  const value = parseNonNegativeDecimalRupiah(raw)
  return value !== null && value > 0 ? value : null
}

/**
 * NJUB dari `potensi.njub`.
 * - Tidak ada / null → 0 (kompatibel dengan payload lama tanpa Data Potensi).
 * - Ada tetapi tidak valid → null; pemanggil WAJIB fail closed (502) agar NJUB
 *   yang rusak tidak diam-diam menjadi 0 dan menurunkan pajak.
 */
export function parseOptionalNjub(raw: unknown): number | null {
  if (raw === undefined || raw === null) return 0
  return parseNonNegativeDecimalRupiah(raw)
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

const ISO_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})?)?$/

/**
 * Waktu sinkronisasi dataset pusat → ISO-8601 UTC (`toISOString`) atau null.
 * Tanpa offset dianggap UTC agar deterministik. Nilai tidak valid tidak
 * menggagalkan lookup (informasi tampilan saja).
 */
export function parseSyncedAt(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const value = raw.trim()
  if (!value || value.length > 40) return null
  const match = value.match(ISO_DATE_TIME)
  if (!match) return null

  const [, year, month, day, hour, minute, second, offset] = match
  const numericYear = Number(year)
  const numericMonth = Number(month)
  const numericDay = Number(day)
  if (numericYear < 1900 || numericYear > 2100) return null
  // Validasi kalender eksplisit (parser dapat "menggeser" 2026-02-30 ke Maret).
  const daysInMonth = new Date(Date.UTC(numericYear, numericMonth, 0)).getUTCDate()
  if (numericMonth < 1 || numericMonth > 12 || numericDay < 1 || numericDay > daysInMonth) return null
  if (hour !== undefined && (Number(hour) > 23 || Number(minute) > 59 || Number(second ?? 0) > 59)) {
    return null
  }

  let normalized = value.replace(" ", "T")
  if (hour !== undefined && offset === undefined) normalized += "Z"
  const ms = Date.parse(normalized)
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null
}

/**
 * Label UPT asal: trim + rapikan whitespace, maksimum 120 karakter, hanya
 * huruf/angka/spasi dan tanda baca label. Nilai lain → null (tidak pernah
 * menggagalkan lookup; bukan alamat pemilik).
 */
export function sanitizeOriginUpt(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const value = raw.replace(/\s+/g, " ").trim()
  if (!value || value.length > ORIGIN_UPT_MAX_LENGTH) return null
  return /^[\p{L}\p{N} .,'()/&-]+$/u.test(value) ? value : null
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : null
}

/**
 * Mapping kontrak API Data Kendaraan pusat ke VehicleData.
 *
 * Mengakomodasi pemisahan status:
 * 1. `vehicle_status`: status keberadaan kendaraan di BPAD.
 * 2. `njkb_status`: status pencocokan tabel referensi NJKB.
 *
 * Kasus penting:
 * - `vehicle_status=found` + `njkb_status=matched`: Kendaraan ditemukan, NJKB ditemukan.
 * - `vehicle_status=found` + `njkb_status=not_found`: Kendaraan ditemukan, tetapi NJKB tidak tersedia (njkb=0).
 * - `vehicle_status=not_found`: Kendaraan tidak ditemukan di BPAD.
 *
 * Invarian keamanan:
 * - `nopol` payload (dinormalisasi) WAJIB sama dengan Nopol yang dicari; selain
 *   itu 502 agar data kendaraan lain tidak pernah ditampilkan.
 * - `potensi.njub` yang ada tetapi tidak valid → 502 (fail closed).
 * - Hanya field aman yang dipetakan (tanpa NIK, alamat, rangka/mesin, BPKB).
 */
export function mapApiResponseToVehicleData(
  json: unknown,
  searchedNopol: string,
): VehicleLookupResult {
  const record = asRecord(json)
  if (!record) return invalidPayload()

  const payload = record as OfficialNjkbApiResponse

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
    // Nopol sudah divalidasi endpoint; penolakan upstream = masalah upstream.
    return {
      status: "error",
      code: "NJKB_INVALID_PAYLOAD",
      httpStatus: 502,
      error: "Format NOPOL tidak valid.",
      message: "Format NOPOL tidak valid.",
    }
  }

  const expectedNopol = normalizeNopol(searchedNopol)
  const nopol = typeof payload.nopol === "string" ? normalizeNopol(payload.nopol) : ""
  if (!nopol || nopol.length < 4 || nopol !== expectedNopol) {
    return invalidPayload("nomor polisi tidak valid")
  }

  for (const container of [
    payload.vehicle,
    payload.registration,
    payload.tax,
    payload.owner,
    payload.potensi,
    payload.administrative,
  ]) {
    if (isMalformedContainer(container)) return invalidPayload("struktur data tidak valid")
  }

  const vehicle = asRecord(payload.vehicle)
  const registration = asRecord(payload.registration)
  const tax = asRecord(payload.tax)
  const owner = asRecord(payload.owner)
  const potensi = asRecord(payload.potensi)
  const administrative = asRecord(payload.administrative)

  const nama = nullableString(owner?.name)
  // Form kalkulator menggunakan klasifikasi BPAD mentah (MINIBUS, SEPEDA MOTOR, dll.).
  // `category` adalah kelompok umum seperti MOBIL PENUMPANG dan tidak cocok dengan opsi form.
  const categoryRaw = nullableString(vehicle?.category_raw)
  const jenis = categoryRaw ?? nullableString(vehicle?.category)
  const jatuhTempoStnk = parseApiDate(registration?.stnk_valid_until)
  const jatuhTempoPajak = parseApiDate(tax?.notice_valid_until)
  // Warna plat tidak pernah menggagalkan lookup: registration.plate_color utama,
  // fallback vehicle.plate_color; nilai tak dikenal/KUNING → null (frontend default putih).
  const warnaPlat =
    normalizeWarnaPlat(registration?.plate_color) ??
    normalizeWarnaPlat(vehicle?.plate_color)
  const originUpt = sanitizeOriginUpt(administrative?.origin_upt)
  const syncedAt = parseSyncedAt(potensi?.synced_at)

  // 2. Evaluasi njkb_status secara terpisah
  const njkbStatus = payload.njkb_status

  // Kasus C: reference_unavailable, conflict, ambiguous
  if (
    njkbStatus === "reference_unavailable" ||
    njkbStatus === "conflict" ||
    njkbStatus === "ambiguous"
  ) {
    return {
      status: "error",
      httpStatus: 502,
      error: SAFE_NJKB_STATUS_MESSAGES[njkbStatus],
      message: SAFE_NJKB_STATUS_MESSAGES[njkbStatus],
    }
  }

  if (njkbStatus !== "matched" && njkbStatus !== "not_found") {
    // Kasus D: status NJKB tidak dikenali
    return invalidPayload("njkb_status tidak dikenali")
  }

  // NJUB dipakai dalam rumus pajak: nilai yang ada tetapi rusak tidak boleh menjadi 0.
  const njub = parseOptionalNjub(potensi?.njub)
  if (njub === null) return invalidPayload("nilai NJUB tidak valid")

  const njkbRecord = asRecord(payload.njkb)
  const base = {
    nopol,
    nama,
    jenis,
    jatuhTempoStnk,
    jatuhTempoPajak,
    njub,
    warnaPlat,
    originUpt,
    syncedAt,
    source: "api" as const,
  }

  // Kasus A: NJKB matched (referensi NJKB ditemukan)
  if (njkbStatus === "matched") {
    if (!njkbRecord) return invalidPayload("data NJKB tidak tersedia")

    const njkb = parseDecimalRupiahToInteger(njkbRecord.value)
    const bobot = parseOfficialWeight(njkbRecord.weight)

    if (!njkb || !bobot) return invalidPayload("nilai NJKB atau bobot tidak valid")

    const vehicleData: VehicleData = { ...base, njkb, bobot, njkbStatus: "matched" }
    return { status: "found", source: "api", data: vehicleData }
  }

  // Kasus B: Kendaraan ditemukan di BPAD, tetapi referensi NJKB tidak ditemukan (not_found)
  // Ini BUKAN vehicle not_found. Data kendaraan dan pemilik tetap diteruskan dengan njkb = 0;
  // NJUB tetap diteruskan (NJKB diisi manual, NJUB tetap dihitung).
  if (isMalformedContainer(payload.njkb)) return invalidPayload("struktur data tidak valid")
  const bobot =
    parseOfficialWeight(njkbRecord?.weight) ??
    (categoryRaw && categoryRaw in BOBOT_MAP
      ? BOBOT_MAP[categoryRaw as keyof typeof BOBOT_MAP]
      : null) ??
    (jenis && jenis in BOBOT_MAP
      ? BOBOT_MAP[jenis as keyof typeof BOBOT_MAP]
      : null) ??
    1.0

  const vehicleData: VehicleData = { ...base, njkb: 0, bobot, njkbStatus: "not_found" }
  return { status: "found", source: "api", data: vehicleData }
}
