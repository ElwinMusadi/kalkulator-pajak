/**
 * Web Push: vektor uji RFC 8291 Appendix A (enkripsi aes128gcm), dekripsi
 * pulang-pergi sebagai user agent, token VAPID, dan hasil pengiriman.
 */

import assert from "node:assert/strict"
import {
  base64UrlDecode,
  base64UrlEncode,
  encryptPayload,
  importVapidKeys,
  sendWebPush,
  vapidAuthorization,
} from "../server/push/web-push.ts"

function pass(name: string) {
  console.log(`  ✓  ${name}`)
}

const b = (value: string) => {
  const bytes = base64UrlDecode(value)
  assert.ok(bytes, `base64url ${value}`)
  return bytes
}

async function ecdhPrivateKey(d: string, publicKey: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      d,
      x: base64UrlEncode(publicKey.slice(1, 33)),
      y: base64UrlEncode(publicKey.slice(33, 65)),
    },
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"],
  )
}

// RFC 8291 Appendix A
const RFC = {
  plaintext: "When I grow up, I want to be a watermelon",
  asPublic: "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  uaPublic: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  uaPrivate: "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
  body:
    "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
}

/** Dekripsi sisi user agent (RFC 8291 §3.4 + RFC 8188), ditulis terpisah dari server. */
async function decryptAsUserAgent(body: Uint8Array, uaPrivate: string, uaPublic: string, auth: string) {
  const salt = body.slice(0, 16)
  const rs = new DataView(body.buffer, body.byteOffset).getUint32(16)
  const idlen = body[20]
  const asPublic = body.slice(21, 21 + idlen)
  const ciphertext = body.slice(21 + idlen)
  const uaPub = b(uaPublic)
  const ua = await ecdhPrivateKey(uaPrivate, uaPub)
  const asKey = await crypto.subtle.importKey("raw", asPublic, { name: "ECDH", namedCurve: "P-256" }, false, [])
  const secret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: asKey } as Parameters<typeof crypto.subtle.deriveBits>[0], ua, 256))
  const hmacKey = (k: Uint8Array) => crypto.subtle.importKey("raw", k, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const h = async (k: Uint8Array, d: Uint8Array) => new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(k), d))
  const te = new TextEncoder()
  const join = (...p: Uint8Array[]) => Uint8Array.from(p.flatMap((x) => [...x]))
  const prkKey = await h(b(auth), secret)
  const ikm = await h(prkKey, join(te.encode("WebPush: info\0"), uaPub, asPublic, [1] as unknown as Uint8Array))
  const prk = await h(salt, ikm)
  const cek = (await h(prk, join(te.encode("Content-Encoding: aes128gcm\0"), Uint8Array.of(1)))).slice(0, 16)
  const nonce = (await h(prk, join(te.encode("Content-Encoding: nonce\0"), Uint8Array.of(1)))).slice(0, 12)
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"])
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, ciphertext))
  assert.equal(plain[plain.length - 1], 0x02, "record terakhir diakhiri delimiter 0x02")
  return { rs, asPublic, text: new TextDecoder().decode(plain.slice(0, -1)) }
}

// 1. base64url
{
  assert.equal(base64UrlEncode(Uint8Array.of(0xfb, 0xff, 0xbf)), "-_-_")
  assert.deepEqual(base64UrlDecode("-_-_"), Uint8Array.of(0xfb, 0xff, 0xbf))
  assert.deepEqual(base64UrlDecode("AQ"), Uint8Array.of(1))
  assert.deepEqual(base64UrlDecode("AQ=="), Uint8Array.of(1))
  for (const bad of ["A", "a+b", "a/b", "ab!c", "AQ==="]) assert.equal(base64UrlDecode(bad), null, bad)
  pass("base64url encode/decode, input tidak sah ditolak")
}

// 2. Vektor RFC 8291 Appendix A
{
  const asPublic = b(RFC.asPublic)
  const body = await encryptPayload(new TextEncoder().encode(RFC.plaintext), RFC.uaPublic, RFC.auth, {
    serverKeys: { privateKey: await ecdhPrivateKey(RFC.asPrivate, asPublic), publicKey: asPublic },
    salt: b(RFC.salt),
  })
  assert.equal(base64UrlEncode(body), RFC.body, "body terenkripsi sama dengan RFC 8291 Appendix A")
  pass("Enkripsi aes128gcm sama persis dengan vektor uji RFC 8291")
}

// 3. Pulang-pergi dengan kunci acak: user agent bisa membuka pesan
{
  const ua = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair
  const uaPublic = base64UrlEncode(new Uint8Array((await crypto.subtle.exportKey("raw", ua.publicKey)) as ArrayBuffer))
  const uaJwk = (await crypto.subtle.exportKey("jwk", ua.privateKey)) as JsonWebKey
  const auth = base64UrlEncode(crypto.getRandomValues(new Uint8Array(16)))
  const pesan = JSON.stringify({ title: "Pembaruan SWDKLLJ", body: "Tarif kini per golongan Jasa Raharja." })
  const body1 = await encryptPayload(new TextEncoder().encode(pesan), uaPublic, auth)
  const body2 = await encryptPayload(new TextEncoder().encode(pesan), uaPublic, auth)
  const opened = await decryptAsUserAgent(body1, uaJwk.d!, uaPublic, auth)
  assert.equal(opened.text, pesan)
  assert.equal(opened.rs, 4096)
  assert.equal(opened.asPublic.length, 65)
  assert.notEqual(base64UrlEncode(body1), base64UrlEncode(body2), "salt dan kunci server baru setiap kirim")
  await assert.rejects(() => encryptPayload(new Uint8Array(1), "AAAA", auth), /p256dh/)
  await assert.rejects(() => encryptPayload(new Uint8Array(1), uaPublic, "AAAA"), /Auth secret/)
  pass("Pulang-pergi: pesan terbuka di user agent; salt/kunci acak; kunci rusak ditolak")
}

