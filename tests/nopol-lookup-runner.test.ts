import assert from "node:assert/strict"
import type { VehicleData, VehicleDataSourceMode } from "../src/types/tax.ts"
import {
  ApiError,
  createClientTimeoutError,
  createNetworkError,
} from "../src/lib/http.ts"
import {
  createNopolLookupRunner,
  formatLookupErrorReference,
  IDLE_NOPOL_LOOKUP_STATE,
  isLookupableNopol,
  NOPOL_LOOKUP_DELAY_MS,
  NOPOL_MAX_LENGTH,
  NOPOL_MIN_LENGTH,
  NOPOL_OFFLINE_MESSAGE,
  normalizeNopol,
  type NopolLookupState,
} from "../src/lib/nopol-lookup-runner.ts"

function pass(name: string) {
  console.log(`  ✓  ${name}`)
}

console.log("Menjalankan nopol lookup runner tests...\n")

function createDeterministicClock(start = 1_000_000) {
  let currentTime = start
  let timerSeq = 0
  const timers = new Map<number, { id: number; due: number; cb: () => void }>()

  return {
    now: () => currentTime,
    setTimer: (cb: () => void, ms: number) => {
      const id = ++timerSeq
      timers.set(id, { id, due: currentTime + ms, cb })
      return id
    },
    clearTimer: (id: unknown) => {
      timers.delete(id as number)
    },
    advance: async (ms: number) => {
      currentTime += ms
      const expired = Array.from(timers.values())
        .filter((t) => t.due <= currentTime)
        .sort((a, b) => a.due - b.due)
      for (const t of expired) {
        if (timers.has(t.id)) {
          timers.delete(t.id)
          t.cb()
        }
      }
      for (let i = 0; i < 5; i++) {
        await Promise.resolve()
      }
    },
    get pendingCount() {
      return timers.size
    },
  }
}

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

// 1. Normalisasi Nopol dan validasi panjang batas
{
  assert.equal(normalizeNopol("dh 1234 ab"), "DH1234AB")
  assert.equal(normalizeNopol("eb-5678-xy!"), "EB5678XY")
  assert.equal(normalizeNopol("  b  1  cd  "), "B1CD")
  assert.equal(normalizeNopol(""), "")

  assert.equal(NOPOL_MIN_LENGTH, 4)
  assert.equal(NOPOL_MAX_LENGTH, 12)

  assert.equal(isLookupableNopol("DH1"), false)
  assert.equal(isLookupableNopol("DH12"), true)
  assert.equal(isLookupableNopol("DH1234AB"), true)
  assert.equal(isLookupableNopol("DH1234567890"), true) // 12 karakter
  assert.equal(isLookupableNopol("DH12345678901"), false) // 13 karakter
  pass("Normalisasi nopol dan validasi batas 4..12 karakter")
}

// 2. formatLookupErrorReference sanitasi dan privasi
{
  // 403 tidak memuat reference teknis
  const err403 = new ApiError("Akses ditolak", 403)
  assert.equal(formatLookupErrorReference(err403), null)

  // Non-ApiError mengembalikan null
  assert.equal(formatLookupErrorReference(new Error("Unknown")), null)
  assert.equal(formatLookupErrorReference(null), null)

  // HTTP status + allowlisted code + Ray ID + attempts + elapsed
  const edgeErr = new ApiError("Gangguan gateway", 502, "NJKB_GATEWAY_TIMEOUT", {
    kind: "http",
    status: 502,
    code: "NJKB_GATEWAY_TIMEOUT",
    rayId: "1234567890abcdef-sin",
    elapsedMs: 1200,
    attempts: 2,
    edge: true,
  })
  assert.equal(
    formatLookupErrorReference(edgeErr),
    "HTTP 502 · NJKB_GATEWAY_TIMEOUT · Ray 1234567890abcdef-SIN · 2 percobaan · 1,2 dtk",
  )

  // Network error (status 0)
  const netErr = createNetworkError({ elapsedMs: 3400, attempts: 2 })
  assert.equal(
    formatLookupErrorReference(netErr),
    "Jaringan · NETWORK_ERROR · 2 percobaan · 3,4 dtk",
  )

  // Client timeout error (status 0)
  const timeoutErr = createClientTimeoutError({ elapsedMs: 25000, attempts: 1 })
  assert.equal(
    formatLookupErrorReference(timeoutErr),
    "Batas waktu · CLIENT_TIMEOUT · 25,0 dtk",
  )

  // Kode tidak aman / tidak terdaftar di allowlist diabaikan
  const unsafeCodeErr = new ApiError("Error server", 500, "DROP_TABLE_USERS", {
    kind: "http",
    status: 500,
    code: "DROP_TABLE_USERS",
    elapsedMs: 400,
    attempts: 1,
    edge: false,
  })
  assert.equal(formatLookupErrorReference(unsafeCodeErr), "HTTP 500 · 0,4 dtk")

  // Ray ID tidak valid tidak dibocorkan
  const invalidRayErr = new ApiError("Error server", 500, undefined, {
    kind: "http",
    status: 500,
    rayId: "invalid-ray-token",
    elapsedMs: 0,
    attempts: 1,
    edge: false,
  })
  assert.equal(formatLookupErrorReference(invalidRayErr), "HTTP 500")
  pass("formatLookupErrorReference menyaring kode tidak aman dan menjaga privasi")
}

