/**
 * functions/api/_middleware.ts
 *
 * Berjalan sebelum setiap route di bawah /api (Pages menjalankan middleware
 * folder induk lebih dulu, lalu route melalui ctx.next()).
 *
 * Urutan: CSRF (method non-safe) → resolusi sesi (kecuali POST /api/auth/login)
 * → route → header keamanan pada SETIAP respons, termasuk error/exception.
 */

import { readSessionToken } from "../../server/auth/cookies.ts"
import { buildClearSessionCookie } from "../../server/auth/cookies.ts"
import { isCsrfAllowed } from "../../server/auth/csrf.ts"
import { resolveSession } from "../../server/auth/session.ts"
import {
  errorResponse,
  logEvent,
  notFound,
  serverError,
  unauthenticated,
  withApiSecurityHeaders,
} from "../../server/http.ts"
import type { AppFunction } from "../../server/types.ts"

const SESSION_CHECK_HEADER = "X-KP-Session-Check"

const PUBLIC_ROUTES = new Set(["POST /api/auth/login"])

function isPublicRoute(request: Request): boolean {
  const pathname = new URL(request.url).pathname.replace(/\/+$/, "")
  return PUBLIC_ROUTES.has(`${request.method.toUpperCase()} ${pathname}`)
}

function isHtmlResponse(response: Response): boolean {
  const type = response.headers.get("Content-Type") ?? ""
  return type.split(";", 1)[0].trim().toLowerCase() === "text/html"
}

const handle: AppFunction = async (ctx) => {
  const { request } = ctx

  if (!isCsrfAllowed(request)) {
    logEvent("warn", "csrf_rejected", { method: request.method })
    return errorResponse(403, "CSRF_REJECTED", "Permintaan ditolak (origin tidak valid).")
  }

  if (isPublicRoute(request)) {
    return ctx.next()
  }

  const token = readSessionToken(request)
  // Polling latar dari frontend menandai diri agar tidak memperpanjang idle admin.
  const passive = request.headers.get(SESSION_CHECK_HEADER) === "passive"
  const resolved = token ? await resolveSession(ctx.env.DB, token, { passive }) : null
  if (!resolved) {
    return unauthenticated({ "Set-Cookie": buildClearSessionCookie() })
  }

  ctx.data.auth = resolved.auth
  let response = await ctx.next()

  // Path /api tanpa Function jatuh ke aset statis/SPA fallback (index.html 200).
  if (isHtmlResponse(response)) {
    await response.body?.cancel().catch(() => undefined)
    response = notFound("Endpoint tidak ditemukan.")
  }

  if (resolved.setCookie && !response.headers.has("Set-Cookie")) {
    const copy = new Response(response.body, response)
    copy.headers.append("Set-Cookie", resolved.setCookie)
    return copy
  }
  return response
}

export const onRequest: AppFunction = async (ctx) => {
  let response: Response
  try {
    response = await handle(ctx)
  } catch (err) {
    logEvent("error", "api_unhandled_exception", { errorType: typeof err })
    response = serverError()
  }
  return withApiSecurityHeaders(response)
}
