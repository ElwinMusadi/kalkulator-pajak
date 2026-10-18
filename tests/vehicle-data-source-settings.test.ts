import assert from "node:assert/strict"
import {
  ACTIVE_VEHICLE_DATA_SOURCE_MODE,
  DEFAULT_VEHICLE_DATA_SOURCE_MODE,
  VEHICLE_DATA_SOURCE_STORAGE_KEY,
  isVehicleDataSourceMode,
  readVehicleDataSourceMode,
} from "../src/hooks/use-vehicle-data-source-setting.ts"
import {
  SOURCE_MODE_PRIORITY,
  SOURCE_MODE_REQUIREMENTS,
  getAllowedSourceModes,
  resolveEffectiveSourceMode,
} from "../src/lib/permissions.ts"
import { MODULE_KEYS, type ModuleKey } from "../src/types/auth.ts"
import { VEHICLE_DATA_SOURCE_MODES } from "../src/types/tax.ts"

class MemoryStorage implements Pick<Storage, "getItem" | "setItem"> {
  private values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

function pass(name: string) {
  console.log(`  ✓  ${name}`)
}

const can = (...keys: string[]) => (key: ModuleKey) => keys.includes(key)

console.log("Menjalankan Vehicle Data Source (API tunggal) tests...\n")

// Default sumber data adalah API.
{
  assert.equal(DEFAULT_VEHICLE_DATA_SOURCE_MODE, "api")
  assert.equal(ACTIVE_VEHICLE_DATA_SOURCE_MODE, "api")
  assert.equal(readVehicleDataSourceMode(new MemoryStorage()), "api")
  assert.equal(readVehicleDataSourceMode(undefined), "api")
  pass("Default dan mode aktif selalu api")
}

// Pilihan lama yang tersimpan di setiap key (v1/v2) diabaikan.
{
  for (const key of [
    VEHICLE_DATA_SOURCE_STORAGE_KEY,
    "kalkulator-pajak.vehicle-data-source",
  ]) {
    for (const mode of [...VEHICLE_DATA_SOURCE_MODES, "invalid-mode"]) {
      const storage = new MemoryStorage()
      storage.setItem(key, mode)
      assert.equal(readVehicleDataSourceMode(storage), "api", `${key}=${mode}`)
    }
  }
  pass("Preferensi tersimpan (d1, d1_then_api, api_then_d1, invalid) diabaikan → api")
}

// Storage error tidak merusak aplikasi.
{
  const brokenStorage: Pick<Storage, "getItem"> = {
    getItem() {
      throw new Error("Storage blocked")
    },
  }
  assert.equal(readVehicleDataSourceMode(brokenStorage), "api")
  pass("Storage diblokir tetap api")
}

// Validasi tipe mode lama tetap tersedia untuk kompatibilitas.
{
  for (const mode of VEHICLE_DATA_SOURCE_MODES) {
    assert.equal(isVehicleDataSourceMode(mode), true)
  }
  assert.equal(isVehicleDataSourceMode("invalid-mode"), false)
  pass("isVehicleDataSourceMode tetap mengenali tipe kompatibilitas")
}

// Prioritas mode hanya API; seluruh mode lama hanya membutuhkan izin API.
{
  assert.deepEqual([...SOURCE_MODE_PRIORITY], ["api"])
  for (const mode of VEHICLE_DATA_SOURCE_MODES) {
    assert.deepEqual(SOURCE_MODE_REQUIREMENTS[mode], ["vehicle_lookup.api"])
  }
  for (const keys of Object.values(SOURCE_MODE_REQUIREMENTS)) {
    for (const key of keys) assert.ok(MODULE_KEYS.includes(key))
  }
  pass("SOURCE_MODE_PRIORITY = ['api']; mode lama memerlukan vehicle_lookup.api")
}

// User dengan izin API → api, apa pun mode tersimpan.
{
  const allowed = getAllowedSourceModes(can("calculator", "vehicle_lookup.api"))
  assert.deepEqual(allowed, ["api"])
  for (const stored of [...VEHICLE_DATA_SOURCE_MODES, null, undefined]) {
    assert.equal(resolveEffectiveSourceMode(stored, allowed), "api")
  }
  pass("Izin API: mode efektif api untuk setiap mode tersimpan")
}

// User tanpa izin API → lookup nonaktif; izin D1/settings lama tidak memberi akses.
{
  const legacy = can("calculator", "vehicle_lookup.d1", "vehicle_source.settings")
  const allowed = getAllowedSourceModes(legacy)
  assert.deepEqual(allowed, [])
  for (const stored of [...VEHICLE_DATA_SOURCE_MODES, null]) {
    assert.equal(resolveEffectiveSourceMode(stored, allowed), null)
  }
  assert.deepEqual(getAllowedSourceModes(can("calculator")), [])
  pass("Tanpa vehicle_lookup.api: lookup nonaktif, izin D1 lama tidak berlaku")
}

console.log("\nSemua Vehicle Data Source (API tunggal) tests: PASS ✓\n")
