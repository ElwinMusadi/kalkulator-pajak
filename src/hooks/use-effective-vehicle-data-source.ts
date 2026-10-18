import { useMemo } from "react"
import { useAuth } from "@/auth/auth-context"
import {
  getAllowedSourceModes,
  resolveEffectiveSourceMode,
} from "@/lib/permissions"

/**
 * Sumber data kendaraan efektif: selalu API bila user memiliki izin
 * `vehicle_lookup.api`, selain itu null (lookup nonaktif, isi manual).
 * Preferensi lama di localStorage tidak lagi dibaca.
 */
export function useEffectiveVehicleDataSource() {
  const { hasPermission } = useAuth()

  const allowedModes = useMemo(
    () => getAllowedSourceModes(hasPermission),
    [hasPermission],
  )
  const effectiveMode = resolveEffectiveSourceMode(null, allowedModes)

  return {
    effectiveMode,
    allowedModes,
    lookupEnabled: effectiveMode !== null,
  }
}
