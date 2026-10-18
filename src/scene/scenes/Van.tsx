import { useMemo } from 'react'
import { Vector3 } from 'three'
import { createFigure, Figure, limitPose, liftAboveFloor, lookAt, resetPose, setHand, solveArm } from '../figure'
import { resolveContacts } from '../contact'
import { glowMaterial, rimMaterial } from '../materials'
import { Cage } from '../Cage'
import { ParticleField } from '../particles'
import { Glow } from '../shapes'
import { useSceneFrame, count } from '../hooks'
import { setCam, keys } from '../camera'
import { clamp01, easeInOut, lerp, smooth } from '../../core/math'
import { store } from '../../core/store'
import { VAN_HIT, GP_CONTACT } from '../../core/fx'

/**
 * 04 — JOSHUA VAN. A real exchange, built from weighted phases (all pure functions of scroll progress, so it scrubs both ways):
 *
 *   feel-out  (0 → .33)    both fighters bounce on planted feet, feint and circle
 *   wind-up   (.338 → .39) Van loads the overhand: hand cocks back behind the head, torso twists away, weight shifts
 *   impact    (.40)        the fist arrives on Royval's jaw (hand meets the head *surface*, never inside it)
 *   follow    (.40 → .44)  the punch carries through, torso rotates, Royval's head whips and his knees go
 *   fall      (.40 → .56)  stagger → collapse → he lands on his back (body rests on the mat, limbs flop in sequence)
 *   follow-up (.44 → .56)  Van steps in and drops to one knee beside his torso
 *   pound     (.52 → .95)  alternating strikes: wind-up high, drive down onto the head surface, rebound — Royval covers up, then goes limp
 *
 * Feet are planted with `restOnFloor`, bodies are pushed apart by the contact solver, and hands are IK-pinned to the *surface*
 * of the head, so nothing intersects. Flash / shake / shockwave / hand overlay come from core/fx.ts + ui/FxOverlay.tsx.
 */
const S0 = 0.338
const S1 = 0.438
const N_STRIKES = 11

const v = () => new Vector3()
const roy_head = v()
const van_head = v()
const shR = v()
const shL = v()
const target = v()
const tmp = v()
const G = v()
const C0 = v()
const M = v()
const I = v()
const F = v()
const pole = v()
const right = v()
const fwd = v()
const side = v()
const tmpA = v()
const tmpB = v()

const easeOutQuad = (x: number) => 1 - (1 - x) * (1 - x)
const easeIn2 = (x: number) => x * x

/** Orthodox fighting stance, FK only: planted staggered feet, knees soft, guard up with elbows out of the ribs. */
function stance(f: Figure, t: number, ph: number, amt = 1) {
  const bob = Math.sin(t * 5.2 + ph) * amt
  const { j } = f
  j.spine.rotation.x = 0.12 + 0.025 * bob
  j.hpL.rotation.x = -0.34 + 0.06 * bob
  j.knL.rotation.x = 0.3 - 0.05 * bob
  j.hpR.rotation.x = 0.3 - 0.06 * bob
  j.knR.rotation.x = 0.2 + 0.05 * bob
  j.hpL.rotation.z = 0.1
  j.hpR.rotation.z = -0.16
  j.shL.rotation.x = -1.1
  j.shL.rotation.z = 0.32
  j.elL.rotation.x = -1.9
  j.shR.rotation.x = -1.0
  j.shR.rotation.z = -0.32
  j.elR.rotation.x = -1.9
  j.head.rotation.x = 0.1
}

/** Cubic-ish path through wind-up → travel → impact → follow-through for one punch (s: 0..1, impact at s = 0.62). */
function strikePath(s: number, out: Vector3, g: Vector3, c0: Vector3, m: Vector3, i: Vector3, f: Vector3) {
  if (s < 0.35) {
    // anticipation: the hand loads back and up, slowly, with a tiny extra pull at the end
    const e = easeInOut(s / 0.35)
    return out.copy(g).lerp(c0, e).addScaledVector(c0.clone().sub(g).normalize(), 0.03 * Math.sin(Math.PI * e))
  }
  if (s < 0.62) {
    // travel: accelerates hard along a quadratic arc
    const t = easeIn2((s - 0.35) / 0.27)
    const a = tmpA.copy(c0).lerp(m, t)
    const b = tmpB.copy(m).lerp(i, t)
    return out.copy(a).lerp(b, t)
  }
  // follow-through: decelerates past the target
  return out.copy(i).lerp(f, easeOutQuad((s - 0.62) / 0.38))
}

