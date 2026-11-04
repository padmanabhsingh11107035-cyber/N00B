/**
 * Everything on the road the squad interacts with that is not a zombie or a boss.
 *
 *  Gates — holographic panels; the lane you run through applies its effect. Shootable gates
 *          raise their value while you shoot them.
 *  Traps — saw (sweeping blade), spikes (cycling plate), flame (alternating nozzle bar), laser
 *          (timed fence), crusher (half-road press), mines (proximity + shootable), toxic (pool),
 *          airstrike (targeted bombardment zone). Every trap is telegraphed (warning lights,
 *          ground marks, sounds) and always leaves a safe line or safe timing.
 *  Props — explosive barrels (shoot them early!), barricades (block the road until destroyed),
 *          enemy turrets, supply crates (loot) and rescue cages (+soldiers).
 * World z = −distance. Every hazard owns its meshes and removes them once far behind the squad.
 */
import * as THREE from 'three'
import type { Audio } from '../engine/audio'
import type { Enemies } from './enemies'
import type { Fx } from './fx'
import type { Squad } from './squad'
import { type Chunk, type GateSpec, ROAD_HALF, type TrapKind } from './procgen'
import { type GateOp, gateLabel, gateTone, raiseGate } from './rules'
import { type VatCrowd } from './vat'

export const FONT_DISPLAY = '"Anton", "Impact", "Arial Narrow", sans-serif'

export interface HazardCtx {
  fx: Fx
  audio: Audio
  squad: Squad
  enemies: Enemies
  /** kill soldiers matching pred (respects Blast Shield); returns real soldiers lost */
  trapKill: (pred: (x: number, z: number) => boolean, chance: number, cause: TrapKind | 'barrel' | 'turret' | 'bomb', x: number, z: number) => number
  explode: (x: number, z: number, r: number, zombieDmg: number, hurtsSquad: boolean) => void
  shake: (a: number) => void
  onGate: (spec: GateSpec, value: number, x: number, z: number) => void
  onLoot: (loot: 'weapon' | 'grenade' | 'medkit' | 'coins', x: number, z: number) => void
  onRescue: (n: number, x: number, z: number) => void
  onLost: (n: number, cause: string, x: number, z: number) => void
  onDestroyed: (kind: string, x: number, z: number, coins: number) => void
  hpScale: () => number
  trapScale: () => number
}

const TONE_COLOR: Record<string, number> = { good: 0x2f8fff, bad: 0xff3226, gold: 0xf0a020, heal: 0x2fd07a, risk: 0xa050ff }
const mat = {
  metal: new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.55, metalness: 0.25 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.7, metalness: 0.1 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x8a8e94, roughness: 0.38, metalness: 0.35 }),
  hazard: new THREE.MeshStandardMaterial({ color: 0xd8a822, roughness: 0.6 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x6a4a30, roughness: 0.85 }),
  concrete: new THREE.MeshStandardMaterial({ color: 0x8e8a82, roughness: 0.95 }),
  crate: new THREE.MeshStandardMaterial({ color: 0x4d5a36, roughness: 0.8 }),
  barrel: new THREE.MeshStandardMaterial({ color: 0xb8261c, roughness: 0.5, metalness: 0.15 }),
  sand: new THREE.MeshStandardMaterial({ color: 0x9a8a62, roughness: 0.95 }),
}
function stripeTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 32
  const g = cv.getContext('2d')!
  g.fillStyle = '#1b1b1b'; g.fillRect(0, 0, 128, 32)
  g.fillStyle = '#e0b02a'
  for (let x = -32; x < 160; x += 32) { g.beginPath(); g.moveTo(x, 32); g.lineTo(x + 16, 32); g.lineTo(x + 32, 0); g.lineTo(x + 16, 0); g.fill() }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}
const STRIPES = stripeTexture()
const hazardStripe = new THREE.MeshStandardMaterial({ map: STRIPES, roughness: 0.7 })

function labelSprite(text: string, color: string, w = 3, sub = ''): THREE.Sprite {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 192
  const g = cv.getContext('2d')!
  g.font = `110px ${FONT_DISPLAY}`
  g.textAlign = 'center'; g.textBaseline = 'middle'
  g.lineWidth = 14; g.strokeStyle = 'rgba(0,0,0,0.85)'; g.strokeText(text, 256, sub ? 80 : 96)
  g.fillStyle = color; g.fillText(text, 256, sub ? 80 : 96)
  if (sub) { g.font = `44px ${FONT_DISPLAY}`; g.lineWidth = 8; g.strokeText(sub, 256, 160); g.fillStyle = '#fff'; g.fillText(sub, 256, 160) }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: false }))
  sp.scale.set(w, w * 0.375, 1)
  sp.renderOrder = 15
  return sp
}

// ───────────────────────── Gate panel ─────────────────────────
const GATE_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }'
const GATE_FS = /* glsl */`
  uniform sampler2D uText; uniform vec3 uColor; uniform float uTime; uniform float uFade; uniform float uHit;
  varying vec2 vUv;
  void main() {
    vec4 t = texture2D(uText, vUv);
    float scan = 0.5 + 0.5 * sin(vUv.y * 90.0 - uTime * 6.0);
    float edge = max(smoothstep(0.9, 1.0, abs(vUv.x * 2.0 - 1.0)), smoothstep(0.92, 1.0, abs(vUv.y * 2.0 - 1.0)));
    float sweep = smoothstep(0.08, 0.0, abs(fract(vUv.y * 0.5 - uTime * 0.35) - 0.5) - 0.42);
    vec3 base = uColor * (0.3 + 0.1 * scan + edge * 1.1 + sweep * 0.2 + uHit * 0.8);
    float a = (0.36 + edge * 0.6 + sweep * 0.1 + uHit * 0.3) * uFade;
    // label: white fill (t.r) over a dark outline (t.a without t.r)
    vec3 c = mix(base, vec3(0.02, 0.03, 0.05), clamp(t.a - t.r, 0.0, 1.0) * 0.9);
    c = mix(c, vec3(1.0), t.r * t.a);
    gl_FragColor = vec4(c, max(a, t.a * uFade));
  }`

