import assert from "node:assert/strict"
import {
  buildClearSessionCookie,
  buildSessionCookie,
  readSessionToken,
} from "../server/auth/cookies.ts"
import {
  PBKDF2_ITERATIONS,
  generateSessionToken,
  hashPassword,
  hashSessionToken,
  timingSafeEqualBytes,
  verifyDummyPassword,
  verifyPassword,
} from "../server/auth/crypto.ts"
import { isCsrfAllowed } from "../server/auth/csrf.ts"
import { deviceLabelFromUserAgent } from "../server/auth/device.ts"
import {
  effectivePermissions,
  hasModules,
  requireApiLookupModules,
  requiredModulesForVehicleSource,
  VEHICLE_LOOKUP_REQUIRED_MODULES,
} from "../server/auth/permissions.ts"
import {
  isValidId,
  parseCreateUserInput,
  parseLoginInput,
  parseUpdateUserInput,
  validateName,
  validatePassword,
  validatePermissions,
  validateUsername,
} from "../server/auth/validation.ts"
import { readJsonObject, withApiSecurityHeaders } from "../server/http.ts"
import { MODULE_KEYS } from "../src/types/auth.ts"

function pass(name: string) {
  console.log(`  ✓  ${name}`)
}

console.log("Menjalankan auth unit tests...\n")

// Password hashing
{
  const hash = await hashPassword("rahasia-123")
  const parts = hash.split("$")
  assert.equal(parts.length, 4)
  assert.equal(parts[0], "pbkdf2_sha256")
  assert.equal(Number(parts[1]), PBKDF2_ITERATIONS)
  assert.equal(PBKDF2_ITERATIONS, 100_000)
  assert.equal(Buffer.from(parts[2], "base64").length, 16)
  assert.equal(Buffer.from(parts[3], "base64").length, 32)
  assert.equal(hash.includes("rahasia-123"), false)
  assert.equal(await verifyPassword("rahasia-123", hash), true)
  assert.equal(await verifyPassword("rahasia-124", hash), false)
  assert.notEqual(await hashPassword("rahasia-123"), hash, "salt acak")
  for (const malformed of [
    "",
    "plain",
    "pbkdf2_sha256$abc$x$y",
    "pbkdf2_sha256$100001$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    "bcrypt$10$x$y",
  ]) {
    assert.equal(await verifyPassword("rahasia-123", malformed), false)
  }
  assert.equal(await verifyDummyPassword("apa-saja"), false)
  await assert.rejects(() => hashPassword("x", 100_001))
  assert.equal(timingSafeEqualBytes(new Uint8Array([1, 2]), new Uint8Array([1, 2])), true)
  assert.equal(timingSafeEqualBytes(new Uint8Array([1, 2]), new Uint8Array([1, 3])), false)
  assert.equal(timingSafeEqualBytes(new Uint8Array([1]), new Uint8Array([1, 0])), false)
  pass("PBKDF2 hash/verify, password salah, hash rusak, dummy verify, compare waktu-konstan")
}

// Token & cookie
{
  const token = generateSessionToken()
  assert.match(token, /^[A-Za-z0-9_-]{43}$/)
  assert.notEqual(generateSessionToken(), token)
  const tokenHash = await hashSessionToken(token)
  assert.match(tokenHash, /^[0-9a-f]{64}$/)
  assert.equal(await hashSessionToken(token), tokenHash)

  const cookie = buildSessionCookie(token, 34_560_000)
  assert.ok(cookie.startsWith(`__Host-kp_session=${token};`))
  for (const attr of ["Path=/", "Max-Age=34560000", "HttpOnly", "Secure", "SameSite=Strict"]) {
    assert.ok(cookie.includes(attr), attr)
  }
  assert.equal(cookie.includes("Domain="), false)
  const cleared = buildClearSessionCookie()
  assert.ok(cleared.includes("Max-Age=0") && cleared.includes("__Host-kp_session=;"))
  assert.throws(() => buildSessionCookie("bad token", 10))

  const req = (cookieHeader: string) =>
    new Request("https://app.test/api/auth/me", { headers: { Cookie: cookieHeader } })
  assert.equal(readSessionToken(req(`a=1; __Host-kp_session=${token}; b=2`)), token)
  assert.equal(readSessionToken(req("__Host-kp_session=short")), null)
  assert.equal(readSessionToken(req(`kp_session=${token}`)), null)
  pass("Token 32 byte base64url, hash SHA-256, atribut cookie set/clear, parsing cookie")
}

