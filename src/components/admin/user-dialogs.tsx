import { useState } from "react"
import { AdminDialog } from "@/components/admin/admin-dialog"
import { ModulePermissionList } from "@/components/admin/module-permission-list"
import { PasswordInput } from "@/components/password-input"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { adminApi } from "@/lib/auth-api"
import { isApiError } from "@/lib/http"
import {
  MODULE_KEYS,
  NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USERNAME_PATTERN,
  type AdminUserSummary,
  type ModuleKey,
  type UserRole,
} from "@/types/auth"

export interface UserDialogProps {
  user: AdminUserSummary
  isSelf: boolean
  onClose: () => void
  /** Dipanggil setelah mutasi berhasil dengan pesan konfirmasi. */
  onDone: (message: string) => void
}

const ROLE_OPTIONS: { value: UserRole; label: string; hint: string }[] = [
  { value: "petugas", label: "Petugas", hint: "Akses sesuai modul yang diizinkan, satu perangkat." },
  { value: "admin", label: "Admin", hint: "Seluruh modul dan pengelolaan user." },
]

function errorMessage(error: unknown): string {
  if (isApiError(error)) return error.message
  return "Terjadi kesalahan tak terduga. Coba lagi."
}

/** Menjalankan mutasi dengan state submitting/error yang konsisten. */
function useMutation() {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(action: () => Promise<void>): Promise<boolean> {
    setSubmitting(true)
    setError(null)
    try {
      await action()
      return true
    } catch (err) {
      // 401 ditangani AuthProvider (kembali ke login); tidak perlu pesan di sini.
      if (!(isApiError(err) && err.status === 401)) setError(errorMessage(err))
      setSubmitting(false)
      return false
    }
  }

  return { submitting, error, setError, run }
}

function validateName(name: string): string | null {
  if (!name.trim()) return "Nama wajib diisi."
  if (name.trim().length > NAME_MAX_LENGTH)
    return `Nama maksimal ${NAME_MAX_LENGTH} karakter.`
  return null
}

function validatePassword(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH)
    return `Password minimal ${PASSWORD_MIN_LENGTH} karakter.`
  if (password.length > PASSWORD_MAX_LENGTH)
    return `Password maksimal ${PASSWORD_MAX_LENGTH} karakter.`
  return null
}

