import { useSyncExternalStore } from "react"
import { registerSW } from "virtual:pwa-register"
import {
  createPwaUpdateController,
  type PwaUpdateController,
  type PwaUpdateSnapshot,
} from "@/lib/pwa-update"

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000

const IDLE_SNAPSHOT: PwaUpdateSnapshot = { status: "idle" }
const noopUnsubscribe = () => undefined

let controller: PwaUpdateController | null = null

/**
 * Mendaftarkan Service Worker (mode autoUpdate: skipWaiting + clientsClaim).
 * Worker baru aktif otomatis, tetapi halaman tidak dimuat ulang paksa: store
 * pembaruan ditandai "tersedia" dan pengguna memuat ulang lewat tombol
 * "Perbarui" agar isian yang sedang dikerjakan tidak hilang tiba-tiba.
 *
 * Dipanggil dari main.tsx sebelum React render agar event `controllerchange`
 * yang terjadi saat halaman login/pemeriksaan sesi masih tampil tidak terlewat.
 */
export function registerPwa(): void {
  if (controller || typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return
  }

  const sw = navigator.serviceWorker
  const store = createPwaUpdateController({
    hasController: () => Boolean(sw.controller),
    isOnline: () => navigator.onLine,
    reload: () => window.location.reload(),
    now: () => Date.now(),
    setTimeout: (callback, ms) => window.setTimeout(callback, ms),
  })
  controller = store

  sw.addEventListener("controllerchange", () => store.handleControllerChange())

  function checkWhenVisible() {
    if (document.visibilityState === "visible") void store.checkForUpdate()
  }

  try {
    registerSW({
      immediate: true,
      // Wajib diisi: tanpa handler, registerSW memanggil window.location.reload().
      onNeedReload: () => store.handleNeedReload(),
      onRegisteredSW(_swUrl, registration) {
        if (!registration) return
        store.setRegistration(registration)
        // Tab yang lama terbuka tetap memeriksa versi baru: saat kembali
        // aktif, kembali online, dan berkala (store men-throttle & cek offline).
        window.addEventListener("focus", checkWhenVisible)
        window.addEventListener("online", checkWhenVisible)
        document.addEventListener("visibilitychange", checkWhenVisible)
        window.setInterval(checkWhenVisible, UPDATE_CHECK_INTERVAL_MS)
      },
      onRegisterError() {
        // Kegagalan pendaftaran tidak memblokir aplikasi online.
      },
    })
  } catch {
    // Idem: aplikasi tetap berjalan tanpa Service Worker.
  }
}

function subscribe(listener: () => void) {
  return controller ? controller.subscribe(listener) : noopUnsubscribe
}

function getSnapshot(): PwaUpdateSnapshot {
  return controller ? controller.getSnapshot() : IDLE_SNAPSHOT
}

function applyUpdate() {
  void controller?.applyUpdate()
}

/** Status "versi baru tersedia" yang sinkron di seluruh komponen. */
export function usePwaUpdate(): PwaUpdateSnapshot & { applyUpdate: () => void } {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return { ...snapshot, applyUpdate }
}
