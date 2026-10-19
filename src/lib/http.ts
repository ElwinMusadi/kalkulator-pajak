/**
 * src/lib/http.ts — Client HTTP bersama untuk endpoint /api.
 *
 * Sesi disimpan pada cookie HttpOnly yang dikelola server; frontend tidak
 * pernah membaca atau menyimpan token. Seluruh request memakai
 * `credentials: "same-origin"` agar cookie ikut terkirim.
 */

import type { ApiErrorBody } from "@/types/auth"

/**
 * Base URL API. Sesi berbasis cookie same-origin (`__Host-`, SameSite=Strict)
 * dan pemeriksaan Origin (CSRF) mengharuskan API berada di origin yang sama.
 * Saat `npm run dev`, nilai VITE_API_BASE_URL diabaikan: request /api relatif
 * dan diteruskan proxy Vite ke `wrangler pages dev` (lihat vite.config.ts).
 */
export const API_BASE_URL: string = import.meta.env?.DEV
  ? ""
  : (import.meta.env?.VITE_API_BASE_URL ?? "")

/** Event global saat server menyatakan sesi tidak ada/berakhir (HTTP 401). */
export const AUTH_UNAUTHENTICATED_EVENT = "auth:unauthenticated"

export const NETWORK_ERROR_CODE = "NETWORK_ERROR"
/** Respons sukses yang bukan objek JSON valid. */
export const INVALID_RESPONSE_CODE = "INVALID_RESPONSE"
/** Batas waktu sisi klien terlampaui (status 0, bukan respons server). */
export const CLIENT_TIMEOUT_CODE = "CLIENT_TIMEOUT"

const DEFAULT_STATUS_MESSAGES: Record<number, string> = {
  400: "Data yang dikirim tidak valid.",
  401: "Sesi Anda telah berakhir. Silakan login kembali.",
  403: "Anda tidak memiliki izin untuk tindakan ini.",
  404: "Data tidak ditemukan.",
  408: "Permintaan melebihi batas waktu. Coba lagi.",
  409: "Permintaan bertentangan dengan data saat ini.",
  415: "Format permintaan tidak didukung.",
  429: "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.",
}

const SERVER_ERROR_MESSAGE =
  "Server sedang mengalami gangguan. Coba lagi beberapa saat."
const NETWORK_ERROR_MESSAGE =
  "Tidak dapat terhubung ke server. Periksa koneksi internet Anda."
const CLIENT_TIMEOUT_MESSAGE =
  "Server terlalu lama merespons. Periksa koneksi internet Anda lalu coba lagi."

/**
 * Metadata diagnostik aman untuk ditampilkan/dilaporkan. Tidak pernah memuat
 * body mentah, URL, nopol, cookie, atau token.
 */
export interface ApiErrorDiagnostics {
  kind: "http" | "network" | "timeout" | "invalid_response"
  /** Status HTTP; 0 bila tidak ada respons (jaringan/timeout). */
  status: number
  /**
   * Kode error dari klien atau backend (hanya lolos pola karakter, belum
   * di-allowlist). UI wajib memakai allowlist sebelum menampilkannya.
   */
  code?: string
  /** `cf-ray` tersanitasi (`<16 hex>` atau `<16 hex>-<COLO>`). */
  rayId?: string
  /** Durasi total sejak request pertama, termasuk percobaan ulang. */
  elapsedMs: number
  attempts: number
  /**
   * True hanya untuk 5xx yang bukan respons JSON (mis. halaman HTML/body
   * kosong dari edge/proxy). Respons JSON backend selalu false walau tanpa
   * `code`/`message`.
   */
  edge: boolean
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string | undefined
  readonly diagnostics: ApiErrorDiagnostics | undefined

  constructor(
    message: string,
    status: number,
    code?: string,
    diagnostics?: ApiErrorDiagnostics,
  ) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.code = code
    this.diagnostics = diagnostics
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

export function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "AbortError"
  )
}

/** AbortError standar (DOMException bila tersedia). */
export function createAbortError(): Error {
  if (typeof DOMException === "function") {
    return new DOMException("The operation was aborted.", "AbortError")
  }
  const error = new Error("The operation was aborted.")
  error.name = "AbortError"
  return error
}

