/**
 * src/lib/tax-calculator.ts
 *
 * Kalkulasi PKB & Opsen berdasarkan Pergub NTT keringanan PKB yang berlaku
 * pada tanggal bayar (lihat src/lib/pergub.ts):
 * - Pergub 54/2026: Surat Edaran Nomor 900.1.13.1/2741/BPAD2.1 beserta
 *   contoh penetapan yang terlampir.
 * - Pergub 64/2026: pokok PKB tunggakan dihapus 100% (Pasal 8) dan diskon
 *   payment online (Pasal 6) yang diakumulasikan dengan diskon bayar awal
 *   (Pasal 10). Rumus lain sama dengan Pergub 54/2026.
 */

import { differenceInCalendarDays } from "date-fns"
import { getPergub, resolvePergub } from "./pergub"
import { dendaSwdklljFor, golonganSwdkllj, TARIF_SWDKLLJ } from "./swdkllj"
import {
  BIAYA_LAYANAN_KEYS,
  BIAYA_LAYANAN_MAX,
  type BiayaLayananKey,
  DEFAULT_WARNA_PLAT,
  isWarnaPlat,
  TARIF_PKB_PLAT_MERAH,
  type TaxCalculatorInput,
  type TaxCalculationResult,
  type WarnaPlat,
} from "../types/tax"

/** Tanggal cutoff berlakunya Opsen PKB dan tarif PKB 1,2% */
const CUTOFF_OPSEN = new Date("2025-01-05T00:00:00")

/**
 * Tarif PKB per periode.
 * - Plat merah (kendaraan dinas): 0,5% untuk seluruh periode.
 * - Plat putih/hitam: 1,5% sebelum 5 Jan 2025, 1,2% sesudahnya.
 * Opsen tetap ditentukan oleh tanggal periode, bukan warna plat.
 */
function tarifPkbFor(start: Date, warnaPlat: WarnaPlat): number {
  if (warnaPlat === "merah") return TARIF_PKB_PLAT_MERAH
  return start < CUTOFF_OPSEN ? 0.015 : 0.012
}

// ---------------------------------------------------------------------------
// Utilitas tanggal
// ---------------------------------------------------------------------------

/**
 * Jumlah bulan kalender antara dua tanggal, dibulatkan ke atas.
 * Digunakan untuk menghitung denda Opsen dan denda SWDKLLJ.
 */
function bulanKalender(dari: Date, hingga: Date): number {
  const tahun = hingga.getFullYear() - dari.getFullYear()
  const bulan = hingga.getMonth() - dari.getMonth()
  const hari = hingga.getDate() - dari.getDate()
  const total = tahun * 12 + bulan + (hari > 0 ? 1 : 0)
  return Math.max(0, total)
}

// ---------------------------------------------------------------------------
// Struktur periode pajak internal
// ---------------------------------------------------------------------------

interface TaxPeriod {
  start: Date     // Tanggal awal periode
  tarifPkb: number
  kenaOpsen: boolean
  status: "tunggakan" | "berjalan"
}

/**
 * Menghasilkan daftar periode pajak dari awal jatuh tempo hingga
 * tahun bayar. Maksimal 4 tunggakan + 1 berjalan.
 * Jika jatuh tempo berada di tahun setelah tahun bayar, tidak ada tunggakan
 * dan periode berjalan memakai tanggal jatuh tempo asli.
 */
