/**
 * POST /api/auth/logout
 * - Admin: hapus sesi saat ini saja → 204 + hapus cookie.
 * - Petugas: 403 FORBIDDEN (sesi hanya dapat dihapus Admin).
 */

import { buildClearSessionCookie } from "../../../server/auth/cookies.ts"
import { logoutSession } from "../../../server/auth/session.ts"
import { forbidden, logEvent, noContent, unauthenticated } from "../../../server/http.ts"
import type { AppFunction } from "../../../server/types.ts"

export const onRequestPost: AppFunction = async (ctx) => {
  const auth = ctx.data.auth
  if (!auth) return unauthenticated({ "Set-Cookie": buildClearSessionCookie() })

  if (auth.user.role !== "admin" || auth.session.isPetugas) {
    return forbidden("Petugas tidak dapat logout. Hubungi Admin untuk menghapus sesi.")
  }

  await logoutSession(ctx.env.DB, auth)
  logEvent("info", "auth_logout", { userId: auth.user.id, sessionId: auth.session.id })
  return noContent({ "Set-Cookie": buildClearSessionCookie() })
}
