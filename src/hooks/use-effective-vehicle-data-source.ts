import { useMemo } from "react"
import { useAuth } from "@/auth/auth-context"
import {
  getAllowedSourceModes,
  resolveEffectiveSourceMode,
} from "@/lib/permissions"
import { useVehicleDataSourceSetting } from "./use-vehicle-data-source-setting"

/**
 * Menggabungkan preferensi sumber data tersimpan dengan izin user.
 * Preferensi tersimpan tidak ditimpa: bila Admin kelak memberi izin, pilihan
 * semula otomatis berlaku kembali.
 */
export function useEffectiveVehicleDataSource() {
  const { mode: storedMode, setMode } = useVehicleDataSourceSetting()
  const { hasPermission } = useAuth()

  const allowedModes = useMemo(
    () => getAllowedSourceModes(hasPermission),
    [hasPermission],
  )
  const effectiveMode = resolveEffectiveSourceMode(storedMode, allowedModes)

  return {
    storedMode,
    effectiveMode,
    allowedModes,
    setMode,
    lookupEnabled: effectiveMode !== null,
  }
}
