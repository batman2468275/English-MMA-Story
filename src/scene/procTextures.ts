import { CanvasTexture, LinearMipmapLinearFilter, RepeatWrapping, SRGBColorSpace } from 'three'
import { mulberry32 } from '../core/math'

/**
 * Small procedural canvas textures (no image files): siding, shingles, asphalt, grass, concrete, wood, brushed metal…
 * They give the stylised models real material variation (grain, seams, wear) while staying low-poly and lightweight.
 * Each is generated once and cached by key.
 */
const cache = new Map<string, CanvasTexture>()

function make(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, repeat: [number, number] = [1, 1]) {
  const hit = cache.get(key)
  if (hit) return hit
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d')!, w, h)
  const t = new CanvasTexture(c)
  t.wrapS = t.wrapT = RepeatWrapping
  t.repeat.set(repeat[0], repeat[1])
  t.colorSpace = SRGBColorSpace
  t.minFilter = LinearMipmapLinearFilter; t.generateMipmaps = true
  t.anisotropy = 4
  cache.set(key, t)
  return t
}

function speckle(g: CanvasRenderingContext2D, w: number, h: number, n: number, a: number, seed: number, light = false) {
  const r = mulberry32(seed)
  for (let i = 0; i < n; i++) {
    const v = Math.floor(r() * 255)
    g.fillStyle = light ? `rgba(255,255,255,${a * r()})` : `rgba(${v},${v},${v},${a * r()})`
    g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2)
  }
}

/** Horizontal clapboard siding. */
export const sidingTexture = (base = '#4a5170', repeat: [number, number] = [4, 3]) =>
  make('siding' + base, 256, 256, (g, w, h) => {
    g.fillStyle = base
    g.fillRect(0, 0, w, h)
    const rows = 16
    for (let i = 0; i < rows; i++) {
      const y = (i / rows) * h
      g.fillStyle = 'rgba(0,0,0,0.38)'
      g.fillRect(0, y, w, 2)
      g.fillStyle = 'rgba(255,255,255,0.07)'
      g.fillRect(0, y + 2, w, 3)
      g.fillStyle = i % 2 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.04)'
      g.fillRect(0, y + 3, w, h / rows - 3)
    }
    speckle(g, w, h, 900, 0.07, 3)
  }, repeat)

/** Roof shingles in staggered rows. */
export const shingleTexture = (base = '#2b2f3c', repeat: [number, number] = [6, 4]) =>
  make('shingle' + base, 256, 256, (g, w, h) => {
    g.fillStyle = base
    g.fillRect(0, 0, w, h)
    const rows = 10
    const cols = 8
    const r = mulberry32(11)
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const ox = (y % 2) * (w / cols / 2)
        const px = (x / cols) * w + ox
        const py = (y / rows) * h
        const shade = 0.8 + r() * 0.4
        g.fillStyle = `rgba(${Math.floor(255 * shade * 0.3)},${Math.floor(255 * shade * 0.32)},${Math.floor(255 * shade * 0.4)},0.5)`
        g.fillRect(px + 1, py + 1, w / cols - 2, h / rows - 2)
        g.fillStyle = 'rgba(0,0,0,0.4)'
        g.fillRect(px, py + h / rows - 3, w / cols, 3)
      }
    }
  }, repeat)

/** Rough asphalt with aggregate speckle and faint cracks. */
export const asphaltTexture = (repeat: [number, number] = [20, 2]) =>
  make('asphalt', 256, 256, (g, w, h) => {
    g.fillStyle = '#26272d'
    g.fillRect(0, 0, w, h)
    speckle(g, w, h, 4200, 0.3, 5)
    speckle(g, w, h, 500, 0.3, 6, true)
    g.strokeStyle = 'rgba(0,0,0,0.35)'
    g.lineWidth = 1.2
    const r = mulberry32(9)
    for (let k = 0; k < 4; k++) {
      g.beginPath()
      let x = r() * w
      let y = r() * h
      g.moveTo(x, y)
      for (let s = 0; s < 8; s++) {
        x += (r() - 0.4) * 30
        y += (r() - 0.5) * 30
        g.lineTo(x, y)
      }
      g.stroke()
    }
  }, repeat)

/** Poured-concrete slabs with expansion joints (driveway, sidewalk). */
export const concreteTexture = (repeat: [number, number] = [2, 6]) =>
  make('concrete', 256, 256, (g, w, h) => {
    g.fillStyle = '#4b4d55'
    g.fillRect(0, 0, w, h)
    speckle(g, w, h, 2500, 0.18, 8)
    g.fillStyle = 'rgba(0,0,0,0.5)'
    g.fillRect(0, h - 3, w, 3)
    g.fillRect(0, 0, 2, h)
    g.fillStyle = 'rgba(255,255,255,0.06)'
    g.fillRect(0, h - 6, w, 3)
  }, repeat)

