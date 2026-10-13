/*
 * Dimuat oleh Service Worker (workbox importScripts).
 * Versi sebelum autentikasi menyimpan respons /api/njkb/* (data pribadi) di
 * cache "vehicle-lookup-cache". Hapus cache tersebut saat worker baru aktif.
 */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.delete("vehicle-lookup-cache").catch(() => false),
  )
})
