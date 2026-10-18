import assert from "node:assert/strict"
import {
  createPwaUpdateController,
  type PwaUpdateRegistration,
} from "../src/lib/pwa-update.ts"

function pass(name: string) {
  console.log(`  ✓  ${name}`)
}

interface FakeOptions {
  controlled: boolean
  online?: boolean
}

/** Lingkungan palsu: controller SW, status online, jam, timer, dan penghitung reload. */
function setup({ controlled, online = true }: FakeOptions) {
  const state = { controlled, online, now: 1_000_000, reloads: 0 }
  const timers: Array<() => void> = []
  const store = createPwaUpdateController(
    {
      hasController: () => state.controlled,
      isOnline: () => state.online,
      reload: () => {
        state.reloads += 1
      },
      now: () => state.now,
      setTimeout: (callback) => {
        timers.push(callback)
        return timers.length
      },
    },
    { checkThrottleMs: 30_000, takeoverTimeoutMs: 3_000 },
  )
  let notifications = 0
  store.subscribe(() => {
    notifications += 1
  })
  return { state, store, timers, notifications: () => notifications }
}

function fakeRegistration(
  update: () => Promise<unknown> = async () => undefined,
): PwaUpdateRegistration & { waiting: { postMessage(message: unknown): void; messages: unknown[] } | null; updates: number } {
  const reg = {
    waiting: null as { postMessage(message: unknown): void; messages: unknown[] } | null,
    updates: 0,
    update() {
      reg.updates += 1
      return update()
    },
  }
  return reg
}

function fakeWaiting() {
  const messages: unknown[] = []
  return { messages, postMessage: (message: unknown) => void messages.push(message) }
}

console.log("Menjalankan PWA update tests...\n")

// 1. Instalasi pertama: belum ada controller → klaim pertama bukan pembaruan.
{
  const { state, store, notifications } = setup({ controlled: false })
  store.setRegistration(fakeRegistration())
  state.controlled = true
  store.handleControllerChange()
  // onNeedReload tidak dipanggil workbox untuk instalasi pertama; bila tetap
  // terpanggil (isExternal) halaman tanpa controller awal tidak boleh diberi prompt.
  store.handleNeedReload()
  assert.equal(store.getSnapshot().status, "idle")
  assert.equal(notifications(), 0)
  assert.equal(state.reloads, 0)

  // Deploy berikutnya pada halaman yang sama (kini dikendalikan) = pembaruan nyata.
  store.handleControllerChange()
  assert.equal(store.getSnapshot().status, "available")
  pass("Instalasi pertama tidak memunculkan pemberitahuan; worker berikutnya memunculkan")
}

// 2. Pembaruan: worker baru mengambil alih → tersedia, tanpa reload otomatis.
{
  const { state, store, notifications } = setup({ controlled: true })
  store.setRegistration(fakeRegistration())
  store.handleNeedReload()
  store.handleControllerChange()
  store.handleNeedReload()
  store.handleControllerChange()
  assert.equal(store.getSnapshot().status, "available")
  assert.equal(notifications(), 1, "event duplikat tidak memicu notifikasi ulang")
  assert.equal(state.reloads, 0, "tidak ada reload paksa")

  // Tetap tersedia (persisten) sampai pengguna menekan Perbarui.
  for (let i = 0; i < 5; i++) state.now += 60 * 60 * 1000
  assert.equal(store.getSnapshot().status, "available")

  await store.applyUpdate()
  assert.equal(store.getSnapshot().status, "applying")
  assert.equal(state.reloads, 1)
  await store.applyUpdate()
  store.handleControllerChange()
  store.handleNeedReload()
  assert.equal(state.reloads, 1, "reload hanya sekali, tanpa loop")
  assert.equal(store.getSnapshot().status, "applying")
  pass("Worker baru → Versi Baru Tersedia persisten; Perbarui reload tepat sekali")
}

// 3. applyUpdate tanpa pembaruan tidak melakukan apa-apa.
{
  const { state, store } = setup({ controlled: true })
  await store.applyUpdate()
  assert.equal(state.reloads, 0)
  assert.equal(store.getSnapshot().status, "idle")
  pass("Perbarui tanpa versi baru diabaikan")
}

// 4. Fallback worker `waiting`: tandai tersedia, SKIP_WAITING lalu reload sekali.
{
  const { state, store, timers } = setup({ controlled: true })
  const reg = fakeRegistration()
  const waiting = fakeWaiting()
  reg.waiting = waiting
  store.setRegistration(reg)
  assert.equal(store.getSnapshot().status, "available")

  const applying = store.applyUpdate()
  assert.deepEqual(waiting.messages, [{ type: "SKIP_WAITING" }])
  assert.equal(state.reloads, 0, "menunggu worker mengambil alih dulu")
  store.handleControllerChange()
  await applying
  assert.equal(state.reloads, 1)
  timers.forEach((fire) => fire())
  assert.equal(state.reloads, 1, "timer cadangan tidak menambah reload")
  pass("Worker waiting ditandai tersedia; reload setelah mengambil alih")
}

