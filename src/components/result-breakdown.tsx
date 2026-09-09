import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { formatRupiah } from "@/lib/format";
import type { TaxCalculationResult } from "@/types/tax";

function DetailRow({
  label,
  value,
  waived = false,
}: {
  label: string;
  value: number;
  waived?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-3 py-0.5">
      <span className="min-w-0 text-sm leading-none text-muted-foreground">
        {label}
      </span>
      <span
        className={
          waived
            ? "numeric shrink-0 text-sm font-semibold text-success"
            : "numeric shrink-0 text-sm font-semibold text-foreground"
        }
      >
        {formatRupiah(value)}
      </span>
    </div>
  );
}

export function ResultBreakdown({ result }: { result: TaxCalculationResult }) {
  return (
    <Accordion
      type="multiple"
      defaultValue={[]}
      className="w-full min-w-0 transition-all duration-200"
    >
      <AccordionItem value="pkb">
        <AccordionTrigger className="text-sm hover:no-underline">
          <span>PKB</span>
          <span className="numeric ml-auto mr-3 text-sm font-semibold text-foreground">
            {formatRupiah(
              result.pkbBerjalan +
                result.pkbTunggakanPra2025 +
                result.pkbTunggakanPost2025,
            )}
          </span>
        </AccordionTrigger>
        <AccordionContent className="flex flex-col gap-0">
          <DetailRow
            label={
              result.pkbDiscount > 0
                ? `PKB berjalan · diskon ${result.pkbDiscount * 100}%`
                : "PKB berjalan"
            }
            value={result.pkbBerjalan}
          />
          {result.pkbTunggakanPost2025 > 0 && (
            <DetailRow
              label={`Tunggakan ≥ 5 Jan 2025 · ${result.tahunTunggakanPost} tahun`}
              value={result.pkbTunggakanPost2025}
            />
          )}
          {result.pkbTunggakanPra2025 > 0 && (
            <DetailRow
              label={`Tunggakan < 5 Jan 2025 · ${result.tahunTunggakanPra} tahun`}
              value={result.pkbTunggakanPra2025}
            />
          )}
          <DetailRow
            label="Denda PKB · dibebaskan 100%"
            value={result.dendaPkb}
            waived
          />
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="opsen">
        <AccordionTrigger className="text-sm hover:no-underline">
          <span>Opsen PKB</span>
          <span className="numeric ml-auto mr-3 text-sm font-semibold text-foreground">
            {formatRupiah(result.opsenBerjalan + result.opsenTunggakan)}
          </span>
        </AccordionTrigger>
        <AccordionContent className="flex flex-col gap-0">
          <DetailRow label="Opsen berjalan" value={result.opsenBerjalan} />
          {result.opsenTunggakan > 0 && (
            <DetailRow
              label={`Opsen tunggakan · ${result.tahunTunggakanPost} tahun`}
              value={result.opsenTunggakan}
            />
          )}
          <DetailRow
            label="Denda Opsen · dibebaskan 100%"
            value={result.dendaOpsen}
            waived
          />
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="swdkllj">
        <AccordionTrigger className="text-sm hover:no-underline">
          <span>SWDKLLJ</span>
          <span className="numeric ml-auto mr-3 text-sm font-semibold text-foreground">
            {formatRupiah(
              result.swdklljBerjalan +
                result.swdklljTunggakan +
                result.dendaSwdkllj,
            )}
          </span>
        </AccordionTrigger>
        <AccordionContent className="flex flex-col gap-0">
          <DetailRow label="SWDKLLJ berjalan" value={result.swdklljBerjalan} />
          {result.swdklljTunggakan > 0 && (
            <DetailRow
              label={`SWDKLLJ tunggakan · ${result.tahunTunggakan} tahun`}
              value={result.swdklljTunggakan}
            />
          )}
          {result.dendaSwdkllj > 0 && (
            <DetailRow
              label={`Denda SWDKLLJ · ${result.bulanTerlambat} bulan`}
              value={result.dendaSwdkllj}
            />
          )}
        </AccordionContent>
      </AccordionItem>

      {(result.biayaStnk > 0 ||
        result.biayaTnkb > 0 ||
        result.biayaTembakRu > 0) && (
        <AccordionItem value="biaya" className="transition-all duration-200">
          <AccordionTrigger className="text-sm hover:no-underline transition-all duration-200">
            <span>PNBP & Biaya Tambahan</span>
            <span className="numeric ml-auto mr-3 text-sm font-semibold text-foreground">
              {formatRupiah(
                result.biayaStnk + result.biayaTnkb + result.biayaTembakRu,
              )}
            </span>
          </AccordionTrigger>
          <AccordionContent className="flex flex-col gap-0">
            {result.biayaStnk > 0 && (
              <DetailRow label="PNBP STNK" value={result.biayaStnk} />
            )}
            {result.biayaTnkb > 0 && (
              <DetailRow label="PNBP TNKB" value={result.biayaTnkb} />
            )}
            {result.biayaTembakRu > 0 && (
              <DetailRow label="Tembak RU/STNK" value={result.biayaTembakRu} />
            )}
          </AccordionContent>
        </AccordionItem>
      )}
    </Accordion>
  );
}
