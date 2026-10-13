import { MODULE_KEYS, type AuthUser, type ModuleKey, type UserRole } from "../../src/types/auth.ts"
import type { VehicleDataSourceMode } from "../../src/types/tax.ts"

/** Admin selalu menerima seluruh modul; petugas hanya modul tersimpan. */
export function effectivePermissions(role: UserRole, stored: readonly string[]): ModuleKey[] {
  if (role === "admin") return [...MODULE_KEYS]
  const set = new Set(stored)
  return MODULE_KEYS.filter((key) => set.has(key))
}

export function hasModules(user: AuthUser, modules: readonly ModuleKey[]): boolean {
  if (user.role === "admin") return true
  return modules.every((module) => user.permissions.includes(module))
}

/** Modul yang wajib dimiliki untuk lookup NJKB per sumber data. */
export function requiredModulesForVehicleSource(mode: VehicleDataSourceMode): ModuleKey[] {
  switch (mode) {
    case "d1":
      return ["calculator", "vehicle_lookup.d1"]
    case "api":
      return ["calculator", "vehicle_lookup.api"]
    case "d1_then_api":
    case "api_then_d1":
      return ["calculator", "vehicle_lookup.d1", "vehicle_lookup.api"]
  }
}
