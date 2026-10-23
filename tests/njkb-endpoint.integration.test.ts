import assert from "node:assert/strict"
import { onRequestGet } from "../functions/api/njkb/[nopol].ts"
import type { AuthContext } from "../server/types.ts"
import { MODULE_KEYS, type ModuleKey } from "../src/types/auth.ts"
import type { D1DatabaseLike } from "../src/services/vehicle-data/index.ts"

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
  VEHICLE_API_BASE_URL?: string
  VEHICLE_ACCESS_CLIENT_ID?: string
  VEHICLE_ACCESS_CLIENT_SECRET?: string
  VEHICLE_API_TIMEOUT_MS?: string
  NJKB_API_BASE_URL?: string
  NJKB_ACCESS_CLIENT_ID?: string
  NJKB_ACCESS_CLIENT_SECRET?: string
  NJKB_API_TIMEOUT_MS?: string
  CF_ACCESS_CLIENT_ID?: string
  CF_ACCESS_CLIENT_SECRET?: string
  POTENSI_API_KEY?: string
}

const API_ENV = {
  NJKB_API_BASE_URL: "https://api.uptdpenda-kupang.web.id",
  NJKB_ACCESS_CLIENT_ID: "test-client.access",
  NJKB_ACCESS_CLIENT_SECRET: "test-secret",
}

const LEGACY_SOURCES = [undefined, "d1", "api", "d1_then_api", "api_then_d1", "invalid", ""] as const

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

/** Payload pusat lengkap termasuk field sensitif yang TIDAK boleh diteruskan. */
function centralApiResponse(nopol: string) {
  return {
    ...officialApiResponse(nopol),
    vehicle: {
      category: "MOBIL BARANG",
      category_raw: "PICK UP",
      plate_color: "HITAM",
      chassis_number: "MHKA1234567890XYZ",
      engine_number: "ENG-998877",
    },
    registration: { stnk_valid_until: "2031-12-31", plate_color: "MERAH", bpkb_number: "BPKB-1234" },
    owner: { name: "API OWNER", nik: "5371010101010001", address: "JL. RAHASIA NO. 7 KUPANG" },
    njkb: { value: "120000000.00", weight: "1.085000" },
    potensi: { njub: "35000000.00", synced_at: "2026-10-17T03:15:00+08:00" },
    administrative: { origin_upt: "  UPT Pendapatan Daerah Wilayah Kota Kupang  " },
  }
}

