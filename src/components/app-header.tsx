import { useState } from "react";
import type { ReactNode } from "react";
import { Calculator, Loader2, LogOut, Users } from "lucide-react";
import { useAuthenticatedUser, useAuth } from "@/auth/auth-context";
import { PwaInstallButton } from "@/components/pwa-install-prompt";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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

/**
 * Header band navy: identitas instansi di kiri, aksi dan akun di kanan.
 * Di layar sempit, baris aksi turun ke bawah dan navigasi Admin melebar penuh.
 */
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

  const initial = user.name.trim().charAt(0) || user.username.charAt(0);

  return (
    <header className="brand-band relative">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 pb-14 pt-5 sm:px-6 sm:pt-6 md:pb-16 lg:px-8">
        {/* Baris 1: identitas + (desktop) aksi */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <img
              src="/logo-ntt.png"
              alt="Lambang Provinsi Nusa Tenggara Timur"
              className="h-12 w-auto shrink-0 drop-shadow-[0_2px_6px_rgba(0,0,0,0.35)] sm:h-14 md:h-16"
              width={61}
              height={64}
            />
            <div className="min-w-0">
              <p className="eyebrow truncate text-white/60">
                UPTD Pendapatan Daerah · Kota Kupang
              </p>
              <h1 className="mt-0.5 text-balance text-xl font-extrabold leading-tight tracking-tight text-white sm:text-2xl lg:text-[1.75rem]">
                Kalkulator Pajak Kendaraan
              </h1>
              <p className="mt-1 hidden text-sm leading-snug text-white/70 sm:block">
                Penetapan PKB, Opsen, SWDKLLJ, dan PNBP sesuai Pergub NTT No. 54
                Tahun 2026
              </p>
            </div>
          </div>

          {/* Aksi desktop */}
          <div className="hidden shrink-0 items-center gap-2 md:flex">
            <PwaInstallButton />
            {view === "calculator" && <VehicleDataSourceSettings />}
            <span
              aria-hidden="true"
              className="mx-1 h-6 w-px bg-white/15"
            />
            <UserChip
              initial={initial}
              name={user.name}
              role={ROLE_LABEL[user.role]}
            />
            {isAdmin && (
              <LogoutButton loading={loggingOut} onClick={handleLogout} />
            )}
          </div>
        </div>

        {/* Subjudul mobile (satu baris, kecil) */}
        <p className="-mt-1 text-xs leading-snug text-white/70 sm:hidden">
          Penetapan PKB, Opsen, SWDKLLJ, dan PNBP sesuai Pergub NTT No. 54 Tahun
          2026
        </p>

        {/* Baris 2 mobile: akun + aksi ikon */}
        <div className="flex items-center justify-between gap-2 md:hidden">
          <UserChip
            initial={initial}
            name={user.name}
            role={ROLE_LABEL[user.role]}
            compact
          />
          <div className="flex shrink-0 items-center gap-1.5">
            <PwaInstallButton />
            {view === "calculator" && <VehicleDataSourceSettings compact />}
            {isAdmin && (
              <LogoutButton
                loading={loggingOut}
                onClick={handleLogout}
                iconOnly
              />
            )}
          </div>
        </div>

        {isAdmin && (
          <nav aria-label="Navigasi utama" className="flex md:justify-end">
            <div
              role="group"
              className="grid w-full grid-cols-2 gap-0.5 rounded-lg border border-white/12 bg-white/6 p-0.5 md:inline-flex md:w-auto"
            >
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
          </nav>
        )}
      </div>
      <div className="gold-rule absolute inset-x-0 bottom-0" aria-hidden="true" />
    </header>
  );
}

function UserChip({
  initial,
  name,
  role,
  compact = false,
}: {
  initial: string;
  name: string;
  role: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2.5 rounded-full border border-white/12 bg-white/6 py-1 pl-1 pr-3",
        compact ? "max-w-[60%]" : "max-w-[18rem]",
      )}
    >
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/90 text-sm font-bold uppercase text-navy-900"
        aria-hidden="true"
      >
        {initial}
      </span>
      <span className="min-w-0 truncate text-sm font-semibold text-white">
        {name}
      </span>
      <span className="shrink-0 rounded-full border border-gold-500/50 px-2 py-px text-[10px] font-bold uppercase tracking-[0.12em] text-gold-100">
        {role}
      </span>
    </div>
  );
}

function LogoutButton({
  loading,
  onClick,
  iconOnly = false,
}: {
  loading: boolean;
  onClick: () => Promise<void>;
  iconOnly?: boolean;
}) {
  const icon = loading ? (
    <Loader2 className="animate-spin" aria-hidden="true" />
  ) : (
    <LogOut aria-hidden="true" />
  );

  if (iconOnly) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="onDark"
            size="icon"
            onClick={() => void onClick()}
            disabled={loading}
            aria-busy={loading || undefined}
            aria-label="Keluar"
          >
            {icon}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Keluar</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Button
      type="button"
      variant="onDark"
      onClick={() => void onClick()}
      disabled={loading}
      aria-busy={loading || undefined}
    >
      {icon}
      Keluar
    </Button>
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
        "inline-flex h-10 items-center justify-center gap-2 rounded-[calc(var(--radius)-3px)] px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 md:h-9 [&_svg]:size-4",
        active
          ? "bg-white text-navy-900 shadow-xs"
          : "text-white/75 hover:bg-white/10 hover:text-white",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
