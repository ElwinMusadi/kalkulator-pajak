/**
 * functions/api/njkb/[nopol].ts
 *
 * Cloudflare Pages Function — GET /api/njkb/:nopol
 *
 * Satu-satunya sumber produksi: API Data Kendaraan pusat (ApiVehicleDataSource).
 * Tidak ada fallback D1. Nama endpoint `/api/njkb` dipertahankan agar client
 * dan cache lama tetap kompatibel. Query `?source=` lama (d1, api, d1_then_api,
 * api_then_d1, atau nilai lain) DIABAIKAN: lookup selalu melalui API.
 *
 * Respons sukses (200):
 * {
 *   "nopol": "DH2506KA",
 *   "nama": "MARTINA GRACEANA ANGKAT",
 *   "jenis": "SEPEDA MOTOR",
 *   "jatuhTempoStnk": "2023-09-13",
 *   "jatuhTempoPajak": "2023-09-13",
 *   "njkb": 11500000,          // 0 bila njkbStatus=not_found (isi manual)
 *   "njub": 0,                 // potensi.njub; tidak ada → 0
 *   "bobot": 1,
 *   "warnaPlat": "putih" | "hitam" | "merah" | null,
 *   "originUpt": string | null, // label UPT asal (bukan alamat)
 *   "syncedAt": string | null,  // ISO-8601 UTC sinkronisasi dataset pusat
 *   "source": "api",
 *   "njkbStatus": "matched" | "not_found"
 * }
 *
 * 404: { "message": "Data kendaraan tidak ditemukan." }
 * 400: { "message": "Nopol tidak valid." }
 * 401/403: { message, code: "UNAUTHENTICATED" | "FORBIDDEN" }
 * 403: { message, code: "NJKB_REGION_NOT_ALLOWED" } — nopol di luar wilayah kunci API.
 * 5xx: { message, code? } — code NJKB_* (lihat VehicleLookupErrorCode).
 */

import { ApiVehicleDataSource } from "../../../src/services/vehicle-data/index.ts"
import { hasModules, VEHICLE_LOOKUP_REQUIRED_MODULES } from "../../../server/auth/permissions.ts"
import type { AppFunction, Env } from "../../../server/types.ts"

/*
 * Akses (auth via _middleware.ts → ctx.data.auth):
 * - 401 UNAUTHENTICATED bila tidak ada sesi.
 * - 403 FORBIDDEN bila tidak memiliki modul calculator + vehicle_lookup.api
 *   (tidak bergantung pada `?source`).
 */

const DEFAULT_ERROR_MESSAGE = "Terjadi kesalahan server. Coba lagi."

function jsonResponse(body: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json;charset=UTF-8",
      // Data per-user di balik autentikasi: jangan pernah di-cache shared/browser.
      "Cache-Control": status === 200 ? "private, no-store" : "no-store",
    },
  })
}

/** Nilai env pertama yang tidak kosong setelah trim: VEHICLE_* baru → alias NJKB_* lama. */
function envValue(...candidates: Array<string | undefined>): string | undefined {
  for (const value of candidates) {
    const trimmed = value?.trim()
    if (trimmed) return trimmed
  }
  return undefined
}

interface AccessCredentialPair {
  accessClientId: string
  accessClientSecret: string
}

/**
 * Pilih pasangan credential Access dari tier pertama yang LENGKAP (ID dan
 * secret tidak kosong): VEHICLE_* → NJKB_* → CF_ACCESS_* (lokal). Nilai dari
 * tier berbeda tidak pernah dicampur; tanpa pasangan lengkap → undefined
 * (tanpa POTENSI_API_KEY juga, adapter mengembalikan NJKB_CONFIG_ERROR tanpa fetch).
 */
