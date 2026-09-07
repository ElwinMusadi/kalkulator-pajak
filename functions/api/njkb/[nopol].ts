/**
 * functions/api/njkb/[nopol].ts
 *
 * Cloudflare Pages Function — GET /api/njkb/:nopol
 *
 * Respons sukses (200):
 * {
 *   "nopol": "DH2506KA",
 *   "nama": "MARTINA GRACEANA ANGKAT",
 *   "jenis": "SEPEDA MOTOR",
 *   "jatuhTempoStnk": "2023-09-13",
 *   "jatuhTempoPajak": "2023-09-13",
 *   "njkb": 11500000,
 *   "njub": 0,
 *   "bobot": 1
 * }
 *
 * Respons tidak ditemukan (404):
 * { "message": "Data NJKB untuk Nopol tersebut tidak ditemukan." }
 *
 * Respons error validasi (400):
 * { "message": "Nopol tidak valid." }
 */

interface Env {
  DB: D1Database
}

interface VehicleRow {
  nopol: string
  nama: string | null
  jenis: string | null
  jatuh_tempo_stnk: string | null
  jatuh_tempo_pajak: string | null
  njkb: number
  njub: number
  bobot: number
}

function jsonResponse(body: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json;charset=UTF-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": status === 200 ? "public, max-age=300" : "no-store",
    },
  })
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const rawNopol = ctx.params["nopol"]
  const nopolParam = Array.isArray(rawNopol) ? rawNopol[0] : rawNopol ?? ""

  // Normalisasi: uppercase, hapus spasi dan karakter non-alfanumerik
  const nopol = nopolParam.toUpperCase().replace(/\s+/g, "").replace(/[^A-Z0-9]/g, "")

  if (!nopol || nopol.length < 4 || nopol.length > 12) {
    return jsonResponse({ message: "Nopol tidak valid." }, 400)
  }

  try {
    const result = await ctx.env.DB.prepare(
      `SELECT nopol, nama, jenis, jatuh_tempo_stnk, jatuh_tempo_pajak, njkb, njub, bobot
       FROM vehicle_njkb
       WHERE nopol = ?
       LIMIT 1`
    )
      .bind(nopol)
      .first<VehicleRow>()

    if (!result) {
      return jsonResponse(
        { message: "Data NJKB untuk Nopol tersebut tidak ditemukan." },
        404
      )
    }

    return jsonResponse({
      nopol: result.nopol,
      nama: result.nama,
      jenis: result.jenis,
      jatuhTempoStnk: result.jatuh_tempo_stnk,
      jatuhTempoPajak: result.jatuh_tempo_pajak,
      njkb: result.njkb,
      njub: result.njub,
      bobot: result.bobot,
    })
  } catch (err) {
    console.error("[/api/njkb] D1 error:", err)
    return jsonResponse({ message: "Terjadi kesalahan server. Coba lagi." }, 500)
  }
}

// Handle OPTIONS untuk CORS preflight
export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  })
}
