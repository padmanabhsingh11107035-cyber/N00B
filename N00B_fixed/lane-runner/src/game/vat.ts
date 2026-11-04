/**
 * Vertex Animation Texture (VAT) runtime.
 *
 * Every humanoid in the game (soldiers, all zombie archetypes, bosses) shares ONE baked mesh —
 * the Quaternius Universal Animation Library mannequin with a rifle — whose skinned animation
 * clips were baked offline (scripts/bake/bake.py) into a single RGBA16UI texture:
 *   column = vertex index (gl_VertexID), row = animation frame,
 *   rgb = position quantised into global bounds, a = octahedral normal (8+8 bits).
 * Clips stream in independently (staggered loading); instances that ask for a clip that has not
 * arrived yet fall back to a loaded one. Each archetype is an InstancedMesh with its own painted
 * texture and per-region "inflate" amounts (bulk for brutes, bellies for blisters, …), so
 * hundreds of animated characters cost one draw call per archetype.
 */
import * as THREE from 'three'

export type ClipName =
  | 'soldier_run' | 'soldier_cheer'
  | 'z_walk' | 'z_run' | 'z_attack' | 'z_hit' | 'z_death' | 'z_crawl' | 'z_cast' | 'z_slam' | 'z_idle'
  // Lurker creatures (one VatLibrary per creature, see creatures.ts)
  | 'run' | 'idle' | 'leap' | 'land' | 'attack' | 'death' | 'emerge' | 'charge'

interface ClipMeta { name: ClipName; frames: number; fps: number; loop: boolean; duration: number }
interface MeshMeta {
  boundsMin: number[]; boundsMax: number[]; vertexCount: number; indexCount: number; indexType: string
  clips: ClipMeta[]; bounds: { min: number[]; max: number[] }
}
export interface ClipInfo extends ClipMeta { row: number; ready: boolean }

/** Fallback chain for clips that have not streamed in yet. */
const FALLBACK: Partial<Record<ClipName, ClipName>> = {
  z_run: 'z_walk', z_crawl: 'z_walk', z_cast: 'z_attack', z_slam: 'z_attack', z_idle: 'z_walk',
  soldier_cheer: 'soldier_run',
  idle: 'run', leap: 'idle', land: 'idle', attack: 'idle', emerge: 'idle', charge: 'idle', death: 'idle',
}

export class VatLibrary {
  readonly geometry = new THREE.BufferGeometry()
  texture!: THREE.DataTexture
  clips = new Map<ClipName, ClipInfo>()
  private data!: Uint16Array
  private meta!: MeshMeta
  private loading = new Map<ClipName, Promise<void>>()
  private base: string
  ready = false

  constructor(base = 'assets/chars/') { this.base = base }

