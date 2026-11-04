import * as THREE from 'three'
import type { Dir } from './chart'
import type { Grade } from './rules'
import type { DanceClip, DanceLib, Genre } from './dances'

/**
 * Realistic dancers: Quaternius Universal Base Characters (CC0) driven by Universal Animation
 * Library clips (CC0). Both rigs share bone names and local rest frames, so rotation tracks
 * transfer directly; the pelvis translation only needs the armature unit scale and a height ratio.
 *
 * Outfits are real skinned clothing shells: body triangles inside a garment region are cloned,
 * pushed out along their normals (baggier toward the cuffs) and bound to the body skeleton so they
 * deform perfectly. A fabric shader adds weave, seams, trims and pockets from the bind position.
 */

export type Body = 'f' | 'm'
export type HairStyle = 'long' | 'buns' | 'buzzed' | 'parted'
export type TopKind = 'bomber' | 'holo' | 'varsity' | 'hoodie'
export type PantsKind = 'cargo' | 'wide' | 'jogger'
export type Outfit = {
  body: Body
  skin: 'light' | 'dark'
  skinTint: string
  hair: HairStyle
  hairColor: string
  top: TopKind
  topColor: string
  sleeveColor: string
  trim: string
  inner: string
  pants: PantsKind
  pantsColor: string
  shoe: string
  shoeAccent: string
  rim: string
}

export type CharacterKit = {
  bodies: Record<Body, THREE.Group>
  hair: Record<HairStyle, THREE.Group>
  clips: THREE.AnimationClip[]
  /** Beat-locked AIST++ mocap per body (root motion scaled to the body's legs). */
  dances: Record<Body, DanceLib>
  tex: {
    skin: Record<string, THREE.Texture>
    normal: Record<Body, THREE.Texture>
    rough: Record<Body, THREE.Texture>
    hair: THREE.Texture[]
    hairNormal: THREE.Texture[]
    eye: THREE.Texture
  }
}

export type MoveName =
  | 'shoot' | 'hop' | 'spin' | 'cross' | 'jab' | 'reach' | 'shrug' | 'stumble'
  | 'finale' | 'cheer' | 'slump' | 'pose'
/** Mood of the music the dancer is grooving to (song section, or lobby/title). */
export type Mood = 'lobby' | 'intro' | 'verse' | 'build' | 'drop' | 'break' | 'outro'
/** Mocap move tier per named move (1 light … 3 showcase, 4 = power finale). */
const MOVE_TIER: Partial<Record<MoveName, number>> = { spin: 3, hop: 3, shoot: 2, cross: 2, jab: 1, reach: 1, cheer: 2, finale: 4 }
const GRADE_TIER: Record<Grade, number> = { perfect: 3, great: 2, cool: 1, bad: 0, miss: 0 }
/** Short non-dance reactions and held poses still come from the UAL library (seconds-based). */
type LegacyDef = { clip: string; seconds: number; hold?: string; from?: number; to?: number }
const LEGACY: Partial<Record<MoveName, LegacyDef>> = {
  shrug: { clip: 'Hit_Head', seconds: 0.9 },
  stumble: { clip: 'Hit_Chest', seconds: 1.2 },
  slump: { clip: 'Hit_Chest', seconds: 1.3, hold: 'Crouch_Idle_Loop' },
  pose: { clip: 'Spell_Simple_Enter', seconds: 0.6, hold: 'Spell_Simple_Idle_Loop' },
}
const IDLE = { clip: 'Idle_Loop', beats: 8 }
const PHRASE = 8
/** Groove energy window (fraction of the dancer's groove pool, low → high) per mood. */
const MOOD_BAND: Record<Mood, [number, number]> = {
  lobby: [0, 0.7], intro: [0, 0.5], verse: [0.2, 0.85], build: [0.4, 1], drop: [0.55, 1], break: [0, 0.45], outro: [0, 0.6],
}

// ---------------------------------------------------------------------------------------------
// Garments (regions in the bind space: Y up, arms along ±X, front = -Z, meters)

type Region = (p: THREE.Vector3) => number // >0 inside, value = inflation in meters

const tmpV = new THREE.Vector3()
const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.max(0, Math.min(1, t))

function topRegion(kind: TopKind, body: Body): Region {
  const s = body === 'm' ? 1.03 : 1
  const hem = { bomber: 1.13, holo: 1.08, varsity: 0.98, hoodie: 0.9 }[kind] * s
  const neck = 1.47 * s
  const sleeveEnd = { bomber: 0.6, holo: 0.3, varsity: 0.6, hoodie: 0.62 }[kind] * (body === 'm' ? 1.1 : 1)
  const base = { bomber: 0.022, holo: 0.004, varsity: 0.02, hoodie: 0.034 }[kind]
  return (p) => {
    const ax = Math.abs(p.x)
    if (p.y > neck + (ax < 0.09 ? -0.03 : 0.02)) return 0
    if (ax < 0.2 * s) return p.y >= hem ? base + (kind === 'hoodie' ? 0.012 * Math.max(0, 1 - (p.y - hem) / 0.5) : 0) : 0
    if (ax <= sleeveEnd && p.y > 1.28 * s) return base + (kind === 'holo' ? 0 : 0.006 * (ax / sleeveEnd))
    return 0
  }
}

