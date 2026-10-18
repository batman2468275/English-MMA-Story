import {
  BoxGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  Group,
  Material,
  Mesh,
  MathUtils,
  Object3D,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three'

/**
 * A stylised low-poly humanoid. Origin = pelvis. Standing: feet ≈ 0.98 below the origin, head top ≈ 0.95 above.
 *
 * v2 anatomy: tapered limb segments with ball joints, a two-part torso (abdomen + ribcage) with shoulder caps, neck + jaw,
 * flat hands and wedge feet. Every limb segment hangs along local -Y from its pivot, so rotation.x = -π/2 swings a
 * hanging arm to point forward (+Z). Elbows/knees are hinges (flex only) — see `limitPose`.
 *
 * `solveArm` / `solveLeg` are a two-bone IK so hands/feet can be pinned onto things (debris, a partner's neck, the floor).
 * `segments` describes the body as capsules for the contact solver in scene/contact.ts.
 */
export interface Segment {
  a: Object3D
  b: Object3D
  r: number
  kind: 'torso' | 'head' | 'uarm' | 'farm' | 'thigh' | 'shin'
}

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
  neck: Object3D // base of the neck (collar line)
  headC: Object3D // centre of the skull
  segments: Segment[]
}

const sph = (r: number, w = 12, h = 8) => new SphereGeometry(r, w, h)

/** A limb piece hanging from its pivot: tapered cylinder + the pivot's ball joint. */
function piece(rTop: number, rBot: number, len: number, mat: Material, joint = true) {
  const g = new Group()
  const m = new Mesh(new CylinderGeometry(rTop, rBot, len, 10, 1), mat)
  m.position.y = -len / 2
  g.add(m)
  if (joint) g.add(new Mesh(sph(rTop * 1.04), mat))
  return g
}

