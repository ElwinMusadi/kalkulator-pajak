/**
 * src/lib/api.ts — Client untuk Cloudflare Pages Function
 */

import type { VehicleData } from "@/types/tax"

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ""

export async function fetchVehicleByNopol(
  nopol: string,
  signal?: AbortSignal
): Promise<VehicleData | null> {
  const normalized = nopol.toUpperCase().replace(/\s+/g, "").replace(/[^A-Z0-9]/g, "")

  if (!normalized || normalized.length < 4) return null

  const res = await fetch(`${BASE_URL}/api/njkb/${encodeURIComponent(normalized)}`, {
    signal,
    headers: { Accept: "application/json" },
  })

  if (res.status === 404) return null
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Unknown error" }))
    throw new Error((err as { message?: string }).message ?? "API error")
  }

  return res.json() as Promise<VehicleData>
}