// 3. Null / invalid input menghasilkan idle tanpa pemanggilan lookup
{
  let lookupCalled = false
  const runner = createNopolLookupRunner({
    lookup: async () => {
      lookupCalled = true
      return null
    },
  })

  // mode === null
  const statesModeNull: NopolLookupState[] = []
  runner.start("DH1234AB", null, false, (s) => statesModeNull.push(s))
  assert.equal(statesModeNull.length, 1)
  assert.deepEqual(statesModeNull[0], IDLE_NOPOL_LOOKUP_STATE)
  assert.equal(lookupCalled, false)

  // nopol < 4 karakter
  const statesShort: NopolLookupState[] = []
  runner.start("DH1", "api", false, (s) => statesShort.push(s))
  assert.equal(statesShort.length, 1)
  assert.deepEqual(statesShort[0], IDLE_NOPOL_LOOKUP_STATE)
  assert.equal(lookupCalled, false)

  // nopol > 12 karakter
  const statesLong: NopolLookupState[] = []
  runner.start("DH1234567890123", "api", false, (s) => statesLong.push(s))
  assert.equal(statesLong.length, 1)
  assert.deepEqual(statesLong[0], IDLE_NOPOL_LOOKUP_STATE)
  assert.equal(lookupCalled, false)
  pass("Mode null atau nopol di luar batas 4..12 karakter memancarkan idle")
}

// 4. Same plate edit restore 450ms debounce
{
  const clock = createDeterministicClock()
  const lookupCalls: Array<{ nopol: string; mode: VehicleDataSourceMode }> = []

  const runner = createNopolLookupRunner({
    ...clock,
    delayMs: NOPOL_LOOKUP_DELAY_MS,
    lookup: async (nopol, mode) => {
      lookupCalls.push({ nopol, mode })
      return { nopol, pkbPkk: 500000 } as VehicleData
    },
  })

  const emitted: NopolLookupState[] = []
  // t = 0: user ketik TEST1000
  runner.start("TEST1000", "api", false, (s) => emitted.push(s))
  assert.equal(emitted.length, 1)
  assert.equal(emitted[0].status, "loading")
  assert.equal(lookupCalls.length, 0)

  // t = 100: user hapus 1 karakter -> TEST100
  await clock.advance(100)
  runner.start("TEST100", "api", false, (s) => emitted.push(s))
  assert.equal(emitted.length, 2)
  assert.equal(emitted[1].status, "loading")
  assert.equal(lookupCalls.length, 0)

  // t = 200: user restore karakter -> TEST1000 (plat sama dalam jendela debounce)
  await clock.advance(100)
  runner.start("TEST1000", "api", false, (s) => emitted.push(s))
  assert.equal(emitted.length, 3)
  assert.equal(emitted[2].status, "loading")
  assert.equal(lookupCalls.length, 0)

  // t = 550 (350ms sejak restore): belum mencapai 450ms debounce
  await clock.advance(350)
  assert.equal(lookupCalls.length, 0)

  // t = 650 (450ms sejak restore): debounce selesai, lookup dijalankan sekali untuk TEST1000
  await clock.advance(100)
  assert.equal(lookupCalls.length, 1)
  assert.equal(lookupCalls[0].nopol, "TEST1000")
  assert.equal(lookupCalls[0].mode, "api")

  // State akhir terbarui menjadi found
  assert.equal(emitted.length, 4)
  assert.equal(emitted[3].status, "found")
  assert.equal(emitted[3].vehicleData?.nopol, "TEST1000")
  pass("Same plate edit-restore mereset timer 450ms dan tidak macet")
}

