import { useEffect, useEffectEvent } from "react"
import type { ReactNode } from "react"
import { Loader2, RefreshCw, ServerCrash, WifiOff } from "lucide-react"
import { useAuth } from "@/auth/auth-context"
import { FullScreenState } from "@/components/auth/full-screen-state"
import { LoginPage } from "@/components/auth/login-page"
import { Button } from "@/components/ui/button"
import { useOnlineStatus } from "@/hooks/use-online-status"

/**
 * Gerbang aplikasi: memastikan perangkat online dan sesi valid sebelum
 * merender konten. Aplikasi sengaja tidak dapat digunakan saat offline.
 */
export function AppGate({ children }: { children: ReactNode }) {
  const isOnline = useOnlineStatus()
  const { status, bootError, refresh } = useAuth()

  // Bootstrap yang gagal karena offline dicoba ulang otomatis saat kembali
  // online. Hanya bereaksi pada transisi koneksi, bukan setiap perubahan status.
  const retryAfterReconnect = useEffectEvent(() => {
    if (status === "error") void refresh()
  })
  useEffect(() => {
    if (isOnline) retryAfterReconnect()
  }, [isOnline])

  if (!isOnline) {
    return (
      <FullScreenState
        role="alert"
        tone="warning"
        icon={<WifiOff />}
        title="Koneksi internet diperlukan"
        description={
          <p>
            Kalkulator Pajak Kendaraan hanya dapat digunakan saat perangkat
            terhubung ke internet. Halaman akan kembali otomatis setelah koneksi
            tersambung.
          </p>
        }
      />
    )
  }

  if (status === "loading") {
    return (
      <FullScreenState
        busy
        icon={<Loader2 className="animate-spin" />}
        title="Memeriksa sesi"
        description={<p>Menyiapkan Kalkulator Pajak Kendaraan…</p>}
      />
    )
  }

  if (status === "error") {
    return (
      <FullScreenState
        role="alert"
        tone="warning"
        icon={<ServerCrash />}
        title="Tidak dapat terhubung"
        description={<p>{bootError}</p>}
        action={
          <Button type="button" onClick={() => void refresh()}>
            <RefreshCw aria-hidden="true" />
            Coba lagi
          </Button>
        }
      />
    )
  }

  if (status === "unauthenticated") return <LoginPage />

  return <>{children}</>
}
