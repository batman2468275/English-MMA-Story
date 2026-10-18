import {
  BoxGeometry,
  BufferGeometry,
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
 * A stylised low-poly humanoid. Origin = pelvis. Standing: soles ≈ 0.98 below the origin, head top ≈ 0.95 above
 * (≈ 7.6 heads tall, legs ≈ half the height, arm span ≈ height).
 *
 * v3 anatomy: a continuous body — pelvis + abdomen + ribcage + a shoulder yoke so the shoulders never float; tapered limb
 * segments with ball joints (overlapping, so no seams at any pose); thicker thighs/upper arms than shins/forearms with a calf
 * bulge; mitten hands (palm + curling fingers + thumb) and wedge feet that pivot at the ankle and lie flat on the floor.
 * Every limb segment hangs along local -Y from its pivot, so rotation.x = -π/2 swings a hanging arm to point forward (+Z).
 * Elbows/knees are hinges (flex only) — see `limitPose`.
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

export interface Hand {
  grp: Group // at the wrist; local -Y points along the fingers, the palm faces local ±X (`ins`)
  f1: Group
  f2: Group
  th: Group
  ins: number // +1 / -1: which local X direction the palm faces
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
  ankL: Group
  ankR: Group
  hands: { L: Hand; R: Hand }
  tipL: Object3D
  tipR: Object3D
  ftL: Object3D // sole of the foot, under the ankle
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

/** Foot: a heel block that tapers to a thin toe wedge (local +Z is forward, the sole is at y = -0.06 from the ankle). */
function footGeometry(): BufferGeometry {
  const g = new BoxGeometry(0.105, 0.07, 0.27, 2, 1, 3)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i)
    const z = p.getZ(i)
    if (y > 0) p.setY(i, y - 0.032 * MathUtils.clamp((z + 0.02) / 0.155, 0, 1)) // toes slope down
    if (z > 0.1) p.setX(i, p.getX(i) * 0.86) // narrower toe box
  }
  g.computeVertexNormals()
  return g
}

/** Mitten hand: ellipsoid palm, two-segment finger block, thumb. `ins` = side the palm faces (−1 for the left arm, +1 for the right). */
function mkHand(mat: Material, ins: number): Hand {
  const grp = new Group()
  grp.position.y = -0.27
  grp.add(new Mesh(sph(0.034, 8, 6), mat)) // wrist
  const palm = new Mesh(sph(1, 10, 8), mat)
  palm.scale.set(0.02, 0.05, 0.046)
  palm.position.y = -0.045
  grp.add(palm)
  const f1 = new Group()
  f1.position.y = -0.082
  const c1 = new Mesh(new CapsuleGeometry(0.016, 0.022, 3, 8), mat)
  c1.scale.set(0.95, 1, 2.5)
  c1.position.y = -0.03
  f1.add(c1)
  const f2 = new Group()
  f2.position.y = -0.05
  const c2 = new Mesh(new CapsuleGeometry(0.014, 0.016, 3, 8), mat)
  c2.scale.set(0.95, 1, 2.3)
  c2.position.y = -0.022
  f2.add(c2)
  f1.add(f2)
  grp.add(f1)
  const th = new Group()
  th.position.set(ins * 0.008, -0.03, 0.046)
  const t1 = new Mesh(new CapsuleGeometry(0.014, 0.03, 3, 8), mat)
  t1.position.y = -0.028
  th.add(t1)
  grp.add(th)
  const h: Hand = { grp, f1, f2, th, ins }
  curlHand(h, 0.3)
  return h
}

function curlHand(h: Hand, c: number) {
  const s = h.ins
  h.f1.rotation.z = s * (0.1 + 1.45 * c)
  h.f2.rotation.z = s * (0.1 + 1.35 * c)
  h.th.rotation.z = s * (0.15 + 0.7 * c)
  h.th.rotation.x = 0.1 + 0.75 * c
}

/** Open the hand (0) or close it into a fist / grip (1). */
export function setHand(f: Figure, side: 'L' | 'R', curl: number) {
  curlHand(f.hands[side], MathUtils.clamp(curl, 0, 1))
}

