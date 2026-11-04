/**
 * Web Push tanpa dependensi: VAPID (RFC 8292) dan enkripsi payload
 * `aes128gcm` (RFC 8188 + RFC 8291) dengan WebCrypto, sehingga berjalan di
 * Cloudflare Pages Functions maupun Node (tes).
 *
 * Kunci VAPID: publik = titik P-256 tak terkompresi 65 byte (base64url),
 * privat = skalar `d` 32 byte (base64url). Lihat scripts/generate-vapid-keys.ts.
 */

type Bytes = Uint8Array<ArrayBuffer>

/** Masa berlaku token VAPID; push service menolak lebih dari 24 jam. */
const VAPID_TTL_SECONDS = 12 * 60 * 60
/** Pesan disimpan push service selama perangkat offline (detik). */
export const PUSH_TTL_SECONDS = 24 * 60 * 60
/** Ukuran record aes128gcm; payload pengumuman selalu muat dalam satu record. */
const RECORD_SIZE = 4096
/** Batas payload terenkripsi yang wajib diterima push service (RFC 8030). */
export const MAX_PAYLOAD_BYTES = 3_000

const encoder = new TextEncoder()

// ---------------------------------------------------------------------------
// base64url

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

/** Decode base64url (tanpa/dengan padding); null bila bukan base64url sah. */
export function base64UrlDecode(value: string): Bytes | null {
  if (!/^[A-Za-z0-9_-]*={0,2}$/.test(value)) return null
  const base64 = value.replace(/=+$/, "").replace(/-/g, "+").replace(/_/g, "/")
  if (base64.length % 4 === 1) return null
  try {
    const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  } catch {
    return null
  }
}

function concat(...parts: Uint8Array[]): Bytes {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

function copy(bytes: Uint8Array): Bytes {
  return concat(bytes)
}

/** Titik P-256 tak terkompresi: 0x04 || x(32) || y(32). */
export function isUncompressedP256Point(bytes: Uint8Array | null): bytes is Bytes {
  return bytes !== null && bytes.length === 65 && bytes[0] === 0x04
}

// ---------------------------------------------------------------------------
// HKDF (RFC 5869) dengan HMAC-SHA-256; keluaran ≤ 32 byte cukup satu blok.

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Bytes> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    copy(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, copy(data)))
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Bytes> {
  const prk = await hmac(salt, ikm)
  const okm = await hmac(prk, concat(info, new Uint8Array([0x01])))
  return okm.slice(0, length)
}

// ---------------------------------------------------------------------------
// Enkripsi payload (RFC 8291)

export interface EncryptOptions {
  /** Hanya untuk tes vektor RFC: kunci aplikasi server dan salt tetap. */
  serverKeys?: { privateKey: CryptoKey; publicKey: Uint8Array }
  salt?: Uint8Array
}

/**
 * Mengenkripsi payload untuk satu langganan. `p256dh` dan `auth` berasal dari
 * PushSubscription.toJSON().keys (base64url). Hasilnya body request lengkap:
 * salt(16) || rs(4) || idlen(1) || keyid(65) || ciphertext.
 */
export async function encryptPayload(
  payload: Uint8Array,
  p256dh: string,
  auth: string,
  options: EncryptOptions = {},
): Promise<Bytes> {
  const uaPublic = base64UrlDecode(p256dh)
  const authSecret = base64UrlDecode(auth)
  if (!isUncompressedP256Point(uaPublic)) throw new Error("Kunci p256dh tidak valid.")
  if (!authSecret || authSecret.length !== 16) throw new Error("Auth secret tidak valid.")

  let serverPrivate: CryptoKey
  let serverPublic: Bytes
  if (options.serverKeys) {
    serverPrivate = options.serverKeys.privateKey
    serverPublic = copy(options.serverKeys.publicKey)
  } else {
    const pair = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
      "deriveBits",
    ])) as CryptoKeyPair
    serverPrivate = pair.privateKey
    serverPublic = new Uint8Array((await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer)
  }

  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, [])
  // Parameter standar WebCrypto bernama `public`; @cloudflare/workers-types
  // menamainya `$public` (kata tercadang), padahal workerd menerima `public`.
  const ecdhParams = { name: "ECDH", public: uaKey }
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits(ecdhParams as Parameters<typeof crypto.subtle.deriveBits>[0], serverPrivate, 256),
  )

  // IKM = HKDF(auth_secret, ecdh_secret, "WebPush: info" || 0x00 || ua_public || as_public, 32)
  const keyInfo = concat(encoder.encode("WebPush: info"), new Uint8Array([0]), uaPublic, serverPublic)
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32)

  const salt = options.salt ? copy(options.salt) : crypto.getRandomValues(new Uint8Array(16))
  const cek = await hkdf(salt, ikm, concat(encoder.encode("Content-Encoding: aes128gcm"), new Uint8Array([0])), 16)
  const nonce = await hkdf(salt, ikm, concat(encoder.encode("Content-Encoding: nonce"), new Uint8Array([0])), 12)

  // Satu record terakhir: plaintext || 0x02 (tanpa padding tambahan).
  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"])
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce, tagLength: 128 },
      aesKey,
      concat(payload, new Uint8Array([0x02])),
    ),
  )

  const header = new Uint8Array(16 + 4 + 1)
  header.set(salt, 0)
  new DataView(header.buffer).setUint32(16, RECORD_SIZE)
  header[20] = serverPublic.length
  return concat(header, serverPublic, ciphertext)
}

