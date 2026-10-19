import { PerspectiveCamera, Vector3 } from 'three'
import { store } from '../core/store'
import { damp } from '../core/math'
import { chapters } from '../content/story'

type V3 = [number, number, number]

interface CamState {
  pos: Vector3
  look: Vector3
  fov: number
  seen: number
  fx: number // composition shift (fraction of screen width / height), damped
  fy: number
}
const states = new Map<number, CamState>()
const _right = new Vector3()

/**
 * Smoothly drives the single shared camera toward a target pose.
 * Scenes call this every frame with a target that is a pure function of scroll progress,
 * so the camera is "scrubbed" by scroll (with a few ms of damping so it never feels jerky).
 * On the first frame a scene becomes active the camera snaps (no flying across scenes).
 * Also applies camera shake (store.fx.shake) and the subtle mouse parallax.
 */
export function setCam(
  index: number,
  cam: PerspectiveCamera,
  pos: V3,
  look: V3,
  fov: number,
  dt: number,
  opts: { lambda?: number; parallax?: number; roll?: number } = {},
) {
  const { lambda = 7, parallax = 0.25, roll = 0 } = opts
  let s = states.get(index)
  if (!s) {
    s = { pos: new Vector3(...pos), look: new Vector3(...look), fov, seen: -99, fx: 0, fy: 0 }
    states.set(index, s)
  }
  // Composition: slide the 3D subject away from where the text sits (text left → subject right, etc.)
  const side = chapters[index]?.side
  const wantX = store.mobile ? 0 : side === 'left' ? 0.17 : side === 'right' ? -0.17 : 0
  const wantY = store.mobile && side !== undefined && index !== 4 ? 0.2 : !store.mobile && index === 13 ? 0.2 : 0
  s.fx = damp(s.fx, wantX, 3, dt)
  s.fy = damp(s.fy, wantY, 3, dt)
  const snap = store.frame - s.seen > 3
  s.seen = store.frame
  if (snap) {
    s.pos.set(...pos)
    s.look.set(...look)
    s.fov = fov
  } else {
    s.pos.x = damp(s.pos.x, pos[0], lambda, dt)
    s.pos.y = damp(s.pos.y, pos[1], lambda, dt)
    s.pos.z = damp(s.pos.z, pos[2], lambda, dt)
    s.look.x = damp(s.look.x, look[0], lambda, dt)
    s.look.y = damp(s.look.y, look[1], lambda, dt)
    s.look.z = damp(s.look.z, look[2], lambda, dt)
    s.fov = damp(s.fov, fov, lambda, dt)
  }

  cam.position.copy(s.pos)
  // handheld drift: a few slow, incommensurate sine waves (a real operator's breathing) — position ≈ 1 cm, aim ≈ 0.07°.
  // Time-based and tiny, so the scroll-scrubbed move itself is unchanged and reversible; off for reduced motion.
  if (!store.reduced) {
    const T = performance.now() / 1000
    const k = store.mobile ? 0.6 : 1
    cam.position.x += (Math.sin(T * 0.53 + index) + 0.6 * Math.sin(T * 1.17)) * 0.008 * k
    cam.position.y += (Math.sin(T * 0.41 + 2 * index) + 0.5 * Math.sin(T * 0.97 + 1)) * 0.007 * k
  }
  const sh = store.fx.shake
  if (sh > 0.001) {
    cam.position.x += (Math.random() - 0.5) * sh
    cam.position.y += (Math.random() - 0.5) * sh
    cam.position.z += (Math.random() - 0.5) * sh * 0.5
  }
  cam.up.set(0, 1, 0)
  cam.lookAt(s.look)
  if (roll) cam.rotateZ(roll)
  if (!store.reduced) {
    const T = performance.now() / 1000
    cam.rotateX(Math.sin(T * 0.62 + index) * 0.0011)
    cam.rotateY(Math.sin(T * 0.47 + 3 * index) * 0.0011)
  }
  if (parallax > 0) {
    _right.set(1, 0, 0).applyQuaternion(cam.quaternion)
    cam.position.addScaledVector(_right, store.mouse.x * parallax)
    cam.position.y -= store.mouse.y * parallax * 0.6
  }
  // portrait screens see far less horizontally, so open the vertical FOV up to keep the subject in frame
  const aspect = window.innerWidth / window.innerHeight
  const fovNow = aspect < 1 ? Math.min(84, s.fov * (1 + (1 - aspect) * 0.9)) : s.fov
  const w = window.innerWidth
  const h = window.innerHeight
  if (Math.abs(s.fx) > 0.001 || Math.abs(s.fy) > 0.001) {
    cam.setViewOffset(w, h, -s.fx * w, s.fy * h, w, h)
  } else if (cam.view?.enabled) {
    cam.clearViewOffset()
  }
  if (Math.abs(cam.fov - fovNow) > 0.01) {
    cam.fov = fovNow
    cam.updateProjectionMatrix()
  }
}

/**
 * Keyframe interpolation of a vector over progress p using a non-uniform Catmull-Rom spline (cubic Hermite):
 * velocity is continuous through every key, so camera moves flow like a real operator's move instead of stopping and
 * restarting at each key. The very first and last segments ease in / ease out (zero tangent) for a natural start and settle.
 */
export function keys(p: number, frames: { p: number; v: V3 }[]): V3 {
  const n = frames.length
  if (p <= frames[0].p) return frames[0].v
  const last = frames[n - 1]
  if (p >= last.p) return last.v
  let i = 0
  while (i < n - 2 && p > frames[i + 1].p) i++
  const f0 = frames[Math.max(i - 1, 0)]
  const f1 = frames[i]
  const f2 = frames[i + 1]
  const f3 = frames[Math.min(i + 2, n - 1)]
  const h = f2.p - f1.p
  const t = (p - f1.p) / h
  const t2 = t * t
  const t3 = t2 * t
  const h00 = 2 * t3 - 3 * t2 + 1
  const h10 = t3 - 2 * t2 + t
  const h01 = -2 * t3 + 3 * t2
  const h11 = t3 - t2
  const out: V3 = [0, 0, 0]
  for (let c = 0; c < 3; c++) {
    const m1 = i === 0 ? 0 : ((f2.v[c] - f0.v[c]) / (f2.p - f0.p)) * h
    const m2 = i === n - 2 ? 0 : ((f3.v[c] - f1.v[c]) / (f3.p - f1.p)) * h
    out[c] = h00 * f1.v[c] + h10 * m1 + h01 * f2.v[c] + h11 * m2
  }
  return out
}

export function keys1(p: number, frames: { p: number; v: number }[]): number {
  return keys(p, frames.map((f) => ({ p: f.p, v: [f.v, 0, 0] as V3 })))[0]
}
