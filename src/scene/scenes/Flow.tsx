import { useMemo } from 'react'
import { Vector3 } from 'three'
import { createFigure, resetPose, solveArm, Figure } from '../figure'
import { rimMaterial } from '../materials'
import { Glow } from '../shapes'
import { ParticleField } from '../particles'
import { useSceneFrame, count } from '../hooks'
import { setCam } from '../camera'
import { heartbeat, lerp, smooth } from '../../core/math'
import { store } from '../../core/store'
import { palette } from '../../theme'
import { light } from '../Rig'

/**
 * 12 — THE FLOW STATE: time slows. Two silhouettes move in a fluid, almost balletic clinch; each leaves a trail of
 * fading "echo" copies (motion trails), the screen gets a subtle time-dilation warp (core/fx.ts → GradeEffect), and the light
 * breathes with a slow heartbeat.
 */
const tgt = new Vector3()

/** Pose a pair at time t. Pure function of t, so echo copies are just the same pose evaluated a little in the past. */
function poseFlow(a: Figure, b: Figure, t: number) {
  resetPose(a)
  resetPose(b)
  const ang = t * 0.55
  const dip = 0.05 * Math.sin(t * 1.1)
  const place = (f: Figure, th: number, lean: number) => {
    const x = Math.cos(th) * 0.4
    const z = Math.sin(th) * 0.4
    f.root.position.set(x, 0.66 + dip * (th === ang ? 1 : -1), z)
    f.root.rotation.y = Math.atan2(-x, -z)
    f.j.spine.rotation.x = lean
    f.j.hpL.rotation.x = -0.95 + 0.15 * Math.sin(t * 0.9)
    f.j.hpR.rotation.x = -0.6 - 0.15 * Math.sin(t * 0.9)
    f.j.knL.rotation.x = 1.3
    f.j.knR.rotation.x = 1.5
    f.j.head.rotation.x = -0.2
  }
  place(a, ang, 0.5 + 0.12 * Math.sin(t * 0.8))
  place(b, ang + Math.PI, 0.5 + 0.12 * Math.sin(t * 0.8 + 2))
  a.root.updateWorldMatrix(true, true)
  b.root.updateWorldMatrix(true, true)
  const wob = Math.sin(t * 1.3) * 0.08
  // each fighter controls the other's arms / trap legs: hands pinned to the partner's shoulders and wrists
  b.j.shL.getWorldPosition(tgt); tgt.y += 0.04 + wob
  solveArm(a, 'R', tgt.clone(), 1)
  b.j.shR.getWorldPosition(tgt); tgt.y -= 0.12
  solveArm(a, 'L', tgt.clone(), 1)
  a.j.shL.getWorldPosition(tgt); tgt.y += 0.04 - wob
  solveArm(b, 'R', tgt.clone(), 1)
  a.j.shR.getWorldPosition(tgt); tgt.y -= 0.12
  solveArm(b, 'L', tgt.clone(), 1)
}

const GHOSTS = 5

export function Flow() {
  const accent = palette()
  const lead = useMemo(() => rimMaterial('#0a0914', '#c9b8ff', 2.4, 2.2), [])
  const lead2 = useMemo(() => rimMaterial('#0a0914', '#ffd9a8', 2.4, 2.2), [])
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
  const A = useMemo(() => createFigure(lead), [lead])
  const B = useMemo(() => createFigure(lead2), [lead2])

  useSceneFrame(11, (p, dt, state) => {
    const now = state.clock.elapsedTime
    // time is "slow": mostly scroll-driven, plus a gentle real-time creep
    const tt = p * 15 + now * 0.28
    const lag = lerp(0.05, 0.13, smooth(0.1, 0.5, p))
    poseFlow(A, B, tt)
    ghosts.forEach((g, k) => poseFlow(g.a, g.b, tt - (k + 1) * lag))
    const beat = heartbeat(now, 44)
    light.ptMul = 1 + beat * 1.2
    light.hemiAdd = beat * 0.18
    const ang = lerp(0.1, 1.5, p)
    setCam(11, state.camera as never, [Math.sin(ang) * 4.2, lerp(1.0, 1.5, p), Math.cos(ang) * 4.2], [0, 0.65, 0], 46, dt, { lambda: 3.5, parallax: 0.1 })
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
      <primitive object={A.root} />
      <primitive object={B.root} />
      <ParticleField count={count(260)} box={[14, 7, 14]} vel={[0, 0.05, 0]} size={10} color="#b8a8ff" opacity={0.5} position={[0, 2.5, 0]} seed={61} speed={() => 0.3} />
    </group>
  )
}
