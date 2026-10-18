export type VehicleLookupSource = "d1" | "api"

/** Label tampilan sumber aktif. */
export const VEHICLE_DATA_SOURCE_LABEL = "API Data Kendaraan"
/** Keterangan asal data untuk tooltip/dialog. */
export const VEHICLE_DATA_SOURCE_DESCRIPTION = "API Data Potensi NTT"

/**
 * Hasil lookup selalu ditampilkan sebagai API Data Kendaraan. Nilai "d1"
 * lama dipetakan ke label yang sama agar UI tidak lagi menyebut Database D1.
 */
export const VEHICLE_SOURCE_LABELS: Record<VehicleLookupSource, string> = {
  d1: VEHICLE_DATA_SOURCE_LABEL,
  api: VEHICLE_DATA_SOURCE_LABEL,
}

export function getVehicleSourceLabel(
  source: VehicleLookupSource | null | undefined,
): string | null {
  return source ? VEHICLE_SOURCE_LABELS[source] : null
}

export const VEHICLE_NOT_FOUND_MESSAGE =
  "Kendaraan tidak ditemukan. Lengkapi data secara manual."

export const VEHICLE_SOURCE_ERROR_MESSAGE =
  "Sumber data kendaraan sedang mengalami error. Coba kembali atau lengkapi data secara manual."
