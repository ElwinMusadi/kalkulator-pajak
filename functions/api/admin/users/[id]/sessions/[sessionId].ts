/**
 * DELETE /api/admin/users/:id/sessions/:sessionId — hapus satu sesi → 204.
 */

import {
  idParam,
  mutationErrorResponse,
  requireAdmin,
} from "../../../../../../server/auth/admin-route.ts"
import { deleteOneSession } from "../../../../../../server/auth/admin-users.ts"
import { buildClearSessionCookie } from "../../../../../../server/auth/cookies.ts"
import { logEvent, noContent, notFound } from "../../../../../../server/http.ts"
import type { AppFunction } from "../../../../../../server/types.ts"

export const onRequestDelete: AppFunction<"id" | "sessionId"> = async (ctx) => {
  const admin = requireAdmin(ctx.data.auth)
  if (admin instanceof Response) return admin
  const id = idParam(ctx.params.id)
  const sessionId = idParam(ctx.params.sessionId)
  if (!id || !sessionId) return notFound("Sesi tidak ditemukan.")

  const result = await deleteOneSession(ctx.env.DB, admin, id, sessionId)
  if (result.kind === "not_found") return notFound("Sesi tidak ditemukan.")
  if (result.kind !== "ok") return mutationErrorResponse(result)
  logEvent("info", "admin_session_deleted", {
    actorUserId: admin.user.id,
    targetUserId: id,
    sessionId,
  })
  return result.value.deletedCurrent
    ? noContent({ "Set-Cookie": buildClearSessionCookie() })
    : noContent()
}
