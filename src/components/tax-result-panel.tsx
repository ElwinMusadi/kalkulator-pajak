import { Separator } from "@/components/ui/separator"
import { formatRupiah } from "@/lib/format"
import type { TaxCalculationResult } from "@/types/tax"

interface TaxResultPanelProps {
  result: TaxCalculationResult
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ")
}

interface RowProps {
  label: string
  value: string | number
  isGreen?: boolean
  isMuted?: boolean
  isTotal?: boolean
}

function Row({ label, value, isGreen = false, isMuted = false, isTotal = false }: RowProps) {
  const displayed = typeof value === "number" ? formatRupiah(value) : value
  return (
    <div className="flex items-start justify-between gap-2">
      <span
        className={cn(
          "text-sm leading-snug",
          isTotal && "font-bold text-foreground",
          !isTotal && isMuted && "text-muted-foreground",
          !isTotal && !isMuted && "text-muted-foreground"
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "text-sm font-medium text-right shrink-0",
          isGreen && "text-green-600 dark:text-green-400",
          isTotal && "text-xl font-bold text-red-600 dark:text-red-500"
        )}
      >
        {displayed}
      </span>
    </div>
  )
}

export function TaxResultPanel({ result }: TaxResultPanelProps) {
  const {
    pkbBerjalan,
    pkbDiscount,
    pkbTunggakanPra2025,
    pkbTunggakanPost2025,
    tahunTunggakanPra,
    tahunTunggakanPost,
    tahunTunggakan,
    dendaPkb,
    opsenBerjalan,
    opsenTunggakan,
    dendaOpsen,
    bulanTerlambat,
    swdklljBerjalan,
    swdklljTunggakan,
    dendaSwdkllj,
    biayaStnk,
    biayaTnkb,
    biayaTembakRu,
    total,
  } = result

  const adaTunggakan = tahunTunggakan > 0
  const adaOpsenTunggakan = opsenTunggakan > 0
  const terlambat = bulanTerlambat > 0

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-base border-b pb-2 dark:border-gray-700">
        Rincian Pembayaran
      </h3>

      <div className="space-y-2">

        {/* ── PKB ── */}
        <Row
          label={
            pkbDiscount > 0
              ? `PKB Berjalan (Diskon ${pkbDiscount * 100}%)`
              : "PKB Berjalan"
          }
          value={pkbBerjalan}
        />

        {pkbTunggakanPost2025 > 0 && (
          <Row
            label={`PKB Tunggakan ≥5 Jan 2025 (${tahunTunggakanPost} thn, tarif 1,2%, Diskon ${result.tahunTunggakanPra + result.tahunTunggakanPost > 0 && result.tahunTunggakanPra === 0 ? "" : ""}50%)`}
            value={pkbTunggakanPost2025}
          />
        )}

        {pkbTunggakanPra2025 > 0 && (
          <Row
            label={`PKB Tunggakan <5 Jan 2025 (${tahunTunggakanPra} thn, tarif 1,5%, Diskon 50%)`}
            value={pkbTunggakanPra2025}
          />
        )}

        <Row
          label="Denda PKB (Tax Amnesty – Hapus 100%)"
          value={formatRupiah(dendaPkb)}
          isGreen
        />

        {/* ── Opsen ── */}
        <Separator className="my-1" />

        {opsenBerjalan > 0 && (
          <Row label="Opsen PKB (Berjalan)" value={opsenBerjalan} />
        )}

        {adaOpsenTunggakan && (
          <Row
            label={`Opsen PKB Tunggakan (${tahunTunggakanPost} thn ≥5 Jan 2025)`}
            value={opsenTunggakan}
          />
        )}

        {terlambat && dendaOpsen > 0 && (
          <Row
            label={`Denda Opsen PKB (${bulanTerlambat} bln × 1%)`}
            value={dendaOpsen}
          />
        )}

        {/* ── SWDKLLJ ── */}
        <Separator className="my-1" />

        <Row label="SWDKLLJ (Berjalan)" value={swdklljBerjalan} />

        {adaTunggakan && swdklljTunggakan > 0 && (
          <Row
            label={`SWDKLLJ Tunggakan (${tahunTunggakan} thn)`}
            value={swdklljTunggakan}
          />
        )}

        {dendaSwdkllj > 0 && (
          <Row
            label={`Denda SWDKLLJ (${bulanTerlambat} bln terlambat)`}
            value={dendaSwdkllj}
          />
        )}

        {/* ── PNBP ── */}
        {(biayaStnk > 0 || biayaTnkb > 0) && (
          <>
            <Separator className="my-1" />
            {biayaStnk > 0 && <Row label="PNBP STNK" value={biayaStnk} />}
            {biayaTnkb > 0 && <Row label="PNBP TNKB" value={biayaTnkb} />}
          </>
        )}

        {/* ── Biaya tambahan ── */}
        {biayaTembakRu > 0 && (
          <>
            <Separator className="my-1" />
            <Row label="Biaya Tembak RU/STNK" value={biayaTembakRu} />
          </>
        )}
      </div>

      {/* ── Total ── */}
      <Separator />
      <Row label="Total Bayar" value={total} isTotal />
    </div>
  )
}
