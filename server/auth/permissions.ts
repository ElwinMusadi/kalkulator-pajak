import { MODULE_KEYS, type AuthUser, type ModuleKey, type UserRole } from "../../src/types/auth.ts"
import type { VehicleDataSourceMode } from "../../src/types/tax.ts"

/**
 * Modul lama yang masih mungkin tersimpan di user_permissions sebelum
 * migration 0004 diterapkan. CHECK constraint tabel tetap mengizinkannya.
 * - vehicle_lookup.d1 → dibaca sebagai vehicle_lookup.api (mempertahankan akses
 *   lookup yang sudah ada; tidak pernah menambah calculator).
 * - vehicle_source.settings → dibuang (tidak pernah memberi akses API).
 */
const LEGACY_MODULE_ALIASES: Readonly<Record<string, ModuleKey>> = {
  "vehicle_lookup.d1": "vehicle_lookup.api",
}

/** Admin selalu menerima seluruh modul; petugas hanya modul tersimpan (alias lama dipetakan). */
export function effectivePermissions(role: UserRole, stored: readonly string[]): ModuleKey[] {
  if (role === "admin") return [...MODULE_KEYS]
  const set = new Set(stored.map((key) => LEGACY_MODULE_ALIASES[key] ?? key))
  return MODULE_KEYS.filter((key) => set.has(key))
}

export function hasModules(user: AuthUser, modules: readonly ModuleKey[]): boolean {
  if (user.role === "admin") return true
  return modules.every((module) => user.permissions.includes(module))
}

/** Modul wajib untuk GET /api/njkb/:nopol (API Data Kendaraan pusat). */
export const VEHICLE_LOOKUP_REQUIRED_MODULES: readonly ModuleKey[] = Object.freeze([
  "calculator",
  "vehicle_lookup.api",
])

export function requireApiLookupModules(): ModuleKey[] {
  return [...VEHICLE_LOOKUP_REQUIRED_MODULES]
}

/**
 * @deprecated Sumber data tidak lagi dipilih client; argumen diabaikan dan
 * selalu mengembalikan calculator + vehicle_lookup.api.
 */
export function requiredModulesForVehicleSource(_mode?: VehicleDataSourceMode | string): ModuleKey[] {
  return requireApiLookupModules()
}
