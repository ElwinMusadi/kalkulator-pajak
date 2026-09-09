import { useEffect, useRef, useState } from "react";
import { parseISO } from "date-fns";
import {
  ArrowLeftRight,
  Calculator,
  ChevronDown,
  CircleAlert,
  Landmark,
  ShieldCheck,
} from "lucide-react";
import { DatePickerField } from "@/components/date-picker-field";
import { FacilityToggle } from "@/components/facility-toggle";
import {
  NopolLookupIndicator,
  NopolLookupMessage,
} from "@/components/nopol-lookup-status";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useNopolLookup } from "@/hooks/use-nopol-lookup";
import { calculateTax } from "@/lib/tax-calculator";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BOBOT_MAP } from "@/types/tax";
import type { JenisKendaraan, TaxCalculationResult } from "@/types/tax";

const JENIS_OPTIONS: { value: JenisKendaraan; label: string }[] = [
  { value: "SEPEDA MOTOR", label: "Sepeda Motor · 1,00" },
  { value: "MINIBUS", label: "Minibus · 1,05" },
  { value: "PICK UP", label: "Pick Up · 1,085" },
  { value: "SEDAN", label: "Sedan · 1,025" },
  { value: "JEEP", label: "Jeep · 1,05" },
  { value: "LIGHT TRUCK", label: "Light Truck · 1,30" },
  { value: "MICROBUS", label: "Microbus · 1,085" },
  { value: "TRUCK", label: "Truck · 1,40" },
];

type FieldKey =
  | "njkb"
  | "jenis"
  | "jatuhTempoPajak"
  | "jatuhTempoStnk"
  | "tanggalBayar";

function normalizeJenis(raw: string | null): JenisKendaraan | undefined {
  if (!raw) return undefined;
  const upper = raw.toUpperCase().trim();
  const match = Object.keys(BOBOT_MAP).find((k) => k === upper);
  return match as JenisKendaraan | undefined;
}

function isoToDate(iso: string | null | undefined): Date | undefined {
  if (!iso) return undefined;
  try {
    return parseISO(iso);
  } catch {
    return undefined;
  }
}

/** Angka langkah + judul + hint — layout: nomor | konten */
function SectionLegend({
  step,
  title,
  hint,
}: {
  step: string;
  title: string;
  hint: string;
}) {
  return (
    <FieldLegend className="mb-1 flex w-full min-w-0 items-start gap-3">
      <span
        className="numeric step-badge mt-0! flex size-7 shrink-0 items-center justify-center rounded-md border text-xs font-bold"
        aria-hidden="true"
      >
        {step}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-base font-semibold tracking-tight">{title}</span>
        <span className="text-sm font-normal leading-snug text-muted-foreground">
          {hint}
        </span>
      </span>
    </FieldLegend>
  );
}

/**
 * Konten section diindentasi sejajar teks judul tahap.
 * `padding-left` dipakai, bukan `margin-left`, agar elemen `w-full`
 * tetap berada di dalam batas Card pada seluruh ukuran viewport.
 */
const INDENT = "pl-[calc(1.75rem+0.75rem)]"; // size-7 (28px) + gap-3 (12px)

interface TaxCalculatorFormProps {
  onResult: (result: TaxCalculationResult | null) => void;
}