function pantsRegion(kind: PantsKind, body: Body): Region {
  const s = body === 'm' ? 1.03 : 1
  const waist = 1.075 * s
  return (p) => {
    if (p.y > waist || p.y < 0.075 || Math.abs(p.x) > 0.26 * s) return 0
    const t = 1 - (p.y - 0.08) / (waist - 0.08) // 0 at waist .. 1 at ankle
    if (kind === 'wide') return lerp(0.012, 0.058, t)
    if (kind === 'cargo') return lerp(0.012, 0.03, t) - (p.y < 0.16 ? 0.008 : 0)
    return lerp(0.012, 0.018, t) - (p.y < 0.14 ? 0.008 : 0)
  }
}

const shoeRegion: Region = (p) => (p.y < 0.125 && Math.abs(p.x) < 0.25 ? 0.011 + (p.y < 0.03 ? 0.004 : 0) : 0)

function innerRegion(body: Body): Region {
  const s = body === 'm' ? 1.03 : 1
  return (p) => (Math.abs(p.x) < 0.2 * s && p.y > 1.1 * s && p.y < 1.44 * s ? 0.003 : 0)
}

function buildShell(src: THREE.BufferGeometry, bind: Float32Array, region: Region, localScale: number): THREE.BufferGeometry | null {
  const pos = src.getAttribute('position') as THREE.BufferAttribute
  const nor = src.getAttribute('normal') as THREE.BufferAttribute
  const index = src.getIndex()
  const n = pos.count
  const infl = new Float32Array(n)
  for (let i = 0; i < n; i++) infl[i] = region(tmpV.set(bind[i * 3], bind[i * 3 + 1], bind[i * 3 + 2]))
  const tris: number[] = []
  const triCount = index ? index.count / 3 : n / 3
  for (let t = 0; t < triCount; t++) {
    const a = index ? index.getX(t * 3) : t * 3
    const b = index ? index.getX(t * 3 + 1) : t * 3 + 1
    const c = index ? index.getX(t * 3 + 2) : t * 3 + 2
    if (infl[a] > 0 && infl[b] > 0 && infl[c] > 0) tris.push(a, b, c)
  }
  if (!tris.length) return null
  const g = new THREE.BufferGeometry()
  const p2 = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const k = infl[i] / localScale
    p2[i * 3] = pos.getX(i) + nor.getX(i) * k
    p2[i * 3 + 1] = pos.getY(i) + nor.getY(i) * k
    p2[i * 3 + 2] = pos.getZ(i) + nor.getZ(i) * k
  }
  g.setAttribute('position', new THREE.BufferAttribute(p2, 3))
  g.setAttribute('normal', nor)
  for (const name of ['uv', 'skinIndex', 'skinWeight']) {
    const a = src.getAttribute(name)
    if (a) g.setAttribute(name, a)
  }
  g.setAttribute('aBind', new THREE.BufferAttribute(bind, 3))
  g.setIndex(tris)
  return g
}

type FabricKind = 'bomber' | 'holo' | 'varsity' | 'hoodie' | 'cargo' | 'wide' | 'jogger' | 'shoe' | 'inner'
const KIND_ID: Record<FabricKind, number> = { bomber: 0, holo: 1, varsity: 2, hoodie: 3, cargo: 4, wide: 5, jogger: 6, shoe: 7, inner: 8 }

export type RimUniforms = { uRim: { value: number }; uRimColor: { value: THREE.Color } }
const TIME = { value: 0 }

