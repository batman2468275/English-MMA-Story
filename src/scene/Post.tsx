import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { BloomEffect } from 'postprocessing'
import { GradeEffect } from './GradeEffect'
import { UnsignedByteType } from 'three'
import { store } from '../core/store'

/**
 * Post-processing: bloom (desktop only) + our custom grade/FX pass.
 * On mobile we skip bloom and MSAA to keep the frame rate up.
 */
export function Post() {
  const grade = useMemo(() => new GradeEffect(), [])
  const bloom = useRef<BloomEffect>(null)

  useEffect(() => () => grade.dispose?.(), [grade])

  useFrame((state) => {
    const f = store.fx
    grade.set('uTime', state.clock.elapsedTime)
    grade.set('uAberration', f.aberration)
    grade.set('uSat', f.saturation)
    grade.set('uVignette', f.vignette)
    grade.set('uWarp', f.warp)
    grade.set('uShockR', f.shockR)
    grade.set('uShockAmp', f.shockAmp)
    grade.set('uGrain', f.grain * (store.mobile ? 0.55 : 1))
    if (bloom.current) bloom.current.intensity = f.bloom
  })

  return (
    // phones/tablets: 8-bit frame buffer (half-float buffers give coloured speckle on some mobile GPUs) + light MSAA for clean edges
    <EffectComposer multisampling={store.lite ? 0 : store.mobile ? 2 : 4} frameBufferType={store.mobile || store.lite ? UnsignedByteType : undefined}>
      {store.mobile || store.lite ? (
        <primitive object={grade} dispose={null} />
      ) : (
        <>
          <Bloom ref={bloom as never} intensity={1} luminanceThreshold={0.55} luminanceSmoothing={0.25} mipmapBlur radius={0.7} />
          <primitive object={grade} dispose={null} />
        </>
      )}
    </EffectComposer>
  )
}
