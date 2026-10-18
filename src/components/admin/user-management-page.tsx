import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"
import {
  CircleAlert,
  CircleCheck,
  KeyRound,
  Loader2,
  MonitorSmartphone,
  MonitorX,
  Pencil,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash,
  UserPlus,
  Users,
  X,
} from "lucide-react"
import { useAuth, useAuthenticatedUser } from "@/auth/auth-context"
import {
  CreateUserDialog,
  DeleteUserDialog,
  EditUserDialog,
  PermissionsDialog,
  RemoveSessionsDialog,
  ResetPasswordDialog,
} from "@/components/admin/user-dialogs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { adminApi } from "@/lib/auth-api"
import { isAbortError, isApiError } from "@/lib/http"
import { formatDateTime } from "@/lib/format"
import { cn } from "@/lib/utils"
import { MODULE_KEYS, MODULE_LABELS, type AdminUserSummary } from "@/types/auth"

type DialogKind = "edit" | "permissions" | "reset" | "sessions" | "delete"

type DialogState =
  | { kind: "create" }
  | { kind: DialogKind; user: AdminUserSummary }
  | null

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready" }

interface Notice {
  tone: "success" | "error"
  message: string
}

const ROLE_LABEL = { admin: "Admin", petugas: "Petugas" } as const

/* ───────────────────────── Aksi per user ───────────────────────── */

interface UserAction {
  kind: DialogKind
  label: string
  icon: ReactNode
  disabledReason?: string
  destructive?: boolean
}

function getUserActions(user: AdminUserSummary, isSelf: boolean): UserAction[] {
  return [
    { kind: "edit", label: "Ubah", icon: <Pencil aria-hidden="true" /> },
    {
      kind: "permissions",
      label: "Izin Modul",
      icon: <ShieldCheck aria-hidden="true" />,
      disabledReason:
        user.role === "admin" ? "Admin selalu memiliki seluruh modul." : undefined,
    },
    { kind: "reset", label: "Reset Password", icon: <KeyRound aria-hidden="true" /> },
    {
      kind: "sessions",
      label: "Hapus Sesi Perangkat",
      icon: <MonitorX aria-hidden="true" />,
      disabledReason:
        user.sessions.length === 0 ? "Tidak ada sesi perangkat aktif." : undefined,
    },
    {
      kind: "delete",
      label: "Hapus User",
      icon: <Trash aria-hidden="true" />,
      destructive: true,
      disabledReason: isSelf ? "Anda tidak dapat menghapus akun sendiri." : undefined,
    },
  ]
}

function ActionButton({
  action,
  user,
  compact,
  onSelect,
}: {
  action: UserAction
  user: AdminUserSummary
  compact: boolean
  onSelect: (kind: DialogKind) => void
}) {
  const disabled = Boolean(action.disabledReason)
  const tooltip = action.disabledReason ?? action.label

  const button = (
    <Button
      type="button"
      variant="ghost"
      size={compact ? "icon" : "sm"}
      disabled={disabled}
      onClick={() => onSelect(action.kind)}
      aria-label={compact ? `${action.label} ${user.username}` : undefined}
      className={cn(
        "[&_svg]:stroke-[1.75]",
        compact
          ? "size-11 rounded-full"
          : "h-11 justify-start rounded-xl px-3 text-[0.9375rem] font-medium",
        action.destructive &&
          "text-destructive hover:bg-destructive/10 hover:text-destructive hover:[&_svg]:text-destructive",
      )}
    >
      {action.icon}
      {!compact && action.label}
    </Button>
  )

  // Tombol nonaktif tidak memicu event pointer; bungkus agar tooltip alasan
  // tetap dapat dibaca melalui hover maupun fokus keyboard.
  if (disabled) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            aria-label={`${action.label} tidak tersedia: ${action.disabledReason}`}
            className="inline-flex rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {button}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[220px] text-xs">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    )
  }

  if (!compact) return button

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  )
}

