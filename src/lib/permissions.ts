/**
 * src/lib/permissions.ts — Turunan izin modul untuk UI.
 * Server tetap menjadi otoritas; fungsi ini hanya menyesuaikan tampilan.
 */

// Relatif (bukan alias "@/"): modul ini juga diimpor test Node via tsx.
import type { ModuleKey } from "../types/auth"
import type { VehicleDataSourceMode } from "../types/tax"

/** Satu-satunya sumber aktif. Mode lama hanya dipertahankan sebagai tipe. */
export const SOURCE_MODE_PRIORITY: readonly VehicleDataSourceMode[] = ["api"]

/**
 * Seluruh mode (termasuk mode lama D1/gabungan) hanya membutuhkan izin API:
 * permintaan dari UI selalu dikirim sebagai sumber API.
 */
export const SOURCE_MODE_REQUIREMENTS: Record<VehicleDataSourceMode, ModuleKey[]> = {
  d1: ["vehicle_lookup.api"],
  api: ["vehicle_lookup.api"],
  d1_then_api: ["vehicle_lookup.api"],
  api_then_d1: ["vehicle_lookup.api"],
}

export function getAllowedSourceModes(
  hasPermission: (key: ModuleKey) => boolean,
): VehicleDataSourceMode[] {
  return SOURCE_MODE_PRIORITY.filter((mode) =>
    SOURCE_MODE_REQUIREMENTS[mode].every(hasPermission),
  )
}

/**
 * Mode efektif selalu "api" bila diizinkan. Argumen mode tersimpan diterima
 * demi kompatibilitas, tetapi pilihan lama tidak lagi memengaruhi hasil.
 */
export function resolveEffectiveSourceMode(
  _storedMode: VehicleDataSourceMode | null | undefined,
  allowedModes: readonly VehicleDataSourceMode[],
): VehicleDataSourceMode | null {
  return allowedModes.includes("api") ? "api" : null
}
