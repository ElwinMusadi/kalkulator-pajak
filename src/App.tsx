import { useState } from "react"
import { TaxCalculatorForm } from "@/components/tax-calculator-form"
import { TaxResultPanel } from "@/components/tax-result-panel"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { TaxCalculationResult } from "@/types/tax"

export default function App() {
  const [result, setResult] = useState<TaxCalculationResult | null>(null)

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="mx-auto max-w-screen-xl">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">
            Kalkulator PKB &amp; Opsen
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Berdasarkan Pergub NTT No. 54 Tahun 2026 — UPT Kota Kupang
          </p>
        </div>

        {/* Layout 2/3 + 1/3 */}
        <div className="flex flex-col lg:flex-row items-start gap-6">
          {/* Form — 2/3 */}
          <Card className="w-full lg:w-2/3">
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Data Kendaraan &amp; Pembayaran</CardTitle>
            </CardHeader>
            <CardContent>
              <TaxCalculatorForm onResult={setResult} />
            </CardContent>
          </Card>

          {/* Hasil — 1/3 */}
          {result && (
            <Card className="w-full lg:w-1/3 sticky top-6">
              <CardContent className="pt-6">
                <TaxResultPanel result={result} />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
