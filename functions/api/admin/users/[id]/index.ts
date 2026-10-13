/**
 * PATCH  /api/admin/users/:id — UpdateUserRequest → AdminUserResponse
 * DELETE /api/admin/users/:id — 204
 *
 * Guard: SELF_MODIFICATION (409), LAST_ADMIN (409). Perubahan role atau
 * penonaktifan menghapus seluruh sesi user tersebut.
 */

import type { AdminUserResponse } from "../../../../../src/types/auth.ts"
import {
  USER_NOT_FOUND_MESSAGE,
  idParam,
  mutationErrorResponse,
  requireAdmin,
} from "../../../../../server/auth/admin-route.ts"
import { deleteUser, updateUser } from "../../../../../server/auth/admin-users.ts"
import { parseUpdateUserInput } from "../../../../../server/auth/validation.ts"
import {
  jsonResponse,
  logEvent,
  noContent,
  notFound,
  readJsonObject,
  validationError,
} from "../../../../../server/http.ts"
import type { AppFunction } from "../../../../../server/types.ts"

export const onRequestPatch: AppFunction<"id"> = async (ctx) => {
  const admin = requireAdmin(ctx.data.auth)
  if (admin instanceof Response) return admin
  const id = idParam(ctx.params.id)
  if (!id) return notFound(USER_NOT_FOUND_MESSAGE)

  const body = await readJsonObject(ctx.request)
  if (!body.ok) return body.response
  const input = parseUpdateUserInput(body.value)
  if (!input.ok) return validationError(input.message)

  const result = await updateUser(ctx.env.DB, admin, id, input.value)
  if (result.kind !== "ok") return mutationErrorResponse(result)
  logEvent("info", "admin_user_updated", { actorUserId: admin.user.id, targetUserId: id })
  const payload: AdminUserResponse = { user: result.value }
  return jsonResponse(payload)
}

export const onRequestDelete: AppFunction<"id"> = async (ctx) => {
  const admin = requireAdmin(ctx.data.auth)
  if (admin instanceof Response) return admin
  const id = idParam(ctx.params.id)
  if (!id) return notFound(USER_NOT_FOUND_MESSAGE)

  const result = await deleteUser(ctx.env.DB, admin, id)
  if (result.kind !== "ok") return mutationErrorResponse(result)
  logEvent("info", "admin_user_deleted", { actorUserId: admin.user.id, targetUserId: id })
  return noContent()
}
