import { useState } from "react";
import type { ReactNode } from "react";
import { Calculator, Loader2, LogOut, Users } from "lucide-react";
import { useAuthenticatedUser, useAuth } from "@/auth/auth-context";
import { PwaInstallButton } from "@/components/pwa-install-prompt";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { VehicleDataSourceSettings } from "@/components/vehicle-data-source-settings";
import { isApiError } from "@/lib/http";
import { cn } from "@/lib/utils";

export type AppView = "calculator" | "admin";

interface AppHeaderProps {
  view: AppView;
  onViewChange: (view: AppView) => void;
  onError: (message: string) => void;
}

const ROLE_LABEL = { admin: "Admin", petugas: "Petugas" } as const;

export function AppHeader({ view, onViewChange, onError }: AppHeaderProps) {
  const user = useAuthenticatedUser();
  const { logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const isAdmin = user.role === "admin";

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
    } catch (error) {
      onError(
        isApiError(error) ? error.message : "Gagal keluar. Coba lagi.",
      );
      setLoggingOut(false);
    }
  }

  return (
    <header className="flex flex-col gap-3 border-b border-border/70 pb-5">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 md:grid-cols-[auto_minmax(0,1fr)_auto]">
        <img
          src="/logo-ntt.png"
          alt="Lambang Provinsi Nusa Tenggara Timur"
          className="h-16 w-auto shrink-0 self-center md:h-14"
          width={61}
          height={64}
        />
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase leading-snug tracking-[0.16em] text-muted-foreground sm:text-[11px]">
            UPTD Pendapatan Daerah Wilayah Kota Kupang
          </p>
          <h1 className="mt-0.5 text-xl font-bold leading-tight tracking-tight text-foreground sm:text-2xl lg:text-[26px]">
            Kalkulator Pajak Kendaraan
          </h1>
          <p className="mt-0.5 text-sm leading-snug text-muted-foreground">
            Simulasi PKB, Opsen, SWDKLLJ, dan PNBP dengan fasilitas Tax Amnesty.
          </p>
        </div>
        <div className="col-span-2 flex flex-wrap items-center gap-2 md:col-span-1 md:col-start-3 md:row-start-1 md:justify-end md:self-end">
          <PwaInstallButton />
          {view === "calculator" && <VehicleDataSourceSettings />}
          <Badge variant="secondary" className="w-fit font-medium">
            Pergub NTT No. 54 Tahun 2026
          </Badge>
        </div>
      </div>

      {/* Baris akun: identitas user di kiri, navigasi dan keluar di kanan. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border bg-card/70 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="step-badge flex size-8 shrink-0 items-center justify-center rounded-md border text-xs font-bold uppercase"
            aria-hidden="true"
          >
            {user.name.trim().charAt(0) || user.username.charAt(0)}
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-medium text-foreground">
              {user.name}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              @{user.username}
            </p>
          </div>
          <Badge
            variant={isAdmin ? "default" : "outline"}
            className="ml-1 shrink-0 font-medium"
          >
            {ROLE_LABEL[user.role]}
          </Badge>
        </div>

        {isAdmin && (
          <nav aria-label="Navigasi utama" className="flex items-center gap-2">
            <div className="flex items-center rounded-md border bg-muted/50 p-0.5">
              <ViewButton
                active={view === "calculator"}
                onClick={() => onViewChange("calculator")}
                icon={<Calculator aria-hidden="true" />}
                label="Kalkulator"
              />
              <ViewButton
                active={view === "admin"}
                onClick={() => onViewChange("admin")}
                icon={<Users aria-hidden="true" />}
                label="Kelola User"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleLogout()}
              disabled={loggingOut}
              aria-busy={loggingOut || undefined}
            >
              {loggingOut ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <LogOut aria-hidden="true" />
              )}
              Keluar
            </Button>
          </nav>
        )}
      </div>
    </header>
  );
}

function ViewButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-[calc(var(--radius)-2px)] px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-3.5",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
