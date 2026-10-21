import * as THREE from 'three'
import type { EnemyRig } from './models'
import { Character, createCharacter, type Clip } from './character'
import { texture } from './assets3d'
import { canvasTexture } from './toon'
import { makeHero, HERO_LOOK, type HeroRig } from './models'

/**
 * Scene actors built on the realistic Character: the hero (with a verlet cape, hand glows,
 * fresnel barrier, ground aura and contact shadow), classmates and bronze hub statues.
 * Every builder falls back to the legacy procedural rig if the character assets are missing.
 */

// ─── Shared helpers ──────────────────────────────────────────────────────

const ambient = new Set<Character>()

/** Keep a character animating without an owner calling update() (NPCs, trapped classmates). */
export function animateAmbient(c: Character): void {
  ambient.add(c)
}

function inScene(o: THREE.Object3D): boolean {
  let p: THREE.Object3D | null = o
  while (p) {
    if ((p as THREE.Scene).isScene) return true
    p = p.parent
  }
  return false
}

/** Advance every ambient character; drops ones that left the scene. */
export function updateAmbient(dt: number): void {
  for (const c of ambient) {
    if (!inScene(c.root)) {
      ambient.delete(c)
      continue
    }
    c.update(dt)
  }
}

let shadowMat: THREE.MeshBasicMaterial | null = null
const shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
/** Soft blob contact shadow (grounds characters even without shadow maps). */
export function contactShadow(radius: number, opacity = 0.55): THREE.Mesh {
  shadowMat ??= new THREE.MeshBasicMaterial({
    map: canvasTexture('contact-shadow', 128, 128, g => {
      const grd = g.createRadialGradient(64, 64, 4, 64, 64, 62)
      grd.addColorStop(0, 'rgba(0,0,0,1)')
      grd.addColorStop(0.5, 'rgba(0,0,0,0.55)')
      grd.addColorStop(1, 'rgba(0,0,0,0)')
      g.fillStyle = grd
      g.fillRect(0, 0, 128, 128)
    }),
    transparent: true, depthWrite: false, color: '#000000', opacity,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  })
  const m = new THREE.Mesh(shadowGeo, shadowMat)
  m.scale.set(radius * 2, 1, radius * 2)
  m.position.y = 0.02
  m.renderOrder = 1
  m.userData.noOutline = true
  return m
}

let glowTex: THREE.Texture | null = null
function glowTexture(): THREE.Texture {
  glowTex ??= canvasTexture('soft-glow', 128, 128, g => {
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64)
    grd.addColorStop(0, 'rgba(255,255,255,1)')
    grd.addColorStop(0.25, 'rgba(255,255,255,0.55)')
    grd.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grd
    g.fillRect(0, 0, 128, 128)
  })
  return glowTex
}

/** Additive camera-facing glow sprite. */
export function glowSprite(color: THREE.ColorRepresentation, size: number, intensity = 2): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(color).multiplyScalar(intensity), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }))
  s.scale.setScalar(size)
  return s
}

/** Fresnel energy shell (hero barrier, elite auras). */
export function fresnelMaterial(color: THREE.ColorRepresentation, strength = 1): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uStrength: { value: strength } },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vP = position;
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uTime; uniform float uStrength;
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main() {
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.5);
        float hex = 0.5 + 0.5 * sin(vP.y * 24.0 - uTime * 3.0) * sin(atan(vP.z, vP.x) * 12.0);
        float a = (f * 0.9 + hex * f * 0.35 + 0.03) * uStrength;
        gl_FragColor = vec4(uColor * 2.0, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
  })
}

// ─── Verlet cape ─────────────────────────────────────────────────────────

const CW = 11
const CH = 16
/**
 * Row placement along the cape length (0 at the collar … 1 at the hem). Rows are packed densely
 * under the collar (≈3 cm) where the cloth wraps the trapezius, shoulder blades and swinging
 * deltoids, and spread out towards the hem (≈10 cm) where it only flutters.
 */
const ROW_S: number[] = Array.from({ length: CH }, (_, y) => (y / (CH - 1)) ** 1.35)
const CAPE_LEN = 1.08
/** Collar width (tight at the neck) and hem width; rows flare with an ease-out in between. */
const TOP_W = 0.3
const BOT_W = 0.74
/** Cloth thickness kept between the cape and the body surface. */
const SKIN = 0.03

/**
 * Back-surface shell measured from the hero body mesh in bind pose (scripts: see NOTES.md v5.1):
 * depth of the back surface *behind the spine curve*, by bind height (rows from SHELL_Y0, every
 * 0.05 m) and sideways offset (columns every 0.05 m from the spine). 0 = no torso there.
 * Covers glutes, lower-back dip, shoulder blades/lats, trapezius and neck.
 */
const SHELL_Y0 = 0.87
const SHELL = [
  [0.023, 0.069, 0.079, 0.070, 0.030, 0.000, 0.000],
  [0.074, 0.090, 0.098, 0.066, 0.000, 0.000, 0.000],
  [0.100, 0.110, 0.111, 0.073, 0.000, 0.000, 0.000],
  [0.117, 0.125, 0.121, 0.057, 0.000, 0.000, 0.000],
  [0.113, 0.115, 0.099, 0.040, 0.000, 0.000, 0.000],
  [0.087, 0.089, 0.079, 0.039, 0.000, 0.000, 0.000],
  [0.083, 0.085, 0.076, 0.042, 0.000, 0.000, 0.000],
  [0.107, 0.126, 0.120, 0.086, 0.000, 0.000, 0.000],
  [0.123, 0.139, 0.150, 0.136, 0.090, 0.000, 0.000],
  [0.148, 0.153, 0.159, 0.159, 0.130, 0.000, 0.000],
  [0.147, 0.155, 0.154, 0.155, 0.139, 0.128, 0.129],
  [0.130, 0.145, 0.142, 0.142, 0.142, 0.139, 0.137],
  [0.119, 0.128, 0.126, 0.129, 0.129, 0.123, 0.121],
  [0.094, 0.100, 0.092, 0.104, 0.081, 0.080, 0.055],
  [0.094, 0.097, 0.088, 0.000, 0.000, 0.000, 0.000],
  [0.073, 0.076, 0.000, 0.000, 0.000, 0.000, 0.000],
]
/** Spine chain and its bind-pose heights (maps a particle height to a shell row). */
const SPINE = ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01'] as const
const SPINE_H = [0.949, 1.072, 1.178, 1.311, 1.52]

function shellDepth(hb: number, ax: number): number {
  const fy = (hb - SHELL_Y0) / 0.05
  const fx = Math.abs(ax) / 0.05
  if (fy < -1 || fy > SHELL.length || fx >= SHELL[0].length - 1) return 0
  const y0 = Math.max(0, Math.min(SHELL.length - 1, Math.floor(fy)))
  const y1 = Math.min(SHELL.length - 1, y0 + 1)
  const x0 = Math.floor(fx)
  const ty = Math.max(0, Math.min(1, fy - y0))
  const tx = fx - x0
  const r0 = SHELL[y0][x0] + (SHELL[y0][x0 + 1] - SHELL[y0][x0]) * tx
  const r1 = SHELL[y1][x0] + (SHELL[y1][x0 + 1] - SHELL[y1][x0]) * tx
  return r0 + (r1 - r0) * ty
}

