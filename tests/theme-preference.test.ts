import assert from "node:assert/strict"
import {
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  applyTheme,
  createThemeStore,
  resolveTheme,
  type ThemeEnvironment,
  type ThemeStorageEventLike,
  type ThemeStorageLike,
} from "../src/lib/theme.ts"

function pass(name: string) {
  console.log(`  ✓  ${name}`)
}

console.log("Menjalankan theme preference tests...\n")

// ── DOM/storage tiruan ────────────────────────────────────────────────────────
class FakeRoot {
  classes = new Set<string>()
  style = { colorScheme: "" }
  classList = {
    toggle: (token: string, force?: boolean) => {
      const on = force ?? !this.classes.has(token)
      if (on) this.classes.add(token)
      else this.classes.delete(token)
      return on
    },
  }
}

class FakeStorage implements ThemeStorageLike {
  map = new Map<string, string>()
  failGet = false
  failSet = false
  getItem(key: string) {
    if (this.failGet) throw new Error("SecurityError")
    return this.map.get(key) ?? null
  }
  setItem(key: string, value: string) {
    if (this.failSet) throw new Error("QuotaExceededError")
    this.map.set(key, value)
  }
}

type Listener = (event: ThemeStorageEventLike) => void
class FakeWindow {
  listeners: Listener[] = []
  addEventListener(_type: "storage", listener: Listener) {
    this.listeners.push(listener)
  }
  removeEventListener(_type: "storage", listener: Listener) {
    this.listeners = this.listeners.filter((l) => l !== listener)
  }
  dispatch(event: ThemeStorageEventLike) {
    this.listeners.forEach((l) => l(event))
  }
}

/**
 * OS gelap disimulasikan: matchMedia selalu melaporkan dark. Store tidak boleh
 * memanggilnya; bila dipanggil, hitungannya akan > 0.
 */
let matchMediaCalls = 0
const osDarkMatchMedia = (query: string) => {
  matchMediaCalls++
  return { matches: query.includes("dark") }
}
;(globalThis as { matchMedia?: unknown }).matchMedia = osDarkMatchMedia

function setup(storage: FakeStorage | null = new FakeStorage(), getStorageThrows = false) {
  const root = new FakeRoot()
  const win = new FakeWindow()
  const env: ThemeEnvironment = {
    getStorage: () => {
      if (getStorageThrows) throw new Error("SecurityError: localStorage denied")
      return storage
    },
    root,
    events: win,
  }
  return { root, win, storage, store: createThemeStore(env) }
}

function assertRoot(root: FakeRoot, theme: "light" | "dark") {
  assert.equal(root.classes.has("dark"), theme === "dark", `.dark should be ${theme === "dark"}`)
  assert.equal(root.classes.has("light"), theme === "light", `.light should be ${theme === "light"}`)
  assert.equal(root.style.colorScheme, theme)
}

// ── 1. Default Terang meskipun OS gelap ───────────────────────────────────────
{
  assert.equal(DEFAULT_THEME, "light")
  assert.equal(THEME_STORAGE_KEY, "kalkulator-pajak.theme")
  const { root, store } = setup()
  assert.equal(store.init(), "light")
  assertRoot(root, "light")
  assert.equal(matchMediaCalls, 0, "store must not consult prefers-color-scheme")
  pass("Kunjungan pertama dengan OS gelap tetap Terang (.light + color-scheme light), matchMedia tidak dipakai")
}

// ── 2. Nilai valid/tidak valid ───────────────────────────────────────────────
{
  assert.equal(resolveTheme("dark"), "dark")
  for (const value of ["light", "DARK", " dark", "system", "", null, undefined, 1, true, {}]) {
    assert.equal(resolveTheme(value), "light", `resolveTheme(${JSON.stringify(value)})`)
  }
  for (const [stored, expected] of [
    ["dark", "dark"],
    ["light", "light"],
    ["Dark", "light"],
    ["auto", "light"],
    ['"dark"', "light"],
  ] as const) {
    const storage = new FakeStorage()
    storage.map.set(THEME_STORAGE_KEY, stored)
    const { root, store } = setup(storage)
    assert.equal(store.init(), expected, `stored ${stored}`)
    assertRoot(root, expected)
  }
  pass("Hanya nilai tersimpan \"dark\" yang memilih Gelap; nilai lain/rusak = Terang")
}

