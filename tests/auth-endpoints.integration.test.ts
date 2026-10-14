/**
 * Integration test auth/admin dengan D1 nyata (Miniflare/workerd) dan rantai
 * middleware `/api` → route handler seperti pada Cloudflare Pages.
 */

import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { Miniflare, convertV4MiniflareOptions } from "miniflare"
import { onRequest as apiMiddleware } from "../functions/api/_middleware.ts"
import * as adminUserRoute from "../functions/api/admin/users/[id]/index.ts"
import * as adminPermissionsRoute from "../functions/api/admin/users/[id]/permissions.ts"
import * as adminResetRoute from "../functions/api/admin/users/[id]/reset-password.ts"
import * as adminSessionRoute from "../functions/api/admin/users/[id]/sessions/[sessionId].ts"
import * as adminSessionsRoute from "../functions/api/admin/users/[id]/sessions/index.ts"
import * as adminUsersRoute from "../functions/api/admin/users/index.ts"
import * as loginRoute from "../functions/api/auth/login.ts"
import * as logoutRoute from "../functions/api/auth/logout.ts"
import * as meRoute from "../functions/api/auth/me.ts"
import * as njkbRoute from "../functions/api/njkb/[nopol].ts"
import { deleteUser, updateUser } from "../server/auth/admin-users.ts"
import { hashPassword } from "../server/auth/crypto.ts"
import { clock } from "../server/clock.ts"
import type { AuthContext } from "../server/types.ts"
import {
  MODULE_KEYS,
  type AdminUserResponse,
  type AdminUsersResponse,
  type AuthMeResponse,
  type ModuleKey,
} from "../src/types/auth.ts"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const ORIGIN = "https://app.test"
const UA_CHROME_WIN =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

function pass(name: string) {
  console.log(`  ✓  ${name}`)
}

// ---------------------------------------------------------------------------
// Router minimal: path → handler module + params (meniru routing file-based Pages)

type Handler = (ctx: unknown) => Promise<Response>
type RouteModule = Partial<Record<string, Handler>>

const ROUTES: Array<{ pattern: RegExp; keys: string[]; module: RouteModule }> = [
  { pattern: /^\/api\/auth\/login$/, keys: [], module: loginRoute as RouteModule },
  { pattern: /^\/api\/auth\/me$/, keys: [], module: meRoute as RouteModule },
  { pattern: /^\/api\/auth\/logout$/, keys: [], module: logoutRoute as RouteModule },
  { pattern: /^\/api\/admin\/users$/, keys: [], module: adminUsersRoute as RouteModule },
  { pattern: /^\/api\/admin\/users\/([^/]+)$/, keys: ["id"], module: adminUserRoute as RouteModule },
  {
    pattern: /^\/api\/admin\/users\/([^/]+)\/reset-password$/,
    keys: ["id"],
    module: adminResetRoute as RouteModule,
  },
  {
    pattern: /^\/api\/admin\/users\/([^/]+)\/permissions$/,
    keys: ["id"],
    module: adminPermissionsRoute as RouteModule,
  },
  {
    pattern: /^\/api\/admin\/users\/([^/]+)\/sessions$/,
    keys: ["id"],
    module: adminSessionsRoute as RouteModule,
  },
  {
    pattern: /^\/api\/admin\/users\/([^/]+)\/sessions\/([^/]+)$/,
    keys: ["id", "sessionId"],
    module: adminSessionRoute as RouteModule,
  },
  { pattern: /^\/api\/njkb\/([^/]+)$/, keys: ["nopol"], module: njkbRoute as RouteModule },
]

function methodExport(method: string): string {
  const m = method.toUpperCase()
  return `onRequest${m[0]}${m.slice(1).toLowerCase()}`
}

let env: { DB: D1Database }

interface CallOptions {
  body?: unknown
  rawBody?: string
  token?: string | null
  origin?: string | null
  headers?: Record<string, string>
  userAgent?: string
}

