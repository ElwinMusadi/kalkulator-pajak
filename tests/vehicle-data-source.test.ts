import assert from "node:assert/strict"
import {
  ApiVehicleDataSource,
  D1VehicleDataSource,
  VehicleDataResolver,
  mapApiResponseToVehicleData,
  normalizeNopol,
  parseDecimalRupiahToInteger,
  parseNonNegativeDecimalRupiah,
  parseOfficialWeight,
  parseOptionalNjub,
  parseSyncedAt,
  sanitizeOriginUpt,
  parseRetryAfterSeconds,
  discardResponseBody,
  isValidNjkbBaseUrl,
  sanitizeTimeoutMs,
  type D1DatabaseLike,
  type VehicleLookupResult,
  type VehicleRow,
} from "../src/services/vehicle-data/index.ts"
import { DEFAULT_WARNA_PLAT, normalizeWarnaPlat } from "../src/types/tax.ts"

const API_KEY_UJI = "ptn_k7Q2mX9a_" + "A".repeat(43)

const API_CONFIG = {
  baseUrl: "https://api.uptdpenda-kupang.web.id",
  apiKey: API_KEY_UJI,
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
assert.equal(parseDecimalRupiahToInteger("0.00"), null, "NJKB matched wajib positif")
// NJUB: non-negatif, string desimal Rupiah utuh; tidak ada → 0; ada tetapi invalid → null (fail closed).
assert.equal(parseNonNegativeDecimalRupiah("35000000.00"), 35_000_000)
assert.equal(parseNonNegativeDecimalRupiah("0.00"), 0)
assert.equal(parseNonNegativeDecimalRupiah("0"), 0)
for (const bad of ["-1.00", "35000000.50", "1e7", "35.000.000", "", " ", "abc", 35000000, true, {}, "99999999999999999"]) {
  assert.equal(parseNonNegativeDecimalRupiah(bad), null, `NJUB ${JSON.stringify(bad)}`)
}
// Batas safe integer: MAX_SAFE_INTEGER diterima, di atasnya ditolak (tanpa pembulatan diam-diam).
assert.equal(parseNonNegativeDecimalRupiah("9007199254740991"), 9_007_199_254_740_991)
assert.equal(parseNonNegativeDecimalRupiah("9007199254740991.00"), 9_007_199_254_740_991)
assert.equal(parseNonNegativeDecimalRupiah("9007199254740993"), null)
assert.equal(parseDecimalRupiahToInteger("9007199254740991"), 9_007_199_254_740_991)
assert.equal(parseDecimalRupiahToInteger("9007199254740993"), null)
assert.equal(parseOptionalNjub("9007199254740993"), null)
// potensi {} / tanpa njub / njub null → NJUB 0 (kompatibel); potensi.njub invalid → 502.
for (const potensi of [{}, { njub: null }, { synced_at: "2026-10-17T00:00:00Z" }, null, undefined]) {
  const res = mapApiResponseToVehicleData({ ...officialMatchedResponse, potensi }, "DH0001XX")
  assert.equal(res.status, "found", `potensi=${JSON.stringify(potensi)}`)
  if (res.status === "found") assert.equal(res.data.njub, 0)
}
{
  const res = mapApiResponseToVehicleData(
    { ...officialMatchedResponse, potensi: { njub: "9007199254740993" } },
    "DH0001XX",
  )
  assert.ok(res.status === "error" && res.code === "NJKB_INVALID_PAYLOAD" && res.httpStatus === 502)
}
assert.equal(parseOptionalNjub(undefined), 0)
assert.equal(parseOptionalNjub(null), 0)
assert.equal(parseOptionalNjub("12500000.00"), 12_500_000)
assert.equal(parseOptionalNjub("-5"), null)
assert.equal(parseOptionalNjub(12_500_000), null)
// syncedAt: ISO finite → toISOString UTC; lainnya → null.
assert.equal(parseSyncedAt("2026-10-17T03:15:00Z"), "2026-10-17T03:15:00.000Z")
assert.equal(parseSyncedAt("2026-10-17T03:15:00+08:00"), "2026-10-16T19:15:00.000Z")
assert.equal(parseSyncedAt("2026-10-17 03:15:00"), "2026-10-17T03:15:00.000Z")
assert.equal(parseSyncedAt("2026-10-17"), "2026-10-17T00:00:00.000Z")
for (const bad of ["2026-02-30", "2026-13-01T00:00:00Z", "kemarin", "1700000000", 1700000000, null, "", "0000-00-00"]) {
  assert.equal(parseSyncedAt(bad), null, `syncedAt ${JSON.stringify(bad)}`)
}
// originUpt: label aman, trim, maks 120 karakter.
assert.equal(sanitizeOriginUpt("  UPT  Pendapatan Daerah\nWilayah Kota Kupang "), "UPT Pendapatan Daerah Wilayah Kota Kupang")
assert.equal(sanitizeOriginUpt("UPTD Kab. Timor Tengah Selatan (SoE)"), "UPTD Kab. Timor Tengah Selatan (SoE)")
for (const bad of ["", "   ", "x".repeat(121), "<script>alert(1)</script>", "UPT; DROP", 7, null]) {
  assert.equal(sanitizeOriginUpt(bad), null, `originUpt ${JSON.stringify(bad)}`)
}
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

// 2b. Warna plat (TNKB): normalisasi dan mapping registration.plate_color.
{
  assert.equal(DEFAULT_WARNA_PLAT, "putih")
  const normalizeCases: Array<[unknown, ReturnType<typeof normalizeWarnaPlat>]> = [
    ["PUTIH", "putih"],
    ["Putih", "putih"],
    ["  putih  ", "putih"],
    ["white", "putih"],
    ["TNKB PUTIH", "putih"],
    ["HITAM", "hitam"],
    ["TNKB HITAM", "hitam"],
    ["black", "hitam"],
    ["MERAH", "merah"],
    ["Merah", "merah"],
    ["red", "merah"],
    ["KUNING", null],
    ["yellow", null],
    ["HIJAU", null],
    ["REDUP", null],
    // Deskripsi multi-warna: warna DASAR menentukan; ambigu/kuning → null.
    ["DASAR MERAH TULISAN PUTIH", "merah"],
    ["Dasar Putih Tulisan Hitam", "putih"],
    ["MERAH-PUTIH", null],
    ["PUTIH KUNING", null],
    ["KUNING HITAM", null],
    ["DASAR KUNING TULISAN HITAM", null],
    ["MERAHPUTIH", null],
    ["MERAH MAROON", "merah"],
    ["", null],
    ["   ", null],
    [null, null],
    [undefined, null],
    [1, null],
    [{}, null],
  ]
  for (const [raw, expected] of normalizeCases) {
    assert.equal(normalizeWarnaPlat(raw), expected, `normalizeWarnaPlat(${JSON.stringify(raw)})`)
  }

  const plateCases: Array<{ registration: Record<string, unknown> | null; expected: string | null }> = [
    { registration: { stnk_valid_until: "2031-12-31", plate_color: "MERAH" }, expected: "merah" },
    { registration: { stnk_valid_until: "2031-12-31", plate_color: "Putih" }, expected: "putih" },
    { registration: { stnk_valid_until: "2031-12-31", plate_color: "HITAM" }, expected: "hitam" },
    { registration: { stnk_valid_until: "2031-12-31", plate_color: "KUNING" }, expected: null },
    { registration: { stnk_valid_until: "2031-12-31" }, expected: null },
    { registration: { stnk_valid_until: "2031-12-31", plate_color: 2 }, expected: null },
    { registration: null, expected: null },
  ]
  for (const variant of [
    { njkb_status: "matched" },
    { njkb_status: "not_found", njkb: null },
  ]) {
    for (const { registration, expected } of plateCases) {
      const res = mapApiResponseToVehicleData(
        { ...officialMatchedResponse, ...variant, registration },
        "DH0001XX",
      )
      const label = `${variant.njkb_status} plate_color=${JSON.stringify(registration?.plate_color)}`
      assert.equal(res.status, "found", `${label}: warna plat tidak boleh menggagalkan lookup`)
      if (res.status === "found") {
        assert.equal(res.data.warnaPlat, expected, label)
        assert.ok("warnaPlat" in res.data, `${label}: warnaPlat selalu ada (null bila tak dikenal)`)
      }
    }
  }

  pass("Warna plat: normalizeWarnaPlat dan registration.plate_color → warnaPlat (KUNING/tak dikenal → null)")
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

  // Header Bearer, URL kontrak, dan redirect: "manual" dikirim.
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
  assert.deepEqual(Object.keys(sentHeaders).sort(), ["Accept", "Authorization"])
  assert.equal(sentHeaders.Authorization, `Bearer ${API_KEY_UJI}`)

  pass("Regression 504: metadata typed, client timeout ≠ gateway 504, timeout/base URL tervalidasi, redirect manual")
}

// 3b2. Kunci API Data Potensi: satu-satunya kredensial sejak Access dilepas (Fase 5, 2026-10-24).
{
  async function sentHeadersFor(config: Record<string, string | undefined>) {
    let calls = 0
    let headers: Record<string, string> = {}
    const res = await new ApiVehicleDataSource({
      baseUrl: API_CONFIG.baseUrl,
      ...config,
      customFetch: async (_input, init) => {
        calls++
        headers = init?.headers as Record<string, string>
        return jsonResponse(officialMatchedResponse)
      },
    }).lookup("DH0001XX")
    return { res, calls, headers }
  }

  // Kunci di-trim dan dikirim sebagai Bearer; tidak pernah ada header CF Access.
  const trimmed = await sentHeadersFor({ apiKey: `  ${API_KEY_UJI}\n` })
  assert.equal(trimmed.res.status, "found")
  assert.equal(trimmed.headers.Authorization, `Bearer ${API_KEY_UJI}`)
  assert.equal("CF-Access-Client-Id" in trimmed.headers, false)
  assert.equal("CF-Access-Client-Secret" in trimmed.headers, false)

  // Konfigurasi Access lama yang masih ada di objek config diabaikan.
  const legacy = await sentHeadersFor({ apiKey: API_KEY_UJI, accessClientId: "test-client.access", accessClientSecret: "test-secret" })
  assert.equal(legacy.calls, 1)
  assert.equal("CF-Access-Client-Id" in legacy.headers, false)

  // Tanpa kunci → config error tanpa fetch, walau credential Access lama ada.
  for (const config of [
    {},
    { apiKey: " " },
    { accessClientId: "test-client.access", accessClientSecret: "test-secret" },
  ]) {
    const none = await sentHeadersFor(config)
    assert.equal(none.calls, 0, JSON.stringify(Object.keys(config)))
    assert.ok(none.res.status === "error" && none.res.code === "NJKB_CONFIG_ERROR" && none.res.httpStatus === 500)
  }

  pass("Kunci API: satu-satunya kredensial, di-trim, header Access tidak pernah dikirim, tanpa kunci = config error tanpa fetch")
}

// 3b3. HTTP 403 region_not_allowed → kode dan pesan sendiri; 403 lain tetap 502.
{
  const UPSTREAM_TEXT = "Kendaraan terdaftar di luar wilayah yang diizinkan untuk kunci ini"
  let calls = 0
  const region = await new ApiVehicleDataSource({
    ...API_CONFIG,
    sleepFn: async () => undefined,
    customFetch: async () => {
      calls++
      return jsonResponse(
        { status: "forbidden", error: { code: "region_not_allowed", message: UPSTREAM_TEXT, request_id: "req-1" } },
        403,
      )
    },
  }).lookup("DH0001XX")
  assert.equal(calls, 1, "403 tidak diretry")
  if (region.status === "error") {
    assert.equal(region.code, "NJKB_REGION_NOT_ALLOWED")
    assert.equal(region.httpStatus, 403)
    assert.equal(region.upstreamStatus, 403)
    assert.equal(region.message, "Kendaraan terdaftar di luar wilayah yang diizinkan.")
    assert.doesNotMatch(String(region.message), /kunci|req-1/)
  } else assert.fail("region_not_allowed harus error")

  // 403 dengan kode lain, body bukan JSON, atau JSON rusak → 502 generik.
  for (const response of [
    () => jsonResponse({ status: "forbidden", error: { code: "forbidden", message: "x" } }, 403),
    () => jsonResponse({ code: "region_not_allowed" }, 403),
    () => jsonResponse({ error: "region_not_allowed" }, 403),
    () => jsonResponse(null, 403),
    () => new Response(JSON.stringify({ error: { code: "region_not_allowed" } }), { status: 403 }),
    () => new Response("{rusak", { status: 403, headers: { "Content-Type": "application/json" } }),
  ]) {
    const res = await new ApiVehicleDataSource({ ...API_CONFIG, customFetch: async () => response() }).lookup(
      "DH0001XX",
    )
    assert.ok(
      res.status === "error" && res.code === "NJKB_UPSTREAM_HTTP_ERROR" && res.httpStatus === 502,
      "403 bukan region_not_allowed tetap 502",
    )
  }

  // Kode region di status selain 403 tidak diperlakukan khusus.
  const wrongStatus = await new ApiVehicleDataSource({
    ...API_CONFIG,
    customFetch: async () => jsonResponse({ error: { code: "region_not_allowed" } }, 401),
  }).lookup("DH0001XX")
  assert.ok(wrongStatus.status === "error" && wrongStatus.code === "NJKB_UPSTREAM_HTTP_ERROR")

  pass("403 region_not_allowed → NJKB_REGION_NOT_ALLOWED (HTTP 403), tanpa retry dan tanpa teks upstream")
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
  const resolver = new VehicleDataResolver({
    d1Source: source,
    apiSource: api,
    mode: "d1_then_api",
  })
  assert.equal((await resolver.resolve("DH2506KA")).status, "found")
  assert.equal(apiCalls, 0)

  // Resolver: D1 miss -> API dipanggil
  assert.equal((await resolver.resolve("DH0001XX")).status, "found")
  assert.equal(apiCalls, 1)

  pass("Invarian D1 & Resolver Phase 1/3 tetap terjaga (mode d1_then_api)")
}

// 5b. D1 warna_plat: mapping kolom dan fallback bila migration 0002 belum diterapkan.
{
  // Kolom tersedia: nilai dinormalisasi; NULL/tak dikenal → null.
  for (const [raw, expected] of [
    ["merah", "merah"],
    ["hitam", "hitam"],
    ["putih", "putih"],
    [null, null],
    ["kuning", null],
  ] as const) {
    const queries: string[] = []
    const db: D1DatabaseLike = {
      prepare(query) {
        queries.push(query)
        return mockDb({ DH2506KA: { ...d1Row, warna_plat: raw } }).prepare(query)
      },
    }
    const res = await new D1VehicleDataSource(db).lookup("DH2506KA")
    assert.equal(res.status, "found")
    if (res.status === "found") assert.equal(res.data.warnaPlat, expected, `warna_plat=${raw}`)
    assert.equal(queries.length, 1)
    assert.match(queries[0], /warna_plat/)
  }

  // Kolom belum ada (deploy sebelum migration): retry query lama → warnaPlat null.
  function legacyDb(errorMessage: string) {
    const queries: string[] = []
    const db: D1DatabaseLike = {
      prepare(query) {
        queries.push(query)
        return {
          bind(...values: unknown[]) {
            return {
              async first<T>(): Promise<T | null> {
                if (query.includes("warna_plat")) throw new Error(errorMessage)
                return (values[0] === "DH2506KA" ? d1Row : null) as T | null
              },
            }
          },
        }
      },
    }
    return { db, queries }
  }

  {
    const { db, queries } = legacyDb("D1_ERROR: no such column: warna_plat: SQLITE_ERROR")
    const source = new D1VehicleDataSource(db)
    const res = await source.lookup("DH2506KA")
    assert.equal(res.status, "found")
    if (res.status === "found") {
      assert.equal(res.data.warnaPlat, null)
      assert.equal(res.data.njkb, d1Row.njkb)
      assert.equal(res.data.source, "d1")
    }
    assert.equal(queries.length, 2)
    assert.match(queries[0], /warna_plat/)
    assert.doesNotMatch(queries[1], /warna_plat/)

    const miss = await source.lookup("DH9999ZZ")
    assert.equal(miss.status, "not_found", "Fallback tetap membedakan not_found")
  }

  // Error D1 lain tidak di-retry dan tidak membocorkan pesan mentah.
  {
    const { db, queries } = legacyDb("D1_ERROR: no such table: vehicle_njkb: SQLITE_ERROR")
    const res = await new D1VehicleDataSource(db).lookup("DH2506KA")
    assert.equal(res.status, "error")
    assert.equal(queries.length, 1, "Error selain kolom warna_plat hilang tidak di-retry")
    if (res.status === "error") {
      assert.equal(res.message, "Terjadi kesalahan server saat membaca database D1.")
      assert.doesNotMatch(String(res.message), /SQLITE|no such/)
    }
  }

  // Query lama juga gagal → error aman.
  {
    const db: D1DatabaseLike = {
      prepare(query) {
        return {
          bind() {
            return {
              async first<T>(): Promise<T | null> {
                throw new Error(
                  query.includes("warna_plat")
                    ? "D1_ERROR: no such column: warna_plat: SQLITE_ERROR"
                    : "D1 failure",
                )
              },
            }
          },
        }
      },
    }
    const res = await new D1VehicleDataSource(db).lookup("DH2506KA")
    assert.equal(res.status, "error")
    if (res.status === "error") {
      assert.equal(res.message, "Terjadi kesalahan server saat membaca database D1.")
    }
  }

  pass("D1 warna_plat: mapping kolom; fallback query lama saat kolom belum ada; error lain tetap aman")
}

// 6. Default api_then_d1: NJKB API dahulu, D1 hanya sebagai fallback.
{
  type Script = VehicleLookupResult | (() => VehicleLookupResult)
  function scripted(name: "d1" | "api", script: Script) {
    const state = { calls: 0 }
    return {
      state,
      source: {
        name,
        async lookup() {
          state.calls++
          return typeof script === "function" ? script() : script
        },
      },
    }
  }
  const d1Data = { ...d1Row, nopol: "DH2506KA" }
  const foundD1: VehicleLookupResult = {
    status: "found",
    source: "d1",
    data: {
      nopol: d1Data.nopol,
      nama: d1Data.nama,
      jenis: d1Data.jenis,
      jatuhTempoStnk: d1Data.jatuh_tempo_stnk,
      jatuhTempoPajak: d1Data.jatuh_tempo_pajak,
      njkb: d1Data.njkb,
      njub: d1Data.njub,
      bobot: d1Data.bobot,
      source: "d1",
    },
  }
  const foundApi = mapApiResponseToVehicleData(
    { ...officialMatchedResponse, nopol: "DH2506KA" },
    "DH2506KA",
  )
  assert.equal(foundApi.status, "found")
  const apiNotFound: VehicleLookupResult = { status: "not_found", message: "API not found" }
  const d1NotFound: VehicleLookupResult = { status: "not_found", message: "D1 not found" }
  const apiTimeout: VehicleLookupResult = {
    status: "error",
    error: "timeout",
    message: "Gateway NJKB timeout.",
    code: "NJKB_UPSTREAM_TIMEOUT",
    httpStatus: 504,
  }
  const d1Error: VehicleLookupResult = {
    status: "error",
    error: "db",
    message: "Terjadi kesalahan server saat membaca database D1.",
  }

  // Resolver legacy (tanpa referensi produksi) mengikuti DEFAULT bersama ("api");
  // kasus fallback di bawah memakai mode api_then_d1 eksplisit.
  assert.equal(new VehicleDataResolver().getMode(), "api")
  const legacyMode = { mode: "api_then_d1" as const }

  // a) API found → D1 tidak disentuh.
  {
    const api = scripted("api", foundApi)
    const d1 = scripted("d1", foundD1)
    const result = await new VehicleDataResolver({ ...legacyMode, apiSource: api.source, d1Source: d1.source }).resolve("DH2506KA")
    assert.equal(result.status, "found")
    if (result.status === "found") assert.equal(result.source, "api")
    assert.equal(api.state.calls, 1)
    assert.equal(d1.state.calls, 0)
  }

  // b) API not_found → fallback D1 found.
  // c) API error (timeout/jaringan/HTTP) → fallback D1 found.
  for (const apiOutcome of [apiNotFound, apiTimeout]) {
    const api = scripted("api", apiOutcome)
    const d1 = scripted("d1", foundD1)
    const result = await new VehicleDataResolver({ ...legacyMode, apiSource: api.source, d1Source: d1.source }).resolve("DH2506KA")
    assert.equal(result.status, "found", `apiOutcome=${apiOutcome.status}`)
    if (result.status === "found") assert.equal(result.source, "d1")
    assert.equal(api.state.calls, 1)
    assert.equal(d1.state.calls, 1)
  }

  // d) Keduanya not_found → not_found.
  {
    const result = await new VehicleDataResolver({
      ...legacyMode,
      apiSource: scripted("api", apiNotFound).source,
      d1Source: scripted("d1", d1NotFound).source,
    }).resolve("DH2506KA")
    assert.equal(result.status, "not_found")
  }

  // e) API error + D1 not_found → error API dipertahankan (bukan "tidak ditemukan").
  {
    const result = await new VehicleDataResolver({
      ...legacyMode,
      apiSource: scripted("api", apiTimeout).source,
      d1Source: scripted("d1", d1NotFound).source,
    }).resolve("DH2506KA")
    assert.equal(result.status, "error")
    if (result.status === "error") {
      assert.equal(result.code, "NJKB_UPSTREAM_TIMEOUT")
      assert.equal(result.httpStatus, 504)
    }
  }

  // f) API not_found + D1 error → error D1.
  {
    const result = await new VehicleDataResolver({
      ...legacyMode,
      apiSource: scripted("api", apiNotFound).source,
      d1Source: scripted("d1", d1Error).source,
    }).resolve("DH2506KA")
    assert.equal(result.status, "error")
    if (result.status === "error") assert.equal(result.message, d1Error.message)
  }

  // g) API tidak dikonfigurasi → langsung D1.
  {
    const d1 = scripted("d1", foundD1)
    const result = await new VehicleDataResolver({ ...legacyMode, d1Source: d1.source }).resolve("DH2506KA")
    assert.equal(result.status, "found")
    if (result.status === "found") assert.equal(result.source, "d1")
  }

  pass("Default api_then_d1: API dahulu; fallback D1 saat not_found/error; error API dipertahankan bila D1 kosong")
}

console.log("\nSemua Phase 7 NJKB API contract & source tests: PASS ✓\n")
