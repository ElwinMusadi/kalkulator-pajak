import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { VitePWA } from "vite-plugin-pwa"

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
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
        navigateFallback: "/index.html",
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest}"],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api/njkb/"),
            handler: "NetworkFirst",
            options: {
              cacheName: "vehicle-lookup-cache",
              networkTimeoutSeconds: 5,
              cacheableResponse: {
                statuses: [200],
              },
              expiration: {
                maxEntries: 300,
                maxAgeSeconds: 7 * 24 * 60 * 60,
                purgeOnQuotaError: true,
              },
            },
          },
          {
            urlPattern: ({ request }) => request.destination === "image",
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
