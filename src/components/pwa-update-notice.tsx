import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { LoaderCircle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { usePwaUpdate } from "@/hooks/use-pwa"
import { useOnlineStatus } from "@/hooks/use-online-status"

/** Layar pendek (ponsel landscape): kartu langsung diringkas menjadi pil. */
const SHORT_VIEWPORT_QUERY = "(max-height: 500px)"

function subscribeShortViewport(onChange: () => void) {
  const query = window.matchMedia(SHORT_VIEWPORT_QUERY)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}

function getShortViewport() {
  return window.matchMedia(SHORT_VIEWPORT_QUERY).matches
}

type DisplayMode = "auto" | "expanded" | "collapsed"

/**
 * Pemberitahuan versi baru. Tampil di halaman login maupun aplikasi setelah
 * worker baru mengambil alih; tidak pernah memuat ulang sendiri.
 *
 * - Kartu (atas) memuat peringatan reset isian + tombol "Perbarui"/"Nanti".
 * - "Nanti" meringkasnya menjadi pil kecil di kanan bawah (di atas bilah hasil
 *   mobile) agar tidak menutupi header; pil membuka kartu lagi, tidak langsung
 *   memuat ulang, sehingga peringatan selalu terlihat sebelum isian direset.
 *   Di layar pendek (landscape) pil pindah ke kiri bawah: di halaman login
 *   area itu panel merek tanpa kontrol, sehingga tombol Masuk tidak tertutup.
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
  const [mode, setMode] = useState<DisplayMode>("auto")
  const focusTarget = useRef<"pill" | "apply" | null>(null)
  const pillRef = useRef<HTMLButtonElement>(null)
  const applyRef = useRef<HTMLButtonElement>(null)

  const applying = status === "applying"
  const collapsed =
    !applying && (mode === "collapsed" || (mode === "auto" && shortViewport))

  // Pindahkan fokus hanya setelah aksi pengguna (bukan saat pertama tampil),
  // agar fokus keyboard tidak hilang ke <body> ketika kartu/pil bertukar.
  useEffect(() => {
    const target = focusTarget.current
    focusTarget.current = null
    if (target === "pill") pillRef.current?.focus()
    if (target === "apply") applyRef.current?.focus()
  }, [collapsed])

  const announcement =
    status === "available"
      ? "Versi baru tersedia. Perbarui untuk memakai versi terbaru."
      : applying
        ? "Memperbarui aplikasi…"
        : ""

  return (
    <>
      {/* Selalu terpasang agar pengumuman pembaca layar tidak terlewat. */}
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>

      {status !== "idle" &&
        (collapsed ? (
          <button
            ref={pillRef}
            type="button"
            data-pwa-update="pill"
            aria-label="Pembaruan tersedia, tampilkan detail"
            onClick={() => {
              focusTarget.current = "apply"
              setMode("expanded")
            }}
            className="fixed right-3 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-40 inline-flex h-11 items-center gap-2 rounded-full border border-border/70 bg-card pl-2 pr-4 text-sm font-semibold text-primary shadow-float transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:right-4 lg:bottom-6 xshort:left-3 xshort:right-auto"
          >
            <span className="flex size-7 items-center justify-center rounded-full bg-primary/10" aria-hidden="true">
              <RefreshCw className="size-3.5 stroke-[1.75]" />
            </span>
            Pembaruan tersedia
          </button>
        ) : (
          <section
            data-pwa-update="card"
            aria-labelledby="pwa-update-title"
            className="fixed inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-40 mx-auto max-w-sm sm:left-auto sm:right-4 sm:top-4 sm:mx-0 sm:w-96"
          >
            <div className="flex items-start gap-3 rounded-[1.25rem] border border-border/70 bg-card p-3.5 shadow-float sm:p-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-[0.625rem] bg-primary/10 text-primary">
                <RefreshCw className="size-[1.125rem] stroke-[1.75]" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="pwa-update-title" className="text-[0.9375rem] font-semibold text-foreground">
                  Versi Baru Tersedia
                </h2>
                <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                  Perbarui untuk memakai versi terbaru. Isian yang belum disimpan
                  akan direset.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    ref={applyRef}
                    type="button"
                    onClick={applyUpdate}
                    disabled={applying || !online}
                    aria-busy={applying || undefined}
                    className="h-11 rounded-full px-5 font-semibold"
                  >
                    {applying ? (
                      <LoaderCircle className="animate-spin" aria-hidden="true" />
                    ) : (
                      <RefreshCw aria-hidden="true" />
                    )}
                    {applying ? "Memperbarui…" : "Perbarui"}
                  </Button>
                  {!applying && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-11 rounded-full px-5 text-primary hover:bg-primary/10 hover:text-primary"
                      onClick={() => {
                        focusTarget.current = "pill"
                        setMode("collapsed")
                      }}
                    >
                      Nanti
                    </Button>
                  )}
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
