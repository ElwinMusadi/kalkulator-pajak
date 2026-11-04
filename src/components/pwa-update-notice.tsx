import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { LoaderCircle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { usePwaUpdate } from "@/hooks/use-pwa"
import { useOnlineStatus } from "@/hooks/use-online-status"
import {
  getUpdateNoticeCoordination,
  subscribeUpdateNoticeCoordination,
} from "@/lib/update-notice-coordination"

/** Layar pendek (ponsel landscape): kartu tampil sebagai pil dulu. */
const SHORT_VIEWPORT_QUERY = "(max-height: 500px)"

function subscribeShortViewport(onChange: () => void) {
  const query = window.matchMedia(SHORT_VIEWPORT_QUERY)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}

function getShortViewport() {
  return window.matchMedia(SHORT_VIEWPORT_QUERY).matches
}

/**
 * Pemberitahuan versi baru di halaman login dan layar pemeriksaan sesi;
 * tidak pernah memuat ulang sendiri. Setelah login, modal Info Terbaru
 * (notification-center) yang menampilkannya sebagai pembaruan wajib, jadi
 * kartu ini disembunyikan.
 *
 * - Kartu (atas) memuat peringatan reset isian + tombol "Perbarui". Tidak ada
 *   "Nanti": versi baru wajib dipasang sebelum memakai kalkulator.
 * - Di layar pendek (landscape) kartu tampil sebagai pil kecil di kiri bawah
 *   (di halaman login area itu panel merek tanpa kontrol, sehingga tombol Masuk
 *   tidak tertutup); pil membuka kartu, tidak langsung memuat ulang, sehingga
 *   peringatan selalu terlihat sebelum isian direset.
 * - z-40: di bawah overlay dialog/drawer Radix (z-50) dan layar status penuh.
 */
export function PwaUpdateNotice() {
  const { status, applyUpdate } = usePwaUpdate()
  const online = useOnlineStatus()
  const shortViewport = useSyncExternalStore(
    subscribeShortViewport,
    getShortViewport,
    () => false,
  )
  const [expanded, setExpanded] = useState(false)
  const focusApply = useRef(false)
  const applyRef = useRef<HTMLButtonElement>(null)
  const { handledByApp } = useSyncExternalStore(
    subscribeUpdateNoticeCoordination,
    getUpdateNoticeCoordination,
    getUpdateNoticeCoordination,
  )

  const applying = status === "applying"
  const collapsed = !applying && shortViewport && !expanded

  // Pindahkan fokus hanya setelah pil diketuk (bukan saat pertama tampil),
  // agar fokus keyboard tidak hilang ke <body> ketika pil berganti kartu.
  useEffect(() => {
    if (!focusApply.current || collapsed) return
    focusApply.current = false
    applyRef.current?.focus()
  }, [collapsed])

  const announcement =
    status === "available"
      ? "Versi baru tersedia. Perbarui untuk memakai versi terbaru."
      : applying
        ? "Memperbarui aplikasi…"
        : ""

  return (
    <>
      {/* Selalu terpasang agar pengumuman pembaca layar tidak terlewat; setelah
          login, modal Info Terbaru yang mengumumkannya. */}
      <div role="status" aria-live="polite" className="sr-only">
        {handledByApp ? "" : announcement}
      </div>

      {status !== "idle" &&
        !handledByApp &&
        (collapsed ? (
          <button
            type="button"
            data-pwa-update="pill"
            aria-label="Pembaruan tersedia, tampilkan detail"
            onClick={() => {
              focusApply.current = true
              setExpanded(true)
            }}
            className="fixed left-3 bottom-[calc(1.5rem+env(safe-area-inset-bottom))] z-40 inline-flex h-11 items-center gap-2 rounded-full border border-navy-600/30 bg-card pl-3 pr-4 text-[13px] font-semibold text-navy-800 shadow-float transition-colors hover:bg-navy-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <span className="flex size-6 items-center justify-center rounded-full bg-navy-50" aria-hidden="true">
              <RefreshCw className="size-3.5" />
            </span>
            Pembaruan tersedia
          </button>
        ) : (
          <section
            data-pwa-update="card"
            aria-labelledby="pwa-update-title"
            className="fixed inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-40 mx-auto max-w-sm sm:left-auto sm:right-4 sm:top-4 sm:mx-0 sm:w-96"
          >
            <div className="flex items-start gap-3 rounded-xl border border-navy-600/30 bg-card p-3 shadow-float sm:p-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-navy-50 text-navy-800">
                <RefreshCw className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="pwa-update-title" className="text-sm font-semibold text-foreground">
                  Versi Baru Tersedia
                </h2>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  Perbarui untuk memakai versi terbaru sebelum menghitung. Isian yang belum
                  disimpan akan direset.
                </p>
                <div className="mt-2.5">
                  <Button
                    ref={applyRef}
                    type="button"
                    size="sm"
                    onClick={applyUpdate}
                    disabled={applying || !online}
                    aria-busy={applying || undefined}
                  >
                    {applying ? (
                      <LoaderCircle className="animate-spin" aria-hidden="true" />
                    ) : (
                      <RefreshCw aria-hidden="true" />
                    )}
                    {applying ? "Memperbarui…" : "Perbarui"}
                  </Button>
                </div>
                {!online && !applying && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Sambungkan internet untuk memperbarui.
                  </p>
                )}
              </div>
            </div>
          </section>
        ))}
    </>
  )
}
