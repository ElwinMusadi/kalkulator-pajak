import { useEffect, useRef, useState } from "react"
import { fetchVehicleByNopol } from "@/lib/api"
import type {
  NopolLookupStatus,
  VehicleData,
  VehicleDataSourceMode,
} from "@/types/tax"
import { useDebounce } from "./use-debounce"
import { useVehicleDataSourceSetting } from "./use-vehicle-data-source-setting"

interface UseNopolLookupResult {
  vehicleData: VehicleData | null
  lookupSource: Extract<VehicleDataSourceMode, "d1" | "api"> | null
  status: NopolLookupStatus
  errorMessage: string | null
}

/**
 * Melakukan lookup kendaraan via API saat nopol berubah (debounced).
 * Membatalkan request sebelumnya jika nopol berubah sebelum respons tiba.
 */
export function useNopolLookup(nopol: string): UseNopolLookupResult {
  const debouncedNopol = useDebounce(nopol, 450)
  const { mode: sourceMode } = useVehicleDataSourceSetting()
  const [vehicleData, setVehicleData] = useState<VehicleData | null>(null)
  const [lookupSource, setLookupSource] = useState<"d1" | "api" | null>(null)
  const [status, setStatus] = useState<NopolLookupStatus>("idle")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Hapus hasil lookup lama segera saat karakter Nopol berubah. Dengan begitu,
  // status `found`/`not_found` sebelumnya tidak bertahan selama masa debounce.
  useEffect(() => {
    const normalized = nopol.toUpperCase().replace(/\s+/g, "").replace(/[^A-Z0-9]/g, "")
    abortRef.current?.abort()
    setVehicleData(null)
    setLookupSource(null)
    setErrorMessage(null)
    setStatus(normalized.length >= 4 ? "loading" : "idle")
  }, [nopol])

  useEffect(() => {
    const normalized = debouncedNopol.toUpperCase().replace(/\s+/g, "").replace(/[^A-Z0-9]/g, "")

    if (!normalized || normalized.length < 4) {
      setStatus("idle")
      setVehicleData(null)
      setLookupSource(null)
      setErrorMessage(null)
      return
    }

    // Batalkan request sebelumnya
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setStatus("loading")
    setErrorMessage(null)

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
        if ((err as Error).name === "AbortError") return
        setVehicleData(null)
        setLookupSource(null)
        setStatus("error")
        const offline = typeof navigator !== "undefined" && !navigator.onLine
        setErrorMessage(
          offline
            ? "Sedang offline. Nopol ini belum tersimpan di perangkat; isi data manual."
            : ((err as Error).message ?? "Gagal mengambil data.")
        )
      })

    return () => controller.abort()
  }, [debouncedNopol, sourceMode])

  return { vehicleData, lookupSource, status, errorMessage }
}
