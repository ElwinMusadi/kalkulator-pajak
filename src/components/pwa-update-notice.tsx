import { RefreshCw, WifiOff, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { usePwa } from "@/hooks/use-pwa"

export function PwaUpdateNotice() {
  const { offlineReady, needRefresh, updateServiceWorker, closeNotice } = usePwa()

  if (!offlineReady && !needRefresh) return null

  return (
    <Card className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md shadow-lg">
      <CardContent className="flex items-start gap-3 p-4">
        {needRefresh ? (
          <RefreshCw className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        ) : (
          <WifiOff className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {needRefresh ? "Versi baru tersedia" : "Aplikasi siap digunakan offline"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {needRefresh
              ? "Perbarui untuk menggunakan versi terbaru kalkulator."
              : "Kalkulasi manual tetap dapat digunakan tanpa koneksi internet."}
          </p>
          {needRefresh && (
            <Button
              type="button"
              size="sm"
              className="mt-3"
              onClick={() => void updateServiceWorker(true)}
            >
              Perbarui Sekarang
            </Button>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Tutup pemberitahuan"
          onClick={closeNotice}
        >
          <X aria-hidden="true" />
        </Button>
      </CardContent>
    </Card>
  )
}
