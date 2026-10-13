/**
 * DELETE /api/admin/users/:id/sessions — hapus SEMUA sesi user → 204.
 * Bila Admin menghapus sesinya sendiri yang sedang dipakai, cookie dihapus.
 */

import {
  USER_NOT_FOUND_MESSAGE,
  idParam,
  mutationErrorResponse,
  requireAdmin,
} from "../../../../../../server/auth/admin-route.ts"
import { deleteAllSessions } from "../../../../../../server/auth/admin-users.ts"
import { buildClearSessionCookie } from "../../../../../../server/auth/cookies.ts"
import { logEvent, noContent, notFound } from "../../../../../../server/http.ts"
import type { AppFunction } from "../../../../../../server/types.ts"

export const onRequestDelete: AppFunction<"id"> = async (ctx) => {
  const admin = requireAdmin(ctx.data.auth)
  if (admin instanceof Response) return admin
  const id = idParam(ctx.params.id)
  if (!id) return notFound(USER_NOT_FOUND_MESSAGE)

  const result = await deleteAllSessions(ctx.env.DB, admin, id)
  if (result.kind !== "ok") return mutationErrorResponse(result)
  logEvent("info", "admin_sessions_deleted", { actorUserId: admin.user.id, targetUserId: id })
  return result.value.deletedCurrent
    ? noContent({ "Set-Cookie": buildClearSessionCookie() })
    : noContent()
}
