import { mapApiResponseToVehicleData } from "./mapper"
import type {
  ApiVehicleDataSourceConfig,
  VehicleDataSource,
  VehicleLookupResult,
} from "./types"
import { normalizeNopol } from "./utils"

export const DEFAULT_TIMEOUT_MS = 8_000
const MAX_TIMEOUT_MS = 60_000
const RETRYABLE_HTTP_STATUSES = new Set([502, 503, 504])

type LookupError = Extract<VehicleLookupResult, { status: "error" }>
type LookupErrorMetadata = Pick<LookupError, "code" | "httpStatus" | "upstreamStatus">

function errorResult(
  message: string,
  metadata: LookupErrorMetadata = {},
): LookupError {
  return {
    status: "error",
    error: message,
    message,
    ...metadata,
  }
}

const CONFIG_ERROR: LookupErrorMetadata = {
  code: "NJKB_CONFIG_ERROR",
  httpStatus: 500,
}
const NETWORK_ERROR: LookupErrorMetadata = {
  code: "NJKB_NETWORK_ERROR",
  httpStatus: 502,
}
const RATE_LIMITED: LookupErrorMetadata = {
  code: "NJKB_UPSTREAM_HTTP_ERROR",
  httpStatus: 502,
  upstreamStatus: 429,
}
const REGION_NOT_ALLOWED: LookupErrorMetadata = {
  code: "NJKB_REGION_NOT_ALLOWED",
  httpStatus: 403,
  upstreamStatus: 403,
}
const REGION_NOT_ALLOWED_MESSAGE =
  "Kendaraan terdaftar di luar wilayah yang diizinkan."

/**
 * Timeout harus integer finite 1..60000 ms. Nilai lain (0, negatif, NaN,
 * Infinity, pecahan) kembali ke default 8000 ms agar setTimeout tidak langsung abort.
 */
export function sanitizeTimeoutMs(value: unknown): number {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= MAX_TIMEOUT_MS
    ? value
    : DEFAULT_TIMEOUT_MS
}

/**
 * Base URL wajib HTTPS tanpa credential, query, atau fragment.
 * HTTP hanya diizinkan untuk loopback development.
 */
export function isValidNjkbBaseUrl(value: string): boolean {
  try {
    const url = new URL(value)
    const isLoopbackHttp =
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    return (
      (url.protocol === "https:" || isLoopbackHttp) &&
      !url.username &&
      !url.password &&
      !value.includes("?") &&
      !value.includes("#")
    )
  } catch {
    return false
  }
}

function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError"
}

/**
 * Batalkan body response yang tidak dibaca agar koneksi dilepas, tanpa membaca isi body.
 * Error pembatalan (mis. stream sudah locked/terpakai) diabaikan secara aman.
 */
export async function discardResponseBody(response: Response): Promise<void> {
  try {
    if (response.body && !response.bodyUsed) {
      await response.body.cancel()
    }
  } catch {
    // Abaikan: pembatalan body bukan bagian dari hasil lookup.
  }
}

/**
 * True bila body 403 JSON berisi `error.code === "region_not_allowed"` (nopol ada,
 * tetapi di luar wilayah UPT kunci API). Body lain dibatalkan tanpa dibaca.
 * AbortError tetap dilempar agar timeout client tidak tertutupi.
 */
async function isRegionNotAllowed(response: Response): Promise<boolean> {
  const contentType = response.headers.get("content-type") ?? ""
  if (!contentType.toLowerCase().includes("application/json")) return false
  try {
    const body: unknown = await response.json()
    if (typeof body !== "object" || body === null) return false
    const error = (body as { error?: unknown }).error
    return (
      typeof error === "object" &&
      error !== null &&
      (error as { code?: unknown }).code === "region_not_allowed"
    )
  } catch (error) {
    if (isAbortError(error)) throw error
    return false
  }
}

function upstreamHttpError(status: number): LookupError {
  if (status === 504) {
    return errorResult(
      "Gateway NJKB mengalami timeout (HTTP 504), bukan timeout client aplikasi.",
      { code: "NJKB_UPSTREAM_TIMEOUT", httpStatus: 504, upstreamStatus: status },
    )
  }
  // Status upstream (termasuk 401/403) tidak diteruskan sebagai status auth ke client.
  return errorResult(`NJKB API mengembalikan status HTTP ${status}.`, {
    code: "NJKB_UPSTREAM_HTTP_ERROR",
    httpStatus: status === 503 ? 503 : 502,
    upstreamStatus: status,
  })
}

