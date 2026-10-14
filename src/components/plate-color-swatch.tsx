import { cn } from "@/lib/utils";
import type { WarnaPlat } from "@/types/tax";

/**
 * Warna fisik TNKB (token `--plate-*` di index.css), bukan warna semantik UI.
 * Plat putih diberi border agar tetap terlihat di atas latar terang; plat
 * hitam diberi border terang tipis agar tetap terlihat pada tema gelap.
 */
const SWATCH_CLASS: Record<WarnaPlat, string> = {
  putih: "border-foreground/35 bg-[var(--plate-putih-bg)]",
  hitam:
    "border-[var(--plate-hitam-bg)] bg-[var(--plate-hitam-bg)] dark:border-white/40",
  merah:
    "border-[color-mix(in_oklch,var(--plate-merah-bg)_78%,black)] bg-[var(--plate-merah-bg)]",
};

export function PlateColorSwatch({
  warna,
  className,
}: {
  warna: WarnaPlat;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block size-3 shrink-0 rounded-[3px] border",
        SWATCH_CLASS[warna],
        className,
      )}
    />
  );
}
