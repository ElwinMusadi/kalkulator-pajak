/**
 * src/lib/http.ts — Client HTTP bersama untuk endpoint /api.
 *
 * Sesi disimpan pada cookie HttpOnly yang dikelola server; frontend tidak
 * pernah membaca atau menyimpan token. Seluruh request memakai
 * `credentials: "same-origin"` agar cookie ikut terkirim.
 */

import type { ApiErrorBody } from "@/types/auth"

export const API_BASE_URL: string = import.meta.env?.VITE_API_BASE_URL ?? ""

/** Event global saat server menyatakan sesi tidak ada/berakhir (HTTP 401). */
export const AUTH_UNAUTHENTICATED_EVENT = "auth:unauthenticated"

export const NETWORK_ERROR_CODE = "NETWORK_ERROR"

const DEFAULT_STATUS_MESSAGES: Record<number, string> = {
  400: "Data yang dikirim tidak valid.",
  401: "Sesi Anda telah berakhir. Silakan login kembali.",
  403: "Anda tidak memiliki izin untuk tindakan ini.",
  404: "Data tidak ditemukan.",
  409: "Permintaan bertentangan dengan data saat ini.",
  415: "Format permintaan tidak didukung.",
  429: "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.",
}

const SERVER_ERROR_MESSAGE =
  "Server sedang mengalami gangguan. Coba lagi beberapa saat."
const NETWORK_ERROR_MESSAGE =
  "Tidak dapat terhubung ke server. Periksa koneksi internet Anda."

export class ApiError extends Error {
  readonly status: number
  readonly code: string | undefined

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.code = code
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

/** Membaca body error JSON `{ message, code }` dengan fallback aman. */
export async function readApiError(res: Response): Promise<ApiError> {
  let body: Partial<ApiErrorBody> | null = null
  try {
    body = (await res.json()) as Partial<ApiErrorBody>
  } catch {
    body = null
  }

  const message =
    typeof body?.message === "string" && body.message.trim()
      ? body.message
      : defaultMessageForStatus(res.status)
  const code = typeof body?.code === "string" ? body.code : undefined
  return new ApiError(message, res.status, code)
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

  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}${path}`, init)
  } catch (error) {
    if (isAbortError(error)) throw error
    throw new ApiError(NETWORK_ERROR_MESSAGE, 0, NETWORK_ERROR_CODE)
  }

  if (!res.ok) {
    const error = await readApiError(res)
    if (res.status === 401 && notifyOnUnauthenticated) notifyUnauthenticated()
    throw error
  }

  if (res.status === 204) return undefined as T

  try {
    return (await res.json()) as T
  } catch {
    throw new ApiError(SERVER_ERROR_MESSAGE, res.status, "INVALID_RESPONSE")
  }
}