function selectAccessCredentials(env: Env): AccessCredentialPair | undefined {
  const tiers: Array<[string | undefined, string | undefined]> = [
    [env.VEHICLE_ACCESS_CLIENT_ID, env.VEHICLE_ACCESS_CLIENT_SECRET],
    [env.NJKB_ACCESS_CLIENT_ID, env.NJKB_ACCESS_CLIENT_SECRET],
    [env.CF_ACCESS_CLIENT_ID, env.CF_ACCESS_CLIENT_SECRET],
  ]
  for (const [id, secret] of tiers) {
    const accessClientId = id?.trim()
    const accessClientSecret = secret?.trim()
    if (accessClientId && accessClientSecret) return { accessClientId, accessClientSecret }
  }
  return undefined
}

function createVehicleApiSource(env: Env): ApiVehicleDataSource {
  const timeoutRaw = envValue(env.VEHICLE_API_TIMEOUT_MS, env.NJKB_API_TIMEOUT_MS)
  return new ApiVehicleDataSource({
    baseUrl: envValue(env.VEHICLE_API_BASE_URL, env.NJKB_API_BASE_URL),
    ...selectAccessCredentials(env),
    // Kunci API Data Potensi; header CF Access tetap dikirim sampai Access dilepas (Fase 5).
    apiKey: envValue(env.POTENSI_API_KEY),
    // Number (bukan parseInt) agar "10abc" ditolak; adapter menyanitasi ke default 8000.
    timeoutMs: timeoutRaw === undefined ? undefined : Number(timeoutRaw),
  })
}

export const onRequestGet: AppFunction<"nopol"> = async (ctx) => {
  const auth = ctx.data.auth
  if (!auth) {
    return jsonResponse(
      { message: "Sesi tidak valid. Silakan login kembali.", code: "UNAUTHENTICATED" },
      401,
    )
  }

  const rawNopol = ctx.params["nopol"]
  const nopolParam = Array.isArray(rawNopol) ? rawNopol[0] : rawNopol ?? ""

  // Normalisasi: uppercase, hapus spasi dan karakter non-alfanumerik
  const nopol = nopolParam.toUpperCase().replace(/\s+/g, "").replace(/[^A-Z0-9]/g, "")

  if (!nopol || nopol.length < 4 || nopol.length > 12) {
    return jsonResponse({ message: "Nopol tidak valid." }, 400)
  }

  // `?source` lama sengaja tidak dibaca: otorisasi dan sumber selalu API.
  if (!hasModules(auth.user, VEHICLE_LOOKUP_REQUIRED_MODULES)) {
    return jsonResponse(
      {
        message: "Anda tidak memiliki akses ke pencarian Data Kendaraan.",
        code: "FORBIDDEN",
      },
      403,
    )
  }

  const startedAt = Date.now()

  try {
    const result = await createVehicleApiSource(ctx.env).lookup(nopol)

    if (result.status === "found") {
      return jsonResponse(result.data, 200)
    }

    if (result.status === "not_found") {
      return jsonResponse(
        { message: result.message ?? "Data kendaraan tidak ditemukan." },
        404
      )
    }

    // Prioritaskan message aman; Error mentah tidak pernah diteruskan.
    const errorMessage =
      result.message ??
      (typeof result.error === "string" ? result.error : undefined) ??
      DEFAULT_ERROR_MESSAGE
    const httpStatus = result.httpStatus ?? 500

    // Satu entri diagnostik terstruktur tanpa NOPOL, URL, host, credential, atau body.
    console.warn(
      JSON.stringify({
        event: "njkb_lookup_failed",
        code: result.code ?? "NJKB_LOOKUP_ERROR",
        httpStatus,
        ...(result.upstreamStatus !== undefined
          ? { upstreamStatus: result.upstreamStatus }
          : {}),
        elapsedMs: Date.now() - startedAt,
      }),
    )

    return jsonResponse(
      result.code
        ? { message: errorMessage, code: result.code }
        : { message: errorMessage },
      httpStatus,
    )
  } catch (err) {
    // Hanya typeof; name/message/stack dapat dikontrol pihak lain dan memuat detail sensitif.
    console.error(
      JSON.stringify({
        event: "njkb_resolver_exception",
        errorType: typeof err,
        elapsedMs: Date.now() - startedAt,
      }),
    )
    return jsonResponse({ message: DEFAULT_ERROR_MESSAGE }, 500)
  }
}
