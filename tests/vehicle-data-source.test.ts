import assert from "node:assert/strict"
import {
  ApiVehicleDataSource,
  D1VehicleDataSource,
  VehicleDataResolver,
  mapApiResponseToVehicleData,
  normalizeNopol,
  parseDecimalRupiahToInteger,
  parseOfficialWeight,
  parseRetryAfterSeconds,
  discardResponseBody,
  isValidNjkbBaseUrl,
  sanitizeTimeoutMs,
  type D1DatabaseLike,
  type VehicleRow,
} from "../src/services/vehicle-data/index.ts"

const API_CONFIG = {
  baseUrl: "https://api.uptdpenda-kupang.web.id",
  accessClientId: "test-client.access",
  accessClientSecret: "test-secret",
}

const officialMatchedResponse = {
  status: "vehicle_found",
  vehicle_status: "found",
  njkb_status: "matched",
  nopol: "DH0001XX",
  vehicle: { category: "MOBIL PENUMPANG", category_raw: "MINIBUS" },
  registration: { stnk_valid_until: "2031-12-31" },
  tax: { notice_valid_until: "2030-12-31" },
  owner: { name: "PEMILIK CONTOH" },
  njkb: { value: "150000000.00", weight: "1.050000" },
}

const d1Row: VehicleRow = {
  nopol: "DH2506KA",
  nama: "D1 OWNER",
  jenis: "SEPEDA MOTOR",
  jatuh_tempo_stnk: "2027-09-13",
  jatuh_tempo_pajak: "2026-09-13",
  njkb: 11_500_000,
  njub: 0,
  bobot: 1,
}

function mockDb(
  rows: Record<string, VehicleRow | null> = {},
  throwError = false,
): D1DatabaseLike {
  return {
    prepare() {
      return {
        bind(...values: unknown[]) {
          return {
            async first<T>(): Promise<T | null> {
              if (throwError) throw new Error("D1 failure")
              return (rows[String(values[0])] ?? null) as T | null
            },
          }
        },
      }
    },
  }
}

function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  })
}

function pass(name: string) {
  console.log(`  ✓  ${name}`)
}

console.log("Menjalankan Phase 7 NJKB API contract & source tests...\n")

// 1. Normalisasi dan decimal parsing resmi.
assert.equal(normalizeNopol("dh-0001 xx"), "DH0001XX")
assert.equal(parseDecimalRupiahToInteger("150000000.00"), 150_000_000)
assert.equal(parseDecimalRupiahToInteger("150000000.50"), null)
assert.equal(parseDecimalRupiahToInteger(150000000), null)
assert.equal(parseOfficialWeight("1.050000"), 1.05)
assert.equal(parseOfficialWeight(1.05), null)
assert.equal(parseRetryAfterSeconds("30"), 30)
assert.equal(parseRetryAfterSeconds("0"), null)
assert.equal(parseRetryAfterSeconds(null), null)
pass("Normalisasi Nopol, decimal string parsing, dan Retry-After helper aman")