function fabricMaterial(
  o: { color: string; sleeve?: string; trim?: string; accent?: string; kind: FabricKind; roughness?: number; body: Body },
  rim: RimUniforms,
): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    color: o.color,
    roughness: o.roughness ?? (o.kind === 'holo' ? 0.35 : o.kind === 'bomber' ? 0.66 : 0.88),
    metalness: o.kind === 'holo' ? 0.45 : 0,
    envMapIntensity: 0.5,
  })
  const sleeve = new THREE.Color(o.sleeve ?? o.color)
  const trim = new THREE.Color(o.trim ?? o.color)
  const accent = new THREE.Color(o.accent ?? o.trim ?? o.color)
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      uSleeve: { value: sleeve }, uTrim: { value: trim }, uAccent: { value: accent },
      uKind: { value: KIND_ID[o.kind] }, uS: { value: o.body === 'm' ? 1.03 : 1 },
      uRim: rim.uRim, uRimColor: rim.uRimColor, uTime: TIME,
    })
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aBind;\nvarying vec3 vBind;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBind = aBind;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vBind;
uniform vec3 uSleeve; uniform vec3 uTrim; uniform vec3 uAccent; uniform float uKind; uniform float uS;
uniform float uRim; uniform vec3 uRimColor; uniform float uTime;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 b = vBind; float ax = abs(b.x); float y = b.y / uS;
  float armK = uS > 1.01 ? 1.1 : 1.0;
  bool arm = ax > 0.2 * uS;
  vec3 col = arm ? uSleeve : diffuseColor.rgb;
  float k = uKind;
  float weave = sin(b.y * 900.0) * sin((b.x + b.z) * 900.0);
  float mott = vnoise(b.xy * 38.0 + b.z * 17.0);
  col *= 0.93 + 0.05 * weave + 0.07 * mott;
  float front = step(b.z, 0.0);
  if (k < 0.5) {
    float rib = 0.82 + 0.18 * step(0.5, fract((b.x + b.z) * 180.0));
    if (!arm && y < 1.165) col = uTrim * rib;
    if (arm && ax > 0.55 * armK) col = uTrim * rib;
    if (!arm && y > 1.43 && ax < 0.1) col = uTrim * rib;
    if (!arm && ax < 0.006 && front > 0.5) col = mix(col, uTrim, 0.85);
  } else if (k < 1.5) {
    float t = b.y * 9.0 + b.x * 6.0 + uTime;
    col = mix(col, 0.55 + 0.45 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + t)), 0.4);
  } else if (k < 2.5) {
    float stripe = step(0.5, fract(y * 55.0));
    if (!arm && y < 1.03) col = mix(uTrim, uSleeve, stripe);
    if (arm && ax > 0.58 * armK) col = mix(uTrim, uSleeve, stripe);
    if (!arm && y > 1.44 && ax < 0.1) col = mix(uTrim, uSleeve, stripe);
    vec2 pt = vec2(b.x + 0.09, y - 1.33);
    if (front > 0.5 && abs(pt.x) < 0.035 && abs(pt.y) < 0.04) col = uSleeve;
  } else if (k < 3.5) {
    if (!arm && front > 0.5 && ax < 0.11 && y > 0.98 && y < 1.1) col *= 0.8;
    if (!arm && front > 0.5 && abs(ax - 0.035) < 0.005 && y > 1.3 && y < 1.44) col = uTrim;
    if (arm && ax > 0.58 * armK) col *= 0.8;
    if (!arm && y < 0.94) col *= 0.8;
  } else if (k < 6.5) {
    if (y > 1.035) col *= 0.7;
    float side = abs(ax - 0.17 * uS);
    if (side < 0.004) col *= 0.72;
    if (k < 4.5 && side < 0.05 && y > 0.52 && y < 0.7) {
      col *= 0.85;
      if (abs(y - 0.69) < 0.006) col = mix(col, uAccent, 0.65);
    }
    if (k > 5.5 && y < 0.16) col *= 0.75;
  } else if (k < 7.5) {
    if (y < 0.028) col = vec3(0.9);
    float sw = abs((y - 0.06) + b.z * 0.25);
    if (sw < 0.008 && y > 0.035) col = uAccent;
  }
  diffuseColor.rgb = col;
}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  float fres = pow(1.0 - clamp(dot(normalize(vViewPosition), -normal), 0.0, 1.0), 3.0);
  totalEmissiveRadiance += uRimColor * fres * uRim;
}`)
  }
  m.customProgramCacheKey = () => 'fabric-v1'
  return m
}

/** Adds a fresnel rim to a standard material (skin, hair) using the dancer's rim uniforms. */
function withRim(m: THREE.MeshStandardMaterial, rim: RimUniforms, key: string): THREE.MeshStandardMaterial {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = rim.uRim
    sh.uniforms.uRimColor = rim.uRimColor
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uRim; uniform vec3 uRimColor;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{ float fres = pow(1.0 - clamp(dot(normalize(vViewPosition), -normal), 0.0, 1.0), 3.0);
  totalEmissiveRadiance += uRimColor * fres * uRim * 0.8; }`)
  }
  m.customProgramCacheKey = () => 'rim-' + key
  return m
}

// ---------------------------------------------------------------------------------------------

const clipCache = new WeakMap<THREE.AnimationClip[], Map<string, THREE.AnimationClip>>()

/** Retarget UAL clips onto the converted rig (rotation tracks as-is; pelvis translation scaled). */
function retargetClips(kit: CharacterKit, body: Body): Map<string, THREE.AnimationClip> {
  let cache = clipCache.get(kit.clips)
  if (!cache) clipCache.set(kit.clips, (cache = new Map()))
  const ratio = body === 'm' ? 0.949 / 0.917 : 0.932 / 0.917
  const out = new Map<string, THREE.AnimationClip>()
  for (const c of kit.clips) {
    const key = body + ':' + c.name
    let clip = cache.get(key)
    if (!clip) {
      const tracks: THREE.KeyframeTrack[] = []
      for (const t of c.tracks) {
        if (t.name.startsWith('pelvis.position')) {
          const v = Float32Array.from(t.values, (x) => x * 0.01 * ratio)
          tracks.push(new THREE.VectorKeyframeTrack(t.name, Array.from(t.times), Array.from(v)))
        } else if (t.name.endsWith('.quaternion')) tracks.push(t.clone())
      }
      clip = new THREE.AnimationClip(c.name, c.duration, tracks)
      cache.set(key, clip)
    }
    out.set(c.name, clip)
  }
  return out
}

