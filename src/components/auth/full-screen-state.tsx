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
 * Layar status penuh setinggi viewport (loading sesi, offline, gagal bootstrap).
 * Tidak dapat di-scroll dan tetap muat pada layar pendek.
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
      className="viewport-screen app-background z-[60] flex items-center justify-center px-6 py-6"
      role={role}
      aria-live={role === "alert" ? "assertive" : "polite"}
      aria-busy={busy || undefined}
    >
      <div className="surface-card flex w-full max-w-sm flex-col items-center gap-5 px-6 py-8 text-center shadow-float short:gap-3 short:py-5">
        <img
          src="/logo-ntt.png"
          alt="Lambang Provinsi Nusa Tenggara Timur"
          width={61}
          height={64}
          className="h-12 w-auto short:h-9 xshort:hidden"
        />
        <div className="gold-rule w-16 short:hidden" aria-hidden="true" />
        <span
          className={cn(
            "flex size-12 items-center justify-center rounded-full border [&_svg]:size-5",
            tone === "warning"
              ? "border-warning/30 bg-warning/10 text-warning"
              : "step-badge",
          )}
          aria-hidden="true"
        >
          {icon}
        </span>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-lg font-semibold tracking-tight text-foreground short:text-base">
            {title}
          </h1>
          <div className="text-sm leading-relaxed text-muted-foreground">
            {description}
          </div>
        </div>
        {action}
      </div>
    </div>
  )
}