function RoleSelect({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string
  value: UserRole
  onChange: (role: UserRole) => void
  disabled?: boolean
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => onChange(v as UserRole)}
      disabled={disabled}
    >
      <SelectTrigger id={id}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ROLE_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/* ───────────────────────── Tambah user ───────────────────────── */

type CreateField = "username" | "name" | "password"

export function CreateUserDialog({
  onClose,
  onDone,
}: Pick<UserDialogProps, "onClose" | "onDone">) {
  const [username, setUsername] = useState("")
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState<UserRole>("petugas")
  const [permissions, setPermissions] = useState<ModuleKey[]>(["calculator"])
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<CreateField, string>>>({})
  const { submitting, error, run } = useMutation()

  function validate() {
    const errors: Partial<Record<CreateField, string>> = {}
    if (!USERNAME_PATTERN.test(username))
      errors.username =
        "Gunakan 3–32 karakter: huruf kecil, angka, titik, garis bawah, atau tanda hubung."
    const nameError = validateName(name)
    if (nameError) errors.name = nameError
    const passwordError = validatePassword(password)
    if (passwordError) errors.password = passwordError
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleSubmit() {
    if (!validate()) return
    const ok = await run(async () => {
      try {
        await adminApi.createUser({
          username,
          name: name.trim(),
          password,
          role,
          permissions: role === "admin" ? [...MODULE_KEYS] : permissions,
        })
      } catch (err) {
        if (isApiError(err) && err.code === "USERNAME_TAKEN") {
          setFieldErrors({ username: err.message })
        }
        throw err
      }
    })
    if (ok) onDone(`User ${username} berhasil ditambahkan.`)
  }

  return (
    <AdminDialog
      title="Tambah User"
      description="Buat akun untuk Admin atau Petugas. Sampaikan password awal secara langsung kepada pemilik akun."
      submitLabel="Tambah User"
      submittingLabel="Menambahkan…"
      submitting={submitting}
      error={error && !fieldErrors.username ? error : null}
      onSubmit={() => void handleSubmit()}
      onClose={onClose}
      className="max-w-xl"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field data-invalid={fieldErrors.username ? true : undefined}>
          <FieldLabel htmlFor="create-username">Username</FieldLabel>
          <Input
            id="create-username"
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s+/g, ""))}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={32}
            disabled={submitting}
            aria-invalid={fieldErrors.username ? true : undefined}
            aria-describedby="create-username-msg"
          />
          {fieldErrors.username ? (
            <FieldError id="create-username-msg">{fieldErrors.username}</FieldError>
          ) : (
            <FieldDescription id="create-username-msg">
              Huruf kecil, angka, titik, _ atau -.
            </FieldDescription>
          )}
        </Field>

        <Field data-invalid={fieldErrors.name ? true : undefined}>
          <FieldLabel htmlFor="create-name">Nama lengkap</FieldLabel>
          <Input
            id="create-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
            maxLength={NAME_MAX_LENGTH}
            disabled={submitting}
            aria-invalid={fieldErrors.name ? true : undefined}
            aria-describedby={fieldErrors.name ? "create-name-msg" : undefined}
          />
          {fieldErrors.name && (
            <FieldError id="create-name-msg">{fieldErrors.name}</FieldError>
          )}
        </Field>

        <Field data-invalid={fieldErrors.password ? true : undefined}>
          <FieldLabel htmlFor="create-password">Password awal</FieldLabel>
          <PasswordInput
            id="create-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            maxLength={PASSWORD_MAX_LENGTH}
            disabled={submitting}
            aria-invalid={fieldErrors.password ? true : undefined}
            aria-describedby="create-password-msg"
          />
          {fieldErrors.password ? (
            <FieldError id="create-password-msg">{fieldErrors.password}</FieldError>
          ) : (
            <FieldDescription id="create-password-msg">
              Minimal {PASSWORD_MIN_LENGTH} karakter.
            </FieldDescription>
          )}
        </Field>

        <Field>
          <FieldLabel htmlFor="create-role">Peran</FieldLabel>
          <RoleSelect id="create-role" value={role} onChange={setRole} disabled={submitting} />
          <FieldDescription>
            {ROLE_OPTIONS.find((option) => option.value === role)?.hint}
          </FieldDescription>
        </Field>
      </div>

      {role === "petugas" && (
        <section aria-labelledby="create-modules-title" className="flex flex-col gap-2">
          <h3 id="create-modules-title" className="text-sm font-semibold">
            Izin modul
          </h3>
          <ModulePermissionList
            idPrefix="create-perm"
            value={permissions}
            onChange={setPermissions}
            disabled={submitting}
          />
        </section>
      )}
    </AdminDialog>
  )
}

/* ───────────────────────── Ubah user ───────────────────────── */

export function EditUserDialog({ user, isSelf, onClose, onDone }: UserDialogProps) {
  const [name, setName] = useState(user.name)
  const [role, setRole] = useState<UserRole>(user.role)
  const [active, setActive] = useState(user.active)
  const [nameError, setNameError] = useState<string | null>(null)
  const { submitting, error, run } = useMutation()

  const trimmedName = name.trim()
  const changes = {
    ...(trimmedName !== user.name ? { name: trimmedName } : {}),
    ...(role !== user.role ? { role } : {}),
    ...(active !== user.active ? { active } : {}),
  }
  const hasChanges = Object.keys(changes).length > 0

  async function handleSubmit() {
    const validation = validateName(name)
    setNameError(validation)
    if (validation || !hasChanges) return
    const ok = await run(async () => {
      await adminApi.updateUser(user.id, changes)
    })
    if (ok) onDone(`Data ${user.username} berhasil diperbarui.`)
  }

  return (
    <AdminDialog
      title="Ubah User"
      description={
        <>
          Perbarui nama, peran, atau status akun{" "}
          <span className="font-medium text-foreground">@{user.username}</span>.
        </>
      }
      submitLabel="Simpan Perubahan"
      submitting={submitting}
      submitDisabled={!hasChanges}
      error={error}
      onSubmit={() => void handleSubmit()}
      onClose={onClose}
    >
      <Field data-invalid={nameError ? true : undefined}>
        <FieldLabel htmlFor="edit-name">Nama lengkap</FieldLabel>
        <Input
          id="edit-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={NAME_MAX_LENGTH}
          disabled={submitting}
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? "edit-name-msg" : undefined}
        />
        {nameError && <FieldError id="edit-name-msg">{nameError}</FieldError>}
      </Field>

      <Field>
        <FieldLabel htmlFor="edit-role">Peran</FieldLabel>
        <RoleSelect
          id="edit-role"
          value={role}
          onChange={setRole}
          disabled={submitting || isSelf}
        />
        <FieldDescription>
          {isSelf
            ? "Anda tidak dapat mengubah peran akun sendiri."
            : role === "petugas" && user.role === "admin"
              ? "Setelah menjadi Petugas, atur izin modul akun ini."
              : ROLE_OPTIONS.find((option) => option.value === role)?.hint}
        </FieldDescription>
      </Field>

      <div className="flex items-start justify-between gap-4 rounded-lg border px-3.5 py-3">
        <label htmlFor="edit-active" className="min-w-0 flex-1 cursor-pointer">
          <span className="block text-sm font-medium">Akun aktif</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
            {isSelf
              ? "Anda tidak dapat menonaktifkan akun sendiri."
              : "Akun nonaktif tidak dapat login dan sesinya akan berakhir."}
          </span>
        </label>
        <Switch
          id="edit-active"
          checked={active}
          onCheckedChange={setActive}
          disabled={submitting || isSelf}
          className="mt-0.5"
        />
      </div>
    </AdminDialog>
  )
}