function buildTaxPeriods(
  jatuhTempoPajak: Date,
  tanggalBayar: Date,
  warnaPlat: WarnaPlat,
): TaxPeriod[] {
  const tahunBayar = tanggalBayar.getFullYear()
  const tahunAwal = jatuhTempoPajak.getFullYear()

  // Semua tahun sebelum tahun bayar = tunggakan
  const semuaTunggakan: TaxPeriod[] = []
  for (let tahun = tahunAwal; tahun < tahunBayar; tahun++) {
    const start = new Date(jatuhTempoPajak)
    start.setFullYear(tahun)
    semuaTunggakan.push({
      start,
      tarifPkb: tarifPkbFor(start, warnaPlat),
      kenaOpsen: start >= CUTOFF_OPSEN,
      status: "tunggakan",
    })
  }

  // Maksimal 4 tunggakan terakhir
  const tunggakan =
    semuaTunggakan.length > 4
      ? semuaTunggakan.slice(-4)
      : semuaTunggakan

  // Periode berjalan.
  // - Jatuh tempo lampau/tahun ini: model tahun kalender yang ada tetap
  //   dipakai (tanggal jatuh tempo digeser ke tahun bayar).
  // - Jatuh tempo pada tahun setelah tahun bayar (mis. JT 5 Jan 2027 dibayar
  //   19 Okt 2026): tahun aslinya dipertahankan sehingga periode tersebut
  //   menjadi periode berjalan yang belum jatuh tempo, bukan digeser mundur
  //   ke tahun bayar (yang keliru menimbulkan keterlambatan/denda).
  const berjalanStart = new Date(jatuhTempoPajak)
  berjalanStart.setFullYear(Math.max(tahunAwal, tahunBayar))

  const berjalan: TaxPeriod = {
    start: berjalanStart,
    tarifPkb: tarifPkbFor(berjalanStart, warnaPlat),
    kenaOpsen: berjalanStart >= CUTOFF_OPSEN,
    status: "berjalan",
  }

  return [...tunggakan, berjalan]
}

// ---------------------------------------------------------------------------
// Fungsi utama
// ---------------------------------------------------------------------------