/**
 * Live shell grid, rebuilt every frame from the skinned torso vertices: the deepest back-surface
 * point per cell of (height along the spine, signed sideways offset). The bind-pose table above
 * is a T-pose; with the arms down and pumping, the trapezius and shoulder blades bulge several
 * centimetres further back, which is exactly where a static shell let the cloth cut in.
 */
const LG_Y0 = 0.72
const LG_DY = 0.05
const LG_ROWS = 21 // 0.72 … 1.72
const LG_DX = 0.05
const LG_HALF = 6 // columns -0.30 … +0.30
const LG_COLS = LG_HALF * 2 + 1
const TORSO_BONES = new Set(['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'clavicle_l', 'clavicle_r'])

type Capsule = { a: string; b: string; r: number; ra?: number }
/**
 * Limb colliders fitted to the same mesh (radii ≈ p90 of the vertex distance to the bone axis).
 * They only push the cloth backwards, so the cape lies over arms and legs that swing behind.
 */
const CAPSULES: Capsule[] = [
  { a: 'clavicle_l', b: 'upperarm_l', r: 0.095, ra: 0.07 },
  { a: 'clavicle_r', b: 'upperarm_r', r: 0.095, ra: 0.07 },
  { a: 'upperarm_l', b: 'lowerarm_l', r: 0.07, ra: 0.09 },
  { a: 'upperarm_r', b: 'lowerarm_r', r: 0.07, ra: 0.09 },
  { a: 'lowerarm_l', b: 'hand_l', r: 0.05, ra: 0.06 },
  { a: 'lowerarm_r', b: 'hand_r', r: 0.05, ra: 0.06 },
  // Palm + fingers: swept-back hands (the Proctor's pen slam) otherwise slip between cloth particles.
  { a: 'hand_l', b: 'middle_03_l', r: 0.06, ra: 0.05 },
  { a: 'hand_r', b: 'middle_03_r', r: 0.06, ra: 0.05 },
  { a: 'thigh_l', b: 'calf_l', r: 0.09, ra: 0.12 },
  { a: 'thigh_r', b: 'calf_r', r: 0.09, ra: 0.12 },
  { a: 'calf_l', b: 'foot_l', r: 0.06, ra: 0.075 },
  { a: 'calf_r', b: 'foot_r', r: 0.06, ra: 0.075 },
]

/** Navy satin lining on the inside of the cape (matches the suit). */
const CAPE_LINING = '#1c2b5c'
/** Hem trim style: the hero's polished gold band, or the bosses' crimson band with gold work. */
export type CapeTrim = 'gold' | 'redgold'
export type CapeOptions = {
  /** Cape length, collar width and hem width in hero units (hero-scale metres). */
  length?: number
  topW?: number
  botW?: number
  lining?: THREE.ColorRepresentation
  trim?: CapeTrim
}
/** Hem trim: fraction of the cape length (v runs 1 at the collar → 0 at the hem). ≈6 cm band. */
const TRIM_V = 0.055
const PIN_V0 = 0.061
const PIN_V1 = 0.069

/**
 * Cape albedo: body colour with a polished-gold hem trim (small diamond embroidery, dark-gold
 * edge line) under a white pinline. Canvas top = collar (flipY), bottom = hem.
 */
function capeFace(key: string, base: THREE.Color, trim: CapeTrim = 'gold'): THREE.CanvasTexture {
  const W = 512, H = 512
  return canvasTexture(`cape-face:${key}:${base.getHexString()}:${trim}`, W, H, g => {
    g.fillStyle = `#${base.getHexString()}`
    g.fillRect(0, 0, W, H)
    const y = (v: number) => H * (1 - v)
    if (trim === 'redgold') {
      redGoldTrim(g, W, H, y)
      return
    }
    // Trim band.
    const t0 = y(TRIM_V)
    const grad = g.createLinearGradient(0, t0, 0, H)
    grad.addColorStop(0, '#f2d887')
    grad.addColorStop(0.5, '#e2bf62')
    grad.addColorStop(1, '#c79c3f')
    g.fillStyle = grad
    g.fillRect(0, t0, W, H - t0)
    // Diamond embroidery along the band (~8 across the hem).
    const n = 8, bw = W / n, mid = (t0 + H) / 2, hh = (H - t0) * 0.32
    g.fillStyle = '#b48a34'
    for (let k = 0; k < n; k += 1) {
      const cx = bw * (k + 0.5)
      g.beginPath()
      g.moveTo(cx, mid - hh); g.lineTo(cx + bw * 0.22, mid); g.lineTo(cx, mid + hh); g.lineTo(cx - bw * 0.22, mid)
      g.closePath(); g.fill()
    }
    g.fillStyle = '#fff3c4'
    for (let k = 0; k < n; k += 1) g.fillRect(bw * (k + 0.5) - 1.5, mid - 1.5, 3, 3)
    // Dark-gold edge at the very hem, and a thin shadow line under the pinline.
    g.fillStyle = '#8f6a26'
    g.fillRect(0, H - 3, W, 3)
    g.fillRect(0, t0, W, 1.5)
    // White pinline.
    g.fillStyle = '#f7f4ea'
    g.fillRect(0, y(PIN_V1), W, y(PIN_V0) - y(PIN_V1))
  })
}

/**
 * Crimson band with gold scroll-diamond embroidery, a polished gold edge at the hem and a gold
 * pinline above (the bosses' academic-regalia trim).
 */
function redGoldTrim(g: CanvasRenderingContext2D, W: number, H: number, y: (v: number) => number): void {
  const t0 = y(TRIM_V)
  const edge = (H - t0) * 0.22
  const grad = g.createLinearGradient(0, t0, 0, H - edge)
  grad.addColorStop(0, '#b3222f')
  grad.addColorStop(0.6, '#8e1523')
  grad.addColorStop(1, '#6d0f1a')
  g.fillStyle = grad
  g.fillRect(0, t0, W, H - t0)
  // Gold work: a row of open diamonds linked by a thin running line.
  const n = 8, bw = W / n, mid = (t0 + H - edge) / 2, hh = (H - edge - t0) * 0.34
  g.strokeStyle = '#e7c46a'
  g.lineWidth = 2.5
  g.beginPath(); g.moveTo(0, mid); g.lineTo(W, mid); g.stroke()
  g.fillStyle = '#d9b154'
  for (let k = 0; k < n; k += 1) {
    const cx = bw * (k + 0.5)
    g.beginPath()
    g.moveTo(cx, mid - hh); g.lineTo(cx + bw * 0.2, mid); g.lineTo(cx, mid + hh); g.lineTo(cx - bw * 0.2, mid)
    g.closePath(); g.fill()
    g.fillStyle = '#8e1523'
    g.beginPath()
    g.moveTo(cx, mid - hh * 0.45); g.lineTo(cx + bw * 0.09, mid); g.lineTo(cx, mid + hh * 0.45); g.lineTo(cx - bw * 0.09, mid)
    g.closePath(); g.fill()
    g.fillStyle = '#d9b154'
  }
  // Polished gold edge at the hem.
  const eg = g.createLinearGradient(0, H - edge, 0, H)
  eg.addColorStop(0, '#f2d887')
  eg.addColorStop(1, '#b8892f')
  g.fillStyle = eg
  g.fillRect(0, H - edge, W, edge)
  g.fillStyle = '#7a5518'
  g.fillRect(0, H - edge, W, 1.5)
  // Gold pinline above the band, with a dark keyline.
  g.fillStyle = '#e2bf62'
  g.fillRect(0, y(PIN_V1), W, y(PIN_V0) - y(PIN_V1))
  g.fillStyle = '#4a0a12'
  g.fillRect(0, t0, W, 1.5)
}

/** Metalness (blue channel). Gold: satin 0.28, trim 0.8, pinline 0. Red-gold: satin 0.28, crimson
 *  band 0.35, gold edge + pinline 0.85. Linear data, not colour. */
function capeMetal(trim: CapeTrim = 'gold'): THREE.CanvasTexture {
  const H = 512
  const t = canvasTexture(`cape-metal:${trim}`, 4, H, g => {
    const y = (v: number) => H * (1 - v)
    g.fillStyle = 'rgb(0,0,71)'
    g.fillRect(0, 0, 4, H)
    if (trim === 'redgold') {
      const t0 = y(TRIM_V)
      g.fillStyle = 'rgb(0,0,90)'
      g.fillRect(0, t0, 4, H - t0)
      g.fillStyle = 'rgb(0,0,217)'
      g.fillRect(0, H - (H - t0) * 0.22, 4, (H - t0) * 0.22)
      g.fillRect(0, y(PIN_V1), 4, y(PIN_V0) - y(PIN_V1))
      return
    }
    g.fillStyle = 'rgb(0,0,204)'
    g.fillRect(0, y(TRIM_V), 4, H - y(TRIM_V))
    g.fillStyle = 'rgb(0,0,0)'
    g.fillRect(0, y(PIN_V1), 4, y(PIN_V0) - y(PIN_V1))
  })
  t.colorSpace = THREE.NoColorSpace
  return t
}

/**
 * Cloth cape simulated with verlet integration. The top row is pinned in a tight U around the
 * base of the neck, just outside the trapezius; rows flare out over the shoulder blades to a wide
 * hem. Structural + shear + skip-one bending constraints keep it a flowing sheet. Collision uses
 * a back-surface shell measured from the body mesh (following the animated spine chain) plus limb
 * capsules, so the cloth drapes *over* shoulder blades, lats and glutes instead of cutting through
 * them. Because the anchors move with the hero, the cloth naturally trails behind the motion.
 */
export class Cape {
  readonly mesh: THREE.Mesh
  private readonly p: THREE.Vector3[] = []
  private readonly q: THREE.Vector3[] = []
  private readonly geo: THREE.PlaneGeometry
  private readonly restW: number[] = []
  /** Rest length of the gap below each row. */
  private readonly restH: number[] = []
  private acc = 0
  private primed = false
  private readonly back = new THREE.Vector3()
  private readonly across = new THREE.Vector3()
  private readonly neck = new THREE.Vector3()
  private readonly tmp = new THREE.Vector3()
  private readonly clav = new THREE.Vector3()
  private twist = 0
  private readonly spine: THREE.Vector3[] = SPINE.map(() => new THREE.Vector3())
  /** Live spine segment directions / lengths (lean), and hip / shoulder across axes (twist). */
  private readonly segUp: THREE.Vector3[] = SPINE.slice(1).map(() => new THREE.Vector3(0, 1, 0))
  private readonly segLen: number[] = SPINE.slice(1).map(() => 0.1)
  private readonly hipAcross = new THREE.Vector3(1, 0, 0)
  private readonly shAcross = new THREE.Vector3(1, 0, 0)
  /** Collar frame: filtered across, tilted with the upper spine. */
  private readonly cUp = new THREE.Vector3(0, 1, 0)
  private readonly cBack = new THREE.Vector3(0, 0, 1)
  private readonly cAcross = new THREE.Vector3(1, 0, 0)
  private readonly cols: { a: THREE.Vector3; b: THREE.Vector3; r: number; ra: number }[] = CAPSULES.map(c => ({ a: new THREE.Vector3(), b: new THREE.Vector3(), r: c.r, ra: c.ra ?? c.r }))
  private colsOk = false
  /** Torso vertices sampled for the live shell: [mesh index, vertex index] pairs. */
  private readonly skin: THREE.SkinnedMesh[] = []
  private samples: Int32Array | null = null
  private pruned = false
  private readonly grid = new Float32Array(LG_ROWS * LG_COLS)
  private readonly gridTmp = new Float32Array(LG_ROWS * LG_COLS)
  private gridOk = false
  /** Output of locate(): height along the spine, sideways / behind offsets and the back axis. */
  private lHb = 0
  private lSide = 0
  private lBehind = 0
  private lBx = 0
  private lBy = 0
  private lBz = 1
  private spineOk = false
  private readonly lastRoot = new THREE.Vector3()
  private readonly rp = new THREE.Vector3()
  private readonly inv = new THREE.Matrix4()
  /** World size relative to the hero (bosses are 2–3×); every length constant is in hero units. */
  private s = 1
  private readonly lenU: number
  private readonly topWU: number
  private readonly botWU: number
  private len = CAPE_LEN
  private topW = TOP_W
  private readonly mats: THREE.MeshPhysicalMaterial[] = []
  private opa = 1

  constructor(color: THREE.ColorRepresentation, private readonly char: Character, private readonly root: THREE.Object3D, opts: CapeOptions = {}) {
    this.lenU = opts.length ?? CAPE_LEN
    this.topWU = opts.topW ?? TOP_W
    this.botWU = opts.botW ?? BOT_W
    const trim = opts.trim ?? 'gold'
    this.geo = new THREE.PlaneGeometry(1, 1, CW - 1, CH - 1)
    const outer = new THREE.Color(color)
    // Outer shell faces away from the body (front faces: across × up = back); the lining is the
    // same simulated sheet drawn from its back faces. Both share the polished hem trim.
    const satin = (face: string, base: THREE.Color, sheen: THREE.Color, side: THREE.Side) =>
      new THREE.MeshPhysicalMaterial({
        // Painted albedo (body colour + hem trim) instead of the tan satin albedo, which tinted
        // gold orange; the satin weave still comes through the normal / roughness maps.
        map: capeFace(face, base, trim),
        metalnessMap: capeMetal(trim),
        normalMap: texture('tex/crepe_satin_nor.webp', { repeat: 2 }),
        roughnessMap: texture('tex/crepe_satin_arm.webp', { repeat: 2 }),
        roughness: 0.75,
        metalness: 1, // scaled per texel by capeMetal(): satin 0.28, trim 0.8, pinline 0
        sheen: 1,
        sheenColor: sheen,
        sheenRoughness: 0.35,
        side,
      })
    const mat = satin('outer', outer, outer.clone().lerp(new THREE.Color('#fff6dc'), 0.5), THREE.FrontSide)
    mat.shadowSide = THREE.DoubleSide
    this.mesh = new THREE.Mesh(this.geo, mat)
    const lin = new THREE.Color(opts.lining ?? CAPE_LINING)
    const linMat = satin('lining', lin, lin.clone().lerp(new THREE.Color(opts.lining ? '#ffe2c8' : '#9fb4ff'), 0.45), THREE.BackSide)
    this.mats.push(mat, linMat)
    const lining = new THREE.Mesh(this.geo, linMat)
    lining.frustumCulled = false
    this.mesh.add(lining)
    this.mesh.castShadow = true
    this.mesh.frustumCulled = false
    this.collectSamples()
    for (let i = 0; i < CW * CH; i += 1) {
      this.p.push(new THREE.Vector3())
      this.q.push(new THREE.Vector3())
    }
    this.rest()
    // UVs follow real length (v = 1 at the collar, 0 at the hem) so the hem trim has a true width.
    const uv = this.geo.getAttribute('uv') as THREE.BufferAttribute
    for (let y = 0; y < CH; y += 1) for (let x = 0; x < CW; x += 1) uv.setXY(y * CW + x, x / (CW - 1), 1 - ROW_S[y])
    uv.needsUpdate = true
  }

  /** Rest lengths at the current world scale. */
  private rest(): void {
    this.len = this.lenU * this.s
    this.topW = this.topWU * this.s
    this.restW.length = 0
    this.restH.length = 0
    for (let y = 0; y < CH; y += 1) {
      const t = ROW_S[y]
      const w = this.topWU + (this.botWU - this.topWU) * (1 - (1 - t) ** 1.8)
      this.restW.push((w * this.s) / (CW - 1))
    }
    for (let y = 0; y < CH - 1; y += 1) this.restH.push(this.len * (ROW_S[y + 1] - ROW_S[y]))
  }

  /** Fade the cloth (boss occlusion fade, dissolve and vanish). */
  set opacity(o: number) {
    const v = Math.max(0, Math.min(1, o))
    if (Math.abs(v - this.opa) < 1e-3) return
    const was = this.opa < 0.999
    this.opa = v
    const now = v < 0.999
    for (const m of this.mats) {
      m.opacity = v
      if (was !== now) {
        m.transparent = now
        m.depthWrite = !now
        m.needsUpdate = true
      }
    }
    this.mesh.visible = v > 0.02
  }

  private anchors(dt: number): void {
    // +across = hero's right, derived from facing so it never flips…
    this.across.set(this.back.z, 0, -this.back.x)
    // …then refined from the clavicles so the collar and back shell follow torso twist (idle and
    // attack stances rotate the shoulders well away from the hips).
    // The twist is low-pass filtered: a held stance is tracked fully, while the ±30° shoulder
    // swing of a run cycle is smoothed out (otherwise the collar whips the cape side to side).
    const cl = this.char.bone('clavicle_l')
    const cr = this.char.bone('clavicle_r')
    let target = 0
    if (cl && cr) {
      const a = cr.getWorldPosition(this.clav).sub(cl.getWorldPosition(this.tmp))
      if (Math.hypot(a.x, a.z) > 0.05 * this.s) {
        let d = Math.atan2(a.z, a.x) - Math.atan2(this.across.z, this.across.x)
        d = Math.atan2(Math.sin(d), Math.cos(d))
        if (Math.abs(d) > Math.PI / 2) d = Math.atan2(Math.sin(d + Math.PI), Math.cos(d + Math.PI))
        target = Math.max(-0.7, Math.min(0.7, d))
      }
    }
    this.twist += (target - this.twist) * Math.min(1, dt * 2.5)
    const ang = Math.atan2(this.across.z, this.across.x) + this.twist
    this.across.set(Math.cos(ang), 0, Math.sin(ang))
    this.back.set(-this.across.z, 0, this.across.x)
    this.spineOk = true
    for (let k = 0; k < SPINE.length; k += 1) {
      const b = this.char.bone(SPINE[k])
      if (!b) {
        this.spineOk = false
        break
      }
      b.getWorldPosition(this.spine[k])
    }
    if (this.spineOk) this.neck.copy(this.spine[SPINE.length - 1])
    else this.root.getWorldPosition(this.neck).add(this.tmp.set(0, 1.52 * this.s, 0))
    // Live torso frame: segment directions carry the run lean; across axes carry hip and shoulder
    // twist. The collision shell is evaluated in this frame, so a leaning, twisting torso can't
    // swing its shoulder blades or glutes out through the cloth.
    const nSeg = SPINE.length - 1
    for (let k = 0; k < nSeg; k += 1) {
      const u = this.segUp[k]
      if (this.spineOk) {
        u.subVectors(this.spine[k + 1], this.spine[k])
        const l = u.length()
        if (l > 1e-4) { u.divideScalar(l); this.segLen[k] = l } else { u.set(0, 1, 0); this.segLen[k] = (SPINE_H[k + 1] - SPINE_H[k]) * this.s }
      } else {
        u.set(0, 1, 0)
        this.segLen[k] = (SPINE_H[k + 1] - SPINE_H[k]) * this.s
      }
    }
    this.liveAcross(this.hipAcross, 'thigh_l', 'thigh_r', this.segUp[0])
    this.liveAcross(this.shAcross, 'clavicle_l', 'clavicle_r', this.segUp[nSeg - 1])
    // Collar: filtered (horizontal) across, orthogonalised against the upper spine.
    this.cUp.copy(this.segUp[nSeg - 1])
    if (this.cUp.y < 0.5) this.cUp.set(0, 1, 0)
    this.cAcross.copy(this.across).addScaledVector(this.cUp, -this.across.dot(this.cUp)).normalize()
    this.cBack.crossVectors(this.cAcross, this.cUp).normalize()
    this.colsOk = true
    for (let k = 0; k < CAPSULES.length; k += 1) {
      const c = CAPSULES[k]
      const ba = this.char.bone(c.a)
      const bb = this.char.bone(c.b)
      if (!ba || !bb) {
        // Park a capsule whose bones this rig lacks far away; the rest keep colliding.
        this.cols[k].a.set(1e6, 1e6, 1e6)
        this.cols[k].b.set(1e6, 1e6, 1e6)
        continue
      }
      ba.getWorldPosition(this.cols[k].a)
      bb.getWorldPosition(this.cols[k].b)
    }
  }

  /** Unit across axis from a left/right bone pair, orthogonal to `up`, sign-matched to +across. */
  private liveAcross(out: THREE.Vector3, left: string, right: string, up: THREE.Vector3): void {
    const bl = this.char.bone(left)
    const br = this.char.bone(right)
    if (bl && br) {
      br.getWorldPosition(out).sub(bl.getWorldPosition(this.tmp))
      out.addScaledVector(up, -out.dot(up))
      const l = out.length()
      if (l > 0.03 * this.s) {
        out.divideScalar(l)
        if (out.dot(this.across) < 0) out.negate()
        return
      }
    }
    out.copy(this.across).addScaledVector(up, -this.across.dot(up)).normalize()
  }

  /** Collar: a shallow U hugging the back and sides of the neck base, resting on the trapezius. */
  private pin(x: number, out: THREE.Vector3): THREE.Vector3 {
    const k = x / (CW - 1) - 0.5 // -0.5 … 0.5
    const s = Math.sin(k * Math.PI * 0.8) // -0.95 … 0.95
    const c = Math.cos(k * Math.PI * 0.8)
    const backOff = (0.09 + 0.03 * c) * this.s // 0.12 behind the neck at the centre, ~0.10 at the ends
    return out
      .copy(this.neck)
      .addScaledVector(this.cAcross, s * (this.topW * 0.5))
      .addScaledVector(this.cBack, backOff)
      .addScaledVector(this.cUp, (0.012 + (1 - c) * 0.03) * this.s)
  }

  /** Advance the cloth. `facing` is the hero body yaw (rig faces -Z). */
  update(dt: number, facing: number, t: number, speed: number): void {
    this.char.root.getWorldScale(this.rp)
    const sc = (this.rp.x + this.rp.z) * 0.5 || 1
    if (Math.abs(sc - this.s) > this.s * 0.01) {
      this.s = sc
      this.rest()
    }
    // Teleports / respawns: re-settle instead of whipping the sheet across the room.
    this.root.getWorldPosition(this.rp)
    if (this.primed && this.rp.distanceTo(this.lastRoot) > 2 * this.s) this.primed = false
    this.back.set(Math.sin(facing), 0, Math.cos(facing))
    this.anchors(this.primed ? dt : 10)
    this.updateLiveShell()
    if (!this.primed) {
      for (let y = 0; y < CH; y += 1) for (let x = 0; x < CW; x += 1) {
        const i = y * CW + x
        const w = this.restW[y] * (CW - 1)
        const k = x / (CW - 1) - 0.5
        this.p[i].copy(this.neck).addScaledVector(this.across, k * w).addScaledVector(this.back, (0.16 + y * 0.012) * this.s)
        this.p[i].y = this.neck.y - ROW_S[y] * this.len
        if (y === 0) this.pin(x, this.p[i])
        this.q[i].copy(this.p[i])
      }
      this.primed = true
      this.root.getWorldPosition(this.lastRoot)
    }
    const step = 1 / 90
    const rootPos = this.root.getWorldPosition(this.tmp)
    const rx = rootPos.x, ry = rootPos.y, rz = rootPos.z
    // Frame hitches: the sim only catches up 0.1 s at a time, so carry the cloth along with the
    // hero for the time it skips (otherwise the collar jumps metres and the sheet crumples).
    const total = this.acc + dt
    const simT = Math.min(total, 0.1)
    if (total > simT) {
      const skip = 1 - simT / total
      const dx = (rx - this.lastRoot.x) * skip
      const dy = (ry - this.lastRoot.y) * skip
      const dz = (rz - this.lastRoot.z) * skip
      for (let i = 0; i < CW * CH; i += 1) {
        this.p[i].x += dx; this.p[i].y += dy; this.p[i].z += dz
        this.q[i].x += dx; this.q[i].y += dy; this.q[i].z += dz
      }
    }
    this.lastRoot.set(rx, ry, rz)
    this.acc = simT
    while (this.acc >= step) {
      this.acc -= step
      for (let x = 0; x < CW; x += 1) {
        this.pin(x, this.p[x])
        this.q[x].copy(this.p[x])
      }
      const flutter = 0.4 + speed * 0.12
      for (let i = CW; i < CW * CH; i += 1) {
        const p = this.p[i]
        const q = this.q[i]
        const vx = (p.x - q.x) * 0.982
        const vy = (p.y - q.y) * 0.982
        const vz = (p.z - q.z) * 0.982
        q.copy(p)
        const row = ROW_S[Math.floor(i / CW)]
        const w = Math.sin(t * 9 + row * 5 + (i % CW) * 0.8) * flutter * row
        p.x += vx + this.back.x * w * step * step * 6 * this.s
        p.y += vy - 9.8 * step * step
        p.z += vz + this.back.z * w * step * step * 6 * this.s
      }
      for (let it = 0; it < 5; it += 1) {
        for (let y = 0; y < CH; y += 1) {
          const rw = this.restW[y]
          const rwN = y < CH - 1 ? (rw + this.restW[y + 1]) * 0.5 : rw
          for (let x = 0; x < CW; x += 1) {
            const i = y * CW + x
            const top = y === 0
            if (x < CW - 1 && !top) this.solve(i, i + 1, rw, false, 1)
            if (y < CH - 1) this.solve(i, i + CW, this.restH[y], top, 1)
            if (x < CW - 1 && y < CH - 1) {
              const d = Math.hypot(rwN, this.restH[y])
              this.solve(i, i + CW + 1, d, top, 0.7)
              this.solve(i + 1, i + CW, d, top, 0.7)
            }
            // Bending (skip-one): stops the sheet folding up into a narrow strip.
            if (x < CW - 2 && !top) this.solve(i, i + 2, rw * 2, false, 0.45)
            if (y < CH - 2) this.solve(i, i + CW * 2, this.restH[y] + this.restH[y + 1], top, 0.3)
          }
        }
        this.collide(ry)
      }
    }
    // Write vertices in the mesh parent's space (a boss root also scales on teleport / death).
    const par = this.mesh.parent
    if (par) {
      par.updateWorldMatrix(true, false)
      this.inv.copy(par.matrixWorld).invert()
    } else this.inv.makeTranslation(-rx, -ry, -rz)
    const pos = this.geo.getAttribute('position') as THREE.BufferAttribute
    const v = this.rp
    for (let i = 0; i < CW * CH; i += 1) {
      v.copy(this.p[i]).applyMatrix4(this.inv)
      pos.setXYZ(i, v.x, v.y, v.z)
    }
    pos.needsUpdate = true
    this.geo.computeVertexNormals()
    this.geo.computeBoundingSphere()
  }

  private collide(groundY: number): void {
    const bx = this.back.x
    const bz = this.back.z
    // The pinned collar row collides too: pins are placed in the smoothed torso frame, so when the
    // shoulders twist mid-stride the shoulder blade / deltoid would otherwise swing straight
    // through the strip between the collar and the first free row. Pushed pins ride up over them.
    const nx = this.neck.x, ny = this.neck.y, nz = this.neck.z
    const Ux = this.cUp.x, Uy = this.cUp.y, Uz = this.cUp.z
    const S = this.s
    const lenK = this.lenU / CAPE_LEN
    // No floor while the body itself is below it (a boss rising through the floor on its intro).
    const floorOk = ny - groundY > this.len * 0.6
    const floor = groundY + 0.04 * S
    for (let i = 0; i < CW * CH; i += 1) {
      const p = this.p[i]
      if (i >= CW) {
        if (floorOk && p.y < floor) p.y = floor
        // Never billow up over the shoulders / head. Measured along the (leaning) upper-spine axis
        // and applied *before* the body collision below, so a sprint lean can't clamp the cloth
        // down into the upper back (the body always gets the last word).
        const cap = (0.01 - ROW_S[Math.floor(i / CW)] * 0.39 * lenK) * S
        const h = (p.x - nx) * Ux + (p.y - ny) * Uy + (p.z - nz) * Uz
        if (h > cap) {
          const d = h - cap
          p.x -= Ux * d; p.y -= Uy * d; p.z -= Uz * d
        }
      }
      if (this.colsOk) {
        for (const c of this.cols) {
          // Closest point on segment a→b, radius tapering from ra (at a) to r (at b).
          const abx = c.b.x - c.a.x
          const aby = c.b.y - c.a.y
          const abz = c.b.z - c.a.z
          const len2 = abx * abx + aby * aby + abz * abz || 1e-6
          let u = ((p.x - c.a.x) * abx + (p.y - c.a.y) * aby + (p.z - c.a.z) * abz) / len2
          u = u < 0 ? 0 : u > 1 ? 1 : u
          const cx = c.a.x + abx * u
          const cy = c.a.y + aby * u
          const cz = c.a.z + abz * u
          const dx = p.x - cx
          const dy = p.y - cy
          const dz = p.z - cz
          const rad = (c.ra + (c.r - c.ra) * u + SKIN) * S
          const d2 = dx * dx + dy * dy + dz * dz
          if (d2 >= rad * rad) continue
          // Resolve along the back direction only: the cape always passes *behind* a limb and
          // drapes over it. (Radial pushes shove the edges sideways over the spine when an arm or
          // leg sits behind the torso, folding the sheet in half.)
          const along = dx * bx + dz * bz
          const perp2 = d2 - along * along
          const out = Math.sqrt(Math.max(0, rad * rad - perp2))
          if (along < out) {
            p.x += bx * (out - along)
            p.z += bz * (out - along)
          }
        }
      }
      // Torso shell (live grid, static bind-pose table as fallback) in the live spine frame; never
      // less than a thin plane behind the spine, so it can't slip between the legs or in front
      // of the arms.
      if (this.locate(p.x, p.y, p.z) && this.lHb > 0.35 && this.lHb < 1.72) {
        const side = this.lSide / S
        const depth = this.gridOk ? this.gridDepth(this.lHb, side) : shellDepth(this.lHb, side)
        const need = (Math.max(depth, 0.03) + SKIN) * S
        if (this.lBehind < need) {
          const push = need - this.lBehind
          p.x += this.lBx * push
          p.y += this.lBy * push
          p.z += this.lBz * push
        }
      }
    }
  }

  /**
   * Express a world point in the live torso frame: segment of the spine chain it sits along, its
   * bind-equivalent height (hb), signed sideways offset and depth behind the spine, plus the local
   * back axis (across × up, carrying lean and hip→shoulder twist). Returns false without a spine.
   */
  private locate(px: number, py: number, pz: number): boolean {
    if (!this.spineOk) return false
    const S = this.spine
    const last = S.length - 1
    let k = 0
    let u = 0
    for (;;) {
      const U = this.segUp[k]
      u = ((px - S[k].x) * U.x + (py - S[k].y) * U.y + (pz - S[k].z) * U.z) / this.segLen[k]
      if (u > 1 && k < last - 1) { k += 1; continue }
      break
    }
    const U = this.segUp[k]
    const ux = U.x, uy = U.y, uz = U.z
    const along = u * this.segLen[k]
    const sx = S[k].x + ux * along, sy = S[k].y + uy * along, sz = S[k].z + uz * along
    let hb: number
    if (u < 0) hb = SPINE_H[0] + along / this.s // below the pelvis: real distance (hero units)
    else if (u > 1) hb = SPINE_H[last] + ((u - 1) * this.segLen[k]) / this.s // above the neck
    else hb = SPINE_H[k] + (SPINE_H[k + 1] - SPINE_H[k]) * u
    const tw = Math.max(0, Math.min(1, (hb - SPINE_H[0]) / (SPINE_H[3] - SPINE_H[0])))
    let cx = this.hipAcross.x + (this.shAcross.x - this.hipAcross.x) * tw
    let cy = this.hipAcross.y + (this.shAcross.y - this.hipAcross.y) * tw
    let cz = this.hipAcross.z + (this.shAcross.z - this.hipAcross.z) * tw
    const cu = cx * ux + cy * uy + cz * uz
    cx -= ux * cu; cy -= uy * cu; cz -= uz * cu
    const cl = Math.hypot(cx, cy, cz) || 1
    cx /= cl; cy /= cl; cz /= cl
    this.lBx = cy * uz - cz * uy
    this.lBy = cz * ux - cx * uz
    this.lBz = cx * uy - cy * ux
    const dx = px - sx, dy = py - sy, dz = pz - sz
    this.lHb = hb
    this.lSide = dx * cx + dy * cy + dz * cz
    this.lBehind = dx * this.lBx + dy * this.lBy + dz * this.lBz
    return true
  }

  /** Torso vertices (dominant bone in the spine / clavicle chain) of the character's skinned meshes. */
  private collectSamples(): void {
    const list: number[] = []
    this.char.root.traverse(o => {
      const m = o as THREE.SkinnedMesh
      if (!m.isSkinnedMesh || !m.skeleton) return
      const si = m.geometry.getAttribute('skinIndex')
      const sw = m.geometry.getAttribute('skinWeight')
      if (!si || !sw) return
      const names = m.skeleton.bones.map(b => b.name)
      const mi = this.skin.length
      let used = false
      for (let v = 0; v < si.count; v += 1) {
        let bi = 0, bw = -1
        for (let c = 0; c < 4; c += 1) {
          const w = sw.getComponent(v, c)
          if (w > bw) { bw = w; bi = si.getComponent(v, c) }
        }
        if (TORSO_BONES.has(names[bi] ?? '')) { list.push(mi, v); used = true }
      }
      if (used) this.skin.push(m)
    })
    this.samples = list.length ? Int32Array.from(list) : null
  }

  /** Rebuild the live shell grid from the current skinned torso (CPU-skins ~1k vertices). */
  private updateLiveShell(): void {
    this.gridOk = false
    if (!this.samples || !this.spineOk) return
    this.char.root.updateMatrixWorld(true)
    const g = this.gridTmp
    g.fill(0)
    const v = this.tmp
    const keep: number[] | null = this.pruned ? null : []
    const smp = this.samples
    for (let n = 0; n < smp.length; n += 2) {
      const m = this.skin[smp[n]]
      m.getVertexPosition(smp[n + 1], v).applyMatrix4(m.matrixWorld)
      if (!this.locate(v.x, v.y, v.z)) return
      // First pass keeps only back-half vertices (front of the chest never touches the cape).
      if (keep && this.lBehind > -0.04 * this.s) keep.push(smp[n], smp[n + 1])
      if (this.lBehind <= 0) continue
      const r = Math.round((this.lHb - LG_Y0) / LG_DY)
      const c = Math.round(this.lSide / this.s / LG_DX) + LG_HALF
      if (r < 0 || r >= LG_ROWS || c < 0 || c >= LG_COLS) continue
      const i = r * LG_COLS + c
      const b = this.lBehind / this.s
      if (b > g[i]) g[i] = b
    }
    if (keep) {
      this.samples = keep.length ? Int32Array.from(keep) : null
      this.pruned = true
    }
    // Dilate by one cell in each direction: bilinear lookups between bins stay conservative.
    const o = this.grid
    for (let r = 0; r < LG_ROWS; r += 1) for (let c = 0; c < LG_COLS; c += 1) {
      let mx = 0
      for (let dr = -1; dr <= 1; dr += 1) for (let dc = -1; dc <= 1; dc += 1) {
        const rr = r + dr, cc = c + dc
        if (rr < 0 || rr >= LG_ROWS || cc < 0 || cc >= LG_COLS) continue
        const val = g[rr * LG_COLS + cc]
        if (val > mx) mx = val
      }
      o[r * LG_COLS + c] = mx
    }
    this.gridOk = true
  }

  private gridDepth(hb: number, side: number): number {
    const fy = (hb - LG_Y0) / LG_DY
    const fx = side / LG_DX + LG_HALF
    if (fy < 0 || fy > LG_ROWS - 1 || fx < 0 || fx > LG_COLS - 1) return 0
    const y0 = Math.min(LG_ROWS - 2, Math.floor(fy))
    const x0 = Math.min(LG_COLS - 2, Math.floor(fx))
    const ty = fy - y0
    const tx = fx - x0
    const G = this.grid
    const a = G[y0 * LG_COLS + x0] + (G[y0 * LG_COLS + x0 + 1] - G[y0 * LG_COLS + x0]) * tx
    const b = G[(y0 + 1) * LG_COLS + x0] + (G[(y0 + 1) * LG_COLS + x0 + 1] - G[(y0 + 1) * LG_COLS + x0]) * tx
    return a + (b - a) * ty
  }

  private solve(i: number, j: number, rest: number, pinI: boolean, stiff: number): void {
    const a = this.p[i]
    const b = this.p[j]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const dz = b.z - a.z
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6
    const diff = ((d - rest) / d) * stiff
    if (pinI) {
      b.x -= dx * diff
      b.y -= dy * diff
      b.z -= dz * diff
    } else {
      a.x += dx * diff * 0.5
      a.y += dy * diff * 0.5
      a.z += dz * diff * 0.5
      b.x -= dx * diff * 0.5
      b.y -= dy * diff * 0.5
      b.z -= dz * diff * 0.5
    }
  }

  reset(): void {
    this.primed = false
  }
}

// ─── Hero ────────────────────────────────────────────────────────────────

export type HeroView = {
  root: THREE.Group
  /** Yawed by gameplay facing. */
  body: THREE.Group
  char: Character | null
  legacy: HeroRig | null
  cape: Cape | null
  aura: THREE.Mesh
  barrier: THREE.Mesh
  handL: THREE.Sprite
  handR: THREE.Sprite
}

function attachHero(v: HeroView): void {
  const char = createCharacter({ variant: 'hero', rim: '#7ef9ff', rimStrength: 0.4 })
  if (!char) return
  if (v.legacy) {
    v.legacy.body.removeFromParent()
    v.legacy = null
  }
  v.body.add(char.root)
  v.char = char
  v.cape = new Cape('#cfae55', char, v.root) // burnished gold over the navy suit
  v.root.add(v.cape.mesh)
  char.bone('hand_l')?.add(v.handL)
  char.bone('hand_r')?.add(v.handR)
  // Bones may carry armature scale; keep the glow a constant world size.
  char.root.updateWorldMatrix(true, true)
  for (const s of [v.handL, v.handR]) {
    const ws = new THREE.Vector3()
    s.parent?.getWorldScale(ws)
    s.scale.setScalar(0.5 / (ws.x || 1))
  }
}

/** Swap the legacy rig for the realistic hero once its assets are loaded. */
export function upgradeHeroView(v: HeroView): boolean {
  if (!v.char) attachHero(v)
  return !!v.char
}

export function makeHeroView(): HeroView {
  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)
  const handL = glowSprite('#7ef9ff', 0.5, 2.5)
  const handR = glowSprite('#7ef9ff', 0.5, 2.5)
  handL.visible = handR.visible = false
  const aura = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color('#7ef9ff').multiplyScalar(1.4), transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }))
  aura.position.y = 0.035
  root.add(aura, contactShadow(0.55))
  const barrier = new THREE.Mesh(new THREE.SphereGeometry(1.15, 32, 20), fresnelMaterial('#7ef9ff', 0.9))
  barrier.position.y = 1.0
  barrier.visible = false
  root.add(barrier)
  const v: HeroView = { root, body, char: null, legacy: null, cape: null, aura, barrier, handL, handR }
  attachHero(v)
  if (!v.char) {
    v.legacy = makeHero()
    body.add(v.legacy.body)
  }
  return v
}

