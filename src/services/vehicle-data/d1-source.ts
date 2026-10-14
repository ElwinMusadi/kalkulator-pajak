import { normalizeWarnaPlat } from "../../types/tax"
import type {
  D1DatabaseLike,
  VehicleDataSource,
  VehicleLookupResult,
  VehicleRow,
} from "./types"
import { normalizeNopol } from "./utils"

const SELECT_WITH_WARNA_PLAT = `SELECT nopol, nama, jenis, jatuh_tempo_stnk, jatuh_tempo_pajak, njkb, njub, bobot, warna_plat
           FROM vehicle_njkb
           WHERE nopol = ?
           LIMIT 1`

/** Query sebelum migration 0002 (tanpa kolom warna_plat). */
const SELECT_LEGACY = `SELECT nopol, nama, jenis, jatuh_tempo_stnk, jatuh_tempo_pajak, njkb, njub, bobot
           FROM vehicle_njkb
           WHERE nopol = ?
           LIMIT 1`

/**
 * True bila error D1 disebabkan kolom warna_plat belum ada (migration 0002 belum
 * diterapkan). Hanya Error asli yang diperiksa; nilai lain diteruskan apa adanya.
 */
function isMissingWarnaPlatColumn(err: unknown): boolean {
  return (
    err instanceof Error &&
    typeof err.message === "string" &&
    err.message.includes("no such column: warna_plat")
  )
}

/**
 * Sumber data kendaraan berbasis Cloudflare D1.
 * Mengambil data dari tabel `vehicle_njkb` via prepared statement.
 */
export class D1VehicleDataSource implements VehicleDataSource {
  readonly name = "d1" as const
  private db: D1DatabaseLike

  constructor(db: D1DatabaseLike) {
    this.db = db
  }

  private queryRow(sql: string, nopol: string): Promise<VehicleRow | null> {
    return this.db.prepare(sql).bind(nopol).first<VehicleRow>()
  }

  /**
   * Query dengan kolom warna_plat; bila database belum dimigrasi (jeda antara
   * deploy dan `migrations apply`), ulangi dengan query lama → warnaPlat null.
   */
  private async findRow(nopol: string): Promise<VehicleRow | null> {
    try {
      return await this.queryRow(SELECT_WITH_WARNA_PLAT, nopol)
    } catch (err) {
      if (!isMissingWarnaPlatColumn(err)) throw err
      return this.queryRow(SELECT_LEGACY, nopol)
    }
  }

  async lookup(rawNopol: string): Promise<VehicleLookupResult> {
    const nopol = normalizeNopol(rawNopol)

    if (!nopol || nopol.length < 4 || nopol.length > 12) {
      return {
        status: "error",
        error: "Nopol tidak valid.",
        message: "Nopol tidak valid.",
      }
    }

    try {
      const result = await this.findRow(nopol)

      if (!result) {
        return {
          status: "not_found",
          message: "Data NJKB untuk Nopol tersebut tidak ditemukan.",
        }
      }

      return {
        status: "found",
        source: "d1",
        data: {
          nopol: result.nopol,
          nama: result.nama,
          jenis: result.jenis,
          jatuhTempoStnk: result.jatuh_tempo_stnk,
          jatuhTempoPajak: result.jatuh_tempo_pajak,
          njkb: result.njkb,
          njub: result.njub,
          bobot: result.bobot,
          // NULL/kolom belum ada/nilai tak dikenal → null (frontend default putih).
          warnaPlat: normalizeWarnaPlat(result.warna_plat),
          source: "d1",
        },
      }
    } catch (err) {
      return {
        status: "error",
        error: err instanceof Error ? err : String(err),
        message: "Terjadi kesalahan server saat membaca database D1.",
      }
    }
  }
}