// 5. Worker waiting yang tidak pernah mengambil alih: timeout → tetap reload sekali.
{
  const { state, store, timers } = setup({ controlled: true })
  const reg = fakeRegistration()
  reg.waiting = fakeWaiting()
  store.setRegistration(reg)
  const applying = store.applyUpdate()
  timers.forEach((fire) => fire())
  await applying
  assert.equal(state.reloads, 1)
  pass("Worker waiting macet: reload tetap terjadi sekali setelah batas waktu")
}

// 6. Instalasi pertama dengan worker waiting tanpa controller → bukan pembaruan.
{
  const { store } = setup({ controlled: false })
  const reg = fakeRegistration()
  reg.waiting = fakeWaiting()
  store.setRegistration(reg)
  assert.equal(store.getSnapshot().status, "idle")
  pass("Worker waiting tanpa controller (instalasi pertama) tidak memunculkan prompt")
}

// 7. Pemeriksaan: offline, error, throttle, paralel.
{
  const { state, store } = setup({ controlled: true, online: false })
  let fail = true
  let resolveUpdate: (() => void) | null = null
  const reg = fakeRegistration(() => {
    if (fail) return Promise.reject(new Error("network"))
    return new Promise<void>((resolve) => {
      resolveUpdate = resolve
    })
  })

  assert.equal(await store.checkForUpdate(), false, "tanpa registrasi")
  store.setRegistration(reg)
  assert.equal(await store.checkForUpdate(), false)
  assert.equal(reg.updates, 0, "offline: update() tidak dipanggil")

  state.online = true
  assert.equal(await store.checkForUpdate(), false, "error ditangkap")
  assert.equal(reg.updates, 1)
  assert.equal(store.getSnapshot().status, "idle", "error bukan pembaruan")

  state.now += 10_000
  assert.equal(await store.checkForUpdate(), false, "di-throttle")
  assert.equal(reg.updates, 1)

  fail = false
  state.now += 30_000
  const first = store.checkForUpdate()
  const second = store.checkForUpdate({ force: true })
  assert.equal(await second, false, "pemeriksaan paralel ditolak")
  assert.equal(reg.updates, 2)
  resolveUpdate!()
  assert.equal(await first, true)
  assert.equal(store.getSnapshot().status, "idle", "update() tanpa worker baru tetap idle")

  const forced = store.checkForUpdate({ force: true })
  resolveUpdate!()
  assert.equal(await forced, true, "force melewati throttle")
  assert.equal(reg.updates, 3)
  pass("Offline, error, throttle, dan pemeriksaan paralel tidak menghasilkan positif palsu")
}

// 7b. update() yang menggantung: batas waktu melepas kunci pemeriksaan.
{
  const { state, store, timers } = setup({ controlled: true })
  const reg = fakeRegistration(() => new Promise<never>(() => undefined))
  store.setRegistration(reg)
  const hanging = store.checkForUpdate()
  assert.equal(await store.checkForUpdate({ force: true }), false, "masih berjalan")
  timers.splice(0).forEach((fire) => fire())
  assert.equal(await hanging, false, "timeout dianggap gagal")
  assert.equal(store.getSnapshot().status, "idle")
  state.now += 30_000
  void store.checkForUpdate()
  assert.equal(reg.updates, 2, "pemeriksaan berikutnya tidak terkunci")
  pass("update() menggantung dibatasi waktu tanpa positif palsu")
}

// 8. Setelah tersedia tidak perlu memeriksa lagi.
{
  const { store } = setup({ controlled: true })
  const reg = fakeRegistration()
  store.setRegistration(reg)
  store.handleControllerChange()
  assert.equal(await store.checkForUpdate({ force: true }), false)
  assert.equal(reg.updates, 0)
  pass("Tidak ada pemeriksaan tambahan setelah versi baru tersedia")
}

// 9. Listener yang berlangganan belakangan (React render setelah event) melihat status.
{
  const { store } = setup({ controlled: true })
  store.handleControllerChange()
  let lateCalls = 0
  const unsubscribe = store.subscribe(() => {
    lateCalls += 1
  })
  assert.equal(store.getSnapshot().status, "available")
  const before = store.getSnapshot()
  assert.equal(store.getSnapshot(), before, "snapshot stabil (useSyncExternalStore)")
  void store.applyUpdate()
  assert.equal(lateCalls, 1)
  unsubscribe()
  pass("Listener yang terlambat melihat status tersedia; snapshot stabil")
}

console.log("\nSemua PWA update tests: PASS ✓\n")
