/**
 * Pengisian otomatis wilayah gempa berdasarkan Nodis Pedoman Pergub NTT 54/2026:
 * Sikka, Ende, Nagekeo, Ngada, Manggarai, Manggarai Timur, Manggarai Barat.
 *
 * UPT Asal dipakai sebagai petunjuk kabupaten sesuai permintaan operator,
 * bukan bukti domisili terkini. Petugas tetap dapat mengoreksi toggle manual.
 * Alamat lengkap, kecamatan, dan kelurahan sengaja tidak dibaca/ditebak.
 */
export const KABUPATEN_GEMPA = [
  "Sikka", "Ende", "Nagekeo", "Ngada", "Manggarai", "Manggarai Timur", "Manggarai Barat",
] as const
export type KabupatenGempa = (typeof KABUPATEN_GEMPA)[number]

export type GempaEligibility =
  | { status: "eligible"; kabupaten: KabupatenGempa }
  | { status: "not_eligible"; reason: "plate_not_eb" | "origin_not_affected" }
  | { status: "unknown"; reason: "origin_missing" | "origin_unrecognized" }

const UNAFFECTED = new Set([
  "FLORES TIMUR", "LEMBATA", "ALOR", "KOTA KUPANG", "KUPANG", "TIMOR TENGAH SELATAN",
  "TIMOR TENGAH UTARA", "BELU", "MALAKA", "ROTE NDAO", "SABU RAIJUA",
  "SUMBA TIMUR", "SUMBA TENGAH", "SUMBA BARAT", "SUMBA BARAT DAYA",
])

/** Hanya awalan administratif standar; gerai/cabang/label tidak dikenal tak ditebak. */
function normalizeOrigin(value: string): string {
  return value.trim().toUpperCase().replace(/[.,]/g, " ").replace(/\s+/g, " ")
    .replace(/^UPTD? (?:PENDAPATAN DAERAH )?(?:WILAYAH )?/, "")
    .replace(/^WILAYAH /, "")
    .replace(/^(?:KABUPATEN|KAB) /, "")
    .trim()
}

export function resolveGempaEligibility(input: {
  nopol: string
  originUpt?: string | null
}): GempaEligibility {
  const nopol = input.nopol.toUpperCase().replace(/\s+/g, "")
  if (!/^EB(?=\d)/.test(nopol)) return { status: "not_eligible", reason: "plate_not_eb" }
  if (!input.originUpt?.trim()) return { status: "unknown", reason: "origin_missing" }
  const label = normalizeOrigin(input.originUpt)
  const kabupaten = KABUPATEN_GEMPA.find((name) => name.toUpperCase() === label)
  if (kabupaten) return { status: "eligible", kabupaten }
  if (UNAFFECTED.has(label)) return { status: "not_eligible", reason: "origin_not_affected" }
  return { status: "unknown", reason: "origin_unrecognized" }
}