/**
 * Parsing header Retry-After (format delta-seconds integer atau HTTP-date).
 */
export function parseRetryAfterSeconds(
  headerValue: string | null | undefined,
): number | null {
  if (!headerValue) return null
  const trimmed = headerValue.trim()
  if (!trimmed) return null

  const asNumber = Number(trimmed)
  if (Number.isInteger(asNumber) && asNumber > 0) {
    return asNumber
  }

  const parsedMs = Date.parse(trimmed)
  if (!isNaN(parsedMs)) {
    const diffSec = Math.ceil((parsedMs - Date.now()) / 1000)
    return diffSec > 0 ? diffSec : null
  }

  return null
}

/**
 * Adapter server-to-server untuk kontrak resmi NJKB API NTT.
 *
 * Kebijakan ketat:
 * - Timeout client default 8 detik (DEFAULT_TIMEOUT_MS = 8_000).
 * - Maksimum 1 retry hanya untuk transient network failure atau HTTP 502/503/504 dengan backoff & jitter.
 * - HTTP 400, 401, 403, 404, 429, 500, dan client timeout tidak diretry.
 * - HTTP 403 `region_not_allowed` menjadi NJKB_REGION_NOT_ALLOWED (HTTP 403); 401/403 lain tetap 502.
 * - Kunci API (`Authorization: Bearer`) dan header Access dikirim bersama selama Fase 4.
 * - HTTP 429 membaca header Retry-After, tidak melakukan retry, dan menahan pemanggilan berikutnya selama durasi tersebut.
 * - Redirect tidak diikuti (redirect: "manual"); 3xx menjadi error aman tanpa retry agar service token tidak diteruskan.
 * - Body response yang tidak dipakai dibatalkan, tidak dibaca.
 * - Zero logging terhadap credential, NOPOL, PII, atau payload response lengkap.
 */
export class ApiVehicleDataSource implements VehicleDataSource {
  readonly name = "api" as const
  private config: ApiVehicleDataSourceConfig
  private rateLimitResetUntil = 0

  constructor(config: ApiVehicleDataSourceConfig = {}) {
    this.config = { ...config, timeoutMs: sanitizeTimeoutMs(config.timeoutMs) }
  }

  private async waitRetryBackoff(attempt: number): Promise<void> {
    const baseDelay = 200 * (attempt + 1)
    const jitter = Math.floor(Math.random() * 100)
    const totalDelay = baseDelay + jitter

    if (this.config.sleepFn) {
      await this.config.sleepFn(totalDelay)
    } else {
      await new Promise((resolve) => setTimeout(resolve, totalDelay))
    }
  }

  async lookup(rawNopol: string): Promise<VehicleLookupResult> {
    const nopol = normalizeNopol(rawNopol)

    if (!nopol || nopol.length < 4 || nopol.length > 12) {
      return errorResult("Nopol tidak valid.")
    }

    // Custom result fetcher hanya untuk unit test abstraction tingkat tinggi.
    if (this.config.fetcher) {
      return this.config.fetcher(nopol)
    }

    // Hormati window Retry-After aktif sebelum membuat request.
    const now = Date.now()
    if (this.rateLimitResetUntil > now) {
      const remainingSec = Math.ceil((this.rateLimitResetUntil - now) / 1000)
      return errorResult(
        `Rate limit sedang aktif. Coba lagi setelah ${remainingSec} detik.`,
        RATE_LIMITED,
      )
    }

    const baseUrl = this.config.baseUrl?.trim()
    const apiKey = this.config.apiKey?.trim()

    if (!baseUrl || !isValidNjkbBaseUrl(baseUrl)) {
      return errorResult(
        "Konfigurasi NJKB API Base URL tidak valid atau belum tersedia.",
        CONFIG_ERROR,
      )
    }
    // Sejak Access dilepas dari API (Fase 5, 2026-10-24) kunci API satu-satunya kredensial.
    if (!apiKey) {
      return errorResult(
        "Kunci API Data Potensi belum dikonfigurasi.",
        CONFIG_ERROR,
      )
    }

    // Endpoint resmi tidak menerima query parameter apa pun.
    const url = `${baseUrl.replace(/\/+$/, "")}/api/v1/vehicle/${encodeURIComponent(nopol)}`
    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
    }
    const timeoutMs = sanitizeTimeoutMs(this.config.timeoutMs)
    const fetchFn = this.config.customFetch ?? fetch

