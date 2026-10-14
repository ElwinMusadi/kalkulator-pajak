import { useState } from "react";
import { Check, Copy, ShieldCheck } from "lucide-react";
import { PlateColorSwatch } from "@/components/plate-color-swatch";
import { ResultBreakdown } from "@/components/result-breakdown";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatPersen, formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";
import { WARNA_PLAT_LABEL, type TaxCalculationResult } from "@/types/tax";

interface ResultSummaryProps {
  result: TaxCalculationResult;
  compact?: boolean;
}

export function ResultSummary({ result, compact = false }: ResultSummaryProps) {
  const [copied, setCopied] = useState(false);
  const pokokPkb =
    result.pkbBerjalan +
    result.pkbTunggakanPra2025 +
    result.pkbTunggakanPost2025;
  const pokokOpsen = result.opsenBerjalan + result.opsenTunggakan;
  const swdkllj =
    result.swdklljBerjalan + result.swdklljTunggakan + result.dendaSwdkllj;
  const pnbp = result.biayaStnk + result.biayaTnkb;
  // Informasi tarif hanya ditampilkan untuk plat merah (tarif khusus 0,5%);
  // plat putih/hitam memakai tarif umum sehingga tidak perlu ditandai.
  const isPlatMerah = result.warnaPlat === "merah";
  const tarifLabel = formatPersen(result.tarifPkbBerjalan);
  const statusLine =
    result.tahunTunggakan > 0
      ? `${result.tahunTunggakan} tahun tunggakan · 1 tahun berjalan`
      : "Tidak ada tunggakan · bayar tahun berjalan";

  async function copySummary() {
    const text = [
      "RINGKASAN PENETAPAN PAJAK KENDARAAN",
      isPlatMerah
        ? `Plat ${WARNA_PLAT_LABEL[result.warnaPlat]} · Tarif PKB ${tarifLabel}`
        : null,
      `PKB: ${formatRupiah(pokokPkb)}`,
      `Opsen PKB: ${formatRupiah(pokokOpsen)}`,
      `SWDKLLJ: ${formatRupiah(swdkllj)}`,
      `PNBP: ${formatRupiah(pnbp)}`,
      result.biayaTembakRu > 0
        ? `Biaya tambahan: ${formatRupiah(result.biayaTembakRu)}`
        : null,
      `Total bayar: ${formatRupiah(result.total)}`,
      "Denda PKB dan Opsen: dibebaskan 100%",
    ]
      .filter(Boolean)
      .join("\n");

    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <section
      aria-label="Hasil penetapan"
      className={cn("flex min-w-0 flex-col", compact ? "gap-3" : "gap-4")}
    >
      {!compact && (
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="eyebrow">Hasil penetapan</p>
            <h3 className="mt-0.5 text-lg font-bold leading-tight tracking-tight text-foreground">
              Rincian Pembayaran
            </h3>
          </div>
        </div>
      )}

      {/* Tile total — fokus utama panel. */}
      <div className="brand-band relative overflow-hidden rounded-xl p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="eyebrow text-white/65">Total Bayar</p>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="onDark"
                size="icon"
                className="-mr-1.5 -mt-1.5 size-9 border-transparent bg-transparent"
                aria-label={
                  copied ? "Ringkasan disalin" : "Salin ringkasan penetapan"
                }
                onClick={() => void copySummary()}
              >
                {copied ? (
                  <Check aria-hidden="true" />
                ) : (
                  <Copy aria-hidden="true" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {copied ? "Tersalin" : "Salin ringkasan"}
            </TooltipContent>
          </Tooltip>
        </div>
        <p
          key={result.total}
          className="animate-value-settle font-plate mt-1 whitespace-nowrap text-[clamp(2rem,9vw,2.75rem)] font-bold leading-none tracking-tight tabular-nums text-white lg:text-[2.5rem] xl:text-[2.75rem]"
        >
          {formatRupiah(result.total)}
        </p>
        <div className="gold-rule my-3.5 opacity-80" aria-hidden="true" />
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
          <p className="text-sm text-white/75">{statusLine}</p>
          {/* Hanya plat merah (tarif khusus); berbeda dari PNBP TNKB (biaya plat). */}
          {isPlatMerah && (
            <span className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-white/20 bg-white/10 px-2 py-0.5 text-xs font-medium text-white">
              <PlateColorSwatch warna={result.warnaPlat} />
              <span className="min-w-0 truncate">
                Tarif PKB{" "}
                <span className="numeric font-semibold">{tarifLabel}</span> ·
                Plat {WARNA_PLAT_LABEL[result.warnaPlat]}
              </span>
            </span>
          )}
        </div>
      </div>

      {/* Catatan Tax Amnesty */}
      <div className="amnesty-badge flex items-start gap-2.5 rounded-lg border px-3 py-2.5">
        <ShieldCheck
          className="mt-0.5 size-4 shrink-0 text-success"
          aria-hidden="true"
        />
        <p className="text-xs leading-relaxed text-foreground">
          <span className="font-semibold">Tax Amnesty aktif.</span> Denda PKB
          dan Opsen dibebaskan 100%; pokok pajak dan SWDKLLJ tetap
          diperhitungkan.
        </p>
      </div>

      <ResultBreakdown result={result} compact={compact} />
    </section>
  );
}
