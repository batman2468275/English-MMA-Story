import { useMemo, forwardRef } from 'react'
import { AdditiveBlending, Color, CanvasTexture, Mesh, Sprite } from 'three'
import { softTexture } from './textures'

let _soft: CanvasTexture | null = null
export const sharedSoft = () => (_soft ??= softTexture())

type V3 = [number, number, number]

/** Soft additive light blob (billboard). `color` is boosted above 1 so bloom picks it up. */
export const Glow = forwardRef<Sprite, { position?: V3; size?: number | [number, number]; color?: string; opacity?: number; boost?: number }>(
  ({ position, size = 2, color = '#ffb347', opacity = 1, boost = 1.6 }, ref) => {
    const c = useMemo(() => new Color(color).multiplyScalar(boost), [color, boost])
    const s: [number, number, number] = Array.isArray(size) ? [size[0], size[1], 1] : [size, size, 1]
    return (
      <sprite ref={ref} position={position} scale={s}>
        <spriteMaterial map={sharedSoft()} color={c} transparent opacity={opacity} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </sprite>
    )
  },
)

/** Lit box. */
export const Box = forwardRef<Mesh, { position?: V3; size: V3; color?: string; rotation?: V3; rough?: number; metal?: number; emissive?: string; ei?: number }>(
  ({ position, size, color = '#222', rotation, rough = 0.85, metal = 0.05, emissive, ei = 1 }, ref) => (
    <mesh ref={ref} position={position} rotation={rotation}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={rough} metalness={metal} emissive={emissive ?? '#000'} emissiveIntensity={emissive ? ei : 0} />
    </mesh>
  ),
)

/** Unlit glowing box (windows, screens, strips). Colour is HDR-boosted so it blooms. */
export const Emit = forwardRef<Mesh, { position?: V3; size: V3; color?: string; boost?: number; rotation?: V3 }>(
  ({ position, size, color = '#ffb347', boost = 1.6, rotation }, ref) => {
    const c = useMemo(() => new Color(color).multiplyScalar(boost), [color, boost])
    return (
      <mesh ref={ref} position={position} rotation={rotation}>
        <boxGeometry args={size} />
        <meshBasicMaterial color={c} toneMapped={false} />
      </mesh>
    )
  },
)
