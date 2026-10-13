/**
 * Label perangkat diturunkan dari User-Agent di server. Hanya kosakata tetap
 * yang dihasilkan sehingga nilai aman ditampilkan dan tidak memuat input mentah.
 */

const MAX_LABEL_LENGTH = 120
const UNKNOWN_DEVICE = "Perangkat tidak dikenal"

function detectBrowser(ua: string): string | null {
  if (/\bEdg(e|A|iOS)?\//.test(ua)) return "Edge"
  if (/\b(OPR|Opera)\//.test(ua)) return "Opera"
  if (/\bSamsungBrowser\//.test(ua)) return "Samsung Internet"
  if (/\b(Firefox|FxiOS)\//.test(ua)) return "Firefox"
  if (/\b(Chrome|CriOS|Chromium)\//.test(ua)) return "Chrome"
  if (/\bSafari\//.test(ua) && /\bVersion\//.test(ua)) return "Safari"
  return null
}

function detectOs(ua: string): string | null {
  if (/\bWindows\b/.test(ua)) return "Windows"
  if (/\bAndroid\b/.test(ua)) return "Android"
  if (/\biPad\b/.test(ua)) return "iPadOS"
  if (/\b(iPhone|iPod)\b/.test(ua)) return "iOS"
  if (/\bCrOS\b/.test(ua)) return "ChromeOS"
  if (/\bMac OS X\b|\bMacintosh\b/.test(ua)) return "macOS"
  if (/\bLinux\b/.test(ua)) return "Linux"
  return null
}

export function deviceLabelFromUserAgent(userAgent: string | null): string {
  const ua = (userAgent ?? "").slice(0, 512)
  if (!ua) return UNKNOWN_DEVICE
  const browser = detectBrowser(ua)
  const os = detectOs(ua)
  let label: string
  if (browser && os) label = `${browser} di ${os}`
  else if (browser) label = browser
  else if (os) label = `Browser di ${os}`
  else label = UNKNOWN_DEVICE
  return label.slice(0, MAX_LABEL_LENGTH)
}
