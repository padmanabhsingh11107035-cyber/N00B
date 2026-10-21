import * as THREE from 'three'

/**
 * Shared shader tweaks for the realistic look. All injected code uses fixed cache keys so every
 * instance shares one program per base material type; per-instance values live in uniforms.
 *
 *  - flash : additive hit flash (independent of emissive maps)
 *  - rim   : fresnel rim light so characters read against dark dungeon rooms
 *  - dissolve: noise erosion + glowing edge (Detention Shade body, deaths, portal FX)
 */

export type FxUniforms = {
  uFlash: { value: number }
  uFlashColor: { value: THREE.Color }
  uRim: { value: number }
  uRimColor: { value: THREE.Color }
  uDissolve: { value: number }
  uEdgeColor: { value: THREE.Color }
  uTime: { value: number }
}

const DISSOLVE_NOISE = /* glsl */ `
float fxHash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float fxNoise(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(fxHash(i), fxHash(i + vec3(1,0,0)), f.x), mix(fxHash(i + vec3(0,1,0)), fxHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(fxHash(i + vec3(0,0,1)), fxHash(i + vec3(1,0,1)), f.x), mix(fxHash(i + vec3(0,1,1)), fxHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
`

/** Adds flash / rim / optional dissolve uniforms to a MeshStandard/Physical material. */
export function withFx(mat: THREE.MeshStandardMaterial, opts: { rim?: THREE.ColorRepresentation; rimStrength?: number; dissolve?: boolean } = {}): THREE.MeshStandardMaterial {
  const u: FxUniforms = {
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color('#fff4e6') },
    uRim: { value: opts.rimStrength ?? 0 },
    uRimColor: { value: new THREE.Color(opts.rim ?? '#9fd8ff') },
    uDissolve: { value: 0 },
    uEdgeColor: { value: new THREE.Color('#b57cff') },
    uTime: { value: 0 },
  }
  const dissolve = !!opts.dissolve
  mat.userData.fx = u
  mat.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, u)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${dissolve ? 'varying vec3 vFxPos;' : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${dissolve ? 'vFxPos = position;' : ''}`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uFlash; uniform vec3 uFlashColor; uniform float uRim; uniform vec3 uRimColor;
uniform float uDissolve; uniform vec3 uEdgeColor; uniform float uTime;
${dissolve ? 'varying vec3 vFxPos;\n' + DISSOLVE_NOISE : ''}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  float fres = pow(1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), 3.0);
  totalEmissiveRadiance += uRimColor * fres * uRim + uFlashColor * uFlash;
${dissolve ? `  float n = fxNoise(vFxPos * 9.0 + vec3(0.0, uTime * 0.6, 0.0)) * 0.65 + fxNoise(vFxPos * 23.0 - vec3(0.0, uTime * 1.3, 0.0)) * 0.35;
  float cut = n - uDissolve;
  if (cut < 0.0) discard;
  totalEmissiveRadiance += uEdgeColor * smoothstep(0.12, 0.0, cut) * 3.0;` : ''}
}`)
  }
  mat.customProgramCacheKey = () => (dissolve ? 'fx-dissolve' : 'fx')
  return mat
}

export function fxOf(mat: THREE.Material): FxUniforms | undefined {
  return mat.userData.fx as FxUniforms | undefined
}