export class Gate {
  readonly group = new THREE.Group()
  private panel: THREE.Mesh
  private canvas = document.createElement('canvas')
  private tex: THREE.CanvasTexture
  readonly u: { uText: { value: THREE.Texture }; uColor: { value: THREE.Color }; uTime: { value: number }; uFade: { value: number }; uHit: { value: number } }
  value: number
  carry = 0
  used = false
  fade = 1
  constructor(readonly spec: GateSpec, readonly z: number) {
    this.value = spec.op.kind === 'add' || spec.op.kind === 'mul' || spec.op.kind === 'sub' || spec.op.kind === 'div' || spec.op.kind === 'heal' ? spec.op.n : 0
    this.canvas.width = 512; this.canvas.height = 384
    this.tex = new THREE.CanvasTexture(this.canvas)
    this.tex.colorSpace = THREE.SRGBColorSpace
    const tone = spec.shoot ? 'gold' : gateTone(spec.op)
    this.u = { uText: { value: this.tex }, uColor: { value: new THREE.Color(TONE_COLOR[tone]) }, uTime: { value: 0 }, uFade: { value: 1 }, uHit: { value: 0 } }
    const h = 3.1
    this.panel = new THREE.Mesh(new THREE.PlaneGeometry(spec.w - 0.3, h), new THREE.ShaderMaterial({
      vertexShader: GATE_VS, fragmentShader: GATE_FS, uniforms: this.u, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    }))
    this.panel.position.set(0, h / 2 + 0.25, 0)
    this.panel.renderOrder = 8
    this.group.add(this.panel)
    const toneColor = new THREE.Color(TONE_COLOR[tone])
    const glowMat = new THREE.MeshBasicMaterial({ color: toneColor, fog: false })
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.28, h + 0.5, 0.36), mat.metal)
      post.position.set(sx * (spec.w / 2 - 0.1), (h + 0.5) / 2, 0)
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.06, h, 0.38), glowMat)
      strip.position.set(sx * (spec.w / 2 - 0.1) - sx * 0.12, h / 2 + 0.3, 0)
      this.group.add(post, strip)
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(spec.w, 0.24, 0.38), mat.metal)
    beam.position.y = h + 0.4
    const beamGlow = new THREE.Mesh(new THREE.BoxGeometry(spec.w - 0.4, 0.05, 0.4), glowMat)
    beamGlow.position.y = h + 0.26
    this.group.add(beam, beamGlow)
    this.group.position.set(spec.x, 0, z)
    this.draw()
  }
  get op(): GateOp {
    const o = this.spec.op
    if (o.kind === 'add' || o.kind === 'mul' || o.kind === 'sub' || o.kind === 'div' || o.kind === 'heal') return { ...o, n: this.value }
    return o
  }
  draw() {
    const g = this.canvas.getContext('2d')!
    g.clearRect(0, 0, 512, 384)
    const { big, small } = gateLabel(this.op)
    g.textAlign = 'center'; g.textBaseline = 'middle'
    g.lineJoin = 'round'
    g.strokeStyle = '#000'
    g.fillStyle = '#fff'
    const size = big.length > 5 ? 120 : 190
    g.font = `${size}px ${FONT_DISPLAY}`
    g.lineWidth = 18; g.strokeText(big, 256, 170)
    g.fillText(big, 256, 170)
    const sub = this.spec.shoot ? 'SHOOT TO RAISE' : small
    g.font = `52px ${FONT_DISPLAY}`
    g.lineWidth = 10; g.strokeText(sub, 256, 310)
    g.fillText(sub, 256, 310)
    this.tex.needsUpdate = true
  }
  hitBy(dmg: number): boolean {
    if (!this.spec.shoot || this.used) return false
    const r = raiseGate(this.value, this.carry, dmg, this.spec.shoot.perPoint, this.spec.shoot.cap)
    this.u.uHit.value = 1
    if (r.value !== this.value) { this.value = r.value; this.carry = r.carry; this.draw(); return true }
    this.carry = r.carry
    return false
  }
  update(dt: number, t: number) {
    this.u.uTime.value = t
    this.u.uHit.value = Math.max(0, this.u.uHit.value - dt * 6)
    if (this.used) { this.fade = Math.max(0, this.fade - dt * 2.5); this.u.uFade.value = this.fade }
  }
  dispose() {
    this.tex.dispose()
    ;(this.panel.material as THREE.Material).dispose()
  }
}

// ───────────────────────── Hazard base ─────────────────────────
export type ShootKind = 'barrel' | 'barricade' | 'turret' | 'crate' | 'cage' | 'mine'
interface Shootable { kind: ShootKind; x: number; z: number; hw: number; hd: number; hp: number; maxHp: number; alive: boolean; ref: Hazard; idx?: number }
abstract class Hazard {
  readonly group = new THREE.Group()
  shootables: Shootable[] = []
  dead = false
  constructor(readonly z: number) { this.group.position.z = z }
  abstract update(dt: number, t: number, ctx: HazardCtx): void
  /** z extent (for cleanup) */
  end() { return this.z - 30 }
  onShot(_s: Shootable, _ctx: HazardCtx) { /* default no-op */ }
  onDestroy(_s: Shootable, _ctx: HazardCtx) { /* default no-op */ }
  dispose() {
    this.group.traverse(o => {
      const m = o as THREE.Mesh
      if (m.geometry && !(m as unknown as { shared?: boolean }).shared) m.geometry.dispose()
    })
  }
}

// ───────────────────────── Traps ─────────────────────────
class SawTrap extends Hazard {
  private blade: THREE.Group
  private bx = 0
  vol = 0
  constructor(z: number, private readonly period: number, private readonly phase: number) {
    super(z)
    const rail = new THREE.Mesh(new THREE.BoxGeometry(ROAD_HALF * 2, 0.1, 0.5), hazardStripe)
    rail.position.y = 0.05
    const slot = new THREE.Mesh(new THREE.BoxGeometry(ROAD_HALF * 2, 0.02, 0.16), mat.dark)
    slot.position.y = 0.11
    this.group.add(rail, slot)
    for (const sx of [-1, 1]) {
      const housing = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.0, 1.0), mat.metal)
      housing.position.set(sx * (ROAD_HALF + 0.2), 0.5, 0)
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff3020 }))
      lamp.position.set(sx * (ROAD_HALF + 0.2), 1.1, 0)
      this.group.add(housing, lamp)
    }
    this.blade = new THREE.Group()
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.07, 28), mat.steel)
    disc.rotation.x = Math.PI / 2
    this.blade.add(disc)
    const tooth = new THREE.ConeGeometry(0.12, 0.3, 4)
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2
      const m = new THREE.Mesh(tooth, mat.steel)
      m.position.set(Math.cos(a) * 1.02, Math.sin(a) * 1.02, 0)
      m.rotation.z = a - Math.PI / 2
      this.blade.add(m)
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.18, 12), mat.hazard)
    hub.rotation.x = Math.PI / 2
    this.blade.add(hub)
    this.blade.position.y = 0.55
    this.group.add(this.blade)
  }
  update(dt: number, t: number, ctx: HazardCtx) {
    const p = Math.sin(((t / this.period) + this.phase) * Math.PI * 2)
    this.bx = p * (ROAD_HALF - 0.9)
    this.blade.position.x = this.bx
    this.blade.rotation.z -= dt * 26
    const dz = Math.abs(ctx.squad.z - this.z)
    this.vol = dz < 25 ? Math.max(0, 0.5 - dz / 50) : 0
    if (Math.random() < 30 * dt * ctx.fx.density && dz < 60) ctx.fx.addP('glow', this.bx + (Math.random() - 0.5) * 0.3, 0.12, this.z + (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 8, 1 + Math.random() * 3, (Math.random() - 0.5) * 3, 0.3, 0.12, 0.03, 0xffb04a, 1, { grav: 12, ground: true })
    if (dz < ctx.squad.halfD + 1.5) {
      const bx = this.bx, bz = this.z
      ctx.trapKill((x, z) => (x - bx) ** 2 + (z - bz) ** 2 < 1.05 * 1.05, 0.9 * dt * 12, 'saw', bx, bz)
    }
    // shred zombies too
    ctx.enemies.forEachNear(this.bx, this.z, 1.1, zb => { ctx.enemies.damage(zb, 400 * dt * ctx.hpScale(), 'trap', this.bx, this.z + 1) })
  }
}

