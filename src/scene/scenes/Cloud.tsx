import { useEffect, useMemo, useRef } from 'react'
import { CanvasTexture, Group, SRGBColorSpace } from 'three'
import { GradientSky } from '../GradientSky'
import { sharedSoft } from '../shapes'
import { ParticleField } from '../particles'
import { useSceneFrame, count } from '../hooks'
import { setCam } from '../camera'
import { lerp, mulberry32 } from '../../core/math'
import { researchWords } from '../../content/story'
import { store } from '../../core/store'

/**
 * 08 — THE RABBIT HOLE: soft bright clouds, glowing orbs of drifting words (fighters, techniques), and a weightless
 * upward camera float. Words are canvas-rendered sprites (no font/network dependency).
 */
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

export function Cloud() {
  const root = useRef<Group>(null)
  const orbs = useRef<(Group | null)[]>([])

  const clouds = useMemo(() => {
    const r = mulberry32(3)
    const n = store.mobile ? 36 : 80
    return Array.from({ length: n }, () => {
      const puffs = Array.from({ length: 5 }, () => ({ x: (r() - 0.5) * 7, y: (r() - 0.5) * 1.8, z: (r() - 0.5) * 4, s: 4 + r() * 5 }))
      return { x: (r() - 0.5) * 80, y: r() * 90 - 8, z: -r() * 45 - 6, puffs }
    })
  }, [])

  const words = useMemo(() => {
    const r = mulberry32(9)
    return researchWords.map((w, i) => {
      const { t, w: ww, h } = wordTexture(w)
      return {
        text: w,
        tex: t,
        ww,
        hh: h,
        x: (i % 2 ? 1 : -1) * (3 + r() * 11) + (r() - 0.5) * 3,
        y: (i / researchWords.length) * 78 + r() * 3 - 2,
        z: -3 - r() * 14,
        ph: r() * 6,
        sp: 0.15 + r() * 0.2,
      }
    })
  }, [])

  useEffect(() => () => words.forEach((w) => w.tex.dispose()), [words])

  useSceneFrame(7, (p, dt, state) => {
    const t = state.clock.elapsedTime
    orbs.current.forEach((s, i) => {
      if (!s) return
      const w = words[i]
      s.position.set(w.x + Math.sin(t * w.sp + w.ph) * 0.8, w.y + Math.cos(t * w.sp * 0.8 + w.ph) * 0.6, w.z)
    })
    // weightless float upward: camera rises with scroll, with gentle sway
    const y = lerp(0, 66, p)
    setCam(7, state.camera as never, [Math.sin(t * 0.3) * 0.6, y + 2, 9], [Math.sin(t * 0.2) * 0.8, y + 5 + p * 3, -10], 60, dt, { lambda: 3.5, parallax: 0.3, roll: Math.sin(t * 0.25) * 0.02 })
    if (root.current) root.current.position.y = 0
  })

  return (
    <group ref={root}>
      <GradientSky top="#2e63b5" mid="#7fa6dc" horizon="#d8e6f7" sunDir={[0.7, 0.22, -1]} sunSize={0.018} sunColor="#fff6dc" />
      {clouds.map((c, i) => (
        <group key={i} position={[c.x, c.y, c.z]}>
          {c.puffs.map((pf, k) => (
            <sprite key={k} position={[pf.x, pf.y, pf.z]} scale={[pf.s, pf.s * 0.62, 1]}>
              <spriteMaterial map={sharedSoft()} color={k % 2 ? '#ffffff' : '#e9f1ff'} transparent opacity={0.62} depthWrite={false} fog={false} />
            </sprite>
          ))}
        </group>
      ))}
      {words.map((w, i) => (
        <group key={w.text} ref={(g) => (orbs.current[i] = g)} position={[w.x, w.y, w.z]}>
          {/* glowing orb behind the word */}
          <sprite scale={[w.ww * 1.5, w.ww * 1.5, 1]} position={[0, 0, -0.2]}>
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
