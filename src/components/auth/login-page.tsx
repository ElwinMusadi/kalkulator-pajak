import { useEffect, useId, useRef, useState } from "react"
import type { FormEvent } from "react"
import { CircleAlert, Info, Loader2 } from "lucide-react"
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
 * Halaman login setinggi viewport. Dokumen tidak di-scroll; pada kondisi
 * normal seluruh isi muat tanpa scroll. Bila zoom, teks besar, atau keyboard
 * virtual membuat isi tidak muat, kontainer layar mengizinkan scroll vertikal
 * internal agar field, pesan error, dan tombol Masuk tetap terjangkau.
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

  // Field yang perlu difokus setelah input diaktifkan kembali (submit gagal).
  // Fokus langsung di catch tidak berhasil karena input masih `disabled`.
  const pendingFocusRef = useRef<FieldKey | null>(null)

  useLockDocumentScroll()

  useEffect(() => {
    if (submitting || !pendingFocusRef.current) return
    const target = pendingFocusRef.current === "password" ? passwordRef : usernameRef
    pendingFocusRef.current = null
    target.current?.focus()
  }, [submitting])

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
      if (isApiError(err) && err.code === "INVALID_CREDENTIALS") {
        setInvalidField("password")
        setPassword("")
        pendingFocusRef.current = "password"
      }
      setError(toLoginError(err))
      setSubmitting(false)
    }
  }

  const notice = error ? null : sessionNotice
  const describedBy = error || notice ? errorId : undefined

  return (
    <div className="viewport-screen-scroll app-background">
      <div className="viewport-screen-inner">
        <main
          className={cn(
            "m-auto flex w-full max-w-[25rem] flex-col gap-6",
            "short:gap-4 xshort:gap-3",
            "short-wide:max-w-3xl short-wide:flex-row short-wide:items-center short-wide:gap-8",
          )}
        >
          {/* Identitas */}
          <div
            className={cn(
              "flex flex-col items-center gap-3 text-center",
              "short:gap-2 xshort:flex-row xshort:justify-center xshort:text-left",
              "short-wide:w-5/12 short-wide:flex-col short-wide:items-start short-wide:text-left",
            )}
          >
            <img
              src="/logo-ntt.png"
              alt="Lambang Provinsi Nusa Tenggara Timur"
              width={61}
              height={64}
              className="h-14 w-auto shrink-0 short:h-11 xshort:h-9"
            />
            <div className="min-w-0">
              <h1 className="text-[1.75rem] font-bold leading-tight tracking-tight text-foreground short:text-2xl xshort:text-xl">
                Kalkulator Pajak Kendaraan
              </h1>
              <p className="mt-1 text-[0.9375rem] leading-snug text-muted-foreground xshort:text-sm">
                UPTD Pendapatan Daerah · Kota Kupang
              </p>
            </div>
          </div>

          {/* Form login */}
          <form
            onSubmit={handleSubmit}
            noValidate
            aria-labelledby="login-heading"
            aria-describedby={describedBy}
            className="flex w-full flex-col gap-4 short:gap-3 short-wide:w-7/12"
          >
            <h2 id="login-heading" className="sr-only">
              Masuk ke akun Anda
            </h2>

            <div className="ios-group">
              <div className="flex flex-col gap-1.5 px-4 pb-3 pt-3.5">
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
                  aria-describedby={invalidField === "username" ? errorId : undefined}
                />
              </div>
              <div className="flex flex-col gap-1.5 border-t border-border px-4 pb-3.5 pt-3">
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
                  aria-describedby={invalidField === "password" ? errorId : undefined}
                />
              </div>
            </div>

            {/* Wilayah live selalu terpasang agar pengumuman terbaca screen reader. */}
            <div id={errorId} aria-live="assertive" aria-atomic="true" className="empty:-mt-4 short:empty:-mt-3">
              {error ? (
                <div
                  role="alert"
                  className="animate-fade-up flex items-start gap-2.5 rounded-2xl border border-destructive/30 bg-[color-mix(in_oklch,var(--destructive)_7%,var(--card))] px-4 py-3 text-[0.9375rem]"
                >
                  <CircleAlert
                    className="mt-0.5 size-[1.125rem] shrink-0 text-destructive"
                    aria-hidden="true"
                  />
                  <p className="leading-snug">
                    <span className="font-semibold text-destructive">{error.title}. </span>
                    <span className="text-foreground">{error.message}</span>
                  </p>
                </div>
              ) : notice ? (
                <div className="info-subtle flex items-start gap-2.5 rounded-2xl border px-4 py-3 text-[0.9375rem]">
                  <Info className="mt-0.5 size-[1.125rem] shrink-0 text-primary" aria-hidden="true" />
                  <p className="leading-snug text-foreground">{notice}</p>
                </div>
              ) : null}
            </div>

            <Button
              type="submit"
              size="lg"
              disabled={submitting}
              aria-busy={submitting || undefined}
              className="w-full"
            >
              {submitting && <Loader2 className="animate-spin" aria-hidden="true" />}
              {submitting ? "Memproses…" : "Masuk"}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              Lupa password? Hubungi Admin.
            </p>
          </form>
        </main>

        <footer className="mt-6 flex shrink-0 flex-col items-center gap-1.5 text-center text-xs text-muted-foreground short:mt-3">
          <PwaInstallLink className="text-sm" />
          <span>Pergub NTT No. 54 Tahun 2026</span>
        </footer>
      </div>
    </div>
  )
}
