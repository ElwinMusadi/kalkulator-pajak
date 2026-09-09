import { CheckCircle2, CircleAlert, Loader2, SearchX } from "lucide-react"
import { cn } from "@/lib/utils"
import type { NopolLookupStatus, VehicleData } from "@/types/tax"

interface NopolLookupStatusProps {
  status: NopolLookupStatus
  vehicleData: VehicleData | null
  errorMessage: string | null
}

export function NopolLookupIndicator({ status }: { status: NopolLookupStatus }) {
  if (status === "loading")
    return <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
  if (status === "found")
    return <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
  if (status === "not_found")
    return <SearchX className="size-4 text-warning" aria-hidden="true" />
  if (status === "error")
    return <CircleAlert className="size-4 text-destructive" aria-hidden="true" />
  return null
}

export function NopolLookupMessage({
  status,
  vehicleData,
  errorMessage,
}: NopolLookupStatusProps) {
  if (status === "idle") {
    return (
      <p className="text-sm text-muted-foreground">
        Data kendaraan terisi otomatis bila Nopol terdaftar.
      </p>
    )
  }

  if (status === "loading") {
    return <p className="text-sm text-muted-foreground">Memeriksa data kendaraan…</p>
  }

  if (status === "found" && vehicleData) {
    return (
      <div
        className={cn(
          "animate-fade-up rounded-md border border-success-subtle bg-success-subtle px-3 py-2",
        )}
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-success">
          Data ditemukan
        </p>
        <p className="mt-0.5 truncate text-sm font-medium text-foreground">
          {vehicleData.nama ?? "Nama pemilik tidak tersedia"}
        </p>
        <p className="text-xs text-muted-foreground">
          {vehicleData.jenis ?? "Jenis tidak tersedia"}
        </p>
      </div>
    )
  }

  if (status === "not_found") {
    return (
      <p className="text-sm text-warning">
        Nopol belum terdaftar. Lengkapi data secara manual.
      </p>
    )
  }

  if (status === "error") {
    return (
      <p className="text-sm text-destructive">
        {errorMessage ?? "Pemeriksaan gagal. Lengkapi data secara manual."}
      </p>
    )
  }

  return null
}
