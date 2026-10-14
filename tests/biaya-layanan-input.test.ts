import assert from "node:assert/strict"
import {
  BIAYA_LAYANAN_INPUT_MAX_LENGTH,
  formatBiayaLayananInput,
  parseBiayaLayananInput,
} from "../src/lib/biaya-layanan-input.ts"

console.log("Menjalankan Biaya Layanan Input regressions...")

const accepted: Array<[string, number, string]> = [
  ["0", 0, "0"],
  ["000", 0, "0"],
  ["50000", 50000, "50.000"],
  ["001250000", 1250000, "1.250.000"],
  ["1.250.000", 1250000, "1.250.000"],
  ["Rp25.000,00", 25000, "25.000"],
  [" Rp 25.000,00 ", 25000, "25.000"],
  ["rp 25000", 25000, "25.000"],
  ["25000,00", 25000, "25.000"],
  ["Rp 0,00", 0, "0"],
  ["100000000", 100000000, "100.000.000"],
  ["Rp 100.000.000,00", 100000000, "100.000.000"],
]
for (const [raw, value, formatted] of accepted) {
  assert.deepEqual(parseBiayaLayananInput(raw), { status: "valid", value }, raw)
  assert.equal(formatBiayaLayananInput(raw), formatted, raw)
  assert.deepEqual(parseBiayaLayananInput(formatted), { status: "valid", value })
}
for (const raw of ["", " \t\n"]) {
  assert.deepEqual(parseBiayaLayananInput(raw), { status: "empty", value: 0 })
  assert.equal(formatBiayaLayananInput(raw), "")
}
console.log("  PASS: raw digits, grouped id-ID, Rp prefix, ,00, zero, empty, max")

// Prior strip-non-digits behavior must never reinterpret these as positive fees.
const rejected = [
  "-10.000", "Rp -10.000", "-0", "+10000", "(10.000)",
  "12a.b3,5", "biaya25000", "IDR 25000", "Rp", "Rp Rp 25000",
  "25.000,01", "25000,5", "25000,0", "1.25", "25,000", "1,250,000",
  "1.250.00", "12.34.000", "1..250.000", "25 000", "1e5", "Infinity", "NaN",
  "100000001", "Rp 100.000.001,00", "9007199254740992",
  "123456789012345678901234567890", "0".repeat(65),
]
for (const raw of rejected) {
  const result = parseBiayaLayananInput(raw)
  assert.equal(result.status, "invalid", raw)
  if (result.status === "invalid") assert.ok(result.error.length > 0)
  assert.equal(formatBiayaLayananInput(raw), raw, "Invalid raw must remain visible: " + raw)
}
assert.equal(BIAYA_LAYANAN_INPUT_MAX_LENGTH, 64)
assert.equal(parseBiayaLayananInput("1".repeat(64)).status, "invalid")
assert.equal(parseBiayaLayananInput("0".repeat(64)).status, "valid")
console.log("  PASS: negatives, letters, decimals, grouping, overflow rejected; no truncation")
console.log(`Biaya Layanan Input: PASS (${accepted.length + rejected.length + 5} cases)`)
