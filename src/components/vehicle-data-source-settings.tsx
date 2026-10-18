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
              variant="ghost"
              size={compact ? "icon" : "default"}
              aria-label={compact ? "Sumber data: Data Kendaraan" : undefined}
              className={
                compact
                  ? "size-11 rounded-full text-primary hover:bg-primary/10 hover:text-primary [&_svg]:stroke-[1.75]"
                  : "h-11 rounded-full px-4 text-primary hover:bg-primary/10 hover:text-primary [&_svg]:stroke-[1.75]"
              }
            >
              <Globe2 aria-hidden="true" />
              {!compact && "Data Kendaraan"}
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>{VEHICLE_DATA_SOURCE_DESCRIPTION}</TooltipContent>
      </Tooltip>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-md overflow-y-auto rounded-[1.25rem]">
        <DialogHeader className="text-left">
          <DialogTitle className="text-[1.25rem] font-semibold">
            Sumber Data Kendaraan
          </DialogTitle>
          <DialogDescription>
            Pencarian Nomor Polisi memakai satu sumber data.
          </DialogDescription>
        </DialogHeader>

        {/* Informasi saja, bukan pilihan: tidak ada state terpilih/radio. */}
        <div className="flex items-start gap-3 rounded-2xl bg-muted/60 p-3.5">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-[0.625rem] bg-primary/10 text-primary">
            <Globe2 className="size-[1.125rem] stroke-[1.75]" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[0.9375rem] font-semibold text-foreground">
              {VEHICLE_DATA_SOURCE_LABEL}
            </span>
            <span className="mt-0.5 block text-sm leading-relaxed text-muted-foreground">
              {VEHICLE_DATA_SOURCE_DESCRIPTION} — data kendaraan seluruh UPT di NTT.
            </span>
          </span>
        </div>

        <ul className="flex flex-col gap-2.5 text-sm leading-relaxed text-muted-foreground">
          <li className="flex items-start gap-2.5">
            <RefreshCw className="mt-0.5 size-4 shrink-0 stroke-[1.75] text-primary" aria-hidden="true" />
            <span>
              Data berasal dari salinan (snapshot) yang disinkronkan berkala, bukan
              data langsung (real-time). Waktu sinkronisasi ditampilkan pada hasil
              pencarian bila tersedia.
            </span>
          </li>
          <li className="flex items-start gap-2.5">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 stroke-[1.75] text-primary" aria-hidden="true" />
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
