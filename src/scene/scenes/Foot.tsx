import { useMemo, useRef } from 'react'
import {
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Sprite,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
  MeshBasicMaterial,
} from 'three'
import { Glow } from '../shapes'
import { ParticleField } from '../particles'
import { useSceneFrame, count } from '../hooks'
import { setCam, keys } from '../camera'
import { heartbeat, lerp, smooth, easeInOut, clamp01 } from '../../core/math'
import { store } from '../../core/store'
import { palette } from '../../theme'
import { light } from '../Rig'

/**
 * 11 — THE BROKEN FOOT. An anatomical bone model (tibia, fibula, talus, calcaneus, tarsals, five metatarsals, toe phalanges) and a
 * fracture told as a physical event in four beats, all scroll-driven:
 *   stress   (.04–.14)  a hairline crack creeps round the middle metatarsal, flaring red with each heartbeat of pain
 *   snap     (.15)      the bone separates with a spring (overshoot, rebound), shards fly out on ballistic arcs, the DOM crack
 *                       races across the screen
 *   hold     (.2–.5)    the break hangs open, shards drifting down
 *   heal     (.52–.82)  shards are drawn back in, the halves realign with a settling spring, golden light flows along the crack
 *                       line and then the whole bone, a callus ring thickens at the join, and a final pulse rolls toe-ward
 */
const BONE = '#e8e2d2'
const UPY = new Vector3(0, 1, 0)
const C_RED = new Color('#ff4a3a')
const C_WHITE = new Color('#ffffff')
const C_PAIN = new Color('#ff4a4a')
const goldHot = new Color()

interface Rig {
  root: Group
  distal: Group // distal half of the fractured metatarsal + its toes
  seamGroup: Group
  seamMesh: Mesh
  seamGeom: BufferGeometry
  seamCount: number
  callus: Mesh
  shards: Mesh[]
  origin: Vector3 // fracture location (foot-local)
  axis: Vector3
  mats: MeshStandardMaterial[]
}

function bone(a: Vector3, b: Vector3, r1: number, r2: number, mat: MeshStandardMaterial, knobs = true, origin?: Vector3) {
  const g = new Group()
  const o = origin ?? new Vector3()
  const A = a.clone().sub(o)
  const B = b.clone().sub(o)
  const len = A.distanceTo(B)
  const m = new Mesh(new CylinderGeometry(r2, r1, len, 10, 1), mat)
  m.position.copy(A).add(B).multiplyScalar(0.5)
  m.quaternion.setFromUnitVectors(UPY, B.clone().sub(A).normalize())
  g.add(m)
  if (knobs) {
    const k1 = new Mesh(new SphereGeometry(r1 * 1.18, 10, 8), mat)
    k1.position.copy(A)
    const k2 = new Mesh(new SphereGeometry(r2 * 1.18, 10, 8), mat)
    k2.position.copy(B)
    g.add(k1, k2)
  }
  return g
}

