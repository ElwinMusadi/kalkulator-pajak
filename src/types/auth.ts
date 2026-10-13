/**
 * Kontrak autentikasi dan otorisasi bersama frontend dan Pages Functions.
 * File ini hanya berisi tipe dan konstanta tanpa dependensi runtime.
 */

export const USER_ROLES = ["admin", "petugas"] as const
export type UserRole = (typeof USER_ROLES)[number]

/**
 * Modul yang dapat diberikan Admin kepada Petugas.
 * Admin selalu memiliki seluruh modul serta manajemen user.
 */
export const MODULE_KEYS = [
  "calculator",
  "vehicle_lookup.d1",
  "vehicle_lookup.api",
  "vehicle_source.settings",
  "facility.tembak_ru",
] as const
export type ModuleKey = (typeof MODULE_KEYS)[number]

export const MODULE_LABELS: Record<ModuleKey, { label: string; description: string }> = {
  calculator: {
    label: "Kalkulator Pajak",
    description: "Membuka dan menggunakan kalkulator penetapan pajak.",
  },
  "vehicle_lookup.d1": {
    label: "Pencarian Nopol · Database D1",
    description: "Mencari data kendaraan dari Database D1.",
  },
  "vehicle_lookup.api": {
    label: "Pencarian Nopol · NJKB API",
    description: "Mencari data kendaraan melalui NJKB API NTT.",
  },
  "vehicle_source.settings": {
    label: "Pengaturan Sumber Data",
    description: "Memilih sumber data kendaraan di antara sumber yang diizinkan.",
  },
  "facility.tembak_ru": {
    label: "Biaya Tembak RU/STNK",
    description: "Menggunakan pilihan Biaya Tembak RU/STNK pada kalkulator.",
  },
}

export function isModuleKey(value: unknown): value is ModuleKey {
  return typeof value === "string" && (MODULE_KEYS as readonly string[]).includes(value)
}

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && (USER_ROLES as readonly string[]).includes(value)
}

/** User yang sedang login. Admin selalu menerima seluruh MODULE_KEYS. */
export interface AuthUser {
  id: string
  username: string
  name: string
  role: UserRole
  permissions: ModuleKey[]
}

export interface AuthMeResponse {
  user: AuthUser
}

export interface LoginRequest {
  username: string
  password: string
}

/** Informasi sesi perangkat yang aman ditampilkan; token tidak pernah dikirim. */
export interface SessionInfo {
  id: string
  deviceLabel: string
  createdAt: string
  lastSeenAt: string
}

export interface AdminUserSummary {
  id: string
  username: string
  name: string
  role: UserRole
  active: boolean
  /** Admin: seluruh modul. Petugas: modul yang diizinkan. */
  permissions: ModuleKey[]
  /** Petugas maksimal 1 sesi; Admin dapat memiliki beberapa sesi. */
  sessions: SessionInfo[]
  createdAt: string
  updatedAt: string
}

export interface AdminUsersResponse {
  users: AdminUserSummary[]
}

export interface AdminUserResponse {
  user: AdminUserSummary
}

export interface CreateUserRequest {
  username: string
  name: string
  password: string
  role: UserRole
  permissions: ModuleKey[]
}

export interface UpdateUserRequest {
  name?: string
  role?: UserRole
  active?: boolean
}

export interface ResetPasswordRequest {
  password: string
}

export interface UpdatePermissionsRequest {
  permissions: ModuleKey[]
}

/** Kode error stabil untuk seluruh endpoint auth dan admin. */
export type ApiErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "INVALID_CREDENTIALS"
  | "SESSION_ACTIVE_ELSEWHERE"
  | "VALIDATION_ERROR"
  | "USERNAME_TAKEN"
  | "NOT_FOUND"
  | "LAST_ADMIN"
  | "SELF_MODIFICATION"
  | "CSRF_REJECTED"
  | "SERVER_ERROR"

export interface ApiErrorBody {
  message: string
  code?: ApiErrorCode | string
}

/** Batas validasi bersama. */
export const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/
export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 128
export const NAME_MAX_LENGTH = 100
