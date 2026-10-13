export const SESSION_COOKIE_NAME = "__Host-kp_session"

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/** Petugas: sesi tunggal tanpa kedaluwarsa server; cookie 400 hari (batas browser). */
export const PETUGAS_COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60
/** Cookie petugas diperbarui paling sering sekali per hari saat dipakai. */
export const PETUGAS_COOKIE_REFRESH_INTERVAL_MS = DAY_MS

/** Admin: idle 12 jam, absolut 7 hari. */
export const ADMIN_IDLE_TIMEOUT_MS = 12 * HOUR_MS
export const ADMIN_ABSOLUTE_TIMEOUT_MS = 7 * DAY_MS
export const ADMIN_COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60

/** Throttle penulisan last_seen_at. */
export const LAST_SEEN_UPDATE_INTERVAL_MS = 5 * MINUTE_MS

export const INVALID_CREDENTIALS_MESSAGE = "Username atau password salah."
export const SESSION_ACTIVE_ELSEWHERE_MESSAGE =
  "Akun sudah aktif di perangkat lain. Hubungi Admin."
