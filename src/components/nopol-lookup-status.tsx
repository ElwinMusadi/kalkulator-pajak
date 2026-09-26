import {
  CheckCircle2,
  CircleAlert,
  Database,
  Globe2,
  Loader2,
  SearchX,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getVehicleSourceLabel,
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
}

export function NopolLookupIndicator({
  status,
}: {
  status: NopolLookupStatus;
}) {
  if (status === "loading")
    return (
      <Loader2
        className="size-4 animate-spin text-muted-foreground"
        aria-hidden="true"
      />
    );
  if (status === "found")
    return <CheckCircle2 className="size-4 text-success" aria-hidden="true" />;
  if (status === "not_found")
    return <SearchX className="size-4 text-warning" aria-hidden="true" />;
  if (status === "error")
    return (
      <CircleAlert className="size-4 text-destructive" aria-hidden="true" />
    );
  return null;
}

export function NopolLookupMessage({
  status,
  vehicleData,
  lookupSource,
  errorMessage,
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
      <p className="text-sm text-muted-foreground">Memeriksa data kendaraan…</p>
    );
  }

  if (status === "found" && vehicleData) {
    const source = lookupSource ?? vehicleData.source ?? null;
    const sourceLabel = getVehicleSourceLabel(source);
    const SourceIcon = source === "api" ? Globe2 : Database;

    return (
      <div
        className={cn(
          "animate-fade-up rounded-md border border-success-subtle bg-success-subtle px-3 py-2",
        )}
      >
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-success">
              Data Ditemukan
            </p>
            <p className="mt-0.5 truncate text-sm font-medium text-foreground">
              {vehicleData.nama ?? "Nama pemilik tidak tersedia"}
            </p>
            {vehicleData.njkb <= 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Referensi NJKB tidak tersedia. Masukkan NJKB secara manual.
              </p>
            )}
          </div>
          {sourceLabel && (
            <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-success-subtle bg-background/70 px-2 py-1 text-[11px] font-medium text-muted-foreground">
              <SourceIcon className="size-3" aria-hidden="true" />
              <span>Sumber data: </span>
              {sourceLabel}
            </span>
          )}
        </div>
      </div>
    );
  }

  if (status === "not_found") {
    return (
      <div className="animate-fade-up flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-foreground">
        <SearchX className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
        <div>
          <p className="font-medium">Kendaraan Tidak Ditemukan</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {VEHICLE_NOT_FOUND_MESSAGE}
          </p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="animate-fade-up flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
        <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
        <div>
          <p className="font-medium text-destructive">Sumber Data Mengalami Error</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {errorMessage ?? VEHICLE_SOURCE_ERROR_MESSAGE}
          </p>
        </div>
      </div>
    );
  }

  return null;
}