export function Van() {
  const van = useMemo(() => createFigure(rimMaterial('#05060a', '#fff1d0', 2.2, 2.1), 1), [])
  const roy = useMemo(() => createFigure(rimMaterial('#05060a', '#ff4a3a', 2.2, 2.1), 1), [])
  const beam = useMemo(() => glowMaterial('#ffffff', 0.5), [])

  useSceneFrame(3, (p, dt, state) => {
    const t = state.clock.elapsedTime
    resetPose(van)
    resetPose(roy)

    // ================================================== phases
    const sRaw = (p - S0) / (S1 - S0)
    const sP = clamp01(sRaw)
    const strikeW = smooth(S0 - 0.02, S0 + 0.012, p) * (1 - smooth(S1 + 0.005, S1 + 0.045, p))
    const u = clamp01((p - VAN_HIT) / 0.16) // Royval's reaction timeline
    const pre = smooth(VAN_HIT - 0.003, VAN_HIT + 0.004, p) // 0 → 1 the instant the punch lands
    const fall = pre * (u < 0.35 ? 0.2 * easeOutQuad(u / 0.35) : 0.2 + 0.8 * easeInOut((u - 0.35) / 0.65))
    const kneel = smooth(0.44, 0.545, p)
    const gp = clamp01((p - 0.52) / 0.43) // ground-and-pound progress
    const limp = smooth(0.62, 0.95, gp)
    // ground-and-pound cadence: strike k alternates hands; `swing` is the torso/hip rotation (wind-up away → drive through → recover)
    const gph = gp * N_STRIKES
    const gIdx = Math.floor(Math.min(gph, N_STRIKES - 1e-6))
    const gS = gph - gIdx
    const gAct = gp > 0 && gp < 1 ? smooth(0.0, 0.05, gp) * (1 - smooth(0.93, 1, gp)) : 0
    const sgn = gIdx % 2 === 0 ? 1 : -1 // +1: right hand strikes
    const swing =
      gS < GP_CONTACT * 0.72 ? -0.35 * easeInOut(gS / (GP_CONTACT * 0.72))
        : gS < GP_CONTACT ? lerp(-0.35, 0.5, easeIn2((gS - GP_CONTACT * 0.72) / (GP_CONTACT * 0.28)))
          : gS < 0.82 ? lerp(0.5, 0.12, easeInOut((gS - GP_CONTACT) / (0.82 - GP_CONTACT)))
            : lerp(0.12, 0, easeInOut((gS - 0.82) / 0.18))
    const snapT = (p - VAN_HIT) / 0.02
    const bump = smooth(0, 0.15, snapT) * (1 - smooth(0.4, 1.7, snapT))

    // ================================================== ROYVAL (faces -X, falls backwards toward +X)
    stance(roy, t, 1.7, 1 - fall)
    roy.root.rotation.y = -Math.PI / 2
    // stagger: head whips round, knees go, hips fold, then the whole body folds down
    roy.j.head.rotation.y = -0.8 * bump
    roy.j.head.rotation.x = -0.4 * bump + fall * 0.1
    roy.j.spine.rotation.x = lerp(roy.j.spine.rotation.x, -0.25, pre * Math.min(1, u * 3)) // folds, doesn't snap straight
    roy.j.hpL.rotation.x = lerp(roy.j.hpL.rotation.x, -0.95, fall)
    roy.j.hpR.rotation.x = lerp(roy.j.hpR.rotation.x, -0.55, fall)
    roy.j.knL.rotation.x = lerp(roy.j.knL.rotation.x, 1.25, fall)
    roy.j.knR.rotation.x = lerp(roy.j.knR.rotation.x, 0.8, fall)
    roy.j.hpL.rotation.z = lerp(roy.j.hpL.rotation.z, 0.2, fall)
    roy.j.hpR.rotation.z = lerp(roy.j.hpR.rotation.z, -0.18, fall)
    // arms are thrown up as he goes, then (if not covering) fall limp to the mat
    const flail = Math.sin(Math.PI * clamp01(u / 0.55)) * pre
    roy.j.shL.rotation.x = lerp(roy.j.shL.rotation.x, -2.1, flail)
    roy.j.shR.rotation.x = lerp(roy.j.shR.rotation.x, -1.8, flail)
    roy.j.elL.rotation.x = lerp(roy.j.elL.rotation.x, -0.4, flail)
    roy.j.elR.rotation.x = lerp(roy.j.elR.rotation.x, -0.6, flail)
    const dead = smooth(0.55, 0.9, u) * limp
    roy.j.shL.rotation.x = lerp(roy.j.shL.rotation.x, -0.25, dead)
    roy.j.shR.rotation.x = lerp(roy.j.shR.rotation.x, -0.25, dead)
    roy.j.shL.rotation.z = lerp(roy.j.shL.rotation.z, 0.75, dead)
    roy.j.shR.rotation.z = lerp(roy.j.shR.rotation.z, -0.75, dead)
    roy.j.elL.rotation.x = lerp(roy.j.elL.rotation.x, -0.1, dead)
    roy.j.elR.rotation.x = lerp(roy.j.elR.rotation.x, -0.1, dead)
    // each ground strike jolts his head
    let rzShift = 0
    if (gp > 0 && gp < 1) {
      const ph = gp * N_STRIKES
      const sIn = ph - Math.floor(ph)
      const jolt = Math.exp(-Math.max(0, sIn - GP_CONTACT) * 14) * (sIn > GP_CONTACT ? 1 : 0) * (1 - limp * 0.6)
      roy.j.head.rotation.y += (Math.floor(ph) % 2 ? 1 : -1) * 0.22 * jolt
      roy.j.head.rotation.x += -0.12 * jolt
      // the body takes the blow too: hips skid, knees pinch in, shoulders roll
      roy.j.hpL.rotation.z -= 0.08 * jolt * (1 - limp)
      roy.j.hpR.rotation.z += 0.08 * jolt * (1 - limp)
      roy.j.spine.rotation.z += (Math.floor(ph) % 2 ? 1 : -1) * 0.06 * jolt
      rzShift = (Math.floor(ph) % 2 ? 1 : -1) * 0.025 * jolt
    }
    roy.root.rotation.x = -fall * 1.5
    roy.root.position.x = 1.2 + 0.7 * fall * fall + (strikeW > 0 ? 0.08 * pre : 0)
    roy.root.position.z = 0.02 * Math.sin(t * 5.2) * (1 - fall) + rzShift
    roy.root.updateWorldMatrix(true, true)
    liftAboveFloor(roy, 0, true)

    // ================================================== VAN
    stance(van, t, 0.4, 1 - kneel)
    // set-up footwork during the feel-out: he glides in and out of range
    const glide = Math.sin(t * 1.3) * 0.06 * (1 - smooth(0.25, 0.33, p))
    const lunge = smooth(0.34, 0.405, p) // steps in with the overhand
    van.root.rotation.y = lerp(Math.PI / 2, 0.38, kneel)
    // kneel pose (half-kneel on the right knee) blended in
    const { j } = van
    j.hpL.rotation.x = lerp(j.hpL.rotation.x, -1.5, kneel)
    j.knL.rotation.x = lerp(j.knL.rotation.x, 1.5, kneel)
    j.hpR.rotation.x = lerp(j.hpR.rotation.x, 0.02, kneel)
    j.knR.rotation.x = lerp(j.knR.rotation.x, 1.62, kneel)
    j.hpL.rotation.z = lerp(j.hpL.rotation.z, 0.12, kneel)
    j.hpR.rotation.z = lerp(j.hpR.rotation.z, -0.1, kneel)
    // lunge: lead knee drives forward, rear leg extends
    j.hpL.rotation.x += -0.4 * lunge * (1 - kneel)
    j.knL.rotation.x += 0.35 * lunge * (1 - kneel)
    j.hpR.rotation.x += 0.25 * lunge * (1 - kneel)
    // torso twist for the overhand: loads away, then drives through
    const twist =
      sRaw < 0 ? 0 : sRaw < 0.35 ? -0.45 * easeInOut(sRaw / 0.35) : sRaw < 0.62 ? lerp(-0.45, 0.55, easeIn2((sRaw - 0.35) / 0.27)) : sRaw < 1 ? lerp(0.55, 0.15, easeInOut((sRaw - 0.62) / 0.38)) : 0.15 * (1 - kneel)
    j.spine.rotation.y = twist * (1 - kneel) + sgn * swing * kneel * gAct
    j.spine.rotation.x = lerp(j.spine.rotation.x, 1.15, kneel) + 0.08 * lunge * (1 - kneel) + 0.14 * Math.max(0, swing) * gAct * kneel
    j.hpL.rotation.z += sgn * 0.05 * swing * gAct * kneel
    j.head.rotation.x = lerp(j.head.rotation.x, 0.4, kneel)
    // placement: stands off at range, steps in, then drops beside Royval's torso on the far (−Z) side
    roy.j.head.getWorldPosition(roy_head)
    const standX = -1.28 + glide + 0.6 * lunge
    van.root.position.x = lerp(standX, roy_head.x - 0.62, kneel)
    van.root.position.z = lerp(0, -0.58, kneel) + sgn * 0.03 * swing * gAct * kneel // hips shift into each strike
    van.root.rotation.y += sgn * 0.1 * swing * gAct * kneel
    van.root.position.y = 0.98
    van.root.updateWorldMatrix(true, true)
    liftAboveFloor(van, 0, true)

    // keep the two bodies from intersecting (forearms are free: hands are placed on surfaces by IK)
    resolveContacts([van, roy], { iterations: 3, margin: 0.01 })
    van.root.position.y = Math.max(van.root.position.y, 0)
    liftAboveFloor(van, 0, true)
    liftAboveFloor(roy, 0, true)
    limitPose(van)
    limitPose(roy)

    roy.headC.getWorldPosition(roy_head)
    van.headC.getWorldPosition(van_head)
    lookAt(van, roy_head, 1)
    lookAt(roy, van_head, 1 - fall)

    // ================================================== hands
    const k = 1
    const psi = van.root.rotation.y
    fwd.set(Math.sin(psi), 0, Math.cos(psi))
    right.set(-Math.cos(psi), 0, Math.sin(psi)) // the fighter's right-hand side in world space

    // fists: closed in the stance and on the striking hand, relaxed on the posting hand
    for (const sd of ['L', 'R'] as const) {
      setHand(van, sd, 0.9 * (1 - kneel) + 0.3 * kneel)
      setHand(roy, sd, 0.9 * (1 - fall) + 0.55 * fall * (1 - limp))
    }
    // Royval covers his face, then his guard drops as he is knocked out of it
    const cover = smooth(0.12, 0.3, u) * (1 - limp) * pre * smooth(0.35, 0.6, fall + 0.4 * u)
    if (cover > 0.02) {
      for (const sd of [1, -1] as const) {
        target.set(roy_head.x - 0.02, roy_head.y + 0.3, roy_head.z + sd * 0.13)
        pole.set(0, 0.4, sd * 1)
        solveArm(roy, sd === 1 ? 'L' : 'R', target, cover, pole)
      }
    }

    // the knock-down overhand right (standing) -------------------------------------------------------------
    if (strikeW > 0.001 && kneel < 0.6) {
      van.tipR.getWorldPosition(G) // current guard position = start of the path
      van.j.shR.getWorldPosition(shR)
      // impact point on the *surface* of his jaw, on the side facing Van
      side.copy(shR).sub(roy_head)
      side.y *= 0.25
      side.normalize()
      I.copy(roy_head).addScaledVector(side, 0.115 * k + 0.04)
      I.y -= 0.03
      C0.copy(van_head).addScaledVector(fwd, -0.2).addScaledVector(right, 0.2)
      C0.y += 0.1
      M.copy(C0).lerp(I, 0.5)
      M.y += 0.3
      M.addScaledVector(right, 0.08)
      F.copy(I).addScaledVector(fwd, 0.3).addScaledVector(right, -0.08)
      F.y -= 0.1
      strikePath(sP, target, G, C0, M, I, F)
      pole.copy(right).multiplyScalar(1).add(tmp.set(0, 0.6, 0))
      solveArm(van, 'R', target, strikeW * (1 - kneel), pole)
    }

    // ground-and-pound: alternating hands, each with wind-up → drive → contact → rebound ----------------------------
    if (kneel > 0.2) {
      const ph = Math.max(0, gp) * N_STRIKES
      const idx = Math.floor(ph)
      const sIn = ph - idx
      const active = smooth(0.0, 0.05, gp) * kneel
      for (const sd of [1, -1] as const) {
        const mine = (idx % 2 === 0) === (sd === -1) // right hand on even strikes
        const sh = sd === 1 ? shL : shR
        van.j[sd === 1 ? 'shL' : 'shR'].getWorldPosition(sh)
        // support hand: posts on his chest / shoulder, forearm vertical, taking some of the weight
        const post = tmp.copy(roy_head).add(side.set(0.28, -0.04, sd * 0.16 - 0.1))
        post.y = Math.max(0.08, post.y - 0.06)
        let w = 0.9 * kneel
        if (mine && gp > 0.001 && gp < 1) {
          const wind = easeInOut(clamp01(sIn / 0.45))
          const drive = easeIn2(clamp01((sIn - 0.45) / 0.17))
          const rebound = easeOutQuad(clamp01((sIn - 0.7) / 0.3))
          // surface of the face (top, since he is lying face up), slightly off-centre for each hand
          I.set(roy_head.x - sd * 0.0, roy_head.y + 0.115 + 0.04, roy_head.z + sd * 0.035)
          // wind-up position: high, behind, slightly outward
          C0.set(I.x - 0.06, I.y + 0.62 * (1 - 0.15 * (idx % 3)), I.z - 0.2 + sd * 0.05)
          if (sIn < 0.45) target.copy(post).lerp(C0, wind)
          else if (sIn < 0.62) target.copy(C0).lerp(I, drive)
          else if (sIn < 0.7) target.copy(I)
          else target.copy(I).lerp(C0, rebound * 0.7)
          w = Math.max(w, active)
          pole.set(0, 1, -0.8)
          solveArm(van, sd === 1 ? 'L' : 'R', target, w, pole)
          setHand(van, sd === 1 ? 'L' : 'R', 1)
        } else if (kneel > 0.3) {
          pole.set(0, 0.5, -0.5)
          solveArm(van, sd === 1 ? 'L' : 'R', post, w * 0.8, pole)
        }
      }
    }

    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__van = { van, roy }

    // ================================================== camera: side view, then a slow-motion push-in
    // The camera is framed *relative to the fighters* (their midpoint), so both are always in shot whatever the choreography does.
    roy.root.getWorldPosition(roy_head)
    van.root.getWorldPosition(van_head)
    const midX = (roy_head.x + van_head.x) / 2
    const midZ = (roy_head.z + van_head.z) / 2
    const spread = Math.hypot(roy_head.x - van_head.x, roy_head.z - van_head.z)
    const off = keys(p, [
      { p: 0, v: [-0.3, 0.75, 6.4] }, // dx, height, distance
      { p: 0.3, v: [0.0, 0.6, 5.4] },
      { p: 0.4, v: [0.3, 0.45, 4.5] },
      { p: 0.55, v: [0.2, 0.3, 3.9] },
      { p: 0.8, v: [0.1, 0.25, 3.3] },
      { p: 1, v: [0.1, 0.15, 2.6] },
    ])
    const dist = off[2] + Math.max(0, spread - 1.4) * 0.9
    const pos: [number, number, number] = [midX + off[0], 0.6 + off[1] + 0.55 * smooth(0.4, 0.6, p), midZ + dist]
    const look: [number, number, number] = [midX, lerp(1.15, 0.28, smooth(0.35, 0.6, p)), midZ]
    setCam(3, state.camera as never, pos, look, 52 - smooth(0.4, 1, p) * 14, dt, { lambda: 4.5, parallax: 0.12 })
  })

  return (
    <group>
      {/* arena floor */}
      <mesh rotation={[-Math.PI / 2, 0, Math.PI / 8]}>
        <circleGeometry args={[6, 8]} />
        <meshStandardMaterial color="#14141a" roughness={0.5} metalness={0.5} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, Math.PI / 8]} position={[0, 0.005, 0]}>
        <ringGeometry args={[3.6, 3.7, 8]} />
        <meshBasicMaterial color="#ff4757" toneMapped={false} />
      </mesh>
      <Cage assemble={() => 1} glow={() => 0.5} door={false} radius={6} height={4} thickness={0.06} />
      {/* spotlight shaft */}
      <mesh position={[0, 6.2, 0]} material={beam}>
        <coneGeometry args={[4.4, 12.4, 28, 1, true]} />
      </mesh>
      <Glow position={[0, 0.3, 0]} size={[12, 5]} color="#ffffff" opacity={0.25} />
      <primitive object={van.root} />
      <primitive object={roy.root} />
      <ParticleField count={count(260)} box={[44, 14, 30]} vel={[0, 0.02, 0]} size={30} color="#ffb48a" opacity={0.55} position={[0, 7, -22]} seed={31} />
      <ParticleField
        count={count(420)}
        box={[14, 8, 14]}
        vel={[0, 0.25, 0]}
        size={10}
        color="#ffffff"
        opacity={0.6}
        position={[0, 3, 0]}
        seed={32}
        shock={() => ({ r: store.fx.shockR >= 0 ? store.fx.shockR * 16 : -10, amp: store.fx.shockAmp })}
      />
    </group>
  )
}