// 4. VAPID: kunci, token JWT ES256, dan header Authorization
const vapidPair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
  "sign",
  "verify",
])) as CryptoKeyPair
const vapidPublic = base64UrlEncode(new Uint8Array((await crypto.subtle.exportKey("raw", vapidPair.publicKey)) as ArrayBuffer))
const vapidPrivate = ((await crypto.subtle.exportKey("jwk", vapidPair.privateKey)) as JsonWebKey).d!
{
  const keys = await importVapidKeys(vapidPublic, vapidPrivate, "mailto:admin@uptdpenda-kupang.web.id")
  assert.ok(keys)
  const now = 1_793_000_000
  const header = await vapidAuthorization("https://fcm.googleapis.com/fcm/send/abc:def", keys, now)
  const match = header.match(/^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/)
  assert.ok(match, header)
  const [, h, c, s, k] = match
  assert.equal(k, vapidPublic)
  assert.deepEqual(JSON.parse(new TextDecoder().decode(b(h))), { typ: "JWT", alg: "ES256" })
  assert.deepEqual(JSON.parse(new TextDecoder().decode(b(c))), {
    aud: "https://fcm.googleapis.com",
    exp: now + 12 * 3600,
    sub: "mailto:admin@uptdpenda-kupang.web.id",
  })
  const ok = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    vapidPair.publicKey,
    b(s),
    new TextEncoder().encode(`${h}.${c}`),
  )
  assert.equal(ok, true, "tanda tangan ES256 sah dengan kunci publik VAPID")

  for (const [pub, priv, subject] of [
    ["", vapidPrivate, "mailto:a@b.id"],
    [vapidPublic, "pendek", "mailto:a@b.id"],
    [vapidPublic.slice(0, -2), vapidPrivate, "mailto:a@b.id"],
    [vapidPublic, vapidPrivate, "admin@b.id"],
    [vapidPublic, vapidPrivate, "http://b.id"],
  ]) {
    assert.equal(await importVapidKeys(pub, priv, subject), null, `${pub.length}/${priv.length}/${subject}`)
  }
  assert.ok(await importVapidKeys(` ${vapidPublic} `, ` ${vapidPrivate}\n`, "https://kalkulator.uptdpenda-kupang.web.id"))
  pass("VAPID: JWT ES256 sah (aud, exp 12 jam, sub), kunci/subject tidak valid ditolak")
}

// 5. sendWebPush: header, body, dan hasil per status
{
  const keys = (await importVapidKeys(vapidPublic, vapidPrivate, "mailto:admin@uptdpenda-kupang.web.id"))!
  const ua = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair
  const target = {
    endpoint: "https://fcm.googleapis.com/fcm/send/perangkat-1",
    p256dh: base64UrlEncode(new Uint8Array((await crypto.subtle.exportKey("raw", ua.publicKey)) as ArrayBuffer)),
    auth: base64UrlEncode(crypto.getRandomValues(new Uint8Array(16))),
  }
  const uaD = ((await crypto.subtle.exportKey("jwk", ua.privateKey)) as JsonWebKey).d!
  let seen: { url: string; init: RequestInit } | null = null
  const reply = (status: number): typeof fetch => async (url, init) => {
    seen = { url: String(url), init: init! }
    return new Response(null, { status })
  }
  const payload = new TextEncoder().encode('{"title":"Uji"}')

  assert.deepEqual(await sendWebPush(target, payload, keys, 1_793_000_000, reply(201)), { kind: "sent" })
  const sent = seen as unknown as { url: string; init: RequestInit }
  assert.equal(sent.url, target.endpoint)
  assert.equal(sent.init.method, "POST")
  assert.equal(sent.init.redirect, "manual")
  const headers = sent.init.headers as Record<string, string>
  assert.equal(headers["Content-Encoding"], "aes128gcm")
  assert.equal(headers.TTL, "86400")
  assert.match(headers.Authorization, /^vapid t=.+, k=/)
  const opened = await decryptAsUserAgent(sent.init.body as Uint8Array, uaD, target.p256dh, target.auth)
  assert.equal(opened.text, '{"title":"Uji"}')

  assert.deepEqual(await sendWebPush(target, payload, keys, 0, reply(202)), { kind: "sent" })
  assert.deepEqual(await sendWebPush(target, payload, keys, 0, reply(410)), { kind: "gone", status: 410 })
  assert.deepEqual(await sendWebPush(target, payload, keys, 0, reply(404)), { kind: "gone", status: 404 })
  assert.deepEqual(await sendWebPush(target, payload, keys, 0, reply(429)), { kind: "failed", status: 429 })
  assert.deepEqual(await sendWebPush(target, payload, keys, 0, reply(301)), { kind: "failed", status: 301 })
  const putus: typeof fetch = async () => {
    throw new TypeError("network")
  }
  assert.deepEqual(await sendWebPush(target, payload, keys, 0, putus), { kind: "failed", status: null })
  assert.deepEqual(
    await sendWebPush({ ...target, p256dh: "rusak" }, payload, keys, 0, reply(201)),
    { kind: "gone", status: 0 },
    "kunci perangkat rusak: langganan dibuang tanpa mengirim",
  )
  pass("sendWebPush: header aes128gcm/TTL/VAPID, body terbuka, 201/202 terkirim, 404/410 dibuang, lainnya gagal")
}

console.log("\nSemua Web Push tests: PASS ✓\n")
