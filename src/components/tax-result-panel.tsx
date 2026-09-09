import { ResultBreakdown } from "@/components/result-breakdown";
import { ResultSummary } from "@/components/result-summary";
import { Separator } from "@/components/ui/separator";
import type { TaxCalculationResult } from "@/types/tax";

interface TaxResultPanelProps {
  result: TaxCalculationResult;
}

export function TaxResultPanel({ result }: TaxResultPanelProps) {
  return (
    <div className="flex flex-col gap-5">
      <ResultSummary result={result} />
      <Separator />
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Rincian lengkap
        </p>
        <ResultBreakdown result={result} />
      </div>
    </div>
  );
}