// CSRF
{
  const make = (method: string, headers: Record<string, string>) =>
    new Request("https://app.test/api/auth/login", { method, headers })
  assert.equal(isCsrfAllowed(make("GET", { Origin: "https://evil.test" })), true)
  assert.equal(isCsrfAllowed(make("POST", { Origin: "https://app.test" })), true)
  assert.equal(isCsrfAllowed(make("POST", { Origin: "https://evil.test" })), false)
  assert.equal(isCsrfAllowed(make("POST", { Origin: "http://app.test" })), false)
  assert.equal(isCsrfAllowed(make("POST", { Origin: "null" })), false)
  assert.equal(isCsrfAllowed(make("DELETE", {})), false)
  assert.equal(isCsrfAllowed(make("DELETE", { "Sec-Fetch-Site": "same-origin" })), true)
  assert.equal(isCsrfAllowed(make("PATCH", { "Sec-Fetch-Site": "cross-site" })), false)
  assert.equal(
    isCsrfAllowed(make("POST", { Origin: "https://evil.test", "Sec-Fetch-Site": "same-origin" })),
    false,
  )
  pass("CSRF: Origin harus sama; fallback Sec-Fetch-Site same-origin; metode aman lolos")
}

// Device label
{
  const chromeWin =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
  const safariIos =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
  const edge = `${chromeWin} Edg/130.0`
  assert.equal(deviceLabelFromUserAgent(chromeWin), "Chrome di Windows")
  assert.equal(deviceLabelFromUserAgent(safariIos), "Safari di iOS")
  assert.equal(deviceLabelFromUserAgent(edge), "Edge di Windows")
  assert.equal(deviceLabelFromUserAgent(null), "Perangkat tidak dikenal")
  const evil = deviceLabelFromUserAgent(`<script>alert(1)</script>${"x".repeat(5000)}`)
  assert.equal(evil, "Perangkat tidak dikenal")
  assert.ok(deviceLabelFromUserAgent("A".repeat(10_000)).length <= 120)
  pass("Device label dari User-Agent: kosakata tetap, maksimal 120 karakter")
}

// Validation
{
  assert.deepEqual(validateUsername("  Petugas.01 "), { ok: true, value: "petugas.01" })
  for (const bad of ["ab", "a".repeat(33), "with space", "ümlaut", 5, null]) {
    assert.equal(validateUsername(bad).ok, false)
  }
  assert.deepEqual(validateName("  Budi  "), { ok: true, value: "Budi" })
  assert.equal(validateName("").ok, false)
  assert.equal(validateName("x".repeat(101)).ok, false)
  assert.equal(validateName("a\u0000b").ok, false)
  assert.equal(validatePassword("1234567").ok, false)
  assert.equal(validatePassword("12345678").ok, true)
  assert.equal(validatePassword("x".repeat(129)).ok, false)
  assert.deepEqual(validatePermissions(["vehicle_lookup.api", "calculator"]), {
    ok: true,
    value: ["calculator", "vehicle_lookup.api"],
  })
  // Kunci lama tidak dapat lagi diberikan melalui API admin.
  assert.equal(validatePermissions(["vehicle_lookup.d1"]).ok, false)
  assert.equal(validatePermissions(["vehicle_source.settings"]).ok, false)
  assert.equal(validatePermissions(["calculator", "calculator"]).ok, false)
  assert.equal(validatePermissions(["admin"]).ok, false)
  assert.equal(validatePermissions("calculator").ok, false)

  const created = parseCreateUserInput({
    username: "Petugas1",
    name: " P ",
    password: "password1",
    role: "petugas",
    permissions: ["calculator"],
    extra: "ignored",
  })
  assert.deepEqual(created, {
    ok: true,
    value: {
      username: "petugas1",
      name: "P",
      password: "password1",
      role: "petugas",
      permissions: ["calculator"],
    },
  })
  assert.equal(
    parseCreateUserInput({ username: "abc", name: "A", password: "password1", role: "petugas" }).ok,
    false,
    "petugas wajib permissions",
  )
  const adminCreate = parseCreateUserInput({
    username: "abc",
    name: "A",
    password: "password1",
    role: "admin",
    permissions: [...MODULE_KEYS],
  })
  assert.ok(adminCreate.ok && adminCreate.value.permissions.length === 0)
  assert.equal(parseCreateUserInput({ username: "abc", name: "A", password: "password1", role: "root", permissions: [] }).ok, false)
  assert.equal(parseUpdateUserInput({}).ok, false)
  assert.equal(parseUpdateUserInput({ active: "yes" }).ok, false)
  assert.deepEqual(parseUpdateUserInput({ active: false, unknown: 1 }), { ok: true, value: { active: false } })
  assert.equal(parseLoginInput({ username: "", password: "x" }), null)
  assert.deepEqual(parseLoginInput({ username: " Admin ", password: "x" }), { username: "admin", password: "x" })
  assert.equal(isValidId("00000000-0000-4000-8000-000000000001"), true)
  assert.equal(isValidId("1 OR 1=1"), false)
  pass("Validasi username, nama, password, role, permissions, create/update/login, id")
}

