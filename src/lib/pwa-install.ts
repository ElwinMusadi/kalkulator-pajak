/**
 * src/lib/pwa-install.ts — Status instalasi PWA bersama seluruh aplikasi.
 *
 * `beforeinstallprompt` hanya dikirim satu kali per pemuatan halaman dan sering
 * terjadi sebelum React selesai render (misalnya saat halaman login atau
 * pemeriksaan sesi). Karena itu event ditangkap di level modul lewat
 * `initPwaInstall()` yang dipanggil dari main.tsx, lalu dibagikan ke komponen
 * melalui `useSyncExternalStore`.
 *
 * Tidak memakai alias "@/": fungsi murni di sini diuji di Node via tsx.
 */

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>
}

/** Petunjuk manual yang ditampilkan bila prompt instalasi otomatis tidak tersedia. */
export type InstallPlatform =
  | "ios-safari"
  | "ios-other"
  | "android-samsung"
  | "android-firefox"
  | "android-chromium"
  | "desktop-chromium"
  | "desktop-safari"
  | "desktop-firefox"
  | "other"

export interface PwaInstallSnapshot {
  /** Aplikasi sedang berjalan sebagai aplikasi terpasang (standalone). */
  installed: boolean
  /** Browser menyediakan dialog instalasi native (Chromium). */
  canPrompt: boolean
  platform: InstallPlatform
}

/** Deteksi platform dari User-Agent untuk memilih petunjuk instalasi manual. */
export function detectInstallPlatform(
  userAgent: string,
  maxTouchPoints = 0,
  platform = "",
): InstallPlatform {
  const ua = userAgent.toLowerCase()
  // iPadOS 13+ mengaku "Macintosh"; bedakan lewat dukungan layar sentuh.
  const isIos =
    /iphone|ipad|ipod/.test(ua) ||
    ((platform === "MacIntel" || /macintosh/.test(ua)) && maxTouchPoints > 1)

  if (isIos) {
    // Chrome/Firefox/Edge/Opera di iOS memakai penanda CriOS/FxiOS/EdgiOS/OPiOS.
    return /crios|fxios|edgios|opios|gsa\//.test(ua) ? "ios-other" : "ios-safari"
  }
  if (/android/.test(ua)) {
    if (/samsungbrowser/.test(ua)) return "android-samsung"
    if (/firefox/.test(ua)) return "android-firefox"
    return "android-chromium"
  }
  if (/firefox/.test(ua)) return "desktop-firefox"
  if (/edg\/|chrome\/|chromium\//.test(ua)) return "desktop-chromium"
  if (/safari/.test(ua) && /macintosh/.test(ua)) return "desktop-safari"
  return "other"
}

const STANDALONE_QUERIES = [
  "(display-mode: standalone)",
  "(display-mode: fullscreen)",
  "(display-mode: minimal-ui)",
  "(display-mode: window-controls-overlay)",
]

function detectStandalone(): boolean {
  if (typeof window === "undefined") return false
  const iosStandalone = Boolean(
    (navigator as Navigator & { standalone?: boolean }).standalone,
  )
  return (
    iosStandalone ||
    STANDALONE_QUERIES.some((query) => window.matchMedia?.(query).matches)
  )
}

let deferredPrompt: BeforeInstallPromptEvent | null = null
let installedThisSession = false
let initialized = false
let snapshot: PwaInstallSnapshot = {
  installed: false,
  canPrompt: false,
  platform: "other",
}
const listeners = new Set<() => void>()

function emit() {
  const next: PwaInstallSnapshot = {
    installed: installedThisSession || detectStandalone(),
    canPrompt: deferredPrompt !== null,
    platform: snapshot.platform,
  }
  if (
    next.installed === snapshot.installed &&
    next.canPrompt === snapshot.canPrompt &&
    next.platform === snapshot.platform
  ) {
    return
  }
  snapshot = next
  for (const listener of listeners) listener()
}

/** Dipanggil sekali sedini mungkin (main.tsx), sebelum React render. */
export function initPwaInstall(): void {
  if (initialized || typeof window === "undefined") return
  initialized = true

  snapshot = {
    installed: detectStandalone(),
    canPrompt: false,
    platform: detectInstallPlatform(
      navigator.userAgent,
      navigator.maxTouchPoints,
      navigator.platform,
    ),
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    // Cegah mini-infobar bawaan; instalasi dipicu dari tombol "Instal Aplikasi".
    event.preventDefault()
    deferredPrompt = event as BeforeInstallPromptEvent
    emit()
  })
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null
    installedThisSession = true
    emit()
  })
  for (const query of STANDALONE_QUERIES) {
    window.matchMedia?.(query).addEventListener?.("change", emit)
  }
}

export function subscribePwaInstall(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getPwaInstallSnapshot(): PwaInstallSnapshot {
  return snapshot
}

/**
 * Menampilkan dialog instalasi native. Event hanya dapat dipakai sekali;
 * browser akan mengirim event baru bila instalasi masih memungkinkan.
 * @returns "unavailable" bila browser tidak menyediakan prompt native.
 */
export async function promptPwaInstall(): Promise<
  "accepted" | "dismissed" | "unavailable"
> {
  const event = deferredPrompt
  if (!event) return "unavailable"
  deferredPrompt = null
  emit()
  try {
    await event.prompt()
    const choice = await event.userChoice
    if (choice.outcome === "accepted") {
      installedThisSession = true
      emit()
    }
    return choice.outcome
  } catch {
    return "unavailable"
  }
}
