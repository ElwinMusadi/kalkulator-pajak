/**
 * GET /api/announcements — AnnouncementsResponse
 *
 * Riwayat pengumuman terbaru untuk semua user yang masuk, termasuk perangkat
 * yang tidak menerima notifikasi push.
 */

import { jsonResponse, unauthenticated } from "../../../server/http.ts"
import { listAnnouncements } from "../../../server/push/store.ts"
import type { AppFunction } from "../../../server/types.ts"
import type { AnnouncementsResponse } from "../../../src/types/push.ts"

export const onRequestGet: AppFunction = async (ctx) => {
  if (!ctx.data.auth) return unauthenticated()
  const payload: AnnouncementsResponse = { announcements: await listAnnouncements(ctx.env.DB) }
  return jsonResponse(payload)
}