/* ───────────────────────── Potongan informasi ───────────────────────── */

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium leading-5",
        active
          ? "bg-success-subtle text-success"
          : "bg-muted text-muted-foreground",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 rounded-full",
          active ? "bg-success" : "bg-muted-foreground/60",
        )}
      />
      {active ? "Aktif" : "Nonaktif"}
    </span>
  )
}

function RoleBadge({ role }: { role: AdminUserSummary["role"] }) {
  return (
    <Badge
      variant={role === "admin" ? "default" : "outline"}
      className="rounded-full px-2.5 font-medium"
    >
      {ROLE_LABEL[role]}
    </Badge>
  )
}

function PermissionSummary({ user }: { user: AdminUserSummary }) {
  if (user.role === "admin") {
    return <span className="text-sm text-muted-foreground">Semua modul</span>
  }
  const granted = MODULE_KEYS.filter((key) => user.permissions.includes(key))
  const label = `${granted.length} dari ${MODULE_KEYS.length} modul`

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="numeric -my-2 inline-flex min-h-11 items-center rounded-md text-sm text-foreground underline decoration-dotted decoration-muted-foreground/60 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {label}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[260px] text-xs">
        {granted.length === 0 ? (
          "Belum ada modul yang diizinkan."
        ) : (
          <ul className="flex flex-col gap-0.5">
            {granted.map((key) => (
              <li key={key}>{MODULE_LABELS[key].label}</li>
            ))}
          </ul>
        )}
      </TooltipContent>
    </Tooltip>
  )
}

function SessionSummary({ user }: { user: AdminUserSummary }) {
  const [first, ...rest] = [...user.sessions].sort((a, b) =>
    b.lastSeenAt.localeCompare(a.lastSeenAt),
  )
  if (!first) {
    return <span className="text-sm text-muted-foreground">Tidak ada sesi</span>
  }

  return (
    <div className="min-w-0 text-sm leading-snug">
      <p className="flex min-w-0 items-center gap-1.5 font-medium text-foreground">
        <MonitorSmartphone className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="truncate">{first.deviceLabel || "Perangkat tidak dikenal"}</span>
        {rest.length > 0 && (
          <span className="shrink-0 text-xs font-normal text-muted-foreground">
            +{rest.length} lainnya
          </span>
        )}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Aktif {formatDateTime(first.lastSeenAt)}
      </p>
      <p className="text-xs text-muted-foreground">
        Login {formatDateTime(first.createdAt)}
      </p>
    </div>
  )
}

function UserIdentity({ user, isSelf }: { user: AdminUserSummary; isSelf: boolean }) {
  return (
    <div className="min-w-0">
      <p className="flex min-w-0 items-center gap-2 text-base font-medium leading-snug text-foreground">
        <span className="truncate">{user.name}</span>
        {isSelf && (
          <span className="shrink-0 rounded-full bg-primary/10 px-2 py-px text-xs font-medium text-primary">
            Anda
          </span>
        )}
      </p>
      <p className="truncate text-sm text-muted-foreground">@{user.username}</p>
    </div>
  )
}

/* ───────────────────────── Loading skeleton ───────────────────────── */

function ListSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col divide-y">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-4 md:px-6">
          <div className="flex flex-1 flex-col gap-2">
            <div className="h-3.5 w-40 animate-pulse rounded bg-muted" />
            <div className="h-3 w-24 animate-pulse rounded bg-muted" />
          </div>
          <div className="hidden h-5 w-16 animate-pulse rounded bg-muted md:block" />
          <div className="hidden h-5 w-16 animate-pulse rounded bg-muted md:block" />
          <div className="hidden h-8 w-36 animate-pulse rounded bg-muted lg:block" />
        </div>
      ))}
    </div>
  )
}

/* ───────────────────────── Halaman ───────────────────────── */

