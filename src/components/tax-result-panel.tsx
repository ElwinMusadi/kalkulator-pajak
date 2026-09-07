import { Separator } from "@/components/ui/separator"
import { formatRupiah } from "@/lib/format"
import type { TaxCalculationResult } from "@/types/tax"

interface TaxResultPanelProps {
  result: TaxCalculationResult
}

interface ResultRowProps {
  label: string
  value: string
  isGreen?: boolean
  isBold?: boolean
}

function ResultRow({ label, value, isGreen = false, isBold = false }: ResultRowProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className={cn("text-sm text-muted-foreground", isBold && "font-medium text-foreground")}>
        {label}
      </span>
      <span
        className={cn(
          "text-sm font-medium text-right shrink-0",
          isGreen ? "text-green-600 dark:text-green-400" : "text-foreground",
          isBold && "font-semibold"
        )}
      >
        {value}
      </span>
    </div>
  )
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ")
}

export function TaxResultPanel({ result }: TaxResultPanelProps) {
  const {
    pkbBerjalan,
    pkbDiscount,
    pkbTunggakan,
    tahunTunggakan,
    dendaPkb,
    opsenBerjalan,
    opsenTunggakan,
    swdklljBerjalan,
    swdklljTunggakan,
    dendaSwdkllj,
    biayaStnk,
    biayaTnkb,
    biayaTembakRu,
    total,
  } = result

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-base border-b pb-2">Rincian Pembayaran</h3>

      <div className="space-y-2">
        {/* PKB */}
        <ResultRow
          label={`PKB Berjalan${pkbDiscount > 0 ? ` (Diskon ${pkbDiscount * 100}%)` : ""}`}
          value={formatRupiah(pkbBerjalan)}
        />

        {tahunTunggakan > 0 && (
          <ResultRow
            label={`PKB Tunggakan (${tahunTunggakan} Thn – Diskon 50%)`}
            value={formatRupiah(pkbTunggakan)}
          />
        )}

        <ResultRow
          label="Denda PKB (Tax Amnesty)"
          value={formatRupiah(dendaPkb)}
          isGreen
        />

        {/* Opsen */}
        <Separator className="my-1" />
        <ResultRow
          label="Opsen PKB (Berjalan)"
          value={formatRupiah(opsenBerjalan)}
        />
        {opsenTunggakan > 0 && (
          <ResultRow
            label="Opsen PKB (Tunggakan)"
            value={formatRupiah(opsenTunggakan)}
          />
        )}

        {/* SWDKLLJ */}
        <Separator className="my-1" />
        <ResultRow
          label="SWDKLLJ (Berjalan)"
          value={formatRupiah(swdklljBerjalan)}
        />
        {swdklljTunggakan > 0 && (
          <ResultRow
            label={`SWDKLLJ (Tunggakan ${tahunTunggakan} Thn)`}
            value={formatRupiah(swdklljTunggakan)}
          />
        )}
        {dendaSwdkllj > 0 && (
          <ResultRow
            label="Denda SWDKLLJ"
            value={formatRupiah(dendaSwdkllj)}
          />
        )}

        {/* PNBP */}
        {(biayaStnk > 0 || biayaTnkb > 0) && (
          <>
            <Separator className="my-1" />
            {biayaStnk > 0 && (
              <ResultRow label="PNBP STNK" value={formatRupiah(biayaStnk)} />
            )}
            {biayaTnkb > 0 && (
              <ResultRow label="PNBP TNKB" value={formatRupiah(biayaTnkb)} />
            )}
          </>
        )}

        {/* Biaya tambahan */}
        {biayaTembakRu > 0 && (
          <>
            <Separator className="my-1" />
            <ResultRow
              label="Biaya Tembak RU/STNK"
              value={formatRupiah(biayaTembakRu)}
            />
          </>
        )}
      </div>

      {/* Total */}
      <Separator />
      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="font-bold text-base">Total Bayar</span>
        <span className="text-xl font-bold text-red-600 dark:text-red-500">
          {formatRupiah(total)}
        </span>
      </div>
    </div>
  )
}