/* ───────────────────────── Izin modul ───────────────────────── */

export function PermissionsDialog({ user, onClose, onDone }: UserDialogProps) {
  const [permissions, setPermissions] = useState<ModuleKey[]>(
    MODULE_KEYS.filter((key) => user.permissions.includes(key)),
  )
  const { submitting, error, run } = useMutation()

  const hasChanges =
    permissions.length !== user.permissions.length ||
    permissions.some((key) => !user.permissions.includes(key))

  async function handleSubmit() {
    if (!hasChanges) return
    const ok = await run(async () => {
      await adminApi.updatePermissions(user.id, { permissions })
    })
    if (ok) onDone(`Izin modul ${user.username} berhasil diperbarui.`)
  }

  return (
    <AdminDialog
      title="Izin Modul"
      description={
        <>
          Tentukan modul yang dapat digunakan{" "}
          <span className="font-medium text-foreground">{user.name}</span>. Perubahan
          berlaku pada permintaan berikutnya dari perangkat Petugas.
        </>
      }
      submitLabel="Simpan Izin"
      submitting={submitting}
      submitDisabled={!hasChanges}
      error={error}
      onSubmit={() => void handleSubmit()}
      onClose={onClose}
      className="max-w-xl"
    >
      <ModulePermissionList
        idPrefix="edit-perm"
        value={permissions}
        onChange={setPermissions}
        disabled={submitting}
      />
    </AdminDialog>
  )
}

/* ───────────────────────── Reset password ───────────────────────── */

export function ResetPasswordDialog({ user, isSelf, onClose, onDone }: UserDialogProps) {
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({})
  const { submitting, error, run } = useMutation()

  async function handleSubmit() {
    const next: { password?: string; confirm?: string } = {}
    const passwordError = validatePassword(password)
    if (passwordError) next.password = passwordError
    if (!next.password && confirm !== password)
      next.confirm = "Konfirmasi password tidak sama."
    setErrors(next)
    if (next.password || next.confirm) return

    const ok = await run(async () => {
      await adminApi.resetPassword(user.id, { password })
    })
    if (ok) onDone(`Password ${user.username} berhasil direset.`)
  }

  return (
    <AdminDialog
      title="Reset Password"
      description={
        <>
          Tetapkan password baru untuk{" "}
          <span className="font-medium text-foreground">@{user.username}</span>.
          {isSelf
            ? " Sesi yang sedang berjalan tetap aktif; gunakan password baru pada login berikutnya."
            : " Sesi yang sedang berjalan tetap aktif. Sampaikan password baru secara langsung kepada pemilik akun."}
        </>
      }
      submitLabel="Reset Password"
      submittingLabel="Mereset…"
      submitting={submitting}
      error={error}
      onSubmit={() => void handleSubmit()}
      onClose={onClose}
    >
      {/* Username tersembunyi membantu password manager mengaitkan akun. */}
      <input
        type="text"
        name="username"
        autoComplete="username"
        value={user.username}
        readOnly
        hidden
      />
      <Field data-invalid={errors.password ? true : undefined}>
        <FieldLabel htmlFor="reset-password">Password baru</FieldLabel>
        <PasswordInput
          id="reset-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          maxLength={PASSWORD_MAX_LENGTH}
          disabled={submitting}
          aria-invalid={errors.password ? true : undefined}
          aria-describedby="reset-password-msg"
        />
        {errors.password ? (
          <FieldError id="reset-password-msg">{errors.password}</FieldError>
        ) : (
          <FieldDescription id="reset-password-msg">
            Minimal {PASSWORD_MIN_LENGTH} karakter.
          </FieldDescription>
        )}
      </Field>
      <Field data-invalid={errors.confirm ? true : undefined}>
        <FieldLabel htmlFor="reset-confirm">Ulangi password baru</FieldLabel>
        <PasswordInput
          id="reset-confirm"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          maxLength={PASSWORD_MAX_LENGTH}
          disabled={submitting}
          aria-invalid={errors.confirm ? true : undefined}
          aria-describedby={errors.confirm ? "reset-confirm-msg" : undefined}
        />
        {errors.confirm && <FieldError id="reset-confirm-msg">{errors.confirm}</FieldError>}
      </Field>
    </AdminDialog>
  )
}

