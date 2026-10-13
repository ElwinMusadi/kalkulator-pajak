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
          "flex max-h-[calc(100dvh-2rem)] max-w-lg flex-col gap-0 p-0",
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
          <DialogHeader className="shrink-0 border-b px-6 pt-6 pb-4 pr-12">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">
            {children}
            <div aria-live="assertive" aria-atomic="true">
              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm"
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

          <DialogFooter className="shrink-0 border-t px-6 py-4">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={submitting}>
                Batal
              </Button>
            </DialogClose>
            <Button
              type="submit"
              variant={destructive ? "destructive" : "default"}
              disabled={submitting || submitDisabled}
              aria-busy={submitting || undefined}
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
