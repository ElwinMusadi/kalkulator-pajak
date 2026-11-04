/**
 * src/lib/push.ts — notifikasi Web Push dan pengumuman di sisi peramban.
 *
 * Langganan dibuat lewat service worker PWA (public/sw-push.js menampilkan
 * notifikasinya). iPhone/iPad hanya mendukung Web Push untuk aplikasi yang
 * dipasang ke Layar Utama (iOS/iPadOS 16.4+).
 */

import type {
  AnnouncementSendResponse,
  AnnouncementsResponse,
  CreateAnnouncementRequest,
  PushConfigResponse,
  PushSubscriptionRequest,
} from "@/types/push"
import { apiRequest } from "./http"
import { detectInstallPlatform } from "./pwa-install"

// ---------------------------------------------------------------------------
// API

export const pushApi = {
  config(signal?: AbortSignal): Promise<PushConfigResponse> {
    return apiRequest<PushConfigResponse>("/api/push/config", { signal })
  },
  subscribe(body: PushSubscriptionRequest): Promise<void> {
    return apiRequest<void>("/api/push/subscriptions", { method: "POST", body })
  },
  unsubscribe(endpoint: string): Promise<void> {
    return apiRequest<void>("/api/push/subscriptions", { method: "DELETE", body: { endpoint } })
  },
  announcements(signal?: AbortSignal): Promise<AnnouncementsResponse> {
    return apiRequest<AnnouncementsResponse>("/api/announcements", { signal })
  },
  createAnnouncement(body: CreateAnnouncementRequest): Promise<AnnouncementSendResponse> {
    return apiRequest<AnnouncementSendResponse>("/api/admin/announcements", { method: "POST", body })
  },
  continueAnnouncement(id: string, after: string): Promise<AnnouncementSendResponse> {
    return apiRequest<AnnouncementSendResponse>(
      `/api/admin/announcements/${encodeURIComponent(id)}/send`,
      { method: "POST", body: { after } },
    )
  },
  deleteAnnouncement(id: string): Promise<void> {
    return apiRequest<void>(`/api/admin/announcements/${encodeURIComponent(id)}`, { method: "DELETE" })
  },
}

// ---------------------------------------------------------------------------
// Dukungan perangkat

export type PushAvailability =
  /** Notifikasi bisa diaktifkan di perangkat ini. */
  | "supported"
  /** iPhone/iPad di Safari: pasang ke Layar Utama dulu, lalu buka dari ikonnya. */
  | "ios-needs-install"
  /** iPhone/iPad di Chrome/Firefox/lainnya: hanya lewat Safari + Layar Utama. */
  | "ios-other-browser"
  /** Peramban atau versi sistem tidak mendukung Web Push. */
  | "unsupported"

export interface PushEnvironment {
  userAgent: string
  maxTouchPoints: number
  platform: string
  /** Berjalan sebagai aplikasi terpasang (display-mode standalone). */
  standalone: boolean
  hasServiceWorker: boolean
  hasPushManager: boolean
  hasNotification: boolean
}

export function detectPushAvailability(env: PushEnvironment): PushAvailability {
  const platform = detectInstallPlatform(env.userAgent, env.maxTouchPoints, env.platform)
  const isIos = platform === "ios-safari" || platform === "ios-other"
  if (isIos && !env.standalone) {
    return platform === "ios-safari" ? "ios-needs-install" : "ios-other-browser"
  }
  // iOS terpasang tetapi < 16.4 tidak punya PushManager → unsupported.
  return env.hasServiceWorker && env.hasPushManager && env.hasNotification ? "supported" : "unsupported"
}

export function currentPushEnvironment(): PushEnvironment {
  const nav = navigator as Navigator & { standalone?: boolean }
  return {
    userAgent: nav.userAgent,
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    platform: nav.platform ?? "",
    standalone: window.matchMedia?.("(display-mode: standalone)").matches === true || nav.standalone === true,
    hasServiceWorker: "serviceWorker" in nav,
    hasPushManager: "PushManager" in window,
    hasNotification: "Notification" in window,
  }
}

// ---------------------------------------------------------------------------
// Langganan perangkat ini

export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/")
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a || a.byteLength !== b.length) return false
  const view = new Uint8Array(a)
  return view.every((byte, i) => byte === b[i])
}

/** Service worker PWA; null di mode dev (`npm run dev`) atau peramban tanpa SW. */
async function pwaRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null
  return (await navigator.serviceWorker.getRegistration()) ?? null
}

export async function getDeviceSubscription(): Promise<PushSubscription | null> {
  const registration = await pwaRegistration()
  return registration ? registration.pushManager.getSubscription() : null
}

function toRequest(subscription: PushSubscription): PushSubscriptionRequest {
  const json = subscription.toJSON()
  return {
    endpoint: subscription.endpoint,
    keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" },
  }
}

export type EnablePushResult = "enabled" | "denied" | "no-service-worker"

/**
 * Meminta izin (harus dipanggil dari klik pengguna, wajib di iPhone),
 * berlangganan dengan kunci VAPID server, lalu mendaftarkannya ke server.
 * Langganan dengan kunci server lama diganti.
 */
