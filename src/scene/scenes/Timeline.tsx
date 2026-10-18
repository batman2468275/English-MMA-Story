import { useEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, CatmullRomCurve3, Color, Group, Mesh, MeshBasicMaterial, TubeGeometry, Vector3 } from 'three'
import { Glow } from '../shapes'
import { ParticleField } from '../particles'
import { useSceneFrame, count } from '../hooks'
import { setCam } from '../camera'
import { clamp01, lerp, smooth } from '../../core/math'
import { milestones, milestoneP } from '../../content/story'
import { labelSprite } from '../textures'
import { palette } from '../../theme'

/**
 * 13 — THEN → NOW: a glowing path winds through space and the camera glides along it on a spline. The travel speed eases down
 * as it nears each milestone (a little dwell, like a camera operator settling on a subject) and picks up again after. Each node
 * "pops" the moment it is reached: it springs up with overshoot, a ripple ring expands from it, its beam climbs and its label
 * brightens (the matching DOM card is in sections/Timeline.tsx).
 */
const SEG = 400
const RAD = 6
const LO = 0.02
const HI = 0.96

/** progress → distance along the path, slowing near each node so the camera lingers there. Monotonic, with a lookup table. */
const TABLE = (() => {
  const N = 512
  const cum = new Float32Array(N + 1)
  let acc = 0
  for (let i = 0; i <= N; i++) {
    const p = i / N
    let dwell = 0
    for (const m of milestoneP) dwell += Math.exp(-Math.pow((p - m) / 0.04, 2))
    acc += 1 / (1 + 1.8 * dwell)
    cum[i] = acc
  }
  for (let i = 0; i <= N; i++) cum[i] /= acc
  return cum
})()
const pathU = (p: number) => {
  const x = clamp01(p) * 512
  const i = Math.floor(x)
  const f = x - i
  const a = TABLE[i]
  const b = TABLE[Math.min(512, i + 1)]
  return LO + (HI - LO) * (a + (b - a) * f)
}

/** damped spring step response (overshoot then settle) */
const spring = (u: number) => (u <= 0 ? 0 : 1 - Math.exp(-6.5 * u) * Math.cos(15 * u))

