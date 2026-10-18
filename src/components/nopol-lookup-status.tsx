import type { ReactNode } from "react";
import { format, isValid, parseISO } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import {
  CheckCircle2,
  CircleAlert,
  Globe2,
  Loader2,
  SearchX,
  ShieldAlert,
} from "lucide-react";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  getVehicleSourceLabel,
  VEHICLE_DATA_SOURCE_DESCRIPTION,
  VEHICLE_NOT_FOUND_MESSAGE,
  VEHICLE_SOURCE_ERROR_MESSAGE,
  type VehicleLookupSource,
} from "@/lib/vehicle-lookup-metadata";
import type { NopolLookupStatus, VehicleData } from "@/types/tax";

interface NopolLookupStatusProps {
  status: NopolLookupStatus;
  vehicleData: VehicleData | null;
  lookupSource: VehicleLookupSource | null;
  errorMessage: string | null;
  /** Lookup ditolak server karena izin (HTTP 403). */
  forbidden?: boolean;
}

/**
 * Ikon status di tepi kanan plat. Tanpa kelas warna: ikon memakai
 * `currentColor` = warna huruf plat, sehingga kontras di plat putih/hitam/merah.
 */
export function NopolLookupIndicator({
  status,
  className,
}: {
  status: NopolLookupStatus;
  className?: string;
}) {
  const iconClass = cn("size-5", className);
  if (status === "loading")
    return (
      <Loader2
        className={cn(iconClass, "animate-spin opacity-70")}
        aria-hidden="true"
      />
    );
  if (status === "found")
    return <CheckCircle2 className={iconClass} aria-hidden="true" />;
  if (status === "not_found")
    return <SearchX className={iconClass} aria-hidden="true" />;
  if (status === "error")
    return <CircleAlert className={iconClass} aria-hidden="true" />;
  return null;
}

type RowTone = "warning" | "destructive" | "neutral";

const ROW_TONE: Record<RowTone, { box: string; chip: string; title: string }> = {
  warning: {
    box: "border-warning/30 bg-warning/5",
    chip: "border-warning/25 bg-warning/10 text-warning",
    title: "text-foreground",
  },
  destructive: {
    box: "border-destructive/25 bg-destructive/5",
    chip: "border-destructive/20 bg-destructive/10 text-destructive",
    title: "text-destructive",
  },
  neutral: {
    box: "border-border bg-muted/50",
    chip: "border-border bg-card text-muted-foreground",
    title: "text-foreground",
  },
};

/** Baris peringatan: chip ikon + judul + deskripsi. */
function StatusRow({
  tone,
  icon,
  title,
  children,
}: {
  tone: RowTone;
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  const styles = ROW_TONE[tone];
  return (
    <div
      className={cn(
        "animate-fade-up flex min-w-0 items-start gap-3 rounded-lg border p-3",
        styles.box,
      )}
    >
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-md border [&_svg]:size-4",
          styles.chip,
        )}
        aria-hidden="true"
      >
        {icon}
      </span>
      <div className="min-w-0 pt-0.5">
        <p className={cn("text-sm font-semibold leading-snug", styles.title)}>
          {title}
        </p>
        <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-muted-foreground">
          {children}
        </p>
      </div>
    </div>
  );
}

/** Ditampilkan saat akun tidak memiliki izin sumber data mana pun. */
export function NopolLookupDisabledMessage() {
  return (
    <StatusRow
      tone="neutral"
      icon={<ShieldAlert />}
      title="Pencarian Nopol Tidak Diizinkan"
    >
      Akun Anda belum memiliki akses sumber data kendaraan. Lengkapi Dasar
      Pengenaan dan Masa Pajak secara manual, atau hubungi Admin.
    </StatusRow>
  );
}

function formatTanggal(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = parseISO(iso);
  return isValid(date) ? format(date, "d MMM yyyy", { locale: idLocale }) : null;
}

/** Satu sel bento fakta kendaraan. */
function Fact({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1 bg-card px-3.5 py-3", className)}>
      <dt className="eyebrow leading-tight">{label}</dt>
      <dd className="min-w-0 text-sm font-medium leading-snug text-foreground">
        {children}
      </dd>
    </div>
  );
}

