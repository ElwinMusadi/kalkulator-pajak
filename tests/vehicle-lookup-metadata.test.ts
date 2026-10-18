import assert from "node:assert/strict"
import {
  getVehicleSourceLabel,
  VEHICLE_DATA_SOURCE_DESCRIPTION,
  VEHICLE_DATA_SOURCE_LABEL,
  VEHICLE_NOT_FOUND_MESSAGE,
  VEHICLE_SOURCE_ERROR_MESSAGE,
} from "../src/lib/vehicle-lookup-metadata.ts"

function pass(name: string) {
  console.log(`  ✓  ${name}`)
}

console.log("Menjalankan Vehicle Lookup Metadata tests...\n")

assert.equal(VEHICLE_DATA_SOURCE_LABEL, "API Data Kendaraan")
assert.equal(VEHICLE_DATA_SOURCE_DESCRIPTION, "API Data Potensi NTT")
assert.equal(getVehicleSourceLabel("api"), "API Data Kendaraan")
// Metadata lama "d1" tidak lagi menampilkan Database D1.
assert.equal(getVehicleSourceLabel("d1"), "API Data Kendaraan")
assert.equal(getVehicleSourceLabel(null), null)
assert.equal(getVehicleSourceLabel(undefined), null)
for (const label of [getVehicleSourceLabel("api"), getVehicleSourceLabel("d1")]) {
  assert.doesNotMatch(label ?? "", /D1|NJKB API/)
}
pass("Label sumber selalu API Data Kendaraan, tanpa D1/NJKB API NTT")

assert.match(VEHICLE_NOT_FOUND_MESSAGE, /tidak ditemukan/i)
assert.doesNotMatch(VEHICLE_NOT_FOUND_MESSAGE, /error/i)
assert.match(VEHICLE_SOURCE_ERROR_MESSAGE, /error/i)
assert.doesNotMatch(VEHICLE_SOURCE_ERROR_MESSAGE, /tidak ditemukan/i)
pass("Pesan not_found dan error berbeda secara semantik")

console.log("\nSemua Vehicle Lookup Metadata tests: PASS ✓\n")
