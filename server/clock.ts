/**
 * Sumber waktu yang dapat diganti dalam pengujian (idle/absolute expiry).
 */
export const clock = {
  now: (): number => Date.now(),
}

export function nowMs(): number {
  return clock.now()
}

export function toIso(ms: number): string {
  return new Date(ms).toISOString()
}
