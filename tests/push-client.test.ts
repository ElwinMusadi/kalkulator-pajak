/**
 * Logika notifikasi di peramban: dukungan Web Push per perangkat, decode
 * kunci VAPID, dan penanda pengumuman belum dibaca.
 */

import assert from "node:assert/strict"
import {
  base64UrlToBytes,
  detectPushAvailability,
  hasUnread,
  type PushEnvironment,
} from "../src/lib/push.ts"

function pass(name: string) {
  console.log(`  ✓  ${name}`)
}

const UA = {
  android: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36",
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1",
  ipadOs: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  windowsEdge:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0",
}

function full(overrides: Partial<PushEnvironment>): PushEnvironment {
  return {
    userAgent: UA.android,
    maxTouchPoints: 5,
    platform: "Linux armv8l",
    standalone: false,
    hasServiceWorker: true,
    hasPushManager: true,
    hasNotification: true,
    ...overrides,
  }
}

// 1. Dukungan per perangkat
{
  assert.equal(detectPushAvailability(full({})), "supported", "Android Chrome di peramban")
  assert.equal(detectPushAvailability(full({ standalone: true })), "supported", "Android terpasang")
  assert.equal(
    detectPushAvailability(full({ userAgent: UA.windowsEdge, maxTouchPoints: 0, platform: "Win32" })),
    "supported",
    "Edge desktop",
  )
  assert.equal(
    detectPushAvailability(full({ userAgent: UA.iphoneSafari, platform: "iPhone", hasPushManager: false })),
    "ios-needs-install",
    "iPhone Safari belum di Layar Utama",
  )
  assert.equal(
    detectPushAvailability(full({ userAgent: UA.iphoneChrome, platform: "iPhone" })),
    "ios-other-browser",
    "iPhone Chrome",
  )
  assert.equal(
    detectPushAvailability(full({ userAgent: UA.iphoneSafari, platform: "iPhone", standalone: true })),
    "supported",
    "iPhone terpasang iOS 16.4+",
  )
  assert.equal(
    detectPushAvailability(full({ userAgent: UA.iphoneSafari, platform: "iPhone", standalone: true, hasPushManager: false })),
    "unsupported",
    "iPhone terpasang < iOS 16.4",
  )
  assert.equal(
    detectPushAvailability(full({ userAgent: UA.ipadOs, platform: "MacIntel", maxTouchPoints: 5 })),
    "ios-needs-install",
    "iPadOS mengaku Macintosh",
  )
  for (const missing of ["hasServiceWorker", "hasPushManager", "hasNotification"] as const) {
    assert.equal(detectPushAvailability(full({ [missing]: false })), "unsupported", missing)
  }
  pass("Dukungan: Android/desktop didukung; iPhone/iPad hanya terpasang di Layar Utama (Safari); API hilang → tidak didukung")
}

// 2. Kunci VAPID base64url → byte untuk applicationServerKey
{
  assert.deepEqual([...base64UrlToBytes("-_-_")], [0xfb, 0xff, 0xbf])
  assert.deepEqual([...base64UrlToBytes("AQ")], [1])
  assert.equal(
    base64UrlToBytes("BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4").length,
    65,
  )
  pass("base64UrlToBytes: kunci publik 65 byte")
}

// 3. Penanda belum dibaca
{
  assert.equal(hasUnread(undefined, null), false, "tanpa pengumuman")
  assert.equal(hasUnread("2026-11-04T08:00:00.000Z", null), true, "belum pernah dibuka")
  assert.equal(hasUnread("2026-11-04T08:00:00.000Z", "2026-11-04T08:00:00.000Z"), false, "sudah dibaca")
  assert.equal(hasUnread("2026-11-04T09:00:00.000Z", "2026-11-04T08:00:00.000Z"), true, "ada yang lebih baru")
  assert.equal(hasUnread("2026-11-03T09:00:00.000Z", "2026-11-04T08:00:00.000Z"), false, "lebih lama")
  pass("Belum dibaca: hanya bila pengumuman terbaru lebih baru dari yang terakhir dibuka")
}

console.log("\nSemua push client tests: PASS ✓\n")
