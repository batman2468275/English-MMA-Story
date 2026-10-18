import {
  CapsuleGeometry,
  Group,
  Material,
  Mesh,
  Object3D,
  Quaternion,
  SphereGeometry,
  BoxGeometry,
  Vector3,
} from 'three'

/**
 * A tiny stylised low-poly humanoid built from capsules.
 * Origin = pelvis. Standing: feet ≈ 0.95 below the origin, head top ≈ 0.95 above.
 * Every limb segment hangs along local -Y from its pivot, so
 * rotation.x = -π/2 swings a hanging arm to point forward (+Z).
 *
 * `solveArm` / `solveLeg` are a small analytic 2-bone IK so hands/feet can
 * be pinned onto things (debris, rings, another fighter's neck…).
 */
export interface Figure {
  root: Group
  j: {
    spine: Group
    head: Group
    shL: Group
    shR: Group
    elL: Group
    elR: Group
    hpL: Group
    hpR: Group
    knL: Group
    knR: Group
  }
  tipL: Object3D
  tipR: Object3D
  ftL: Object3D
  ftR: Object3D
}

const capsule = (r: number, len: number) => new CapsuleGeometry(r, Math.max(0.001, len - 2 * r), 3, 8)

function segment(r: number, len: number, mat: Material) {
  const g = new Group()
  const m = new Mesh(capsule(r, len), mat)
  m.position.y = -len / 2
  g.add(m)
  return g
}

export function createFigure(mat: Material, scale = 1): Figure {
  const root = new Group()
  root.rotation.order = 'YXZ' // yaw first, then lean/fall — so "fall backwards" is rotation.x
  root.scale.setScalar(scale)

  // hips
  const hips = new Mesh(new CapsuleGeometry(0.12, 0.12, 3, 8), mat)
  hips.rotation.z = Math.PI / 2
  root.add(hips)

  // spine / torso
  const spine = new Group()
  spine.position.y = 0.04
  root.add(spine)
  const torso = new Mesh(capsule(0.17, 0.62), mat)
  torso.position.y = 0.3
  torso.scale.set(1.12, 1, 0.78)
  spine.add(torso)

  // neck + head
  const head = new Group()
  head.position.y = 0.66
  spine.add(head)
  const neck = new Mesh(capsule(0.05, 0.14), mat)
  neck.position.y = 0.02
  head.add(neck)
  const skull = new Mesh(new SphereGeometry(0.115, 12, 10), mat)
  skull.position.y = 0.15
  skull.scale.set(0.92, 1.08, 1)
  head.add(skull)

  // arms
  const mkArm = (side: 1 | -1) => {
    const sh = segment(0.058, 0.3, mat)
    sh.position.set(0.24 * side, 0.52, 0)
    spine.add(sh)
    const el = segment(0.05, 0.3, mat)
    el.position.y = -0.3
    sh.add(el)
    const hand = new Mesh(new SphereGeometry(0.058, 8, 6), mat)
    hand.position.y = -0.32
    el.add(hand)
    const tip = new Object3D()
    tip.position.y = -0.36
    el.add(tip)
    return { sh, el, tip }
  }
  const aL = mkArm(1)
  const aR = mkArm(-1)

  // legs
  const mkLeg = (side: 1 | -1) => {
    const hp = segment(0.085, 0.46, mat)
    hp.position.set(0.1 * side, -0.02, 0)
    root.add(hp)
    const kn = segment(0.068, 0.46, mat)
    kn.position.y = -0.46
    hp.add(kn)
    const foot = new Mesh(new BoxGeometry(0.1, 0.06, 0.26), mat)
    foot.position.set(0, -0.47, 0.06)
    kn.add(foot)
    const ft = new Object3D()
    ft.position.y = -0.5
    kn.add(ft)
    return { hp, kn, ft }
  }
  const lL = mkLeg(1)
  const lR = mkLeg(-1)

  return {
    root,
    j: { spine, head, shL: aL.sh, shR: aR.sh, elL: aL.el, elR: aR.el, hpL: lL.hp, hpR: lR.hp, knL: lL.kn, knR: lR.kn },
    tipL: aL.tip,
    tipR: aR.tip,
    ftL: lL.ft,
    ftR: lR.ft,
  }
}

