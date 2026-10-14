import { useEffect, useId, useRef, useState } from "react"
import type { FormEvent } from "react"
import { CircleAlert, Info, Loader2, LogIn } from "lucide-react"
import { useAuth } from "@/auth/auth-context"
import { PasswordInput } from "@/components/password-input"
import { PwaInstallLink } from "@/components/pwa-install-prompt"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useLockDocumentScroll } from "@/hooks/use-lock-document-scroll"
import { isApiError } from "@/lib/http"
import { cn } from "@/lib/utils"

type FieldKey = "username" | "password"

interface LoginError {
  title: string
  message: string
}

function toLoginError(error: unknown): LoginError {
  if (isApiError(error)) {
    if (error.code === "SESSION_ACTIVE_ELSEWHERE") {
      return { title: "Akun sedang digunakan", message: error.message }
    }
    if (error.code === "INVALID_CREDENTIALS" || error.status === 401) {
      return { title: "Login gagal", message: error.message }
    }
    return { title: "Login gagal", message: error.message }
  }
  return {
    title: "Login gagal",
    message: "Terjadi kesalahan tak terduga. Coba lagi.",
  }
}

/**
 * Halaman login setinggi viewport yang tidak pernah scroll.
 * Tata letak dipadatkan bertahap lewat varian tinggi `short` (≤640px),
 * `xshort` (≤500px), dan `short-wide` (ponsel landscape) di index.css.
 */
