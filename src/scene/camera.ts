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
  const sh = store.fx.shake
  if (sh > 0.001) {
    cam.position.x += (Math.random() - 0.5) * sh
    cam.position.y += (Math.random() - 0.5) * sh
    cam.position.z += (Math.random() - 0.5) * sh * 0.5
  }
  cam.up.set(0, 1, 0)
  cam.lookAt(s.look)
  if (roll) cam.rotateZ(roll)
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

/** Piecewise-smooth keyframe interpolation of a vector over progress p. */
export function keys(p: number, frames: { p: number; v: V3 }[]): V3 {
  if (p <= frames[0].p) return frames[0].v
  const last = frames[frames.length - 1]
  if (p >= last.p) return last.v
  for (let i = 0; i < frames.length - 1; i++) {
    const a = frames[i]
    const b = frames[i + 1]
    if (p >= a.p && p <= b.p) {
      let t = (p - a.p) / (b.p - a.p)
      t = t * t * (3 - 2 * t)
      return [a.v[0] + (b.v[0] - a.v[0]) * t, a.v[1] + (b.v[1] - a.v[1]) * t, a.v[2] + (b.v[2] - a.v[2]) * t]
    }
  }
  return last.v
}

export function keys1(p: number, frames: { p: number; v: number }[]): number {
  return keys(p, frames.map((f) => ({ p: f.p, v: [f.v, 0, 0] as V3 })))[0]
}
