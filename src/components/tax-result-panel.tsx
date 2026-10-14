import { ResultSummary } from "@/components/result-summary";
import type { TaxCalculationResult } from "@/types/tax";

interface TaxResultPanelProps {
  result: TaxCalculationResult;
}

/**
 * Shell desktop untuk hasil penetapan.
 * ResultSummary memuat tile total, catatan amnesti, dan bento komponen.
 */
export function TaxResultPanel({ result }: TaxResultPanelProps) {
  return <ResultSummary result={result} />;
}
