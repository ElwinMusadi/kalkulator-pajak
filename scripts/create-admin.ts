/**
 * scripts/create-admin.ts — membuat (atau mereset) akun Admin.
 * Jalankan `npm run admin:create -- --help` untuk pemakaian lengkap.
 *
 * Disarankan: biarkan password diminta tersembunyi (tanpa ADMIN_PASSWORD), karena
 * `$env:ADMIN_PASSWORD = "..."` tersimpan di riwayat PowerShell.
 *
 * Default target database lokal. `--remote` wajib dikonfirmasi dengan mengetik
 * nama database (atau `--confirm-remote kalkulator-pajak-db` untuk non-TTY).
 * Password/hash tidak pernah dicetak; SQL sementara ditulis ke direktori temp
 * OS (mode 0600) dan selalu dihapus.
 */

import { spawn } from "node:child_process"
import { randomBytes, randomUUID } from "node:crypto"
import { rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { hashPassword } from "../server/auth/crypto.ts"
import { validatePassword } from "../server/auth/validation.ts"
import {
  DATABASE_NAME,
  USAGE,
  buildAdminSql,
  existingUserFromRows,
  isRemoteConfirmationAnswer,
  parseCliArgs,
  parseWranglerJsonRows,
  planAdminWrite,
  planRemoteConfirmation,
  sqlString,
  type ExistingUser,
  type Target,
} from "./create-admin-lib.ts"

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const WRANGLER_BIN = path.join(PROJECT_ROOT, "node_modules", "wrangler", "bin", "wrangler.js")

function fail(message: string): never {
  console.error(`✗ ${message}`)
  process.exit(1)
}

/** Hapus apa pun yang menyerupai hash password dari output yang diteruskan. */
function redact(text: string): string {
  return text.replace(/pbkdf2_sha256\$[^\s'"]*/g, "[REDACTED]")
}

interface RunResult {
  code: number
  stdout: string
  stderr: string
}

/** Menjalankan wrangler via Node langsung (tanpa shell) — konsisten di Windows/Unix. */
function runWrangler(args: string[]): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [WRANGLER_BIN, ...args], {
      cwd: PROJECT_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ADMIN_PASSWORD: undefined, WRANGLER_SEND_METRICS: "false" },
      windowsHide: true,
    })
    let stdout = ""
    let stderr = ""
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => (stdout += chunk))
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk))
    child.on("error", reject)
    child.on("close", (code: number | null) => resolve({ code: code ?? 1, stdout, stderr }))
  })
}

async function withTempSql<T>(sql: string, fn: (file: string) => Promise<T>): Promise<T> {
  const suffix = Array.from(randomBytes(12), (b) => b.toString(16).padStart(2, "0")).join("")
  const file = path.join(tmpdir(), `kp-admin-${suffix}.sql`)
  try {
    await writeFile(file, sql, { encoding: "utf8", mode: 0o600, flag: "wx" })
    return await fn(file)
  } finally {
    await rm(file, { force: true })
  }
}

/** Menjalankan SQL tulis dari file sementara (password hash tidak masuk argumen proses). */
function d1ExecuteFile(sql: string, target: Target): Promise<RunResult> {
  return withTempSql(sql, (file) =>
    runWrangler([
      "d1",
      "execute",
      DATABASE_NAME,
      `--${target}`,
      "--file",
      file,
      ...(target === "remote" ? ["--yes"] : []),
    ]),
  )
}

async function findExistingUser(username: string, target: Target): Promise<ExistingUser | null> {
  // Wajib --command, bukan --file: pada D1 remote, `--file` memakai mode import
  // yang hanya mengembalikan statistik eksekusi, bukan baris hasil SELECT.
  // Username sudah lolos USERNAME_PATTERN ([a-z0-9._-]) dan tetap di-escape.
  const result = await runWrangler([
    "d1",
    "execute",
    DATABASE_NAME,
    `--${target}`,
    "--json",
    "--command",
    `SELECT id, role FROM users WHERE username = ${sqlString(username)} COLLATE NOCASE;`,
    ...(target === "remote" ? ["--yes"] : []),
  ])
  if (result.code !== 0) {
    console.error(redact(result.stderr || result.stdout))
    fail("Gagal memeriksa user. Pastikan migration sudah diterapkan (npm run db:migrate:local).")
  }
  const existing = existingUserFromRows(parseWranglerJsonRows(result.stdout))
  if (existing === undefined) fail("Output JSON wrangler tidak dapat dibaca; tidak ada perubahan dilakukan.")
  return existing
}

