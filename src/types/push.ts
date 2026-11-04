// ============================================================
// Kontrak notifikasi Web Push dan pengumuman (client ↔ Pages Functions)
// ============================================================

/** GET /api/push/config */
export interface PushConfigResponse {
  /** false bila kunci VAPID belum dipasang di server. */
  enabled: boolean
  /** Kunci publik VAPID (base64url) untuk PushManager.subscribe. */
  publicKey: string | null
}

/** POST /api/push/subscriptions — sama dengan PushSubscription.toJSON(). */
export interface PushSubscriptionRequest {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

/** DELETE /api/push/subscriptions */
export interface PushUnsubscribeRequest {
  endpoint: string
}

export interface Announcement {
  id: string
  title: string
  body: string
  createdAt: string
  createdByName: string
}

/** GET /api/announcements — terbaru lebih dulu. */
export interface AnnouncementsResponse {
  announcements: Announcement[]
}

/** POST /api/admin/announcements */
export interface CreateAnnouncementRequest {
  title: string
  body: string
}

/** Hasil satu gelombang pengiriman push. */
export interface AnnouncementDelivery {
  /** Diterima push service. */
  sent: number
  /** Gagal sementara (langganan dipertahankan). */
  failed: number
  /** Langganan kedaluwarsa yang dihapus. */
  removed: number
  /** Kursor gelombang berikutnya; null bila semua perangkat sudah diproses. */
  nextAfter: string | null
}

/** POST /api/admin/announcements (201) dan POST …/[id]/send (200) */
export interface AnnouncementSendResponse {
  announcement: Announcement
  delivery: AnnouncementDelivery
}

/** POST /api/admin/announcements/[id]/send */
export interface ContinueAnnouncementRequest {
  after: string
}

/** Payload JSON yang diterima service worker (public/sw-push.js). */
export interface PushPayload {
  title: string
  body: string
  /** Pengelompokan notifikasi; pengumuman yang sama tidak menumpuk. */
  tag: string
  /** Halaman yang dibuka saat notifikasi diklik. */
  url: string
}

export const ANNOUNCEMENT_TITLE_MAX = 80
export const ANNOUNCEMENT_BODY_MAX = 500
