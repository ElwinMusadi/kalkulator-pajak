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
import {
  BIAYA_LAYANAN_KEYS,
  BIAYA_LAYANAN_LABEL,
  WARNA_PLAT_LABEL,
  type TaxCalculationResult,
} from "@/types/tax";

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
  // Jatuh tempo pajak masih > 90 hari lagi dan tanpa tunggakan → pajak masih
  // aktif. Biaya tetap ditampilkan; hanya keterangan status yang berubah.
  const isPajakAktif =
    result.tahunTunggakan === 0 && result.hariMenujuJatuhTempo > 90;
  const statusLine =
    result.tahunTunggakan > 0
      ? `${result.tahunTunggakan} tahun tunggakan · 1 tahun berjalan`
      : isPajakAktif
        ? "Pajak Aktif"
        : "Tidak ada tunggakan · bayar tahun berjalan";
  // Mengikuti pilihan gempa yang benar-benar dipakai perhitungan (termasuk
  // override manual). Diskon 75% hanya berlaku pada pokok tunggakan.
  const gempaLine = result.isDomisiliGempa
    ? result.tahunTunggakan > 0
      ? "Wilayah Terdampak Gempa — Diskon Tunggakan 75%."
      : "Wilayah Terdampak Gempa — Diskon Tunggakan 75% berlaku bila ada tunggakan."
    : null;

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
      // Biaya BBN & Mutasi: satu baris total diikuti rincian biaya yang terisi.
      ...(result.totalBiayaLayanan > 0
        ? [
            `Biaya BBN & Mutasi: ${formatRupiah(result.totalBiayaLayanan)}`,
            ...BIAYA_LAYANAN_KEYS.filter((key) => result.biayaLayanan[key] > 0).map(
              (key) =>
                `  - ${BIAYA_LAYANAN_LABEL[key]}: ${formatRupiah(result.biayaLayanan[key])}`,
            ),
          ]
        : []),
      `Total bayar: ${formatRupiah(result.total)}`,
      "Denda PKB dan Opsen: dibebaskan 100%",
      gempaLine,
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
        <div className="min-w-0">
          <p className="text-[0.8125rem] font-medium text-muted-foreground">
            Hasil Penetapan
          </p>
          <h3 className="mt-0.5 text-[1.375rem] font-semibold leading-tight text-foreground">
            Rincian Pembayaran
          </h3>
        </div>
      )}

      {/* Blok total — fokus utama: permukaan solid, aksen teal lembut. */}
      <div className="relative overflow-hidden rounded-[1.25rem] border border-primary/15 bg-primary/[0.06] p-5 dark:bg-primary/10">
        {/* Tombol salin diposisikan absolut agar tingginya tidak menambah
            jarak antara label "Total Bayar" dan nominal. */}
        <p className="pr-12 text-[0.9375rem] font-medium leading-tight text-muted-foreground">
          Total Bayar
        </p>
        <div className="absolute right-2.5 top-2.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11 rounded-full text-primary hover:bg-primary/10 hover:text-primary [&_svg]:stroke-[1.75]"
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
          className="animate-value-settle monetary mt-1.5 break-words text-[clamp(1.875rem,8.5vw,2.5rem)] font-bold leading-none tracking-tight text-primary lg:text-[2.25rem] xl:text-[2.5rem]"
        >
          {formatRupiah(result.total)}
        </p>
        <div className="my-3.5 h-px bg-primary/15" aria-hidden="true" />
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
          {isPajakAktif ? (
            <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-success">
              <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
              {statusLine}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">{statusLine}</p>
          )}
          {/* Hanya plat merah (tarif khusus); berbeda dari PNBP TNKB (biaya plat). */}
          {isPlatMerah && (
            <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium text-foreground">
              <PlateColorSwatch warna={result.warnaPlat} />
              <span className="min-w-0">
                Tarif PKB{" "}
                <span className="numeric font-semibold">{tarifLabel}</span> ·
                Plat {WARNA_PLAT_LABEL[result.warnaPlat]}
              </span>
            </span>
          )}
        </div>
      </div>

      {/* Catatan Tax Amnesty */}
      <div className="amnesty-badge flex items-start gap-2.5 rounded-2xl border px-3.5 py-3">
        <ShieldCheck
          className="mt-0.5 size-4 shrink-0 text-success"
          aria-hidden="true"
        />
        <div className="min-w-0 text-[0.8125rem] leading-relaxed text-foreground">
          <p>
            <span className="font-semibold">Tax Amnesty aktif.</span> Denda PKB
            dan Opsen dibebaskan 100%; pokok pajak dan SWDKLLJ tetap
            diperhitungkan.
          </p>
          {gempaLine && (
            <p className="mt-1 font-semibold">{gempaLine}</p>
          )}
        </div>
      </div>

      <ResultBreakdown result={result} compact={compact} />
    </section>
  );
}
