import { useLayoutEffect, useMemo, useRef } from 'react'
import { Color, InstancedMesh, Object3D } from 'three'
import { Glow } from './shapes'

/**
 * Set-dressing building blocks. Anything repeated (books, cans, cushions, plates, medicine balls…) is ONE InstancedMesh, so a
 * whole shelf of clutter costs a single draw call. Static: matrices are written once.
 */
type V3 = [number, number, number]
const o = new Object3D()
const c = new Color()

interface Item {
  p: V3
  c: string
  rot?: V3
}

function useInstances<T extends Item>(items: T[], fill: (it: T, d: Object3D) => void) {
  const ref = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const m = ref.current
    if (!m) return
    items.forEach((it, i) => {
      o.position.set(...it.p)
      o.rotation.set(...(it.rot ?? [0, 0, 0]))
      o.scale.set(1, 1, 1)
      fill(it, o)
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
      m.setColorAt(i, c.set(it.c))
    })
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items])
  return ref
}

export function InstBoxes({ items, rough = 0.8, metal = 0.05 }: { items: (Item & { s: V3 })[]; rough?: number; metal?: number }) {
  const ref = useInstances(items, (it, d) => d.scale.set(...it.s))
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, items.length]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={rough} metalness={metal} />
    </instancedMesh>
  )
}

export function InstSpheres({ items, rough = 0.7, metal = 0.05 }: { items: (Item & { r: number; sy?: number })[]; rough?: number; metal?: number }) {
  const ref = useInstances(items, (it, d) => d.scale.set(it.r, it.r * (it.sy ?? 1), it.r))
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, items.length]} frustumCulled={false}>
      <sphereGeometry args={[1, 10, 8]} />
      <meshStandardMaterial roughness={rough} metalness={metal} />
    </instancedMesh>
  )
}

export function InstCylinders({ items, rough = 0.6, metal = 0.2, seg = 12 }: { items: (Item & { r: number; h: number })[]; rough?: number; metal?: number; seg?: number }) {
  const ref = useInstances(items, (it, d) => d.scale.set(it.r, it.h, it.r))
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, items.length]} frustumCulled={false}>
      <cylinderGeometry args={[1, 1, 1, seg]} />
      <meshStandardMaterial roughness={rough} metalness={metal} />
    </instancedMesh>
  )
}

/** A floor lamp: pole, base, a glowing shade and a soft pool of light (no real light source, so no shader recompiles). */
export function FloorLamp({ position, h = 1.7, color = '#ffb36b', glow = 1 }: { position: V3; h?: number; color?: string; glow?: number }) {
  const shade = useMemo(() => new Color(color).multiplyScalar(2.2), [color])
  return (
    <group position={position}>
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.16, 0.18, 0.06, 14]} />
        <meshStandardMaterial color="#17171b" roughness={0.5} metalness={0.7} />
      </mesh>
      <mesh position={[0, h / 2, 0]}>
        <cylinderGeometry args={[0.012, 0.012, h, 6]} />
        <meshStandardMaterial color="#25252b" roughness={0.4} metalness={0.8} />
      </mesh>
      <mesh position={[0, h + 0.1, 0]}>
        <cylinderGeometry args={[0.13, 0.22, 0.3, 14, 1, true]} />
        <meshBasicMaterial color={shade} toneMapped={false} side={2} />
      </mesh>
      <Glow position={[0, h + 0.1, 0]} size={1.8 * glow} color={color} opacity={0.55} />
      <Glow position={[0, 0.04, 0]} size={[3.2 * glow, 3.2 * glow]} color={color} opacity={0.18} />
    </group>
  )
}

/** A potted plant: faceted foliage clusters in a pot. */
export function Plant({ position, scale = 1, color = '#1f4a2c' }: { position: V3; scale?: number; color?: string }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.2, 0.15, 0.4, 10]} />
        <meshStandardMaterial color="#3b2a22" roughness={0.9} />
      </mesh>
      {[[0, 0.75, 0, 0.3], [0.17, 0.62, 0.05, 0.22], [-0.16, 0.66, -0.06, 0.24], [0.04, 0.98, 0.04, 0.2], [-0.05, 0.5, 0.15, 0.2]].map(([x, y, z, r], i) => (
        <mesh key={i} position={[x, y, z]} scale={[1, 1.15, 1]}>
          <icosahedronGeometry args={[r, 0]} />
          <meshStandardMaterial color={color} roughness={0.95} flatShading />
        </mesh>
      ))}
    </group>
  )
}
