/**
 * Helper HTTP bersama untuk seluruh endpoint `/api`.
 */

import type { ApiErrorCode } from "../src/types/auth.ts"

export const JSON_CONTENT_TYPE = "application/json;charset=UTF-8"
export const MAX_JSON_BODY_BYTES = 16 * 1024

export const SERVER_ERROR_MESSAGE = "Terjadi kesalahan server. Coba lagi."

export function jsonResponse(
  body: unknown,
  status: number = 200,
  headers: HeadersInit = {},
): Response {
  const response = new Response(JSON.stringify(body), { status, headers })
  response.headers.set("Content-Type", JSON_CONTENT_TYPE)
  if (!response.headers.has("Cache-Control")) {
    response.headers.set("Cache-Control", "no-store")
  }
  return response
}

export function errorResponse(
  status: number,
  code: ApiErrorCode,
  message: string,
  headers: HeadersInit = {},
): Response {
  return jsonResponse({ message, code }, status, headers)
}

export function noContent(headers: HeadersInit = {}): Response {
  const response = new Response(null, { status: 204, headers })
  if (!response.headers.has("Cache-Control")) {
    response.headers.set("Cache-Control", "no-store")
  }
  return response
}

export const unauthenticated = (headers: HeadersInit = {}): Response =>
  errorResponse(401, "UNAUTHENTICATED", "Sesi tidak valid. Silakan login kembali.", headers)

export const forbidden = (message = "Anda tidak memiliki akses ke fitur ini."): Response =>
  errorResponse(403, "FORBIDDEN", message)

export const notFound = (message = "Data tidak ditemukan."): Response =>
  errorResponse(404, "NOT_FOUND", message)

export const validationError = (message: string): Response =>
  errorResponse(400, "VALIDATION_ERROR", message)

export const serverError = (): Response =>
  errorResponse(500, "SERVER_ERROR", SERVER_ERROR_MESSAGE)

/**
 * Header keamanan untuk seluruh respons `/api`. Respons yang sudah menyatakan
 * `no-store` (mis. `private, no-store`) dipertahankan; selain itu dipaksa `no-store`.
 */
export function withApiSecurityHeaders(response: Response): Response {
  // Salin agar header selalu mutable (respons dari ctx.next() bisa immutable).
  const copy = new Response(response.body, response)
  const cacheControl = copy.headers.get("Cache-Control")
  if (!cacheControl || !/\bno-store\b/i.test(cacheControl)) {
    copy.headers.set("Cache-Control", "no-store")
  }
  copy.headers.set("X-Content-Type-Options", "nosniff")
  copy.headers.delete("Access-Control-Allow-Origin")
  return copy
}

export type JsonBodyResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; response: Response }

function isJsonContentType(value: string | null): boolean {
  if (!value) return false
  const mediaType = value.split(";", 1)[0].trim().toLowerCase()
  return mediaType === "application/json"
}

/**
 * Membaca body JSON objek dengan batas ukuran. Field tidak dikenal dibiarkan
 * (diabaikan oleh pemanggil). Tidak pernah melempar.
 */
export async function readJsonObject(
  request: Request,
  maxBytes: number = MAX_JSON_BODY_BYTES,
): Promise<JsonBodyResult> {
  if (!isJsonContentType(request.headers.get("Content-Type"))) {
    return {
      ok: false,
      response: errorResponse(
        415,
        "VALIDATION_ERROR",
        "Content-Type harus application/json.",
      ),
    }
  }

  const tooLarge = (): JsonBodyResult => ({
    ok: false,
    response: errorResponse(413, "VALIDATION_ERROR", "Body request terlalu besar."),
  })

  const declared = request.headers.get("Content-Length")
  if (declared !== null) {
    const length = Number(declared)
    if (Number.isFinite(length) && length > maxBytes) return tooLarge()
  }

  let text: string
  try {
    if (!request.body) {
      text = ""
    } else {
      const reader = request.body.getReader()
      const chunks: Uint8Array[] = []
      let total = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        total += value.byteLength
        if (total > maxBytes) {
          await reader.cancel().catch(() => undefined)
          return tooLarge()
        }
        chunks.push(value)
      }
      const merged = new Uint8Array(total)
      let offset = 0
      for (const chunk of chunks) {
        merged.set(chunk, offset)
        offset += chunk.byteLength
      }
      text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(merged)
    }
  } catch {
    return { ok: false, response: validationError("Body request tidak valid.") }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, response: validationError("Body request bukan JSON yang valid.") }
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, response: validationError("Body request harus berupa objek JSON.") }
  }

  return { ok: true, value: parsed as Record<string, unknown> }
}

export function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
}

/** Log terstruktur; pemanggil wajib hanya mengirim field non-sensitif. */
export function logEvent(
  level: "info" | "warn" | "error",
  event: string,
  fields: Record<string, string | number | boolean | null | undefined> = {},
): void {
  const line = JSON.stringify({ event, ...fields })
  if (level === "error") console.error(line)
  else if (level === "warn") console.warn(line)
  else console.info(line)
}
