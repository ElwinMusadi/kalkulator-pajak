import { useEffect, useRef, useState } from "react"
import { parseISO } from "date-fns"
import {
  ArrowLeftRight,
  Calculator,
  CircleAlert,
  Landmark,
  ShieldCheck,
} from "lucide-react"
import { DatePickerField } from "@/components/date-picker-field"
import { FacilityToggle } from "@/components/facility-toggle"
import {
  NopolLookupIndicator,
  NopolLookupMessage,
} from "@/components/nopol-lookup-status"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useNopolLookup } from "@/hooks/use-nopol-lookup"
import { calculateTax } from "@/lib/tax-calculator"
import { formatRupiah } from "@/lib/format"
import { BOBOT_MAP } from "@/types/tax"
import type { JenisKendaraan, TaxCalculationResult } from "@/types/tax"

const JENIS_OPTIONS: { value: JenisKendaraan; label: string }[] = [
  { value: "SEPEDA MOTOR", label: "Sepeda Motor · bobot 1,00" },
  { value: "MINIBUS", label: "Minibus · bobot 1,05" },
  { value: "PICK UP", label: "Pick Up · bobot 1,085" },
  { value: "SEDAN", label: "Sedan · bobot 1,025" },
  { value: "JEEP", label: "Jeep · bobot 1,05" },
  { value: "LIGHT TRUCK", label: "Light Truck · bobot 1,30" },
  { value: "MICROBUS", label: "Microbus · bobot 1,085" },
  { value: "TRUCK", label: "Truck · bobot 1,40" },
]

type FieldKey = "njkb" | "jenis" | "jatuhTempoPajak" | "jatuhTempoStnk" | "tanggalBayar"

/** Petakan jenis dari D1 (uppercase) ke JenisKendaraan yang valid */
function normalizeJenis(raw: string | null): JenisKendaraan | undefined {
  if (!raw) return undefined
  const upper = raw.toUpperCase().trim()
  const match = Object.keys(BOBOT_MAP).find((k) => k === upper)
  return match as JenisKendaraan | undefined
}

/** Parse "YYYY-MM-DD" ke Date, return undefined jika invalid */
function isoToDate(iso: string | null | undefined): Date | undefined {
  if (!iso) return undefined
  try {
    return parseISO(iso)
  } catch {
    return undefined
  }
}

function SectionLegend({ step, title, hint }: { step: string; title: string; hint: string }) {
  return (
    <FieldLegend className="mb-1 flex w-full min-w-0 items-start gap-3">
      <span
        className="numeric step-badge mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border text-xs font-bold"
        aria-hidden="true"
      >
        {step}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-base font-semibold tracking-tight">{title}</span>
        <span className="text-sm font-normal leading-snug text-muted-foreground">{hint}</span>
      </span>
    </FieldLegend>
  )
}

interface TaxCalculatorFormProps {
  onResult: (result: TaxCalculationResult | null) => void
}