/* ───────────────────────── Hapus sesi perangkat ───────────────────────── */

export function RemoveSessionsDialog({ user, isSelf, onClose, onDone }: UserDialogProps) {
  const { submitting, error, run } = useMutation()
  const count = user.sessions.length

  async function handleSubmit() {
    const ok = await run(async () => {
      await adminApi.removeSessions(user.id)
    })
    if (ok) onDone(`Sesi perangkat ${user.username} berhasil dihapus.`)
  }

  return (
    <AdminDialog
      title="Hapus Sesi Perangkat"
      description={
        <>
          Seluruh sesi{" "}
          <span className="font-medium text-foreground">@{user.username}</span>{" "}
          ({count} perangkat) akan diakhiri. Pemilik akun harus login kembali,
          termasuk bila ingin berpindah ke perangkat baru.
        </>
      }
      submitLabel="Hapus Sesi"
      submittingLabel="Menghapus…"
      destructive
      submitting={submitting}
      error={error}
      onSubmit={() => void handleSubmit()}
      onClose={onClose}
    >
      {isSelf && (
        <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm leading-relaxed">
          Ini akun Anda sendiri. Sesi di perangkat ini juga akan berakhir dan Anda
          akan kembali ke halaman login.
        </p>
      )}
      {user.sessions.length > 0 && (
        <ul className="flex flex-col gap-1.5 text-sm">
          {user.sessions.map((session) => (
            <li
              key={session.id}
              className="truncate rounded-md bg-muted/60 px-3 py-1.5 text-muted-foreground"
            >
              {session.deviceLabel || "Perangkat tidak dikenal"}
            </li>
          ))}
        </ul>
      )}
    </AdminDialog>
  )
}

/* ───────────────────────── Hapus user ───────────────────────── */

export function DeleteUserDialog({ user, onClose, onDone }: UserDialogProps) {
  const [confirmation, setConfirmation] = useState("")
  const { submitting, error, run } = useMutation()
  const confirmed = confirmation.trim() === user.username

  async function handleSubmit() {
    if (!confirmed) return
    const ok = await run(async () => {
      await adminApi.deleteUser(user.id)
    })
    if (ok) onDone(`User ${user.username} berhasil dihapus.`)
  }

  return (
    <AdminDialog
      title="Hapus User"
      description={
        <>
          Akun <span className="font-medium text-foreground">{user.name}</span>{" "}
          beserta seluruh sesinya akan dihapus permanen. Tindakan ini tidak dapat
          dibatalkan.
        </>
      }
      submitLabel="Hapus Permanen"
      submittingLabel="Menghapus…"
      destructive
      submitting={submitting}
      submitDisabled={!confirmed}
      error={error}
      onSubmit={() => void handleSubmit()}
      onClose={onClose}
    >
      <Field>
        <FieldLabel htmlFor="delete-confirm">
          Ketik <span className="numeric font-semibold">{user.username}</span> untuk
          konfirmasi
        </FieldLabel>
        <Input
          id="delete-confirm"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          disabled={submitting}
        />
      </Field>
    </AdminDialog>
  )
}
