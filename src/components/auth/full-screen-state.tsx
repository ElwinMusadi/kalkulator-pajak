import type { ReactNode } from "react"
import { useLockDocumentScroll } from "@/hooks/use-lock-document-scroll"
import { cn } from "@/lib/utils"

interface FullScreenStateProps {
  icon: ReactNode
  title: string
  description: ReactNode
  action?: ReactNode
  /** `status` untuk informasi yang diumumkan sopan; `alert` untuk pemblokiran. */
  role?: "status" | "alert"
  busy?: boolean
  tone?: "default" | "warning"
}

/**
 * Layar status penuh setinggi viewport (loading sesi, offline, gagal bootstrap)
 * di atas latar grouped solid. Dokumen tidak di-scroll; kontainer hanya
 * mengizinkan scroll vertikal bila zoom/teks besar membuat isi tidak muat.
 */
export function FullScreenState({
  icon,
  title,
  description,
  action,
  role = "status",
  busy,
  tone = "default",
}: FullScreenStateProps) {
  useLockDocumentScroll()

  return (
    <div
      className="viewport-screen-scroll app-background z-[60]"
      role={role}
      aria-live={role === "alert" ? "assertive" : "polite"}
      aria-busy={busy || undefined}
    >
      <div className="viewport-screen-inner">
        <div className="m-auto flex w-full max-w-sm flex-col items-center gap-5 text-center short:gap-3">
          <img
            src="/logo-ntt.png"
            alt="Lambang Provinsi Nusa Tenggara Timur"
            width={61}
            height={64}
            className="h-12 w-auto short:h-9 xshort:hidden"
          />
          <div className="ios-group flex w-full flex-col items-center gap-4 px-6 py-7 short:gap-3 short:py-5">
            <span
              className={cn(
                "flex size-12 items-center justify-center rounded-full [&_svg]:size-5",
                tone === "warning"
                  ? "bg-warning/12 text-warning"
                  : "bg-accent text-accent-foreground",
              )}
              aria-hidden="true"
            >
              {icon}
            </span>
            <div className="flex flex-col gap-1.5">
              <h1 className="text-[1.1875rem] font-semibold leading-snug tracking-tight text-foreground">
                {title}
              </h1>
              <div className="text-[0.9375rem] leading-relaxed text-muted-foreground">
                {description}
              </div>
            </div>
            {action}
          </div>
        </div>
      </div>
    </div>
  )
}