export function UserManagementPage() {
  const currentUser = useAuthenticatedUser()
  const { refresh: refreshAuth } = useAuth()
  const [users, setUsers] = useState<AdminUserSummary[]>([])
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" })
  const [refreshing, setRefreshing] = useState(false)
  const [query, setQuery] = useState("")
  const [dialog, setDialog] = useState<DialogState>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  /** Mengambil daftar user; state hanya diperbarui setelah respons tiba. */
  const fetchUsers = useCallback((mode: "initial" | "refresh") => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    return adminApi
      .listUsers(controller.signal)
      .then(({ users: list }) => {
        setUsers(list)
        setLoadState({ status: "ready" })
      })
      .catch((error: unknown) => {
        if (isAbortError(error)) return
        // 401 sudah ditangani AuthProvider; halaman akan diganti layar login.
        if (isApiError(error) && error.status === 401) return
        const message = isApiError(error)
          ? error.message
          : "Daftar user gagal dimuat. Coba lagi."
        // Saat daftar sudah tampil, pertahankan data lama dan tampilkan pesan.
        setLoadState((current) =>
          current.status === "ready" ? current : { status: "error", message },
        )
        if (mode === "refresh") {
          setNotice({ tone: "error", message: `Daftar user gagal diperbarui. ${message}` })
        }
      })
      .finally(() => {
        if (abortRef.current === controller) setRefreshing(false)
      })
  }, [])

  const loadUsers = useCallback(
    (mode: "initial" | "refresh") => {
      setRefreshing(true)
      return fetchUsers(mode)
    },
    [fetchUsers],
  )

  useEffect(() => {
    void fetchUsers("initial")
    return () => abortRef.current?.abort()
  }, [fetchUsers])

  const handleDone = useCallback(
    (message: string, affectsSelf: boolean) => {
      setDialog(null)
      setNotice({ tone: "success", message })
      void loadUsers("refresh")
      // Sinkronkan header/izin bila akun sendiri berubah; 401 (sesi dihapus)
      // otomatis mengembalikan ke halaman login.
      if (affectsSelf) void refreshAuth()
    },
    [loadUsers, refreshAuth],
  )

  const sortedUsers = useMemo(
    () =>
      [...users].sort((a, b) => {
        if (a.id === currentUser.id) return -1
        if (b.id === currentUser.id) return 1
        if (a.role !== b.role) return a.role === "admin" ? -1 : 1
        return a.name.localeCompare(b.name, "id")
      }),
    [users, currentUser.id],
  )

  const normalizedQuery = query.trim().toLowerCase()
  const visibleUsers = normalizedQuery
    ? sortedUsers.filter(
        (user) =>
          user.name.toLowerCase().includes(normalizedQuery) ||
          user.username.includes(normalizedQuery),
      )
    : sortedUsers

  const activeCount = users.filter((user) => user.active).length
  const openDialog = (kind: DialogKind, user: AdminUserSummary) =>
    setDialog({ kind, user })

  return (
    <section aria-labelledby="user-management-title" className="flex flex-col gap-4">
      <Card className="gap-0 overflow-hidden rounded-[1.25rem] border-border/70 py-0 shadow-none">
        <CardHeader className="gap-4 border-b border-border/70 px-4 py-5 sm:flex-row sm:items-end sm:justify-between sm:space-y-0 md:px-6">
          <div className="min-w-0">
            <CardTitle id="user-management-title" className="text-[1.375rem] font-semibold">
              Kelola User
            </CardTitle>
            <p className="mt-1 text-[0.9375rem] leading-snug text-muted-foreground">
              {loadState.status === "ready" ? (
                <>
                  <span className="numeric">{users.length}</span> akun ·{" "}
                  <span className="numeric">{activeCount}</span> aktif. Petugas hanya
                  dapat login di satu perangkat.
                </>
              ) : (
                "Atur akun, izin modul, dan sesi perangkat."
              )}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => void loadUsers("refresh")}
              disabled={refreshing || loadState.status === "loading"}
              aria-label="Muat ulang daftar user"
              className="size-11 rounded-full"
            >
              <RefreshCw
                className={cn("stroke-[1.75]", refreshing && "animate-spin")}
                aria-hidden="true"
              />
            </Button>
            <Button
              type="button"
              onClick={() => setDialog({ kind: "create" })}
              className="h-11 rounded-full px-5 text-[0.9375rem] font-semibold [&_svg]:stroke-[1.75]"
            >
              <UserPlus aria-hidden="true" />
              Tambah User
            </Button>
          </div>
        </CardHeader>

        <div aria-live="polite" aria-atomic="true">
          {notice && (
            <div
              className={cn(
                "flex items-start gap-2 border-b px-4 py-2 text-sm md:px-6",
                notice.tone === "success"
                  ? "border-success-subtle bg-success-subtle"
                  : "border-destructive/30 bg-destructive/5",
              )}
            >
              {notice.tone === "success" ? (
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
              ) : (
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
              )}
              <p className="flex-1 py-0.5 text-foreground">{notice.message}</p>
              <button
                type="button"
                onClick={() => setNotice(null)}
                aria-label="Tutup pemberitahuan"
                className="-my-1.5 -mr-2 inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>

        {loadState.status === "ready" && users.length > 0 && (
          <div className="border-b border-border/70 px-4 py-3 md:px-6">
            <div className="relative max-w-sm">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 stroke-[1.75] text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari nama atau username"
                aria-label="Cari user"
                className="h-11 rounded-xl border-transparent bg-muted pl-10 text-base md:text-base"
              />
            </div>
          </div>
        )}

        <CardContent className="p-0">
          {loadState.status === "loading" && (
            <>
              <span className="sr-only" role="status">
                Memuat daftar user…
              </span>
              <ListSkeleton />
            </>
          )}

          {loadState.status === "error" && (
            <Empty className="border-0">
              <EmptyHeader>
                <EmptyMedia variant="icon" className="bg-destructive/10 text-destructive">
                  <CircleAlert aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>Daftar user gagal dimuat</EmptyTitle>
                <EmptyDescription>{loadState.message}</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void loadUsers("refresh")}
                  disabled={refreshing}
                >
                  {refreshing ? (
                    <Loader2 className="animate-spin" aria-hidden="true" />
                  ) : (
                    <RefreshCw aria-hidden="true" />
                  )}
                  Coba lagi
                </Button>
              </EmptyContent>
            </Empty>
          )}

          {loadState.status === "ready" && users.length === 0 && (
            <Empty className="border-0">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Users aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>Belum ada user</EmptyTitle>
                <EmptyDescription>
                  Tambahkan akun Petugas agar dapat menggunakan kalkulator.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}

          {loadState.status === "ready" &&
            users.length > 0 &&
            visibleUsers.length === 0 && (
              <Empty className="border-0">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Search aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>Tidak ada user yang cocok</EmptyTitle>
                  <EmptyDescription>
                    Tidak ditemukan nama atau username yang mengandung “{query.trim()}”.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button type="button" variant="outline" onClick={() => setQuery("")}>
                    Hapus pencarian
                  </Button>
                </EmptyContent>
              </Empty>
            )}

          {loadState.status === "ready" && visibleUsers.length > 0 && (
            <>
              {/* Mobile & tablet: kartu bertumpuk */}
              <ul className="flex flex-col divide-y divide-border/70 lg:hidden">
                {visibleUsers.map((user) => {
                  const isSelf = user.id === currentUser.id
                  return (
                    <li key={user.id} className="flex flex-col gap-3 px-4 py-4 md:px-6">
                      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                        <UserIdentity user={user} isSelf={isSelf} />
                        <div className="flex shrink-0 items-center gap-1.5">
                          <RoleBadge role={user.role} />
                          <StatusBadge active={user.active} />
                        </div>
                      </div>
                      <dl className="grid grid-cols-1 divide-y divide-border/70 overflow-hidden rounded-2xl bg-muted/50 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                        <div className="min-w-0 px-3.5 py-2.5">
                          <dt className="text-[0.8125rem] text-muted-foreground">
                            Sesi Perangkat
                          </dt>
                          <dd className="mt-1">
                            <SessionSummary user={user} />
                          </dd>
                        </div>
                        <div className="min-w-0 px-3.5 py-2.5">
                          <dt className="text-[0.8125rem] text-muted-foreground">
                            Izin Modul
                          </dt>
                          <dd className="mt-1">
                            <PermissionSummary user={user} />
                          </dd>
                        </div>
                      </dl>
                      <div className="-mx-1 grid grid-cols-1 gap-0.5 min-[400px]:grid-cols-2">
                        {getUserActions(user, isSelf).map((action) => (
                          <ActionButton
                            key={action.kind}
                            action={action}
                            user={user}
                            compact={false}
                            onSelect={(kind) => openDialog(kind, user)}
                          />
                        ))}
                      </div>
                    </li>
                  )
                })}
              </ul>

              {/* Desktop: tabel */}
              <div className="hidden lg:block">
                <table className="w-full table-fixed text-left">
                  <caption className="sr-only">Daftar user aplikasi</caption>
                  <thead>
                    <tr className="border-b border-border/70 bg-muted/40 text-[0.8125rem] text-muted-foreground">
                      <th scope="col" className="w-[23%] px-6 py-2.5 font-medium">User</th>
                      <th scope="col" className="w-[10%] px-3 py-2.5 font-medium">Peran</th>
                      <th scope="col" className="w-[10%] px-3 py-2.5 font-medium">Status</th>
                      <th scope="col" className="w-[21%] px-3 py-2.5 font-medium">Sesi Perangkat</th>
                      <th scope="col" className="w-[12%] px-3 py-2.5 font-medium">Izin Modul</th>
                      <th scope="col" className="w-[24%] px-6 py-2.5 text-right font-medium">
                        <span className="sr-only">Aksi</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/70">
                    {visibleUsers.map((user) => {
                      const isSelf = user.id === currentUser.id
                      return (
                        <tr key={user.id} className="align-top transition-colors hover:bg-muted/30">
                          <td className="px-6 py-3.5">
                            <UserIdentity user={user} isSelf={isSelf} />
                          </td>
                          <td className="px-3 py-3.5">
                            <RoleBadge role={user.role} />
                          </td>
                          <td className="px-3 py-3.5">
                            <StatusBadge active={user.active} />
                          </td>
                          <td className="px-3 py-3.5">
                            <SessionSummary user={user} />
                          </td>
                          <td className="px-3 py-3.5">
                            <PermissionSummary user={user} />
                          </td>
                          <td className="px-6 py-2.5">
                            <div className="flex flex-wrap justify-end gap-0.5">
                              {getUserActions(user, isSelf).map((action) => (
                                <ActionButton
                                  key={action.kind}
                                  action={action}
                                  user={user}
                                  compact
                                  onSelect={(kind) => openDialog(kind, user)}
                                />
                              ))}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {dialog?.kind === "create" && (
        <CreateUserDialog
          onClose={() => setDialog(null)}
          onDone={(message) => handleDone(message, false)}
        />
      )}
      {dialog && dialog.kind !== "create" && (
        <UserDialog
          dialog={dialog}
          isSelf={dialog.user.id === currentUser.id}
          onClose={() => setDialog(null)}
          onDone={(message) => handleDone(message, dialog.user.id === currentUser.id)}
        />
      )}
    </section>
  )
}

function UserDialog({
  dialog,
  isSelf,
  onClose,
  onDone,
}: {
  dialog: { kind: DialogKind; user: AdminUserSummary }
  isSelf: boolean
  onClose: () => void
  onDone: (message: string) => void
}) {
  const props = { user: dialog.user, isSelf, onClose, onDone }
  switch (dialog.kind) {
    case "edit":
      return <EditUserDialog {...props} />
    case "permissions":
      return <PermissionsDialog {...props} />
    case "reset":
      return <ResetPasswordDialog {...props} />
    case "sessions":
      return <RemoveSessionsDialog {...props} />
    case "delete":
      return <DeleteUserDialog {...props} />
  }
}
