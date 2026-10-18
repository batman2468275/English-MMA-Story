import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Color, DirectionalLight, Fog, HemisphereLight, PointLight, Vector3 } from 'three'
import { grades } from '../core/grade'
import { store } from '../core/store'
import { damp } from '../core/math'

/**
 * Shared lighting rig: one hemisphere, one key (directional) and one point light.
 * Keeping the same lights in every scene means no shader recompiles when switching scenes.
 * The rig eases toward the active section's grade (core/grade.ts) so the lighting + fog
 * colour grade transitions with scroll. Scenes can nudge it via `store.light`.
 */
export const light = {
  ptMul: 1,
  /** absolute point-light intensity override (null = use the grade's value × ptMul) */
  ptAbs: null as number | null,
  ptPos: null as Vector3 | null,
  ptColor: null as Color | null,
  hemiAdd: 0,
  keyMul: 1,
}

export function resetLight() {
  light.ptMul = 1
  light.ptAbs = null
  light.ptPos = null
  light.ptColor = null
  light.hemiAdd = 0
  light.keyMul = 1
}

export function Rig() {
  const hemi = useRef<HemisphereLight>(null)
  const key = useRef<DirectionalLight>(null)
  const pt = useRef<PointLight>(null)
  const scene = useThree((s) => s.scene)

  const cur = useMemo(
    () => ({
      bg: new Color(grades[0].bg),
      sky: new Color(grades[0].hemiSky),
      ground: new Color(grades[0].hemiGround),
      key: new Color(grades[0].key),
      pt: new Color(grades[0].pt),
      hemi: grades[0].hemi,
      keyI: grades[0].keyI,
      ptI: grades[0].ptI,
      fogNear: grades[0].fogNear,
      fogFar: grades[0].fogFar,
      keyPos: new Vector3(...grades[0].keyPos),
      ptPos: new Vector3(...grades[0].ptPos),
      bloom: grades[0].bloom,
      sat: grades[0].sat,
      vig: grades[0].vig,
    }),
    [],
  )
  const tmp = useMemo(() => new Color(), [])
  const tmpV = useMemo(() => new Vector3(), [])

  if (!scene.fog) scene.fog = new Fog(cur.bg, cur.fogNear, cur.fogFar)

  useFrame((_, dt) => {
    dt = Math.min(dt, 0.05)
    const g = grades[store.active]
    const k = 1 - Math.exp(-3.2 * dt)
    cur.bg.lerp(tmp.set(g.bg), k)
    cur.sky.lerp(tmp.set(g.hemiSky), k)
    cur.ground.lerp(tmp.set(g.hemiGround), k)
    cur.key.lerp(tmp.set(g.key), k)
    cur.pt.lerp(light.ptColor ?? tmp.set(g.pt), light.ptColor ? 0.5 : k)
    cur.hemi = damp(cur.hemi, g.hemi, 3.2, dt)
    cur.keyI = damp(cur.keyI, g.keyI, 3.2, dt)
    cur.ptI = damp(cur.ptI, g.ptI, 3.2, dt)
    cur.fogNear = damp(cur.fogNear, g.fogNear, 3.2, dt)
    cur.fogFar = damp(cur.fogFar, g.fogFar, 3.2, dt)
    cur.keyPos.lerp(tmpV.set(...g.keyPos), k)
    cur.ptPos.lerp(light.ptPos ?? tmpV.set(...g.ptPos), light.ptPos ? 0.5 : k)
    cur.bloom = damp(cur.bloom, g.bloom, 3.2, dt)
    cur.sat = damp(cur.sat, g.sat, 3.2, dt)
    cur.vig = damp(cur.vig, g.vig, 3.2, dt)

    scene.background = cur.bg
    if (scene.fog) {
      scene.fog.color.copy(cur.bg)
      ;(scene.fog as Fog).near = cur.fogNear
      ;(scene.fog as Fog).far = cur.fogFar
    }
    const h = hemi.current!
    h.color.copy(cur.sky)
    h.groundColor.copy(cur.ground)
    h.intensity = cur.hemi + light.hemiAdd
    const kl = key.current!
    kl.color.copy(cur.key)
    kl.intensity = cur.keyI * light.keyMul
    kl.position.copy(cur.keyPos)
    const p = pt.current!
    p.color.copy(cur.pt)
    p.intensity = light.ptAbs !== null ? light.ptAbs : cur.ptI * light.ptMul
    p.position.copy(cur.ptPos)

    // post-processing targets (store.fx values can still be overridden by scenes via multipliers)
    store.fx.bloom = cur.bloom
    store.fx.saturation = cur.sat
    store.fx.vignette = cur.vig

    resetLight()
  })

  return (
    <>
      <hemisphereLight ref={hemi} />
      <directionalLight ref={key} />
      <pointLight ref={pt} decay={1.4} distance={0} />
    </>
  )
}
