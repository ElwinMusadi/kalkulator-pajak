import { SESSION_COOKIE_NAME } from "./constants.ts"
import { SESSION_TOKEN_PATTERN } from "./crypto.ts"

/** Ambil token sesi dari header Cookie; hanya format token valid yang diterima. */
export function readSessionToken(request: Request): string | null {
  const header = request.headers.get("Cookie")
  if (!header) return null
  for (const part of header.split(";")) {
    const index = part.indexOf("=")
    if (index === -1) continue
    if (part.slice(0, index).trim() !== SESSION_COOKIE_NAME) continue
    const value = part.slice(index + 1).trim()
    return SESSION_TOKEN_PATTERN.test(value) ? value : null
  }
  return null
}

export function hasSessionCookie(request: Request): boolean {
  const header = request.headers.get("Cookie")
  if (!header) return false
  return header
    .split(";")
    .some((part) => part.split("=", 1)[0].trim() === SESSION_COOKIE_NAME)
}

export function buildSessionCookie(token: string, maxAgeSeconds: number): string {
  if (!SESSION_TOKEN_PATTERN.test(token)) throw new Error("Invalid session token format")
  const maxAge = Math.max(0, Math.floor(maxAgeSeconds))
  return `${SESSION_COOKIE_NAME}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`
}

export function buildClearSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`
}