export function LoginPage() {
  const { login, sessionNotice } = useAuth()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<LoginError | null>(null)
  const [invalidField, setInvalidField] = useState<FieldKey | null>(null)
  const usernameRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const errorId = useId()

  useLockDocumentScroll()

  // Fokus otomatis hanya untuk perangkat dengan pointer presisi agar keyboard
  // virtual tidak langsung menutupi layar pada ponsel.
  useEffect(() => {
    if (window.matchMedia?.("(pointer: fine)").matches) {
      usernameRef.current?.focus()
    }
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    const normalizedUsername = username.trim().toLowerCase()
    if (!normalizedUsername) {
      setInvalidField("username")
      setError({ title: "Data belum lengkap", message: "Masukkan username." })
      usernameRef.current?.focus()
      return
    }
    if (!password) {
      setInvalidField("password")
      setError({ title: "Data belum lengkap", message: "Masukkan password." })
      passwordRef.current?.focus()
      return
    }

    setSubmitting(true)
    setError(null)
    setInvalidField(null)
    try {
      await login(normalizedUsername, password)
    } catch (err) {
      setError(toLoginError(err))
      setSubmitting(false)
      if (isApiError(err) && err.code === "INVALID_CREDENTIALS") {
        setInvalidField("password")
        setPassword("")
        passwordRef.current?.focus()
      }
    }
  }

  const notice = error ? null : sessionNotice

  return (
    // Pita navy di sepertiga atas (latar) + kartu putih mengambang; tetap
    // setinggi viewport dan tidak pernah scroll.
    <div className="viewport-screen app-background flex flex-col">
      <div
        aria-hidden="true"
        className="brand-band pointer-events-none absolute inset-x-0 top-0 h-[42%] short:h-[46%] short-wide:h-full short-wide:w-1/2"
      >
        <div className="gold-rule absolute inset-x-0 bottom-0 short-wide:hidden" />
      </div>

      <main
        className={cn(
          "relative mx-auto flex min-h-0 w-full max-w-sm flex-1 flex-col gap-6 px-5 py-6",
          "short:gap-4 short:py-4 xshort:gap-3 xshort:py-3 tiny:py-2",
          "short-wide:max-w-3xl short-wide:flex-row short-wide:gap-8",
        )}
      >
        {/* Identitas instansi (di atas pita navy). Margin auto memusatkan konten
            tanpa risiko terpotong; bagian ini yang menyusut lebih dahulu sehingga
            form dan tombol Masuk tetap terlihat. */}
        <div
          className={cn(
            "mt-auto flex min-h-0 shrink flex-col items-center gap-3 overflow-hidden text-center text-white short-wide:my-auto",
            "short:gap-2 xshort:flex-row xshort:gap-3 xshort:text-left",
            "short-wide:w-1/2 short-wide:flex-col short-wide:items-start short-wide:text-left",
          )}
        >
          <span className="flex shrink-0 items-center justify-center rounded-2xl bg-white/10 p-2.5 ring-1 ring-white/15 short:p-2 xshort:rounded-xl xshort:p-1.5 tiny:p-1.5">
            <img
              src="/logo-ntt.png"
              alt="Lambang Provinsi Nusa Tenggara Timur"
              width={61}
              height={64}
              className="h-14 w-auto short:h-10 xshort:h-8 short-wide:h-11 tiny:h-8"
            />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase leading-snug tracking-[0.16em] text-white/65 sm:text-[11px]">
              UPTD Pendapatan Daerah · Kota Kupang
            </p>
            <h1 className="mt-1 text-2xl font-bold leading-tight tracking-tight text-white short:mt-0.5 short:text-xl xshort:text-lg">
              Kalkulator Pajak Kendaraan
            </h1>
            <p className="mt-1 text-sm leading-snug text-white/70 short:hidden short-wide:block tiny:hidden">
              Masuk dengan akun yang diberikan Admin.
            </p>
          </div>
        </div>

        {/* Form login */}
        <div className="surface-card mb-auto w-full shrink-0 p-6 text-card-foreground shadow-float short-wide:my-auto short:p-5 xshort:p-4 tiny:p-3 short-wide:w-1/2">
          <form
            onSubmit={handleSubmit}
            noValidate
            aria-describedby={error || notice ? errorId : undefined}
            className="flex flex-col gap-4 short:gap-3 xshort:gap-2.5 tiny:gap-2"
          >
            <div className="short:sr-only">
              <h2 className="text-lg font-bold tracking-tight">Masuk ke akun Anda</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Gunakan username dan password dari Admin.
              </p>
            </div>

            <div className="flex flex-col gap-2 xshort:gap-1.5 tiny:gap-1">
              <Label htmlFor="login-username">Username</Label>
              <Input
                ref={usernameRef}
                id="login-username"
                name="username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value)
                  if (invalidField === "username") setInvalidField(null)
                }}
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="next"
                required
                disabled={submitting}
                aria-invalid={invalidField === "username" || undefined}
                className="h-10 text-base sm:text-sm xshort:h-9"
              />
            </div>

            <div className="flex flex-col gap-2 xshort:gap-1.5 tiny:gap-1">
              <Label htmlFor="login-password">Password</Label>
              <PasswordInput
                ref={passwordRef}
                id="login-password"
                name="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  if (invalidField === "password") setInvalidField(null)
                }}
                autoComplete="current-password"
                enterKeyHint="go"
                required
                disabled={submitting}
                aria-invalid={invalidField === "password" || undefined}
                className="h-10 text-base sm:text-sm xshort:h-9"
              />
            </div>

            {/* Wilayah live selalu terpasang agar pengumuman terbaca screen reader. */}
            <div id={errorId} aria-live="assertive" aria-atomic="true">
              {error ? (
                <div
                  role="alert"
                  className="animate-fade-up flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm short:px-2.5 short:py-1.5 short:text-xs [&_svg]:short:mt-0"
                >
                  <CircleAlert
                    className="mt-0.5 size-4 shrink-0 text-destructive"
                    aria-hidden="true"
                  />
                  <p className="leading-snug">
                    <span className="font-medium text-destructive">{error.title}. </span>
                    <span className="text-foreground">{error.message}</span>
                  </p>
                </div>
              ) : notice ? (
                <div className="info-subtle flex items-start gap-2 rounded-md border px-3 py-2 text-sm short:px-2.5 short:py-1.5 short:text-xs [&_svg]:short:mt-0">
                  <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                  <p className="leading-snug text-foreground">{notice}</p>
                </div>
              ) : null}
            </div>

            <Button
              type="submit"
              size="lg"
              disabled={submitting}
              aria-busy={submitting || undefined}
              className="-mt-1 h-11 w-full text-base font-semibold short:h-10 xshort:mt-0 xshort:h-9 xshort:text-sm"
            >
              {submitting ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <LogIn aria-hidden="true" />
              )}
              {submitting ? "Memproses…" : "Masuk"}
            </Button>

            <p className="text-center text-xs text-muted-foreground tiny:hidden">
              Lupa password? Hubungi Admin.
            </p>
          </form>
        </div>
      </main>

      {/* Footer disembunyikan pada tinggi sempit agar form tetap utuh tanpa scroll;
          tombol instal tetap tersedia di header setelah login. */}
      <footer className="relative flex shrink-0 flex-col items-center gap-2 pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-xs text-muted-foreground short:hidden">
        <PwaInstallLink className="text-sm" />
        <span>Pergub NTT No. 54 Tahun 2026</span>
      </footer>
    </div>
  )
}