// 2. Point 1 Audit: vehicle_status dan njkb_status diperlakukan terpisah
{
  // A. vehicle_status=found + njkb_status=matched -> found dengan NJKB > 0
  const matched = mapApiResponseToVehicleData(officialMatchedResponse, "DH0001XX")
  assert.equal(matched.status, "found")
  if (matched.status === "found") {
    assert.equal(matched.source, "api")
    assert.equal(matched.data.njkb, 150_000_000)
    assert.equal(matched.data.bobot, 1.05)
    assert.equal(matched.data.njkbStatus, "matched")
    assert.equal(matched.data.nama, "PEMILIK CONTOH")
    assert.equal(
      matched.data.jenis,
      "MINIBUS",
      "Mapping response matched harus memprioritaskan category_raw",
    )
  }

  // B. vehicle_status=found + njkb_status=not_found -> KENDARAAN DITEMUKAN, NJKB=0 (bukan vehicle not_found!)
  const vehicleFoundNjkbNotFound = mapApiResponseToVehicleData(
    {
      ...officialMatchedResponse,
      vehicle_status: "found",
      njkb_status: "not_found",
      njkb: null,
    },
    "DH0001XX",
  )
  assert.equal(
    vehicleFoundNjkbNotFound.status,
    "found",
    "vehicle_status=found + njkb_status=not_found HARUS mengembalikan status found",
  )
  if (vehicleFoundNjkbNotFound.status === "found") {
    assert.equal(vehicleFoundNjkbNotFound.source, "api")
    assert.equal(
      vehicleFoundNjkbNotFound.data.njkb,
      0,
      "NJKB bernilai 0 karena referensi tidak ditemukan",
    )
    assert.equal(vehicleFoundNjkbNotFound.data.njkbStatus, "not_found")
    assert.equal(
      vehicleFoundNjkbNotFound.data.nama,
      "PEMILIK CONTOH",
      "Nama pemilik tetap diisi dari data kendaraan",
    )
    assert.equal(
      vehicleFoundNjkbNotFound.data.jenis,
      "MINIBUS",
      "Jenis harus memakai category_raw agar cocok dengan opsi form",
    )
    assert.equal(vehicleFoundNjkbNotFound.data.jatuhTempoStnk, "2031-12-31")
    assert.equal(vehicleFoundNjkbNotFound.data.jatuhTempoPajak, "2030-12-31")
    assert.equal(vehicleFoundNjkbNotFound.data.bobot, 1.05)
  }

  // C. vehicle_status=not_found -> KENDARAAN TIDAK DITEMUKAN
  const vehicleNotFound = mapApiResponseToVehicleData(
    {
      status: "vehicle_not_found",
      vehicle_status: "not_found",
      njkb_status: null,
      nopol: "DH0001XX",
    },
    "DH0001XX",
  )
  assert.equal(
    vehicleNotFound.status,
    "not_found",
    "vehicle_status=not_found HARUS mengembalikan status not_found",
  )

  // D. njkb_status=reference_unavailable/conflict/ambiguous -> error dengan safe message
  for (const status of [
    "reference_unavailable",
    "conflict",
    "ambiguous",
  ] as const) {
    const res = mapApiResponseToVehicleData(
      { ...officialMatchedResponse, njkb_status: status, njkb: null },
      "DH0001XX",
    )
    assert.equal(res.status, "error")
    assert.equal(String(res.message).includes(status), false)
  }

  pass("Audit 1: vehicle_status=found + njkb_status=not_found menghasilkan found (njkb=0), bukan vehicle not_found")
}

