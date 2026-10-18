import { useMemo } from 'react'
import { Vector3 } from 'three'
import { createFigure, Figure, groundFigure, limitPose, lookAt, resetPose, setHand, solveArm } from '../figure'
import { resolveContacts } from '../contact'
import { rimMaterial, setRimLight } from '../materials'
import { Glow } from '../shapes'
import { ParticleField } from '../particles'
import { useSceneFrame, count } from '../hooks'
import { setCam, keys } from '../camera'
import { heartbeat, lerp, smooth } from '../../core/math'
import { store } from '../../core/store'
import { palette } from '../../theme'
import { light } from '../Rig'

/**
 * 12 — THE FLOW STATE. Time slows. Two fighters in a rolling, almost balletic clinch: they circle each other on bent legs,
 * change levels in a slow wave, and keep trading grips — collar tie → elbow control → head control — each hand gliding from one
 * surface of the partner's body to the next (hands sit *on* the surface; the two torsos are held apart by the contact solver).
 * Every pose is a pure function of time `t`, so the motion-trail "echoes" are just the same pose evaluated a moment earlier;
 * the whole screen also gets a gentle time-dilation warp (core/fx.ts → GradeEffect) and a slow heartbeat in the light.
 */
const A = new Vector3(), B = new Vector3(), C = new Vector3(), D = new Vector3(), POLE = new Vector3(), SUM = new Vector3()

/** weight of grip-state k (0..2) for cycle value c: a smooth plateau around each state so changes of grip glide */
const stateW = (c: number, k: number) => {
  const d = Math.min(Math.abs(c - k), 3 - Math.abs(c - k))
  return 1 - smooth(0.28, 0.72, d)
}

function poseFlow(a: Figure, b: Figure, t: number, contacts: boolean) {
  resetPose(a)
  resetPose(b)
  const th = t * 0.5
  const R = 0.38 + 0.03 * Math.sin(t * 0.7)
  const dip = 0.5 + 0.5 * Math.sin(t * 0.9) // slow level change 0..1
  const pair: [Figure, number][] = [[a, 1], [b, -1]]
  for (const [f, s] of pair) {
    const x = Math.cos(th) * R * s
    const z = Math.sin(th) * R * s
    f.root.position.set(x, 0.9, z)
    f.root.rotation.y = Math.atan2(-x, -z) // always facing the partner
    f.j.hpL.rotation.x = -(0.85 + 0.35 * dip) + 0.08 * Math.sin(t * 0.8 + s)
    f.j.hpR.rotation.x = -(0.7 + 0.35 * dip) - 0.08 * Math.sin(t * 0.8 + s)
    f.j.knL.rotation.x = 1.25 + 0.45 * dip
    f.j.knR.rotation.x = 1.15 + 0.45 * dip
    f.j.hpL.rotation.z = 0.2 + 0.05 * dip
    f.j.hpR.rotation.z = -0.2 - 0.05 * dip
    // a slow wave travels up the spine: lean, twist and head all follow with a little lag
    f.j.spine.rotation.x = 0.36 + 0.1 * Math.sin(t * 0.9 + s) + 0.12 * dip
    f.j.spine.rotation.y = 0.24 * Math.sin(t * 0.6 + s * 1.7)
    f.j.spine.rotation.z = 0.08 * Math.sin(t * 0.7 + s * 0.8)
    f.j.head.rotation.x = -0.1 + 0.08 * Math.sin(t * 0.9 + s - 0.5)
    limitPose(f)
  }
  a.root.updateWorldMatrix(true, true)
  b.root.updateWorldMatrix(true, true)
  groundFigure(a, 0)
  groundFigure(b, 0)
  if (contacts) {
    resolveContacts([a, b], { iterations: 3, margin: 0.015 })
    groundFigure(a, 0)
    groundFigure(b, 0)
  }
  if (contacts) {
    lookAt(a, b.headC.getWorldPosition(A.set(0, 0, 0)), 0.8)
    lookAt(b, a.headC.getWorldPosition(A.set(0, 0, 0)), 0.8)
  }

  // grips: each hand glides between three surfaces on the partner's body
  const c = (t * 0.22) % 3
  const w = [stateW(c, 0), stateW(c, 1), stateW(c, 2)]
  const wsum = w[0] + w[1] + w[2]
  for (const [me, s] of pair) {
    const you = me === a ? b : a
    you.root.updateWorldMatrix(true, true)
    me.root.getWorldPosition(C) // my position → "toward me" direction from the partner
    you.root.getWorldPosition(D)
    const toMe = C.clone().sub(D).setY(0).normalize()
    for (const hand of ['R', 'L'] as const) {
      // across the gap: my right hand works on their left side and vice versa
      const j = hand === 'R' ? { sh: you.j.shL, el: you.j.elL } : { sh: you.j.shR, el: you.j.elR }
      const out = hand === 'R' ? 1 : -1
      SUM.set(0, 0, 0)
      // 0: collar tie — on top of their shoulder
      j.sh.getWorldPosition(A)
      A.y += 0.085
      SUM.addScaledVector(A, w[0])
      // 1: elbow control — on the outside of their elbow
      j.el.getWorldPosition(B)
      B.addScaledVector(toMe, 0.055).y += 0.01
      SUM.addScaledVector(B, w[1])
      // 2: head control — hand on the back of their head (right) / shoulder (left)
      if (hand === 'R') {
        you.headC.getWorldPosition(A)
        A.addScaledVector(toMe, -(0.105 + 0.045)).y += 0.02
      } else {
        j.sh.getWorldPosition(A)
        A.y += 0.085
      }
      SUM.addScaledVector(A, w[2])
      SUM.multiplyScalar(1 / Math.max(0.001, wsum))
      POLE.copy(toMe).multiplyScalar(-0.2).setY(-0.6)
      POLE.x += out * s * 0.8 * (toMe.z)
      POLE.z += -out * s * 0.8 * (toMe.x)
      solveArm(me, hand, SUM.clone(), 0.95, POLE)
      setHand(me, hand, 0.8) // fingers wrapped round whatever they hold (collar, elbow, head)
    }
  }
}

