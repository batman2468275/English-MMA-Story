import { useMemo, useRef } from 'react'
import { InstancedMesh, Object3D, Quaternion, Vector3 } from 'three'
import { createFigure, limitPose, lookAt, resetPose, solveArm, groundFigure, palmFacing, setHand } from '../figure'
import { glowMaterial, rimMaterial } from '../materials'
import { Glow } from '../shapes'
import { ParticleField } from '../particles'
import { useSceneFrame, count } from '../hooks'
import { setCam, keys } from '../camera'
import { clamp01, lerp, mulberry32, smooth } from '../../core/math'
import { store } from '../../core/store'

/**
 * 06 — QUIET: time stops. A believable freeze-frame rather than things merely halting:
 *  • every droplet follows a real ballistic path (splash crowns thrown up from the floor, rain falling with drag);
 *    the clock is warped so motion *decelerates* to nothing, and the streak-stretch of each drop relaxes to a round bead
 *    as its speed dies — so the frame is caught with drops at all different phases of their arcs (rising, apex, falling);
 *  • the boy is caught mid-gasp (shoulders up, chest full, head tipped toward the sound) with his dad's hand just
 *    landing over his eyes and the other on his shoulder; micro-motion (breathing, tremor) fades to zero with the clock.
 * All of it is a pure function of scroll progress, so scrolling back un-freezes the room.
 */
const G = 3.2 // gravity in "slow-motion" world units
const TAU_FREEZE = 2.5 // the instant the world is stopped on
const tmpV = new Vector3()
const tmpQ = new Quaternion()
const UP = new Vector3(0, 1, 0)
const dummy = new Object3D()
const V = () => new Vector3()
const startL = V(), faceL = V(), faceP = V(), handT = V(), poleL = V(), faceDir = V(), tmpB = V(), tmpC = V()
const startR = V(), shoulderP = V(), handR = V(), poleR = V(), wristP = V(), startB = V(), handB = V(), poleB = V()
const lagP = V(), lagV = V()
let lagInit = false
const easeIn = (x: number) => x * x
const easeOut = (x: number) => 1 - (1 - x) * (1 - x)
/** reach with anticipation: a small pull back, then an ease-out to the target (x: 0..1 → -0.05..1) */
const reachCurve = (x: number) => (x < 0.2 ? -0.05 * Math.sin((Math.PI * x) / 0.2) : easeOut((x - 0.2) / 0.8))

/** warped clock: runs at normal speed, then decelerates exponentially to a halt (speed = flow(p)). */
const P0 = 0.03
const K = 22
const flow = (p: number) => (p < P0 ? 1 : Math.exp(-K * (p - P0)))
const tau = (p: number) => 0.9 + (p < P0 ? p * 40 : 40 * P0 + (40 / K) * (1 - Math.exp(-K * (p - P0))))

interface Drop {
  kind: 'crown' | 'rain'
  // crown: origin on the floor + launch velocity ; rain: start height + fall speed
  x: number; y: number; z: number
  vx: number; vy: number; vz: number
  t0: number // launch time
  r: number
}

