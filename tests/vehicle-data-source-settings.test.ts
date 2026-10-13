import assert from "node:assert/strict"
import {
  DEFAULT_VEHICLE_DATA_SOURCE_MODE,
  VEHICLE_DATA_SOURCE_STORAGE_KEY,
  isVehicleDataSourceMode,
  readVehicleDataSourceMode,
  writeVehicleDataSourceMode,
} from "../src/hooks/use-vehicle-data-source-setting.ts"

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

console.log("Menjalankan Vehicle Data Source Settings tests...\n")

// Default selalu api_then_d1 jika storage kosong/tidak tersedia.
{
  const storage = new MemoryStorage()
  assert.equal(DEFAULT_VEHICLE_DATA_SOURCE_MODE, "api_then_d1")
  assert.equal(readVehicleDataSourceMode(storage), "api_then_d1")
  assert.equal(readVehicleDataSourceMode(undefined), "api_then_d1")
  pass("Default mode selalu api_then_d1")
}

// Pilihan lama (key v1, saat default masih D1) diabaikan → default baru berlaku.
{
  const storage = new MemoryStorage()
  storage.setItem("kalkulator-pajak.vehicle-data-source", "d1")
  assert.equal(readVehicleDataSourceMode(storage), "api_then_d1")
  pass("Preferensi key lama diabaikan; perangkat lama memakai default baru")
}

// Pilihan tersimpan dan dapat dibaca kembali setelah simulasi reload.
{
  const storage = new MemoryStorage()
  writeVehicleDataSourceMode("api", storage)
  assert.equal(storage.getItem(VEHICLE_DATA_SOURCE_STORAGE_KEY), "api")
  assert.equal(readVehicleDataSourceMode(storage), "api")

  writeVehicleDataSourceMode("d1", storage)
  assert.equal(readVehicleDataSourceMode(storage), "d1")

  writeVehicleDataSourceMode("d1_then_api", storage)
  assert.equal(readVehicleDataSourceMode(storage), "d1_then_api")

  writeVehicleDataSourceMode("api_then_d1", storage)
  assert.equal(readVehicleDataSourceMode(storage), "api_then_d1")
  pass("Pilihan user persisten di storage dan bertahan setelah reload")
}

// Nilai localStorage yang rusak/invalid kembali ke default.
{
  const storage = new MemoryStorage()
  storage.setItem(VEHICLE_DATA_SOURCE_STORAGE_KEY, "invalid-mode")
  assert.equal(readVehicleDataSourceMode(storage), "api_then_d1")
  assert.equal(isVehicleDataSourceMode("d1"), true)
  assert.equal(isVehicleDataSourceMode("api"), true)
  assert.equal(isVehicleDataSourceMode("d1_then_api"), true)
  assert.equal(isVehicleDataSourceMode("api_then_d1"), true)
  assert.equal(isVehicleDataSourceMode("invalid-mode"), false)
  pass("Invalid stored mode aman kembali ke default")
}

// Storage error tidak merusak aplikasi.
{
  const brokenStorage: Pick<Storage, "getItem" | "setItem"> = {
    getItem() {
      throw new Error("Storage blocked")
    },
    setItem() {
      throw new Error("Storage blocked")
    },
  }

  assert.equal(readVehicleDataSourceMode(brokenStorage), "api_then_d1")
  pass("Storage read failure aman kembali ke default")
}

console.log("\nSemua Vehicle Data Source Settings tests: PASS ✓\n")
