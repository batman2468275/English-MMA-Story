import { AdditiveBlending, Color, ShaderMaterial, DoubleSide } from 'three'

/**
 * Fresnel "rim-lit silhouette" material: dark body, glowing edge.
 * Used for every stylised figure so they read as cinematic silhouettes.
 * Colours are sRGB hex strings.
 */
export function rimMaterial(base: string, rim: string, power = 2.4, intensity = 1.6, alpha = 1) {
  return new ShaderMaterial({
    uniforms: {
      uBase: { value: new Color(base) },
      uRim: { value: new Color(rim) },
      uPow: { value: power },
      uInt: { value: intensity },
      uAlpha: { value: alpha },
    },
    transparent: alpha < 1,
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uBase; uniform vec3 uRim; uniform float uPow; uniform float uInt; uniform float uAlpha;
      varying vec3 vN; varying vec3 vV;
      void main(){
        float f = pow(1.0 - max(dot(normalize(vN), normalize(vV)), 0.0), uPow);
        gl_FragColor = vec4(mix(uBase, uRim * uInt, f), uAlpha);
      }`,
  })
}

/** Additive glow material for light shafts, halos, beams. */
export function glowMaterial(color: string | Color, opacity = 1, side = DoubleSide) {
  return new ShaderMaterial({
    uniforms: { uColor: { value: new Color(color) }, uOpacity: { value: opacity } },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side,
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){
        float f = abs(dot(normalize(vN), normalize(vV)));
        // brighter toward the apex (uv.y = 1) of cones — light shafts are strongest near the source
        float a = pow(f, 1.5) * (0.12 + 0.88 * vUv.y);
        gl_FragColor = vec4(uColor, a * uOpacity);
      }`,
  })
}
