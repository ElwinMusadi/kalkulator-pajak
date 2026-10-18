import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

// Kontrak font: UI = sistem Apple lalu Plus Jakarta Sans; nominal uang dan
// nomor polisi = IBM Plex Sans; angka non-uang tetap memakai font UI.
const css = readFileSync(new URL("../src/index.css", import.meta.url), "utf8")
const read = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8")

function declaration(name: string): string {
  const match = css.match(new RegExp(`${name}:\\s*([^;]+);`))
  assert.ok(match, `${name} tidak ditemukan`)
  return match[1].trim()
}

function rule(selector: string): { index: number; body: string } {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const match = new RegExp(`(^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(css)
  assert.ok(match, `aturan ${selector} tidak ditemukan`)
  return { index: match.index, body: match[2] }
}

// UI: alias Apple sebelum Plus Jakarta Sans; tanpa system-ui/Segoe/Roboto di depannya.
const sans = declaration("--font-sans").split(",").map((f) => f.trim())
assert.deepEqual(sans.slice(0, 3), ["-apple-system", "BlinkMacSystemFont", '"Plus Jakarta Sans"'])
assert.ok(!sans.includes("system-ui"), "system-ui akan memilih Segoe UI/Roboto sebelum Plus Jakarta Sans")

// Uang & plat: IBM Plex Sans di urutan pertama.
assert.match(declaration("--font-money"), /^"IBM Plex Sans",/)
assert.equal(declaration("--font-plate"), "var(--font-money)")

// Font web: Plex + Jakarta dimuat, Saira tidak lagi dipakai.
assert.match(css, /fonts\.googleapis\.com\/css2\?family=IBM\+Plex\+Sans:wght@400;500;600;700&family=Plus\+Jakarta\+Sans/)
assert.doesNotMatch(css, /Saira/)

// .monetary menang atas .numeric: lapisan sama (tanpa @layer), dideklarasikan sesudahnya.
const numeric = rule(".numeric")
const monetary = rule(".monetary")
assert.match(numeric.body, /font-family:\s*var\(--font-sans\)/)
assert.match(monetary.body, /font-family:\s*var\(--font-money\)/)
assert.ok(monetary.index > numeric.index, ".monetary harus setelah .numeric")
assert.doesNotMatch(css.slice(0, monetary.index), /@layer[^{]*\{[^}]*\.monetary/)

// Strip tanggal plat memakai font UI; input plat memakai font plat.
assert.doesNotMatch(rule(".tnkb-strip").body, /font-family/)
assert.match(rule(".tnkb-plate input").body, /font-family:\s*var\(--font-plate\)/)

// Total bayar dan rincian memakai .monetary, bukan font plat.
for (const file of ["components/result-summary.tsx", "components/mobile-result-bar.tsx"]) {
  const src = read(file)
  assert.match(src, /animate-value-settle monetary/, `${file}: total harus .monetary`)
  assert.doesNotMatch(src, /font-plate/, `${file}: total tidak boleh memakai font plat`)
}
assert.equal(read("components/result-breakdown.tsx").match(/"monetary |"monetary\b|monetary block/g)?.length, 2)

// Plat mini hanya label warna → font UI.
assert.doesNotMatch(read("components/plate-color-radio-group.tsx"), /font-plate/)

console.log("typography: OK")
