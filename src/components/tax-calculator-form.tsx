import { useEffect, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  ArrowLeftRight,
  Calculator,
  CircleAlert,
  Info,
  Landmark,
  ShieldCheck,
} from "lucide-react";
import { DatePickerField } from "@/components/date-picker-field";
import { FacilityToggle } from "@/components/facility-toggle";
import {
  FormStepAccordion,
  FormStepHeading,
  type StepStatusTone,
} from "@/components/form-step-accordion";
import {
  NopolLookupDisabledMessage,
  NopolLookupIndicator,
  NopolLookupMessage,
} from "@/components/nopol-lookup-status";
import { PlateColorRadioGroup } from "@/components/plate-color-radio-group";
import { useAuth } from "@/auth/auth-context";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Accordion } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
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
import { useEffectiveVehicleDataSource } from "@/hooks/use-effective-vehicle-data-source";
import { useNopolLookup } from "@/hooks/use-nopol-lookup";
import { calculateTax } from "@/lib/tax-calculator";
import { formatPersen, formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  BOBOT_MAP,
  DEFAULT_WARNA_PLAT,
  TARIF_PKB_PLAT_MERAH,
  WARNA_PLAT_LABEL,
  isWarnaPlat,
} from "@/types/tax";
import type {
  JenisKendaraan,
  TaxCalculationResult,
  VehicleData,
  WarnaPlat,
} from "@/types/tax";

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

type FormSection = "assessment" | "tax-period" | "facilities";

type SectionStatus = "Isi Manual" | "Terisi Otomatis" | "Belum Lengkap";

const SECTION_STATUS_TONE: Record<SectionStatus, StepStatusTone> = {
  "Terisi Otomatis": "success",
  "Belum Lengkap": "warning",
  "Isi Manual": "neutral",
};

function normalizeJenis(raw: string | null): JenisKendaraan | undefined {
  if (!raw) return undefined;
  const upper = raw.toUpperCase().trim();
  const match = Object.keys(BOBOT_MAP).find((k) => k === upper);
  return match as JenisKendaraan | undefined;
}

/** Warna plat dari data kendaraan; nilai kosong/tak dikenal → default Putih. */
function plateFromData(raw: unknown): WarnaPlat {
  return isWarnaPlat(raw) ? raw : DEFAULT_WARNA_PLAT;
}

function isoToDate(iso: string | null | undefined): Date | undefined {
  if (!iso) return undefined;
  try {
    return parseISO(iso);
  } catch {
    return undefined;
  }
}

/** Tanda bintang wajib isi (dekoratif; label sudah menyebut kewajiban via validasi). */
function RequiredMark() {
  return (
    <span className="text-destructive" aria-hidden="true">
      *
    </span>
  );
}

/**
 * Konten tahap diindentasi sejajar teks judul pada ≥sm (badge 28px + gap 12px);
 * pada mobile selebar kartu agar lebar 320px tidak terbuang.
 */
