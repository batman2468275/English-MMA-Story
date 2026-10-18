import { useMemo } from 'react'
import { Vector3 } from 'three'
import { createFigure, solveArm, resetPose } from '../figure'
import { glowMaterial, rimMaterial } from '../materials'
import { Cage } from '../Cage'
import { ParticleField } from '../particles'
import { Glow } from '../shapes'
import { useSceneFrame, count } from '../hooks'
import { setCam, keys } from '../camera'
import { lerp, smooth } from '../../core/math'
import { store } from '../../core/store'
import { VAN_HIT } from '../../core/fx'

/**
 * 04 — JOSHUA VAN: arena, spotlight, two silhouettes. At VAN_HIT Van lands the shot, Royval drops and Van follows him
 * to the ground throwing strikes. All choreography is a pure function of scroll progress (reversible).
 * The white flash / shake / chroma glitch / shockwave come from core/fx.ts, the hand overlay from ui/FxOverlay.tsx.
 */
const tmp = new Vector3()
const head = new Vector3()

export function Van() {
  const van = useMemo(() => createFigure(rimMaterial('#05060a', '#fff1d0', 2.2, 2.1), 1), [])
  const roy = useMemo(() => createFigure(rimMaterial('#05060a', '#ff4a3a', 2.2, 2.1), 1), [])
  const beam = useMemo(() => glowMaterial('#ffffff', 0.5), [])

  useSceneFrame(3, (p, dt, state) => {
    const t = state.clock.elapsedTime
    resetPose(van)
    resetPose(roy)

    const bounce = Math.sin(t * 5.5) * 0.025
    const strike = smooth(0.335, 0.385, p) * (1 - smooth(0.405, 0.43, p)) // Van's right hand reaches Royval's head
    const fall = smooth(VAN_HIT, 0.5, p) // Royval goes down
    const mount = smooth(0.47, 0.57, p) // Van drops onto him

    // ---------------- Royval (faces -X, falls backwards to +X)
    roy.root.rotation.y = -Math.PI / 2
    roy.root.rotation.x = -fall * 1.52
    roy.root.position.set(lerp(1.15, 1.75, fall) + strike * 0.12, lerp(0.95 + bounce, 0.23, fall), 0)
    {
      const g = 1 - fall
      roy.j.spine.rotation.x = 0.12 * g
      roy.j.hpL.rotation.x = -0.3 * g; roy.j.knL.rotation.x = 0.3 * g
      roy.j.hpR.rotation.x = 0.32 * g; roy.j.knR.rotation.x = 0.2 * g
      roy.j.shL.rotation.x = lerp(0.2, -1.15, g); roy.j.elL.rotation.x = lerp(-0.3, -1.9, g)
      roy.j.shR.rotation.x = lerp(0.2, -1.0, g); roy.j.elR.rotation.x = lerp(-0.3, -1.9, g)
      roy.j.head.rotation.x = -fall * 0.35 + strike * -0.3
      roy.j.shL.rotation.z = fall * 0.5; roy.j.shR.rotation.z = -fall * 0.5
    }

    // ---------------- Van (faces +X)
    van.root.rotation.y = Math.PI / 2
    const lunge = strike
    van.root.position.x = lerp(lerp(-1.15, -0.55, lunge), 2.15, mount)
    van.root.position.y = lerp(0.95 + bounce, 0.74, mount)
    van.root.rotation.x = mount * 0.95
    {
      const g = 1 - mount
      van.j.hpL.rotation.x = lerp(-1.25, -0.4, g) ; van.j.knL.rotation.x = lerp(1.9, 0.3, g)
      van.j.hpR.rotation.x = lerp(-1.25, 0.35, g); van.j.knR.rotation.x = lerp(1.9, 0.2, g)
      van.j.shL.rotation.x = lerp(-1.1, -1.2, g); van.j.elL.rotation.x = lerp(-1.1, -1.8, g)
      van.j.shR.rotation.x = lerp(-1.1, -1.0, g); van.j.elR.rotation.x = lerp(-1.1, -1.9, g)
      van.j.head.rotation.x = -mount * 0.8
    }
    roy.root.updateWorldMatrix(true, true)
    van.root.updateWorldMatrix(true, true)
    roy.j.head.getWorldPosition(head)
    head.y += 0.12

    // the knock-down shot
    if (strike > 0.001) {
      tmp.copy(head)
      solveArm(van, 'R', tmp, strike)
    }
    // ground-and-pound: alternate hands hammering toward Royval's head
    if (mount > 0.01) {
      const ph = p * 330
      const hit = (ph0: number) => Math.max(0, Math.sin(ph0)) ** 2
      tmp.copy(head).add(new Vector3(-0.05, 0.15 + 0.55 * (1 - hit(ph)), 0.12))
      solveArm(van, 'R', tmp, mount)
      tmp.copy(head).add(new Vector3(-0.05, 0.15 + 0.55 * (1 - hit(ph + Math.PI)), -0.12))
      solveArm(van, 'L', tmp, mount)
    }

    // ---------------- camera: side view, slow-motion push-in after impact
    const a = p
    const pos = keys(a, [
      { p: 0, v: [-0.4, 1.7, 6.8] },
      { p: 0.32, v: [0.2, 1.6, 5.4] },
      { p: 0.42, v: [0.6, 1.35, 4.6] },
      { p: 0.7, v: [1.4, 1.2, 3.6] },
      { p: 0.95, v: [1.95, 1.05, 2.5] },
      { p: 1, v: [2.0, 1.0, 2.25] },
    ])
    const look = keys(a, [
      { p: 0, v: [0, 1.2, 0] },
      { p: 0.4, v: [0.3, 1.1, 0] },
      { p: 0.7, v: [1.6, 0.7, 0] },
      { p: 1, v: [2.3, 0.55, 0] },
    ])
    setCam(3, state.camera as never, pos, look, 52 - smooth(0.4, 1, p) * 18, dt, { lambda: 4.5, parallax: 0.12 })
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
      {/* crowd bokeh behind the cage + dust, pushed outward by the shockwave */}
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
