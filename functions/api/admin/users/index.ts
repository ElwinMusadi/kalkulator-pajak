/**
 * GET  /api/admin/users — AdminUsersResponse
 * POST /api/admin/users — CreateUserRequest → 201 AdminUserResponse
 */

import type { AdminUserResponse, AdminUsersResponse } from "../../../../src/types/auth.ts"
import { requireAdmin } from "../../../../server/auth/admin-route.ts"
import { createUser, listUserSummaries } from "../../../../server/auth/admin-users.ts"
import { parseCreateUserInput } from "../../../../server/auth/validation.ts"
import {
  errorResponse,
  jsonResponse,
  logEvent,
  readJsonObject,
  validationError,
} from "../../../../server/http.ts"
import type { AppFunction } from "../../../../server/types.ts"

export const onRequestGet: AppFunction = async (ctx) => {
  const admin = requireAdmin(ctx.data.auth)
  if (admin instanceof Response) return admin
  const payload: AdminUsersResponse = { users: await listUserSummaries(ctx.env.DB) }
  return jsonResponse(payload)
}

export const onRequestPost: AppFunction = async (ctx) => {
  const admin = requireAdmin(ctx.data.auth)
  if (admin instanceof Response) return admin

  const body = await readJsonObject(ctx.request)
  if (!body.ok) return body.response
  const input = parseCreateUserInput(body.value)
  if (!input.ok) return validationError(input.message)

  const result = await createUser(ctx.env.DB, admin, input.value)
  if (result.kind === "username_taken") {
    return errorResponse(409, "USERNAME_TAKEN", "Username sudah digunakan.")
  }
  logEvent("info", "admin_user_created", { actorUserId: admin.user.id, targetUserId: result.user.id })
  const payload: AdminUserResponse = { user: result.user }
  return jsonResponse(payload, 201)
}
