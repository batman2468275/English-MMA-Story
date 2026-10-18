import { useEffect, useMemo, useRef } from 'react'
import { CanvasTexture, Group, SRGBColorSpace, Sprite, SpriteMaterial } from 'three'
import { GradientSky } from '../GradientSky'
import { sharedSoft } from '../shapes'
import { ParticleField } from '../particles'
import { useSceneFrame, count } from '../hooks'
import { setCam, keys } from '../camera'
import { mulberry32 } from '../../core/math'
import { researchWords } from '../../content/story'
import { store } from '../../core/store'

/**
 * 08 — THE RABBIT HOLE: soft, bright, weightless. Three depth layers of shaded cumulus puffs (far = small, blue-tinted and slow,
 * near = big, bright and fast) drift on the wind and wrap endlessly; glowing orbs of words follow their own slow, non-repeating
 * Lissajous paths with breathing scale; the camera floats up on a spline with a gentle sway.
 */
function puffTexture(seed: number) {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  const r = mulberry32(seed)
  // body: a cluster of overlapping soft discs
  const blobs = Array.from({ length: 16 }, () => ({ x: 128 + (r() - 0.5) * 120, y: 138 + (r() - 0.5) * 60 - Math.abs(r() - 0.5) * 30, rad: 26 + r() * 38 }))
  for (const b of blobs) {
    const gr = g.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.rad)
    gr.addColorStop(0, 'rgba(255,255,255,0.95)')
    gr.addColorStop(0.55, 'rgba(255,255,255,0.55)')
    gr.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = gr
    g.beginPath()
    g.arc(b.x, b.y, b.rad, 0, Math.PI * 2)
    g.fill()
  }
  // lighting: cool shade on the underside / away from the sun, warm highlight on the upper-right
  g.globalCompositeOperation = 'source-atop'
  const shade = g.createLinearGradient(0, 70, 60, 230)
  shade.addColorStop(0, 'rgba(255,248,235,0.0)')
  shade.addColorStop(1, 'rgba(110,135,185,0.62)')
  g.fillStyle = shade
  g.fillRect(0, 0, 256, 256)
  const hi = g.createRadialGradient(176, 92, 4, 176, 92, 100)
  hi.addColorStop(0, 'rgba(255,244,214,0.55)')
  hi.addColorStop(1, 'rgba(255,244,214,0)')
  g.fillStyle = hi
  g.fillRect(0, 0, 256, 256)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}

function wordTexture(text: string) {
  const size = 84
  const c = document.createElement('canvas')
  const g0 = c.getContext('2d')!
  const font = `400 ${size}px "Bebas Neue", Impact, sans-serif`
  g0.font = font
  c.width = Math.ceil(g0.measureText(text).width) + size
  c.height = Math.ceil(size * 1.7)
  const g = c.getContext('2d')!
  g.font = font
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.shadowColor = 'rgba(255,255,255,0.95)'
  g.shadowBlur = 18
  g.fillStyle = '#0f3478'
  g.fillText(text, c.width / 2, c.height / 2)
  g.shadowBlur = 0
  g.fillText(text, c.width / 2, c.height / 2)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return { t, w: c.width / size, h: c.height / size }
}

interface Layer { zMin: number; zMax: number; size: [number, number]; speed: number; opacity: number; tint: string; n: number; yMax: number }
const LAYERS: Layer[] = [
  { zMin: -120, zMax: -70, size: [14, 22], speed: 0.35, opacity: 0.5, tint: '#c9dbf4', n: 26, yMax: 110 },
  { zMin: -60, zMax: -22, size: [8, 14], speed: 0.9, opacity: 0.66, tint: '#e9f1ff', n: 30, yMax: 100 },
  { zMin: -20, zMax: -4, size: [4.5, 8], speed: 1.8, opacity: 0.72, tint: '#ffffff', n: 16, yMax: 96 },
]
const RANGE = 90

