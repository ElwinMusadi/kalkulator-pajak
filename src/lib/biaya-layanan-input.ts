// Relatif: parser ini juga diuji lewat tsx tanpa alias frontend.
import { BIAYA_LAYANAN_MAX } from "../types/tax"

export const BIAYA_LAYANAN_INPUT_MAX_LENGTH = 64

export type BiayaLayananInputResult =
  | { status: "empty"; value: 0 }
  | { status: "valid"; value: number }
  | { status: "invalid"; error: string }

const MAX_ERROR = `Maksimal Rp ${BIAYA_LAYANAN_MAX.toLocaleString("id-ID")}.`

/**
 * Rupiah bulat: digit mentah atau ribuan id-ID, opsional prefiks Rp dan ,00.
 * Tanda negatif, huruf lain, grouping salah, serta pecahan selain ,00 ditolak;
 * tidak pernah membuang karakter yang dapat mengubah arti nominal pengguna.
 */
export function parseBiayaLayananInput(raw: string): BiayaLayananInputResult {
  if (raw.length > BIAYA_LAYANAN_INPUT_MAX_LENGTH) {
    return { status: "invalid", error: "Input terlalu panjang (maksimal 64 karakter)." }
  }
  const text = raw.trim()
  if (!text) return { status: "empty", value: 0 }

  const amount = text.replace(/^Rp\s*/i, "")
  if (amount.startsWith("-")) {
    return { status: "invalid", error: "Nominal tidak boleh negatif." }
  }
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,00)?$/.test(amount)) {
    return {
      status: "invalid",
      error: "Gunakan Rupiah bulat, misalnya 25.000 atau Rp 25.000,00.",
    }
  }

  const value = Number(amount.replace(/,00$/, "").replace(/\./g, ""))
  if (!Number.isSafeInteger(value) || value > BIAYA_LAYANAN_MAX) {
    return { status: "invalid", error: MAX_ERROR }
  }
  return { status: "valid", value }
}

/** Format nilai diterima; teks salah tetap utuh agar dapat diperbaiki. */
export function formatBiayaLayananInput(raw: string): string {
  const parsed = parseBiayaLayananInput(raw)
  if (parsed.status === "empty") return ""
  if (parsed.status === "invalid") return raw
  return parsed.value.toLocaleString("id-ID", { maximumFractionDigits: 0 })
}
