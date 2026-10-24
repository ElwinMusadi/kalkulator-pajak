/**
 * Tipe server bersama untuk Pages Functions (bukan bagian kontrak frontend).
 */

import type { AuthUser } from "../src/types/auth.ts"

export interface Env {
  DB: D1Database
  /** API Data Kendaraan pusat (diutamakan). Alias NJKB_* lama tetap dibaca bila kosong. */
  VEHICLE_API_BASE_URL?: string
  VEHICLE_API_TIMEOUT_MS?: string
  /** @deprecated alias kompatibilitas; gunakan VEHICLE_*. */
  NJKB_API_BASE_URL?: string
  NJKB_API_TIMEOUT_MS?: string
  /**
   * Kunci API Data Potensi (`ptn_…`), dikirim sebagai `Authorization: Bearer`. Satu-satunya
   * kredensial sejak Access dilepas (2026-10-24). Secret Pages khusus server; jangan pernah memakai awalan VITE_.
   */
  POTENSI_API_KEY?: string
}

export interface AuthSession {
  id: string
  isPetugas: boolean
}

export interface AuthContext {
  user: AuthUser
  session: AuthSession
}

/** Data yang dititipkan middleware `/api` ke handler melalui `ctx.data`. */
export type AppData = {
  auth?: AuthContext
}

export type AppFunction<Params extends string = string> = PagesFunction<Env, Params, AppData>
