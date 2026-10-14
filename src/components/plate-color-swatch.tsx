import { cn } from "@/lib/utils";
import type { WarnaPlat } from "@/types/tax";

/**
 * Warna fisik TNKB, bukan warna semantik UI. Plat putih diberi border agar
 * tetap terlihat di atas latar terang; plat hitam diberi border terang tipis
 * agar tetap terlihat pada tema gelap.
 */
const SWATCH_CLASS: Record<WarnaPlat, string> = {
  putih: "border-foreground/35 bg-white",
  hitam: "border-neutral-900 bg-neutral-900 dark:border-white/40",
  merah: "border-red-700 bg-red-600",
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
