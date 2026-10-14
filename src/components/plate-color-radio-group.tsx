import { useRef, type KeyboardEvent } from "react";
import { PlateColorSwatch } from "@/components/plate-color-swatch";
import { cn } from "@/lib/utils";
import { WARNA_PLAT_LABEL, WARNA_PLAT_OPTIONS, type WarnaPlat } from "@/types/tax";

interface PlateColorRadioGroupProps {
  value: WarnaPlat;
  onValueChange: (value: WarnaPlat) => void;
  labelledBy: string;
  describedBy?: string;
  className?: string;
}

/**
 * Segmented control Putih / Hitam / Merah dengan semantik radiogroup (WAI-ARIA):
 * satu tab stop (roving tabindex), panah/Home/End memindahkan pilihan.
 * Grid 3 kolom `minmax(0,1fr)` + `min-w-0` mencegah overflow di layar 320px.
 */
export function PlateColorRadioGroup({
  value,
  onValueChange,
  labelledBy,
  describedBy,
  className,
}: PlateColorRadioGroupProps) {
  const buttonsRef = useRef<Array<HTMLButtonElement | null>>([]);

  function select(index: number) {
    const count = WARNA_PLAT_OPTIONS.length;
    const next = WARNA_PLAT_OPTIONS[(index + count) % count];
    onValueChange(next);
    buttonsRef.current[(index + count) % count]?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        select(index + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        select(index - 1);
        break;
      case "Home":
        event.preventDefault();
        select(0);
        break;
      case "End":
        event.preventDefault();
        select(WARNA_PLAT_OPTIONS.length - 1);
        break;
    }
  }

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      className={cn(
        // @container: segmen memadat (teks xs, padding kecil) bila lebar kontrol
        // < 17rem, mis. layar 320px, agar label tidak terpotong.
        "@container grid h-10 w-full min-w-0 grid-cols-3 gap-1 rounded-md border border-input bg-transparent p-1 shadow-sm",
        className,
      )}
    >
      {WARNA_PLAT_OPTIONS.map((option, index) => {
        const checked = option === value;
        return (
          <button
            key={option}
            ref={(node) => {
              buttonsRef.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onValueChange(option)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              // Bobot font sama di semua state: lebar label tidak berubah saat dipilih.
              "flex min-w-0 items-center justify-center gap-1 rounded-[calc(var(--radius)-2px)] border px-0.5 text-xs font-medium transition-colors @[17rem]:gap-1.5 @[17rem]:px-2 @[17rem]:text-sm",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              checked
                ? "step-badge"
                : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <PlateColorSwatch warna={option} className="size-2.5 @[17rem]:size-3" />
            <span className="truncate">{WARNA_PLAT_LABEL[option]}</span>
          </button>
        );
      })}
    </div>
  );
}