const EMPTY_VALUE = <span className="text-muted-foreground">—</span>;

/**
 * Waktu sinkronisasi dataset; hanya ditampilkan bila ISO valid dan masuk akal
 * (tidak di masa depan lebih dari 1 hari, tidak sebelum 2000).
 */
function formatSinkronisasi(iso: string | null | undefined): string | null {
  if (typeof iso !== "string" || !iso.trim()) return null;
  const date = parseISO(iso);
  if (!isValid(date)) return null;
  const time = date.getTime();
  if (time < Date.UTC(2000, 0, 1) || time > Date.now() + 86_400_000) return null;
  const hasTime = /T\d{2}:\d{2}/.test(iso);
  return format(date, hasTime ? "d MMM yyyy, HH:mm" : "d MMM yyyy", {
    locale: idLocale,
  });
}

/**
 * Rentang kolom sel tambahan agar bento selalu penuh:
 * 2 kolom — sel ganjil terakhir melebar; 4 kolom — 1:4, 2:2+2, 3:2+1+1, 4:1×4.
 */
function extraFactSpan(index: number, count: number): string {
  const base = count % 2 === 1 && index === count - 1 ? "col-span-2" : "col-span-1";
  let wide = "@xl:col-span-1";
  if (count === 1) wide = "@xl:col-span-4";
  else if (count === 2 || (count === 3 && index === 0)) wide = "@xl:col-span-2";
  return cn(base, wide);
}

