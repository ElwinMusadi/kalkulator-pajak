import { ChevronUp } from "lucide-react";
import { ResultSummary } from "@/components/result-summary";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { formatRupiah } from "@/lib/format";
import type { TaxCalculationResult } from "@/types/tax";

/**
 * Toolbar total mengambang (satu-satunya material kaca di layar kalkulator).
 * Breakpoint `lg:hidden` harus sama dengan panel desktop `hidden lg:block`
 * dan padding bawah footer di App.tsx.
 */
export function MobileResultBar({ result }: { result: TaxCalculationResult }) {
  return (
    <Drawer>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:hidden">
        <div className="glass pointer-events-auto mx-auto flex min-h-[3.75rem] min-w-0 max-w-xl items-center justify-between gap-3 rounded-[1.75rem] border border-border/70 py-2 pl-5 pr-2 shadow-float">
          <div className="min-w-0">
            <p className="text-[0.8125rem] font-medium leading-tight text-muted-foreground">
              Total Bayar
            </p>
            <p
              key={result.total}
              className="animate-value-settle monetary mt-0.5 text-[clamp(1.0625rem,5.4vw,1.375rem)] [overflow-wrap:anywhere] font-bold leading-tight tracking-tight text-primary sm:text-2xl"
            >
              {formatRupiah(result.total)}
            </p>
          </div>
          <DrawerTrigger asChild>
            <Button
              type="button"
              className="h-11 shrink-0 rounded-full px-5 text-base font-semibold"
            >
              Rincian
              <ChevronUp aria-hidden="true" className="stroke-[1.75]" />
            </Button>
          </DrawerTrigger>
        </div>
      </div>
      <DrawerContent className="max-h-[92dvh] rounded-t-[1.75rem] bg-background">
        <DrawerHeader className="flex items-start justify-between gap-3 px-5 pb-3 pt-3">
          <div className="grid min-w-0 gap-0.5">
            <DrawerTitle className="text-[1.25rem] font-semibold">
              Rincian Penetapan
            </DrawerTitle>
            <DrawerDescription className="text-sm">
              Komponen pajak dan biaya yang membentuk total pembayaran.
            </DrawerDescription>
          </div>
          <DrawerClose asChild>
            <Button
              type="button"
              variant="ghost"
              className="-mr-2 h-11 shrink-0 rounded-full px-4 text-base font-semibold text-primary hover:bg-primary/10 hover:text-primary"
            >
              Tutup
            </Button>
          </DrawerClose>
        </DrawerHeader>
        {/* Konten bergulir; vaul hanya menyeret dari area yang tidak bergulir. */}
        <div
          data-vaul-no-drag=""
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-1"
        >
          <ResultSummary result={result} compact />
        </div>
      </DrawerContent>
    </Drawer>
  );
}