function buildFoot(gold: Color): Rig {
  const mat = new MeshStandardMaterial({ color: BONE, roughness: 0.5, metalness: 0.05, emissive: new Color('#000000') })
  const matDark = new MeshStandardMaterial({ color: '#d4cdb8', roughness: 0.6, metalness: 0.03, emissive: new Color('#000000') })
  const root = new Group()
  const add = (o: Object3D) => root.add(o)
  const P = (x: number, y: number, z: number) => new Vector3(x, y, z)

  // ---- shank
  add(bone(P(0, 0.12, -0.62), P(0.01, 1.55, -0.72), 0.12, 0.15, mat, true))
  add(bone(P(0.2, 0.0, -0.66), P(0.22, 1.45, -0.74), 0.045, 0.06, matDark, true))
  // ---- hindfoot
  const talus = new Mesh(new SphereGeometry(0.17, 14, 10), mat)
  talus.position.set(0, 0.09, -0.58)
  talus.scale.set(1, 0.82, 1.15)
  add(talus)
  add(bone(P(0, -0.02, -0.74), P(0, -0.08, -1.06), 0.14, 0.17, mat, true)) // calcaneus
  // ---- midfoot: navicular, cuboid, three cuneiforms
  const blocks: [number, number, number, number, number, number][] = [
    [0.0, 0.0, -0.3, 0.2, 0.12, 0.14],
    [0.2, -0.03, -0.36, 0.19, 0.12, 0.2],
    [-0.17, -0.01, -0.12, 0.13, 0.11, 0.13],
    [0.0, -0.01, -0.12, 0.13, 0.11, 0.13],
    [0.17, -0.01, -0.14, 0.13, 0.11, 0.13],
  ]
  for (const [x, y, z, w, h, d] of blocks) {
    const b = new Mesh(new SphereGeometry(0.5, 10, 8), matDark)
    b.position.set(x, y, z)
    b.scale.set(w, h, d)
    add(b)
  }

  // ---- forefoot: five rays. Ray 2 (the middle one) is the one that breaks.
  const FR = 2
  const origin = new Vector3()
  let axis = new Vector3(0, 0, 1)
  let distal!: Group
  let seamPoint = new Vector3()
  for (let i = 0; i < 5; i++) {
    const x0 = (i - 2) * 0.11
    const x1 = (i - 2) * 0.17
    const len = [0.8, 0.84, 0.82, 0.74, 0.66][i]
    const start = P(x0, -0.02, -0.06)
    const end = P(x1, -0.04, -0.06 + len)
    const r1 = i === 0 ? 0.075 : 0.058
    const r2 = i === 0 ? 0.06 : 0.046
    const dir = end.clone().sub(start).normalize()
    if (i === FR) {
      seamPoint = start.clone().lerp(end, 0.5)
      axis = dir.clone()
      origin.copy(seamPoint)
      add(bone(start, seamPoint, r1, (r1 + r2) / 2, mat, true)) // proximal half stays
      distal = new Group()
      distal.position.copy(seamPoint)
      distal.add(bone(seamPoint, end, (r1 + r2) / 2, r2, mat, true, seamPoint))
      // toes of this ray
      let cur = end.clone()
      const segs = [0.2, 0.15, 0.12]
      segs.forEach((l, k) => {
        const nxt = cur.clone().addScaledVector(dir, l).add(P(0, -0.012 * (k + 1), 0))
        distal.add(bone(cur, nxt, 0.044 - k * 0.006, 0.04 - k * 0.006, mat, true, seamPoint))
        cur = nxt
      })
      root.add(distal)
    } else {
      add(bone(start, end, r1, r2, mat, true))
      let cur = end.clone()
      const segs = i === 0 ? [0.28, 0.2] : [0.22, 0.15, 0.12]
      segs.forEach((l, k) => {
        const nxt = cur.clone().addScaledVector(dir, l).add(P(0, -0.012 * (k + 1), 0))
        add(bone(cur, nxt, (i === 0 ? 0.062 : 0.044) - k * 0.006, (i === 0 ? 0.055 : 0.04) - k * 0.006, mat, true))
        cur = nxt
      })
    }
  }

  // ---- fracture hardware: seam crack (a jagged ring that is drawn round the bone), callus, shards
  const seamGroup = new Group()
  seamGroup.position.copy(seamPoint)
  seamGroup.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), axis)
  const pts: Vector3[] = []
  const N = 28
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2
    const jag = (i % 2 ? 1 : -1) * 0.028 * (0.6 + 0.4 * Math.sin(i * 2.3))
    const rr = 0.066
    pts.push(new Vector3(Math.cos(a) * rr, Math.sin(a) * rr, jag))
  }
  const seamGeom = new TubeGeometry(new CatmullRomCurve3(pts, false), 80, 0.0075, 4, false)
  const seamMat = new MeshBasicMaterial({ color: '#ff4a3a', toneMapped: false, transparent: true, opacity: 1 })
  const seamMesh = new Mesh(seamGeom, seamMat)
  seamMesh.frustumCulled = false
  seamGroup.add(seamMesh)
  root.add(seamGroup)
  const seamCount = seamGeom.index ? seamGeom.index.count : 0
  seamGeom.setDrawRange(0, 0)

  const callus = new Mesh(new TorusGeometry(0.068, 0.03, 8, 20), new MeshStandardMaterial({ color: '#f1e6c8', emissive: gold, emissiveIntensity: 0, roughness: 0.55, transparent: true, opacity: 0 }))
  callus.position.copy(seamPoint)
  callus.quaternion.copy(seamGroup.quaternion)
  root.add(callus)

  const shards: Mesh[] = []
  for (let i = 0; i < 8; i++) {
    const s = new Mesh(new IcosahedronGeometry(1, 0), mat)
    s.visible = false
    root.add(s)
    shards.push(s)
  }
  return { root, distal, seamGroup, seamMesh, seamGeom, seamCount, callus, shards, origin: seamPoint, axis, mats: [mat, matDark] }
}

