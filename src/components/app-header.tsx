import { Badge } from "@/components/ui/badge";
import { PwaInstallButton } from "@/components/pwa-install-prompt";
import { VehicleDataSourceSettings } from "@/components/vehicle-data-source-settings";

export function AppHeader() {
  return (
    <header className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 border-b border-border/70 pb-5 md:grid-cols-[auto_minmax(0,1fr)_auto]">
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
      <div className="col-start-2 flex shrink-0 items-center gap-2 md:col-start-3 md:row-start-1 md:self-end">
        <PwaInstallButton />
        <VehicleDataSourceSettings />
        <Badge variant="secondary" className="w-fit font-medium">
          Pergub NTT No. 54 Tahun 2026
        </Badge>
      </div>
    </header>
  );
}