/** One clip in the blend stack. Dance clips are timed in beats, legacy UAL clips in seconds. */
type Play = {
  name: string
  action: THREE.AnimationAction
  w: number
  w0: number
  kind: 'groove' | 'move' | 'legacy' | 'hold' | 'idle'
  /** groove: phrase index; move/legacy: start beat; hold: start clock */
  start: number
  beats: number
  /** move: freeze on the last frame until this beat */
  freezeUntil?: number
  from?: number
  to?: number
  ts?: number
  hold?: string
}

export class Dancer {
  readonly root = new THREE.Group()
  /** Rim-light multiplier (Fever / Spotlight). 0 = none, 1 = normal accent. */
  shine = 0
  /** Section mood the choreographer picks grooves for. */
  mood: Mood = 'lobby'
  readonly rim: RimUniforms
  private readonly model: THREE.Group
  private readonly mixer: THREE.AnimationMixer
  private readonly clips: Map<string, THREE.AnimationClip>
  private readonly lib: DanceLib
  private poolVersion = -1
  private grooveList: DanceClip[] = []
  private moveList: DanceClip[] = []
  private readonly actions = new Map<string, THREE.AnimationAction>()
  private readonly bones: Record<string, THREE.Bone | undefined> = {}
  private stack: Play[] = []
  private fadeT = 1
  private fadeDur = 0.2
  private phrase = Number.NaN
  private lastGroove = ''
  private lastMove = ''
  private unisonUntil = -Infinity
  private clock = 0
  private beat = 0
  private beatSec = 0.5
  private readonly lean = new THREE.Vector2()
  private readonly leanTarget = new THREE.Vector2()
  private leanUntil = 0
  private energy = 0.5
  private idle = true
  private rimNow = 0
  private seed: number
  /** Relaxed hand: mocap has no fingers, so curl them a little on top of every pose. */
  private readonly fingers: Array<[THREE.Bone, THREE.Quaternion]> = []

  constructor(kit: CharacterKit, readonly outfit: Outfit, readonly style: number, readonly genres: readonly Genre[] = ['LH', 'MH']) {
    this.seed = (style + 1) * 7919
    this.rim = { uRim: { value: 0 }, uRimColor: { value: new THREE.Color(outfit.rim) } }
    this.model = cloneSkinned(kit.bodies[outfit.body])
    this.model.rotation.y = Math.PI // the rig faces -Z; the stage audience is at +Z
    this.root.add(this.model)
    this.root.updateMatrixWorld(true)

    let body: THREE.SkinnedMesh | undefined
    this.model.traverse((o) => {
      if ((o as THREE.Bone).isBone) this.bones[o.name] = o as THREE.Bone
      const sm = o as THREE.SkinnedMesh
      if (!sm.isSkinnedMesh) return
      sm.frustumCulled = false
      const name = (sm.material as THREE.Material).name
      if (name.startsWith('MI_Superhero')) {
        body = sm
        sm.material = withRim(new THREE.MeshStandardMaterial({
          map: kit.tex.skin[`${outfit.body}_${outfit.skin}`],
          normalMap: kit.tex.normal[outfit.body],
          roughnessMap: kit.tex.rough[outfit.body],
          roughness: 0.82,
          color: outfit.skinTint,
          envMapIntensity: 0.4,
        }), this.rim, 'skin')
      } else if (name === 'MI_Eyes') {
        sm.material = new THREE.MeshStandardMaterial({ map: kit.tex.eye, roughness: 0.3, envMapIntensity: 0.5 })
      } else {
        sm.material = new THREE.MeshStandardMaterial({ color: outfit.hairColor, roughness: 0.8 })
      }
    })
    if (!body) throw new Error('body mesh missing')
    this.dressUp(body)
    this.attachHair(kit)

    this.mixer = new THREE.AnimationMixer(this.model)
    this.clips = retargetClips(kit, outfit.body)
    this.lib = kit.dances[outfit.body]
    // Curl axis = the knuckle line (model +Z in the T-pose bind); fingers bend toward the palm (-Y).
    this.model.updateMatrixWorld(true)
    const modelQ = this.model.getWorldQuaternion(new THREE.Quaternion())
    const bq = new THREE.Quaternion()
    for (const side of ['l', 'r'] as const) {
      for (const f of ['index', 'middle', 'ring', 'pinky', 'thumb']) {
        for (const seg of [1, 2, 3]) {
          const bone = this.bones[`${f}_0${seg}_${side}`]
          if (!bone) continue
          const base = f === 'thumb' ? 0.12 : 0.3 + ({ index: 0, middle: 0.07, ring: 0.14, pinky: 0.2 } as Record<string, number>)[f]
          const ang = base * (seg === 1 ? 0.75 : 1.15) * (side === 'l' ? 1 : -1)
          const axis = new THREE.Vector3(0, 0, 1).applyQuaternion(modelQ).applyQuaternion(bone.getWorldQuaternion(bq).invert()).normalize()
          this.fingers.push([bone, new THREE.Quaternion().setFromAxisAngle(axis, ang)])
        }
      }
    }
  }