export function createFigure(mat: Material, scale = 1): Figure {
  const root = new Group()
  root.rotation.order = 'YXZ' // yaw first, then lean/fall — so "fall backwards" is rotation.x
  root.scale.setScalar(scale)

  // ---- pelvis
  const hips = new Mesh(new CapsuleGeometry(0.11, 0.14, 4, 10), mat)
  hips.rotation.z = Math.PI / 2
  hips.scale.set(1, 1, 0.86)
  root.add(hips)

  // ---- spine: abdomen + ribcage
  const spine = new Group()
  spine.position.y = 0.04
  root.add(spine)
  const abdomen = new Mesh(new CapsuleGeometry(0.118, 0.16, 4, 10), mat)
  abdomen.position.y = 0.11
  abdomen.scale.set(1.08, 1, 0.8)
  spine.add(abdomen)
  const chest = new Mesh(new CylinderGeometry(0.178, 0.138, 0.36, 12, 1), mat)
  chest.position.y = 0.36
  chest.scale.set(1.16, 1, 0.74)
  spine.add(chest)
  const chestTop = new Mesh(sph(0.178, 12, 6), mat)
  chestTop.position.y = 0.54
  chestTop.scale.set(1.16, 0.45, 0.74)
  spine.add(chestTop)
  const neck = new Object3D()
  neck.position.y = 0.57
  spine.add(neck)
  const neckMesh = new Mesh(new CylinderGeometry(0.048, 0.056, 0.12, 8), mat)
  neckMesh.position.y = 0.04
  neck.add(neckMesh)

  // ---- head
  const head = new Group()
  head.position.y = 0.64
  spine.add(head)
  const skull = new Mesh(sph(0.105, 14, 10), mat)
  skull.position.y = 0.13
  skull.scale.set(0.92, 1.08, 1.02)
  head.add(skull)
  const jaw = new Mesh(sph(0.066, 10, 8), mat)
  jaw.position.set(0, 0.07, 0.045)
  jaw.scale.set(0.95, 0.8, 1)
  head.add(jaw)
  const headC = new Object3D()
  headC.position.y = 0.13
  head.add(headC)

  // ---- arms
  const mkArm = (side: 1 | -1) => {
    const sh = piece(0.058, 0.046, 0.3, mat)
    sh.position.set(0.26 * side, 0.5, 0)
    // rounded shoulder cap so the upper arm blends into the ribcage
    const cap = new Mesh(sph(0.07, 10, 8), mat)
    cap.scale.set(1, 0.9, 0.95)
    sh.add(cap)
    spine.add(sh)
    const el = piece(0.046, 0.036, 0.28, mat)
    el.position.y = -0.3
    sh.add(el)
    const hand = new Mesh(sph(0.075, 10, 8), mat)
    hand.scale.set(0.62, 1, 0.5)
    hand.position.y = -0.33
    el.add(hand)
    const tip = new Object3D()
    tip.position.y = -0.38
    el.add(tip)
    return { sh, el, tip }
  }
  const aL = mkArm(1)
  const aR = mkArm(-1)

  // ---- legs
  const mkLeg = (side: 1 | -1) => {
    const hp = piece(0.09, 0.066, 0.46, mat)
    hp.position.set(0.095 * side, -0.02, 0)
    root.add(hp)
    const kn = piece(0.064, 0.046, 0.5, mat)
    kn.position.y = -0.46
    hp.add(kn)
    const foot = new Mesh(new BoxGeometry(0.1, 0.06, 0.25), mat)
    foot.position.set(0, -0.47, 0.07)
    kn.add(foot)
    const toes = new Mesh(new BoxGeometry(0.095, 0.04, 0.08), mat)
    toes.position.set(0, -0.485, 0.2)
    kn.add(toes)
    const ft = new Object3D()
    ft.position.y = -0.5
    kn.add(ft)
    return { hp, kn, ft }
  }
  const lL = mkLeg(1)
  const lR = mkLeg(-1)

  const fig: Figure = {
    root,
    j: { spine, head, shL: aL.sh, shR: aR.sh, elL: aL.el, elR: aR.el, hpL: lL.hp, hpR: lR.hp, knL: lL.kn, knR: lR.kn },
    tipL: aL.tip,
    tipR: aR.tip,
    ftL: lL.ft,
    ftR: lR.ft,
    neck,
    headC,
    segments: [],
  }
  fig.segments = [
    { a: root, b: neck, r: 0.17, kind: 'torso' },
    { a: headC, b: headC, r: 0.115, kind: 'head' },
    { a: aL.sh, b: aL.el, r: 0.06, kind: 'uarm' },
    { a: aR.sh, b: aR.el, r: 0.06, kind: 'uarm' },
    { a: aL.el, b: aL.tip, r: 0.05, kind: 'farm' },
    { a: aR.el, b: aR.tip, r: 0.05, kind: 'farm' },
    { a: lL.hp, b: lL.kn, r: 0.088, kind: 'thigh' },
    { a: lR.hp, b: lR.kn, r: 0.088, kind: 'thigh' },
    { a: lL.kn, b: lL.ft, r: 0.064, kind: 'shin' },
    { a: lR.kn, b: lR.ft, r: 0.064, kind: 'shin' },
  ]
  return fig
}

// --------------------------------------------------------------------------
// Joint limits
// --------------------------------------------------------------------------
const clampRot = (o: Object3D, ax: 'x' | 'y' | 'z', lo: number, hi: number) => {
  o.rotation[ax] = MathUtils.clamp(o.rotation[ax], lo, hi)
}

/**
 * Keeps FK-driven joints inside human limits: elbows and knees are pure hinges that only flex, shoulders/hips/spine/head
 * stay inside plausible ranges, and shoulders never adduct into the ribcage. Call after setting FK values, before IK.
 */