// 5. Stale success dan error diabaikan (race protection)
{
  const clock = createDeterministicClock()
  const def1 = createDeferred<VehicleData | null>()
  const def2 = createDeferred<VehicleData | null>()

  let callCount = 0
  const runner = createNopolLookupRunner({
    ...clock,
    lookup: async (nopol) => {
      callCount++
      if (nopol === "DH1111AA") return def1.promise
      if (nopol === "DH2222BB") return def2.promise
      return null
    },
  })

  const emitted: NopolLookupState[] = []
  // Siklus 1: langsung request untuk DH1111AA (lambat)
  runner.start("DH1111AA", "api", true, (s) => emitted.push(s))
  assert.equal(callCount, 1)

  // Siklus 2: langsung request untuk DH2222BB (cepat)
  runner.start("DH2222BB", "api", true, (s) => emitted.push(s))
  assert.equal(callCount, 2)

  // Siklus 2 selesai duluan
  def2.resolve({ nopol: "DH2222BB", pkbPkk: 600000 } as VehicleData)
  await clock.advance(1)

  const foundState = emitted.find((s) => s.status === "found")
  assert.ok(foundState)
  assert.equal(foundState.vehicleData?.nopol, "DH2222BB")
  const emitCountAfterSecond = emitted.length

  // Siklus 1 yang kadaluarsa baru selesai sekarang -> harus diabaikan!
  def1.resolve({ nopol: "DH1111AA", pkbPkk: 300000 } as VehicleData)
  await clock.advance(1)
  assert.equal(emitted.length, emitCountAfterSecond, "Respons sukses lama tidak memancarkan state")

  // Stale error juga diabaikan
  const def3 = createDeferred<VehicleData | null>()
  const def4 = createDeferred<VehicleData | null>()
  const errRunner = createNopolLookupRunner({
    ...clock,
    lookup: async (nopol) => {
      if (nopol === "DH3333CC") return def3.promise
      if (nopol === "DH4444DD") return def4.promise
      return null
    },
  })
  const errEmitted: NopolLookupState[] = []
  errRunner.start("DH3333CC", "api", true, (s) => errEmitted.push(s))
  errRunner.start("DH4444DD", "api", true, (s) => errEmitted.push(s))

  def4.resolve({ nopol: "DH4444DD" } as VehicleData)
  await clock.advance(1)
  const countBeforeStaleError = errEmitted.length

  def3.reject(new ApiError("Server error lama", 500))
  await clock.advance(1)
  assert.equal(errEmitted.length, countBeforeStaleError, "Error lama tidak memancarkan state")
  pass("Respons sukses dan error kadaluarsa diabaikan")
}

// 6. Immediate retry memanggil lookup secara sinkron tanpa menunggu timer
{
  let called = false
  let callMode = ""
  const runner = createNopolLookupRunner({
    lookup: async (nopol, mode) => {
      called = true
      callMode = mode
      return { nopol } as VehicleData
    },
  })

  const emitted: NopolLookupState[] = []
  // immediate = true
  runner.start("DH1234AB", "api", true, (s) => emitted.push(s))
  assert.equal(called, true, "Lookup dipanggil sinkron saat immediate=true")
  assert.equal(callMode, "api")
  assert.equal(emitted[0].status, "loading")
  pass("Immediate retry memicu lookup sinkron tanpa timer")
}

// 7. StrictMode cleanup (mount/unmount/mount) dan pembatalan scoped
{
  const clock = createDeterministicClock()
  let lookupCalls = 0

  const runner = createNopolLookupRunner({
    ...clock,
    lookup: async (nopol) => {
      lookupCalls++
      return { nopol } as VehicleData
    },
  })

  // Simulasi unmount cepat React 18/19 StrictMode
  const cancel1 = runner.start("DH1234AB", "api", false, () => undefined)
  cancel1() // Langsung di-unmount

  // Waktu berlalu melampaui jeda debounce
  await clock.advance(NOPOL_LOOKUP_DELAY_MS + 50)
  assert.equal(lookupCalls, 0, "Siklus pertama yang dibatalkan tidak memanggil lookup")

  // Mount kedua berjalan normal
  const emittedMount2: NopolLookupState[] = []
  runner.start("DH1234AB", "api", false, (s) => emittedMount2.push(s))
  await clock.advance(NOPOL_LOOKUP_DELAY_MS)
  assert.equal(lookupCalls, 1, "Mount kedua berhasil mengeksekusi lookup")

  // Pembatalan scoped: pemanggilan cancel lama tidak membatalkan siklus baru
  const cancelA = runner.start("DH1111AA", "api", false, () => undefined)
  runner.start("DH2222BB", "api", false, () => undefined)
  cancelA() // cancelA sudah usang (bukan generasi aktif)
  await clock.advance(NOPOL_LOOKUP_DELAY_MS)
  assert.equal(lookupCalls, 2, "cancel usang tidak membatalkan siklus yang sedang berjalan")

  // runner.cancel() membatalkan siklus aktif
  runner.start("DH3333CC", "api", false, () => undefined)
  runner.cancel()
  await clock.advance(NOPOL_LOOKUP_DELAY_MS)
  assert.equal(lookupCalls, 2, "runner.cancel() membatalkan timer aktif")
  pass("StrictMode unmount/remount dan pembatalan scoped ditangani aman")
}

