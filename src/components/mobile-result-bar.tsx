import { ChevronUp } from "lucide-react"
import { ResultBreakdown } from "@/components/result-breakdown"
import { ResultSummary } from "@/components/result-summary"
import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import { formatRupiah } from "@/lib/format"
import type { TaxCalculationResult } from "@/types/tax"

export function MobileResultBar({ result }: { result: TaxCalculationResult }) {
  return (
    <Drawer>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] backdrop-blur lg:hidden">
        <div className="mx-auto flex min-w-0 max-w-7xl items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Total bayar</p>
            <p className="numeric mt-0.5 whitespace-nowrap text-lg font-bold leading-none text-primary">{formatRupiah(result.total)}</p>
          </div>
          <DrawerTrigger asChild>
            <Button type="button" size="sm" className="shrink-0">
              Rincian
              <ChevronUp data-icon="inline-end" aria-hidden="true" />
            </Button>
          </DrawerTrigger>
        </div>
      </div>
      <DrawerContent className="max-h-[88dvh]">
        <DrawerHeader className="border-b text-left">
          <DrawerTitle>Rincian penetapan</DrawerTitle>
          <DrawerDescription>Komponen pajak dan biaya yang membentuk total pembayaran.</DrawerDescription>
        </DrawerHeader>
        <div className="overflow-y-auto px-4 py-5">
          <ResultSummary result={result} compact />
          <div className="mt-5">
            <ResultBreakdown result={result} />
          </div>
        </div>
        <DrawerFooter className="border-t">
          <DrawerClose asChild>
            <Button type="button" variant="outline">Tutup</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
