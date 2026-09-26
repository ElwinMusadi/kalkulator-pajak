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
    assert.equal(vehicleFoundNjkbNotFound.data.jenis, "MOBIL PENUMPANG")
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
