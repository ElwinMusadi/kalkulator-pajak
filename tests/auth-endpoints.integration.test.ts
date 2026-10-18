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

let env: {
  DB: D1Database
  VEHICLE_API_BASE_URL: string
  VEHICLE_ACCESS_CLIENT_ID: string
  VEHICLE_ACCESS_CLIENT_SECRET: string
}
let vehicleApiCalls = 0
const originalGlobalFetch = globalThis.fetch

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
  env = {
    DB: db,
    VEHICLE_API_BASE_URL: "https://vehicle-api.test",
    VEHICLE_ACCESS_CLIENT_ID: "test-client.access",
    VEHICLE_ACCESS_CLIENT_SECRET: "test-secret",
  }
  // Mock hanya untuk API Data Kendaraan; request lain (Miniflare) diteruskan.
  const passthroughFetch = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    const url = String(input instanceof Request ? input.url : input)
    if (!url.startsWith("https://vehicle-api.test/")) return passthroughFetch(input, init)
    vehicleApiCalls++
    const nopol = decodeURIComponent(url.split("/").pop() ?? "")
    return new Response(
      JSON.stringify({
        status: "vehicle_found",
        vehicle_status: "found",
        njkb_status: "matched",
        nopol,
        vehicle: { category_raw: "MINIBUS" },
        registration: { stnk_valid_until: "2031-12-31" },
        tax: { notice_valid_until: "2030-12-31" },
        owner: { name: "API OWNER" },
        njkb: { value: "50000000.00", weight: "1.050000" },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )
  }
  for (const file of [
    "schema.sql",
    "migrations/0001_auth.sql",
  ]) {
    const sql = await readFile(path.join(ROOT, file), "utf8")
    await db.batch(splitSql(sql).map((stmt) => db.prepare(stmt)))
  }

  // --- Regression test migration 0003: upgrade user_permissions dari data 0001 nyata ---
  {
    const tempUser1 = "00000000-0000-4000-9000-000000000001"
    const tempUser2 = "00000000-0000-4000-9000-000000000002"
    const iso = new Date(nowValue).toISOString()

    // 2 user dengan beberapa baris permission dari whitelist 0001
    await db.batch([
      db
        .prepare(
          `INSERT INTO users (id, username, name, role, password_hash, active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
        )
        .bind(tempUser1, "migr_user1", "Migr User 1", "petugas", "hash1", iso, iso),
      db
        .prepare(
          `INSERT INTO users (id, username, name, role, password_hash, active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
        )
        .bind(tempUser2, "migr_user2", "Migr User 2", "petugas", "hash2", iso, iso),
      db.prepare(`INSERT INTO user_permissions (user_id, module_key) VALUES (?, ?)`).bind(tempUser1, "calculator"),
      db.prepare(`INSERT INTO user_permissions (user_id, module_key) VALUES (?, ?)`).bind(tempUser1, "vehicle_lookup.d1"),
      db.prepare(`INSERT INTO user_permissions (user_id, module_key) VALUES (?, ?)`).bind(tempUser2, "facility.tembak_ru"),
      db.prepare(`INSERT INTO user_permissions (user_id, module_key) VALUES (?, ?)`).bind(tempUser2, "vehicle_source.settings"),
    ])

    // Sebelum 0003: 0001 menolak fees.bbn_mutasi via CHECK constraint
    await assert.rejects(
      () =>
        db
          .prepare(`INSERT INTO user_permissions (user_id, module_key) VALUES (?, ?)`)
          .bind(tempUser1, "fees.bbn_mutasi")
          .run(),
      (err: Error) => /CHECK constraint failed/i.test(err.message),
      "0001 harus menolak fees.bbn_mutasi",
    )

    // Terapkan migration 0002 dan 0003 (rebuild tabel atomik dalam batch D1)
    for (const file of [
      "migrations/0002_vehicle_plate_color.sql",
      "migrations/0003_permission_bbn_mutasi.sql",
    ]) {
      const sql = await readFile(path.join(ROOT, file), "utf8")
      await db.batch(splitSql(sql).map((stmt) => db.prepare(stmt)))
    }

    // 1. Baris izin lama harus terlestarikan persis setelah rebuild tabel
    const preserved = await db
      .prepare(`SELECT user_id, module_key FROM user_permissions ORDER BY user_id ASC, module_key ASC`)
      .all<{ user_id: string; module_key: string }>()
    assert.deepEqual(preserved.results, [
      { user_id: tempUser1, module_key: "calculator" },
      { user_id: tempUser1, module_key: "vehicle_lookup.d1" },
      { user_id: tempUser2, module_key: "facility.tembak_ru" },
      { user_id: tempUser2, module_key: "vehicle_source.settings" },
    ])

    // 2. Modul baru fees.bbn_mutasi berhasil dimasukkan
    await db
      .prepare(`INSERT INTO user_permissions (user_id, module_key) VALUES (?, ?)`)
      .bind(tempUser1, "fees.bbn_mutasi")
      .run()
    const u1Perms = await db
      .prepare(`SELECT module_key FROM user_permissions WHERE user_id = ? ORDER BY module_key ASC`)
      .bind(tempUser1)
      .all<{ module_key: string }>()
    assert.deepEqual(
      u1Perms.results.map((r) => r.module_key),
      ["calculator", "fees.bbn_mutasi", "vehicle_lookup.d1"],
    )

    // 3. Modul tidak dikenal ditolak oleh CHECK constraint baru
    await assert.rejects(
      () =>
        db
          .prepare(`INSERT INTO user_permissions (user_id, module_key) VALUES (?, ?)`)
          .bind(tempUser1, "fees.unknown")
          .run(),
      (err: Error) => /CHECK constraint failed/i.test(err.message),
      "0003 harus menolak module_key yang tidak terdaftar",
    )

    // 4. Baris duplikat ditolak oleh PRIMARY KEY (user_id, module_key)
    await assert.rejects(
      () =>
        db
          .prepare(`INSERT INTO user_permissions (user_id, module_key) VALUES (?, ?)`)
          .bind(tempUser1, "fees.bbn_mutasi")
          .run(),
      (err: Error) => /UNIQUE constraint failed|PRIMARY KEY/i.test(err.message),
      "0003 harus menolak duplikasi izin",
    )

    // 5. ON DELETE CASCADE: hapus user 1 meng-cascade izinnya, izin user 2 tetap ada
    await db.prepare(`DELETE FROM users WHERE id = ?`).bind(tempUser1).run()
    const u1Remaining = await db
      .prepare(`SELECT COUNT(*) AS n FROM user_permissions WHERE user_id = ?`)
      .bind(tempUser1)
      .first<{ n: number }>()
    assert.equal(u1Remaining?.n, 0, "seluruh permission user 1 harus terhapus via cascade")

    const u2Remaining = await db
      .prepare(`SELECT user_id, module_key FROM user_permissions WHERE user_id = ? ORDER BY module_key ASC`)
      .bind(tempUser2)
      .all<{ user_id: string; module_key: string }>()
    assert.deepEqual(
      u2Remaining.results,
      [
        { user_id: tempUser2, module_key: "facility.tembak_ru" },
        { user_id: tempUser2, module_key: "vehicle_source.settings" },
      ],
      "permission user 2 harus tetap utuh",
    )

    // Bersihkan user 2 sehingga state DB kosong kembali untuk suite utama
    await db.prepare(`DELETE FROM users WHERE id = ?`).bind(tempUser2).run()
    const remainingUsers = (await db.prepare(`SELECT COUNT(*) AS n FROM users`).first<{ n: number }>())?.n ?? 0
    const remainingPerms = (await db.prepare(`SELECT COUNT(*) AS n FROM user_permissions`).first<{ n: number }>())?.n ?? 0
    assert.equal(remainingUsers, 0)
    assert.equal(remainingPerms, 0)

    pass(
      "Migration 0003: upgrade user_permissions melestarikan data, mendukung fees.bbn_mutasi, tolak modul ilegal & duplikat, serta mempertahankan ON DELETE CASCADE",
    )
  }

  // --- Regression test migration 0004: vehicle_lookup.d1 → api, hapus kunci lama ---
  {
    const iso = new Date(nowValue).toISOString()
    const u = {
      d1Calc: "00000000-0000-4000-9000-000000000011",
      settingsOnly: "00000000-0000-4000-9000-000000000012",
      all: "00000000-0000-4000-9000-000000000013",
      d1Only: "00000000-0000-4000-9000-000000000014",
      untouched: "00000000-0000-4000-9000-000000000015",
    }
    const legacyRows: Array<[string, string]> = [
      [u.d1Calc, "calculator"],
      [u.d1Calc, "vehicle_lookup.d1"],
      [u.settingsOnly, "vehicle_source.settings"],
      [u.all, "calculator"],
      [u.all, "vehicle_lookup.d1"],
      [u.all, "vehicle_lookup.api"],
      [u.all, "vehicle_source.settings"],
      [u.all, "facility.tembak_ru"],
      [u.all, "fees.bbn_mutasi"],
      [u.d1Only, "vehicle_lookup.d1"],
      [u.untouched, "calculator"],
      [u.untouched, "fees.bbn_mutasi"],
    ]
    await db.batch([
      ...Object.values(u).map((id, index) =>
        db
          .prepare(
            `INSERT INTO users (id, username, name, role, password_hash, active, created_at, updated_at)
             VALUES (?, ?, ?, 'petugas', 'hash', 1, ?, ?)`,
          )
          .bind(id, `migr4_user${index}`, `Migr4 ${index}`, iso, iso),
      ),
      ...legacyRows.map(([id, key]) =>
        db.prepare(`INSERT INTO user_permissions (user_id, module_key) VALUES (?, ?)`).bind(id, key),
      ),
      db
        .prepare(
          `INSERT INTO sessions (id, user_id, token_hash, is_petugas, device_label, created_at, last_seen_at, cookie_issued_at, expires_at)
           VALUES ('00000000-0000-4000-9000-0000000000f1', ?, 'migr4-token-hash', 1, 'Chrome di Windows', ?, ?, ?, NULL)`,
        )
        .bind(u.d1Calc, iso, iso, iso),
    ])
    const snapshot = async (sql: string) => (await db.prepare(sql).all()).results
    const usersBefore = await snapshot(`SELECT * FROM users ORDER BY id`)
    const sessionsBefore = await snapshot(`SELECT * FROM sessions ORDER BY id`)

    const sql0004 = await readFile(path.join(ROOT, "migrations/0004_vehicle_lookup_api_only.sql"), "utf8")
    const expected = [
      { user_id: u.d1Calc, module_key: "calculator" },
      { user_id: u.d1Calc, module_key: "vehicle_lookup.api" },
      { user_id: u.all, module_key: "calculator" },
      { user_id: u.all, module_key: "facility.tembak_ru" },
      { user_id: u.all, module_key: "fees.bbn_mutasi" },
      { user_id: u.all, module_key: "vehicle_lookup.api" },
      { user_id: u.d1Only, module_key: "vehicle_lookup.api" },
      { user_id: u.untouched, module_key: "calculator" },
      { user_id: u.untouched, module_key: "fees.bbn_mutasi" },
    ]
    // Dijalankan dua kali: hasil kedua identik (idempoten).
    for (let run = 0; run < 2; run++) {
      await db.batch(splitSql(sql0004).map((stmt) => db.prepare(stmt)))
      const rows = await db
        .prepare(`SELECT user_id, module_key FROM user_permissions ORDER BY user_id ASC, module_key ASC`)
        .all<{ user_id: string; module_key: string }>()
      assert.deepEqual(rows.results, expected, `0004 run ${run + 1}`)
    }
    // settings-only tidak menerima API; d1-only tidak menerima calculator.
    const settingsOnlyCount = await db
      .prepare(`SELECT COUNT(*) AS n FROM user_permissions WHERE user_id = ?`)
      .bind(u.settingsOnly)
      .first<{ n: number }>()
    assert.equal(settingsOnlyCount?.n, 0)
    assert.deepEqual(await snapshot(`SELECT * FROM users ORDER BY id`), usersBefore, "users tidak berubah")
    assert.deepEqual(await snapshot(`SELECT * FROM sessions ORDER BY id`), sessionsBefore, "sessions tidak berubah")
    // CHECK 0003 tetap (tanpa rebuild): kunci tak dikenal masih ditolak.
    await assert.rejects(
      () =>
        db.prepare(`INSERT INTO user_permissions (user_id, module_key) VALUES (?, 'vehicle_lookup.x')`).bind(u.d1Calc).run(),
      (err: Error) => /CHECK constraint failed/i.test(err.message),
    )

    await db.prepare(`DELETE FROM users WHERE id LIKE '00000000-0000-4000-9000-%'`).run()
    assert.equal((await db.prepare(`SELECT COUNT(*) AS n FROM users`).first<{ n: number }>())?.n, 0)
    assert.equal((await db.prepare(`SELECT COUNT(*) AS n FROM user_permissions`).first<{ n: number }>())?.n, 0)
    assert.equal((await db.prepare(`SELECT COUNT(*) AS n FROM sessions`).first<{ n: number }>())?.n, 0)
    pass(
      "Migration 0004: d1→api tanpa menambah calculator, settings dihapus (settings-only tanpa API), idempoten, users/sessions tidak berubah",
    )
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
  await seed(ids.petugas, "petugas", "petugas", 1, ["calculator"])
  // Baris legacy (DB belum menerapkan 0004): dibaca sebagai vehicle_lookup.api.
  await db
    .prepare(`INSERT INTO user_permissions (user_id, module_key) VALUES (?, 'vehicle_lookup.d1')`)
    .bind(ids.petugas)
    .run()
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
    assert.deepEqual(me.user.permissions, ["calculator", "vehicle_lookup.api"])
    pass("Petugas → 403 FORBIDDEN pada seluruh endpoint admin; /me memetakan legacy vehicle_lookup.d1 → api")
  }

  // --- NJKB permission via full chain (API-only) ----------------------------
  {
    for (const source of [null, "d1", "api", "d1_then_api", "api_then_d1"]) {
      const query = source === null ? "" : `?source=${source}`
      const before = vehicleApiCalls
      const response = await api("GET", `/api/njkb/DH2506KA${query}`, { token: petugasToken })
      assert.equal(response.status, 200, `source=${source}`)
      assert.equal(response.headers.get("Cache-Control"), "private, no-store")
      const body = await json(response)
      assert.equal(body.source, "api")
      assert.equal(body.nama, "API OWNER", "bukan data vehicle_njkb D1")
      assert.equal(vehicleApiCalls, before + 1)
    }
    const adminLookup = await api("GET", "/api/njkb/DH2506KA?source=d1", { token: adminToken })
    assert.equal(adminLookup.status, 200)
    assert.equal((await json(adminLookup)).source, "api")
    pass("NJKB via middleware: legacy d1 petugas → API (semua ?source), tanpa D1; admin diizinkan")
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
      body: { permissions: ["vehicle_lookup.api", "calculator"] },
    })
    assert.equal(put.status, 200)
    assert.deepEqual((await json<AdminUserResponse>(put)).user.permissions, [
      "calculator",
      "vehicle_lookup.api",
    ])
    const storedLegacy = await db
      .prepare(`SELECT COUNT(*) AS n FROM user_permissions WHERE user_id = ? AND module_key = 'vehicle_lookup.d1'`)
      .bind(ids.petugas)
      .first<{ n: number }>()
    assert.equal(storedLegacy?.n, 0, "PUT mengganti baris legacy dengan kunci baru")
    const both = await api("GET", "/api/njkb/DH2506KA?source=d1_then_api", { token: petugasToken })
    assert.equal(both.status, 200, "permission baru berlaku tanpa login ulang")

    // Kunci lama tidak dapat diberikan lagi.
    for (const legacy of ["vehicle_lookup.d1", "vehicle_source.settings"]) {
      const rejected = await api("PUT", `/api/admin/users/${ids.petugas}/permissions`, {
        token: adminToken,
        body: { permissions: ["calculator", legacy] },
      })
      assert.equal(rejected.status, 400, legacy)
    }

    // Migration 0003: CHECK user_permissions menerima 'fees.bbn_mutasi'.
    const bbn = await api("PUT", `/api/admin/users/${ids.petugas}/permissions`, {
      token: adminToken,
      body: { permissions: ["calculator", "fees.bbn_mutasi"] },
    })
    assert.equal(bbn.status, 200)
    assert.deepEqual((await json<AdminUserResponse>(bbn)).user.permissions, ["calculator", "fees.bbn_mutasi"])
    const bbnMe = await json<AuthMeResponse>(await api("GET", "/api/auth/me", { token: petugasToken }))
    assert.deepEqual(bbnMe.user.permissions, ["calculator", "fees.bbn_mutasi"])
    const noApi = await api("GET", "/api/njkb/DH2506KA?source=d1", { token: petugasToken })
    assert.equal(noApi.status, 403, "tanpa vehicle_lookup.api → 403 apa pun ?source")
    assert.equal((await json(noApi)).code, "FORBIDDEN")
    const restore = await api("PUT", `/api/admin/users/${ids.petugas}/permissions`, {
      token: adminToken,
      body: { permissions: ["calculator", "vehicle_lookup.api"] },
    })
    assert.equal(restore.status, 200)

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
    pass("PUT permissions petugas berlaku langsung (termasuk fees.bbn_mutasi); target admin 400; duplikat 400; id tidak ada/invalid 404")
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
  globalThis.fetch = originalGlobalFetch
  await mf.dispose()
}

console.log("\nSemua auth endpoint integration tests: PASS ✓\n")
