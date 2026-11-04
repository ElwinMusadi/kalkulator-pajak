/**
 * Penyimpanan langganan Web Push dan pengumuman di D1, serta pengiriman
 * pengumuman per gelombang.
 */

import { deviceLabelFromUserAgent } from "../auth/device.ts"
import { auditStatement } from "../auth/audit.ts"
import { isValidId } from "../auth/validation.ts"
import type { AuthContext, Env } from "../types.ts"
import {
  ANNOUNCEMENT_BODY_MAX,
  ANNOUNCEMENT_TITLE_MAX,
  type Announcement,
  type AnnouncementDelivery,
  type PushPayload,
} from "../../src/types/push.ts"
import {
  base64UrlDecode,
  importVapidKeys,
  isUncompressedP256Point,
  MAX_PAYLOAD_BYTES,
  sendWebPush,
  type VapidKeys,
} from "./web-push.ts"

/**
 * Perangkat per gelombang. Pages Functions (Workers gratis) membatasi 50
 * subrequest per permintaan; sisanya dikirim lewat …/[id]/send.
 */
export const PUSH_BATCH_SIZE = 40

/** Push service resmi peramban; endpoint lain ditolak agar server tidak dipakai mengirim POST ke host sembarang. */
const PUSH_SERVICE_HOSTS = [
  /^fcm\.googleapis\.com$/, // Chrome, Edge Android, Samsung Internet, Opera
  /^(?:[a-z0-9-]+\.)*push\.services\.mozilla\.com$/, // Firefox
  /^(?:[a-z0-9-]+\.)*notify\.windows\.com$/, // Edge desktop (WNS)
  /^(?:[a-z0-9-]+\.)*push\.apple\.com$/, // Safari, iPhone/iPad
]

const MAX_ENDPOINT_LENGTH = 1024

// ---------------------------------------------------------------------------
// Konfigurasi VAPID

let cachedKeys: { source: string; keys: VapidKeys | null } | null = null

/** Kunci VAPID dari env; null bila belum dipasang atau tidak valid. */
export async function loadVapidKeys(env: Env): Promise<VapidKeys | null> {
  const pub = env.VAPID_PUBLIC_KEY?.trim() ?? ""
  const priv = env.VAPID_PRIVATE_KEY?.trim() ?? ""
  const subject = env.VAPID_SUBJECT?.trim() ?? ""
  if (!pub || !priv || !subject) return null
  const source = `${pub}|${priv}|${subject}`
  if (cachedKeys?.source !== source) {
    cachedKeys = { source, keys: await importVapidKeys(pub, priv, subject) }
  }
  return cachedKeys.keys
}

// ---------------------------------------------------------------------------
// Validasi

export type Parsed<T> = { ok: true; value: T } | { ok: false; message: string }

export function isAllowedPushEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length > MAX_ENDPOINT_LENGTH) return false
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  return (
    url.protocol === "https:" &&
    url.port === "" &&
    url.username === "" &&
    url.password === "" &&
    PUSH_SERVICE_HOSTS.some((host) => host.test(url.hostname))
  )
}

export interface SubscriptionInput {
  endpoint: string
  p256dh: string
  auth: string
}

export function parseSubscriptionInput(body: Record<string, unknown>): Parsed<SubscriptionInput> {
  if (!isAllowedPushEndpoint(body.endpoint)) {
    return { ok: false, message: "Alamat notifikasi perangkat tidak dikenali." }
  }
  const keys = body.keys
  const p256dh = keys && typeof keys === "object" ? (keys as Record<string, unknown>).p256dh : undefined
  const auth = keys && typeof keys === "object" ? (keys as Record<string, unknown>).auth : undefined
  if (typeof p256dh !== "string" || !isUncompressedP256Point(base64UrlDecode(p256dh))) {
    return { ok: false, message: "Kunci notifikasi perangkat tidak valid." }
  }
  if (typeof auth !== "string" || base64UrlDecode(auth)?.length !== 16) {
    return { ok: false, message: "Kunci notifikasi perangkat tidak valid." }
  }
  return { ok: true, value: { endpoint: body.endpoint, p256dh, auth } }
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null
  // Baris baru dipertahankan (isi pengumuman), karakter kontrol lain dibuang.
  return [...value.replace(/\r\n?/g, "\n")]
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0
      return code === 10 || (code >= 32 && code !== 127)
    })
    .join("")
    .trim()
}

export function parseAnnouncementInput(body: Record<string, unknown>): Parsed<{ title: string; body: string }> {
  const title = cleanText(body.title)?.replace(/\s+/g, " ") ?? null
  const text = cleanText(body.body)
  if (!title) return { ok: false, message: "Judul pengumuman wajib diisi." }
  if ([...title].length > ANNOUNCEMENT_TITLE_MAX) {
    return { ok: false, message: `Judul pengumuman maksimal ${ANNOUNCEMENT_TITLE_MAX} karakter.` }
  }
  if (!text) return { ok: false, message: "Isi pengumuman wajib diisi." }
  if ([...text].length > ANNOUNCEMENT_BODY_MAX) {
    return { ok: false, message: `Isi pengumuman maksimal ${ANNOUNCEMENT_BODY_MAX} karakter.` }
  }
  return { ok: true, value: { title, body: text } }
}

// ---------------------------------------------------------------------------
// Langganan

/**
 * Simpan/pindahkan langganan ke user yang sedang masuk. Endpoint yang sama
 * (perangkat yang sama) menimpa baris lama, termasuk bila sebelumnya milik
 * user lain di perangkat bersama.
 */
