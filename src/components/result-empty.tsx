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
        <EmptyTitle>Belum ada penetapan</EmptyTitle>
        <EmptyDescription>
          Masukkan nomor polisi atau lengkapi data kendaraan, lalu tekan Hitung
          Penetapan.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <ol
          aria-label="Urutan langkah"
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
        >
          {STEPS.map((step, index) => (
            <li key={step} className="flex items-center gap-1.5">
              <span className="flex items-center gap-1.5 rounded-full border border-border bg-card py-1 pl-1 pr-2.5">
                <span
                  aria-hidden="true"
                  className="numeric flex size-5 items-center justify-center rounded-full bg-navy-50 text-[10px] font-bold text-navy-800"
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
