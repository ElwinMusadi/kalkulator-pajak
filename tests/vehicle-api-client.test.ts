import assert from "node:assert/strict"
import {
  createVehicleLookupClient,
  fetchVehicleByNopol,
  VEHICLE_LOOKUP_MAX_ATTEMPTS,
  VEHICLE_LOOKUP_MIN_REMAINING_FOR_RETRY_MS,
  VEHICLE_LOOKUP_RETRY_DELAY_MAX_MS,
  VEHICLE_LOOKUP_RETRY_DELAY_MIN_MS,
  VEHICLE_LOOKUP_TIMEOUT_MS,
} from "../src/lib/api.ts"
import {
  ApiError,
  CLIENT_TIMEOUT_CODE,
  INVALID_RESPONSE_CODE,
  isAbortError,
  isApiError,
  isRetryableByUser,
  NETWORK_ERROR_CODE,
  readApiError,
  sanitizeCfRay,
} from "../src/lib/http.ts"

function pass(name: string) {
  console.log(`  ✓  ${name}`)
}

console.log("Menjalankan vehicle API client source query tests...\n")

function createDeterministicClock(start = 1_000_000) {
  let currentTime = start
  let timerSeq = 0
  const timers = new Map<number, { id: number; due: number; cb: () => void }>()

  return {
    now: () => currentTime,
    setTimer: (cb: () => void, ms: number) => {
      const id = ++timerSeq
      timers.set(id, { id, due: currentTime + ms, cb })
      return id
    },
    clearTimer: (id: unknown) => {
      timers.delete(id as number)
    },
    advance: async (ms: number) => {
      currentTime += ms
      const expired = Array.from(timers.values())
        .filter((t) => t.due <= currentTime)
        .sort((a, b) => a.due - b.due)
      for (const t of expired) {
        if (timers.has(t.id)) {
          timers.delete(t.id)
          t.cb()
        }
      }
      for (let i = 0; i < 5; i++) {
        await Promise.resolve()
      }
    },
    get pendingCount() {
      return timers.size
    },
  }
}

const originalFetch = globalThis.fetch

