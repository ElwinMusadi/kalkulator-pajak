import { Check, Database, Globe2, Layers, Settings2 } from "lucide-react"
import { useAuth } from "@/auth/auth-context"
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
import { cn } from "@/lib/utils"
import type { VehicleDataSourceMode } from "@/types/tax"

interface SourceOption {
  value: VehicleDataSourceMode
  label: string
  description: string
  icon: typeof Database
  isDefault?: boolean
}

const SOURCE_OPTIONS: SourceOption[] = [
  {
    value: "api_then_d1",
    label: "NJKB API + Database D1",
    description:
      "NJKB API dulu; Database D1 dipakai bila data tidak ditemukan atau API bermasalah.",
    icon: Layers,
    isDefault: true,
  },
  {
    value: "d1_then_api",
    label: "Database D1 + NJKB API",
    description:
      "Database D1 dulu; NJKB API dipakai bila data tidak ditemukan atau D1 bermasalah.",
    icon: Layers,
  },
  {
    value: "api",
    label: "NJKB API NTT",
    description: "Cari data kendaraan langsung melalui layanan NJKB API NTT saja.",
    icon: Globe2,
  },
  {
    value: "d1",
    label: "Database D1",
    description:
      "Gunakan data kendaraan yang tersimpan di database Cloudflare D1 saja.",
    icon: Database,
  },
]

/**
 * Tombol pengaturan sumber data. Hanya dirender bila user memiliki izin
 * `vehicle_source.settings` dan setidaknya satu sumber data yang diizinkan;
 * dialog hanya menampilkan mode yang diizinkan.
 */
export function VehicleDataSourceSettings() {
  const { hasPermission } = useAuth()
  const { effectiveMode, allowedModes, setMode } = useEffectiveVehicleDataSource()

  if (!hasPermission("vehicle_source.settings") || allowedModes.length === 0) {
    return null
  }

  const options = SOURCE_OPTIONS.filter((option) =>
    allowedModes.includes(option.value),
  )

  return (
    <Dialog>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button
              type="button"
              variant="onDark"
              size="icon"
              aria-label="Pengaturan sumber data"
            >
              <Settings2 aria-hidden="true" />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>Pengaturan sumber data</TooltipContent>
      </Tooltip>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Sumber Data Kendaraan</DialogTitle>
          <DialogDescription>
            Pilih sumber data untuk pencarian Nomor Polisi. Pilihan tersimpan di
            perangkat ini dan dipakai untuk pencarian berikutnya.
          </DialogDescription>
        </DialogHeader>

        <div
          role="radiogroup"
          aria-label="Pilih sumber data kendaraan"
          className="grid gap-2.5"
        >
          {options.map((option) => {
            const Icon = option.icon
            const selected = effectiveMode === option.value

            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setMode(option.value)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-[border-color,background-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2",
                  selected
                    ? "border-navy-800 bg-navy-50 shadow-xs ring-1 ring-navy-800"
                    : "border-border bg-card hover:border-navy-600/40 hover:bg-navy-50/60",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg",
                    selected
                      ? "bg-navy-800 text-white"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-semibold text-foreground">
                      {option.label}
                    </span>
                    {option.isDefault && (
                      <span className="rounded-md border border-gold-500/60 px-1.5 py-px text-[10px] font-bold uppercase tracking-[0.12em] text-warning">
                        Default
                      </span>
                    )}
                  </span>
                  <span className="mt-1 block text-[13px] leading-relaxed text-muted-foreground">
                    {option.description}
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                    selected
                      ? "border-navy-800 bg-navy-800 text-white"
                      : "border-muted-foreground/40 bg-card",
                  )}
                >
                  {selected && <Check className="size-3" strokeWidth={3} />}
                </span>
              </button>
            )
          })}
        </div>

        {options.length < SOURCE_OPTIONS.length && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Sumber data lain tidak ditampilkan karena belum diizinkan untuk akun
            Anda.
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
