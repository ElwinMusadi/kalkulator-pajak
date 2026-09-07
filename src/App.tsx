import { useState } from "react";
import { TaxCalculatorForm } from "@/components/tax-calculator-form";
import { TaxResultPanel } from "@/components/tax-result-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { TaxCalculationResult } from "@/types/tax";

export default function App() {
  const [result, setResult] = useState<TaxCalculationResult | null>(null);

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-black tracking-tight">
            KALKULATOR PAJAK
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Berdasarkan Pergub NTT No. 54 Tahun 2026 — UPTD Kota Kupang
          </p>
        </div>

        {/* Layout 2/3 + 1/3 */}
        <div className="flex flex-col items-start gap-6 lg:flex-row">
          {/* Form: terpusat tanpa hasil, mengambil 2/3 sisi kiri saat hasil tampil */}
          <Card
            className={cn(
              "w-full transition-transform duration-500 ease-out lg:w-2/3",
              !result && "lg:translate-x-1/4",
            )}
          >
            <CardHeader className="pb-4">
              <CardTitle className="text-base">
                Data Kendaraan &amp; Pembayaran
              </CardTitle>
            </CardHeader>
            <CardContent>
              <TaxCalculatorForm onResult={setResult} />
            </CardContent>
          </Card>

          {/* Hasil — 1/3 */}
          {result && (
            <Card className="animate-result-panel-in w-full lg:sticky lg:top-6 lg:w-1/3">
              <CardContent className="pt-6">
                <TaxResultPanel result={result} />
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <footer className="mt-12 lg:mt-20 text-center text-sm text-muted-foreground">
        <p>
          © 2026 Elwin Musadi Bessiesura • UPT Pendapatan Daerah Wilayah Kota
          Kupang.
        </p>
      </footer>
    </div>
  );
}