export function createFigure(mat: Material, scale = 1): Figure {
  const root = new Group()
  root.rotation.order = 'YXZ' // yaw first, then lean/fall — so "fall backwards" is rotation.x
  root.scale.setScalar(scale)

  // ---- pelvis
  const hips = new Mesh(new CapsuleGeometry(0.115, 0.14, 4, 10), mat)
  hips.rotation.z = Math.PI / 2
  hips.scale.set(1, 1, 0.88)
  root.add(hips)

  // ---- spine: abdomen + ribcage + shoulder yoke
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
  const yoke = new Mesh(new CapsuleGeometry(0.062, 0.34, 4, 8), mat) // collar bones / trapezius: bridges chest → shoulders
  yoke.rotation.z = Math.PI / 2
  yoke.position.y = 0.5
  yoke.scale.set(1, 1, 0.85)
  spine.add(yoke)
  const neck = new Object3D()
  neck.position.y = 0.57
  spine.add(neck)
  const neckMesh = new Mesh(new CylinderGeometry(0.052, 0.064, 0.15, 8), mat)
  neckMesh.position.y = 0.045
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
    const sh = piece(0.062, 0.05, 0.3, mat)
    sh.position.set(0.26 * side, 0.5, 0)
    // rounded deltoid so the upper arm blends into the ribcage / yoke
    const cap = new Mesh(sph(0.076, 10, 8), mat)
    cap.scale.set(1, 0.92, 0.95)
    sh.add(cap)
    spine.add(sh)
    const el = piece(0.05, 0.034, 0.27, mat)
    el.position.y = -0.3
    sh.add(el)
    const hand = mkHand(mat, side === 1 ? -1 : 1)
    el.add(hand.grp)
    const tip = new Object3D()
    tip.position.y = -0.38
    el.add(tip)
    return { sh, el, tip, hand }
  }
  const aL = mkArm(1)
  const aR = mkArm(-1)

  // ---- legs
  const toeGeo = footGeometry()
  const mkLeg = (side: 1 | -1) => {
    const hp = piece(0.105, 0.072, 0.46, mat)
    hp.position.set(0.095 * side, -0.02, 0)
    root.add(hp)
    const kn = piece(0.07, 0.044, 0.44, mat)
    kn.position.y = -0.46
    hp.add(kn)
    const calf = new Mesh(sph(0.062, 10, 8), mat)
    calf.scale.set(1, 1.9, 1.15)
    calf.position.set(0, -0.14, -0.016)
    kn.add(calf)
    // ankle joint: the foot hangs from here and is levelled to the floor (see flattenFeet)
    const ank = new Group()
    ank.position.y = -0.44
    kn.add(ank)
    ank.add(new Mesh(sph(0.046, 8, 6), mat))
    const foot = new Mesh(toeGeo, mat)
    foot.position.set(0, -0.025, 0.07)
    ank.add(foot)
    const ft = new Object3D()
    ft.position.y = -0.06
    ank.add(ft)
    return { hp, kn, ank, ft }
  }
  const lL = mkLeg(1)
  const lR = mkLeg(-1)

  const fig: Figure = {
    root,
    j: { spine, head, shL: aL.sh, shR: aR.sh, elL: aL.el, elR: aR.el, hpL: lL.hp, hpR: lR.hp, knL: lL.kn, knR: lR.kn },
    ankL: lL.ank,
    ankR: lR.ank,
    hands: { L: aL.hand, R: aR.hand },
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
    { a: aL.sh, b: aL.el, r: 0.062, kind: 'uarm' },
    { a: aR.sh, b: aR.el, r: 0.062, kind: 'uarm' },
    { a: aL.el, b: aL.tip, r: 0.05, kind: 'farm' },
    { a: aR.el, b: aR.tip, r: 0.05, kind: 'farm' },
    { a: lL.hp, b: lL.kn, r: 0.098, kind: 'thigh' },
    { a: lR.hp, b: lR.kn, r: 0.098, kind: 'thigh' },
    { a: lL.kn, b: lL.ft, r: 0.066, kind: 'shin' },
    { a: lR.kn, b: lR.ft, r: 0.066, kind: 'shin' },
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
 * stay inside plausible ranges, and shoulders never adduct into the ribcage. Call after setting FK values, before IK
 * (never after: it would flatten the roll the IK/`palmFacing` gave the forearms).
 */
export function limitPose(f: Figure) {
  const { j } = f
  for (const e of [j.elL, j.elR]) {
    clampRot(e, 'x', -2.75, 0.0) // no hyperextension
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
  // never let a hanging arm swing into the torso: minimum outward abduction
  clampRot(j.shL, 'z', 0.06, 2.4)
  clampRot(j.shR, 'z', -2.4, -0.06)
  clampRot(j.hpL, 'x', -2.1, 0.7)
  clampRot(j.hpR, 'x', -2.1, 0.7)
  clampRot(j.hpL, 'z', -0.1, 0.9)
  clampRot(j.hpR, 'z', -0.9, 0.1)
  clampRot(j.spine, 'x', -0.6, 1.3)
  clampRot(j.spine, 'y', -0.95, 0.95) // spine twist
  clampRot(j.spine, 'z', -0.5, 0.5)
  clampRot(j.head, 'x', -0.9, 0.7)
  clampRot(j.head, 'y', -1.1, 1.1)
  clampRot(j.head, 'z', -0.55, 0.55)
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

const _n = new Vector3()
const _d = new Vector3()
const _ax = new Vector3()
const _cr = new Vector3()
const _qe = new Quaternion()
const _Y = new Vector3(0, 1, 0)

/**
 * Roll the forearm (after `solveArm`) so the palm faces the world direction `dir` as closely as the forearm axis allows —
 * e.g. an open palm landing flat on a face, or a pad strapped to the hand presenting its face to the striker.
 */
export function palmFacing(fig: Figure, side: 'L' | 'R', dir: Vector3, weight = 1) {
  const el = side === 'L' ? fig.j.elL : fig.j.elR
  const ins = fig.hands[side].ins
  el.updateWorldMatrix(true, false)
  el.getWorldQuaternion(_qe)
  _n.set(ins, 0, 0).applyQuaternion(_qe) // current palm normal (world)
  _ax.set(0, -1, 0).applyQuaternion(_qe) // forearm axis, wrist → fingers
  _n.addScaledVector(_ax, -_n.dot(_ax))
  _d.copy(dir).addScaledVector(_ax, -dir.dot(_ax))
  if (_n.lengthSq() < 1e-6 || _d.lengthSq() < 1e-6) return
  _n.normalize()
  _d.normalize()
  // signed angle about local +Y (= −axis) taking the current normal to the wanted one
  _cr.crossVectors(_n, _d)
  const ang = Math.atan2(-_cr.dot(_ax), _n.dot(_d)) * weight
  el.quaternion.multiply(_qe.setFromAxisAngle(_Y, ang))
  el.updateWorldMatrix(true, true)
}

// --------------------------------------------------------------------------
// Feet
// --------------------------------------------------------------------------
const _fq = new Quaternion()
const _fb = new Quaternion()
const _fc = new Quaternion()
const _fv = new Vector3()
const _fs = new Vector3()
const smoothstep = (a: number, b: number, x: number) => {
  const t = MathUtils.clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

/**
 * Level each foot to the floor: while a sole is within a few cm of the mat the ankle rotates so the foot lies flat (heading
 * follows the shin), easing back to the shin's natural angle as the foot lifts. Keeps feet planted instead of rotating oddly.
 */
export function flattenFeet(f: Figure, floorY = 0) {
  f.root.updateWorldMatrix(true, true)
  const k = f.root.getWorldScale(_fs).x
  const sides: [Object3D, Group][] = [[f.j.knL, f.ankL], [f.j.knR, f.ankR]]
  for (const [kn, ank] of sides) {
    kn.getWorldQuaternion(_fq)
    ank.quaternion.identity()
    ank.updateWorldMatrix(true, false)
    ank.getWorldPosition(_fv)
    const h = _fv.y - floorY - 0.06 * k
    const w = 1 - smoothstep(0.03, 0.28, h)
    if (w <= 0.001) continue
    _fv.set(0, 0, 1).applyQuaternion(_fq)
    if (_fv.x * _fv.x + _fv.z * _fv.z < 0.12) {
      f.root.getWorldQuaternion(_fb)
      _fv.set(0, 0, 1).applyQuaternion(_fb)
    }
    _fb.setFromAxisAngle(_Y, Math.atan2(_fv.x, _fv.z))
    _fc.copy(_fq).invert().multiply(_fb) // wanted local rotation
    if (_fc.w < 0) _fc.set(-_fc.x, -_fc.y, -_fc.z, -_fc.w)
    const angle = 2 * Math.acos(Math.min(1, _fc.w))
    const lim = 1.0 // joint limit: ±57° of ankle travel
    const t = (angle > lim ? lim / angle : 1) * w
    ank.quaternion.identity().slerp(_fc, t)
  }
  f.root.updateMatrixWorld(true)
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
  j.shL.position.y = 0.5
  j.shR.position.y = 0.5
  f.ankL.quaternion.identity()
  f.ankR.quaternion.identity()
  curlHand(f.hands.L, 0.3)
  curlHand(f.hands.R, 0.3)
  f.root.rotation.set(0, 0, 0)
}

// --------------------------------------------------------------------------
// Grounding / gaze helpers
// --------------------------------------------------------------------------
const _w = new Vector3()

/** Lower/raise the figure so its lower foot is exactly on the floor (feet never float or sink) and both feet lie flat. */
export function groundFigure(f: Figure, floorY = 0) {
  flattenFeet(f, floorY)
  f.ftL.getWorldPosition(_w)
  const a = _w.y
  f.ftR.getWorldPosition(_w)
  f.root.position.y += floorY - Math.min(a, _w.y)
  flattenFeet(f, floorY)
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
  flattenFeet(f, floorY)
  const k = f.root.getWorldScale(_w).x
  const pts: [Object3D, number][] = [
    [f.root, 0.1], [f.neck, 0.15], [f.headC, 0.11], [f.tipL, 0.05], [f.tipR, 0.05],
    [f.ftL, 0.0], [f.ftR, 0.0], [f.j.knL, 0.07], [f.j.knR, 0.07], [f.j.elL, 0.05], [f.j.elR, 0.05],
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
