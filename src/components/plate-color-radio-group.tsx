import { useRef, type KeyboardEvent } from "react";
import { Check } from "lucide-react";
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
 * Pilihan Putih / Hitam / Merah berupa tiga plat mini, dengan semantik
 * radiogroup (WAI-ARIA): satu tab stop (roving tabindex), panah/Home/End
 * memindahkan pilihan. Grid 3 kolom `minmax(0,1fr)` + `min-w-0` mencegah
 * overflow di layar 320px.
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
      className={cn("grid w-full min-w-0 grid-cols-3 gap-2 sm:gap-3", className)}
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
              "relative flex min-w-0 rounded-lg border bg-card p-1 transition-[border-color,box-shadow] duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
              checked
                ? "border-navy-800 ring-1 ring-navy-800 dark:border-primary dark:ring-primary"
                : "border-border hover:border-navy-600/40",
            )}
          >
            {/* Plat mini memakai token TNKB yang sama dengan plat Nomor Polisi. */}
            <span
              data-plate={option}
              className="tnkb-plate flex h-9 w-full min-w-0 items-center justify-center rounded-md! px-1 font-sans text-[0.8125rem] font-bold uppercase tracking-[0.1em] sm:text-sm"
            >
              <span className="truncate">{WARNA_PLAT_LABEL[option]}</span>
            </span>
            {checked && (
              <span
                className="absolute -right-1 -top-1.5 flex size-4 items-center justify-center rounded-full bg-navy-800 text-white ring-2 ring-card dark:bg-primary dark:text-primary-foreground"
                aria-hidden="true"
              >
                <Check className="size-2.5" strokeWidth={3.5} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
