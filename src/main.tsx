import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import App from "./App.tsx"
import { registerPwa } from "./hooks/use-pwa"

// Versi sebelumnya menyimpan respons /api/njkb (berisi data pribadi) di cache
// Service Worker. Pengaman tambahan di samping sw-cleanup.js; best-effort.
if (typeof window !== "undefined" && "caches" in window) {
  void window.caches.delete("vehicle-lookup-cache").catch(() => undefined)
}

registerPwa()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
