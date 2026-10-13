import assert from "node:assert/strict"
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
} from "../scripts/create-admin-lib.ts"

function pass(name: string) {
  console.log(`  ✓  ${name}`)
}

console.log("Menjalankan create-admin script unit tests...\n")

const base = ["--username", "Admin", "--name", "Administrator"]

// Argumen
{
  const parsed = parseCliArgs(base)
  assert.ok(parsed.ok && !parsed.help)
  assert.deepEqual(parsed.value, {
    username: "admin",
    name: "Administrator",
    reset: false,
    promote: false,
    target: "local",
    confirmRemote: undefined,
  })
  const help = parseCliArgs(["--help"])
  assert.ok(help.ok && help.help)
  for (const [args, pattern] of [
    [[...base, "--local", "--remote"], /--local atau --remote/],
    [[...base, "--confirm-remote", DATABASE_NAME], /hanya berlaku bersama --remote/],
    [[...base, "--promote"], /--promote hanya berlaku bersama --reset/],
    [["--username", "Bad Name", "--name", "X"], /--username/],
    [["--username", "admin", "--name", ""], /--name/],
    [[...base, "--unknown"], /unknown/i],
    [[...base, "extra"], /.+/],
  ] as const) {
    const result = parseCliArgs([...args])
    assert.ok(!result.ok, args.join(" "))
    assert.match(result.message, pattern)
  }
  const remote = parseCliArgs([...base, "--remote", "--confirm-remote", "x", "--reset", "--promote"])
  assert.ok(remote.ok && !remote.help)
  assert.equal(remote.value.target, "remote")
  assert.equal(remote.value.confirmRemote, "x")
  assert.ok(remote.value.reset && remote.value.promote)
  pass("parseCliArgs: default local, validasi username/nama, kombinasi flag terlarang ditolak")
}

// Konfirmasi remote
{
  assert.deepEqual(planRemoteConfirmation({ target: "local", confirmRemote: undefined }, false), {
    kind: "not_required",
  })
  assert.deepEqual(planRemoteConfirmation({ target: "remote", confirmRemote: undefined }, true), {
    kind: "prompt",
  })
  assert.equal(planRemoteConfirmation({ target: "remote", confirmRemote: undefined }, false).kind, "error")
  assert.deepEqual(planRemoteConfirmation({ target: "remote", confirmRemote: DATABASE_NAME }, false), {
    kind: "confirmed_by_flag",
  })
  assert.equal(planRemoteConfirmation({ target: "remote", confirmRemote: "kalkulator-pajak" }, true).kind, "error")
  assert.equal(isRemoteConfirmationAnswer(`  ${DATABASE_NAME} `), true)
  for (const answer of ["", "y", "yes", "KALKULATOR-PAJAK-DB", "kalkulator-pajak"]) {
    assert.equal(isRemoteConfirmationAnswer(answer), false)
  }
  pass("Remote: wajib ketik nama DB di TTY; non-TTY hanya dengan --confirm-remote yang tepat")
}

// Rencana penulisan
{
  const flags = (reset: boolean, promote: boolean) => ({ reset, promote })
  assert.deepEqual(planAdminWrite("admin", null, flags(false, false)), { kind: "create" })
  assert.equal(planAdminWrite("admin", null, flags(true, false)).kind, "error")
  const admin = { id: "id-admin", role: "admin" as const }
  const petugas = { id: "id-petugas", role: "petugas" as const }
  assert.match((planAdminWrite("admin", admin, flags(false, false)) as { message: string }).message, /--reset/)
  assert.deepEqual(planAdminWrite("admin", admin, flags(true, false)), { kind: "reset", userId: "id-admin" })
  assert.deepEqual(planAdminWrite("admin", admin, flags(true, true)), { kind: "reset", userId: "id-admin" })
  const refused = planAdminWrite("budi", petugas, flags(true, false))
  assert.equal(refused.kind, "error")
  assert.match((refused as { message: string }).message, /--promote/)
  assert.deepEqual(planAdminWrite("budi", petugas, flags(true, true)), {
    kind: "promote",
    userId: "id-petugas",
    fromRole: "petugas",
  })
  pass("Rencana: create / reset admin / tolak reset non-admin tanpa --promote / promote")
}

