import { useEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  InstancedMesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Shape,
  ShapeGeometry,
  Texture,
} from 'three'
import { Box, Emit, Glow } from '../shapes'
import { Plant } from '../dressing'
import { ParticleField } from '../particles'
import { useSceneFrame, count } from '../hooks'
import { setCam, keys } from '../camera'
import { easeInOut, mulberry32, range, smooth } from '../../core/math'
import { light } from '../Rig'
import { store } from '../../core/store'
import {
  asphaltTexture,
  concreteTexture,
  garageTexture,
  grassTexture,
  shingleTexture,
  sidingTexture,
  windowTexture,
} from '../procTextures'

/**
 * 02 — THE DRIVEWAY: a stylised low-poly night street. A properly proportioned two-storey house (gable roof, porch,
 * garage, chimney, framed windows with shutters), a sedan sweeping past with headlights, and a camera that glides up the
 * driveway on a spline, slows as it nears the porch, and passes through the front door as it swings open.
 */
const FRONT_Z = -22.4
const BLOCK_W = 10
const BLOCK_H = 5.6
const BLOCK_D = 8
const HALL_D = 3.2

const tex = (t: Texture, rx: number, ry: number) => {
  const c = t.clone()
  c.repeat.set(rx, ry)
  c.needsUpdate = true
  return c
}

function gable(width: number, length: number, rise: number, overhang: number) {
  const s = new Shape()
  s.moveTo(-width / 2 - overhang, 0)
  s.lineTo(width / 2 + overhang, 0)
  s.lineTo(0, rise)
  s.closePath()
  const g = new ExtrudeGeometry(s, { depth: length + overhang * 2, bevelEnabled: false })
  g.translate(0, 0, -(length / 2 + overhang))
  return g
}

// ---------------------------------------------------------------------------------------------------------------------
// props
// ---------------------------------------------------------------------------------------------------------------------
function Window({ x, y, w = 1.3, h = 1.5, tv = false, idx = 0, shutters = true }: { x: number; y: number; w?: number; h?: number; tv?: boolean; idx?: number; shutters?: boolean }) {
  const map = useMemo(() => windowTexture('#ffb347', tv), [tv])
  const mat = useMemo(() => new MeshBasicMaterial({ map, color: new Color('#ffffff').multiplyScalar(1.3), toneMapped: false }), [map])
  useSceneFrame(1, (_p, _dt, s) => {
    const t = s.clock.elapsedTime
    // TV windows flicker like a screen; lamp-lit windows breathe slightly
    const f = tv ? 1.15 + 0.55 * Math.sin(t * 11 + idx * 3) * Math.sin(t * 3.7 + idx) : 1.35 + 0.1 * Math.sin(t * 1.3 + idx)
    mat.color.setScalar(Math.max(0.55, f))
  })
  const frame = '#e8e4da'
  return (
    <group position={[x, y, FRONT_Z + 0.02]}>
      <mesh material={mat} position={[0, 0, 0.005]}>
        <planeGeometry args={[w, h]} />
      </mesh>
      {/* frame, sill, header */}
      <Box position={[0, h / 2 + 0.06, 0.06]} size={[w + 0.34, 0.12, 0.14]} color={frame} rough={0.6} />
      <Box position={[0, -h / 2 - 0.08, 0.1]} size={[w + 0.4, 0.1, 0.22]} color={frame} rough={0.6} />
      <Box position={[-w / 2 - 0.06, 0, 0.05]} size={[0.12, h, 0.12]} color={frame} rough={0.6} />
      <Box position={[w / 2 + 0.06, 0, 0.05]} size={[0.12, h, 0.12]} color={frame} rough={0.6} />
      {shutters && (
        <>
          <Box position={[-w / 2 - 0.42, 0, 0.04]} size={[0.5, h + 0.1, 0.07]} color="#1e2a3e" rough={0.7} />
          <Box position={[w / 2 + 0.42, 0, 0.04]} size={[0.5, h + 0.1, 0.07]} color="#1e2a3e" rough={0.7} />
        </>
      )}
      <Glow position={[0, 0, 0.45]} size={[w * 2.2, h * 2.0]} color={tv ? '#6f8fff' : '#ffb347'} opacity={0.22} boost={1.1} />
    </group>
  )
}

