import assert from "node:assert/strict"
import { onRequestGet } from "../functions/api/njkb/[nopol].ts"
import type { AuthContext } from "../server/types.ts"
import { MODULE_KEYS, type ModuleKey } from "../src/types/auth.ts"
import type { D1DatabaseLike, VehicleRow } from "../src/services/vehicle-data/index.ts"

const ADMIN_AUTH: AuthContext = {
  user: {
    id: "00000000-0000-4000-8000-000000000001",
    username: "admin",
    name: "Admin",
    role: "admin",
    permissions: [...MODULE_KEYS],
  },
  session: { id: "00000000-0000-4000-8000-0000000000a1", isPetugas: false },
}

function petugasAuth(permissions: ModuleKey[]): AuthContext {
  return {
    user: {
      id: "00000000-0000-4000-8000-000000000002",
      username: "petugas",
      name: "Petugas",
      role: "petugas",
      permissions,
    },
    session: { id: "00000000-0000-4000-8000-0000000000b1", isPetugas: true },
  }
}

interface TestEnv {
  DB: D1DatabaseLike
  NJKB_API_BASE_URL?: string
  NJKB_ACCESS_CLIENT_ID?: string
  NJKB_ACCESS_CLIENT_SECRET?: string
  NJKB_API_TIMEOUT_MS?: string
}

