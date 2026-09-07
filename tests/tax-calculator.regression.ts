import assert from "node:assert/strict"
import { calculateTax } from "../src/lib/tax-calculator.ts"

// Regresi DH1977HL dari laporan perhitungan:
// - NJKB Rp96.000.000, bobot 1,05
// - Jatuh tempo pajak 22/10/2024
// - Pembayaran 03/09/2026
// - Tunggakan tahun pajak: 2024 (tarif 1,5%) + 2025 (tarif 1,2%)
const result = calculateTax({
  njkb: 96_000_000,
  bobot: 1.05,
  jenisKendaraan: "MINIBUS",
  jatuhTempoPajak: new Date("2024-10-22T00:00:00"),
  jatuhTempoStnk: new Date("2025-10-22T00:00:00"),
  tanggalBayar: new Date("2026-09-03T00:00:00"),
  isDomisiliGempa: false,
  isTembakRu: false,
})

assert.equal(result.tahunTunggakan, 2)
assert.equal(result.pkbTunggakan, 1_360_800)
assert.equal(result.pkbBerjalan, 1_209_600)
assert.equal(result.opsenBerjalan, 798_336)
assert.equal(result.opsenTunggakan, 399_168)
// Seluruh denda SWDKLLJ tunggakan dibebaskan melalui Tax Amnesty.
assert.equal(result.dendaSwdkllj, 0)
assert.equal(result.total, 4_496_904)

console.log("Tax calculator regression: PASS")
