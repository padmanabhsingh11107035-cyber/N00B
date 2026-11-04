import * as THREE from 'three'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Quality } from '../engine/save'
import { fbm, rng, smoothstep } from './noise'
import { bakedGeometry, envTexture } from './envAssets'
import { pbrMaterial, triplanarRock } from './materials'
import { CAMP, heightAt, LAKE, normalAt, OBSTACLES, SPIRES, WATER_LEVEL, waterfallLine, WORLD } from './terrain'

/**
 * The Emberwild Basin: sky, painted terrain, wind-swept grass and flowers that part around the
 * hunter and the monster's feet, forests, rock spires, a lake with a waterfall, drifting mist,
 * pollen, birds, the hunter camp and gatherable herbs. Everything is procedural and instanced.
 */
export const SUN_DIR = new THREE.Vector3(-0.72, 0.5, -0.36).normalize()
export const FOG_COLOR = new THREE.Color('#cfcfb9')
export const FOG_DENSITY = 0.0042

const GRASS_COUNT: Record<Quality, number> = { low: 9000, medium: 22000, high: 44000 }
const TRAMPLERS = 8

const NOISE_GLSL = /* glsl */ `
  float wcHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float wcNoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(wcHash(i), wcHash(i + vec2(1, 0)), u.x), mix(wcHash(i + vec2(0, 1)), wcHash(i + vec2(1, 1)), u.x), u.y);
  }
  float wcFbm(vec2 p) { float s = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { s += a * wcNoise(p); p *= 2.03; a *= 0.5; } return s; }
`

// ─── colours ─────────────────────────────────────────────────────────────
const C = {
  lush: new THREE.Color('#4c7a2a'),
  lush2: new THREE.Color('#73a03c'),
  dry: new THREE.Color('#a39a58'),
  dirt: new THREE.Color('#7b6246'),
  rock: new THREE.Color('#7f786c'),
  rockDark: new THREE.Color('#5a554d'),
  sand: new THREE.Color('#bdae86'),
  mud: new THREE.Color('#584c3b'),
  moss: new THREE.Color('#5f7f33'),
}

/** Distance to the dirt trail winding from camp to the basin centre. */
function trailDistance(x: number, z: number): number {
  const pts = [[CAMP.x, CAMP.z - 6], [-6, 48], [4, 26], [-3, 6], [8, -14]]
  let best = 1e9
  for (let i = 0; i < pts.length - 1; i += 1) {
    const [ax, az] = pts[i]
    const [bx, bz] = pts[i + 1]
    const dx = bx - ax
    const dz = bz - az
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)))
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t))
  }
  return best + fbm(x * 0.2, z * 0.2, 2, 77) * 1.5
}

export function groundColor(x: number, z: number, out: THREE.Color): THREE.Color {
  const h = heightAt(x, z)
  const n = normalAt(x, z)
  const slope = 1 - n.y
  const r = Math.hypot(x, z)
  const v = fbm(x * 0.045, z * 0.045, 3, 12) * 0.5 + 0.5
  out.copy(C.lush).lerp(C.lush2, v)
  const dryness = smoothstep(0.1, 0.5, fbm(x * 0.018, z * 0.018, 3, 31)) * 0.75
  out.lerp(C.dry, dryness)
  const trail = trailDistance(x, z)
  if (trail < 3.2) out.lerp(C.dirt, (1 - smoothstep(1.2, 3.2, trail)) * 0.85)
  const dc = Math.hypot(x - CAMP.x, z - CAMP.z)
  if (dc < 13) out.lerp(C.dirt, (1 - smoothstep(7, 13, dc)) * 0.7)
  const shore = h - WATER_LEVEL
  if (shore < 1.1) out.lerp(C.sand, 1 - smoothstep(0.3, 1.1, shore))
  if (shore < 0.2) out.lerp(C.mud, 1 - smoothstep(-0.6, 0.2, shore))
  const rockiness = Math.max(smoothstep(0.32, 0.6, slope), smoothstep(92, 118, r) * 0.7)
  if (rockiness > 0) {
    const rc = C.rock.clone().lerp(C.rockDark, fbm(x * 0.08, z * 0.08, 2, 44) * 0.5 + 0.5)
    out.lerp(rc, rockiness)
  }
  return out
}

/**
 * N vertical cards crossed around the Y axis, base at y = 0. `aH` (0 root → 1 tip) drives the
 * grass wind/trample shader; normals lean up-and-out so clumps shade like soft volumes.
 */
function crossCards(n: number, w: number, h: number, spread = 0): THREE.BufferGeometry {
  const pos: number[] = []
  const uv: number[] = []
  const nrm: number[] = []
  const aH: number[] = []
  const idx: number[] = []
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI
    const dx = Math.cos(a) * w * 0.5
    const dz = Math.sin(a) * w * 0.5
    const b = pos.length / 3
    const lean = spread
    // bottom-left, bottom-right, top-left, top-right (top splayed outward by `spread`)
    const px = -Math.sin(a)
    const pz = Math.cos(a)
    pos.push(-dx, 0, -dz, dx, 0, dz, -dx * (1 + lean) + px * lean * 0.3, h, -dz * (1 + lean) + pz * lean * 0.3, dx * (1 + lean) + px * lean * 0.3, h, dz * (1 + lean) + pz * lean * 0.3)
    uv.push(0, 0, 1, 0, 0, 1, 1, 1)
    aH.push(0, 0, 1, 1)
    for (const [x, z] of [[-dx, -dz], [dx, dz], [-dx, -dz], [dx, dz]]) {
      const v = new THREE.Vector3(x, h * 0.9, z).normalize()
      nrm.push(v.x, v.y, v.z)
    }
    idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
  g.setAttribute('aH', new THREE.Float32BufferAttribute(aH, 1))
  g.setIndex(idx)
  return g
}

/** A pine sprig card: the texture's stem runs from u = 0 (trunk) to u = 1 (tip). */
function sprigCard(len: number, width: number, yaw: number, pitch: number, roll: number, y: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(len, width, 2, 1)
  g.translate(len / 2, 0, 0)
  g.rotateX(-Math.PI / 2 + roll)
  // Droop toward the tip.
  const p = g.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < p.count; i += 1) {
    const x = p.getX(i)
    p.setY(i, p.getY(i) - (x / len) * (x / len) * len * 0.18)
  }
  g.rotateZ(pitch)
  g.rotateY(yaw)
  g.translate(0, y, 0)
  // Normals: out from the trunk and upward, like a cone.
  const n = g.attributes.normal as THREE.BufferAttribute
  for (let i = 0; i < p.count; i += 1) {
    const v = new THREE.Vector3(p.getX(i), 0.9, p.getZ(i)).normalize()
    n.setXYZ(i, v.x, v.y, v.z)
  }
  return g
}

/** A leaf-cluster card centred at `p`, facing `dir`, with crown-spherical normals. */
function leafCard(p: THREE.Vector3, dir: THREE.Vector3, size: number, roll: number, crown: THREE.Vector3): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(size, size)
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir)
  g.rotateZ(roll)
  g.applyQuaternion(q)
  g.translate(p.x, p.y, p.z)
  const pos = g.attributes.position as THREE.BufferAttribute
  const n = g.attributes.normal as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i += 1) {
    const v = new THREE.Vector3(pos.getX(i) - crown.x, (pos.getY(i) - crown.y) * 0.8 + 0.6, pos.getZ(i) - crown.z).normalize()
    n.setXYZ(i, v.x, v.y, v.z)
  }
  return g
}

function fogUniforms() {
  return THREE.UniformsUtils.clone(THREE.UniformsLib.fog)
}


export class Environment {
  readonly sun: THREE.DirectionalLight
  readonly hemi: THREE.HemisphereLight
  readonly herbs: { pos: THREE.Vector3; group: THREE.Group; available: boolean; regrow: number }[] = []
  readonly supply = new THREE.Vector3(CAMP.x + 5, 0, CAMP.z + 2)
  readonly campfire = new THREE.Vector3(CAMP.x - 3, 0, CAMP.z - 3)
  readonly waterfallBase = new THREE.Vector3()
  private uTime = { value: 0 }
  private uTramplers = { value: Array.from({ length: TRAMPLERS }, () => new THREE.Vector4(0, -999, 0, 0)) }
  private uWind = { value: new THREE.Vector2(0.8, 0.45) }
  private grass!: THREE.InstancedMesh
  private grassPlaced = 0
  private flowersPlaced = 0
  private flowers!: THREE.InstancedMesh
  private fireLight!: THREE.PointLight
  private flames: THREE.Mesh[] = []
  private mist: THREE.Sprite[] = []
  private birds: { g: THREE.Group; wings: THREE.Mesh[]; r: number; h: number; speed: number; phase: number; cx: number; cz: number }[] = []
  private pollen!: THREE.Points
  private sky!: THREE.Mesh
  private emberT = 0
  private banner?: THREE.Mesh
  private treeSpots: { x: number; z: number; s: number; kind: number }[] = []
  private ferns!: THREE.InstancedMesh
  private tufts!: THREE.InstancedMesh
  private fernsPlaced = 0
  private tuftsPlaced = 0
  private groundUniforms: Record<string, { value: unknown }> | null = null

