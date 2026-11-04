/**
 * Koordinasi tampilan "versi baru tersedia" antara modal pembuka
 * (notification-center) dan kartu/pil PwaUpdateNotice, agar pembaruan tidak
 * tampil dua kali. Store eksternal kecil tanpa React.
 */

export interface UpdateNoticeCoordination {
  /** Modal pembuka sedang tampil (dan menampilkan pembaruan bila ada). */
  modalOpen: boolean
  /** Pembaruan sudah ditunda dari modal: kartu langsung diringkas menjadi pil. */
  deferred: boolean
}

let state: UpdateNoticeCoordination = { modalOpen: false, deferred: false }
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
  if (merged.modalOpen === state.modalOpen && merged.deferred === state.deferred) return
  state = merged
  for (const listener of [...listeners]) listener()
}
