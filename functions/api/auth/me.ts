/**
 * GET /api/auth/me — user yang sedang login (sesi divalidasi middleware).
 */

import type { AuthMeResponse } from "../../../src/types/auth.ts"
import { buildClearSessionCookie } from "../../../server/auth/cookies.ts"
import { jsonResponse, unauthenticated } from "../../../server/http.ts"
import type { AppFunction } from "../../../server/types.ts"

export const onRequestGet: AppFunction = async (ctx) => {
  const auth = ctx.data.auth
  if (!auth) return unauthenticated({ "Set-Cookie": buildClearSessionCookie() })
  const payload: AuthMeResponse = { user: auth.user }
  return jsonResponse(payload)
}