  constructor(readonly scene: THREE.Scene, quality: Quality) {
    scene.fog = new THREE.FogExp2(FOG_COLOR, FOG_DENSITY)
    scene.background = FOG_COLOR.clone()
    this.hemi = new THREE.HemisphereLight('#b3cdf5', '#5e5132', 1.15)
    scene.add(this.hemi)
    this.sun = new THREE.DirectionalLight('#ffdcaa', 3.1)
    this.sun.castShadow = true
    const cam = this.sun.shadow.camera
    cam.left = -48
    cam.right = 48
    cam.top = 48
    cam.bottom = -48
    cam.near = 1
    cam.far = 260
    this.sun.shadow.bias = -0.0006
    this.sun.shadow.normalBias = 0.04
    scene.add(this.sun, this.sun.target)
    this.buildSky()
    this.buildTerrain()
    this.buildGrass()
    this.buildTrees()
    this.buildUndergrowth()
    this.buildRocks()
    this.buildSpires()
    this.buildMountains()
    this.buildWater()
    this.buildMist()
    this.buildPollen()
    this.buildBirds()
    this.buildCamp()
    this.buildHerbs()
    this.setQuality(quality)
  }

  setQuality(q: Quality): void {
    this.grass.count = Math.min(this.grassPlaced, GRASS_COUNT[q])
    this.flowers.count = Math.min(this.flowersPlaced, q === 'low' ? 1200 : q === 'medium' ? 2600 : 4200)
    this.ferns.count = Math.min(this.fernsPlaced, q === 'low' ? 500 : q === 'medium' ? 1000 : 1400)
    this.tufts.count = Math.min(this.tuftsPlaced, q === 'low' ? 1600 : q === 'medium' ? 3400 : 5200)
    const size = q === 'low' ? 1024 : q === 'medium' ? 2048 : 2048
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size)
      this.sun.shadow.map?.dispose()
      this.sun.shadow.map = null as unknown as THREE.WebGLRenderTarget
    }
    this.pollen.visible = q !== 'low'
    this.mist.forEach((m, i) => (m.visible = q !== 'low' || i % 2 === 0))
  }

  /** Inject shared wind/trample uniforms into a standard material. */
  private windMaterial(mat: THREE.MeshStandardMaterial, mode: 'grass' | 'tree' | 'banner'): THREE.MeshStandardMaterial {
    mat.onBeforeCompile = shader => {
      shader.uniforms.uTime = this.uTime
      shader.uniforms.uTr = this.uTramplers
      shader.uniforms.uWind = this.uWind
      if (mode === 'grass' && !mat.flatShading)
        shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n          normal = normalize(vNormal);')
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform float uTime; uniform vec4 uTr[${TRAMPLERS}]; uniform vec2 uWind;
          ${mode === 'grass' ? 'attribute float aH;' : ''}`,
        )
        .replace(
          '#include <project_vertex>',
          mode === 'grass'
            ? `
          vec4 wp = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
          vec3 ip = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          float gust = sin(uTime * 0.6 + ip.x * 0.02) * 0.5 + 0.5;
          float w = sin(uTime * 1.9 + ip.x * 0.23 + ip.z * 0.17) * 0.6 + sin(uTime * 3.3 + ip.z * 0.41) * 0.25;
          float hh = aH * aH;
          vec2 bend = uWind * (w * 0.22 + gust * 0.28) * hh;
          float flatK = 0.0;
          for (int i = 0; i < ${TRAMPLERS}; i++) {
            vec2 d = ip.xz - uTr[i].xz;
            float dist = length(d);
            float k = (1.0 - smoothstep(uTr[i].w * 0.35, uTr[i].w, dist)) * step(abs(ip.y - uTr[i].y), 4.0);
            bend += (d / max(dist, 0.001)) * k * 0.7 * aH;
            flatK = max(flatK, k);
          }
          wp.xz += bend;
          wp.y -= flatK * 0.55 * aH * (wp.y - ip.y);
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;`
            : mode === 'tree'
              ? `
          vec4 wp = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
          vec3 ip = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          float sway = sin(uTime * 1.1 + ip.x * 0.13 + ip.z * 0.07) * 0.5 + sin(uTime * 2.3 + ip.z * 0.3) * 0.2;
          float hk = max(0.0, wp.y - ip.y) * 0.012;
          wp.xz += uWind * sway * hk * hk * 18.0;
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;`
              : `
          vec3 tb = transformed;
          float wave = sin(uTime * 4.0 + tb.x * 2.5) * 0.18 * clamp(tb.x * 0.6, 0.0, 1.0);
          tb.z += wave;
          vec4 mvPosition = modelViewMatrix * vec4(tb, 1.0);
          gl_Position = projectionMatrix * mvPosition;`,
        )
    }
    return mat
  }

  private buildSky(): void {
    const geo = new THREE.SphereGeometry(1800, 32, 16)
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uSun: { value: SUN_DIR },
        uTop: { value: new THREE.Color('#4f86cc') },
        uHorizon: { value: FOG_COLOR.clone() },
        uGround: { value: new THREE.Color('#8f8a73') },
        uTime: this.uTime,
      },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
      fragmentShader: /* glsl */ `
        varying vec3 vDir; uniform vec3 uSun; uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uGround; uniform float uTime;
        ${NOISE_GLSL}
        void main(){
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.5));
          col = mix(col, uGround, clamp(-h * 5.0, 0.0, 1.0));
          float sd = max(dot(d, uSun), 0.0);
          col += vec3(1.0, 0.78, 0.5) * pow(sd, 5.0) * 0.32;
          col += vec3(1.0, 0.9, 0.7) * pow(sd, 90.0) * 0.8;
          if (h > 0.0) {
            vec2 uv = d.xz / (h + 0.18) * 1.1 + vec2(uTime * 0.006, uTime * 0.002);
            float c = wcFbm(uv * 1.7);
            float cov = smoothstep(0.5, 0.82, c) * smoothstep(0.0, 0.2, h);
            float lit = wcFbm(uv * 1.7 + uSun.xz * 0.08);
            vec3 cc = mix(vec3(0.72, 0.72, 0.76), vec3(1.0, 0.96, 0.9), smoothstep(0.35, 0.8, lit + sd * 0.3));
            cc += vec3(1.0, 0.75, 0.45) * pow(sd, 8.0) * 0.5;
            col = mix(col, cc, cov * 0.85);
          }
          col += vec3(1.0, 0.96, 0.88) * smoothstep(0.99955, 0.9998, sd) * 6.0;
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    })
    this.sky = new THREE.Mesh(geo, mat)
    this.sky.frustumCulled = false
    this.sky.renderOrder = -10
    this.scene.add(this.sky)
  }

  private buildTerrain(): void {
    const geo = new THREE.PlaneGeometry(WORLD.size, WORLD.size, WORLD.segments, WORLD.segments)
    geo.rotateX(-Math.PI / 2)
    const pos = geo.attributes.position as THREE.BufferAttribute
    const colors = new Float32Array(pos.count * 3)
    const splat = new Float32Array(pos.count * 4)
    const c = new THREE.Color()
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      const h = heightAt(x, z)
      pos.setY(i, h)
      const n = normalAt(x, z)
      const slope = 1 - n.y
      const r = Math.hypot(x, z)
      const trail = trailDistance(x, z)
      const dc = Math.hypot(x - CAMP.x, z - CAMP.z)
      const shore = h - WATER_LEVEL
      // Layer masks: x = packed dirt (trail/camp/shore), y = leaf litter (forest ring),
      // z = rock (slopes, outer ridges). The remainder is the grass-and-stone meadow base.
      let dirt = Math.max(1 - smoothstep(1.0, 3.4, trail), (1 - smoothstep(6, 13, dc)) * 0.9, 1 - smoothstep(0.2, 1.3, shore))
      dirt = Math.max(dirt, smoothstep(0.25, 0.6, fbm(x * 0.05, z * 0.05, 3, 71)) * 0.55)
      const leaves = smoothstep(74, 96, r) * (0.55 + 0.45 * smoothstep(-0.2, 0.3, fbm(x * 0.04, z * 0.04, 2, 5)))
      const rock = Math.max(smoothstep(0.3, 0.55, slope), smoothstep(100, 124, r) * 0.8)
      splat[i * 4] = dirt
      splat[i * 4 + 1] = leaves * (1 - rock)
      splat[i * 4 + 2] = rock
      splat[i * 4 + 3] = 0
      // Macro tint: a gentle hue shift from the painted zone colour, kept near white so the
      // photographic layers carry the detail.
      groundColor(x, z, c)
      const lum = (c.r + c.g + c.b) / 3 || 1
      c.setRGB(c.r / lum, c.g / lum, c.b / lum).lerp(new THREE.Color(1, 1, 1), 0.55)
      if (shore < 0.25) c.multiplyScalar(0.72 + 0.28 * smoothstep(-0.6, 0.25, shore))
      colors[i * 3] = c.r
      colors[i * 3 + 1] = c.g
      colors[i * 3 + 2] = c.b
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geo.setAttribute('aSplat', new THREE.BufferAttribute(splat, 4))
    geo.computeVertexNormals()
    const layers = ['grassrock', 'forest', 'leaves', 'rocks'].map(k => [envTexture(`tex.ground_${k}_d`), envTexture(`tex.ground_${k}_n`)])
    const u = {
      uG0: { value: layers[0][0] }, uG1: { value: layers[1][0] }, uG2: { value: layers[2][0] }, uG3: { value: layers[3][0] },
      uN0: { value: layers[0][1] }, uN1: { value: layers[1][1] }, uN2: { value: layers[2][1] }, uN3: { value: layers[3][1] },
      uTiles: { value: new THREE.Vector4(1 / 7, 1 / 4.5, 1 / 4, 1 / 6) },
      uMeadowTint: { value: new THREE.Color('#a9c77a') },
    }
    this.groundUniforms = u
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, metalness: 0, envMapIntensity: 0.22 })
    mat.customProgramCacheKey = () => 'splatTerrain'
    mat.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, u)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 aSplat;\nvarying vec4 vSplat;\nvarying vec3 vWp;\nvarying vec3 vTn;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvSplat = aSplat;\nvTn = normalize(mat3(modelMatrix) * objectNormal);')
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
varying vec4 vSplat; varying vec3 vWp; varying vec3 vTn;
uniform sampler2D uG0, uG1, uG2, uG3, uN0, uN1, uN2, uN3;
uniform vec4 uTiles; uniform vec3 uMeadowTint;
${NOISE_GLSL}
vec4 splatW; float farK;
vec2 rot(vec2 p) { return vec2(p.x * 0.8 - p.y * 0.6, p.x * 0.6 + p.y * 0.8); }
// Two scales, the far one rotated, cross-faded by distance to hide tiling.
vec3 layer(sampler2D t, float tile) {
  vec2 uv = vWp.xz * tile;
  vec3 a = texture2D(t, uv).rgb;
  vec3 b = texture2D(t, rot(uv) * 0.23 + 0.37).rgb;
  return mix(mix(a, b, 0.3), b, farK);
}
vec3 layerN(sampler2D t, float tile) {
  vec2 uv = vWp.xz * tile;
  return mix(texture2D(t, uv).xyz, texture2D(t, rot(uv) * 0.23 + 0.37).xyz, farK) * 2.0 - 1.0;
}`,
        )
        .replace(
          '#include <map_fragment>',
          `{
  farK = smoothstep(18.0, 90.0, length(vWp - cameraPosition));
  vec4 m = clamp(vSplat, 0.0, 1.0);
  // Break mask edges with noise so layer borders read as organic patches.
  float bn = wcNoise(vWp.xz * 0.35) * 0.5 + wcNoise(vWp.xz * 1.3) * 0.3 - 0.4;
  m = clamp(m + vec4(bn, bn * 0.7, bn * 0.6, 0.0) * 0.55 * step(0.02, m), 0.0, 1.0);
  float wBase = max(0.0, 1.0 - m.x - m.y - m.z);
  splatW = vec4(wBase, m.x, m.y, m.z);
  splatW /= max(dot(splatW, vec4(1.0)), 0.001);
  vec3 g0 = layer(uG0, uTiles.x) * uMeadowTint * 1.35;
  vec3 g1 = layer(uG1, uTiles.y) * 0.95;
  vec3 g2 = layer(uG2, uTiles.z) * 0.9;
  vec3 g3 = layer(uG3, uTiles.w) * 1.2;
  vec3 col = g0 * splatW.x + g1 * splatW.y + g2 * splatW.z + g3 * splatW.w;
  float macro = wcFbm(vWp.xz * 0.018) * 0.35 + 0.82;
  diffuseColor.rgb *= col * macro;
}`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `{
  vec3 tn = layerN(uN0, uTiles.x) * splatW.x + layerN(uN1, uTiles.y) * splatW.y + layerN(uN2, uTiles.z) * splatW.z + layerN(uN3, uTiles.w) * splatW.w;
  vec3 gn = normalize(vTn);
  vec3 wn = normalize(gn + vec3(tn.x, 0.0, -tn.y) * 0.85 * (1.0 - farK * 0.6));
  normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
}`,
        )
    }
    const mesh = new THREE.Mesh(geo, mat)
    mesh.receiveShadow = true
    mesh.name = 'terrain'
    this.scene.add(mesh)
  }

  /** Swap the ground layers to the full-resolution set once it has streamed in. */
  upgradeGround(): void {
    if (!this.groundUniforms) return
    const k = ['grassrock', 'forest', 'leaves', 'rocks']
    const u = this.groundUniforms as Record<string, { value: THREE.Texture }>
    k.forEach((name, i) => {
      u[`uG${i}`].value = envTexture(`tex.hi.ground_${name}_d`)
      u[`uN${i}`].value = envTexture(`tex.hi.ground_${name}_n`)
    })
  }

  private buildGrass(): void {
    const random = rng(1337)
    // A clump of seven tapered, curved blades; aH = 0 at the root, 1 at the tip.
    const blades: THREE.BufferGeometry[] = []
    for (let b = 0; b < 7; b += 1) {
      const h = 0.3 + random() * 0.32
      const w = 0.028 + random() * 0.02
      const lean = (random() - 0.5) * 0.6
      const g = new THREE.BufferGeometry()
      const k1 = 0.4
      const k2 = 0.75
      const verts = [-w, 0, 0, w, 0, 0, -w * 0.8, h * k1, lean * k1 * k1, w * 0.8, h * k1, lean * k1 * k1, -w * 0.45, h * k2, lean * k2 * k2, w * 0.45, h * k2, lean * k2 * k2, 0, h, lean]
      const aH = [0, 0, k1, k1, k2, k2, 1]
      g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
      g.setAttribute('aH', new THREE.Float32BufferAttribute(aH, 1))
      g.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4, 4, 5, 6])
      g.rotateY((b / 7) * Math.PI * 2 + random() * 0.5)
      g.translate((random() - 0.5) * 0.28, 0, (random() - 0.5) * 0.28)
      blades.push(g)
    }
    const clump = mergeGeometries(blades)
    const n = clump.attributes.position.count
    const normals = new Float32Array(n * 3)
    const colors = new Float32Array(n * 3)
    const base = new THREE.Color('#26401a')
    const tip = new THREE.Color('#c2d67a')
    const cc = new THREE.Color()
    for (let i = 0; i < n; i += 1) {
      normals[i * 3 + 1] = 1
      const h = clump.attributes.aH.getX(i)
      cc.copy(base).lerp(tip, h)
      colors[i * 3] = cc.r
      colors[i * 3 + 1] = cc.g
      colors[i * 3 + 2] = cc.b
    }
    clump.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
    clump.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    const mat = this.windMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }), 'grass')
    const max = GRASS_COUNT.high
    this.grass = new THREE.InstancedMesh(clump, mat, max)
    this.grass.receiveShadow = true
    this.grass.frustumCulled = false
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const s = new THREE.Vector3()
    const p = new THREE.Vector3()
    const col = new THREE.Color()
    const Y = new THREE.Vector3(0, 1, 0)
    let placed = 0
    let tries = 0
    while (placed < max && tries < max * 6) {
      tries += 1
      const a = random() * Math.PI * 2
      const r = Math.sqrt(random()) * (WORLD.arena + 10)
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r
      const h = heightAt(x, z)
      if (h < WATER_LEVEL + 0.15) continue
      const nrm = normalAt(x, z)
      if (nrm.y < 0.8) continue
      if (Math.hypot(x - CAMP.x, z - CAMP.z) < 7) continue
      if (trailDistance(x, z) < 1.4) continue
      // Patchy meadows: thin out by noise so the ground shows through.
      const density = fbm(x * 0.07, z * 0.07, 2, 5) * 0.5 + 0.6
      if (random() > density) continue
      let blocked = false
      for (const o of OBSTACLES) if (o.kind !== 'tree' && Math.hypot(o.x - x, o.z - z) < o.r + 0.3) blocked = true
      if (blocked) continue
      p.set(x, h - 0.03, z)
      q.setFromAxisAngle(Y, random() * Math.PI * 2)
      const sc = 0.7 + random() * 0.7 * (0.6 + density * 0.5)
      s.set(sc, sc * (0.8 + random() * 0.5), sc)
      m.compose(p, q, s)
      this.grass.setMatrixAt(placed, m)
      groundColor(x, z, col)
      col.lerp(new THREE.Color('#ffffff'), 0.35).multiplyScalar(1.25 + random() * 0.2)
      this.grass.setColorAt(placed, col)
      placed += 1
    }
    this.grass.count = placed
    this.grassPlaced = placed
    this.scene.add(this.grass)

    // Wildflowers: crossed photographic cards (daisies, buttercups, clover).
    const flowerGeo = crossCards(2, 0.55, 0.5)
    const fmat = this.cardMaterial(envTexture('foliage.flowers'), 'grass')
    const fmax = 4200
    this.flowers = new THREE.InstancedMesh(flowerGeo, fmat, fmax)
    this.flowers.frustumCulled = false
    let fp = 0
    tries = 0
    while (fp < fmax && tries < fmax * 10) {
      tries += 1
      const cx = (random() - 0.5) * 150
      const cz = (random() - 0.5) * 150
      // Flowers grow in drifts.
      const patch = fbm(cx * 0.05, cz * 0.05, 2, 91)
      if (patch < 0.15) continue
      const h = heightAt(cx, cz)
      if (h < WATER_LEVEL + 0.3 || Math.hypot(cx, cz) > WORLD.arena) continue
      if (normalAt(cx, cz).y < 0.86 || trailDistance(cx, cz) < 1.5) continue
      p.set(cx, h, cz)
      q.setFromAxisAngle(Y, random() * 6.28)
      const sc = 0.8 + random() * 0.6
      s.set(sc, sc, sc)
      m.compose(p, q, s)
      this.flowers.setMatrixAt(fp, m)
      this.flowers.setColorAt(fp, col.setRGB(1, 1, 1).multiplyScalar(0.85 + random() * 0.3))
      fp += 1
    }
    this.flowers.count = fp
    this.flowersPlaced = fp
    this.scene.add(this.flowers)
  }

  /** Alpha-tested foliage card material with wind, soft (non-flipped) normals and hue jitter. */
  private cardMaterial(map: THREE.Texture, mode: 'grass' | 'tree'): THREE.MeshStandardMaterial {
    const mat = this.windMaterial(
      new THREE.MeshStandardMaterial({ map, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.82, metalness: 0, envMapIntensity: 0.18 }),
      mode,
    )
    const prev = mat.onBeforeCompile
    mat.onBeforeCompile = (sh, r) => {
      prev.call(mat, sh, r)
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n          normal = normalize(vNormal);')
      // Cheap translucency: foliage lit from behind glows a little.
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n          totalEmissiveRadiance += diffuseColor.rgb * 0.07;',
      )
    }
    mat.customProgramCacheKey = () => `card-${mode}`
    return mat
  }

  private buildTrees(): void {
    const random = rng(777)
    const barkMat = this.windMaterial(pbrMaterial(envTexture('tex.bark_d'), envTexture('tex.bark_n'), { color: '#d8cbb8', roughness: 0.95, env: 0.15 }), 'tree')
    const pineMat = this.cardMaterial(envTexture('foliage.leaf_pine'), 'tree')
    const broadMat = this.cardMaterial(envTexture('foliage.leaf_broad'), 'tree')
    const trunkGeo = (h: number, r0: number, r1: number, bend: number) => {
      const g = new THREE.CylinderGeometry(r1, r0, h, 10, 8, true)
      g.translate(0, h / 2, 0)
      const pos = g.attributes.position as THREE.BufferAttribute
      const uv = g.attributes.uv as THREE.BufferAttribute
      for (let i = 0; i < pos.count; i += 1) {
        const y = pos.getY(i)
        const k = y / h
        pos.setX(i, pos.getX(i) + Math.sin(k * 2.2) * bend * k)
        // Root flare.
        const flare = 1 + Math.max(0, 0.12 - k) * 5
        pos.setX(i, pos.getX(i) * flare)
        pos.setZ(i, pos.getZ(i) * flare)
        uv.setXY(i, uv.getX(i) * 2, (y / 2.4) * 1)
      }
      g.computeVertexNormals()
      return g
    }
    // Conifer: tiers of drooping pine sprigs, each a pair of rolled cards.
    const pineParts: THREE.BufferGeometry[] = []
    const tiers = 9
    for (let t = 0; t < tiers; t += 1) {
      const k = t / (tiers - 1)
      const y = 2.0 + k * 8.4
      const len = 3.1 * (1 - k) + 0.7
      const n = Math.max(4, Math.round(8 - k * 3))
      for (let i = 0; i < n; i += 1) {
        const yaw = (i / n) * Math.PI * 2 + t * 0.7 + random() * 0.4
        for (const roll of [0.5, -0.5]) pineParts.push(sprigCard(len, len * 0.5, yaw, -0.28 - k * 0.1 - random() * 0.12, roll, y))
      }
    }
    for (let i = 0; i < 3; i += 1) pineParts.push(sprigCard(1.3, 0.8, (i / 3) * Math.PI, 1.2, 0, 10.0))
    const pineCanopy = mergeGeometries(pineParts)
    // Broadleaf: leaf clusters on the surface of several blobs; normals point out of the crown.
    const broadParts: THREE.BufferGeometry[] = []
    const crown = new THREE.Vector3(0, 6.4, 0)
    const blobs = Array.from({ length: 6 }, (_, i) => {
      const a = (i / 6) * Math.PI * 2 + random()
      return new THREE.Vector3(Math.cos(a) * 1.6, 5.6 + random() * 2.2, Math.sin(a) * 1.6)
    })
    blobs.push(new THREE.Vector3(0, 7.8, 0))
    for (const c of blobs)
      for (let i = 0; i < 8; i += 1) {
        const d = new THREE.Vector3(random() - 0.5, random() - 0.3, random() - 0.5).normalize()
        const p0 = c.clone().addScaledVector(d, 1.2 + random() * 0.9)
        broadParts.push(leafCard(p0, d, 2.0 + random() * 0.9, random() * 6.28, crown))
      }
    const broadCanopy = mergeGeometries(broadParts)
    const pineTrunk = trunkGeo(10.5, 0.36, 0.06, 0.15)
    const broadTrunkParts = [trunkGeo(6.2, 0.42, 0.2, 0.3)]
    for (let i = 0; i < 4; i += 1) {
      const br = new THREE.CylinderGeometry(0.06, 0.13, 2.6, 6, 1, true)
      br.translate(0, 1.3, 0)
      br.rotateZ(0.8 + random() * 0.3)
      br.rotateY((i / 4) * Math.PI * 2 + random())
      br.translate(0, 4.3 + random() * 1.2, 0)
      broadTrunkParts.push(br)
    }
    const broadTrunk = mergeGeometries(broadTrunkParts.map(g => (g.index ? g.toNonIndexed() : g)))
    broadTrunk.computeVertexNormals()

    const spots: { x: number; z: number; s: number; kind: number }[] = []
    for (const o of OBSTACLES) if (o.kind === 'tree') spots.push({ x: o.x, z: o.z, s: 0.9 + random() * 0.5, kind: random() > 0.45 ? 0 : 1 })
    let tries = 0
    while (spots.length < 720 && tries < 9000) {
      tries += 1
      const a = random() * Math.PI * 2
      const r = 86 + random() * 80
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r
      const h = heightAt(x, z)
      if (h > 58 || normalAt(x, z).y < 0.62) continue
      if (fbm(x * 0.03, z * 0.03, 2, 3) < -0.25) continue
      const wf = waterfallLine()
      if (Math.hypot(x - wf.top.x, z - wf.top.z) < 14) continue
      spots.push({ x, z, s: 0.8 + random() * 0.9, kind: random() > 0.3 ? 0 : 1 })
    }
    this.treeSpots = spots
    const conifers = spots.filter(s => s.kind === 0)
    const broads = spots.filter(s => s.kind === 1)
    const tint = new THREE.Color()
    const make = (geo: THREE.BufferGeometry, mat: THREE.Material, list: typeof spots, seed: number, shadow: boolean, hue: [string, string] | null) => {
      const rr = rng(seed)
      const mesh = new THREE.InstancedMesh(geo, mat, list.length)
      const m = new THREE.Matrix4()
      const q = new THREE.Quaternion()
      const sv = new THREE.Vector3()
      list.forEach((sp, i) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rr() * 6.28)
        sv.set(sp.s, sp.s * (0.85 + rr() * 0.35), sp.s)
        m.compose(new THREE.Vector3(sp.x, heightAt(sp.x, sp.z) - 0.25, sp.z), q, sv)
        mesh.setMatrixAt(i, m)
        if (hue) mesh.setColorAt(i, tint.set(hue[0]).lerp(new THREE.Color(hue[1]), rr()))
      })
      mesh.castShadow = shadow
      mesh.receiveShadow = true
      mesh.computeBoundingSphere()
      this.scene.add(mesh)
      return mesh
    }
    // Same seeds per species so canopies and trunks share transforms.
    make(pineTrunk, barkMat, conifers, 11, true, null)
    make(pineCanopy, pineMat, conifers, 11, true, ['#c9d8b4', '#f4f8e8'])
    make(broadTrunk, barkMat, broads, 12, true, null)
    make(broadCanopy, broadMat, broads, 12, true, ['#b9c99a', '#eef0cc'])
  }

  /** Ferns and tall grass tufts in the meadow margins and under the trees. */
  private buildUndergrowth(): void {
    const random = rng(4242)
    const fernGeo = crossCards(3, 1.25, 0.95, 0.35)
    const tuftGeo = crossCards(2, 0.95, 0.75)
    const fernMat = this.cardMaterial(envTexture('foliage.fern'), 'grass')
    const tuftMat = this.cardMaterial(envTexture('foliage.grass_clump'), 'grass')
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const sv = new THREE.Vector3()
    const col = new THREE.Color()
    const scatter = (mesh: THREE.InstancedMesh, max: number, pick: () => [number, number] | null, size: [number, number], tintA: string) => {
      let n = 0
      let tries = 0
      while (n < max && tries < max * 12) {
        tries += 1
        const xz = pick()
        if (!xz) continue
        const [x, z] = xz
        const h = heightAt(x, z)
        if (h < WATER_LEVEL + 0.2 || normalAt(x, z).y < 0.78) continue
        if (Math.hypot(x - CAMP.x, z - CAMP.z) < 8 || trailDistance(x, z) < 1.6) continue
        if (OBSTACLES.some(o => o.kind !== 'tree' && Math.hypot(o.x - x, o.z - z) < o.r * 0.9)) continue
        const sc = size[0] + random() * (size[1] - size[0])
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), random() * 6.28)
        sv.set(sc, sc * (0.85 + random() * 0.3), sc)
        m.compose(new THREE.Vector3(x, h - 0.04, z), q, sv)
        mesh.setMatrixAt(n, m)
        mesh.setColorAt(n, col.set(tintA).multiplyScalar(0.85 + random() * 0.3))
        n += 1
      }
      mesh.count = n
      mesh.frustumCulled = false
      mesh.receiveShadow = true
      this.scene.add(mesh)
      return n
    }
    this.ferns = new THREE.InstancedMesh(fernGeo, fernMat, 1400)
    const trees = this.treeSpots
    const rocks = OBSTACLES.filter(o => o.kind === 'boulder')
    this.fernsPlaced = scatter(
      this.ferns,
      1400,
      () => {
        const u = random()
        if (u < 0.55 && trees.length) {
          const t = trees[Math.floor(random() * trees.length)]
          const a = random() * 6.28
          const r = 1 + random() * 4
          return [t.x + Math.cos(a) * r, t.z + Math.sin(a) * r]
        }
        if (u < 0.8 && rocks.length) {
          const o = rocks[Math.floor(random() * rocks.length)]
          const a = random() * 6.28
          const r = o.r + 0.3 + random() * 1.6
          return [o.x + Math.cos(a) * r, o.z + Math.sin(a) * r]
        }
        const a = random() * 6.28
        const r = 60 + random() * 40
        return [Math.cos(a) * r, Math.sin(a) * r]
      },
      [0.7, 1.4],
      '#eef5dc',
    )
    this.tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, 5200)
    this.tuftsPlaced = scatter(
      this.tufts,
      5200,
      () => {
        const a = random() * 6.28
        const r = Math.sqrt(random()) * (WORLD.arena + 8)
        const x = Math.cos(a) * r
        const z = Math.sin(a) * r
        return fbm(x * 0.06, z * 0.06, 2, 17) > -0.05 ? [x, z] : null
      },
      [0.6, 1.2],
      '#f2f6e0',
    )
  }

  private rockGeometry(seed: number, detail = 1): THREE.BufferGeometry {
    const random = rng(seed)
    const g = new THREE.IcosahedronGeometry(1, detail)
    const pos = g.attributes.position as THREE.BufferAttribute
    const map = new Map<string, number>()
    for (let i = 0; i < pos.count; i += 1) {
      const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`
      let k = map.get(key)
      if (k === undefined) {
        k = 0.75 + random() * 0.5
        map.set(key, k)
      }
      pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * 0.8, pos.getZ(i) * k)
    }
    g.computeVertexNormals()
    const colors = new Float32Array(pos.count * 3)
    const c = new THREE.Color()
    const n = g.attributes.normal
    for (let i = 0; i < pos.count; i += 1) {
      c.copy(C.rock).lerp(C.rockDark, random() * 0.5)
      if (n.getY(i) > 0.55) c.lerp(C.moss, 0.65)
      colors[i * 3] = c.r
      colors[i * 3 + 1] = c.g
      colors[i * 3 + 2] = c.b
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    g.deleteAttribute('uv')
    return g
  }

  private buildRocks(): void {
    const random = rng(99)
    const keys = ['rockmoss_0', 'rockmoss_1', 'rockmoss_2', 'rockmoss_3', 'rockmoss_4', 'rockmoss_5']
    const catalog = keys.map(k => bakedGeometry(`model.${k}`)).filter((g): g is THREE.BufferGeometry => !!g)
    const useCatalog = catalog.length > 0
    const variants = useCatalog ? catalog : [this.rockGeometry(1), this.rockGeometry(2), this.rockGeometry(3)]
    const mat = useCatalog
      ? pbrMaterial(envTexture('tex.rock_moss_d'), envTexture('tex.rock_moss_n'), { roughness: 0.9, normalScale: 1.1, env: 0.25 })
      : triplanarRock(envTexture('tex.rock_face1_d'), envTexture('tex.rock_face1_n'), { tile: 3, mossMap: envTexture('tex.moss'), moss: 0.8 })
    if (!useCatalog) mat.vertexColors = true
    // The scanned mossy-rock albedo is very dark; lift it to sit with the meadow's exposure.
    else mat.color.setRGB(2.3, 2.25, 2.1)
    // Footprint half-width of each variant, so obstacle radii map to real rock sizes.
    const half = variants.map(g => {
      g.computeBoundingBox()
      const b = g.boundingBox!
      return { r: Math.max(0.1, (b.max.x - b.min.x + b.max.z - b.min.z) / 4), h: Math.max(0.1, b.max.y - b.min.y) }
    })
    const lists: THREE.Matrix4[][] = variants.map(() => [])
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()
    for (const o of OBSTACLES) {
      if (o.kind !== 'boulder') continue
      const vi = Math.floor(random() * variants.length)
      e.set((random() - 0.5) * 0.25, random() * 6.28, (random() - 0.5) * 0.25)
      q.setFromEuler(e)
      const sxz = (o.r * 1.15) / half[vi].r
      const sy = Math.max(sxz * 0.6, (o.h * 1.1) / half[vi].h)
      lists[vi].push(new THREE.Matrix4().compose(new THREE.Vector3(o.x, heightAt(o.x, o.z) - 0.35 * sy * 0.3, o.z), q, new THREE.Vector3(sxz, sy, sxz)))
    }
    for (let i = 0; i < 300; i += 1) {
      const a = random() * 6.28
      const r = 10 + random() * 105
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r
      if (Math.hypot(x - CAMP.x, z - CAMP.z) < 10) continue
      if (heightAt(x, z) < WATER_LEVEL - 0.4) continue
      const vi = i % variants.length
      const size = 0.12 + random() * random() * 0.9
      const sc = size / half[vi].r
      e.set((random() - 0.5) * 0.6, random() * 6.28, (random() - 0.5) * 0.6)
      q.setFromEuler(e)
      lists[vi].push(new THREE.Matrix4().compose(new THREE.Vector3(x, heightAt(x, z) - size * 0.25, z), q, new THREE.Vector3(sc, sc * (0.7 + random() * 0.5), sc)))
    }
    variants.forEach((geo, vi) => {
      const mesh = new THREE.InstancedMesh(geo, mat, lists[vi].length)
      lists[vi].forEach((m, i) => mesh.setMatrixAt(i, m))
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.computeBoundingSphere()
      this.scene.add(mesh)
    })
    this.buildProps(random)
  }

  /** Fallen logs and old stumps around the forest edge (decorative, outside the arena floor). */
  private buildProps(random: () => number): void {
    const wf = waterfallLine()
    const place = (key: string, texKey: string, count: number, size: number, rMin: number, rMax: number, lie: boolean) => {
      const geo = bakedGeometry(`model.${key}`)
      if (!geo) return
      geo.computeBoundingBox()
      const b = geo.boundingBox!
      const span = Math.max(b.max.x - b.min.x, b.max.z - b.min.z)
      const mat = pbrMaterial(envTexture(`tex.${texKey}_d`), envTexture(`tex.${texKey}_n`), { color: '#e2d8c8', roughness: 0.92, env: 0.2 })
      const mats: THREE.Matrix4[] = []
      const q = new THREE.Quaternion()
      let tries = 0
      while (mats.length < count && tries < count * 40) {
        tries += 1
        const a = random() * 6.28
        const r = rMin + random() * (rMax - rMin)
        const x = Math.cos(a) * r
        const z = Math.sin(a) * r
        if (Math.hypot(x - CAMP.x, z - CAMP.z) < 14 || Math.hypot(x - wf.top.x, z - wf.top.z) < 12) continue
        const h = heightAt(x, z)
        if (h < WATER_LEVEL + 0.3 || normalAt(x, z).y < 0.8) continue
        if (OBSTACLES.some(o => Math.hypot(o.x - x, o.z - z) < o.r + 2)) continue
        const sc = (size * (0.8 + random() * 0.5)) / span
        q.setFromEuler(new THREE.Euler(lie ? (random() - 0.5) * 0.08 : 0, random() * 6.28, 0))
        mats.push(new THREE.Matrix4().compose(new THREE.Vector3(x, h - 0.12, z), q, new THREE.Vector3(sc, sc, sc)))
      }
      const mesh = new THREE.InstancedMesh(geo, mat, mats.length)
      mats.forEach((m, i) => mesh.setMatrixAt(i, m))
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.computeBoundingSphere()
      this.scene.add(mesh)
    }
    place('stump_0', 'stump', 16, 1.7, 58, 100, false)
    place('log_0', 'log', 12, 5.5, 55, 98, true)
  }

  private buildSpires(): void {
    const mat = triplanarRock(envTexture('tex.rock_face1_d'), envTexture('tex.rock_face1_n'), { tile: 5.5, color: '#d6dade', mossMap: envTexture('tex.moss'), moss: 0.9 })
    mat.vertexColors = true
    SPIRES.forEach((sp, si) => {
      const random = rng(500 + si)
      const base = heightAt(sp.x, sp.z) - 2
      const H = sp.h + 2.5
      const col = new THREE.CylinderGeometry(1, 1, H, 40, 26, true)
      col.deleteAttribute('uv')
      col.deleteAttribute('normal')
      const pos = col.attributes.position as THREE.BufferAttribute
      const ledgeCount = 4 + Math.floor(random() * 3)
      const seed = 600 + si * 7
      for (let v = 0; v < pos.count; v += 1) {
        const x0 = pos.getX(v)
        const z0 = pos.getZ(v)
        const k = (pos.getY(v) + H / 2) / H
        const ang = Math.atan2(z0, x0)
        // Tapered, ledged column: terraces every 1/ledgeCount of the height, noisy strata.
        const ledge = k * ledgeCount
        const step = Math.floor(ledge) + smoothstep(0.75, 1, ledge - Math.floor(ledge))
        let r = sp.r * (1.18 - (step / ledgeCount) * 0.52)
        const n1 = fbm(Math.cos(ang) * 1.7 + si, k * 3.2 + Math.sin(ang) * 1.7, 4, seed)
        const n2 = fbm(Math.cos(ang) * 5 + k * 11, Math.sin(ang) * 5 - k * 7, 3, seed + 3)
        r *= 1 + n1 * 0.22 + n2 * 0.07
        r *= 1 + (k < 0.12 ? (0.12 - k) * 2.2 : 0)
        pos.setXYZ(v, Math.cos(ang) * r, base + k * H, Math.sin(ang) * r)
      }
      const cap = new THREE.SphereGeometry(1, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2)
      cap.deleteAttribute('uv')
      cap.deleteAttribute('normal')
      const cp = cap.attributes.position as THREE.BufferAttribute
      const topR = sp.r * (1.18 - 0.52) * 1.02
      for (let v = 0; v < cp.count; v += 1) {
        const x0 = cp.getX(v)
        const y0 = cp.getY(v)
        const z0 = cp.getZ(v)
        const n = 1 + fbm(x0 * 2 + si, z0 * 2, 3, seed + 9) * 0.25
        cp.setXYZ(v, x0 * topR * n, base + H + y0 * sp.r * 0.28 * n - 0.3, z0 * topR * n)
      }
      let geo = mergeGeometries([col, cap])
      geo = mergeVertices(geo, 0.05)
      geo.computeVertexNormals()
      const p2 = geo.attributes.position
      const nrm = geo.attributes.normal
      const colors = new Float32Array(p2.count * 3)
      const c = new THREE.Color()
      const bandA = new THREE.Color('#fff4e6')
      const bandB = new THREE.Color('#b5a898')
      for (let v = 0; v < p2.count; v += 1) {
        const y = p2.getY(v)
        c.copy(bandA).lerp(bandB, (Math.sin(y * 0.9 + si * 2) * 0.5 + 0.5) * 0.6)
        if (y < base + 3.5) c.multiplyScalar(0.85)
        void nrm
        colors[v * 3] = c.r
        colors[v * 3 + 1] = c.g
        colors[v * 3 + 2] = c.b
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(sp.x, 0, sp.z)
      mesh.rotation.y = random() * 6.28
      mesh.castShadow = true
      mesh.receiveShadow = true
      this.scene.add(mesh)
    })
  }

  private buildMountains(): void {
    const seg = 260
    const rings = 9
    const positions: number[] = []
    const colors: number[] = []
    const idx: number[] = []
    const c = new THREE.Color()
    const grass = new THREE.Color('#7f9a64')
    const rock = new THREE.Color('#aab0b6')
    const far = new THREE.Color('#b4c2d2')
    const snow = new THREE.Color('#ffffff')
    for (let j = 0; j < rings; j += 1) {
      const t = j / (rings - 1)
      const r = 190 + t * 380
      for (let i = 0; i <= seg; i += 1) {
        const a = (i / seg) * Math.PI * 2
        const x = Math.cos(a) * r
        const z = Math.sin(a) * r
        const ridge = 1 - Math.abs(fbm(Math.cos(a) * 3 + t * 2, Math.sin(a) * 3 + t * 2, 5, 61))
        const hMax = 60 + ridge * ridge * 150 + fbm(a * 4, t * 3, 4, 8) * 30
        const h = 30 + hMax * Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5) * (1 - Math.max(0, t - 0.8) * 2)
        positions.push(x, h, z)
        c.copy(grass).lerp(rock, smoothstep(45, 95, h)).lerp(far, t * 0.8)
        if (h > 140) c.lerp(snow, Math.min(1, (h - 140) / 35))
        colors.push(c.r, c.g, c.b)
      }
    }
    for (let j = 0; j < rings - 1; j += 1) {
      for (let i = 0; i < seg; i += 1) {
        const a = j * (seg + 1) + i
        const b = a + seg + 1
        idx.push(a, b, a + 1, a + 1, b, b + 1)
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geo.setIndex(idx)
    geo.computeVertexNormals()
    const mat = triplanarRock(envTexture('tex.rock_face1_d'), envTexture('tex.rock_face1_n'), { tile: 28, color: '#ffffff' })
    mat.vertexColors = true
    mat.envMapIntensity = 0.15
    this.scene.add(new THREE.Mesh(geo, mat))
  }

  private buildWater(): void {
    const size = LAKE.r * 2.8
    const geo = new THREE.PlaneGeometry(size, size, 90, 90)
    geo.rotateX(-Math.PI / 2)
    geo.translate(LAKE.x, WATER_LEVEL, LAKE.z)
    const pos = geo.attributes.position
    const depth = new Float32Array(pos.count)
    for (let i = 0; i < pos.count; i += 1) depth[i] = WATER_LEVEL - heightAt(pos.getX(i), pos.getZ(i))
    geo.setAttribute('aDepth', new THREE.BufferAttribute(depth, 1))
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        ...fogUniforms(),
        uTime: this.uTime,
        uSun: { value: SUN_DIR },
        uDeep: { value: new THREE.Color('#1c4a55') },
        uShallow: { value: new THREE.Color('#5b9a8e') },
        uSky: { value: new THREE.Color('#b9d0e2') },
      },
      vertexShader: /* glsl */ `
        attribute float aDepth; varying float vDepth; varying vec3 vWp;
        #include <fog_pars_vertex>
        void main(){
          vDepth = aDepth; vWp = (modelMatrix * vec4(position, 1.0)).xyz;
          vec4 mvPosition = viewMatrix * vec4(vWp, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform vec3 uSun; uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uSky;
        varying float vDepth; varying vec3 vWp;
        #include <fog_pars_fragment>
        ${NOISE_GLSL}
        void main(){
          if (vDepth < -0.05) discard;
          vec2 p = vWp.xz;
          float e = 0.35;
          float h0 = wcFbm(p * 0.35 + vec2(uTime * 0.15, uTime * 0.09)) + wcFbm(p * 1.1 - vec2(uTime * 0.25, -uTime * 0.2)) * 0.4;
          float hx = wcFbm((p + vec2(e, 0.0)) * 0.35 + vec2(uTime * 0.15, uTime * 0.09)) + wcFbm((p + vec2(e, 0.0)) * 1.1 - vec2(uTime * 0.25, -uTime * 0.2)) * 0.4;
          float hz = wcFbm((p + vec2(0.0, e)) * 0.35 + vec2(uTime * 0.15, uTime * 0.09)) + wcFbm((p + vec2(0.0, e)) * 1.1 - vec2(uTime * 0.25, -uTime * 0.2)) * 0.4;
          vec3 n = normalize(vec3((h0 - hx) * 1.6, 1.0, (h0 - hz) * 1.6));
          vec3 v = normalize(cameraPosition - vWp);
          float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
          vec3 col = mix(uShallow, uDeep, smoothstep(0.0, 1.2, vDepth));
          col = mix(col, uSky, 0.1 + fres * 0.4);
          vec3 r = reflect(-uSun, n);
          float spec = pow(max(dot(r, v), 0.0), 260.0) * 0.9;
          col += vec3(1.0, 0.9, 0.7) * spec;
          float foam = (1.0 - smoothstep(0.0, 0.28, vDepth)) * smoothstep(0.35, 0.75, wcNoise(p * 2.2 + uTime * 0.4) + 0.3);
          col = mix(col, vec3(0.92, 0.95, 0.93), foam * 0.8);
          float alpha = mix(0.72, 0.96, smoothstep(0.0, 0.8, vDepth)) + fres * 0.1;
          alpha *= smoothstep(-0.05, 0.06, vDepth);
          gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      fog: true,
    })
    const water = new THREE.Mesh(geo, mat)
    water.renderOrder = 1
    this.scene.add(water)

    // Waterfall ribbon cascading from the rim into the lake.
    const { top, bottom } = waterfallLine()
    const dx = bottom.x - top.x
    const dz = bottom.z - top.z
    const len = Math.hypot(dx, dz)
    const fallH = top.y - bottom.y
    const fallGeo = new THREE.PlaneGeometry(8, 1, 1, 24)
    const fp = fallGeo.attributes.position as THREE.BufferAttribute
    const ux = dx / Math.max(1, len)
    const uz = dz / Math.max(1, len)
    for (let i = 0; i < fp.count; i += 1) {
      const t = fp.getY(i) + 0.5 // 1 = top, 0 = bottom
      const k = 1 - t
      const lx = fp.getX(i)
      // Parabolic arc outward from the cliff lip.
      const reach = len * (1 - Math.pow(1 - k, 1.6)) + 1.5
      const px = top.x + ux * reach + -uz * lx
      const pz = top.z + uz * reach + ux * lx
      const py = top.y - fallH * Math.pow(k, 1.25)
      fp.setXYZ(i, px, py, pz)
    }
    fallGeo.computeVertexNormals()
    const fallMat = new THREE.ShaderMaterial({
      uniforms: { ...fogUniforms(), uTime: this.uTime },
      vertexShader: /* glsl */ `
        varying vec2 vUv; varying vec3 vWp;
        #include <fog_pars_vertex>
        void main(){ vUv = uv; vWp = position; vec4 mvPosition = viewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; varying vec2 vUv; varying vec3 vWp;
        #include <fog_pars_fragment>
        ${NOISE_GLSL}
        void main(){
          float streak = wcNoise(vec2(vUv.x * 14.0, vUv.y * 3.0 + uTime * 2.6)) * 0.6 + wcNoise(vec2(vUv.x * 40.0, vUv.y * 8.0 + uTime * 4.0)) * 0.4;
          float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
          vec3 col = mix(vec3(0.55, 0.72, 0.78), vec3(0.97, 0.99, 1.0), smoothstep(0.35, 0.8, streak));
          float a = edge * (0.55 + streak * 0.45) * smoothstep(0.0, 0.06, vUv.y);
          gl_FragColor = vec4(col, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: true,
    })
    const fall = new THREE.Mesh(fallGeo, fallMat)
    fall.renderOrder = 2
    fall.frustumCulled = false
    this.scene.add(fall)
    this.waterfallBase.set(top.x + ux * (len + 1.5), WATER_LEVEL, top.z + uz * (len + 1.5))
  }

  private softTexture(inner: string, outer: string): THREE.Texture {
    const c = document.createElement('canvas')
    c.width = c.height = 128
    const g = c.getContext('2d')!
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
    grad.addColorStop(0, inner)
    grad.addColorStop(1, outer)
    g.fillStyle = grad
    g.fillRect(0, 0, 128, 128)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }

  private buildMist(): void {
    const random = rng(4242)
    const tex = this.softTexture('rgba(255,255,255,0.9)', 'rgba(255,255,255,0)')
    const spots: [number, number, number][] = []
    for (let i = 0; i < 10; i += 1) {
      const a = random() * 6.28
      const r = random() * LAKE.r
      spots.push([LAKE.x + Math.cos(a) * r, LAKE.z + Math.sin(a) * r, 18 + random() * 10])
    }
    for (let i = 0; i < 16; i += 1) {
      const a = random() * 6.28
      const r = 50 + random() * 60
      spots.push([Math.cos(a) * r, Math.sin(a) * r, 26 + random() * 18])
    }
    for (let i = 0; i < 5; i += 1) spots.push([this.waterfallBase.x + (random() - 0.5) * 8, this.waterfallBase.z + (random() - 0.5) * 8, 12 + random() * 6])
    for (const [x, z, s] of spots) {
      const mat = new THREE.SpriteMaterial({ map: tex, color: '#f3f1e6', transparent: true, opacity: 0.13 + random() * 0.08, depthWrite: false, fog: true })
      const sp = new THREE.Sprite(mat)
      sp.scale.set(s, s * 0.42, 1)
      sp.position.set(x, Math.max(heightAt(x, z), WATER_LEVEL) + s * 0.12, z)
      sp.userData.base = sp.position.clone()
      sp.userData.phase = random() * 6.28
      sp.renderOrder = 6
      this.mist.push(sp)
      this.scene.add(sp)
    }
  }

  private buildPollen(): void {
    const n = 700
    const random = rng(8)
    const pos = new Float32Array(n * 3)
    const seed = new Float32Array(n)
    for (let i = 0; i < n; i += 1) {
      pos[i * 3] = random() * 70
      pos[i * 3 + 1] = random() * 14
      pos[i * 3 + 2] = random() * 70
      seed[i] = random()
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: this.uTime, uCam: { value: new THREE.Vector3() }, uScale: { value: innerHeight * 0.5 } },
      vertexShader: /* glsl */ `
        attribute float aSeed; uniform float uTime; uniform vec3 uCam; uniform float uScale; varying float vA;
        void main(){
          vec3 p = position;
          p.x += sin(uTime * 0.3 + aSeed * 40.0) * 2.0 + uTime * 0.6;
          p.z += cos(uTime * 0.25 + aSeed * 30.0) * 2.0 + uTime * 0.3;
          p.y += sin(uTime * 0.5 + aSeed * 12.0) * 0.8;
          vec3 box = vec3(70.0, 14.0, 70.0);
          vec3 w = mod(p - uCam + box * 0.5, box) - box * 0.5 + uCam;
          w.y = uCam.y - 4.0 + mod(p.y, 14.0);
          vec4 mv = viewMatrix * vec4(w, 1.0);
          float dist = -mv.z;
          vA = smoothstep(34.0, 12.0, dist) * smoothstep(0.5, 3.0, dist) * (0.5 + 0.5 * sin(uTime * 2.0 + aSeed * 50.0));
          gl_PointSize = (0.06 + aSeed * 0.06) * uScale / max(dist, 0.1);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main(){ float r = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.0, r) * vA; if (a < 0.01) discard; gl_FragColor = vec4(1.0, 0.93, 0.7, a); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    this.pollen = new THREE.Points(geo, mat)
    this.pollen.frustumCulled = false
    this.pollen.renderOrder = 7
    this.scene.add(this.pollen)
  }

  private buildBirds(): void {
    const random = rng(31)
    const mat = new THREE.MeshBasicMaterial({ color: '#2a2622', side: THREE.DoubleSide, fog: true })
    const wing = new THREE.BufferGeometry()
    wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.35, 0, 0, -0.25, 1.3, 0.05, -0.1], 3))
    for (let i = 0; i < 14; i += 1) {
      const g = new THREE.Group()
      const body = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.8, 4).rotateX(Math.PI / 2), mat)
      const l = new THREE.Mesh(wing, mat)
      const r = new THREE.Mesh(wing, mat)
      r.scale.x = -1
      g.add(body, l, r)
      const s = 1.2 + random() * 0.8
      g.scale.setScalar(s)
      this.scene.add(g)
      this.birds.push({ g, wings: [l, r], r: 40 + random() * 50, h: 55 + random() * 30, speed: (0.12 + random() * 0.08) * (random() > 0.5 ? 1 : -1), phase: random() * 6.28, cx: (random() - 0.5) * 60, cz: (random() - 0.5) * 60 })
    }
  }

  private buildCamp(): void {
    const g = new THREE.Group()
    const cloth = new THREE.MeshStandardMaterial({ color: '#b89a6c', roughness: 0.95, flatShading: true, side: THREE.DoubleSide })
    const clothRed = new THREE.MeshStandardMaterial({ color: '#8f3a2a', roughness: 0.9, flatShading: true, side: THREE.DoubleSide })
    const wood = new THREE.MeshStandardMaterial({ color: '#6b4c32', roughness: 1, flatShading: true })
    const stone = new THREE.MeshStandardMaterial({ color: '#77716a', roughness: 1, flatShading: true })
    const place = (o: THREE.Object3D, x: number, z: number, lift = 0) => {
      o.position.set(x, heightAt(x, z) + lift, z)
      g.add(o)
      return o
    }
    const tent = new THREE.Mesh(new THREE.ConeGeometry(3, 3.4, 4, 1, true), cloth)
    tent.rotation.y = Math.PI / 4
    place(tent, CAMP.x - 6, CAMP.z + 4, 1.6).castShadow = true
    const tent2 = new THREE.Mesh(new THREE.ConeGeometry(2.2, 2.6, 4, 1, true), clothRed)
    tent2.rotation.y = 0.3
    place(tent2, CAMP.x + 7, CAMP.z + 7, 1.2).castShadow = true
    // Supply chest.
    const chest = new THREE.Group()
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.9, 0.95), wood)
    box.position.y = 0.45
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.12, 1.0), new THREE.MeshStandardMaterial({ color: '#a88b4a', metalness: 0.2, roughness: 0.62 }))
    band.position.y = 0.7
    const glow = new THREE.Mesh(new THREE.OctahedronGeometry(0.18), new THREE.MeshStandardMaterial({ color: '#7fe0ff', emissive: '#7fe0ff', emissiveIntensity: 1.1 }))
    glow.position.y = 1.6
    glow.name = 'supplyGlow'
    chest.add(box, band, glow)
    chest.rotation.y = -0.4
    place(chest, this.supply.x, this.supply.z)
    box.castShadow = true
    this.supply.y = heightAt(this.supply.x, this.supply.z)
    // Campfire.
    const fire = new THREE.Group()
    for (let i = 0; i < 9; i += 1) {
      const a = (i / 9) * Math.PI * 2
      const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), stone)
      s.position.set(Math.cos(a) * 0.8, 0.1, Math.sin(a) * 0.8)
      fire.add(s)
    }
    for (let i = 0; i < 3; i += 1) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.3, 5), wood)
      log.rotation.set(Math.PI / 2 - 0.4, (i / 3) * Math.PI, 0)
      log.position.y = 0.25
      fire.add(log)
    }
    const flameMat = new THREE.MeshBasicMaterial({ color: '#ffb35a', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })
    for (let i = 0; i < 3; i += 1) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.28 - i * 0.06, 0.9 + i * 0.25, 6, 1, true), flameMat)
      f.position.y = 0.5 + i * 0.1
      fire.add(f)
      this.flames.push(f)
    }
    place(fire, this.campfire.x, this.campfire.z)
    this.campfire.y = heightAt(this.campfire.x, this.campfire.z)
    this.fireLight = new THREE.PointLight('#ff9a4a', 30, 20, 1.6)
    this.fireLight.position.set(this.campfire.x, this.campfire.y + 1.2, this.campfire.z)
    this.scene.add(this.fireLight)
    // Banner.
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 6, 5), wood)
    pole.position.y = 3
    const bannerGeo = new THREE.PlaneGeometry(2.2, 1.3, 12, 4)
    bannerGeo.translate(1.1, 0, 0)
    this.banner = new THREE.Mesh(bannerGeo, this.windMaterial(new THREE.MeshStandardMaterial({ color: '#b3402c', roughness: 0.9, side: THREE.DoubleSide }), 'banner'))
    this.banner.position.y = 5.2
    const flag = new THREE.Group()
    flag.add(pole, this.banner)
    place(flag, CAMP.x + 1, CAMP.z + 9)
    // Fence posts along the camp edge.
    for (let i = 0; i < 9; i += 1) {
      const a = Math.PI * 0.15 + (i / 8) * Math.PI * 0.7
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.4, 5), wood)
      place(post, CAMP.x + Math.cos(a) * 12, CAMP.z + Math.sin(a) * 12, 0.6)
    }
    g.traverse(o => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).receiveShadow = true
    })
    this.scene.add(g)
  }

  private buildHerbs(): void {
    const random = rng(2024)
    const leafMat = new THREE.MeshStandardMaterial({ color: '#3f8a3a', roughness: 0.8, flatShading: true })
    const bulbMat = new THREE.MeshStandardMaterial({ color: '#ff9b3d', emissive: '#ff7a1a', emissiveIntensity: 1.1, roughness: 0.6 })
    let tries = 0
    while (this.herbs.length < 10 && tries < 400) {
      tries += 1
      const a = random() * 6.28
      const r = 16 + random() * 58
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r
      if (heightAt(x, z) < WATER_LEVEL + 0.4 || normalAt(x, z).y < 0.85) continue
      if (OBSTACLES.some(o => Math.hypot(o.x - x, o.z - z) < o.r + 1.2)) continue
      if (this.herbs.some(h => h.pos.distanceTo(new THREE.Vector3(x, h.pos.y, z)) < 12)) continue
      const g = new THREE.Group()
      for (let i = 0; i < 6; i += 1) {
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.7, 3), leafMat)
        leaf.position.y = 0.3
        leaf.rotation.set(0.5, (i / 6) * Math.PI * 2, 0)
        leaf.position.x = Math.sin((i / 6) * Math.PI * 2) * 0.15
        leaf.position.z = Math.cos((i / 6) * Math.PI * 2) * 0.15
        g.add(leaf)
      }
      for (let i = 0; i < 3; i += 1) {
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), bulbMat)
        bulb.position.set((random() - 0.5) * 0.3, 0.6 + random() * 0.2, (random() - 0.5) * 0.3)
        g.add(bulb)
      }
      const pos = new THREE.Vector3(x, heightAt(x, z), z)
      g.position.copy(pos)
      this.scene.add(g)
      this.herbs.push({ pos, group: g, available: true, regrow: 0 })
    }
  }

  gatherHerb(i: number): void {
    const h = this.herbs[i]
    h.available = false
    h.regrow = 90
    h.group.visible = false
  }

  /** Update tramplers: [x, y, z, radius]. */
  setTramplers(list: { x: number; y: number; z: number; r: number }[]): void {
    const arr = this.uTramplers.value
    for (let i = 0; i < TRAMPLERS; i += 1) {
      const t = list[i]
      if (t) arr[i].set(t.x, t.y, t.z, t.r)
      else arr[i].set(0, -999, 0, 0)
    }
  }

  /** Distance-based ambience mix: 0..1 water loudness at a point. */
  waterAt(p: THREE.Vector3): number {
    const dFall = Math.hypot(p.x - this.waterfallBase.x, p.z - this.waterfallBase.z)
    const dLake = Math.max(0, Math.hypot(p.x - LAKE.x, p.z - LAKE.z) - LAKE.r)
    return Math.min(1, Math.max(0, 1 - dFall / 60) * 1.2 + Math.max(0, 1 - dLake / 30) * 0.35)
  }

  update(dt: number, camera: THREE.Camera, focus: THREE.Vector3): { embers: THREE.Vector3 | null } {
    this.uTime.value += dt
    const t = this.uTime.value
    this.uWind.value.set(0.8 + Math.sin(t * 0.13) * 0.3, 0.45 + Math.cos(t * 0.09) * 0.25)
    this.sky.position.copy(camera.position)
    // Shadow frustum follows the focus, snapped to texels to avoid shimmering.
    const size = this.sun.shadow.mapSize.x || 2048
    const texel = 96 / size
    const fx = Math.round(focus.x / texel) * texel
    const fz = Math.round(focus.z / texel) * texel
    this.sun.target.position.set(fx, focus.y, fz)
    this.sun.position.set(fx + SUN_DIR.x * 120, focus.y + SUN_DIR.y * 120, fz + SUN_DIR.z * 120)
    this.sun.target.updateMatrixWorld()
    const pu = (this.pollen.material as THREE.ShaderMaterial).uniforms
    pu.uCam.value.copy(camera.position)
    pu.uScale.value = innerHeight * 0.5
    // Campfire flicker.
    const flick = 0.75 + Math.sin(t * 13) * 0.1 + Math.sin(t * 23.7) * 0.08 + Math.random() * 0.07
    this.fireLight.intensity = 30 * flick
    this.flames.forEach((f, i) => {
      f.scale.set(1 + Math.sin(t * (9 + i * 3)) * 0.12, flick * (1 + i * 0.1), 1 + Math.cos(t * (11 + i)) * 0.12)
      f.rotation.y = t * (1.5 + i)
    })
    for (const m of this.mist) {
      const b = m.userData.base as THREE.Vector3
      const ph = m.userData.phase as number
      m.position.set(b.x + Math.sin(t * 0.05 + ph) * 4, b.y + Math.sin(t * 0.2 + ph) * 0.4, b.z + Math.cos(t * 0.04 + ph) * 4)
    }
    for (const b of this.birds) {
      const a = t * b.speed + b.phase
      const x = b.cx + Math.cos(a) * b.r
      const z = b.cz + Math.sin(a) * b.r
      b.g.position.set(x, b.h + Math.sin(t * 0.4 + b.phase) * 3, z)
      const tx = -Math.sin(a) * Math.sign(b.speed)
      const tz = Math.cos(a) * Math.sign(b.speed)
      b.g.rotation.set(0, Math.atan2(tx, tz), Math.sign(b.speed) * 0.25)
      const flap = Math.sin(t * 7 + b.phase * 5)
      b.wings[0].rotation.z = flap * 0.6
      b.wings[1].rotation.z = -flap * 0.6
    }
    for (const h of this.herbs) {
      if (h.available) {
        h.group.rotation.y += dt * 0.3
        continue
      }
      h.regrow -= dt
      if (h.regrow <= 0) {
        h.available = true
        h.group.visible = true
      }
    }
    const glow = this.scene.getObjectByName('supplyGlow')
    if (glow) {
      glow.rotation.y = t * 1.5
      glow.position.y = 1.6 + Math.sin(t * 2) * 0.1
    }
    this.emberT -= dt
    if (this.emberT <= 0) {
      this.emberT = 0.12
      return { embers: this.campfire }
    }
    return { embers: null }
  }
}
