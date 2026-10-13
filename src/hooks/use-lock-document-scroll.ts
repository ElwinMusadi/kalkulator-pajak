import { useEffect } from "react"

let lockCount = 0
let previous: { html: string; body: string; overscroll: string } | null = null

function lock() {
  if (lockCount === 0) {
    const html = document.documentElement
    const body = document.body
    previous = {
      html: html.style.overflow,
      body: body.style.overflow,
      overscroll: html.style.overscrollBehavior,
    }
    html.style.overflow = "hidden"
    body.style.overflow = "hidden"
    html.style.overscrollBehavior = "none"
  }
  lockCount += 1
}

function unlock() {
  lockCount = Math.max(0, lockCount - 1)
  if (lockCount === 0 && previous) {
    const html = document.documentElement
    html.style.overflow = previous.html
    document.body.style.overflow = previous.body
    html.style.overscrollBehavior = previous.overscroll
    previous = null
  }
}

/**
 * Mengunci scroll `html` dan `body` selama komponen pemanggil terpasang.
 * Dipakai layar penuh (login, loading, offline) yang tidak boleh di-scroll.
 * Berbasis counter sehingga beberapa layar yang bertumpuk tetap aman.
 */
export function useLockDocumentScroll(locked = true): void {
  useEffect(() => {
    if (!locked) return
    lock()
    return unlock
  }, [locked])
}
