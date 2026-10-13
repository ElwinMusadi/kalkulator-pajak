/**
 * Service sesi: login, resolusi sesi dari cookie, dan penghapusan sesi.
 *
 * Kebijakan:
 * - Petugas: tepat satu sesi (unique index parsial), tanpa kedaluwarsa server.
 *   Cookie diperbarui maksimal sekali per hari saat dipakai.
 * - Admin: banyak perangkat; idle 12 jam dan absolut 7 hari.
 * - last_seen_at ditulis maksimal setiap 5 menit.
 */

import type { AuthUser, UserRole } from "../../src/types/auth.ts"
import { nowMs, toIso } from "../clock.ts"
import { logEvent } from "../http.ts"
import type { AuthContext } from "../types.ts"
import { auditStatement } from "./audit.ts"
import {
  ADMIN_ABSOLUTE_TIMEOUT_MS,
  ADMIN_COOKIE_MAX_AGE_SECONDS,
  ADMIN_IDLE_TIMEOUT_MS,
  LAST_SEEN_UPDATE_INTERVAL_MS,
  PETUGAS_COOKIE_MAX_AGE_SECONDS,
  PETUGAS_COOKIE_REFRESH_INTERVAL_MS,
} from "./constants.ts"
import { buildSessionCookie } from "./cookies.ts"
import {
  generateSessionToken,
  hashSessionToken,
  verifyDummyPassword,
  verifyPassword,
} from "./crypto.ts"
import { isConstraintViolation, isUniqueViolation, parseJsonStringArray } from "./db.ts"
import { effectivePermissions } from "./permissions.ts"
import { isPlausibleLogin, type LoginInput } from "./validation.ts"

export const PERMISSIONS_SUBQUERY = `(SELECT json_group_array(p.module_key) FROM user_permissions p WHERE p.user_id = u.id)`

interface UserRow {
  id: string
  username: string
  name: string
  role: UserRole
  active: number
  password_hash: string
  permissions: string | null
}

function toAuthUser(row: Pick<UserRow, "id" | "username" | "name" | "role" | "permissions">): AuthUser {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    role: row.role,
    permissions: effectivePermissions(row.role, parseJsonStringArray(row.permissions)),
  }
}

function cookieMaxAgeFor(role: UserRole): number {
  return role === "petugas" ? PETUGAS_COOKIE_MAX_AGE_SECONDS : ADMIN_COOKIE_MAX_AGE_SECONDS
}

/** Memuat user aktif beserta permission efektif. */
export async function loadAuthUser(db: D1Database, userId: string): Promise<AuthUser | null> {
  const row = await db
    .prepare(
      `SELECT u.id, u.username, u.name, u.role, u.active, ${PERMISSIONS_SUBQUERY} AS permissions
       FROM users u WHERE u.id = ?`,
    )
    .bind(userId)
    .first<Omit<UserRow, "password_hash">>()
  if (!row || row.active !== 1) return null
  return toAuthUser(row)
}

export type LoginResult =
  | { kind: "ok"; user: AuthUser; sessionId: string; setCookie: string }
  | { kind: "invalid_credentials" }
  | { kind: "session_active_elsewhere" }

export interface LoginOptions {
  deviceLabel: string
  /** Token cookie lama pada perangkat ini (jika ada); sesi admin lama diganti. */
  previousToken?: string | null
}

