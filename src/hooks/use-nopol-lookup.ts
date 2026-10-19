import { useCallback, useEffect, useRef, useState } from "react"
import { fetchVehicleByNopol } from "@/lib/api"
import {
  IDLE_NOPOL_LOOKUP_STATE,
  createNopolLookupRunner,
  type NopolLookupState,
} from "@/lib/nopol-lookup-runner"
import type { VehicleDataSourceMode } from "@/types/tax"

export interface UseNopolLookupResult extends NopolLookupState {
  /**
   * Mengulang lookup Nopol saat ini segera (tanpa jeda). No-op kecuali status
   * `error` yang dapat dipulihkan; tidak pernah untuk 403.
   */
  retry: () => void
}

/**
 * Lookup kendaraan via API saat Nopol berubah. Setiap perubahan nilai Nopol
 * memulai siklus baru (jeda 450 ms) sehingga plat yang dipulihkan ke nilai
 * sama tetap dicari ulang; request lama
 * dibatalkan dan hasil usang diabaikan oleh runner.
 * `sourceMode = null` menonaktifkan lookup (user tidak memiliki izin sumber data).
 */
export function useNopolLookup(
  nopol: string,
  sourceMode: VehicleDataSourceMode | null,
): UseNopolLookupResult {
  const [runner] = useState(() =>
    createNopolLookupRunner({
      lookup: (normalized, mode, signal) =>
        fetchVehicleByNopol(normalized, mode, signal),
    }),
  )
  const [state, setState] = useState<NopolLookupState>(IDLE_NOPOL_LOOKUP_STATE)
  const stateRef = useRef<NopolLookupState>(IDLE_NOPOL_LOOKUP_STATE)
  const [retryNonce, setRetryNonce] = useState(0)
  const nonceRef = useRef(0)
  const inputRef = useRef({ nopol, sourceMode })
  /** Siklus yang boleh berjalan tanpa jeda: tepat satu retry untuk input itu. */
  const immediateRef = useRef<{
    nonce: number
    nopol: string
    sourceMode: VehicleDataSourceMode | null
  } | null>(null)

  useEffect(() => {
    inputRef.current = { nopol, sourceMode }
    nonceRef.current = retryNonce
    const pending = immediateRef.current
    const immediate =
      pending !== null &&
      pending.nonce === retryNonce &&
      pending.nopol === nopol &&
      pending.sourceMode === sourceMode
    // Input lain menghapus penanda; replay StrictMode (deps sama) tetap segera.
    if (!immediate) immediateRef.current = null
    return runner.start(nopol, sourceMode, immediate, (next) => {
      stateRef.current = next
      setState(next)
    })
  }, [runner, nopol, sourceMode, retryNonce])

  const retry = useCallback(() => {
    const current = stateRef.current
    if (current.status !== "error" || !current.retryable) return
    // Klik ganda sebelum effect berjalan tidak memicu retry kedua.
    stateRef.current = { ...current, retryable: false }
    const nonce = nonceRef.current + 1
    nonceRef.current = nonce
    immediateRef.current = { nonce, ...inputRef.current }
    setRetryNonce(nonce)
  }, [])

  return { ...state, retry }
}
