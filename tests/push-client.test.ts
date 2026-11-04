/**
 * Logika notifikasi di peramban: dukungan Web Push per perangkat, decode
 * kunci VAPID, penanda pengumuman belum dibaca, dan modal pembuka.
 */

import assert from "node:assert/strict"
import {
  base64UrlToBytes,
  detectPushAvailability,
  hasUnread,
  NOTIFICATION_PROMPT_SNOOZE_MS,
  notificationPromptKind,
  readPromptSnoozedUntil,
  shouldShowOpeningModal,
  snoozeNotificationPrompt,
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

// 4. Ajakan notifikasi pada modal pembuka
{
  const base = {
    serverEnabled: true,
    availability: "supported" as const,
    permission: "default" as NotificationPermission,
    deviceActive: false,
    snoozedUntil: 0,
    nowMs: 1_000_000,
  }
  assert.equal(notificationPromptKind(base), "enable", "izin belum pernah diminta")
  assert.equal(notificationPromptKind({ ...base, serverEnabled: false }), null, "server belum siap push")
  assert.equal(notificationPromptKind({ ...base, deviceActive: true }), null, "sudah aktif")
  assert.equal(notificationPromptKind({ ...base, permission: "denied" }), null, "diblokir: tidak bisa diminta ulang")
  assert.equal(notificationPromptKind({ ...base, permission: "granted" }), null, "izin ada, langganan disinkronkan diam-diam")
  assert.equal(notificationPromptKind({ ...base, snoozedUntil: base.nowMs + 1 }), null, "masih ditunda")
  assert.equal(notificationPromptKind({ ...base, snoozedUntil: base.nowMs }), "enable", "masa tunda habis")
  assert.equal(
    notificationPromptKind({ ...base, availability: "ios-needs-install", permission: null }),
    "ios-install",
    "iPhone di Safari: petunjuk Layar Utama",
  )
  assert.equal(notificationPromptKind({ ...base, availability: "ios-other-browser" }), null, "iPhone di Chrome")
  assert.equal(notificationPromptKind({ ...base, availability: "unsupported" }), null, "tidak didukung")
  pass("Ajakan notifikasi: hanya bila server siap, perangkat belum aktif, izin belum diminta, dan tidak ditunda")
}

// 5. Modal Info Terbaru dibuka untuk pengumuman atau ajakan (versi baru selalu tampil sendiri)
{
  const none = { unreadCount: 0, prompt: null }
  assert.equal(shouldShowOpeningModal(none), false, "tidak ada apa-apa")
  assert.equal(shouldShowOpeningModal({ ...none, unreadCount: 1 }), true, "pengumuman belum dibaca")
  assert.equal(shouldShowOpeningModal({ ...none, unreadCount: 2 }), true, "beberapa pengumuman")
  assert.equal(shouldShowOpeningModal({ ...none, prompt: "enable" }), true, "ajakan notifikasi")
  assert.equal(shouldShowOpeningModal({ ...none, prompt: "ios-install" }), true, "petunjuk iPhone")
  pass("Modal Info Terbaru: dibuka untuk pengumuman belum dibaca atau ajakan notifikasi")
}

// 6. Penundaan ajakan tersimpan di localStorage; tanpa penyimpanan tidak error
{
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage")
  const store = new Map<string, string>()
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    },
  })
  assert.equal(readPromptSnoozedUntil(), 0, "belum pernah ditunda")
  const until = snoozeNotificationPrompt(5_000)
  assert.equal(until, 5_000 + NOTIFICATION_PROMPT_SNOOZE_MS)
  assert.equal(readPromptSnoozedUntil(), until, "tersimpan")
  assert.equal(NOTIFICATION_PROMPT_SNOOZE_MS, 3 * 24 * 60 * 60 * 1000, "tiga hari")
  store.set("kp:ajakan-notifikasi-sampai", "bukan-angka")
  assert.equal(readPromptSnoozedUntil(), 0, "nilai rusak dianggap tidak ditunda")

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw new Error("SecurityError")
    },
  })
  assert.equal(readPromptSnoozedUntil(), 0, "penyimpanan diblokir")
  assert.equal(snoozeNotificationPrompt(0), NOTIFICATION_PROMPT_SNOOZE_MS, "tetap mengembalikan batas")

  if (original) Object.defineProperty(globalThis, "localStorage", original)
  else Reflect.deleteProperty(globalThis, "localStorage")
  pass("Penundaan ajakan: tiga hari, tersimpan lokal, aman tanpa penyimpanan")
}

console.log("\nSemua push client tests: PASS ✓\n")
