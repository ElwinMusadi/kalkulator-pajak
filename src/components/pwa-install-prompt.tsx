import { useEffect, useState } from "react"
import { Download, Share, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

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

interface PwaInstallState {
  installEvent: BeforeInstallPromptEvent | null
  showIosHelp: boolean
  dismissed: boolean
}

function usePwaInstallState(): PwaInstallState & {
  dismiss: () => void
  install: () => Promise<void>
} {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [showIosHelp, setShowIosHelp] = useState(false)
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem("pwa-install-dismissed") === "1"
  )

  useEffect(() => {
    if (isStandalone() || dismissed) return
    setShowIosHelp(isIosDevice())

    const onPrompt = (event: Event) => {
      event.preventDefault()
      setInstallEvent(event as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstallEvent(null)
      setShowIosHelp(false)
    }

    window.addEventListener("beforeinstallprompt", onPrompt)
    window.addEventListener("appinstalled", onInstalled)
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt)
      window.removeEventListener("appinstalled", onInstalled)
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

  return { installEvent, showIosHelp, dismissed, dismiss, install }
}

/** Tombol kecil di header — ditampilkan hanya pada desktop (lg+). */
export function PwaInstallButton() {
  const { installEvent, showIosHelp, dismissed, dismiss, install } = usePwaInstallState()

  if (dismissed || (!installEvent && !showIosHelp)) return null

  if (showIosHelp) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="sm" onClick={dismiss} aria-label="Petunjuk instalasi iOS">
            Instal
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[220px]">
          Di Safari, tekan Bagikan lalu "Tambahkan ke Layar Utama".
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => void install()}
      aria-label="Instal aplikasi"
    >
      Instal
    </Button>
  )
}

/** Card prompt penuh — ditampilkan hanya pada mobile (hidden lg:hidden). */
export function PwaInstallPrompt() {
  const { installEvent, showIosHelp, dismissed, dismiss, install } = usePwaInstallState()

  if (dismissed || (!installEvent && !showIosHelp)) return null

  return (
    <Card className="border-primary/20 bg-card lg:hidden">
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
              Di Safari, tekan tombol Bagikan lalu pilih "Tambahkan ke Layar Utama".
            </p>
          ) : (
            <>
              <p className="mt-1 text-xs text-muted-foreground">
                Pasang aplikasi agar dapat dibuka dari layar utama dan digunakan secara offline.
              </p>
              <Button type="button" size="sm" className="mt-3" onClick={() => void install()}>
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
