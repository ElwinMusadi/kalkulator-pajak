import { useState } from "react";
import { CircleAlert, Lock, X } from "lucide-react";
import { useAuth, useAuthenticatedUser } from "@/auth/auth-context";
import { AuthProvider } from "@/auth/auth-provider";
import { UserManagementPage } from "@/components/admin/user-management-page";
import { AppHeader, type AppView } from "@/components/app-header";
import { AppGate } from "@/components/auth/app-gate";
import { MobileResultBar } from "@/components/mobile-result-bar";
import { PwaInstallPrompt } from "@/components/pwa-install-prompt";
import { ResultEmpty } from "@/components/result-empty";
import { TaxCalculatorForm } from "@/components/tax-calculator-form";
import { TaxResultPanel } from "@/components/tax-result-panel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { TaxCalculationResult } from "@/types/tax";

/**
 * `grid-cols-1` (= minmax(0,1fr)) wajib di mobile. Tanpa itu kolom grid implisit
 * berukuran "auto" melebar mengikuti konten nowrap (nama pemilik, badge sumber
 * data) sehingga kartu Data Penetapan melampaui lebar layar.
 */
const CALCULATOR_GRID_CLASS =
  "grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px]";

export default function App() {
  return (
    <TooltipProvider delayDuration={200}>
      <AuthProvider>
        <AppGate>
          <AuthenticatedAppKeyed />
        </AppGate>
      </AuthProvider>
    </TooltipProvider>
  );
}

/** Remount saat user berganti agar hasil dan input kalkulator tidak terbawa. */
function AuthenticatedAppKeyed() {
  const user = useAuthenticatedUser();
  return <AuthenticatedApp key={user.id} />;
}

function AuthenticatedApp() {
  const user = useAuthenticatedUser();
  const { hasPermission } = useAuth();
  const [result, setResult] = useState<TaxCalculationResult | null>(null);
  const [requestedView, setRequestedView] = useState<AppView>("calculator");
  const [headerError, setHeaderError] = useState<string | null>(null);

  const isAdmin = user.role === "admin";
  // Halaman Kelola User hanya untuk Admin; peran lain selalu ke Kalkulator.
  const view: AppView = isAdmin ? requestedView : "calculator";
  const canUseCalculator = hasPermission("calculator");
  const showResult = view === "calculator" && canUseCalculator && result;

  return (
    <div className="app-background min-h-screen overflow-x-hidden pb-0!">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 pt-8 sm:px-6 lg:px-8">
        <AppHeader
          view={view}
          onViewChange={(next) => {
            setHeaderError(null);
            setRequestedView(next);
          }}
          onError={setHeaderError}
        />

        {headerError && (
          <Alert variant="destructive" className="pr-12">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>Tindakan gagal</AlertTitle>
            <AlertDescription>{headerError}</AlertDescription>
            <button
              type="button"
              onClick={() => setHeaderError(null)}
              aria-label="Tutup pesan"
              className="absolute right-3 top-3 rounded-sm p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </Alert>
        )}

        <PwaInstallPrompt />

        {view === "admin" ? (
          <main>
            <UserManagementPage />
          </main>
        ) : canUseCalculator ? (
          <main className={CALCULATOR_GRID_CLASS}>
            <Card className="min-w-0 shadow-sm">
              <CardHeader className="border-b pb-5">
                <CardTitle className="text-xl pb-0!">Data Penetapan</CardTitle>
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
        ) : (
          <main>
            <Card className="shadow-sm">
              <Empty className="min-h-[24rem] border-0">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Lock aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>Modul Kalkulator belum tersedia</EmptyTitle>
                  <EmptyDescription>
                    Anda belum memiliki akses ke modul Kalkulator. Hubungi Admin.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </Card>
          </main>
        )}

        <footer
          className={
            showResult
              ? "border-t border-border/70 pt-6 pb-24 text-center text-sm leading-normal text-muted-foreground lg:pb-6"
              : "border-t border-border/70 py-6 text-center text-sm leading-normal text-muted-foreground"
          }
        >
          <div className="md:flex items-center justify-center">
            <p>© 2026 &nbsp;·&nbsp; Elwin Musadi Bessiesura &nbsp;</p>
            <p>·&nbsp; UPT Pendapatan Daerah Wilayah Kota Kupang</p>
          </div>
        </footer>
      </div>

      {showResult && <MobileResultBar result={showResult} />}
    </div>
  );
}
