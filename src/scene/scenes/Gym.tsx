import { useMemo, useRef } from 'react'
import { BoxGeometry, CanvasTexture, Group, Mesh, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, Vector3, NearestFilter } from 'three'
import { createFigure, resetPose, solveArm } from '../figure'
import { rimMaterial } from '../materials'
import { Emit, Glow, Box } from '../shapes'
import { ParticleField } from '../particles'
import { useSceneFrame, count } from '../hooks'
import { setCam } from '../camera'
import { lerp, smooth } from '../../core/math'
import { store } from '../../core/store'

/**
 * 09 — WALKING INTO THE GYM: the camera steps through a narrow door into a tight, slightly claustrophobic room
 * (low ceiling, walls close in, heavy bags swinging right beside you) while silhouettes train in the distance —
 * pad work, sparring, ground grappling, shadow boxing. As the copy progresses the walls slide apart and the room opens up.
 */
const t0 = new Vector3()
const t1 = new Vector3()

function matTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = '#7b1c22'; g.fillRect(0, 0, 64, 64); g.fillRect(64, 64, 64, 64)
  g.fillStyle = '#1c1c20'; g.fillRect(64, 0, 64, 64); g.fillRect(0, 64, 64, 64)
  g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 2; g.strokeRect(0, 0, 128, 128)
  const t = new CanvasTexture(c)
  t.wrapS = t.wrapT = RepeatWrapping
  t.repeat.set(10, 22)
  t.colorSpace = SRGBColorSpace
  t.magFilter = NearestFilter
  return t
}

function wallTexture() {
  const c = document.createElement('canvas')
  c.width = 256; c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = '#17181d'; g.fillRect(0, 0, 256, 128)
  g.fillStyle = '#1f2027'
  for (let i = 0; i < 8; i++) g.fillRect(i * 32 + 2, 0, 28, 128)
  g.fillStyle = '#2a2b33'; g.fillRect(0, 88, 256, 4)
  const t = new CanvasTexture(c)
  t.wrapS = t.wrapT = RepeatWrapping
  t.repeat.set(14, 1)
  t.colorSpace = SRGBColorSpace
  return t
}