async function api(method: string, pathname: string, options: CallOptions = {}): Promise<Response> {
  const url = new URL(pathname, ORIGIN)
  const headers = new Headers(options.headers)
  headers.set("User-Agent", options.userAgent ?? UA_CHROME_WIN)
  if (options.token) headers.set("Cookie", `__Host-kp_session=${options.token}`)
  const isSafe = method === "GET" || method === "HEAD"
  const origin = options.origin === undefined ? (isSafe ? null : ORIGIN) : options.origin
  if (origin) headers.set("Origin", origin)
  let body: string | undefined
  if (options.rawBody !== undefined) body = options.rawBody
  else if (options.body !== undefined) {
    body = JSON.stringify(options.body)
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json")
  }
  const request = new Request(url, { method, headers, body })

  const route = ROUTES.find((r) => r.pattern.test(url.pathname))
  const match = route ? url.pathname.match(route.pattern) : null
  const params: Record<string, string> = {}
  route?.keys.forEach((key, index) => (params[key] = decodeURIComponent(match?.[index + 1] ?? "")))
  const handler = route?.module[methodExport(method)] ?? route?.module.onRequest

  const ctx = {
    request,
    env,
    params,
    data: {} as Record<string, unknown>,
    functionPath: url.pathname,
    waitUntil: () => undefined,
    passThroughOnException: () => undefined,
    // Tanpa route: Pages menyajikan SPA fallback index.html (200 text/html).
    next: async () =>
      handler
        ? handler(ctx)
        : route
          ? new Response(null, { status: 405 })
          : new Response("<!doctype html><title>app</title>", {
              status: 200,
              headers: { "Content-Type": "text/html; charset=utf-8" },
            }),
  }
  const response = await (apiMiddleware as unknown as Handler)(ctx)

  // Invarian global: seluruh respons /api no-store + nosniff, tanpa rahasia.
  assert.match(response.headers.get("Cache-Control") ?? "", /no-store/)
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff")
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null)
  const text = await response.clone().text()
  assert.equal(/pbkdf2|password_hash|token_hash/i.test(text), false, "respons memuat rahasia")
  if (options.token) assert.equal(text.includes(options.token), false, "respons memuat token")
  return response
}

function sessionTokenFrom(response: Response): string | null {
  const cookie = response.headers.get("Set-Cookie") ?? ""
  const match = cookie.match(/__Host-kp_session=([^;]*)/)
  return match && match[1] ? match[1] : null
}

function isClearCookie(response: Response): boolean {
  const cookie = response.headers.get("Set-Cookie") ?? ""
  return cookie.includes("__Host-kp_session=;") && cookie.includes("Max-Age=0")
}

async function json<T = Record<string, unknown>>(response: Response): Promise<T> {
  return (await response.json()) as T
}

async function login(username: string, password: string, userAgent?: string) {
  const response = await api("POST", "/api/auth/login", { body: { username, password }, userAgent })
  return { response, token: sessionTokenFrom(response) }
}

async function loginOk(username: string, password: string, userAgent?: string): Promise<string> {
  const { response, token } = await login(username, password, userAgent)
  assert.equal(response.status, 200, `login ${username}`)
  assert.ok(token)
  return token
}

// ---------------------------------------------------------------------------
// Setup D1

function splitSql(sql: string): string[] {
  return sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n")
    .split(";")
    .map((stmt) => stmt.trim())
    .filter(Boolean)
}

let nowValue = Date.parse("2026-10-13T00:00:00.000Z")
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

console.log("Menjalankan auth endpoint integration tests (Miniflare D1)...\n")

