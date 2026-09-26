/**
 * Normalisasi format nomor polisi kendaraan:
 * Mengubah menjadi huruf kapital, menghapus seluruh spasi dan karakter non-alfanumerik.
 */
export function normalizeNopol(rawNopol: unknown): string {
  return String(rawNopol ?? "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9]/g, "")
}

/**
 * Normalisasi tanggal kontrak API resmi ke format ISO YYYY-MM-DD atau null.
 * Kontrak resmi menggunakan YYYY-MM-DD; dukungan DD/MM/YYYY dipertahankan defensif.
 */
export function parseApiDate(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === "") return null

  const value = String(raw).trim()
  if (!value || value === "-" || value.startsWith("0000-00-00")) return null

  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) {
    const [, year, month, day] = isoMatch
    const numericYear = Number(year)
    return numericYear >= 1900 && numericYear <= 2100
      ? `${year}-${month}-${day}`
      : null
  }

  const localMatch = value.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/)
  if (localMatch) {
    const [, day, month, year] = localMatch
    const numericYear = Number(year)
    return numericYear >= 1900 && numericYear <= 2100
      ? `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`
      : null
  }

  return null
}
