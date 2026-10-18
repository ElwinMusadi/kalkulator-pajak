import type { FormEvent, ReactNode } from "react"
import { CircleAlert, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

interface AdminDialogProps {
  title: string
  description: ReactNode
  submitLabel: string
  submittingLabel?: string
  submitting: boolean
  error: string | null
  onSubmit: () => void
  onClose: () => void
  children?: ReactNode
  destructive?: boolean
  submitDisabled?: boolean
  className?: string
}

/**
 * Kerangka dialog form Admin: judul, isi, error server, dan tombol aksi.
 * Dialog tidak dapat ditutup selama permintaan sedang diproses.
 */
export function AdminDialog({
  title,
  description,
  submitLabel,
  submittingLabel = "Menyimpan…",
  submitting,
  error,
  onSubmit,
  onClose,
  children,
  destructive,
  submitDisabled,
  className,
}: AdminDialogProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!submitting) onSubmit()
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !submitting) onClose()
      }}
    >
      <DialogContent
        className={cn(
          "flex max-h-[calc(100dvh-2rem)] max-w-lg flex-col gap-0 overflow-hidden rounded-[1.25rem] p-0",
          className,
        )}
        onInteractOutside={(event) => {
          if (submitting) event.preventDefault()
        }}
        onEscapeKeyDown={(event) => {
          if (submitting) event.preventDefault()
        }}
      >
        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex min-h-0 flex-1 flex-col"
        >
          <DialogHeader className="shrink-0 border-b border-border/70 px-5 pt-5 pb-4 pr-14 sm:px-6">
            <DialogTitle className="text-[1.25rem] font-semibold">{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
            {children}
            <div aria-live="assertive" aria-atomic="true">
              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-sm"
                >
                  <CircleAlert
                    className="mt-0.5 size-4 shrink-0 text-destructive"
                    aria-hidden="true"
                  />
                  <p className="leading-snug text-foreground">{error}</p>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="shrink-0 gap-2 border-t border-border/70 px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-6 sm:pb-4">
            <DialogClose asChild>
              <Button
                type="button"
                variant="outline"
                disabled={submitting}
                className="h-11 rounded-full px-5 text-[0.9375rem]"
              >
                Batal
              </Button>
            </DialogClose>
            <Button
              type="submit"
              variant={destructive ? "destructive" : "default"}
              disabled={submitting || submitDisabled}
              aria-busy={submitting || undefined}
              className="h-11 rounded-full px-5 text-[0.9375rem] font-semibold"
            >
              {submitting && <Loader2 className="animate-spin" aria-hidden="true" />}
              {submitting ? submittingLabel : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