/** spring step response: 0 → 1 with overshoot and rebound (u in 0..1 over the settle time) */
const spring = (u: number, k = 7, w = 15) => (u <= 0 ? 0 : 1 - Math.exp(-k * u) * Math.cos(w * u))

export function Foot() {
  const accent = palette()
  const foot = useRef<Group>(null)
  const halo = useRef<Sprite>(null)
  const travel = useRef<Sprite>(null)
  const gold = useMemo(() => new Color(accent.warm), [accent])
  const rig = useMemo(() => buildFoot(gold), [gold])
  const shardSeeds = useMemo(
    () => Array.from({ length: 8 }, (_, i) => ({ a: (i / 8) * Math.PI * 2 + 0.3, up: 0.5 + (i % 3) * 0.3, sp: 0.5 + (i % 4) * 0.22, s: 0.022 + (i % 3) * 0.012 })),
    [],
  )
  const tmp = useMemo(() => new Vector3(), [])

  useSceneFrame(10, (p, dt, state) => {
    const t = state.clock.elapsedTime
    const beat = heartbeat(t, 72)
    const stress = smooth(0.04, 0.14, p)
    const snapU = clamp01((p - 0.15) / 0.12) // time since the snap
    const snap = spring(snapU) * (p >= 0.15 ? 1 : 0)
    const heal = easeInOut(smooth(0.52, 0.8, p))
    const open = snap * (1 - heal) // how far the break is open

    if (foot.current) {
      // toes point sideways so the camera sees the foot in profile
      foot.current.rotation.y = lerp(1.0, 2.15, p)
      foot.current.rotation.x = 0.1
      // the foot reacts to the snap: a sharp jolt that settles
      const jolt = Math.exp(-snapU * 9) * Math.sin(snapU * 50) * (p > 0.15 ? 1 : 0) * 0.04
      foot.current.position.set(0, -0.2 + Math.sin(t * 0.7) * 0.03 + jolt, 0)
    }

    // ---- fracture mechanics
    const d = rig.distal
    // the distal half kicks away along the bone and hinges sideways + down about the fracture, then realigns with a spring on healing
    d.position.copy(rig.origin).addScaledVector(rig.axis, 0.2 * open)
    d.position.y -= 0.12 * open
    d.rotation.set(0.42 * open, 0.12 * open, 0.1 * open * Math.sin(t * 20) * Math.exp(-snapU * 4))
    // healing: a settling spring as the halves lock back together
    const hs = clamp01((p - 0.7) / 0.14)
    if (p > 0.7 && p < 0.84) d.position.addScaledVector(rig.axis, 0.012 * Math.exp(-hs * 6) * Math.sin(hs * 30))

    // crack line: creeps round during the stress phase, glows red with the pulse; turns white at the snap; gold light flows along it on healing
    const seam = rig.seamMesh.material as MeshBasicMaterial
    const drawn = Math.max(stress, snap > 0 ? 1 : 0)
    rig.seamGeom.setDrawRange(0, Math.floor(drawn * rig.seamCount))
    const pain = (1 - snapU) * (p < 0.2 ? 1 : 0)
    seam.color.copy(C_RED).lerp(C_WHITE, snap).lerp(goldHot.copy(gold).multiplyScalar(1.5), heal)
    seam.color.multiplyScalar(1.2 + (stress * (1 - snap) * beat + pain * 0.8) * 2.2 + heal * (0.8 + beat * 1.4))
    seam.opacity = p > 0.15 ? 1 - smooth(0.88, 0.98, p) * 0.7 : 0.55 + 0.45 * stress

    // callus thickens at the join as it heals, with a pulse
    const cm = rig.callus.material as MeshStandardMaterial
    cm.opacity = smooth(0.62, 0.78, p)
    cm.emissiveIntensity = heal * (0.5 + beat * 1.2)
    rig.callus.scale.setScalar(1 + 0.15 * smooth(0.62, 0.8, p) * (1 + 0.2 * Math.sin(t * 3)))

    // bones carry the glow: a wave of gold rolls through the bone toe-ward (a sprite rides the metatarsal)
    const wave = smooth(0.74, 0.92, p)
    for (const m of rig.mats) {
      m.emissive.copy(gold)
      m.emissiveIntensity = heal * (0.25 + beat * 0.2) + wave * (1 - smooth(0.92, 1, p)) * 0.5
    }
    if (travel.current) {
      tmp.copy(rig.origin).addScaledVector(rig.axis, lerp(-0.4, 0.55, wave))
      travel.current.position.copy(tmp)
      travel.current.material.opacity = Math.sin(Math.PI * wave) * 0.9
    }

    // shards: thrown out ballistically at the snap, drift down, then drawn back into the break as it mends
    rig.shards.forEach((s, i) => {
      const sd = shardSeeds[i]
      const tt = Math.max(0, (p - 0.15) * 9)
      const vis = p > 0.15 && heal < 0.97
      s.visible = vis
      if (!vis) return
      const out = 1 - Math.exp(-tt * 1.6)
      tmp.copy(rig.origin)
      tmp.x += Math.cos(sd.a) * sd.sp * out * 0.45
      tmp.z += Math.sin(sd.a) * sd.sp * out * 0.45 * 0.6
      tmp.y += sd.up * out * 0.4 - 0.5 * 0.9 * Math.pow(Math.max(0, tt - 0.5), 2) * 0.35
      tmp.lerp(rig.origin, heal)
      s.position.copy(tmp)
      s.rotation.set(tt * 2 + i, tt * 1.6, i)
      s.scale.setScalar(sd.s * (1 - heal) * (0.6 + 0.4 * snap))
    })

    if (halo.current) {
      halo.current.material.opacity = 0.18 + heal * 0.55 + open * 0.2
      halo.current.material.color.copy(open > 0.3 ? C_PAIN : gold).multiplyScalar(1.6)
    }
    light.ptMul = 1 + heal * 1.4 + pain * 0.8
    // a short camera flinch on the snap, then calm
    const shake = Math.exp(-snapU * 7) * (p > 0.15 ? 1 : 0) * 0.05
    const pos = keys(p, [
      { p: 0, v: [0.6, 1.5, 5.6] },
      { p: 0.5, v: [0.4, 1.25, 5.1] },
      { p: 1, v: [0.2, 1.0, 4.7] },
    ])
    pos[0] += Math.sin(t * 60) * shake
    pos[1] += Math.cos(t * 55) * shake
    setCam(10, state.camera as never, pos, [0, 0.15, 0.2], 42, dt, { lambda: 4, parallax: 0.15 })
  })

  return (
    <group>
      <Glow ref={halo} position={[0, 0.3, -1.4]} size={[9, 7]} color="#ff4a4a" opacity={0.25} boost={1.6} />
      <group ref={foot} scale={1.35}>
        <primitive object={rig.root} />
        <Glow ref={travel} position={[0, 0, 0]} size={0.9} color="#ffd34e" opacity={0} boost={2} />
      </group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.1, 0]}>
        <circleGeometry args={[9, 48]} />
        <meshStandardMaterial color="#0b0b0e" roughness={0.4} metalness={0.7} />
      </mesh>
      <ParticleField count={count(220)} box={[8, 6, 8]} vel={[0, 0.35, 0]} size={12} color="#ffc15a" opacity={0.55} position={[0, 1, 0]} seed={44} speed={() => 0.15 + smooth(0.5, 0.8, store.local[10]) * 1.2} />
    </group>
  )
}