export function TaxCalculatorForm({ onResult }: TaxCalculatorFormProps) {
  const [nopol, setNopol] = useState("");
  const [njkb, setNjkb] = useState("");
  const [njub, setNjub] = useState("0");
  const [bobot, setBobot] = useState<number | undefined>(undefined);
  const [jenisKendaraan, setJenisKendaraan] = useState<
    JenisKendaraan | undefined
  >(undefined);
  const [jatuhTempoPajak, setJatuhTempoPajak] = useState<Date | undefined>(
    undefined,
  );
  const [jatuhTempoStnk, setJatuhTempoStnk] = useState<Date | undefined>(
    undefined,
  );
  const [tanggalBayar, setTanggalBayar] = useState<Date | undefined>(
    () => new Date(),
  );
  const [isDomisiliGempa, setIsDomisiliGempa] = useState(false);
  const [isMutasiMasuk, setIsMutasiMasuk] = useState(false);
  const [isTembakRu, setIsTembakRu] = useState(false);
  const [facilityOpen, setFacilityOpen] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [invalidField, setInvalidField] = useState<FieldKey | null>(null);
  const hasCalculated = useRef(false);

  const {
    vehicleData,
    status: lookupStatus,
    errorMessage: lookupError,
  } = useNopolLookup(nopol);

  /** Mengosongkan seluruh data kendaraan saat Nopol berubah. */
  function resetVehicleFields() {
    setNjkb("");
    setNjub("0");
    setBobot(undefined);
    setJenisKendaraan(undefined);
    setJatuhTempoPajak(undefined);
    setJatuhTempoStnk(undefined);
    setIsDomisiliGempa(false);
    setIsMutasiMasuk(false);
    setIsTembakRu(false);
    setFacilityOpen(false);
    setValidationError(null);
    setInvalidField(null);
    hasCalculated.current = false;
    onResult(null);
  }

  useEffect(() => {
    if (!vehicleData) return;

    const jenisNormal = normalizeJenis(vehicleData.jenis);
    const stnkDate = isoToDate(vehicleData.jatuhTempoStnk);
    const pajakDate = isoToDate(vehicleData.jatuhTempoPajak);

    if (vehicleData.njkb > 0) setNjkb(String(vehicleData.njkb));
    setNjub(String(vehicleData.njub ?? 0));
    if (vehicleData.bobot) setBobot(vehicleData.bobot);
    if (jenisNormal) setJenisKendaraan(jenisNormal);
    if (stnkDate) setJatuhTempoStnk(stnkDate);
    if (pajakDate) setJatuhTempoPajak(pajakDate);

    // Data Nopol lengkap langsung menghasilkan ringkasan penetapan.
    // Fasilitas tambahan sengaja tetap nonaktif sampai pengguna mengaktifkannya.
    if (
      vehicleData.njkb > 0 &&
      jenisNormal &&
      stnkDate &&
      pajakDate &&
      tanggalBayar
    ) {
      hasCalculated.current = true;
      onResult(
        calculateTax({
          njkb: vehicleData.njkb,
          njub: vehicleData.njub ?? 0,
          bobot: vehicleData.bobot || BOBOT_MAP[jenisNormal],
          jenisKendaraan: jenisNormal,
          jatuhTempoPajak: pajakDate,
          jatuhTempoStnk: stnkDate,
          tanggalBayar,
          isDomisiliGempa: false,
          isMutasiMasuk: false,
          isTembakRu: false,
        }),
      );
    }
  }, [vehicleData, tanggalBayar, onResult]);

  const effectiveBobot =
    bobot ?? (jenisKendaraan ? BOBOT_MAP[jenisKendaraan] : 1.0);

  function getCalculatorInput() {
    const njkbNum = parseFloat(njkb);
    if (!njkb || isNaN(njkbNum) || njkbNum <= 0) return null;
    if (!jenisKendaraan || !jatuhTempoPajak || !jatuhTempoStnk || !tanggalBayar)
      return null;
    return {
      njkb: njkbNum,
      njub: parseFloat(njub) || 0,
      bobot: effectiveBobot,
      jenisKendaraan,
      jatuhTempoPajak,
      jatuhTempoStnk,
      tanggalBayar,
      isDomisiliGempa,
      isMutasiMasuk,
      isTembakRu,
    };
  }

  useEffect(() => {
    if (!hasCalculated.current) return;
    const input = getCalculatorInput();
    if (input) onResult(calculateTax(input));
  }, [isMutasiMasuk, isTembakRu, isDomisiliGempa]);

  // Buka accordion fasilitas otomatis saat salah satu toggle aktif
  const anyFacilityActive = isDomisiliGempa || isMutasiMasuk || isTembakRu;
  useEffect(() => {
    if (anyFacilityActive) setFacilityOpen(true);
  }, [anyFacilityActive]);

  function fail(field: FieldKey, message: string) {
    setInvalidField(field);
    setValidationError(message);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setValidationError(null);
    setInvalidField(null);
    const njkbNum = parseFloat(njkb);
    if (!njkb || isNaN(njkbNum) || njkbNum <= 0)
      return fail("njkb", "NJKB harus diisi dengan nilai lebih dari 0.");
    if (!jenisKendaraan) return fail("jenis", "Pilih jenis kendaraan.");
    if (!jatuhTempoPajak)
      return fail("jatuhTempoPajak", "Isi tanggal jatuh tempo pajak.");
    if (!jatuhTempoStnk)
      return fail("jatuhTempoStnk", "Isi tanggal jatuh tempo STNK.");
    if (!tanggalBayar) return fail("tanggalBayar", "Isi tanggal pembayaran.");
    const input = getCalculatorInput();
    if (!input) return;
    hasCalculated.current = true;
    onResult(calculateTax(input));
  }

  const njkbNumber = parseFloat(njkb);
  const njubNumber = parseFloat(njub);

  const activeFacilityCount = [
    isDomisiliGempa,
    isMutasiMasuk,
    isTembakRu,
  ].filter(Boolean).length;

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      {/* ── 1 · Identitas Kendaraan ── */}
      <FieldSet className="gap-3">
        <SectionLegend
          step="1"
          title="Identitas Kendaraan"
          hint="Masukkan nomor polisi untuk mengisi data secara otomatis."
        />
        <div className={cn("w-full min-w-0", INDENT)}>
          <Field>
            <FieldLabel htmlFor="nopol">Nomor Polisi</FieldLabel>
            <div className="relative">
              <Input
                id="nopol"
                value={nopol}
                onChange={(e) => {
                  // Setiap perubahan karakter Nopol mengosongkan data sebelumnya.
                  // Tanggal Pembayaran sengaja tidak di-reset.
                  resetVehicleFields();
                  setNopol(e.target.value.toUpperCase());
                }}
                placeholder="DH1234AB"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                className="numeric h-10 pr-10 text-base font-medium uppercase tracking-normal"
                maxLength={12}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                <NopolLookupIndicator status={lookupStatus} />
              </span>
            </div>
            <NopolLookupMessage
              status={lookupStatus}
              vehicleData={vehicleData}
              errorMessage={lookupError}
            />
          </Field>
        </div>
      </FieldSet>

      {/* ── 2 · Dasar Pengenaan ── */}
      <FieldSet className="gap-3">
        <SectionLegend
          step="2"
          title="Dasar Pengenaan"
          hint="Nilai jual dan bobot menentukan besaran PKB."
        />
        <div
          className={cn(
            "grid w-full min-w-0 grid-cols-1 gap-3 md:grid-cols-3",
            INDENT,
          )}
        >
          <Field data-invalid={invalidField === "njkb" || undefined}>
            <FieldLabel htmlFor="njkb">
              NJKB{" "}
              <span className="text-destructive" aria-hidden="true">
                *
              </span>
            </FieldLabel>
            <Input
              id="njkb"
              type="number"
              inputMode="numeric"
              value={njkb}
              onChange={(e) => {
                setNjkb(e.target.value);
                setBobot(undefined);
              }}
              placeholder="0"
              min={0}
              step={1000}
              aria-invalid={invalidField === "njkb" || undefined}
              className="numeric"
            />
            <FieldDescription>
              {!isNaN(njkbNumber) && njkbNumber > 0
                ? formatRupiah(njkbNumber)
                : "Nilai Jual Kendaraan Bermotor."}
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="njub">NJUB</FieldLabel>
            <Input
              id="njub"
              type="number"
              inputMode="numeric"
              value={njub}
              onChange={(e) => setNjub(e.target.value)}
              placeholder="0"
              min={0}
              step={1000}
              className="numeric"
            />
            <FieldDescription>
              {!isNaN(njubNumber) && njubNumber > 0
                ? `${formatRupiah(njubNumber)} ditambahkan ke dasar pengenaan.`
                : "Nilai ubah bentuk, jika ada."}
            </FieldDescription>
          </Field>

          <Field data-invalid={invalidField === "jenis" || undefined}>
            <FieldLabel htmlFor="jenis">
              Jenis Kendaraan{" "}
              <span className="text-destructive" aria-hidden="true">
                *
              </span>
            </FieldLabel>
            <Select
              value={jenisKendaraan}
              onValueChange={(v) => {
                setJenisKendaraan(v as JenisKendaraan);
                setBobot(undefined);
              }}
            >
              <SelectTrigger
                id="jenis"
                aria-invalid={invalidField === "jenis" || undefined}
              >
                <SelectValue placeholder="Pilih Jenis" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {JENIS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription className="flex flex-wrap items-center gap-1.5">
              {bobot !== undefined ? (
                <>
                  <Badge variant="secondary" className="numeric font-medium">
                    Bobot Data {bobot.toLocaleString("id-ID")}
                  </Badge>
                </>
              ) : (
                <span>Bobot mengikuti jenis kendaraan.</span>
              )}
            </FieldDescription>
          </Field>
        </div>
      </FieldSet>

      {/* ── 3 · Masa Pajak ── */}
      <FieldSet className="gap-3">
        <SectionLegend
          step="3"
          title="Masa Pajak"
          hint="Tanggal jatuh tempo dan pembayaran menentukan tunggakan dan diskon."
        />
        <div
          className={cn(
            "grid w-full min-w-0 grid-cols-1 gap-3 md:grid-cols-3",
            INDENT,
          )}
        >
          <DatePickerField
            id="jatuh-tempo-pajak"
            label="Jatuh Tempo Pajak"
            value={jatuhTempoPajak}
            onChange={setJatuhTempoPajak}
            required
            invalid={invalidField === "jatuhTempoPajak"}
          />
          <DatePickerField
            id="jatuh-tempo-stnk"
            label="Jatuh Tempo STNK"
            value={jatuhTempoStnk}
            onChange={setJatuhTempoStnk}
            required
            invalid={invalidField === "jatuhTempoStnk"}
          />
          <DatePickerField
            id="tanggal-bayar"
            label="Tanggal Pembayaran"
            value={tanggalBayar}
            onChange={setTanggalBayar}
            required
            invalid={invalidField === "tanggalBayar"}
          />
        </div>
      </FieldSet>

      {/* ── 4 · Fasilitas & Biaya Tambahan (Accordion) ── */}
      <FieldSet className="gap-0">
        {/* Header accordion — klik membuka/menutup */}
        <button
          type="button"
          onClick={() => setFacilityOpen((prev) => !prev)}
          aria-expanded={facilityOpen}
          aria-controls="facility-options"
          className="flex w-full min-w-0 items-start gap-3 text-left"
        >
          <span
            className="numeric step-badge mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border text-xs font-bold"
            aria-hidden="true"
          >
            4
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex min-w-0 items-center justify-between gap-2">
              <span className="text-base font-semibold tracking-tight">
                Fasilitas &amp; Biaya Tambahan
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                {activeFacilityCount > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {activeFacilityCount} Aktif
                  </Badge>
                )}
                <ChevronDown
                  className={cn(
                    "size-4 text-muted-foreground transition-transform duration-200",
                    facilityOpen && "rotate-180",
                  )}
                  aria-hidden="true"
                />
              </span>
            </span>
            <span className="text-sm font-normal leading-snug text-muted-foreground">
              Aktifkan yang berlaku bagi wajib pajak ini.
            </span>
          </span>
        </button>

        {/* Konten accordion */}
        <div
          id="facility-options"
          className={cn(
            "overflow-hidden transition-all duration-200",
            facilityOpen
              ? "mt-3 max-h-160 opacity-100"
              : "max-h-0 opacity-0 pointer-events-none",
          )}
          aria-hidden={!facilityOpen}
        >
          <div className={cn("flex flex-col gap-2.5", INDENT)}>
            <FacilityToggle
              id="is-gempa"
              title="Wilayah Terdampak Gempa (Diskon tunggakan 75%)"
              description="Sikka, Ende, Nagekeo, Ngada, Manggarai, Manggarai Timur, Manggarai Barat."
              impact=""
              checked={isDomisiliGempa}
              onCheckedChange={setIsDomisiliGempa}
              icon={<ShieldCheck />}
            />
            <FacilityToggle
              id="is-mutasi-masuk"
              title="Mutasi Masuk Luar Daerah (Diskon PKB berjalan 50%)"
              description="Menggantikan diskon pembayaran awal pada PKB berjalan."
              impact=""
              checked={isMutasiMasuk}
              onCheckedChange={setIsMutasiMasuk}
              icon={<ArrowLeftRight />}
            />
            <FacilityToggle
              id="is-tembak-ru"
              title="Biaya Tembak RU/STNK"
              description="Motor Rp150.000 · Mobil Rp250.000."
              impact=""
              checked={isTembakRu}
              onCheckedChange={setIsTembakRu}
              icon={<Landmark />}
            />
          </div>
        </div>
      </FieldSet>

      {validationError && (
        <Alert variant="destructive" className={cn("animate-fade-up", INDENT)}>
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Data Belum Lengkap</AlertTitle>
          <AlertDescription>{validationError}</AlertDescription>
        </Alert>
      )}

      <Button
        type="submit"
        size="lg"
        className="h-11 w-full text-base font-semibold"
      >
        <Calculator data-icon="inline-start" aria-hidden="true" />
        Hitung Penetapan
      </Button>
    </form>
  );
}