// ---------------------------------------------------------------------------
// VAPID (RFC 8292)

export interface VapidKeys {
  /** Titik publik P-256 tak terkompresi, base64url (applicationServerKey). */
  publicKey: string
  privateKey: CryptoKey
  /** `mailto:` atau URL https kontak pengirim. */
  subject: string
}

/** Mengimpor pasangan kunci VAPID; null bila format tidak valid. */
export async function importVapidKeys(
  publicKey: string,
  privateKey: string,
  subject: string,
): Promise<VapidKeys | null> {
  const pub = base64UrlDecode(publicKey.trim())
  const d = base64UrlDecode(privateKey.trim())
  if (!isUncompressedP256Point(pub) || !d || d.length !== 32) return null
  if (!/^(mailto:\S+@\S+|https:\/\/\S+)$/.test(subject.trim())) return null
  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      {
        kty: "EC",
        crv: "P-256",
        x: base64UrlEncode(pub.slice(1, 33)),
        y: base64UrlEncode(pub.slice(33, 65)),
        d: base64UrlEncode(d),
        ext: false,
      },
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"],
    )
    return { publicKey: base64UrlEncode(pub), privateKey: key, subject: subject.trim() }
  } catch {
    return null
  }
}

/** Header Authorization `vapid t=<JWT>, k=<kunci publik>` untuk satu push service. */
export async function vapidAuthorization(
  endpoint: string,
  keys: VapidKeys,
  nowSeconds: number,
): Promise<string> {
  const header = base64UrlEncode(encoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })))
  const claims = base64UrlEncode(
    encoder.encode(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: nowSeconds + VAPID_TTL_SECONDS,
        sub: keys.subject,
      }),
    ),
  )
  const unsigned = `${header}.${claims}`
  // WebCrypto ECDSA menghasilkan r||s (64 byte), format yang dipakai JWS ES256.
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, keys.privateKey, encoder.encode(unsigned)),
  )
  return `vapid t=${unsigned}.${base64UrlEncode(signature)}, k=${keys.publicKey}`
}

// ---------------------------------------------------------------------------
// Pengiriman

export interface PushTarget {
  endpoint: string
  p256dh: string
  auth: string
}

export type PushOutcome =
  /** Diterima push service (201/202). */
  | { kind: "sent" }
  /** Langganan sudah tidak berlaku (404/410): hapus dari database. */
  | { kind: "gone"; status: number }
  /** Gagal sementara/lainnya: langganan dipertahankan. */
  | { kind: "failed"; status: number | null }

export async function sendWebPush(
  target: PushTarget,
  payload: Uint8Array,
  keys: VapidKeys,
  nowSeconds: number,
  fetchImpl: typeof fetch = fetch,
): Promise<PushOutcome> {
  let body: Bytes
  try {
    body = await encryptPayload(payload, target.p256dh, target.auth)
  } catch {
    return { kind: "gone", status: 0 }
  }
  try {
    const response = await fetchImpl(target.endpoint, {
      method: "POST",
      headers: {
        Authorization: await vapidAuthorization(target.endpoint, keys, nowSeconds),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: String(PUSH_TTL_SECONDS),
        Urgency: "normal",
      },
      body,
      redirect: "manual",
    })
    await response.body?.cancel().catch(() => undefined)
    if (response.status === 201 || response.status === 202) return { kind: "sent" }
    if (response.status === 404 || response.status === 410) return { kind: "gone", status: response.status }
    return { kind: "failed", status: response.status }
  } catch {
    return { kind: "failed", status: null }
  }
}
