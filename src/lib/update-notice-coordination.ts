/**
 * Koordinasi tampilan "versi baru tersedia" antara modal Info Terbaru
 * (notification-center, setelah login) dan kartu PwaUpdateNotice (halaman
 * login dan layar pemeriksaan sesi), agar pembaruan tidak tampil dua kali.
 * Store eksternal kecil tanpa React.
 */

export interface UpdateNoticeCoordination {
  /** Aplikasi (setelah login) terpasang dan menampilkan pembaruan wajib di modalnya. */
  handledByApp: boolean
}

let state: UpdateNoticeCoordination = { handledByApp: false }
const listeners = new Set<() => void>()

export function getUpdateNoticeCoordination(): UpdateNoticeCoordination {
  return state
}

export function subscribeUpdateNoticeCoordination(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function setUpdateNoticeCoordination(next: Partial<UpdateNoticeCoordination>): void {
  const merged = { ...state, ...next }
  if (merged.handledByApp === state.handledByApp) return
  state = merged
  for (const listener of [...listeners]) listener()
}
