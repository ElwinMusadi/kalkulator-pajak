import { Database, Globe2, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { useVehicleDataSourceSetting } from "@/hooks/use-vehicle-data-source-setting"
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
    icon: Database,
  },
]

export function VehicleDataSourceSettings() {
  const { mode, setMode } = useVehicleDataSourceSetting()

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
      <DialogContent className="max-w-xl">
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
          {SOURCE_OPTIONS.map((option) => {
            const Icon = option.icon
            const selected = mode === option.value

            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setMode(option.value)}
                className={cn(
                  "flex min-h-20 w-full items-start gap-3 rounded-lg border p-4 text-left transition-colors",
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
      </DialogContent>
    </Dialog>
  )
}