try {
  // --- Baseline Compatibility Tests ---

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

  // --- Konstanta dan Nilai Default Kontrak Jaringan ---
  {
    assert.equal(VEHICLE_LOOKUP_TIMEOUT_MS, 25000)
    assert.equal(VEHICLE_LOOKUP_MAX_ATTEMPTS, 2)
    assert.equal(VEHICLE_LOOKUP_RETRY_DELAY_MIN_MS, 400)
    assert.equal(VEHICLE_LOOKUP_RETRY_DELAY_MAX_MS, 600)
    assert.equal(VEHICLE_LOOKUP_MIN_REMAINING_FOR_RETRY_MS, 9000)
    pass("Konstanta kontrak batas waktu dan retry lookup terdefinisi tepat")
  }

  // --- Normalisasi Nopol dan Sanitasi Jaringan ---
  {
    let requestedUrl = ""
    const client = createVehicleLookupClient({
      fetch: async (input) => {
        requestedUrl = String(input)
        return new Response(null, { status: 404 })
      },
    })
    // Spasi dan karakter non-alfanumerik dibersihkan, huruf dikonversi ke kapital
    await client.fetchVehicleByNopol("  dh - 1234 . xy  ")
    const url = new URL(requestedUrl, "https://frontend.test")
    assert.equal(url.pathname.endsWith("/api/njkb/DH1234XY"), true)

    // TypeError jaringan tanpa retry menghasilkan ApiError NETWORK_ERROR ternormalisasi
    const failClient = createVehicleLookupClient({
      minRemainingForRetryMs: 999999, // Cegah retry otomatis
      fetch: async () => {
        throw new TypeError("Failed to fetch")
      },
    })
    await assert.rejects(failClient.fetchVehicleByNopol("DH1234AB"), (err: unknown) => {
      assert.ok(isApiError(err))
      assert.equal(err.status, 0)
      assert.equal(err.code, NETWORK_ERROR_CODE)
      assert.equal(err.diagnostics?.kind, "network")
      assert.equal(err.diagnostics?.edge, false)
      assert.equal(err.diagnostics?.attempts, 1)
      assert.match(err.message, /koneksi internet/i)
      return true
    })
    pass("Normalisasi nopol URL dan penanganan kegagalan TypeError jaringan")
  }

  // --- Edge Retry Sekali (502, 503, 504 Non-JSON dan TypeError) ---
  {
    // 502 HTML edge: percobaan 1 gagal 502 HTML -> retry backoff -> percobaan 2 sukses 200
    const clock1 = createDeterministicClock()
    let attempts1 = 0
    const retrySuccessClient = createVehicleLookupClient({
      ...clock1,
      retryDelayMinMs: 400,
      retryDelayMaxMs: 400,
      fetch: async () => {
        attempts1++
        if (attempts1 === 1) {
          return new Response("<html><title>502 Bad Gateway</title></html>", {
            status: 502,
            headers: { "Content-Type": "text/html" },
          })
        }
        return Response.json({ nopol: "DH1234AB", pkbPkk: 500000 })
      },
    })

    const p1 = retrySuccessClient.fetchVehicleByNopol("DH1234AB")
    await Promise.resolve()
    await Promise.resolve()
    assert.equal(attempts1, 1, "Percobaan 1 selesai dan menunggu backoff")
    await clock1.advance(400)
    const result1 = await p1
    assert.equal(attempts1, 2, "Percobaan 2 berhasil setelah backoff")
    assert.equal(result1?.nopol, "DH1234AB")
    assert.equal(clock1.pendingCount, 0, "Timer deadline/backoff bersih setelah sukses")

    // 503 HTML persisten: 2 percobaan lalu berhenti dan melempar ApiError
    const clock2 = createDeterministicClock()
    let attempts2 = 0
    const retryFailClient = createVehicleLookupClient({
      ...clock2,
      retryDelayMinMs: 400,
      retryDelayMaxMs: 400,
      fetch: async () => {
        attempts2++
        return new Response("<html>Service Unavailable</html>", {
          status: 503,
          headers: { "Content-Type": "text/html" },
        })
      },
    })

    const p2 = retryFailClient.fetchVehicleByNopol("DH1234AB")
    await Promise.resolve()
    await Promise.resolve()
    assert.equal(attempts2, 1)
    await clock2.advance(400)
    await assert.rejects(p2, (err: unknown) => {
      assert.ok(isApiError(err))
      assert.equal(err.status, 503)
      assert.equal(err.diagnostics?.edge, true)
      assert.equal(err.diagnostics?.attempts, 2)
      return true
    })
    assert.equal(attempts2, 2, "Maksimal 2 percobaan untuk edge 503 HTML")
    assert.equal(clock2.pendingCount, 0, "Timer bersih setelah 2 percobaan gagal")

    // TypeError jaringan: retry 1x dengan backoff
    const clock3 = createDeterministicClock()
    let attempts3 = 0
    const netRetryClient = createVehicleLookupClient({
      ...clock3,
      retryDelayMinMs: 400,
      retryDelayMaxMs: 400,
      fetch: async () => {
        attempts3++
        if (attempts3 === 1) throw new TypeError("Network down")
        return Response.json({ nopol: "DH1234AB" })
      },
    })
    const p3 = netRetryClient.fetchVehicleByNopol("DH1234AB")
    await Promise.resolve()
    await Promise.resolve()
    assert.equal(attempts3, 1)
    await clock3.advance(400)
    const result3 = await p3
    assert.equal(attempts3, 2)
    assert.equal(result3?.nopol, "DH1234AB")
    assert.equal(clock3.pendingCount, 0, "Timer bersih setelah retry TypeError sukses")
    pass("Edge 502/503/504 non-JSON dan TypeError di-retry tepat satu kali dengan backoff")
  }

  // --- Backend JSON Tidak Pernah Di-retry (0 Retry, 1 Percobaan) ---
  {
    // Backend JSON 502 dengan kode NJKB
    let calls502 = 0
    const json502Client = createVehicleLookupClient({
      fetch: async () => {
        calls502++
        return Response.json(
          { message: "NJKB upstream 502", code: "NJKB_GATEWAY_TIMEOUT" },
          { status: 502 },
        )
      },
    })
    await assert.rejects(json502Client.fetchVehicleByNopol("DH1234AB"), (err: unknown) => {
      assert.ok(isApiError(err))
      assert.equal(err.status, 502)
      assert.equal(err.code, "NJKB_GATEWAY_TIMEOUT")
      assert.equal(err.message, "NJKB upstream 502")
      assert.equal(err.diagnostics?.edge, false)
      assert.equal(err.diagnostics?.attempts, 1)
      return true
    })
    assert.equal(calls502, 1, "Backend JSON 502 tidak di-retry")

    // Backend JSON 500
    let calls500 = 0
    const json500Client = createVehicleLookupClient({
      fetch: async () => {
        calls500++
        return Response.json(
          { message: "Terjadi kesalahan server.", code: "SERVER_ERROR" },
          { status: 500 },
        )
      },
    })
    await assert.rejects(json500Client.fetchVehicleByNopol("DH1234AB"), (err: unknown) => {
      assert.ok(isApiError(err))
      assert.equal(err.status, 500)
      assert.equal(err.diagnostics?.attempts, 1)
      return true
    })
    assert.equal(calls500, 1, "Backend JSON 500 tidak di-retry")

    // 500 HTML (non-JSON): status 500 bukan kandidat edge retryable (hanya 502, 503, 504)
    let calls500Html = 0
    const html500Client = createVehicleLookupClient({
      fetch: async () => {
        calls500Html++
        return new Response("<html>Internal Server Error</html>", {
          status: 500,
          headers: { "Content-Type": "text/html" },
        })
      },
    })
    await assert.rejects(html500Client.fetchVehicleByNopol("DH1234AB"), (err: unknown) => {
      assert.ok(isApiError(err))
      assert.equal(err.status, 500)
      assert.equal(err.diagnostics?.attempts, 1)
      return true
    })
    assert.equal(calls500Html, 1, "500 HTML tidak di-retry")

    // 401, 403, 404, 429 tidak di-retry
    for (const status of [401, 403, 429]) {
      let callCount = 0
      const client = createVehicleLookupClient({
        fetch: async () => {
          callCount++
          return Response.json({ message: `Error ${status}`, code: `CODE_${status}` }, { status })
        },
      })
      await assert.rejects(client.fetchVehicleByNopol("DH1234AB"), (err: unknown) => {
        assert.ok(isApiError(err))
        assert.equal(err.status, status)
        assert.equal(err.diagnostics?.attempts, 1)
        return true
      })
      assert.equal(callCount, 1, `HTTP ${status} tidak di-retry`)
    }
    pass("Backend JSON 5xx, NJKB codes, 500, dan 401/403/429 tidak pernah di-retry (1 percobaan)")
  }

  // --- Abort Saat Body, Backoff, dan Deadline Timeout ---
  {
    // Abort pemanggil sebelum fetch
    {
      const controller = new AbortController()
      controller.abort()
      let fetchCalled = false
      const client = createVehicleLookupClient({
        fetch: async () => {
          fetchCalled = true
          return Response.json({ nopol: "DH1234AB" })
        },
      })
      await assert.rejects(
        client.fetchVehicleByNopol("DH1234AB", null, controller.signal),
        (err: unknown) => isAbortError(err),
      )
      assert.equal(fetchCalled, false, "Fetch tidak dipanggil jika signal sudah di-abort")
    }

    // Abort pemanggil saat backoff berlangsung
    {
      const clock = createDeterministicClock()
      const controller = new AbortController()
      let attempts = 0
      const client = createVehicleLookupClient({
        ...clock,
        retryDelayMinMs: 1000,
        retryDelayMaxMs: 1000,
        fetch: async () => {
          attempts++
          return new Response("<html>Gateway Timeout</html>", {
            status: 504,
            headers: { "Content-Type": "text/html" },
          })
        },
      })

      const p = client.fetchVehicleByNopol("DH1234AB", null, controller.signal)
      await Promise.resolve()
      await Promise.resolve()
      assert.equal(attempts, 1, "Percobaan 1 selesai dan masuk masa backoff")

      // Abort saat tidur backoff
      controller.abort()
      await assert.rejects(p, (err: unknown) => isAbortError(err))
      assert.equal(attempts, 1, "Percobaan 2 tidak dieksekusi setelah dibatalkan")
      assert.equal(clock.pendingCount, 0, "Timer backoff bersih saat caller abort")
    }

    // Abort pemanggil saat membaca body
    {
      const controller = new AbortController()
      const client = createVehicleLookupClient({
        fetch: async () => {
          const res = new Response(JSON.stringify({ nopol: "DH1234AB" }), {
            headers: { "Content-Type": "application/json" },
          })
          res.json = async () => {
            controller.abort()
            throw new DOMException("The operation was aborted.", "AbortError")
          }
          return res
        },
      })
      await assert.rejects(
        client.fetchVehicleByNopol("DH1234AB", null, controller.signal),
        (err: unknown) => isAbortError(err),
      )
    }

    // AbortError independen dari res.json() dipertahankan (bukan INVALID_RESPONSE, 1 attempt)
    {
      let attempts = 0
      const client = createVehicleLookupClient({
        fetch: async () => {
          attempts++
          const res = new Response(JSON.stringify({ nopol: "DH1234AB" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
          res.json = async () => {
            const abortErr = new Error("Stream body read was aborted.")
            abortErr.name = "AbortError"
            throw abortErr
          }
          return res
        },
      })
      await assert.rejects(
        client.fetchVehicleByNopol("DH1234AB"),
        (err: unknown) => isAbortError(err),
      )
      assert.equal(attempts, 1, "AbortError independen tidak memicu retry")
    }

    // readApiError langsung melempar ulang AbortError dari pembacaan stream body
    {
      const res = new Response("{}", {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
      res.json = async () => {
        const abortErr = new Error("Stream body aborted")
        abortErr.name = "AbortError"
        throw abortErr
      }
      await assert.rejects(readApiError(res), (err: unknown) => isAbortError(err))
    }

    // readApiError memperbarui elapsedMs setelah pembacaan body error selesai (termasuk latensi stream)
    {
      const clock = createDeterministicClock(1_000_000)
      const client = createVehicleLookupClient({
        ...clock,
        timeoutMs: 25000,
        minRemainingForRetryMs: 9000,
        fetch: async () => {
          await clock.advance(50) // latensi jaringan awal
          const res = new Response("{}", {
            status: 502,
            headers: { "Content-Type": "application/json" },
          })
          res.json = async () => {
            await clock.advance(300) // latensi pembacaan stream body error
            return { message: "Slow gateway error", code: "NJKB_SLOW_502" }
          }
          return res
        },
      })

      await assert.rejects(client.fetchVehicleByNopol("DH1234AB"), (err: unknown) => {
        assert.ok(isApiError(err))
        assert.equal(err.status, 502)
        assert.equal(err.code, "NJKB_SLOW_502")
        assert.equal(err.diagnostics?.elapsedMs, 350, "elapsedMs mencakup durasi baca body error")
        assert.equal(err.diagnostics?.attempts, 1)
        return true
      })
      assert.equal(clock.pendingCount, 0, "Timer deadline bersih setelah readApiError selesai")
    }

    // Deadline timeout: fetch menggantung melampaui timeoutMs
    {
      const clock = createDeterministicClock()
      const client = createVehicleLookupClient({
        ...clock,
        timeoutMs: 25000,
        fetch: () => new Promise(() => {}), // Request menggantung
      })

      const p = client.fetchVehicleByNopol("DH1234AB")
      await clock.advance(25000)
      await assert.rejects(p, (err: unknown) => {
        assert.ok(isApiError(err))
        assert.equal(err.status, 0)
        assert.equal(err.code, CLIENT_TIMEOUT_CODE)
        assert.equal(err.diagnostics?.kind, "timeout")
        assert.equal(err.diagnostics?.attempts, 1)
        assert.match(err.message, /terlalu lama/i)
        return true
      })
      assert.equal(clock.pendingCount, 0, "Timer deadline bersih setelah deadline timeout")
    }

    // Deadline timeout saat pembacaan body menggantung
    {
      const clock = createDeterministicClock()
      const client = createVehicleLookupClient({
        ...clock,
        timeoutMs: 25000,
        fetch: async () => {
          const res = new Response("{}", {
            headers: { "Content-Type": "application/json" },
          })
          res.json = () => new Promise(() => {}) // Body menggantung
          return res
        },
      })

      const p = client.fetchVehicleByNopol("DH1234AB")
      await Promise.resolve()
      await clock.advance(25000)
      await assert.rejects(p, (err: unknown) => {
        assert.ok(isApiError(err))
        assert.equal(err.status, 0)
        assert.equal(err.code, CLIENT_TIMEOUT_CODE)
        return true
      })
      assert.equal(clock.pendingCount, 0, "Timer deadline bersih setelah body timeout")
    }

    // Sisa waktu < minRemainingForRetryMs mencegah retry
    {
      const clock = createDeterministicClock(1_000_000)
      let calls = 0
      const client = createVehicleLookupClient({
        ...clock,
        timeoutMs: 25000,
        minRemainingForRetryMs: 9000,
        fetch: async () => {
          calls++
          // Konsumsi waktu 17000ms selama fetch (sisa waktu = 8000ms < 9000ms)
          await clock.advance(17000)
          return new Response("<html>Gateway Timeout</html>", {
            status: 504,
            headers: { "Content-Type": "text/html" },
          })
        },
      })

      await assert.rejects(client.fetchVehicleByNopol("DH1234AB"), (err: unknown) => {
        assert.ok(isApiError(err))
        assert.equal(err.status, 504)
        assert.equal(err.diagnostics?.attempts, 1)
        return true
      })
      assert.equal(calls, 1, "Tidak retry bila sisa batas waktu < minRemainingForRetryMs")
      assert.equal(clock.pendingCount, 0, "Timer deadline bersih saat sisa waktu tidak cukup")
    }
    pass("Abort saat body/backoff dan deadline CLIENT_TIMEOUT tertangani deterministik")
  }

  // --- Respons 200 Tidak Valid Aman (HTML, Array, Null, Non-JSON) ---
  {
    // 200 HTML
    const htmlClient = createVehicleLookupClient({
      fetch: async () =>
        new Response("<html>Login Captive Portal</html>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        }),
    })
    await assert.rejects(htmlClient.fetchVehicleByNopol("DH1234AB"), (err: unknown) => {
      assert.ok(isApiError(err))
      assert.equal(err.status, 200)
      assert.equal(err.code, INVALID_RESPONSE_CODE)
      assert.equal(err.diagnostics?.kind, "invalid_response")
      assert.equal(err.diagnostics?.attempts, 1)
      return true
    })

    // 200 JSON Array
    const arrayClient = createVehicleLookupClient({
      fetch: async () => Response.json([{ nopol: "DH1234AB" }], { status: 200 }),
    })
    await assert.rejects(arrayClient.fetchVehicleByNopol("DH1234AB"), (err: unknown) => {
      assert.ok(isApiError(err))
      assert.equal(err.status, 200)
      assert.equal(err.code, INVALID_RESPONSE_CODE)
      return true
    })

    // 200 JSON Null
    const nullClient = createVehicleLookupClient({
      fetch: async () =>
        new Response("null", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    })
    await assert.rejects(nullClient.fetchVehicleByNopol("DH1234AB"), (err: unknown) => {
      assert.ok(isApiError(err))
      assert.equal(err.status, 200)
      assert.equal(err.code, INVALID_RESPONSE_CODE)
      return true
    })

    // 200 Malformed JSON
    const malformedClient = createVehicleLookupClient({
      fetch: async () =>
        new Response("{ invalid-json-payload", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    })
    await assert.rejects(malformedClient.fetchVehicleByNopol("DH1234AB"), (err: unknown) => {
      assert.ok(isApiError(err))
      assert.equal(err.status, 200)
      assert.equal(err.code, INVALID_RESPONSE_CODE)
      return true
    })
    pass("Respons 200 tidak valid (HTML, array, null, malformed) menghasilkan INVALID_RESPONSE tanpa retry")
  }

  // --- Privasi dan Sanitasi CF-Ray ---
  {
    // sanitizeCfRay murni
    assert.equal(sanitizeCfRay("1234567890abcdef-sin"), "1234567890abcdef-SIN")
    assert.equal(sanitizeCfRay("ABCDEF0123456789-cgk"), "abcdef0123456789-CGK")
    assert.equal(sanitizeCfRay("  0123456789abcdef  "), "0123456789abcdef")
    assert.equal(sanitizeCfRay("12345"), undefined)
    assert.equal(sanitizeCfRay("1234567890abcdef-toolong"), undefined)
    assert.equal(sanitizeCfRay("user@domain.com"), undefined)
    assert.equal(sanitizeCfRay("<script>alert(1)</script>"), undefined)
    assert.equal(sanitizeCfRay(null), undefined)
    assert.equal(sanitizeCfRay(undefined), undefined)

    // Ray valid masuk ke diagnostics ApiError
    const validRayClient = createVehicleLookupClient({
      minRemainingForRetryMs: 999999,
      fetch: async () =>
        new Response("<html>Gateway Timeout</html>", {
          status: 504,
          headers: {
            "Content-Type": "text/html",
            "cf-ray": "1234567890abcdef-sin",
          },
        }),
    })
    await assert.rejects(validRayClient.fetchVehicleByNopol("DH1234AB"), (err: unknown) => {
      assert.ok(isApiError(err))
      assert.equal(err.diagnostics?.rayId, "1234567890abcdef-SIN")
      return true
    })

    // Ray tidak valid / mencurigakan dibuang dari diagnostics
    const invalidRayClient = createVehicleLookupClient({
      minRemainingForRetryMs: 999999,
      fetch: async () =>
        new Response("<html>Gateway Timeout</html>", {
          status: 504,
          headers: {
            "Content-Type": "text/html",
            "cf-ray": "malicious-header-attempting-pii",
          },
        }),
    })
    await assert.rejects(invalidRayClient.fetchVehicleByNopol("DH1234AB"), (err: unknown) => {
      assert.ok(isApiError(err))
      assert.equal(err.diagnostics?.rayId, undefined)
      return true
    })
    pass("CF-Ray tersanitasi aman dan membuang header tidak valid untuk melindungi privasi")
  }

  // --- Matriks Parameterized: Edge Retry 2x, JSON & 404 1x, dan Timer Dibersihkan ---
  {
    // 1. ALL 502, 503, 504 non-JSON HTML: pertama gagal -> retry -> kedua 200 sukses (total 2 attempts)
    for (const status of [502, 503, 504] as const) {
      const clock = createDeterministicClock()
      let attempts = 0
      const client = createVehicleLookupClient({
        ...clock,
        retryDelayMinMs: 400,
        retryDelayMaxMs: 400,
        fetch: async () => {
          attempts++
          if (attempts === 1) {
            return new Response(`<html><title>${status} Error</title></html>`, {
              status,
              headers: { "Content-Type": "text/html" },
            })
          }
          return Response.json({ nopol: "DH1234AB", pkbPkk: 500000 })
        },
      })

      const p = client.fetchVehicleByNopol("DH1234AB")
      await Promise.resolve()
      await Promise.resolve()
      assert.equal(attempts, 1)
      await clock.advance(400)
      const res = await p
      assert.equal(attempts, 2, `Edge ${status} HTML memicu tepat 2 percobaan`)
      assert.equal(res?.nopol, "DH1234AB")
      assert.equal(clock.pendingCount, 0, `Timer deadline/backoff bersih setelah selesai (${status})`)
    }

    // 2. JSON error DENGAN kode: 500, 502, 503, 504 tidak pernah di-retry (1 call)
    for (const status of [500, 502, 503, 504] as const) {
      const clock = createDeterministicClock()
      let calls = 0
      const client = createVehicleLookupClient({
        ...clock,
        fetch: async () => {
          calls++
          return Response.json(
            { message: `Error ${status}`, code: `CODE_${status}` },
            { status },
          )
        },
      })
      await assert.rejects(client.fetchVehicleByNopol("DH1234AB"), (err: unknown) => {
        assert.ok(isApiError(err))
        assert.equal(err.status, status)
        assert.equal(err.code, `CODE_${status}`)
        assert.equal(err.diagnostics?.edge, false)
        assert.equal(err.diagnostics?.attempts, 1)
        return true
      })
      assert.equal(calls, 1, `JSON dengan kode status ${status} tepat 1 panggilan`)
      assert.equal(clock.pendingCount, 0, `Timer bersih setelah error JSON dengan kode (${status})`)
    }

    // 3. JSON error TANPA kode: 500, 502, 503, 504 tidak pernah di-retry (1 call)
    for (const status of [500, 502, 503, 504] as const) {
      const clock = createDeterministicClock()
      let calls = 0
      const client = createVehicleLookupClient({
        ...clock,
        fetch: async () => {
          calls++
          return Response.json(
            { message: `Error tanpa kode ${status}` },
            { status },
          )
        },
      })
      await assert.rejects(client.fetchVehicleByNopol("DH1234AB"), (err: unknown) => {
        assert.ok(isApiError(err))
        assert.equal(err.status, status)
        assert.equal(err.code, undefined)
        assert.equal(err.diagnostics?.edge, false)
        assert.equal(err.diagnostics?.attempts, 1)
        return true
      })
      assert.equal(calls, 1, `JSON tanpa kode status ${status} tepat 1 panggilan`)
      assert.equal(clock.pendingCount, 0, `Timer bersih setelah error JSON tanpa kode (${status})`)
    }

    // 4. JSON-typed malformed body: 502, 503, 504 dengan Content-Type JSON tetapi syntax rusak (1 call, 0 retry)
    for (const status of [502, 503, 504] as const) {
      const clock = createDeterministicClock()
      let calls = 0
      const client = createVehicleLookupClient({
        ...clock,
        fetch: async () => {
          calls++
          return new Response("{ broken json body", {
            status,
            headers: { "Content-Type": "application/json" },
          })
        },
      })
      await assert.rejects(client.fetchVehicleByNopol("DH1234AB"), (err: unknown) => {
        assert.ok(isApiError(err))
        assert.equal(err.status, status)
        assert.equal(err.diagnostics?.edge, false, `JSON rusak tetap edge=false (${status})`)
        assert.equal(err.diagnostics?.attempts, 1)
        return true
      })
      assert.equal(calls, 1, `JSON-typed rusak status ${status} tepat 1 panggilan`)
      assert.equal(clock.pendingCount, 0, `Timer bersih setelah error JSON rusak (${status})`)
    }

    // 5. 404 returns null: tepat 1 call, timer dibersihkan
    {
      const clock = createDeterministicClock()
      let calls = 0
      const client = createVehicleLookupClient({
        ...clock,
        fetch: async () => {
          calls++
          return new Response(null, { status: 404 })
        },
      })
      const result = await client.fetchVehicleByNopol("DH1234AB")
      assert.equal(result, null)
      assert.equal(calls, 1, "404 menghasilkan null dalam 1 panggilan tanpa retry")
      assert.equal(clock.pendingCount, 0, "Timer deadline bersih saat 404")
    }

    pass("Matriks parameterized: 502/503/504 HTML retry 2x, JSON error (dengan/tanpa kode, malformed) 1x, 404 null 1x, seluruh timer bersih")
  }

  // --- Helper isRetryableByUser ---
  {
    assert.equal(isRetryableByUser(new ApiError("msg", 0)), true)
    assert.equal(isRetryableByUser(new ApiError("msg", 408)), true)
    assert.equal(isRetryableByUser(new ApiError("msg", 429)), true)
    assert.equal(isRetryableByUser(new ApiError("msg", 500)), true)
    assert.equal(isRetryableByUser(new ApiError("msg", 502)), true)
    assert.equal(isRetryableByUser(new ApiError("msg", 504)), true)
    assert.equal(isRetryableByUser(new ApiError("msg", 200, INVALID_RESPONSE_CODE)), true)

    assert.equal(isRetryableByUser(new ApiError("msg", 400)), false)
    assert.equal(isRetryableByUser(new ApiError("msg", 401)), false)
    assert.equal(isRetryableByUser(new ApiError("msg", 403)), false)
    assert.equal(isRetryableByUser(new ApiError("msg", 404)), false)
    assert.equal(isRetryableByUser(new ApiError("msg", 409)), false)
    assert.equal(isRetryableByUser(new Error("bukan ApiError")), false)
    pass("isRetryableByUser mengidentifikasi error sementara vs deterministik dengan tepat")
  }
} finally {
  globalThis.fetch = originalFetch
}

console.log("\nSemua vehicle API client source query tests: PASS ✓\n")
