import { useState } from "react";
import type { ReactNode } from "react";
import { Calculator, Loader2, LogOut, Users } from "lucide-react";
import { useAuthenticatedUser, useAuth } from "@/auth/auth-context";
import { PwaInstallButton } from "@/components/pwa-install-prompt";
import { ThemeSwitch } from "@/components/theme-switch";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
 * Toolbar navigasi ringkas (material kaca tipis; lengket di atas hanya ≥1024px).
 * Kiri: identitas aplikasi + instansi. Kanan: Instal, Sumber Data, Mode Gelap
 * (≥640px), Akun. Di ponsel switch Mode Gelap menempati baris terakhir toolbar
 * agar tetap terlihat tanpa membuka menu akun.
 * Admin mendapat kontrol segmented Kalkulator/Kelola User — baris kedua pada
 * layar sempit, di tengah toolbar pada ≥1024px. Petugas tidak mendapat slot
 * navigasi kosong dan tidak memiliki aksi Keluar.
 */
export function AppHeader({ view, onViewChange, onError }: AppHeaderProps) {
  const user = useAuthenticatedUser();
  const isAdmin = user.role === "admin";

  return (
    // Lengket hanya ≥1024px (toolbar satu baris, ±60px). Di ponsel/tablet,
    // landscape pendek, dan zoom/teks besar, header bisa 2–3 baris (navigasi
    // Admin + Mode Gelap); bila lengket ia menutupi kontrol dan menghalangi
    // ketukan/scroll-into-view, jadi di sana header ikut menggulir.
    <header className="ios-toolbar relative z-30 pt-[env(safe-area-inset-top)] lg:sticky lg:top-0">
      <div className="ios-page flex flex-wrap items-center gap-x-3 gap-y-2 py-2">
        {/* Identitas */}
        <div className="order-1 flex min-w-0 flex-1 items-center gap-2.5">
          <img
            src="/logo-ntt.png"
            alt="Lambang Provinsi Nusa Tenggara Timur"
            className="h-8 w-auto shrink-0"
            width={61}
            height={64}
          />
          <div className="min-w-0">
            <h1 className="line-clamp-2 text-[0.9375rem] font-semibold leading-tight tracking-tight text-foreground sm:text-[1.0625rem]">
              Kalkulator Pajak
              <span className="sr-only sm:not-sr-only"> Kendaraan</span>
            </h1>
            <p className="truncate text-xs leading-snug text-muted-foreground">
              UPTD Pendapatan Daerah · Kota Kupang
            </p>
          </div>
        </div>

        {/* Aksi */}
        <div className="order-2 flex shrink-0 items-center justify-end gap-1.5 lg:order-3 lg:flex-1">
          <PwaInstallButton className="w-11 sm:w-auto" />
          {view === "calculator" && <VehicleDataSourceSettings compact />}
          <ThemeSwitch className="hidden sm:flex" />
          <AccountMenu
            name={user.name}
            username={user.username}
            role={ROLE_LABEL[user.role]}
            canLogout={isAdmin}
            onError={onError}
          />
        </div>

        {isAdmin && (
          <nav
            aria-label="Navigasi utama"
            className="order-3 w-full pb-1 lg:order-2 lg:w-auto lg:pb-0"
          >
            <div className="ios-segmented w-full sm:mx-auto sm:flex sm:max-w-sm lg:w-auto">
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

        {/* Ponsel: baris toolbar kedua agar identitas & aksi tidak terdesak. */}
        <ThemeSwitch variant="row" className="order-4 w-full sm:hidden" />
      </div>
    </header>
  );
}

function AccountMenu({
  name,
  username,
  role,
  canLogout,
  onError,
}: {
  name: string;
  username: string;
  role: string;
  canLogout: boolean;
  onError: (message: string) => void;
}) {
  const { logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const initial = name.trim().charAt(0) || username.charAt(0);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
    } catch (error) {
      onError(isApiError(error) ? error.message : "Gagal keluar. Coba lagi.");
      setLoggingOut(false);
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Akun: ${name}, ${role}`}
          className="flex h-11 min-w-11 max-w-[15rem] items-center gap-2 rounded-full p-1.5 text-left transition-colors hover:bg-[var(--ios-fill)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 md:bg-[var(--ios-fill)] md:pr-3.5 md:hover:bg-[var(--ios-fill-strong)]"
        >
          <Avatar initial={initial} />
          <span className="hidden min-w-0 flex-col md:flex">
            <span className="truncate text-sm font-semibold leading-tight text-foreground">
              {name}
            </span>
            <span className="text-xs leading-tight text-muted-foreground">
              {role}
            </span>
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 max-w-[calc(100vw-2rem)] p-0">
        <div className="flex items-center gap-3 p-4">
          <Avatar initial={initial} large />
          <div className="min-w-0">
            <p className="break-words text-[0.9375rem] font-semibold leading-snug text-foreground">
              {name}
            </p>
            <p className="break-all text-sm text-muted-foreground">@{username}</p>
            <span className="mt-1 inline-flex rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground">
              {role}
            </span>
          </div>
        </div>
        {canLogout && (
          <div className="border-t border-border p-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => void handleLogout()}
              disabled={loggingOut}
              aria-busy={loggingOut || undefined}
              className="w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              {loggingOut ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <LogOut aria-hidden="true" />
              )}
              {loggingOut ? "Keluar…" : "Keluar"}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function Avatar({ initial, large = false }: { initial: string; large?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-primary font-semibold uppercase text-primary-foreground",
        large ? "size-11 text-lg" : "size-8 text-sm",
      )}
    >
      {initial}
    </span>
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
      className="[&_svg]:size-4 [&_svg]:shrink-0"
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}
