/**
 * src/lib/auth-api.ts — Client endpoint autentikasi dan manajemen user.
 * Kontrak tipe berada di `@/types/auth`.
 */

import type {
  AdminUserResponse,
  AdminUsersResponse,
  AuthMeResponse,
  CreateUserRequest,
  LoginRequest,
  ResetPasswordRequest,
  UpdatePermissionsRequest,
  UpdateUserRequest,
} from "@/types/auth"
import { apiRequest } from "./http"

export function login(body: LoginRequest): Promise<AuthMeResponse> {
  return apiRequest<AuthMeResponse>("/api/auth/login", {
    method: "POST",
    body,
    notifyOnUnauthenticated: false,
  })
}

export interface GetMeOptions {
  signal?: AbortSignal
  /**
   * Pemeriksaan latar (polling) yang bukan aktivitas user: server tidak
   * memperpanjang idle timeout sesi Admin.
   */
  passive?: boolean
}

export function getMe({ signal, passive = false }: GetMeOptions = {}): Promise<AuthMeResponse> {
  return apiRequest<AuthMeResponse>("/api/auth/me", {
    signal,
    notifyOnUnauthenticated: false,
    headers: passive ? { "X-KP-Session-Check": "passive" } : undefined,
  })
}

export function logout(): Promise<void> {
  return apiRequest<void>("/api/auth/logout", {
    method: "POST",
    notifyOnUnauthenticated: false,
  })
}

const userPath = (id: string) => `/api/admin/users/${encodeURIComponent(id)}`

export const adminApi = {
  listUsers(signal?: AbortSignal): Promise<AdminUsersResponse> {
    return apiRequest<AdminUsersResponse>("/api/admin/users", { signal })
  },
  createUser(body: CreateUserRequest): Promise<AdminUserResponse> {
    return apiRequest<AdminUserResponse>("/api/admin/users", {
      method: "POST",
      body,
    })
  },
  updateUser(id: string, body: UpdateUserRequest): Promise<AdminUserResponse> {
    return apiRequest<AdminUserResponse>(userPath(id), {
      method: "PATCH",
      body,
    })
  },
  deleteUser(id: string): Promise<void> {
    return apiRequest<void>(userPath(id), { method: "DELETE" })
  },
  resetPassword(id: string, body: ResetPasswordRequest): Promise<void> {
    return apiRequest<void>(`${userPath(id)}/reset-password`, {
      method: "POST",
      body,
    })
  },
  updatePermissions(
    id: string,
    body: UpdatePermissionsRequest,
  ): Promise<AdminUserResponse> {
    return apiRequest<AdminUserResponse>(`${userPath(id)}/permissions`, {
      method: "PUT",
      body,
    })
  },
  removeSessions(id: string): Promise<void> {
    return apiRequest<void>(`${userPath(id)}/sessions`, { method: "DELETE" })
  },
}