// 3. Point 2 Audit: Retry policy & timeout (~8 detik)
{
  // A. Timeout (~8 detik) -> error dan TIDAK diretry
  let timeoutCalls = 0
  const timeoutSource = new ApiVehicleDataSource({
    ...API_CONFIG,
    timeoutMs: 20,
    customFetch: async (_input, init) => {
      timeoutCalls++
      await new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("aborted")
          error.name = "AbortError"
          reject(error)
        })
      })
      return jsonResponse(officialMatchedResponse)
    },
  })
  const timeoutRes = await timeoutSource.lookup("DH0001XX")
  assert.equal(timeoutRes.status, "error")
  assert.equal(timeoutCalls, 1, "Timeout TIDAK boleh diretry")
  assert.match(String(timeoutRes.message), /timed out/i)

  // B. HTTP 502/503/504 -> diretry MAKSIMUM satu kali dengan backoff
  for (const status of [502, 503, 504]) {
    let calls = 0
    let backoffCalled = false
    const source = new ApiVehicleDataSource({
      ...API_CONFIG,
      sleepFn: async () => {
        backoffCalled = true
      },
      customFetch: async () => {
        calls++
        return calls === 1
          ? jsonResponse({ status: "error" }, status)
          : jsonResponse(officialMatchedResponse)
      },
    })
    const res = await source.lookup("DH0001XX")
    assert.equal(res.status, "found")
    assert.equal(calls, 2, `HTTP ${status} diretry tepat 1 kali (total 2 calls)`)
    assert.ok(backoffCalled, `HTTP ${status} memicu backoff delay`)
  }

  // C. Transient network error -> diretry MAKSIMUM satu kali
  let networkCalls = 0
  let networkBackoff = false
  const netSource = new ApiVehicleDataSource({
    ...API_CONFIG,
    sleepFn: async () => {
      networkBackoff = true
    },
    customFetch: async () => {
      networkCalls++
      if (networkCalls === 1) throw new TypeError("network disconnected")
      return jsonResponse(officialMatchedResponse)
    },
  })
  const netRes = await netSource.lookup("DH0001XX")
  assert.equal(netRes.status, "found")
  assert.equal(networkCalls, 2)
  assert.ok(networkBackoff)

  // D. Error deterministik (400, 401, 403, 404, 500) -> TIDAK diretry (0 retries)
  for (const status of [400, 401, 403, 404, 500]) {
    let calls = 0
    const source = new ApiVehicleDataSource({
      ...API_CONFIG,
      customFetch: async () => {
        calls++
        return jsonResponse({ status: "error" }, status)
      },
    })
    const res = await source.lookup("DH0001XX")
    assert.equal(res.status, status === 404 ? "not_found" : "error")
    assert.equal(calls, 1, `HTTP ${status} tidak boleh diretry`)
  }

  pass("Audit 2: timeout 8s tidak diretry, 502/503/504 & network error max 1 retry dengan backoff, error deterministik 0 retry")
}