function readLine(question: string, hidden: boolean): Promise<string> {
  const stdin = process.stdin
  process.stdout.write(question)
  return new Promise((resolve, reject) => {
    let value = ""
    const cleanup = () => {
      stdin.off("data", onData)
      stdin.setRawMode(false)
      stdin.pause()
      process.stdout.write("\n")
    }
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          cleanup()
          resolve(value)
          return
        }
        if (ch === "\u0003" || ch === "\u0004") {
          cleanup()
          reject(new Error("Dibatalkan."))
          return
        }
        if (ch === "\u007f" || ch === "\b") {
          if (value.length > 0 && !hidden) process.stdout.write("\b \b")
          value = value.slice(0, -1)
        } else if (ch >= " ") {
          value += ch
          if (!hidden) process.stdout.write(ch)
        }
      }
    }
    stdin.setEncoding("utf8")
    stdin.setRawMode(true)
    stdin.resume()
    stdin.on("data", onData)
  })
}

async function readPassword(): Promise<string> {
  const fromEnv = process.env.ADMIN_PASSWORD
  if (fromEnv !== undefined && fromEnv !== "") {
    console.warn(
      "⚠ Memakai ADMIN_PASSWORD. Perintah $env:ADMIN_PASSWORD tersimpan di riwayat PowerShell; " +
        "hapus dengan Remove-Item Env:ADMIN_PASSWORD dan bersihkan riwayat. Disarankan prompt tersembunyi.",
    )
    return fromEnv
  }
  if (!process.stdin.isTTY) fail("Tidak ada TTY untuk prompt password. Jalankan di terminal interaktif.")
  const first = await readLine("Password admin: ", true)
  const second = await readLine("Ulangi password: ", true)
  if (first !== second) fail("Password tidak sama.")
  return first
}

async function main(): Promise<void> {
  const cli = parseCliArgs(process.argv.slice(2))
  if (!cli.ok) {
    console.error(USAGE)
    fail(cli.message)
  }
  if (cli.help) {
    console.log(USAGE)
    return
  }
  const options = cli.value

  // Konfirmasi remote sebelum membaca password atau menyentuh database.
  const confirmation = planRemoteConfirmation(options, process.stdin.isTTY === true)
  if (confirmation.kind === "error") fail(confirmation.message)
  if (confirmation.kind !== "not_required") {
    console.warn(`⚠ Target: database REMOTE (produksi) "${DATABASE_NAME}".`)
  }
  if (confirmation.kind === "prompt") {
    const answer = await readLine(`Ketik "${DATABASE_NAME}" untuk melanjutkan: `, false)
    if (!isRemoteConfirmationAnswer(answer)) fail("Konfirmasi tidak cocok. Dibatalkan.")
  }

  const password = validatePassword(await readPassword())
  if (!password.ok) fail(password.message)

  const existing = await findExistingUser(options.username, options.target)
  const plan = planAdminWrite(options.username, existing, options)
  if (plan.kind === "error") fail(plan.message)

  const sql = buildAdminSql(plan, {
    username: options.username,
    name: options.name,
    passwordHash: await hashPassword(password.value),
    now: new Date().toISOString(),
    newId: randomUUID(),
  })

  const result = await d1ExecuteFile(sql, options.target)
  if (result.code !== 0) {
    console.error(redact(result.stderr || result.stdout))
    fail("Gagal menulis user admin.")
  }
  const action =
    plan.kind === "create" ? "dibuat" : plan.kind === "promote" ? "dinaikkan menjadi admin dan direset" : "direset"
  console.log(`✓ Admin "${options.username}" berhasil ${action} (${options.target}).`)
}

main().catch((err: unknown) => {
  fail(err instanceof Error ? redact(err.message) : "Terjadi kesalahan.")
})
