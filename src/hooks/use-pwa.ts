import { registerSW } from "virtual:pwa-register"

const RELOAD_GUARD_KEY = "kp-sw-reloaded-at"
const RELOAD_GUARD_MS = 10_000
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000

let registered = false
let reloading = false

/** Muat ulang sekali saat worker baru mengambil alih; cegah reload berulang. */
function reloadOnce() {
  if (reloading) return
  try {
    const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) ?? 0)
    if (Date.now() - last < RELOAD_GUARD_MS) return
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()))
  } catch {
    // sessionStorage tidak tersedia: tetap andalkan flag di memori.
  }
  reloading = true
  window.location.reload()
}

/**
 * Mendaftarkan Service Worker dengan mode autoUpdate. Worker baru langsung
 * aktif (skipWaiting + clientsClaim) dan halaman dimuat ulang satu kali agar
 * seluruh tab memakai versi terbaru tanpa prompt pengguna.
 */
export function registerPwa(): void {
  if (registered || typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return
  }
  registered = true

  // Reload hanya bila halaman sebelumnya sudah dikendalikan worker lama
  // (pembaruan), bukan saat instalasi pertama.
  const hadController = Boolean(navigator.serviceWorker.controller)
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadController) reloadOnce()
  })

  registerSW({
    immediate: true,
    onNeedReload: reloadOnce,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return
      // Tab yang dibiarkan terbuka tetap memeriksa versi baru secara berkala.
      window.setInterval(() => {
        if (document.visibilityState === "visible" && navigator.onLine) {
          void registration.update().catch(() => undefined)
        }
      }, UPDATE_CHECK_INTERVAL_MS)
    },
    onRegisterError() {
      // Kegagalan pendaftaran tidak memblokir aplikasi online.
    },
  })
}
