import assert from "node:assert/strict"
import { fetchVehicleByNopol } from "../src/lib/api.ts"

function pass(name: string) {
  console.log(`  ✓  ${name}`)
}

console.log("Menjalankan vehicle API client source query tests...\n")

const originalFetch = globalThis.fetch

try {
  for (const source of ["d1", "api", "d1_then_api", "api_then_d1"] as const) {
    let requestedUrl = ""
    globalThis.fetch = async (input) => {
      requestedUrl = String(input)
      return new Response(null, { status: 404 })
    }

    const result = await fetchVehicleByNopol("dh 2506 ka", source)
    assert.equal(result, null)

    const url = new URL(requestedUrl, "https://frontend.test")
    assert.equal(url.pathname.endsWith("/api/njkb/DH2506KA"), true)
    assert.equal(url.searchParams.get("source"), source)
  }

  pass("fetchVehicleByNopol mengirim query source untuk keempat mode")

  // Default function argument harus api_then_d1.
  {
    let requestedUrl = ""
    globalThis.fetch = async (input) => {
      requestedUrl = String(input)
      return new Response(null, { status: 404 })
    }

    await fetchVehicleByNopol("DH2506KA")
    const url = new URL(requestedUrl, "https://frontend.test")
    assert.equal(url.searchParams.get("source"), "api_then_d1")
    pass("fetchVehicleByNopol default source adalah api_then_d1")
  }
} finally {
  globalThis.fetch = originalFetch
}

console.log("\nSemua vehicle API client source query tests: PASS ✓\n")