try {
  const db = (await mf.getD1Database("DB")) as unknown as D1Database
  env = { DB: db }
  for (const file of [
    "schema.sql",
    "migrations/0001_auth.sql",
    "migrations/0002_vehicle_plate_color.sql",
  ]) {
    const sql = await readFile(path.join(ROOT, file), "utf8")
    await db.batch(splitSql(sql).map((stmt) => db.prepare(stmt)))
  }
  await db
    .prepare(
      `INSERT INTO vehicle_njkb (nopol, nama, jenis, jatuh_tempo_stnk, jatuh_tempo_pajak, njkb, njub, bobot)
       VALUES ('DH2506KA', 'D1 OWNER', 'SEPEDA MOTOR', '2027-09-13', '2026-09-13', 11500000, 0, 1)`,
    )
    .run()

  const ids = {
    admin: "00000000-0000-4000-8000-000000000001",
    admin2: "00000000-0000-4000-8000-000000000002",
    petugas: "00000000-0000-4000-8000-000000000003",
    inactive: "00000000-0000-4000-8000-000000000004",
  }
  const seed = async (id: string, username: string, role: string, active: number, perms: ModuleKey[]) => {
    const iso = new Date(nowValue).toISOString()
    await db.batch([
      db
        .prepare(
          `INSERT INTO users (id, username, name, role, password_hash, active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(id, username, username.toUpperCase(), role, await hashPassword(`${username}-pass`), active, iso, iso),
      ...perms.map((key) =>
        db.prepare(`INSERT INTO user_permissions (user_id, module_key) VALUES (?, ?)`).bind(id, key),
      ),
    ])
  }
  await seed(ids.admin, "admin", "admin", 1, [])
  await seed(ids.admin2, "admin2", "admin", 1, [])
  await seed(ids.petugas, "petugas", "petugas", 1, ["calculator", "vehicle_lookup.d1"])
  await seed(ids.inactive, "nonaktif", "petugas", 0, ["calculator"])

  const sessionCount = async (userId: string) =>
    ((await db.prepare(`SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?`).bind(userId).first<{ n: number }>())?.n ?? 0)

  // --- Login --------------------------------------------------------------
  let adminToken: string
  {
    const { response, token } = await login(" ADMIN ", "admin-pass")
    assert.equal(response.status, 200)
    const cookie = response.headers.get("Set-Cookie") ?? ""
    for (const attr of ["HttpOnly", "Secure", "SameSite=Strict", "Path=/", "Max-Age=604800"]) {
      assert.ok(cookie.includes(attr), attr)
    }
    const me = await json<AuthMeResponse>(response)
    assert.equal(me.user.username, "admin")
    assert.deepEqual(me.user.permissions, [...MODULE_KEYS])
    adminToken = token!
    const stored = await db.prepare(`SELECT token_hash FROM sessions WHERE user_id = ?`).bind(ids.admin).first<{ token_hash: string }>()
    assert.ok(stored && stored.token_hash !== adminToken && /^[0-9a-f]{64}$/.test(stored.token_hash))
    const audit = await db.prepare(`SELECT COUNT(*) AS n FROM audit_events WHERE action = 'login'`).first<{ n: number }>()
    assert.equal(audit?.n, 1)
    pass("Login admin: cookie HttpOnly/Secure/SameSite=Strict/7 hari, token hanya disimpan sebagai hash, audit login")
  }

  {
    for (const [username, password] of [
      ["admin", "salah-password"],
      ["tidakada", "admin-pass"],
      ["nonaktif", "nonaktif-pass"],
      ["admin", "x".repeat(500)],
    ]) {
      const { response, token } = await login(username, password)
      assert.equal(response.status, 401)
      assert.equal(token, null)
      assert.deepEqual(await json(response), {
        message: "Username atau password salah.",
        code: "INVALID_CREDENTIALS",
      })
    }
    const missing = await api("POST", "/api/auth/login", { body: { username: "admin" } })
    assert.equal(missing.status, 400)
    const wrongType = await api("POST", "/api/auth/login", { rawBody: "{}", headers: { "Content-Type": "text/plain" } })
    assert.equal(wrongType.status, 415)
    pass("Login gagal: password salah/user tidak ada/nonaktif → 401 generik; body invalid 400/415")
  }

  // --- Petugas single session -------------------------------------------
  let petugasToken: string
  {
    const results = await Promise.all([login("petugas", "petugas-pass"), login("petugas", "petugas-pass")])
    const statuses = results.map((r) => r.response.status).sort()
    assert.deepEqual(statuses, [200, 409])
    const conflict = results.find((r) => r.response.status === 409)!
    assert.deepEqual(await json(conflict.response), {
      message: "Akun sudah aktif di perangkat lain. Hubungi Admin.",
      code: "SESSION_ACTIVE_ELSEWHERE",
    })
    petugasToken = results.find((r) => r.response.status === 200)!.token!
    assert.equal(await sessionCount(ids.petugas), 1)
    const ok = results.find((r) => r.response.status === 200)!
    assert.ok((ok.response.headers.get("Set-Cookie") ?? "").includes("Max-Age=34560000"))

    const again = await login("petugas", "petugas-pass")
    assert.equal(again.response.status, 409)
    pass("Petugas: login bersamaan → tepat satu 200 dan satu 409; login berikutnya 409; cookie 400 hari")
  }

  {
    const second = await loginOk("admin", "admin-pass", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Version/17.0 Mobile Safari/604.1")
    assert.notEqual(second, adminToken)
    assert.equal((await api("GET", "/api/auth/me", { token: adminToken })).status, 200)
    assert.equal((await api("GET", "/api/auth/me", { token: second })).status, 200)
    assert.equal(await sessionCount(ids.admin), 2)
    pass("Admin: beberapa perangkat aktif bersamaan")
  }

  // --- Unauthenticated / CSRF ------------------------------------------------
  {
    const none = await api("GET", "/api/auth/me")
    assert.equal(none.status, 401)
    assert.equal((await json(none)).code, "UNAUTHENTICATED")
    assert.ok(isClearCookie(none))
    const bogus = await api("GET", "/api/auth/me", { token: "A".repeat(43) })
    assert.equal(bogus.status, 401)
    assert.ok(isClearCookie(bogus))
    const njkb = await api("GET", "/api/njkb/DH2506KA?source=d1")
    assert.equal(njkb.status, 401)
    pass("Tanpa sesi/token tidak dikenal → 401 UNAUTHENTICATED + hapus cookie")
  }

  {
    const cross = await api("POST", "/api/auth/login", {
      body: { username: "admin", password: "admin-pass" },
      origin: "https://evil.test",
    })
    assert.equal(cross.status, 403)
    assert.equal((await json(cross)).code, "CSRF_REJECTED")
    const crossDelete = await api("DELETE", `/api/admin/users/${ids.petugas}/sessions`, {
      token: adminToken,
      origin: "https://evil.test",
    })
    assert.equal(crossDelete.status, 403)
    assert.equal(await sessionCount(ids.petugas), 1)
    const noOrigin = await api("POST", "/api/auth/login", {
      body: { username: "admin", password: "admin-pass" },
      origin: null,
    })
    assert.equal(noOrigin.status, 403)
    const fetchSite = await api("POST", "/api/auth/login", {
      body: { username: "admin", password: "admin-pass" },
      origin: null,
      headers: { "Sec-Fetch-Site": "same-origin" },
    })
    assert.equal(fetchSite.status, 200)
    await api("POST", "/api/auth/logout", { token: sessionTokenFrom(fetchSite) })
    pass("CSRF: Origin lain → 403 CSRF_REJECTED; tanpa Origin hanya lolos dengan Sec-Fetch-Site same-origin")
  }

  // --- Logout ------------------------------------------------------------
  {
    const petugasLogout = await api("POST", "/api/auth/logout", { token: petugasToken })
    assert.equal(petugasLogout.status, 403)
    assert.equal((await json(petugasLogout)).code, "FORBIDDEN")
    assert.equal(await sessionCount(ids.petugas), 1)

    const extra = await loginOk("admin", "admin-pass")
    const before = await sessionCount(ids.admin)
    const logout = await api("POST", "/api/auth/logout", { token: extra })
    assert.equal(logout.status, 204)
    assert.ok(isClearCookie(logout))
    assert.equal(await sessionCount(ids.admin), before - 1)
    const logoutAudit = await db
      .prepare(`SELECT actor_user_id, target_user_id, metadata FROM audit_events WHERE action = 'auth.logout' ORDER BY id DESC LIMIT 1`)
      .first<{ actor_user_id: string; target_user_id: string; metadata: string }>()
    assert.equal(logoutAudit?.actor_user_id, ids.admin)
    assert.equal(logoutAudit?.target_user_id, ids.admin)
    assert.equal(/token|password|pbkdf2/i.test(logoutAudit?.metadata ?? ""), false)
    const auditsBefore = (await db.prepare(`SELECT COUNT(*) AS n FROM audit_events WHERE action = 'auth.logout'`).first<{ n: number }>())?.n
    assert.equal((await api("POST", "/api/auth/logout", { token: petugasToken })).status, 403)
    const auditsAfter = (await db.prepare(`SELECT COUNT(*) AS n FROM audit_events WHERE action = 'auth.logout'`).first<{ n: number }>())?.n
    assert.equal(auditsAfter, auditsBefore, "logout petugas tidak diaudit sebagai logout")
    assert.equal((await api("GET", "/api/auth/me", { token: extra })).status, 401)
    assert.equal((await api("GET", "/api/auth/me", { token: adminToken })).status, 200)
    pass("Logout: petugas 403 (sesi tetap); admin 204 hanya menghapus sesi saat ini + hapus cookie")
  }

  // --- Petugas forbidden on admin endpoints -------------------------------
  {
    const calls: Array<[string, string, unknown?]> = [
      ["GET", "/api/admin/users"],
      ["POST", "/api/admin/users", { username: "x1x", name: "X", password: "password1", role: "admin", permissions: [] }],
      ["PATCH", `/api/admin/users/${ids.petugas}`, { role: "admin" }],
      ["DELETE", `/api/admin/users/${ids.admin}`],
      ["POST", `/api/admin/users/${ids.petugas}/reset-password`, { password: "password1" }],
      ["PUT", `/api/admin/users/${ids.petugas}/permissions`, { permissions: [...MODULE_KEYS] }],
      ["DELETE", `/api/admin/users/${ids.petugas}/sessions`],
    ]
    for (const [method, url, body] of calls) {
      const response = await api(method, url, { token: petugasToken, body })
      assert.equal(response.status, 403, `${method} ${url}`)
      assert.equal((await json(response)).code, "FORBIDDEN")
    }
    const me = await json<AuthMeResponse>(await api("GET", "/api/auth/me", { token: petugasToken }))
    assert.equal(me.user.role, "petugas")
    assert.deepEqual(me.user.permissions, ["calculator", "vehicle_lookup.d1"])
    pass("Petugas → 403 FORBIDDEN pada seluruh endpoint admin; /me memuat permission tersimpan")
  }

  // --- NJKB permission via full chain ----------------------------------------
  {
    const d1 = await api("GET", "/api/njkb/DH2506KA?source=d1", { token: petugasToken })
    assert.equal(d1.status, 200)
    assert.equal(d1.headers.get("Cache-Control"), "private, no-store")
    const d1Json = await json(d1)
    assert.equal(d1Json.source, "d1")
    // D1 nyata dengan migration 0002: kolom warna_plat NULL → warnaPlat null.
    assert.equal(d1Json.warnaPlat, null)
    for (const source of ["api", "d1_then_api"]) {
      const denied = await api("GET", `/api/njkb/DH2506KA?source=${source}`, { token: petugasToken })
      assert.equal(denied.status, 403)
      assert.equal((await json(denied)).code, "FORBIDDEN")
    }
    const adminD1 = await api("GET", "/api/njkb/DH2506KA?source=d1", { token: adminToken })
    assert.equal(adminD1.status, 200)
    pass("NJKB via middleware: petugas d1 diizinkan, api/d1_then_api 403; admin diizinkan")
  }

  // --- Admin list/create ---------------------------------------------------
  let createdId: string
  {
    const list = await api("GET", "/api/admin/users", { token: adminToken })
    assert.equal(list.status, 200)
    const { users } = await json<AdminUsersResponse>(list)
    const petugas = users.find((u) => u.id === ids.petugas)!
    assert.equal(petugas.sessions.length, 1)
    assert.equal(petugas.sessions[0].deviceLabel, "Chrome di Windows")
    assert.deepEqual(Object.keys(petugas.sessions[0]).sort(), ["createdAt", "deviceLabel", "id", "lastSeenAt"])
    assert.deepEqual(users.find((u) => u.id === ids.admin)!.permissions, [...MODULE_KEYS])
    assert.equal(users.find((u) => u.id === ids.inactive)!.active, false)

    const create = await api("POST", "/api/admin/users", {
      token: adminToken,
      body: {
        username: " Petugas.Baru ",
        name: " Petugas Baru ",
        password: "password-baru",
        role: "petugas",
        permissions: ["vehicle_lookup.api", "calculator"],
        ignored: true,
      },
    })
    assert.equal(create.status, 201)
    const { user } = await json<AdminUserResponse>(create)
    assert.equal(user.username, "petugas.baru")
    assert.equal(user.name, "Petugas Baru")
    assert.deepEqual(user.permissions, ["calculator", "vehicle_lookup.api"])
    assert.deepEqual(user.sessions, [])
    createdId = user.id

    const taken = await api("POST", "/api/admin/users", {
      token: adminToken,
      body: { username: "PETUGAS.BARU", name: "X", password: "password-baru", role: "petugas", permissions: [] },
    })
    assert.equal(taken.status, 409)
    assert.equal((await json(taken)).code, "USERNAME_TAKEN")

    const invalid = await api("POST", "/api/admin/users", {
      token: adminToken,
      body: { username: "ok_name", name: "X", password: "short", role: "petugas", permissions: [] },
    })
    assert.equal(invalid.status, 400)
    assert.equal((await json(invalid)).code, "VALIDATION_ERROR")
    assert.equal((await loginOk("petugas.baru", "password-baru")).length, 43)
    pass("Admin list (sesi + permission efektif) dan create 201; USERNAME_TAKEN 409; validasi 400")
  }

  // --- Permissions PUT ---------------------------------------------------
  {
    const put = await api("PUT", `/api/admin/users/${ids.petugas}/permissions`, {
      token: adminToken,
      body: { permissions: ["calculator", "vehicle_lookup.api", "vehicle_lookup.d1"] },
    })
    assert.equal(put.status, 200)
    assert.deepEqual((await json<AdminUserResponse>(put)).user.permissions, [
      "calculator",
      "vehicle_lookup.d1",
      "vehicle_lookup.api",
    ])
    const both = await api("GET", "/api/njkb/DH2506KA?source=d1_then_api", { token: petugasToken })
    assert.equal(both.status, 200, "permission baru berlaku tanpa login ulang")

    const toAdmin = await api("PUT", `/api/admin/users/${ids.admin2}/permissions`, {
      token: adminToken,
      body: { permissions: [] },
    })
    assert.equal(toAdmin.status, 400)
    assert.equal((await json(toAdmin)).code, "VALIDATION_ERROR")
    const dup = await api("PUT", `/api/admin/users/${ids.petugas}/permissions`, {
      token: adminToken,
      body: { permissions: ["calculator", "calculator"] },
    })
    assert.equal(dup.status, 400)
    const missing = await api("PUT", `/api/admin/users/00000000-0000-4000-8000-00000000ffff/permissions`, {
      token: adminToken,
      body: { permissions: [] },
    })
    assert.equal(missing.status, 404)
    const badId = await api("PATCH", `/api/admin/users/not-a-uuid`, { token: adminToken, body: { name: "x" } })
    assert.equal(badId.status, 404)
    assert.equal((await json(badId)).code, "NOT_FOUND")
    pass("PUT permissions petugas berlaku langsung; target admin 400; duplikat 400; id tidak ada/invalid 404")
  }

  // --- Admin deletes petugas session --------------------------------------
  {
    const del = await api("DELETE", `/api/admin/users/${ids.petugas}/sessions`, { token: adminToken })
    assert.equal(del.status, 204)
    assert.equal(del.headers.get("Set-Cookie"), null)
    const old = await api("GET", "/api/auth/me", { token: petugasToken })
    assert.equal(old.status, 401)
    assert.ok(isClearCookie(old))
    petugasToken = await loginOk("petugas", "petugas-pass")
    pass("Admin hapus sesi petugas → cookie lama 401, petugas dapat login lagi")
  }

  {
    const list = await json<AdminUsersResponse>(await api("GET", "/api/admin/users", { token: adminToken }))
    const sessionId = list.users.find((u) => u.id === ids.petugas)!.sessions[0].id
    const wrongUser = await api("DELETE", `/api/admin/users/${ids.admin}/sessions/${sessionId}`, { token: adminToken })
    assert.equal(wrongUser.status, 404)
    const del = await api("DELETE", `/api/admin/users/${ids.petugas}/sessions/${sessionId}`, { token: adminToken })
    assert.equal(del.status, 204)
    assert.equal((await api("GET", "/api/auth/me", { token: petugasToken })).status, 401)
    petugasToken = await loginOk("petugas", "petugas-pass")
    pass("DELETE satu sesi: harus milik user target (404 bila tidak), lalu token lama 401")
  }

  // --- Reset password ---------------------------------------------------
  {
    const reset = await api("POST", `/api/admin/users/${ids.petugas}/reset-password`, {
      token: adminToken,
      body: { password: "password-baru-1" },
    })
    assert.equal(reset.status, 204)
    assert.equal((await api("GET", "/api/auth/me", { token: petugasToken })).status, 200, "sesi tetap")
    await api("DELETE", `/api/admin/users/${ids.petugas}/sessions`, { token: adminToken })
    assert.equal((await login("petugas", "petugas-pass")).response.status, 401)
    petugasToken = await loginOk("petugas", "password-baru-1")

    const self = await api("POST", `/api/admin/users/${ids.admin}/reset-password`, {
      token: adminToken,
      body: { password: "admin-pass-2" },
    })
    assert.equal(self.status, 204)
    assert.equal((await api("GET", "/api/auth/me", { token: adminToken })).status, 200)
    adminToken = await loginOk("admin", "admin-pass-2")
    const short = await api("POST", `/api/admin/users/${ids.petugas}/reset-password`, {
      token: adminToken,
      body: { password: "short" },
    })
    assert.equal(short.status, 400)
    pass("Reset password: sesi tidak dihapus, password lama gagal/baru berhasil, admin dapat reset diri sendiri")
  }

  // --- Update: role change & deactivation remove sessions ------------------
  {
    // petugas.baru sudah login pada skenario create → satu sesi petugas aktif.
    assert.equal(await sessionCount(createdId), 1)
    const promote = await api("PATCH", `/api/admin/users/${createdId}`, {
      token: adminToken,
      body: { role: "admin", name: "Baru Admin" },
    })
    assert.equal(promote.status, 200)
    const promoted = (await json<AdminUserResponse>(promote)).user
    assert.equal(promoted.role, "admin")
    assert.deepEqual(promoted.permissions, [...MODULE_KEYS])
    assert.equal(await sessionCount(createdId), 0)
    const storedPerms = await db.prepare(`SELECT COUNT(*) AS n FROM user_permissions WHERE user_id = ?`).bind(createdId).first<{ n: number }>()
    assert.equal(storedPerms?.n, 0, "permission tidak disimpan untuk admin")

    const promotedToken = await loginOk("petugas.baru", "password-baru")
    const demote = await api("PATCH", `/api/admin/users/${createdId}`, { token: adminToken, body: { role: "petugas" } })
    assert.equal(demote.status, 200)
    assert.deepEqual((await json<AdminUserResponse>(demote)).user.permissions, [])
    assert.equal((await api("GET", "/api/auth/me", { token: promotedToken })).status, 401)

    const nameOnly = await api("PATCH", `/api/admin/users/${ids.petugas}`, { token: adminToken, body: { name: "Petugas Satu" } })
    assert.equal(nameOnly.status, 200)
    assert.equal((await api("GET", "/api/auth/me", { token: petugasToken })).status, 200, "ubah nama tidak menghapus sesi")

    const deactivate = await api("PATCH", `/api/admin/users/${ids.petugas}`, { token: adminToken, body: { active: false } })
    assert.equal(deactivate.status, 200)
    assert.equal((await json<AdminUserResponse>(deactivate)).user.active, false)
    assert.equal(await sessionCount(ids.petugas), 0)
    assert.equal((await api("GET", "/api/auth/me", { token: petugasToken })).status, 401)
    assert.equal((await login("petugas", "password-baru-1")).response.status, 401)
    const reactivate = await api("PATCH", `/api/admin/users/${ids.petugas}`, { token: adminToken, body: { active: true } })
    assert.equal(reactivate.status, 200)
    petugasToken = await loginOk("petugas", "password-baru-1")

    const empty = await api("PATCH", `/api/admin/users/${ids.petugas}`, { token: adminToken, body: {} })
    assert.equal(empty.status, 400)
    pass("PATCH: ubah role menghapus sesi & permission admin; nonaktif menghapus sesi dan memblokir login")
  }

  // --- Self & last admin guards ----------------------------------------
  {
    for (const body of [{ role: "petugas" }, { active: false }]) {
      const response = await api("PATCH", `/api/admin/users/${ids.admin}`, { token: adminToken, body })
      assert.equal(response.status, 409)
      assert.equal((await json(response)).code, "SELF_MODIFICATION")
    }
    const selfDelete = await api("DELETE", `/api/admin/users/${ids.admin}`, { token: adminToken })
    assert.equal(selfDelete.status, 409)
    assert.equal((await json(selfDelete)).code, "SELF_MODIFICATION")
    const selfRename = await api("PATCH", `/api/admin/users/${ids.admin}`, { token: adminToken, body: { name: "Admin Utama" } })
    assert.equal(selfRename.status, 200)

    // LAST_ADMIN: guard atomik di SQL (mis. dua admin saling menonaktifkan bersamaan).
    await db.prepare(`UPDATE users SET active = 0 WHERE id IN (?, ?)`).bind(ids.admin, createdId).run()
    const actor: AuthContext = {
      user: { id: ids.admin, username: "admin", name: "Admin", role: "admin", permissions: [...MODULE_KEYS] },
      session: { id: "00000000-0000-4000-8000-0000000000aa", isPetugas: false },
    }
    assert.equal((await updateUser(db, actor, ids.admin2, { active: false })).kind, "last_admin")
    assert.equal((await updateUser(db, actor, ids.admin2, { role: "petugas" })).kind, "last_admin")
    assert.equal((await deleteUser(db, actor, ids.admin2)).kind, "last_admin")
    assert.equal((await updateUser(db, actor, ids.admin2, { name: "Admin Dua" })).kind, "ok")
    await db.prepare(`UPDATE users SET active = 1 WHERE id = ?`).bind(ids.admin).run()
    adminToken = await loginOk("admin", "admin-pass-2")

    const list = await json<AdminUsersResponse>(await api("GET", "/api/admin/users", { token: adminToken }))
    const activeAdmins = list.users.filter((u) => u.role === "admin" && u.active)
    assert.equal(activeAdmins.length, 2)
    pass("Guard SELF_MODIFICATION (role/active/delete diri) dan LAST_ADMIN atomik di SQL")
  }

  // --- Delete cascade -------------------------------------------------------
  {
    const victim = await api("POST", "/api/admin/users", {
      token: adminToken,
      body: { username: "hapus.saya", name: "Hapus", password: "password-x", role: "petugas", permissions: ["calculator"] },
    })
    const victimId = (await json<AdminUserResponse>(victim)).user.id
    const victimToken = await loginOk("hapus.saya", "password-x")
    const del = await api("DELETE", `/api/admin/users/${victimId}`, { token: adminToken })
    assert.equal(del.status, 204)
    assert.equal(await sessionCount(victimId), 0)
    const perms = await db.prepare(`SELECT COUNT(*) AS n FROM user_permissions WHERE user_id = ?`).bind(victimId).first<{ n: number }>()
    assert.equal(perms?.n, 0)
    assert.equal((await api("GET", "/api/auth/me", { token: victimToken })).status, 401)
    assert.equal((await api("DELETE", `/api/admin/users/${victimId}`, { token: adminToken })).status, 404)
    const audits = await db
      .prepare(`SELECT action, metadata FROM audit_events WHERE target_user_id = ? ORDER BY id`)
      .bind(victimId)
      .all<{ action: string; metadata: string | null }>()
    assert.deepEqual(audits.results.map((r) => r.action), ["user.create", "login", "user.delete"])
    const allAudit = await db.prepare(`SELECT metadata FROM audit_events`).all<{ metadata: string | null }>()
    assert.equal(allAudit.results.some((r) => /password|pbkdf2|token/i.test(r.metadata ?? "")), false)
    pass("DELETE user: sesi & permission ikut terhapus, token lama 401, audit tanpa rahasia")
  }

  // --- Admin deletes own sessions → cookie cleared --------------------------
  {
    const del = await api("DELETE", `/api/admin/users/${ids.admin}/sessions`, { token: adminToken })
    assert.equal(del.status, 204)
    assert.ok(isClearCookie(del))
    assert.equal((await api("GET", "/api/auth/me", { token: adminToken })).status, 401)
    adminToken = await loginOk("admin", "admin-pass-2")
    pass("Admin menghapus sesinya sendiri → 204 + hapus cookie")
  }

  // --- Expiry & throttling --------------------------------------------------
  {
    const lastSeen = async (token: string) => {
      const { hashSessionToken } = await import("../server/auth/crypto.ts")
      return (
        await db.prepare(`SELECT last_seen_at FROM sessions WHERE token_hash = ?`).bind(await hashSessionToken(token)).first<{ last_seen_at: string }>()
      )?.last_seen_at
    }
    const before = await lastSeen(adminToken)
    nowValue += 4 * 60 * 1000
    assert.equal((await api("GET", "/api/auth/me", { token: adminToken })).status, 200)
    assert.equal(await lastSeen(adminToken), before, "last_seen tidak ditulis < 5 menit")
    nowValue += 2 * 60 * 1000
    assert.equal((await api("GET", "/api/auth/me", { token: adminToken })).status, 200)
    assert.notEqual(await lastSeen(adminToken), before, "last_seen ditulis setelah ≥ 5 menit")

    // Idle 12 jam.
    nowValue += 12 * HOUR
    const idle = await api("GET", "/api/auth/me", { token: adminToken })
    assert.equal(idle.status, 401)
    assert.ok(isClearCookie(idle))
    pass("Admin: last_seen di-throttle 5 menit; idle 12 jam → 401 + sesi dihapus")

    // Absolut 7 hari walau aktif terus.
    const absToken = await loginOk("admin", "admin-pass-2")
    let lastStatus = 0
    let steps = 0
    for (; steps < 40; steps++) {
      nowValue += 6 * HOUR
      lastStatus = (await api("GET", "/api/auth/me", { token: absToken })).status
      if (lastStatus !== 200) break
    }
    assert.equal(lastStatus, 401)
    assert.equal(steps + 1, 28, "berakhir tepat pada 7 hari")
    adminToken = await loginOk("admin", "admin-pass-2")
    pass("Admin: batas absolut 7 hari walau aktif")

    // Petugas: tanpa kedaluwarsa; cookie diperbarui maksimal sekali sehari.
    nowValue += 300 * DAY
    const later = await api("GET", "/api/auth/me", { token: petugasToken })
    assert.equal(later.status, 200)
    const refreshed = later.headers.get("Set-Cookie") ?? ""
    assert.ok(refreshed.includes(`__Host-kp_session=${petugasToken}`) && refreshed.includes("Max-Age=34560000"))
    nowValue += HOUR
    const sameDay = await api("GET", "/api/auth/me", { token: petugasToken })
    assert.equal(sameDay.status, 200)
    assert.equal(sameDay.headers.get("Set-Cookie"), null)
    nowValue += DAY
    assert.ok(((await api("GET", "/api/njkb/DH2506KA?source=d1", { token: petugasToken })).headers.get("Set-Cookie") ?? "").includes("Max-Age=34560000"))
    pass("Petugas: tetap valid setelah 300 hari; cookie di-refresh maksimal 1x/hari")
  }

  // --- Passive session check (polling /me) ------------------------------------
  {
    const PASSIVE = { "X-KP-Session-Check": "passive" }
    const STEP = 10 * 60 * 1000

    // Admin: polling pasif tidak memperpanjang idle → 401 setelah 12 jam + 1 menit.
    const passiveToken = await loginOk("admin", "admin-pass-2")
    const start = nowValue
    let status = 200
    while (nowValue - start < 12 * HOUR - STEP) {
      nowValue += STEP
      status = (await api("GET", "/api/auth/me", { token: passiveToken, headers: PASSIVE })).status
      assert.equal(status, 200, "masih dalam idle window")
    }
    nowValue = start + 12 * HOUR + 60 * 1000
    const expired = await api("GET", "/api/auth/me", { token: passiveToken, headers: PASSIVE })
    assert.equal(expired.status, 401)
    assert.ok(isClearCookie(expired))
    // Nilai header selain "passive" persis dianggap aktivitas biasa.
    const activeToken = await loginOk("admin", "admin-pass-2")
    const startActive = nowValue
    while (nowValue - startActive < 13 * HOUR) {
      nowValue += STEP
      const response = await api("GET", "/api/auth/me", {
        token: activeToken,
        headers: { "X-KP-Session-Check": "Passive" },
      })
      assert.equal(response.status, 200, "request non-pasif memperpanjang idle")
    }
    pass("Admin: /me pasif tiap 10 menit → 401 pada 12 jam + 1 menit; /me non-pasif memperpanjang idle")

    // Petugas: polling pasif tetap valid (tanpa expiry) dan cookie tetap di-refresh harian.
    nowValue += 30 * DAY
    const petugasPassive = await api("GET", "/api/auth/me", { token: petugasToken, headers: PASSIVE })
    assert.equal(petugasPassive.status, 200)
    assert.ok((petugasPassive.headers.get("Set-Cookie") ?? "").includes("Max-Age=34560000"))
    pass("Petugas: /me pasif setelah 30 hari tetap 200 dan cookie di-refresh")
  }

  // --- Unknown route under /api still authenticated ------------------------
  {
    // Token admin sebelumnya kedaluwarsa akibat lompatan waktu 300 hari.
    assert.equal((await api("GET", "/api/auth/me", { token: adminToken })).status, 401)
    adminToken = await loginOk("admin", "admin-pass-2")
    assert.equal((await api("GET", "/api/unknown")).status, 401)
    for (const [method, url] of [
      ["GET", "/api/unknown"],
      ["GET", "/api/admin/users/x/y/z"],
      ["POST", "/api/unknown"],
    ]) {
      const response = await api(method, url, { token: adminToken })
      assert.equal(response.status, 404, `${method} ${url}`)
      assert.match(response.headers.get("Content-Type") ?? "", /^application\/json/)
      assert.deepEqual(await json(response), { message: "Endpoint tidak ditemukan.", code: "NOT_FOUND" })
    }
    pass("Path /api tak dikenal: tanpa sesi 401; dengan sesi SPA fallback HTML → 404 JSON NOT_FOUND")
  }
} finally {
  console.info = silenced.info
  console.warn = silenced.warn
  await mf.dispose()
}

console.log("\nSemua auth endpoint integration tests: PASS ✓\n")
