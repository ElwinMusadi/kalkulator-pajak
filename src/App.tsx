import { useState } from "react";
import { WifiOff } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { MobileResultBar } from "@/components/mobile-result-bar";
import { PwaInstallPrompt } from "@/components/pwa-install-prompt";
import { PwaUpdateNotice } from "@/components/pwa-update-notice";
import { ResultEmpty } from "@/components/result-empty";
import { TaxCalculatorForm } from "@/components/tax-calculator-form";
import { TaxResultPanel } from "@/components/tax-result-panel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useOnlineStatus } from "@/hooks/use-online-status";
import type { TaxCalculationResult } from "@/types/tax";

export default function App() {
  const [result, setResult] = useState<TaxCalculationResult | null>(null);
  const isOnline = useOnlineStatus();

  return (
    <TooltipProvider delayDuration={200}>
      <div className="app-background min-h-screen overflow-x-hidden pb-0!">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 pt-8 sm:px-6 lg:px-8">
          <AppHeader />

          {!isOnline && (
            <Alert>
              <WifiOff aria-hidden="true" />
              <AlertTitle>Anda sedang offline</AlertTitle>
              <AlertDescription>
                Kalkulasi manual tetap tersedia. Pencarian Nopol baru memerlukan
                koneksi internet.
              </AlertDescription>
            </Alert>
          )}

          <PwaInstallPrompt />

          <main className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px]">
            <Card className="shadow-sm">
              <CardHeader className="border-b pb-5">
                <CardTitle className="text-xl pb-0!">Data Penetapan</CardTitle>
                {/* <CardDescription className="pt-0!">
                  Empat langkah untuk menghitung PKB, Opsen, SWDKLLJ, dan PNBP.
                </CardDescription> */}
              </CardHeader>
              <CardContent className="pt-6">
                <TaxCalculatorForm onResult={setResult} />
              </CardContent>
            </Card>

            <aside className="lg:sticky lg:top-6 lg:self-start">
              <Card className="hidden shadow-sm lg:block">
                <CardContent className="p-6">
                  {result ? (
                    <div key={result.total} className="animate-result-panel-in">
                      <TaxResultPanel result={result} />
                    </div>
                  ) : (
                    <ResultEmpty />
                  )}
                </CardContent>
              </Card>
            </aside>
          </main>

          <footer className="border-t border-border/70 py-6 text-center text-sm leading-normal text-muted-foreground">
            <div className="md:flex items-center justify-center">
              <p>© 2026 &nbsp;·&nbsp; Elwin Musadi Bessiesura &nbsp;</p>
              <p>·&nbsp; UPT Pendapatan Daerah Wilayah Kota Kupang</p>
            </div>
          </footer>
        </div>

        {result && <MobileResultBar result={result} />}
        <PwaUpdateNotice />
      </div>
    </TooltipProvider>
  );
}