/**
 * True bila pengguna wajar menekan "Coba lagi" (gangguan sementara).
 * Izin/validasi/not-found (400/401/403/404/409/...) bukan kandidat.
 */
export function isRetryableByUser(error: unknown): boolean {
  if (!isApiError(error)) return false
  if (error.code === INVALID_RESPONSE_CODE) return true
  const { status } = error
  return status === 0 || status === 408 || status === 429 || status >= 500
}

interface ErrorMeta {
  elapsedMs?: number
  attempts?: number
}

function metaOf(meta: ErrorMeta | undefined): { elapsedMs: number; attempts: number } {
  return {
    elapsedMs: Math.max(0, Math.round(meta?.elapsedMs ?? 0)),
    attempts: Math.max(1, Math.floor(meta?.attempts ?? 1)),
  }
}

/** Error jaringan ternormalisasi (fetch ditolak tanpa respons). */
export function createNetworkError(meta?: ErrorMeta): ApiError {
  return new ApiError(NETWORK_ERROR_MESSAGE, 0, NETWORK_ERROR_CODE, {
    kind: "network",
    status: 0,
    code: NETWORK_ERROR_CODE,
    edge: false,
    ...metaOf(meta),
  })
}

/** Timeout sisi klien (status 0). */
export function createClientTimeoutError(meta?: ErrorMeta): ApiError {
  return new ApiError(CLIENT_TIMEOUT_MESSAGE, 0, CLIENT_TIMEOUT_CODE, {
    kind: "timeout",
    status: 0,
    code: CLIENT_TIMEOUT_CODE,
    edge: false,
    ...metaOf(meta),
  })
}

/** Respons sukses yang tidak dapat dipakai (bukan objek JSON). */
export function createInvalidResponseError(
  res: Response,
  meta?: ErrorMeta,
): ApiError {
  const rayId = sanitizeCfRay(res.headers.get("cf-ray"))
  return new ApiError(SERVER_ERROR_MESSAGE, res.status, INVALID_RESPONSE_CODE, {
    kind: "invalid_response",
    status: res.status,
    code: INVALID_RESPONSE_CODE,
    edge: false,
    ...(rayId ? { rayId } : {}),
    ...metaOf(meta),
  })
}

const CF_RAY_PATTERN = /^([0-9a-f]{16})(?:-([a-z]{3}))?$/i

/** `cf-ray` hanya diterima bila tepat 16 hex + opsional `-COLO`; selain itu dibuang. */
export function sanitizeCfRay(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") return undefined
  const match = CF_RAY_PATTERN.exec(value.trim())
  if (!match) return undefined
  const id = match[1].toLowerCase()
  return match[2] ? `${id}-${match[2].toUpperCase()}` : id
}

const SAFE_CODE_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/

/** `application/json` atau `application/*+json`. */
export function isJsonContentType(value: string | null): boolean {
  if (!value) return false
  const mediaType = value.split(";", 1)[0].trim().toLowerCase()
  return mediaType === "application/json" || /^application\/[a-z0-9.!#$&^_-]+\+json$/.test(mediaType)
}

function discardBody(res: Response): void {
  try {
    void res.body?.cancel().catch(() => undefined)
  } catch {
    // body sudah terkunci/terbaca; abaikan.
  }
}

/** Memberi tahu AuthProvider bahwa sesi sudah tidak berlaku. Aman di Node. */
export function notifyUnauthenticated(): void {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") {
    return
  }
  window.dispatchEvent(new Event(AUTH_UNAUTHENTICATED_EVENT))
}

export function defaultMessageForStatus(status: number): string {
  if (status >= 500) return SERVER_ERROR_MESSAGE
  return DEFAULT_STATUS_MESSAGES[status] ?? "Permintaan gagal diproses."
}

const MAX_BACKEND_MESSAGE_LENGTH = 500

export interface ReadApiErrorOptions extends ErrorMeta {
  /** Bila sudah dibatalkan setelah body dibaca, AbortError dilempar. */
  signal?: AbortSignal
}

