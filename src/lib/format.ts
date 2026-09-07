/**
 * src/lib/format.ts — Utilitas formatting tampilan
 */

/** Format angka ke format Rupiah Indonesia */
export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Math.round(amount))
}

/** Format Date ke "dd/MM/yyyy" */
export function formatDateDisplay(date: Date): string {
  const d = String(date.getDate()).padStart(2, "0")
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const y = date.getFullYear()
  return `${d}/${m}/${y}`
}

/** Format string ISO "YYYY-MM-DD" ke "dd/MM/yyyy" */
export function formatIsoToDisplay(iso: string | null | undefined): string {
  if (!iso) return ""
  const [y, m, d] = iso.split("-")
  if (!y || !m || !d) return iso
  return `${d}/${m}/${y}`
}
