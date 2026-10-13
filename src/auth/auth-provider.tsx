import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"
import * as authApi from "@/lib/auth-api"
import { AUTH_UNAUTHENTICATED_EVENT, isAbortError, isApiError } from "@/lib/http"
import type { AuthUser, ModuleKey } from "@/types/auth"
import { AuthContext, type AuthContextValue, type AuthStatus } from "./auth-context"

const SESSION_ENDED_MESSAGE =
  "Sesi Anda telah dihapus atau berakhir. Silakan login kembali."
const SESSION_ENDED_PETUGAS_HINT =
  " Hubungi Admin bila tidak dapat login."
const BOOT_ERROR_MESSAGE =
  "Tidak dapat memeriksa sesi login. Periksa koneksi lalu coba lagi."

/** Interval pemeriksaan sesi saat tab terlihat. */
const SESSION_CHECK_INTERVAL_MS = 60_000
/** Jarak minimum antarpemeriksaan sesi dari pemicu apa pun. */
const SESSION_CHECK_THROTTLE_MS = 15_000

function sameUser(a: AuthUser | null, b: AuthUser): boolean {
  return (
    a !== null &&
    a.id === b.id &&
    a.username === b.username &&
    a.name === b.name &&
    a.role === b.role &&
    a.permissions.length === b.permissions.length &&
    a.permissions.every((key, index) => key === b.permissions[index])
  )
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading")
  const [user, setUserState] = useState<AuthUser | null>(null)
  const [sessionNotice, setSessionNotice] = useState<string | null>(null)
  const [bootError, setBootError] = useState<string | null>(null)

  // Salinan sinkron untuk listener global dan respons async yang tertunda.
  const userRef = useRef<AuthUser | null>(null)
  const setUser = useCallback((next: AuthUser | null) => {
    userRef.current = next
    setUserState(next)
  }, [])

  // Generasi sesi UI: dinaikkan saat login/logout/sesi berakhir. Hasil
  // pemeriksaan /me dari generasi lama diabaikan agar tidak menimpa login baru.
  const generationRef = useRef(0)

  const handleSessionExpired = useCallback(() => {
    const previous = userRef.current
    // Abaikan 401 yang datang setelah user sudah keluar (request tertunda).
    if (!previous) return
    generationRef.current += 1
    setUser(null)
    setStatus("unauthenticated")
    setSessionNotice(
      previous.role === "petugas"
        ? SESSION_ENDED_MESSAGE + SESSION_ENDED_PETUGAS_HINT
        : SESSION_ENDED_MESSAGE,
    )
  }, [setUser])

  // Status awal sudah `loading`; `refresh` menyetel loading sendiri bila perlu.
  const loadSession = useCallback(
    ({ signal, passive = false }: { signal?: AbortSignal; passive?: boolean } = {}): Promise<void> => {
      const silent = userRef.current !== null
      const generation = generationRef.current
      return authApi.getMe({ signal, passive }).then(
        ({ user: me }) => {
          if (generation !== generationRef.current) return
          // Respons sinkron latar yang tiba setelah logout tidak boleh
          // memulihkan sesi di UI.
          if (silent && !userRef.current) return
          // Hindari render ulang bila user & izin tidak berubah.
          if (!sameUser(userRef.current, me)) setUser(me)
          setBootError(null)
          setStatus("authenticated")
        },
        (error: unknown) => {
          if (isAbortError(error)) return
          if (generation !== generationRef.current) return
          if (isApiError(error) && error.status === 401) {
            if (userRef.current) handleSessionExpired()
            else setStatus("unauthenticated")
            return
          }
          // Gagal sinkron saat sudah login: pertahankan sesi yang ada.
          if (silent) return
          setBootError(BOOT_ERROR_MESSAGE)
          setStatus("error")
        },
      )
    },
    [handleSessionExpired, setUser],
  )

  useEffect(() => {
    const controller = new AbortController()
    void loadSession({ signal: controller.signal })
    return () => controller.abort()
  }, [loadSession])

  // Revalidasi sesi di tab yang terbuka agar penghapusan sesi, penonaktifan
  // akun, atau perubahan izin oleh Admin segera berlaku. Kegagalan jaringan
  // tidak mengeluarkan user (loadSession mode silent).
  const lastCheckRef = useRef(0)
  const inFlightRef = useRef(false)
  const isAuthenticated = status === "authenticated"

  useEffect(() => {
    if (!isAuthenticated) return
    lastCheckRef.current = Date.now()

    // passive=true: polling interval bukan aktivitas user, sehingga tidak
    // memperpanjang idle timeout Admin di server. Kembali ke tab (focus/
    // visibilitychange/online) dihitung sebagai aktivitas.
    const revalidate = (passive: boolean) => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return
      if (inFlightRef.current) return
      if (Date.now() - lastCheckRef.current < SESSION_CHECK_THROTTLE_MS) return
      lastCheckRef.current = Date.now()
      inFlightRef.current = true
      void loadSession({ passive }).finally(() => {
        inFlightRef.current = false
      })
    }
    const onActivity = () => revalidate(false)
    const onVisibility = () => {
      if (document.visibilityState === "visible") revalidate(false)
    }

    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("focus", onActivity)
    window.addEventListener("online", onActivity)
    const interval = window.setInterval(() => revalidate(true), SESSION_CHECK_INTERVAL_MS)

    return () => {
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("focus", onActivity)
      window.removeEventListener("online", onActivity)
      window.clearInterval(interval)
    }
  }, [isAuthenticated, loadSession])

  useEffect(() => {
    window.addEventListener(AUTH_UNAUTHENTICATED_EVENT, handleSessionExpired)
    return () =>
      window.removeEventListener(AUTH_UNAUTHENTICATED_EVENT, handleSessionExpired)
  }, [handleSessionExpired])

  const login = useCallback(
    async (username: string, password: string) => {
      // Batalkan efek pemeriksaan /me yang masih berjalan sebelum login.
      generationRef.current += 1
      const { user: me } = await authApi.login({ username, password })
      generationRef.current += 1
      setUser(me)
      setSessionNotice(null)
      setBootError(null)
      setStatus("authenticated")
    },
    [setUser],
  )

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } catch (error) {
      // Sesi yang sudah tidak ada di server tetap dianggap berhasil keluar.
      if (!(isApiError(error) && error.status === 401)) throw error
    }
    generationRef.current += 1
    setUser(null)
    setSessionNotice(null)
    setStatus("unauthenticated")
  }, [setUser])

  const refresh = useCallback(() => {
    // Saat sudah login, sinkronisasi berjalan di latar tanpa layar loading.
    if (!userRef.current) setStatus("loading")
    return loadSession()
  }, [loadSession])
  const clearSessionNotice = useCallback(() => setSessionNotice(null), [])

  const hasPermission = useCallback(
    (key: ModuleKey) =>
      user !== null && (user.role === "admin" || user.permissions.includes(key)),
    [user],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      sessionNotice,
      bootError,
      login,
      logout,
      refresh,
      handleSessionExpired,
      clearSessionNotice,
      hasPermission,
    }),
    [
      status,
      user,
      sessionNotice,
      bootError,
      login,
      logout,
      refresh,
      handleSessionExpired,
      clearSessionNotice,
      hasPermission,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