// ─── Classmates ──────────────────────────────────────────────────────────

export type ClassmateActor = { root: THREE.Group; body: THREE.Group; char: Character | null; legacy: HeroRig | null }

/** A rescued/trapped classmate. `trapped` plays a pushing-against-the-crystal loop. */
export function makeClassmate(id: string, color: string, mode: 'idle' | 'trapped'): ClassmateActor {
  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)
  const char = createCharacter({ variant: id, rim: color, rimStrength: 0.25 })
  let legacy: HeroRig | null = null
  if (char) {
    body.add(char.root)
    char.play(mode === 'trapped' ? 'Push_Loop' : 'Idle_Talking_Loop', { fade: 0, from: Math.random() })
    animateAmbient(char)
  } else {
    legacy = makeHero({ ...HERO_LOOK, suit: color, cape: null, mask: null, hair: '#2a1b3d', eyes: '#ffffff' }, false)
    body.add(legacy.body)
    if (mode === 'trapped') {
      legacy.armL.rotation.x = -Math.PI
      legacy.armR.rotation.x = -Math.PI
    }
  }
  root.add(contactShadow(0.5))
  return { root, body, char, legacy }
}

// ─── Hub statues ─────────────────────────────────────────────────────────

const STATUE_POSES: Array<[string, number]> = [['Spell_Simple_Shoot', 0.45], ['Punch_Cross', 0.4], ['Sword_Attack', 0.42], ['Spell_Simple_Enter', 0.7]]
let bronze: THREE.MeshStandardMaterial | null = null

