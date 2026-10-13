/**
 * PUT /api/admin/users/:id/permissions — UpdatePermissionsRequest → AdminUserResponse.
 * Hanya untuk petugas; target admin → 400 VALIDATION_ERROR.
 */

import type { AdminUserResponse } from "../../../../../src/types/auth.ts"
import {
  USER_NOT_FOUND_MESSAGE,
  idParam,
  requireAdmin,
} from "../../../../../server/auth/admin-route.ts"
import { setPermissions } from "../../../../../server/auth/admin-users.ts"
import { validatePermissions } from "../../../../../server/auth/validation.ts"
import {
  jsonResponse,
  logEvent,
  notFound,
  readJsonObject,
  validationError,
} from "../../../../../server/http.ts"
import type { AppFunction } from "../../../../../server/types.ts"

export const onRequestPut: AppFunction<"id"> = async (ctx) => {
  const admin = requireAdmin(ctx.data.auth)
  if (admin instanceof Response) return admin
  const id = idParam(ctx.params.id)
  if (!id) return notFound(USER_NOT_FOUND_MESSAGE)

  const body = await readJsonObject(ctx.request)
  if (!body.ok) return body.response
  const permissions = validatePermissions(body.value.permissions)
  if (!permissions.ok) return validationError(permissions.message)

  const result = await setPermissions(ctx.env.DB, admin, id, permissions.value)
  switch (result.kind) {
    case "not_found":
      return notFound(USER_NOT_FOUND_MESSAGE)
    case "target_is_admin":
      return validationError("Admin selalu memiliki seluruh modul; permission tidak dapat diubah.")
    case "ok": {
      logEvent("info", "admin_permissions_updated", { actorUserId: admin.user.id, targetUserId: id })
      const payload: AdminUserResponse = { user: result.user }
      return jsonResponse(payload)
    }
  }
}
