import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
} from 'three'
import { easeInOut, mulberry32, clamp01 } from '../core/math'
import { fenceTexture } from './textures'
import { palette } from '../theme'

/**
 * The octagon cage: 8 posts, top/bottom/mid rails and chain-link panels, with a door gap on the +Z face.
 * `assemble()` returns 0..1 and drives bars flying in from random positions → fully assembled.
 * Everything is MeshBasicMaterial so it glows through bloom regardless of lighting.
 */
interface Props {
  radius?: number
  height?: number
  thickness?: number
  assemble: () => number
  glow?: () => number
  door?: boolean
  fence?: boolean
  color?: string
  scatter?: number
  seed?: number
  scale?: number
  position?: [number, number, number]
}

const X = new Vector3(1, 0, 0)

export function Cage({
  radius = 5,
  height = 4,
  thickness = 0.07,
  assemble,
  glow,
  door = true,
  fence = true,
  color,
  scatter = 12,
  seed = 7,
  scale = 1,
  position,
}: Props) {
  const group = useRef<Group>(null)
  const meshes = useRef<(Mesh | null)[]>([])
  const panels = useRef<(Mesh | null)[]>([])

  const { bars, faces, mat, fenceMat } = useMemo(() => {
    const rnd = mulberry32(seed)
    const col = color ? new Color(color) : palette().glow.clone()
    const m = new MeshBasicMaterial({ color: col.clone().multiplyScalar(2.4), toneMapped: false, fog: false })
    const fm = new MeshBasicMaterial({
      map: fenceTexture(),
      color: col.clone().multiplyScalar(1.4),
      transparent: true,
      opacity: 0.2,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
      toneMapped: false,
      fog: false,
    })
    const V = (k: number, y: number) => {
      const a = ((k % 8) + 0.5) * (Math.PI / 4)
      return new Vector3(Math.cos(a) * radius, y, Math.sin(a) * radius)
    }
    type Bar = {
      a: Vector3; b: Vector3; mid: Vector3; quat: Quaternion; len: number; start: Vector3; startQ: Quaternion; delay: number
      away: Vector3; dir: Vector3; arc: number
    }
    const list: Bar[] = []
    const push = (a: Vector3, b: Vector3) => {
      const dir = b.clone().sub(a)
      const len = dir.length()
      const quat = new Quaternion().setFromUnitVectors(X, dir.clone().normalize())
      const start = new Vector3(rnd() - 0.5, rnd() - 0.2, rnd() - 0.5).normalize().multiplyScalar(scatter * (0.5 + rnd()))
      const mid = a.clone().add(b).multiplyScalar(0.5)
      const travel = mid.clone().sub(start)
      list.push({
        a, b, mid, quat, len, start, startQ: new Quaternion(), delay: rnd() * 0.55,
        away: travel.clone().normalize().multiplyScalar(-1),
        dir: travel.clone().normalize(),
        arc: Math.min(2.4, travel.length() * 0.14),
      })
    }
    for (let k = 0; k < 8; k++) {
      push(V(k, 0), V(k + 1, 0)) // bottom ring
      push(V(k, height), V(k + 1, height)) // top ring
      push(V(k, 0), V(k, height)) // posts
      if (!(door && k === 1)) push(V(k, height * 0.5), V(k + 1, height * 0.5)) // mid rail (skip door)
    }
    for (const b of list) {
      b.startQ = new Quaternion(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize()
    }
    const fcs: { pos: Vector3; rotY: number; len: number }[] = []
    for (let k = 0; k < 8; k++) {
      if (door && k === 1) continue
      const a = V(k, 0)
      const b = V(k + 1, 0)
      const c = a.clone().add(b).multiplyScalar(0.5)
      c.y = height / 2
      fcs.push({ pos: c, rotY: -Math.atan2(b.z - a.z, b.x - a.x), len: a.distanceTo(b) })
    }
    const faceLen = fcs[0]?.len ?? 1
    fm.map!.repeat.set(faceLen / 0.7, height / 0.7)
    return { bars: list, faces: fcs, mat: m, fenceMat: fm }
  }, [radius, height, door, color, scatter, seed])

  const tmpQ = useMemo(() => new Quaternion(), [])
  const tmpV = useMemo(() => new Vector3(), [])

  useEffect(() => {
    return () => {
      mat.dispose()
      fenceMat.dispose()
    }
  }, [mat, fenceMat])

  useFrame((state) => {
    const A = assemble()
    const g = glow ? glow() : 1
    const time = state.clock.elapsedTime
    mat.color.copy(color ? new Color(color) : palette().glow).multiplyScalar(2.4 * g)
    fenceMat.opacity = 0.22 * clamp01(A * 1.4 - 0.4) * g
    for (let i = 0; i < bars.length; i++) {
      const m = meshes.current[i]
      if (!m) continue
      const b = bars[i]
      // Each bar's journey is three beats: a small wind-up away from its slot (anticipation), a heavy arcing flight that
      // accelerates then brakes (ease in-out), and a damped overshoot with a rattle + thickness "clank" as it locks in.
      const t = clamp01((A - b.delay) / 0.42)
      const u = easeInOut(clamp01((t - 0.1) / 0.72))
      tmpV.copy(b.start)
      tmpV.y += Math.sin(time * 0.8 + i) * 0.3 * (1 - clamp01(t * 3)) // free-floating drift before it's called in
      m.position.lerpVectors(tmpV, b.mid, u)
      // wind-up: the bar first backs away a touch from where it is going
      const back = Math.sin(Math.PI * clamp01(t / 0.1)) * 0.35 * (1 - u)
      m.position.addScaledVector(b.away, back)
      // arc: heavy things fall into place — they rise slightly mid-flight and drop in
      m.position.y += Math.sin(Math.PI * u) * b.arc * (1 - u * 0.2)
      tmpQ.copy(b.startQ).slerp(b.quat, u)
      m.quaternion.copy(tmpQ)
      let pulse = 1
      if (t > 0.82) {
        const s = (t - 0.82) / 0.18
        const ring = Math.exp(-5 * s) * Math.sin(16 * s)
        m.position.addScaledVector(b.dir, 0.16 * ring) // overshoot along its travel direction, then settle
        pulse = 1 + 0.9 * Math.exp(-6 * s)
      }
      m.scale.set(1, pulse, pulse)
      m.visible = t > 0.001
    }
    for (const p of panels.current) if (p) p.visible = A > 0.55
  })

  return (
    <group ref={group} scale={scale} position={position}>
      {bars.map((b, i) => (
        <mesh key={i} ref={(el) => (meshes.current[i] = el)} material={mat}>
          <boxGeometry args={[b.len + thickness, thickness, thickness]} />
        </mesh>
      ))}
      {fence &&
        faces.map((f, i) => (
          <mesh
            key={'f' + i}
            ref={(el) => (panels.current[i] = el)}
            position={f.pos}
            rotation={[0, f.rotY, 0]}
            material={fenceMat}
          >
            <planeGeometry args={[f.len, height]} />
          </mesh>
        ))}
    </group>
  )
}