const GHOSTS = 5

export function Flow() {
  const accent = palette()
  const lead = useMemo(() => rimMaterial('#0a0914', '#c9b8ff', 2.4, 2.0), [])
  const lead2 = useMemo(() => rimMaterial('#0a0914', '#ffd9a8', 2.4, 2.0), [])
  const n = store.mobile ? 2 : GHOSTS
  const ghosts = useMemo(
    () =>
      Array.from({ length: n }, (_, k) => {
        const alpha = 0.34 * (1 - k / (n + 0.6))
        const m1 = rimMaterial('#0a0914', '#a89aff', 2.2, 2.0, alpha)
        const m2 = rimMaterial('#0a0914', '#ffc58c', 2.2, 2.0, alpha)
        m1.depthWrite = m2.depthWrite = false
        return { a: createFigure(m1), b: createFigure(m2) }
      }),
    [n],
  )
  const A1 = useMemo(() => createFigure(lead), [lead])
  const B1 = useMemo(() => createFigure(lead2), [lead2])

  useSceneFrame(11, (p, dt, state) => {
    const now = state.clock.elapsedTime
    // time is "slow": mostly scroll-driven, plus a gentle real-time creep
    const tt = p * 15 + now * 0.28
    const lag = lerp(0.05, 0.13, smooth(0.1, 0.5, p))
    poseFlow(A1, B1, tt, true)
    ghosts.forEach((g, k) => poseFlow(g.a, g.b, tt - (k + 1) * lag, false))
    const beat = heartbeat(now, 44)
    light.ptMul = 1 + beat * 1.2
    light.hemiAdd = beat * 0.18
    setRimLight(lead, A.set(0, 3, 2), '#9a8bff', 0.7)
    setRimLight(lead2, A.set(0, 3, 2), '#ffb98a', 0.7)
    const ang = keys(p, [{ p: 0, v: [0.1, 0, 0] }, { p: 0.5, v: [0.8, 0, 0] }, { p: 1, v: [1.5, 0, 0] }])[0]
    const h = keys(p, [{ p: 0, v: [1.0, 0, 0] }, { p: 0.6, v: [1.3, 0, 0] }, { p: 1, v: [1.5, 0, 0] }])[0]
    setCam(11, state.camera as never, [Math.sin(ang) * 4.0, h, Math.cos(ang) * 4.0], [0, 0.65, 0], 46, dt, { lambda: 3.5, parallax: 0.1 })
  })

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, Math.PI / 8]}>
        <circleGeometry args={[6, 8]} />
        <meshStandardMaterial color="#0e0c18" roughness={0.35} metalness={0.7} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, Math.PI / 8]} position={[0, 0.01, 0]}>
        <ringGeometry args={[5.9, 6.05, 8]} />
        <meshBasicMaterial color={accent.glow.clone().multiplyScalar(1.6)} toneMapped={false} />
      </mesh>
      <Glow position={[0, 0.06, 0]} size={[10, 4]} color="#8a7bff" opacity={0.4} />
      {ghosts.map((g, i) => (
        <group key={i}>
          <primitive object={g.a.root} />
          <primitive object={g.b.root} />
        </group>
      ))}
      <primitive object={A1.root} />
      <primitive object={B1.root} />
      <ParticleField count={count(260)} box={[14, 7, 14]} vel={[0, 0.05, 0]} size={10} color="#b8a8ff" opacity={0.5} position={[0, 2.5, 0]} seed={61} speed={() => 0.3} />
    </group>
  )
}