export function Timeline() {
  const accent = palette()
  const nodes = useRef<(Group | null)[]>([])
  const ripples = useRef<(Mesh | null)[]>([])
  const lit = useRef<Mesh>(null)
  const litGlow = useRef<Mesh>(null)
  const head = useRef<Group>(null)

  const curve = useMemo(
    () =>
      new CatmullRomCurve3(
        [
          [-18, 0, 6], [-11, 1.4, 0], [-5, -0.6, -4], [1, 1.2, -6], [7, -0.4, -3], [13, 1.5, 1], [19, 0, 4], [26, 0.6, 2],
        ].map((p) => new Vector3(...(p as [number, number, number]))),
        false,
        'centripetal',
      ),
    [],
  )
  const geom = useMemo(() => new TubeGeometry(curve, SEG, 0.07, RAD, false), [curve])
  const geomLit = useMemo(() => new TubeGeometry(curve, SEG, 0.085, RAD, false), [curve]) // drawRange grows with scroll
  const geomGlow = useMemo(() => new TubeGeometry(curve, SEG, 0.24, RAD, false), [curve])

  const dim = useMemo(() => new Color('#3a3f4e'), [])
  const hot = useMemo(() => accent.glow.clone().multiplyScalar(3.2), [accent])
  const nodeData = useMemo(
    () =>
      milestones.map((m, i) => {
        const pos = curve.getPointAt(pathU(milestoneP[i]))
        const core = new MeshBasicMaterial({ color: dim.clone(), toneMapped: false })
        const ring = new MeshBasicMaterial({ color: dim.clone(), toneMapped: false })
        const beam = new MeshBasicMaterial({ color: accent.glow, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false })
        const rip = new MeshBasicMaterial({ color: accent.glow.clone().multiplyScalar(2), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false })
        const label = labelSprite(m.when.toUpperCase(), { size: 56, color: '#ffffff', glow: '#ff4757', opacity: 0.3, scale: 0.55 })
        return { pos, core, ring, beam, rip, label }
      }),
    [curve, dim, accent],
  )
  useEffect(() => () => nodeData.forEach((n) => n.label.material.map?.dispose()), [nodeData])

  const tmpC = useMemo(() => new Color(), [])
  const camPos = useMemo(() => new Vector3(), [])
  const look = useMemo(() => new Vector3(), [])

  useSceneFrame(12, (p, dt, state) => {
    const t = state.clock.elapsedTime
    const uc = pathU(p)
    // lit portion of the path grows with the camera
    const total = SEG * RAD * 6
    const cnt = Math.floor(clamp01(uc) * SEG) * RAD * 6
    lit.current?.geometry.setDrawRange(0, Math.min(total, cnt))
    litGlow.current?.geometry.setDrawRange(0, Math.min(total, cnt))
    // nodes: a spring "pop" on arrival, an expanding ripple, a rising beam
    nodeData.forEach((n, i) => {
      const arrive = milestoneP[i] - 0.035
      const u = (p - arrive) / 0.09
      const l = smooth(arrive - 0.01, arrive + 0.02, p)
      const pop = spring(u) * (p >= arrive ? 1 : 0)
      tmpC.copy(dim).lerp(hot, l)
      n.core.color.copy(tmpC)
      n.ring.color.copy(tmpC)
      n.beam.opacity = l * 0.5 * (0.85 + 0.15 * Math.sin(t * 2 + i))
      n.label.material.opacity = 0.28 + l * 0.72
      const g = nodes.current[i]
      if (g) {
        g.scale.setScalar(1 + 0.55 * pop * l)
        g.rotation.y = t * 0.3
        g.position.y = 0.12 * Math.sin(t * 1.3 + i) * l
      }
      const r = ripples.current[i]
      if (r) {
        const k = clamp01((p - arrive) / 0.12)
        r.visible = p >= arrive && k < 1
        r.scale.setScalar(lerp(0.7, 4.2, 1 - Math.pow(1 - k, 3)))
        n.rip.opacity = (1 - k) * 0.7
      }
    })
    // camera on the path: lookahead + behind, banking into curves, easing as the speed drops near nodes
    const c = curve.getPointAt(clamp01(uc - 0.05))
    const f = curve.getPointAt(clamp01(uc + 0.045))
    const f2 = curve.getPointAt(clamp01(uc + 0.1))
    camPos.set(c.x + 0.6, c.y + 2.6, c.z + 8.4)
    look.set(f.x, f.y - 0.3, f.z)
    const bank = clamp01(Math.abs(f2.z - f.z) * 0.3) * Math.sign(f2.z - f.z) * 0.05
    if (head.current) head.current.position.copy(curve.getPointAt(clamp01(uc)))
    setCam(12, state.camera as never, [camPos.x, camPos.y, camPos.z], [look.x, look.y, look.z], 56, dt, { lambda: 3.8, parallax: 0.2, roll: bank })
  })

  return (
    <group>
      <mesh geometry={geom}>
        <meshBasicMaterial color="#2c3140" toneMapped={false} />
      </mesh>
      <mesh ref={lit} geometry={geomLit}>
        <meshBasicMaterial color={accent.glow.clone().multiplyScalar(3)} toneMapped={false} />
      </mesh>
      <mesh ref={litGlow} geometry={geomGlow}>
        <meshBasicMaterial color={accent.glow} transparent opacity={0.22} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <group ref={head}>
        <Glow size={2.4} color="#ffffff" opacity={0.9} boost={2} />
      </group>
      {nodeData.map((n, i) => (
        <group key={i} position={n.pos}>
          <group ref={(g) => (nodes.current[i] = g)}>
            <mesh material={n.core}>
              <sphereGeometry args={[0.2, 20, 16]} />
            </mesh>
            <mesh material={n.ring} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.62, 0.035, 8, 8]} />
            </mesh>
            <mesh material={n.ring} rotation={[Math.PI / 2, Math.PI / 8, 0]} scale={1.35}>
              <torusGeometry args={[0.62, 0.02, 8, 8]} />
            </mesh>
          </group>
          <mesh ref={(r) => (ripples.current[i] = r)} material={n.rip} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
            <ringGeometry args={[0.9, 1, 48]} />
          </mesh>
          <mesh position={[0, 3.2, 0]} material={n.beam}>
            <cylinderGeometry args={[0.05, 0.28, 6.4, 12, 1, true]} />
          </mesh>
          <primitive object={n.label} position={[0, 1.55, 0]} />
        </group>
      ))}
      <gridHelper args={[160, 80, '#26293a', '#171a26']} position={[4, -2.6, -2]} />
      <ParticleField count={count(420)} box={[60, 14, 30]} vel={[0, 0.05, 0]} size={8} color="#ff9aa3" opacity={0.55} position={[4, 3, -2]} seed={82} />
    </group>
  )
}
