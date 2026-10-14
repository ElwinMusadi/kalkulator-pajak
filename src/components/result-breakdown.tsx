import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BIAYA_LAYANAN_KEYS, BIAYA_LAYANAN_LABEL } from "@/types/tax";
import type { TaxCalculationResult } from "@/types/tax";

type ComponentKey = "pkb" | "opsen" | "swdkllj" | "biaya" | "layanan";

interface DetailRowData {
  label: string;
  value: number;
  waived?: boolean;
}

interface ComponentTile {
  key: ComponentKey;
  label: string;
  hint: string;
  amount: number;
  rows: DetailRowData[];
}

/** Menyusun tile komponen dari hasil kalkulasi — angka identik dengan rumus. */
function buildTiles(result: TaxCalculationResult): ComponentTile[] {
  const tiles: ComponentTile[] = [
    {
      key: "pkb",
      label: "PKB",
      hint: "Pajak Kendaraan Bermotor",
      amount:
        result.pkbBerjalan +
        result.pkbTunggakanPra2025 +
        result.pkbTunggakanPost2025,
      rows: [
        {
          label:
            result.pkbDiscount > 0
              ? `PKB berjalan · diskon ${result.pkbDiscount * 100}%`
              : "PKB berjalan",
          value: result.pkbBerjalan,
        },
        ...(result.pkbTunggakanPost2025 > 0
          ? [
              {
                label: `Tunggakan ≥ 5 Jan 2025 · ${result.tahunTunggakanPost} tahun`,
                value: result.pkbTunggakanPost2025,
              },
            ]
          : []),
        ...(result.pkbTunggakanPra2025 > 0
          ? [
              {
                label: `Tunggakan < 5 Jan 2025 · ${result.tahunTunggakanPra} tahun`,
                value: result.pkbTunggakanPra2025,
              },
            ]
          : []),
        {
          label: "Denda PKB · dibebaskan 100%",
          value: result.dendaPkb,
          waived: true,
        },
      ],
    },
    {
      key: "opsen",
      label: "Opsen PKB",
      hint: "Opsen Pajak Kabupaten/Kota",
      amount: result.opsenBerjalan + result.opsenTunggakan,
      rows: [
        { label: "Opsen berjalan", value: result.opsenBerjalan },
        ...(result.opsenTunggakan > 0
          ? [
              {
                label: `Opsen tunggakan · ${result.tahunTunggakanPost} tahun`,
                value: result.opsenTunggakan,
              },
            ]
          : []),
        {
          label: "Denda Opsen · dibebaskan 100%",
          value: result.dendaOpsen,
          waived: true,
        },
      ],
    },
    {
      key: "swdkllj",
      label: "SWDKLLJ",
      hint: "Sumbangan Wajib Jasa Raharja",
      amount:
        result.swdklljBerjalan +
        result.swdklljTunggakan +
        result.dendaSwdkllj,
      rows: [
        { label: "SWDKLLJ berjalan", value: result.swdklljBerjalan },
        ...(result.swdklljTunggakan > 0
          ? [
              {
                label: `SWDKLLJ tunggakan · ${result.tahunTunggakan} tahun`,
                value: result.swdklljTunggakan,
              },
            ]
          : []),
        ...(result.dendaSwdkllj > 0
          ? [
              {
                label: `Denda SWDKLLJ · ${result.bulanTerlambat} bulan`,
                value: result.dendaSwdkllj,
              },
            ]
          : []),
      ],
    },
  ];

  if (
    result.biayaStnk > 0 ||
    result.biayaTnkb > 0 ||
    result.biayaTembakRu > 0
  ) {
    tiles.push({
      key: "biaya",
      label: "STNK & TNKB",
      hint: "PNBP Penerbitan",
      amount: result.biayaStnk + result.biayaTnkb + result.biayaTembakRu,
      rows: [
        ...(result.biayaStnk > 0
          ? [{ label: "PNBP STNK", value: result.biayaStnk }]
          : []),
        ...(result.biayaTnkb > 0
          ? [{ label: "PNBP TNKB", value: result.biayaTnkb }]
          : []),
        ...(result.biayaTembakRu > 0
          ? [{ label: "Tembak RU/STNK", value: result.biayaTembakRu }]
          : []),
      ],
    });
  }

  // Biaya BBN & Mutasi (tahap 5): hanya tampil bila ada nominal yang diisi;
  // rinciannya memuat biaya bernilai > 0 saja.
  if (result.totalBiayaLayanan > 0) {
    tiles.push({
      key: "layanan",
      label: "BBN & Mutasi",
      hint: "Biaya Layanan",
      amount: result.totalBiayaLayanan,
      rows: BIAYA_LAYANAN_KEYS.filter((key) => result.biayaLayanan[key] > 0).map(
        (key) => ({
          label: BIAYA_LAYANAN_LABEL[key],
          value: result.biayaLayanan[key],
        }),
      ),
    });
  }

  return tiles;
}