/** A bronze sculpture of a hero caught mid-pose on a marble plinth. Returns null without assets. */
export function makeBronzeHero(pose: number): THREE.Group | null {
  const char = createCharacter({ variant: 'hero', shadows: true })
  if (!char) return null
  bronze ??= new THREE.MeshStandardMaterial({
    color: '#9a6b3c', metalness: 1, roughness: 0.38,
    normalMap: char.bodyMaterial.normalMap, normalScale: new THREE.Vector2(1, -1),
  })
  char.model.traverse(o => {
    const m = o as THREE.Mesh
    if (m.isMesh) m.material = bronze!
  })
  const [clip, at] = STATUE_POSES[pose % STATUE_POSES.length]
  char.play(clip, { fade: 0, loop: false })
  char.update(char.duration(clip) * at)
  const g = new THREE.Group()
  g.add(char.root)
  return g
}

// ─── Humanoid enemies ────────────────────────────────────────────────────

/**
 * Detention Shade / Bruiser on the realistic body. Returns null until the variant is loaded,
 * so callers fall back to the procedural rigs.
 */
export function makeHumanoidEnemy(type: 'shade' | 'bruiser', tint: string, elite: boolean): EnemyRig | null {
  const isShade = type === 'shade'
  const char = createCharacter({ variant: type, rim: isShade ? '#ff4fd8' : tint, rimStrength: isShade ? 0.9 : 0.35, dissolve: true })
  if (!char) return null
  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)
  body.add(char.root)
  const k = isShade ? (elite ? 1.2 : 1.0) : (elite ? 1.5 : 1.32)
  char.root.scale.setScalar(k)
  const parts: Record<string, THREE.Object3D> = {}
  if (isShade) {
    // Smoky shroud glow at the feet and burning eyes.
    const wisp = glowSprite('#b04dff', 1.6, 0.5)
    wisp.position.y = 0.25
    body.add(wisp)
    parts.wisp = wisp
  } else {
    // Varsity number on the back, lit by the team colour.
    const num = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.26), new THREE.MeshStandardMaterial({
      map: canvasTexture('num00-pbr', 128, 96, g => {
        g.fillStyle = '#fff'
        g.font = '86px Bangers, Impact, sans-serif'
        g.textAlign = 'center'
        g.fillText('00', 64, 84)
      }), transparent: true, roughness: 0.8,
    }))
    const spine = char.bone('spine_03')
    if (spine) {
      spine.add(num)
      const ws = new THREE.Vector3()
      spine.updateWorldMatrix(true, false)
      spine.getWorldScale(ws)
      num.scale.setScalar(1 / (ws.x || 1) * k)
      num.position.set(0, 0.1 / (ws.x || 1), -0.17 / (ws.x || 1))
      num.rotation.y = Math.PI
    }
  }
  root.add(contactShadow(isShade ? 0.55 : 0.8))
  if (elite) {
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 8, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffcf4d').multiplyScalar(1.6), toneMapped: false }))
    halo.rotation.x = Math.PI / 2
    parts.halo = halo
    body.add(halo)
  }
  char.play('Idle_Loop')
  return { root, body, parts, flash: [], char }
}
// ─── Rescue sequence ─────────────────────────────────────────────────────
export type RescueEvent = 'land' | 'thud' | 'standing' | 'dance'
/**
 * A freed classmate drops out of the detention crystal, hits the floor, topples onto their back,
 * picks themselves up (Death01 played in reverse up to its stagger crouch, then a blend to idle)
 * and celebrates with a victory dance while facing the hero.
 */