export function Gym() {
  const wallL = useRef<Mesh>(null)
  const wallR = useRef<Mesh>(null)
  const ceil = useRef<Mesh>(null)
  const strips = useRef<Group>(null)
  const bags = useRef<(Group | null)[]>([])

  const mats = useMemo(() => ({ floor: new MeshStandardMaterial({ map: matTexture(), roughness: 0.85 }), wall: new MeshStandardMaterial({ map: wallTexture(), roughness: 0.9, color: '#b8bcc8' }) }), [])
  const rim = useMemo(() => rimMaterial('#0a0b10', '#d6e0ff', 2.6, 1.8), [])
  const mobile = store.mobile

  // pairs of fighters
  const pad = useMemo(() => ({ k: createFigure(rim), h: createFigure(rim) }), [rim])
  const spar = useMemo(() => ({ a: createFigure(rim), b: createFigure(rim) }), [rim])
  const mat = useMemo(() => ({ a: createFigure(rim), b: createFigure(rim) }), [rim])
  const shadow = useMemo(() => createFigure(rim), [rim])
  // focus mitts strapped to the pad holder's hands
  useMemo(() => {
    for (const tip of [pad.h.tipL, pad.h.tipR]) {
      const m = new Mesh(new BoxGeometry(0.3, 0.1, 0.4), new MeshStandardMaterial({ color: '#b0262d', roughness: 0.6, emissive: '#3a0508' }))
      m.position.y = 0.02
      tip.add(m)
    }
  }, [pad])

  const bagPos = useMemo(() => [[-1, -3], [1, -6], [-1, -9.5], [1, -12]] as [number, number][], [])

  useSceneFrame(8, (p, dt, state) => {
    const t = state.clock.elapsedTime
    const open = smooth(0.3, 0.9, p)
    const W = lerp(2.15, 8, open)
    const H = lerp(2.7, 5.2, open)
    if (wallL.current) wallL.current.position.x = -W
    if (wallR.current) wallR.current.position.x = W
    if (ceil.current) ceil.current.position.y = H
    if (strips.current) strips.current.position.y = H - 0.04
    bags.current.forEach((b, i) => {
      if (!b) return
      const [sx] = bagPos[i]
      b.position.x = sx * (W - 0.7)
      b.position.y = H
      b.rotation.z = Math.sin(t * 1.15 + i * 1.7) * 0.1
      b.rotation.x = Math.cos(t * 0.9 + i) * 0.05
    })

    // ---------- pad work (center, far end of the corridor)
    {
      resetPose(pad.k); resetPose(pad.h)
      const k = (t * 0.85) % 1
      const kick = Math.max(0, Math.sin(k * Math.PI * 2)) ** 2
      pad.k.root.position.set(-0.7, 0.95, -10.5); pad.k.root.rotation.y = Math.PI / 2
      pad.k.root.rotation.x = -0.18 * kick
      pad.k.j.hpR.rotation.x = -1.25 * kick; pad.k.j.knR.rotation.x = 0.35 * (1 - kick) + 0.1
      pad.k.j.hpL.rotation.x = 0.15
      pad.k.j.shL.rotation.x = -1.1; pad.k.j.elL.rotation.x = -1.9
      pad.k.j.shR.rotation.x = -1.0; pad.k.j.elR.rotation.x = -1.9
      pad.h.root.position.set(0.75 + kick * 0.08, 0.95, -10.5); pad.h.root.rotation.y = -Math.PI / 2
      pad.h.j.spine.rotation.x = 0.1 + kick * 0.15
      pad.h.j.shL.rotation.x = -1.35; pad.h.j.elL.rotation.x = -0.5
      pad.h.j.shR.rotation.x = -1.35; pad.h.j.elR.rotation.x = -0.5
    }
    // ---------- sparring (revealed when the wall opens)
    {
      resetPose(spar.a); resetPose(spar.b)
      spar.a.root.position.set(-3.3, 0.95 + Math.sin(t * 6) * 0.02, -7.5); spar.a.root.rotation.y = Math.PI / 2
      spar.b.root.position.set(-2.1, 0.95 + Math.sin(t * 6 + 1) * 0.02, -7.5); spar.b.root.rotation.y = -Math.PI / 2
      for (const f of [spar.a, spar.b]) {
        f.j.spine.rotation.x = 0.12
        f.j.hpL.rotation.x = -0.3; f.j.hpR.rotation.x = 0.3; f.j.knL.rotation.x = 0.3
        f.j.shL.rotation.x = -1.1; f.j.elL.rotation.x = -1.9
        f.j.shR.rotation.x = -1.0; f.j.elR.rotation.x = -1.9
      }
      spar.a.root.updateWorldMatrix(true, true); spar.b.root.updateWorldMatrix(true, true)
      const jab = Math.max(0, Math.sin(t * 3.3)) ** 6
      spar.b.j.head.getWorldPosition(t0); t0.x += 0.05
      solveArm(spar.a, 'L', t0, jab)
      const jab2 = Math.max(0, Math.sin(t * 3.1 + 2)) ** 6
      spar.a.j.head.getWorldPosition(t1); t1.x -= 0.05
      solveArm(spar.b, 'L', t1, jab2)
    }
    // ---------- ground work
    {
      resetPose(mat.a); resetPose(mat.b)
      const sway = Math.sin(t * 0.7)
      mat.b.root.rotation.y = Math.PI / 2
      mat.b.root.rotation.x = -1.5
      mat.b.root.position.set(3.0, 0.22, -9.5 + sway * 0.1)
      mat.b.j.hpL.rotation.x = -1.2; mat.b.j.hpR.rotation.x = -1.0
      mat.b.j.knL.rotation.x = 1.3; mat.b.j.knR.rotation.x = 1.5
      mat.a.root.rotation.y = -Math.PI / 2
      mat.a.root.position.set(3.75, 0.7, -9.5 + sway * 0.1)
      mat.a.root.rotation.x = 0.7
      mat.a.j.hpL.rotation.x = mat.a.j.hpR.rotation.x = -1.1
      mat.a.j.knL.rotation.x = mat.a.j.knR.rotation.x = 1.6
      mat.a.root.updateWorldMatrix(true, true); mat.b.root.updateWorldMatrix(true, true)
      mat.b.j.spine.getWorldPosition(t0)
      t0.y += 0.35 + sway * 0.04
      solveArm(mat.a, 'L', t0, 1)
      t0.z += 0.3
      solveArm(mat.a, 'R', t0, 1)
    }
    // ---------- shadow boxer
    {
      resetPose(shadow)
      shadow.root.position.set(-4.6, 0.95, -4.5); shadow.root.rotation.y = 0.4
      shadow.j.spine.rotation.x = 0.1
      shadow.j.hpL.rotation.x = -0.3; shadow.j.hpR.rotation.x = 0.3; shadow.j.knL.rotation.x = 0.3
      shadow.j.shL.rotation.x = -1.1; shadow.j.elL.rotation.x = -1.9
      shadow.j.shR.rotation.x = -1.0; shadow.j.elR.rotation.x = -1.9
      shadow.root.updateWorldMatrix(true, true)
      t0.set(-4.6 + Math.sin(0.4) * (0.9 * Math.max(0, Math.sin(t * 4)) ** 4 + 0.35), 1.5, -4.5 + Math.cos(0.4) * (0.9 * Math.max(0, Math.sin(t * 4)) ** 4 + 0.35))
      solveArm(shadow, 'R', t0, Math.max(0, Math.sin(t * 4)) ** 4)
    }

    // ---------- camera: through the door, handheld, claustrophobic → opening
    const z = lerp(14, -3.5, smooth(0, 0.92, p))
    setCam(8, state.camera as never, [Math.sin(t * 0.9) * 0.06, 1.62 + Math.sin(t * 1.8) * 0.03, z], [Math.sin(t * 0.3) * 0.5, 1.45, z - 9], lerp(36, 64, open), dt, { lambda: 6, parallax: 0.12 })
  })

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -4]} material={mats.floor}>
        <planeGeometry args={[18, 40]} />
      </mesh>
      <mesh ref={wallL} position={[-2.15, 2.6, -4]} rotation={[0, Math.PI / 2, 0]} material={mats.wall}>
        <planeGeometry args={[40, 7]} />
      </mesh>
      <mesh ref={wallR} position={[2.15, 2.6, -4]} rotation={[0, -Math.PI / 2, 0]} material={mats.wall}>
        <planeGeometry args={[40, 7]} />
      </mesh>
      <mesh ref={ceil} position={[0, 2.7, -4]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[18, 40]} />
        <meshStandardMaterial color="#0c0d11" roughness={1} />
      </mesh>
      <mesh position={[0, 3, -24]}>
        <planeGeometry args={[40, 8]} />
        <meshStandardMaterial color="#14151a" roughness={1} />
      </mesh>
      {/* the doorway you walk through */}
      <mesh position={[0, 3, 15.5]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[40, 8]} />
        <meshBasicMaterial color="#030304" />
      </mesh>
      <Glow position={[0, 2, -22]} size={[10, 5]} color="#cfd8ff" opacity={0.25} />
      <group ref={strips}>
        {[-2, -6.5, -11, -15.5, -20, 2.5, 7].map((z, i) => (
          <Emit key={i} position={[0, 0, z]} size={[0.3, 0.05, 3.2]} color="#eef3ff" boost={2.2} />
        ))}
      </group>
      {bagPos.map(([_, z], i) => (
        <group key={i} ref={(g) => (bags.current[i] = g)} position={[0, 2.7, z]}>
          <Box position={[0, -0.3, 0]} size={[0.03, 0.6, 0.03]} color="#444" />
          <mesh position={[0, -1.15, 0]}>
            <cylinderGeometry args={[0.24, 0.24, 1.15, 14]} />
            <meshStandardMaterial color="#2a1517" roughness={0.7} />
          </mesh>
        </group>
      ))}
      <primitive object={pad.k.root} />
      <primitive object={pad.h.root} />
      {!mobile && (
        <>
          <primitive object={spar.a.root} />
          <primitive object={spar.b.root} />
          <primitive object={mat.a.root} />
          <primitive object={mat.b.root} />
          <primitive object={shadow.root} />
        </>
      )}
      <ParticleField count={count(200)} box={[10, 5, 30]} vel={[0, 0.05, 0]} size={7} color="#dfe6ff" opacity={0.35} position={[0, 2.4, -6]} seed={66} />
    </group>
  )
}