class SpikeTrap extends Hazard {
  private spikes: THREE.InstancedMesh
  private lights: THREE.Mesh[] = []
  private h = 0
  private fired = false
  constructor(z: number, private readonly x: number, private readonly w: number, private readonly period: number, private readonly phase: number, private readonly len = 3) {
    super(z)
    this.group.position.x = x
    const plate = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, len), mat.dark)
    plate.position.y = 0.03
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.05, len + 0.3), hazardStripe)
    frame.position.y = 0.02
    this.group.add(frame, plate)
    const cols = Math.floor(w / 0.42), rows = Math.floor(len / 0.42)
    this.spikes = new THREE.InstancedMesh(new THREE.ConeGeometry(0.1, 0.8, 5).translate(0, 0.4, 0), mat.steel, cols * rows)
    const m = new THREE.Matrix4()
    let i = 0
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
      m.makeTranslation(-w / 2 + (c + 0.5) * (w / cols), 0, -len / 2 + (r + 0.5) * (len / rows))
      this.spikes.setMatrixAt(i++, m)
    }
    this.spikes.position.y = -0.8
    this.group.add(this.spikes)
    for (const sx of [-1, 1]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.2), new THREE.MeshBasicMaterial({ color: 0x551010 }))
      l.position.set(sx * (w / 2 + 0.25), 0.06, 0)
      this.lights.push(l)
      this.group.add(l)
    }
  }
  update(dt: number, t: number, ctx: HazardCtx) {
    const cyc = ((t / this.period) + this.phase) % 1
    // 0-0.45 down, 0.45-0.65 warning, 0.65-0.9 up, 0.9-1 retract
    const warn = cyc > 0.45 && cyc < 0.65
    const up = cyc >= 0.65 && cyc < 0.9
    const target = up ? 0 : cyc >= 0.9 ? -0.8 * ((cyc - 0.9) / 0.1) : -0.8
    this.h += (target - this.h) * Math.min(1, dt * (up ? 40 : 10))
    this.spikes.position.y = this.h - (up ? 0 : 0)
    const on = warn ? (Math.sin(t * 40) > 0 ? 1 : 0.2) : up ? 1 : 0.1
    for (const l of this.lights) (l.material as THREE.MeshBasicMaterial).color.setRGB(on, on * 0.12, on * 0.08)
    if (up && !this.fired) {
      this.fired = true
      if (Math.abs(ctx.squad.z - this.z) < 30) ctx.audio.play('spikes', { vol: 0.6 })
      ctx.fx.dust(this.x, this.z, 2, 1.2)
    }
    if (!up) this.fired = false
    if (up && this.h > -0.3) {
      const x0 = this.x - this.w / 2, x1 = this.x + this.w / 2, z0 = this.z - this.len / 2, z1 = this.z + this.len / 2
      ctx.trapKill((x, z) => x > x0 && x < x1 && z > z0 && z < z1, 0.85 * dt * 8, 'spikes', this.x, this.z)
      ctx.enemies.forEachNear(this.x, this.z, Math.max(this.w, this.len) / 2, zb => {
        if (zb.x > x0 && zb.x < x1 && zb.z > z0 && zb.z < z1) ctx.enemies.damage(zb, 200 * dt * ctx.hpScale(), 'trap', zb.x, zb.z - 1, 0)
      })
    }
  }
}

class FlameTrap extends Hazard {
  private nozzles: { x: number; glow: THREE.Mesh; phase: number }[] = []
  private burning = new Set<number>()
  constructor(z: number, private readonly period: number, private readonly phase: number) {
    super(z)
    const bar = new THREE.Mesh(new THREE.BoxGeometry(ROAD_HALF * 2, 0.14, 0.7), mat.metal)
    bar.position.y = 0.07
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(ROAD_HALF * 2, 0.02, 0.9), hazardStripe)
    stripe.position.y = 0.01
    this.group.add(stripe, bar)
    const n = 5
    for (let i = 0; i < n; i++) {
      const x = -ROAD_HALF + (i + 0.5) * (ROAD_HALF * 2 / n)
      const noz = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.3, 10), mat.dark)
      noz.position.set(x, 0.2, 0)
      const glow = new THREE.Mesh(new THREE.CircleGeometry(0.16, 12), new THREE.MeshBasicMaterial({ color: 0x331100 }))
      glow.rotation.x = -Math.PI / 2
      glow.position.set(x, 0.36, 0)
      this.group.add(noz, glow)
      this.nozzles.push({ x, glow, phase: i % 2 === 0 ? 0 : 0.5 })
    }
  }
  update(dt: number, t: number, ctx: HazardCtx) {
    const near = Math.abs(ctx.squad.z - this.z) < 70
    const colW = ROAD_HALF * 2 / 5
    for (let i = 0; i < this.nozzles.length; i++) {
      const nz = this.nozzles[i]
      const cyc = ((t / this.period) + this.phase + nz.phase) % 1
      const warn = cyc > 0.3 && cyc < 0.45
      const fire = cyc >= 0.45 && cyc < 0.9
      const m = nz.glow.material as THREE.MeshBasicMaterial
      if (fire) m.color.setHex(0xffc060)
      else if (warn) m.color.setRGB(1, 0.35 + 0.25 * Math.sin(t * 30), 0.05)
      else m.color.setHex(0x331100)
      if (fire && !this.burning.has(i)) { this.burning.add(i); if (near && Math.abs(ctx.squad.z - this.z) < 30) ctx.audio.play('flame', { vol: 0.45, max: 3 }) }
      if (!fire) this.burning.delete(i)
      if (fire && near) {
        ctx.fx.flameJet(nz.x, this.z, 1.3, 1.25)
        const x0 = nz.x - colW / 2 + 0.15, x1 = nz.x + colW / 2 - 0.15
        if (Math.abs(ctx.squad.z - this.z) < ctx.squad.halfD + 1.2)
          ctx.trapKill((x, z) => x > x0 && x < x1 && Math.abs(z - this.z) < 0.9, 0.55 * dt * 6, 'flame', nz.x, this.z)
        ctx.enemies.forEachNear(nz.x, this.z, 1.3, zb => { zb.burn = 3; zb.burnDps = Math.max(zb.burnDps, 30 * ctx.hpScale()) })
      } else if (warn && near && Math.random() < 10 * dt) ctx.fx.addP('glow', nz.x, 0.5, this.z, 0, 1.2, 0, 0.3, 0.5, 0.2, 0xff7a2a, 0.8)
    }
  }
}

