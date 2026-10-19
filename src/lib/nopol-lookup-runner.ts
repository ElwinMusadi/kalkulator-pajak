/**
 * src/lib/nopol-lookup-runner.ts — Orkestrasi lookup Nopol tanpa React.
 *
 * Setiap `start()` adalah siklus baru: generasi naik, timer lama dibersihkan,
 * request lama dibatalkan, lalu lookup selalu dijalankan ulang setelah jeda
 * (atau langsung bila `immediate`), termasuk untuk plat yang sama. Hasil hanya
 * diterapkan bila generasinya masih aktif dan sinyalnya belum dibatalkan, agar
 * respons usang (sukses maupun error) tidak menimpa state/autofill terbaru.
 *
 * Relatif (bukan alias "@/"): modul ini juga diimpor test Node via tsx.
 * Tidak ada retry otomatis di sini; percobaan ulang jaringan ditangani http/api.
 */

import type {
  NopolLookupStatus,
  VehicleData,
  VehicleDataSourceMode,
} from "../types/tax"
import {
  isAbortError,
  isApiError,
  isRetryableByUser,
  sanitizeCfRay,
  type ApiErrorDiagnostics,
} from "./http"

export const NOPOL_MIN_LENGTH = 4
export const NOPOL_MAX_LENGTH = 12
export const NOPOL_LOOKUP_DELAY_MS = 450

export const NOPOL_OFFLINE_MESSAGE =
  "Koneksi internet terputus. Sambungkan kembali lalu ulangi pencarian."

export type NopolLookupFn = (
  normalized: string,
  mode: VehicleDataSourceMode,
  signal: AbortSignal,
) => Promise<VehicleData | null>

export interface NopolLookupState {
  status: NopolLookupStatus
  vehicleData: VehicleData | null
  lookupSource: Extract<VehicleDataSourceMode, "d1" | "api"> | null
  /** Pesan aman untuk pengguna; null = UI memakai pesan generik. */
  errorMessage: string | null
  /** True bila server menolak karena izin (HTTP 403). */
  forbidden: boolean
  /** True bila tombol "Coba lagi" layak ditampilkan. */
  retryable: boolean
  diagnostics: ApiErrorDiagnostics | null
  /** Referensi teknis tersanitasi (status/kode/ray/percobaan/durasi). */
  errorReference: string | null
}

export const IDLE_NOPOL_LOOKUP_STATE: Readonly<NopolLookupState> = Object.freeze({
  status: "idle",
  vehicleData: null,
  lookupSource: null,
  errorMessage: null,
  forbidden: false,
  retryable: false,
  diagnostics: null,
  errorReference: null,
})

const LOADING_STATE: Readonly<NopolLookupState> = Object.freeze({
  ...IDLE_NOPOL_LOOKUP_STATE,
  status: "loading",
})

export function normalizeNopol(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "")
}

export function isLookupableNopol(normalized: string): boolean {
  return (
    normalized.length >= NOPOL_MIN_LENGTH &&
    normalized.length <= NOPOL_MAX_LENGTH
  )
}

const SAFE_REFERENCE_CODE =
  /^(?:NETWORK_ERROR|CLIENT_TIMEOUT|INVALID_RESPONSE|SERVER_ERROR|NJKB_[A-Z0-9_]{1,40})$/

function formatElapsed(ms: number): string {
  return `${(ms / 1000).toFixed(1).replace(".", ",")} dtk`
}

/**
 * Referensi untuk dilaporkan ke Admin. Hanya status, kode yang di-allowlist,
 * cf-ray tersanitasi, jumlah percobaan, dan durasi; tidak pernah teks upstream,
 * URL, atau nopol. Null untuk 403 dan error non-API.
 */
export function formatLookupErrorReference(error: unknown): string | null {
  if (!isApiError(error) || error.status === 403) return null
  const diagnostics = error.diagnostics
  const status = diagnostics?.status ?? error.status
  const parts: string[] = []

  if (Number.isInteger(status) && status >= 100 && status <= 599) {
    parts.push(`HTTP ${status}`)
  } else if (diagnostics?.kind === "timeout") {
    parts.push("Batas waktu")
  } else if (diagnostics?.kind === "network" || status === 0) {
    parts.push("Jaringan")
  }

  const code = diagnostics?.code ?? error.code
  if (typeof code === "string" && SAFE_REFERENCE_CODE.test(code)) parts.push(code)

  const rayId = sanitizeCfRay(diagnostics?.rayId)
  if (rayId) parts.push(`Ray ${rayId}`)

  if (diagnostics) {
    if (Number.isFinite(diagnostics.attempts) && diagnostics.attempts > 1) {
      parts.push(`${Math.floor(diagnostics.attempts)} percobaan`)
    }
    if (Number.isFinite(diagnostics.elapsedMs) && diagnostics.elapsedMs > 0) {
      parts.push(formatElapsed(diagnostics.elapsedMs))
    }
  }

  return parts.length > 0 ? parts.join(" · ") : null
}

function defaultIsOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false
}

function errorState(error: unknown, isOnline: () => boolean): NopolLookupState {
  if (!isApiError(error)) {
    // Error tak dikenal (termasuk AbortError yang bukan dari pembatalan kita):
    // jangan tampilkan teks mentah; UI memakai pesan generik.
    return {
      ...IDLE_NOPOL_LOOKUP_STATE,
      status: "error",
      retryable: true,
    }
  }

  const forbidden = error.status === 403
  const diagnostics = error.diagnostics ?? null
  const networkFailure =
    diagnostics?.kind === "network" ||
    (diagnostics === null && error.status === 0 && error.code === "NETWORK_ERROR")
  const offline = networkFailure && !isOnline()

  return {
    ...IDLE_NOPOL_LOOKUP_STATE,
    status: "error",
    errorMessage: offline ? NOPOL_OFFLINE_MESSAGE : error.message || null,
    forbidden,
    retryable: !forbidden && isRetryableByUser(error),
    diagnostics,
    errorReference: formatLookupErrorReference(error),
  }
}

type TimerHandle = unknown

export interface NopolLookupRunnerOptions {
  lookup: NopolLookupFn
  delayMs?: number
  setTimer?: (callback: () => void, ms: number) => TimerHandle
  clearTimer?: (handle: TimerHandle) => void
  isOnline?: () => boolean
}

export interface NopolLookupRunner {
  /**
   * Memulai siklus baru dan langsung memancarkan `loading`/`idle`. Mengembalikan
   * fungsi pembatal yang hanya berlaku selama siklus ini masih yang terbaru.
   */
  start(
    raw: string,
    mode: VehicleDataSourceMode | null,
    immediate: boolean,
    emit: (state: NopolLookupState) => void,
  ): () => void
  /** Membatalkan siklus aktif (timer + request) tanpa memancarkan state. */
  cancel(): void
}

export function createNopolLookupRunner({
  lookup,
  delayMs = NOPOL_LOOKUP_DELAY_MS,
  setTimer = (callback, ms) => setTimeout(callback, ms),
  clearTimer = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  isOnline = defaultIsOnline,
}: NopolLookupRunnerOptions): NopolLookupRunner {
  let generation = 0
  let timer: TimerHandle | undefined
  let controller: AbortController | null = null

  function teardown() {
    generation += 1
    if (timer !== undefined) {
      clearTimer(timer)
      timer = undefined
    }
    controller?.abort()
    controller = null
  }

  function run(
    id: number,
    normalized: string,
    mode: VehicleDataSourceMode,
    emit: (state: NopolLookupState) => void,
  ) {
    if (id !== generation) return
    timer = undefined
    const current = new AbortController()
    controller = current
    const isCurrent = () => id === generation && !current.signal.aborted

    let pending: Promise<VehicleData | null>
    try {
      pending = lookup(normalized, mode, current.signal)
    } catch (error) {
      pending = Promise.reject(error)
    }

    pending.then(
      (data) => {
        if (!isCurrent()) return
        controller = null
        if (data) {
          // Objek baru setiap sukses: autofill form memakai identitas objek.
          const vehicleData: VehicleData = { ...data }
          emit({
            ...IDLE_NOPOL_LOOKUP_STATE,
            status: "found",
            vehicleData,
            lookupSource: vehicleData.source ?? null,
          })
        } else {
          emit({ ...IDLE_NOPOL_LOOKUP_STATE, status: "not_found" })
        }
      },
      (error: unknown) => {
        if (!isCurrent()) return
        controller = null
        emit(errorState(isAbortError(error) ? null : error, isOnline))
      },
    )
  }

  return {
    start(raw, mode, immediate, emit) {
      teardown()
      const id = generation
      const normalized = normalizeNopol(raw)

      if (mode === null || !isLookupableNopol(normalized)) {
        emit(IDLE_NOPOL_LOOKUP_STATE)
      } else {
        emit(LOADING_STATE)
        if (immediate) {
          run(id, normalized, mode, emit)
        } else {
          timer = setTimer(() => run(id, normalized, mode, emit), delayMs)
        }
      }

      return () => {
        if (id === generation) teardown()
      }
    },
    cancel: teardown,
  }
}