function Tree({ x, z, s = 1, seed = 1 }: { x: number; z: number; s?: number; seed?: number }) {
  const r = mulberry32(seed * 7 + 3)
  const tiers = useMemo(() => [0, 1, 2].map((i) => ({ y: 2.2 + i * 1.25, rad: 1.7 - i * 0.42, h: 2.2 - i * 0.2, rot: r() * 3, c: ['#0e2a1a', '#123421', '#17402a'][i] })), [r])
  return (
    <group position={[x, 0, z]} scale={s} rotation={[0, seed, 0]}>
      <mesh position={[0, 0.9, 0]}>
        <cylinderGeometry args={[0.16, 0.26, 1.8, 7]} />
        <meshStandardMaterial color="#2a1c12" roughness={1} />
      </mesh>
      {tiers.map((t, i) => (
        <mesh key={i} position={[0, t.y, 0]} rotation={[0, t.rot, 0]}>
          <coneGeometry args={[t.rad, t.h, 7]} />
          <meshStandardMaterial color={t.c} roughness={1} flatShading />
        </mesh>
      ))}
    </group>
  )
}

function Lamp({ x, z, flip = 1 }: { x: number; z: number; flip?: 1 | -1 }) {
  return (
    <group position={[x, 0, z]} scale={[flip, 1, 1]}>
      <Box position={[0, 0.2, 0]} size={[0.34, 0.4, 0.34]} color="#2a2c33" rough={0.7} />
      <mesh position={[0, 2.3, 0]}>
        <cylinderGeometry args={[0.07, 0.1, 4.2, 8]} />
        <meshStandardMaterial color="#1b1d24" roughness={0.5} metalness={0.5} />
      </mesh>
      <Box position={[0.55, 4.42, 0]} size={[1.2, 0.09, 0.12]} color="#1b1d24" rough={0.5} metal={0.5} />
      <Box position={[1.05, 4.32, 0]} size={[0.5, 0.14, 0.3]} color="#2a2c33" rough={0.5} metal={0.4} />
      <Emit position={[1.05, 4.23, 0]} size={[0.4, 0.05, 0.22]} color="#ffd9a0" boost={2.6} />
      <Glow position={[1.05, 4.05, 0]} size={3.6} color="#ffb871" opacity={0.42} boost={1.2} />
      {/* pool of light on the ground */}
      <mesh position={[1.05, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[3.2, 24]} />
        <meshBasicMaterial color="#ffb871" transparent opacity={0.07} blending={AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  )
}

const carProfile = (() => {
  const s = new Shape()
  const pts: [number, number][] = [[-2.12, 0.34], [-2.2, 0.82], [-1.5, 0.96], [-1.0, 1.46], [0.55, 1.5], [1.3, 1.02], [2.1, 0.9], [2.22, 0.5], [2.0, 0.32]]
  s.moveTo(pts[0][0], pts[0][1])
  pts.slice(1).forEach(([x, y]) => s.lineTo(x, y))
  s.closePath()
  return s
})()
const carGlass = (() => {
  const s = new Shape()
  s.moveTo(-0.92, 0.99)
  s.lineTo(-0.62, 1.4)
  s.lineTo(0.5, 1.43)
  s.lineTo(1.0, 1.02)
  s.closePath()
  return s
})()

/** A sedan: extruded side profile, glass, four wheels that sit exactly on the ground, lights. */
function Car({ color = '#1a1c24', wheelRef, moving = false }: { color?: string; wheelRef?: React.MutableRefObject<Group | null>; moving?: boolean }) {
  const body = useMemo(() => {
    const g = new ExtrudeGeometry(carProfile, { depth: 1.76, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2 })
    g.translate(0, 0, -0.88)
    return g
  }, [])
  const glass = useMemo(() => new ShapeGeometry(carGlass), [])
  const glassMat = useMemo(() => new MeshStandardMaterial({ color: '#0a0f1a', roughness: 0.05, metalness: 0.9, emissive: '#1a2a44', emissiveIntensity: 0.5, side: DoubleSide }), [])
  return (
    <group>
      <mesh geometry={body}>
        <meshStandardMaterial color={color} roughness={0.28} metalness={0.7} />
      </mesh>
      <mesh geometry={glass} position={[0, 0, 0.93]} material={glassMat} />
      <mesh geometry={glass} position={[0, 0, -0.93]} material={glassMat} rotation={[0, Math.PI, 0]} />
      {/* wheels: radius 0.34, so their lowest point is y = 0 */}
      <group ref={wheelRef ?? undefined}>
        {[
          [1.32, 0.9], [1.32, -0.9], [-1.32, 0.9], [-1.32, -0.9],
        ].map(([x, z], i) => (
          <group key={i} position={[x, 0.34, z]}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.34, 0.34, 0.26, 18]} />
              <meshStandardMaterial color="#0c0c0f" roughness={0.9} />
            </mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, z > 0 ? 0.135 : -0.135]}>
              <cylinderGeometry args={[0.2, 0.2, 0.02, 10]} />
              <meshStandardMaterial color="#9aa3ad" roughness={0.3} metalness={0.9} />
            </mesh>
            {moving && (
              <Box position={[0, 0, z > 0 ? 0.15 : -0.15]} size={[0.05, 0.36, 0.01]} color="#4a5058" metal={0.9} />
            )}
          </group>
        ))}
      </group>
      <Emit position={[2.2, 0.68, 0.62]} size={[0.06, 0.14, 0.36]} color="#fff6dc" boost={3} />
      <Emit position={[2.2, 0.68, -0.62]} size={[0.06, 0.14, 0.36]} color="#fff6dc" boost={3} />
      <Emit position={[-2.2, 0.72, 0.62]} size={[0.06, 0.12, 0.42]} color="#ff2a2a" boost={2.2} />
      <Emit position={[-2.2, 0.72, -0.62]} size={[0.06, 0.12, 0.42]} color="#ff2a2a" boost={2.2} />
    </group>
  )
}

