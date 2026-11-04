import * as THREE from 'three'
import { shaderTime } from './geo'

/**
 * Shared, low-glare world materials. Every material is compiled once with its final shader
 * layout; textures arrive later from the stage loader and are swapped in without recompiling
 * (placeholder textures keep the look sensible until then).
 *
 * Glare policy: metalness 0 everywhere, roughness ≥ 0.8 on natural surfaces, low env
 * intensity, emissive only on crystals / embers / eyes.
 */

export const TERRAIN_LAYERS = ['leafy_grass', 'forest_floor', 'mud_forest', 'lichen_rock', 'coast_sand_03', 'snow_02'] as const
const SIZE = 512

function solidArray(rgba: [number, number, number, number], layers: number, color: boolean): THREE.DataArrayTexture {
  const data = new Uint8Array(4 * layers)
  for (let i = 0; i < layers; i++) data.set(rgba, i * 4)
  const t = new THREE.DataArrayTexture(data, 1, 1, layers)
  t.needsUpdate = true
  if (color) t.colorSpace = THREE.SRGBColorSpace
  return t
}
function solid(rgba: [number, number, number, number], color: boolean): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array(rgba), 1, 1)
  t.needsUpdate = true
  if (color) t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** Shared uniforms (value swap = no recompile). */
export const WU = {
  uTime: shaderTime,
  tTerrainAlb: { value: solidArray([118, 128, 84, 255], TERRAIN_LAYERS.length, true) as THREE.Texture },
  tTerrainNor: { value: solidArray([128, 128, 255, 255], TERRAIN_LAYERS.length, false) as THREE.Texture },
  tRockAlb: { value: solid([128, 124, 116, 255], true) as THREE.Texture },
  tRockNor: { value: solid([128, 128, 255, 255], false) as THREE.Texture },
  tStoneAlb: { value: solid([140, 136, 128, 255], true) as THREE.Texture },
  tStoneNor: { value: solid([128, 128, 255, 255], false) as THREE.Texture },
  uWetness: { value: 0 },
  /** Foliage translucency fill (scaled by daylight) so canopies aren't black from below. */
  uFoliageFill: { value: 0.2 },
}

// Map-based materials share these Texture objects; their images are filled in on load.
function deferred(color: boolean, repeat = true): THREE.Texture {
  const t = new THREE.Texture()
  if (color) t.colorSpace = THREE.SRGBColorSpace
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 4
  return t
}
export const TEX = {
  barkAlb: deferred(true),
  barkNor: deferred(false),
  barkRough: deferred(false),
  planksAlb: deferred(true),
  planksNor: deferred(false),
  leaves: deferred(true, false),
  ground: deferred(true, false),
  kit: deferred(true, false),
}

const WORLD_VARYINGS_VS = `
varying vec3 vWPos;
varying vec3 vWNor;
`
const WORLD_VARYINGS_ASSIGN = `
vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vWNor = normalize(mat3(modelMatrix) * objectNormal);
`

const WIND_VS = `
float sw = aSway * (0.65 + 0.35 * sin(uTime * 0.6 + position.x * 0.04));
transformed.x += sin(uTime * 1.6 + position.x * 0.33 + position.z * 0.21) * 0.07 * sw;
transformed.z += cos(uTime * 1.25 + position.z * 0.31 + position.y * 0.2) * 0.055 * sw;
`

const TRIPLANAR_FN = `
vec3 triW(vec3 n) { vec3 w = pow(abs(n), vec3(4.0)); return w / (w.x + w.y + w.z + 1e-4); }
vec4 triAlb(sampler2D t, vec3 p, vec3 w, float s) {
  return texture2D(t, p.zy * s) * w.x + texture2D(t, p.xz * s) * w.y + texture2D(t, p.xy * s) * w.z;
}
vec3 triNor(sampler2D t, vec3 p, vec3 w, float s) {
  vec3 nx = texture2D(t, p.zy * s).xyz * 2.0 - 1.0;
  vec3 ny = texture2D(t, p.xz * s).xyz * 2.0 - 1.0;
  vec3 nz = texture2D(t, p.xy * s).xyz * 2.0 - 1.0;
  return vec3(0.0, nx.y, nx.x) * w.x + vec3(ny.x, 0.0, ny.y) * w.y + vec3(nz.x, nz.y, 0.0) * w.z;
}
`

