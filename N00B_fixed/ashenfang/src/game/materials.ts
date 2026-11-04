import * as THREE from 'three'

/**
 * Shared material factories.
 *
 * Glare rule (see docs/concept-proposal.md §5): environment surfaces are metalness 0 and
 * roughness ≥ 0.75 with no emission; environment-map intensity stays ≤ 0.5. Emission is reserved
 * for gameplay signals (vital crystals, charge glow, enrage veins, embers).
 */
export const ENV_INTENSITY = { ground: 0.22, rock: 0.25, foliage: 0.18, creature: 0.4, armor: 0.5 }

export type TriplanarOptions = {
  map: THREE.Texture
  /** World units per texture tile. */
  tile: number
  color?: THREE.ColorRepresentation
  /** Colour multiplied in on down-facing surfaces (belly). */
  belly?: THREE.ColorRepresentation
  /** Colour multiplied in on up-facing surfaces (back). */
  back?: THREE.ColorRepresentation
  roughness?: number
  bump?: number
  moss?: { map: THREE.Texture; tile: number; amount: number }
  veins?: THREE.ColorRepresentation
  /** Resting vein glow (0 = veins only show when enraged); molten hides use ~0.3. */
  veinBase?: number
  /** Hide-luminance window treated as crevice for veins: [fully lit below, none above]. */
  veinRange?: [number, number]
  wounds?: boolean
  skinned?: boolean
  envIntensity?: number
}

export type TriplanarUniforms = {
  uEnrage: { value: number }
  uFlash: { value: number }
  uWounds: { value: THREE.Vector4[] }
  uWoundColor: { value: THREE.Color }
}

const MAX_WOUNDS = 6

/**
 * MeshStandardMaterial with object-space triplanar texturing (no UVs needed and no swimming on
 * skinned meshes), luminance bump detail, belly/back colour zones, optional moss on up-facing
 * surfaces, glowing enrage veins and wound highlights.
 */