  private dressUp(body: THREE.SkinnedMesh) {
    const o = this.outfit
    const geo = body.geometry
    const pos = geo.getAttribute('position') as THREE.BufferAttribute
    const bind = new Float32Array(pos.count * 3)
    const v = new THREE.Vector3()
    const inv = this.model.matrixWorld.clone().invert()
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i)
      body.applyBoneTransform(i, v)
      v.applyMatrix4(body.matrixWorld).applyMatrix4(inv)
      bind[i * 3] = v.x
      bind[i * 3 + 1] = v.y
      bind[i * 3 + 2] = v.z
    }
    // Geometry units → meters, measured from two far-apart vertices (robust to any node scale).
    let far = 0
    let best = 1
    for (let i = 1; i < pos.count; i += 97) {
      const dx = bind[i * 3] - bind[0], dy = bind[i * 3 + 1] - bind[1], dz = bind[i * 3 + 2] - bind[2]
      const dw = Math.hypot(dx, dy, dz)
      if (dw > far) {
        far = dw
        const gx = pos.getX(i) - pos.getX(0), gy = pos.getY(i) - pos.getY(0), gz = pos.getZ(i) - pos.getZ(0)
        best = dw / Math.max(1e-9, Math.hypot(gx, gy, gz))
      }
    }
    const localScale = best
    const add = (region: Region, mat: THREE.MeshStandardMaterial) => {
      const g = buildShell(geo, bind, region, localScale)
      if (!g) return
      const mesh = new THREE.SkinnedMesh(g, mat)
      body.parent!.add(mesh)
      mesh.position.copy(body.position)
      mesh.quaternion.copy(body.quaternion)
      mesh.scale.copy(body.scale)
      mesh.bind(body.skeleton, body.bindMatrix)
      mesh.frustumCulled = false
    }
    const b = o.body
    add(innerRegion(b), fabricMaterial({ color: o.inner, kind: 'inner', body: b, roughness: 0.8 }, this.rim))
    add(pantsRegion(o.pants, b), fabricMaterial({ color: o.pantsColor, kind: o.pants, accent: o.trim, body: b }, this.rim))
    add(topRegion(o.top, b), fabricMaterial({ color: o.topColor, sleeve: o.sleeveColor, trim: o.trim, kind: o.top, body: b }, this.rim))
    add(shoeRegion, fabricMaterial({ color: o.shoe, accent: o.shoeAccent, kind: 'shoe', body: b, roughness: 0.55 }, this.rim))
  }

  private attachHair(kit: CharacterKit) {
    const head = this.bones.Head
    const src = kit.hair[this.outfit.hair]
    if (!head || !src) return
    src.updateMatrixWorld(true)
    const hp = new THREE.Vector3()
    src.getObjectByName('Head')?.getWorldPosition(hp)
    const modelInv = this.model.matrixWorld.clone().invert()
    const headModel = new THREE.Vector3().setFromMatrixPosition(head.matrixWorld).applyMatrix4(modelInv)
    const s = this.outfit.body === 'm' ? 1.05 : 1
    // hair world (UE, faces +Z) → model space (faces -Z) seated on this head → head-bone local
    const toModel = new THREE.Matrix4()
      .makeTranslation(headModel.x, headModel.y, headModel.z)
      .multiply(new THREE.Matrix4().makeRotationY(Math.PI))
      .multiply(new THREE.Matrix4().makeScale(s, s, s))
      .multiply(new THREE.Matrix4().makeTranslation(-hp.x, -hp.y, -hp.z))
    const toHead = head.matrixWorld.clone().invert().multiply(this.model.matrixWorld).multiply(toModel)
    const texIdx = this.outfit.hair === 'long' || this.outfit.hair === 'buns' ? 1 : 0
    src.traverse((o) => {
      const sm = o as THREE.Mesh
      if (!sm.isMesh) return
      const g = sm.geometry.clone()
      g.deleteAttribute('skinIndex')
      g.deleteAttribute('skinWeight')
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toHead, sm.matrixWorld))
      const mat = withRim(new THREE.MeshStandardMaterial({
        color: this.outfit.hairColor,
        map: kit.tex.hair[texIdx],
        normalMap: kit.tex.hairNormal[texIdx],
        roughness: 0.6,
        side: THREE.DoubleSide,
        envMapIntensity: 0.4,
      }), this.rim, 'hair')
      const mesh = new THREE.Mesh(g, mat)
      mesh.frustumCulled = false
      head.add(mesh)
    })
  }

  private action(name: string): THREE.AnimationAction {
    let a = this.actions.get(name)
    if (!a) {
      const clip = this.clips.get(name) ?? this.lib.get(name)?.clip
      if (!clip) throw new Error('missing clip ' + name)
      a = this.mixer.clipAction(clip)
      a.setLoop(THREE.LoopRepeat, Infinity)
      this.actions.set(name, a)
    }
    return a
  }

  private rand(): number {
    // mulberry32 — deterministic per dancer so the crew doesn't pick identical grooves
    let t = (this.seed = (this.seed + 0x6d2b79f5) | 0)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /**
   * Push a clip onto the blend stack and crossfade to it over `fade` seconds. Weights are set
   * explicitly every frame (no mixer fades), so the rig can never drop back to its bind pose.
   */
  private push(p: Omit<Play, 'action' | 'w' | 'w0'>, fade: number) {
    const top = this.stack[this.stack.length - 1]
    if (top && top.name === p.name && top.kind === p.kind && top.start === p.start) return
    const action = this.action(p.name)
    // If this clip is already blending out, reuse its action (one action per clip).
    this.stack = this.stack.filter((s) => s.action !== action)
    for (const s of this.stack) s.w0 = s.w
    action.enabled = true
    action.timeScale = 0
    action.setEffectiveWeight(0)
    action.play()
    this.stack.push({ ...p, action, w: 0, w0: 0 })
    this.fadeT = 0
    this.fadeDur = Math.max(0.01, fade)
    if (this.stack.length === 1) this.fadeDur = 0.01
  }

  private top(): Play | undefined {
    return this.stack[this.stack.length - 1]
  }

  /** Energy-sorted pools for this dancer's genres; rebuilt when the streamed move pack lands. */
  private refreshPools() {
    if (this.poolVersion === this.lib.version) return
    this.poolVersion = this.lib.version
    const byEnergy = (a: DanceClip, b: DanceClip) => a.energy - b.energy
    this.grooveList = this.lib.list(this.genres, 'groove').sort(byEnergy)
    this.moveList = this.lib.list(this.genres, 'move').sort(byEnergy)
  }

  private get grooves(): DanceClip[] {
    this.refreshPools()
    return this.grooveList
  }

  private get moves(): DanceClip[] {
    this.refreshPools()
    return this.moveList
  }

  private pickGroove(phrase: number): DanceClip | undefined {
    if (!this.grooves.length) return undefined
    const [lo, hi] = MOOD_BAND[this.mood]
    const n = this.grooves.length
    const a = Math.floor(lo * (n - 1))
    const b = Math.max(a, Math.ceil(hi * (n - 1)))
    let pick = this.grooves[a + Math.floor(this.rand() * (b - a + 1))]
    for (let i = 0; i < 4 && pick.name.replace('~m', '') === this.lastGroove.replace('~m', '') && b > a; i++) {
      pick = this.grooves[a + Math.floor(this.rand() * (b - a + 1))]
    }
    // Mirror every other phrase for left/right variety on the same routine.
    const name = (phrase & 1) === 1 ? pick.name.replace(/~m$/, '') + '~m' : pick.name.replace(/~m$/, '')
    this.lastGroove = name
    return this.lib.get(name) ?? pick
  }

  private pickMove(tier: number): DanceClip | undefined {
    if (!this.moves.length) return undefined
    const n = this.moves.length
    let pool: DanceClip[]
    if (tier >= 4) pool = this.moves.filter((m) => m.beats === 8).slice(-3)
    else if (tier === 3) pool = this.moves.slice(Math.floor(n * 0.6))
    else if (tier === 2) pool = this.moves.slice(Math.floor(n * 0.3), Math.ceil(n * 0.75))
    else pool = this.moves.slice(0, Math.ceil(n * 0.45))
    if (!pool.length) pool = this.moves
    let pick = pool[Math.floor(this.rand() * pool.length)]
    for (let i = 0; i < 4 && pick.name.replace('~m', '') === this.lastMove && pool.length > 1; i++) pick = pool[Math.floor(this.rand() * pool.length)]
    this.lastMove = pick.name.replace('~m', '')
    return this.rand() < 0.5 ? (this.lib.get(pick.name.replace(/~m$/, '') + '~m') ?? pick) : pick
  }

  /** Start a mocap move on the nearest beat (so it lands with the music). */
  private startMove(clip: DanceClip, beat: number, freezeBeats = 0) {
    const start = Math.round(beat * 2) / 2
    this.push({ name: clip.name, kind: 'move', start, beats: clip.beats, freezeUntil: start + clip.beats + freezeBeats }, 0.35 * this.beatSec)
  }

  private startLegacy(def: LegacyDef) {
    const a = this.action(def.clip)
    const from = def.from ?? 0
    const to = def.to ?? a.getClip().duration
    this.push({ name: def.clip, kind: 'legacy', start: this.beat, beats: def.seconds / this.beatSec, from, to, ts: (to - from) / def.seconds, hold: def.hold }, 0.1)
  }

  /** Play a named move now. Dance moves come from mocap tiers; reactions from the UAL library. */
  perform(name: MoveName, beat = this.beat): void {
    const legacy = LEGACY[name]
    if (legacy) return this.startLegacy(legacy)
    const tier = MOVE_TIER[name] ?? 2
    const clip = this.pickMove(tier)
    if (!clip) return
    this.startMove(clip, beat, tier >= 4 ? 2 : 0)
  }

  /** Crowd-pleasing reaction to a judged round: better grades earn bigger mocap moves. */
  react(grade: Grade, beat = this.beat, roll = Math.random()): void {
    const tier = GRADE_TIER[grade]
    if (tier === 0) return this.perform(grade === 'miss' ? 'stumble' : 'shrug', beat)
    if (beat < this.unisonUntil) return // the crew routine keeps everyone in sync
    this.seed = (this.seed ^ Math.floor(roll * 1e9)) | 0
    const clip = this.pickMove(tier)
    if (clip) this.startMove(clip, beat)
  }

  /** Cue a specific dance clip (crew unison routines); mirrored for the other side of the stage. */
  cue(name: string, startBeat: number, mirrored = false): void {
    const clip = this.lib.get(mirrored ? name.replace(/~m$/, '') + '~m' : name.replace(/~m$/, ''))
    if (!clip) return
    this.push({ name: clip.name, kind: 'move', start: startBeat, beats: clip.beats, freezeUntil: startBeat + clip.beats }, 0.5 * this.beatSec)
    this.unisonUntil = startBeat + clip.beats - 0.5
  }

  /**
   * Freestyle chain link: cut straight into the next power move on the beat. Links 1-2 use
   * top-third moves; from link 3 the chain escalates to the biggest 8-beat power moves, each
   * interrupted by the next link so the moves flow into one continuous freestyle.
   */
  power(chain: number, beat = this.beat): void {
    this.unisonUntil = 0
    const clip = this.pickMove(chain >= 3 ? 4 : 3)
    if (clip) this.startMove(clip, beat)
  }
  /** Pool accessors for the game's crew routines. */
  movePool(beats?: number): string[] {
    return this.moves.filter((m) => !m.mirrored && (!beats || m.beats === beats)).map((m) => m.name)
  }

  /** Lean the upper body toward a typed arrow. */
  gesture(dir: Dir): void {
    const L = 0.12
    this.leanTarget.set(dir === 'left' ? -L : dir === 'right' ? L : 0, dir === 'up' ? -L * 0.7 : dir === 'down' ? L : 0)
    this.leanUntil = this.clock + 0.18
  }

  /** Release a held pose (slump / pose / finale freeze) back into the groove. */
  release(): void {
    const t = this.top()
    if (!t) return
    if (t.kind === 'hold' || t.kind === 'legacy') t.kind = 'legacy'
    if (t.kind === 'legacy') t.to = -1
    if (t.kind === 'move') t.freezeUntil = this.beat
    this.phrase = Number.NaN
  }

  /** Summed effective weight of running clips (test hook: ~0 means the rig fell back to bind pose). */
  poseWeight(): number {
    let w = 0
    // Actions are time-driven manually (timeScale 0), so isRunning() is always false; count
    // scheduled + enabled actions instead.
    for (const s of this.stack) w += s.action.enabled && s.action.isScheduled() ? s.action.getEffectiveWeight() : 0
    return w
  }

  /** Name of the clip currently leading the blend (debug/test hook). */
  current(): string {
    return this.top()?.name ?? ''
  }

  headWorld(out: THREE.Vector3): THREE.Vector3 {
    const h = this.bones.Head
    if (h) h.getWorldPosition(out)
    else this.root.getWorldPosition(out).add(tmpV.set(0, 1.6, 0))
    return out.add(tmpV.set(0, 0.36, 0))
  }

  /** World position of a named bone (hands/feet for VFX anchors). */
  boneWorld(name: string, out: THREE.Vector3): THREE.Vector3 {
    const b = this.bones[name]
    return b ? b.getWorldPosition(out) : this.root.getWorldPosition(out)
  }

  /**
   * Advance the rig. `beat` is the song beat (fractional, may be negative during the lead-in);
   * `energy` 0..1 feeds the accents; `playing` switches between idle and dancing.
   */
  update(beat: number, dt: number, energy: number, bpm = 120, playing = true): void {
    this.clock += dt
    this.beat = beat
    this.beatSec = 60 / bpm
    this.energy = energy
    TIME.value = (TIME.value + dt * 0.08) % 1000
    this.idle = !playing
    this.choreograph(beat)
    // Blend weights: the newest clip fades in, everything below fades out proportionally.
    this.fadeT += dt
    const u = THREE.MathUtils.smootherstep(Math.min(1, this.fadeT / this.fadeDur), 0, 1)
    const n = this.stack.length
    let sum = 0
    for (let i = 0; i < n - 1; i++) {
      const s = this.stack[i]
      s.w = s.w0 * (1 - u)
      sum += s.w
    }
    if (n) this.stack[n - 1].w = Math.max(0, 1 - sum)
    if (u >= 1 && n > 1) {
      for (const s of this.stack.slice(0, -1)) s.action.stop()
      this.stack = this.stack.slice(-1)
      this.stack[0].w = 1
    }
    for (const s of this.stack) {
      s.action.setEffectiveWeight(s.w)
      s.action.time = this.clipTime(s, beat)
    }
    this.mixer.update(dt)
    let mocap = 0
    for (const s of this.stack) if (s.kind === 'groove' || s.kind === 'move') mocap += s.w
    if (mocap > 0.01) for (const [bone, q] of this.fingers) bone.quaternion.multiply(qC.identity().slerp(q, Math.min(1, mocap)))
    this.accents(beat, dt)
    this.rimNow += (this.shine - this.rimNow) * (1 - Math.exp(-dt * 6))
    this.rim.uRim.value = this.rimNow
  }

  private clipTime(s: Play, beat: number): number {
    const d = s.action.getClip().duration
    const eps = 1e-4
    switch (s.kind) {
      case 'groove':
      case 'idle': {
        const ph = (((beat / s.beats) % 1) + 1) % 1
        return Math.min(d - eps, ph * d)
      }
      case 'move':
        return THREE.MathUtils.clamp(beat - s.start, 0, d - eps)
      case 'legacy':
        // Reactions run on the song beat (audio clock) so they stay in step even when frames hitch.
        return THREE.MathUtils.clamp((s.from ?? 0) + (beat - s.start) * this.beatSec * (s.ts ?? 1), 0, d - eps)
      case 'hold':
        return (this.clock - s.start) % d
    }
  }

  /** Decide what the top of the stack should be this frame. */
  private choreograph(beat: number) {
    const t = this.top()
    if (this.idle) {
      if (!t || t.kind !== 'idle') this.push({ name: IDLE.clip, kind: 'idle', start: 0, beats: IDLE.beats }, 0.3)
      this.phrase = Number.NaN
      return
    }
    if (t?.kind === 'hold') return
    if (t?.kind === 'legacy') {
      if (t.to !== -1 && beat < t.start + t.beats - 0.2) return
      if (t.hold && t.to !== -1) {
        this.push({ name: t.hold, kind: 'hold', start: this.clock, beats: 0 }, 0.25)
        return
      }
    } else if (t?.kind === 'move') {
      const endBeat = Math.max(t.start + t.beats, t.freezeUntil ?? 0)
      if (beat < endBeat - 0.35) return
    }
    const phrase = Math.floor(beat / PHRASE)
    if (t?.kind === 'groove' && t.start === phrase) return
    if (t?.kind === 'groove' && phrase === this.phrase) return
    const g = this.pickGroove(phrase)
    if (!g) return
    this.phrase = phrase
    this.push({ name: g.name, kind: 'groove', start: phrase, beats: g.beats }, (t?.kind === 'groove' ? 0.5 : 0.4) * this.beatSec)
  }

  private accents(beat: number, dt: number) {
    const b = this.bones
    if (this.clock > this.leanUntil) this.leanTarget.set(0, 0)
    this.lean.lerp(this.leanTarget, 1 - Math.exp(-dt * 16))
    if (b.spine_02 && (this.lean.x || this.lean.y)) {
      rotateAxis(this.model, b.spine_02, AX_Z, this.lean.x)
      rotateAxis(this.model, b.spine_02, AX_X, this.lean.y)
    }
    if (b.Head && this.idle) {
      const f = ((beat % 1) + 1) % 1
      rotateAxis(this.model, b.Head, AX_X, Math.exp(-f * 7) * 0.04 * (0.4 + this.energy * 0.6))
    }
  }
}

