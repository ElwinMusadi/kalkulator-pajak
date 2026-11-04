/**
 * DELETE /api/admin/announcements/:id — hapus pengumuman → 204.
 *
 * Khusus Admin. Pengumuman hilang dari riwayat (lonceng dan modal Info
 * Terbaru) di semua perangkat; notifikasi push yang sudah tampil tidak ditarik.
 */

import { idParam, requireAdmin } from "../../../../../server/auth/admin-route.ts"
import { clock, toIso } from "../../../../../server/clock.ts"
import { logEvent, noContent, notFound } from "../../../../../server/http.ts"
import { deleteAnnouncement } from "../../../../../server/push/store.ts"
import type { AppFunction } from "../../../../../server/types.ts"

const NOT_FOUND_MESSAGE = "Pengumuman tidak ditemukan."

export const onRequestDelete: AppFunction<"id"> = async (ctx) => {
  const admin = requireAdmin(ctx.data.auth)
  if (admin instanceof Response) return admin
  const id = idParam(ctx.params.id)
  if (!id) return notFound(NOT_FOUND_MESSAGE)

  const deleted = await deleteAnnouncement(ctx.env.DB, admin, id, toIso(clock.now()))
  if (!deleted) return notFound(NOT_FOUND_MESSAGE)
  logEvent("info", "announcement_deleted", { actorUserId: admin.user.id, announcementId: id })
  return noContent()
}