export async function upsertSubscription(
  db: D1Database,
  auth: AuthContext,
  input: SubscriptionInput,
  userAgent: string | null,
  nowIso: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, device_label, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET
         user_id = excluded.user_id,
         p256dh = excluded.p256dh,
         auth = excluded.auth,
         device_label = excluded.device_label`,
    )
    .bind(
      crypto.randomUUID(),
      auth.user.id,
      input.endpoint,
      input.p256dh,
      input.auth,
      deviceLabelFromUserAgent(userAgent),
      nowIso,
    )
    .run()
}

/** Hanya langganan milik user ini yang dihapus. */
export async function deleteOwnSubscription(db: D1Database, auth: AuthContext, endpoint: string): Promise<void> {
  await db
    .prepare("DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?")
    .bind(endpoint, auth.user.id)
    .run()
}

// ---------------------------------------------------------------------------
// Pengumuman

interface AnnouncementRow {
  id: string
  title: string
  body: string
  created_at: string
  created_by_name: string
}

function toAnnouncement(row: AnnouncementRow): Announcement {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    createdByName: row.created_by_name,
  }
}

export const ANNOUNCEMENT_LIST_LIMIT = 20

export async function listAnnouncements(db: D1Database): Promise<Announcement[]> {
  const { results } = await db
    .prepare(
      `SELECT id, title, body, created_at, created_by_name
       FROM announcements ORDER BY created_at DESC, id DESC LIMIT ?`,
    )
    .bind(ANNOUNCEMENT_LIST_LIMIT)
    .all<AnnouncementRow>()
  return results.map(toAnnouncement)
}

export async function getAnnouncement(db: D1Database, id: string): Promise<Announcement | null> {
  if (!isValidId(id)) return null
  const row = await db
    .prepare("SELECT id, title, body, created_at, created_by_name FROM announcements WHERE id = ?")
    .bind(id)
    .first<AnnouncementRow>()
  return row ? toAnnouncement(row) : null
}

export async function createAnnouncement(
  db: D1Database,
  admin: AuthContext,
  input: { title: string; body: string },
  nowIso: string,
): Promise<Announcement> {
  const announcement: Announcement = {
    id: crypto.randomUUID(),
    title: input.title,
    body: input.body,
    createdAt: nowIso,
    createdByName: admin.user.name,
  }
  await db.batch([
    db
      .prepare(
        `INSERT INTO announcements (id, title, body, created_by, created_by_name, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(announcement.id, announcement.title, announcement.body, admin.user.id, admin.user.name, nowIso),
    auditStatement(db, {
      actorUserId: admin.user.id,
      action: "announcement.create",
      targetUserId: null,
      createdAt: nowIso,
      metadata: { announcementId: announcement.id },
    }),
  ])
  return announcement
}

export function announcementPayload(announcement: Announcement): Uint8Array {
  const payload: PushPayload = {
    title: announcement.title,
    body: announcement.body,
    tag: `pengumuman-${announcement.id}`,
    url: "/?pengumuman=1",
  }
  const bytes = new TextEncoder().encode(JSON.stringify(payload))
  if (bytes.length > MAX_PAYLOAD_BYTES) throw new Error("Payload pengumuman terlalu besar.")
  return bytes
}

interface SubscriptionRow {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

/**
 * Mengirim satu gelombang (maks. PUSH_BATCH_SIZE perangkat milik user aktif,
 * urut id setelah `after`). Langganan kedaluwarsa (404/410) dihapus.
 */
export async function deliverBatch(
  db: D1Database,
  keys: VapidKeys,
  announcement: Announcement,
  after: string,
  nowMs: number,
  fetchImpl: typeof fetch = fetch,
): Promise<AnnouncementDelivery> {
  const { results } = await db
    .prepare(
      `SELECT ps.id, ps.endpoint, ps.p256dh, ps.auth
       FROM push_subscriptions ps JOIN users u ON u.id = ps.user_id
       WHERE u.active = 1 AND ps.id > ?
       ORDER BY ps.id LIMIT ?`,
    )
    .bind(after, PUSH_BATCH_SIZE + 1)
    .all<SubscriptionRow>()
  const batch = results.slice(0, PUSH_BATCH_SIZE)
  const payload = announcementPayload(announcement)
  const nowSeconds = Math.floor(nowMs / 1000)

  const outcomes = await Promise.all(
    batch.map((row) => sendWebPush(row, payload, keys, nowSeconds, fetchImpl)),
  )

  const sentIds = batch.filter((_, i) => outcomes[i].kind === "sent").map((row) => row.id)
  const goneIds = batch.filter((_, i) => outcomes[i].kind === "gone").map((row) => row.id)
  const nowIso = new Date(nowMs).toISOString()
  const updates: D1PreparedStatement[] = [
    ...sentIds.map((id) =>
      db.prepare("UPDATE push_subscriptions SET last_success_at = ? WHERE id = ?").bind(nowIso, id),
    ),
    ...goneIds.map((id) => db.prepare("DELETE FROM push_subscriptions WHERE id = ?").bind(id)),
  ]
  if (updates.length > 0) await db.batch(updates)

  return {
    sent: sentIds.length,
    failed: batch.length - sentIds.length - goneIds.length,
    removed: goneIds.length,
    nextAfter: results.length > PUSH_BATCH_SIZE ? batch[batch.length - 1].id : null,
  }
}
