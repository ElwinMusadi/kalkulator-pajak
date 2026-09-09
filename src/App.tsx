import { useState } from "react";
import { WifiOff } from "lucide-react";
import { PwaInstallPrompt } from "@/components/pwa-install-prompt";
import { PwaUpdateNotice } from "@/components/pwa-update-notice";
import { TaxCalculatorForm } from "@/components/tax-calculator-form";
import { TaxResultPanel } from "@/components/tax-result-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { cn } from "@/lib/utils";
import type { TaxCalculationResult } from "@/types/tax";

export default function App() {
  const [result, setResult] = useState<TaxCalculationResult | null>(null);
  const isOnline = useOnlineStatus();

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <img
            src="/logo-ntt.png"
            alt="Logo Provinsi Nusa Tenggara Timur"
            className="h-16 w-auto"
            width={61}
            height={64}
          />
          <div>
            <h1 className="text-3xl font-black! tracking-normal text-primary">
              • KALKULATOR PAJAK •
            </h1>
            <p className="text-sm mt-1 tracking-wide">
              Berdasarkan Pergub NTT No. 54 Tahun 2026 — UPTD Kota Kupang
            </p>
          </div>
        </div>

        {!isOnline && (
          <div
            role="status"
            className="mb-6 flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground"
          >
            <WifiOff className="size-4 shrink-0" aria-hidden="true" />
            <span>
              Anda sedang offline. Kalkulasi manual tetap tersedia; pencarian Nopol
              baru memerlukan koneksi internet.
            </span>
          </div>
        )}

        <PwaInstallPrompt />

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
              <CardTitle className="text-base border-b pb-2">
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

      <PwaUpdateNotice />

      <footer className="mt-8 md:mt-12 text-center text-[13px] md:text-sm text-muted-foreground">
        <p>
          © 2026 • Elwin Musadi Bessiesura • UPT Pendapatan Daerah Wilayah Kota
          Kupang.
        </p>
      </footer>
    </div>
  );
}