    // Maksimum dua attempt: request awal (attempt 0) + maksimum satu retry transien (attempt 1).
    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)

      try {
        const response = await fetchFn(url, {
          method: "GET",
          headers,
          signal: controller.signal,
          // "manual" mencegah service token diteruskan ke tujuan redirect
          // (termasuk host lain); 3xx ditangani di bawah.
          redirect: "manual",
        })

        // Redirect tidak pernah diikuti/diretry; Location tidak diteruskan atau dilog.
        if (response.status >= 300 && response.status <= 399) {
          await discardResponseBody(response)
          return errorResult(
            `NJKB API mengembalikan status HTTP ${response.status}.`,
            {
              code: "NJKB_UPSTREAM_HTTP_ERROR",
              httpStatus: 502,
              upstreamStatus: response.status,
            },
          )
        }

        if (response.status === 404) {
          await discardResponseBody(response)
          return {
            status: "not_found",
            message: "Data kendaraan tidak ditemukan.",
          }
        }

        // HTTP 429: jangan retry, hormati Retry-After jika ada.
        if (response.status === 429) {
          await discardResponseBody(response)
          const retryAfterSec = parseRetryAfterSeconds(
            response.headers.get("retry-after"),
          )
          if (retryAfterSec !== null && retryAfterSec > 0) {
            this.rateLimitResetUntil = Date.now() + retryAfterSec * 1000
            return errorResult(
              `Rate limit terlampaui. Silakan coba lagi setelah ${retryAfterSec} detik.`,
              RATE_LIMITED,
            )
          }
          return errorResult(
            "Rate limit terlampaui. Silakan coba lagi beberapa saat lagi.",
            RATE_LIMITED,
          )
        }

        // Satu-satunya body error yang dibaca, hanya untuk kode; teks upstream tidak diteruskan.
        if (response.status === 403 && (await isRegionNotAllowed(response))) {
          return errorResult(REGION_NOT_ALLOWED_MESSAGE, REGION_NOT_ALLOWED)
        }

        if (!response.ok) {
          // Jangan parse atau teruskan body error yang dapat memuat detail sensitif.
          await discardResponseBody(response)

          // Hanya HTTP 502, 503, 504 yang boleh diretry maksimum satu kali.
          if (RETRYABLE_HTTP_STATUSES.has(response.status) && attempt === 0) {
            await this.waitRetryBackoff(attempt)
            continue
          }

          return upstreamHttpError(response.status)
        }

        const invalidPayload = errorResult(
          "Response NJKB API bukan JSON yang valid.",
          {
            code: "NJKB_INVALID_PAYLOAD",
            httpStatus: 502,
            upstreamStatus: response.status,
          },
        )

        const contentType = response.headers.get("content-type") ?? ""
        if (!contentType.toLowerCase().includes("application/json")) {
          await discardResponseBody(response)
          return invalidPayload
        }

        let json: unknown
        try {
          json = await response.json()
        } catch (error) {
          if (isAbortError(error)) throw error
          return invalidPayload
        }

        return mapApiResponseToVehicleData(json, nopol)
      } catch (error: unknown) {
        // Client timeout: jangan retry, hentikan langsung.
        if (isAbortError(error)) {
          return errorResult(
            `NJKB API request timed out after ${timeoutMs}ms (timeout client aplikasi).`,
            { code: "NJKB_CLIENT_TIMEOUT", httpStatus: 504 },
          )
        }

        // Transient network error (misal socket disconnect / DNS fail).
        if (isNetworkError(error) && attempt === 0) {
          await this.waitRetryBackoff(attempt)
          continue
        }

        return errorResult(
          "Network error saat menghubungi NJKB API NTT.",
          NETWORK_ERROR,
        )
      } finally {
        clearTimeout(timer)
      }
    }

    return errorResult("Network error saat menghubungi NJKB API NTT.", NETWORK_ERROR)
  }
}
