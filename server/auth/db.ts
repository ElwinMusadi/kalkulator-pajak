/**
 * Utilitas akses D1 untuk modul auth.
 */

function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    const cause = (err as Error & { cause?: unknown }).cause
    return cause instanceof Error ? `${err.message} ${cause.message}` : err.message
  }
  return typeof err === "string" ? err : ""
}

/** Deteksi pelanggaran UNIQUE dari pesan D1/SQLite, opsional untuk kolom tertentu. */
export function isUniqueViolation(err: unknown, column?: string): boolean {
  const message = errorMessage(err)
  if (!/UNIQUE constraint failed/i.test(message)) return false
  return column === undefined || message.includes(column)
}

export function isConstraintViolation(err: unknown): boolean {
  return /constraint failed|SQLITE_CONSTRAINT/i.test(errorMessage(err))
}

/** Parse JSON array string dari `json_group_array`; nilai rusak → []. */
export function parseJsonStringArray(value: unknown): string[] {
  if (typeof value !== "string") return []
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []
  } catch {
    return []
  }
}