/**
 * Membaca body error JSON `{ message, code }` dengan fallback aman.
 *
 * - Body hanya di-parse bila Content-Type `application/json`/`+json`;
 *   body lain (HTML edge/proxy) tidak pernah dibaca atau ditampilkan.
 * - AbortError saat membaca body dilempar ulang (bukan ApiError fallback).
 * - `diagnostics.edge` true hanya untuk 5xx yang bukan respons JSON.
 */
export async function readApiError(
  res: Response,
  options: ReadApiErrorOptions = {},
): Promise<ApiError> {
  let body: Partial<ApiErrorBody> | undefined
  const isJson = isJsonContentType(res.headers.get("Content-Type"))
  if (isJson) {
    let parsed: unknown
    try {
      parsed = await res.json()
    } catch (error) {
      if (isAbortError(error)) throw error
      parsed = undefined
    }
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      body = parsed as Partial<ApiErrorBody>
    }
  } else {
    discardBody(res)
  }
  if (options.signal?.aborted) throw createAbortError()

  const backendMessage = body?.message
  const message =
    typeof backendMessage === "string" &&
    backendMessage.trim() &&
    backendMessage.length <= MAX_BACKEND_MESSAGE_LENGTH
      ? backendMessage
      : defaultMessageForStatus(res.status)
  const code =
    typeof body?.code === "string" && SAFE_CODE_PATTERN.test(body.code)
      ? body.code
      : undefined
  const rayId = sanitizeCfRay(res.headers.get("cf-ray"))

  return new ApiError(message, res.status, code, {
    kind: "http",
    status: res.status,
    ...(code ? { code } : {}),
    ...(rayId ? { rayId } : {}),
    // Konservatif: body ber-Content-Type JSON (walau rusak/tanpa message)
    // dianggap berasal dari backend sehingga tidak memenuhi syarat retry edge.
    edge: res.status >= 500 && !isJson,
    ...metaOf(options),
  })
}

interface ApiRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"
  body?: unknown
  signal?: AbortSignal
  /**
   * Bila true (default), respons 401 memicu event `auth:unauthenticated`.
   * Dimatikan untuk /api/auth/login dan /api/auth/me karena 401 di sana
   * merupakan bagian alur normal, bukan sesi yang dihapus.
   */
  notifyOnUnauthenticated?: boolean
  /** Header tambahan (Accept/Content-Type tetap dikelola helper ini). */
  headers?: Record<string, string>
}

export async function apiRequest<T>(
  path: string,
  {
    method = "GET",
    body,
    signal,
    notifyOnUnauthenticated = true,
    headers: extraHeaders,
  }: ApiRequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { ...extraHeaders, Accept: "application/json" }
  const init: RequestInit = {
    method,
    headers,
    signal,
    credentials: "same-origin",
    cache: "no-store",
  }

  if (body !== undefined) {
    headers["Content-Type"] = "application/json"
    init.body = JSON.stringify(body)
  }

  // Tanpa retry otomatis: endpoint ini umumnya mutasi (login/logout/admin).
  const startedAt = Date.now()
  const elapsed = () => Date.now() - startedAt

  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}${path}`, init)
  } catch (error) {
    if (isAbortError(error)) throw error
    if (signal?.aborted) throw createAbortError()
    throw createNetworkError({ elapsedMs: elapsed() })
  }

  if (!res.ok) {
    const read = await readApiError(res, { signal })
    // Durasi dihitung setelah body error terbaca agar latensi body ikut tercatat.
    const error = read.diagnostics
      ? new ApiError(read.message, read.status, read.code, {
          ...read.diagnostics,
          ...metaOf({ elapsedMs: elapsed() }),
        })
      : read
    if (res.status === 401 && notifyOnUnauthenticated) notifyUnauthenticated()
    throw error
  }

  if (res.status === 204) return undefined as T

  try {
    return (await res.json()) as T
  } catch (error) {
    if (isAbortError(error)) throw error
    if (signal?.aborted) throw createAbortError()
    throw createInvalidResponseError(res, { elapsedMs: elapsed() })
  }
}
