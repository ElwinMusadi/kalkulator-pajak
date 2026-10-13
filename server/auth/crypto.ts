/**
 * Kriptografi auth berbasis WebCrypto (Workers runtime & Node 24).
 *
 * Format hash password: `pbkdf2_sha256$<iterations>$<saltB64>$<hashB64>`.
 * Workers membatasi PBKDF2 hingga 100000 iterasi, sehingga nilai default
 * ditetapkan tepat pada batas tersebut.
 */

export const PBKDF2_ITERATIONS = 100_000
export const PBKDF2_MAX_ITERATIONS = 100_000
const PBKDF2_PREFIX = "pbkdf2_sha256"
const SALT_BYTES = 16
const HASH_BYTES = 32
const SESSION_TOKEN_BYTES = 32

const encoder = new TextEncoder()

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = ""
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0")
  return hex
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return bytes
}

/** Perbandingan waktu-konstan; panjang berbeda tetap memproses seluruh data. */
export function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  const subtle = crypto.subtle as SubtleCrypto & {
    timingSafeEqual?: (a: ArrayBufferView | ArrayBuffer, b: ArrayBufferView | ArrayBuffer) => boolean
  }
  if (a.byteLength === b.byteLength && typeof subtle.timingSafeEqual === "function") {
    return subtle.timingSafeEqual(a, b)
  }
  const length = Math.max(a.byteLength, b.byteLength)
  let diff = a.byteLength ^ b.byteLength
  for (let i = 0; i < length; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  }
  return diff === 0
}

async function pbkdf2(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
  lengthBytes: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    lengthBytes * 8,
  )
  return new Uint8Array(bits)
}

export async function hashPassword(
  password: string,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<string> {
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > PBKDF2_MAX_ITERATIONS) {
    throw new RangeError("Invalid PBKDF2 iterations")
  }
  const salt = randomBytes(SALT_BYTES)
  const hash = await pbkdf2(password, salt, iterations, HASH_BYTES)
  return `${PBKDF2_PREFIX}$${iterations}$${bytesToBase64(salt)}$${bytesToBase64(hash)}`
}

interface ParsedHash {
  iterations: number
  salt: Uint8Array<ArrayBuffer>
  hash: Uint8Array
}

function parsePasswordHash(stored: string): ParsedHash | null {
  const parts = stored.split("$")
  if (parts.length !== 4 || parts[0] !== PBKDF2_PREFIX) return null
  if (!/^\d{1,7}$/.test(parts[1])) return null
  const iterations = Number(parts[1])
  if (iterations < 1 || iterations > PBKDF2_MAX_ITERATIONS) return null
  try {
    const salt = base64ToBytes(parts[2])
    const hash = base64ToBytes(parts[3])
    if (salt.byteLength < 8 || hash.byteLength < 16 || hash.byteLength > 64) return null
    return { iterations, salt, hash }
  } catch {
    return null
  }
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parsePasswordHash(stored)
  if (!parsed) {
    // Tetap melakukan kerja setara agar timing tidak membedakan hash rusak.
    await pbkdf2(password, randomBytes(SALT_BYTES), PBKDF2_ITERATIONS, HASH_BYTES)
    return false
  }
  const derived = await pbkdf2(password, parsed.salt, parsed.iterations, parsed.hash.byteLength)
  return timingSafeEqualBytes(derived, parsed.hash)
}

/**
 * Hash tiruan berformat valid (iterasi sama dengan default) sehingga verifikasi
 * untuk username tidak dikenal/nonaktif melakukan kerja PBKDF2 yang setara.
 * Tidak ada password yang cocok dengan nilai ini secara praktis.
 */
const DUMMY_PASSWORD_HASH = `${PBKDF2_PREFIX}$${PBKDF2_ITERATIONS}$${bytesToBase64(
  new Uint8Array(SALT_BYTES).fill(0x5a),
)}$${bytesToBase64(new Uint8Array(HASH_BYTES).fill(0xa5))}`

/** Verifikasi tiruan; selalu `false`. */
export async function verifyDummyPassword(password: string): Promise<false> {
  await verifyPassword(password, DUMMY_PASSWORD_HASH)
  return false
}

/** Token sesi acak 32 byte (base64url). Hanya dikirim ke client via cookie. */
export function generateSessionToken(): string {
  return bytesToBase64Url(randomBytes(SESSION_TOKEN_BYTES))
}

export const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

/** SHA-256 hex dari token; hanya nilai ini yang disimpan di D1. */
export async function hashSessionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token))
  return bytesToHex(new Uint8Array(digest))
}
