/**
 * GET /api/push/config — PushConfigResponse
 *
 * Kunci publik VAPID untuk PushManager.subscribe. `enabled: false` bila kunci
 * belum dipasang/valid di server; aplikasi lalu tidak menawarkan notifikasi.
 */

import { loadVapidKeys } from "../../../server/push/store.ts"
import { jsonResponse } from "../../../server/http.ts"
import type { AppFunction } from "../../../server/types.ts"
import type { PushConfigResponse } from "../../../src/types/push.ts"

export const onRequestGet: AppFunction = async (ctx) => {
  const keys = await loadVapidKeys(ctx.env)
  const payload: PushConfigResponse = { enabled: keys !== null, publicKey: keys?.publicKey ?? null }
  return jsonResponse(payload)
}
