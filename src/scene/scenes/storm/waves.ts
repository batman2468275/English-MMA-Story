/**
 * Ocean wave definitions shared by the GLSL vertex shader (Ocean.tsx) and the CPU, so the swimmer,
 * debris and camera can ride exactly the same swells that are drawn.
 */
export interface Wave { dx: number; dz: number; k: number; a: number; s: number }

const raw: [number, number, number, number, number][] = [
  // dirX, dirZ, wavenumber, amplitude, speed
  [1, 0.3, 0.34, 0.9, 1.05],
  [-0.4, 1, 0.55, 0.6, 1.35],
  [0.7, 0.7, 0.9, 0.35, 1.8],
  [-0.8, 0.2, 1.5, 0.18, 2.3],
  [0.1, -1, 2.4, 0.08, 3.0],
]

export const WAVES: Wave[] = raw.map(([x, z, k, a, s]) => {
  const l = Math.hypot(x, z)
  return { dx: x / l, dz: z / l, k, a, s }
})

/**
 * The sea is a little calmer in a pocket around the swimmer (so the action stays readable) and wilder toward the horizon.
 * Must match the same formula in the Ocean vertex shader.
 */
export const pocket = (x: number, z: number) => {
  const d = Math.hypot(x, z)
  const t = Math.min(1, Math.max(0, (d - 6) / 16))
  return 0.45 + 0.55 * (t * t * (3 - 2 * t))
}

/** Wave height at (x,z), time t, amplitude multiplier amp (storm intensity). */
export function waveH(x: number, z: number, t: number, amp: number) {
  let h = 0
  for (const w of WAVES) h += w.a * Math.sin(w.k * (w.dx * x + w.dz * z) + w.s * t)
  return h * amp * pocket(x, z)
}

/** Surface slope (dh/dx, dh/dz). */
export function waveSlope(x: number, z: number, t: number, amp: number): [number, number] {
  let sx = 0
  let sz = 0
  for (const w of WAVES) {
    const c = Math.cos(w.k * (w.dx * x + w.dz * z) + w.s * t) * w.a * w.k
    sx += c * w.dx
    sz += c * w.dz
  }
  const f = amp * pocket(x, z)
  return [sx * f, sz * f]
}