export function TaxCalculatorForm({ onResult }: TaxCalculatorFormProps) {
  const [nopol, setNopol] = useState("")
  const [njkb, setNjkb] = useState("")
  const [njub, setNjub] = useState("0")
  const [bobot, setBobot] = useState<number | undefined>(undefined)
  const [jenisKendaraan, setJenisKendaraan] = useState<JenisKendaraan | undefined>(undefined)
  const [jatuhTempoPajak, setJatuhTempoPajak] = useState<Date | undefined>(undefined)
  const [jatuhTempoStnk, setJatuhTempoStnk] = useState<Date | undefined>(undefined)
  const [tanggalBayar, setTanggalBayar] = useState<Date | undefined>(() => new Date())
  const [isDomisiliGempa, setIsDomisiliGempa] = useState(false)
  const [isMutasiMasuk, setIsMutasiMasuk] = useState(false)
  const [isTembakRu, setIsTembakRu] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [invalidField, setInvalidField] = useState<FieldKey | null>(null)
  const hasCalculated = useRef(false)

  const { vehicleData, status: lookupStatus, errorMessage: lookupError } = useNopolLookup(nopol)

  // Auto-fill saat data kendaraan ditemukan
  useEffect(() => {
    if (!vehicleData) return
    if (vehicleData.njkb > 0) setNjkb(String(vehicleData.njkb))
    setNjub(String(vehicleData.njub ?? 0))
    if (vehicleData.bobot) setBobot(vehicleData.bobot)

    const jenisNormal = normalizeJenis(vehicleData.jenis)
    if (jenisNormal) setJenisKendaraan(jenisNormal)

    const stnkDate = isoToDate(vehicleData.jatuhTempoStnk)
    if (stnkDate) setJatuhTempoStnk(stnkDate)

    const pajakDate = isoToDate(vehicleData.jatuhTempoPajak)
    if (pajakDate) setJatuhTempoPajak(pajakDate)
  }, [vehicleData])

  // Hitung bobot aktual: prioritaskan dari database, lalu dari pilihan jenis
  const effectiveBobot = bobot ?? (jenisKendaraan ? BOBOT_MAP[jenisKendaraan] : 1.0)

  function getCalculatorInput() {
    const njkbNum = parseFloat(njkb)
    if (!njkb || isNaN(njkbNum) || njkbNum <= 0) return null
    if (!jenisKendaraan || !jatuhTempoPajak || !jatuhTempoStnk || !tanggalBayar) return null

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
    }
  }

  useEffect(() => {
    if (!hasCalculated.current) return
    const input = getCalculatorInput()
    if (input) onResult(calculateTax(input))
  }, [isMutasiMasuk, isTembakRu, isDomisiliGempa])

  function fail(field: FieldKey, message: string) {
    setInvalidField(field)
    setValidationError(message)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setValidationError(null)
    setInvalidField(null)

    const njkbNum = parseFloat(njkb)
    if (!njkb || isNaN(njkbNum) || njkbNum <= 0)
      return fail("njkb", "NJKB harus diisi dengan nilai lebih dari 0.")
    if (!jenisKendaraan) return fail("jenis", "Pilih jenis kendaraan.")
    if (!jatuhTempoPajak) return fail("jatuhTempoPajak", "Isi tanggal jatuh tempo pajak.")
    if (!jatuhTempoStnk) return fail("jatuhTempoStnk", "Isi tanggal jatuh tempo STNK.")
    if (!tanggalBayar) return fail("tanggalBayar", "Isi tanggal pembayaran.")

    const input = getCalculatorInput()
    if (!input) return

    hasCalculated.current = true
    onResult(calculateTax(input))
  }

  const njkbNumber = parseFloat(njkb)
  const njubNumber = parseFloat(njub)
  const dasarPengenaan =
    !isNaN(njkbNumber) && njkbNumber > 0
      ? (njkbNumber + (isNaN(njubNumber) ? 0 : njubNumber)) * effectiveBobot
      : null

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-8">
      {/* ── 1 · Identitas kendaraan ── */}
      <FieldSet className="gap-4">
        <SectionLegend
          step="1"
          title="Identitas kendaraan"
          hint="Masukkan nomor polisi untuk mengisi data secara otomatis."
        />
        <FieldGroup className="gap-3">
          <Field>
            <FieldLabel htmlFor="nopol">Nomor polisi</FieldLabel>
            <div className="relative">
              <Input
                id="nopol"
                value={nopol}
                onChange={(e) => {
                  setNopol(e.target.value.toUpperCase())
                  hasCalculated.current = false
                  onResult(null)
                }}
                placeholder="Contoh: DH1234AB"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                className="numeric h-11 pr-10 text-base font-semibold uppercase tracking-[0.08em]"
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
        </FieldGroup>
      </FieldSet>

      {/* ── 2 · Dasar pengenaan ── */}
      <FieldSet className="gap-4">
        <SectionLegend
          step="2"
          title="Dasar pengenaan"
          hint="Nilai jual dan bobot menentukan besaran PKB."
        />
        <FieldGroup className="grid gap-4 md:grid-cols-3">
          <Field data-invalid={invalidField === "njkb" || undefined}>
            <FieldLabel htmlFor="njkb">
              NJKB
              <span className="text-destructive" aria-hidden="true">*</span>
            </FieldLabel>
            <Input
              id="njkb"
              type="number"
              inputMode="numeric"
              value={njkb}
              onChange={(e) => {
                setNjkb(e.target.value)
                setBobot(undefined)
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
              Jenis kendaraan
              <span className="text-destructive" aria-hidden="true">*</span>
            </FieldLabel>
            <Select
              value={jenisKendaraan}
              onValueChange={(v) => {
                setJenisKendaraan(v as JenisKendaraan)
                setBobot(undefined)
              }}
            >
              <SelectTrigger id="jenis" aria-invalid={invalidField === "jenis" || undefined}>
                <SelectValue placeholder="Pilih jenis" />
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
                    Bobot data {bobot.toLocaleString("id-ID")}
                  </Badge>
                  <span>dari basis data penetapan.</span>
                </>
              ) : (
                <span>Bobot mengikuti jenis kendaraan.</span>
              )}
            </FieldDescription>
          </Field>
        </FieldGroup>

        {dasarPengenaan !== null && (
          <div className="animate-fade-up flex flex-wrap items-baseline justify-between gap-2 rounded-md border border-dashed border-border bg-muted/30 px-4 py-3">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Dasar pengenaan PKB
            </span>
            <span className="numeric text-base font-semibold text-foreground">
              {formatRupiah(dasarPengenaan)}
            </span>
          </div>
        )}
      </FieldSet>

      {/* ── 3 · Masa pajak ── */}
      <FieldSet className="gap-4">
        <SectionLegend
          step="3"
          title="Masa pajak"
          hint="Tanggal jatuh tempo dan pembayaran menentukan tunggakan dan diskon."
        />
        <FieldGroup className="grid gap-4 md:grid-cols-3">
          <DatePickerField
            id="jatuh-tempo-pajak"
            label="Jatuh tempo pajak"
            value={jatuhTempoPajak}
            onChange={setJatuhTempoPajak}
            required
            description="Tanggal SKPD / notice."
            invalid={invalidField === "jatuhTempoPajak"}
          />
          <DatePickerField
            id="jatuh-tempo-stnk"
            label="Jatuh tempo STNK"
            value={jatuhTempoStnk}
            onChange={setJatuhTempoStnk}
            required
            description="Masa berlaku plat."
            invalid={invalidField === "jatuhTempoStnk"}
          />
          <DatePickerField
            id="tanggal-bayar"
            label="Tanggal pembayaran"
            value={tanggalBayar}
            onChange={setTanggalBayar}
            required
            description="Tanggal penetapan dan bayar."
            invalid={invalidField === "tanggalBayar"}
          />
        </FieldGroup>
      </FieldSet>

      {/* ── 4 · Fasilitas & biaya tambahan ── */}
      <FieldSet className="gap-4">
        <SectionLegend
          step="4"
          title="Fasilitas dan biaya tambahan"
          hint="Aktifkan yang berlaku bagi wajib pajak ini."
        />
        <div className="grid gap-3 md:grid-cols-3">
          <FacilityToggle
            id="is-gempa"
            title="Wilayah terdampak gempa"
            description="Sikka, Ende, Nagekeo, Ngada, Manggarai, Manggarai Timur, Manggarai Barat."
            impact="Diskon tunggakan 75%"
            checked={isDomisiliGempa}
            onCheckedChange={setIsDomisiliGempa}
            icon={<ShieldCheck />}
          />
          <FacilityToggle
            id="is-mutasi-masuk"
            title="Mutasi masuk luar daerah"
            description="Menggantikan diskon pembayaran awal pada PKB berjalan."
            impact="Diskon PKB berjalan 50%"
            checked={isMutasiMasuk}
            onCheckedChange={setIsMutasiMasuk}
            icon={<ArrowLeftRight />}
          />
          <FacilityToggle
            id="is-tembak-ru"
            title="Biaya tembak RU/STNK"
            description="Motor Rp150.000 · Mobil Rp250.000."
            impact="Biaya pengurusan"
            checked={isTembakRu}
            onCheckedChange={setIsTembakRu}
            icon={<Landmark />}
          />
        </div>
      </FieldSet>

      {validationError && (
        <Alert variant="destructive" className="animate-fade-up">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Data belum lengkap</AlertTitle>
          <AlertDescription>{validationError}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" size="lg" className="h-12 w-full text-base font-semibold">
        <Calculator data-icon="inline-start" aria-hidden="true" />
        Hitung penetapan
      </Button>
    </form>
  )
}
