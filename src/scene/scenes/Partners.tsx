import { useMemo } from 'react'
import { Vector3 } from 'three'
import { createFigure, resetPose, solveArm, Figure } from '../figure'
import { rimMaterial } from '../materials'
import { Glow } from '../shapes'
import { ParticleField } from '../particles'
import { useSceneFrame, count } from '../hooks'
import { setCam } from '../camera'
import { lerp, smooth } from '../../core/math'
import { palette } from '../../theme'

/**
 * 10 — WHY IT STUCK: warm tones, two silhouettes training *together* — a slow, cooperative flow drill (hands circling
 * each other), then a fist bump and a bow. Respect, partnership. Smaller pairs drill in the background.
 */
const tgt = new Vector3()

function drill(a: Figure, b: Figure, x: number, z: number, gap: number, t: number, bump: number, bow: number, flip = 1) {
  resetPose(a)
  resetPose(b)
  a.root.rotation.y = Math.PI / 2 * flip
  b.root.rotation.y = -Math.PI / 2 * flip
  const sway = Math.sin(t * 0.8) * 0.04
  a.root.position.set(x - gap, 0.95 * a.root.scale.x + sway * 0.5, z)
  b.root.position.set(x + gap, 0.95 * b.root.scale.x - sway * 0.5, z)
  for (const f of [a, b]) {
    f.j.spine.rotation.x = 0.1 + bow * 0.5
    f.j.hpL.rotation.x = -0.28; f.j.hpR.rotation.x = 0.28; f.j.knL.rotation.x = 0.28
    f.j.shL.rotation.x = -1.05; f.j.elL.rotation.x = -1.9
    f.j.head.rotation.x = bow * 0.25
  }
  a.root.updateWorldMatrix(true, true)
  b.root.updateWorldMatrix(true, true)
  const c = Math.cos(t * 1.1)
  const s = Math.sin(t * 1.1)
  // hands trace slow circles around each other in the middle…
  tgt.set(x - 0.06 + bump * 0.04, lerp(1.2 + 0.1 * s, 1.28, bump), z + 0.12 * c * (1 - bump))
  solveArm(a, 'R', tgt, 1)
  tgt.set(x + 0.06 - bump * 0.04, lerp(1.2 - 0.1 * s, 1.28, bump), z - 0.12 * c * (1 - bump))
  solveArm(b, 'R', tgt, 1)
}

export function Partners() {
  const mat = useMemo(() => rimMaterial('#1a0e07', '#ffc77a', 2.5, 2.2), [])
  const matFar = useMemo(() => rimMaterial('#1a0e07', '#ff9a4a', 2.5, 1.6), [])
  const fig = useMemo(
    () => ({
      a: createFigure(mat), b: createFigure(mat),
      c: createFigure(matFar, 0.82), d: createFigure(matFar, 0.82),
      e: createFigure(matFar, 0.82), f: createFigure(matFar, 0.82),
    }),
    [mat, matFar],
  )
  const accent = palette()

  useSceneFrame(9, (p, dt, state) => {
    const t = state.clock.elapsedTime * 0.8 + p * 6
    const bump = smooth(0.72, 0.82, p) * (1 - smooth(0.9, 0.94, p))
    const bow = smooth(0.9, 0.98, p)
    drill(fig.a, fig.b, 0, 0, 0.78 - bump * 0.1, t, bump, bow)
    drill(fig.c, fig.d, -4.2, -3.2, 0.7, t * 0.9 + 2, 0, 0)
    drill(fig.e, fig.f, 4.5, -4.5, 0.7, t * 1.05 + 4, 0, 0)
    const ang = lerp(-0.55, 0.5, p)
    setCam(9, state.camera as never, [Math.sin(ang) * 5.4, lerp(1.2, 1.7, p), Math.cos(ang) * 5.4], [0, 1.15, 0], 46, dt, { lambda: 4, parallax: 0.12 })
  })

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, Math.PI / 8]}>
        <circleGeometry args={[7, 8]} />
        <meshStandardMaterial color="#1d120a" roughness={0.55} metalness={0.5} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, Math.PI / 8]} position={[0, 0.01, 0]}>
        <ringGeometry args={[6.9, 7.05, 8]} />
        <meshBasicMaterial color={accent.warm} toneMapped={false} />
      </mesh>
      <Glow position={[0, 0.05, 0]} size={[16, 7]} color="#ff9a3d" opacity={0.35} />
      {/* big warm halo behind them */}
      <mesh position={[0, 2, -7]}>
        <torusGeometry args={[4.2, 0.05, 8, 96]} />
        <meshBasicMaterial color={accent.warm.clone().multiplyScalar(2.2)} toneMapped={false} />
      </mesh>
      <Glow position={[0, 2, -7.2]} size={22} color="#ff8a2a" opacity={0.55} boost={1.2} />
      {Object.values(fig).map((f, i) => (
        <primitive key={i} object={f.root} />
      ))}
      <ParticleField count={count(320)} box={[22, 9, 22]} vel={[0, 0.18, 0]} size={20} color="#ffb85a" opacity={0.6} position={[0, 4, -2]} seed={91} />
    </group>
  )
}