/** Terrain: 6-layer PBR splat (grass, forest floor, dirt, rock, sand, snow) with triplanar rock. */
function terrainMaterial(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0, envMapIntensity: 0.35 })
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { tAlb: WU.tTerrainAlb, tNor: WU.tTerrainNor, uWetness: WU.uWetness })
    shader.vertexShader = `attribute vec3 aSw0;\nattribute vec3 aSw1;\nvarying vec3 vSw0;\nvarying vec3 vSw1;\n${WORLD_VARYINGS_VS}` + shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      `#include <worldpos_vertex>\n${WORLD_VARYINGS_ASSIGN}\nvSw0 = aSw0; vSw1 = aSw1;`,
    )
    shader.fragmentShader = `precision highp sampler2DArray;\nuniform sampler2DArray tAlb;\nuniform sampler2DArray tNor;\nuniform float uWetness;\nvarying vec3 vSw0;\nvarying vec3 vSw1;\n${WORLD_VARYINGS_VS}`
      + shader.fragmentShader
        .replace('#include <map_fragment>', `
          vec3 gN = normalize(vWNor);
          float wF = vSw0.x, wD = vSw0.y, wR = vSw0.z, wS = vSw1.x, wSn = vSw1.y;
          float wG = max(0.0, 1.0 - wF - wD - wR - wS - wSn);
          vec2 uvA = vWPos.xz * 0.23;
          vec2 uvB = mat2(0.8, -0.6, 0.6, 0.8) * vWPos.xz * 0.071 + 0.37;
          float macro = texture(tAlb, vec3(vWPos.xz * 0.011, 0.0)).g;
          vec3 alb = vec3(0.0);
          vec3 dN = vec3(0.0);
          #define LAYER(W, I) if (W > 0.01) { vec3 a = mix(texture(tAlb, vec3(uvA, I)).rgb, texture(tAlb, vec3(uvB, I)).rgb, 0.4); alb += a * W; vec3 tn = texture(tNor, vec3(uvA, I)).xyz * 2.0 - 1.0; dN += vec3(tn.x, 0.0, tn.y) * W; }
          LAYER(wG, 0.0)
          LAYER(wF, 1.0)
          LAYER(wD, 2.0)
          LAYER(wS, 4.0)
          LAYER(wSn, 5.0)
          if (wR > 0.01) {
            vec3 tw = triW(gN);
            float s = 0.19;
            vec3 ra = texture(tAlb, vec3(vWPos.zy * s, 3.0)).rgb * tw.x + texture(tAlb, vec3(vWPos.xz * s, 3.0)).rgb * tw.y + texture(tAlb, vec3(vWPos.xy * s, 3.0)).rgb * tw.z;
            vec3 nx = texture(tNor, vec3(vWPos.zy * s, 3.0)).xyz * 2.0 - 1.0;
            vec3 ny = texture(tNor, vec3(vWPos.xz * s, 3.0)).xyz * 2.0 - 1.0;
            vec3 nz = texture(tNor, vec3(vWPos.xy * s, 3.0)).xyz * 2.0 - 1.0;
            alb += ra * wR;
            dN += (vec3(0.0, nx.y, nx.x) * tw.x + vec3(ny.x, 0.0, ny.y) * tw.y + vec3(nz.x, nz.y, 0.0) * tw.z) * wR;
          }
          // Painterly palette is primary; source textures contribute only broad, low-contrast
          // variation so the ground never reads as photographic noise.
          vec3 palette = vec3(0.56, 0.70, 0.35) * wG
            + vec3(0.39, 0.48, 0.25) * wF
            + vec3(0.62, 0.42, 0.29) * wD
            + vec3(0.63, 0.60, 0.55) * wR
            + vec3(0.79, 0.68, 0.50) * wS
            + vec3(0.91, 0.92, 0.91) * wSn;
          float texLum = dot(alb, vec3(0.299, 0.587, 0.114));
          alb = palette * (0.88 + texLum * 0.22 + (macro - 0.5) * 0.08);
          diffuseColor.rgb *= alb * 1.18;
          vec3 gWorldN = normalize(gN + dN * 0.85);
          float gWet = clamp(wS * smoothstep(1.2, 0.2, vWPos.y) + uWetness * 0.4, 0.0, 1.0);
        `)
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roughness * mix(1.0, 0.72, gWet) * mix(1.0, 0.86, wSn);')
        .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(gWorldN, 0.0)).xyz);')
        .replace('void main() {', `${TRIPLANAR_FN}\nvoid main() {`)
  }
  mat.customProgramCacheKey = () => 'tf-terrain'
  return mat
}