export function Cloud() {
  const clouds = useRef<(Group | null)[]>([])
  const orbs = useRef<(Group | null)[]>([])
  const orbGlow = useRef<(Sprite | null)[]>([])

  const puffs = useMemo(() => [1, 2, 3, 4].map(puffTexture), [])

  const cloudData = useMemo(() => {
    const r = mulberry32(3)
    const scale = store.mobile ? 0.55 : 1
    const out: { layer: number; x: number; y: number; z: number; s: number; tex: number; rot: number; ph: number; yScale: number }[] = []
    LAYERS.forEach((L, li) => {
      const n = Math.ceil(L.n * scale)
      for (let i = 0; i < n; i++) {
        out.push({
          layer: li,
          x: (r() - 0.5) * RANGE * 2,
          y: r() * L.yMax - 8,
          z: L.zMin + r() * (L.zMax - L.zMin),
          s: L.size[0] + r() * (L.size[1] - L.size[0]),
          tex: Math.floor(r() * 4),
          rot: (r() - 0.5) * 0.5,
          ph: r() * 6,
          yScale: 0.55 + r() * 0.25,
        })
      }
    })
    return out
  }, [])

  const words = useMemo(() => {
    const r = mulberry32(9)
    return researchWords.map((w, i) => {
      const { t, w: ww, h } = wordTexture(w)
      return {
        text: w, tex: t, ww, hh: h,
        x: (i % 2 ? 1 : -1) * (3 + r() * 11) + (r() - 0.5) * 3,
        y: (i / researchWords.length) * 78 + r() * 3 - 2,
        z: -3 - r() * 14,
        // each orb has its own slow, incommensurate drift — no two share a rhythm, nothing visibly loops
        ax: 0.8 + r() * 1.8, ay: 0.5 + r() * 1.2, az: 0.6 + r() * 1.6,
        fx: 0.11 + r() * 0.17, fy: 0.09 + r() * 0.15, fz: 0.07 + r() * 0.12,
        fx2: 0.31 + r() * 0.2, fy2: 0.27 + r() * 0.2,
        ph: r() * 6.28, ph2: r() * 6.28, ph3: r() * 6.28,
        breathe: 0.03 + r() * 0.04,
      }
    })
  }, [])

  useEffect(() => () => {
    words.forEach((w) => w.tex.dispose())
    puffs.forEach((t) => t.dispose())
  }, [words, puffs])

  useSceneFrame(7, (p, dt, state) => {
    const t = state.clock.elapsedTime
    // clouds: wind carries each layer at its own speed and the field wraps, so nothing ever visibly loops or pops
    cloudData.forEach((c, i) => {
      const g = clouds.current[i]
      if (!g) return
      const L = LAYERS[c.layer]
      let x = c.x + t * L.speed
      x = ((((x + RANGE) % (2 * RANGE)) + 2 * RANGE) % (2 * RANGE)) - RANGE
      g.position.set(x, c.y + Math.sin(t * 0.07 + c.ph) * 0.9, c.z)
      g.rotation.z = c.rot + Math.sin(t * 0.05 + c.ph) * 0.04
    })
    orbs.current.forEach((g, i) => {
      if (!g) return
      const w = words[i]
      const k = 1 + Math.sin(t * 0.6 + w.ph) * w.breathe
      g.position.set(
        w.x + w.ax * Math.sin(t * w.fx + w.ph) + 0.45 * w.ax * Math.sin(t * w.fx2 + w.ph2),
        w.y + w.ay * Math.cos(t * w.fy + w.ph2) + 0.4 * w.ay * Math.sin(t * w.fy2 + w.ph3),
        w.z + w.az * Math.sin(t * w.fz + w.ph3),
      )
      g.scale.setScalar(k)
      const s = orbGlow.current[i]
      if (s) s.material.opacity = 0.55 + 0.2 * Math.sin(t * 0.9 + w.ph3)
    })
    // weightless float: a spline with a long ease-in/out, a slow roll and a lazy sideways drift
    const y = keys(p, [{ p: 0, v: [0, 0, 0] }, { p: 0.35, v: [20, 0, 0] }, { p: 0.7, v: [46, 0, 0] }, { p: 1, v: [66, 0, 0] }])[0]
    const swayX = Math.sin(t * 0.21) * 0.8 + Math.sin(t * 0.13 + 1) * 0.5
    setCam(7, state.camera as never, [swayX, y + 2 + Math.sin(t * 0.3) * 0.15, 9], [Math.sin(t * 0.17) * 0.9, y + 5 + p * 3, -10], 60, dt, { lambda: 3.2, parallax: 0.3, roll: Math.sin(t * 0.19) * 0.022 })
  })

  const mats = useMemo(
    () => LAYERS.map((L) => puffs.map((tx) => new SpriteMaterial({ map: tx, color: L.tint, transparent: true, opacity: L.opacity, depthWrite: false, fog: false }))),
    [puffs],
  )

  return (
    <group>
      <GradientSky top="#2e63b5" mid="#7fa6dc" horizon="#d8e6f7" sunDir={[0.7, 0.22, -1]} sunSize={0.018} sunColor="#fff6dc" />
      {cloudData.map((c, i) => (
        <group key={i} ref={(g) => (clouds.current[i] = g)} position={[c.x, c.y, c.z]}>
          <sprite material={mats[c.layer][c.tex]} scale={[c.s, c.s * c.yScale, 1]} />
        </group>
      ))}
      {words.map((w, i) => (
        <group key={w.text} ref={(g) => (orbs.current[i] = g)} position={[w.x, w.y, w.z]}>
          {/* glowing orb behind the word */}
          <sprite ref={(s) => (orbGlow.current[i] = s)} scale={[w.ww * 1.5, w.ww * 1.5, 1]} position={[0, 0, -0.2]}>
            <spriteMaterial map={sharedSoft()} color="#ffffff" transparent opacity={0.7} depthWrite={false} fog={false} />
          </sprite>
          <sprite scale={[w.ww * 0.62, w.hh * 0.62, 1]}>
            <spriteMaterial map={w.tex} transparent depthWrite={false} fog={false} />
          </sprite>
        </group>
      ))}
      <ParticleField count={count(240)} box={[40, 90, 40]} vel={[0, 0.3, 0]} size={16} color="#ffffff" opacity={0.7} position={[0, 40, -8]} seed={14} />
    </group>
  )
}
