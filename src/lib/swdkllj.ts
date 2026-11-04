/**
 * src/lib/swdkllj.ts
 *
 * Tarif dan denda SWDKLLJ (Jasa Raharja) per golongan kendaraan, menurut
 * "Tarip Denda SWDKLLJ Jasa Raharja per 1 Juni 2017". Pokok = tarif SW +
 * biaya KD/sertifikat Rp3.000. Denda per keterlambatan masa berjalan:
 * 1–3 bulan, 4–6 bulan, 7–9 bulan, dan lebih dari 9 bulan.
 *
 * Hanya golongan yang dapat dihitung kalkulator: kendaraan bukan angkutan
 * umum (plat kuning DU/EU dihitung di loket) dan bukan alat berat (B).
 */

import type { GolonganSwdkllj, JenisKendaraan } from "../types/tax"

export interface TarifSwdkllj {
  golongan: GolonganSwdkllj
  /** Keterangan golongan untuk tampilan. */
  label: string
  /** Tarif SW + KD/sertifikat Rp3.000 per tahun. */
  pokok: number
  /** Denda keterlambatan: ≤ 3, 4–6, 7–9, dan > 9 bulan. */
  denda: readonly [number, number, number, number]
}

export const TARIF_SWDKLLJ: Record<GolonganSwdkllj, TarifSwdkllj> = {
  A: {
    golongan: "A",
    label: "Sepeda motor 50 cc ke bawah (SW bebas, hanya KD)",
    pokok: 3_000,
    denda: [0, 0, 0, 0],
  },
  C1: {
    golongan: "C1",
    label: "Sepeda motor di atas 50 cc s.d. 250 cc",
    pokok: 35_000,
    denda: [8_000, 16_000, 24_000, 32_000],
  },
  C2: {
    golongan: "C2",
    label: "Sepeda motor di atas 250 cc",
    pokok: 83_000,
    denda: [20_000, 40_000, 60_000, 80_000],
  },
  DP: {
    golongan: "DP",
    label: "Sedan, jeep, minibus, pick up/mobil barang s.d. 2.400 cc",
    pokok: 143_000,
    denda: [35_000, 70_000, 100_000, 100_000],
  },
  EP: {
    golongan: "EP",
    label: "Bus dan microbus bukan angkutan umum",
    pokok: 153_000,
    denda: [37_500, 75_000, 100_000, 100_000],
  },
  F: {
    golongan: "F",
    label: "Truck dan mobil barang di atas 2.400 cc",
    pokok: 163_000,
    denda: [40_000, 80_000, 100_000, 100_000],
  },
}

/**
 * Jenis kendaraan yang golongannya bergantung isi silinder (CC): sepeda
 * motor (A/C1/C2) dan mobil barang (DP s.d. 2.400 cc, F di atasnya).
 * Form mewajibkan CC untuk jenis ini.
 */
export const JENIS_BERGANTUNG_CC: readonly JenisKendaraan[] = [
  "SEPEDA MOTOR",
  "PICK UP",
  "LIGHT TRUCK",
  "TRUCK",
]

export function bergantungCc(jenis: JenisKendaraan): boolean {
  return JENIS_BERGANTUNG_CC.includes(jenis)
}

/**
 * Golongan SWDKLLJ dari jenis kendaraan dan isi silinder (CC).
 * CC kosong/tidak valid hanya terjadi pada pemanggil di luar form (form
 * mewajibkannya): sepeda motor dianggap C1, pick up dan light truck DP,
 * truck F, sama dengan perilaku sebelum CC dipakai.
 */
export function golonganSwdkllj(
  jenis: JenisKendaraan,
  isiSilinder?: number | null,
): GolonganSwdkllj {
  const cc =
    typeof isiSilinder === "number" && Number.isFinite(isiSilinder) && isiSilinder > 0
      ? isiSilinder
      : null

  switch (jenis) {
    case "SEPEDA MOTOR":
      if (cc === null) return "C1"
      return cc <= 50 ? "A" : cc <= 250 ? "C1" : "C2"
    case "PICK UP":
    case "LIGHT TRUCK":
      return cc !== null && cc > 2_400 ? "F" : "DP"
    case "TRUCK":
      return cc !== null && cc <= 2_400 ? "DP" : "F"
    case "MICROBUS":
      return "EP"
    case "MINIBUS":
    case "SEDAN":
    case "JEEP":
      return "DP"
  }
}

/** Denda SWDKLLJ masa berjalan untuk keterlambatan (bulan kalender, dibulatkan ke atas). */
export function dendaSwdklljFor(golongan: GolonganSwdkllj, bulanTerlambat: number): number {
  if (bulanTerlambat <= 0) return 0
  const { denda } = TARIF_SWDKLLJ[golongan]
  if (bulanTerlambat <= 3) return denda[0]
  if (bulanTerlambat <= 6) return denda[1]
  if (bulanTerlambat <= 9) return denda[2]
  return denda[3]
}
