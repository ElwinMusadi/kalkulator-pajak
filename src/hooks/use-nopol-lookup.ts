import { useEffect, useRef, useState } from "react"
import { fetchVehicleByNopol } from "@/lib/api"
import type { NopolLookupStatus, VehicleData } from "@/types/tax"
import { useDebounce } from "./use-debounce"

interface UseNopolLookupResult {
  vehicleData: VehicleData | null
  status: NopolLookupStatus
  errorMessage: string | null
}

/**
 * Melakukan lookup kendaraan via API saat nopol berubah (debounced).
 * Membatalkan request sebelumnya jika nopol berubah sebelum respons tiba.
 */
export function useNopolLookup(nopol: string): UseNopolLookupResult {
  const debouncedNopol = useDebounce(nopol, 450)
  const [vehicleData, setVehicleData] = useState<VehicleData | null>(null)
  const [status, setStatus] = useState<NopolLookupStatus>("idle")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const normalized = debouncedNopol.toUpperCase().replace(/\s+/g, "").replace(/[^A-Z0-9]/g, "")

    if (!normalized || normalized.length < 4) {
      setStatus("idle")
      setVehicleData(null)
      setErrorMessage(null)
      return
    }

    // Batalkan request sebelumnya
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setStatus("loading")
    setErrorMessage(null)

    fetchVehicleByNopol(normalized, controller.signal)
      .then((data) => {
        if (data) {
          setVehicleData(data)
          setStatus("found")
        } else {
          setVehicleData(null)
          setStatus("not_found")
        }
      })
      .catch((err: unknown) => {
        if ((err as Error).name === "AbortError") return
        setVehicleData(null)
        setStatus("error")
        const offline = typeof navigator !== "undefined" && !navigator.onLine
        setErrorMessage(
          offline
            ? "Sedang offline. Nopol ini belum tersimpan di perangkat; isi data manual."
            : ((err as Error).message ?? "Gagal mengambil data.")
        )
      })

    return () => controller.abort()
  }, [debouncedNopol])

  return { vehicleData, status, errorMessage }
}