class LaserTrap extends Hazard {
  private beams: THREE.Mesh[] = []
  private state: 'off' | 'warn' | 'on' = 'off'
  constructor(z: number, private readonly period: number, private readonly phase: number) {
    super(z)
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.2, 0.4), mat.metal)
      post.position.set(sx * (ROAD_HALF + 0.25), 1.1, 0)
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.12, 0.46), new THREE.MeshBasicMaterial({ color: 0xff2a2a }))
      cap.position.set(sx * (ROAD_HALF + 0.25), 2.26, 0)
      this.group.add(post, cap)
    }
    for (const y of [0.35, 0.9, 1.5]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(ROAD_HALF * 2 + 0.3, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }))
      b.position.y = y
      this.beams.push(b)
      this.group.add(b)
      const halo = new THREE.Mesh(new THREE.BoxGeometry(ROAD_HALF * 2 + 0.3, 0.22, 0.22), new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }))
      halo.position.y = y
      this.beams.push(halo)
      this.group.add(halo)
    }
  }
  update(dt: number, t: number, ctx: HazardCtx) {
    const cyc = ((t / this.period) + this.phase) % 1
    const st = cyc < 0.42 ? 'off' : cyc < 0.55 ? 'warn' : 'on'
    if (st !== this.state) {
      this.state = st
      if (st === 'on' && Math.abs(ctx.squad.z - this.z) < 35) ctx.audio.play('laser', { vol: 0.5 })
    }
    for (let i = 0; i < this.beams.length; i++) {
      const b = this.beams[i]
      const m = b.material as THREE.MeshBasicMaterial
      b.visible = st !== 'off'
      const base = i % 2 === 0 ? 1 : 0.28
      m.opacity = st === 'warn' ? (Math.sin(t * 50) > 0 ? base * 0.6 : 0.05) : base
      b.scale.y = st === 'warn' ? 0.5 : 1
    }
    if (st === 'on') {
      if (Math.abs(ctx.squad.z - this.z) < ctx.squad.halfD + 0.8) ctx.trapKill((_x, z) => Math.abs(z - this.z) < 0.32, 1, 'laser', ctx.squad.x, this.z)
      ctx.enemies.forEachNear(0, this.z, ROAD_HALF + 1, zb => { if (Math.abs(zb.z - this.z) < 0.4) ctx.enemies.damage(zb, 500 * dt * ctx.hpScale(), 'trap', zb.x, zb.z - 1, 0) })
      if (Math.random() < 20 * dt && Math.abs(ctx.squad.z - this.z) < 60) ctx.fx.addP('glow', (Math.random() * 2 - 1) * ROAD_HALF, 0.35 + Math.random() * 1.2, this.z, 0, 0, 0, 0.12, 0.4, 0.1, 0xff3030, 1)
    }
  }
}

class CrusherTrap extends Hazard {
  private block: THREE.Group
  private shadowT: THREE.Mesh
  private y = 5
  private slammed = false
  private readonly cx: number
  constructor(z: number, side: number, private readonly period: number, private readonly phase: number) {
    super(z)
    this.cx = side * ROAD_HALF / 2
    const w = ROAD_HALF - 0.3
    const frameH = 6.5
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.45, frameH, 0.45), hazardStripe)
      post.position.set(this.cx + sx * (w / 2 + 0.3), frameH / 2, 0)
      this.group.add(post)
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(w + 1.1, 0.6, 1.2), mat.metal)
    top.position.set(this.cx, frameH, 0)
    this.group.add(top)
    this.block = new THREE.Group()
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, 1.4, 3.2), mat.steel)
    b.position.y = 0.7
    const face = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.25, 3.22), hazardStripe)
    face.position.y = 0.14
    const piston = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 6, 10), mat.dark)
    piston.position.y = 4.4
    this.block.add(b, face, piston)
    this.block.position.set(this.cx, 5, 0)
    this.group.add(this.block)
    this.shadowT = new THREE.Mesh(new THREE.PlaneGeometry(w, 3.2), new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }))
    this.shadowT.rotation.x = -Math.PI / 2
    this.shadowT.position.set(this.cx, 0.05, 0)
    this.group.add(this.shadowT)
  }
  update(dt: number, t: number, ctx: HazardCtx) {
    const cyc = ((t / this.period) + this.phase) % 1
    // 0-0.4 up, 0.4-0.62 warning (lowering slowly), 0.62-0.66 slam, 0.66-0.8 down, 0.8-1 rise
    let target = 5
    if (cyc >= 0.4 && cyc < 0.62) target = 5 - (cyc - 0.4) / 0.22 * 1.2
    else if (cyc >= 0.62 && cyc < 0.8) target = 0
    else if (cyc >= 0.8) target = (cyc - 0.8) / 0.2 * 5
    const speed = cyc >= 0.62 && cyc < 0.66 ? 60 : 8
    this.y += (target - this.y) * Math.min(1, dt * speed)
    if (cyc >= 0.62 && cyc < 0.66) this.y = Math.min(this.y, 5 * (1 - (cyc - 0.62) / 0.04))
    this.block.position.y = this.y
    const warn = cyc >= 0.4 && cyc < 0.62
    ;(this.shadowT.material as THREE.MeshBasicMaterial).opacity = warn ? 0.25 + 0.2 * Math.sin(t * 30) : cyc >= 0.62 && cyc < 0.8 ? 0 : 0.05
    if (cyc >= 0.62 && cyc < 0.8 && !this.slammed && this.y < 0.6) {
      this.slammed = true
      const near = Math.abs(ctx.squad.z - this.z) < 40
      if (near) { ctx.audio.play('crusher', { vol: 0.8 }); ctx.shake(0.35) }
      ctx.fx.dust(this.cx - ROAD_HALF / 2, this.z, 3, 1.6); ctx.fx.dust(this.cx + ROAD_HALF / 2, this.z, 3, 1.6)
      ctx.fx.shockwave(this.cx, this.z, 3, 0xffd0a0)
      for (let i = 0; i < 10; i++) ctx.fx.addP('glow', this.cx + (Math.random() - 0.5) * ROAD_HALF, 0.1, this.z + (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 8, 2, (Math.random() - 0.5) * 8, 0.35, 0.14, 0.04, 0xffb04a, 1, { grav: 10, ground: true })
      const x0 = this.cx - ROAD_HALF / 2, x1 = this.cx + ROAD_HALF / 2
      ctx.trapKill((x, z) => x > x0 && x < x1 && Math.abs(z - this.z) < 1.7, 1, 'crusher', this.cx, this.z)
      ctx.enemies.forEachNear(this.cx, this.z, ROAD_HALF / 2 + 1, zb => { if (zb.x > x0 && zb.x < x1 && Math.abs(zb.z - this.z) < 1.8) ctx.enemies.kill(zb, 'trap', true) })
    }
    if (cyc < 0.6) this.slammed = false
  }
}

