import { mapApiResponseToVehicleData } from "./mapper"
import type {
  ApiVehicleDataSourceConfig,
  VehicleDataSource,
  VehicleLookupResult,
} from "./types"
import { normalizeNopol } from "./utils"

const DEFAULT_TIMEOUT_MS = 8_000
const RETRYABLE_HTTP_STATUSES = new Set([502, 503, 504])

function errorResult(message: string): VehicleLookupResult {
  return {
    status: "error",
    error: message,
    message,
  }
}

function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError
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
 * - HTTP 429 membaca header Retry-After, tidak melakukan retry, dan menahan pemanggilan berikutnya selama durasi tersebut.
 * - Zero logging terhadap credential, NOPOL, PII, atau payload response lengkap.
 */
export class ApiVehicleDataSource implements VehicleDataSource {
  readonly name = "api" as const
  private config: ApiVehicleDataSourceConfig
  private rateLimitResetUntil = 0

  constructor(config: ApiVehicleDataSourceConfig = {}) {
    this.config = config
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

    // 1. Audit HTTP 429: Hormati window Retry-After aktif sebelum membuat request
    const now = Date.now()
    if (this.rateLimitResetUntil > now) {
      const remainingSec = Math.ceil((this.rateLimitResetUntil - now) / 1000)
      return errorResult(
        `Rate limit sedang aktif. Coba lagi setelah ${remainingSec} detik.`,
      )
    }

    const baseUrl = this.config.baseUrl?.trim()
    const clientId = this.config.accessClientId?.trim()
    const clientSecret = this.config.accessClientSecret?.trim()

    if (!baseUrl) {
      return errorResult("NJKB API Base URL belum dikonfigurasi.")
    }
    if (!clientId || !clientSecret) {
      return errorResult("Cloudflare Access credential belum dikonfigurasi.")
    }

    // Endpoint resmi tidak menerima query parameter apa pun.
    const url = `${baseUrl.replace(/\/+$/, "")}/api/v1/vehicle/${encodeURIComponent(nopol)}`
    const headers: Record<string, string> = {
      Accept: "application/json",
      "CF-Access-Client-Id": clientId,
      "CF-Access-Client-Secret": clientSecret,
    }
    const timeoutMs = this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS
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
        })

        if (response.status === 404) {
          return {
            status: "not_found",
            message: "Data kendaraan tidak ditemukan.",
          }
        }

        // Penanganan khusus HTTP 429: Jangan retry berulang, hormati Retry-After jika ada
        if (response.status === 429) {
          const retryAfterSec = parseRetryAfterSeconds(
            response.headers.get("retry-after"),
          )
          if (retryAfterSec !== null && retryAfterSec > 0) {
            this.rateLimitResetUntil = Date.now() + retryAfterSec * 1000
            return errorResult(
              `Rate limit terlampaui. Silakan coba lagi setelah ${retryAfterSec} detik.`,
            )
          }
          return errorResult(
            "Rate limit terlampaui. Silakan coba lagi beberapa saat lagi.",
          )
        }

        if (!response.ok) {
          // Hanya HTTP 502, 503, 504 yang boleh diretry maksimum satu kali
          if (RETRYABLE_HTTP_STATUSES.has(response.status) && attempt === 0) {
            await this.waitRetryBackoff(attempt)
            continue
          }

          // Jangan parse atau teruskan response HTML/body error yang dapat memuat detail sensitif.
          return errorResult(
            `NJKB API mengembalikan status HTTP ${response.status}.`,
          )
        }

        const contentType = response.headers.get("content-type") ?? ""
        if (!contentType.toLowerCase().includes("application/json")) {
          return errorResult("Response NJKB API bukan JSON yang valid.")
        }

        let json: unknown
        try {
          json = await response.json()
        } catch {
          return errorResult("Response NJKB API bukan JSON yang valid.")
        }

        return mapApiResponseToVehicleData(json, nopol)
      } catch (error: unknown) {
        // Client timeout: Jangan retry, hentikan langsung
        if (error instanceof Error && error.name === "AbortError") {
          return errorResult(
            `NJKB API request timed out after ${timeoutMs}ms.`,
          )
        }

        // Transient network error (misal socket disconnect / DNS fail)
        if (isNetworkError(error) && attempt === 0) {
          await this.waitRetryBackoff(attempt)
          continue
        }

        return errorResult("Network error saat menghubungi NJKB API NTT.")
      } finally {
        clearTimeout(timer)
      }
    }

    return errorResult("Network error saat menghubungi NJKB API NTT.")
  }
}
