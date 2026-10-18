import assert from "node:assert/strict"
import { KABUPATEN_GEMPA, resolveGempaEligibility } from "../src/lib/gempa-eligibility.ts"
import { calculateTax } from "../src/lib/tax-calculator.ts"
import type { TaxCalculatorInput } from "../src/types/tax.ts"

let count = 0
function eligible(originUpt: string, kabupaten: string) {
  assert.deepEqual(resolveGempaEligibility({ nopol: "EB1234AB", originUpt }), { status: "eligible", kabupaten })
  count++
}
for (const kabupaten of KABUPATEN_GEMPA) {
  eligible(kabupaten, kabupaten)
  eligible(` kabupaten ${kabupaten.toLowerCase()} `, kabupaten)
  eligible(`UPT ${kabupaten}`, kabupaten)
  eligible(`UPTD Pendapatan Daerah Wilayah Kabupaten ${kabupaten}`, kabupaten)
}
eligible("Kab. Manggarai   Timur", "Manggarai Timur")
eligible("Kabupaten Manggarai Barat", "Manggarai Barat")
eligible("KAB. MANGGARAI BARAT", "Manggarai Barat")
assert.deepEqual(resolveGempaEligibility({ nopol: "eb 1234 ab", originUpt: "SIKKA" }), { status: "eligible", kabupaten: "Sikka" })
count++
for (const nopol of ["DH1234AB", "E1234AB", "EBX1234", "EBA1", "EB", "DK1234AB"]) {
  assert.deepEqual(resolveGempaEligibility({ nopol, originUpt: "Sikka" }), { status: "not_eligible", reason: "plate_not_eb" })
  count++
}
for (const originUpt of ["Flores Timur", "Lembata", "Kota Kupang", "Kabupaten Kupang"]) {
  assert.deepEqual(resolveGempaEligibility({ nopol: "EB1234AB", originUpt }), { status: "not_eligible", reason: "origin_not_affected" })
  count++
}
for (const originUpt of ["UPT Pembantu Sikka", "Sikka/Flores Timur", "Kantor Ende Cabang A", "MANGGARAI-BARAT", "Manggarai Barat Daya", "Alamat Sikka", "Maumere", "Ruteng"]) {
  assert.deepEqual(resolveGempaEligibility({ nopol: "EB1234AB", originUpt }), { status: "unknown", reason: "origin_unrecognized" })
  count++
}
for (const originUpt of [null, undefined, "", "   "]) {
  assert.deepEqual(resolveGempaEligibility({ nopol: "EB1234AB", originUpt }), { status: "unknown", reason: "origin_missing" })
  count++
}
// Integrasi aturan dengan rumus yang sudah berlaku: diskon tunggakan 75%
// bila eligible, 50% bila tidak; manual off tetap memakai kebijakan 50%.
const input: TaxCalculatorInput = {
  njkb: 102_000_000, njub: 35_000_000, bobot: 1.085, jenisKendaraan: "PICK UP",
  jatuhTempoPajak: new Date("2025-03-01T00:00:00"),
  jatuhTempoStnk: new Date("2027-03-01T00:00:00"),
  tanggalBayar: new Date("2026-10-17T00:00:00"),
  isDomisiliGempa: false, isTembakRu: false,
}
const auto = resolveGempaEligibility({ nopol: "EB1234AB", originUpt: "Sikka" })
const aktif = calculateTax({ ...input, isDomisiliGempa: auto.status === "eligible" })
const manualOff = calculateTax(input)
assert.equal(aktif.pkbTunggakanPost2025, manualOff.pkbTunggakanPost2025 / 2)
assert.equal(aktif.pkbBerjalan, manualOff.pkbBerjalan)
assert.equal(aktif.swdklljBerjalan, manualOff.swdklljBerjalan)
assert.ok(aktif.total < manualOff.total)
// NJUB baru tidak hilang: perbandingan pajak berjalan dengan NJUB nol.
const tanpaNjub = calculateTax({ ...input, njub: 0 })
assert.ok(manualOff.pkbBerjalan > tanpaNjub.pkbBerjalan)
count += 5
console.log(`Gempa eligibility: PASS (${count} cases, exact kabupaten match; tidak menebak alamat/kecamatan)`)
