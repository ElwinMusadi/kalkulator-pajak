// Relatif (bukan alias "@/"): modul ini juga diimpor test Node via tsx.
import {
  DEFAULT_VEHICLE_DATA_SOURCE_MODE,
  VEHICLE_DATA_SOURCE_MODES,
  type VehicleDataSourceMode,
} from "../types/tax"

/**
 * Kompatibilitas: pemilihan sumber data sudah dihapus. Pencarian Nopol selalu
 * memakai API Data Kendaraan. Ekspor dipertahankan agar import lama tetap
 * valid; pilihan tersimpan di perangkat (key v1/v2) diabaikan sepenuhnya.
 */
export { DEFAULT_VEHICLE_DATA_SOURCE_MODE }

/** Key preferensi lama; hanya disimpan untuk referensi/test, tidak dibaca. */
export const VEHICLE_DATA_SOURCE_STORAGE_KEY =
  "kalkulator-pajak.vehicle-data-source.v2"

export const ACTIVE_VEHICLE_DATA_SOURCE_MODE = "api" as const satisfies VehicleDataSourceMode

export function isVehicleDataSourceMode(
  value: unknown,
): value is VehicleDataSourceMode {
  return (
    typeof value === "string" &&
    VEHICLE_DATA_SOURCE_MODES.includes(value as VehicleDataSourceMode)
  )
}

/** Selalu "api"; storage sengaja tidak dibaca. */
export function readVehicleDataSourceMode(
  _storage?: Pick<Storage, "getItem">,
): VehicleDataSourceMode {
  return ACTIVE_VEHICLE_DATA_SOURCE_MODE
}

/** Hook kompatibilitas tanpa setter: mode selalu "api". */
export function useVehicleDataSourceSetting(): { mode: VehicleDataSourceMode } {
  return { mode: ACTIVE_VEHICLE_DATA_SOURCE_MODE }
}
