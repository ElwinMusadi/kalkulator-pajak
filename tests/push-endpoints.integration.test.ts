/**
 * Integration test notifikasi Web Push dan pengumuman dengan D1 nyata
 * (Miniflare) dan rantai middleware `/api` → route seperti Cloudflare Pages.
 */

import assert from "node:assert/strict"
import { readFile, readdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { Miniflare, convertV4MiniflareOptions } from "miniflare"
import { onRequest as apiMiddleware } from "../functions/api/_middleware.ts"
import * as continueRoute from "../functions/api/admin/announcements/[id]/send.ts"
import * as adminAnnouncementsRoute from "../functions/api/admin/announcements/index.ts"
import * as announcementsRoute from "../functions/api/announcements/index.ts"
import * as loginRoute from "../functions/api/auth/login.ts"
import * as pushConfigRoute from "../functions/api/push/config.ts"
import * as pushSubscriptionsRoute from "../functions/api/push/subscriptions.ts"
import { hashPassword } from "../server/auth/crypto.ts"
import { clock } from "../server/clock.ts"
import { PUSH_BATCH_SIZE } from "../server/push/store.ts"
import { base64UrlDecode, base64UrlEncode } from "../server/push/web-push.ts"
import type { AnnouncementSendResponse, AnnouncementsResponse, PushConfigResponse } from "../src/types/push.ts"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const ORIGIN = "https://app.test"
const UA_ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36"

function pass(name: string) {
  console.log(`  ✓  ${name}`)
}

type Handler = (ctx: unknown) => Promise<Response>
type RouteModule = Partial<Record<string, Handler>>

const ROUTES: Array<{ pattern: RegExp; keys: string[]; module: RouteModule }> = [
  { pattern: /^\/api\/auth\/login$/, keys: [], module: loginRoute as RouteModule },
  { pattern: /^\/api\/push\/config$/, keys: [], module: pushConfigRoute as RouteModule },
  { pattern: /^\/api\/push\/subscriptions$/, keys: [], module: pushSubscriptionsRoute as RouteModule },
  { pattern: /^\/api\/announcements$/, keys: [], module: announcementsRoute as RouteModule },
  { pattern: /^\/api\/admin\/announcements$/, keys: [], module: adminAnnouncementsRoute as RouteModule },
  { pattern: /^\/api\/admin\/announcements\/([^/]+)\/send$/, keys: ["id"], module: continueRoute as RouteModule },
]

const methodExport = (method: string) => `onRequest${method[0]}${method.slice(1).toLowerCase()}`

let env: Record<string, unknown> = {}

async function api(
  method: string,
  pathname: string,
  options: { body?: unknown; token?: string; origin?: string | null } = {},
): Promise<Response> {
  const url = new URL(pathname, ORIGIN)
  const headers = new Headers({ "User-Agent": UA_ANDROID })
  if (options.token) headers.set("Cookie", `__Host-kp_session=${options.token}`)
  const origin = options.origin === undefined ? (method === "GET" ? null : ORIGIN) : options.origin
  if (origin) headers.set("Origin", origin)
  let body: string | undefined
  if (options.body !== undefined) {
    body = JSON.stringify(options.body)
    headers.set("Content-Type", "application/json")
  }
  const request = new Request(url, { method, headers, body })
  const route = ROUTES.find((r) => r.pattern.test(url.pathname))
  const match = route ? url.pathname.match(route.pattern) : null
  const params: Record<string, string> = {}
  route?.keys.forEach((key, i) => (params[key] = decodeURIComponent(match?.[i + 1] ?? "")))
  const handler = route?.module[methodExport(method)]
  const ctx = {
    request,
    env,
    params,
    data: {} as Record<string, unknown>,
    functionPath: url.pathname,
    waitUntil: () => undefined,
    passThroughOnException: () => undefined,
    next: async () => (handler ? handler(ctx) : new Response(null, { status: 405 })),
  }
  const response = await (apiMiddleware as unknown as Handler)(ctx)
  assert.match(response.headers.get("Cache-Control") ?? "", /no-store/)
  return response
}

const json = async <T = Record<string, unknown>>(response: Response) => (await response.json()) as T

function splitSql(sql: string): string[] {
  return sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n")
    .split(";")
    .map((stmt) => stmt.trim())
    .filter(Boolean)
}

// Langganan rekaan: kunci perangkat P-256 dan auth secret sah.
async function fakeSubscription(endpoint: string) {
  const pair = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ])) as CryptoKeyPair
  return {
    endpoint,
    keys: {
      p256dh: base64UrlEncode(new Uint8Array((await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer)),
      auth: base64UrlEncode(crypto.getRandomValues(new Uint8Array(16))),
    },
  }
}

