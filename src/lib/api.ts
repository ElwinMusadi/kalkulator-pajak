/**
 * src/lib/api.ts — Client untuk Cloudflare Pages Function
 */

// Relatif (bukan alias "@/"): modul ini juga diimpor test Node via tsx.
import type { VehicleData, VehicleDataSourceMode } from "../types/tax"
import {
  API_BASE_URL,
  ApiError,
  createAbortError,
  createClientTimeoutError,
  createInvalidResponseError,
  createNetworkError,
  isAbortError,
  isJsonContentType,
  notifyUnauthenticated,
  readApiError,
} from "./http"

/** Batas waktu total lookup, termasuk seluruh percobaan, backoff, dan baca body. */
export const VEHICLE_LOOKUP_TIMEOUT_MS = 25_000
/** Maksimal percobaan per lookup (1 request awal + 1 retry otomatis). */
export const VEHICLE_LOOKUP_MAX_ATTEMPTS = 2
export const VEHICLE_LOOKUP_RETRY_DELAY_MIN_MS = 400
export const VEHICLE_LOOKUP_RETRY_DELAY_MAX_MS = 600
/** Retry hanya dimulai bila sisa waktu menuju deadline minimal sebesar ini. */
export const VEHICLE_LOOKUP_MIN_REMAINING_FOR_RETRY_MS = 9_000

/** Status edge/proxy sementara yang boleh di-retry bila tanpa body JSON backend. */
const EDGE_RETRYABLE_STATUSES = new Set([502, 503, 504])

type TimerHandle = unknown

/** Opsi injeksi (terutama untuk test). Semua opsional; default = perilaku produksi. */
export interface VehicleLookupClientOptions {
  fetch?: typeof fetch
  now?: () => number
  setTimer?: (callback: () => void, ms: number) => TimerHandle
  clearTimer?: (handle: TimerHandle) => void
  /** Sumber acak [0, 1) untuk jitter backoff. */
  random?: () => number
  timeoutMs?: number
  retryDelayMinMs?: number
  retryDelayMaxMs?: number
  minRemainingForRetryMs?: number
}

export interface VehicleLookupClient {
  fetchVehicleByNopol(
    nopol: string,
    source?: VehicleDataSourceMode | null,
    signal?: AbortSignal,
  ): Promise<VehicleData | null>
}

function normalizeNopol(nopol: string): string {
  return nopol.toUpperCase().replace(/\s+/g, "").replace(/[^A-Z0-9]/g, "")
}

function nonNegative(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback
}

function isNetworkTypeError(error: unknown): boolean {
  return (
    error instanceof TypeError ||
    (typeof error === "object" &&
      error !== null &&
      (error as { name?: unknown }).name === "TypeError")
  )
}

function isKnownOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false
}

/**
 * Membuat client lookup kendaraan. Kebijakan:
 * - Satu deadline total (default 25 detik) mencakup fetch, baca body, dan backoff;
 *   tetap berlaku walau fetch/body tidak menghormati abort (race).
 * - Maksimal 2 percobaan. Retry otomatis HANYA untuk TypeError jaringan, atau
 *   502/503/504 tanpa body JSON backend (`diagnostics.edge`). Tidak pernah untuk
 *   401/403/404/429, error JSON backend (dengan/tanpa `code`), 5xx lain,
 *   respons sukses tidak valid, atau setelah dibatalkan.
 * - Backoff acak 400–600 ms (dapat dibatalkan), hanya bila sisa deadline ≥ 9 detik.
 * - Abort pemanggil kapan pun → selalu AbortError. Deadline → ApiError
 *   `CLIENT_TIMEOUT` berstatus 0.
 */
