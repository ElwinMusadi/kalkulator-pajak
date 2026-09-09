import { useEffect, useState } from "react"
import { Download, Share, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  )
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

export function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [showIosHelp, setShowIosHelp] = useState(false)
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem("pwa-install-dismissed") === "1"
  )

  useEffect(() => {
    if (isStandalone() || dismissed) return

    setShowIosHelp(isIosDevice())

    const handleInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallEvent(event as BeforeInstallPromptEvent)
    }
    const handleInstalled = () => {
      setInstallEvent(null)
      setShowIosHelp(false)
    }

    window.addEventListener("beforeinstallprompt", handleInstallPrompt)
    window.addEventListener("appinstalled", handleInstalled)

    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt)
      window.removeEventListener("appinstalled", handleInstalled)
    }
  }, [dismissed])

  function dismiss() {
    sessionStorage.setItem("pwa-install-dismissed", "1")
    setDismissed(true)
  }

  async function install() {
    if (!installEvent) return
    await installEvent.prompt()
    const choice = await installEvent.userChoice
    if (choice.outcome === "accepted") setInstallEvent(null)
  }

  if (dismissed || (!installEvent && !showIosHelp)) return null

  return (
    <Card className="mb-6 border-primary/20 bg-card">
      <CardContent className="flex items-start gap-3 p-4">
        {showIosHelp ? (
          <Share className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        ) : (
          <Download className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Instal Kalkulator Pajak</p>
          {showIosHelp ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Di Safari, tekan tombol Bagikan lalu pilih “Tambahkan ke Layar Utama”.
            </p>
          ) : (
            <>
              <p className="mt-1 text-xs text-muted-foreground">
                Pasang aplikasi agar dapat dibuka dari layar utama dan digunakan secara offline.
              </p>
              <Button type="button" size="sm" className="mt-3" onClick={() => void install()}>
                <Download data-icon="inline-start" aria-hidden="true" />
                Instal Aplikasi
              </Button>
            </>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Tutup petunjuk instalasi"
          onClick={dismiss}
        >
          <X aria-hidden="true" />
        </Button>
      </CardContent>
    </Card>
  )
}
