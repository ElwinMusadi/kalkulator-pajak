import type { ReactNode } from "react"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

interface FacilityToggleProps {
  id: string
  title: string
  description: string
  impact: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  icon: ReactNode
}

export function FacilityToggle({
  id,
  title,
  description,
  impact,
  checked,
  onCheckedChange,
  icon,
}: FacilityToggleProps) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border p-3.5 transition-colors duration-200",
        checked
          ? "facility-active"
          : "border-border bg-card hover:bg-muted/40",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md border transition-colors duration-200 [&_svg]:size-4",
          checked ? "step-badge" : "border-border bg-muted/50 text-muted-foreground",
        )}
        aria-hidden="true"
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <label
            htmlFor={id}
            className="cursor-pointer text-sm font-medium leading-snug text-foreground"
          >
            {title}
          </label>
          <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
        <p
          className={cn(
            "mt-1.5 text-[11px] font-semibold uppercase tracking-[0.12em]",
            checked ? "text-primary" : "text-muted-foreground/70",
          )}
        >
          {impact}
        </p>
      </div>
    </div>
  )
}
