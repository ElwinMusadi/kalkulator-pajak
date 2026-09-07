import { useEffect, useState } from "react"
import { parseISO } from "date-fns"
import {
  CheckCircle2,
  HelpCircle,
  Loader2,
  XCircle,
} from "lucide-react"
import { DatePickerField } from "@/components/date-picker-field"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useNopolLookup } from "@/hooks/use-nopol-lookup"
import { calculateTax } from "@/lib/tax-calculator"
import { formatRupiah } from "@/lib/format"
import { BOBOT_MAP } from "@/types/tax"
import type { JenisKendaraan, TaxCalculationResult } from "@/types/tax"
import { cn } from "@/lib/utils"

const JENIS_OPTIONS: { value: JenisKendaraan; label: string }[] = [
  { value: "SEPEDA MOTOR", label: "Sepeda Motor (Bobot 1.0)" },
  { value: "MINIBUS", label: "Minibus (Bobot 1.05)" },
  { value: "PICK UP", label: "Pick Up (Bobot 1.085)" },
  { value: "SEDAN", label: "Sedan (Bobot 1.025)" },
  { value: "JEEP", label: "Jeep (Bobot 1.05)" },
  { value: "LIGHT TRUCK", label: "Light Truck (Bobot 1.3)" },
  { value: "MICROBUS", label: "Microbus (Bobot 1.085)" },
  { value: "TRUCK", label: "Truck (Bobot 1.4)" },
]

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

interface TaxCalculatorFormProps {
  onResult: (result: TaxCalculationResult | null) => void
}

