import { DEFAULT_VEHICLE_DATA_SOURCE_MODE } from "../../types/tax"
import type {
  VehicleDataResolverOptions,
  VehicleDataSource,
  VehicleDataSourceMode,
  VehicleLookupResult,
} from "./types"
import { normalizeNopol } from "./utils"

const INVALID_NOPOL_MESSAGE = "Nopol tidak valid."

function isInvalidNopol(result: VehicleLookupResult): boolean {
  return result.status === "error" && result.message === INVALID_NOPOL_MESSAGE
}

/**
 * Resolver untuk mengorkestrasi pencarian data kendaraan berdasarkan mode sumber data.
 * Mendukung mode:
 * - "d1": hanya mencari ke Cloudflare D1.
 * - "api": hanya mencari ke NJKB API NTT.
 * - "d1_then_api": D1 terlebih dahulu, fallback ke API bila tidak ditemukan/error.
 * - "api_then_d1": API terlebih dahulu, fallback ke D1 bila tidak ditemukan/error. (Default)
 */
export class VehicleDataResolver {
  private d1Source?: VehicleDataSource
  private apiSource?: VehicleDataSource
  private mode: VehicleDataSourceMode

  constructor(options: VehicleDataResolverOptions = {}) {
    this.d1Source = options.d1Source
    this.apiSource = options.apiSource
    this.mode = options.mode ?? DEFAULT_VEHICLE_DATA_SOURCE_MODE
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
        error: INVALID_NOPOL_MESSAGE,
        message: INVALID_NOPOL_MESSAGE,
      }
    }

    const activeMode = overrideMode ?? this.mode

    switch (activeMode) {
      case "d1":
        return this.resolveD1Only(nopol)
      case "api":
        return this.resolveApiOnly(nopol)
      case "d1_then_api":
        return this.resolveD1ThenApi(nopol)
      case "api_then_d1":
      default:
        return this.resolveApiThenD1(nopol)
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
      if (isInvalidNopol(d1Result)) {
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

  /**
   * NJKB API terlebih dahulu; D1 hanya dipakai bila API tidak menemukan data
   * atau gagal (timeout, jaringan, HTTP error, payload/status NJKB tidak valid).
   *
   * Bila kedua sumber tidak memberi data:
   * - API error → hasil error API dikembalikan agar user tahu sumber utama
   *   bermasalah (bukan "tidak ditemukan" yang menyesatkan).
   * - API not_found → hasil D1 (not_found, atau error D1).
   */
  private async resolveApiThenD1(nopol: string): Promise<VehicleLookupResult> {
    let apiResult: VehicleLookupResult | undefined

    if (this.apiSource) {
      apiResult = await this.apiSource.lookup(nopol)
      if (apiResult.status === "found" || isInvalidNopol(apiResult)) {
        return apiResult
      }
    }

    if (!this.d1Source) {
      return (
        apiResult ?? {
          status: "not_found",
          message: "Data NJKB untuk Nopol tersebut tidak ditemukan.",
        }
      )
    }

    const d1Result = await this.d1Source.lookup(nopol)
    if (d1Result.status === "found") return d1Result
    if (apiResult?.status === "error") return apiResult
    return d1Result
  }
}