// ── 3. Exception storage ditangani; fallback memori per tab ──────────────────
{
  const throwing = new FakeStorage()
  throwing.failGet = true
  throwing.failSet = true
  const a = setup(throwing)
  assert.equal(a.store.init(), "light")
  assert.doesNotThrow(() => a.store.setTheme("dark"))
  assert.equal(a.store.getTheme(), "dark")
  assertRoot(a.root, "dark")

  const b = setup(null, true) // akses localStorage melempar SecurityError
  assert.equal(b.store.init(), "light")
  assert.doesNotThrow(() => b.store.setTheme("dark"))
  assertRoot(b.root, "dark")

  const c = setup(null) // storage tidak tersedia
  assert.equal(c.store.init(), "light")
  c.store.setTheme("dark")
  assert.equal(c.store.getTheme(), "dark")
  pass("getItem/setItem/akses localStorage yang melempar tidak error; state tetap berlaku di tab")
}

// ── 4. Switch memperbarui root, storage, dan subscriber ──────────────────────
{
  const { root, storage, store } = setup()
  store.init()
  let notified = 0
  const unsubscribe = store.subscribe(() => notified++)
  store.setTheme("dark")
  assertRoot(root, "dark")
  assert.equal(storage!.map.get(THEME_STORAGE_KEY), "dark")
  assert.equal(notified, 1)
  store.setTheme("dark") // tidak berubah → tidak notifikasi
  assert.equal(notified, 1)
  store.setTheme("light")
  assertRoot(root, "light")
  assert.equal(storage!.map.get(THEME_STORAGE_KEY), "light")
  assert.equal(notified, 2)
  unsubscribe()
  store.setTheme("dark")
  assert.equal(notified, 2)
  pass("setTheme menerapkan .light/.dark + color-scheme, menyimpan ke localStorage, memberi tahu subscriber")
}

// ── 5. Reload memakai nilai tersimpan; matikan = Terang persisten ────────────
{
  const storage = new FakeStorage()
  const first = setup(storage)
  first.store.init()
  first.store.setTheme("dark")
  const reload1 = setup(storage)
  assert.equal(reload1.store.init(), "dark")
  assertRoot(reload1.root, "dark")
  reload1.store.setTheme("light")
  const reload2 = setup(storage)
  assert.equal(reload2.store.init(), "light")
  assertRoot(reload2.root, "light")
  pass("Gelap bertahan setelah reload; dimatikan → Terang bertahan setelah reload")
}

// ── 6. Sinkronisasi antar-tab & clear ────────────────────────────────────────
{
  const { root, win, storage, store } = setup()
  store.init()
  let notified = 0
  store.subscribe(() => notified++)
  win.dispatch({ key: THEME_STORAGE_KEY, newValue: "dark", storageArea: storage })
  assertRoot(root, "dark")
  assert.equal(notified, 1)
  win.dispatch({ key: "other-key", newValue: "light", storageArea: storage })
  assertRoot(root, "dark")
  win.dispatch({ key: THEME_STORAGE_KEY, newValue: "dark", storageArea: {} }) // sessionStorage dsb.
  win.dispatch({ key: null, newValue: null, storageArea: storage }) // localStorage.clear()
  assertRoot(root, "light")
  assert.equal(notified, 2)
  win.dispatch({ key: THEME_STORAGE_KEY, newValue: "dark", storageArea: storage })
  win.dispatch({ key: THEME_STORAGE_KEY, newValue: null, storageArea: storage }) // removeItem
  assertRoot(root, "light")
  win.dispatch({ key: THEME_STORAGE_KEY, newValue: "garbage", storageArea: storage })
  assert.equal(store.getTheme(), "light")
  pass("Event storage tab lain diterapkan; clear/removeItem/nilai rusak → Terang; key lain diabaikan")
}

// ── 7. Inisialisasi berulang tidak menggandakan listener ─────────────────────
{
  const { win, store, storage } = setup()
  store.init()
  store.init()
  store.init()
  assert.equal(win.listeners.length, 1)
  let notified = 0
  store.subscribe(() => notified++)
  win.dispatch({ key: THEME_STORAGE_KEY, newValue: "dark", storageArea: storage })
  assert.equal(notified, 1)
  store.dispose()
  assert.equal(win.listeners.length, 0)
  pass("init() idempoten: satu listener storage; dispose melepasnya")
}

// ── 8. applyTheme aman tanpa root ────────────────────────────────────────────
{
  assert.doesNotThrow(() => applyTheme(null, "dark"))
  const root = new FakeRoot()
  root.classes.add("dark")
  applyTheme(root, "light")
  assertRoot(root, "light")
  pass("applyTheme aman tanpa document dan selalu eksplisit .light/.dark")
}

assert.equal(matchMediaCalls, 0)
console.log("\nSemua theme preference tests: PASS ✓\n")
