import type { ReactNode } from "react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface FacilityToggleProps {
  id: string;
  title: string;
  /** ReactNode agar nominal di dalamnya dapat memakai `.monetary`. */
  description: ReactNode;
  /** Ringkasan dampak (mis. "Diskon tunggakan 75%"); kosong = tidak ditampilkan. */
  impact: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  icon: ReactNode;
  /** Keterangan kontekstual di bawah deskripsi (mis. asal pengisian otomatis). */
  note?: ReactNode;
  /** "auto" = terisi otomatis, "warning" = perlu diperiksa manual. */
  noteTone?: "auto" | "warning" | "neutral";
  className?: string;
}

const NOTE_TONE = {
  auto: "text-success",
  warning: "text-warning",
  neutral: "text-muted-foreground",
} as const;

/**
 * Baris pengaturan selebar penuh (gaya Settings): ikon | judul, dampak,
 * deskripsi, catatan | switch. Seluruh baris dapat diklik melalui label yang
 * direntangkan (`after:inset-0`); Switch tetap satu-satunya kontrol interaktif
 * sehingga semantik, aria-describedby, dan navigasi keyboard tidak berubah.
 */
export function FacilityToggle({
  id,
  title,
  description,
  impact,
  checked,
  onCheckedChange,
  icon,
  note,
  noteTone = "neutral",
  className,
}: FacilityToggleProps) {
  const descriptionId = `${id}-description`;
  const noteId = `${id}-note`;

  return (
    <div
      className={cn(
        "relative flex min-h-11 min-w-0 items-start gap-3 bg-card px-4 py-3.5 transition-colors duration-150",
        "has-[:focus-visible]:bg-muted/60 hover:bg-muted/40",
        checked && "facility-active",
        className,
      )}
    >
      <span
        className={cn(
          "mt-0.5 hidden size-8 shrink-0 items-center min-[400px]:flex justify-center rounded-[0.625rem] transition-colors duration-150 [&_svg]:size-[1.125rem] [&_svg]:stroke-[1.75]",
          checked
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground",
        )}
        aria-hidden="true"
      >
        {icon}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <label
            htmlFor={id}
            className="cursor-pointer text-base font-medium leading-snug text-foreground after:absolute after:inset-0 after:content-['']"
          >
            {title}
          </label>
          {impact && (
            <span
              className={cn(
                "rounded-full px-2 py-px text-xs font-medium leading-5 transition-colors",
                checked
                  ? "bg-primary/12 text-primary"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {impact}
            </span>
          )}
        </div>
        <p
          id={descriptionId}
          className="text-sm leading-relaxed text-muted-foreground"
        >
          {description}
        </p>
        {note && (
          <p
            id={noteId}
            className={cn(
              "text-[0.8125rem] font-medium leading-relaxed",
              NOTE_TONE[noteTone],
            )}
          >
            {note}
          </p>
        )}
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-describedby={note ? `${descriptionId} ${noteId}` : descriptionId}
        className="relative z-10 mt-1 shrink-0"
      />
    </div>
  );
}
