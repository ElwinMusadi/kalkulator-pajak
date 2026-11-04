/*
 * Dimuat oleh Service Worker (workbox importScripts), seperti sw-cleanup.js.
 *
 * Menampilkan pengumuman Admin yang dikirim lewat Web Push
 * (server/push/store.ts → payload PushPayload) dan membuka/memfokuskan
 * aplikasi saat notifikasi diklik. Isi notifikasi hanya pengumuman umum,
 * tidak pernah data kendaraan atau wajib pajak.
 */

const PUSH_DEFAULT_TITLE = "Kalkulator Pajak Kendaraan"
const PUSH_ICON = "/icons/pwa-192x192.png"

function readPushPayload(event) {
  if (!event.data) return {}
  try {
    const data = event.data.json()
    return data && typeof data === "object" ? data : {}
  } catch {
    return { body: event.data.text() }
  }
}

self.addEventListener("push", (event) => {
  const data = readPushPayload(event)
  const title = typeof data.title === "string" && data.title.trim() ? data.title : PUSH_DEFAULT_TITLE
  const url = typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/?pengumuman=1"
  const options = {
    body: typeof data.body === "string" ? data.body : "",
    icon: PUSH_ICON,
    lang: "id",
    data: { url },
  }
  if (typeof data.tag === "string" && data.tag) options.tag = data.tag

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, options)
      // Aplikasi yang sedang terbuka memuat ulang daftar pengumuman.
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
      for (const client of windows) client.postMessage({ type: "kp:pengumuman-baru" })
    })(),
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || "/?pengumuman=1", self.location.origin)

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
      const existing = windows.find((client) => new URL(client.url).origin === self.location.origin)
      if (existing) {
        await existing.focus()
        existing.postMessage({ type: "kp:buka-pengumuman" })
        return
      }
      await self.clients.openWindow(target.href)
    })(),
  )
})