const STEP_INDENT = "sm:pl-10";

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
  const [warnaPlat, setWarnaPlat] = useState<WarnaPlat>(DEFAULT_WARNA_PLAT);
  const { hasPermission } = useAuth();
  const { effectiveMode: sourceMode, lookupEnabled } =
    useEffectiveVehicleDataSource();
  const canUseTembakRu = hasPermission("facility.tembak_ru");

  // Tanpa izin pencarian Nopol, tahap 2 dan 3 dibuka untuk pengisian manual.
  const defaultOpenSections: FormSection[] = lookupEnabled
    ? []
    : ["assessment", "tax-period"];

  const [isTembakRuState, setIsTembakRu] = useState(false);
  // Fasilitas Tembak RU dipaksa nonaktif bila user tidak memiliki izin.
  const isTembakRu = canUseTembakRu && isTembakRuState;
  const [openSections, setOpenSections] =
    useState<FormSection[]>(defaultOpenSections);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [invalidField, setInvalidField] = useState<FieldKey | null>(null);
  const hasCalculated = useRef(false);
  // Nilai warna plat terkini untuk efek auto-hitung tanpa menjadikannya dependensi.
  const warnaPlatRef = useRef<WarnaPlat>(warnaPlat);
  const plateAppliedForRef = useRef<VehicleData | null>(null);
  useEffect(() => {
    warnaPlatRef.current = warnaPlat;
  }, [warnaPlat]);

  const {
    vehicleData,
    lookupSource,
    status: lookupStatus,
    errorMessage: lookupError,
    forbidden: lookupForbidden,
  } = useNopolLookup(nopol, sourceMode);

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
    setWarnaPlat(DEFAULT_WARNA_PLAT);
    setOpenSections(defaultOpenSections);
    setValidationError(null);
    setInvalidField(null);
    hasCalculated.current = false;
    onResult(null);
  }

  function openSection(section: FormSection) {
    setOpenSections((current) =>
      current.includes(section) ? current : [...current, section],
    );
  }

  useEffect(() => {
    // Nopol tidak ditemukan atau lookup ditolak (403): lanjutkan secara manual.
    if (lookupStatus === "not_found" || lookupForbidden) {
      setOpenSections(["assessment", "tax-period"]);
    }
  }, [lookupStatus, lookupForbidden]);

  useEffect(() => {
    if (!vehicleData) return;

    const jenisNormal = normalizeJenis(vehicleData.jenis);
    const stnkDate = isoToDate(vehicleData.jatuhTempoStnk);
    const pajakDate = isoToDate(vehicleData.jatuhTempoPajak);

    // Warna plat diambil dari data hanya sekali per hasil lookup. Efek ini juga
    // berjalan ulang saat Tanggal Pembayaran berubah; pilihan manual (mis. Merah
    // untuk data D1 tanpa warna plat) tidak boleh kembali ke default diam-diam.
    let plate = warnaPlatRef.current;
    if (plateAppliedForRef.current !== vehicleData) {
      plateAppliedForRef.current = vehicleData;
      plate = plateFromData(vehicleData.warnaPlat);
      setWarnaPlat(plate);
    }

    if (vehicleData.njkb > 0) setNjkb(String(vehicleData.njkb));
    setNjub(String(vehicleData.njub ?? 0));
    if (vehicleData.bobot) setBobot(vehicleData.bobot);
    if (jenisNormal) setJenisKendaraan(jenisNormal);
    if (stnkDate) setJatuhTempoStnk(stnkDate);
    if (pajakDate) setJatuhTempoPajak(pajakDate);

    // Data ditemukan tetapi tidak lengkap: buka tahap yang perlu dilengkapi.
    const sectionsToOpen: FormSection[] = [];
    if (vehicleData.njkb <= 0 || !jenisNormal || !vehicleData.bobot) {
      sectionsToOpen.push("assessment");
    }
    if (!stnkDate || !pajakDate) {
      sectionsToOpen.push("tax-period");
    }
    setOpenSections(sectionsToOpen);

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
          warnaPlat: plate,
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
      warnaPlat,
    };
  }

  // Fasilitas dan warna plat langsung menghitung ulang setelah hasil pertama tampil.
  useEffect(() => {
    if (!hasCalculated.current) return;
    const input = getCalculatorInput();
    if (input) onResult(calculateTax(input));
  }, [isMutasiMasuk, isTembakRu, isDomisiliGempa, warnaPlat]);

  // Jaga tahap fasilitas tetap terbuka ketika salah satu toggle aktif.
  const anyFacilityActive = isDomisiliGempa || isMutasiMasuk || isTembakRu;
  useEffect(() => {
    if (anyFacilityActive) openSection("facilities");
  }, [anyFacilityActive]);

  function fail(field: FieldKey, message: string) {
    setInvalidField(field);
    setValidationError(message);

    if (field === "njkb" || field === "jenis") {
      openSection("assessment");
    } else {
      openSection("tax-period");
    }
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

  const assessmentComplete =
    Boolean(njkbNumber > 0 && jenisKendaraan && effectiveBobot > 0);
  const taxPeriodComplete = Boolean(
    jatuhTempoPajak && jatuhTempoStnk && tanggalBayar,
  );

  const manualEntry =
    !lookupEnabled || lookupStatus === "not_found" || lookupForbidden;

  // Keterangan asal nilai warna plat. Plat selalu bernilai (default Putih),
  // sehingga tidak memengaruhi status kelengkapan Dasar Pengenaan.
  const plateFromSource =
    lookupStatus === "found" && vehicleData && isWarnaPlat(vehicleData.warnaPlat)
      ? vehicleData.warnaPlat
      : null;
  const plateSourceHint =
    lookupStatus === "found" && vehicleData
      ? plateFromSource
        ? warnaPlat === plateFromSource
          ? "Terisi otomatis dari sumber data."
          : `Diubah manual (sumber data: ${WARNA_PLAT_LABEL[plateFromSource]}).`
        : warnaPlat === DEFAULT_WARNA_PLAT
          ? `Sumber data tidak menyediakan warna plat. Default ${WARNA_PLAT_LABEL[DEFAULT_WARNA_PLAT]} — ubah bila kendaraan dinas (plat merah).`
          : "Dipilih manual — sumber data tidak menyediakan warna plat."
      : `Pilih sesuai TNKB kendaraan. Default ${WARNA_PLAT_LABEL[DEFAULT_WARNA_PLAT]}.`;

  const assessmentStatus: SectionStatus | undefined =
    manualEntry
      ? "Isi Manual"
      : lookupStatus === "found"
        ? assessmentComplete
          ? "Terisi Otomatis"
          : "Belum Lengkap"
        : undefined;
  const taxPeriodStatus: SectionStatus | undefined =
    manualEntry
      ? "Isi Manual"
      : lookupStatus === "found"
        ? taxPeriodComplete
          ? "Terisi Otomatis"
          : "Belum Lengkap"
        : undefined;

  // Strip masa berlaku pada plat: "MM · YY" dari jatuh tempo pajak, bila ada.
  const plateStripText = jatuhTempoPajak
    ? format(jatuhTempoPajak, "MM · yy")
    : "NTT";

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col">
      {/* ── 1 · Kendaraan ── */}
      {/*
        min-w-0 wajib: <fieldset> punya min-inline-size: min-content bawaan browser,
        sehingga konten nowrap (nama pemilik, sel bento) membuatnya melebar
        melewati Card di layar sempit.
      */}
      <FieldSet className="min-w-0 gap-5 pb-6">
        <FieldLegend className="mb-0 w-full p-0 font-normal">
          <FormStepHeading
            step="1"
            title="Kendaraan"
            hint={
              lookupEnabled
                ? "Masukkan nomor polisi untuk mengisi data secara otomatis."
                : "Catat nomor polisi, lalu lengkapi data kendaraan secara manual."
            }
          />
        </FieldLegend>

        {/* pt-5: flex `gap` tidak berlaku pada <legend>, jarak dibuat eksplisit. */}
        <div className={cn("w-full min-w-0 pt-5", STEP_INDENT)}>
          <Field className="min-w-0 gap-4">
            <FieldLabel htmlFor="nopol" className="eyebrow">
              Nomor Polisi
            </FieldLabel>

            {/* Plat TNKB: warna mengikuti pilihan Warna Plat (tahap 2) secara langsung. */}
            <div
              data-plate={warnaPlat}
              className="tnkb-plate w-full max-w-[26rem] select-none"
            >
              <div className="relative h-[4.5rem]">
                <Input
                  id="nopol"
                  aria-describedby="nopol-lookup-message"
                  value={nopol}
                  onChange={(e) => {
                    // Setiap perubahan karakter Nopol mengosongkan data sebelumnya.
                    // Tanggal Pembayaran sengaja tidak di-reset.
                    resetVehicleFields();
                    setNopol(e.target.value.toUpperCase());
                  }}
                  placeholder="DH 1234 AB"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  maxLength={12}
                  className={cn(
                    "h-full w-full rounded-none border-0 bg-transparent px-12 py-0 text-center shadow-none",
                    "font-plate text-3xl font-bold uppercase leading-none tracking-wide sm:text-4xl",
                    "focus-visible:ring-0 focus-visible:ring-offset-0",
                  )}
                />
                <span
                  className="pointer-events-none absolute right-4 top-1/2 flex -translate-y-1/2 items-center"
                  aria-hidden="true"
                >
                  <NopolLookupIndicator status={lookupStatus} />
                </span>
              </div>
              <div
                className="tnkb-strip mx-3 flex h-7 items-center justify-center text-xs font-semibold tracking-[0.3em]"
                aria-hidden="true"
              >
                <span className="numeric">{plateStripText}</span>
              </div>
            </div>

            <div id="nopol-lookup-message" aria-live="polite" className="min-w-0">
              {lookupEnabled ? (
                <NopolLookupMessage
                  status={lookupStatus}
                  vehicleData={vehicleData}
                  lookupSource={lookupSource}
                  errorMessage={lookupError}
                  forbidden={lookupForbidden}
                />
              ) : (
                <NopolLookupDisabledMessage />
              )}
            </div>
          </Field>
        </div>
      </FieldSet>

      {/* ── Tahap 2–4 · Controlled Accordion ── */}
      <Accordion
        type="multiple"
        value={openSections}
        onValueChange={(values) => setOpenSections(values as FormSection[])}
        className="flex w-full min-w-0 flex-col"
      >
        <FormStepAccordion
          value="assessment"
          step="2"
          title="Dasar Pengenaan"
          hint="Nilai jual dan bobot menentukan besaran PKB."
          status={assessmentStatus}
          statusTone={assessmentStatus && SECTION_STATUS_TONE[assessmentStatus]}
        >
          <div className="grid w-full min-w-0 grid-cols-1 gap-x-4 gap-y-5 md:grid-cols-3">
            <Field
              data-invalid={invalidField === "njkb" || undefined}
              className="min-w-0 gap-2"
            >
              <FieldLabel htmlFor="njkb">
                NJKB <RequiredMark />
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
                className="numeric h-10 bg-card aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/25"
              />
              <FieldDescription
                className={cn(
                  "text-xs",
                  !isNaN(njkbNumber) && njkbNumber > 0 && "numeric font-medium text-foreground",
                )}
              >
                {!isNaN(njkbNumber) && njkbNumber > 0
                  ? formatRupiah(njkbNumber)
                  : "Nilai Jual Kendaraan Bermotor."}
              </FieldDescription>
            </Field>

            <Field className="min-w-0 gap-2">
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
                className="numeric h-10 bg-card"
              />
              <FieldDescription className="text-xs">
                {!isNaN(njubNumber) && njubNumber > 0
                  ? `${formatRupiah(njubNumber)} ditambahkan ke dasar pengenaan.`
                  : "Nilai ubah bentuk, jika ada."}
              </FieldDescription>
            </Field>

            <Field
              data-invalid={invalidField === "jenis" || undefined}
              className="min-w-0 gap-2"
            >
              <FieldLabel htmlFor="jenis">
                Jenis Kendaraan <RequiredMark />
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
                  className="h-10 bg-card aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/25"
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
              <FieldDescription className="flex flex-wrap items-center gap-1.5 text-xs">
                {bobot !== undefined ? (
                  <span className="numeric step-badge inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6875rem] font-semibold leading-4">
                    Bobot Data {bobot.toLocaleString("id-ID")}
                  </span>
                ) : (
                  <span>Bobot mengikuti jenis kendaraan.</span>
                )}
              </FieldDescription>
            </Field>

            {/*
              Baris penuh: tiga plat mini butuh ≥ 19rem agar label tidak terpotong;
              keterangan berada di sisi kanan pada desktop dan di bawah pada mobile.
            */}
            <Field className="min-w-0 gap-2 md:col-span-3">
              {/* Bukan <label>: radiogroup dilabeli via aria-labelledby. */}
              <FieldTitle id="warna-plat-label">Warna Plat (TNKB)</FieldTitle>
              <div className="grid w-full min-w-0 grid-cols-1 gap-x-5 gap-y-3 md:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] md:items-start">
                <PlateColorRadioGroup
                  value={warnaPlat}
                  onValueChange={setWarnaPlat}
                  labelledBy="warna-plat-label"
                  describedBy="warna-plat-description"
                />
                <div
                  id="warna-plat-description"
                  className="flex min-w-0 flex-col gap-1.5 text-xs leading-relaxed text-muted-foreground md:pt-1"
                >
                  <p>{plateSourceHint}</p>
                  {warnaPlat === "merah" && (
                    <p className="flex items-start gap-1.5 text-[0.8125rem] font-medium text-foreground">
                      <Info
                        className="mt-0.5 size-3.5 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                      <span>
                        Kendaraan dinas: tarif PKB{" "}
                        <span className="numeric">
                          {formatPersen(TARIF_PKB_PLAT_MERAH)}
                        </span>{" "}
                        untuk semua periode.
                      </span>
                    </p>
                  )}
                  <p>Plat kuning (angkutan umum) dihitung di loket.</p>
                </div>
              </div>
            </Field>
          </div>
        </FormStepAccordion>

        <FormStepAccordion
          value="tax-period"
          step="3"
          title="Masa Pajak"
          hint="Tanggal jatuh tempo dan pembayaran menentukan tunggakan dan diskon."
          status={taxPeriodStatus}
          statusTone={taxPeriodStatus && SECTION_STATUS_TONE[taxPeriodStatus]}
        >
          <div className="grid w-full min-w-0 grid-cols-1 gap-x-4 gap-y-5 md:grid-cols-3">
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
        </FormStepAccordion>

        <FormStepAccordion
          value="facilities"
          step="4"
          title="Fasilitas & Biaya Tambahan"
          hint="Aktifkan yang berlaku bagi wajib pajak ini."
          status={activeFacilityCount > 0 ? `${activeFacilityCount} Aktif` : undefined}
          statusTone="info"
        >
          <div className="grid w-full min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            <FacilityToggle
              id="is-gempa"
              title="Wilayah Terdampak Gempa"
              description="Sikka, Ende, Nagekeo, Ngada, Manggarai, Manggarai Timur, Manggarai Barat."
              impact="Diskon tunggakan 75%"
              checked={isDomisiliGempa}
              onCheckedChange={setIsDomisiliGempa}
              icon={<ShieldCheck />}
            />
            <FacilityToggle
              id="is-mutasi-masuk"
              title="Mutasi Masuk Luar Daerah"
              description="Menggantikan diskon pembayaran awal pada PKB berjalan."
              impact="Diskon PKB berjalan 50%"
              checked={isMutasiMasuk}
              onCheckedChange={setIsMutasiMasuk}
              icon={<ArrowLeftRight />}
            />
            {canUseTembakRu && (
              <FacilityToggle
                id="is-tembak-ru"
                title="Biaya Tembak RU/STNK"
                description="Motor Rp150.000 · Mobil Rp250.000."
                impact="Biaya tambahan"
                checked={isTembakRu}
                onCheckedChange={setIsTembakRu}
                icon={<Landmark />}
              />
            )}
          </div>
        </FormStepAccordion>
      </Accordion>

      {/* ── Validasi + aksi utama ── */}
      <div className="flex flex-col gap-4 border-t pt-6">
        {validationError && (
          <Alert variant="destructive" className="animate-fade-up">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>Data Belum Lengkap</AlertTitle>
            <AlertDescription>{validationError}</AlertDescription>
          </Alert>
        )}

        <Button
          type="submit"
          size="lg"
          className="h-12 w-full text-base font-semibold shadow-card"
        >
          <Calculator data-icon="inline-start" aria-hidden="true" />
          Hitung Penetapan
        </Button>
      </div>
    </form>
  );
}