const AX_X = new THREE.Vector3(1, 0, 0)
const AX_Z = new THREE.Vector3(0, 0, 1)
const qA = new THREE.Quaternion()
const qC = new THREE.Quaternion()
const qB = new THREE.Quaternion()
const vA = new THREE.Vector3()

/** Rotate a bone about an axis expressed in model space, on top of the animated pose. */
function rotateAxis(model: THREE.Object3D, bone: THREE.Object3D, axis: THREE.Vector3, angle: number) {
  const parent = bone.parent
  if (!parent || !angle) return
  parent.updateWorldMatrix(true, false)
  qA.setFromRotationMatrix(parent.matrixWorld)
  qB.setFromRotationMatrix(model.matrixWorld).invert()
  qA.premultiply(qB) // parent orientation in model space
  vA.copy(axis).applyQuaternion(qA.invert()).normalize()
  bone.quaternion.premultiply(qB.setFromAxisAngle(vA, angle))
}

/** SkeletonUtils.clone equivalent: deep clone with each skinned mesh rebound to cloned bones. */
function cloneSkinned(src: THREE.Object3D): THREE.Group {
  const clone = src.clone(true) as THREE.Group
  const dstBones = new Map<string, THREE.Bone>()
  clone.traverse((o) => { if ((o as THREE.Bone).isBone) dstBones.set(o.name, o as THREE.Bone) })
  const srcMeshes: THREE.SkinnedMesh[] = []
  src.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) srcMeshes.push(o as THREE.SkinnedMesh) })
  let i = 0
  clone.traverse((o) => {
    const sm = o as THREE.SkinnedMesh
    if (!sm.isSkinnedMesh) return
    const s = srcMeshes[i++]
    sm.bind(new THREE.Skeleton(s.skeleton.bones.map((b) => dstBones.get(b.name)!), s.skeleton.boneInverses), s.bindMatrix)
  })
  return clone
}