// 3b. Regression HTTP 504: metadata typed, timeout client vs gateway, sanitasi config
{
  // sanitizeTimeoutMs: hanya integer finite 1..60000
  assert.equal(sanitizeTimeoutMs(undefined), 8_000)
  for (const bad of [0, -1, NaN, Infinity, -Infinity, 1.5, 60_001, "5000"]) {
    assert.equal(sanitizeTimeoutMs(bad), 8_000, `timeout ${String(bad)} fallback 8000`)
  }
  for (const ok of [1, 20, 8_000, 60_000]) assert.equal(sanitizeTimeoutMs(ok), ok)

  // Timeout config NaN tidak boleh menjadi setTimeout instan: delay terekam 8000 tanpa menunggu.
  const originalSetTimeout = globalThis.setTimeout
  const delays: unknown[] = []
  globalThis.setTimeout = ((_fn: () => void, ms?: number) => {
    delays.push(ms)
    return originalSetTimeout(() => undefined, 0)
  }) as typeof setTimeout
  try {
    const res = await new ApiVehicleDataSource({
      ...API_CONFIG,
      timeoutMs: NaN,
      customFetch: async () => jsonResponse(officialMatchedResponse),
    }).lookup("DH0001XX")
    assert.equal(res.status, "found")
  } finally {
    globalThis.setTimeout = originalSetTimeout
  }
  assert.deepEqual(delays, [8_000])

  // Upstream 504 persisten: 1 retry lalu error NJKB_UPSTREAM_TIMEOUT → httpStatus 504.
  let calls504 = 0
  const persistent504 = await new ApiVehicleDataSource({
    ...API_CONFIG,
    sleepFn: async () => undefined,
    customFetch: async () => {
      calls504++
      return new Response("<html>gateway secret detail</html>", { status: 504 })
    },
  }).lookup("DH0001XX")
  assert.equal(calls504, 2)
  assert.equal(persistent504.status, "error")
  if (persistent504.status === "error") {
    assert.equal(persistent504.code, "NJKB_UPSTREAM_TIMEOUT")
    assert.equal(persistent504.httpStatus, 504)
    assert.equal(persistent504.upstreamStatus, 504)
    assert.match(String(persistent504.message), /Gateway NJKB/)
    assert.doesNotMatch(String(persistent504.message), /timed out|secret/i)
  }

  // Abort client: kode berbeda, status 504, tanpa retry.
  let abortCalls = 0
  const aborted = await new ApiVehicleDataSource({
    ...API_CONFIG,
    customFetch: async () => {
      abortCalls++
      throw Object.assign(new Error("aborted"), { name: "AbortError" })
    },
  }).lookup("DH0001XX")
  assert.equal(abortCalls, 1)
  if (aborted.status === "error") {
    assert.equal(aborted.code, "NJKB_CLIENT_TIMEOUT")
    assert.equal(aborted.httpStatus, 504)
    assert.match(String(aborted.message), /timed out/i)
  } else assert.fail("abort harus error")

  // 502/503, 401/403, 500 dan 429 dipetakan aman (tidak meneruskan status auth).
  const expected: Record<number, number> = { 502: 502, 503: 503, 401: 502, 403: 502, 500: 502, 429: 502 }
  for (const [status, httpStatus] of Object.entries(expected)) {
    const res = await new ApiVehicleDataSource({
      ...API_CONFIG,
      sleepFn: async () => undefined,
      customFetch: async () => jsonResponse({ status: "error" }, Number(status)),
    }).lookup("DH0001XX")
    assert.equal(res.status, "error")
    if (res.status === "error") {
      assert.equal(res.httpStatus, httpStatus, `upstream ${status}`)
      assert.equal(res.upstreamStatus, Number(status))
      assert.equal(res.code, "NJKB_UPSTREAM_HTTP_ERROR")
    }
  }

  // Network error persisten dan payload invalid → 502.
  const net = await new ApiVehicleDataSource({
    ...API_CONFIG,
    sleepFn: async () => undefined,
    customFetch: async () => {
      throw new TypeError("redirect or network failure")
    },
  }).lookup("DH0001XX")
  assert.ok(net.status === "error" && net.code === "NJKB_NETWORK_ERROR" && net.httpStatus === 502)
  const invalid = await new ApiVehicleDataSource({
    ...API_CONFIG,
    customFetch: async () => new Response("<html></html>", { status: 200 }),
  }).lookup("DH0001XX")
  assert.ok(invalid.status === "error" && invalid.code === "NJKB_INVALID_PAYLOAD" && invalid.httpStatus === 502)

  // Base URL invalid: config error, tidak ada fetch.
  for (const baseUrl of [
    "not a url",
    "http://api.example.test",
    "https://user:pass@api.example.test",
    "https://api.example.test?token=x",
    "https://api.example.test#frag",
    "ftp://api.example.test",
  ]) {
    let fetched = 0
    const res = await new ApiVehicleDataSource({
      ...API_CONFIG,
      baseUrl,
      customFetch: async () => {
        fetched++
        return jsonResponse(officialMatchedResponse)
      },
    }).lookup("DH0001XX")
    assert.equal(fetched, 0, `${baseUrl} tidak boleh fetch`)
    assert.ok(res.status === "error" && res.code === "NJKB_CONFIG_ERROR" && res.httpStatus === 500)
    assert.doesNotMatch(String(res.message), /pass|token|example/)
  }
  assert.equal(isValidNjkbBaseUrl("http://localhost:8787"), true)
  assert.equal(isValidNjkbBaseUrl("https://api.uptdpenda-kupang.web.id/"), true)

  // Headers Access, URL kontrak, dan redirect: "manual" dikirim.
  let init: RequestInit | undefined
  let requestedUrl = ""
  await new ApiVehicleDataSource({
    ...API_CONFIG,
    customFetch: async (input, requestInit) => {
      requestedUrl = String(input)
      init = requestInit
      return jsonResponse(officialMatchedResponse)
    },
  }).lookup("DH0001XX")
  assert.equal(requestedUrl, "https://api.uptdpenda-kupang.web.id/api/v1/vehicle/DH0001XX")
  assert.equal(init?.redirect, "manual")
  assert.equal(init?.method, "GET")
  const sentHeaders = init?.headers as Record<string, string>
  assert.equal(sentHeaders["CF-Access-Client-Id"], "test-client.access")
  assert.equal(sentHeaders["CF-Access-Client-Secret"], "test-secret")

  pass("Regression 504: metadata typed, client timeout ≠ gateway 504, timeout/base URL tervalidasi, redirect manual")
}

