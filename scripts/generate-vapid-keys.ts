/**
 * scripts/generate-vapid-keys.ts — membuat sepasang kunci VAPID untuk Web Push.
 *
 *   npm run vapid:generate
 *
 * Hasilnya dipasang sebagai env Cloudflare Pages (production):
 *   VAPID_PUBLIC_KEY   (boleh terlihat; dikirim ke peramban)
 *   VAPID_PRIVATE_KEY  (SECRET: `npx wrangler pages secret put VAPID_PRIVATE_KEY`)
 *   VAPID_SUBJECT      (URL https aplikasi atau mailto: kontak pengelola)
 *
 * Untuk lokal, salin ketiganya ke `.dev.vars` (diabaikan git). Jangan
 * mengganti pasangan kunci produksi tanpa alasan: semua perangkat harus
 * mengaktifkan notifikasi ulang setelah kunci berganti.
 */

import { base64UrlEncode } from "../server/push/web-push.ts"

const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
  "sign",
  "verify",
])) as CryptoKeyPair
const publicKey = base64UrlEncode(new Uint8Array((await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer))
const privateKey = ((await crypto.subtle.exportKey("jwk", pair.privateKey)) as JsonWebKey).d

console.log(`VAPID_PUBLIC_KEY=${publicKey}`)
console.log(`VAPID_PRIVATE_KEY=${privateKey}`)
console.log("VAPID_SUBJECT=https://kalkulator.uptdpenda-kupang.web.id")
