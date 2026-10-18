import { useState } from "react";
import { CircleAlert, Lock, X } from "lucide-react";
import { useAuth, useAuthenticatedUser } from "@/auth/auth-context";
import { AuthProvider } from "@/auth/auth-provider";
import { UserManagementPage } from "@/components/admin/user-management-page";
import { AppHeader, type AppView } from "@/components/app-header";
import { AppGate } from "@/components/auth/app-gate";
import { MobileResultBar } from "@/components/mobile-result-bar";
import { PwaInstallPrompt } from "@/components/pwa-install-prompt";
import { PwaUpdateNotice } from "@/components/pwa-update-notice";
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
 * data) sehingga form melampaui lebar layar. ≥1024px: form + inspector hasil.
 */
const CALCULATOR_GRID_CLASS =
  "grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_440px]";

export default function App() {
  return (
    <TooltipProvider delayDuration={200}>
      <AuthProvider>
        <AppGate>
          <AuthenticatedAppKeyed />
        </AppGate>
      </AuthProvider>
      {/* Di luar AppGate agar tampil juga di halaman login/pemeriksaan sesi. */}
      <PwaUpdateNotice />
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
    <div className="app-background min-h-screen overflow-x-clip">
      <AppHeader
        view={view}
        onViewChange={(next) => {
          setHeaderError(null);
          setRequestedView(next);
        }}
        onError={setHeaderError}
      />

      <div className="ios-page flex flex-col gap-5 pt-5 sm:pt-7">
        {headerError && (
          <Alert variant="destructive" className="pr-14">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>Tindakan gagal</AlertTitle>
            <AlertDescription>{headerError}</AlertDescription>
            <button
              type="button"
              onClick={() => setHeaderError(null)}
              aria-label="Tutup pesan"
              className="absolute right-1.5 top-1.5 inline-flex size-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </Alert>
        )}

        {view === "admin" ? (
          <main>
            <UserManagementPage />
          </main>
        ) : canUseCalculator ? (
          <main aria-labelledby="data-penetapan-title" className="flex flex-col gap-5">
            <div className="flex flex-col gap-1 px-1">
              <h2 id="data-penetapan-title" className="ios-page-title">
                Penetapan Pajak
              </h2>
              <p className="ios-page-subtitle max-w-2xl">
                Cari nomor polisi atau isi data kendaraan secara manual. PKB,
                Opsen, SWDKLLJ, dan PNBP sesuai Pergub NTT No. 54 Tahun 2026.
              </p>
            </div>

            <div className={CALCULATOR_GRID_CLASS}>
              <section aria-label="Data penetapan" className="min-w-0">
                <TaxCalculatorForm onResult={setResult} />
              </section>

              <aside
                aria-label="Hasil penetapan"
                className="hidden lg:sticky lg:top-[calc(env(safe-area-inset-top)+4.5rem)] lg:block lg:self-start"
              >
                <div className="surface-card p-5 xl:p-6">
                  {result ? (
                    <div key={result.total} className="animate-result-panel-in">
                      <TaxResultPanel result={result} />
                    </div>
                  ) : (
                    <ResultEmpty />
                  )}
                </div>
              </aside>
            </div>
          </main>
        ) : (
          <main>
            <div className="ios-group">
              <Empty className="min-h-[22rem] border-0">
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

        {/* Ajakan instal setelah konten utama: konten tugas tetap prioritas. */}
        <PwaInstallPrompt />

        <footer
          className={
            showResult
              ? "pt-4 pb-32 text-center text-xs leading-relaxed text-muted-foreground lg:pb-8"
              : "pt-4 pb-[max(2rem,env(safe-area-inset-bottom))] text-center text-xs leading-relaxed text-muted-foreground"
          }
        >
          <p>
            © 2026 Elwin Musadi Bessiesura
            <span aria-hidden="true"> · </span>
            <br className="sm:hidden" />
            UPT Pendapatan Daerah Wilayah Kota Kupang
          </p>
        </footer>
      </div>

      {showResult && <MobileResultBar result={showResult} />}
    </div>
  );
}
