/**
 * POST /api/auth/login — publik (tanpa sesi), tetap melalui CSRF middleware.
 * Respons 200: AuthMeResponse + Set-Cookie sesi.
 */

import type { AuthMeResponse } from "../../../src/types/auth.ts"
import {
  INVALID_CREDENTIALS_MESSAGE,
  SESSION_ACTIVE_ELSEWHERE_MESSAGE,
} from "../../../server/auth/constants.ts"
import { readSessionToken } from "../../../server/auth/cookies.ts"
import { deviceLabelFromUserAgent } from "../../../server/auth/device.ts"
import { login } from "../../../server/auth/session.ts"
import { parseLoginInput } from "../../../server/auth/validation.ts"
import { errorResponse, jsonResponse, logEvent, readJsonObject } from "../../../server/http.ts"
import type { AppFunction } from "../../../server/types.ts"

export const onRequestPost: AppFunction = async (ctx) => {
  const body = await readJsonObject(ctx.request)
  if (!body.ok) return body.response

  const input = parseLoginInput(body.value)
  if (!input) {
    return errorResponse(400, "VALIDATION_ERROR", "Username dan password wajib diisi.")
  }

  const result = await login(ctx.env.DB, input, {
    deviceLabel: deviceLabelFromUserAgent(ctx.request.headers.get("User-Agent")),
    previousToken: readSessionToken(ctx.request),
  })

  switch (result.kind) {
    case "invalid_credentials":
      return errorResponse(401, "INVALID_CREDENTIALS", INVALID_CREDENTIALS_MESSAGE)
    case "session_active_elsewhere":
      return errorResponse(409, "SESSION_ACTIVE_ELSEWHERE", SESSION_ACTIVE_ELSEWHERE_MESSAGE)
    case "ok": {
      logEvent("info", "auth_login_success", {
        userId: result.user.id,
        sessionId: result.sessionId,
      })
      const payload: AuthMeResponse = { user: result.user }
      return jsonResponse(payload, 200, { "Set-Cookie": result.setCookie })
    }
  }
}
