import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format, isValid, parseISO } from "date-fns";
import { id as idLocale } from "date-fns/locale";
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
  FieldError,
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
import { resolveGempaEligibility } from "@/lib/gempa-eligibility";
import { calculateTax } from "@/lib/tax-calculator";
import {
  BIAYA_LAYANAN_INPUT_MAX_LENGTH,
  formatBiayaLayananInput,
  parseBiayaLayananInput,
} from "@/lib/biaya-layanan-input";
import { formatPersen, formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  BIAYA_LAYANAN_KEYS,
  BIAYA_LAYANAN_LABEL,
  BOBOT_MAP,
  DEFAULT_WARNA_PLAT,
  TARIF_PKB_PLAT_MERAH,
  WARNA_PLAT_LABEL,
  isWarnaPlat,
} from "@/types/tax";
import type {
  BiayaLayanan,
  BiayaLayananKey,
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
  | "tanggalBayar"
  | `biayaLayanan.${BiayaLayananKey}`;

type FormSection = "assessment" | "tax-period" | "facilities" | "fees";

/** Teks input biaya; nominal valid diformat, teks salah dipertahankan utuh. */
type BiayaLayananText = Record<BiayaLayananKey, string>;

const EMPTY_BIAYA_LAYANAN_TEXT: BiayaLayananText = {
  pendaftaranBbn: "",
  bpkb: "",
  cekFisik: "",
  mutasiMasuk: "",
  mutasiKeluar: "",
  arsipFiskal: "",
};

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

interface BiayaLayananFieldProps {
  fieldKey: BiayaLayananKey;
  text: string;
  onTextChange: (text: string) => void;
}

/** Nominal valid diformat id-ID; input salah tetap terlihat dan ditolak inline. */
function BiayaLayananField({
  fieldKey,
  text,
  onTextChange,
}: BiayaLayananFieldProps) {
  const id = `biaya-${fieldKey}`;
  const errorId = `${id}-error`;
  const parsed = parseBiayaLayananInput(text);
  const invalid = parsed.status === "invalid";

  return (
    <Field data-invalid={invalid || undefined} className="min-w-0 gap-2">
      {/* Label dapat 2 baris; mt-auto pada input menjaga kotak input sebaris
          dengan field lain di baris grid yang sama. */}
      <FieldLabel htmlFor={id} className="leading-snug">
        {BIAYA_LAYANAN_LABEL[fieldKey]}
      </FieldLabel>
      <div className="relative mt-auto min-w-0">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-medium text-muted-foreground"
        >
          Rp
        </span>
        <Input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={text}
          onChange={(e) => {
            const edit = e.nativeEvent as InputEvent;
            // Ketikan digit/deletion pada tampilan ribuan bukan paste nominal.
            // Hanya grouping yang kita tambahkan boleh dibuang pada edit ini;
            // paste, tanda negatif, huruf, dan koma selalu lewat parser ketat.
            const digitEdit = edit.inputType === "insertText" &&
              /^\d$/.test(edit.data ?? "");
            const deletion = edit.inputType === "deleteContentBackward" ||
              edit.inputType === "deleteContentForward";
            const raw = (digitEdit || deletion) && parsed.status !== "invalid" &&
              /^[\d.]*$/.test(text)
              ? e.target.value.replace(/\./g, "")
              : e.target.value;
            onTextChange(formatBiayaLayananInput(raw));
          }}
          maxLength={BIAYA_LAYANAN_INPUT_MAX_LENGTH}
          placeholder="0"
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
          className="numeric h-10 bg-card pl-10 aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/25"
        />
      </div>
      {parsed.status === "invalid" && (
        <FieldError id={errorId} className="text-xs leading-snug">
          {parsed.error}
        </FieldError>
      )}
    </Field>
  );
}

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
  // Nilai otomatis gempa saat hasil lookup diterapkan + penanda perubahan
  // manual. Keduanya hanya di-reset oleh lookup baru atau perubahan Nopol.
  const [gempaAutoValue, setGempaAutoValue] = useState(false);
  const [isMutasiMasuk, setIsMutasiMasuk] = useState(false);
  const [warnaPlat, setWarnaPlat] = useState<WarnaPlat>(DEFAULT_WARNA_PLAT);
  const { hasPermission } = useAuth();
  const { effectiveMode: sourceMode, lookupEnabled } =
    useEffectiveVehicleDataSource();
  const canUseTembakRu = hasPermission("facility.tembak_ru");
  const canUseBiayaLayanan = hasPermission("fees.bbn_mutasi");

  // Tanpa izin pencarian Nopol, tahap 2 dan 3 dibuka untuk pengisian manual.
  // Tahap 5 (biaya BBN & Mutasi) selalu tertutup secara default: opsional.
  const defaultOpenSections: FormSection[] = lookupEnabled
    ? []
    : ["assessment", "tax-period"];

  const [isTembakRuState, setIsTembakRu] = useState(false);
  // Fasilitas Tembak RU dipaksa nonaktif bila user tidak memiliki izin.
  const isTembakRu = canUseTembakRu && isTembakRuState;
  const [biayaLayananText, setBiayaLayananText] =
    useState<BiayaLayananText>(EMPTY_BIAYA_LAYANAN_TEXT);
  const parsedBiayaLayanan = useMemo(
    () => BIAYA_LAYANAN_KEYS.map((key) => ({
      key,
      parsed: parseBiayaLayananInput(biayaLayananText[key]),
    })),
    [biayaLayananText],
  );
  // Tanpa izin dipaksa kosong. Teks salah tidak memakai nominal valid lama
  // dan tidak ikut total live; tetap dipertahankan untuk diperbaiki pengguna.
  const biayaLayanan = useMemo<BiayaLayanan>(() => {
    if (!canUseBiayaLayanan) return {};
    return Object.fromEntries(parsedBiayaLayanan.flatMap(({ key, parsed }) =>
      parsed.status === "valid" && parsed.value > 0
        ? [[key, parsed.value] as const]
        : [],
    )) as BiayaLayanan;
  }, [canUseBiayaLayanan, parsedBiayaLayanan]);
  const invalidBiayaLayanan = canUseBiayaLayanan
    ? parsedBiayaLayanan.find(({ parsed }) => parsed.status === "invalid")
    : undefined;
  const biayaLayananStats = useMemo(() => {
    let count = 0;
    let sum = 0;
    for (const key of BIAYA_LAYANAN_KEYS) {
      const value = biayaLayanan[key] ?? 0;
      if (value > 0) {
        count += 1;
        sum += value;
      }
    }
    return { count, sum };
  }, [biayaLayanan]);
  const [openSections, setOpenSections] =
    useState<FormSection[]>(defaultOpenSections);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [invalidField, setInvalidField] = useState<FieldKey | null>(null);
  const hasCalculated = useRef(false);
  // Snapshot hanya dipakai saat hasil lookup BARU diterapkan. Perubahan tanggal,
  // fasilitas, plate, dan biaya berikutnya memakai input form, bukan data lookup.
  const lookupInputRef = useRef({ tanggalBayar, biayaLayanan });
  const appliedVehicleRef = useRef<VehicleData | null>(null);
  const skipLookupRecalculationRef = useRef(false);
  useEffect(() => {
    lookupInputRef.current = { tanggalBayar, biayaLayanan };
  }, [tanggalBayar, biayaLayanan]);

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
    setGempaAutoValue(false);
    setIsMutasiMasuk(false);
    setIsTembakRu(false);
    setWarnaPlat(DEFAULT_WARNA_PLAT);
    // Biaya BBN & Mutasi bersifat per transaksi (per kendaraan), bukan
    // pengaturan loket; ikut dikosongkan seperti data kendaraan lainnya.
    setBiayaLayananText(EMPTY_BIAYA_LAYANAN_TEXT);
    appliedVehicleRef.current = null;
    setOpenSections(defaultOpenSections);
    setValidationError(null);
    setInvalidField(null);
    hasCalculated.current = false;
    onResult(null);
  }

  const openSection = useCallback((section: FormSection) => {
    setOpenSections((current) =>
      current.includes(section) ? current : [...current, section],
    );
  }, []);

  useEffect(() => {
    // Nopol tidak ditemukan atau lookup ditolak (403): lanjutkan secara manual.
    if (lookupStatus === "not_found" || lookupForbidden) {
      setOpenSections(["assessment", "tax-period"]);
    }
  }, [lookupStatus, lookupForbidden]);

  useEffect(() => {
    if (!vehicleData || appliedVehicleRef.current === vehicleData) return;
    appliedVehicleRef.current = vehicleData;
    // Lewati efek hitung ulang pada render ini: state hasil autofill belum
    // diterapkan. Render berikutnya menghitung ulang dari state yang lengkap.
    skipLookupRecalculationRef.current = true;
    hasCalculated.current = false;

    const jenisNormal = normalizeJenis(vehicleData.jenis);
    const stnkDate = isoToDate(vehicleData.jatuhTempoStnk);
    const pajakDate = isoToDate(vehicleData.jatuhTempoPajak);
    const plate = plateFromData(vehicleData.warnaPlat);
    const { tanggalBayar, biayaLayanan } = lookupInputRef.current;
    // Gempa otomatis aktif hanya bila plat EB + UPT asal salah satu kabupaten
    // terdampak. Status unknown/not_eligible tetap nonaktif (cek manual).
    const autoGempa = resolveGempaEligibility({
      nopol: vehicleData.nopol,
      originUpt: vehicleData.originUpt,
    }).status === "eligible";
    const njubValue =
      Number.isFinite(vehicleData.njub) && vehicleData.njub > 0
        ? vehicleData.njub
        : 0;

    // Reset fasilitas hanya untuk hasil lookup baru, tidak saat tanggal berubah.
    setIsDomisiliGempa(autoGempa);
    setGempaAutoValue(autoGempa);
    setIsMutasiMasuk(false);
    setIsTembakRu(false);
    setWarnaPlat(plate);

    if (vehicleData.njkb > 0) setNjkb(String(vehicleData.njkb));
    setNjub(String(njubValue));
    if (vehicleData.bobot) setBobot(vehicleData.bobot);
    if (jenisNormal) setJenisKendaraan(jenisNormal);
    if (stnkDate) setJatuhTempoStnk(stnkDate);
    if (pajakDate) setJatuhTempoPajak(pajakDate);

    // Data ditemukan tetapi tidak lengkap: buka tahap yang perlu dilengkapi.
    // NJUB > 0 juga membuka Dasar Pengenaan agar nilai tambahan terlihat.
    const sectionsToOpen: FormSection[] = [];
    if (
      vehicleData.njkb <= 0 ||
      !jenisNormal ||
      !vehicleData.bobot ||
      njubValue > 0
    ) {
      sectionsToOpen.push("assessment");
    }
    if (!stnkDate || !pajakDate) {
      sectionsToOpen.push("tax-period");
    }
    if (autoGempa) sectionsToOpen.push("facilities");
    setOpenSections(sectionsToOpen);

    // Data Nopol lengkap langsung menghasilkan ringkasan penetapan.
    // Gempa memakai nilai otomatis yang sama dengan state toggle; fasilitas
    // lain tetap nonaktif sampai pengguna mengaktifkannya.
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
          njub: njubValue,
          bobot: vehicleData.bobot || BOBOT_MAP[jenisNormal],
          jenisKendaraan: jenisNormal,
          jatuhTempoPajak: pajakDate,
          jatuhTempoStnk: stnkDate,
          tanggalBayar,
          isDomisiliGempa: autoGempa,
          isMutasiMasuk: false,
          isTembakRu: false,
          warnaPlat: plate,
          biayaLayanan,
        }),
      );
    } else {
      onResult(null);
    }
  }, [vehicleData, onResult]);

  const effectiveBobot =
    bobot ?? (jenisKendaraan ? BOBOT_MAP[jenisKendaraan] : 1.0);

  const getCalculatorInput = useCallback(() => {
    const njkbNum = parseFloat(njkb);
    if (!njkb || !Number.isFinite(njkbNum) || njkbNum <= 0) return null;
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
      biayaLayanan,
    };
  }, [njkb, njub, effectiveBobot, jenisKendaraan, jatuhTempoPajak,
    jatuhTempoStnk, tanggalBayar, isDomisiliGempa, isMutasiMasuk,
    isTembakRu, warnaPlat, biayaLayanan]);

  // Setelah hasil pertama, seluruh edit memakai state form terkini. Input inti
  // yang dikosongkan menghapus hasil lama; izin biaya dicabut membuang biayanya.
  // Sebelum hitung/lookup lengkap pertama, jangan auto-hitung pengisian manual.
  useEffect(() => {
    if (vehicleData && skipLookupRecalculationRef.current) {
      skipLookupRecalculationRef.current = false;
      return;
    }
    if (!hasCalculated.current) return;
    const input = getCalculatorInput();
    onResult(input ? calculateTax(input) : null);
  }, [vehicleData, getCalculatorInput, onResult]);

  // Jaga tahap fasilitas tetap terbuka ketika salah satu toggle aktif.
  const anyFacilityActive = isDomisiliGempa || isMutasiMasuk || isTembakRu;
  useEffect(() => {
    if (anyFacilityActive) openSection("facilities");
  }, [anyFacilityActive, openSection]);

  function fail(field: FieldKey, message: string) {
    setInvalidField(field);
    setValidationError(message);

    if (field === "njkb" || field === "jenis") {
      openSection("assessment");
    } else if (field.startsWith("biayaLayanan.")) {
      openSection("fees");
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
    // Validasi biaya BBN & Mutasi ditempatkan setelah validasi inti agar
    // urutan pesan validasi yang sudah ada tidak berubah.
    if (invalidBiayaLayanan?.parsed.status === "invalid") {
      return fail(
        `biayaLayanan.${invalidBiayaLayanan.key}`,
        `${BIAYA_LAYANAN_LABEL[invalidBiayaLayanan.key]}: ${invalidBiayaLayanan.parsed.error} Periksa kembali nominalnya.`,
      );
    }
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

  // Keterangan toggle gempa. Status dihitung ulang dari data lookup yang sedang
  // diterapkan (murni, tanpa request); "Diubah manual" = state berbeda dari
  // nilai otomatis saat lookup diterapkan.
  const gempaEligibility =
    lookupStatus === "found" && vehicleData
      ? resolveGempaEligibility({
          nopol: vehicleData.nopol,
          originUpt: vehicleData.originUpt,
        })
      : null;
  const gempaChangedManually =
    gempaEligibility !== null && isDomisiliGempa !== gempaAutoValue;
  let gempaNote: { text: string; tone: "auto" | "warning" | "neutral" } | null =
    null;
  if (gempaEligibility?.status === "eligible") {
    gempaNote = gempaChangedManually
      ? {
          text: `Diubah manual. Terdeteksi otomatis: plat EB dan UPT asal ${gempaEligibility.kabupaten}.`,
          tone: "neutral",
        }
      : {
          text: `Otomatis: plat EB dan UPT asal ${gempaEligibility.kabupaten} (petunjuk, bukan bukti domisili). Nonaktifkan bila domisili pemilik di luar wilayah terdampak.`,
          tone: "auto",
        };
  } else if (gempaEligibility?.status === "unknown") {
    const reason =
      gempaEligibility.reason === "origin_missing"
        ? "UPT asal tidak tersedia"
        : "UPT asal tidak dikenali";
    gempaNote = {
      text: gempaChangedManually
        ? `Diubah manual. ${reason}; pastikan domisili pemilik.`
        : `${reason}. Periksa domisili pemilik secara manual.`,
      tone: "warning",
    };
  } else if (gempaChangedManually) {
    gempaNote = { text: "Diubah manual.", tone: "neutral" };
  }

  // Chip tahap 5 hanya tampil bila ada biaya terisi: "3 biaya · Rp 530.000".
  const feesStatus =
    biayaLayananStats.count > 0
      ? `${biayaLayananStats.count} biaya · ${formatRupiah(biayaLayananStats.sum)}`
      : undefined;

  // Strip memakai tanggal form terkini, termasuk hasil koreksi manual.
  // PAJAK: tanggal lengkap; STNK: bulan + tahun pendek seperti plat fisik.
  const plateDueDate =
    jatuhTempoPajak && isValid(jatuhTempoPajak) ? jatuhTempoPajak : undefined;
  const plateStnkDate =
    jatuhTempoStnk && isValid(jatuhTempoStnk) ? jatuhTempoStnk : undefined;

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
              <div className="tnkb-strip mx-3 flex min-h-7 min-w-0 flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 py-1 text-[0.625rem] font-semibold sm:gap-x-2 sm:text-xs">
                {plateDueDate || plateStnkDate ? (
                  <>
                    <span className="inline-flex items-center gap-1 whitespace-nowrap">
                      <span className="uppercase opacity-75">Pajak</span>
                      {plateDueDate ? (
                        <time
                          dateTime={format(plateDueDate, "yyyy-MM-dd")}
                          title={format(plateDueDate, "d MMMM yyyy", { locale: idLocale })}
                          className="numeric"
                        >
                          <span aria-hidden="true">{format(plateDueDate, "dd '•' MM '•' yyyy")}</span>
                          <span className="sr-only">
                            {format(plateDueDate, "d MMMM yyyy", { locale: idLocale })}
                          </span>
                        </time>
                      ) : <span aria-label="Jatuh tempo pajak belum diisi">—</span>}
                    </span>
                    <span aria-hidden="true" className="opacity-50">|</span>
                    <span className="inline-flex items-center gap-1 whitespace-nowrap">
                      <span className="uppercase opacity-75">STNK</span>
                      {plateStnkDate ? (
                        <time
                          dateTime={format(plateStnkDate, "yyyy-MM-dd")}
                          title={format(plateStnkDate, "d MMMM yyyy", { locale: idLocale })}
                          className="numeric"
                        >
                          <span aria-hidden="true">{format(plateStnkDate, "MM '•' yy")}</span>
                          <span className="sr-only">
                            {format(plateStnkDate, "d MMMM yyyy", { locale: idLocale })}
                          </span>
                        </time>
                      ) : <span aria-label="Jatuh tempo STNK belum diisi">—</span>}
                    </span>
                  </>
                ) : (
                  <span className="numeric tracking-[0.3em]" aria-hidden="true">NTT</span>
                )}
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
                  // Bobot dari API tetap dipakai saat NJKB dikoreksi; hanya
                  // perubahan jenis kendaraan yang beralih ke bobot tabel.
                  setNjkb(e.target.value);
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
                    Bobot API {bobot.toLocaleString("id-ID")}
                  </span>
                ) : jenisKendaraan ? (
                  <span>
                    Bobot tabel jenis:{" "}
                    <span className="numeric font-medium text-foreground">
                      {BOBOT_MAP[jenisKendaraan].toLocaleString("id-ID")}
                    </span>
                    {vehicleData?.bobot ? " (dipilih manual)." : "."}
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
              note={gempaNote?.text}
              noteTone={gempaNote?.tone}
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

        {/* ── 5 · Biaya BBN & Mutasi — hanya bila user memiliki izin modul ── */}
        {canUseBiayaLayanan && (
          <FormStepAccordion
            value="fees"
            step="5"
            title="Biaya BBN & Mutasi"
            hint="Isi nominal sesuai ketetapan; kosongkan bila tidak dikenakan."
            status={feesStatus}
            statusTone="info"
          >
            {/*
              Kolom form ±560px pada lg (sidebar 400px): tiga kolom masih ≥ 170px
              per input, cukup untuk "Rp 100.000.000"; pada xl lebih lega.
            */}
            <div className="grid w-full min-w-0 grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
              {BIAYA_LAYANAN_KEYS.map((key) => (
                <BiayaLayananField
                  key={key}
                  fieldKey={key}
                  text={biayaLayananText[key]}
                  onTextChange={(text) => {
                    setBiayaLayananText((current) =>
                      current[key] === text ? current : { ...current, [key]: text },
                    );
                    if (invalidField === `biayaLayanan.${key}`) {
                      setInvalidField(null);
                      setValidationError(null);
                    }
                  }}
                />
              ))}
            </div>
          </FormStepAccordion>
        )}
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
