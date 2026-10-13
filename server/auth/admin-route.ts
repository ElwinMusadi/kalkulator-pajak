/**
 * Helper bersama route `/api/admin/*`.
 */

import type { MutationResult } from "./admin-users.ts"
import {
  errorResponse,
  forbidden,
  notFound,
  routeParam,
  unauthenticated,
} from "../http.ts"
import type { AuthContext } from "../types.ts"
import { buildClearSessionCookie } from "./cookies.ts"
import { isValidId } from "./validation.ts"

export const USER_NOT_FOUND_MESSAGE = "User tidak ditemukan."

/** Mengembalikan AuthContext admin, atau Response 401/403. */
export function requireAdmin(auth: AuthContext | undefined): AuthContext | Response {
  if (!auth) return unauthenticated({ "Set-Cookie": buildClearSessionCookie() })
  if (auth.user.role !== "admin" || auth.session.isPetugas) {
    return forbidden("Hanya Admin yang dapat mengakses fitur ini.")
  }
  return auth
}

/** Parameter UUID route; format tidak valid diperlakukan sebagai 404. */
export function idParam(value: string | string[] | undefined): string | null {
  const id = routeParam(value).toLowerCase()
  return isValidId(id) ? id : null
}

export function mutationErrorResponse(
  result: Exclude<MutationResult<unknown>, { kind: "ok" }>,
): Response {
  switch (result.kind) {
    case "not_found":
      return notFound(USER_NOT_FOUND_MESSAGE)
    case "self_modification":
      return errorResponse(
        409,
        "SELF_MODIFICATION",
        "Admin tidak dapat menghapus, menonaktifkan, atau menurunkan role akunnya sendiri.",
      )
    case "last_admin":
      return errorResponse(
        409,
        "LAST_ADMIN",
        "Tidak dapat menghapus, menonaktifkan, atau menurunkan role Admin aktif terakhir.",
      )
  }
}
