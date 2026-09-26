import assert from "node:assert/strict"
import { onRequestGet } from "../functions/api/njkb/[nopol].ts"
import type { D1DatabaseLike, VehicleRow } from "../src/services/vehicle-data/index.ts"

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
    vehicle: { category: "MOBIL PENUMPANG" },
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
): Promise<Response> {
  const url = new URL(`https://consumer.test/api/njkb/${nopol}`)
  if (source !== undefined) url.searchParams.set("source", source)
  return onRequestGet({
    request: new Request(url),
    params: { nopol },
    env,
    data: {},
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
  // Default d1_then_api: D1 found, API tidak dipanggil.
  {
    let apiCalls = 0
    globalThis.fetch = async () => {
      apiCalls++
      return new Response(null, { status: 500 })
    }
    const response = await callEndpoint({
      DB: mockDb({ DH2506KA: d1Row }),
      ...API_ENV,
    })
    const json = await body(response)
    assert.equal(response.status, 200)
    assert.equal(json.source, "d1")
    assert.equal(apiCalls, 0)
    pass("default d1_then_api: D1 found → API tidak dipanggil")
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
