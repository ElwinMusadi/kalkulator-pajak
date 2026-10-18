/**
 * Status pembaruan PWA (store eksternal murni, tanpa React/virtual module).
 *
 * Worker baru tetap aktif otomatis (skipWaiting + clientsClaim), tetapi halaman
 * TIDAK dimuat ulang paksa agar isian formulir tidak hilang. Store hanya
 * menandai "versi baru tersedia" setelah worker baru mengambil alih halaman
 * yang sebelumnya sudah dikendalikan worker; pengguna memuat ulang sendiri
 * lewat tombol "Perbarui".
 */

export type PwaUpdateStatus = "idle" | "available" | "applying"

export interface PwaUpdateSnapshot {
  status: PwaUpdateStatus
}

/** Bagian ServiceWorkerRegistration yang dipakai store (mudah dipalsukan di test). */
export interface PwaUpdateRegistration {
  readonly waiting: { postMessage(message: unknown): void } | null
  update(): Promise<unknown>
}

export interface PwaUpdateEnv {
  /** Apakah halaman saat ini dikendalikan Service Worker. */
  hasController(): boolean
  isOnline(): boolean
  reload(): void
  now(): number
  setTimeout(callback: () => void, ms: number): unknown
}

export interface PwaUpdateOptions {
  /** Jeda minimum antar-pemeriksaan pemicu fokus/visible/online. */
  checkThrottleMs?: number
  /** Batas tunggu worker `waiting` mengambil alih sebelum reload tetap dijalankan. */
  takeoverTimeoutMs?: number
  /** Batas waktu `registration.update()`; yang menggantung dianggap gagal. */
  updateTimeoutMs?: number
}

export interface PwaUpdateController {
  getSnapshot(): PwaUpdateSnapshot
  subscribe(listener: () => void): () => void
  /** Teruskan event `controllerchange` dari navigator.serviceWorker. */
  handleControllerChange(): void
  /** Callback `onNeedReload` registerSW (worker baru aktif: isUpdate/isExternal). */
  handleNeedReload(): void
  setRegistration(registration: PwaUpdateRegistration | undefined): void
  /** Periksa versi baru; aman dipanggil berulang (throttle, offline, paralel). */
  checkForUpdate(options?: { force?: boolean }): Promise<boolean>
  /** Muat ulang satu kali ke versi terbaru. */
  applyUpdate(): Promise<void>
}

const DEFAULT_CHECK_THROTTLE_MS = 45_000
const DEFAULT_TAKEOVER_TIMEOUT_MS = 3_000
const DEFAULT_UPDATE_TIMEOUT_MS = 30_000

class UpdateTimeoutError extends Error {}

export function createPwaUpdateController(
  env: PwaUpdateEnv,
  options: PwaUpdateOptions = {},
): PwaUpdateController {
  const checkThrottleMs = options.checkThrottleMs ?? DEFAULT_CHECK_THROTTLE_MS
  const takeoverTimeoutMs = options.takeoverTimeoutMs ?? DEFAULT_TAKEOVER_TIMEOUT_MS
  const updateTimeoutMs = options.updateTimeoutMs ?? DEFAULT_UPDATE_TIMEOUT_MS

  // Halaman dimuat dari worker lama → setiap worker baru yang aktif berarti
  // versi baru. Tanpa controller awal (instalasi pertama), controller pertama
  // yang muncul hanya klaim instalasi, bukan pembaruan.
  const initiallyControlled = env.hasController()
  let controlled = initiallyControlled

  let snapshot: PwaUpdateSnapshot = { status: "idle" }
  const listeners = new Set<() => void>()
  let registration: PwaUpdateRegistration | undefined
  let checking = false
  let lastCheckAt: number | null = null
  let reloadRequested = false
  let pendingTakeover: (() => void) | null = null

  function setStatus(status: PwaUpdateStatus) {
    if (snapshot.status === status) return
    snapshot = { status }
    for (const listener of [...listeners]) listener()
  }

  function markAvailable() {
    if (snapshot.status === "idle") setStatus("available")
  }

  /** Worker baru tertahan di `waiting` sementara halaman dikendalikan worker lain. */
  function syncWaiting() {
    if (registration?.waiting && env.hasController()) markAvailable()
  }

  function reloadOnce() {
    if (reloadRequested) return
    reloadRequested = true
    env.reload()
  }

  return {
    getSnapshot: () => snapshot,

    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    handleControllerChange() {
      const resolve = pendingTakeover
      pendingTakeover = null
      if (!controlled) {
        controlled = true
      } else {
        markAvailable()
      }
      resolve?.()
    },

    handleNeedReload() {
      if (initiallyControlled) markAvailable()
    },

    setRegistration(next) {
      registration = next
      syncWaiting()
    },

    async checkForUpdate({ force = false } = {}) {
      const target = registration
      if (!target || checking || snapshot.status !== "idle" || !env.isOnline()) {
        return false
      }
      const now = env.now()
      if (!force && lastCheckAt !== null && now - lastCheckAt < checkThrottleMs) {
        return false
      }
      lastCheckAt = now
      checking = true
      try {
        // update() yang menggantung (jaringan lambat) tidak boleh mengunci
        // pemeriksaan berikutnya selamanya.
        await Promise.race([
          target.update(),
          new Promise<never>((_, reject) => {
            env.setTimeout(() => reject(new UpdateTimeoutError()), updateTimeoutMs)
          }),
        ])
        syncWaiting()
        return true
      } catch {
        // Jaringan putus/server error: anggap tidak ada pembaruan.
        return false
      } finally {
        checking = false
      }
    },

    async applyUpdate() {
      if (snapshot.status !== "available") return
      setStatus("applying")
      const waiting = registration?.waiting
      if (waiting) {
        // Fallback: minta worker yang tertahan aktif dulu, lalu reload.
        await new Promise<void>((resolve) => {
          pendingTakeover = resolve
          env.setTimeout(() => {
            if (pendingTakeover === resolve) pendingTakeover = null
            resolve()
          }, takeoverTimeoutMs)
          try {
            waiting.postMessage({ type: "SKIP_WAITING" })
          } catch {
            resolve()
          }
        })
      }
      reloadOnce()
    },
  }
}
