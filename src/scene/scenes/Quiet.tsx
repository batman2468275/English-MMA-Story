import { useMemo, useRef } from 'react'
import { InstancedMesh, Object3D, Quaternion, Vector3 } from 'three'
import { createFigure, limitPose, lookAt, resetPose, solveArm, groundFigure } from '../figure'
import { glowMaterial, rimMaterial } from '../materials'
import { Glow } from '../shapes'
import { ParticleField } from '../particles'
import { useSceneFrame, count } from '../hooks'
import { setCam, keys } from '../camera'
import { lerp, mulberry32, smooth } from '../../core/math'
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
const POLE_R = new Vector3(0.9, 0.35, 0)
const POLE_L = new Vector3(-0.9, 0.2, 0.2)

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
    const crowns = [[-1.7, 0.5], [1.5, 0.9], [0.1, -1.0], [-0.6, 1.8]]
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
      out.push({ kind: 'rain', x: (r() - 0.5) * 6.5, y: 2 + r() * 4.5, z: (r() - 0.5) * 6 - 0.4, vx: 0.15, vy: -(2.2 + r() * 1.6), vz: 0, t0: 0, r: 0.012 + r() * 0.014 })
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

    // ------------------------------------------------ the boy, caught mid-gasp
    resetPose(boy)
    resetPose(dad)
    const reach = smooth(0.0, 0.07, p) // dad's hand arrives as time stalls
    const gasp = smooth(0.0, 0.1, p) // the pose the boy is frozen in
    const tremor = f * (0.6 + 0.4 * Math.sin(t * 9)) // micro-motion dies with the clock
    boy.root.position.set(0, 0.95 * 0.92, 0)
    dad.root.position.set(0.04, 0.95 * 1.08, -0.44)
    boy.root.rotation.y = 0
    dad.root.rotation.y = 0
    // boy: back arches slightly, chest full, shoulders hunched, hands drawn up toward his chest, head tipped up and turned to the sound
    boy.j.spine.rotation.x = lerp(0.05, -0.1, gasp) + 0.012 * Math.sin(t * 1.5) * f
    boy.j.spine.rotation.z = 0.03 * gasp
    boy.j.shL.rotation.x = lerp(0, -0.55, gasp)
    boy.j.shL.rotation.z = lerp(0.1, 0.22, gasp)
    boy.j.elL.rotation.x = lerp(0, -1.25, gasp)
    boy.j.shR.rotation.x = lerp(0, -0.35, gasp)
    boy.j.shR.rotation.z = lerp(-0.1, -0.2, gasp)
    boy.j.elR.rotation.x = lerp(0, -1.1, gasp)
    boy.j.head.rotation.x = lerp(0.05, -0.16, gasp)
    boy.j.head.rotation.y = lerp(0, 0.22, gasp) + 0.02 * tremor
    boy.j.hpL.rotation.z = 0.05
    boy.j.hpR.rotation.z = -0.05
    boy.j.knL.rotation.x = 0.06
    boy.j.knR.rotation.x = 0.06
    // dad: leans over his son, one hand over the eyes, the other gripping the shoulder
    dad.j.spine.rotation.x = lerp(0.04, 0.2, reach)
    dad.j.head.rotation.x = 0.1
    limitPose(boy)
    limitPose(dad)
    groundFigure(boy, 0)
    groundFigure(dad, 0)
    boy.root.updateWorldMatrix(true, true)
    dad.root.updateWorldMatrix(true, true)
    // hand over the eyes: on the *surface* of the face (skull radius 0.105 × scale), fingers across the brow
    boy.headC.getWorldPosition(tmpV)
    const k = 0.92
    const eyes = tmpV.clone().add(new Vector3(0.0 + 0.004 * tremor, 0.02 * k, (0.105 + 0.05) * k))
    solveArm(dad, 'R', eyes, reach, POLE_R)
    // other hand on the boy's near shoulder
    boy.j.shL.getWorldPosition(tmpV)
    const shoulder = tmpV.clone().add(new Vector3(0.03, 0.09 * k, -0.01))
    solveArm(dad, 'L', shoulder, reach * 0.95, POLE_L)
    lookAt(dad, new Vector3(0, 1.4, 6), 0.8)

    // ------------------------------------------------ camera drifts in, then holds perfectly still
    const pos = keys(p, [
      { p: 0, v: [0.5, 2.0, 7.6] },
      { p: 0.12, v: [0.3, 1.8, 6.1] },
      { p: 0.4, v: [0.15, 1.6, 4.9] },
      { p: 1, v: [0.1, 1.55, 4.3] },
    ])
    pos[0] += Math.sin(t * 0.4) * 0.05 * f
    pos[1] += Math.sin(t * 0.33) * 0.03 * f
    setCam(5, state.camera as never, pos, [0, 1.4, 0], lerp(42, 34, smooth(0, 0.8, p)), dt, { lambda: 3 + 8 * (1 - f), parallax: 0.08 * (0.2 + 0.8 * f) })
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