export function createVehicleLookupClient(
  options: VehicleLookupClientOptions = {},
): VehicleLookupClient {
  const fetchImpl: typeof fetch =
    options.fetch ?? ((input, init) => globalThis.fetch(input, init))
  const now = options.now ?? (() => Date.now())
  const setTimer =
    options.setTimer ?? ((callback: () => void, ms: number) => globalThis.setTimeout(callback, ms))
  const clearTimer =
    options.clearTimer ??
    ((handle: TimerHandle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>))
  const random = options.random ?? Math.random
  const timeoutMs = nonNegative(options.timeoutMs, VEHICLE_LOOKUP_TIMEOUT_MS)
  const retryDelayMinMs = nonNegative(options.retryDelayMinMs, VEHICLE_LOOKUP_RETRY_DELAY_MIN_MS)
  const retryDelayMaxMs = Math.max(
    retryDelayMinMs,
    nonNegative(options.retryDelayMaxMs, VEHICLE_LOOKUP_RETRY_DELAY_MAX_MS),
  )
  const minRemainingForRetryMs = nonNegative(
    options.minRemainingForRetryMs,
    VEHICLE_LOOKUP_MIN_REMAINING_FOR_RETRY_MS,
  )

  async function fetchVehicleByNopol(
    nopol: string,
    _source?: VehicleDataSourceMode | null,
    signal?: AbortSignal,
  ): Promise<VehicleData | null> {
    const normalized = normalizeNopol(nopol)
    if (!normalized || normalized.length < 4) return null
    if (signal?.aborted) throw createAbortError()

    // `source` lama diabaikan: server selalu memakai API Data Kendaraan.
    const url = `${API_BASE_URL}/api/njkb/${encodeURIComponent(normalized)}?${new URLSearchParams({ source: "api" }).toString()}`

    const startedAt = now()
    let attempts = 0
    // Penyebab berhenti pertama menentukan error akhir; tidak pernah ditimpa.
    let stopReason: "caller" | "timeout" | "settled" | null = null
    const controller = new AbortController()
    const meta = () => ({
      elapsedMs: Math.max(0, Math.round(now() - startedAt)),
      attempts: Math.max(1, attempts),
    })

    const stoppedError = (): Error =>
      stopReason === "timeout" ? createClientTimeoutError(meta()) : createAbortError()
    const throwIfStopped = (): void => {
      if (stopReason !== null || controller.signal.aborted) throw stoppedError()
    }

    let rejectStop: (error: Error) => void = () => undefined
    const stopped = new Promise<never>((_, reject) => {
      rejectStop = reject
    })
    stopped.catch(() => undefined)

    const stop = (reason: "caller" | "timeout"): void => {
      if (stopReason !== null) return
      stopReason = reason
      // Tolak race lebih dulu agar hasil akhir tidak bergantung pada urutan abort fetch.
      rejectStop(stoppedError())
      controller.abort()
    }

    const onCallerAbort = () => stop("caller")
    signal?.addEventListener("abort", onCallerAbort)
    const deadline = setTimer(() => stop("timeout"), timeoutMs)

    const sleep = (ms: number): Promise<void> =>
      new Promise<void>((resolve, reject) => {
        const onAbort = () => {
          clearTimer(handle)
          reject(stoppedError())
        }
        const handle = setTimer(() => {
          controller.signal.removeEventListener("abort", onAbort)
          resolve()
        }, ms)
        controller.signal.addEventListener("abort", onAbort)
      })

    const canRetry = (): boolean =>
      stopReason === null &&
      attempts < VEHICLE_LOOKUP_MAX_ATTEMPTS &&
      timeoutMs - (now() - startedAt) >= minRemainingForRetryMs &&
      !isKnownOffline()

    const backoff = async (): Promise<void> => {
      const delay = Math.round(retryDelayMinMs + random() * (retryDelayMaxMs - retryDelayMinMs))
      await sleep(delay)
      throwIfStopped()
    }

    const run = async (): Promise<VehicleData | null> => {
      for (;;) {
        attempts += 1

        let res: Response
        try {
          res = await fetchImpl(url, {
            signal: controller.signal,
            headers: { Accept: "application/json" },
            credentials: "same-origin",
            cache: "no-store",
          })
        } catch (error) {
          throwIfStopped()
          if (isAbortError(error)) throw createAbortError()
          if (isNetworkTypeError(error) && canRetry()) {
            await backoff()
            continue
          }
          throw createNetworkError(meta())
        }
        throwIfStopped()

        if (res.status === 404) return null

        if (!res.ok) {
          let read: ApiError
          try {
            read = await readApiError(res, { signal: controller.signal })
          } catch (readError) {
            throwIfStopped()
            throw readError
          }
          throwIfStopped()
          // Metadata diambil setelah body error terbaca agar latensi body ikut tercatat.
          const error = read.diagnostics
            ? new ApiError(read.message, read.status, read.code, {
                ...read.diagnostics,
                ...meta(),
              })
            : read
          // 401: sesi dihapus Admin atau berakhir — AuthProvider kembali ke login.
          if (res.status === 401) {
            notifyUnauthenticated()
            throw error
          }
          if (
            error.diagnostics?.edge === true &&
            EDGE_RETRYABLE_STATUSES.has(res.status) &&
            canRetry()
          ) {
            await backoff()
            continue
          }
          // 403: tidak memiliki izin modul/sumber data; pesan server ditampilkan.
          throw error
        }

        if (!isJsonContentType(res.headers.get("Content-Type"))) {
          throw createInvalidResponseError(res, meta())
        }
        let data: unknown
        try {
          data = await res.json()
        } catch (error) {
          throwIfStopped()
          // AbortError dari stream body bukan respons tidak valid.
          if (isAbortError(error)) throw error
          throw createInvalidResponseError(res, meta())
        }
        throwIfStopped()
        if (data === null || typeof data !== "object" || Array.isArray(data)) {
          throw createInvalidResponseError(res, meta())
        }
        return data as VehicleData
      }
    }

    try {
      return await Promise.race([run(), stopped])
    } finally {
      clearTimer(deadline)
      signal?.removeEventListener("abort", onCallerAbort)
      if (stopReason === null) stopReason = "settled"
      // Membatalkan sisa request/body bila race dimenangkan deadline/abort.
      controller.abort()
    }
  }

  return { fetchVehicleByNopol }
}

const defaultVehicleLookupClient = createVehicleLookupClient()

/**
 * Lookup kendaraan via API Data Kendaraan. Argumen `source` dipertahankan
 * demi kompatibilitas pemanggil lama, tetapi request selalu `source=api`.
 */
export function fetchVehicleByNopol(
  nopol: string,
  source?: VehicleDataSourceMode | null,
  signal?: AbortSignal,
): Promise<VehicleData | null> {
  return defaultVehicleLookupClient.fetchVehicleByNopol(nopol, source, signal)
}
