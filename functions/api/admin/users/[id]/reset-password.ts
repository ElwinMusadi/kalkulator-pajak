/**
 * POST /api/admin/users/:id/reset-password — ResetPasswordRequest → 204.
 * Admin dapat mereset password user mana pun termasuk dirinya. Sesi tidak dihapus.
 */

import {
  USER_NOT_FOUND_MESSAGE,
  idParam,
  mutationErrorResponse,
  requireAdmin,
} from "../../../../../server/auth/admin-route.ts"
import { resetPassword } from "../../../../../server/auth/admin-users.ts"
import { validatePassword } from "../../../../../server/auth/validation.ts"
import {
  logEvent,
  noContent,
  notFound,
  readJsonObject,
  validationError,
} from "../../../../../server/http.ts"
import type { AppFunction } from "../../../../../server/types.ts"

export const onRequestPost: AppFunction<"id"> = async (ctx) => {
  const admin = requireAdmin(ctx.data.auth)
  if (admin instanceof Response) return admin
  const id = idParam(ctx.params.id)
  if (!id) return notFound(USER_NOT_FOUND_MESSAGE)

  const body = await readJsonObject(ctx.request)
  if (!body.ok) return body.response
  const password = validatePassword(body.value.password)
  if (!password.ok) return validationError(password.message)

  const result = await resetPassword(ctx.env.DB, admin, id, password.value)
  if (result.kind !== "ok") return mutationErrorResponse(result)
  logEvent("info", "admin_password_reset", { actorUserId: admin.user.id, targetUserId: id })
  return noContent()
}
