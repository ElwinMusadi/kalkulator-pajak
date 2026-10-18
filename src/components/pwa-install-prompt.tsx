import { useState, type ReactNode } from "react"
import { Download, EllipsisVertical, Menu, Share, SquarePlus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { usePwaInstall } from "@/hooks/use-pwa-install"
import type { InstallPlatform } from "@/lib/pwa-install"
import { cn } from "@/lib/utils"

const DISMISS_KEY = "pwa-install-dismissed"

interface InstallGuide {
  title: string
  steps: ReactNode[]
  note?: string
}

/** Petunjuk manual saat browser tidak menyediakan dialog instalasi otomatis. */
const GUIDES: Record<InstallPlatform, InstallGuide> = {
  "ios-safari": {
    title: "Safari di iPhone/iPad",
    steps: [
      <>Tekan tombol <Kbd icon={<Share />}>Bagikan</Kbd> di bilah bawah (iPad: kanan atas).</>,
      <>Gulir ke bawah, lalu pilih <Kbd icon={<SquarePlus />}>Tambahkan ke Layar Utama</Kbd>.</>,
      <>Tekan <Kbd>Tambah</Kbd> di pojok kanan atas.</>,
    ],
  },
  "ios-other": {
    title: "Browser di iPhone/iPad",
    steps: [
      <>Tekan tombol <Kbd icon={<Share />}>Bagikan</Kbd> di bilah alamat.</>,
      <>Pilih <Kbd icon={<SquarePlus />}>Tambahkan ke Layar Utama</Kbd>, lalu tekan <Kbd>Tambah</Kbd>.</>,
    ],
    note: "Bila pilihan tersebut tidak muncul, buka halaman ini di Safari lalu ulangi langkahnya.",
  },
  "android-chromium": {
    title: "Chrome di Android",
    steps: [
      <>Tekan <Kbd icon={<EllipsisVertical />}>Menu</Kbd> di kanan atas.</>,
      <>Pilih <Kbd>Instal aplikasi</Kbd> atau <Kbd>Tambahkan ke layar utama</Kbd>.</>,
      <>Konfirmasi dengan menekan <Kbd>Instal</Kbd>.</>,
    ],
  },
  "android-samsung": {
    title: "Samsung Internet",
    steps: [
      <>Tekan <Kbd icon={<Menu />}>Menu</Kbd> di kanan bawah.</>,
      <>Pilih <Kbd>Tambahkan halaman ke</Kbd>, lalu <Kbd>Layar Utama</Kbd>.</>,
    ],
  },
  "android-firefox": {
    title: "Firefox di Android",
    steps: [
      <>Tekan <Kbd icon={<EllipsisVertical />}>Menu</Kbd>.</>,
      <>Pilih <Kbd>Instal</Kbd> atau <Kbd>Tambahkan ke layar utama</Kbd>.</>,
    ],
  },
  "desktop-chromium": {
    title: "Chrome / Edge di komputer",
    steps: [
      <>Klik ikon <Kbd icon={<Download />}>Instal</Kbd> di ujung kanan bilah alamat.</>,
      <>Atau buka <Kbd icon={<EllipsisVertical />}>Menu</Kbd>, pilih <Kbd>Simpan dan bagikan</Kbd>, lalu <Kbd>Instal halaman sebagai aplikasi</Kbd>.</>,
    ],
  },
  "desktop-safari": {
    title: "Safari di Mac",
    steps: [<>Buka menu <Kbd>File</Kbd>, lalu pilih <Kbd>Tambahkan ke Dock</Kbd>.</>],
    note: "Memerlukan macOS Sonoma atau lebih baru.",
  },
  "desktop-firefox": {
    title: "Firefox di komputer",
    steps: [<>Buka halaman ini di <Kbd>Google Chrome</Kbd> atau <Kbd>Microsoft Edge</Kbd>, lalu tekan tombol Instal Aplikasi.</>],
    note: "Firefox desktop belum mendukung instalasi aplikasi web.",
  },
  other: {
    title: "Browser Anda",
    steps: [
      <>Buka menu browser.</>,
      <>Pilih <Kbd>Instal aplikasi</Kbd> atau <Kbd>Tambahkan ke layar utama</Kbd>.</>,
    ],
    note: "Bila pilihan tersebut tidak tersedia, gunakan Chrome (Android/komputer) atau Safari (iPhone/iPad).",
  },
}

function Kbd({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border bg-muted px-1.5 py-px align-baseline text-[0.8125rem] font-medium text-foreground [&_svg]:size-3.5 [&_svg]:shrink-0">
      {icon}
      {children}
    </span>
  )
}

function InstallGuideDialog({
  open,
  onOpenChange,
  platform,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  platform: InstallPlatform
}) {
  const guide = GUIDES[platform]
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-md overflow-y-auto rounded-[1.25rem]">
        <DialogHeader className="text-left">
          <DialogTitle>Instal Kalkulator Pajak</DialogTitle>
          <DialogDescription>
            Pasang aplikasi agar dapat dibuka langsung dari layar utama, tanpa
            mengetik alamat. Koneksi internet tetap diperlukan.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <p className="text-[0.9375rem] font-semibold text-foreground">{guide.title}</p>
          <ol className="flex flex-col gap-2.5">
            {guide.steps.map((step, index) => (
              <li key={index} className="flex items-start gap-3 text-[0.9375rem] leading-relaxed">
                <span
                  className="numeric mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <span className="min-w-0">{step}</span>
              </li>
            ))}
          </ol>
          {guide.note && (
            <p className="info-subtle rounded-lg border px-3 py-2 text-xs leading-relaxed text-foreground">
              {guide.note}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            className="h-11 rounded-full px-6 font-semibold"
            onClick={() => onOpenChange(false)}
          >
            Mengerti
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Logika tombol instal bersama: dialog native bila tersedia (Chrome/Edge/
 * Samsung), selain itu petunjuk manual sesuai browser (Safari iOS, dsb.).
 */
function useInstallAction() {
  const { installed, canPrompt, platform, promptInstall } = usePwaInstall()
  const [guideOpen, setGuideOpen] = useState(false)

  async function start() {
    if (canPrompt) {
      const outcome = await promptInstall()
      if (outcome !== "unavailable") return
    }
    setGuideOpen(true)
  }

  const dialog = (
    <InstallGuideDialog open={guideOpen} onOpenChange={setGuideOpen} platform={platform} />
  )

  return { visible: !installed, start, dialog }
}

/**
 * Tombol "Instal" di header band navy; tampil selama belum terpasang.
 * Ikon + label di ≥sm, ikon saja (dengan aria-label dan tooltip) di layar sempit.
 */
export function PwaInstallButton({ className }: { className?: string }) {
  const { visible, start, dialog } = useInstallAction()
  if (!visible) return null

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            onClick={() => void start()}
            aria-label="Instal aplikasi"
            className={cn(
              "size-11 rounded-full px-0 text-primary hover:bg-primary/10 hover:text-primary sm:w-auto sm:px-4 [&_svg]:stroke-[1.75]",
              className,
            )}
          >
            <Download aria-hidden="true" />
            <span className="hidden sm:inline">Instal</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Instal aplikasi di perangkat ini</TooltipContent>
      </Tooltip>
      {dialog}
    </>
  )
}

/** Tautan instal ringkas untuk halaman login (ruang terbatas, tanpa scroll). */
export function PwaInstallLink({ className }: { className?: string }) {
  const { visible, start, dialog } = useInstallAction()
  if (!visible) return null

  return (
    <>
      <button
        type="button"
        onClick={() => void start()}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-3.5",
          className,
        )}
      >
        <Download aria-hidden="true" />
        Instal aplikasi di perangkat ini
      </button>
      {dialog}
    </>
  )
}

/** Kartu ajakan instal pada mobile; dapat ditutup untuk sesi browser ini. */
export function PwaInstallPrompt() {
  const { visible, start, dialog } = useInstallAction()
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === "1"
    } catch {
      return false
    }
  })

  function dismiss() {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1")
    } catch {
      // Abaikan: penutupan tetap berlaku sampai halaman dimuat ulang.
    }
    setDismissed(true)
  }

  if (!visible || dismissed) return null

  return (
    <>
      <div className="flex items-start gap-3 rounded-[1.25rem] border border-border/70 bg-card p-4 lg:hidden">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Download className="size-[1.125rem] stroke-[1.75]" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.9375rem] font-semibold text-foreground">
            Instal Kalkulator Pajak
          </p>
          <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
            Pasang aplikasi agar dapat dibuka langsung dari layar utama. Koneksi
            internet tetap diperlukan.
          </p>
          <Button
            type="button"
            className="mt-3 h-11 rounded-full px-5 font-semibold [&_svg]:stroke-[1.75]"
            onClick={() => void start()}
          >
            <Download aria-hidden="true" />
            Instal Aplikasi
          </Button>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="-mr-2 -mt-2 size-11 shrink-0 rounded-full text-muted-foreground"
          aria-label="Tutup ajakan instalasi"
          onClick={dismiss}
        >
          <X aria-hidden="true" />
        </Button>
      </div>
      {dialog}
    </>
  )
}