// 8. Objek data hasil lookup selalu memiliki identitas baru (shallow copy)
{
  const sourceData: VehicleData = {
    nopol: "DH1234AB",
    pkbPkk: 500000,
    source: "api",
  } as VehicleData

  const runner = createNopolLookupRunner({
    lookup: async () => sourceData,
  })

  let resultState1: NopolLookupState | undefined
  runner.start("DH1234AB", "api", true, (s) => {
    if (s.status === "found") resultState1 = s
  })
  await Promise.resolve()

  assert.ok(resultState1?.vehicleData)
  assert.notEqual(resultState1.vehicleData, sourceData, "vehicleData bukan referensi objek yang sama")
  assert.deepEqual(resultState1.vehicleData, sourceData, "vehicleData memuat properti yang identik")

  // Lookup kedua untuk plat yang sama menghasilkan referensi baru lagi
  let resultState2: NopolLookupState | undefined
  runner.start("DH1234AB", "api", true, (s) => {
    if (s.status === "found") resultState2 = s
  })
  await Promise.resolve()

  assert.ok(resultState2?.vehicleData)
  assert.notEqual(resultState1.vehicleData, resultState2.vehicleData, "Dua hasil lookup menghasilkan identitas objek berbeda")
  pass("Objek vehicleData hasil lookup selalu berupa salinan baru (new object identity)")
}

// 9. Error handling: offline, 403 forbidden, dan generic error
{
  // Offline network error
  let onlineStatus = false
  const offlineRunner = createNopolLookupRunner({
    isOnline: () => onlineStatus,
    lookup: async () => {
      throw createNetworkError()
    },
  })
  const offlineEmitted: NopolLookupState[] = []
  offlineRunner.start("DH1234AB", "api", true, (s) => offlineEmitted.push(s))
  await Promise.resolve()

  const offlineState = offlineEmitted.find((s) => s.status === "error")
  assert.ok(offlineState)
  assert.equal(offlineState.errorMessage, NOPOL_OFFLINE_MESSAGE)
  assert.equal(offlineState.retryable, true)
  assert.equal(offlineState.forbidden, false)

  // 403 Forbidden
  const forbiddenRunner = createNopolLookupRunner({
    lookup: async () => {
      throw new ApiError("Akses ditolak", 403)
    },
  })
  const forbiddenEmitted: NopolLookupState[] = []
  forbiddenRunner.start("DH1234AB", "api", true, (s) => forbiddenEmitted.push(s))
  await Promise.resolve()

  const forbiddenState = forbiddenEmitted.find((s) => s.status === "error")
  assert.ok(forbiddenState)
  assert.equal(forbiddenState.forbidden, true)
  assert.equal(forbiddenState.retryable, false)
  assert.equal(forbiddenState.errorReference, null)

  // Error tak terduga (non-ApiError)
  const unknownRunner = createNopolLookupRunner({
    lookup: async () => {
      throw new Error("Unhandled exception")
    },
  })
  const unknownEmitted: NopolLookupState[] = []
  unknownRunner.start("DH1234AB", "api", true, (s) => unknownEmitted.push(s))
  await Promise.resolve()

  const unknownState = unknownEmitted.find((s) => s.status === "error")
  assert.ok(unknownState)
  assert.equal(unknownState.errorMessage, null) // UI fallback generik
  assert.equal(unknownState.retryable, true)
  assert.equal(unknownState.forbidden, false)
  pass("Error handling membedakan offline, 403 forbidden, dan generic error")
}

console.log("\nSemua nopol lookup runner tests: PASS ✓\n")
