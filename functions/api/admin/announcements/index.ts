/**
 * POST /api/admin/announcements — CreateAnnouncementRequest → 201 AnnouncementSendResponse
 *
 * Admin menyimpan pengumuman dan mengirim gelombang push pertama. Bila
 * `delivery.nextAfter` tidak null, lanjutkan lewat POST …/[id]/send.
 * Tanpa kunci VAPID pengumuman tetap tersimpan (tampil di aplikasi).
 */

import { requireAdmin } from "../../../../server/auth/admin-route.ts"
import { clock, toIso } from "../../../../server/clock.ts"
import { jsonResponse, logEvent, readJsonObject, validationError } from "../../../../server/http.ts"
import {
  createAnnouncement,
  deliverBatch,
  loadVapidKeys,
  parseAnnouncementInput,
} from "../../../../server/push/store.ts"
import type { AppFunction } from "../../../../server/types.ts"
import type { AnnouncementSendResponse } from "../../../../src/types/push.ts"

export const onRequestPost: AppFunction = async (ctx) => {
  const admin = requireAdmin(ctx.data.auth)
  if (admin instanceof Response) return admin

  const body = await readJsonObject(ctx.request)
  if (!body.ok) return body.response
  const input = parseAnnouncementInput(body.value)
  if (!input.ok) return validationError(input.message)

  const now = clock.now()
  const announcement = await createAnnouncement(ctx.env.DB, admin, input.value, toIso(now))
  const keys = await loadVapidKeys(ctx.env)
  const delivery = keys
    ? await deliverBatch(ctx.env.DB, keys, announcement, "", now)
    : { sent: 0, failed: 0, removed: 0, nextAfter: null }

  logEvent("info", "announcement_created", {
    actorUserId: admin.user.id,
    announcementId: announcement.id,
    sent: delivery.sent,
    failed: delivery.failed,
    removed: delivery.removed,
  })
  const payload: AnnouncementSendResponse = { announcement, delivery }
  return jsonResponse(payload, 201)
}