  async init(): Promise<void> {
    const [meta, bin] = await Promise.all([
      fetch(this.base + 'mesh.json').then(r => r.json() as Promise<MeshMeta>),
      fetch(this.base + 'mesh.bin').then(r => r.arrayBuffer()),
    ])
    this.meta = meta
    const NV = meta.vertexCount
    let off = 0
    const uv = new Float32Array(bin, off, NV * 2); off += NV * 8
    const region = new Uint8Array(bin, off, NV * 5); off += NV * 5
    const col = new Uint8Array(bin, off, NV * 4); off += NV * 4
    const pad = (4 - (off % 4)) % 4
    // rest positions are f32; copy to an aligned buffer (region/colour sizes break alignment)
    const restBytes = bin.slice(off, off + NV * 12); off += NV * 12
    const rest = new Float32Array(restBytes)
    void pad
    const idxBytes = bin.slice(off)
    const index = meta.indexType === 'uint16' ? new Uint16Array(idxBytes) : new Uint32Array(idxBytes)
    const regA = new Uint8Array(NV * 4), regB = new Uint8Array(NV)
    for (let i = 0; i < NV; i++) {
      regA[i * 4] = region[i * 5]; regA[i * 4 + 1] = region[i * 5 + 1]
      regA[i * 4 + 2] = region[i * 5 + 2]; regA[i * 4 + 3] = region[i * 5 + 3]
      regB[i] = region[i * 5 + 4]
    }
    const g = this.geometry
    g.setAttribute('position', new THREE.BufferAttribute(rest, 3))
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2))
    g.setAttribute('aRegion', new THREE.BufferAttribute(regA, 4, true))
    g.setAttribute('aLegs', new THREE.BufferAttribute(regB, 1, true))
    g.setAttribute('aColRifle', new THREE.BufferAttribute(new Uint8Array(col), 4, true))
    g.setIndex(new THREE.BufferAttribute(index, 1))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 2.2)
    g.boundingBox = new THREE.Box3(new THREE.Vector3(-1.2, -0.2, -1.2), new THREE.Vector3(1.2, 2.2, 1.2))

    let row = 0
    for (const c of meta.clips) {
      this.clips.set(c.name, { ...c, row, ready: false })
      row += c.frames
    }
    this.data = new Uint16Array(NV * row * 4)
    this.texture = new THREE.DataTexture(this.data, NV, row, THREE.RGBAIntegerFormat, THREE.UnsignedShortType)
    this.texture.internalFormat = 'RGBA16UI'
    this.texture.minFilter = this.texture.magFilter = THREE.NearestFilter
    this.texture.generateMipmaps = false
    this.texture.flipY = false
    this.texture.needsUpdate = true
    this.ready = true
  }

  get boundsMin() { return new THREE.Vector3().fromArray(this.meta.boundsMin) }
  get boundsMax() { return new THREE.Vector3().fromArray(this.meta.boundsMax) }

  isReady(name: ClipName) { return this.clips.get(name)?.ready ?? false }

  /** Load one clip's rows (idempotent). */
  load(name: ClipName): Promise<void> {
    const have = this.loading.get(name)
    if (have) return have
    const c = this.clips.get(name)
    if (!c) return Promise.resolve()
    const p = fetch(`${this.base}clip_${name}.bin`).then(r => {
      if (!r.ok) throw new Error(`clip ${name}: ${r.status}`)
      return r.arrayBuffer()
    }).then(buf => {
      const rows = new Uint16Array(buf)
      this.data.set(rows, c.row * this.meta.vertexCount * 4)
      c.ready = true
      this.texture.needsUpdate = true
    })
    // Allow a retry later if the network hiccups.
    p.catch(() => this.loading.delete(name))
    this.loading.set(name, p)
    return p
  }

  /** Resolve a clip to a loaded one using the fallback chain. */
  resolve(name: ClipName): ClipInfo {
    let n: ClipName | undefined = name
    for (let i = 0; i < 4 && n; i++) {
      const c = this.clips.get(n)
      if (c?.ready) return c
      n = FALLBACK[n]
    }
    for (const c of this.clips.values()) if (c.ready) return c
    return this.clips.values().next().value as ClipInfo
  }

  /** Compute (row0,row1,frac) for a clip at time t (seconds). */
  sample(name: ClipName, t: number, out: Float32Array, o: number) {
    const c = this.resolve(name)
    let f = t * c.fps
    if (c.loop) {
      f = ((f % c.frames) + c.frames) % c.frames
      const f0 = Math.floor(f)
      out[o] = c.row + f0
      out[o + 1] = c.row + ((f0 + 1) % c.frames)
      out[o + 2] = f - f0
    } else {
      f = Math.max(0, Math.min(c.frames - 1, f))
      const f0 = Math.floor(f)
      out[o] = c.row + f0
      out[o + 1] = c.row + Math.min(c.frames - 1, f0 + 1)
      out[o + 2] = f - f0
    }
  }

  duration(name: ClipName) { return this.resolve(name).duration }
}

export interface ArchetypeLook {
  /** inflate along normal in metres: head, chest, belly, arms, legs */
  inflate: [number, number, number, number, number]
  showRifle: boolean
  roughness?: number
  emissive?: THREE.ColorRepresentation
  emissiveIntensity?: number
}