export async function enablePush(publicKey: string): Promise<EnablePushResult> {
  const permission = await Notification.requestPermission()
  if (permission !== "granted") return "denied"
  const registration = await pwaRegistration()
  if (!registration) return "no-service-worker"

  const serverKey = base64UrlToBytes(publicKey)
  let subscription = await registration.pushManager.getSubscription()
  if (subscription && !sameKey(subscription.options.applicationServerKey, serverKey)) {
    await subscription.unsubscribe().catch(() => false)
    subscription = null
  }
  subscription ??= await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: serverKey,
  })
  await pushApi.subscribe(toRequest(subscription))
  return "enabled"
}

/** Mematikan notifikasi di perangkat ini (server dan peramban). */
export async function disablePush(): Promise<void> {
  const subscription = await getDeviceSubscription()
  if (!subscription) return
  try {
    await pushApi.unsubscribe(subscription.endpoint)
  } finally {
    await subscription.unsubscribe().catch(() => false)
  }
}

/**
 * Menyelaraskan langganan yang sudah ada dengan server (mis. perangkat
 * bersama berganti user, atau kunci server berganti). Tidak meminta izin.
 */
export async function syncPushSubscription(publicKey: string): Promise<boolean> {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return false
  const subscription = await getDeviceSubscription()
  if (!subscription) return false
  if (!sameKey(subscription.options.applicationServerKey, base64UrlToBytes(publicKey))) {
    await subscription.unsubscribe().catch(() => false)
    return false
  }
  await pushApi.subscribe(toRequest(subscription))
  return true
}

// ---------------------------------------------------------------------------
// Pengumuman yang sudah dibaca (per user, per perangkat)

const SEEN_KEY_PREFIX = "kp:pengumuman-dibaca:"

export function readLastSeen(userId: string): string | null {
  try {
    return localStorage.getItem(SEEN_KEY_PREFIX + userId)
  } catch {
    return null
  }
}

export function writeLastSeen(userId: string, createdAt: string): void {
  try {
    localStorage.setItem(SEEN_KEY_PREFIX + userId, createdAt)
  } catch {
    // Penyimpanan tidak tersedia (mode privat): penanda belum dibaca saja yang hilang.
  }
}

/** Ada pengumuman yang lebih baru dari yang terakhir dibuka. */
export function hasUnread(latestCreatedAt: string | undefined, lastSeen: string | null): boolean {
  return Boolean(latestCreatedAt) && (lastSeen === null || latestCreatedAt! > lastSeen)
}

// ---------------------------------------------------------------------------
// Modal saat aplikasi dibuka: versi baru, pengumuman, ajakan notifikasi

/** "Nanti saja" pada ajakan notifikasi menunda ajakan berikutnya selama ini. */
export const NOTIFICATION_PROMPT_SNOOZE_MS = 3 * 24 * 60 * 60 * 1000

const PROMPT_SNOOZE_KEY = "kp:ajakan-notifikasi-sampai"

export function readPromptSnoozedUntil(): number {
  try {
    const value = Number(localStorage.getItem(PROMPT_SNOOZE_KEY))
    return Number.isFinite(value) ? value : 0
  } catch {
    return 0
  }
}

export function snoozeNotificationPrompt(nowMs: number): number {
  const until = nowMs + NOTIFICATION_PROMPT_SNOOZE_MS
  try {
    localStorage.setItem(PROMPT_SNOOZE_KEY, String(until))
  } catch {
    // Tanpa penyimpanan, ajakan bisa muncul lagi pada pembukaan berikutnya.
  }
  return until
}

export type NotificationPromptKind =
  /** Tombol "Aktifkan notifikasi" (izin belum pernah diminta). */
  | "enable"
  /** iPhone/iPad di Safari: petunjuk pasang ke Layar Utama. */
  | "ios-install"

/**
 * Ajakan notifikasi pada modal pembuka: hanya bila server mendukung push,
 * perangkat ini belum aktif, izin belum diblokir, dan ajakan tidak sedang
 * ditunda. Izin yang ditolak tidak bisa diminta ulang dari aplikasi, jadi
 * petunjuknya hanya ada di dialog lonceng.
 */
export function notificationPromptKind(input: {
  serverEnabled: boolean
  availability: PushAvailability
  permission: NotificationPermission | null
  deviceActive: boolean
  snoozedUntil: number
  nowMs: number
}): NotificationPromptKind | null {
  if (!input.serverEnabled || input.deviceActive || input.nowMs < input.snoozedUntil) return null
  if (input.availability === "ios-needs-install") return "ios-install"
  if (input.availability === "supported" && input.permission === "default") return "enable"
  return null
}

/**
 * Modal Info Terbaru dibuka untuk pengumuman belum dibaca atau ajakan
 * notifikasi. Versi baru selalu menampilkan modal sendiri (wajib diperbarui),
 * terlepas dari fungsi ini.
 */
export function shouldShowOpeningModal(input: {
  unreadCount: number
  prompt: NotificationPromptKind | null
}): boolean {
  return input.unreadCount > 0 || input.prompt !== null
}