function MovingCar() {
  const g = useRef<Group>(null)
  const wheels = useRef<Group>(null)
  const beams = useMemo(
    () => new MeshBasicMaterial({ color: new Color('#fff1cf').multiplyScalar(0.5), transparent: true, opacity: 0.5, blending: AdditiveBlending, depthWrite: false, toneMapped: false }),
    [],
  )
  useSceneFrame(1, () => {
    if (!g.current) return
    // brakes into the turn and eases back on the throttle: the car's speed is not constant
    const u = easeInOut(range(store.local[1], 0.0, 0.58))
    const x = -40 + u * 74
    g.current.position.x = x
    g.current.rotation.z = -0.012 * Math.sin(u * Math.PI) // slight nose dip under braking
    wheels.current?.children.forEach((w) => (w.rotation.z = -x / 0.34))
  })
  return (
    <group ref={g} position={[-40, 0, 1.7]}>
      <Car moving wheelRef={wheels} color="#1c2434" />
      <mesh position={[7.6, 0.55, 0.62]} rotation={[0, 0, -Math.PI / 2]} material={beams}>
        <coneGeometry args={[1.8, 10, 16, 1, true]} />
      </mesh>
      <mesh position={[7.6, 0.55, -0.62]} rotation={[0, 0, -Math.PI / 2]} material={beams}>
        <coneGeometry args={[1.8, 10, 16, 1, true]} />
      </mesh>
      {/* headlight pool on the asphalt */}
      <mesh position={[6, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[9, 3.4]} />
        <meshBasicMaterial color="#fff1cf" transparent opacity={0.1} blending={AdditiveBlending} depthWrite={false} />
      </mesh>
      <Glow position={[2.7, 0.7, 0]} size={4.2} color="#fff1cf" opacity={0.5} />
    </group>
  )
}

export function Driveway() {
  const doorPivot = useRef<Group>(null)
  const pickets = useRef<InstancedMesh>(null)

  const trees = useMemo(() => {
    const r = mulberry32(5)
    const out: { x: number; z: number; s: number; seed: number }[] = []
    const n = store.mobile ? 8 : 16
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1
      out.push({ x: side * (13 + r() * 14), z: -4 - r() * 46, s: 0.8 + r() * 0.9, seed: i + 1 })
    }
    return out
  }, [])

  const m = useMemo(() => {
    const siding = tex(sidingTexture('#4a5576'), BLOCK_W / 2.4, BLOCK_H / 2.4)
    const sidingGarage = tex(sidingTexture('#4a5576'), 2.4, 1.4)
    const roofTex = tex(shingleTexture('#2a2f3e'), 0.4, 0.4)
    return {
      siding: new MeshStandardMaterial({ map: siding, roughness: 0.88 }),
      garageWall: new MeshStandardMaterial({ map: sidingGarage, roughness: 0.88 }),
      roof: new MeshStandardMaterial({ map: roofTex, roughness: 0.95, color: '#b8bcc8' }),
      trim: new MeshStandardMaterial({ color: '#e8e4da', roughness: 0.6 }),
      lawn: new MeshStandardMaterial({ map: tex(grassTexture(), 30, 20), roughness: 1 }),
      road: new MeshStandardMaterial({ map: tex(asphaltTexture(), 26, 2), roughness: 0.55, metalness: 0.15 }),
      drive: new MeshStandardMaterial({ map: tex(concreteTexture(), 2, 7), roughness: 0.9 }),
      walk: new MeshStandardMaterial({ map: tex(concreteTexture(), 40, 1), roughness: 0.9 }),
      garageDoor: new MeshStandardMaterial({ map: garageTexture(), roughness: 0.55, metalness: 0.2, emissive: '#2a2c34', emissiveIntensity: 0.25 }),
      door: new MeshStandardMaterial({ color: '#5a1f1a', roughness: 0.5 }),
    }
  }, [])

  const roofMain = useMemo(() => gable(BLOCK_W, BLOCK_D, 2.5, 0.55), [])
  const roofGarage = useMemo(() => gable(5.6, 7, 1.25, 0.45), [])
  const roofPorch = useMemo(() => gable(3.3, 2.1, 0.95, 0.25), [])

  // picket fence along the sidewalk (instanced)
  useEffect(() => {
    const im = pickets.current
    if (!im) return
    const o = new Object3D()
    let k = 0
    for (let i = 0; i < 70; i++) {
      const x = -26 + i * 0.75
      if (Math.abs(x) < 3.1) continue // gap for the driveway
      o.position.set(x, 0.4, -6.6)
      o.updateMatrix()
      im.setMatrixAt(k++, o.matrix)
    }
    im.count = k
    im.instanceMatrix.needsUpdate = true
  }, [])

  useSceneFrame(1, (p, dt, state) => {
    // ------- front door swings open (slight anticipation: a tiny settle against the frame first), then the camera walks in
    const open = easeInOut(range(p, 0.7, 0.9))
    const nudge = Math.sin(Math.PI * range(p, 0.66, 0.72)) * 0.05
    if (doorPivot.current) doorPivot.current.rotation.y = -(open * 1.55 + nudge)

    // ------- camera: a spline up the drive that decelerates toward the porch, with a walking bob and a hint of drift
    const pos = keys(p, [
      { p: 0, v: [-13, 1.75, 5.5] },
      { p: 0.2, v: [-5.2, 1.72, 3.3] },
      { p: 0.38, v: [-0.6, 1.68, -3.2] },
      { p: 0.58, v: [0.05, 1.62, -12.5] },
      { p: 0.76, v: [0, 1.62, -19.4] },
      { p: 0.9, v: [0, 1.62, -22.6] },
      { p: 1, v: [0, 1.6, -24.6] },
    ])
    const look = keys(p, [
      { p: 0, v: [0, 3.5, -26] },
      { p: 0.4, v: [0, 2.6, -26] },
      { p: 0.8, v: [0, 1.6, -27] },
      { p: 1, v: [0, 1.5, -29] },
    ])
    const walk = smooth(0.1, 0.25, p) * (1 - smooth(0.88, 0.98, p))
    pos[1] += Math.sin(p * 230) * 0.032 * walk
    pos[0] += Math.sin(p * 115) * 0.04 * walk
    setCam(1, state.camera as never, pos, look, 58 - smooth(0.6, 1, p) * 7, dt, { lambda: 6, parallax: 0.2 })
    // the hallway light floods the lens as the door opens
    light.ptMul = 1 + smooth(0.7, 0.95, p) * 0.9
  })

  return (
    <group>
      {/* ---- ground: lawn, road with curb, sidewalk, driveway slab --------------------------------------------- */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, -20]} material={m.lawn}>
        <planeGeometry args={[240, 160]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} material={m.road}>
        <planeGeometry args={[240, 8]} />
      </mesh>
      {Array.from({ length: 22 }).map((_, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[-66 + i * 6.2, 0.012, 0]}>
          <planeGeometry args={[2.6, 0.16]} />
          <meshBasicMaterial color="#8b8774" />
        </mesh>
      ))}
      <Box position={[0, 0.07, -4.15]} size={[240, 0.16, 0.3]} color="#585b63" rough={0.9} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, -5.4]} material={m.walk}>
        <planeGeometry args={[240, 2.2]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, -14]} material={m.drive}>
        <planeGeometry args={[5.2, 19]} />
      </mesh>
      {/* driveway apron wide enough to reach the garage + a path to the porch */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-4.9, 0.034, -21.2]} material={m.drive}>
        <planeGeometry args={[7.4, 3.4]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.036, -21.0]} material={m.drive}>
        <planeGeometry args={[2.0, 3.4]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, -14]}>
        <planeGeometry args={[11, 21]} />
        <meshBasicMaterial color="#ffb347" transparent opacity={0.035} blending={AdditiveBlending} depthWrite={false} />
      </mesh>

      {/* ---- the house ------------------------------------------------------------------------------------------ */}
      {/* foundation */}
      <Box position={[0, 0.25, FRONT_Z - BLOCK_D / 2]} size={[BLOCK_W + 0.3, 0.5, BLOCK_D + 0.3]} color="#3a3c44" rough={0.95} />
      {/* front wall: slab with a door-sized opening (left, right, header) so the camera can walk straight in */}
      <mesh position={[-(BLOCK_W / 4 + 0.475), BLOCK_H / 2 + 0.25, FRONT_Z - 0.15]} material={m.siding}>
        <boxGeometry args={[BLOCK_W / 2 - 0.95, BLOCK_H, 0.3]} />
      </mesh>
      <mesh position={[BLOCK_W / 4 + 0.475, BLOCK_H / 2 + 0.25, FRONT_Z - 0.15]} material={m.siding}>
        <boxGeometry args={[BLOCK_W / 2 - 0.95, BLOCK_H, 0.3]} />
      </mesh>
      <mesh position={[0, 2.9 + (BLOCK_H + 0.25 - 2.9) / 2, FRONT_Z - 0.15]} material={m.siding}>
        <boxGeometry args={[1.9, BLOCK_H + 0.25 - 2.9, 0.3]} />
      </mesh>
      {/* body behind the hallway, side + back walls */}
      <mesh position={[0, BLOCK_H / 2 + 0.25, FRONT_Z - HALL_D - (BLOCK_D - HALL_D) / 2]} material={m.siding}>
        <boxGeometry args={[BLOCK_W, BLOCK_H, BLOCK_D - HALL_D]} />
      </mesh>
      <mesh position={[-(BLOCK_W / 2 - 1.5), BLOCK_H / 2 + 0.25, FRONT_Z - HALL_D / 2 - 0.15]} material={m.siding}>
        <boxGeometry args={[3, BLOCK_H, HALL_D - 0.3]} />
      </mesh>
      <mesh position={[BLOCK_W / 2 - 1.5, BLOCK_H / 2 + 0.25, FRONT_Z - HALL_D / 2 - 0.15]} material={m.siding}>
        <boxGeometry args={[3, BLOCK_H, HALL_D - 0.3]} />
      </mesh>
      {/* hallway lining: warm light spilling from the open door */}
      <group position={[0, 0, FRONT_Z]}>
        {[
          { p: [-0.95, 1.45, -HALL_D / 2], r: [0, Math.PI / 2, 0], s: [HALL_D, 2.5] },
          { p: [0.95, 1.45, -HALL_D / 2], r: [0, -Math.PI / 2, 0], s: [HALL_D, 2.5] },
          { p: [0, 0.28, -HALL_D / 2], r: [-Math.PI / 2, 0, 0], s: [1.9, HALL_D] },
          { p: [0, 2.7, -HALL_D / 2], r: [Math.PI / 2, 0, 0], s: [1.9, HALL_D] },
          { p: [0, 1.45, -HALL_D], r: [0, 0, 0], s: [1.9, 2.5] },
        ].map((q, i) => (
          <mesh key={i} position={q.p as [number, number, number]} rotation={q.r as [number, number, number]}>
            <planeGeometry args={q.s as [number, number]} />
            <meshBasicMaterial color={new Color(i === 2 ? '#ffb15e' : '#ffcf92').multiplyScalar(1.5)} side={DoubleSide} toneMapped={false} />
          </mesh>
        ))}
        <Glow position={[0, 1.4, -1.2]} size={[3.4, 3.4]} color="#ffb347" opacity={0.5} boost={1.5} />
      </group>
      {/* roofs, chimney */}
      <mesh geometry={roofMain} material={m.roof} position={[0, BLOCK_H + 0.25, FRONT_Z - BLOCK_D / 2]} rotation={[0, 0, 0]} />
      <Box position={[3.2, BLOCK_H + 2.1, FRONT_Z - 5.4]} size={[0.9, 2.6, 0.9]} color="#4a3a36" rough={0.95} />
      <Box position={[3.2, BLOCK_H + 3.45, FRONT_Z - 5.4]} size={[1.1, 0.14, 1.1]} color="#2a2a30" rough={0.8} />
      {/* eaves trim */}
      <Box position={[0, BLOCK_H + 0.3, FRONT_Z + 0.5]} size={[BLOCK_W + 1.2, 0.18, 0.2]} color="#e8e4da" rough={0.6} />
      {/* attic window in the gable */}
      <mesh position={[0, BLOCK_H + 1.15, FRONT_Z + 0.02]} material={new MeshBasicMaterial({ map: windowTexture('#ffb347'), toneMapped: false })}>
        <planeGeometry args={[0.8, 0.9]} />
      </mesh>

      {/* garage to the left */}
      <mesh position={[-(BLOCK_W / 2 + 2.75), 1.95, FRONT_Z - 3.5]} material={m.garageWall}>
        <boxGeometry args={[5.5, 3.4, 7]} />
      </mesh>
      <mesh geometry={roofGarage} material={m.roof} position={[-(BLOCK_W / 2 + 2.75), 3.65, FRONT_Z - 3.5]} />
      <mesh position={[-(BLOCK_W / 2 + 2.75), 1.45, FRONT_Z + 0.03]} material={m.garageDoor}>
        <planeGeometry args={[4.2, 2.5]} />
      </mesh>
      <Box position={[-(BLOCK_W / 2 + 2.75), 2.78, FRONT_Z + 0.06]} size={[4.5, 0.14, 0.1]} color="#e8e4da" rough={0.6} />
      <Emit position={[-(BLOCK_W / 2 + 2.75), 2.5, FRONT_Z + 0.07]} size={[3.4, 0.16, 0.02]} color="#ffe2b0" boost={0.9} />

      {/* windows (upstairs: living-room TV + warm rooms; ground floor; basement wells at ground level) */}
      <Window x={-3.4} y={4.1} tv idx={1} />
      <Window x={3.4} y={4.1} idx={2} />
      <Window x={-3.4} y={1.7} idx={3} />
      <Window x={3.4} y={1.7} idx={4} />
      <Window x={-3.4} y={0.72} w={0.95} h={0.4} tv idx={7} shutters={false} />
      <Window x={3.4} y={0.72} w={0.95} h={0.4} tv idx={8} shutters={false} />

      {/* porch: steps, columns, roof, rail, lamp */}
      <Box position={[0, 0.1, FRONT_Z + 1.1]} size={[3.4, 0.2, 2.2]} color="#555961" rough={0.9} />
      <Box position={[0, 0.2, FRONT_Z + 0.65]} size={[3.0, 0.2, 1.3]} color="#6a6e77" rough={0.9} />
      <Box position={[0, 0.3, FRONT_Z + 0.3]} size={[2.6, 0.2, 0.6]} color="#7b7f88" rough={0.9} />
      {[-1.45, 1.45].map((x) => (
        <Box key={x} position={[x, 1.6, FRONT_Z + 1.95]} size={[0.18, 2.9, 0.18]} color="#e8e4da" rough={0.6} />
      ))}
      <mesh geometry={roofPorch} material={m.roof} position={[0, 3.05, FRONT_Z + 1.05]} />
      {[-1, 1].map((s) => (
        <Box key={s} position={[s * 1.15, 0.78, FRONT_Z + 2.0]} size={[1.0, 0.07, 0.07]} color="#e8e4da" rough={0.6} />
      ))}
      <Emit position={[-1.15, 2.2, FRONT_Z + 0.12]} size={[0.14, 0.24, 0.14]} color="#ffd9a0" boost={2.4} />
      <Glow position={[-1.15, 2.2, FRONT_Z + 0.6]} size={2.2} color="#ffb871" opacity={0.5} />

      {/* the front door: hinged at its left edge, swings inward-out toward the camera */}
      {/* door casing (left, right, header) — the doorway itself stays open */}
      <Box position={[-0.97, 1.7, FRONT_Z + 0.05]} size={[0.14, 2.6, 0.12]} color="#e8e4da" rough={0.6} />
      <Box position={[0.97, 1.7, FRONT_Z + 0.05]} size={[0.14, 2.6, 0.12]} color="#e8e4da" rough={0.6} />
      <Box position={[0, 2.98, FRONT_Z + 0.05]} size={[2.1, 0.14, 0.12]} color="#e8e4da" rough={0.6} />
      <group position={[-0.85, 0, FRONT_Z + 0.1]}>
        <group ref={doorPivot}>
          <mesh position={[0.85, 1.45, 0]} material={m.door}>
            <boxGeometry args={[1.7, 2.35, 0.1]} />
          </mesh>
          {[[0.85, 1.95], [0.85, 0.95]].map(([x, y], i) => (
            <Box key={i} position={[x, y, 0.06]} size={[1.2, 0.8, 0.03]} color="#6b2a22" rough={0.5} />
          ))}
          <Box position={[1.5, 1.4, 0.1]} size={[0.07, 0.07, 0.1]} color="#c8a85c" metal={0.9} rough={0.3} />
        </group>
      </group>
      <Glow position={[0, 0.2, FRONT_Z + 3]} size={[8, 4]} color="#ffb347" opacity={0.2} />

      {/* hedges, flower beds, mailbox */}
      {[-6.6, -4.4, 4.4, 6.6].map((x, i) => (
        <mesh key={i} position={[x, 0.42, FRONT_Z + 0.55]} scale={[1.3, 0.8, 0.8]}>
          <icosahedronGeometry args={[0.62, 1]} />
          <meshStandardMaterial color={i % 2 ? '#15351f' : '#1b4227'} roughness={1} flatShading />
        </mesh>
      ))}
      <group position={[3.6, 0, -6.2]}>
        <Box position={[0, 0.55, 0]} size={[0.1, 1.1, 0.1]} color="#3a3c44" />
        <Box position={[0, 1.15, 0]} size={[0.28, 0.24, 0.5]} color="#2a3550" rough={0.5} metal={0.5} />
      </group>

      {/* lived-in details: wheelie bins by the garage, a kid's hoop over the garage door, a bike left on the lawn, porch plants */}
      {[0, 1].map((i) => (
        <group key={i} position={[-(BLOCK_W / 2 + 4.9) + i * 0.85, 0, FRONT_Z + 1.5]} rotation={[0, 0.12 * (i ? -1 : 1), 0]}>
          <Box position={[0, 0.48, 0]} size={[0.56, 0.96, 0.62]} color={i ? '#1f3b2a' : '#1d2a44'} rough={0.6} />
          <Box position={[0, 0.99, -0.02]} size={[0.62, 0.07, 0.68]} color={i ? '#183021' : '#16213a'} rough={0.6} />
          <Box position={[0, 0.55, 0.32]} size={[0.3, 0.05, 0.02]} color="#0b0b0e" />
        </group>
      ))}
      <group position={[-(BLOCK_W / 2 + 2.75), 3.05, FRONT_Z + 0.08]}>
        <Box size={[1.05, 0.7, 0.05]} color="#e8e4da" rough={0.5} />
        <Box position={[0, -0.12, 0.03]} size={[0.4, 0.3, 0.01]} color="#b3202a" />
        <mesh position={[0, -0.25, 0.28]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.2, 0.014, 6, 18]} />
          <meshStandardMaterial color="#e0702a" roughness={0.4} metalness={0.4} />
        </mesh>
      </group>
      <group position={[4.8, 0.05, FRONT_Z + 3.4]} rotation={[0, 0.7, 0]}>
        {[-0.36, 0.36].map((x) => (
          <mesh key={x} position={[x, 0.03, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.24, 0.025, 6, 16]} />
            <meshStandardMaterial color="#111" roughness={0.8} />
          </mesh>
        ))}
        <Box position={[0, 0.1, 0]} size={[0.78, 0.03, 0.04]} color="#b3202a" rough={0.5} metal={0.5} />
        <Box position={[0.25, 0.14, 0]} size={[0.04, 0.04, 0.3]} color="#222" />
      </group>
      <Plant position={[-1.6, 0.2, FRONT_Z + 1.7]} scale={0.8} color="#2a5a30" />
      <Plant position={[1.6, 0.2, FRONT_Z + 1.7]} scale={0.7} />

      {/* picket fence */}
      {!store.mobile && (
        <instancedMesh ref={pickets} args={[undefined, undefined, 70]} frustumCulled={false}>
          <boxGeometry args={[0.1, 0.8, 0.03]} />
          <meshStandardMaterial color="#d9d5c8" roughness={0.7} />
        </instancedMesh>
      )}

      {/* ---- trees, lamps, parked cars, the passing car ---------------------------------------------------------- */}
      {trees.map((t, i) => <Tree key={i} {...t} />)}
      <Lamp x={-15} z={-3.6} />
      <Lamp x={14} z={-3.6} flip={-1} />
      <Lamp x={-3.7} z={-12.2} />
      <Lamp x={3.7} z={-18} flip={-1} />
      <group position={[-7.9, 0, -15]} rotation={[0, Math.PI / 2, 0]}>
        <Car color="#3a2226" />
      </group>
      <group position={[7.9, 0, -19]} rotation={[0, -Math.PI / 2, 0]}>
        <Car color="#1f2c44" />
      </group>
      <MovingCar />

      {/* ---- sky ----------------------------------------------------------------------------------------------- */}
      <mesh position={[-34, 34, -90]}>
        <sphereGeometry args={[3.2, 20, 16]} />
        <meshBasicMaterial color={new Color('#dfe8ff').multiplyScalar(1.8)} toneMapped={false} />
      </mesh>
      <Glow position={[-34, 34, -88]} size={40} color="#8fa6ff" opacity={0.45} />
      <ParticleField count={count(420)} box={[240, 70, 160]} vel={[0, 0, 0]} size={7} color="#cfd9ff" opacity={0.8} position={[0, 45, -40]} seed={21} />
      <ParticleField count={count(140)} box={[20, 8, 24]} vel={[0, 0.18, 0]} size={9} color="#ffb347" opacity={0.6} position={[0, 3, -16]} seed={4} />
    </group>
  )
}
