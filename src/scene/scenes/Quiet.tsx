import { useMemo, useRef } from 'react'
import { InstancedMesh, Object3D, Vector3 } from 'three'
import { createFigure, resetPose, solveArm } from '../figure'
import { glowMaterial, rimMaterial } from '../materials'
import { Glow } from '../shapes'
import { ParticleField } from '../particles'
import { useSceneFrame, count } from '../hooks'
import { setCam } from '../camera'
import { lerp, mulberry32, smooth } from '../../core/math'

/**
 * 06 — QUIET: everything stills. Droplets and rain freeze mid-air (their clock stops as p rises), colour drains away,
 * a single spotlight picks out the boy with his dad's hand over his eyes. Minimal, let it breathe.
 */
const N_DROPS = 90
const tmp = new Vector3()
const dummy = new Object3D()
const POLE = new Vector3(-0.8, 0.5, 0)

export function Quiet() {
  const boy = useMemo(() => createFigure(rimMaterial('#0b0b0d', '#e8e8ea', 2.6, 1.5), 0.92), [])
  const dad = useMemo(() => createFigure(rimMaterial('#0b0b0d', '#dcdcde', 2.6, 1.3), 1.08), [])
  const beam = useMemo(() => glowMaterial('#ffffff', 0.42), [])
  const drops = useRef<InstancedMesh>(null)
  const drift = useRef(0)

  const spots = useMemo(() => {
    const r = mulberry32(19)
    return Array.from({ length: N_DROPS }, () => ({
      x: (r() - 0.5) * 7,
      y: r() * 6,
      z: (r() - 0.5) * 6 - 0.5,
      s: 0.03 + r() * 0.07,
      f: r() * 6,
    }))
  }, [])

  useSceneFrame(5, (p, dt, state) => {
    const t = state.clock.elapsedTime
    // time freezes: everything is moving at the top of the section, nothing by p = 0.2
    const flow = 1 - smooth(0.0, 0.2, p)
    drift.current += dt * flow

    // droplets (frozen mid-fall)
    const m = drops.current
    if (m) {
      spots.forEach((d, i) => {
        dummy.position.set(d.x, ((d.y - drift.current * 1.6 * (0.6 + d.f * 0.1)) % 6 + 6) % 6, d.z)
        dummy.scale.set(d.s, d.s * (1 + flow * 3), d.s)
        dummy.updateMatrix()
        m.setMatrixAt(i, dummy.matrix)
      })
      m.instanceMatrix.needsUpdate = true
    }

    // figures: boy (front), dad behind with his hand over the boy's eyes
    resetPose(boy)
    resetPose(dad)
    boy.root.position.set(0, 0.9, 0)
    dad.root.position.set(0.05, 1.03, -0.42)
    const breathe = Math.sin(t * 0.9) * 0.012 * (1 - smooth(0.2, 0.5, p)) * 0
    boy.j.head.rotation.x = 0.1 + breathe
    boy.j.spine.rotation.x = 0.04
    boy.j.shL.rotation.z = 0.12
    boy.j.shR.rotation.z = -0.12
    dad.j.shL.rotation.z = 0.1
    dad.root.updateWorldMatrix(true, true)
    boy.root.updateWorldMatrix(true, true)
    boy.j.head.getWorldPosition(tmp)
    tmp.y += 0.14 * 0.92
    tmp.z += 0.1
    const reach = smooth(0.0, 0.25, p)
    solveArm(dad, 'R', tmp, reach, POLE)
    // lonely, unmoving spot
    setCam(5, state.camera as never, [lerp(0.4, 0.15, p), lerp(2.0, 1.55, p), lerp(7.6, 4.3, p)], [0, 1.4, 0], 42 - p * 6, dt, { lambda: 3, parallax: 0.08 })
  })

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[14, 48]} />
        <meshStandardMaterial color="#101012" roughness={0.6} metalness={0.4} />
      </mesh>
      <Glow position={[0, 0.02, 0]} size={[7, 7]} color="#ffffff" opacity={0.25} boost={1.2} />
      <mesh position={[0, 3.6, 0]} material={beam}>
        <coneGeometry args={[2.6, 7.4, 32, 1, true]} />
      </mesh>
      <primitive object={boy.root} />
      <primitive object={dad.root} />
      <instancedMesh ref={drops} args={[undefined, undefined, N_DROPS]} frustumCulled={false}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshStandardMaterial color="#cfd6e0" roughness={0.1} metalness={0.9} />
      </instancedMesh>
      <ParticleField count={count(300)} box={[10, 7, 10]} vel={[0, 0, 0]} size={7} color="#ffffff" opacity={0.5} position={[0, 3, 0]} seed={55} speed={() => 0} />
    </group>
  )
}