export function createVatMaterial(lib: VatLibrary, map: THREE.Texture, look: ArchetypeLook): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    map, roughness: look.roughness ?? 0.82, metalness: 0.0,
    emissive: new THREE.Color(look.emissive ?? 0x000000), emissiveIntensity: look.emissiveIntensity ?? 0,
  })
  const uniforms = {
    uVat: { value: lib.texture },
    uBMin: { value: lib.boundsMin },
    uBSize: { value: lib.boundsMax.sub(lib.boundsMin) },
    uInflateA: { value: new THREE.Vector4(...look.inflate.slice(0, 4) as [number, number, number, number]) },
    uInflateLegs: { value: look.inflate[4] },
    uShowRifle: { value: look.showRifle ? 1 : 0 },
    /** fresnel rim colour (creatures only; black = off) */
    uRim: { value: new THREE.Color(0, 0, 0) },
    /** hit-flash strength (creatures keep their texture readable under sustained fire) */
    uFlashK: { value: 1 },
  }
  mat.userData.vat = uniforms
  mat.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform highp usampler2D uVat;
        uniform vec3 uBMin; uniform vec3 uBSize;
        uniform vec4 uInflateA; uniform float uInflateLegs; uniform float uShowRifle;
        attribute vec4 aRegion; attribute float aLegs; attribute vec4 aColRifle;
        attribute vec3 aAnimA; attribute vec3 aAnimB; attribute vec4 aMix;
        varying vec3 vRifleCol; varying float vRifle; varying float vFlash; varying float vGlow;
        vec3 vatDecodeN(uint w) {
          vec2 e = vec2(float(w & 255u), float(w >> 8u)) / 255.0 * 2.0 - 1.0;
          vec3 n = vec3(e.xy, 1.0 - abs(e.x) - abs(e.y));
          float t = max(-n.z, 0.0);
          n.x += n.x >= 0.0 ? -t : t; n.y += n.y >= 0.0 ? -t : t;
          return normalize(n);
        }
        void vatFetch(float row, out vec3 p, out vec3 n) {
          uvec4 t = texelFetch(uVat, ivec2(gl_VertexID, int(row)), 0);
          p = uBMin + vec3(t.xyz) / 65535.0 * uBSize;
          n = vatDecodeN(t.w);
        }
        vec3 vatP; vec3 vatN;
        void vatEval() {
          vec3 p0, n0, p1, n1, p2, n2, p3, n3;
          vatFetch(aAnimA.x, p0, n0); vatFetch(aAnimA.y, p1, n1);
          vec3 pa = mix(p0, p1, aAnimA.z); vec3 na = mix(n0, n1, aAnimA.z);
          if (aMix.x > 0.001) {
            vatFetch(aAnimB.x, p2, n2); vatFetch(aAnimB.y, p3, n3);
            pa = mix(pa, mix(p2, p3, aAnimB.z), aMix.x);
            na = mix(na, mix(n2, n3, aAnimB.z), aMix.x);
          }
          vatN = normalize(na);
          float infl = dot(aRegion, uInflateA) + aLegs * uInflateLegs;
          vatP = pa + vatN * infl * aMix.z;
          if (aColRifle.a > 0.5 && uShowRifle < 0.5) vatP = vec3(0.0, -50.0, 0.0);
        }`)
      .replace('#include <beginnormal_vertex>', `vatEval();
        vec3 objectNormal = vatN;
        #ifdef USE_TANGENT
          vec3 objectTangent = vec3( tangent.xyz );
        #endif`)
      .replace('#include <begin_vertex>', `vec3 transformed = vatP;
        vRifle = aColRifle.a; vRifleCol = aColRifle.rgb; vFlash = aMix.y; vGlow = aMix.w;`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vRifleCol; varying float vRifle; varying float vFlash; varying float vGlow;
        uniform vec3 uRim; uniform float uFlashK;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        diffuseColor.rgb = mix(diffuseColor.rgb, vRifleCol * 1.4, step(0.5, vRifle));`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance *= 1.0 + vGlow * 3.5;
        totalEmissiveRadiance += vFlash * uFlashK * vec3(1.0, 0.92, 0.85) * 1.6;
        float vatFr = 1.0 - saturate(dot(normal, normalize(vViewPosition)));
        totalEmissiveRadiance += uRim * vatFr * vatFr * vatFr * (1.0 + vGlow);`)
  }
  mat.customProgramCacheKey = () => 'vat1'
  return mat
}

export interface CreatureMaps { color: THREE.Texture; normal: THREE.Texture; rough: THREE.Texture; emissive: THREE.Texture }
/**
 * PBR material for a scanned-style creature: albedo + tangent-space normal map (derivative
 * tangents, so it follows the VAT-animated surface) + roughness, and an emissive mask for the
 * bioluminescent nodes/veins. Metalness is zero and roughness is floored offline (≥ 0.4) so wet
 * skin catches light without glaring. Per-instance glow (aMix.w) pulses the emissive mask.
 */
export function createCreatureMaterial(lib: VatLibrary, maps: CreatureMaps, glow: THREE.ColorRepresentation, glowIntensity: number): THREE.MeshStandardMaterial {
  const mat = createVatMaterial(lib, maps.color, { inflate: [0, 0, 0, 0, 0], showRifle: true, roughness: 1, emissive: glow, emissiveIntensity: glowIntensity })
  mat.normalMap = maps.normal
  mat.normalScale.set(1.1, 1.1)
  mat.roughnessMap = maps.rough
  mat.emissiveMap = maps.emissive
  mat.metalness = 0
  mat.envMapIntensity = 0.35
  // dark hides read poorly on dusk asphalt: lift albedo a touch and add a thin species-tinted rim
  mat.color.setScalar(1.22)
  const u = mat.userData.vat as { uRim: { value: THREE.Color }; uFlashK: { value: number } }
  u.uRim.value.set(glow).multiplyScalar(0.5)
  u.uFlashK.value = 0.25
  return mat
}
/** Per-instance animation state managed by the CPU. */
export interface VatAnim {
  clip: ClipName
  t: number
  prev: ClipName
  prevT: number
  blend: number // 1 = fully previous clip, fades to 0
  speed: number
}

