import { Globe2, RefreshCw, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useEffectiveVehicleDataSource } from "@/hooks/use-effective-vehicle-data-source"
import {
  VEHICLE_DATA_SOURCE_DESCRIPTION,
  VEHICLE_DATA_SOURCE_LABEL,
} from "@/lib/vehicle-lookup-metadata"

/**
 * Indikator sumber data kendaraan (read-only). Pencarian Nopol hanya memakai
 * API Data Kendaraan; tidak ada pilihan sumber lain. Hanya dirender bila
 * user memiliki izin pencarian Nopol.
 */
export function VehicleDataSourceSettings({ compact = false }: { compact?: boolean }) {
  const { lookupEnabled } = useEffectiveVehicleDataSource()
  if (!lookupEnabled) return null

  return (
    <Dialog>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button
              type="button"
              variant="onDark"
              size={compact ? "icon" : "default"}
              aria-label={compact ? "Sumber data: Data Kendaraan" : undefined}
            >
              <Globe2 aria-hidden="true" />
              {!compact && "Data Kendaraan"}
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>{VEHICLE_DATA_SOURCE_DESCRIPTION}</TooltipContent>
      </Tooltip>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Sumber Data Kendaraan</DialogTitle>
          <DialogDescription>
            Pencarian Nomor Polisi memakai satu sumber data.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-3 rounded-xl border border-navy-800 bg-navy-50 p-3.5 ring-1 ring-navy-800 dark:bg-muted/40">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-navy-800 text-white">
            <Globe2 className="size-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-foreground">
              {VEHICLE_DATA_SOURCE_LABEL}
            </span>
            <span className="mt-1 block text-[13px] leading-relaxed text-muted-foreground">
              {VEHICLE_DATA_SOURCE_DESCRIPTION} — data kendaraan seluruh UPT di NTT.
            </span>
          </span>
        </div>

        <ul className="flex flex-col gap-2.5 text-[13px] leading-relaxed text-muted-foreground">
          <li className="flex items-start gap-2">
            <RefreshCw className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
            <span>
              Data berasal dari salinan (snapshot) yang disinkronkan berkala, bukan
              data langsung (real-time). Waktu sinkronisasi ditampilkan pada hasil
              pencarian bila tersedia.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
            <span>
              Periksa kembali dokumen kendaraan; seluruh nilai tetap dapat
              disesuaikan secara manual.
            </span>
          </li>
        </ul>
      </DialogContent>
    </Dialog>
  )
}
