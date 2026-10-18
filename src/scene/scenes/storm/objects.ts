import {
  BoxGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
} from 'three'

/**
 * The four things "I tried before MMA" that drift past the swimmer in the storm — each is reached for and slips away:
 *   0 basketball · 1 laptop (coding) · 2 painter's palette + brush (art) · 3 plank with hammer and saw (woodworking)
 * Simple low-poly props built from primitives to match the stylised look. Each group's origin is its centre of
 * grip, so the swimmer's hand IK target is simply the group position (+ a little height).
 */
export interface StormObjects {
  groups: Group[]
  /** laptop screen material — faded out as the laptop sinks */
  screenMat: MeshStandardMaterial
  /** hammer + saw — slide off the plank when the wood is lost */
  tools: Group
}

const std = (color: string, o: Partial<{ rough: number; metal: number; emissive: string; ei: number }> = {}) =>
  new MeshStandardMaterial({
    color,
    roughness: o.rough ?? 0.7,
    metalness: o.metal ?? 0.05,
    emissive: new Color(o.emissive ?? color).multiplyScalar(o.emissive ? 1 : 0.22),
    emissiveIntensity: o.ei ?? 0.8,
  })

function codeTexture() {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 170
  const g = c.getContext('2d')!
  g.fillStyle = '#06131a'
  g.fillRect(0, 0, 256, 170)
  g.fillStyle = '#12303c'
  g.fillRect(0, 0, 256, 14)
  const rows = [0.45, 0.7, 0.3, 0.55, 0.8, 0.4, 0.25, 0.65, 0.5, 0.35]
  rows.forEach((w, i) => {
    const indent = (i % 3) * 16
    g.fillStyle = i % 4 === 0 ? '#ffb86b' : i % 3 === 0 ? '#7dd3fc' : '#4ade80'
    g.fillRect(14 + indent, 26 + i * 14, 210 * w, 6)
  })
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}

