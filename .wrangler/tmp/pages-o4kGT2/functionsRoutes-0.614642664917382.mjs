import { onRequestGet as __api_njkb__nopol__ts_onRequestGet } from "D:\\Herd\\kalkulator-pajak\\functions\\api\\njkb\\[nopol].ts"
import { onRequestOptions as __api_njkb__nopol__ts_onRequestOptions } from "D:\\Herd\\kalkulator-pajak\\functions\\api\\njkb\\[nopol].ts"

export const routes = [
    {
      routePath: "/api/njkb/:nopol",
      mountPath: "/api/njkb",
      method: "GET",
      middlewares: [],
      modules: [__api_njkb__nopol__ts_onRequestGet],
    },
  {
      routePath: "/api/njkb/:nopol",
      mountPath: "/api/njkb",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_njkb__nopol__ts_onRequestOptions],
    },
  ]