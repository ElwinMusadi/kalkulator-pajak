/**
 * Audit event minimal. Metadata tidak boleh memuat password, token, atau hash.
 */

export type AuditAction =
  | "login"
  | "auth.logout"
  | "user.create"
  | "user.promote"
  | "user.update"
  | "user.delete"
  | "user.reset_password"
  | "user.permissions"
  | "session.delete"
  | "session.delete_all"

export interface AuditInput {
  actorUserId: string
  action: AuditAction
  targetUserId: string | null
  createdAt: string
  metadata?: Record<string, unknown>
}

/**
 * Statement INSERT audit untuk dipakai dalam `db.batch`. `condition` (SQL
 * boolean + parameter) membuat audit hanya tercatat bila perubahan terjadi.
 */
export function auditStatement(
  db: D1Database,
  input: AuditInput,
  condition?: { sql: string; params: unknown[] },
): D1PreparedStatement {
  const metadata = input.metadata ? JSON.stringify(input.metadata) : null
  const where = condition ? ` WHERE ${condition.sql}` : ""
  return db
    .prepare(
      `INSERT INTO audit_events (actor_user_id, action, target_user_id, created_at, metadata)
       SELECT ?, ?, ?, ?, ?${where}`,
    )
    .bind(
      input.actorUserId,
      input.action,
      input.targetUserId,
      input.createdAt,
      metadata,
      ...(condition?.params ?? []),
    )
}
