import type { ReactNode } from "react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface FacilityToggleProps {
  id: string;
  title: string;
  description: string;
  /** Ringkasan dampak (mis. "Diskon tunggakan 75%"); kosong = tidak ditampilkan. */
  impact: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  icon: ReactNode;
  className?: string;
}

/**
 * Kartu fasilitas yang dapat dipilih. Seluruh kartu dapat diklik melalui
 * label yang direntangkan (`after:inset-0`); Switch tetap satu-satunya
 * kontrol interaktif sehingga semantik dan navigasi keyboard tidak berubah.
 */
export function FacilityToggle({
  id,
  title,
  description,
  impact,
  checked,
  onCheckedChange,
  icon,
  className,
}: FacilityToggleProps) {
  const descriptionId = `${id}-description`;

  return (
    <div
      className={cn(
        "relative flex h-full min-w-0 flex-col gap-3 rounded-xl border p-4 transition-colors duration-200",
        "has-[:focus-visible]:border-ring",
        checked
          ? "facility-active"
          : "border-border bg-card hover:border-navy-600/30 hover:bg-navy-50/50 dark:hover:bg-muted/40",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg border transition-colors duration-200 [&_svg]:size-4",
            checked
              ? "border-navy-800 bg-navy-800 text-white dark:border-primary dark:bg-primary dark:text-primary-foreground"
              : "step-badge",
          )}
          aria-hidden="true"
        >
          {icon}
        </span>
        <Switch
          id={id}
          checked={checked}
          onCheckedChange={onCheckedChange}
          aria-describedby={descriptionId}
          className="relative z-10 mt-0.5"
        />
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <label
          htmlFor={id}
          className="cursor-pointer text-sm font-semibold leading-snug text-foreground after:absolute after:inset-0 after:rounded-xl after:content-['']"
        >
          {title}
        </label>
        <p
          id={descriptionId}
          className="text-[0.8125rem] leading-relaxed text-muted-foreground"
        >
          {description}
        </p>
      </div>
      {impact && (
        <p
          className={cn(
            "mt-auto w-fit rounded-full border px-2 py-0.5 text-[0.6875rem] font-semibold leading-4 transition-colors",
            checked
              ? "step-badge"
              : "border-border bg-muted/60 text-muted-foreground",
          )}
        >
          {impact}
        </p>
      )}
    </div>
  );
}
