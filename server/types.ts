/**
 * Tipe server bersama untuk Pages Functions (bukan bagian kontrak frontend).
 */

import type { AuthUser } from "../src/types/auth.ts"

export interface Env {
  DB: D1Database
  NJKB_API_BASE_URL?: string
  NJKB_ACCESS_CLIENT_ID?: string
  NJKB_ACCESS_CLIENT_SECRET?: string
  NJKB_API_TIMEOUT_MS?: string
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
