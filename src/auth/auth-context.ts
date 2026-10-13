import { createContext, useContext } from "react"
import type { AuthUser, ModuleKey } from "@/types/auth"

/**
 * - `loading`: memeriksa sesi melalui /api/auth/me.
 * - `authenticated`: sesi valid, `user` tersedia.
 * - `unauthenticated`: tidak ada sesi; tampilkan halaman login.
 * - `error`: server/jaringan gagal saat bootstrap; tampilkan opsi coba lagi.
 */
export type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "error"

export interface AuthContextValue {
  status: AuthStatus
  user: AuthUser | null
  /** Pesan yang ditampilkan pada halaman login setelah sesi berakhir. */
  sessionNotice: string | null
  /** Pesan kegagalan bootstrap saat status `error`. */
  bootError: string | null
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  /** Sinkronkan ulang user dan izin dari server. */
  refresh: () => Promise<void>
  /** Dipanggil saat server menyatakan sesi sudah tidak berlaku (401). */
  handleSessionExpired: () => void
  clearSessionNotice: () => void
  hasPermission: (key: ModuleKey) => boolean
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error("useAuth harus digunakan di dalam AuthProvider.")
  return value
}

/** Untuk komponen yang hanya dirender setelah login. */
export function useAuthenticatedUser(): AuthUser {
  const { user } = useAuth()
  if (!user) throw new Error("User belum login.")
  return user
}