/** Triplanar textured rock / masonry with vertex-colour tint (moss) and optional wind. */
function rockMaterial(which: 'rock' | 'stone'): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0, envMapIntensity: 0.35 })
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, which === 'rock' ? { tRA: WU.tRockAlb, tRN: WU.tRockNor } : { tRA: WU.tStoneAlb, tRN: WU.tStoneNor })
    shader.vertexShader = WORLD_VARYINGS_VS + shader.vertexShader.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>\n${WORLD_VARYINGS_ASSIGN}`)
    shader.fragmentShader = `uniform sampler2D tRA;\nuniform sampler2D tRN;\n${WORLD_VARYINGS_VS}` + shader.fragmentShader
      .replace('void main() {', `${TRIPLANAR_FN}\nvoid main() {`)
      .replace('#include <map_fragment>', `
        vec3 gN = normalize(vWNor);
        vec3 tw = triW(gN);
        float ts = ${which === 'rock' ? '0.42' : '0.55'};
        diffuseColor.rgb *= triAlb(tRA, vWPos, tw, ts).rgb * 2.3;
        vec3 gWorldN = normalize(gN + triNor(tRN, vWPos, tw, ts) * 0.9);
      `)
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(gWorldN, 0.0)).xyz);')
      // Vertex colours were authored as full albedo; use them only as a hue/brightness tint here.
      .replace('#include <color_fragment>', `
        float vLum = max(1e-3, dot(vColor.rgb, vec3(0.3333)));
        diffuseColor.rgb *= mix(vec3(1.0), vColor.rgb / vLum, 0.55) * clamp(vLum / 0.28, 0.7, 1.15);
      `)
  }
  mat.customProgramCacheKey = () => `tf-${which}`
  return mat
}

/** Standard material with `aSway` wind (vertex colours as tint). */
export function swayMaterial(key: string, opts: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, envMapIntensity: 0.4, ...opts })
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = shaderTime
    shader.vertexShader = 'attribute float aSway;\nuniform float uTime;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n${WIND_VS}`)
  }
  mat.customProgramCacheKey = () => `tf-sway-${key}`
  return mat
}

