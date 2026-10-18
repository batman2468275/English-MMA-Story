import { useMemo } from 'react'
import { Color, MeshStandardMaterial, ShaderMaterial, Vector3 } from 'three'
import { createFigure, Figure, groundFigure, limitPose, lookAt, plantJoint, resetPose, solveArm } from '../figure'
import { rimMaterial, setRimLight } from '../materials'
import { Box, Emit, Glow } from '../shapes'
import { ParticleField } from '../particles'
import { useSceneFrame, count } from '../hooks'
import { setCam, keys } from '../camera'
import { clamp01, heartbeat, mulberry32, smooth } from '../../core/math'
import { light } from '../Rig'
import { store } from '../../core/store'
import { woodTexture } from '../procTextures'

/**
 * 03 — THE BASEMENT: a dim rec-room — sectional couches, bean bags, a coffee table, posters — around a huge flickering screen.
 * The crowd is alive: every person has their own breathing, weight shifts, gaze (screen ↔ neighbour) and reaction timing;
 * a "wave" of excitement rolls through the room when the fight gets loud. The silhouettes are genuinely *lit* by the screen
 * (their faces/chests glow blue, pulsing with the heartbeat) rather than just having a rim.
 */
const SCREEN = new Vector3(0, 2.3, -5.9)
const BLUE = new Color('#5f86ff')

