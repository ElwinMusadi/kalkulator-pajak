import { Info } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { MODULE_KEYS, MODULE_LABELS, type ModuleKey } from "@/types/auth"

interface ModulePermissionListProps {
  idPrefix: string
  value: ModuleKey[]
  onChange: (value: ModuleKey[]) => void
  disabled?: boolean
}

/** Daftar switch izin modul Petugas beserta catatan ketergantungan antarmodul. */
export function ModulePermissionList({
  idPrefix,
  value,
  onChange,
  disabled,
}: ModulePermissionListProps) {
  const selected = new Set(value)

  function toggle(key: ModuleKey, checked: boolean) {
    const next = new Set(selected)
    if (checked) next.add(key)
    else next.delete(key)
    // Pertahankan urutan kanonis MODULE_KEYS.
    onChange(MODULE_KEYS.filter((k) => next.has(k)))
  }

  const hasCalculator = selected.has("calculator")
  const hasOtherModules = MODULE_KEYS.some(
    (key) => key !== "calculator" && selected.has(key),
  )
  const hasD1 = selected.has("vehicle_lookup.d1")
  const hasApi = selected.has("vehicle_lookup.api")

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y rounded-lg border">
        {MODULE_KEYS.map((key) => {
          const id = `${idPrefix}-${key.replace(/\./g, "-")}`
          const checked = selected.has(key)
          return (
            <li
              key={key}
              className={cn(
                "flex items-start justify-between gap-4 px-3.5 py-3 transition-colors",
                checked && "bg-primary/[0.04]",
              )}
            >
              <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
                <span className="block text-sm font-medium leading-snug text-foreground">
                  {MODULE_LABELS[key].label}
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                  {MODULE_LABELS[key].description}
                </span>
              </label>
              <Switch
                id={id}
                checked={checked}
                onCheckedChange={(next) => toggle(key, next)}
                disabled={disabled}
                className="mt-0.5"
              />
            </li>
          )
        })}
      </ul>

      <div className="info-subtle flex items-start gap-2 rounded-md border px-3 py-2 text-xs leading-relaxed text-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <p>
            Mode default <span className="font-medium">NJKB API + Database D1</span>{" "}
            (dan mode gabungan lainnya) hanya tersedia bila kedua izin pencarian Nopol
            diaktifkan.
            {hasD1 !== hasApi && (
              <span className="text-muted-foreground">
                {" "}
                Saat ini Petugas hanya dapat memakai{" "}
                {hasD1 ? "Database D1" : "NJKB API"}.
              </span>
            )}
          </p>
          {!hasCalculator && hasOtherModules && (
            <p className="font-medium text-warning">
              Modul lain tidak dapat digunakan tanpa izin Kalkulator Pajak.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
