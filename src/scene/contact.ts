import { MathUtils, Vector3 } from 'three'
import type { Figure, Segment } from './figure'

/**
 * Lightweight body-contact solver. Each figure is a set of capsules (see `Figure.segments`); after the FK pose has been
 * set, `resolveContacts` pushes whole figures apart (root translation) so torsos, heads and thighs of different fighters
 * rest *against* each other instead of intersecting. `clearArms` keeps a figure's own arms out of its own torso.
 * Forearms are deliberately ignored between figures — grips/chokes/strikes place hands on the surface via IK.
 */
const P1 = new Vector3()
const Q1 = new Vector3()
const P2 = new Vector3()
const Q2 = new Vector3()
const C1 = new Vector3()
const C2 = new Vector3()
const D1 = new Vector3()
const D2 = new Vector3()
const R = new Vector3()
const N = new Vector3()
const S = new Vector3()

function closestSegSeg(p1: Vector3, q1: Vector3, p2: Vector3, q2: Vector3, c1: Vector3, c2: Vector3) {
  D1.copy(q1).sub(p1)
  D2.copy(q2).sub(p2)
  R.copy(p1).sub(p2)
  const a = D1.dot(D1)
  const e = D2.dot(D2)
  const f = D2.dot(R)
  const eps = 1e-9
  let s: number
  let t: number
  if (a <= eps && e <= eps) {
    s = t = 0
  } else if (a <= eps) {
    s = 0
    t = MathUtils.clamp(f / e, 0, 1)
  } else {
    const c = D1.dot(R)
    if (e <= eps) {
      t = 0
      s = MathUtils.clamp(-c / a, 0, 1)
    } else {
      const b = D1.dot(D2)
      const denom = a * e - b * b
      s = denom > eps ? MathUtils.clamp((b * f - c * e) / denom, 0, 1) : 0
      t = (b * s + f) / e
      if (t < 0) {
        t = 0
        s = MathUtils.clamp(-c / a, 0, 1)
      } else if (t > 1) {
        t = 1
        s = MathUtils.clamp((b - c) / a, 0, 1)
      }
    }
  }
  c1.copy(p1).addScaledVector(D1, s)
  c2.copy(p2).addScaledVector(D2, t)
}

const weightOf = (k: Segment['kind']) => (k === 'torso' || k === 'head' || k === 'thigh' ? 1 : 0.3)

export interface ContactOptions {
  iterations?: number
  /** return true to ignore a particular segment pair */
  skip?: (a: Segment, b: Segment) => boolean
  /** extra clearance added to every pair (m) */
  margin?: number
}

/** Push figures apart so their bodies don't intersect. Returns the deepest remaining penetration (m). */
export function resolveContacts(figs: Figure[], opts: ContactOptions = {}): number {
  const { iterations = 3, skip, margin = 0.005 } = opts
  let worst = 0
  for (let it = 0; it < iterations; it++) {
    worst = 0
    const push = figs.map(() => new Vector3())
    figs.forEach((f) => f.root.updateWorldMatrix(true, true))
    for (let i = 0; i < figs.length; i++) {
      for (let j = i + 1; j < figs.length; j++) {
        const ka = figs[i].root.getWorldScale(S).x
        const kb = figs[j].root.getWorldScale(S).x
        for (const sa of figs[i].segments) {
          if (sa.kind === 'farm') continue
          for (const sb of figs[j].segments) {
            if (sb.kind === 'farm') continue
            if (skip && skip(sa, sb)) continue
            sa.a.getWorldPosition(P1); sa.b.getWorldPosition(Q1)
            sb.a.getWorldPosition(P2); sb.b.getWorldPosition(Q2)
            closestSegSeg(P1, Q1, P2, Q2, C1, C2)
            const dist = C1.distanceTo(C2)
            const pen = sa.r * ka + sb.r * kb + margin - dist
            if (pen <= 0) continue
            worst = Math.max(worst, pen)
            N.copy(C1).sub(C2)
            if (N.lengthSq() < 1e-10) N.set(0, 1, 0)
            N.normalize()
            const w = Math.min(weightOf(sa.kind), weightOf(sb.kind))
            push[i].addScaledVector(N, pen * 0.5 * w)
            push[j].addScaledVector(N, -pen * 0.5 * w)
          }
        }
      }
    }
    figs.forEach((f, i) => {
      if (push[i].lengthSq() > 1e-12) {
        // translate in world space → convert into the parent's space (figures are direct children of scene groups)
        f.root.position.add(push[i])
      }
    })
    if (worst < 0.004) break
  }
  figs.forEach((f) => f.root.updateWorldMatrix(true, true))
  return worst
}

const A1 = new Vector3()
const A2 = new Vector3()
const T1 = new Vector3()
const T2 = new Vector3()

/** Keep each of this figure's own upper arms out of its own torso by increasing shoulder abduction. */
export function clearArms(f: Figure) {
  f.root.updateWorldMatrix(true, true)
  const torso = f.segments[0]
  const k = f.root.getWorldScale(S).x
  torso.a.getWorldPosition(T1)
  torso.b.getWorldPosition(T2)
  for (const side of ['L', 'R'] as const) {
    const seg = f.segments.find((s) => s.kind === 'uarm' && s.a === (side === 'L' ? f.j.shL : f.j.shR))!
    seg.a.getWorldPosition(A1)
    seg.b.getWorldPosition(A2)
    closestSegSeg(A1, A2, T1, T2, C1, C2)
    const pen = (seg.r + torso.r) * k * 0.92 - C1.distanceTo(C2)
    if (pen > 0) {
      const sh = side === 'L' ? f.j.shL : f.j.shR
      sh.rotation.z += (side === 'L' ? 1 : -1) * Math.min(0.6, (pen / (0.3 * k)) * 1.2)
    }
  }
}
