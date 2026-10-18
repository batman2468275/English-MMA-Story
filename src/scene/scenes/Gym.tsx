import { useEffect, useMemo, useRef } from 'react'
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshStandardMaterial,
  NearestFilter,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
} from 'three'
import { createFigure, Figure, groundFigure, limitPose, lookAt, resetPose, solveArm, solveLeg, plantJoint } from '../figure'
import { resolveContacts } from '../contact'
import { rimMaterial, setRimLight } from '../materials'
import { Emit, Glow, Box } from '../shapes'
import { ParticleField } from '../particles'
import { useSceneFrame, count } from '../hooks'
import { setCam, keys } from '../camera'
import { easeInOut, lerp, smooth } from '../../core/math'
import { store } from '../../core/store'
import { metalTexture, woodTexture } from '../procTextures'

/**
 * 09 — WALKING INTO THE GYM. The camera steps through a door into a tight, slightly claustrophobic room (low ceiling, close walls,
 * heavy bags swinging beside you); as the copy progresses the walls slide apart and the full gym opens up behind them:
 * a boxing ring, squat rack, dumbbell wall, mirrors, lockers, banners. Everyone is doing something different, on their own
 * rhythm, and every figure's feet are planted on the mat:
 *   pad work (jab–cross–kick, the holder's mitts take the hit and recoil) · ring sparring (slip, counter, guard) ·
 *   ground work (guard, with exact body contact) · bag work (the bag swings as a real pendulum when hit) · shadow boxing ·
 *   jump rope (rope arcs under the feet on each hop) · back squats · hamstring stretch · a spectator on the bench.
 */
const v = () => new Vector3()
const g0 = v(), g1 = v(), tgt = v(), pole = v(), fw = v(), rt = v(), pt = v(), tmp = v()

const fwdOf = (f: Figure, o: Vector3) => o.set(Math.sin(f.root.rotation.y), 0, Math.cos(f.root.rotation.y))
const rightOf = (f: Figure, o: Vector3) => o.set(-Math.cos(f.root.rotation.y), 0, Math.sin(f.root.rotation.y))
const SEAT_Y = 0.45

/** Punch extension curve with anticipation: pull back a touch, snap out, hold a beat, return. */
function punchCurve(u: number) {
  if (u < 0 || u > 1) return 0
  if (u < 0.2) return -0.14 * easeInOut(u / 0.2)
  if (u < 0.36) return lerp(-0.14, 1, 1 - Math.pow(1 - (u - 0.2) / 0.16, 3))
  if (u < 0.46) return 1
  return 1 - easeInOut((u - 0.46) / 0.54)
}

function boxerStance(f: Figure, t: number, ph: number, amp = 1) {
  const { j } = f
  const bob = Math.sin(t * 5 + ph) * amp
  j.spine.rotation.x = 0.12 + 0.02 * bob
  j.hpL.rotation.x = -0.32 + 0.05 * bob
  j.knL.rotation.x = 0.28 - 0.04 * bob
  j.hpR.rotation.x = 0.28 - 0.05 * bob
  j.knR.rotation.x = 0.18 + 0.04 * bob
  j.hpL.rotation.z = 0.1
  j.hpR.rotation.z = -0.15
  j.shL.rotation.x = -1.1; j.shL.rotation.z = 0.32; j.elL.rotation.x = -1.9
  j.shR.rotation.x = -1.0; j.shR.rotation.z = -0.32; j.elR.rotation.x = -1.9
  j.head.rotation.x = 0.1
}

/** Send a hand toward a world target by extension e (e < 0 = loaded back); the start is the hand's current guard position. */
function throwHand(f: Figure, side: 'L' | 'R', target: Vector3, e: number, weight = 1) {
  const tip = side === 'L' ? f.tipL : f.tipR
  tip.getWorldPosition(g0)
  g1.copy(g0).lerp(target, e)
  rightOf(f, rt)
  pole.copy(rt).multiplyScalar(side === 'R' ? 1 : -1).setY(0.5)
  solveArm(f, side, g1, weight * (Math.abs(e) > 0.001 ? 1 : 0), pole)
}

function matTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = '#7b1c22'; g.fillRect(0, 0, 64, 64); g.fillRect(64, 64, 64, 64)
  g.fillStyle = '#1c1c20'; g.fillRect(64, 0, 64, 64); g.fillRect(0, 64, 64, 64)
  g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 2; g.strokeRect(0, 0, 128, 128)
  for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`; g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2) }
  const t = new CanvasTexture(c)
  t.wrapS = t.wrapT = RepeatWrapping
  t.repeat.set(10, 22)
  t.colorSpace = SRGBColorSpace
  t.magFilter = NearestFilter
  return t
}

function wallTexture() {
  const c = document.createElement('canvas')
  c.width = 256; c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = '#17181d'; g.fillRect(0, 0, 256, 128)
  g.fillStyle = '#1f2027'
  for (let i = 0; i < 8; i++) g.fillRect(i * 32 + 2, 0, 28, 128)
  g.fillStyle = '#2a2b33'; g.fillRect(0, 88, 256, 4)
  const t = new CanvasTexture(c)
  t.wrapS = t.wrapT = RepeatWrapping
  t.repeat.set(14, 1)
  t.colorSpace = SRGBColorSpace
  return t
}

function Barbell({ plates = 2 }: { plates?: number }) {
  return (
    <group>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.014, 0.014, 2.0, 8]} />
        <meshStandardMaterial color="#aab1bb" metalness={0.9} roughness={0.3} />
      </mesh>
      {[-1, 1].map((s) =>
        Array.from({ length: plates }).map((_, i) => (
          <mesh key={s + '-' + i} position={[s * (0.62 + i * 0.07), 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.22 - i * 0.03, 0.22 - i * 0.03, 0.055, 18]} />
            <meshStandardMaterial color={['#c1272d', '#2a5ab0', '#d9d9d9'][i % 3]} roughness={0.5} metalness={0.4} />
          </mesh>
        )),
      )}
    </group>
  )
}

export function Gym() {
  const wallL = useRef<Mesh>(null)
  const wallR = useRef<Mesh>(null)
  const ceil = useRef<Mesh>(null)
  const strips = useRef<Group>(null)
  const leftDecor = useRef<Group>(null)
  const rightDecor = useRef<Group>(null)
  const bags = useRef<(Group | null)[]>([])
  const bar = useRef<Group>(null)
  const bagState = useRef({ th: 0, w: 0 })

  const mats = useMemo(
    () => ({
      floor: new MeshStandardMaterial({ map: matTexture(), roughness: 0.85 }),
      wall: new MeshStandardMaterial({ map: wallTexture(), roughness: 0.9, color: '#b8bcc8' }),
      steel: new MeshStandardMaterial({ map: metalTexture('#8c95a1'), metalness: 0.85, roughness: 0.35 }),
      wood: new MeshStandardMaterial({ map: woodTexture('#6f4a26', [2, 1]), roughness: 0.8 }),
    }),
    [],
  )
  const rim = useMemo(() => rimMaterial('#0a0b10', '#d6e0ff', 2.6, 1.8), [])
  const mobile = store.mobile

  const F = useMemo(() => {
    const mk = () => createFigure(rim)
    return {
      padK: mk(), padH: mk(), spA: mk(), spB: mk(), grA: mk(), grB: mk(), bagMan: mk(), shadow: mk(), rope: mk(), lifter: mk(), stretch: mk(), watcher: mk(),
    }
  }, [rim])
  const ropeGeom = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(26 * 3), 3))
    return g
  }, [])
  const ropeMat = useMemo(() => new LineBasicMaterial({ color: new Color('#e8e0c8') }), [])
  const ropeObj = useMemo(() => {
    const l = new Line(ropeGeom, ropeMat)
    l.frustumCulled = false
    return l
  }, [ropeGeom, ropeMat])

  // focus mitts strapped to the pad holder's hands
  useEffect(() => {
    for (const tip of [F.padH.tipL, F.padH.tipR]) {
      const m = new Mesh(new BoxGeometry(0.3, 0.1, 0.4), new MeshStandardMaterial({ color: '#b0262d', roughness: 0.6, emissive: '#3a0508' }))
      m.position.y = 0.02
      tip.add(m)
    }
  }, [F])

  const bagX = useMemo(() => [-1, 1, -1, 1], [])
  const bagZ = useMemo(() => [-3, -6, -9.5, -12], [])

  useSceneFrame(8, (p, dt, state) => {
    const t = state.clock.elapsedTime
    const open = easeInOut(smooth(0.3, 0.9, p))
    const W = lerp(2.15, 8, open)
    const H = lerp(2.7, 5.2, open)
    if (wallL.current) wallL.current.position.x = -W
    if (wallR.current) wallR.current.position.x = W
    if (ceil.current) ceil.current.position.y = H
    if (strips.current) strips.current.position.y = H - 0.04
    if (leftDecor.current) leftDecor.current.position.x = -W + 0.04
    if (rightDecor.current) rightDecor.current.position.x = W - 0.04

    // light from the fluorescents: silhouettes pick up a cool top-down fill
    tmp.set(0, H - 0.2, -6)
    setRimLight(rim, tmp, '#dfe8ff', 0.9)

    // -------- heavy bags as pendulums (the one being hit gets real impulses; the rest sway on their own)
    const bs = bagState.current
    bs.w += (-(14 * bs.th) - 1.1 * bs.w) * dt // damped pendulum
    bs.th += bs.w * dt
    bags.current.forEach((b, i) => {
      if (!b) return
      b.position.x = bagX[i] * (W - 0.7)
      b.position.y = H
      if (i === 0) {
        b.rotation.z = bs.th * 0.6
        b.rotation.x = bs.th * 1.0
      } else {
        b.rotation.z = Math.sin(t * 1.0 + i * 1.7) * 0.06
        b.rotation.x = Math.cos(t * 0.8 + i) * 0.04
      }
    })

    // ===================================================== PAD WORK (centre): jab – cross – roundhouse kick, then reset
    {
      const { padK: k, padH: h } = F
      resetPose(k); resetPose(h)
      const cyc = (t * 0.28) % 1 // 3.6 s combination
      const uJab = (cyc - 0.05) / 0.2
      const uCross = (cyc - 0.28) / 0.2
      const uKick = (cyc - 0.55) / 0.3
      k.root.rotation.y = Math.PI / 2; h.root.rotation.y = -Math.PI / 2
      boxerStance(k, t, 0);
      const kick = punchCurve(uKick)
      const kickLift = Math.max(0, kick)
      k.root.position.set(-0.78 + 0.05 * Math.sin(t * 2), 0.98, -10.5)
      h.root.position.set(0.7 + 0.07 * Math.max(0, kick) + 0.05 * Math.max(0, punchCurve(uJab)) , 0.98, -10.5)
      h.j.spine.rotation.x = 0.1 + 0.18 * Math.max(0, kick)
      h.j.hpL.rotation.x = -0.25; h.j.hpR.rotation.x = 0.2; h.j.knL.rotation.x = 0.25; h.j.hpL.rotation.z = 0.1; h.j.hpR.rotation.z = -0.1
      // kicker: rear leg swings through (hip flexion + rotation), torso leans away, standing leg pivots
      k.j.hpR.rotation.x = lerp(0.28, -1.15, kickLift)
      k.j.knR.rotation.x = lerp(0.18, 0.2, kickLift)
      k.j.hpR.rotation.z = lerp(-0.15, -0.45, kickLift)
      k.j.spine.rotation.x = 0.12 - 0.22 * kickLift
      k.j.spine.rotation.y = 0.3 * kickLift + 0.35 * Math.max(0, punchCurve(uCross)) - 0.2 * Math.max(0, punchCurve(uJab))
      k.j.knL.rotation.x = 0.3 + 0.2 * kickLift
      limitPose(k); limitPose(h)
      groundFigure(k, 0); groundFigure(h, 0)
      resolveContacts([k, h], { iterations: 2 })
      groundFigure(k, 0); groundFigure(h, 0)
      // mitts: the holder's hands track where the strikes land, then recoil with the impact
      k.root.updateWorldMatrix(true, true); h.root.updateWorldMatrix(true, true)
      h.j.head.getWorldPosition(pt)
      const rec = (u: number) => 0.06 * Math.exp(-Math.max(0, u - 0.36) * 9) * (u > 0.36 && u < 1 ? 1 : 0)
      // mitt positions (holder's left = +Z): high for hands, body height for the kick
      const mittL = tmp.set(h.root.position.x - 0.34 + rec(uCross), lerp(1.4, 1.0, smooth(0.5, 0.58, cyc) * (1 - smooth(0.9, 0.97, cyc))), -10.5 + 0.2).clone()
      const mittR = new Vector3(h.root.position.x - 0.34 + rec(uJab), 1.42, -10.5 - 0.2)
      solveArm(h, 'L', mittL, 1, pole.set(0.2, 0.2, 1))
      solveArm(h, 'R', mittR, 1, pole.set(0.2, 0.2, -1))
      // kicker's hands: lead jab to the right mitt, rear cross to the left mitt
      throwHand(k, 'L', mittR, punchCurve(uJab))
      throwHand(k, 'R', mittL, punchCurve(uCross))
      if (kick > 0.01) {
        const shin = new Vector3(h.root.position.x - 0.34 + rec(uKick) * 0.6, 1.0, -10.5 + 0.12)
        solveLeg(k, 'R', shin, kick, pole.set(0, 1, 0.6))
      }
    }

    // ===================================================== RING SPARRING: jab, slip, counter, guard
    {
      const { spA: a, spB: b } = F
      resetPose(a); resetPose(b)
      a.root.rotation.y = Math.PI / 2; b.root.rotation.y = -Math.PI / 2
      boxerStance(a, t, 1); boxerStance(b, t, 3)
      const orbit = Math.sin(t * 0.35) * 0.4
      const cx = -3.2, cz = -7.5
      a.root.position.set(cx - 0.62 + 0.08 * Math.sin(t * 1.7), 0.98, cz + orbit * 0.5)
      b.root.position.set(cx + 0.62 - 0.08 * Math.sin(t * 1.7 + 1), 0.98, cz + orbit * 0.5)
      const cyc = (t * 0.3) % 1
      const uA = (cyc - 0.1) / 0.2 // A's jab
      const uB = (cyc - 0.55) / 0.22 // B's counter
      const slipA = Math.max(0, punchCurve(uB)) // A slips / blocks the counter
      const slipB = Math.max(0, punchCurve(uA)) // B slips the jab
      b.j.spine.rotation.z = 0.28 * slipB; b.j.head.rotation.z = -0.2 * slipB
      a.j.spine.rotation.z = -0.28 * slipA; a.j.head.rotation.z = 0.2 * slipA
      a.j.spine.rotation.y = 0.3 * Math.max(0, punchCurve(uA))
      b.j.spine.rotation.y = 0.35 * Math.max(0, punchCurve(uB))
      limitPose(a); limitPose(b)
      groundFigure(a, 0.0); groundFigure(b, 0.0)
      a.root.position.y += 0.2; b.root.position.y += 0.2 // standing on the ring canvas
      resolveContacts([a, b], { iterations: 2 })
      a.root.updateWorldMatrix(true, true); b.root.updateWorldMatrix(true, true)
      b.headC.getWorldPosition(pt)
      a.headC.getWorldPosition(g1)
      // strikes land just short of the head's surface (a controlled spar): the glove brushes past the slipped head
      const aim1 = pt.clone().addScaledVector(fwdOf(a, fw), -0.2).add(tmp.set(0, 0.0, -0.06 + 0.12 * slipB))
      const aim2 = g1.clone().addScaledVector(fwdOf(b, fw), -0.2).add(tmp.set(0, 0.0, 0.06 - 0.12 * slipA))
      throwHand(a, 'L', aim1, punchCurve(uA))
      throwHand(b, 'R', aim2, punchCurve(uB))
    }

    // ===================================================== GROUND WORK: B on his back, A in his guard
    {
      const { grA: a, grB: b } = F
      resetPose(a); resetPose(b)
      const sway = Math.sin(t * 0.55)
      const bx = 3.2, bz = -9.5
      // B: on his back, head toward -X; hips bridge to follow A's passing attempts
      b.root.rotation.y = Math.PI / 2
      b.root.rotation.x = -1.5
      b.root.position.set(bx, 0.2, bz)
      b.root.position.z += sway * 0.05
      b.j.hpL.rotation.x = -1.7; b.j.hpR.rotation.x = -1.7
      b.j.knL.rotation.x = 1.9; b.j.knR.rotation.x = 1.9
      b.j.hpL.rotation.z = 0.5; b.j.hpR.rotation.z = -0.5
      b.j.head.rotation.x = 0.2
      // A: kneeling on both knees between B's legs, hips low, posting on his chest
      a.root.rotation.y = -Math.PI / 2
      a.root.position.set(bx + 0.78 + 0.04 * sway, 0.6, bz + 0.12 * sway)
      a.j.hpL.rotation.x = -0.3; a.j.hpR.rotation.x = -0.3
      a.j.knL.rotation.x = 1.6; a.j.knR.rotation.x = 1.6
      a.j.hpL.rotation.z = 0.1; a.j.hpR.rotation.z = -0.1
      a.j.spine.rotation.x = 0.55 + 0.06 * Math.sin(t * 2.3)
      a.j.head.rotation.x = 0.2
      limitPose(a); limitPose(b)
      resolveContacts([a, b], { iterations: 3 })
      plantJoint(a, a.j.knL, 0.07)
      b.root.updateWorldMatrix(true, true); a.root.updateWorldMatrix(true, true)
      // hands: A posts on B's chest (surface), B controls A's collar / grips his biceps; B's legs clamp round A's back
      b.j.spine.getWorldPosition(pt)
      for (const sd of [1, -1] as const) {
        tgt.copy(pt).add(tmp.set(0.05, 0.3 + 0.0, sd * -0.14)) // top of the chest (B is face-up)
        solveArm(a, sd === 1 ? 'L' : 'R', tgt, 0.95, pole.set(0, 0.5, sd * -0.8))
        a.j.shL.getWorldPosition(g0)
        a.j.spine.getWorldPosition(g1)
        tgt.copy(g1).add(tmp.set(0.12, 0.3, sd * 0.2)) // the collar region
        solveArm(b, sd === 1 ? 'R' : 'L', tgt, 0.8, pole.set(0, 0.6, sd * 0.6))
        // legs: ankles crossed behind A's lower back
        a.root.getWorldPosition(g0)
        tgt.set(g0.x + 0.3, 0.32 + 0.04 * sway, g0.z + sd * 0.07)
        solveLeg(b, sd === 1 ? 'R' : 'L', tgt, 0.85, pole.set(0, 1, sd * 0.4))
      }
    }

    // ===================================================== BAG WORK: the hitter and the bag that really swings
    {
      const f = F.bagMan
      resetPose(f)
      f.root.rotation.y = -Math.PI / 2 // faces the bag at -X? (bag 0 is on the left wall)
      f.root.rotation.y = -Math.PI / 2
      boxerStance(f, t, 2)
      const bag = bags.current[0]
      const bagX0 = bagX[0] * (W - 0.7)
      const cyc = (t * 0.7) % 1
      const uL = (cyc - 0.05) / 0.3
      const uR = (cyc - 0.5) / 0.3
      f.root.position.set(bagX0 + 0.9, 0.98, bagZ[0] + 0.0)
      f.root.rotation.y = -Math.PI / 2
      f.j.spine.rotation.y = 0.3 * Math.max(0, punchCurve(uR)) - 0.25 * Math.max(0, punchCurve(uL))
      limitPose(f)
      groundFigure(f, 0)
      f.root.updateWorldMatrix(true, true)
      if (bag) {
        // hit point: front of the bag at chest height
        pt.set(0, -1.45, 0)
        bag.localToWorld(pt)
        pt.y = 1.4
        tgt.copy(pt).add(tmp.set(0.28, 0, 0))
        // impulse on contact (extension passing the contact threshold)
        const hitNow = (u: number) => punchCurve(u) > 0.97 && punchCurve(u - 0.02) <= 0.97
        if (hitNow(uL) || hitNow(uR)) bs.w += -1.4
        throwHand(f, 'L', tgt, punchCurve(uL))
        throwHand(f, 'R', tgt.add(tmp.set(0, 0, 0.0)), punchCurve(uR))
      }
    }

    // ===================================================== SHADOW BOXER: jab–cross–hook, with head movement and footwork
    {
      const f = F.shadow
      resetPose(f)
      boxerStance(f, t, 4)
      f.root.rotation.y = 0.5
      f.root.position.set(-4.6 + Math.sin(t * 0.8) * 0.15, 0.98, -4.5)
      const cyc = (t * 0.33) % 1
      const uJ = (cyc - 0.05) / 0.17
      const uC = (cyc - 0.28) / 0.17
      const uH = (cyc - 0.52) / 0.2
      f.j.spine.rotation.y = 0.35 * Math.max(0, punchCurve(uC)) + 0.5 * Math.max(0, punchCurve(uH)) - 0.2 * Math.max(0, punchCurve(uJ))
      f.j.head.rotation.z = 0.2 * Math.sin(cyc * Math.PI * 4) * 0.5
      limitPose(f)
      groundFigure(f, 0)
      f.root.updateWorldMatrix(true, true)
      fwdOf(f, fw); rightOf(f, rt)
      f.j.shL.getWorldPosition(pt)
      throwHand(f, 'L', tgt.copy(pt).addScaledVector(fw, 0.72).add(tmp.set(0, 0.1, 0)), punchCurve(uJ))
      f.j.shR.getWorldPosition(pt)
      throwHand(f, 'R', tgt.copy(pt).addScaledVector(fw, 0.7).add(tmp.set(0, 0.08, 0)), punchCurve(uC))
      throwHand(f, 'L', tgt.copy(pt).addScaledVector(fw, 0.5).addScaledVector(rt, -0.45).add(tmp.set(0, 0.0, 0)), punchCurve(uH) * 0.85)
    }

    // ===================================================== JUMP ROPE (rope arcs under the feet on each hop)
    if (!mobile) {
      const f = F.rope
      resetPose(f)
      const hz = 2.1
      const ph = (t * hz) % 1
      const hop = Math.max(0, Math.sin(ph * Math.PI * 2)) // up on the first half of each turn
      f.root.rotation.y = Math.PI
      f.root.position.set(4.6, 0.98 + 0.12 * hop, -3.6)
      f.j.hpL.rotation.x = -0.25 * hop; f.j.hpR.rotation.x = -0.25 * hop
      f.j.knL.rotation.x = 0.55 * hop; f.j.knR.rotation.x = 0.55 * hop
      f.j.spine.rotation.x = 0.08
      limitPose(f)
      f.root.updateWorldMatrix(true, true)
      // wrists circle at hip height; the rope passes under the feet at the top of the hop
      const psi = ph * Math.PI * 2 + 0.2
      const L = new Vector3(), R = new Vector3()
      for (const [sd, out] of [[1, L], [-1, R]] as const) {
        f.root.localToWorld(out.set(sd * 0.36, 0.0 + Math.sin(psi + sd) * 0.04, 0.12))
        solveArm(f, sd === 1 ? 'L' : 'R', out, 1, pole.set(sd, -0.4, 0))
      }
      const pos = ropeGeom.getAttribute('position') as BufferAttribute
      for (let i = 0; i < 26; i++) {
        const s = i / 25
        const mid = tmp.set(0, 0, 0).addScaledVector(L, 1 - s).addScaledVector(R, s)
        const sag = Math.sin(Math.PI * s) * 1.05
        mid.y += -Math.cos(psi) * sag + 0.0
        mid.z += Math.sin(psi) * sag * 0.0 + Math.sin(psi) * sag * 0.9
        pos.setXYZ(i, mid.x, mid.y, mid.z)
      }
      pos.needsUpdate = true
      ropeGeom.computeBoundingSphere()
      groundFigure(f, 0.0)
    }

    // ===================================================== BACK SQUAT (barbell rides the traps; hands grip the bar)
    if (!mobile) {
      const f = F.lifter
      resetPose(f)
      const cyc = (t * 0.18) % 1
      const dn = cyc < 0.45 ? easeInOut(cyc / 0.45) : cyc < 0.55 ? 1 : cyc < 0.85 ? 1 - easeInOut((cyc - 0.55) / 0.3) : 0
      f.root.rotation.y = Math.PI
      f.root.position.set(-5.2, 0.98, -12.5)
      f.j.hpL.rotation.x = -1.35 * dn; f.j.hpR.rotation.x = -1.35 * dn
      f.j.knL.rotation.x = 1.9 * dn; f.j.knR.rotation.x = 1.9 * dn
      f.j.hpL.rotation.z = 0.12 + 0.1 * dn; f.j.hpR.rotation.z = -0.12 - 0.1 * dn
      f.j.spine.rotation.x = 0.55 * dn
      f.j.head.rotation.x = -0.2
      limitPose(f)
      groundFigure(f, 0)
      f.root.updateWorldMatrix(true, true)
      if (bar.current) {
        f.j.spine.localToWorld(pt.set(0, 0.6, -0.14))
        bar.current.position.copy(pt)
        for (const sd of [1, -1] as const) {
          f.root.localToWorld(g0.set(0, 0, 0))
          g1.copy(pt).add(tmp.set(sd * 0.42, -0.03, 0))
          solveArm(f, sd === 1 ? 'L' : 'R', g1, 1, pole.set(sd * 0.2, -1, -0.6))
        }
      }
    }

    // ===================================================== STRETCH + SPECTATOR (calm, seated)
    if (!mobile) {
      const s = F.stretch
      resetPose(s)
      const fold = 0.5 + 0.5 * Math.sin(t * 0.5)
      s.root.rotation.y = Math.PI / 2
      s.root.position.set(1.9, 0.14, -4.2)
      s.j.hpL.rotation.x = -1.55; s.j.hpR.rotation.x = -1.55
      s.j.knL.rotation.x = 0.04; s.j.knR.rotation.x = 0.04
      s.j.hpL.rotation.z = 0.08; s.j.hpR.rotation.z = -0.08
      s.j.spine.rotation.x = 0.25 + 0.75 * fold
      s.j.head.rotation.x = 0.1 + 0.3 * fold
      limitPose(s)
      plantJoint(s, s.root, 0.12)
      s.root.updateWorldMatrix(true, true)
      s.ftL.getWorldPosition(g0); s.ftR.getWorldPosition(g1)
      solveArm(s, 'L', g0.add(tmp.set(-0.12 + 0.12 * (1 - fold), 0.11, 0)), 0.9, pole.set(0.8, 0.2, 0))
      solveArm(s, 'R', g1.add(tmp.set(-0.12 + 0.12 * (1 - fold), 0.11, 0)), 0.9, pole.set(-0.8, 0.2, 0))

      const w = F.watcher
      resetPose(w)
      w.root.rotation.y = -Math.PI / 2 - 0.2 // watching the ring
      w.root.position.set(6.4, SEAT_Y + 0.115, -6.5)
      w.j.hpL.rotation.x = -1.5; w.j.hpR.rotation.x = -1.5
      w.j.knL.rotation.x = 1.5; w.j.knR.rotation.x = 1.5
      w.j.hpL.rotation.z = 0.1; w.j.hpR.rotation.z = -0.1
      w.j.spine.rotation.x = 0.25 + 0.04 * Math.sin(t * 1.3)
      limitPose(w)
      w.root.updateWorldMatrix(true, true)
      tmp.set(0, 1.6, -9)
      lookAt(w, tmp, 1)
      for (const sd of [1, -1] as const) {
        w.root.localToWorld(g1.set(sd * 0.18, 0.08, 0.34))
        solveArm(w, sd === 1 ? 'L' : 'R', g1, 0.9, pole.set(sd, -0.6, 0))
      }
    }

    // ---------- camera: through the door, handheld bob, claustrophobic → opening
    const z = keys(p, [{ p: 0, v: [14, 0, 0] }, { p: 0.3, v: [7, 0, 0] }, { p: 0.7, v: [-0.5, 0, 0] }, { p: 0.95, v: [-3.5, 0, 0] }])[0]
    const step = Math.sin(z * 4.4) * 0.035 * (1 - smooth(0.85, 0.97, p))
    setCam(8, state.camera as never, [Math.sin(t * 0.9) * 0.06, 1.62 + step, z], [Math.sin(t * 0.3) * 0.5, 1.45, z - 9], lerp(36, 64, open), dt, { lambda: 6, parallax: 0.12 })
  })

  // static mid-ground detail along the walls: banners, mirrors, lockers (these ride the moving walls)
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -4]} material={mats.floor}>
        <planeGeometry args={[18, 40]} />
      </mesh>
      <mesh ref={wallL} position={[-2.15, 2.6, -4]} rotation={[0, Math.PI / 2, 0]} material={mats.wall}>
        <planeGeometry args={[40, 7]} />
      </mesh>
      <mesh ref={wallR} position={[2.15, 2.6, -4]} rotation={[0, -Math.PI / 2, 0]} material={mats.wall}>
        <planeGeometry args={[40, 7]} />
      </mesh>
      <mesh ref={ceil} position={[0, 2.7, -4]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[18, 40]} />
        <meshStandardMaterial color="#0c0d11" roughness={1} />
      </mesh>
      <mesh position={[0, 3, -24]}>
        <planeGeometry args={[40, 8]} />
        <meshStandardMaterial color="#14151a" roughness={1} />
      </mesh>
      <mesh position={[0, 3, 15.5]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[40, 8]} />
        <meshBasicMaterial color="#030304" />
      </mesh>
      <Glow position={[0, 2, -22]} size={[10, 5]} color="#cfd8ff" opacity={0.25} />

      {/* wall decor that moves with the walls: mirror panels, banners, windows, lockers */}
      <group ref={leftDecor}>
        {[-3, -7.5, -12, -16.5].map((z, i) => (
          <group key={i} position={[0, 1.7, z]} rotation={[0, Math.PI / 2, 0]}>
            <Box position={[0, 0, 0]} size={[2.6, 1.7, 0.05]} color="#0e1218" rough={0.1} metal={0.9} emissive="#2a3a58" ei={0.5} />
            <Box position={[0, 0, -0.03]} size={[2.7, 1.8, 0.03]} color="#2a2d36" />
          </group>
        ))}
        {[-5, -14].map((z, i) => (
          <group key={i} position={[0, 3.1, z]} rotation={[0, Math.PI / 2, 0]}>
            <Emit position={[0, 0, 0]} size={[1.5, 0.7, 0.03]} color={i ? '#1f3a6b' : '#6b1f26'} boost={0.55} />
          </group>
        ))}
      </group>
      <group ref={rightDecor}>
        {Array.from({ length: 6 }).map((_, i) => (
          <group key={i} position={[0, 1.05, -2.5 - i * 1.0]} rotation={[0, -Math.PI / 2, 0]}>
            <Box position={[0, 0, 0]} size={[0.9, 2.1, 0.4]} color="#2a3038" rough={0.5} metal={0.5} />
            <Box position={[0, 0.5, 0.21]} size={[0.5, 0.05, 0.02]} color="#0a0c10" />
          </group>
        ))}
        {[-4, -10].map((z, i) => (
          <group key={i} position={[0, 3.15, z]} rotation={[0, -Math.PI / 2, 0]}>
            <Emit position={[0, 0, 0]} size={[1.8, 0.7, 0.03]} color={i ? '#6b5a1f' : '#1f6b4a'} boost={0.55} />
          </group>
        ))}
        {[-14, -18].map((z, i) => (
          <group key={i} position={[0, 2.8, z]} rotation={[0, -Math.PI / 2, 0]}>
            <Emit position={[0, 0, 0]} size={[2.4, 1.2, 0.03]} color="#9ab8e8" boost={0.9} />
          </group>
        ))}
      </group>

      <group ref={strips}>
        {[-2, -6.5, -11, -15.5, -20, 2.5, 7].map((z, i) => (
          <group key={i} position={[0, 0, z]}>
            <Emit position={[0, 0, 0]} size={[0.3, 0.05, 3.2]} color="#eef3ff" boost={2.2} />
            <Glow position={[0, -0.6, 0]} size={[2.4, 4]} color="#dfe8ff" opacity={0.07} boost={1} />
          </group>
        ))}
      </group>

      {/* heavy bags on chains */}
      {bagX.map((_, i) => (
        <group key={i} ref={(g) => (bags.current[i] = g)} position={[0, 2.7, bagZ[i]]}>
          <mesh position={[0, -0.3, 0]}>
            <cylinderGeometry args={[0.012, 0.012, 0.6, 6]} />
            <meshStandardMaterial color="#555" metalness={0.9} roughness={0.4} />
          </mesh>
          <mesh position={[0, -1.15, 0]}>
            <cylinderGeometry args={[0.24, 0.23, 1.15, 16]} />
            <meshStandardMaterial color={i % 2 ? '#2a1517' : '#17202a'} roughness={0.6} metalness={0.1} />
          </mesh>
          {[-0.5, -1.15, -1.7].map((y) => (
            <mesh key={y} position={[0, y, 0]}>
              <torusGeometry args={[0.245, 0.012, 6, 20]} />
              <meshStandardMaterial color="#c8a85c" roughness={0.5} metalness={0.7} />
            </mesh>
          ))}
        </group>
      ))}

      {/* boxing ring (back left): canvas, corner posts, three ropes */}
      <group position={[-3.2, 0, -7.5]}>
        <Box position={[0, 0.1, 0]} size={[4.0, 0.2, 4.0]} color="#1a1a22" rough={0.8} />
        <Box position={[0, 0.205, 0]} size={[3.9, 0.02, 3.9]} color="#3a2a50" rough={0.9} />
        {[[-1.9, -1.9], [1.9, -1.9], [-1.9, 1.9], [1.9, 1.9]].map(([x, z], i) => (
          <group key={i} position={[x, 0, z]}>
            <mesh position={[0, 0.85, 0]}>
              <cylinderGeometry args={[0.05, 0.05, 1.5, 8]} />
              <meshStandardMaterial color="#9ca3af" metalness={0.8} roughness={0.4} />
            </mesh>
            <Box position={[0, 0.9, 0]} size={[0.14, 0.9, 0.14]} color={i % 2 ? '#c1272d' : '#2a5ab0'} rough={0.9} />
          </group>
        ))}
        {[0.55, 0.9, 1.25].map((y, k) => (
          <group key={k}>
            {[-1.9, 1.9].map((z) => (
              <mesh key={'x' + z} position={[0, y, z]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.022, 0.022, 3.8, 6]} />
                <meshStandardMaterial color={k === 1 ? '#c1272d' : '#d9d9d9'} roughness={0.7} />
              </mesh>
            ))}
            {[-1.9, 1.9].map((x) => (
              <mesh key={'z' + x} position={[x, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.022, 0.022, 3.8, 6]} />
                <meshStandardMaterial color={k === 1 ? '#c1272d' : '#d9d9d9'} roughness={0.7} />
              </mesh>
            ))}
          </group>
        ))}
      </group>

      {/* squat rack + barbell (the lifter's bar follows his shoulders) */}
      <group position={[-5.2, 0, -12.5]}>
        {[-0.75, 0.75].map((x) => (
          <group key={x}>
            <Box position={[x, 1.1, 0.5]} size={[0.07, 2.2, 0.07]} color="#6b7280" rough={0.4} metal={0.8} />
            <Box position={[x, 1.1, -0.5]} size={[0.07, 2.2, 0.07]} color="#6b7280" rough={0.4} metal={0.8} />
            <Box position={[x, 2.2, 0]} size={[0.07, 0.07, 1.07]} color="#6b7280" rough={0.4} metal={0.8} />
            <Box position={[x, 0.04, 0]} size={[0.07, 0.08, 1.4]} color="#6b7280" rough={0.4} metal={0.8} />
          </group>
        ))}
      </group>
      <group ref={bar}>
        <Barbell plates={3} />
      </group>
      {/* dumbbell rack + kettlebells on the back wall */}
      <group position={[6.2, 0, -14]}>
        <Box position={[0, 0.5, 0]} size={[0.5, 0.05, 2.6]} color="#2a2d36" rough={0.5} metal={0.6} />
        <Box position={[0, 0.9, 0]} size={[0.5, 0.05, 2.6]} color="#2a2d36" rough={0.5} metal={0.6} />
        {Array.from({ length: 8 }).map((_, i) => (
          <mesh key={i} position={[0, (i % 2 ? 0.98 : 0.58), -1.1 + (i >> 1) * 0.62]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.04, 0.04, 0.34, 8]} />
            <meshStandardMaterial color="#1b1d22" metalness={0.8} roughness={0.4} />
          </mesh>
        ))}
        {[-0.6, 0, 0.6].map((z, i) => (
          <mesh key={i} position={[0.0, 0.22, z]}>
            <sphereGeometry args={[0.15 + i * 0.015, 12, 10]} />
            <meshStandardMaterial color="#17171b" roughness={0.5} metalness={0.5} />
          </mesh>
        ))}
      </group>
      {/* bench for the spectator */}
      <Box position={[6.4, 0.4, -6.5]} size={[0.5, 0.1, 1.8]} color="#2a2d36" rough={0.5} metal={0.5} />

      {/* the people */}
      <primitive object={F.padK.root} />
      <primitive object={F.padH.root} />
      <primitive object={F.bagMan.root} />
      <primitive object={F.shadow.root} />
      {!mobile && (
        <>
          <primitive object={F.spA.root} />
          <primitive object={F.spB.root} />
          <primitive object={F.grA.root} />
          <primitive object={F.grB.root} />
          <primitive object={F.rope.root} />
          <primitive object={F.lifter.root} />
          <primitive object={F.stretch.root} />
          <primitive object={F.watcher.root} />
          <primitive object={ropeObj} />
        </>
      )}
      <ParticleField count={count(200)} box={[10, 5, 30]} vel={[0, 0.05, 0]} size={7} color="#dfe6ff" opacity={0.35} position={[0, 2.4, -6]} seed={66} />
    </group>
  )
}