// SQL
{
  assert.equal(sqlString("O'Brien"), "'O''Brien'")
  const input = {
    username: "admin",
    name: "O'Brien",
    passwordHash: "pbkdf2_sha256$100000$c2FsdA==$aGFzaA==",
    now: "2026-10-13T00:00:00.000Z",
    newId: "new-id",
  }
  const create = buildAdminSql({ kind: "create" }, input)
  assert.match(create, /INSERT INTO users/)
  assert.match(create, /'O''Brien'/)
  assert.match(create, /'user\.create'/)
  assert.doesNotMatch(create, /DELETE FROM sessions/)

  const reset = buildAdminSql({ kind: "reset", userId: "id-admin" }, input)
  assert.match(reset, /UPDATE users SET password_hash/)
  assert.match(reset, /'user\.reset_password'/)
  assert.doesNotMatch(reset, /DELETE FROM sessions/, "reset biasa tidak menghapus sesi")
  assert.doesNotMatch(reset, /user\.promote/)

  const promote = buildAdminSql({ kind: "promote", userId: "id-petugas", fromRole: "petugas" }, input)
  assert.match(promote, /DELETE FROM sessions WHERE user_id = 'id-petugas';/)
  assert.match(promote, /DELETE FROM user_permissions WHERE user_id = 'id-petugas';/)
  assert.match(promote, /'user\.promote'/)
  assert.match(promote, /"fromRole":"petugas","toRole":"admin"/)
  assert.match(promote, /'user\.reset_password'/)
  for (const sql of [create, reset, promote]) {
    const auditLines = sql.split("\n").filter((line) => line.includes("VALUES (NULL"))
    assert.ok(auditLines.length > 0)
    assert.equal(auditLines.some((line) => /pbkdf2|password_hash/.test(line)), false, "audit tanpa hash")
  }
  pass("SQL: escape kutip; reset tanpa hapus sesi; promote hapus sesi + audit user.promote & reset_password")
}

// Parsing output wrangler --json
{
  const clean = `[\n  {\n    "results": [{ "id": "u1", "role": "admin" }],\n    "success": true,\n    "meta": {}\n  }\n]\n`
  assert.deepEqual(parseWranglerJsonRows(clean), [{ id: "u1", role: "admin" }])
  const banner = `▲ [WARNING] Something [noisy] here\nupdate available 4.149.0\n${clean}`
  assert.deepEqual(parseWranglerJsonRows(banner), [{ id: "u1", role: "admin" }])
  const trailing = `${clean}\n[wrangler] done\n`
  assert.deepEqual(parseWranglerJsonRows(trailing), [{ id: "u1", role: "admin" }])
  assert.deepEqual(parseWranglerJsonRows(`[{"results":[],"success":true}]`), [])
  for (const bad of ["", "not json", "[]", `[{"success":false,"results":[]}]`, `{"results":[]}`, "[\n{ broken\n]"]) {
    assert.equal(parseWranglerJsonRows(bad), null, JSON.stringify(bad))
  }
  assert.equal(existingUserFromRows(null), undefined)
  assert.equal(existingUserFromRows([]), null)
  assert.deepEqual(existingUserFromRows([{ id: "u1", role: "petugas" }]), { id: "u1", role: "petugas" })
  assert.equal(existingUserFromRows([{ id: "u1", role: "root" }]), undefined)
  assert.equal(existingUserFromRows([{ id: 1, role: "admin" }]), undefined)
  assert.equal(existingUserFromRows([{ id: "a", role: "admin" }, { id: "b", role: "admin" }]), undefined)
  pass("Parsing JSON wrangler toleran banner/peringatan; output rusak gagal aman")
}

// Usage
{
  assert.match(USAGE, /tersembunyi/)
  assert.match(USAGE, /riwayat PowerShell/)
  assert.match(USAGE, /--confirm-remote/)
  assert.match(USAGE, /--promote/)
  pass("Usage merekomendasikan prompt tersembunyi dan memperingatkan riwayat PowerShell")
}

console.log("\nSemua create-admin script unit tests: PASS ✓\n")
