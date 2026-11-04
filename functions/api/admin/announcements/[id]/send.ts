/**
 * POST /api/admin/announcements/:id/send — ContinueAnnouncementRequest → AnnouncementSendResponse
 *
 * Gelombang push berikutnya untuk pengumuman yang sudah tersimpan, mulai
 * setelah kursor `after` dari gelombang sebelumnya.
 */

import { idParam, requireAdmin } from "../../../../../server/auth/admin-route.ts"
import { isValidId } from "../../../../../server/auth/validation.ts"
import { clock } from "../../../../../server/clock.ts"
import {
  errorResponse,
  jsonResponse,
  logEvent,
  notFound,
  readJsonObject,
  validationError,
} from "../../../../../server/http.ts"
import { deliverBatch, getAnnouncement, loadVapidKeys } from "../../../../../server/push/store.ts"
import type { AppFunction } from "../../../../../server/types.ts"
import type { AnnouncementSendResponse } from "../../../../../src/types/push.ts"

export const onRequestPost: AppFunction = async (ctx) => {
  const admin = requireAdmin(ctx.data.auth)
  if (admin instanceof Response) return admin

  const id = idParam(ctx.params.id)
  const announcement = id ? await getAnnouncement(ctx.env.DB, id) : null
  if (!announcement) return notFound("Pengumuman tidak ditemukan.")

  const body = await readJsonObject(ctx.request)
  if (!body.ok) return body.response
  const after = body.value.after
  if (typeof after !== "string" || !isValidId(after)) return validationError("Kursor pengiriman tidak valid.")

  const keys = await loadVapidKeys(ctx.env)
  if (!keys) return errorResponse(503, "PUSH_NOT_CONFIGURED", "Notifikasi belum diaktifkan di server.")

  const delivery = await deliverBatch(ctx.env.DB, keys, announcement, after, clock.now())
  logEvent("info", "announcement_sent", {
    actorUserId: admin.user.id,
    announcementId: announcement.id,
    sent: delivery.sent,
    failed: delivery.failed,
    removed: delivery.removed,
  })
  const payload: AnnouncementSendResponse = { announcement, delivery }
  return jsonResponse(payload)
}
