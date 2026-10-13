/**
 * Logika murni untuk scripts/create-admin.ts (parsing argumen, konfirmasi
 * remote, rencana penulisan, SQL, parsing output wrangler). Tidak ada I/O
 * sehingga dapat diuji unit.
 */

import { parseArgs } from "node:util"
import { isUserRole, type UserRole } from "../src/types/auth.ts"
import { validateName, validateUsername } from "../server/auth/validation.ts"

export const DATABASE_NAME = "kalkulator-pajak-db"

export const USAGE = `Membuat atau mereset akun Admin di D1.

Pemakaian (disarankan — password diminta tersembunyi dan dikonfirmasi):
  npm run admin:create -- --username admin --name "Administrator"

Opsi:
  --username <u>        Username admin (huruf kecil/angka/._-, 3–32 karakter)
  --name <nama>         Nama tampilan
  --reset               Reset akun yang sudah ada (password, nama, role admin, aktif)
  --promote             Bersama --reset: izinkan menaikkan user petugas menjadi admin
                        (sesi user tersebut dihapus, perubahan role diaudit)
  --local               Database lokal (default)
  --remote              Database REMOTE/produksi; wajib konfirmasi mengetik
                        "${DATABASE_NAME}" secara interaktif
  --confirm-remote <db> Konfirmasi non-interaktif untuk --remote (nilai harus "${DATABASE_NAME}")
  --help                Tampilkan bantuan ini

Password:
  Jika ADMIN_PASSWORD tidak di-set, password diminta tersembunyi (disarankan).
  ADMIN_PASSWORD tetap didukung untuk otomasi, tetapi PERINGATAN: perintah
  $env:ADMIN_PASSWORD = "..." tersimpan di riwayat PowerShell (PSReadLine).
  Bila terpaksa memakainya, hapus setelahnya: Remove-Item Env:ADMIN_PASSWORD
  dan bersihkan entri riwayat terkait.
`

export type Target = "local" | "remote"

export interface CliOptions {
  username: string
  name: string
  reset: boolean
  promote: boolean
  target: Target
  confirmRemote: string | undefined
}

export type ParsedCli =
  | { ok: true; help: true }
  | { ok: true; help: false; value: CliOptions }
  | { ok: false; message: string }

export function parseCliArgs(argv: string[]): ParsedCli {
  let values: Record<string, string | boolean | undefined>
  try {
    values = parseArgs({
      args: argv,
      options: {
        username: { type: "string" },
        name: { type: "string" },
        reset: { type: "boolean", default: false },
        promote: { type: "boolean", default: false },
        local: { type: "boolean", default: false },
        remote: { type: "boolean", default: false },
        "confirm-remote": { type: "string" },
        help: { type: "boolean", default: false },
      },
      strict: true,
      allowPositionals: false,
    }).values
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Argumen tidak valid." }
  }

  if (values.help === true) return { ok: true, help: true }
  if (values.local === true && values.remote === true) {
    return { ok: false, message: "Pilih salah satu: --local atau --remote." }
  }
  const target: Target = values.remote === true ? "remote" : "local"
  const confirmRemote = typeof values["confirm-remote"] === "string" ? values["confirm-remote"] : undefined
  if (confirmRemote !== undefined && target !== "remote") {
    return { ok: false, message: "--confirm-remote hanya berlaku bersama --remote." }
  }
  if (values.promote === true && values.reset !== true) {
    return { ok: false, message: "--promote hanya berlaku bersama --reset." }
  }

  const username = validateUsername(values.username)
  if (!username.ok) return { ok: false, message: `--username: ${username.message}` }
  const name = validateName(values.name)
  if (!name.ok) return { ok: false, message: `--name: ${name.message}` }

  return {
    ok: true,
    help: false,
    value: {
      username: username.value,
      name: name.value,
      reset: values.reset === true,
      promote: values.promote === true,
      target,
      confirmRemote,
    },
  }
}

export type RemoteConfirmationPlan =
  | { kind: "not_required" }
  | { kind: "confirmed_by_flag" }
  | { kind: "prompt" }
  | { kind: "error"; message: string }

/** Menentukan cara konfirmasi target remote sebelum ada penulisan apa pun. */
export function planRemoteConfirmation(
  options: Pick<CliOptions, "target" | "confirmRemote">,
  isTTY: boolean,
): RemoteConfirmationPlan {
  if (options.target !== "remote") return { kind: "not_required" }
  if (options.confirmRemote !== undefined) {
    return options.confirmRemote === DATABASE_NAME
      ? { kind: "confirmed_by_flag" }
      : { kind: "error", message: `Nilai --confirm-remote harus "${DATABASE_NAME}".` }
  }
  if (!isTTY) {
    return {
      kind: "error",
      message: `Target --remote tanpa TTY ditolak. Gunakan --confirm-remote ${DATABASE_NAME} secara eksplisit.`,
    }
  }
  return { kind: "prompt" }
}

export function isRemoteConfirmationAnswer(answer: string): boolean {
  return answer.trim() === DATABASE_NAME
}

export interface ExistingUser {
  id: string
  role: UserRole
}

