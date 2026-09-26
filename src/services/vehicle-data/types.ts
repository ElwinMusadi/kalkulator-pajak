import type {
  VehicleData,
  VehicleDataSourceMode,
  VehicleLookupResult,
} from "../../types/tax"

export type { VehicleData, VehicleDataSourceMode, VehicleLookupResult }

/**
 * Interface abstrak untuk satu sumber data kendaraan (D1 atau API).
 */
export interface VehicleDataSource {
  readonly name: "d1" | "api"
  lookup(nopol: string): Promise<VehicleLookupResult>
}

/**
 * Interface minimal untuk client Cloudflare D1 agar mudah dimock dalam pengujian.
 */
export interface D1DatabaseLike {
  prepare(query: string): {
    bind(...values: unknown[]): {
      first<T = unknown>(): Promise<T | null>
    }
  }
}

/**
 * Baris tabel vehicle_njkb pada D1 database.
 */
export interface VehicleRow {
  nopol: string
  nama: string | null
  jenis: string | null
  jatuh_tempo_stnk: string | null
  jatuh_tempo_pajak: string | null
  njkb: number
  njub: number
  bobot: number
}

/**
 * Konfigurasi untuk ApiVehicleDataSource.
 */
export interface ApiVehicleDataSourceConfig {
  baseUrl?: string
  accessClientId?: string
  accessClientSecret?: string
  timeoutMs?: number
  /**
   * Custom fetcher untuk mocking tingkat tinggi dalam pengujian.
   */
  fetcher?: (nopol: string) => Promise<VehicleLookupResult>
  /**
   * Custom fetch function (misalnya untuk pengujian unit HTTP mock).
   */
  customFetch?: typeof fetch
  /**
   * Custom sleep function untuk mocking backoff delay dalam pengujian.
   */
  sleepFn?: (ms: number) => Promise<void>
}

/**
 * Opsi inisialisasi VehicleDataResolver.
 */
export interface VehicleDataResolverOptions {
  d1Source?: VehicleDataSource
  apiSource?: VehicleDataSource
  mode?: VehicleDataSourceMode
}