const screenMat = () =>
  new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uBeat: { value: 0 }, uHot: { value: 0 } },
    toneMapped: false,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uBeat; uniform float uHot; varying vec2 vUv;
      float blob(vec2 p, vec2 c, float r){ return smoothstep(r, 0.0, length(p - c)); }
      void main(){
        vec2 uv = vUv; vec2 p = uv - 0.5; p.x *= 1.78;
        vec3 col = vec3(0.03, 0.06, 0.16);
        float oct = max(max(abs(p.x), abs(p.y)), (abs(p.x) + abs(p.y)) * 0.7071);
        col += smoothstep(0.36, 0.34, oct) * vec3(0.10, 0.13, 0.26);
        col += smoothstep(0.014, 0.0, abs(oct - 0.36)) * vec3(0.7, 0.8, 1.0);
        vec2 a = vec2(-0.12 + 0.12 * sin(uTime * 0.9), 0.02 * sin(uTime * 1.9));
        vec2 b = vec2( 0.12 + 0.12 * sin(uTime * 0.8 + 2.0), 0.02 * sin(uTime * 1.3));
        col += blob(p, a, 0.07) * vec3(1.0, 0.25, 0.2) + blob(p, b, 0.07) * vec3(0.3, 0.55, 1.0);
        col += blob(p, (a + b) * 0.5, 0.2) * vec3(0.18, 0.2, 0.35);
        col += step(0.06, uv.y) * step(uv.y, 0.1) * step(0.08, uv.x) * step(uv.x, 0.6) * vec3(0.5, 0.1, 0.12);
        col *= 0.88 + 0.12 * sin(uv.y * 420.0 + uTime * 12.0);
        col *= 0.9 + 0.14 * sin(uTime * 31.0) * sin(uTime * 7.0);
        col *= 1.5 + uBeat * 0.9 + uHot * 0.8;
        gl_FragColor = vec4(col, 1.0);
      }`,
  })

/** A smooth, non-repeating wobble in [-1,1] built from incommensurate sines. */
const noise = (t: number) => (Math.sin(t) + 0.6 * Math.sin(t * 2.17 + 1.3) + 0.8 * Math.sin(t * 0.53 + 4)) / 2.4

/** Room energy 0..1: a slow undulation with a loud burst every ~11 s (the fight heating up). */
function energy(t: number) {
  const c = ((t % 11) + 11) % 11
  const burst = c > 3 ? Math.exp(-(c - 3) / 1.3) * smooth(3, 3.25, c) : 0
  return clamp01(0.2 + 0.2 * noise(t * 0.19) + burst * 0.75)
}

type Kind = 'couch' | 'floor' | 'stand' | 'me'
interface Spec {
  kind: Kind
  x: number
  z: number
  seatY: number
  scale: number
  react: number
  ph: number
  pose: 0 | 1 | 2 // standing: 0 arms crossed, 1 hands in pockets, 2 loose
  tap: boolean
}

function Couch({ x, z, w = 2.4, color = '#2a2f40' }: { x: number; z: number; w?: number; color?: string }) {
  return (
    <group position={[x, 0, z]}>
      <Box position={[0, 0.17, 0]} size={[w, 0.34, 0.9]} color="#14161d" rough={0.9} />
      {[-1, 0, 1].map((i) => (
        <Box key={i} position={[(i * (w - 0.5)) / 3, 0.395, 0.0]} size={[(w - 0.5) / 3 - 0.03, 0.12, 0.78]} color={color} rough={0.85} />
      ))}
      <Box position={[0, 0.72, 0.4]} size={[w, 0.62, 0.2]} color={color} rough={0.85} />
      <Box position={[-w / 2 + 0.1, 0.5, 0]} size={[0.2, 0.55, 0.9]} color={color} rough={0.85} />
      <Box position={[w / 2 - 0.1, 0.5, 0]} size={[0.2, 0.55, 0.9]} color={color} rough={0.85} />
    </group>
  )
}

function BeanBag({ x, z, color }: { x: number; z: number; color: string }) {
  return (
    <mesh position={[x, 0.26, z]} scale={[1, 0.62, 1]}>
      <icosahedronGeometry args={[0.55, 1]} />
      <meshStandardMaterial color={color} roughness={0.95} flatShading />
    </mesh>
  )
}

export function Basement() {
  const screen = useMemo(screenMat, [])
  const crowdMat = useMemo(() => rimMaterial('#07090f', '#4d7cff', 2.4, 1.7), [])
  const meMat = useMemo(() => rimMaterial('#0a0b10', '#ffb347', 2.4, 1.7), [])
  const floorMat = useMemo(() => new MeshStandardMaterial({ map: woodTexture('#3a2c22', [6, 5]), roughness: 0.8 }), [])
  const panelMat = useMemo(() => new MeshStandardMaterial({ map: woodTexture('#2a2018', [8, 1]), roughness: 0.85 }), [])

  const specs = useMemo<Spec[]>(() => {
    const r = mulberry32(11)
    const mk = (kind: Kind, x: number, z: number, seatY: number, over: Partial<Spec> = {}): Spec => ({
      kind, x, z, seatY, scale: 0.94 + r() * 0.14, react: 0.3 + r() * 0.7, ph: r() * 50, pose: (Math.floor(r() * 3) as 0 | 1 | 2), tap: r() > 0.6, ...over,
    })
    const out: Spec[] = []
    // back couch row (z ≈ -0.4): two sectionals, three people each
    for (const cx of [-2.7, 2.7]) for (const dx of [-0.75, 0, 0.75]) out.push(mk('couch', cx + dx, -0.4, 0.45))
    // floor row right in front of the screen
    ;[-3.2, -1.1, 1.3, 3.4].forEach((x) => out.push(mk('floor', x, -3.4 + r() * 0.3, 0.12)))
    // standing crowd at the back, leaning on the wall behind
    ;[-5.2, -3.4, -1.4, 0.9, 3.0, 5.0].forEach((x) => out.push(mk('stand', x, 2.4 + r() * 0.7, 0)))
    // me and my friend on the little loveseat in front of the camera
    out.push(mk('me', -0.45, 4.2, 0.45, { scale: 0.9, react: 0.9, pose: 2, tap: false }))
    out.push(mk('me', 0.45, 4.2, 0.45, { scale: 0.88, react: 1, pose: 2, tap: true }))
    return store.mobile ? out.filter((_, i) => i % 2 === 0 || out[i].kind === 'me') : out
  }, [])

  const figs = useMemo<Figure[]>(() => specs.map((s) => createFigure(s.kind === 'me' ? meMat : crowdMat, s.scale)), [specs, meMat, crowdMat])

  const tmp = useMemo(() => new Vector3(), [])
  const tgt = useMemo(() => new Vector3(), [])
  const look = useMemo(() => new Vector3(), [])
  const nb = useMemo(() => new Vector3(), [])

  useSceneFrame(2, (p, dt, state) => {
    const t = state.clock.elapsedTime
    const beat = heartbeat(t, 66)
    const flick = 0.5 + 0.5 * Math.sin(t * 31) * Math.sin(t * 7)
    screen.uniforms.uTime.value = t
    screen.uniforms.uBeat.value = beat
    screen.uniforms.uHot.value = energy(t)
    light.ptMul = 1 + beat * 1.1 + energy(t) * 0.6
    light.hemiAdd = beat * 0.2
    // the screen actually lights the people: blue on whatever faces it, pulsing with the heartbeat and the room energy
    const lightI = 1.5 + beat * 1.6 + energy(t) * 1.4 + flick * 0.5
    setRimLight(crowdMat, SCREEN, BLUE, lightI)
    setRimLight(meMat, SCREEN, BLUE, lightI * 0.9)

    figs.forEach((f, i) => {
      const s = specs[i]
      resetPose(f)
      const lag = Math.abs(s.x) * 0.12 + (s.z + 4) * 0.04 // the excitement ripples outward from the centre
      const e = energy(t - lag) * s.react
      const ph = s.ph
      const breathe = Math.sin(t * (1.45 + 0.2 * Math.sin(ph)) + ph)
      f.root.rotation.y = Math.atan2(-s.x, -5.9 - s.z) // face the screen
      f.root.position.x = s.x + noise(t * 0.2 + ph) * 0.015
      f.root.position.z = s.z
      f.root.position.y = 0.95 * s.scale

      // posture: leans in as the room heats up, with slow individual drift and breathing
      const lean = 0.05 + e * 0.2 + noise(t * 0.33 + ph) * 0.035
      f.j.spine.rotation.x = lean + breathe * 0.012
      f.j.spine.rotation.z = noise(t * 0.17 + ph * 2) * 0.05
      f.j.spine.rotation.y = noise(t * 0.14 + ph * 3) * 0.1

      // gaze: mostly the screen, with micro-saccades, and glances at a neighbour now and then
      const turn = smooth(0.55, 0.85, noise(t * 0.11 + ph * 5))
      look.set(0 + noise(t * 2.3 + ph) * 0.25, 2.2, -5.9)
      f.root.updateWorldMatrix(true, true)
      lookAt(f, look, 1)
      f.j.head.rotation.y = f.j.head.rotation.y * (1 - turn) + turn * (i % 2 ? 0.7 : -0.7)
      f.j.head.rotation.x += breathe * 0.01

      // gesture amount: bigger reactions when excited (cheering / pointing / hands up)
      const g = smooth(0.35, 0.8, e + 0.2 * noise(t * 0.27 + ph * 4))

      if (s.kind === 'stand') {
        f.root.position.x += noise(t * 0.1 + ph) * 0.04 // weight shifting from foot to foot
        f.j.hpL.rotation.x = -0.05 + noise(t * 0.12 + ph) * 0.05
        f.j.hpR.rotation.x = 0.05 - noise(t * 0.12 + ph) * 0.05
        f.j.knL.rotation.x = 0.08 + Math.max(0, noise(t * 0.12 + ph)) * 0.12
        f.j.knR.rotation.x = 0.08 + Math.max(0, -noise(t * 0.12 + ph)) * 0.12
        f.j.hpL.rotation.z = 0.05
        f.j.hpR.rotation.z = -0.05
      } else if (s.kind === 'floor') {
        // sitting cross-legged on the floor
        f.j.hpL.rotation.x = -1.15; f.j.hpL.rotation.z = 0.85; f.j.knL.rotation.x = 2.3
        f.j.hpR.rotation.x = -1.15; f.j.hpR.rotation.z = -0.85; f.j.knR.rotation.x = 2.3
      } else {
        // seated: thighs flat on the cushion, shins straight down, feet flat on the floor
        f.j.hpL.rotation.x = f.j.hpR.rotation.x = -1.5
        f.j.hpL.rotation.z = 0.1
        f.j.hpR.rotation.z = -0.1
        f.j.knL.rotation.x = f.j.knR.rotation.x = 1.5
        if (s.tap) f.j.knR.rotation.x += Math.max(0, Math.sin(t * 7 + ph)) * 0.08 * (1 - g) // nervous foot-tap
      }
      limitPose(f)

      // placement on the furniture / floor so contact is exact
      f.root.updateWorldMatrix(true, true)
      if (s.kind === 'stand') groundFigure(f, 0)
      else if (s.kind === 'floor') plantJoint(f, f.j.hpL, 0.14)
      else {
        // pelvis rests on the cushion: seat top + half the hip capsule
        f.root.position.y = s.seatY + 0.115 * s.scale
        f.root.updateWorldMatrix(true, true)
      }

      // arms: resting poses (IK onto thighs / pockets / crossed) blended with gestures
      const fx = Math.sin(f.root.rotation.y)
      const fz = Math.cos(f.root.rotation.y)
      const rx = Math.cos(f.root.rotation.y)
      const rz = -Math.sin(f.root.rotation.y)
      const base = f.root.position
      const k = s.scale
      const armPole = (side: 1 | -1) => tmp.set(rx * side * 0.9, -0.6, rz * side * 0.9).clone()
      for (const side of [1, -1] as const) {
        const sideName = side === 1 ? 'L' : 'R'
        const rest = 1 - (side === -1 ? g : g * 0.4)
        if (s.kind === 'stand') {
          if (s.pose === 0) {
            // arms folded: each hand tucked against the opposite elbow, in front of the chest
            tgt.set(base.x + fx * 0.2 * k - rx * side * 0.13 * k + rx * side * 0.0, base.y + 0.38 * k, base.z + fz * 0.2 * k - rz * side * 0.13 * k)
            tgt.x += fx * 0.03
          } else if (s.pose === 1) {
            tgt.set(base.x + rx * side * 0.2 * k + fx * 0.06 * k, base.y - 0.22 * k, base.z + rz * side * 0.2 * k + fz * 0.06 * k)
          } else {
            tgt.set(base.x + rx * side * 0.28 * k + fx * 0.1 * k, base.y - 0.5 * k, base.z + rz * side * 0.28 * k + fz * 0.1 * k)
          }
        } else if (s.kind === 'floor') {
          tgt.set(base.x + rx * side * 0.28 * k + fx * 0.34 * k, base.y + 0.02, base.z + rz * side * 0.28 * k + fz * 0.34 * k)
        } else {
          // hands rest on the thighs, just above the cushion
          tgt.set(base.x + rx * side * 0.2 * k + fx * 0.34 * k, base.y + 0.1 * k, base.z + rz * side * 0.2 * k + fz * 0.34 * k)
        }
        solveArm(f, sideName, tgt, 0.95 * rest, armPole(side))
        if (g > 0.05 && (side === -1 || g > 0.6)) {
          // cheer / point toward the screen: hand rises up and out in front, with a little pump
          const pump = Math.sin(t * 5 + ph) * 0.08 * g
          nb.set(base.x + fx * 0.55 + rx * side * 0.22, base.y + 0.9 * k + g * 0.3 + pump, base.z + fz * 0.55 + rz * side * 0.22)
          solveArm(f, sideName, nb, g * (side === -1 ? 1 : 0.7), armPole(side))
        }
      }
    })

    // slow orbit around the room, always facing the screen; spline-smoothed with a gentle dolly
    const R = 8.8
    const a = keys(p, [{ p: 0, v: [-0.6, 0, 0] }, { p: 0.5, v: [0.0, 0, 0] }, { p: 1, v: [0.55, 0, 0] }])[0]
    const h = keys(p, [{ p: 0, v: [2.7, 0, 0] }, { p: 0.55, v: [2.2, 0, 0] }, { p: 1, v: [1.9, 0, 0] }])[0]
    const fov = 60 - p * 6
    setCam(2, state.camera as never, [Math.sin(a) * R, h, Math.cos(a) * R * 0.85 + 1.2], [0, 1.5, -3], fov, dt, { lambda: 4.5 })
  })

  return (
    <group>
      {/* room shell: wood floor, panelled walls, beamed ceiling */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={floorMat}>
        <planeGeometry args={[16, 14]} />
      </mesh>
      <mesh position={[0, 4, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[16, 14]} />
        <meshStandardMaterial color="#080a10" roughness={1} />
      </mesh>
      {[-4.5, -1.5, 1.5, 4.5].map((z) => (
        <Box key={z} position={[0, 3.85, z]} size={[16, 0.25, 0.3]} color="#14100d" rough={0.9} />
      ))}
      <mesh position={[0, 2, -6.4]} material={panelMat}>
        <planeGeometry args={[16, 4]} />
      </mesh>
      <mesh position={[-8, 2, 0]} rotation={[0, Math.PI / 2, 0]} material={panelMat}>
        <planeGeometry args={[14, 4]} />
      </mesh>
      <mesh position={[8, 2, 0]} rotation={[0, -Math.PI / 2, 0]} material={panelMat}>
        <planeGeometry args={[14, 4]} />
      </mesh>
      <mesh position={[0, 2, 7]} rotation={[0, Math.PI, 0]} material={panelMat}>
        <planeGeometry args={[16, 4]} />
      </mesh>
      {/* wainscot rail + baseboards */}
      <Box position={[0, 1.0, -6.36]} size={[16, 0.08, 0.06]} color="#1a1410" />
      <Box position={[0, 0.12, -6.36]} size={[16, 0.24, 0.06]} color="#1a1410" />
      {/* posters (fighters in silhouette colours) */}
      {[[-6.4, 2.6, '#6b1f26'], [-5.0, 2.7, '#1f3a6b'], [6.2, 2.6, '#1f6b4a'], [4.8, 2.7, '#6b5a1f']].map(([x, y, c], i) => (
        <Emit key={i} position={[x as number, y as number, -6.35]} size={[1.0, 1.4, 0.03]} color={c as string} boost={0.5} />
      ))}

      {/* the big screen, bezel, cabinet */}
      <mesh position={[0, 2.3, -6.3]} material={screen}>
        <planeGeometry args={[8.4, 4.7]} />
      </mesh>
      <Box position={[0, 2.3, -6.34]} size={[8.7, 4.95, 0.06]} color="#06070b" rough={0.5} metal={0.5} />
      <Box position={[0, 0.36, -6.0]} size={[9, 0.72, 0.7]} color="#15110e" rough={0.8} />
      <Emit position={[0, 0.78, -5.64]} size={[3.4, 0.05, 0.03]} color="#6f8fff" boost={1.2} />
      <Glow position={[0, 2.3, -5.6]} size={[18, 11]} color="#4d7cff" opacity={0.4} />
      {/* light pooling on the floor in front of the screen */}
      <mesh position={[0, 0.03, -3]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[12, 7]} />
        <meshBasicMaterial color="#4d7cff" transparent opacity={0.07} depthWrite={false} />
      </mesh>

      {/* furniture */}
      <Couch x={-2.7} z={-0.4} w={2.6} />
      <Couch x={2.7} z={-0.4} w={2.6} color="#2f2a3c" />
      <Couch x={0} z={4.2} w={1.8} color="#3a2f26" />
      <BeanBag x={-3.2} z={-3.4} color="#3a2a44" />
      <BeanBag x={-1.1} z={-3.4} color="#2a3a44" />
      <BeanBag x={1.3} z={-3.4} color="#44302a" />
      <BeanBag x={3.4} z={-3.4} color="#2a4434" />
      {/* rug + coffee table with pizza boxes and cups */}
      <mesh position={[0, 0.02, 0.9]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[6.4, 3.2]} />
        <meshStandardMaterial color="#251a2c" roughness={1} />
      </mesh>
      <Box position={[0, 0.22, 1.5]} size={[2.2, 0.08, 0.9]} color="#2a1f18" rough={0.7} />
      {[-0.9, 0.9].map((x) => <Box key={x} position={[x, 0.1, 1.5]} size={[0.1, 0.2, 0.7]} color="#1a120d" />)}
      <Box position={[-0.4, 0.3, 1.45]} size={[0.5, 0.06, 0.5]} color="#c9b48a" rough={0.9} />
      <Box position={[-0.4, 0.35, 1.45]} size={[0.46, 0.04, 0.46]} color="#a34a2a" rough={0.9} />
      {[0.3, 0.55, 0.8].map((x, i) => (
        <mesh key={i} position={[x, 0.33, 1.5 + (i % 2) * 0.12]}>
          <cylinderGeometry args={[0.05, 0.04, 0.12, 10]} />
          <meshStandardMaterial color={['#b02a2a', '#2a5ab0', '#d9d9d9'][i]} roughness={0.5} />
        </mesh>
      ))}
      {/* shelf with trophies + a mini fridge at the back right */}
      <Box position={[6.9, 1.1, -2.5]} size={[0.5, 0.06, 2.4]} color="#2a1f18" />
      {[-3.3, -2.8, -2.2, -1.7].map((z, i) => (
        <Box key={i} position={[6.9, 1.28, z]} size={[0.22, 0.28 + (i % 2) * 0.1, 0.18]} color="#c8a85c" metal={0.8} rough={0.3} />
      ))}
      <Box position={[6.6, 0.45, 2.4]} size={[0.8, 0.9, 0.7]} color="#d0d3da" rough={0.35} metal={0.6} />

      {figs.map((f, i) => (
        <primitive key={i} object={f.root} />
      ))}

      <ParticleField count={count(300)} box={[14, 4, 12]} vel={[0, 0.05, 0.03]} size={9} color="#8fb2ff" opacity={0.5} position={[0, 2, 0]} seed={8} />
    </group>
  )
}