export function Quiet() {
  const boy = useMemo(() => createFigure(rimMaterial('#0b0b0d', '#e8e8ea', 2.6, 1.5), 0.92), [])
  const dad = useMemo(() => createFigure(rimMaterial('#0b0b0d', '#dcdcde', 2.6, 1.3), 1.08), [])
  const beam = useMemo(() => glowMaterial('#ffffff', 0.42), [])
  const drops = useRef<InstancedMesh>(null)

  const list = useMemo<Drop[]>(() => {
    const r = mulberry32(19)
    const out: Drop[] = []
    // splash crowns stay clear of the two figures (no stray stacked beads next to the boy's head)
    const crowns = [[-2.0, 0.6], [2.2, 1.2], [-1.4, -1.4], [1.9, -1.5]]
    const perCrown = store.mobile ? 12 : 22
    crowns.forEach(([cx, cz], ci) => {
      for (let i = 0; i < perCrown; i++) {
        const a = (i / perCrown) * Math.PI * 2 + r() * 0.3
        const vh = 0.4 + r() * 0.9
        out.push({
          kind: 'crown', x: cx, y: 0.05, z: cz,
          vx: Math.cos(a) * vh, vy: 2.0 + r() * 1.9, vz: Math.sin(a) * vh,
          t0: ci * 0.32 + 0.1 + r() * 0.5, // launched at different moments → different phases when frozen
          r: 0.018 + r() * 0.03,
        })
      }
      // central jet
      for (let i = 0; i < 4; i++) out.push({ kind: 'crown', x: cx, y: 0.05, z: cz, vx: (r() - 0.5) * 0.2, vy: 3.2 + r() * 1.2, vz: (r() - 0.5) * 0.2, t0: ci * 0.32 + 0.3 + i * 0.12, r: 0.03 + r() * 0.02 })
    })
    const nRain = store.mobile ? 36 : 70
    for (let i = 0; i < nRain; i++) {
      let rx = (r() - 0.5) * 6.5
      if (Math.abs(rx - 0.3) < 1.0) rx += rx < 0.3 ? -1.1 : 1.1 // keep the figures' column free of drops
      out.push({ kind: 'rain', x: rx, y: 2 + r() * 4.5, z: (r() - 0.5) * 6 - 0.4, vx: 0.15, vy: -(2.2 + r() * 1.6), vz: 0, t0: 0, r: 0.012 + r() * 0.014 })
    }
    return out
  }, [])

  useSceneFrame(5, (p, dt, state) => {
    const t = state.clock.elapsedTime
    const f = flow(p) // 1 → 0
    const tt = tau(p)

    // ------------------------------------------------ droplets on ballistic arcs
    const m = drops.current
    if (m) {
      list.forEach((d, i) => {
        let x: number, y: number, z: number, vx: number, vy: number, vz: number
        let visible = true
        if (d.kind === 'crown') {
          const s = tt - d.t0
          if (s < 0) visible = false
          x = d.x + d.vx * s
          z = d.z + d.vz * s
          y = d.y + d.vy * s - 0.5 * G * s * s
          vx = d.vx; vz = d.vz; vy = d.vy - G * s
          if (y < 0.02) visible = false // already landed
        } else {
          const drag = 1 - Math.exp(-0.9 * tt)
          // rain wraps so the sky is full; each drop falls with a little drag and drifts sideways
          const H = 6.5
          const yy = d.y + d.vy * tt * (0.65 + 0.35 * drag)
          y = ((yy % H) + H) % H
          x = d.x + d.vx * tt
          z = d.z
          vx = d.vx; vy = d.vy; vz = 0
        }
        if (!visible) {
          dummy.position.set(0, -10, 0)
          dummy.scale.setScalar(0.0001)
        } else {
          dummy.position.set(x, y, z)
          // streak length ∝ speed × clock speed: it relaxes to a round bead as time stops
          const speed = Math.hypot(vx, vy, vz)
          const stretch = 1 + Math.min(5, speed * 1.1) * f * (d.kind === 'rain' ? 1.4 : 0.9)
          tmpV.set(vx, vy, vz).normalize()
          tmpQ.setFromUnitVectors(UP, tmpV)
          dummy.quaternion.copy(tmpQ)
          dummy.scale.set(d.r, d.r * stretch, d.r)
        }
        dummy.updateMatrix()
        m.setMatrixAt(i, dummy.matrix)
      })
      m.instanceMatrix.needsUpdate = true
    }

    // ------------------------------------------------ the boy, and his dad's hand over his eyes
    // Phases (all pure functions of scroll progress): reach (anticipation + ease-out) → cover (contact settles, the boy flinches
    // into the palm) → hold (a tiny breath) → release (ease-in, the hand lifts away).
    resetPose(boy)
    resetPose(dad)
    const K = 0.92 // boy scale
    const reachT = clamp01((p - 0.0) / 0.075) // 0 → 1 over the reach
    const reachC = reachCurve(reachT)
    const release = easeIn(smooth(0.93, 1.0, p))
    const cover = smooth(0.06, 0.1, p) * (1 - release) // contact → pressure
    const flinch = Math.exp(-Math.max(0, p - 0.072) * 55) * (p > 0.072 ? 1 : 0) // a quick start at contact, settling
    const gasp = smooth(0.0, 0.1, p)
    const breath = (0.5 + 0.5 * Math.sin(t * 1.5)) * (0.35 + 0.65 * f) // the freeze keeps a tiny breath

    boy.root.position.set(0, 0.95 * K, 0)
    boy.root.rotation.y = 0
    // dad stands beside him (on the boy's left, world +X), turned toward his son
    dad.root.position.set(0.66, 0.95 * 1.08, 0.04)
    dad.root.rotation.y = -Math.PI / 2 + 0.12
    dad.j.spine.rotation.x = lerp(0.05, 0.26, smooth(0.0, 0.09, p)) * (1 - 0.5 * release)
    dad.j.spine.rotation.y = 0.1 * smooth(0, 0.09, p)
    dad.j.hpL.rotation.x = -0.1
    dad.j.hpR.rotation.x = 0.12
    dad.j.knL.rotation.x = 0.1
    dad.j.knR.rotation.x = 0.07
    dad.j.hpL.rotation.z = 0.06
    dad.j.hpR.rotation.z = -0.06
    dad.j.head.rotation.x = 0.08

    // boy: chest full, shoulders lifted, one hand drawn up, the head tipped slightly into the palm
    boy.j.spine.rotation.x = lerp(0.05, -0.08, gasp) + 0.018 * breath
    boy.j.spine.rotation.z = -0.04 * cover
    boy.j.shR.rotation.x = lerp(0, -0.55, gasp)
    boy.j.shR.rotation.z = lerp(-0.1, -0.2, gasp)
    boy.j.elR.rotation.x = lerp(0, -1.3, gasp)
    boy.j.shL.position.y = 0.5 + 0.03 * (gasp * 0.6 + 0.4 * cover + 0.5 * flinch)
    boy.j.shR.position.y = 0.5 + 0.03 * (gasp * 0.6 + 0.4 * cover + 0.5 * flinch)
    boy.j.head.rotation.x = lerp(0.05, -0.1, gasp) - 0.06 * flinch
    boy.j.head.rotation.y = -0.05 * cover
    boy.j.head.rotation.z = -(0.1 * cover + 0.07 * flinch) // leans toward dad's palm (his +X side)
    boy.j.hpL.rotation.z = 0.05
    boy.j.hpR.rotation.z = -0.05
    boy.j.knL.rotation.x = 0.06
    boy.j.knR.rotation.x = 0.06
    limitPose(boy)
    limitPose(dad)
    groundFigure(boy, 0)
    groundFigure(dad, 0)
    boy.root.updateWorldMatrix(true, true)
    dad.root.updateWorldMatrix(true, true)

    // ---- dad's left hand → the boy's face. The target lives in the boy's *head space*, so the palm stays glued to him as he moves.
    // (palm centre on the eye line, fingers spread across the upper face, the wrist just outside the cheek)
    const hand = dad.hands.L
    hand.grp.parent!.updateWorldMatrix(true, false)
    dad.tipL.getWorldPosition(startL) // hanging-hand position (the start of the reach)
    boy.j.head.updateWorldMatrix(true, false)
    faceL.set(-0.03, 0.15, 0.13) // head-local: eye line, a little left of centre, just proud of the skull surface (z 0.107)
    boy.j.head.localToWorld(faceP.copy(faceL))
    // anticipation → arc → settle: the hand lifts out of the hanging pose and travels up and over, never straight through the head
    tmpV.copy(faceP).sub(startL)
    const arc = Math.sin(Math.PI * clamp01(reachC)) * 0.14
    const lift = release * 0.22
    handT.copy(startL).addScaledVector(tmpV, reachC)
    handT.y += arc + lift
    handT.x += lift * 0.9
    handT.z += lift * 0.4
    const press = 0.012 * cover * (1 - 0.6 * flinch) // palm presses a touch as it settles
    handT.z -= press
    poleL.set(0.5, 0.35, 1) // elbow out toward the camera and up
    // secondary motion: the hand trails its target on a damped spring, so it arrives, overshoots a hair and settles
    // (the fast, stiff spring keeps it glued to the face; scrubbing back and forth just re-settles it)
    if (!lagInit || handT.distanceTo(lagP) > 0.6) {
      lagP.copy(handT)
      lagV.set(0, 0, 0)
      lagInit = true
    }
    const sd = Math.min(dt, 0.033)
    lagV.addScaledVector(tmpV.copy(handT).sub(lagP), 260 * sd).multiplyScalar(Math.exp(-17 * sd))
    lagP.addScaledVector(lagV, sd)
    solveArm(dad, 'L', lagP, 1, poleL)
    palmFacing(dad, 'L', faceDir.set(0, 0, -1), smooth(0.0, 0.05, p)) // palm flat onto the face
    setHand(dad, 'L', 0.03) // open, fingers extended across the brow

    // ---- dad's right hand rests on the boy's near shoulder
    boy.j.shL.getWorldPosition(tmpV)
    dad.tipR.getWorldPosition(startR)
    shoulderP.copy(tmpV).add(tmpB.set(0.015, 0.082 * K, -0.012))
    const sR = easeOut(smooth(0.02, 0.1, p)) * (1 - 0.7 * release)
    handR.copy(startR).lerp(shoulderP, sR)
    handR.y += Math.sin(Math.PI * clamp01(sR)) * 0.07
    poleR.set(0.3, -0.1, -1)
    solveArm(dad, 'R', handR, 1, poleR)
    palmFacing(dad, 'R', tmpC.set(0, -1, 0), sR)
    setHand(dad, 'R', 0.18)

    // ---- the boy's near hand rises to touch dad's wrist (underside, fingers wrapping)
    dad.j.elL.getWorldPosition(tmpV)
    dad.tipL.getWorldPosition(tmpB)
    wristP.copy(tmpV).lerp(tmpB, 0.72).add(tmpC.set(0.0, -0.032, 0.03))
    boy.tipL.getWorldPosition(startB)
    const rise = easeOut(smooth(0.075, 0.13, p)) * (1 - release)
    handB.copy(startB).lerp(wristP, rise)
    poleB.set(0.5, -1, 0.3)
    solveArm(boy, 'L', handB, 1, poleB)
    setHand(boy, 'L', 0.3 + 0.55 * rise)
    lookAt(dad, boy.headC.getWorldPosition(tmpV), 0.75)

    // ------------------------------------------------ camera: a 3/4 side view that finds the hand over his eyes, then holds still
    const pos = keys(p, [
      { p: 0, v: [1.9, 1.95, 6.4] },
      { p: 0.12, v: [1.65, 1.8, 4.3] },
      { p: 0.4, v: [1.35, 1.72, 3.4] },
      { p: 1, v: [1.15, 1.68, 3.0] },
    ])
    pos[0] += Math.sin(t * 0.4) * 0.05 * f
    pos[1] += Math.sin(t * 0.33) * 0.03 * f
    setCam(5, state.camera as never, pos, [0.3, 1.52, 0.1], lerp(40, 32, smooth(0, 0.8, p)), dt, { lambda: 3 + 8 * (1 - f), parallax: 0.08 * (0.2 + 0.8 * f) })
  })

  const n = useMemo(() => list.length, [list])
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[14, 48]} />
        <meshStandardMaterial color="#101012" roughness={0.18} metalness={0.8} />
      </mesh>
      <Glow position={[0, 0.02, 0]} size={[7, 7]} color="#ffffff" opacity={0.25} boost={1.2} />
      <mesh position={[0, 3.6, 0]} material={beam}>
        <coneGeometry args={[2.6, 7.4, 32, 1, true]} />
      </mesh>
      <primitive object={boy.root} />
      <primitive object={dad.root} />
      <instancedMesh ref={drops} args={[undefined, undefined, n]} frustumCulled={false}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshStandardMaterial color="#d6dde8" roughness={0.08} metalness={0.95} emissive="#8896aa" emissiveIntensity={0.25} />
      </instancedMesh>
      <ParticleField count={count(260)} box={[10, 7, 10]} vel={[0, 0.1, 0]} size={7} color="#ffffff" opacity={0.5} position={[0, 3, 0]} seed={55} speed={() => flow(store.local[5])} />
    </group>
  )
}
