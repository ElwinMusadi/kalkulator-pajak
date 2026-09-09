import { Badge } from "@/components/ui/badge"

export function AppHeader() {
  return (
    <header className="flex flex-col gap-4 border-b border-border/70 pb-6 md:flex-row md:items-end md:justify-between">
      <div className="flex min-w-0 items-start gap-3 sm:items-center sm:gap-4">
        <img
          src="/logo-ntt.png"
          alt="Lambang Provinsi Nusa Tenggara Timur"
          className="h-12 w-auto shrink-0 sm:h-16"
          width={61}
          height={64}
        />
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase leading-snug tracking-[0.16em] text-muted-foreground sm:text-[11px]">
            UPT Pendapatan Daerah Wilayah Kota Kupang
          </p>
          <h1 className="mt-1 text-xl font-bold leading-tight tracking-tight text-foreground sm:text-2xl lg:text-[28px]">
            Kalkulator Pajak Kendaraan
          </h1>
          <p className="mt-1 text-sm leading-snug text-muted-foreground">
            Simulasi PKB, Opsen, SWDKLLJ, dan PNBP dengan fasilitas Tax Amnesty.
          </p>
        </div>
      </div>
      <Badge variant="secondary" className="w-fit shrink-0 font-medium">
        Pergub NTT No. 54 Tahun 2026
      </Badge>
    </header>
  )
}