/** Adds soft light transmission to a sway material: a daylight-scaled albedo fill. */
function foliage(mat: THREE.MeshStandardMaterial, k: number): THREE.MeshStandardMaterial {
  const base = mat.onBeforeCompile
  mat.onBeforeCompile = (shader, r) => {
    base.call(mat, shader, r)
    shader.uniforms.uFoliageFill = WU.uFoliageFill
    shader.fragmentShader = 'uniform float uFoliageFill;\n' + shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * (0.10 + uFoliageFill) * ${k.toFixed(2)};`,
    )
  }
  return mat
}

export type WorldMaterials = ReturnType<typeof createWorldMaterials>

export function createWorldMaterials() {
  const terrain = terrainMaterial()
  const rock = rockMaterial('rock')
  const stone = rockMaterial('stone')
  const misc = swayMaterial('misc', { roughness: 0.88 })
  // Bark gets a gentle daylight fill so backlit trunks stay warm brown instead of black.
  const bark = foliage(swayMaterial('bark', { map: TEX.barkAlb, normalMap: TEX.barkNor, roughnessMap: TEX.barkRough, roughness: 1, normalScale: new THREE.Vector2(0.35, 0.35) }), 0.45)
  const leaves = foliage(swayMaterial('leaves', { map: TEX.leaves, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.82 }), 1)
  // MegaKit foliage/cover: their own cut-out cards in one atlas (see scripts/build-kit-atlas.py).
  const kit = foliage(swayMaterial('kit', { map: TEX.kit, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.86 }), 1)
  const grass = foliage(swayMaterial('grass', { map: TEX.ground, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.9 }), 0.6)
  const planks = new THREE.MeshStandardMaterial({ vertexColors: true, map: TEX.planksAlb, normalMap: TEX.planksNor, roughness: 0.86, metalness: 0, envMapIntensity: 0.35 })
  // Crystals: the only emissive world surface, kept soft to avoid glare.
  const glow = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0, emissive: 0xffffff, emissiveIntensity: 0.32, transparent: true, opacity: 0.9, envMapIntensity: 0.5 })
  glow.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('vec3 totalEmissiveRadiance = emissive;', 'vec3 totalEmissiveRadiance = emissive * vColor.rgb;')
  }
  glow.customProgramCacheKey = () => 'tf-glow'
  return { terrain, rock, stone, misc, bark, leaves, kit, grass, planks, glow }
}

// ─── Texture loading (driven by the stage loader) ──────────────────────────

/**
 * Decode an image. WebGL ignores UNPACK_FLIP_Y for ImageBitmap uploads, so bitmaps are flipped at
 * decode time (and their textures use flipY = false). Either path ends with v = 0 at the image
 * bottom, which is what the atlas quadrants below assume.
 */
async function bitmap(url: string): Promise<ImageBitmap | HTMLImageElement> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to load ${url}`)
  const blob = await res.blob()
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(blob, { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' })
  }
  const img = new Image()
  img.src = URL.createObjectURL(blob)
  await img.decode()
  return img
}

let scratch: CanvasRenderingContext2D | null = null
function pixels(img: CanvasImageSource, size: number): Uint8ClampedArray {
  if (!scratch) {
    const c = document.createElement('canvas')
    c.width = c.height = size
    scratch = c.getContext('2d', { willReadFrequently: true })!
  }
  scratch.clearRect(0, 0, size, size)
  scratch.drawImage(img, 0, 0, size, size)
  return scratch.getImageData(0, 0, size, size).data
}

async function arrayTexture(urls: string[], color: boolean): Promise<THREE.DataArrayTexture> {
  const imgs = await Promise.all(urls.map(bitmap))
  const data = new Uint8Array(SIZE * SIZE * 4 * imgs.length)
  imgs.forEach((img, i) => data.set(pixels(img, SIZE), i * SIZE * SIZE * 4))
  const t = new THREE.DataArrayTexture(data, SIZE, SIZE, imgs.length)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.magFilter = THREE.LinearFilter
  t.generateMipmaps = true
  t.anisotropy = 4
  if (color) t.colorSpace = THREE.SRGBColorSpace
  t.needsUpdate = true
  return t
}

async function fill(t: THREE.Texture, url: string): Promise<void> {
  const img = await bitmap(url)
  t.image = img
  t.flipY = !(typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap)
  t.needsUpdate = true
}

async function single(url: string, color: boolean): Promise<THREE.Texture> {
  const t = deferred(color)
  await fill(t, url)
  return t
}

/** All world textures needed for the first day (stage 1). Resolves when every texture is bound. */
export async function loadWorldTextures(base = './assets/tex/'): Promise<void> {
  const L = TERRAIN_LAYERS.map((n) => `${base}${n}`)
  const [alb, nor, rA, rN, sA, sN] = await Promise.all([
    arrayTexture(L.map((u) => `${u}_diff.jpg`), true),
    arrayTexture(L.map((u) => `${u}_nor.jpg`), false),
    single(`${base}lichen_rock_diff.jpg`, true),
    single(`${base}lichen_rock_nor.jpg`, false),
    single(`${base}worn_rock_natural_01_diff.jpg`, true),
    single(`${base}worn_rock_natural_01_nor.jpg`, false),
    fill(TEX.barkAlb, `${base}bark_brown_02_diff.jpg`),
    fill(TEX.barkNor, `${base}bark_brown_02_nor.jpg`),
    fill(TEX.barkRough, `${base}bark_brown_02_rough.jpg`),
    fill(TEX.planksAlb, `${base}oak_wood_planks_diff.jpg`),
    fill(TEX.planksNor, `${base}oak_wood_planks_nor.jpg`),
    fill(TEX.leaves, './assets/foliage/leaves.webp'),
    fill(TEX.ground, './assets/foliage/ground.webp'),
    fill(TEX.kit, KIT_ATLAS_URL),
  ])
  WU.tTerrainAlb.value = alb
  WU.tTerrainNor.value = nor
  WU.tRockAlb.value = rA
  WU.tRockNor.value = rN
  WU.tStoneAlb.value = sA
  WU.tStoneNor.value = sN
}

/** URLs fetched by loadWorldTextures (for the stage loader's byte accounting). */
export function worldTextureUrls(base = './assets/tex/'): string[] {
  const out: string[] = []
  for (const n of TERRAIN_LAYERS) out.push(`${base}${n}_diff.jpg`, `${base}${n}_nor.jpg`)
  out.push(`${base}worn_rock_natural_01_diff.jpg`, `${base}worn_rock_natural_01_nor.jpg`)
  out.push(`${base}bark_brown_02_diff.jpg`, `${base}bark_brown_02_nor.jpg`, `${base}bark_brown_02_rough.jpg`)
  out.push(`${base}oak_wood_planks_diff.jpg`, `${base}oak_wood_planks_nor.jpg`, './assets/foliage/leaves.webp', './assets/foliage/ground.webp', KIT_ATLAS_URL)
  return out
}

export const KIT_ATLAS_URL = './assets/nature/kit-foliage.webp'
/** Cells of the kit atlas (4x2 of 512 px with an 8 px gutter), keyed by MegaKit material name. */
const KIT_CELLS: Record<string, [number, number]> = {
  Leaves_NormalTree: [0, 0], Leaves_TwistedTree: [1, 0], Leaves_Pine: [2, 0], Leaves: [3, 0],
  Flowers: [0, 1], Grass: [1, 1], Mushrooms: [2, 1], PathRocks: [3, 1],
}
/**
 * UV rect (u0, v0, su, sv) mapping a glTF-convention uv (v down from the image top) into the
 * kit atlas, which is sampled with flipY semantics (v up). Null for materials not in the atlas.
 */
export function kitCell(material: string): readonly [number, number, number, number] | null {
  const c = KIT_CELLS[material]
  if (!c) return null
  const [col, row] = c
  return [(col * 512 + 8) / 2048, 1 - (row * 512 + 8) / 1024, 496 / 2048, -496 / 1024]
}

/** Atlas quadrants (u0, v0, su, sv) — textures are flipY, so v0 = 0.5 is the TOP row. */
export const ATLAS = {
  oak: [0, 0.5, 0.5, 0.5],
  birch: [0.5, 0.5, 0.5, 0.5],
  pine: [0, 0, 0.5, 0.5],
  beech: [0.5, 0, 0.5, 0.5],
  grass: [0, 0.5, 0.5, 0.5],
  flowers: [0.5, 0.5, 0.5, 0.5],
  fern: [0, 0, 0.5, 0.5],
  berry: [0.5, 0, 0.5, 0.5],
} as const satisfies Record<string, readonly [number, number, number, number]>
