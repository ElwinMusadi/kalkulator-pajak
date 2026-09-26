import assert from "node:assert/strict"
import {
  getVehicleSourceLabel,
  VEHICLE_NOT_FOUND_MESSAGE,
  VEHICLE_SOURCE_ERROR_MESSAGE,
} from "../src/lib/vehicle-lookup-metadata.ts"

function pass(name: string) {
  console.log(`  ✓  ${name}`)
}

console.log("Menjalankan Vehicle Lookup Metadata tests...\n")

assert.equal(getVehicleSourceLabel("d1"), "Database D1")
assert.equal(getVehicleSourceLabel("api"), "NJKB API NTT")
assert.equal(getVehicleSourceLabel(null), null)
assert.equal(getVehicleSourceLabel(undefined), null)
pass("Metadata source dipetakan ke label UI yang benar")

assert.match(VEHICLE_NOT_FOUND_MESSAGE, /tidak ditemukan/i)
assert.doesNotMatch(VEHICLE_NOT_FOUND_MESSAGE, /error/i)
assert.match(VEHICLE_SOURCE_ERROR_MESSAGE, /error/i)
assert.doesNotMatch(VEHICLE_SOURCE_ERROR_MESSAGE, /tidak ditemukan/i)
pass("Pesan not_found dan error berbeda secara semantik")

console.log("\nSemua Vehicle Lookup Metadata tests: PASS ✓\n")
