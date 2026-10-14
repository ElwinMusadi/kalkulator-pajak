import assert from "node:assert/strict"
import { detectInstallPlatform } from "../src/lib/pwa-install.ts"

function pass(name: string) {
  console.log(`  ✓  ${name}`)
}

console.log("Menjalankan PWA install platform tests...\n")

const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1",
  ipadOsDesktopMode:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  androidSamsung:
    "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36",
  androidFirefox: "Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0",
  windowsChrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  windowsEdge:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  windowsFirefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0",
}

assert.equal(detectInstallPlatform(UA.iphoneSafari, 5, "iPhone"), "ios-safari")
assert.equal(detectInstallPlatform(UA.iphoneChrome, 5, "iPhone"), "ios-other")
// iPadOS 13+ mengaku Macintosh; layar sentuh membedakannya dari Mac.
assert.equal(detectInstallPlatform(UA.ipadOsDesktopMode, 5, "MacIntel"), "ios-safari")
pass("iPhone/iPad Safari, browser lain di iOS, dan iPadOS mode desktop terdeteksi")

assert.equal(detectInstallPlatform(UA.androidChrome, 5, "Linux armv8l"), "android-chromium")
assert.equal(detectInstallPlatform(UA.androidSamsung, 5, "Linux armv8l"), "android-samsung")
assert.equal(detectInstallPlatform(UA.androidFirefox, 5, "Linux armv8l"), "android-firefox")
pass("Android Chrome, Samsung Internet, dan Firefox terdeteksi")

assert.equal(detectInstallPlatform(UA.windowsChrome, 0, "Win32"), "desktop-chromium")
assert.equal(detectInstallPlatform(UA.windowsEdge, 0, "Win32"), "desktop-chromium")
assert.equal(detectInstallPlatform(UA.macSafari, 0, "MacIntel"), "desktop-safari")
assert.equal(detectInstallPlatform(UA.windowsFirefox, 0, "Win32"), "desktop-firefox")
assert.equal(detectInstallPlatform("curl/8.0", 0, ""), "other")
pass("Desktop Chrome/Edge, Safari Mac, Firefox, dan browser tak dikenal terdeteksi")

console.log("\nSemua PWA install platform tests: PASS ✓\n")
