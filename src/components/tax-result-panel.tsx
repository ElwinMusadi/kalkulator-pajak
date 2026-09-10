import { ResultSummary } from "@/components/result-summary";
import type { TaxCalculationResult } from "@/types/tax";

interface TaxResultPanelProps {
  result: TaxCalculationResult;
}

/**
 * Desktop shell untuk hasil penetapan.
 * ResultSummary mencakup nominal kategori accordion dan total pembayaran.
 */
export function TaxResultPanel({ result }: TaxResultPanelProps) {
  return <ResultSummary result={result} />;
}