export function NopolLookupMessage({
  status,
  vehicleData,
  lookupSource,
  errorMessage,
  forbidden = false,
}: NopolLookupStatusProps) {
  if (status === "idle") {
    return (
      <p className="text-sm text-muted-foreground">
        Data kendaraan terisi otomatis bila Nopol terdaftar.
      </p>
    );
  }

  if (status === "loading") {
    return (
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex shrink-0 flex-col gap-1.5" aria-hidden="true">
          <span className="h-2 w-20 rounded-full bg-muted motion-safe:animate-pulse" />
          <span className="h-2 w-12 rounded-full bg-muted motion-safe:animate-pulse" />
        </span>
        <p className="min-w-0 text-sm text-muted-foreground">
          Memeriksa data kendaraan…
        </p>
      </div>
    );
  }

  if (status === "found" && vehicleData) {
    // Hanya satu sumber aktif; label selalu "API Data Kendaraan".
    const sourceLabel =
      getVehicleSourceLabel(lookupSource ?? vehicleData.source ?? "api");
    const njkbMissing = vehicleData.njkb <= 0;
    const pajak = formatTanggal(vehicleData.jatuhTempoPajak);
    const stnk = formatTanggal(vehicleData.jatuhTempoStnk);
    const nama = vehicleData.nama ?? "Nama pemilik tidak tersedia";
    const njub =
      typeof vehicleData.njub === "number" &&
      Number.isFinite(vehicleData.njub) &&
      vehicleData.njub > 0
        ? vehicleData.njub
        : null;
    const bobot =
      typeof vehicleData.bobot === "number" &&
      Number.isFinite(vehicleData.bobot) &&
      vehicleData.bobot > 0
        ? vehicleData.bobot
        : null;
    const originUpt = vehicleData.originUpt?.trim() || null;
    const syncedAt = formatSinkronisasi(vehicleData.syncedAt);

    // Sel tambahan opsional; rentang kolom dihitung agar grid selalu penuh.
    const extraFacts: { key: string; label: string; content: ReactNode; tone?: string }[] = [];
    if (njub !== null) {
      extraFacts.push({
        key: "njub",
        label: "NJUB",
        content: (
          <span className="min-w-0">
            <span className="numeric block truncate font-semibold">
              {formatRupiah(njub)}
            </span>
            <span className="block text-xs font-normal text-muted-foreground">
              Ditambahkan ke dasar pengenaan.
            </span>
          </span>
        ),
        tone: "bg-[color-mix(in_oklch,var(--primary)_6%,var(--card))]",
      });
    }
    if (bobot !== null) {
      extraFacts.push({
        key: "bobot",
        label: "Bobot",
        content: (
          <span className="numeric block truncate">
            {bobot.toLocaleString("id-ID")}
          </span>
        ),
      });
    }
    if (originUpt) {
      extraFacts.push({
        key: "origin",
        label: "UPT asal",
        content: (
          <span className="block min-w-0 truncate" title={originUpt}>
            {originUpt}
          </span>
        ),
      });
    }
    if (syncedAt) {
      extraFacts.push({
        key: "synced",
        label: "Sinkronisasi data",
        content: <span className="numeric block truncate">{syncedAt}</span>,
      });
    }
    const extraCount = extraFacts.length;

    return (
      <div className="animate-fade-up @container flex min-w-0 flex-col gap-2.5">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-success">
          <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
          Data ditemukan
        </p>
        {/*
          Bento hairline: gap-px di atas bg-border. Rentang kolom dipilih agar
          grid selalu penuh (2 kolom: 2·1+1·2+1+1 / 4 kolom: 2+1+1 · 2+1+1).
        */}
        <dl className="grid min-w-0 grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border @xl:grid-cols-4">
          <Fact label="Pemilik" className="col-span-2">
            <span className="block truncate" title={nama}>
              {nama}
            </span>
          </Fact>
          <Fact label="Jenis">
            <span className="block truncate">
              {vehicleData.jenis ?? EMPTY_VALUE}
            </span>
          </Fact>
          <Fact label="Sumber data">
            <span className="flex min-w-0 items-start gap-1.5">
              <Globe2
                className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="min-w-0 break-words">{sourceLabel}</span>
            </span>
          </Fact>
          <Fact
            label="NJKB"
            // Warna solid (bukan alpha): latar sel tidak boleh tembus ke garis bento.
            className={cn(
              "col-span-2",
              njkbMissing &&
                "bg-[color-mix(in_oklch,var(--warning)_8%,var(--card))]",
            )}
          >
            {njkbMissing ? (
              <span className="flex min-w-0 items-start gap-1.5">
                <CircleAlert
                  className="mt-0.5 size-3.5 shrink-0 text-warning"
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <span className="block">Referensi NJKB tidak tersedia.</span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    Masukkan NJKB secara manual.
                  </span>
                </span>
              </span>
            ) : (
              <span className="numeric block truncate font-semibold">
                {formatRupiah(vehicleData.njkb)}
              </span>
            )}
          </Fact>
          <Fact label="Jatuh tempo pajak">
            {pajak ? <span className="numeric">{pajak}</span> : EMPTY_VALUE}
          </Fact>
          <Fact label="Jatuh tempo STNK">
            {stnk ? <span className="numeric">{stnk}</span> : EMPTY_VALUE}
          </Fact>
          {extraFacts.map((fact, index) => (
            <Fact
              key={fact.key}
              label={fact.label}
              className={cn(fact.tone, extraFactSpan(index, extraCount))}
            >
              {fact.content}
            </Fact>
          ))}
        </dl>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Data berupa salinan tersinkron dari {VEHICLE_DATA_SOURCE_DESCRIPTION},
          bukan data langsung. Periksa kembali dengan dokumen kendaraan.
        </p>
      </div>
    );
  }

  if (status === "not_found") {
    return (
      <StatusRow tone="warning" icon={<SearchX />} title="Kendaraan Tidak Ditemukan">
        {VEHICLE_NOT_FOUND_MESSAGE}
      </StatusRow>
    );
  }

  if (status === "error" && forbidden) {
    return (
      <StatusRow tone="warning" icon={<ShieldAlert />} title="Akses Pencarian Ditolak">
        {errorMessage ?? "Akun Anda tidak memiliki izin untuk sumber data ini."}{" "}
        Lengkapi data secara manual atau hubungi Admin.
      </StatusRow>
    );
  }

  if (status === "error") {
    return (
      <StatusRow
        tone="destructive"
        icon={<CircleAlert />}
        title="Sumber Data Mengalami Error"
      >
        {errorMessage ?? VEHICLE_SOURCE_ERROR_MESSAGE}
      </StatusRow>
    );
  }

  return null;
}
