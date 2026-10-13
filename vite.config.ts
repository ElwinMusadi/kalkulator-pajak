import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { VitePWA } from "vite-plugin-pwa"

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // autoUpdate + skipWaiting/clientsClaim: perangkat dengan versi lama
      // (tanpa login) langsung beralih ke versi baru tanpa menunggu prompt.
      registerType: "autoUpdate",
      injectRegister: false,
      includeAssets: [
        "favicon.svg",
        "logo-ntt.png",
        "icons/apple-touch-icon-180x180.png",
      ],
      manifest: {
        id: "/",
        name: "Kalkulator Pajak Kendaraan NTT",
        short_name: "Kalkulator Pajak",
        description:
          "Kalkulator PKB dan Opsen berdasarkan Pergub NTT No. 54 Tahun 2026.",
        lang: "id-ID",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "any",
        background_color: "#ffffff",
        theme_color: "#171717",
        categories: ["finance", "utilities", "government"],
        icons: [
          {
            src: "/icons/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/pwa-maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        // Menghapus cache lookup kendaraan versi lama saat worker aktif.
        importScripts: ["/sw-cleanup.js"],
        // sw-cleanup.js harus selalu diambil dari jaringan, bukan precache.
        globIgnores: ["**/node_modules/**/*", "sw-cleanup.js"],
        navigateFallback: "/index.html",
        // Endpoint /api selalu langsung ke jaringan: data sesi, user, dan
        // kendaraan tidak boleh disimpan di cache Service Worker.
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest}"],
        runtimeCaching: [
          {
            urlPattern: ({ request, url }) =>
              request.destination === "image" &&
              !url.pathname.startsWith("/api/"),
            handler: "CacheFirst",
            options: {
              cacheName: "image-cache",
              cacheableResponse: {
                statuses: [0, 200],
              },
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 30 * 24 * 60 * 60,
                purgeOnQuotaError: true,
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
})