function DetailRow({ label, value, waived = false }: DetailRowData) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3 py-1.5">
      <span className="min-w-0 text-sm leading-snug text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "numeric shrink-0 text-sm font-semibold",
          waived ? "text-success" : "text-foreground",
        )}
      >
        {formatRupiah(value)}
      </span>
    </div>
  );
}

interface ResultBreakdownProps {
  result: TaxCalculationResult;
  /** Dipertahankan untuk kompatibilitas; tata letak kini satu kolom di semua ukuran. */
  compact?: boolean;
}

/**
 * Daftar kartu komponen pajak: PKB / Opsen / SWDKLLJ / PNBP.
 * Setiap kartu adalah tombol disclosure; rinciannya muncul sebagai panel
 * di bawah daftar.
 */
export function ResultBreakdown({ result }: ResultBreakdownProps) {
  const [open, setOpen] = useState<ComponentKey[]>([]);
  const baseId = useId();
  const tiles = buildTiles(result);

  function toggle(key: ComponentKey) {
    setOpen((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {/* Satu kolom di semua ukuran: singkatan + kepanjangan muat utuh dalam
          satu baris dan setiap kartu tetap rendah (±64px). */}
      <div className="grid grid-cols-1 gap-2.5">
        {tiles.map((tile) => {
          const expanded = open.includes(tile.key);
          const panelId = `${baseId}-${tile.key}`;
          return (
            <button
              key={tile.key}
              type="button"
              aria-expanded={expanded}
              aria-controls={panelId}
              onClick={() => toggle(tile.key)}
              className={cn(
                "group/tile flex min-w-0 flex-col gap-1.5 rounded-xl border px-3.5 py-2.5 text-left transition-[border-color,background-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2",
                expanded
                  ? "border-navy-600/45 bg-gradient-teal-soft shadow-xs"
                  : "border-border bg-card hover:border-navy-600/35 hover:bg-navy-50/60",
              )}
            >
              {/* Singkatan + kepanjangan dalam satu baris; kepanjangan terpotong
                  rapi bila kolom sempit, singkatan tidak pernah terpotong. */}
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="shrink-0 text-[13px] font-semibold leading-none text-foreground">
                  {tile.label}
                </span>
                <span
                  aria-hidden="true"
                  className="size-1 shrink-0 rounded-full bg-muted-foreground/40"
                />
                <span className="min-w-0 flex-1 truncate text-[11px] leading-none text-muted-foreground">
                  {tile.hint}
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className={cn(
                    "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
                    expanded && "rotate-180 text-navy-800",
                  )}
                />
              </span>
              <span className="numeric block truncate text-base font-bold leading-tight tracking-tight text-navy-900 sm:text-[1.0625rem]">
                {formatRupiah(tile.amount)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Panel rincian: dirender untuk setiap tile yang terbuka, berurutan. */}
      {tiles.map((tile) => {
        const expanded = open.includes(tile.key);
        const panelId = `${baseId}-${tile.key}`;
        if (!expanded) {
          return <div key={tile.key} id={panelId} hidden />;
        }
        return (
          <section
            key={tile.key}
            id={panelId}
            aria-label={`Rincian ${tile.label}`}
            className="animate-fade-up rounded-xl border border-navy-800/15 bg-navy-50/50 px-4 py-2.5"
          >
            <p className="eyebrow flex items-center gap-2 py-1">
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full bg-gold-500"
              />
              Rincian {tile.label}
            </p>
            <div className="divide-y divide-border/70">
              {tile.rows.map((row) => (
                <DetailRow key={row.label} {...row} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