// --------------------------------------------------------------------------
// IK
// --------------------------------------------------------------------------
const DOWN = new Vector3(0, -1, 0)
const _p = new Vector3()
const _v = new Vector3()
const _q = new Quaternion()
const _s = new Vector3()
const _e = new Vector3()
const _pole = new Vector3()

/** Rotate `obj` so its local -Y axis points at the world-space `target`. */
export function aim(obj: Object3D, target: Vector3) {
  obj.updateWorldMatrix(true, false)
  obj.getWorldPosition(_p)
  _v.copy(target).sub(_p)
  if (_v.lengthSq() < 1e-8) return
  _v.normalize()
  obj.parent!.getWorldQuaternion(_q).invert()
  _v.applyQuaternion(_q)
  obj.quaternion.setFromUnitVectors(DOWN, _v)
}

function solveChain(
  fig: Figure,
  upper: Object3D,
  lower: Object3D,
  L1: number,
  L2: number,
  target: Vector3,
  pole: Vector3,
  weight: number,
) {
  if (weight <= 0.001) return
  const fkU = upper.quaternion.clone()
  const fkL = lower.quaternion.clone()
  const k = fig.root.getWorldScale(_s).x
  const l1 = L1 * k
  const l2 = L2 * k

  upper.updateWorldMatrix(true, false)
  upper.getWorldPosition(_s)
  const S = _s.clone()
  const d = target.clone().sub(S)
  let dist = d.length()
  const maxD = (l1 + l2) * 0.999
  const minD = Math.abs(l1 - l2) + 0.02
  dist = Math.min(maxD, Math.max(minD, dist))
  d.normalize()
  const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist)
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a))
  _pole.copy(pole).addScaledVector(d, -pole.dot(d))
  if (_pole.lengthSq() < 1e-6) _pole.set(0, -1, 0).addScaledVector(d, d.y)
  _pole.normalize()
  _e.copy(S).addScaledVector(d, a).addScaledVector(_pole, h)

  aim(upper, _e)
  upper.updateWorldMatrix(true, true)
  // aim lower toward the (clamped) target
  const T = S.clone().addScaledVector(d, dist)
  aim(lower, T)

  if (weight < 0.999) {
    const ikU = upper.quaternion.clone()
    const ikL = lower.quaternion.clone()
    upper.quaternion.copy(fkU).slerp(ikU, weight)
    lower.quaternion.copy(fkL).slerp(ikL, weight)
  }
}

const ARM_POLE_L = new Vector3(0.6, -0.8, -0.3)
const ARM_POLE_R = new Vector3(-0.6, -0.8, -0.3)

/** Pin a hand to a world-space target. `pole` = direction the elbow should bend toward (world). */
export function solveArm(fig: Figure, side: 'L' | 'R', target: Vector3, weight = 1, pole?: Vector3) {
  const sh = side === 'L' ? fig.j.shL : fig.j.shR
  const el = side === 'L' ? fig.j.elL : fig.j.elR
  solveChain(fig, sh, el, 0.3, 0.36, target, pole ?? (side === 'L' ? ARM_POLE_L : ARM_POLE_R), weight)
}

/** Pin a foot to a world-space target. */
export function solveLeg(fig: Figure, side: 'L' | 'R', target: Vector3, weight = 1, pole?: Vector3) {
  const hp = side === 'L' ? fig.j.hpL : fig.j.hpR
  const kn = side === 'L' ? fig.j.knL : fig.j.knR
  solveChain(fig, hp, kn, 0.46, 0.5, target, pole ?? new Vector3(0, 0, 1), weight)
}

/** Reset a figure to a neutral standing pose. */
export function resetPose(f: Figure) {
  const { j } = f
  for (const o of [j.spine, j.head, j.shL, j.shR, j.elL, j.elR, j.hpL, j.hpR, j.knL, j.knR]) o.rotation.set(0, 0, 0)
  f.root.rotation.set(0, 0, 0)
}
