/**
 * src/lib/permissions.ts — Turunan izin modul untuk UI.
 * Server tetap menjadi otoritas; fungsi ini hanya menyesuaikan tampilan.
 */

import type { ModuleKey } from "@/types/auth"
import type { VehicleDataSourceMode } from "@/types/tax"

/** Urutan prioritas fallback bila mode tersimpan tidak diizinkan. */
export const SOURCE_MODE_PRIORITY: readonly VehicleDataSourceMode[] = [
  "d1_then_api",
  "d1",
  "api",
]

export const SOURCE_MODE_REQUIREMENTS: Record<VehicleDataSourceMode, ModuleKey[]> = {
  d1: ["vehicle_lookup.d1"],
  api: ["vehicle_lookup.api"],
  d1_then_api: ["vehicle_lookup.d1", "vehicle_lookup.api"],
}

export function getAllowedSourceModes(
  hasPermission: (key: ModuleKey) => boolean,
): VehicleDataSourceMode[] {
  return SOURCE_MODE_PRIORITY.filter((mode) =>
    SOURCE_MODE_REQUIREMENTS[mode].every(hasPermission),
  )
}

/** Mode tersimpan bila diizinkan, selain itu mode pertama yang diizinkan. */
export function resolveEffectiveSourceMode(
  storedMode: VehicleDataSourceMode,
  allowedModes: readonly VehicleDataSourceMode[],
): VehicleDataSourceMode | null {
  if (allowedModes.includes(storedMode)) return storedMode
  return allowedModes[0] ?? null
}
