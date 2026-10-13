/**
 * src/lib/api.ts — Client untuk Cloudflare Pages Function
 */

// Relatif (bukan alias "@/"): modul ini juga diimpor test Node via tsx.
import {
  DEFAULT_VEHICLE_DATA_SOURCE_MODE,
  type VehicleData,
  type VehicleDataSourceMode,
} from "../types/tax"
import { API_BASE_URL, notifyUnauthenticated, readApiError } from "./http"

export async function fetchVehicleByNopol(
  nopol: string,
  source: VehicleDataSourceMode = DEFAULT_VEHICLE_DATA_SOURCE_MODE,
  signal?: AbortSignal
): Promise<VehicleData | null> {
  const normalized = nopol.toUpperCase().replace(/\s+/g, "").replace(/[^A-Z0-9]/g, "")

  if (!normalized || normalized.length < 4) return null

  const query = new URLSearchParams({ source })
  const res = await fetch(
    `${API_BASE_URL}/api/njkb/${encodeURIComponent(normalized)}?${query.toString()}`,
    {
      signal,
      headers: { Accept: "application/json" },
      credentials: "same-origin",
      cache: "no-store",
    },
  )

  if (res.status === 404) return null
  if (!res.ok) {
    const error = await readApiError(res)
    // 401: sesi dihapus Admin atau berakhir — AuthProvider kembali ke login.
    if (res.status === 401) notifyUnauthenticated()
    // 403: tidak memiliki izin modul/sumber data; pesan server ditampilkan.
    throw error
  }

  return res.json() as Promise<VehicleData>
}