// Permissions
{
  assert.deepEqual(effectivePermissions("admin", []), [...MODULE_KEYS])
  assert.deepEqual(effectivePermissions("petugas", ["facility.tembak_ru", "calculator", "junk"]), [
    "calculator",
    "facility.tembak_ru",
  ])
  // Kompatibilitas sebelum migration 0004: d1 lama → api; settings dibuang; calculator tidak ditambah.
  assert.deepEqual(effectivePermissions("petugas", ["vehicle_lookup.d1"]), ["vehicle_lookup.api"])
  assert.deepEqual(effectivePermissions("petugas", ["calculator", "vehicle_lookup.d1", "vehicle_lookup.api"]), [
    "calculator",
    "vehicle_lookup.api",
  ])
  assert.deepEqual(effectivePermissions("petugas", ["vehicle_source.settings"]), [])
  assert.deepEqual(effectivePermissions("petugas", ["calculator", "vehicle_source.settings"]), ["calculator"])
  for (const mode of ["d1", "api", "d1_then_api", "api_then_d1", undefined, "garbage"] as const) {
    assert.deepEqual(requiredModulesForVehicleSource(mode), ["calculator", "vehicle_lookup.api"], `mode=${mode}`)
  }
  assert.deepEqual(requireApiLookupModules(), ["calculator", "vehicle_lookup.api"])
  assert.deepEqual([...VEHICLE_LOOKUP_REQUIRED_MODULES], ["calculator", "vehicle_lookup.api"])
  assert.deepEqual([...MODULE_KEYS], ["calculator", "vehicle_lookup.api", "facility.tembak_ru", "fees.bbn_mutasi"])
  const petugas = { id: "x", username: "p", name: "P", role: "petugas" as const, permissions: ["calculator" as const] }
  assert.equal(hasModules(petugas, ["calculator"]), true)
  assert.equal(hasModules(petugas, ["calculator", "vehicle_lookup.api"]), false)
  pass("Permission efektif admin/petugas, alias legacy d1→api, lookup selalu calculator+api")
}

// HTTP helpers
{
  const json = (body: string, headers: Record<string, string>) =>
    new Request("https://app.test/api/x", { method: "POST", body, headers })
  assert.equal((await readJsonObject(json("{}", {}))).ok, false)
  const r415 = await readJsonObject(json("{}", { "Content-Type": "text/plain" }))
  assert.ok(!r415.ok && r415.response.status === 415)
  const r413 = await readJsonObject(json(`{"a":"${"x".repeat(17_000)}"}`, { "Content-Type": "application/json" }))
  assert.ok(!r413.ok && r413.response.status === 413)
  const r400 = await readJsonObject(json("[1]", { "Content-Type": "application/json" }))
  assert.ok(!r400.ok && r400.response.status === 400)
  const okBody = await readJsonObject(json('{"a":1}', { "Content-Type": "application/json; charset=utf-8" }))
  assert.ok(okBody.ok && okBody.value.a === 1)

  const secured = withApiSecurityHeaders(
    new Response("{}", {
      headers: { "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" },
    }),
  )
  assert.equal(secured.headers.get("Cache-Control"), "no-store")
  assert.equal(secured.headers.get("X-Content-Type-Options"), "nosniff")
  assert.equal(secured.headers.get("Access-Control-Allow-Origin"), null)
  const keep = withApiSecurityHeaders(new Response("{}", { headers: { "Cache-Control": "private, no-store" } }))
  assert.equal(keep.headers.get("Cache-Control"), "private, no-store")
  pass("Body JSON 400/413/415 dan header keamanan API")
}

console.log("\nSemua auth unit tests: PASS ✓\n")
