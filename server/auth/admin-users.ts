/**
 * Operasi manajemen user oleh Admin. Setiap penulisan dijalankan dalam satu
 * `db.batch` (transaksi D1) beserta audit event.
 *
 * Guard LAST_ADMIN dievaluasi di dalam SQL (WHERE) sehingga tetap atomik
 * walaupun dua Admin memodifikasi satu sama lain secara bersamaan.
 */

import type {
  AdminUserSummary,
  ModuleKey,
  SessionInfo,
  UserRole,
} from "../../src/types/auth.ts"
import { nowMs, toIso } from "../clock.ts"
import type { AuthContext } from "../types.ts"
import { auditStatement } from "./audit.ts"
import { ADMIN_IDLE_TIMEOUT_MS } from "./constants.ts"
import { hashPassword } from "./crypto.ts"
import { isUniqueViolation, parseJsonStringArray } from "./db.ts"
import { effectivePermissions } from "./permissions.ts"
import { PERMISSIONS_SUBQUERY } from "./session.ts"
import type { CreateUserInput, UpdateUserInput } from "./validation.ts"

const CHANGED = { sql: "changes() > 0", params: [] as unknown[] }

/** Benar bila baris user (konteks UPDATE/DELETE) adalah admin aktif terakhir. */
const IS_LAST_ACTIVE_ADMIN_SQL = `(role = 'admin' AND active = 1 AND
  (SELECT COUNT(*) FROM users other WHERE other.role = 'admin' AND other.active = 1 AND other.id <> users.id) < 1)`

interface UserListRow {
  id: string
  username: string
  name: string
  role: UserRole
  active: number
  created_at: string
  updated_at: string
  permissions: string | null
}

interface SessionListRow {
  id: string
  user_id: string
  device_label: string
  created_at: string
  last_seen_at: string
}

