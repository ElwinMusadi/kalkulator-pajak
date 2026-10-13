const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"])

export function isSafeMethod(method: string): boolean {
  return SAFE_METHODS.has(method.toUpperCase())
}

/**
 * CSRF: request yang mengubah state wajib berasal dari origin yang sama.
 * Origin harus identik dengan origin URL request; jika browser tidak mengirim
 * Origin, `Sec-Fetch-Site: same-origin` diterima sebagai fallback.
 */
export function isCsrfAllowed(request: Request): boolean {
  if (isSafeMethod(request.method)) return true

  let expectedOrigin: string
  try {
    expectedOrigin = new URL(request.url).origin
  } catch {
    return false
  }

  const origin = request.headers.get("Origin")
  if (origin !== null) {
    return origin === expectedOrigin
  }

  return request.headers.get("Sec-Fetch-Site") === "same-origin"
}