export function limitPose(f: Figure) {
  const { j } = f
  for (const e of [j.elL, j.elR]) {
    clampRot(e, 'x', -2.75, 0.04)
    e.rotation.y = 0
    e.rotation.z = 0
  }
  for (const k of [j.knL, j.knR]) {
    clampRot(k, 'x', 0, 2.65)
    k.rotation.y = 0
    k.rotation.z = 0
  }
  clampRot(j.shL, 'x', -3.3, 1.2)
  clampRot(j.shR, 'x', -3.3, 1.2)
  // never let a hanging arm swing into the torso: minimum outward abduction, scaled by how far forward/back it is
  clampRot(j.shL, 'z', 0.06, 2.4)
  clampRot(j.shR, 'z', -2.4, -0.06)
  clampRot(j.hpL, 'x', -2.1, 0.7)
  clampRot(j.hpR, 'x', -2.1, 0.7)
  clampRot(j.hpL, 'z', -0.1, 0.9)
  clampRot(j.hpR, 'z', -0.9, 0.1)
  clampRot(j.spine, 'x', -0.6, 1.3)
  clampRot(j.head, 'x', -0.9, 0.7)
  clampRot(j.head, 'y', -1.1, 1.1)
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
  solveChain(fig, sh, el, 0.3, 0.38, target, pole ?? (side === 'L' ? ARM_POLE_L : ARM_POLE_R), weight)
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
  // arms hang slightly away from the ribcage by default (never through it)
  j.shL.rotation.z = 0.1
  j.shR.rotation.z = -0.1
  f.root.rotation.set(0, 0, 0)
}

// --------------------------------------------------------------------------
// Grounding / gaze helpers
// --------------------------------------------------------------------------
const _w = new Vector3()

/** Lower/raise the figure so its lower foot is exactly on the floor (feet never float or sink). */
export function groundFigure(f: Figure, floorY = 0) {
  f.root.updateWorldMatrix(true, true)
  f.ftL.getWorldPosition(_w)
  const a = _w.y
  f.ftR.getWorldPosition(_w)
  f.root.position.y += floorY - Math.min(a, _w.y)
  f.root.updateWorldMatrix(true, true)
}

/** Move the figure vertically so `joint` rests at height y (e.g. a kneeling knee on the mat, a hip on a seat). */
export function plantJoint(f: Figure, joint: Object3D, y: number) {
  f.root.updateWorldMatrix(true, true)
  joint.getWorldPosition(_w)
  f.root.position.y += y - _w.y
  f.root.updateWorldMatrix(true, true)
}

/**
 * Safety net for ground work: if any extremity (feet, knees, hands, head, hips) would sink below the floor, raise the whole
 * figure just enough. Prevents bodies clipping into the mat during falls and lying poses.
 */
export function liftAboveFloor(f: Figure, floorY = 0, settle = false) {
  f.root.updateWorldMatrix(true, true)
  const k = f.root.getWorldScale(_w).x
  const pts: [Object3D, number][] = [
    [f.root, 0.1], [f.neck, 0.15], [f.headC, 0.11], [f.tipL, 0.05], [f.tipR, 0.05],
    [f.ftL, 0.0], [f.ftR, 0.0], [f.j.knL, 0.065], [f.j.knR, 0.065], [f.j.elL, 0.05], [f.j.elR, 0.05],
  ]
  let lowest = Infinity
  for (const [o, r] of pts) {
    o.getWorldPosition(_w)
    lowest = Math.min(lowest, _w.y - r * k)
  }
  const shift = floorY - lowest
  // `settle` also lowers a hovering body so it rests *on* the mat instead of floating above it
  if (shift > 0 || settle) {
    f.root.position.y += shift
    f.root.updateWorldMatrix(true, true)
  }
}

const _hp = new Vector3()
/** Turn the head toward a world point (with limits). amount 0..1. */
export function lookAt(f: Figure, target: Vector3, amount = 1) {
  const h = f.j.head
  h.parent!.updateWorldMatrix(true, false)
  h.parent!.worldToLocal(_hp.copy(target))
  _hp.y -= 0.65
  const yaw = Math.atan2(_hp.x, _hp.z)
  const pitch = -Math.atan2(_hp.y, Math.hypot(_hp.x, _hp.z))
  h.rotation.y = MathUtils.clamp(yaw, -1.0, 1.0) * amount
  h.rotation.x = MathUtils.clamp(pitch, -0.6, 0.55) * amount
}
