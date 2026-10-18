// Tiny math helpers shared by every scene. All functions are pure so that
// scrubbing scroll forwards/backwards always gives identical results.

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v))
export const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
/** Normalised position of p inside [a,b], clamped to 0..1. */
export const range = (p: number, a: number, b: number) => clamp01((p - a) / (b - a))
export const smooth = (a: number, b: number, p: number) => {
  const t = range(p, a, b)
  return t * t * (3 - 2 * t)
}
export const smoother = (a: number, b: number, p: number) => {
  const t = range(p, a, b)
  return t * t * t * (t * (t * 6 - 15) + 10)
}
export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
export const damp = (cur: number, target: number, lambda: number, dt: number) =>
  lerp(cur, target, 1 - Math.exp(-lambda * dt))

/** Deterministic pseudo-random (so layouts are stable between renders). */
export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Heartbeat curve: two quick thumps per cycle. t in seconds, bpm beats/min. Returns 0..1 */
export function heartbeat(t: number, bpm = 70) {
  const period = 60 / bpm
  const x = ((t % period) + period) % period
  const a = Math.exp(-Math.pow((x - 0.05) * 18, 2))
  const b = 0.65 * Math.exp(-Math.pow((x - 0.05 - 0.22 * period / 0.85) * 18, 2))
  return Math.min(1, a + b)
}
