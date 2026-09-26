/**
 * functions/api/njkb/[nopol].ts
 *
 * Cloudflare Pages Function — GET /api/njkb/:nopol
 *
 * Menggunakan VehicleDataResolver dengan D1VehicleDataSource dan ApiVehicleDataSource (NJKB API NTT).
 * Default mode: d1_then_api.
 *
 * Respons sukses (200):
 * {
 *   "nopol": "DH2506KA",
 *   "nama": "MARTINA GRACEANA ANGKAT",
 *   "jenis": "SEPEDA MOTOR",
 *   "jatuhTempoStnk": "2023-09-13",
 *   "jatuhTempoPajak": "2023-09-13",
 *   "njkb": 11500000,
 *   "njub": 0,
 *   "bobot": 1,
 *   "source": "d1" | "api"
 * }
 *
 * Respons tidak ditemukan (404):
 * { "message": "Data NJKB untuk Nopol tersebut tidak ditemukan." }
 *
 * Respons error validasi (400):
 * { "message": "Nopol tidak valid." }
 */

import {
  ApiVehicleDataSource,
  D1VehicleDataSource,
  VehicleDataResolver,
  type VehicleDataSourceMode,
} from "../../../src/services/vehicle-data/index.ts"

interface Env {
  DB: D1Database
  NJKB_API_BASE_URL?: string
  NJKB_ACCESS_CLIENT_ID?: string
  NJKB_ACCESS_CLIENT_SECRET?: string
  NJKB_API_TIMEOUT_MS?: string
}

const VEHICLE_DATA_SOURCE_MODES: readonly VehicleDataSourceMode[] = [
  "d1",
  "api",
  "d1_then_api",
]

function isVehicleDataSourceMode(value: string): value is VehicleDataSourceMode {
  return VEHICLE_DATA_SOURCE_MODES.includes(value as VehicleDataSourceMode)
}

function jsonResponse(body: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json;charset=UTF-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": status === 200 ? "public, max-age=300" : "no-store",
    },
  })
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const rawNopol = ctx.params["nopol"]
  const nopolParam = Array.isArray(rawNopol) ? rawNopol[0] : rawNopol ?? ""

  // Normalisasi: uppercase, hapus spasi dan karakter non-alfanumerik
  const nopol = nopolParam.toUpperCase().replace(/\s+/g, "").replace(/[^A-Z0-9]/g, "")

  if (!nopol || nopol.length < 4 || nopol.length > 12) {
    return jsonResponse({ message: "Nopol tidak valid." }, 400)
  }

  const sourceParam = new URL(ctx.request.url).searchParams.get("source")
  if (sourceParam !== null && !isVehicleDataSourceMode(sourceParam)) {
    return jsonResponse(
      {
        message:
          "Source tidak valid. Gunakan salah satu: d1, api, atau d1_then_api.",
      },
      400
    )
  }
  const mode: VehicleDataSourceMode = sourceParam ?? "d1_then_api"

  try {
    const d1Source = new D1VehicleDataSource(ctx.env.DB)
    const apiSource = ctx.env.NJKB_API_BASE_URL
      ? new ApiVehicleDataSource({
          baseUrl: ctx.env.NJKB_API_BASE_URL,
          accessClientId: ctx.env.NJKB_ACCESS_CLIENT_ID,
          accessClientSecret: ctx.env.NJKB_ACCESS_CLIENT_SECRET,
          timeoutMs: ctx.env.NJKB_API_TIMEOUT_MS
            ? parseInt(ctx.env.NJKB_API_TIMEOUT_MS, 10)
            : undefined,
        })
      : undefined

    const resolver = new VehicleDataResolver({
      d1Source,
      apiSource,
      mode,
    })

    const result = await resolver.resolve(nopol)

    if (result.status === "found") {
      return jsonResponse(result.data, 200)
    }

    if (result.status === "not_found") {
      return jsonResponse(
        { message: result.message ?? "Data NJKB untuk Nopol tersebut tidak ditemukan." },
        404
      )
    }

    const errorMessage =
      typeof result.error === "string"
        ? result.error
        : (result.error as Error)?.message ??
          result.message ??
          "Terjadi kesalahan server. Coba lagi."

    return jsonResponse({ message: errorMessage }, 500)
  } catch (err) {
    console.error("[/api/njkb] Resolver error:", err)
    return jsonResponse({ message: "Terjadi kesalahan server. Coba lagi." }, 500)
  }
}

// Handle OPTIONS untuk CORS preflight
export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  })
}
