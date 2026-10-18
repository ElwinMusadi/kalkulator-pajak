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
    <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2">
      <span className="min-w-0 flex-1 basis-40 text-sm leading-snug text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "monetary ml-auto text-right text-sm font-medium",
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
 * Daftar komponen biaya bergaya faktur: PKB / Opsen / SWDKLLJ / PNBP / BBN.
 * Setiap baris adalah tombol disclosure; rinciannya terbuka tepat di bawah
 * baris tersebut di dalam grup yang sama.
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
    <div className="min-w-0">
      <p
        id={`${baseId}-heading`}
        className="px-1 pb-1.5 text-[0.8125rem] font-medium text-muted-foreground"
      >
        Komponen Biaya
      </p>
      <ul
        aria-labelledby={`${baseId}-heading`}
        className="min-w-0 divide-y divide-border/70 overflow-hidden rounded-[1.25rem] border border-border/70 bg-card"
      >
        {tiles.map((tile) => {
          const expanded = open.includes(tile.key);
          const panelId = `${baseId}-${tile.key}`;
          return (
            <li key={tile.key} className="min-w-0">
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => toggle(tile.key)}
                className={cn(
                  "flex min-h-11 w-full min-w-0 items-center gap-2 px-4 py-2.5 text-left transition-colors duration-150",
                  "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  expanded && "bg-muted/40",
                )}
              >
                {/* Singkatan + kepanjangan satu baris pada ruang normal; boleh
                    wrap saat teks diperbesar. Nominal punya kolom sendiri di
                    kanan, tidak pernah dipotong. */}
                <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-1.5 gap-y-0">
                  <span className="text-[0.9375rem] font-semibold leading-snug text-foreground">
                    {tile.label}
                  </span>
                  <span className="text-[0.8125rem] leading-snug text-muted-foreground">
                    {tile.hint}
                  </span>
                </span>
                <span className="monetary shrink-0 text-right text-[0.9375rem] font-semibold leading-snug text-foreground">
                  {formatRupiah(tile.amount)}
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className={cn(
                    "size-4 shrink-0 stroke-[1.75] text-muted-foreground transition-transform duration-200",
                    expanded && "rotate-180 text-primary",
                  )}
                />
              </button>
              <div
                id={panelId}
                role="region"
                aria-label={`Rincian ${tile.label}`}
                hidden={!expanded}
                className="animate-fade-up border-t border-border/60 bg-muted/30 px-4 py-1"
              >
                {expanded && (
                  <div className="divide-y divide-border/60">
                    {tile.rows.map((row) => (
                      <DetailRow key={row.label} {...row} />
                    ))}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