/** Mottled lawn. */
export const grassTexture = (repeat: [number, number] = [30, 20]) =>
  make('grass', 256, 256, (g, w, h) => {
    g.fillStyle = '#122a18'
    g.fillRect(0, 0, w, h)
    const r = mulberry32(21)
    for (let i = 0; i < 3000; i++) {
      const gv = 40 + Math.floor(r() * 70)
      g.fillStyle = `rgba(${Math.floor(gv * 0.35)},${gv},${Math.floor(gv * 0.4)},${0.25 + r() * 0.4})`
      g.fillRect(r() * w, r() * h, 1.5, 3 + r() * 5)
    }
  }, repeat)

/** Wood grain: horizontal planks with knots. */
export const woodTexture = (base = '#9b6d3e', repeat: [number, number] = [1, 1]) =>
  make('wood' + base, 256, 128, (g, w, h) => {
    g.fillStyle = base
    g.fillRect(0, 0, w, h)
    const r = mulberry32(31)
    for (let i = 0; i < 40; i++) {
      g.strokeStyle = `rgba(40,20,5,${0.08 + r() * 0.15})`
      g.lineWidth = 0.6 + r() * 1.4
      g.beginPath()
      const y = r() * h
      g.moveTo(0, y)
      g.bezierCurveTo(w * 0.3, y + (r() - 0.5) * 8, w * 0.7, y + (r() - 0.5) * 8, w, y + (r() - 0.5) * 4)
      g.stroke()
    }
    for (let k = 0; k < 2; k++) {
      const x = r() * w
      const y = r() * h
      g.strokeStyle = 'rgba(40,20,5,0.4)'
      for (let e = 1; e < 4; e++) {
        g.beginPath()
        g.ellipse(x, y, 3 + e * 3, 1.6 + e * 1.2, 0, 0, Math.PI * 2)
        g.stroke()
      }
    }
  }, repeat)

/** Brushed steel / aluminium. */
export const metalTexture = (base = '#8c95a1', repeat: [number, number] = [1, 1]) =>
  make('metal' + base, 128, 128, (g, w, h) => {
    g.fillStyle = base
    g.fillRect(0, 0, w, h)
    const r = mulberry32(41)
    for (let i = 0; i < 220; i++) {
      g.fillStyle = `rgba(255,255,255,${r() * 0.08})`
      g.fillRect(0, r() * h, w, 1)
      g.fillStyle = `rgba(0,0,0,${r() * 0.08})`
      g.fillRect(0, r() * h, w, 1)
    }
  }, repeat)

/** Window pane with frame, muntins and a warm interior gradient (used as emissive map). */
export const windowTexture = (warm = '#ffb347', cool = false) =>
  make('window' + warm + cool, 128, 128, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, cool ? '#9db6ff' : warm)
    grad.addColorStop(1, cool ? '#5a6fe0' : '#ff8a3a')
    g.fillStyle = grad
    g.fillRect(0, 0, w, h)
    // curtains / interior silhouettes
    g.fillStyle = 'rgba(30,15,5,0.28)'
    g.fillRect(0, 0, w * 0.16, h)
    g.fillRect(w * 0.84, 0, w * 0.16, h)
    g.fillStyle = 'rgba(30,15,5,0.15)'
    g.fillRect(w * 0.3, h * 0.55, w * 0.4, h * 0.45)
    // muntins + frame
    g.fillStyle = '#10121a'
    g.fillRect(w / 2 - 2, 0, 4, h)
    g.fillRect(0, h / 2 - 2, w, 4)
    g.fillRect(0, 0, w, 5)
    g.fillRect(0, h - 5, w, 5)
    g.fillRect(0, 0, 5, h)
    g.fillRect(w - 5, 0, 5, h)
  })

/** Garage-door panels. */
export const garageTexture = () =>
  make('garage', 128, 128, (g, w, h) => {
    g.fillStyle = '#cfd2d8'
    g.fillRect(0, 0, w, h)
    for (let i = 0; i < 4; i++) {
      const y = (i / 4) * h
      g.fillStyle = 'rgba(0,0,0,0.35)'
      g.fillRect(0, y, w, 3)
      g.strokeStyle = 'rgba(0,0,0,0.18)'
      g.strokeRect(10, y + 8, w - 20, h / 4 - 16)
    }
  })

/** Soft vertical light-falloff for glows on walls / floors. */
export const wallWashTexture = () =>
  make('wash', 64, 128, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, 'rgba(255,255,255,0.9)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, w, h)
  })