async function vapidEnv() {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
  ])) as CryptoKeyPair
  return {
    VAPID_PUBLIC_KEY: base64UrlEncode(new Uint8Array((await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer)),
    VAPID_PRIVATE_KEY: ((await crypto.subtle.exportKey("jwk", pair.privateKey)) as JsonWebKey).d!,
    VAPID_SUBJECT: "mailto:admin@uptdpenda-kupang.web.id",
  }
}

let nowValue = Date.parse("2026-11-04T08:00:00.000Z")
clock.now = () => nowValue

const mf = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    compatibilityDate: "2025-01-01",
    d1Databases: ["DB"],
    script: "export default { fetch() { return new Response('') } }",
  }),
)

const silenced = { info: console.info, warn: console.warn }
console.info = () => undefined
console.warn = () => undefined
const originalFetch = globalThis.fetch

/** Respons push service per endpoint; endpoint lain diteruskan (Miniflare). */
const pushReplies = new Map<string, number>()
const pushCalls: Array<{ url: string; headers: Headers }> = []

console.log("Menjalankan push & pengumuman integration tests (Miniflare D1)...\n")

try {
  const db = (await mf.getD1Database("DB")) as unknown as D1Database
  env = { DB: db }

  globalThis.fetch = async (input, init) => {
    const url = String(input instanceof Request ? input.url : input)
    if (!/^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com)\//.test(url)) {
      return originalFetch(input, init)
    }
    pushCalls.push({ url, headers: new Headers(init?.headers) })
    return new Response(null, { status: pushReplies.get(url) ?? 201 })
  }

  const files = ["schema.sql", ...(await readdir(path.join(ROOT, "migrations"))).sort().map((f) => `migrations/${f}`)]
  for (const file of files) {
    const sql = await readFile(path.join(ROOT, file), "utf8")
    await db.batch(splitSql(sql).map((stmt) => db.prepare(stmt)))
  }

  const iso = new Date(nowValue).toISOString()
  const users = [
    { id: "10000000-0000-4000-8000-000000000001", username: "admin1", role: "admin", active: 1 },
    { id: "10000000-0000-4000-8000-000000000002", username: "petugas1", role: "petugas", active: 1 },
    { id: "10000000-0000-4000-8000-000000000003", username: "nonaktif", role: "petugas", active: 1 },
  ]
  for (const u of users) {
    await db
      .prepare(
        `INSERT INTO users (id, username, name, role, password_hash, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(u.id, u.username, u.username.toUpperCase(), u.role, await hashPassword(`${u.username}-pass`, 1000), u.active, iso, iso)
      .run()
    await db.prepare("INSERT INTO user_permissions (user_id, module_key) VALUES (?, 'calculator')").bind(u.id).run()
  }

  async function loginOk(username: string): Promise<string> {
    const response = await api("POST", "/api/auth/login", { body: { username, password: `${username}-pass` } })
    assert.equal(response.status, 200, `login ${username}`)
    const token = (response.headers.get("Set-Cookie") ?? "").match(/__Host-kp_session=([^;]+)/)?.[1]
    assert.ok(token)
    return token
  }
  const admin = await loginOk("admin1")
  const petugas = await loginOk("petugas1")
  const nonaktif = await loginOk("nonaktif")

  // 1. Tanpa kunci VAPID: notifikasi nonaktif, pengumuman tetap bisa dibuat.
  {
    assert.equal((await api("GET", "/api/push/config")).status, 401, "tanpa sesi")
    const config = await json<PushConfigResponse>(await api("GET", "/api/push/config", { token: petugas }))
    assert.deepEqual(config, { enabled: false, publicKey: null })
    const sub = await fakeSubscription("https://fcm.googleapis.com/fcm/send/tanpa-vapid")
    const refused = await api("POST", "/api/push/subscriptions", { token: petugas, body: sub })
    assert.equal(refused.status, 503)
    assert.equal((await json(refused)).code, "PUSH_NOT_CONFIGURED")

    const created = await api("POST", "/api/admin/announcements", {
      token: admin,
      body: { title: "Tanpa push", body: "Tersimpan saja." },
    })
    assert.equal(created.status, 201)
    const result = await json<AnnouncementSendResponse>(created)
    assert.deepEqual(result.delivery, { sent: 0, failed: 0, removed: 0, nextAfter: null })
    const lanjut = await api("POST", `/api/admin/announcements/${result.announcement.id}/send`, {
      token: admin,
      body: { after: users[0].id },
    })
    assert.equal(lanjut.status, 503)
    assert.equal(pushCalls.length, 0)
    pass("Tanpa VAPID: config nonaktif, langganan 503, pengumuman tetap tersimpan tanpa push")
  }

  Object.assign(env, await vapidEnv())

  // 2. Config dan validasi langganan
  {
    const config = await json<PushConfigResponse>(await api("GET", "/api/push/config", { token: petugas }))
    assert.equal(config.enabled, true)
    assert.equal(base64UrlDecode(config.publicKey ?? "")?.length, 65)

    const good = await fakeSubscription("https://fcm.googleapis.com/fcm/send/petugas-hp")
    for (const [label, body] of [
      ["host asing", { ...good, endpoint: "https://evil.example/push" }],
      ["http", { ...good, endpoint: "http://fcm.googleapis.com/fcm/send/x" }],
      ["port", { ...good, endpoint: "https://fcm.googleapis.com:8443/fcm/send/x" }],
      ["mirip host", { ...good, endpoint: "https://fcm.googleapis.com.evil.example/x" }],
      ["userinfo", { ...good, endpoint: "https://u:p@fcm.googleapis.com/fcm/send/x" }],
      ["terlalu panjang", { ...good, endpoint: `https://fcm.googleapis.com/${"a".repeat(1100)}` }],
      ["p256dh rusak", { ...good, keys: { ...good.keys, p256dh: "AAAA" } }],
      ["auth rusak", { ...good, keys: { ...good.keys, auth: "AAAA" } }],
      ["tanpa keys", { endpoint: good.endpoint }],
    ] as const) {
      const response = await api("POST", "/api/push/subscriptions", { token: petugas, body })
      assert.equal(response.status, 400, label)
    }
    assert.equal(
      (await api("POST", "/api/push/subscriptions", { token: petugas, body: good, origin: "https://lain.test" })).status,
      403,
      "CSRF origin asing ditolak",
    )

    assert.equal((await api("POST", "/api/push/subscriptions", { token: petugas, body: good })).status, 204)
    // Simpan ulang (kunci perangkat diperbarui) tidak menggandakan baris.
    const renewed = await fakeSubscription(good.endpoint)
    assert.equal((await api("POST", "/api/push/subscriptions", { token: petugas, body: renewed })).status, 204)
    const rows = await db.prepare("SELECT user_id, p256dh, device_label FROM push_subscriptions").all<{
      user_id: string
      p256dh: string
      device_label: string
    }>()
    assert.equal(rows.results.length, 1)
    assert.equal(rows.results[0].user_id, users[1].id)
    assert.equal(rows.results[0].p256dh, renewed.keys.p256dh)
    assert.match(rows.results[0].device_label, /Android/)

    for (const endpoint of [
      "https://updates.push.services.mozilla.com/wpush/v2/abc",
      "https://web.push.apple.com/QAbc",
      "https://wns2-sg2p.notify.windows.com/w/?token=abc",
    ]) {
      const sub = await fakeSubscription(endpoint)
      assert.equal((await api("POST", "/api/push/subscriptions", { token: admin, body: sub })).status, 204, endpoint)
      await db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(endpoint).run()
    }
    pass("Langganan: hanya push service resmi (https, tanpa port/userinfo), kunci sah, CSRF, simpan ulang tanpa duplikat")
  }

  // 3. Perangkat bersama dan hapus langganan
  {
    const shared = await fakeSubscription("https://fcm.googleapis.com/fcm/send/loket-bersama")
    assert.equal((await api("POST", "/api/push/subscriptions", { token: petugas, body: shared })).status, 204)
    assert.equal((await api("POST", "/api/push/subscriptions", { token: admin, body: shared })).status, 204)
    const owner = await db
      .prepare("SELECT user_id FROM push_subscriptions WHERE endpoint = ?")
      .bind(shared.endpoint)
      .first<{ user_id: string }>()
    assert.equal(owner?.user_id, users[0].id, "langganan pindah ke user yang masuk terakhir")

    // Petugas tidak bisa menghapus langganan milik admin.
    assert.equal(
      (await api("DELETE", "/api/push/subscriptions", { token: petugas, body: { endpoint: shared.endpoint } })).status,
      204,
    )
    assert.ok(await db.prepare("SELECT 1 FROM push_subscriptions WHERE endpoint = ?").bind(shared.endpoint).first())
    assert.equal(
      (await api("DELETE", "/api/push/subscriptions", { token: admin, body: { endpoint: shared.endpoint } })).status,
      204,
    )
    assert.equal(await db.prepare("SELECT 1 FROM push_subscriptions WHERE endpoint = ?").bind(shared.endpoint).first(), null)
    assert.equal(
      (await api("DELETE", "/api/push/subscriptions", { token: admin, body: { endpoint: "https://evil.example/x" } })).status,
      400,
    )
    pass("Perangkat bersama: langganan milik user terakhir; hapus hanya milik sendiri")
  }

  // 4. Hak akses dan validasi pengumuman
  {
    const forbidden = await api("POST", "/api/admin/announcements", {
      token: petugas,
      body: { title: "Coba", body: "Isi" },
    })
    assert.equal(forbidden.status, 403)
    for (const [label, body] of [
      ["judul kosong", { title: "   ", body: "Isi" }],
      ["isi kosong", { title: "Judul", body: "" }],
      ["judul panjang", { title: "J".repeat(81), body: "Isi" }],
      ["isi panjang", { title: "Judul", body: "I".repeat(501) }],
      ["bukan teks", { title: 5, body: "Isi" }],
    ] as const) {
      assert.equal((await api("POST", "/api/admin/announcements", { token: admin, body })).status, 400, label)
    }
    assert.equal(
      (await api("POST", "/api/admin/announcements", { token: admin, body: { title: "J".repeat(80), body: "I".repeat(500) } }))
        .status,
      201,
      "tepat di batas diterima",
    )
    pass("Pengumuman: hanya Admin, judul ≤ 80 dan isi ≤ 500 karakter wajib")
  }

  // 5. Pengiriman: perangkat aktif, langganan kedaluwarsa dibuang, user nonaktif dilewati
  {
    await db.prepare("DELETE FROM push_subscriptions").run()
    pushCalls.length = 0
    const subAdmin = await fakeSubscription("https://fcm.googleapis.com/fcm/send/admin-hp")
    const subPetugas = await fakeSubscription("https://fcm.googleapis.com/fcm/send/petugas-hp")
    const subLama = await fakeSubscription("https://updates.push.services.mozilla.com/wpush/v2/lama")
    const subNonaktif = await fakeSubscription("https://fcm.googleapis.com/fcm/send/nonaktif-hp")
    await api("POST", "/api/push/subscriptions", { token: admin, body: subAdmin })
    await api("POST", "/api/push/subscriptions", { token: petugas, body: subPetugas })
    await api("POST", "/api/push/subscriptions", { token: petugas, body: subLama })
    await api("POST", "/api/push/subscriptions", { token: nonaktif, body: subNonaktif })
    await db.prepare("UPDATE users SET active = 0 WHERE id = ?").bind(users[2].id).run()
    pushReplies.set(subLama.endpoint, 410)
    pushReplies.set(subAdmin.endpoint, 429)

    nowValue += 60_000
    const created = await api("POST", "/api/admin/announcements", {
      token: admin,
      body: { title: "  Pembaruan   SWDKLLJ ", body: "Tarif kini per golongan Jasa Raharja.\r\nIsi CC wajib untuk motor." },
    })
    assert.equal(created.status, 201)
    const result = await json<AnnouncementSendResponse>(created)
    assert.equal(result.announcement.title, "Pembaruan SWDKLLJ")
    assert.equal(result.announcement.body, "Tarif kini per golongan Jasa Raharja.\nIsi CC wajib untuk motor.")
    assert.equal(result.announcement.createdByName, "ADMIN1")
    assert.deepEqual(result.delivery, { sent: 1, failed: 1, removed: 1, nextAfter: null })
    assert.deepEqual(
      pushCalls.map((c) => c.url).sort(),
      [subAdmin.endpoint, subLama.endpoint, subPetugas.endpoint].sort(),
      "user nonaktif tidak dikirimi",
    )
    for (const call of pushCalls) {
      assert.equal(call.headers.get("Content-Encoding"), "aes128gcm")
      assert.match(call.headers.get("Authorization") ?? "", /^vapid t=.+, k=/)
    }
    const left = await db.prepare("SELECT endpoint, last_success_at FROM push_subscriptions ORDER BY endpoint").all<{
      endpoint: string
      last_success_at: string | null
    }>()
    assert.deepEqual(
      left.results.map((r) => r.endpoint),
      [subAdmin.endpoint, subNonaktif.endpoint, subPetugas.endpoint],
      "410 dihapus; 429 dan user nonaktif dipertahankan",
    )
    assert.equal(left.results.find((r) => r.endpoint === subPetugas.endpoint)?.last_success_at, new Date(nowValue).toISOString())
    assert.equal(left.results.find((r) => r.endpoint === subAdmin.endpoint)?.last_success_at, null)

    const audit = await db
      .prepare("SELECT actor_user_id, metadata FROM audit_events WHERE action = 'announcement.create' ORDER BY id DESC LIMIT 1")
      .first<{ actor_user_id: string; metadata: string }>()
    assert.equal(audit?.actor_user_id, users[0].id)
    assert.deepEqual(JSON.parse(audit?.metadata ?? "{}"), { announcementId: result.announcement.id })

    const list = await json<AnnouncementsResponse>(await api("GET", "/api/announcements", { token: petugas }))
    assert.equal(list.announcements[0].id, result.announcement.id, "terbaru di atas")
    assert.equal(list.announcements.length, 3)
    pass("Kirim: 201 terkirim, 410 dibuang, 429 dipertahankan, user nonaktif dilewati, audit, riwayat untuk semua")
  }

  // 6. Gelombang: lebih dari PUSH_BATCH_SIZE perangkat
  {
    await db.prepare("DELETE FROM push_subscriptions").run()
    pushReplies.clear()
    const total = PUSH_BATCH_SIZE + 5
    for (let i = 0; i < total; i++) {
      const sub = await fakeSubscription(`https://fcm.googleapis.com/fcm/send/perangkat-${String(i).padStart(2, "0")}`)
      await db
        .prepare(
          `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, device_label, created_at)
           VALUES (?, ?, ?, ?, ?, 'Uji', ?)`,
        )
        .bind(crypto.randomUUID(), users[1].id, sub.endpoint, sub.keys.p256dh, sub.keys.auth, iso)
        .run()
    }
    pushCalls.length = 0
    const first = await json<AnnouncementSendResponse>(
      await api("POST", "/api/admin/announcements", { token: admin, body: { title: "Banyak", body: "Perangkat." } }),
    )
    assert.equal(first.delivery.sent, PUSH_BATCH_SIZE)
    assert.ok(first.delivery.nextAfter)
    const id = first.announcement.id
    const second = await api("POST", `/api/admin/announcements/${id}/send`, {
      token: admin,
      body: { after: first.delivery.nextAfter },
    })
    assert.equal(second.status, 200)
    assert.deepEqual((await json<AnnouncementSendResponse>(second)).delivery, {
      sent: 5,
      failed: 0,
      removed: 0,
      nextAfter: null,
    })
    assert.equal(new Set(pushCalls.map((c) => c.url)).size, total, "setiap perangkat tepat sekali")
    assert.equal(pushCalls.length, total)

    assert.equal(
      (await api("POST", `/api/admin/announcements/${id}/send`, { token: admin, body: { after: "bukan-id" } })).status,
      400,
    )
    assert.equal(
      (await api("POST", `/api/admin/announcements/${users[0].id}/send`, { token: admin, body: { after: users[0].id } }))
        .status,
      404,
    )
    assert.equal(
      (await api("POST", `/api/admin/announcements/${id}/send`, { token: petugas, body: { after: users[0].id } })).status,
      403,
    )
    pass(`Gelombang: ${total} perangkat dikirim ${PUSH_BATCH_SIZE} + 5, kursor sah, id tak dikenal 404, petugas 403`)
  }
} finally {
  console.info = silenced.info
  console.warn = silenced.warn
  globalThis.fetch = originalFetch
  await mf.dispose()
}

console.log("\nSemua push & pengumuman integration tests: PASS ✓\n")
