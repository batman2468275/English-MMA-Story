import { forwardRef, useMemo } from 'react'
import { BackSide, Color, ShaderMaterial, Vector3 } from 'three'

/**
 * Reusable sky dome: 3-stop vertical gradient (zenith / mid / horizon), optional sun disc with halo, optional stars.
 * Update colours by writing to the material's uniforms from a scene's frame callback.
 */
export interface GradientSkyProps {
  top?: string
  mid?: string
  horizon?: string
  sunDir?: [number, number, number]
  sunSize?: number
  sunColor?: string
  stars?: number
}

export const GradientSky = forwardRef<ShaderMaterial, GradientSkyProps>(
  ({ top = '#2b1450', mid = '#c2457a', horizon = '#ff9a3d', sunDir = [0, 0.05, -1], sunSize = 0.035, sunColor = '#fff2c9', stars = 0 }, ref) => {
    const uniforms = useMemo(
      () => ({
        uTop: { value: new Color(top) },
        uMid: { value: new Color(mid) },
        uHor: { value: new Color(horizon) },
        uSun: { value: new Vector3(...sunDir).normalize() },
        uSunSize: { value: sunSize },
        uSunColor: { value: new Color(sunColor).multiplyScalar(2) },
        uStars: { value: stars },
        uTime: { value: 0 },
      }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [],
    )
    return (
      <mesh renderOrder={-10} frustumCulled={false}>
        <sphereGeometry args={[320, 40, 24]} />
        <shaderMaterial
          ref={ref}
          uniforms={uniforms}
          side={BackSide}
          depthWrite={false}
          fog={false}
          vertexShader={/* glsl */ `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`}
          fragmentShader={/* glsl */ `
            uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uHor; uniform vec3 uSun; uniform float uSunSize; uniform vec3 uSunColor; uniform float uStars; uniform float uTime;
            varying vec3 vDir;
            float hash(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
            void main(){
              vec3 d = normalize(vDir);
              float h = clamp(d.y, -0.2, 1.0);
              vec3 col = mix(uHor, uMid, smoothstep(-0.05, 0.28, h));
              col = mix(col, uTop, smoothstep(0.2, 0.9, h));
              col = mix(col * 0.55, col, smoothstep(-0.25, 0.0, d.y));
              float s = max(dot(d, normalize(uSun)), 0.0);
              float disc = smoothstep(1.0 - uSunSize * 0.35, 1.0 - uSunSize * 0.3, s);
              col += uSunColor * disc;
              col += uHor * 1.2 * pow(s, 18.0) + uSunColor * 0.25 * pow(s, 90.0);
              vec3 cell = floor(d * 420.0);
              float st = step(0.9975, hash(cell)) * smoothstep(0.05, 0.4, d.y);
              col += uStars * st * (0.6 + 0.4 * sin(uTime * 2.5 + hash(cell) * 40.0));
              gl_FragColor = vec4(col, 1.0);
            }`}
        />
      </mesh>
    )
  },
)