export function triplanarMaterial(o: TriplanarOptions): THREE.MeshStandardMaterial & { userData: { uniforms: TriplanarUniforms } } {
  const mat = new THREE.MeshStandardMaterial({ color: o.color ?? '#ffffff', roughness: o.roughness ?? 0.82, metalness: 0, envMapIntensity: o.envIntensity ?? ENV_INTENSITY.creature })
  const uniforms: TriplanarUniforms & Record<string, { value: unknown }> = {
    uTriMap: { value: o.map },
    uTile: { value: 1 / o.tile },
    uBump: { value: o.bump ?? 1.2 },
    uBelly: { value: new THREE.Color(o.belly ?? '#ffffff') },
    uBack: { value: new THREE.Color(o.back ?? '#ffffff') },
    uMossMap: { value: o.moss?.map ?? o.map },
    uMossTile: { value: o.moss ? 1 / o.moss.tile : 1 },
    uMoss: { value: o.moss?.amount ?? 0 },
    uVeinColor: { value: new THREE.Color(o.veins ?? '#000000') },
    uEnrage: { value: 0 },
    uVeinBase: { value: o.veinBase ?? 0 },
    uVeinLo: { value: o.veinRange?.[0] ?? 0.08 },
    uVeinHi: { value: o.veinRange?.[1] ?? 0.32 },
    uFlash: { value: 0 },
    uWounds: { value: Array.from({ length: MAX_WOUNDS }, () => new THREE.Vector4(0, -999, 0, 0)) },
    uWoundColor: { value: new THREE.Color('#ff8a3a') },
  } as never
  mat.userData.uniforms = uniforms
  const useMoss = !!o.moss
  const useVeins = !!o.veins
  const useWounds = !!o.wounds
  mat.customProgramCacheKey = () => `tri:${useMoss}:${useVeins}:${useWounds}:${o.skinned ? 1 : 0}`
  mat.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFacePos;\nvarying vec3 vFaceNrm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFacePos = position;\nvFaceNrm = normal;')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vFacePos;
varying vec3 vFaceNrm;
uniform sampler2D uTriMap;
uniform sampler2D uMossMap;
uniform float uTile, uBump, uMoss, uMossTile, uEnrage, uFlash, uVeinBase, uVeinLo, uVeinHi;
uniform vec3 uBelly, uBack, uVeinColor, uWoundColor;
uniform vec4 uWounds[${MAX_WOUNDS}];
float triH;
vec3 triW;
vec4 tri(sampler2D t, vec3 p, vec3 w) {
  return texture2D(t, p.zy) * w.x + texture2D(t, p.xz) * w.y + texture2D(t, p.xy) * w.z;
}
// Blurrier (mip-biased) sample for bump height: derivative bumps alias on fine detail.
vec4 triB(sampler2D t, vec3 p, vec3 w) {
  return texture(t, p.zy, 1.8) * w.x + texture(t, p.xz, 1.8) * w.y + texture(t, p.xy, 1.8) * w.z;
}
float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
}`,
      )
      .replace(
        '#include <map_fragment>',
        `{
  vec3 n = normalize(vFaceNrm);
  triW = pow(abs(n), vec3(4.0));
  triW /= dot(triW, vec3(1.0));
  vec3 p = vFacePos * uTile;
  vec4 texel = tri(uTriMap, p, triW);
  triH = dot(triB(uTriMap, p, triW).rgb, vec3(0.299, 0.587, 0.114));
  vec3 zone = mix(uBelly, uBack, smoothstep(-0.55, 0.45, n.y));
  vec3 col = texel.rgb * zone;
  ${
    useMoss
      ? `float m = smoothstep(0.25, 0.7, n.y + (vnoise(vFacePos * 0.6) - 0.5) * 0.7) * uMoss;
  vec4 moss = tri(uMossMap, vFacePos * uMossTile, triW);
  col = mix(col, moss.rgb, m);
  triH = mix(triH, dot(triB(uMossMap, vFacePos * uMossTile, triW).rgb, vec3(0.33)) * 1.3, m);`
      : ''
  }
  diffuseColor.rgb *= col;
}`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
{
  vec3 dpdx = dFdx(-vViewPosition);
  vec3 dpdy = dFdy(-vViewPosition);
  // Fade relief out as texels shrink below a pixel.
  float footprint = length(fwidth(vFacePos * uTile)) * 1024.0;
  float fade = clamp(1.6 - footprint * 0.35, 0.0, 1.0);
  float dhdx = dFdx(triH) * uBump * fade;
  float dhdy = dFdy(triH) * uBump * fade;
  vec3 r1 = cross(dpdy, normal);
  vec3 r2 = cross(normal, dpdx);
  float det = dot(dpdx, r1) * faceDirection;
  vec3 grad = sign(det) * (dhdx * r1 + dhdy * r2);
  normal = normalize(abs(det) * normal - grad);
}`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
${
  useVeins
    ? `{
  // Enrage veins: glow in the dark crevices of the hide.
  float crev = smoothstep(uVeinHi, uVeinLo, triH);
  float pulse = 0.65 + 0.35 * sin(vFacePos.z * 1.3 + vFacePos.y * 2.1);
  totalEmissiveRadiance += uVeinColor * crev * pulse * (uEnrage * 1.6 + uVeinBase);
}`
    : ''
}
${
  useWounds
    ? `for (int i = 0; i < ${MAX_WOUNDS}; i++) {
  vec4 w = uWounds[i];
  if (w.w <= 0.0) continue;
  float d = length(vFacePos - w.xyz) / max(w.w, 0.01);
  float scar = smoothstep(1.0, 0.55, d) * smoothstep(0.35, 0.18, triH);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.45, 0.08, 0.04), smoothstep(1.0, 0.4, d) * 0.55);
  totalEmissiveRadiance += uWoundColor * scar * 0.9;
}`
    : ''
}
totalEmissiveRadiance += vec3(1.0, 0.92, 0.82) * uFlash;`,
      )
  }
  return mat as never
}

/** Standard PBR surface for rocks, bark and props: map + normal map, no metal, no emission. */
export function pbrMaterial(map: THREE.Texture, normal: THREE.Texture | null, o: { repeat?: number; color?: THREE.ColorRepresentation; roughness?: number; normalScale?: number; env?: number } = {}): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    map,
    normalMap: normal ?? undefined,
    color: o.color ?? '#ffffff',
    roughness: Math.max(0.75, o.roughness ?? 0.92),
    metalness: 0,
    envMapIntensity: o.env ?? ENV_INTENSITY.rock,
  })
  if (normal) mat.normalScale.setScalar(o.normalScale ?? 1)
  return mat
}

/** Triplanar PBR (map + normal) for large procedural rocks without UVs, in world space. */
export function triplanarRock(map: THREE.Texture, normal: THREE.Texture, o: { tile: number; color?: THREE.ColorRepresentation; mossMap?: THREE.Texture; moss?: number }): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: o.color ?? '#ffffff', roughness: 0.93, metalness: 0, envMapIntensity: ENV_INTENSITY.rock })
  const u = { uRockMap: { value: map }, uRockNor: { value: normal }, uRockTile: { value: 1 / o.tile }, uRockMoss: { value: o.mossMap ?? map }, uMossAmt: { value: o.moss ?? 0 } }
  mat.customProgramCacheKey = () => 'triRock'
  mat.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, u)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRockPos;\nvarying vec3 vRockNrm;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvec4 rwp = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\nrwp = instanceMatrix * rwp;\n#endif\nrwp = modelMatrix * rwp;\nvRockPos = rwp.xyz;\nvec3 rn = objectNormal;\n#ifdef USE_INSTANCING\nrn = mat3(instanceMatrix) * rn;\n#endif\nvRockNrm = normalize(mat3(modelMatrix) * rn);')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vRockPos;
varying vec3 vRockNrm;
uniform sampler2D uRockMap, uRockNor, uRockMoss;
uniform float uRockTile, uMossAmt;
vec3 rockW;`,
      )
      .replace(
        '#include <map_fragment>',
        `{
  vec3 n = normalize(vRockNrm);
  rockW = pow(abs(n), vec3(5.0)); rockW /= dot(rockW, vec3(1.0));
  vec3 p = vRockPos * uRockTile;
  vec3 c = texture2D(uRockMap, p.zy).rgb * rockW.x + texture2D(uRockMap, p.xz).rgb * rockW.y + texture2D(uRockMap, p.xy).rgb * rockW.z;
  float m = smoothstep(0.55, 0.85, n.y) * uMossAmt;
  vec3 mc = texture2D(uRockMoss, p.xz * 1.7).rgb;
  diffuseColor.rgb *= mix(c, mc, m);
}`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `{
  // Whiteout-blended triplanar normal map, converted to view space.
  vec3 n = normalize(vRockNrm);
  vec3 p = vRockPos * uRockTile;
  vec3 tx = texture2D(uRockNor, p.zy).xyz * 2.0 - 1.0;
  vec3 ty = texture2D(uRockNor, p.xz).xyz * 2.0 - 1.0;
  vec3 tz = texture2D(uRockNor, p.xy).xyz * 2.0 - 1.0;
  vec3 wx = vec3(0.0, tx.y, tx.x) * sign(n.x);
  vec3 wy = vec3(ty.x, 0.0, ty.y) * sign(n.y);
  vec3 wz = vec3(tz.x, tz.y, 0.0) * sign(n.z);
  vec3 wn = normalize(n + (wx * rockW.x + wy * rockW.y + wz * rockW.z) * 0.9);
  normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
}`,
      )
  }
  return mat
}
