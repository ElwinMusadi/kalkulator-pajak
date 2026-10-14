import { useSyncExternalStore } from "react"
import {
  getPwaInstallSnapshot,
  promptPwaInstall,
  subscribePwaInstall,
  type PwaInstallSnapshot,
} from "@/lib/pwa-install"

/** Status instalasi PWA yang sinkron di seluruh komponen. */
export function usePwaInstall(): PwaInstallSnapshot & {
  promptInstall: typeof promptPwaInstall
} {
  const snapshot = useSyncExternalStore(
    subscribePwaInstall,
    getPwaInstallSnapshot,
    getPwaInstallSnapshot,
  )
  return { ...snapshot, promptInstall: promptPwaInstall }
}