export async function login(
  db: D1Database,
  input: LoginInput,
  options: LoginOptions,
): Promise<LoginResult> {
  if (!isPlausibleLogin(input)) {
    await verifyDummyPassword(input.password.slice(0, 256))
    return { kind: "invalid_credentials" }
  }

  const row = await db
    .prepare(
      `SELECT u.id, u.username, u.name, u.role, u.active, u.password_hash,
              ${PERMISSIONS_SUBQUERY} AS permissions
       FROM users u WHERE u.username = ? COLLATE NOCASE`,
    )
    .bind(input.username)
    .first<UserRow>()

  if (!row || row.active !== 1) {
    await verifyDummyPassword(input.password)
    return { kind: "invalid_credentials" }
  }

  if (!(await verifyPassword(input.password, row.password_hash))) {
    return { kind: "invalid_credentials" }
  }

  const user = toAuthUser(row)
  const isPetugas = user.role === "petugas"
  const now = nowMs()
  const nowIso = toIso(now)
  const sessionId = crypto.randomUUID()
  const token = generateSessionToken()
  const tokenHash = await hashSessionToken(token)
  const expiresAt = isPetugas ? null : toIso(now + ADMIN_ABSOLUTE_TIMEOUT_MS)

  const statements: D1PreparedStatement[] = []

  if (!isPetugas) {
    // Bersihkan sesi admin kedaluwarsa milik user ini.
    statements.push(
      db
        .prepare(
          `DELETE FROM sessions
           WHERE user_id = ? AND is_petugas = 0 AND (expires_at <= ? OR last_seen_at <= ?)`,
        )
        .bind(user.id, nowIso, toIso(now - ADMIN_IDLE_TIMEOUT_MS)),
    )
    if (options.previousToken) {
      // Login ulang admin di perangkat yang sama menggantikan sesi admin lama perangkat itu.
      statements.push(
        db
          .prepare(`DELETE FROM sessions WHERE token_hash = ? AND is_petugas = 0`)
          .bind(await hashSessionToken(options.previousToken)),
      )
    }
  }

  statements.push(
    db
      .prepare(
        `INSERT INTO sessions
           (id, user_id, token_hash, is_petugas, device_label, created_at, last_seen_at, cookie_issued_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        sessionId,
        user.id,
        tokenHash,
        isPetugas ? 1 : 0,
        options.deviceLabel,
        nowIso,
        nowIso,
        nowIso,
        expiresAt,
      ),
    auditStatement(db, {
      actorUserId: user.id,
      action: "login",
      targetUserId: user.id,
      createdAt: nowIso,
      metadata: { sessionId, role: user.role },
    }),
  )

  try {
    await db.batch(statements)
  } catch (err) {
    if (isPetugas && isUniqueViolation(err, "sessions.user_id")) {
      return { kind: "session_active_elsewhere" }
    }
    if (isConstraintViolation(err)) {
      // Mis. user dihapus bersamaan (FK) — perlakukan sebagai kredensial tidak valid.
      return { kind: "invalid_credentials" }
    }
    throw err
  }

  return {
    kind: "ok",
    user,
    sessionId,
    setCookie: buildSessionCookie(token, cookieMaxAgeFor(user.role)),
  }
}

interface SessionRow {
  session_id: string
  user_id: string
  is_petugas: number
  last_seen_at: string
  cookie_issued_at: string
  expires_at: string | null
  username: string
  name: string
  role: UserRole
  active: number
  permissions: string | null
}

export interface ResolvedSession {
  auth: AuthContext
  /** Set-Cookie pembaruan cookie (petugas, maks 1x/hari). */
  setCookie?: string
}

function parseIsoMs(value: string | null): number {
  if (value === null) return Number.NaN
  return Date.parse(value)
}

export interface ResolveSessionOptions {
  /**
   * Pemeriksaan latar (mis. polling /me) yang bukan aktivitas user. Untuk sesi
   * admin, last_seen_at tidak diperbarui sehingga idle timeout tetap berlaku.
   * Expiry idle/absolut tetap ditegakkan.
   */
  passive?: boolean
}

/** Resolusi token cookie menjadi user+sesi. `null` = tidak terautentikasi. */
export async function resolveSession(
  db: D1Database,
  token: string,
  options: ResolveSessionOptions = {},
): Promise<ResolvedSession | null> {
  const tokenHash = await hashSessionToken(token)
  const row = await db
    .prepare(
      `SELECT s.id AS session_id, s.user_id, s.is_petugas, s.last_seen_at, s.cookie_issued_at, s.expires_at,
              u.username, u.name, u.role, u.active, ${PERMISSIONS_SUBQUERY} AS permissions
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`,
    )
    .bind(tokenHash)
    .first<SessionRow>()

  if (!row) return null

  const now = nowMs()
  const isPetugas = row.is_petugas === 1
  const roleMatches = isPetugas === (row.role === "petugas")

  let invalid = row.active !== 1 || !roleMatches
  if (!invalid && !isPetugas) {
    const expiresAt = parseIsoMs(row.expires_at)
    const lastSeen = parseIsoMs(row.last_seen_at)
    invalid =
      !Number.isFinite(expiresAt) ||
      !Number.isFinite(lastSeen) ||
      now >= expiresAt ||
      now - lastSeen >= ADMIN_IDLE_TIMEOUT_MS
  }

  if (invalid) {
    await deleteSessionById(db, row.session_id).catch(() => {
      logEvent("warn", "auth_session_cleanup_failed", { sessionId: row.session_id })
    })
    return null
  }

  const lastSeen = parseIsoMs(row.last_seen_at)
  const cookieIssued = parseIsoMs(row.cookie_issued_at)
  const touchLastSeen =
    !(options.passive === true && !isPetugas) &&
    (!Number.isFinite(lastSeen) || now - lastSeen >= LAST_SEEN_UPDATE_INTERVAL_MS)
  const refreshCookie =
    isPetugas &&
    (!Number.isFinite(cookieIssued) || now - cookieIssued >= PETUGAS_COOKIE_REFRESH_INTERVAL_MS)

  let setCookie: string | undefined
  if (touchLastSeen || refreshCookie) {
    const nowIso = toIso(now)
    try {
      await db
        .prepare(
          `UPDATE sessions SET last_seen_at = ?, cookie_issued_at = ? WHERE id = ?`,
        )
        .bind(
          touchLastSeen ? nowIso : row.last_seen_at,
          refreshCookie ? nowIso : row.cookie_issued_at,
          row.session_id,
        )
        .run()
      if (refreshCookie) setCookie = buildSessionCookie(token, PETUGAS_COOKIE_MAX_AGE_SECONDS)
    } catch {
      // Kegagalan penulisan last_seen tidak menggagalkan request.
      logEvent("warn", "auth_session_touch_failed", { sessionId: row.session_id })
    }
  }

  return {
    auth: {
      user: toAuthUser({
        id: row.user_id,
        username: row.username,
        name: row.name,
        role: row.role,
        permissions: row.permissions,
      }),
      session: { id: row.session_id, isPetugas },
    },
    setCookie,
  }
}

/** Logout admin: hapus sesi saat ini + audit `auth.logout` dalam satu batch. */
export async function logoutSession(db: D1Database, auth: AuthContext): Promise<void> {
  const nowIso = toIso(nowMs())
  await db.batch([
    db.prepare(`DELETE FROM sessions WHERE id = ?`).bind(auth.session.id),
    auditStatement(
      db,
      {
        actorUserId: auth.user.id,
        action: "auth.logout",
        targetUserId: auth.user.id,
        createdAt: nowIso,
        metadata: { sessionId: auth.session.id },
      },
      { sql: "changes() > 0", params: [] },
    ),
  ])
}

export async function deleteSessionById(db: D1Database, sessionId: string): Promise<number> {
  const result = await db.prepare(`DELETE FROM sessions WHERE id = ?`).bind(sessionId).run()
  return result.meta.changes ?? 0
}