export type AdminWritePlan =
  | { kind: "create" }
  | { kind: "reset"; userId: string }
  | { kind: "promote"; userId: string; fromRole: UserRole }
  | { kind: "error"; message: string }

export function planAdminWrite(
  username: string,
  existing: ExistingUser | null,
  options: Pick<CliOptions, "reset" | "promote">,
): AdminWritePlan {
  if (!existing) {
    if (options.reset) {
      return {
        kind: "error",
        message: `Username "${username}" tidak ditemukan. Jalankan tanpa --reset untuk membuat akun baru.`,
      }
    }
    return { kind: "create" }
  }
  if (!options.reset) {
    return {
      kind: "error",
      message: `Username "${username}" sudah ada. Gunakan --reset untuk mereset akun tersebut.`,
    }
  }
  if (existing.role === "admin") return { kind: "reset", userId: existing.id }
  if (!options.promote) {
    return {
      kind: "error",
      message: `User "${username}" ber-role ${existing.role}, bukan admin. Tambahkan --promote untuk menaikkannya menjadi admin.`,
    }
  }
  return { kind: "promote", userId: existing.id, fromRole: existing.role }
}

export function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

export interface AdminSqlInput {
  username: string
  name: string
  passwordHash: string
  now: string
  newId: string
}

function auditSql(action: string, targetId: string, now: string, metadata: Record<string, unknown>): string {
  return `INSERT INTO audit_events (actor_user_id, action, target_user_id, created_at, metadata)
  VALUES (NULL, ${sqlString(action)}, ${sqlString(targetId)}, ${sqlString(now)}, ${sqlString(JSON.stringify(metadata))});`
}

export function buildAdminSql(
  plan: Exclude<AdminWritePlan, { kind: "error" }>,
  input: AdminSqlInput,
): string {
  const { name, passwordHash, now } = input
  if (plan.kind === "create") {
    return [
      `INSERT INTO users (id, username, name, role, password_hash, active, created_at, updated_at)`,
      `  VALUES (${sqlString(input.newId)}, ${sqlString(input.username)}, ${sqlString(name)}, 'admin',`,
      `  ${sqlString(passwordHash)}, 1, ${sqlString(now)}, ${sqlString(now)});`,
      auditSql("user.create", input.newId, now, { source: "script", role: "admin" }),
    ].join("\n")
  }

  const id = sqlString(plan.userId)
  const statements = [
    `UPDATE users SET password_hash = ${sqlString(passwordHash)}, name = ${sqlString(name)},`,
    `  role = 'admin', active = 1, updated_at = ${sqlString(now)} WHERE id = ${id};`,
    `DELETE FROM user_permissions WHERE user_id = ${id};`,
  ]
  if (plan.kind === "promote") {
    // Role berubah → sesi lama (kebijakan petugas) dihapus.
    statements.push(
      `DELETE FROM sessions WHERE user_id = ${id};`,
      auditSql("user.promote", plan.userId, now, {
        source: "script",
        fromRole: plan.fromRole,
        toRole: "admin",
      }),
    )
  }
  statements.push(auditSql("user.reset_password", plan.userId, now, { source: "script" }))
  return statements.join("\n")
}

/**
 * Parsing output `wrangler d1 execute --json` yang toleran terhadap banner/
 * peringatan di stdout. Mengembalikan baris `results` atau `null` bila gagal.
 */
export function parseWranglerJsonRows(stdout: string): Record<string, unknown>[] | null {
  const lines = stdout.split(/\r?\n/)
  const candidates: string[] = [stdout.trim()]
  const starts = lines.flatMap((line, index) => (line.startsWith("[") ? [index] : []))
  const ends = lines.flatMap((line, index) => (/^\]\s*$/.test(line) ? [index] : []))
  for (const start of starts) {
    if (lines[start].trimEnd().endsWith("]")) candidates.push(lines[start])
    for (const end of [...ends].reverse()) {
      if (end > start) candidates.push(lines.slice(start, end + 1).join("\n"))
    }
  }

  for (const candidate of candidates) {
    let parsed: unknown
    try {
      parsed = JSON.parse(candidate)
    } catch {
      continue
    }
    if (!Array.isArray(parsed) || parsed.length === 0) continue
    const rows: Record<string, unknown>[] = []
    let valid = true
    for (const entry of parsed) {
      if (
        entry === null ||
        typeof entry !== "object" ||
        (entry as { success?: unknown }).success === false ||
        !Array.isArray((entry as { results?: unknown }).results)
      ) {
        valid = false
        break
      }
      for (const row of (entry as { results: unknown[] }).results) {
        if (row === null || typeof row !== "object") {
          valid = false
          break
        }
        rows.push(row as Record<string, unknown>)
      }
    }
    if (valid) return rows
  }
  return null
}

/** `undefined` = output tidak dapat dipercaya; `null` = user tidak ada. */
export function existingUserFromRows(
  rows: Record<string, unknown>[] | null,
): ExistingUser | null | undefined {
  if (rows === null || rows.length > 1) return undefined
  if (rows.length === 0) return null
  const { id, role } = rows[0]
  if (typeof id !== "string" || !isUserRole(role)) return undefined
  return { id, role }
}