export function TaxCalculatorForm({ onResult }: TaxCalculatorFormProps) {
  const [nopol, setNopol] = useState("")
  const [njkb, setNjkb] = useState("")
  const [bobot, setBobot] = useState<number | undefined>(undefined)
  const [jenisKendaraan, setJenisKendaraan] = useState<JenisKendaraan | undefined>(undefined)
  const [jatuhTempoPajak, setJatuhTempoPajak] = useState<Date | undefined>(undefined)
  const [jatuhTempoStnk, setJatuhTempoStnk] = useState<Date | undefined>(undefined)
  const [tanggalBayar, setTanggalBayar] = useState<Date | undefined>(() => new Date("2026-09-03"))
  const [isDomisiliGempa, setIsDomisiliGempa] = useState(false)
  const [isTembakRu, setIsTembakRu] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)

  const { vehicleData, status: lookupStatus } = useNopolLookup(nopol)

  // Auto-fill saat data kendaraan ditemukan
  useEffect(() => {
    if (!vehicleData) return
    if (vehicleData.njkb > 0) setNjkb(String(vehicleData.njkb))
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setValidationError(null)

    const njkbNum = parseFloat(njkb)
    if (!njkb || isNaN(njkbNum) || njkbNum <= 0) {
      setValidationError("NJKB harus diisi dengan nilai lebih dari 0.")
      return
    }
    if (!jenisKendaraan) {
      setValidationError("Jenis kendaraan harus dipilih.")
      return
    }
    if (!jatuhTempoPajak) {
      setValidationError("Jatuh Tempo Pajak harus diisi.")
      return
    }
    if (!jatuhTempoStnk) {
      setValidationError("Jatuh Tempo STNK harus diisi.")
      return
    }
    if (!tanggalBayar) {
      setValidationError("Tanggal Pembayaran harus diisi.")
      return
    }

    const result = calculateTax({
      njkb: njkbNum,
      bobot: effectiveBobot,
      jenisKendaraan,
      jatuhTempoPajak,
      jatuhTempoStnk,
      tanggalBayar,
      isDomisiliGempa,
      isTembakRu,
    })

    onResult(result)
  }

  // Status indicator Nopol
  const LookupIndicator = () => {
    if (lookupStatus === "loading")
      return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
    if (lookupStatus === "found")
      return <CheckCircle2 className="h-4 w-4 text-green-500" />
    if (lookupStatus === "not_found")
      return <HelpCircle className="h-4 w-4 text-amber-500" />
    if (lookupStatus === "error")
      return <XCircle className="h-4 w-4 text-red-500" />
    return null
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">

        {/* ── Baris 1 ── */}

        {/* Nopol */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="nopol">Nomor Polisi (Plat)</Label>
          <div className="relative">
            <Input
              id="nopol"
              value={nopol}
              onChange={(e) => {
                setNopol(e.target.value.toUpperCase())
                // Reset auto-fill jika user ganti nopol
                onResult(null)
              }}
              placeholder="Contoh: DH6096KS"
              className="uppercase pr-8"
              maxLength={12}
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
              <LookupIndicator />
            </span>
          </div>

          {/* Info kendaraan ditemukan */}
          {lookupStatus === "found" && vehicleData && (
            <p className="text-xs text-green-600 dark:text-green-400 font-medium">
              ✓ {vehicleData.nama ?? "—"}
            </p>
          )}
          {lookupStatus === "not_found" && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Data tidak ditemukan — isi manual
            </p>
          )}
        </div>

        {/* NJKB */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="njkb">
            NJKB <span className="text-destructive">*</span>
          </Label>
          <Input
            id="njkb"
            type="number"
            value={njkb}
            onChange={(e) => {
              setNjkb(e.target.value)
              // Jika user edit manual, clear bobot dari DB agar jenis kendaraan yg menentukan
              setBobot(undefined)
            }}
            placeholder="Otomatis / manual"
            min={0}
            step={1000}
          />
          {njkb && !isNaN(parseFloat(njkb)) && (
            <p className="text-xs text-muted-foreground">
              {formatRupiah(parseFloat(njkb))}
            </p>
          )}
        </div>

        {/* Jenis Kendaraan */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="jenis">
            Jenis Kendaraan <span className="text-destructive">*</span>
          </Label>
          <Select
            value={jenisKendaraan}
            onValueChange={(v) => {
              setJenisKendaraan(v as JenisKendaraan)
              // Saat user ganti jenis, clear bobot dari DB
              setBobot(undefined)
            }}
          >
            <SelectTrigger id="jenis">
              <SelectValue placeholder="Pilih jenis kendaraan" />
            </SelectTrigger>
            <SelectContent>
              {JENIS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {bobot !== undefined && jenisKendaraan && (
            <p className="text-xs text-blue-600 dark:text-blue-400">
              Bobot dari data: {bobot} (override manual akan reset ini)
            </p>
          )}
        </div>

        {/* ── Baris 2 ── */}

        <DatePickerField
          id="jatuh-tempo-pajak"
          label="Jatuh Tempo Pajak (SKPD)"
          value={jatuhTempoPajak}
          onChange={setJatuhTempoPajak}
          required
        />

        <DatePickerField
          id="jatuh-tempo-stnk"
          label="Jatuh Tempo STNK (Plat)"
          value={jatuhTempoStnk}
          onChange={setJatuhTempoStnk}
          required
        />

        <DatePickerField
          id="tanggal-bayar"
          label="Tanggal Pembayaran"
          value={tanggalBayar}
          onChange={setTanggalBayar}
          required
        />

        {/* ── Opsi Tambahan ── */}

        {/* Checkbox Gempa */}
        <div className="md:col-span-3 flex items-center gap-2 mt-1">
          <Checkbox
            id="is-gempa"
            checked={isDomisiliGempa}
            onCheckedChange={(checked) =>
              setIsDomisiliGempa(checked === true)
            }
          />
          <Label htmlFor="is-gempa" className="cursor-pointer font-normal">
            Domisili Wilayah Gempa{" "}
            <span className="text-muted-foreground">(Diskon Tunggakan 75%)</span>
          </Label>
        </div>

        {/* Switch Tembak RU */}
        <div className="md:col-span-3">
          <label
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition-colors",
              isTembakRu
                ? "border-primary/30 bg-primary/5"
                : "border-border bg-muted/30 hover:bg-muted/50"
            )}
          >
            <Switch
              id="is-tembak-ru"
              checked={isTembakRu}
              onCheckedChange={setIsTembakRu}
            />
            <div>
              <p className="text-sm font-medium">Tambah Biaya Tembak RU/STNK</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Motor: Rp150.000 &middot; Mobil: Rp250.000
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* Validation error */}
      {validationError && (
        <Card className="mb-4 border-destructive/50 bg-destructive/5">
          <CardContent className="py-3 px-4">
            <p className="text-sm text-destructive">{validationError}</p>
          </CardContent>
        </Card>
      )}

      <Button type="submit" className="w-full" size="lg">
        Hitung Rincian Pajak
      </Button>
    </form>
  )
}