class MineField extends Hazard {
  private mines: { x: number; z: number; t: number; armed: boolean; led: THREE.Mesh; body: THREE.Mesh; gone: boolean }[] = []
  constructor(z: number, len: number, seed: number) {
    super(z)
    let s = seed
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647 }
    const n = Math.round(len * 0.9)
    const geo = new THREE.CylinderGeometry(0.34, 0.4, 0.14, 12)
    const ledGeo = new THREE.SphereGeometry(0.07, 8, 6)
    for (let i = 0; i < n; i++) {
      const x = (rnd() * 2 - 1) * (ROAD_HALF - 0.6)
      const lz = -rnd() * len
      const body = new THREE.Mesh(geo, mat.dark)
      body.position.set(x, 0.07, lz)
      const led = new THREE.Mesh(ledGeo, new THREE.MeshBasicMaterial({ color: 0xff2020 }))
      led.position.set(x, 0.17, lz)
      this.group.add(body, led)
      const m = { x, z: z + lz, t: -1, armed: true, led, body, gone: false }
      this.mines.push(m)
      this.shootables.push({ kind: 'mine', x, z: z + lz, hw: 0.45, hd: 0.45, hp: 1, maxHp: 1, alive: true, ref: this, idx: i })
    }
    // warning sign
    const sign = labelSprite('MINES', '#ff4a3a', 2.6)
    sign.position.set(ROAD_HALF + 1.3, 2.4, 2)
    this.group.add(sign)
  }
  end() { return this.z - 40 }
  private detonate(i: number, ctx: HazardCtx) {
    const m = this.mines[i]
    if (m.gone) return
    m.gone = true
    m.body.visible = false; m.led.visible = false
    this.shootables[i].alive = false
    ctx.explode(m.x, m.z, 2.3, 300 * ctx.hpScale(), true)
  }
  onDestroy(s: Shootable, ctx: HazardCtx) { if (s.idx !== undefined) this.detonate(s.idx, ctx) }
  update(dt: number, t: number, ctx: HazardCtx) {
    const sq = ctx.squad
    for (let i = 0; i < this.mines.length; i++) {
      const m = this.mines[i]
      if (m.gone) continue
      const blink = m.t >= 0 ? Math.sin(t * 40) > 0 : Math.sin(t * 4 + i) > 0.7
      ;(m.led.material as THREE.MeshBasicMaterial).color.setHex(blink ? 0xff2020 : 0x300808)
      if (m.t < 0 && Math.abs(sq.z - m.z) < sq.halfD + 1) {
        for (const s of sq.soldiers) if ((s.x - m.x) ** 2 + (s.z - m.z) ** 2 < 0.8 * 0.8) { m.t = 0.35; ctx.audio.play('beep', { vol: 0.6, max: 3 }); break }
      }
      if (m.t < 0) ctx.enemies.forEachNear(m.x, m.z, 0.6, () => { if (m.t < 0) { m.t = 0.35; ctx.audio.play('beep', { vol: 0.4, max: 3 }) } })
      if (m.t >= 0) { m.t -= dt; if (m.t <= 0) this.detonate(i, ctx) }
    }
  }
}