export function createStormObjects(): StormObjects {
  // ---- 0 · basketball -------------------------------------------------------------------------------
  const ball = new Group()
  const skin = std('#d1621b', { rough: 0.8, emissive: '#5a2308', ei: 0.9 })
  ball.add(new Mesh(new SphereGeometry(0.27, 20, 14), skin))
  const seamMat = std('#1b0d05', { emissive: '#000000', ei: 0 })
  for (const rot of [[0, 0, 0], [Math.PI / 2, 0, 0], [0, Math.PI / 2, 0]] as const) {
    const seam = new Mesh(new TorusGeometry(0.272, 0.009, 6, 36), seamMat)
    seam.rotation.set(rot[0], rot[1], rot[2])
    ball.add(seam)
  }
  const sideSeamA = new Mesh(new TorusGeometry(0.2, 0.008, 6, 28, Math.PI), seamMat)
  sideSeamA.position.set(0.17, 0, 0)
  sideSeamA.rotation.set(0, Math.PI / 2, 0)
  ball.add(sideSeamA)
  const sideSeamB = sideSeamA.clone()
  sideSeamB.position.set(-0.17, 0, 0)
  ball.add(sideSeamB)

  // ---- 1 · laptop (coding) --------------------------------------------------------------------------
  const laptop = new Group()
  const shell = std('#343a46', { rough: 0.35, metal: 0.7, emissive: '#10141c', ei: 0.6 })
  const base = new Mesh(new BoxGeometry(0.66, 0.04, 0.44), shell)
  laptop.add(base)
  const keys = new Mesh(new BoxGeometry(0.56, 0.012, 0.22), std('#0d1016', { rough: 0.5, emissive: '#1c3a4a', ei: 0.7 }))
  keys.position.set(0, 0.026, -0.04)
  laptop.add(keys)
  const pad = new Mesh(new BoxGeometry(0.2, 0.01, 0.1), std('#2a303b'))
  pad.position.set(0, 0.024, 0.14)
  laptop.add(pad)
  const hinge = new Group()
  hinge.position.set(0, 0.02, -0.22)
  hinge.rotation.x = -1.78 // lid open ~100°
  laptop.add(hinge)
  const lid = new Mesh(new BoxGeometry(0.66, 0.44, 0.025), shell)
  lid.position.y = 0.22
  hinge.add(lid)
  const screenMat = new MeshStandardMaterial({
    map: codeTexture(),
    color: '#ffffff',
    emissive: new Color('#ffffff'),
    emissiveMap: codeTexture(),
    emissiveIntensity: 1.5,
    roughness: 0.4,
  })
  const screen = new Mesh(new BoxGeometry(0.58, 0.37, 0.004), screenMat)
  screen.position.set(0, 0.22, 0.0145)
  hinge.add(screen)
  laptop.scale.setScalar(1.1)

  // ---- 2 · palette + paintbrush (art) -----------------------------------------------------------
  const palette = new Group()
  const board = new Mesh(new CylinderGeometry(0.34, 0.34, 0.035, 28), std('#c99a5b', { rough: 0.6, emissive: '#5a3a14', ei: 0.7 }))
  board.scale.set(1.3, 1, 0.92)
  palette.add(board)
  const hole = new Mesh(new CylinderGeometry(0.05, 0.05, 0.04, 14), std('#0d0a08', { emissive: '#000', ei: 0 }))
  hole.position.set(-0.28, 0, 0.12)
  palette.add(hole)
  const paints = ['#e03131', '#f2b705', '#2f9e44', '#1c7ed6', '#7048e8', '#f8f9fa']
  paints.forEach((col, i) => {
    const a = -0.9 + i * 0.5
    const blob = new Mesh(new SphereGeometry(0.058, 12, 8), std(col, { rough: 0.35, emissive: col, ei: 0.55 }))
    blob.scale.y = 0.55
    blob.position.set(Math.cos(a) * 0.3 + 0.05, 0.03, Math.sin(a) * -0.22 + 0.02)
    palette.add(blob)
  })
  const brush = new Group()
  const handle = new Mesh(new CylinderGeometry(0.012, 0.018, 0.55, 8), std('#4a2d14'))
  handle.rotation.z = Math.PI / 2
  brush.add(handle)
  const ferrule = new Mesh(new CylinderGeometry(0.02, 0.02, 0.09, 8), std('#b8c0c9', { metal: 0.9, rough: 0.3 }))
  ferrule.rotation.z = Math.PI / 2
  ferrule.position.x = 0.3
  brush.add(ferrule)
  const bristles = new Mesh(new ConeGeometry(0.02, 0.13, 8), std('#c0392b', { emissive: '#7a1d14', ei: 0.9 }))
  bristles.rotation.z = -Math.PI / 2
  bristles.position.x = 0.4
  brush.add(bristles)
  brush.position.set(-0.05, 0.06, 0.1)
  brush.rotation.y = 0.5
  palette.add(brush)
  palette.scale.setScalar(1.05)

  // ---- 3 · plank with hammer and saw (woodworking) -------------------------------------------------
  const wood = new Group()
  const plankMat = std('#9b6d3e', { rough: 0.85, emissive: '#4a2c10', ei: 0.7 })
  const plank = new Mesh(new BoxGeometry(1.3, 0.08, 0.38), plankMat)
  wood.add(plank)
  const grain = new Mesh(new BoxGeometry(1.3, 0.082, 0.025), std('#6f4a26'))
  for (const z of [-0.1, 0.08]) {
    const gm = grain.clone()
    gm.position.z = z
    wood.add(gm)
  }
  const tools = new Group()
  tools.position.y = 0.06
  wood.add(tools)
  const hammerHandle = new Mesh(new BoxGeometry(0.4, 0.04, 0.04), std('#6b4423', { emissive: '#3a2410', ei: 0.7 }))
  hammerHandle.position.set(-0.28, 0.02, 0.07)
  hammerHandle.rotation.y = 0.35
  tools.add(hammerHandle)
  const hammerHead = new Mesh(new BoxGeometry(0.07, 0.09, 0.14), std('#9aa3ad', { metal: 0.9, rough: 0.3, emissive: '#2c3138', ei: 0.7 }))
  hammerHead.position.set(-0.45, 0.04, 0.12)
  hammerHead.rotation.y = 0.35
  tools.add(hammerHead)
  const sawBlade = new Mesh(new BoxGeometry(0.5, 0.012, 0.11), std('#aab3bd', { metal: 0.95, rough: 0.25, emissive: '#2c3138', ei: 0.7 }))
  sawBlade.position.set(0.28, 0.012, -0.05)
  sawBlade.rotation.y = -0.2
  tools.add(sawBlade)
  const sawHandle = new Mesh(new BoxGeometry(0.11, 0.045, 0.1), std('#5b3a1d', { emissive: '#2c1a0a', ei: 0.7 }))
  sawHandle.position.set(0.58, 0.03, -0.1)
  sawHandle.rotation.y = -0.2
  tools.add(sawHandle)
  wood.scale.setScalar(1.05)

  return { groups: [ball, laptop, palette, wood], screenMat, tools }
}
