import {
  MODULE_KEYS,
  NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USERNAME_PATTERN,
  isModuleKey,
  isUserRole,
  type ModuleKey,
  type UserRole,
} from "../../src/types/auth.ts"

export type Validated<T> = { ok: true; value: T } | { ok: false; message: string }

const ok = <T>(value: T): Validated<T> => ({ ok: true, value })
const fail = <T>(message: string): Validated<T> => ({ ok: false, message })

export function normalizeUsername(value: unknown): string | null {
  if (typeof value !== "string") return null
  return value.trim().toLowerCase()
}

export function validateUsername(value: unknown): Validated<string> {
  const username = normalizeUsername(value)
  if (username === null || !USERNAME_PATTERN.test(username)) {
    return fail(
      "Username harus 3–32 karakter: huruf kecil, angka, titik, garis bawah, atau tanda hubung.",
    )
  }
  return ok(username)
}

export function validateName(value: unknown): Validated<string> {
  if (typeof value !== "string") return fail("Nama wajib diisi.")
  const name = value.trim()
  if (name.length < 1 || name.length > NAME_MAX_LENGTH) {
    return fail(`Nama wajib diisi dan maksimal ${NAME_MAX_LENGTH} karakter.`)
  }
  // Tolak karakter kontrol agar aman ditampilkan/log.
  // oxlint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(name)) return fail("Nama memuat karakter tidak valid.")
  return ok(name)
}

export function validatePassword(value: unknown): Validated<string> {
  if (typeof value !== "string") return fail("Password wajib diisi.")
  if (value.length < PASSWORD_MIN_LENGTH || value.length > PASSWORD_MAX_LENGTH) {
    return fail(
      `Password harus ${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} karakter.`,
    )
  }
  return ok(value)
}

export function validateRole(value: unknown): Validated<UserRole> {
  if (!isUserRole(value)) return fail("Role tidak valid. Gunakan admin atau petugas.")
  return ok(value)
}

export function validatePermissions(value: unknown): Validated<ModuleKey[]> {
  if (!Array.isArray(value)) return fail("Permissions harus berupa array.")
  if (value.length > MODULE_KEYS.length) return fail("Permissions memuat modul duplikat.")
  const seen = new Set<ModuleKey>()
  for (const item of value) {
    if (!isModuleKey(item)) return fail("Permissions memuat modul tidak dikenal.")
    if (seen.has(item)) return fail("Permissions memuat modul duplikat.")
    seen.add(item)
  }
  // Urutan kanonis mengikuti MODULE_KEYS.
  return ok(MODULE_KEYS.filter((key) => seen.has(key)))
}

export interface LoginInput {
  username: string
  password: string
}

/**
 * Login: hanya bentuk dasar (string tidak kosong). Panjang berlebih tidak
 * ditolak di sini agar tetap dijawab INVALID_CREDENTIALS generik oleh service.
 */
export function parseLoginInput(body: Record<string, unknown>): LoginInput | null {
  const username = normalizeUsername(body.username)
  const password = body.password
  if (username === null || typeof password !== "string") return null
  if (username.length === 0 || password.length === 0) return null
  return { username, password }
}

export function isPlausibleLogin(input: LoginInput): boolean {
  return input.username.length <= 64 && input.password.length <= PASSWORD_MAX_LENGTH
}

export interface CreateUserInput {
  username: string
  name: string
  password: string
  role: UserRole
  permissions: ModuleKey[]
}

export function parseCreateUserInput(body: Record<string, unknown>): Validated<CreateUserInput> {
  const username = validateUsername(body.username)
  if (!username.ok) return username
  const name = validateName(body.name)
  if (!name.ok) return name
  const password = validatePassword(body.password)
  if (!password.ok) return password
  const role = validateRole(body.role)
  if (!role.ok) return role

  let permissions: ModuleKey[] = []
  if (role.value === "petugas") {
    const parsed = validatePermissions(body.permissions)
    if (!parsed.ok) return parsed
    permissions = parsed.value
  } else if (body.permissions !== undefined) {
    // Admin selalu memiliki seluruh modul; input divalidasi lalu diabaikan.
    const parsed = validatePermissions(body.permissions)
    if (!parsed.ok) return parsed
  }

  return ok({
    username: username.value,
    name: name.value,
    password: password.value,
    role: role.value,
    permissions,
  })
}

export interface UpdateUserInput {
  name?: string
  role?: UserRole
  active?: boolean
}

export function parseUpdateUserInput(body: Record<string, unknown>): Validated<UpdateUserInput> {
  const result: UpdateUserInput = {}
  if (body.name !== undefined) {
    const name = validateName(body.name)
    if (!name.ok) return name
    result.name = name.value
  }
  if (body.role !== undefined) {
    const role = validateRole(body.role)
    if (!role.ok) return role
    result.role = role.value
  }
  if (body.active !== undefined) {
    if (typeof body.active !== "boolean") return fail("Active harus boolean.")
    result.active = body.active
  }
  if (Object.keys(result).length === 0) {
    return fail("Tidak ada perubahan. Kirim name, role, atau active.")
  }
  return ok(result)
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export function isValidId(value: string): boolean {
  return UUID_PATTERN.test(value)
}
