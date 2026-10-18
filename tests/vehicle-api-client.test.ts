import assert from "node:assert/strict"
import { fetchVehicleByNopol } from "../src/lib/api.ts"

function pass(name: string) {
  console.log(`  ✓  ${name}`)
}

console.log("Menjalankan vehicle API client source query tests...\n")

const originalFetch = globalThis.fetch

try {
  // Argumen source lama tetap diterima, tetapi request selalu source=api.
  for (const source of ["d1", "api", "d1_then_api", "api_then_d1", undefined, null] as const) {
    let requestedUrl = ""
    let requestInit: RequestInit | undefined
    globalThis.fetch = async (input, init) => {
      requestedUrl = String(input)
      requestInit = init
      return new Response(null, { status: 404 })
    }

    const result = await fetchVehicleByNopol("dh 2506 ka", source)
    assert.equal(result, null)

    const url = new URL(requestedUrl, "https://frontend.test")
    assert.equal(url.pathname.endsWith("/api/njkb/DH2506KA"), true)
    assert.equal(url.searchParams.get("source"), "api", `source=${String(source)}`)
    assert.equal(requestInit?.credentials, "same-origin")
    assert.equal(requestInit?.cache, "no-store")
  }
  pass("fetchVehicleByNopol selalu mengirim source=api (mode lama diabaikan)")

  // Nopol pendek tidak memicu request.
  {
    let called = false
    globalThis.fetch = async () => {
      called = true
      return new Response(null, { status: 404 })
    }
    assert.equal(await fetchVehicleByNopol("EB1"), null)
    assert.equal(called, false)
    pass("Nopol < 4 karakter tidak memicu request")
  }

  // 200 diteruskan apa adanya, termasuk originUpt/syncedAt.
  {
    globalThis.fetch = async () =>
      Response.json({ nopol: "EB1234AB", originUpt: "UPT Sikka", syncedAt: "2026-10-01T00:00:00Z" })
    const data = await fetchVehicleByNopol("EB1234AB", "d1")
    assert.equal(data?.originUpt, "UPT Sikka")
    assert.equal(data?.syncedAt, "2026-10-01T00:00:00Z")
    pass("Respons 200 meneruskan originUpt dan syncedAt")
  }

  // 403 dilempar sebagai ApiError berstatus 403 dengan pesan server.
  {
    globalThis.fetch = async () =>
      Response.json({ message: "Tidak diizinkan.", code: "FORBIDDEN" }, { status: 403 })
    await assert.rejects(fetchVehicleByNopol("EB1234AB"), (error: unknown) => {
      const e = error as { status?: number; message?: string }
      return e.status === 403 && e.message === "Tidak diizinkan."
    })
    pass("403 dilempar dengan status dan pesan server")
  }
} finally {
  globalThis.fetch = originalFetch
}

console.log("\nSemua vehicle API client source query tests: PASS ✓\n")