const API_ENV = {
  NJKB_API_BASE_URL: "https://api.uptdpenda-kupang.web.id",
  NJKB_ACCESS_CLIENT_ID: "test-client.access",
  NJKB_ACCESS_CLIENT_SECRET: "test-secret",
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

function officialApiResponse(nopol: string) {
  return {
    status: "vehicle_found",
    vehicle_status: "found",
    njkb_status: "matched",
    nopol,
    vehicle: { category: "MOBIL PENUMPANG", category_raw: "MINIBUS" },
    registration: { stnk_valid_until: "2031-12-31" },
    tax: { notice_valid_until: "2030-12-31" },
    owner: { name: "API OWNER" },
    njkb: { value: "50000000.00", weight: "1.050000" },
  }
}

function mockDb(
  rows: Record<string, VehicleRow | null> = {},
  throwError = false,
  onQuery?: () => void,
): D1DatabaseLike {
  return {
    prepare() {
      return {
        bind(...values: unknown[]) {
          onQuery?.()
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

async function callEndpoint(
  env: TestEnv,
  nopol = "DH2506KA",
  source?: string,
  auth: AuthContext | null = ADMIN_AUTH,
): Promise<Response> {
  const url = new URL(`https://consumer.test/api/njkb/${nopol}`)
  if (source !== undefined) url.searchParams.set("source", source)
  return onRequestGet({
    request: new Request(url),
    params: { nopol },
    env,
    data: auth ? { auth } : {},
    functionPath: "/api/njkb/[nopol]",
    waitUntil: () => undefined,
    next: async () => new Response(null, { status: 404 }),
  } as never)
}

async function body(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>
}

function pass(name: string) {
  console.log(`  ✓  ${name}`)
}

console.log("Menjalankan NJKB endpoint integration tests...\n")
const originalFetch = globalThis.fetch

try {
  // Default api_then_d1: API found → D1 tidak disentuh.
  {
    let apiCalls = 0
    let d1Calls = 0
    globalThis.fetch = async () => {
      apiCalls++
      return new Response(JSON.stringify(officialApiResponse("DH2506KA")), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }
    const response = await callEndpoint({
      DB: mockDb({ DH2506KA: d1Row }, false, () => d1Calls++),
      ...API_ENV,
    })
    const json = await body(response)
    assert.equal(response.status, 200)
    assert.equal(json.source, "api")
    assert.equal(apiCalls, 1)
    assert.equal(d1Calls, 0)
    // Kebijakan baru: data per-user, tanpa CORS wildcard dan tanpa cache publik.
    assert.equal(response.headers.get("Cache-Control"), "private, no-store")
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), null)
    pass("default api_then_d1: API found → D1 tidak disentuh (private, no-store, tanpa CORS)")
  }

  // Default api_then_d1: API not_found / 504 persisten / network error → fallback D1.
  for (const apiFailure of ["not_found", "http_504", "network"] as const) {
    let apiCalls = 0
    globalThis.fetch = async () => {
      apiCalls++
      if (apiFailure === "network") throw new TypeError("fetch failed")
      if (apiFailure === "http_504") return new Response("gateway", { status: 504 })
      return new Response(
        JSON.stringify({
          status: "vehicle_not_found",
          vehicle_status: "not_found",
          njkb_status: null,
          nopol: "DH2506KA",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )
    }
    const originalWarn = console.warn
    console.warn = () => undefined
    try {
      const response = await callEndpoint({ DB: mockDb({ DH2506KA: d1Row }), ...API_ENV })
      assert.equal(response.status, 200, `apiFailure=${apiFailure}`)
      assert.equal((await body(response)).source, "d1")
      assert.ok(apiCalls >= 1)
    } finally {
      console.warn = originalWarn
    }
  }
  pass("default api_then_d1: API not_found/504/network error → fallback D1 (200, source=d1)")

  // Default api_then_d1: API 504 + D1 miss → 504 dari API (bukan 404 menyesatkan).
  {
    globalThis.fetch = async () => new Response("gateway", { status: 504 })
    const originalWarn = console.warn
    console.warn = () => undefined
    try {
      const response = await callEndpoint({ DB: mockDb(), ...API_ENV })
      assert.equal(response.status, 504)
      assert.equal((await body(response)).code, "NJKB_UPSTREAM_TIMEOUT")
    } finally {
      console.warn = originalWarn
    }
    pass("default api_then_d1: API 504 + D1 miss → 504 NJKB_UPSTREAM_TIMEOUT")
  }

  // Tanpa auth pada ctx.data → 401 defensif, tanpa query D1/API.
  {
    let calls = 0
    globalThis.fetch = async () => {
      calls++
      return new Response(null, { status: 500 })
    }
    const response = await callEndpoint(
      { DB: mockDb({ DH2506KA: d1Row }, false, () => calls++), ...API_ENV },
      "DH2506KA",
      "d1",
      null,
    )
    assert.equal(response.status, 401)
    assert.equal((await body(response)).code, "UNAUTHENTICATED")
    assert.equal(calls, 0)
    pass("Tanpa auth → HTTP 401 UNAUTHENTICATED tanpa lookup")
  }

  // Permission petugas per sumber data.
  {
    let calls = 0
    globalThis.fetch = async () => {
      calls++
      return new Response(JSON.stringify(officialApiResponse("DH2506KA")), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }
    const env = { DB: mockDb({ DH2506KA: d1Row }, false, () => calls++), ...API_ENV }
    const cases: Array<{ source: string | undefined; permissions: ModuleKey[]; status: number }> = [
      { source: "d1", permissions: ["calculator"], status: 403 },
      { source: "d1", permissions: ["vehicle_lookup.d1"], status: 403 },
      { source: "d1", permissions: ["calculator", "vehicle_lookup.api"], status: 403 },
      { source: "api", permissions: ["calculator", "vehicle_lookup.d1"], status: 403 },
      { source: "d1_then_api", permissions: ["calculator", "vehicle_lookup.d1"], status: 403 },
      { source: "d1_then_api", permissions: ["calculator", "vehicle_lookup.api"], status: 403 },
      { source: "api_then_d1", permissions: ["calculator", "vehicle_lookup.d1"], status: 403 },
      { source: "api_then_d1", permissions: ["calculator", "vehicle_lookup.api"], status: 403 },
      { source: undefined, permissions: ["calculator", "vehicle_lookup.d1"], status: 403 },
      { source: undefined, permissions: ["calculator", "vehicle_lookup.api"], status: 403 },
    ]
    for (const testCase of cases) {
      const response = await callEndpoint(
        env,
        "DH2506KA",
        testCase.source,
        petugasAuth(testCase.permissions),
      )
      assert.equal(response.status, testCase.status, `source=${testCase.source}`)
      const json = await body(response)
      assert.equal(json.code, "FORBIDDEN")
      assert.equal(typeof json.message, "string")
      assert.equal(response.headers.get("Cache-Control"), "no-store")
    }
    assert.equal(calls, 0, "403 tidak menyentuh D1/API")

    for (const [source, permissions, expectedSource] of [
      ["d1", ["calculator", "vehicle_lookup.d1"], "d1"],
      ["api", ["calculator", "vehicle_lookup.api"], "api"],
      ["d1_then_api", ["calculator", "vehicle_lookup.d1", "vehicle_lookup.api"], "d1"],
      ["api_then_d1", ["calculator", "vehicle_lookup.d1", "vehicle_lookup.api"], "api"],
    ] as const) {
      const response = await callEndpoint(env, "DH2506KA", source, petugasAuth([...permissions]))
      assert.equal(response.status, 200, `source=${source}`)
      assert.equal((await body(response)).source, expectedSource)
    }
    pass("Petugas: 403 FORBIDDEN tanpa modul calculator/sumber; 200 bila modul lengkap")
  }

  // source=d1 hanya D1.
  {
    let apiCalls = 0
    globalThis.fetch = async () => {
      apiCalls++
      return new Response(null, { status: 500 })
    }
    const response = await callEndpoint(
      { DB: mockDb({ DH2506KA: d1Row }), ...API_ENV },
      "DH2506KA",
      "d1",
    )
    assert.equal(response.status, 200)
    assert.equal((await body(response)).source, "d1")
    assert.equal(apiCalls, 0)
    pass("source=d1 hanya menggunakan D1")
  }

  // source=api hanya API resmi dan headers benar.
  {
    let d1Calls = 0
    let requestedUrl = ""
    let headers: Record<string, string> = {}
    globalThis.fetch = async (input, init) => {
      requestedUrl = String(input)
      headers = init?.headers as Record<string, string>
      return new Response(JSON.stringify(officialApiResponse("DH2506KA")), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }
    const response = await callEndpoint(
      {
        DB: mockDb({ DH2506KA: d1Row }, false, () => d1Calls++),
        ...API_ENV,
      },
      "DH2506KA",
      "api",
    )
    const json = await body(response)
    assert.equal(response.status, 200)
    assert.equal(json.source, "api")
    assert.equal(json.jenis, "MINIBUS")
    assert.equal(d1Calls, 0)
    assert.equal(
      requestedUrl,
      "https://api.uptdpenda-kupang.web.id/api/v1/vehicle/DH2506KA",
    )
    assert.equal(headers["CF-Access-Client-Id"], "test-client.access")
    assert.equal(headers["CF-Access-Client-Secret"], "test-secret")
    pass("source=api menggunakan kontrak endpoint dan Access headers resmi")
  }

  // D1 miss/error fallback API.
  for (const d1Error of [false, true]) {
    let apiCalls = 0
    globalThis.fetch = async () => {
      apiCalls++
      return new Response(JSON.stringify(officialApiResponse("DH0001XX")), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }
    const response = await callEndpoint(
      { DB: mockDb({}, d1Error), ...API_ENV },
      "DH0001XX",
      "d1_then_api",
    )
    assert.equal(response.status, 200)
    assert.equal((await body(response)).source, "api")
    assert.equal(apiCalls, 1)
  }
  pass("D1 miss dan D1 error fallback ke API")

  // D1 miss + API vehicle_status=found tapi njkb_status=not_found → HTTP 200 dengan njkb=0
  {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          ...officialApiResponse("DH0001XX"),
          njkb_status: "not_found",
          njkb: null,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )
    const response = await callEndpoint(
      { DB: mockDb(), ...API_ENV },
      "DH0001XX",
      "d1_then_api",
    )
    const json = await body(response)
    assert.equal(response.status, 200)
    assert.equal(json.source, "api")
    assert.equal(json.njkb, 0)
    assert.equal(json.nama, "API OWNER")
    pass("D1 miss + API vehicle_status=found & njkb_status=not_found → HTTP 200 (njkb=0)")
  }

  // D1 + API vehicle_status not_found → HTTP 404.
  {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          status: "vehicle_not_found",
          vehicle_status: "not_found",
          njkb_status: null,
          nopol: "DH0000NF",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )
    const response = await callEndpoint(
      { DB: mockDb(), ...API_ENV },
      "DH0000NF",
      "d1_then_api",
    )
    assert.equal(response.status, 404)
    pass("D1 + API vehicle_status not_found → HTTP 404")
  }

  // Regression screenshot: upstream HTTP 504 persisten → endpoint 504 (bukan 500), D1 tidak disentuh,
  // satu log terstruktur tanpa NOPOL/URL/host/credential/body.
  {
    const originalWarn = console.warn
    const originalError = console.error
    const logs: string[] = []
    console.warn = (...args: unknown[]) => logs.push(args.map(String).join(" "))
    console.error = (...args: unknown[]) => logs.push(args.map(String).join(" "))
    let d1Calls = 0
    let apiCalls = 0
    globalThis.fetch = async () => {
      apiCalls++
      return new Response("<html>origin secret-body</html>", { status: 504 })
    }
    try {
      const response = await callEndpoint(
        {
          DB: mockDb({ DH2506KA: d1Row }, false, () => d1Calls++),
          ...API_ENV,
          // Timeout valid via env; tidak ada wait nyata karena fetch langsung resolve.
          NJKB_API_TIMEOUT_MS: "15000",
        },
        "DH2506KA",
        "api",
      )
      const json = await body(response)
      assert.equal(response.status, 504)
      assert.equal(json.code, "NJKB_UPSTREAM_TIMEOUT")
      assert.match(String(json.message), /Gateway NJKB/)
      assert.equal(response.headers.get("Cache-Control"), "no-store")
      assert.equal(apiCalls, 2, "504 transien diretry tepat sekali")
      assert.equal(d1Calls, 0, "source=api tidak pernah fallback ke D1")
    } finally {
      console.warn = originalWarn
      console.error = originalError
    }
    assert.equal(logs.length, 1, "Tepat satu entri log")
    const entry = JSON.parse(logs[0]) as Record<string, unknown>
    assert.deepEqual(Object.keys(entry).sort(), [
      "code",
      "elapsedMs",
      "event",
      "httpStatus",
      "upstreamStatus",
    ])
    assert.equal(entry.code, "NJKB_UPSTREAM_TIMEOUT")
    assert.equal(entry.httpStatus, 504)
    assert.equal(entry.upstreamStatus, 504)
    assert.equal(typeof entry.elapsedMs, "number")
    for (const forbidden of [
      "DH2506KA",
      "uptdpenda",
      "/api/v1/vehicle",
      "test-client",
      "test-secret",
      "secret-body",
    ]) {
      assert.equal(logs[0].includes(forbidden), false, `log memuat ${forbidden}`)
    }
    pass("Regression: upstream 504 persisten → HTTP 504 + code, source=api tanpa D1, log privat")
  }

  // Redirect 3xx dari NJKB: redirect manual, satu call, tanpa retry, body dibatalkan, Location tidak bocor.
  for (const status of [301, 302, 307, 308]) {
    const originalWarn = console.warn
    const logs: string[] = []
    console.warn = (...args: unknown[]) => logs.push(args.map(String).join(" "))
    let apiCalls = 0
    let cancelled = 0
    let redirectMode: string | undefined
    globalThis.fetch = async (_input, init) => {
      apiCalls++
      redirectMode = init?.redirect
      const stream = new ReadableStream<Uint8Array>({
        cancel() {
          cancelled++
        },
      })
      return new Response(stream, {
        status,
        headers: { Location: "https://evil.example.test/collect?secret=x" },
      })
    }
    try {
      const response = await callEndpoint(
        { DB: mockDb(), ...API_ENV },
        "DH2506KA",
        "api",
      )
      const text = await response.text()
      assert.equal(response.status, 502)
      assert.equal(JSON.parse(text).code, "NJKB_UPSTREAM_HTTP_ERROR")
      assert.equal(redirectMode, "manual")
      assert.equal(apiCalls, 1, `HTTP ${status} tidak diretry/diikuti`)
      assert.equal(cancelled, 1)
      assert.equal(response.headers.get("Location"), null)
      assert.equal(/evil|secret=x|collect/.test(text + logs.join()), false)
    } finally {
      console.warn = originalWarn
    }
    assert.equal(logs.length, 1)
    const entry = JSON.parse(logs[0]) as Record<string, unknown>
    assert.equal(entry.upstreamStatus, status)
    assert.equal(entry.httpStatus, 502)
    assert.equal(logs[0].includes("DH2506KA"), false)
  }
  pass("Redirect 301/302/307/308 → HTTP 502, satu call, body dibatalkan, Location tidak bocor")

  // Upstream 504 transien → retry sukses 200.
  {
    let apiCalls = 0
    globalThis.fetch = async () => {
      apiCalls++
      return apiCalls === 1
        ? new Response(null, { status: 504 })
        : new Response(JSON.stringify(officialApiResponse("DH2506KA")), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
    }
    const response = await callEndpoint(
      { DB: mockDb(), ...API_ENV },
      "DH2506KA",
      "api",
    )
    assert.equal(response.status, 200)
    assert.equal(apiCalls, 2)
    pass("Upstream 504 transien → retry sukses HTTP 200")
  }

  // Abort client timeout → 504 dengan code berbeda, tanpa retry; env timeout malformed tetap aman.
  for (const timeoutEnv of ["abc", "0", "-5", "Infinity", "10abc", "1.5", ""]) {
    let apiCalls = 0
    const originalWarn = console.warn
    console.warn = () => undefined
    globalThis.fetch = async () => {
      apiCalls++
      throw Object.assign(new Error("aborted"), { name: "AbortError" })
    }
    try {
      const response = await callEndpoint(
        { DB: mockDb(), ...API_ENV, NJKB_API_TIMEOUT_MS: timeoutEnv },
        "DH2506KA",
        "api",
      )
      const json = await body(response)
      assert.equal(response.status, 504)
      assert.equal(json.code, "NJKB_CLIENT_TIMEOUT")
      // Malformed env jatuh ke default 8000ms, bukan NaN/0.
      assert.match(String(json.message), /timed out after 8000ms/)
      assert.equal(apiCalls, 1)
    } finally {
      console.warn = originalWarn
    }
  }
  pass("Client abort → HTTP 504 NJKB_CLIENT_TIMEOUT tanpa retry; env timeout malformed → default 8000ms")

  // Upstream 401/403 tidak diteruskan sebagai status auth ke client.
  for (const status of [401, 403]) {
    const originalWarn = console.warn
    console.warn = () => undefined
    globalThis.fetch = async () => new Response(null, { status })
    try {
      const response = await callEndpoint(
        { DB: mockDb(), ...API_ENV },
        "DH2506KA",
        "api",
      )
      assert.equal(response.status, 502)
      assert.equal((await body(response)).code, "NJKB_UPSTREAM_HTTP_ERROR")
    } finally {
      console.warn = originalWarn
    }
  }
  pass("Upstream 401/403 → HTTP 502 aman")

  // Base URL invalid: tidak ada fetch, 500 config error tanpa membocorkan URL/credential.
  {
    let apiCalls = 0
    const logs: string[] = []
    const originalWarn = console.warn
    console.warn = (...args: unknown[]) => logs.push(args.map(String).join(" "))
    globalThis.fetch = async () => {
      apiCalls++
      return new Response(null, { status: 200 })
    }
    try {
      const response = await callEndpoint(
        {
          DB: mockDb(),
          ...API_ENV,
          NJKB_API_BASE_URL: "https://user:hunter2@api.example.test",
        },
        "DH2506KA",
        "api",
      )
      const text = await response.text()
      assert.equal(response.status, 500)
      assert.equal(apiCalls, 0)
      assert.match(text, /NJKB_CONFIG_ERROR/)
      assert.equal(/hunter2|example\.test|test-secret/.test(text + logs.join()), false)
    } finally {
      console.warn = originalWarn
    }
    pass("Base URL invalid → HTTP 500 config error, tanpa fetch dan tanpa bocor credential")
  }

  // source=d1 dengan D1 error: raw Error D1 tidak bocor ke response/log.
  {
    const logs: string[] = []
    const originalWarn = console.warn
    console.warn = (...args: unknown[]) => logs.push(args.map(String).join(" "))
    try {
      const response = await callEndpoint(
        { DB: mockDb({}, true), ...API_ENV },
        "DH2506KA",
        "d1",
      )
      const text = await response.text()
      assert.equal(response.status, 500)
      assert.equal(text.includes("D1 failure"), false)
      assert.match(text, /database D1/)
      assert.equal(logs.join().includes("D1 failure"), false)
      assert.equal(logs.join().includes("DH2506KA"), false)
    } finally {
      console.warn = originalWarn
    }
    pass("Raw D1 error tidak bocor ke response maupun log")
  }

  // Exception tak terduga: log hanya tipe error, bukan message/stack mentah.
  {
    const logs: string[] = []
    const originalError = console.error
    console.error = (...args: unknown[]) => logs.push(args.map(String).join(" "))
    // D1 source menangkap error biasa; nilai yang gagal dikonversi ke string lolos ke catch endpoint.
    const throwingDb = {
      prepare() {
        throw {
          [Symbol.toPrimitive]() {
            throw new Error("raw secret DH2506KA")
          },
        }
      },
    } as unknown as D1DatabaseLike
    try {
      const response = await callEndpoint({ DB: throwingDb }, "DH2506KA", "d1")
      assert.equal(response.status, 500)
      assert.equal((await response.text()).includes("raw secret"), false)
    } finally {
      console.error = originalError
    }
    assert.equal(logs.length, 1)
    assert.equal(/raw secret|DH2506KA/.test(logs[0]), false)
    const entry = JSON.parse(logs[0]) as Record<string, unknown>
    assert.deepEqual(Object.keys(entry).sort(), ["elapsedMs", "errorType", "event"])
    assert.equal(entry.errorType, "object")
    pass("Catch logging tersanitasi")
  }

  // Invalid source dan invalid Nopol tetap 400.
  assert.equal(
    (await callEndpoint({ DB: mockDb(), ...API_ENV }, "DH2506KA", "invalid"))
      .status,
    400,
  )
  assert.equal(
    (await callEndpoint({ DB: mockDb(), ...API_ENV }, "DH", "d1")).status,
    400,
  )
  pass("Invalid source dan Nopol → HTTP 400")
} finally {
  globalThis.fetch = originalFetch
}

console.log("\nSemua NJKB endpoint integration tests: PASS ✓\n")