/** Daftar ringkasan user (opsional satu user). Sesi admin kedaluwarsa tidak ditampilkan. */
export async function listUserSummaries(
  db: D1Database,
  userId?: string,
): Promise<AdminUserSummary[]> {
  const now = nowMs()
  const nowIso = toIso(now)
  const idleIso = toIso(now - ADMIN_IDLE_TIMEOUT_MS)
  const userSelect = `SELECT u.id, u.username, u.name, u.role, u.active, u.created_at, u.updated_at,
      ${PERMISSIONS_SUBQUERY} AS permissions FROM users u`
  const sessionFilter = `(s.is_petugas = 1 OR (s.expires_at > ? AND s.last_seen_at > ?))`

  const usersStmt = userId
    ? db.prepare(`${userSelect} WHERE u.id = ?`).bind(userId)
    : db.prepare(`${userSelect} ORDER BY u.role ASC, u.username ASC`)
  const sessionsStmt = userId
    ? db
        .prepare(
          `SELECT s.id, s.user_id, s.device_label, s.created_at, s.last_seen_at FROM sessions s
           WHERE s.user_id = ? AND ${sessionFilter} ORDER BY s.created_at ASC`,
        )
        .bind(userId, nowIso, idleIso)
    : db
        .prepare(
          `SELECT s.id, s.user_id, s.device_label, s.created_at, s.last_seen_at FROM sessions s
           WHERE ${sessionFilter} ORDER BY s.created_at ASC`,
        )
        .bind(nowIso, idleIso)

  // Batch = snapshot konsisten untuk kedua query.
  const [usersResult, sessionsResult] = await db.batch<unknown>([usersStmt, sessionsStmt])
  const users = (usersResult.results ?? []) as UserListRow[]
  const sessions = (sessionsResult.results ?? []) as SessionListRow[]

  const sessionsByUser = new Map<string, SessionInfo[]>()
  for (const row of sessions) {
    const list = sessionsByUser.get(row.user_id) ?? []
    list.push({
      id: row.id,
      deviceLabel: row.device_label,
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
    })
    sessionsByUser.set(row.user_id, list)
  }

  return users.map((row) => ({
    id: row.id,
    username: row.username,
    name: row.name,
    role: row.role,
    active: row.active === 1,
    permissions: effectivePermissions(row.role, parseJsonStringArray(row.permissions)),
    sessions: sessionsByUser.get(row.id) ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
}

export async function getUserSummary(
  db: D1Database,
  userId: string,
): Promise<AdminUserSummary | null> {
  const [user] = await listUserSummaries(db, userId)
  return user ?? null
}

async function userExists(db: D1Database, userId: string): Promise<boolean> {
  const row = await db.prepare(`SELECT 1 AS found FROM users WHERE id = ?`).bind(userId).first()
  return row !== null
}

export type CreateUserResult =
  | { kind: "ok"; user: AdminUserSummary }
  | { kind: "username_taken" }

export async function createUser(
  db: D1Database,
  actor: AuthContext,
  input: CreateUserInput,
): Promise<CreateUserResult> {
  const id = crypto.randomUUID()
  const nowIso = toIso(nowMs())
  const passwordHash = await hashPassword(input.password)
  const permissions = input.role === "petugas" ? input.permissions : []

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO users (id, username, name, role, password_hash, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .bind(id, input.username, input.name, input.role, passwordHash, nowIso, nowIso),
    ...permissions.map((key) =>
      db.prepare(`INSERT INTO user_permissions (user_id, module_key) VALUES (?, ?)`).bind(id, key),
    ),
    auditStatement(db, {
      actorUserId: actor.user.id,
      action: "user.create",
      targetUserId: id,
      createdAt: nowIso,
      metadata: { role: input.role, permissions },
    }),
  ]

  try {
    await db.batch(statements)
  } catch (err) {
    if (isUniqueViolation(err, "users.username")) return { kind: "username_taken" }
    throw err
  }

  const user = await getUserSummary(db, id)
  if (!user) throw new Error("Created user not found")
  return { kind: "ok", user }
}

export type MutationResult<T = undefined> =
  | { kind: "ok"; value: T }
  | { kind: "not_found" }
  | { kind: "self_modification" }
  | { kind: "last_admin" }

export async function updateUser(
  db: D1Database,
  actor: AuthContext,
  targetId: string,
  input: UpdateUserInput,
): Promise<MutationResult<AdminUserSummary>> {
  const target = await db
    .prepare(`SELECT id, role, active FROM users WHERE id = ?`)
    .bind(targetId)
    .first<{ id: string; role: UserRole; active: number }>()
  if (!target) return { kind: "not_found" }

  const newRole = input.role ?? target.role
  const newActive = input.active ?? target.active === 1
  const removesAdmin =
    target.role === "admin" && target.active === 1 && (newRole !== "admin" || !newActive)
  if (target.id === actor.user.id && removesAdmin) return { kind: "self_modification" }

  const nowIso = toIso(nowMs())
  const roleParam = input.role ?? null
  const activeParam = input.active === undefined ? null : input.active ? 1 : 0

  const results = await db.batch([
    db
      .prepare(
        `UPDATE users
         SET name = COALESCE(?, name), role = COALESCE(?, role), active = COALESCE(?, active), updated_at = ?
         WHERE id = ?
           AND NOT (
             (COALESCE(?, role) <> 'admin' OR COALESCE(?, active) = 0)
             AND ${IS_LAST_ACTIVE_ADMIN_SQL}
           )`,
      )
      .bind(input.name ?? null, roleParam, activeParam, nowIso, targetId, roleParam, activeParam),
    auditStatement(
      db,
      {
        actorUserId: actor.user.id,
        action: "user.update",
        targetUserId: targetId,
        createdAt: nowIso,
        metadata: {
          fields: Object.keys(input),
          ...(input.role !== undefined ? { role: input.role } : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
        },
      },
      CHANGED,
    ),
    // Sesi dengan snapshot role berbeda atau milik user nonaktif dihapus (idempoten).
    db
      .prepare(
        `DELETE FROM sessions WHERE user_id = ? AND EXISTS (
           SELECT 1 FROM users u WHERE u.id = sessions.user_id
             AND (u.active = 0 OR (u.role = 'petugas') <> (sessions.is_petugas = 1))
         )`,
      )
      .bind(targetId),
    // Permission hanya disimpan untuk petugas.
    db
      .prepare(
        `DELETE FROM user_permissions WHERE user_id = ? AND EXISTS (
           SELECT 1 FROM users u WHERE u.id = user_permissions.user_id AND u.role = 'admin'
         )`,
      )
      .bind(targetId),
  ])

  if ((results[0].meta.changes ?? 0) === 0) {
    return (await userExists(db, targetId)) ? { kind: "last_admin" } : { kind: "not_found" }
  }

  const user = await getUserSummary(db, targetId)
  return user ? { kind: "ok", value: user } : { kind: "not_found" }
}

export async function deleteUser(
  db: D1Database,
  actor: AuthContext,
  targetId: string,
): Promise<MutationResult> {
  if (targetId === actor.user.id) return { kind: "self_modification" }
  const nowIso = toIso(nowMs())

  const results = await db.batch([
    db
      .prepare(`DELETE FROM users WHERE id = ? AND NOT ${IS_LAST_ACTIVE_ADMIN_SQL}`)
      .bind(targetId),
    auditStatement(
      db,
      { actorUserId: actor.user.id, action: "user.delete", targetUserId: targetId, createdAt: nowIso },
      CHANGED,
    ),
    // FK ON DELETE CASCADE sudah menangani; penghapusan eksplisit sebagai pengaman.
    db
      .prepare(
        `DELETE FROM sessions WHERE user_id = ? AND NOT EXISTS (SELECT 1 FROM users WHERE id = ?)`,
      )
      .bind(targetId, targetId),
    db
      .prepare(
        `DELETE FROM user_permissions WHERE user_id = ? AND NOT EXISTS (SELECT 1 FROM users WHERE id = ?)`,
      )
      .bind(targetId, targetId),
  ])

  if ((results[0].meta.changes ?? 0) === 0) {
    return (await userExists(db, targetId)) ? { kind: "last_admin" } : { kind: "not_found" }
  }
  return { kind: "ok", value: undefined }
}

/** Reset password oleh Admin (termasuk diri sendiri). Sesi TIDAK dihapus. */
export async function resetPassword(
  db: D1Database,
  actor: AuthContext,
  targetId: string,
  password: string,
): Promise<MutationResult> {
  if (!(await userExists(db, targetId))) return { kind: "not_found" }
  const passwordHash = await hashPassword(password)
  const nowIso = toIso(nowMs())
  const results = await db.batch([
    db
      .prepare(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`)
      .bind(passwordHash, nowIso, targetId),
    auditStatement(
      db,
      {
        actorUserId: actor.user.id,
        action: "user.reset_password",
        targetUserId: targetId,
        createdAt: nowIso,
      },
      CHANGED,
    ),
  ])
  if ((results[0].meta.changes ?? 0) === 0) return { kind: "not_found" }
  return { kind: "ok", value: undefined }
}

export type SetPermissionsResult =
  | { kind: "ok"; user: AdminUserSummary }
  | { kind: "not_found" }
  | { kind: "target_is_admin" }

export async function setPermissions(
  db: D1Database,
  actor: AuthContext,
  targetId: string,
  permissions: ModuleKey[],
): Promise<SetPermissionsResult> {
  const target = await db
    .prepare(`SELECT role FROM users WHERE id = ?`)
    .bind(targetId)
    .first<{ role: UserRole }>()
  if (!target) return { kind: "not_found" }
  if (target.role !== "petugas") return { kind: "target_is_admin" }

  const nowIso = toIso(nowMs())
  const isPetugas = `EXISTS (SELECT 1 FROM users WHERE id = ? AND role = 'petugas')`
  const results = await db.batch([
    db
      .prepare(`DELETE FROM user_permissions WHERE user_id = ? AND ${isPetugas}`)
      .bind(targetId, targetId),
    ...permissions.map((key) =>
      db
        .prepare(
          `INSERT INTO user_permissions (user_id, module_key) SELECT ?, ? WHERE ${isPetugas}`,
        )
        .bind(targetId, key, targetId),
    ),
    db
      .prepare(`UPDATE users SET updated_at = ? WHERE id = ? AND role = 'petugas'`)
      .bind(nowIso, targetId),
    auditStatement(
      db,
      {
        actorUserId: actor.user.id,
        action: "user.permissions",
        targetUserId: targetId,
        createdAt: nowIso,
        metadata: { permissions },
      },
      CHANGED,
    ),
  ])

  if ((results[results.length - 2].meta.changes ?? 0) === 0) {
    const exists = await userExists(db, targetId)
    return exists ? { kind: "target_is_admin" } : { kind: "not_found" }
  }
  const user = await getUserSummary(db, targetId)
  return user ? { kind: "ok", user } : { kind: "not_found" }
}

export async function deleteAllSessions(
  db: D1Database,
  actor: AuthContext,
  targetId: string,
): Promise<MutationResult<{ deletedCurrent: boolean }>> {
  if (!(await userExists(db, targetId))) return { kind: "not_found" }
  const nowIso = toIso(nowMs())
  const results = await db.batch([
    db.prepare(`DELETE FROM sessions WHERE user_id = ?`).bind(targetId),
    auditStatement(
      db,
      {
        actorUserId: actor.user.id,
        action: "session.delete_all",
        targetUserId: targetId,
        createdAt: nowIso,
      },
      CHANGED,
    ),
  ])
  const deleted = results[0].meta.changes ?? 0
  return { kind: "ok", value: { deletedCurrent: deleted > 0 && targetId === actor.user.id } }
}

export async function deleteOneSession(
  db: D1Database,
  actor: AuthContext,
  targetId: string,
  sessionId: string,
): Promise<MutationResult<{ deletedCurrent: boolean }>> {
  const nowIso = toIso(nowMs())
  const results = await db.batch([
    db.prepare(`DELETE FROM sessions WHERE id = ? AND user_id = ?`).bind(sessionId, targetId),
    auditStatement(
      db,
      {
        actorUserId: actor.user.id,
        action: "session.delete",
        targetUserId: targetId,
        createdAt: nowIso,
        metadata: { sessionId },
      },
      CHANGED,
    ),
  ])
  if ((results[0].meta.changes ?? 0) === 0) return { kind: "not_found" }
  return { kind: "ok", value: { deletedCurrent: sessionId === actor.session.id } }
}
