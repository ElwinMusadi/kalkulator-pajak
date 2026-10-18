import { Calculator, ChevronRight } from "lucide-react";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

const STEPS = ["Nopol", "Data", "Hitung"] as const;

/** Keadaan kosong panel hasil: ajakan tenang + urutan langkah singkat. */
export function ResultEmpty() {
  return (
    <Empty className="min-h-[26rem] border-0 px-4 py-10">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Calculator aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>Belum Ada Penetapan</EmptyTitle>
        <EmptyDescription>
          Masukkan nomor polisi atau lengkapi data kendaraan, lalu tekan Hitung
          Penetapan.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <ol
          aria-label="Urutan langkah"
          className="flex flex-wrap items-center justify-center gap-1.5 text-sm font-medium text-muted-foreground"
        >
          {STEPS.map((step, index) => (
            <li key={step} className="flex items-center gap-1.5">
              <span className="flex items-center gap-1.5 rounded-full bg-muted py-1 pl-1 pr-3">
                <span
                  aria-hidden="true"
                  className="numeric flex size-6 items-center justify-center rounded-full bg-card text-xs font-semibold text-primary"
                >
                  {index + 1}
                </span>
                {step}
              </span>
              {index < STEPS.length - 1 && (
                <ChevronRight
                  aria-hidden="true"
                  className="size-3.5 text-muted-foreground/60"
                />
              )}
            </li>
          ))}
        </ol>
      </EmptyContent>
    </Empty>
  );
}
