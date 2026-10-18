import { CanvasTexture, LinearFilter, RepeatWrapping, SRGBColorSpace, SpriteMaterial, Sprite, AdditiveBlending } from 'three'

/** Diamond chain-link fence pattern (white lines, transparent) — used on cage panels. */
export function fenceTexture(): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  g.strokeStyle = 'rgba(255,255,255,0.9)'
  g.lineWidth = 3
  g.beginPath()
  g.moveTo(0, 0); g.lineTo(128, 128)
  g.moveTo(128, 0); g.lineTo(0, 128)
  g.moveTo(-64, 64); g.lineTo(64, 192)
  g.moveTo(64, -64); g.lineTo(192, 64)
  g.moveTo(-64, 64); g.lineTo(64, -64)
  g.moveTo(64, 192); g.lineTo(192, 64)
  g.stroke()
  const t = new CanvasTexture(c)
  t.wrapS = t.wrapT = RepeatWrapping
  t.colorSpace = SRGBColorSpace
  return t
}

/** Soft radial blob (for clouds, glows, halos). */
export function softTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)'): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, inner)
  grad.addColorStop(0.5, 'rgba(255,255,255,0.35)')
  grad.addColorStop(1, outer)
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}

/** Floating text label rendered to a canvas → sprite. No font files / network needed. */
export function labelSprite(
  text: string,
  opts: { color?: string; glow?: string; size?: number; font?: string; weight?: string; opacity?: number; scale?: number } = {},
): Sprite {
  const { color = '#ffffff', glow = '#ffffff', size = 64, font = 'Bebas Neue', weight = '400', opacity = 1 } = opts
  const c = document.createElement('canvas')
  const g0 = c.getContext('2d')!
  const f = `${weight} ${size}px "${font}", Impact, sans-serif`
  g0.font = f
  const w = Math.ceil(g0.measureText(text).width) + size * 1.2
  c.width = w
  c.height = Math.ceil(size * 1.8)
  const g = c.getContext('2d')!
  g.font = f
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.shadowColor = glow
  g.shadowBlur = size * 0.5
  g.fillStyle = color
  g.fillText(text, c.width / 2, c.height / 2)
  g.fillText(text, c.width / 2, c.height / 2)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.minFilter = LinearFilter
  const m = new SpriteMaterial({ map: t, transparent: true, depthWrite: false, blending: AdditiveBlending, opacity })
  const s = new Sprite(m)
  const k = opts.scale ?? 1
  s.scale.set((c.width / size) * k, (c.height / size) * k, 1)
  return s
}
