/**
 * src/lib/pergub.ts
 *
 * Aturan keringanan PKB per Peraturan Gubernur NTT. Aturan yang dipakai
 * ditentukan oleh tanggal pembayaran (hari kalender lokal). Di luar masa
 * berlaku seluruh Pergub di bawah, kalkulator tidak menghasilkan penetapan.
 *
 * - Pergub 54/2026 (1 Sep – 31 Okt 2026): Nodis/SE 900.1.13.1/2741/BPAD2.1.
 * - Pergub 64/2026 (1 Nov – 31 Des 2026): mencabut Pergub 54/2026 (Pasal 11).
 */

import { format, isValid, parseISO } from "date-fns"
import { id as idLocale } from "date-fns/locale"
import type { PergubId } from "../types/tax"

export interface PergubRule {
  id: PergubId
  /** Label lengkap, mis. "Pergub NTT No. 64 Tahun 2026". */
  label: string
  /** Label pendek, mis. "Pergub 64/2026". */
  shortLabel: string
  /** Hari pertama berlaku (inklusif), "YYYY-MM-DD". */
  mulai: string
  /** Hari terakhir berlaku (inklusif), "YYYY-MM-DD". */
  sampai: string
  /**
   * Pengurangan pokok PKB tunggakan dalam persen bulat.
   * gempa = null → tidak ada pembedaan wilayah terdampak gempa.
   */
  diskonTunggakanPersen: { umum: number; gempa: number | null }
  /**
   * Pengurangan pokok PKB tahun berjalan bila membayar via payment online
   * (persen bulat); null = tidak ada. Diakumulasikan dengan diskon bayar awal.
   */
  diskonOnlinePersen: { motor: number; mobil: number } | null
  /**
   * Denda SWDKLLJ masa tunggakan dihapus (kebijakan BPAD untuk Pergub 64).
   * Kalkulator hanya menghitung denda SWDKLLJ masa berjalan pada semua
   * aturan; penanda ini menentukan baris "dihapus" pada rincian.
   */
  hapusDendaSwdklljTunggakan: boolean
}

export const PERGUB_RULES: readonly PergubRule[] = [
  {
    id: "54-2026",
    label: "Pergub NTT No. 54 Tahun 2026",
    shortLabel: "Pergub 54/2026",
    mulai: "2026-09-01",
    sampai: "2026-10-31",
    diskonTunggakanPersen: { umum: 50, gempa: 75 },
    diskonOnlinePersen: null,
    hapusDendaSwdklljTunggakan: false,
  },
  {
    id: "64-2026",
    label: "Pergub NTT No. 64 Tahun 2026",
    shortLabel: "Pergub 64/2026",
    mulai: "2026-11-01",
    sampai: "2026-12-31",
    // Pasal 8: pokok PKB tunggakan dihapus 100% untuk semua wilayah.
    diskonTunggakanPersen: { umum: 100, gempa: null },
    // Pasal 6: roda 2–3 5%, roda 4 dan seterusnya 2%.
    diskonOnlinePersen: { motor: 5, mobil: 2 },
    hapusDendaSwdklljTunggakan: true,
  },
]

/** Pergub terbaru; dipakai untuk label aplikasi. */
export const PERGUB_TERBARU: PergubRule = PERGUB_RULES[PERGUB_RULES.length - 1]

export function getPergub(id: PergubId): PergubRule {
  const rule = PERGUB_RULES.find((r) => r.id === id)
  if (!rule) throw new RangeError(`Pergub tidak dikenal: ${id}`)
  return rule
}

/** Aturan yang berlaku pada tanggal bayar; null bila di luar masa berlaku. */
export function resolvePergub(tanggalBayar: Date): PergubRule | null {
  if (!isValid(tanggalBayar)) return null
  const hari = format(tanggalBayar, "yyyy-MM-dd")
  return PERGUB_RULES.find((r) => hari >= r.mulai && hari <= r.sampai) ?? null
}

/** Toggle wilayah gempa hanya relevan bila Pergub membedakan diskon tunggakannya. */
export function hasWilayahGempa(rule: PergubRule | null): boolean {
  return rule !== null && rule.diskonTunggakanPersen.gempa !== null
}

/** Masa berlaku untuk tampilan: "1 November 2026 – 31 Desember 2026". */
export function formatMasaBerlaku(rule: PergubRule): string {
  const tampil = (iso: string) => format(parseISO(iso), "d MMMM yyyy", { locale: idLocale })
  return `${tampil(rule.mulai)} – ${tampil(rule.sampai)}`
}
