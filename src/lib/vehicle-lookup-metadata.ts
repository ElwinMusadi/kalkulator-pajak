export type VehicleLookupSource = "d1" | "api"

export const VEHICLE_SOURCE_LABELS: Record<VehicleLookupSource, string> = {
  d1: "Database D1",
  api: "NJKB API NTT",
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
