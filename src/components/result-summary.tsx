import { useState } from "react"
import { Check, Copy, ShieldCheck } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatRupiah } from "@/lib/format"
import type { TaxCalculationResult } from "@/types/tax"

interface ResultSummaryProps {
  result: TaxCalculationResult
  compact?: boolean
}

function SummaryLine({ label, value }: { label: string; value: number }) {
  if (value <= 0) return null
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="numeric text-sm font-semibold text-foreground">{formatRupiah(value)}</span>
    </div>
  )
}

export function ResultSummary({ result, compact = false }: ResultSummaryProps) {
  const [copied, setCopied] = useState(false)
  const pokokPkb = result.pkbBerjalan + result.pkbTunggakanPra2025 + result.pkbTunggakanPost2025
  const pokokOpsen = result.opsenBerjalan + result.opsenTunggakan
  const swdkllj = result.swdklljBerjalan + result.swdklljTunggakan + result.dendaSwdkllj
  const pnbp = result.biayaStnk + result.biayaTnkb

  async function copySummary() {
    const text = [
      "RINGKASAN PENETAPAN PAJAK KENDARAAN",
      `PKB: ${formatRupiah(pokokPkb)}`,
      `Opsen PKB: ${formatRupiah(pokokOpsen)}`,
      `SWDKLLJ: ${formatRupiah(swdkllj)}`,
      `PNBP: ${formatRupiah(pnbp)}`,
      result.biayaTembakRu > 0 ? `Biaya tambahan: ${formatRupiah(result.biayaTembakRu)}` : null,
      `Total bayar: ${formatRupiah(result.total)}`,
      "Denda PKB dan Opsen: dibebaskan 100%",
    ]
      .filter(Boolean)
      .join("\n")

    await navigator.clipboard.writeText(text)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <section className={compact ? "flex min-w-0 flex-col gap-4" : "flex min-w-0 flex-col gap-5"}>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Ringkasan penetapan
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {result.tahunTunggakan > 0
              ? `${result.tahunTunggakan} tahun tunggakan dihitung`
              : "Tidak ada pokok tunggakan"}
          </p>
        </div>
        <Badge variant={result.tahunTunggakan > 0 ? "secondary" : "outline"} className="shrink-0">
          {result.tahunTunggakan > 0 ? "Ada Tunggakan" : "Tahun Berjalan"}
        </Badge>
      </div>

      <div className="total-block min-w-0 rounded-lg border p-4">
        <div className="flex min-w-0 items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              Total Bayar
            </p>
            <p className="numeric mt-1 whitespace-nowrap text-[clamp(1.5rem,7vw,2.25rem)] font-bold leading-none tracking-tight text-primary">
              {formatRupiah(result.total)}
            </p>
          </div>
          {!compact && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Salin ringkasan penetapan"
                  onClick={() => void copySummary()}
                >
                  {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{copied ? "Ringkasan disalin" : "Salin ringkasan"}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {!compact && (
        <>
          <div className="flex flex-col gap-2.5">
            <SummaryLine label="Pokok PKB" value={pokokPkb} />
            <SummaryLine label="Opsen PKB" value={pokokOpsen} />
            <SummaryLine label="SWDKLLJ" value={swdkllj} />
            <SummaryLine label="PNBP STNK & TNKB" value={pnbp} />
            <SummaryLine label="Biaya Tambahan" value={result.biayaTembakRu} />
          </div>

          <div className="amnesty-badge flex items-start gap-2.5 rounded-md border px-3 py-2.5">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-foreground">Fasilitas Tax Amnesty Aktif</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                Denda keterlambatan PKB dan Opsen dibebaskan 100%. Pokok pajak dan SWDKLLJ tetap diperhitungkan.
              </p>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