class ToxicPool extends Hazard {
  private u: { uTime: { value: number } }
  private tick = 0
  constructor(z: number, private readonly x: number, private readonly w: number, private readonly len: number) {
    super(z)
    this.group.position.x = x
    this.u = { uTime: { value: 0 } }
    const m = new THREE.ShaderMaterial({
      uniforms: this.u, transparent: true, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uTime; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
        void main(){ vec2 p = vUv * vec2(${(w / 1.5).toFixed(2)}, ${(len / 1.5).toFixed(2)});
          float v = n(p * 2.0 + uTime * 0.4) * 0.6 + n(p * 5.0 - uTime * 0.7) * 0.4;
          vec2 e = min(vUv, 1.0 - vUv) * vec2(${w.toFixed(2)}, ${len.toFixed(2)});
          float edge = smoothstep(0.0, 0.8, min(e.x, e.y) + v * 0.3);
          vec3 c = mix(vec3(0.18, 0.42, 0.06), vec3(0.55, 0.95, 0.2), v);
          gl_FragColor = vec4(c, edge * 0.8); }`,
    })
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, len), m)
    plane.rotation.x = -Math.PI / 2
    plane.position.set(0, 0.03, -len / 2)
    this.group.add(plane)
    const sign = labelSprite('TOXIC', '#8cff3a', 2.4)
    sign.position.set(0, 2.2, 0.5)
    this.group.add(sign)
  }
  end() { return this.z - this.len - 10 }
  update(dt: number, t: number, ctx: HazardCtx) {
    this.u.uTime.value = t
    const near = ctx.squad.z < this.z + 60 && ctx.squad.z > this.z - this.len - 20
    if (near && Math.random() < 10 * dt * ctx.fx.density) {
      const px = this.x + (Math.random() - 0.5) * this.w, pz = this.z - Math.random() * this.len
      ctx.fx.alphaP('smoke', px, 0.2, pz, 0, 0.5, 0, 1.6, 0.5, 1.8, 0x8ad83a, 0.3, { fadeIn: 0.2 })
      if (Math.random() < 0.4) ctx.fx.addP('glow', px, 0.1, pz, 0, 0.6, 0, 0.5, 0.25, 0.05, 0x9cff4a, 0.8)
    }
    this.tick -= dt
    if (this.tick <= 0) {
      this.tick = 0.4
      const x0 = this.x - this.w / 2, x1 = this.x + this.w / 2, z1 = this.z, z0 = this.z - this.len
      if (ctx.squad.z - ctx.squad.halfD < z1 && ctx.squad.z + ctx.squad.halfD > z0)
        ctx.trapKill((x, z) => x > x0 && x < x1 && z > z0 && z < z1, 0.16, 'toxic', ctx.squad.x, ctx.squad.z)
    }
  }
}

class Airstrike extends Hazard {
  private strikes: { x: number; z: number; t: number; tele: ReturnType<Fx['telegraph']> }[] = []
  private timer = 1
  private started = false
  constructor(z: number, private readonly len: number, private readonly period: number) {
    super(z)
    const sign = labelSprite('AIRSTRIKE ZONE', '#ff7a2a', 4.5)
    sign.position.set(0, 3.4, 0)
    this.group.add(sign)
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3, 0.25), hazardStripe)
      post.position.set(sx * (ROAD_HALF + 0.3), 1.5, 0)
      this.group.add(post)
    }
  }
  end() { return this.z - this.len - 20 }
  update(dt: number, _t: number, ctx: HazardCtx) {
    const sq = ctx.squad
    const inside = sq.z < this.z + 4 && sq.z > this.z - this.len
    if (inside && !this.started) { this.started = true; ctx.audio.play('whistle', { vol: 0.5 }) }
    if (inside) {
      this.timer -= dt
      if (this.timer <= 0) {
        this.timer = this.period * (0.8 + Math.random() * 0.4)
        // aim where the squad will be in ~1.3 s, offset so moving sideways dodges it
        const x = Math.max(-ROAD_HALF + 2, Math.min(ROAD_HALF - 2, sq.x + (Math.random() - 0.5) * 5))
        const z = sq.z - 11 - Math.random() * 4
        const tele = ctx.fx.telegraph()
        tele?.circle(x, z, 2.6, 0xff5a1a)
        this.strikes.push({ x, z, t: 1.35, tele })
        ctx.audio.play('whistle', { vol: 0.35, rate: 1.3, max: 3 })
      }
    }
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const s = this.strikes[i]
      s.t -= dt
      if (s.tele) s.tele.u.uProgress.value = 1 - s.t / 1.35
      if (s.t <= 0) {
        s.tele?.hide()
        this.strikes.splice(i, 1)
        ctx.explode(s.x, s.z, 2.6, 600 * ctx.hpScale(), true)
      }
    }
  }
}

// ───────────────────────── Props ─────────────────────────
/** Streamed GLB props shared with the world (Assets.models); set once by the Game. */
let propModels: Map<string, THREE.Group> | null = null
export function setPropModels(m: Map<string, THREE.Group>) { propModels = m }
class Barrels extends Hazard {
  private meshes: THREE.Group[] = []
  constructor(z: number, spots: { x: number; dz: number }[], hp: number) {
    super(z)
    const body = new THREE.CylinderGeometry(0.4, 0.4, 1.1, 14)
    const ring = new THREE.CylinderGeometry(0.42, 0.42, 0.07, 14)
    const signMat = new THREE.MeshBasicMaterial({ color: 0xffd23a })
    spots.forEach((s, i) => {
      const g = new THREE.Group()
      const model = propModels?.get('barrel_red')
      if (model) {
        const m = model.clone()
        m.scale.setScalar(1.3)
        m.traverse(o => {
          const sm = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined
          if (sm && 'metalness' in sm) { sm.metalness = Math.min(sm.metalness, 0.35); sm.roughness = Math.max(sm.roughness, 0.55); sm.envMapIntensity = 0.35 }
        })
        g.add(m)
      } else {
        const b = new THREE.Mesh(body, mat.barrel); b.position.y = 0.55
        const r1 = new THREE.Mesh(ring, mat.dark); r1.position.y = 0.3
        const r2 = new THREE.Mesh(ring, mat.dark); r2.position.y = 0.82
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.3), signMat); sign.position.set(0, 0.6, 0.41)
        g.add(b, r1, r2, sign)
      }
      g.position.set(s.x, 0, -s.dz)
      g.rotation.y = Math.random() * Math.PI
      this.group.add(g)
      this.meshes.push(g)
      this.shootables.push({ kind: 'barrel', x: s.x, z: z - s.dz, hw: 0.45, hd: 0.45, hp, maxHp: hp, alive: true, ref: this, idx: i })
    })
  }
  onShot(s: Shootable) { const g = this.meshes[s.idx!]; g.position.y = 0.03 * Math.random() }
  onDestroy(s: Shootable, ctx: HazardCtx) {
    this.meshes[s.idx!].visible = false
    ctx.explode(s.x, s.z, 3.6, 900 * ctx.hpScale(), true)
    ctx.audio.play('explosion', { vol: 0.9 })
    // chain reaction
    for (const o of this.shootables) if (o.alive && (o.x - s.x) ** 2 + (o.z - s.z) ** 2 < 3.6 * 3.6) { o.hp = Math.min(o.hp, 1) }
  }
  update(_dt: number, _t: number, ctx: HazardCtx) {
    // squad touching a barrel sets it off
    for (const s of this.shootables) {
      if (!s.alive) continue
      if (Math.abs(ctx.squad.z - s.z) < ctx.squad.halfD + 0.5 && Math.abs(ctx.squad.x - s.x) < ctx.squad.halfW + 0.4) {
        for (const so of ctx.squad.soldiers) if ((so.x - s.x) ** 2 + (so.z - s.z) ** 2 < 0.7) { s.hp = 0; break }
      }
    }
  }
}

class Barricade extends Hazard {
  private bar: THREE.Sprite
  private parts: THREE.Mesh[] = []
  constructor(z: number, hp: number) {
    super(z)
    const w = ROAD_HALF * 2 + 0.6
    for (let i = 0; i < 9; i++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(w / 9 + 0.1, 0.4 + Math.random() * 0.3, 0.6), i % 2 ? mat.sand : mat.concrete)
      p.position.set(-w / 2 + (i + 0.5) * (w / 9), 0.3, 0)
      p.rotation.z = (Math.random() - 0.5) * 0.1
      this.parts.push(p)
      this.group.add(p)
    }
    for (let i = 0; i < 6; i++) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.22, 0.12), mat.wood)
      plank.position.set(-w / 2 + 1.2 + i * (w - 2.4) / 5, 1.0 + (i % 2) * 0.4, 0.2)
      plank.rotation.z = (Math.random() - 0.5) * 0.6
      this.parts.push(plank)
      this.group.add(plank)
    }
    for (let i = 0; i < 4; i++) {
      const spike = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.2, 0.16), mat.metal)
      spike.position.set(-w / 2 + 1.5 + i * (w - 3) / 3, 1, 0.45)
      spike.rotation.set(-0.5, 0, (Math.random() - 0.5) * 0.3)
      this.parts.push(spike)
      this.group.add(spike)
    }
    this.bar = labelSprite('BARRICADE', '#ffb04a', 4, 'SHOOT TO BREAK')
    this.bar.position.set(0, 2.8, 0)
    this.group.add(this.bar)
    this.shootables.push({ kind: 'barricade', x: 0, z, hw: w / 2, hd: 0.6, hp, maxHp: hp, alive: true, ref: this })
  }
  get alive() { return this.shootables[0].alive }
  onShot(s: Shootable, ctx: HazardCtx) {
    if (Math.random() < 0.3) ctx.fx.dust(s.x + (Math.random() - 0.5) * 8, s.z + 0.5, 1, 1, 0x9a8a72)
    const k = s.hp / s.maxHp
    this.parts.forEach((p, i) => { if (i / this.parts.length > k + 0.1) p.visible = false })
  }
  onDestroy(s: Shootable, ctx: HazardCtx) {
    for (const p of this.parts) {
      p.visible = false
      const wp = new THREE.Vector3(); p.getWorldPosition(wp)
      ctx.fx.dust(wp.x, wp.z, 1, 1.6, 0x9a8a72)
    }
    this.bar.visible = false
    for (let i = 0; i < 30; i++) ctx.fx.shards.spawn((Math.random() * 2 - 1) * ROAD_HALF, 0.8, s.z, (Math.random() - 0.5) * 6, 3 + Math.random() * 5, -2 - Math.random() * 6, 0.3 + Math.random() * 0.4, new THREE.Color(Math.random() < 0.5 ? 0x6a4a30 : 0x8e8a82), 1.8, 0.3)
    ctx.shake(0.3)
    ctx.audio.play('crate', { vol: 0.9, rate: 0.7 })
    ctx.fx.text(0, 2.5, s.z, 'BREAKTHROUGH!', 'gold', 1.1)
    ctx.onDestroyed('barricade', 0, s.z, 12)
  }
  update() { /* static */ }
}

class Turret extends Hazard {
  private head: THREE.Group
  private cd = 1.2
  private tracers: { ax: number; az: number; bx: number; bz: number; t: number }[] = []
  private laser: THREE.Mesh
  constructor(z: number, private readonly x: number, hp: number) {
    super(z)
    this.group.position.x = x
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 0.9, 8), mat.metal); base.position.y = 0.45
    const sand = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.35, 6, 12), mat.sand); sand.rotation.x = Math.PI / 2; sand.position.y = 0.3
    this.head = new THREE.Group()
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 1.0), mat.dark)
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.4, 8), mat.steel); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0, 0.9)
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2020 })); eye.position.set(0, 0.12, 0.52)
    this.head.add(box, barrel, eye)
    this.head.position.y = 1.2
    this.laser = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 1), new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }))
    this.group.add(base, sand, this.head, this.laser)
    this.shootables.push({ kind: 'turret', x, z, hw: 1.0, hd: 1.0, hp, maxHp: hp, alive: true, ref: this })
  }
  onShot(_s: Shootable, ctx: HazardCtx) { if (Math.random() < 0.3) ctx.fx.sparks(this.x, 1.2, this.z + 0.5, 2, 0xffd08a, 4) }
  onDestroy(s: Shootable, ctx: HazardCtx) {
    ctx.explode(s.x, s.z, 2.4, 500 * ctx.hpScale(), false)
    this.head.visible = false; this.laser.visible = false
    ctx.onDestroyed('turret', s.x, s.z, 10)
  }
  update(dt: number, _t: number, ctx: HazardCtx) {
    const s = this.shootables[0]
    const sq = ctx.squad
    const dz = this.z - sq.z
    this.laser.visible = s.alive && dz < -2 && dz > -55
    if (!s.alive) return
    const tx = sq.x, tz = sq.z
    const yaw = Math.atan2(tx - this.x, tz - this.z)
    this.head.rotation.y = yaw
    const len = Math.hypot(tx - this.x, tz - this.z)
    this.laser.scale.z = len
    this.laser.position.set((tx - this.x) / 2, 1.1, (tz - this.z) / 2)
    this.laser.rotation.y = yaw
    if (this.laser.visible) {
      this.cd -= dt
      if (this.cd <= 0) {
        this.cd = 0.55
        ctx.audio.play('turret', { vol: 0.45, max: 4 })
        ctx.fx.muzzle(this.x + Math.sin(yaw) * 1.5, 1.2, this.z + Math.cos(yaw) * 1.5, false, 0xff4a2a)
        this.tracers.push({ ax: this.x, az: this.z, bx: tx + (Math.random() - 0.5), bz: tz, t: 0.08 })
        if (Math.random() < 0.55) {
          const lost = sq.killNear(tx, tz, 1)
          if (lost) { ctx.fx.impact(tx, 1, tz, true); ctx.onLost(lost, 'turret', tx, tz) }
        }
      }
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i]
      tr.t -= dt
      ctx.fx.tracers.add(tr.ax, 1.2, tr.az, tr.bx, 1.0, tr.bz, new THREE.Color(0xff3a2a), 0.08, 2)
      if (tr.t <= 0) this.tracers.splice(i, 1)
    }
  }
}

const LOOT_LABEL: Record<string, [string, string]> = { weapon: ['WEAPON', '#ffb52a'], grenade: ['GRENADE', '#ff8a3a'], medkit: ['MEDKIT', '#33e08a'], coins: ['COINS', '#ffd24a'] }
class SupplyCrate extends Hazard {
  private box: THREE.Group
  constructor(z: number, x: number, readonly loot: 'weapon' | 'grenade' | 'medkit' | 'coins', hp: number) {
    super(z)
    this.group.position.x = x
    this.box = new THREE.Group()
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 1.1), mat.crate); b.position.y = 0.55
    for (const y of [0.15, 0.95]) { const r = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.1, 1.14), mat.dark); r.position.y = y; this.box.add(r) }
    const [label, color] = LOOT_LABEL[loot]
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.3, 1.12), new THREE.MeshBasicMaterial({ color }))
    stripe.position.y = 0.55
    this.box.add(b, stripe)
    this.group.add(this.box)
    const sp = labelSprite(label, color, 2.4, 'SHOOT TO OPEN')
    sp.position.y = 2.2
    this.group.add(sp)
    this.shootables.push({ kind: 'crate', x, z, hw: 0.8, hd: 0.7, hp, maxHp: hp, alive: true, ref: this })
  }
  onShot() { this.box.rotation.y = (Math.random() - 0.5) * 0.08 }
  onDestroy(s: Shootable, ctx: HazardCtx) {
    this.group.visible = false
    ctx.audio.play('crate', { vol: 0.8 })
    for (let i = 0; i < 14; i++) ctx.fx.shards.spawn(s.x, 0.6, s.z, (Math.random() - 0.5) * 6, 3 + Math.random() * 4, (Math.random() - 0.5) * 6, 0.25 + Math.random() * 0.25, new THREE.Color(0x4d5a36), 1.4, 0.3)
    ctx.fx.gateBurst(s.x, 1, s.z, 1.6, 0xffd24a)
    ctx.onLoot(this.loot, s.x, s.z)
  }
  update() { /* static */ }
}

class RescueCage extends Hazard {
  private bars: THREE.Group
  private label: THREE.Sprite
  private freed = false
  prisoners: { x: number; z: number }[] = []
  constructor(z: number, x: number, readonly n: number, hp: number) {
    super(z)
    this.group.position.x = x
    this.bars = new THREE.Group()
    const w = 2.2
    const floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.15, w), mat.metal); floor.position.y = 0.07
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, w), mat.metal); roof.position.y = 2.3
    this.bars.add(floor, roof)
    const bar = new THREE.CylinderGeometry(0.04, 0.04, 2.2, 6)
    for (let i = 0; i < 7; i++) for (const [ax, az] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const b = new THREE.Mesh(bar, mat.steel)
      const o = -w / 2 + (i + 0.5) * (w / 7)
      b.position.set(ax ? ax * w / 2 : o, 1.2, az ? az * w / 2 : o)
      this.bars.add(b)
    }
    this.group.add(this.bars)
    this.label = labelSprite(`+${n}`, '#5ec8ff', 2.4, 'SHOOT TO FREE')
    this.label.position.y = 3.2
    this.group.add(this.label)
    for (let i = 0; i < Math.min(n, 6); i++) this.prisoners.push({ x: x + ((i % 3) - 1) * 0.55, z: z + (Math.floor(i / 3) - 0.5) * 0.6 })
    this.shootables.push({ kind: 'cage', x, z, hw: 1.2, hd: 1.2, hp, maxHp: hp, alive: true, ref: this })
  }
  get caged() { return !this.freed }
  onShot() { this.bars.position.x = (Math.random() - 0.5) * 0.05 }
  onDestroy(s: Shootable, ctx: HazardCtx) {
    this.freed = true
    this.bars.visible = false
    this.label.visible = false
    for (let i = 0; i < 24; i++) ctx.fx.shards.spawn(s.x, 1.2, s.z, (Math.random() - 0.5) * 7, 2 + Math.random() * 5, (Math.random() - 0.5) * 7, 0.2, new THREE.Color(0x8a8e94), 1.4, 0.4)
    ctx.audio.play('shield_break', { vol: 0.7, rate: 1.2 })
    ctx.onRescue(this.n, s.x, s.z)
  }
  update() { /* static */ }
}

// ───────────────────────── Manager ─────────────────────────
export class Hazards {
  readonly group = new THREE.Group()
  gates: Gate[] = []
  private list: Hazard[] = []
  private gateRows: { z: number; gates: Gate[]; done: boolean }[] = []
  private prisonerCrowd: VatCrowd | null = null
  private prisonerAnim: import('./vat').VatAnim | null = null
  time = 0

  constructor(private readonly ctx: HazardCtx) {}
  setPrisonerCrowd(c: VatCrowd, anim: import('./vat').VatAnim) { this.prisonerCrowd = c; this.prisonerAnim = anim; this.group.add(c) }

  spawn(c: Chunk) {
    const z = -c.d
    const s = this.ctx.hpScale()
    let h: Hazard | null = null
    switch (c.kind) {
      case 'gates': {
        const row = { z, gates: c.gates.map(g => new Gate(g, z)), done: false }
        for (const g of row.gates) { this.group.add(g.group); this.gates.push(g) }
        this.gateRows.push(row)
        return
      }
      case 'trap':
        switch (c.trap) {
          case 'saw': h = new SawTrap(z, c.period, c.phase); break
          case 'spikes': h = new SpikeTrap(z, c.x, c.w, c.period, c.phase, c.len); break
          case 'flame': h = new FlameTrap(z, c.period, c.phase); break
          case 'laser': h = new LaserTrap(z, c.period, c.phase); break
          case 'crusher': h = new CrusherTrap(z, c.x, c.period, c.phase); break
          case 'mines': h = new MineField(z, c.len, Math.floor(c.phase * 1e6) + 7); break
          case 'toxic': h = new ToxicPool(z, c.x, c.w, c.len); break
          case 'airstrike': h = new Airstrike(z, c.len, c.period); break
        }
        break
      case 'barrels': h = new Barrels(z, c.spots, 30 * s); break
      case 'barricade': h = new Barricade(z, c.hp); break
      case 'turret': h = new Turret(z, c.x, c.hp); break
      case 'supply': h = new SupplyCrate(z, c.x, c.loot, c.hp); break
      case 'rescue': h = new RescueCage(z, c.x, c.n, c.hp); break
      default: return
    }
    if (h) { this.list.push(h); this.group.add(h.group) }
  }

  /** z of the nearest intact barricade ahead of the squad (blocks movement), or null. */
  blockZ(squadZ: number): number | null {
    for (const h of this.list) if (h instanceof Barricade && h.alive && h.z < squadZ + 1 && h.z > squadZ - 40) return h.z
    return null
  }

  /** Bullet segment test against gates (shootable) and shootable props. Returns true if absorbed. */
  hitSegment(x0: number, z0: number, x1: number, z1: number, dmg: number): { absorbed: boolean; x: number; z: number; kind: string } | null {
    const zmin = Math.min(z0, z1), zmax = Math.max(z0, z1)
    for (const g of this.gates) {
      if (!g.spec.shoot || g.used) continue
      if (g.z >= zmin - 0.2 && g.z <= zmax + 0.2) {
        const t = (g.z - z0) / ((z1 - z0) || 1)
        const x = x0 + (x1 - x0) * t
        if (Math.abs(x - g.spec.x) < g.spec.w / 2) {
          const raised = g.hitBy(dmg)
          if (raised) { this.ctx.audio.play('coin', { vol: 0.35, rate: 1.4, max: 3, gap: 0.05 }); this.ctx.fx.text(g.spec.x, 3.6, g.z, `+1`, 'gold', 0.6) }
          return { absorbed: true, x, z: g.z, kind: 'gate' }
        }
      }
    }
    for (const h of this.list) {
      for (const s of h.shootables) {
        if (!s.alive) continue
        if (s.z + s.hd < zmin || s.z - s.hd > zmax) continue
        const t = Math.max(0, Math.min(1, (s.z - z0) / ((z1 - z0) || 1)))
        const x = x0 + (x1 - x0) * t
        if (Math.abs(x - s.x) < s.hw) {
          s.hp -= dmg
          h.onShot(s, this.ctx)
          if (s.hp <= 0) { s.alive = false; h.onDestroy(s, this.ctx) }
          return { absorbed: s.kind !== 'mine', x, z: s.z, kind: s.kind }
        }
      }
    }
    return null
  }
  /** Explosions damage shootables too (chain reactions). */
  blast(x: number, z: number, r: number, dmg: number) {
    for (const h of this.list) for (const s of h.shootables) {
      if (!s.alive) continue
      if ((s.x - x) ** 2 + (s.z - z) ** 2 < (r + s.hw) ** 2) {
        s.hp -= dmg
        if (s.hp <= 0) { s.alive = false; h.onDestroy(s, this.ctx) }
      }
    }
  }
  /** Shootables worth aiming at (for soldier auto-aim when no zombies are around). */
  aimTargets(sz: number, range: number, out: { x: number; z: number; kind: string }[]) {
    out.length = 0
    for (const g of this.gates) if (g.spec.shoot && !g.used && sz - g.z > 3 && sz - g.z < range) out.push({ x: g.spec.x, z: g.z, kind: 'gate' })
    for (const h of this.list) for (const s of h.shootables) if (s.alive && s.kind !== 'mine' && sz - s.z > 2 && sz - s.z < range) out.push({ x: s.x, z: s.z, kind: s.kind })
    return out
  }
  /** Shootable HP bars for crates/cages/turrets/barricades. */
  bars(add: (x: number, y: number, z: number, w: number, fill: number) => void, camZ: number) {
    for (const h of this.list) for (const s of h.shootables) {
      if (!s.alive || s.kind === 'mine' || s.kind === 'barrel' || s.hp >= s.maxHp || camZ - s.z > 60) continue
      add(s.x, s.kind === 'barricade' ? 2.2 : 2.9, s.z, s.kind === 'barricade' ? 5 : 1.6, s.hp / s.maxHp)
    }
  }

  update(dt: number) {
    this.time += dt
    const sq = this.ctx.squad
    for (const g of this.gates) g.update(dt, this.time)
    for (const row of this.gateRows) {
      if (row.done || sq.z > row.z) continue
      row.done = true
      let chosen = row.gates[0]
      let best = Infinity
      for (const g of row.gates) {
        const inside = Math.abs(sq.x - g.spec.x) <= g.spec.w / 2
        const d = inside ? -1 : Math.abs(sq.x - g.spec.x)
        if (d < best) { best = d; chosen = g }
      }
      for (const g of row.gates) g.used = true
      this.ctx.onGate({ ...chosen.spec, op: chosen.op }, chosen.value, chosen.spec.x, row.z)
    }
    let saw = 0
    for (const h of this.list) { h.update(dt, this.time, this.ctx); if (h instanceof SawTrap) saw = Math.max(saw, h.vol) }
    // prisoners in cages
    if (this.prisonerCrowd && this.prisonerAnim) {
      let n = 0
      for (const h of this.list) if (h instanceof RescueCage && h.caged && sq.z - h.z < 90) for (const p of h.prisoners) {
        this.prisonerCrowd.set(n++, p.x, 0.15, p.z, 0, 0.9, this.prisonerAnim)
        if (n >= 30) break
      }
      this.prisonerCrowd.commit(n)
    }
    // cleanup behind the squad
    const behind = sq.z + 40
    for (let i = this.list.length - 1; i >= 0; i--) {
      const h = this.list[i]
      if (h.end() > behind) { this.group.remove(h.group); h.dispose(); this.list.splice(i, 1) }
    }
    for (let i = this.gates.length - 1; i >= 0; i--) {
      const g = this.gates[i]
      if (g.z > behind) { this.group.remove(g.group); g.dispose(); this.gates.splice(i, 1) }
    }
    this.gateRows = this.gateRows.filter(r => r.z < behind)
    this.ctx.audio.loop('saw_loop', saw)
  }
  clear() {
    for (const h of this.list) { this.group.remove(h.group); h.dispose() }
    for (const g of this.gates) { this.group.remove(g.group); g.dispose() }
    this.list.length = 0; this.gates.length = 0; this.gateRows.length = 0
  }
}