export class RescueSequence {
  private phase: 'fall' | 'topple' | 'down' | 'rise' | 'stand' | 'dance' = 'fall'
  private t = 0
  private vy = 0
  done = false
  constructor(
    private readonly actor: { root: THREE.Object3D; body: THREE.Object3D; char: Character | null },
    /** Each classmate has their own routine (dances.ts); falls back to the library dance. */
    private readonly dance: Clip = 'Dance_Loop',
  ) {
    actor.char?.play('Jump_Loop', { fade: 0.12 })
  }
  update(dt: number, hero: THREE.Vector3): RescueEvent | null {
    if (this.done) return null
    const body = this.actor.body
    const c = this.actor.char
    this.t += dt
    // Turn to face the hero (characters face -Z), easing along the shortest arc.
    const p = this.actor.root.position
    const want = Math.atan2(-(hero.x - p.x), -(hero.z - p.z))
    const diff = Math.atan2(Math.sin(want - body.rotation.y), Math.cos(want - body.rotation.y))
    body.rotation.y += diff * Math.min(1, dt * (this.phase === 'fall' || this.phase === 'dance' || this.phase === 'stand' ? 6 : 1.5))
    const D = c ? c.duration('Death01') : 2
    switch (this.phase) {
      case 'fall':
        this.vy -= 22 * dt
        body.position.y = Math.max(0, body.position.y + this.vy * dt)
        if (body.position.y > 0) return null
        if (!c) {
          this.phase = 'dance'
          return 'dance'
        }
        // Feet hit the floor, knees buckle, and they go over backwards.
        c.play('Death01', { fade: 0.08, loop: false, from: 0.95 / D, speed: 1.6 })
        this.phase = 'topple'
        this.t = 0
        return 'land'
      case 'topple':
        if (this.t < (1.5 - 0.95) / 1.6) return null
        this.phase = 'down'
        this.t = 0
        return 'thud'
      case 'down':
        if (this.t < 0.45) return null
        // Getting up: the fall, reversed, back to the stagger crouch.
        c!.play('Death01', { fade: 0.1, loop: false, from: 1.5 / D, speed: -1.15, force: true })
        this.phase = 'rise'
        this.t = 0
        return null
      case 'rise':
        if (this.t < (1.5 - 0.62) / 1.15) return null
        c!.play('Idle_Loop', { fade: 0.4 })
        this.phase = 'stand'
        this.t = 0
        return 'standing'
      case 'stand':
        if (this.t < 0.55) return null
        c!.play(c!.has(this.dance) ? this.dance : 'Dance_Loop', { fade: 0.3 })
        this.phase = 'dance'
        this.t = 0
        return 'dance'
      case 'dance':
        this.done = true
        return null
    }
  }
}
