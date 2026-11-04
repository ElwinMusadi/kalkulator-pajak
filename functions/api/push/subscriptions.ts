/**
 * POST   /api/push/subscriptions — PushSubscriptionRequest → 204
 * DELETE /api/push/subscriptions — PushUnsubscribeRequest → 204
 *
 * Langganan notifikasi perangkat milik user yang sedang masuk. Endpoint harus
 * milik push service peramban yang dikenal (lihat isAllowedPushEndpoint).
 */

import { clock, toIso } from "../../../server/clock.ts"
import {
  errorResponse,
  logEvent,
  noContent,
  readJsonObject,
  unauthenticated,
  validationError,
} from "../../../server/http.ts"
import {
  deleteOwnSubscription,
  isAllowedPushEndpoint,
  loadVapidKeys,
  parseSubscriptionInput,
  upsertSubscription,
} from "../../../server/push/store.ts"
import type { AppFunction } from "../../../server/types.ts"

export const onRequestPost: AppFunction = async (ctx) => {
  const auth = ctx.data.auth
  if (!auth) return unauthenticated()
  if (!(await loadVapidKeys(ctx.env))) {
    return errorResponse(503, "PUSH_NOT_CONFIGURED", "Notifikasi belum diaktifkan di server.")
  }

  const body = await readJsonObject(ctx.request)
  if (!body.ok) return body.response
  const input = parseSubscriptionInput(body.value)
  if (!input.ok) return validationError(input.message)

  await upsertSubscription(ctx.env.DB, auth, input.value, ctx.request.headers.get("User-Agent"), toIso(clock.now()))
  logEvent("info", "push_subscribed", { userId: auth.user.id })
  return noContent()
}

export const onRequestDelete: AppFunction = async (ctx) => {
  const auth = ctx.data.auth
  if (!auth) return unauthenticated()

  const body = await readJsonObject(ctx.request)
  if (!body.ok) return body.response
  if (!isAllowedPushEndpoint(body.value.endpoint)) {
    return validationError("Alamat notifikasi perangkat tidak dikenali.")
  }

  await deleteOwnSubscription(ctx.env.DB, auth, body.value.endpoint)
  logEvent("info", "push_unsubscribed", { userId: auth.user.id })
  return noContent()
}