/** DB yang menghitung akses; endpoint API-only tidak boleh menyentuhnya. */
function trackingDb(state: { calls: number }): D1DatabaseLike {
  return {
    prepare() {
      state.calls++
      throw new Error("D1 tidak boleh dipakai")
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

function jsonUpstream(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

async function silently<T>(fn: () => Promise<T>): Promise<T> {
  const originalWarn = console.warn
  console.warn = () => undefined
  try {
    return await fn()
  } finally {
    console.warn = originalWarn
  }
}

function pass(name: string) {
  console.log(`  ✓  ${name}`)
}

console.log("Menjalankan NJKB endpoint integration tests (API-only)...\n")
const originalFetch = globalThis.fetch

try {
  // Seluruh nilai ?source lama → API dipanggil, D1 tidak pernah disentuh.
  {
    const d1 = { calls: 0 }
    let apiCalls = 0
    globalThis.fetch = async () => {
      apiCalls++
      return jsonUpstream(officialApiResponse("DH2506KA"))
    }
    for (const source of LEGACY_SOURCES) {
      const before = apiCalls
      const response = await callEndpoint({ DB: trackingDb(d1), ...API_ENV }, "DH2506KA", source)
      const json = await body(response)
      assert.equal(response.status, 200, `source=${source}`)
      assert.equal(json.source, "api")
      assert.equal(apiCalls, before + 1, `source=${source}: tepat satu call API`)
      assert.equal(response.headers.get("Cache-Control"), "private, no-store")
      assert.equal(response.headers.get("Access-Control-Allow-Origin"), null)
    }
    assert.equal(d1.calls, 0)
    pass("?source lama (d1/api/d1_then_api/api_then_d1/invalid/kosong/tanpa) diabaikan → API, D1 tidak disentuh")
  }

  // API not_found (payload & HTTP 404), 504 persisten, network error → final, tanpa D1.
  for (const [failure, expectedStatus] of [
    ["vehicle_not_found", 404],
    ["http_404", 404],
    ["http_504", 504],
    ["network", 502],
    ["http_500", 502],
  ] as const) {
    for (const source of ["d1", "api_then_d1", undefined]) {
      const d1 = { calls: 0 }
      globalThis.fetch = async () => {
        if (failure === "network") throw new TypeError("fetch failed")
        if (failure === "http_504") return new Response("gateway", { status: 504 })
        if (failure === "http_500") return new Response("err", { status: 500 })
        if (failure === "http_404") return new Response(null, { status: 404 })
        return jsonUpstream({
          status: "vehicle_not_found",
          vehicle_status: "not_found",
          njkb_status: null,
          nopol: "DH2506KA",
        })
      }
      const response = await silently(() =>
        callEndpoint({ DB: trackingDb(d1), ...API_ENV }, "DH2506KA", source),
      )
      assert.equal(response.status, expectedStatus, `${failure} source=${source}`)
      assert.equal(d1.calls, 0, `${failure} source=${source}: tanpa fallback D1`)
    }
  }
  pass("API not_found/404 → 404 final; 504/network/500 → 5xx; tidak pernah fallback D1")

  // Tanpa auth → 401 tanpa lookup.
  {
    let calls = 0
    globalThis.fetch = async () => {
      calls++
      return new Response(null, { status: 500 })
    }
    const response = await callEndpoint({ DB: trackingDb({ calls: 0 }), ...API_ENV }, "DH2506KA", "d1", null)
    assert.equal(response.status, 401)
    assert.equal((await body(response)).code, "UNAUTHENTICATED")
    assert.equal(calls, 0)
    pass("Tanpa auth → HTTP 401 UNAUTHENTICATED tanpa lookup")
  }

  // Permission: selalu calculator + vehicle_lookup.api, apa pun ?source.
  {
    let calls = 0
    globalThis.fetch = async () => {
      calls++
      return jsonUpstream(officialApiResponse("DH2506KA"))
    }
    const env = { DB: trackingDb({ calls: 0 }), ...API_ENV }
    const denied: ModuleKey[][] = [
      [],
      ["calculator"],
      ["vehicle_lookup.api"],
      ["calculator", "facility.tembak_ru", "fees.bbn_mutasi"],
    ]
    for (const permissions of denied) {
      for (const source of LEGACY_SOURCES) {
        const response = await callEndpoint(env, "DH2506KA", source, petugasAuth(permissions))
        assert.equal(response.status, 403, `perms=${permissions} source=${source}`)
        const json = await body(response)
        assert.equal(json.code, "FORBIDDEN")
        assert.equal(typeof json.message, "string")
        assert.equal(response.headers.get("Cache-Control"), "no-store")
      }
    }
    assert.equal(calls, 0, "403 tidak memanggil API")

    for (const source of LEGACY_SOURCES) {
      const response = await callEndpoint(
        env,
        "DH2506KA",
        source,
        petugasAuth(["calculator", "vehicle_lookup.api"]),
      )
      assert.equal(response.status, 200, `source=${source}`)
      assert.equal((await body(response)).source, "api")
    }
    pass("Petugas: 403 tanpa calculator+vehicle_lookup.api (semua ?source); 200 bila lengkap")
  }

  // Kontrak endpoint + Access headers; env VEHICLE_* diutamakan atas alias NJKB_*.
  {
    let requestedUrl = ""
    let headers: Record<string, string> = {}
    globalThis.fetch = async (input, init) => {
      requestedUrl = String(input)
      headers = init?.headers as Record<string, string>
      return jsonUpstream(officialApiResponse("DH2506KA"))
    }
    const legacy = await callEndpoint({ DB: trackingDb({ calls: 0 }), ...API_ENV })
    const legacyJson = await body(legacy)
    assert.equal(legacy.status, 200)
    assert.equal(legacyJson.jenis, "MINIBUS")
    assert.equal(legacyJson.njub, 0, "payload tanpa potensi → njub 0")
    assert.equal(legacyJson.warnaPlat, null)
    assert.equal(legacyJson.originUpt, null)
    assert.equal(legacyJson.syncedAt, null)
    assert.equal(requestedUrl, "https://api.uptdpenda-kupang.web.id/api/v1/vehicle/DH2506KA")
    assert.equal(headers["CF-Access-Client-Id"], "test-client.access")
    assert.equal(headers["CF-Access-Client-Secret"], "test-secret")

    const preferred = await callEndpoint({
      DB: trackingDb({ calls: 0 }),
      ...API_ENV,
      VEHICLE_API_BASE_URL: "https://central.example.test/",
      VEHICLE_ACCESS_CLIENT_ID: "new-client.access",
      VEHICLE_ACCESS_CLIENT_SECRET: "new-secret",
    })
    assert.equal(preferred.status, 200)
    assert.equal(requestedUrl, "https://central.example.test/api/v1/vehicle/DH2506KA")
    assert.equal(headers["CF-Access-Client-Id"], "new-client.access")
    assert.equal(headers["CF-Access-Client-Secret"], "new-secret")

    // Nilai VEHICLE_* kosong → alias lama.
    await callEndpoint({ DB: trackingDb({ calls: 0 }), ...API_ENV, VEHICLE_API_BASE_URL: "  " })
    assert.equal(requestedUrl, "https://api.uptdpenda-kupang.web.id/api/v1/vehicle/DH2506KA")

    // CF_ACCESS_* hanya fallback terakhir untuk credential.
    const cfOnly = await callEndpoint({
      DB: trackingDb({ calls: 0 }),
      VEHICLE_API_BASE_URL: "https://central.example.test",
      CF_ACCESS_CLIENT_ID: "cf-client.access",
      CF_ACCESS_CLIENT_SECRET: "cf-secret",
    })
    assert.equal(cfOnly.status, 200)
    assert.equal(headers["CF-Access-Client-Id"], "cf-client.access")
    assert.equal(headers["CF-Access-Client-Secret"], "cf-secret")
    await callEndpoint({
      DB: trackingDb({ calls: 0 }),
      ...API_ENV,
      CF_ACCESS_CLIENT_ID: "cf-client.access",
      CF_ACCESS_CLIENT_SECRET: "cf-secret",
    })
    assert.equal(headers["CF-Access-Client-Id"], "test-client.access", "NJKB_* menang atas CF_ACCESS_*")

    // Pasangan credential dipilih per tier lengkap; tier tidak pernah dicampur.
    for (const partial of [
      { VEHICLE_ACCESS_CLIENT_ID: "new-client.access" },
      { VEHICLE_ACCESS_CLIENT_SECRET: "new-secret" },
      { VEHICLE_ACCESS_CLIENT_ID: "new-client.access", VEHICLE_ACCESS_CLIENT_SECRET: "   " },
    ]) {
      headers = {}
      const response = await callEndpoint({ DB: trackingDb({ calls: 0 }), ...API_ENV, ...partial })
      assert.equal(response.status, 200, JSON.stringify(Object.keys(partial)))
      assert.equal(headers["CF-Access-Client-Id"], "test-client.access", "pasangan lama utuh")
      assert.equal(headers["CF-Access-Client-Secret"], "test-secret", "pasangan lama utuh")
    }

    // Nilai di-trim sebelum dikirim.
    await callEndpoint({
      DB: trackingDb({ calls: 0 }),
      VEHICLE_API_BASE_URL: "  https://central.example.test  ",
      VEHICLE_ACCESS_CLIENT_ID: "  new-client.access ",
      VEHICLE_ACCESS_CLIENT_SECRET: " new-secret  ",
    })
    assert.equal(requestedUrl, "https://central.example.test/api/v1/vehicle/DH2506KA")
    assert.equal(headers["CF-Access-Client-Id"], "new-client.access")
    assert.equal(headers["CF-Access-Client-Secret"], "new-secret")

    // Tidak ada tier lengkap (campuran ID/secret beda tier) → config error tanpa fetch.
    let fetches = 0
    globalThis.fetch = async () => {
      fetches++
      return jsonUpstream(officialApiResponse("DH2506KA"))
    }
    for (const mixed of [
      { VEHICLE_ACCESS_CLIENT_ID: "new-client.access", NJKB_ACCESS_CLIENT_SECRET: "test-secret" },
      { NJKB_ACCESS_CLIENT_ID: "test-client.access", CF_ACCESS_CLIENT_SECRET: "cf-secret" },
      { CF_ACCESS_CLIENT_ID: "cf-client.access", VEHICLE_ACCESS_CLIENT_SECRET: "new-secret" },
      {},
    ]) {
      const response = await silently(() =>
        callEndpoint({
          DB: trackingDb({ calls: 0 }),
          VEHICLE_API_BASE_URL: "https://central.example.test",
          ...mixed,
        }),
      )
      const text = await response.text()
      assert.equal(response.status, 500, JSON.stringify(Object.keys(mixed)))
      assert.equal(JSON.parse(text).code, "NJKB_CONFIG_ERROR")
      assert.equal(/secret|client\.access/.test(text), false)
    }
    assert.equal(fetches, 0, "tanpa pasangan lengkap tidak ada fetch")
    pass("Endpoint resmi + Access headers; pasangan credential per tier lengkap VEHICLE_* > NJKB_* > CF_ACCESS_*, trim, tanpa campuran")
  }

  // Payload pusat: NJUB, bobot 1.085, warna plat, originUpt, syncedAt; tanpa PII.
  {
    globalThis.fetch = async () => jsonUpstream(centralApiResponse("DH2506KA"))
    const response = await callEndpoint({ DB: trackingDb({ calls: 0 }), ...API_ENV })
    const text = await response.text()
    const json = JSON.parse(text) as Record<string, unknown>
    assert.equal(response.status, 200)
    assert.deepEqual(json, {
      nopol: "DH2506KA",
      nama: "API OWNER",
      jenis: "PICK UP",
      jatuhTempoStnk: "2031-12-31",
      jatuhTempoPajak: "2030-12-31",
      njub: 35_000_000,
      warnaPlat: "merah",
      originUpt: "UPT Pendapatan Daerah Wilayah Kota Kupang",
      syncedAt: "2026-10-16T19:15:00.000Z",
      source: "api",
      njkb: 120_000_000,
      bobot: 1.085,
      njkbStatus: "matched",
    })
    for (const forbidden of ["5371010101010001", "RAHASIA", "MHKA1234567890XYZ", "ENG-998877", "BPKB-1234"]) {
      assert.equal(text.includes(forbidden), false, `response memuat ${forbidden}`)
    }

    // njkb_status=not_found tetap meneruskan NJUB (NJKB diisi manual).
    globalThis.fetch = async () =>
      jsonUpstream({ ...centralApiResponse("DH2506KA"), njkb_status: "not_found", njkb: null })
    const nf = await body(await callEndpoint({ DB: trackingDb({ calls: 0 }), ...API_ENV }))
    assert.equal(nf.njkb, 0)
    assert.equal(nf.njub, 35_000_000)
    assert.equal(nf.njkbStatus, "not_found")
    assert.equal(nf.bobot, 1.085)

    // synced_at / origin_upt tidak valid → tetap 200 dengan null (informasi tampilan saja).
    for (const [potensi, administrative] of [
      [{ njub: "35000000.00", synced_at: "bukan-tanggal" }, { origin_upt: "<script>x</script>" }],
      [{ njub: "35000000.00", synced_at: 1_700_000_000 }, { origin_upt: "x".repeat(121) }],
      [{ njub: "35000000.00", synced_at: "2026-02-30T00:00:00Z" }, { origin_upt: 42 }],
    ] as const) {
      globalThis.fetch = async () =>
        jsonUpstream({ ...centralApiResponse("DH2506KA"), potensi, administrative })
      const response = await callEndpoint({ DB: trackingDb({ calls: 0 }), ...API_ENV })
      const json = await body(response)
      assert.equal(response.status, 200)
      assert.equal(json.syncedAt, null)
      assert.equal(json.originUpt, null)
      assert.equal(json.njub, 35_000_000)
    }
    pass("Payload pusat: NJUB 35000000.00, bobot 1.085, warna/originUpt/syncedAt; tanpa NIK/alamat/rangka/BPKB")
  }

  // NJUB invalid / Nopol berbeda / struktur rusak → 502 NJKB_INVALID_PAYLOAD (fail closed).
  {
    const invalidPayloads: Array<[string, unknown]> = [
      ["njub negatif", { ...centralApiResponse("DH2506KA"), potensi: { njub: "-1.00" } }],
      ["njub fraksi", { ...centralApiResponse("DH2506KA"), potensi: { njub: "35000000.50" } }],
      ["njub number", { ...centralApiResponse("DH2506KA"), potensi: { njub: 35000000 } }],
      ["njub teks", { ...centralApiResponse("DH2506KA"), potensi: { njub: "abc" } }],
      ["potensi array", { ...centralApiResponse("DH2506KA"), potensi: [] }],
      ["nopol beda", centralApiResponse("DH9999ZZ")],
      ["nopol hilang", { ...centralApiResponse("DH2506KA"), nopol: undefined }],
      ["payload array", []],
    ]
    for (const [label, payload] of invalidPayloads) {
      globalThis.fetch = async () => jsonUpstream(payload)
      const response = await silently(() => callEndpoint({ DB: trackingDb({ calls: 0 }), ...API_ENV }))
      const text = await response.text()
      assert.equal(response.status, 502, label)
      assert.equal(JSON.parse(text).code, "NJKB_INVALID_PAYLOAD", label)
      assert.equal(/DH9999ZZ|API OWNER|5371010101010001/.test(text), false, label)
    }
    // njub "0.00" valid.
    globalThis.fetch = async () =>
      jsonUpstream({ ...centralApiResponse("DH2506KA"), potensi: { njub: "0.00" } })
    const zero = await callEndpoint({ DB: trackingDb({ calls: 0 }), ...API_ENV })
    assert.equal(zero.status, 200)
    assert.equal((await body(zero)).njub, 0)
    pass("NJUB invalid, Nopol tidak cocok, struktur rusak → 502 NJKB_INVALID_PAYLOAD; njub 0.00 valid")
  }

  // Status referensi NJKB & invalid_request upstream → 502 dengan pesan aman.
  for (const status of ["reference_unavailable", "conflict", "ambiguous"]) {
    globalThis.fetch = async () =>
      jsonUpstream({ ...officialApiResponse("DH2506KA"), njkb_status: status, njkb: null })
    const response = await silently(() => callEndpoint({ DB: trackingDb({ calls: 0 }), ...API_ENV }))
    assert.equal(response.status, 502, status)
    assert.equal(String((await body(response)).message).includes(status), false)
  }
  {
    globalThis.fetch = async () => jsonUpstream({ status: "invalid_request" })
    const response = await silently(() => callEndpoint({ DB: trackingDb({ calls: 0 }), ...API_ENV }))
    assert.equal(response.status, 502)
    assert.equal((await body(response)).code, "NJKB_INVALID_PAYLOAD")
  }
  pass("njkb_status reference_unavailable/conflict/ambiguous dan invalid_request upstream → 502 aman")

  // Warna plat registration → fallback vehicle.
  for (const [registration, vehicle, expected] of [
    ["MERAH", "HITAM", "merah"],
    [undefined, "Hitam", "hitam"],
    ["KUNING", "PUTIH", "putih"],
    ["KUNING", undefined, null],
    [undefined, undefined, null],
  ] as const) {
    globalThis.fetch = async () =>
      jsonUpstream({
        ...officialApiResponse("DH2506KA"),
        registration: { stnk_valid_until: "2031-12-31", plate_color: registration },
        vehicle: { category_raw: "MINIBUS", plate_color: vehicle },
      })
    const response = await callEndpoint({ DB: trackingDb({ calls: 0 }), ...API_ENV })
    assert.equal(response.status, 200)
    assert.equal((await body(response)).warnaPlat, expected, `${registration}/${vehicle}`)
  }
  pass("warnaPlat: registration.plate_color utama, fallback vehicle.plate_color, tak dikenal → null")

  // Regression: upstream 504 persisten → 504, retry sekali, log privat.
  {
    const originalWarn = console.warn
    const originalError = console.error
    const logs: string[] = []
    console.warn = (...args: unknown[]) => logs.push(args.map(String).join(" "))
    console.error = (...args: unknown[]) => logs.push(args.map(String).join(" "))
    const d1 = { calls: 0 }
    let apiCalls = 0
    globalThis.fetch = async () => {
      apiCalls++
      return new Response("<html>origin secret-body</html>", { status: 504 })
    }
    try {
      const response = await callEndpoint(
        { DB: trackingDb(d1), ...API_ENV, NJKB_API_TIMEOUT_MS: "15000" },
        "DH2506KA",
        "d1",
      )
      const json = await body(response)
      assert.equal(response.status, 504)
      assert.equal(json.code, "NJKB_UPSTREAM_TIMEOUT")
      assert.match(String(json.message), /Gateway NJKB/)
      assert.equal(response.headers.get("Cache-Control"), "no-store")
      assert.equal(apiCalls, 2, "504 transien diretry tepat sekali")
      assert.equal(d1.calls, 0)
    } finally {
      console.warn = originalWarn
      console.error = originalError
    }
    assert.equal(logs.length, 1, "Tepat satu entri log")
    const entry = JSON.parse(logs[0]) as Record<string, unknown>
    assert.deepEqual(Object.keys(entry).sort(), ["code", "elapsedMs", "event", "httpStatus", "upstreamStatus"])
    assert.equal(entry.code, "NJKB_UPSTREAM_TIMEOUT")
    assert.equal(entry.httpStatus, 504)
    assert.equal(entry.upstreamStatus, 504)
    for (const forbidden of ["DH2506KA", "uptdpenda", "/api/v1/vehicle", "test-client", "test-secret", "secret-body"]) {
      assert.equal(logs[0].includes(forbidden), false, `log memuat ${forbidden}`)
    }
    pass("Regression: upstream 504 persisten → HTTP 504 + code, tanpa D1, log privat")
  }

  // Redirect 3xx: manual, satu call, body dibatalkan, Location tidak bocor.
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
      const response = await callEndpoint({ DB: trackingDb({ calls: 0 }), ...API_ENV })
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

  // Upstream 504 transien → retry sukses.
  {
    let apiCalls = 0
    globalThis.fetch = async () => {
      apiCalls++
      return apiCalls === 1
        ? new Response(null, { status: 504 })
        : jsonUpstream(officialApiResponse("DH2506KA"))
    }
    const response = await callEndpoint({ DB: trackingDb({ calls: 0 }), ...API_ENV })
    assert.equal(response.status, 200)
    assert.equal(apiCalls, 2)
    pass("Upstream 504 transien → retry sukses HTTP 200")
  }

  // Client abort → 504 tanpa retry; env timeout malformed (lama & baru) → default 8000ms.
  for (const [key, timeoutEnv] of [
    ...["abc", "0", "-5", "Infinity", "10abc", "1.5", ""].map((v) => ["NJKB_API_TIMEOUT_MS", v] as const),
    ["VEHICLE_API_TIMEOUT_MS", "abc"] as const,
  ]) {
    let apiCalls = 0
    globalThis.fetch = async () => {
      apiCalls++
      throw Object.assign(new Error("aborted"), { name: "AbortError" })
    }
    const response = await silently(() =>
      callEndpoint({ DB: trackingDb({ calls: 0 }), ...API_ENV, [key]: timeoutEnv }),
    )
    const json = await body(response)
    assert.equal(response.status, 504)
    assert.equal(json.code, "NJKB_CLIENT_TIMEOUT")
    assert.match(String(json.message), /timed out after 8000ms/)
    assert.equal(apiCalls, 1)
  }
  pass("Client abort → HTTP 504 NJKB_CLIENT_TIMEOUT tanpa retry; env timeout malformed → default 8000ms")

  // Upstream 401/403 → 502 aman.
  for (const status of [401, 403]) {
    globalThis.fetch = async () => new Response(null, { status })
    const response = await silently(() => callEndpoint({ DB: trackingDb({ calls: 0 }), ...API_ENV }))
    assert.equal(response.status, 502)
    assert.equal((await body(response)).code, "NJKB_UPSTREAM_HTTP_ERROR")
  }
  pass("Upstream 401/403 → HTTP 502 aman")

  // Fase 4: POTENSI_API_KEY → Authorization: Bearer, header Access tetap dikirim.
  {
    const API_KEY = "ptn_k7Q2mX9a_" + "B".repeat(43)
    let headers: Record<string, string> = {}
    let apiCalls = 0
    globalThis.fetch = async (_input, init) => {
      apiCalls++
      headers = init?.headers as Record<string, string>
      return jsonUpstream(officialApiResponse("DH2506KA"))
    }

    const withKey = await callEndpoint({ DB: trackingDb({ calls: 0 }), ...API_ENV, POTENSI_API_KEY: ` ${API_KEY} ` })
    assert.equal(withKey.status, 200)
    assert.equal(headers.Authorization, `Bearer ${API_KEY}`)
    assert.equal(headers["CF-Access-Client-Id"], "test-client.access")
    assert.equal(headers["CF-Access-Client-Secret"], "test-secret")

    // Tanpa kunci atau kunci kosong → perilaku lama, tanpa Authorization.
    for (const key of [undefined, "", "   "]) {
      headers = {}
      const response = await callEndpoint({ DB: trackingDb({ calls: 0 }), ...API_ENV, POTENSI_API_KEY: key })
      assert.equal(response.status, 200)
      assert.equal("Authorization" in headers, false, `POTENSI_API_KEY=${JSON.stringify(key)}`)
      assert.equal(headers["CF-Access-Client-Id"], "test-client.access")
    }

    // Kunci saja tanpa credential Access (setelah Fase 5) tetap memanggil API.
    const before = apiCalls
    const keyOnly = await callEndpoint({
      DB: trackingDb({ calls: 0 }),
      VEHICLE_API_BASE_URL: "https://central.example.test",
      POTENSI_API_KEY: API_KEY,
    })
    assert.equal(keyOnly.status, 200)
    assert.equal(apiCalls, before + 1)
    assert.equal(headers.Authorization, `Bearer ${API_KEY}`)
    assert.equal("CF-Access-Client-Id" in headers, false)

    // Kunci tidak pernah bocor ke respons atau log saat gagal.
    const logs: string[] = []
    const originalWarn = console.warn
    console.warn = (...args: unknown[]) => logs.push(args.map(String).join(" "))
    globalThis.fetch = async () => new Response(null, { status: 401 })
    try {
      const failed = await callEndpoint({ DB: trackingDb({ calls: 0 }), ...API_ENV, POTENSI_API_KEY: API_KEY })
      assert.equal(failed.status, 502)
      assert.equal((await failed.text()).includes(API_KEY), false)
      assert.equal(logs.join().includes(API_KEY), false)
    } finally {
      console.warn = originalWarn
    }
    pass("POTENSI_API_KEY → Authorization: Bearer + header Access; kosong = perilaku lama; kunci saja cukup; tidak bocor")
  }

  // Upstream 403 region_not_allowed → HTTP 403 NJKB_REGION_NOT_ALLOWED dengan pesan sendiri.
  {
    globalThis.fetch = async () =>
      jsonUpstream(
        {
          status: "forbidden",
          error: {
            code: "region_not_allowed",
            message: "Kendaraan terdaftar di luar wilayah yang diizinkan untuk kunci ini",
            request_id: "req-rahasia",
          },
        },
        403,
      )
    const response = await silently(() =>
      callEndpoint({ DB: trackingDb({ calls: 0 }), ...API_ENV, POTENSI_API_KEY: "ptn_k7Q2mX9a_x" }),
    )
    const json = await body(response)
    assert.equal(response.status, 403)
    assert.equal(response.headers.get("Cache-Control"), "no-store")
    assert.deepEqual(json, {
      message: "Kendaraan terdaftar di luar wilayah yang diizinkan.",
      code: "NJKB_REGION_NOT_ALLOWED",
    })
    pass("Upstream 403 region_not_allowed → HTTP 403 NJKB_REGION_NOT_ALLOWED, tanpa teks/request_id upstream")
  }

  // Base URL invalid / tidak dikonfigurasi: tanpa fetch, 500 config error tanpa bocor.
  for (const env of [
    { ...API_ENV, NJKB_API_BASE_URL: "https://user:hunter2@api.example.test" },
    { NJKB_ACCESS_CLIENT_ID: "x", NJKB_ACCESS_CLIENT_SECRET: "test-secret" },
  ]) {
    let apiCalls = 0
    const logs: string[] = []
    const originalWarn = console.warn
    console.warn = (...args: unknown[]) => logs.push(args.map(String).join(" "))
    globalThis.fetch = async () => {
      apiCalls++
      return new Response(null, { status: 200 })
    }
    try {
      const d1 = { calls: 0 }
      const response = await callEndpoint({ DB: trackingDb(d1), ...env })
      const text = await response.text()
      assert.equal(response.status, 500)
      assert.equal(apiCalls, 0)
      assert.equal(d1.calls, 0)
      assert.match(text, /NJKB_CONFIG_ERROR/)
      assert.equal(/hunter2|example\.test|test-secret/.test(text + logs.join()), false)
    } finally {
      console.warn = originalWarn
    }
  }
  pass("Base URL invalid/tidak ada → HTTP 500 config error, tanpa fetch/D1 dan tanpa bocor credential")

  // Exception tak terduga: log hanya tipe error.
  {
    const logs: string[] = []
    const originalError = console.error
    console.error = (...args: unknown[]) => logs.push(args.map(String).join(" "))
    globalThis.fetch = async () => {
      throw {
        [Symbol.toPrimitive]() {
          throw new Error("raw secret DH2506KA")
        },
      }
    }
    try {
      const response = await silently(() => callEndpoint({ DB: trackingDb({ calls: 0 }), ...API_ENV }))
      assert.ok(response.status >= 500)
      assert.equal((await response.text()).includes("raw secret"), false)
    } finally {
      console.error = originalError
    }
    assert.equal(logs.every((log) => !/raw secret|DH2506KA/.test(log)), true)
    pass("Error tak terduga tidak membocorkan detail mentah")
  }

  // Invalid Nopol tetap 400; ?source invalid tidak lagi 400 (diabaikan).
  globalThis.fetch = async () => jsonUpstream(officialApiResponse("DH2506KA"))
  assert.equal((await callEndpoint({ DB: trackingDb({ calls: 0 }), ...API_ENV }, "DH", "d1")).status, 400)
  assert.equal(
    (await callEndpoint({ DB: trackingDb({ calls: 0 }), ...API_ENV }, "DH2506KA", "invalid")).status,
    200,
  )
  pass("Nopol invalid → HTTP 400; ?source tidak dikenal diabaikan (200)")
} finally {
  globalThis.fetch = originalFetch
}

console.log("\nSemua NJKB endpoint integration tests: PASS ✓\n")
