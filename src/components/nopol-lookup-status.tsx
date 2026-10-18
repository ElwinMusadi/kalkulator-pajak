import type { ReactNode } from "react";
import { format, isValid, parseISO } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import {
  CheckCircle2,
  CircleAlert,
  Loader2,
  SearchX,
  ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  VEHICLE_DATA_SOURCE_DESCRIPTION,
  VEHICLE_NOT_FOUND_MESSAGE,
  VEHICLE_SOURCE_ERROR_MESSAGE,
  type VehicleLookupSource,
} from "@/lib/vehicle-lookup-metadata";
import type { NopolLookupStatus, VehicleData } from "@/types/tax";

interface NopolLookupStatusProps {
  status: NopolLookupStatus;
  vehicleData: VehicleData | null;
  /** Dipertahankan untuk kompatibilitas pemanggil; tidak lagi ditampilkan. */
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

export function NopolLookupMessage({
  status,
  vehicleData,
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
    // Hanya identitas & asal data; NJKB, NJUB, bobot, jenis, dan tanggal
    // sudah tampil (dan dapat dikoreksi) di tahap 2–3.
    const njkbMissing = vehicleData.njkb <= 0;
    const nama = vehicleData.nama?.trim() || null;
    const originUpt = vehicleData.originUpt?.trim() || null;
    const syncedAt = formatSinkronisasi(vehicleData.syncedAt);

    return (
      <div className="animate-fade-up flex min-w-0 flex-col gap-2.5">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-success">
          <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
          Data ditemukan
        </p>
        {/* Bento hairline: gap-px di atas bg-border; nama selebar penuh. */}
        <dl className="grid min-w-0 grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border">
          <Fact label="Nama Pemilik" className="col-span-2">
            {nama ? (
              <span className="block truncate" title={nama}>
                {nama}
              </span>
            ) : (
              EMPTY_VALUE
            )}
          </Fact>
          <Fact label="UPT Asal">
            {originUpt ? (
              <span className="line-clamp-2 break-words" title={originUpt}>
                {originUpt}
              </span>
            ) : (
              EMPTY_VALUE
            )}
          </Fact>
          <Fact label="Sinkronisasi Data">
            {syncedAt ? (
              <span className="numeric break-words">{syncedAt}</span>
            ) : (
              EMPTY_VALUE
            )}
          </Fact>
        </dl>
        {njkbMissing && (
          <p className="flex min-w-0 items-start gap-1.5 text-xs leading-relaxed text-foreground">
            <CircleAlert
              className="mt-0.5 size-3.5 shrink-0 text-warning"
              aria-hidden="true"
            />
            <span className="min-w-0">
              <span className="font-semibold">Referensi NJKB tidak tersedia.</span>{" "}
              Isi NJKB secara manual pada Dasar Pengenaan.
            </span>
          </p>
        )}
        <p className="text-xs leading-relaxed text-muted-foreground">
          Salinan tersinkron dari {VEHICLE_DATA_SOURCE_DESCRIPTION}; periksa
          kembali dengan dokumen kendaraan.
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
