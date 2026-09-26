import type {
  VehicleDataResolverOptions,
  VehicleDataSource,
  VehicleDataSourceMode,
  VehicleLookupResult,
} from "./types"
import { normalizeNopol } from "./utils"

/**
 * Resolver untuk mengorkestrasi pencarian data kendaraan berdasarkan mode sumber data.
 * Mendukung mode:
 * - "d1": hanya mencari ke Cloudflare D1.
 * - "api": hanya mencari ke NJKB API NTT.
 * - "d1_then_api": mencari ke D1 terlebih dahulu, jika tidak ditemukan fallback ke API. (Default)
 */
export class VehicleDataResolver {
  private d1Source?: VehicleDataSource
  private apiSource?: VehicleDataSource
  private mode: VehicleDataSourceMode

  constructor(options: VehicleDataResolverOptions = {}) {
    this.d1Source = options.d1Source
    this.apiSource = options.apiSource
    // Default mode: d1_then_api
    this.mode = options.mode ?? "d1_then_api"
  }

  getMode(): VehicleDataSourceMode {
    return this.mode
  }

  setMode(mode: VehicleDataSourceMode): void {
    this.mode = mode
  }

  async resolve(
    rawNopol: string,
    overrideMode?: VehicleDataSourceMode
  ): Promise<VehicleLookupResult> {
    const nopol = normalizeNopol(rawNopol)

    if (!nopol || nopol.length < 4 || nopol.length > 12) {
      return {
        status: "error",
        error: "Nopol tidak valid.",
        message: "Nopol tidak valid.",
      }
    }

    const activeMode = overrideMode ?? this.mode

    switch (activeMode) {
      case "d1":
        return this.resolveD1Only(nopol)
      case "api":
        return this.resolveApiOnly(nopol)
      case "d1_then_api":
      default:
        return this.resolveD1ThenApi(nopol)
    }
  }

  private async resolveD1Only(nopol: string): Promise<VehicleLookupResult> {
    if (!this.d1Source) {
      return {
        status: "error",
        error: "Sumber data D1 belum dikonfigurasi.",
        message: "Sumber data D1 belum dikonfigurasi.",
      }
    }
    return this.d1Source.lookup(nopol)
  }

  private async resolveApiOnly(nopol: string): Promise<VehicleLookupResult> {
    if (!this.apiSource) {
      return {
        status: "error",
        error: "Sumber data API belum dikonfigurasi.",
        message: "Sumber data API belum dikonfigurasi.",
      }
    }
    return this.apiSource.lookup(nopol)
  }

  private async resolveD1ThenApi(nopol: string): Promise<VehicleLookupResult> {
    // 1. Coba D1 terlebih dahulu jika sumber data D1 tersedia
    if (this.d1Source) {
      const d1Result = await this.d1Source.lookup(nopol)

      // Jika ditemukan di D1: kembalikan hasil langsung, JANGAN panggil API
      if (d1Result.status === "found") {
        return d1Result
      }

      // Jika D1 menghasilkan error validasi input nopol, return langsung tanpa fallback
      if (d1Result.status === "error" && d1Result.message === "Nopol tidak valid.") {
        return d1Result
      }
    }

    // 2. Fallback ke API jika D1 not_found atau mengalami error teknis
    if (this.apiSource) {
      return this.apiSource.lookup(nopol)
    }

    return {
      status: "not_found",
      message: "Data NJKB untuk Nopol tersebut tidak ditemukan.",
    }
  }
}