// 3c. Redirect manual 3xx dan pembatalan body yang tidak dibaca
{
  // Response dengan body yang pembatalannya terekam; isi body tidak pernah dibaca.
  function spiedResponse(
    status: number,
    headers: Record<string, string> = {},
    cancelThrows = false,
  ) {
    const spy = { cancelled: 0, pulled: 0 }
    const stream = new ReadableStream<Uint8Array>({
      pull() {
        spy.pulled++
      },
      cancel() {
        spy.cancelled++
        if (cancelThrows) throw new Error("cancel failure")
      },
    })
    return { response: new Response(stream, { status, headers }), spy }
  }

  for (const status of [301, 302, 307, 308]) {
    let calls = 0
    let slept = false
    let spy = { cancelled: 0, pulled: 0 }
    const res = await new ApiVehicleDataSource({
      ...API_CONFIG,
      sleepFn: async () => {
        slept = true
      },
      customFetch: async (_input, init) => {
        calls++
        assert.equal(init?.redirect, "manual")
        const spied = spiedResponse(status, {
          Location: "https://evil.example.test/steal?token=abc",
        })
        spy = spied.spy
        return spied.response
      },
    }).lookup("DH0001XX")
    assert.equal(calls, 1, `HTTP ${status} tidak diikuti/diretry`)
    assert.equal(slept, false)
    assert.equal(spy.cancelled, 1, `HTTP ${status} body dibatalkan`)
    assert.ok(res.status === "error")
    if (res.status === "error") {
      assert.equal(res.code, "NJKB_UPSTREAM_HTTP_ERROR")
      assert.equal(res.httpStatus, 502)
      assert.equal(res.upstreamStatus, status)
      assert.doesNotMatch(JSON.stringify(res), /evil|token|Location/i)
    }
  }

  // Body dibatalkan pada 404, 429, non-ok (termasuk sebelum retry 504), dan non-JSON.
  const cases: Array<{ statuses: number[]; contentType?: string; expectedCancels: number }> = [
    { statuses: [404], expectedCancels: 1 },
    { statuses: [429], expectedCancels: 1 },
    { statuses: [500], expectedCancels: 1 },
    { statuses: [504, 504], expectedCancels: 2 },
    { statuses: [200], contentType: "text/html", expectedCancels: 1 },
  ]
  for (const { statuses, contentType, expectedCancels } of cases) {
    let calls = 0
    let cancels = 0
    await new ApiVehicleDataSource({
      ...API_CONFIG,
      sleepFn: async () => undefined,
      customFetch: async () => {
        const spied = spiedResponse(
          statuses[calls++],
          contentType ? { "Content-Type": contentType } : {},
        )
        const original = spied.response.body!.cancel.bind(spied.response.body)
        spied.response.body!.cancel = async (reason?: unknown) => {
          cancels++
          return original(reason)
        }
        return spied.response
      },
    }).lookup("DH0001XX")
    assert.equal(calls, statuses.length)
    assert.equal(cancels, expectedCancels, `cancel body untuk ${statuses.join(",")}`)
  }

  // Kegagalan cancel tidak mengubah hasil error aman.
  const failing = spiedResponse(500, {}, true)
  const failingRes = await new ApiVehicleDataSource({
    ...API_CONFIG,
    customFetch: async () => failing.response,
  }).lookup("DH0001XX")
  assert.ok(failingRes.status === "error" && failingRes.httpStatus === 502)
  assert.equal(failing.spy.cancelled, 1)

  // Helper aman untuk body null dan body yang sudah terpakai.
  await discardResponseBody(new Response(null, { status: 204 }))
  const used = new Response("x")
  await used.text()
  await discardResponseBody(used)

  pass("Redirect 301/302/307/308 → 502 aman tanpa retry/Location; body tak terpakai dibatalkan")
}

