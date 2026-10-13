import { useEffect, useRef, useState } from "react"
import { fetchVehicleByNopol } from "@/lib/api"
import { isAbortError, isApiError } from "@/lib/http"
import type {
  NopolLookupStatus,
  VehicleData,
  VehicleDataSourceMode,
} from "@/types/tax"
import { useDebounce } from "./use-debounce"

interface UseNopolLookupResult {
  vehicleData: VehicleData | null
  lookupSource: Extract<VehicleDataSourceMode, "d1" | "api"> | null
  status: NopolLookupStatus
  errorMessage: string | null
  /** True bila server menolak karena izin (HTTP 403). */
  forbidden: boolean
}

function normalizeNopol(value: string): string {
  return value.toUpperCase().replace(/\s+/g, "").replace(/[^A-Z0-9]/g, "")
}

/**
 * Melakukan lookup kendaraan via API saat nopol berubah (debounced).
 * Membatalkan request sebelumnya jika nopol berubah sebelum respons tiba.
 * `sourceMode = null` menonaktifkan lookup (user tidak memiliki izin sumber data).
 */
export function useNopolLookup(
  nopol: string,
  sourceMode: VehicleDataSourceMode | null,
): UseNopolLookupResult {
  const debouncedNopol = useDebounce(nopol, 450)
  const [vehicleData, setVehicleData] = useState<VehicleData | null>(null)
  const [lookupSource, setLookupSource] = useState<"d1" | "api" | null>(null)
  const [status, setStatus] = useState<NopolLookupStatus>("idle")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const enabled = sourceMode !== null

  // Hapus hasil lookup lama segera saat karakter Nopol berubah. Dengan begitu,
  // status `found`/`not_found` sebelumnya tidak bertahan selama masa debounce.
  useEffect(() => {
    abortRef.current?.abort()
    setVehicleData(null)
    setLookupSource(null)
    setErrorMessage(null)
    setForbidden(false)
    setStatus(enabled && normalizeNopol(nopol).length >= 4 ? "loading" : "idle")
  }, [nopol, enabled])

  useEffect(() => {
    const normalized = normalizeNopol(debouncedNopol)

    if (!sourceMode || normalized.length < 4) {
      setStatus("idle")
      setVehicleData(null)
      setLookupSource(null)
      setErrorMessage(null)
      setForbidden(false)
      return
    }

    // Batalkan request sebelumnya
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setStatus("loading")
    setErrorMessage(null)
    setForbidden(false)

    fetchVehicleByNopol(normalized, sourceMode, controller.signal)
      .then((data) => {
        if (data) {
          setVehicleData(data)
          setLookupSource(data.source ?? null)
          setStatus("found")
        } else {
          setVehicleData(null)
          setLookupSource(null)
          setStatus("not_found")
        }
      })
      .catch((err: unknown) => {
        if (isAbortError(err)) return
        setVehicleData(null)
        setLookupSource(null)
        setStatus("error")
        setForbidden(isApiError(err) && err.status === 403)
        const offline = typeof navigator !== "undefined" && !navigator.onLine
        setErrorMessage(
          offline
            ? "Koneksi internet terputus. Sambungkan kembali lalu ulangi pencarian."
            : err instanceof Error && err.message
              ? err.message
              : "Gagal mengambil data."
        )
      })

    return () => controller.abort()
  }, [debouncedNopol, sourceMode])

  return { vehicleData, lookupSource, status, errorMessage, forbidden }
}
