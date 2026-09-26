import { useSyncExternalStore } from "react"
import type { VehicleDataSourceMode } from "@/types/tax"

export const VEHICLE_DATA_SOURCE_STORAGE_KEY =
  "kalkulator-pajak.vehicle-data-source"
export const DEFAULT_VEHICLE_DATA_SOURCE_MODE: VehicleDataSourceMode =
  "d1_then_api"

const SOURCE_CHANGED_EVENT = "vehicle-data-source-changed"
const VALID_MODES: readonly VehicleDataSourceMode[] = [
  "d1",
  "api",
  "d1_then_api",
]

export function isVehicleDataSourceMode(
  value: unknown,
): value is VehicleDataSourceMode {
  return (
    typeof value === "string" &&
    VALID_MODES.includes(value as VehicleDataSourceMode)
  )
}

export function readVehicleDataSourceMode(
  storage?: Pick<Storage, "getItem">,
): VehicleDataSourceMode {
  if (!storage) return DEFAULT_VEHICLE_DATA_SOURCE_MODE

  try {
    const stored = storage.getItem(VEHICLE_DATA_SOURCE_STORAGE_KEY)
    return isVehicleDataSourceMode(stored)
      ? stored
      : DEFAULT_VEHICLE_DATA_SOURCE_MODE
  } catch {
    return DEFAULT_VEHICLE_DATA_SOURCE_MODE
  }
}

export function writeVehicleDataSourceMode(
  mode: VehicleDataSourceMode,
  storage?: Pick<Storage, "setItem">,
): void {
  if (!storage) return
  storage.setItem(VEHICLE_DATA_SOURCE_STORAGE_KEY, mode)
}

function getBrowserSnapshot(): VehicleDataSourceMode {
  return readVehicleDataSourceMode(window.localStorage)
}

function getServerSnapshot(): VehicleDataSourceMode {
  return DEFAULT_VEHICLE_DATA_SOURCE_MODE
}

function subscribe(callback: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === VEHICLE_DATA_SOURCE_STORAGE_KEY) callback()
  }
  const onSourceChanged = () => callback()

  window.addEventListener("storage", onStorage)
  window.addEventListener(SOURCE_CHANGED_EVENT, onSourceChanged)

  return () => {
    window.removeEventListener("storage", onStorage)
    window.removeEventListener(SOURCE_CHANGED_EVENT, onSourceChanged)
  }
}

export function setVehicleDataSourceMode(mode: VehicleDataSourceMode): void {
  writeVehicleDataSourceMode(mode, window.localStorage)
  window.dispatchEvent(new Event(SOURCE_CHANGED_EVENT))
}

/**
 * Setting global sumber data kendaraan yang persisten di localStorage.
 * useSyncExternalStore membuat seluruh consumer dalam tab yang sama langsung sinkron.
 */
export function useVehicleDataSourceSetting() {
  const mode = useSyncExternalStore(
    subscribe,
    getBrowserSnapshot,
    getServerSnapshot,
  )

  return {
    mode,
    setMode: setVehicleDataSourceMode,
  }
}
