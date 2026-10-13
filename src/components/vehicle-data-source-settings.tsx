import { Database, Globe2, Layers, Settings } from "lucide-react"
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
import { useEffectiveVehicleDataSource } from "@/hooks/use-effective-vehicle-data-source"
import { cn } from "@/lib/utils"
import type { VehicleDataSourceMode } from "@/types/tax"

interface SourceOption {
  value: VehicleDataSourceMode
  label: string
  description: string
  icon: typeof Database
}

const SOURCE_OPTIONS: SourceOption[] = [
  {
    value: "d1",
    label: "Database D1",
    description:
      "Gunakan data kendaraan yang tersimpan di database Cloudflare D1 saja.",
    icon: Database,
  },
  {
    value: "api",
    label: "NJKB API NTT",
    description:
      "Cari data kendaraan langsung melalui layanan NJKB API NTT.",
    icon: Globe2,
  },
  {
    value: "d1_then_api",
    label: "Database D1 + NJKB API",
    description:
      "Cari di Database D1 terlebih dahulu, lalu gunakan NJKB API bila data tidak ditemukan atau D1 bermasalah.",
    icon: Layers,
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
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Pengaturan sumber data kendaraan"
        >
          <Settings aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Sumber Data Kendaraan</DialogTitle>
          <DialogDescription>
            Pilih sumber data yang digunakan untuk pencarian Nomor Polisi. Pilihan
            tersimpan di perangkat ini dan digunakan untuk lookup berikutnya.
          </DialogDescription>
        </DialogHeader>

        <div
          role="radiogroup"
          aria-label="Pilih sumber data kendaraan"
          className="grid gap-3"
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
                  "flex min-h-20 w-full items-start gap-3 rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border bg-card hover:bg-muted/50",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md border",
                    selected
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-border bg-muted text-muted-foreground",
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-3">
                    <span className="font-medium text-foreground">
                      {option.label}
                    </span>
                    <span
                      aria-hidden="true"
                      className={cn(
                        "size-4 shrink-0 rounded-full border-2",
                        selected
                          ? "border-primary bg-primary shadow-[inset_0_0_0_3px_var(--background)]"
                          : "border-muted-foreground/50",
                      )}
                    />
                  </span>
                  <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
                    {option.description}
                  </span>
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
