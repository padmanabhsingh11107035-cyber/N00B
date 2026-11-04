/**
 * Lurkers — original ambush predators designed for Lane Runner. They are real enemies inside the Enemies simulation (targetable, damage
 * numbers, kills, coins) but enter the fight through ambushes instead of walking down the road:
 *
 *  LEAPER  — packs perch on rooftop edges, glow nodes pulsing to signal each
 *     other, then leap down in a ballistic arc onto the squad's path. A red ring marks every landing
 *     spot for the whole flight, so steering out of it is always possible.
 *  QUILLER — crawls head-first down building facades, hops onto the road and
 *     spits fans of bone spines before rushing in.
 *  HOWLER  — tunnels under the asphalt (moving dirt mound + rumble), erupts
 *     ahead and charges a sonic blast down its lane (red rectangle). Shooting it hard while the
 *     throat sac glows ruptures the sac and cancels the blast. Resurfaces ahead if left alive.
 *  GULPER  — tunnels, erupts beside the squad (red ring), lashes soldiers
 *     with its tongue, then dives and resurfaces further ahead.
 *
 * All casualties are capped per event (fractions of the squad) so they are dangerous but fair.
 */
import * as THREE from 'three'
import type { AssetRef, Assets } from '../engine/assets'
import { CONFIG } from './config'
import type { Enemies, KillCause, Zombie } from './enemies'
import type { Telegraph } from './fx'
import { ROAD_HALF } from './procgen'
import { ARCH, type Arch, type LurkerArch, isLurker } from './rules'
import { playAnim, stepAnim } from './vat'

export interface CreatureDef {
  cap: number; glowI: number; bar: number; runRef: number; shadow: number; hint: string
  /** emissive glow colour for FX (nodes / sac / veins) */
  tint: number
}
export const CREATURES: Record<LurkerArch, CreatureDef> = {
  leaper: { cap: 24, glowI: 1.7, bar: 1.55, runRef: 4.55, shadow: 0.9, tint: 0x5fe8ff, hint: 'LEAPER: leaps from the rooftops. Steer out of the red ring' },
  quiller: { cap: 18, glowI: 1.5, bar: 1.7, runRef: 2.33, shadow: 0.8, tint: 0xff3a4a, hint: 'QUILLER: crawls down walls and spits spines. Kill it as it lands' },
  howler: { cap: 6, glowI: 1.9, bar: 2.9, runRef: 1.61, shadow: 1.5, tint: 0xff5a2a, hint: 'HOWLER: charges a sonic blast down its lane. Shoot the glowing sac to stop it' },
  gulper: { cap: 6, glowI: 1.6, bar: 1.6, runRef: 1.33, shadow: 1.2, tint: 0x9dffb0, hint: 'GULPER: tunnels under the road and snatches soldiers with its tongue' },
}
export const LURKER_TEX = ['color', 'normal', 'rough', 'emissive'] as const
export function creatureAssets(n: LurkerArch): AssetRef[] {
  const b = `assets/creatures/${n}/`
  return [
    { kind: 'vat', key: n, base: b },
    { kind: 'tex', key: `${n}_color`, url: b + 'color.webp', aniso: 4 },
    { kind: 'tex', key: `${n}_normal`, url: b + 'normal.webp', srgb: false },
    { kind: 'tex', key: `${n}_rough`, url: b + 'rough.webp', srgb: false },
    { kind: 'tex', key: `${n}_emissive`, url: b + 'emissive.webp' },
  ]
}
export const creatureReady = (assets: Assets, n: LurkerArch) =>
  assets.has('vat', n) && LURKER_TEX.every(k => assets.has('tex', `${n}_${k}`))

export type LurkerMode = 'perch' | 'air' | 'wall' | 'tunnel' | 'rise' | 'emerge' | 'active' | 'charge' | 'sink'
export interface LurkerState {
  mode: LurkerMode
  t: number
  y: number
  order: number
  side: number
  sx: number; sy: number; sz: number
  tx: number; tz: number; T: number
  q: THREE.Quaternion
  q0: THREE.Quaternion
  tele: Telegraph | null
  glow: number
  phase: number
  cue: boolean
  surf: number
  riseDz: number
  chargeDmg: number
  volleys: number
  spitCd: number
  windup: number
  lashCd: number
  trail: number
  vy: number
}
export interface Building { x: number; top: number; z0: number; z1: number }
interface Needle { x: number; y: number; z: number; vx: number; vy: number; vz: number; t: number }
interface Tongue { zb: Zombie; t: number; tx: number; tz: number; hit: boolean }

const G = 24
const TUNNEL_SPEED = 24
const UP = new THREE.Vector3(0, 1, 0)
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const smooth = (u: number) => u * u * (3 - 2 * u)

