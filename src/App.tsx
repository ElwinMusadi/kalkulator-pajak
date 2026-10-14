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
  "grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_440px]";

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
      <AppHeader
        view={view}
        onViewChange={(next) => {
          setHeaderError(null);
          setRequestedView(next);
        }}
        onError={setHeaderError}
      />

      {/* Konten ditarik ke atas agar kartu "mengapung" di atas band navy. */}
      <div className="relative z-10 mx-auto -mt-8 flex max-w-7xl flex-col gap-6 px-4 sm:px-6 md:-mt-10 lg:px-8">
        {headerError && (
          <Alert variant="destructive" className="bg-card pr-12 shadow-card">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>Tindakan gagal</AlertTitle>
            <AlertDescription>{headerError}</AlertDescription>
            <button
              type="button"
              onClick={() => setHeaderError(null)}
              aria-label="Tutup pesan"
              className="absolute right-2 top-2 inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
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
            <section
              aria-labelledby="data-penetapan-title"
              className="surface-card min-w-0"
            >
              <div className="flex flex-col gap-1 border-b border-border/80 px-5 pb-5 pt-5 sm:px-6 sm:pt-6">
                <p className="eyebrow">Langkah penetapan</p>
                <h2
                  id="data-penetapan-title"
                  className="text-xl font-bold leading-tight tracking-tight text-foreground"
                >
                  Data Penetapan
                </h2>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Cari nomor polisi atau isi data kendaraan secara manual, lalu
                  hitung penetapan.
                </p>
              </div>
              <div className="px-5 py-5 sm:px-6 sm:py-6">
                <TaxCalculatorForm onResult={setResult} />
              </div>
            </section>

            <aside className="lg:sticky lg:top-6 lg:self-start">
              <div className="surface-card hidden lg:block">
                <div className="p-5 xl:p-6">
                  {result ? (
                    <div key={result.total} className="animate-result-panel-in">
                      <TaxResultPanel result={result} />
                    </div>
                  ) : (
                    <ResultEmpty />
                  )}
                </div>
              </div>
            </aside>
          </main>
        ) : (
          <main>
            <div className="surface-card">
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
            </div>
          </main>
        )}

        <footer
          className={
            showResult
              ? "border-t border-border/70 pt-6 pb-28 text-center text-sm leading-normal text-muted-foreground lg:pb-8"
              : "border-t border-border/70 py-6 text-center text-sm leading-normal text-muted-foreground lg:pb-8"
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