export function calculateTax(input: TaxCalculatorInput): TaxCalculationResult {
  const {
    njkb,
    njub,
    bobot,
    jenisKendaraan,
    jatuhTempoPajak,
    jatuhTempoStnk,
    tanggalBayar,
    isDomisiliGempa,
    isMutasiMasuk = false,
    isTembakRu,
  } = input
  // Pengaman runtime: null/nilai tak valid diperlakukan sebagai default.
  const warnaPlat: WarnaPlat = isWarnaPlat(input.warnaPlat) ? input.warnaPlat : DEFAULT_WARNA_PLAT

  // Di luar masa berlaku Pergub tidak ada dasar perhitungan; pemanggil (form)
  // wajib memeriksa resolvePergub lebih dulu dan tidak menampilkan hasil.
  const pergub = input.pergub ? getPergub(input.pergub) : resolvePergub(tanggalBayar)
  if (!pergub) {
    throw new RangeError("Tanggal pembayaran di luar masa berlaku Pergub keringanan PKB.")
  }

  const isMotor = jenisKendaraan === "SEPEDA MOTOR"

  /** Dasar pengenaan penuh (termasuk NJUB jika ada ubah bentuk) */
  const dasarPenuh = (njkb + njub) * bobot

  // -----------------------------------------------------------------------
  // Bangun periode
  // -----------------------------------------------------------------------
  const semua = buildTaxPeriods(jatuhTempoPajak, tanggalBayar, warnaPlat)
  const tunggakanPeriods = semua.filter((p) => p.status === "tunggakan")
  const berjalanPeriod = semua.find((p) => p.status === "berjalan")!

  // -----------------------------------------------------------------------
  // PKB & Opsen Tunggakan
  // Pergub 54: diskon 75% (wilayah gempa) / 50%. Pergub 64: dihapus 100%
  // untuk semua wilayah sehingga PKB dan Opsen tunggakan bernilai 0.
  // -----------------------------------------------------------------------
  const { umum: diskonUmumPersen, gempa: diskonGempaPersen } = pergub.diskonTunggakanPersen
  const isGempaBerlaku = diskonGempaPersen !== null && isDomisiliGempa
  const diskonTunggakan =
    (diskonGempaPersen !== null && isDomisiliGempa ? diskonGempaPersen : diskonUmumPersen) / 100

  let pkbTunggakanPra2025 = 0
  let pkbTunggakanPost2025 = 0
  let opsenTunggakan = 0
  let tahunTunggakanPra = 0
  let tahunTunggakanPost = 0

  for (const period of tunggakanPeriods) {
    const pkbPokok = dasarPenuh * period.tarifPkb
    const pkbDiskon = pkbPokok * (1 - diskonTunggakan)

    if (period.kenaOpsen) {
      pkbTunggakanPost2025 += pkbDiskon
      opsenTunggakan += pkbDiskon * 0.66
      tahunTunggakanPost++
    } else {
      pkbTunggakanPra2025 += pkbDiskon
      tahunTunggakanPra++
    }
  }

  const tahunTunggakan = tunggakanPeriods.length
  const pkbTunggakan = pkbTunggakanPra2025 + pkbTunggakanPost2025

  // -----------------------------------------------------------------------
  // PKB Berjalan
  // -----------------------------------------------------------------------
  // Pengurang dasar pengenaan 17,5% hanya berlaku jika:
  //   (a) tidak ada tunggakan, DAN
  //   (b) masa pajak berjalan sudah masuk rezim Opsen (≥ 5 Jan 2025)
  const adaTunggakan = tahunTunggakan > 0
  const boolOpsenBerjalan = berjalanPeriod.kenaOpsen

  const faktorDpBerjalan =
    !adaTunggakan && boolOpsenBerjalan ? 0.825 : 1.0
  const dpBerjalan = dasarPenuh * faktorDpBerjalan

  const basePkbBerjalan = dpBerjalan * berjalanPeriod.tarifPkb

  // Diskon PKB berjalan: hanya bila tidak ada tunggakan dan bayar sebelum jatuh tempo.
  // Selisih dihitung dalam hari kalender lokal agar jam dan DST tidak
  // memengaruhi batas hari (bayar pada hari jatuh tempo = 0 hari).
  const hariMenujuJT = differenceInCalendarDays(berjalanPeriod.start, tanggalBayar)

  // Diskon dihitung dalam persen bulat lalu dibagi 100 agar akumulasi
  // (mis. 10% + 5%) tidak menghasilkan galat float seperti 0,15000000000000002.
  let diskonBayarAwalPersen = 0
  if (!isMutasiMasuk && !adaTunggakan && hariMenujuJT >= 0) {
    if (isMotor) {
      if (hariMenujuJT <= 30) diskonBayarAwalPersen = 10
      else if (hariMenujuJT <= 60) diskonBayarAwalPersen = 15
      else if (hariMenujuJT <= 90) diskonBayarAwalPersen = 20
    } else {
      if (hariMenujuJT <= 90) diskonBayarAwalPersen = 10
    }
  }

  // Payment online (Pergub 64 Pasal 6): berlaku juga saat terlambat atau
  // menunggak, dan diakumulasikan dengan diskon bayar awal (Pasal 10).
  // Mutasi Masuk tidak dapat dibayar via payment online.
  const tarifOnline = pergub.diskonOnlinePersen
  const diskonOnlinePersen =
    tarifOnline && input.isBayarOnline === true && !isMutasiMasuk
      ? isMotor ? tarifOnline.motor : tarifOnline.mobil
      : 0

  // Mutasi Masuk Luar Daerah: diskon PKB berjalan 50% sesuai Pergub.
  // Diskon ini menggantikan diskon pembayaran awal 10%/15%/20%.
  const pkbDiscount =
    (isMutasiMasuk ? 50 : diskonBayarAwalPersen + diskonOnlinePersen) / 100

  const pkbBerjalan = basePkbBerjalan * (1 - pkbDiscount)

  // -----------------------------------------------------------------------
  // Opsen PKB Berjalan
  // -----------------------------------------------------------------------
  const opsenBerjalan = boolOpsenBerjalan ? pkbBerjalan * 0.66 : 0

  // -----------------------------------------------------------------------
  // Denda PKB & Opsen PKB
  // Seluruh denda, baik periode berjalan maupun tunggakan, dihapus
  // melalui Tax Amnesty. Jumlah bulan tetap dihitung untuk denda SWDKLLJ.
  // -----------------------------------------------------------------------
  const bulanTerlambat = Math.min(
    24,
    bulanKalender(berjalanPeriod.start, tanggalBayar)
  )
  const dendaOpsen = 0

  // -----------------------------------------------------------------------
  // SWDKLLJ
  // Pokok dan denda mengikuti golongan Jasa Raharja (src/lib/swdkllj.ts):
  // jenis kendaraan, dan untuk sepeda motor serta mobil barang juga CC.
  // -----------------------------------------------------------------------
  const golongan = golonganSwdkllj(jenisKendaraan, input.isiSilinder)
  const swdklljBase = TARIF_SWDKLLJ[golongan].pokok
  const swdklljBerjalan = swdklljBase
  const swdklljTunggakan = tahunTunggakan * swdklljBase

  // Denda SWDKLLJ tetap dipungut (bukan bagian Tax Amnesty).
  // Referensi: semua contoh 1–14 dalam pedoman tetap mencantumkan denda ini.
  // Keterlambatan diukur dari jatuh tempo pada tahun bayar, sehingga denda
  // yang dihitung adalah denda masa berjalan. Pergub 64: denda SWDKLLJ masa
  // tunggakan dihapus, denda masa berjalan tetap dipungut.
  const dendaSwdkllj = dendaSwdklljFor(golongan, bulanTerlambat)

  // -----------------------------------------------------------------------
  // PNBP STNK & TNKB
  // Dikenakan bila STNK jatuh tempo ≤ 90 hari dari tanggal bayar
  // (artinya STNK sudah kadaluarsa atau hampir kadaluarsa).
  // Selisih dalam hari kalender lokal; jam/DST tidak memengaruhi batas 90 hari.
  // -----------------------------------------------------------------------
  const hariMenujuStnk = differenceInCalendarDays(jatuhTempoStnk, tanggalBayar)
  let biayaStnk = 0
  let biayaTnkb = 0
  if (hariMenujuStnk <= 90) {
    biayaStnk = isMotor ? 100_000 : 200_000
    biayaTnkb = isMotor ? 60_000 : 100_000
  }

  // -----------------------------------------------------------------------
  // Biaya Tembak RU / STNK (opsional)
  // -----------------------------------------------------------------------
  const biayaTembakRu = isTembakRu ? (isMotor ? 150_000 : 250_000) : 0

  // -----------------------------------------------------------------------
  // Biaya BBN & Mutasi (bagian 5) — nominal manual, ditambahkan apa adanya.
  // Nilai kosong, negatif, atau tidak valid dianggap 0 (pengaman runtime;
  // validasi pesan error dilakukan di form).
  // -----------------------------------------------------------------------
  const biayaLayanan = Object.fromEntries(
    BIAYA_LAYANAN_KEYS.map((key) => {
      const value = input.biayaLayanan?.[key]
      return [key, typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= BIAYA_LAYANAN_MAX ? value : 0]
    }),
  ) as Record<BiayaLayananKey, number>
  const totalBiayaLayanan = BIAYA_LAYANAN_KEYS.reduce((sum, key) => sum + biayaLayanan[key], 0)

  // -----------------------------------------------------------------------
  // Grand Total
  // -----------------------------------------------------------------------
  const total =
    pkbBerjalan +
    pkbTunggakan +
    0 +              // denda PKB → tax amnesty = Rp0
    opsenBerjalan +
    opsenTunggakan +
    swdklljBerjalan +
    swdklljTunggakan +
    dendaSwdkllj +
    biayaStnk +
    biayaTnkb +
    biayaTembakRu +
    totalBiayaLayanan

  return {
    pergub: pergub.id,
    pkbBerjalan,
    pkbDiscount,
    diskonPaymentOnline: diskonOnlinePersen / 100,
    isBayarOnline: diskonOnlinePersen > 0,
    isMutasiMasuk,
    isDomisiliGempa: isGempaBerlaku,
    diskonTunggakan,
    pkbTunggakanPra2025,
    pkbTunggakanPost2025,
    warnaPlat,
    tarifPkbBerjalan: berjalanPeriod.tarifPkb,
    // Informasi tampilan: selisih ke tanggal Jatuh Tempo Pajak yang diisi user
    // (bukan awal periode berjalan di tahun bayar), dalam hari kalender lokal.
    // Tidak memengaruhi nominal.
    hariMenujuJatuhTempo: differenceInCalendarDays(jatuhTempoPajak, tanggalBayar),
    tahunTunggakanPra,
    tahunTunggakanPost,
    tahunTunggakan,
    dendaPkb: 0,
    opsenBerjalan,
    opsenTunggakan,
    dendaOpsen,
    bulanTerlambat,
    swdklljBerjalan,
    golonganSwdkllj: golongan,
    swdklljTunggakan,
    dendaSwdkllj,
    dendaSwdklljTunggakanDihapus: pergub.hapusDendaSwdklljTunggakan && tahunTunggakan > 0,
    biayaStnk,
    biayaTnkb,
    biayaTembakRu,
    biayaLayanan,
    totalBiayaLayanan,
    total,
  }
}