// 4. Point 3 Audit: HTTP 429 dan Retry-After handling
{
  // A. HTTP 429 dengan Retry-After: 30 -> tidak retry, pesan jelas, menahan call berikutnya
  let callCount429 = 0
  const rateLimitedSource = new ApiVehicleDataSource({
    ...API_CONFIG,
    customFetch: async () => {
      callCount429++
      return jsonResponse({ status: "rate_limited" }, 429, {
        "Retry-After": "30",
      })
    },
  })

  // Request pertama: menerima 429
  const res429 = await rateLimitedSource.lookup("DH0001XX")
  assert.equal(res429.status, "error")
  assert.equal(callCount429, 1, "HTTP 429 TIDAK boleh diretry secara berulang")
  assert.match(String(res429.message), /30 detik|Rate limit/i)

  // Request kedua segera setelahnya: dihormati tanpa request jaringan baru!
  const resBlocked = await rateLimitedSource.lookup("DH0001XX")
  assert.equal(resBlocked.status, "error")
  assert.equal(
    callCount429,
    1,
    "Request kedua selama Retry-After window aktif TIDAK boleh memanggil fetch",
  )
  assert.match(String(resBlocked.message), /Rate limit sedang aktif/i)

  // B. HTTP 429 tanpa Retry-After -> tidak retry, pesan generic aman
  let callCountNoHeader = 0
  const noHeaderSource = new ApiVehicleDataSource({
    ...API_CONFIG,
    customFetch: async () => {
      callCountNoHeader++
      return jsonResponse({ status: "rate_limited" }, 429)
    },
  })
  const resNoHeader = await noHeaderSource.lookup("DH0001XX")
  assert.equal(resNoHeader.status, "error")
  assert.equal(callCountNoHeader, 1, "HTTP 429 tanpa header tidak boleh diretry")
  assert.match(String(resNoHeader.message), /Rate limit terlampaui/i)

  pass("Audit 3: HTTP 429 menghormati Retry-After, tidak melakukan retry berulang, dan menahan call berikutnya")
}

// 5. Invarian D1 & Resolver Phase 1/3
{
  const source = new D1VehicleDataSource(mockDb({ DH2506KA: d1Row }))
  const found = await source.lookup("DH2506KA")
  assert.equal(found.status, "found")
  if (found.status === "found") assert.equal(found.source, "d1")
  assert.equal((await source.lookup("DH9999ZZ")).status, "not_found")

  // Resolver: D1 found -> D1 (API tidak dipanggil)
  let apiCalls = 0
  const api = new ApiVehicleDataSource({
    fetcher: async (nopol) => {
      apiCalls++
      return mapApiResponseToVehicleData(
        { ...officialMatchedResponse, nopol },
        nopol,
      )
    },
  })
  const resolver = new VehicleDataResolver({ d1Source: source, apiSource: api })
  assert.equal((await resolver.resolve("DH2506KA")).status, "found")
  assert.equal(apiCalls, 0)

  // Resolver: D1 miss -> API dipanggil
  assert.equal((await resolver.resolve("DH0001XX")).status, "found")
  assert.equal(apiCalls, 1)

  pass("Invarian D1 & Resolver Phase 1/3 tetap terjaga")
}

console.log("\nSemua Phase 7 NJKB API contract & source tests: PASS ✓\n")