export class LurkerBrain {
  readonly group = new THREE.Group()
  private needles: Needle[] = []
  private tongues: Tongue[] = []
  private needleMesh: THREE.InstancedMesh
  private tongueMesh: THREE.InstancedMesh
  private moundMesh: THREE.InstancedMesh
  /** broken balcony / ledge slabs that perched Leapers crouch on */
  private ledgeMesh: THREE.InstancedMesh
  private ledges: { x: number; y: number; z: number; side: number; tilt: number }[] = []
  private m4 = new THREE.Matrix4()
  private qa = new THREE.Quaternion()
  private va = new THREE.Vector3()
  private vb = new THREE.Vector3()
  private sv = new THREE.Vector3()
  private e = new THREE.Euler()
  private lastSqZ = 0
  /** smoothed squad forward velocity (negative = advancing) */
  private sqVz = -9.5
  private shriekT = -9
  private rumble = 0
  private skitter = 0
  constructor(private readonly en: Enemies) {
    const needleGeo = new THREE.ConeGeometry(0.045, 0.85, 5)
    needleGeo.translate(0, 0.42, 0)
    this.needleMesh = new THREE.InstancedMesh(needleGeo, new THREE.MeshStandardMaterial({ color: 0x3a1418, roughness: 0.55, emissive: 0xff2a3a, emissiveIntensity: 0.55 }), 64)
    const tongueGeo = new THREE.CylinderGeometry(0.045, 0.11, 1, 8, 6)
    tongueGeo.translate(0, 0.5, 0)
    this.tongueMesh = new THREE.InstancedMesh(tongueGeo, new THREE.MeshStandardMaterial({ color: 0xa8424e, roughness: 0.42, emissive: 0x2a0508, emissiveIntensity: 1 }), 8)
    const moundGeo = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2)
    this.moundMesh = new THREE.InstancedMesh(moundGeo, new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 1 }), 8)
    const ledgeGeo = new THREE.BoxGeometry(1.35, 0.3, 2.7)
    ledgeGeo.translate(0, -0.15, 0)
    this.ledgeMesh = new THREE.InstancedMesh(ledgeGeo, new THREE.MeshStandardMaterial({ color: 0x5e5750, roughness: 0.96 }), 24)
    for (const m of [this.needleMesh, this.tongueMesh, this.moundMesh, this.ledgeMesh]) { m.count = 0; m.frustumCulled = false; this.group.add(m) }
  }

  // ─────────────────────────── ambush entries ───────────────────────────
  private base(zb: Zombie, mode: LurkerMode, order: number, side: number): LurkerState {
    const lurk: LurkerState = {
      mode, t: 0, y: 0, order, side, sx: zb.x, sy: 0, sz: zb.z, tx: zb.x, tz: zb.z, T: 1,
      q: new THREE.Quaternion(), q0: new THREE.Quaternion(), tele: null, glow: 0, phase: Math.random() * 6.28,
      cue: false, surf: 0, riseDz: 0, chargeDmg: 0, volleys: 0, spitCd: 0.25, windup: 0, lashCd: 0.35, trail: 0, vy: 0,
    }
    zb.lurk = lurk
    zb.state = 'chase'
    zb.hidden = mode !== 'active'
    return lurk
  }
  /** Leaper perched on a roof edge. */
  perch(zb: Zombie, b: Building, side: number, order: number) {
    const lurk = this.base(zb, 'perch', order, side)
    // Crouched on a facade ledge / balcony slab (roof lines sit above the chase camera's view).
    zb.x = side * (Math.abs(b.x) - 0.55)
    zb.z = clamp(zb.z, b.z0 + 1.2, b.z1 - 1.2)
    lurk.y = Math.min(b.top - 0.6, 7.2 + (order % 3) * 0.8 + Math.random() * 0.5)
    this.addLedge(zb.x - side * 0.05, lurk.y, zb.z, side)
    zb.yaw = Math.atan2(-side, 0.55)
    playAnim(zb.anim, 'idle', 0)
    zb.anim.t = Math.random() * 2
  }
  private addLedge(x: number, y: number, z: number, side: number) {
    if (this.ledges.length >= 24) this.ledges.shift()
    this.ledges.push({ x, y, z, side, tilt: (Math.random() - 0.5) * 0.08 })
  }
  /** Quiller clinging to a facade, head down. */
  wall(zb: Zombie, b: Building, side: number, order: number) {
    const lurk = this.base(zb, 'wall', order, side)
    zb.x = side * (Math.abs(b.x) - 0.3)
    zb.z = clamp(zb.z, b.z0 + 1, b.z1 - 1)
    lurk.y = Math.min(b.top - 1.4, 5.5 + Math.random() * 3)
    this.wallQuat(lurk.q, side)
    playAnim(zb.anim, 'idle', 0)
  }
  /** Burrower travelling under the road toward a surfacing point `riseDz` ahead of the squad. */
  burrow(zb: Zombie, order: number, lateral: number) {
    const lurk = this.base(zb, 'tunnel', order, lateral >= 0 ? 1 : -1)
    lurk.y = -3
    lurk.tx = clamp(lateral, -ROAD_HALF + 1.6, ROAD_HALF - 1.6)
    lurk.surf = zb.arch === 'howler' ? 2 : 3
    lurk.riseDz = this.riseDz(zb.arch)
    playAnim(zb.anim, 'emerge', 0)
  }
  private riseDz(a: Arch) { return a === 'howler' ? 30 + Math.random() * 4 : 15 + Math.random() * 3 }
  /** Orientation for crawling down a facade on `side` (belly on the wall, head down, angled toward the squad). */
  private wallQuat(q: THREE.Quaternion, side: number) {
    const up = this.va.set(-side, 0, 0)
    const fwd = this.vb.set(0, -1, 0.32).normalize()
    const right = this.sv.crossVectors(up, fwd).normalize()
    fwd.crossVectors(right, up).normalize()
    this.m4.makeBasis(right, up, fwd)
    q.setFromRotationMatrix(this.m4)
  }

  // ─────────────────────────── helpers ───────────────────────────
  private get sq() { return this.en.ctx.squad }
  private capVisible(frac: number, minReal: number) {
    const sq = this.sq
    if (!sq.soldiers.length) return 0
    return Math.max(1, Math.ceil(Math.max(minReal, sq.count * frac) / Math.max(1, sq.perVisible)))
  }
  private nearest(x: number, z: number): { x: number; z: number } | null {
    let best = Infinity, out: { x: number; z: number } | null = null
    for (const s of this.sq.soldiers) {
      const d = (s.x - x) ** 2 + (s.z - z) ** 2
      if (d < best) { best = d; out = s }
    }
    return out
  }
  private tele(): Telegraph | null {
    const t = this.en.ctx.fx.telegraph()
    if (t) t.active = true
    return t
  }
  private dropTele(lurk: LurkerState) { lurk.tele?.hide(); lurk.tele = null }
  /** Area casualties with a per-event budget. Returns real soldiers lost. */
  private strike(pred: (x: number, z: number) => boolean, chance: number, frac: number, min: number, cause: string, x: number, z: number) {
    const c = this.en.ctx
    let any = false
    for (const s of this.sq.soldiers) if (pred(s.x, s.z)) { any = true; break }
    if (!any) return 0
    if (c.shieldTrap()) return 0
    const lost = this.sq.killWhere(pred, chance, this.capVisible(frac, min))
    if (lost) c.onSoldiersLost(lost, cause, x, z)
    return lost
  }
  private eruptFx(x: number, z: number, r: number, big: number) {
    const fx = this.en.ctx.fx
    fx.gib(x, 0.4, z, Math.round(10 * big), 0.9 * big, 0x4d463f)
    fx.dust(x, z, Math.round(8 * big), 2.2 * big, 0x7a6a58, 0.5)
    fx.shockwave(x, z, r * 1.5, 0xc89a6a)
    fx.decal('scorch', x, z, r * 2.1, 0.85, 0x3a2e24, 16)
    for (let i = 0; i < 6 * big; i++) fx.alphaP('shard', x + (Math.random() - 0.5) * r, 0.3, z + (Math.random() - 0.5) * r, (Math.random() - 0.5) * 7, 5 + Math.random() * 7, (Math.random() - 0.5) * 7, 1.1, 0.35, 0.25, 0x55504a, 1, { grav: 18, spin: 8, ground: true })
    for (let i = 0; i < 4 * big; i++) fx.alphaP('smoke', x + (Math.random() - 0.5) * r, 0.5, z + (Math.random() - 0.5) * r, 0, 1.2, 0, 2.2, 1.5, 3.8 * big, 0x8a7a66, 0.45, { fadeIn: 0.05 })
    this.en.ctx.shake(0.3 * big)
  }

  // ─────────────────────────── damage hooks ───────────────────────────
  onDamage(zb: Zombie, dmg: number) {
    const lurk = zb.lurk!
    if (lurk.mode === 'charge') {
      lurk.chargeDmg += dmg
      const c = this.en.ctx
      if (Math.random() < 0.3) this.sacFx(zb, 3)
      if (lurk.chargeDmg >= zb.maxHp * 0.15) {
        // weak point: the swollen sac ruptures and the blast is cancelled
        this.dropTele(lurk)
        this.sacFx(zb, 26)
        c.fx.explosion(zb.x, 1.1, zb.z + 0.8, 1.2, 0xff5a2a)
        c.fx.text(zb.x, 3.2, zb.z, 'SAC RUPTURED!', 'crit', 1.2)
        c.audio.play('shield_break', { vol: 0.8, rate: 0.7 })
        c.audio.play('roar', { vol: 0.6, rate: 1.3 })
        c.shake(0.3)
        lurk.glow = 0
        lurk.mode = 'active'
        lurk.windup = 1.3
        playAnim(zb.anim, 'death', 0.08)
        zb.anim.speed = 0.9
        zb.hp -= zb.maxHp * 0.1
        zb.flash = 1
        if (zb.hp <= 0) this.en.kill(zb, 'bullet', false)
      }
    }
  }
  private sacFx(zb: Zombie, n: number) {
    const fx = this.en.ctx.fx
    const s = zb.scale
    const x = zb.x + Math.sin(zb.yaw) * 0.76 * s, z = zb.z + Math.cos(zb.yaw) * 0.76 * s
    fx.sparks(x, 1.08 * s, z, n, 0xff6a3a, 7)
    if (n > 10) { fx.gib(x, 1.1 * s, z, 8, 1, 0x7a1206); fx.decal('blood', x, z + 0.6, 2.2, 0.9) }
  }
  onKill(zb: Zombie, cause: KillCause, gib: boolean) {
    const lurk = zb.lurk!
    const fx = this.en.ctx.fx
    this.dropTele(lurk)
    for (let i = this.tongues.length - 1; i >= 0; i--) if (this.tongues[i].zb === zb) this.tongues.splice(i, 1)
    const d = CREATURES[zb.arch as LurkerArch]
    if (lurk.mode === 'tunnel' || lurk.mode === 'rise' || lurk.mode === 'sink') { zb.gibbed = true; this.eruptFx(zb.x, zb.z, 1.4, 0.8); return }
    const big = zb.arch === 'howler' ? 1.8 : zb.arch === 'gulper' ? 1.4 : 1
    lurk.vy = 0
    if (gib && cause === 'explosion') {
      zb.gibbed = true
      fx.gib(zb.x, 0.8 + lurk.y, zb.z, Math.round(12 * big), big, 0x3a0a08)
      fx.decal('blood', zb.x, zb.z, 2 * big, 0.9)
    } else {
      playAnim(zb.anim, 'death', 0.08)
      zb.anim.speed = 1
      fx.gib(zb.x, 0.9 + lurk.y, zb.z, Math.round(5 * big), 0.8 * big, 0x3a0a08)
      fx.decal('blood', zb.x, zb.z - 0.3, 1.6 * big, 0.85, 0x9a8a8a)
    }
    // the bioluminescence bleeds out
    for (let i = 0; i < 8 * big; i++) fx.addP('glow', zb.x + (Math.random() - 0.5) * big, 0.4 + lurk.y + Math.random() * big, zb.z + (Math.random() - 0.5) * big, 0, 0.8, 0, 0.9, 0.35, 0.05, d.tint, 0.9)
    this.en.ctx.audio.play('leaper_shriek', { vol: 0.45, rate: zb.arch === 'howler' ? 0.55 : zb.arch === 'gulper' ? 0.7 : 1.15, max: 2, gap: 0.2 })
    lurk.mode = 'active'
  }
  updateDead(zb: Zombie, dt: number) {
    const lurk = zb.lurk!
    if (lurk.y > 0) { lurk.vy -= G * dt; lurk.y = Math.max(0, lurk.y + lurk.vy * dt) }
    lurk.glow = Math.max(0, lurk.glow - dt * 1.5)
  }

  // ─────────────────────────── per-creature update ───────────────────────────
  update(zb: Zombie, dt: number) {
    const lurk = zb.lurk!
    const c = this.en.ctx
    const sq = this.sq
    const fx = c.fx
    const dzs = zb.z - sq.z // negative = ahead of the squad
    lurk.t += dt
    const pulse = 0.5 + 0.5 * Math.sin(this.en.time * 5.5 + lurk.phase)
    switch (lurk.mode) {
      case 'perch': {
        lurk.glow = 0.25 + pulse * 0.45
        stepAnim(zb.anim, dt)
        if (!lurk.cue && -dzs < 40) {
          lurk.cue = true
          c.announce?.('leaper', 'roof')
          if (this.en.time - this.shriekT > 1.2) { this.shriekT = this.en.time; c.audio.play('leaper_shriek', { vol: 0.8, rate: 0.95 + Math.random() * 0.1 }) }
          fx.addP('glow', zb.x, lurk.y + 0.8, zb.z, 0, 0.5, 0, 0.5, 0.6, 1.8, CREATURES.leaper.tint, 0.9)
        }
        if (lurk.cue) lurk.glow = 0.7 + pulse * 0.3
        if (-dzs < 28 + lurk.order * 2.4) {
          // leap: land a few metres in front of where the squad will be
          const T = 0.95
          lurk.T = T; lurk.t = 0; lurk.sx = zb.x; lurk.sy = lurk.y; lurk.sz = zb.z
          lurk.tx = clamp(sq.x + (Math.random() - 0.5) * 4.4, -ROAD_HALF + 0.9, ROAD_HALF - 0.9)
          lurk.tz = sq.z + this.sqVz * T - sq.halfD - 3 - Math.random() * 4
          lurk.mode = 'air'
          lurk.tele = this.tele()?.circle(lurk.tx, lurk.tz, 1.6) ?? null
          playAnim(zb.anim, 'leap', 0.06)
          zb.anim.speed = 0.6 / T
          c.audio.play('leap', { vol: 0.7, max: 3, gap: 0.08 })
          fx.dust(zb.x, zb.z, 3, 1.2, 0x6a6058)
          for (let i = 0; i < 4; i++) fx.alphaP('shard', zb.x, lurk.y, zb.z, (Math.random() - 0.5) * 3, 2, (Math.random() - 0.5) * 3, 1.2, 0.2, 0.18, 0x55504a, 1, { grav: 20, spin: 6, ground: true })
        }
        return
      }
      case 'wall': {
        lurk.glow = 0.3 + pulse * 0.4
        stepAnim(zb.anim, dt)
        if (-dzs < 46 + lurk.order * 3) {
          if (zb.anim.clip !== 'run') { playAnim(zb.anim, 'run', 0.2); zb.anim.speed = 1.4; c.announce?.('quiller', 'wall') }
          lurk.y -= 2.9 * dt
          zb.z += 1.1 * dt
          this.skitter = Math.max(this.skitter, clamp(1 - -dzs / 45, 0, 1) * 0.5)
          if (Math.random() < 5 * dt) fx.alphaP('shard', zb.x, lurk.y, zb.z, -lurk.side * 0.5, -1, 0, 0.8, 0.12, 0.1, 0x4a4540, 1, { grav: 16, ground: true })
          if (lurk.y <= 1.4) {
            lurk.mode = 'air'; lurk.t = 0; lurk.T = 0.5
            lurk.sx = zb.x; lurk.sy = lurk.y; lurk.sz = zb.z
            lurk.tx = lurk.side * (ROAD_HALF - 1 - Math.random() * 1.8); lurk.tz = zb.z + 1.4
            lurk.q0.copy(lurk.q)
            playAnim(zb.anim, 'leap', 0.08); zb.anim.speed = 1.1
            c.audio.play('leap', { vol: 0.4, rate: 1.4, max: 3, gap: 0.08 })
          }
        }
        return
      }
      case 'air': {
        const u = Math.min(1, lurk.t / lurk.T)
        zb.x = lurk.sx + (lurk.tx - lurk.sx) * u
        zb.z = lurk.sz + (lurk.tz - lurk.sz) * u
        // ballistic height: y(0)=sy, y(T)=0 with gravity G
        const vy0 = (0 - lurk.sy) / lurk.T + 0.5 * G * lurk.T
        const tt = u * lurk.T
        lurk.y = Math.max(0, lurk.sy + vy0 * tt - 0.5 * G * tt * tt)
        const vy = vy0 - G * tt
        if (lurk.tele) lurk.tele.u.uProgress.value = u
        if (zb.arch === 'leaper') {
          zb.yaw = Math.atan2(lurk.tx - lurk.sx, lurk.tz - lurk.sz)
          const hs = Math.hypot(lurk.tx - lurk.sx, lurk.tz - lurk.sz) / lurk.T
          this.e.set(clamp(Math.atan2(-vy, hs) * 0.8, -0.55, 0.7), zb.yaw, 0, 'YXZ')
          lurk.q.setFromEuler(this.e)
          lurk.glow = 1
        } else {
          zb.yaw = Math.atan2(sq.x - zb.x, sq.z - zb.z)
          this.e.set(0, zb.yaw, 0, 'YXZ')
          this.qa.setFromEuler(this.e)
          lurk.q.copy(lurk.q0).slerp(this.qa, smooth(Math.min(1, u * 1.3)))
        }
        zb.hidden = u < 0.72
        stepAnim(zb.anim, dt)
        if (u >= 1) this.land(zb)
        return
      }
      case 'tunnel': {
        zb.hidden = true
        const tzW = sq.z - lurk.riseDz
        const dx = lurk.tx - zb.x, dz = tzW - zb.z
        const d = Math.hypot(dx, dz)
        const step = Math.min(d, TUNNEL_SPEED * dt)
        if (d > 1e-3) { zb.x += (dx / d) * step; zb.z += (dz / d) * step; zb.yaw = Math.atan2(dx, dz) }
        lurk.trail += step
        this.rumble = Math.max(this.rumble, clamp(1 - Math.abs(dzs) / 45, 0, 1))
        if (Math.random() < 16 * dt * fx.density) fx.dust(zb.x + (Math.random() - 0.5), zb.z, 1, 1.1, 0x6e5e4c, 0.35)
        if (Math.random() < 9 * dt) fx.alphaP('shard', zb.x + (Math.random() - 0.5) * 1.2, 0.1, zb.z, (Math.random() - 0.5) * 3, 2.5 + Math.random() * 2, (Math.random() - 0.5) * 3, 0.9, 0.16, 0.12, 0x4d463f, 1, { grav: 18, spin: 6, ground: true })
        if (lurk.trail > 0.9) { lurk.trail = 0; fx.decal('scorch', zb.x, zb.z, 1.3, 0.55, 0x2e2620, 7) }
        if (d < 0.6) {
          if (!lurk.cue) { lurk.cue = true; c.announce?.(zb.arch as LurkerArch, 'burrow') }
          lurk.mode = 'rise'; lurk.t = 0
          lurk.tele = this.tele()?.circle(zb.x, zb.z, zb.arch === 'howler' ? 2.4 : 2.1) ?? null
          c.audio.play('burrow_rumble', { vol: 0.7, rate: zb.arch === 'howler' ? 0.8 : 1 })
        }
        return
      }
      case 'rise': {
        zb.hidden = true
        const warn = zb.arch === 'howler' ? 0.9 : 0.8
        if (lurk.tele) lurk.tele.u.uProgress.value = lurk.t / warn
        if (Math.random() < 30 * dt * fx.density) fx.dust(zb.x + (Math.random() - 0.5) * 2, zb.z + (Math.random() - 0.5) * 2, 1, 1.4, 0x7a6a58, 0.4)
        if (Math.random() < 14 * dt) fx.alphaP('shard', zb.x + (Math.random() - 0.5) * 2, 0.1, zb.z + (Math.random() - 0.5) * 2, 0, 3 + Math.random() * 3, 0, 0.7, 0.14, 0.1, 0x4d463f, 1, { grav: 18, ground: true })
        c.shake(0.04)
        if (lurk.t >= warn) {
          this.dropTele(lurk)
          const r = zb.arch === 'howler' ? 2.4 : 2.1
          this.eruptFx(zb.x, zb.z, r, zb.arch === 'howler' ? 1.5 : 1.15)
          c.audio.play('erupt', { vol: 0.9, rate: zb.arch === 'howler' ? 0.85 : 1.05 })
          c.audio.play('roar', { vol: zb.arch === 'howler' ? 0.7 : 0.45, rate: zb.arch === 'howler' ? 0.8 : 1.35 })
          this.strike((x, z) => (x - zb.x) ** 2 + (z - zb.z) ** 2 < r * r, 0.6, 0.05, 1, zb.arch, zb.x, zb.z)
          lurk.mode = 'emerge'; lurk.t = 0; lurk.y = 0
          playAnim(zb.anim, 'emerge', 0)
          zb.anim.speed = 1.15
          zb.yaw = Math.atan2(sq.x - zb.x, sq.z - zb.z)
        }
        return
      }
      case 'emerge': {
        const dur = this.en.libDuration(zb, 'emerge') / 1.15
        zb.hidden = lurk.t < dur * 0.3
        stepAnim(zb.anim, dt)
        lurk.glow = Math.min(1, lurk.t / dur) * 0.6
        if (lurk.t >= dur) {
          if (zb.arch === 'howler') this.startCharge(zb)
          else { lurk.mode = 'active'; lurk.t = 0; playAnim(zb.anim, 'idle', 0.2); zb.anim.speed = 1 }
        }
        return
      }
      case 'charge': {
        const T = 1.75
        lurk.glow = 0.4 + 2.2 * (lurk.t / T) + 0.3 * Math.sin(this.en.time * 30)
        zb.flash = Math.max(zb.flash, 0.15 * (lurk.t / T))
        if (lurk.tele) lurk.tele.u.uProgress.value = lurk.t / T
        stepAnim(zb.anim, dt)
        if (Math.random() < 10 * dt) this.sacGlow(zb)
        if (lurk.t >= T) this.blast(zb)
        return
      }
      case 'sink': {
        stepAnim(zb.anim, dt)
        if (Math.random() < 20 * dt) fx.dust(zb.x + (Math.random() - 0.5) * 1.6, zb.z + (Math.random() - 0.5) * 1.6, 1, 1.3, 0x7a6a58, 0.4)
        if (lurk.t >= 0.62) {
          zb.hidden = true
          lurk.mode = 'tunnel'; lurk.t = 0; lurk.y = -3
          lurk.surf--
          lurk.riseDz = this.riseDz(zb.arch)
          lurk.tx = clamp(sq.x + (Math.random() < 0.5 ? -1 : 1) * (1.6 + Math.random() * 2.4), -ROAD_HALF + 1.6, ROAD_HALF - 1.6)
          this.eruptFx(zb.x, zb.z, 1.2, 0.6)
        }
        return
      }
      case 'active': this.active(zb, dt); return
    }
  }
  private land(zb: Zombie) {
    const lurk = zb.lurk!
    const c = this.en.ctx
    const fx = c.fx
    this.dropTele(lurk)
    lurk.mode = 'active'; lurk.t = 0; lurk.y = 0
    zb.hidden = false
    zb.yaw = Math.atan2(this.sq.x - zb.x, this.sq.z - zb.z)
    playAnim(zb.anim, 'land', 0.05)
    zb.anim.speed = 1
    lurk.windup = zb.arch === 'leaper' ? 0.42 : 0.3
    const heavy = zb.arch === 'leaper'
    fx.dust(zb.x, zb.z, heavy ? 6 : 3, heavy ? 1.8 : 1.2, 0x8a7a66, 0.45)
    fx.shockwave(zb.x, zb.z, heavy ? 2.4 : 1.4, 0xffb070)
    fx.decal('scorch', zb.x, zb.z, heavy ? 1.9 : 1.2, 0.6, 0x3a3028, 10)
    for (let i = 0; i < (heavy ? 6 : 3); i++) fx.alphaP('shard', zb.x, 0.2, zb.z, (Math.random() - 0.5) * 6, 3 + Math.random() * 3, (Math.random() - 0.5) * 6, 0.9, 0.2, 0.15, 0x55504a, 1, { grav: 18, spin: 7, ground: true })
    c.audio.play('land', { vol: heavy ? 0.8 : 0.5, max: 3, gap: 0.06, rate: heavy ? 1 : 1.3 })
    c.shake(heavy ? 0.22 : 0.08)
    if (heavy) this.strike((x, z) => (x - zb.x) ** 2 + (z - zb.z) ** 2 < 1.6 * 1.6, 0.7, 0.04, 1, 'leaper', zb.x, zb.z)
  }
  private startCharge(zb: Zombie) {
    const lurk = zb.lurk!
    const c = this.en.ctx
    lurk.mode = 'charge'; lurk.t = 0; lurk.chargeDmg = 0
    zb.yaw = 0 // blast straight down its lane toward the squad
    playAnim(zb.anim, 'charge', 0.15)
    zb.anim.speed = 1.6 / 1.75
    lurk.tele = this.tele()?.rect(zb.x, zb.z + 9.2, 6.6, 17, 0, 0xff3a1a) ?? null
    c.audio.play('sac_charge', { vol: 0.85 })
    c.fx.text(zb.x, 3.4, zb.z, 'SHOOT THE SAC!', 'elite', 1.2)
  }
  private sacGlow(zb: Zombie) {
    const s = zb.scale
    const x = zb.x + Math.sin(zb.yaw) * 0.76 * s, z = zb.z + Math.cos(zb.yaw) * 0.76 * s
    this.en.ctx.fx.addP('glow', x + (Math.random() - 0.5) * 0.5, 1.05 * s + (Math.random() - 0.5) * 0.4, z, 0, 0.3, 0, 0.35, 0.5, 0.9, 0xff5a2a, 0.8)
  }
  private blast(zb: Zombie) {
    const lurk = zb.lurk!
    const c = this.en.ctx
    const fx = c.fx
    this.dropTele(lurk)
    const x0 = zb.x, z0 = zb.z
    // shock rings roll down the lane
    for (let k = 0; k < 6; k++) fx.shockwave(x0, z0 + 1.5 + k * 2.8, 2.2 + k * 0.4, 0xff7a3a)
    for (let k = 0; k < 10; k++) fx.dust(x0 + (Math.random() - 0.5) * 6, z0 + 1 + Math.random() * 16, 1, 2, 0x8a7a66, 0.45)
    for (let k = 0; k < 16; k++) fx.addP('streak', x0 + (Math.random() - 0.5) * 3, 0.8 + Math.random(), z0 + 1, (Math.random() - 0.5) * 6, 0, 26 + Math.random() * 10, 0.5, 0.5, 0.2, 0xffa060, 0.8)
    c.audio.play('pulse_blast', { vol: 1 })
    c.shake(0.55)
    this.strike((x, z) => Math.abs(x - x0) < 3.3 && z > z0 && z < z0 + 17, 0.55, 0.1, 2, 'howler', x0, z0 + 6)
    // the blast also flattens zombies in the lane
    this.en.forEachNear(x0, z0 + 8, 8, o => { if (o !== zb && Math.abs(o.x - x0) < 3.3 && o.z > z0) o.kz += 9 })
    lurk.mode = 'active'; lurk.t = 0; lurk.windup = 0.55; lurk.glow = 0.2
    playAnim(zb.anim, 'attack', 0.06)
    zb.anim.speed = 1
  }
  private startSink(zb: Zombie) {
    const lurk = zb.lurk!
    lurk.mode = 'sink'; lurk.t = 0
    zb.hidden = true
    playAnim(zb.anim, 'emerge', 0.12)
    zb.anim.t = this.en.libDuration(zb, 'emerge')
    zb.anim.speed = -2.2
    this.en.ctx.audio.play('erupt', { vol: 0.5, rate: 1.3 })
    this.dropTele(lurk)
  }

  /** Ground behaviour after the ambush entry. */
  private active(zb: Zombie, dt: number) {
    const lurk = zb.lurk!
    const c = this.en.ctx
    const sq = this.sq
    const fx = c.fx
    const d = ARCH[zb.arch]
    const def = CREATURES[zb.arch as LurkerArch]
    const pulse = 0.5 + 0.5 * Math.sin(this.en.time * 5.5 + lurk.phase)
    lurk.glow += ((zb.arch === 'leaper' ? 0.45 + pulse * 0.35 : 0.3 + pulse * 0.3) - lurk.glow) * Math.min(1, dt * 4)
    const front = sq.z - sq.halfD
    // burrowers dive once the squad has run past them, and resurface ahead
    if ((zb.arch === 'gulper' || zb.arch === 'howler') && lurk.surf > 0 && lurk.windup <= 0 && zb.z > front + 1.2 && !this.tongues.some(t => t.zb === zb)) {
      this.startSink(zb); return
    }
    let spd = 0
    const near = this.nearest(zb.x, zb.z)
    const tx = near ? near.x : sq.x, tz = near ? near.z : sq.z
    const dx = tx - zb.x, dz = tz - zb.z
    const dist = Math.hypot(dx, dz) || 1
    if (lurk.windup > 0) {
      lurk.windup -= dt
      if (lurk.windup <= 0 && zb.state === 'cast') this.fireVolley(zb)
    } else if (zb.arch === 'quiller' && lurk.volleys < 2 && dist > 6.5) {
      lurk.spitCd -= dt
      spd = 0.6
      if (lurk.spitCd <= 0) {
        zb.state = 'cast'
        lurk.windup = 0.32
        playAnim(zb.anim, 'attack', 0.06); zb.anim.speed = 1.1
        fx.addP('glow', zb.x + Math.sin(zb.yaw) * 0.8, 0.9, zb.z + Math.cos(zb.yaw) * 0.8, 0, 0, 0, 0.32, 0.3, 0.9, def.tint, 0.9)
      } else if (zb.anim.clip !== 'idle' && zb.anim.clip !== 'attack') playAnim(zb.anim, 'idle', 0.2)
    } else if (zb.arch === 'gulper') {
      spd = dist > 4 ? 1.2 : 0
      lurk.lashCd -= dt
      if (lurk.lashCd <= 0 && near && dist < 9.5 && !this.tongues.some(t => t.zb === zb)) {
        lurk.lashCd = 1.0 + Math.random() * 0.3
        playAnim(zb.anim, 'attack', 0.05); zb.anim.speed = 1.3
        this.tongues.push({ zb, t: 0, tx: near.x, tz: near.z + this.sqVz * 0.12, hit: false })
        c.audio.play('tongue', { vol: 0.8, max: 2, gap: 0.1 })
      } else if (zb.anim.clip === 'attack' && zb.anim.t > 0.62) playAnim(zb.anim, 'idle', 0.2)
    } else {
      spd = d.speed * (zb.haste > 0 ? 1.4 : 1) * (zb.stagger > 0 ? 0.2 : 1)
      const reach = zb.radius + 0.55
      if (near && dist < reach + 0.25) {
        zb.cd -= dt
        spd = 0.3
        if (zb.state !== 'attack') { zb.state = 'attack'; playAnim(zb.anim, 'attack', 0.06); zb.anim.speed = 1.2; zb.cd = Math.min(zb.cd, 0.22) }
        if (zb.cd <= 0) {
          zb.cd = zb.arch === 'howler' ? 1.25 : zb.arch === 'leaper' ? 0.72 : 0.6
          playAnim(zb.anim, 'idle', 0); playAnim(zb.anim, 'attack', 0.04)
          const lost = c.shieldTrap() ? 0 : sq.killNear(zb.x, zb.z, Math.max(1, d.kills))
          if (lost) { c.onSoldiersLost(lost, zb.arch, zb.x, zb.z); fx.gib(near.x, 0.9, near.z, 4, 0.8) }
          if (zb.arch === 'howler') { c.shake(0.3); fx.shockwave(zb.x, zb.z + 0.8, 2, 0xffa060); fx.dust(zb.x, zb.z + 0.8, 3, 1.5) }
        }
      } else {
        if (zb.state === 'attack' || zb.state === 'cast') zb.state = 'chase'
        if (zb.anim.clip !== 'run') playAnim(zb.anim, 'run', 0.18)
      }
    }
    const vx = (dx / dist) * spd, vz = (dz / dist) * spd
    zb.x += (vx + zb.kx) * dt
    zb.z += (vz + zb.kz) * dt
    zb.kx *= 1 - dt * 6; zb.kz *= 1 - dt * 6
    zb.x = clamp(zb.x, -ROAD_HALF - 1, ROAD_HALF + 1)
    const targetYaw = Math.atan2(dx, dz)
    let dy = targetYaw - zb.yaw
    while (dy > Math.PI) dy -= Math.PI * 2
    while (dy < -Math.PI) dy += Math.PI * 2
    zb.yaw += dy * Math.min(1, dt * (zb.arch === 'howler' ? 3 : 8))
    if (zb.anim.clip === 'run') zb.anim.speed = clamp(spd / def.runRef, 0.6, 1.75)
    stepAnim(zb.anim, dt)
    this.en.separate(zb, dt)
  }
  private fireVolley(zb: Zombie) {
    const lurk = zb.lurk!
    const c = this.en.ctx
    zb.state = 'chase'
    lurk.volleys++
    lurk.spitCd = 0.95
    const sq = this.sq
    if (!sq.soldiers.length) return
    const mx = zb.x + Math.sin(zb.yaw) * 0.8, mz = zb.z + Math.cos(zb.yaw) * 0.8
    const n = 3 + (lurk.volleys > 1 ? 1 : 0)
    for (let k = 0; k < n; k++) {
      const s = sq.soldiers[Math.floor(Math.random() * sq.soldiers.length)]
      const dist = Math.hypot(s.x - mx, s.z - mz)
      const T = dist / 26
      const tx = s.x + (Math.random() - 0.5) * 0.8, tz = s.z + this.sqVz * T
      this.needles.push({ x: mx, y: 0.95, z: mz, vx: (tx - mx) / T, vy: (0.85 - 0.95) / T, vz: (tz - mz) / T, t: 0 })
    }
    c.audio.play('needle_spit', { vol: 0.8, max: 3, gap: 0.05 })
    c.fx.addP('muzzle', mx, 0.95, mz, 0, 0, 0, 0.1, 0.7, 0.2, 0xff4a5a, 0.9)
  }

  // ─────────────────────────── shared per-frame work ───────────────────────────
  updateShared(dt: number) {
    const c = this.en.ctx
    const sq = this.sq
    const fx = c.fx
    if (dt > 0) this.sqVz += ((sq.z - this.lastSqZ) / dt - this.sqVz) * Math.min(1, dt * 4)
    if (Math.abs(sq.z - this.lastSqZ) > 30) this.sqVz = -CONFIG.squad.runSpeed
    this.lastSqZ = sq.z
    // needles
    for (let i = this.needles.length - 1; i >= 0; i--) {
      const n = this.needles[i]
      n.t += dt
      n.x += n.vx * dt; n.y += n.vy * dt; n.z += n.vz * dt
      if (Math.random() < 30 * dt) fx.addP('glow', n.x, n.y, n.z, 0, 0, 0, 0.18, 0.18, 0.05, 0xff3a4a, 0.7)
      let done = n.t > 1.4 || n.y < 0
      if (!done && Math.abs(n.z - sq.z) < sq.halfD + 0.8) {
        for (const s of sq.soldiers) {
          if ((s.x - n.x) ** 2 + (s.z - n.z) ** 2 < 0.5 * 0.5) {
            if (c.shieldTrap()) fx.sparks(n.x, n.y, n.z, 6, 0x8ac8ff, 5)
            else {
              const lost = sq.killNear(n.x, n.z, 1)
              if (lost) { c.onSoldiersLost(lost, 'quiller', n.x, n.z); fx.impact(n.x, n.y, n.z, true) }
            }
            done = true
            break
          }
        }
      }
      if (done) {
        if (n.t > 1.4 || n.y < 0) { fx.sparks(n.x, 0.1, n.z, 3, 0xffa0a0, 3); fx.decal('dot', n.x, n.z, 0.35, 0.7, 0x401010, 5) }
        this.needles.splice(i, 1)
      }
    }
    // tongues: extend 0.16 s, snatch, retract 0.24 s
    for (let i = this.tongues.length - 1; i >= 0; i--) {
      const tg = this.tongues[i]
      tg.t += dt
      if (!tg.hit && tg.t >= 0.16) {
        tg.hit = true
        let hit: { x: number; z: number } | null = null
        for (const s of sq.soldiers) if ((s.x - tg.tx) ** 2 + (s.z - tg.tz) ** 2 < 1.1 * 1.1) { hit = s; break }
        if (hit) {
          const lost = c.shieldTrap() ? 0 : sq.killNear(hit.x, hit.z, 2)
          if (lost) {
            c.onSoldiersLost(lost, 'gulper', hit.x, hit.z)
            fx.gib(hit.x, 1, hit.z, 5, 0.8)
            fx.text(hit.x, 1.8, hit.z, 'SNATCHED!', 'bad', 0.8)
          }
        } else fx.dust(tg.tx, tg.tz, 1, 0.8)
      }
      if (tg.t >= 0.4 || tg.zb.state === 'dead') this.tongues.splice(i, 1)
    }
    c.audio.loop('burrow_rumble', this.rumble * 0.55)
    c.audio.loop('skitter', this.skitter)
    this.rumble = Math.max(0, this.rumble - dt * 3)
    this.skitter = Math.max(0, this.skitter - dt * 3)
  }

  render() {
    const sq = this.sq
    // needles
    let k = 0
    for (const n of this.needles) {
      if (k >= 64) break
      this.va.set(n.vx, n.vy, n.vz).normalize()
      this.qa.setFromUnitVectors(UP, this.va)
      this.m4.compose(this.vb.set(n.x, n.y, n.z), this.qa, this.sv.set(1, 1, 1))
      this.needleMesh.setMatrixAt(k++, this.m4)
    }
    this.needleMesh.count = k
    this.needleMesh.instanceMatrix.needsUpdate = true
    // tongues
    k = 0
    for (const tg of this.tongues) {
      const zb = tg.zb
      const s = zb.scale
      const mx = zb.x + Math.sin(zb.yaw) * 1.25 * s, mz = zb.z + Math.cos(zb.yaw) * 1.25 * s, my = 0.5 * s
      const ext = tg.t < 0.16 ? smooth(tg.t / 0.16) : tg.t < 0.2 ? 1 : 1 - smooth((tg.t - 0.2) / 0.2)
      this.va.set(tg.tx - mx, 0.9 - my, tg.tz - mz)
      const len = this.va.length() * ext
      this.va.normalize()
      this.qa.setFromUnitVectors(UP, this.va)
      const wob = 1 + 0.15 * Math.sin(tg.t * 60)
      this.m4.compose(this.vb.set(mx, my, mz), this.qa, this.sv.set(wob * s, Math.max(0.01, len), wob * s))
      this.tongueMesh.setMatrixAt(k++, this.m4)
      if (k >= 8) break
    }
    this.tongueMesh.count = k
    this.tongueMesh.instanceMatrix.needsUpdate = true
    // dirt mounds over tunnelling burrowers
    k = 0
    for (const zb of this.en.list) {
      const lurk = zb.lurk
      if (!lurk || zb.state === 'dead' || (lurk.mode !== 'tunnel' && lurk.mode !== 'rise')) continue
      if (k >= 8 || zb.z > sq.z + 20) continue
      const big = zb.arch === 'howler' ? 1.35 : 1
      const g = lurk.mode === 'rise' ? 1 + 0.6 * Math.min(1, lurk.t / 0.85) : 1
      const wob = 1 + 0.08 * Math.sin(this.en.time * 25 + lurk.phase)
      this.e.set(0, zb.yaw, 0)
      this.qa.setFromEuler(this.e)
      this.m4.compose(this.vb.set(zb.x, -0.05, zb.z), this.qa, this.sv.set(1.05 * big * g * wob, 0.3 * big * g, 1.55 * big * (lurk.mode === 'rise' ? g : 1)))
      this.moundMesh.setMatrixAt(k++, this.m4)
    }
    this.moundMesh.count = k
    this.moundMesh.instanceMatrix.needsUpdate = true
    // ledges (dropped once well behind the squad)
    this.ledges = this.ledges.filter(l => l.z < sq.z + 25)
    k = 0
    for (const l of this.ledges) {
      this.e.set(0, 0, l.tilt * l.side, 'YXZ')
      this.qa.setFromEuler(this.e)
      this.va.set(l.x, l.y, l.z); this.vb.set(1, 1, 1)
      this.m4.compose(this.va, this.qa, this.vb)
      this.ledgeMesh.setMatrixAt(k++, this.m4)
    }
    this.ledgeMesh.count = k
    this.ledgeMesh.instanceMatrix.needsUpdate = true
  }
  clear() {
    this.needles.length = 0
    this.tongues.length = 0
    this.ledges.length = 0
    this.needleMesh.count = this.tongueMesh.count = this.moundMesh.count = this.ledgeMesh.count = 0
    this.en.ctx.audio.loop('burrow_rumble', 0)
    this.en.ctx.audio.loop('skitter', 0)
  }
}
export { isLurker }
