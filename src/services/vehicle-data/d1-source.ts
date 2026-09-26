import type {
  D1DatabaseLike,
  VehicleDataSource,
  VehicleLookupResult,
  VehicleRow,
} from "./types"
import { normalizeNopol } from "./utils"

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
      const result = await this.db
        .prepare(
          `SELECT nopol, nama, jenis, jatuh_tempo_stnk, jatuh_tempo_pajak, njkb, njub, bobot
           FROM vehicle_njkb
           WHERE nopol = ?
           LIMIT 1`
        )
        .bind(nopol)
        .first<VehicleRow>()

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