export function newAnim(clip: ClipName, t = 0): VatAnim {
  return { clip, t, prev: clip, prevT: 0, blend: 0, speed: 1 }
}

export function playAnim(a: VatAnim, clip: ClipName, fade = 0.15) {
  if (a.clip === clip) return
  a.prev = a.clip; a.prevT = a.t; a.blend = fade > 0 ? 1 : 0
  a.clip = clip; a.t = 0
  ;(a as VatAnim & { fade: number }).fade = fade
}

export function stepAnim(a: VatAnim, dt: number) {
  a.t += dt * a.speed
  a.prevT += dt * a.speed
  if (a.blend > 0) {
    const fade = (a as VatAnim & { fade?: number }).fade ?? 0.15
    a.blend = Math.max(0, a.blend - dt / Math.max(0.01, fade))
  }
}

/**
 * An instanced crowd for one archetype. Callers write transforms + animation per slot each frame
 * with set(), then call commit(count).
 */
export class VatCrowd extends THREE.InstancedMesh {
  private animA: THREE.InstancedBufferAttribute
  private animB: THREE.InstancedBufferAttribute
  private mixA: THREE.InstancedBufferAttribute
  private lib: VatLibrary
  private m4 = new THREE.Matrix4()
  private q = new THREE.Quaternion()
  private s = new THREE.Vector3()
  private p = new THREE.Vector3()
  private e = new THREE.Euler()

  constructor(lib: VatLibrary, material: THREE.Material, capacity: number) {
    const geo = lib.geometry.clone()
    const a = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3)
    const b = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3)
    const m = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4)
    a.setUsage(THREE.DynamicDrawUsage); b.setUsage(THREE.DynamicDrawUsage); m.setUsage(THREE.DynamicDrawUsage)
    geo.setAttribute('aAnimA', a); geo.setAttribute('aAnimB', b); geo.setAttribute('aMix', m)
    super(geo, material, capacity)
    this.lib = lib
    this.animA = a; this.animB = b; this.mixA = m
    this.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.frustumCulled = false
    this.count = 0
    this.castShadow = false
    this.receiveShadow = false
    const white = new THREE.Color(1, 1, 1)
    for (let i = 0; i < capacity; i++) this.setColorAt(i, white)
    this.instanceColor!.setUsage(THREE.DynamicDrawUsage)
  }

  /**
   * @param yaw rotation around Y (0 = facing +Z)
   * @param inflate multiplier for the archetype inflate (1 normal)
   */
  set(i: number, x: number, y: number, z: number, yaw: number, scale: number, anim: VatAnim,
    flash = 0, inflate = 1, pitch = 0, roll = 0, glow = 0) {
    this.e.set(pitch, yaw, roll, 'YXZ')
    this.q.setFromEuler(this.e)
    this.place(i, x, y, z, this.q, scale, anim, flash, inflate, glow)
  }
  /** Same as set() with an explicit orientation (creatures crawling on walls, mid-air pitch). */
  place(i: number, x: number, y: number, z: number, q: THREE.Quaternion, scale: number, anim: VatAnim,
    flash = 0, inflate = 1, glow = 0) {
    this.s.set(scale, scale, scale)
    this.p.set(x, y, z)
    this.m4.compose(this.p, q, this.s)
    this.setMatrixAt(i, this.m4)
    this.lib.sample(anim.clip, anim.t, this.animA.array as Float32Array, i * 3)
    if (anim.blend > 0) this.lib.sample(anim.prev, anim.prevT, this.animB.array as Float32Array, i * 3)
    const mx = this.mixA.array as Float32Array
    mx[i * 4] = anim.blend
    mx[i * 4 + 1] = flash
    mx[i * 4 + 2] = inflate
    mx[i * 4 + 3] = glow
  }

  tint(i: number, c: THREE.Color) { this.setColorAt(i, c) }

  commit(count: number) {
    this.count = count
    this.instanceMatrix.needsUpdate = true
    this.animA.needsUpdate = true
    this.animB.needsUpdate = true
    this.mixA.needsUpdate = true
    if (this.instanceColor) this.instanceColor.needsUpdate = true
  }
}
