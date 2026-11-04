import { tickMeshRig } from './meshRig'
import * as THREE from 'three'
import { animateFeatures } from './features'
import { CONFIG } from '../config'
import { angleDelta, clamp, damp, rng } from '../noise'
import { monsterDamage } from '../rules'
import { heightAt, LAKE, OBSTACLES, WATER_LEVEL, WORLD } from '../terrain'
import { MonsterAnimator } from './animator'
import { abilityOf, type AttackId, type MonsterDef, type Part, type VitalSlot } from './defs'
import { attackPose, deathPose, flinchPose, grazePose, locomotion, thrashPose, timing, topplePose, type Phase, type Timing } from './poses'
import { buildMonster, restPositionOf, type HitSphere, type MonsterRig } from './rig'

export type MonsterState = 'roam' | 'alert' | 'stalk' | 'attack' | 'flinch' | 'topple' | 'shake' | 'ridden' | 'flee' | 'dying' | 'dead'
export type Knock = 'flinch' | 'back' | 'down' | 'stun'
export type HunterHit = { attack: AttackId | 'shockwave'; damage: number; knock: Knock; from: THREE.Vector3; label: string }
export type HitResult = 'hit' | 'evaded' | 'ignored'

export type MonsterEvent =
  | { type: 'telegraph'; attack: AttackId; label: string; pos: THREE.Vector3 }
  | { type: 'roar'; pos: THREE.Vector3; weak: boolean }
  | { type: 'footstep'; pos: THREE.Vector3; water: boolean }
  | { type: 'slam'; pos: THREE.Vector3; radius: number }
  | { type: 'volleyMark'; pos: THREE.Vector3; radius: number; delay: number }
  | { type: 'volleyLaunch'; pos: THREE.Vector3 }
  | { type: 'volleyImpact'; pos: THREE.Vector3; radius: number }
  | { type: 'ruptureStart'; pos: THREE.Vector3 }
  | { type: 'ruptureMark'; pos: THREE.Vector3; radius: number; delay: number }
  | { type: 'rupture'; pos: THREE.Vector3; radius: number; idx: number }
  | { type: 'bite'; pos: THREE.Vector3 }
  | { type: 'whoosh'; pos: THREE.Vector3 }
  | { type: 'chargeStart'; pos: THREE.Vector3 }
  | { type: 'enrage' }
  | { type: 'topple'; reason: 'break' | 'crash' | 'slam' }
  | { type: 'flinch' }
  | { type: 'break'; slot: VitalSlot; pos: THREE.Vector3 }
  | { type: 'thrashWarn' }
  | { type: 'buck'; forced: boolean }
  | { type: 'wallSlam'; pos: THREE.Vector3 }
  | { type: 'crash'; pos: THREE.Vector3 }
  | { type: 'death'; pos: THREE.Vector3 }
  | { type: 'alert' }
  | { type: 'flee' }
  | { type: 'rest' }
  | { type: 'wake' }

export type MonsterContext = {
  /** Hunter feet position. */
  hunter: THREE.Vector3
  hunterGrounded: boolean
  /** False in attract mode, while fainted or mounted: the monster ignores the hunter. */
  hunterActive: boolean
  mounted: boolean
  riding: boolean
  rideDir: { x: number; z: number } | null
  hpFraction: number
  hitHunter: (hit: HunterHit) => HitResult
}

type AttackRun = { id: AttackId; timing: Timing; phase: Phase; t: number; hit: boolean; spin: number; cycle?: number }
type Volley = { pos: THREE.Vector3; t: number; radius: number; damage: number }
/** One node of a travelling ground rupture: erupts when `t` reaches 0. */
type Rupture = { pos: THREE.Vector3; t: number; radius: number; idx: number; damage: number }
type Shockwave = { origin: THREE.Vector3; t: number; hit: boolean; max: number; damage: number }

const _v = new THREE.Vector3()
/** Lair: the lake shore nearest the arena centre, where a weakened quarry limps to drink. */
const LAIR = (() => {
  const len = Math.hypot(LAKE.x, LAKE.z)
  return { x: LAKE.x - (LAKE.x / len) * (LAKE.r + 3), z: LAKE.z - (LAKE.z / len) * (LAKE.r + 3) }
})()
const _c = new THREE.Vector3()
const TAU = Math.PI * 2

export class Monster {
  readonly rig: MonsterRig
  readonly anim: MonsterAnimator
  readonly pos = new THREE.Vector3()
  heading = 0
  speed = 0
  state: MonsterState = 'roam'
  /** Has already limped away once this hunt. */
  fled = false
  /** Resting at the lair (drinking). */
  resting = false
  private restT = 0
  private flashK = 0
  private enrageK = 0
  private woundCount = 0
  stateT = 0
  attack: AttackRun | null = null
  lastAttack: AttackId | null = null
  cooldown = 2
  enraged = false
  weakened = false
  pendingRoar = false
  introDone = false
  roarWeak = false
  tailRangeMult = 1
  highlightVital: VitalSlot | null = null
  private flinchMeter = 0
  private flinchThreshold = 400
  private flinchDur = 0.9
  private flinchDir = 1
  private toppleDur = 5
  private events: MonsterEvent[] = []
  private waypoint = new THREE.Vector3()
  private roamWait = 0
  private grazeT = 0
  private thrash = { phase: 'idle' as 'idle' | 'warn' | 'buck', t: 0, next: 2 }
  rideT = 0
  private volleys: Volley[] = []
  private ruptures: Rupture[] = []
  /** Seconds until the enraged signature move may be used again. */
  private sigCooldown = 0
  /** Hover height (Ashwing's airborne signature). */
  private lift = 0
  private liftTarget = 0
  /** Seconds until the nearest pending rupture under `pos` erupts (Infinity when none). */
  ruptureThreat(pos: THREE.Vector3): number {
    let best = Infinity
    for (const r of this.ruptures) if (Math.hypot(pos.x - r.pos.x, pos.z - r.pos.z) < r.radius + 1.2) best = Math.min(best, r.t)
    return best
  }
  private ruptureHit = false
  private shockwave: Shockwave | null = null
  private random = rng(99)
  private eyeBase: THREE.Color
  private eyeRage = new THREE.Color('#ff3b22')

  constructor(readonly def: MonsterDef) {
    this.rig = buildMonster(def)
    this.anim = new MonsterAnimator(this.rig, true)
    this.eyeBase = new THREE.Color(def.palette.eye)
    this.anim.onFootstep = world => {
      const water = heightAt(world.x, world.z) < WATER_LEVEL - 0.15
      this.events.push({ type: 'footstep', pos: world.clone(), water })
    }
  }

  get forward(): THREE.Vector3 {
    return _v.set(Math.sin(this.heading), 0, Math.cos(this.heading))
  }

  get down(): boolean {
    return this.state === 'topple' || this.state === 'dying' || this.state === 'dead'
  }

  get exposed(): boolean {
    return this.state === 'topple'
  }

  get alive(): boolean {
    return this.state !== 'dying' && this.state !== 'dead'
  }

  /** Warn phase of a buck while mounted (UI shows BRACE). */
  get thrashWarning(): number {
    if (this.state !== 'shake' && this.state !== 'ridden') return 0
    if (this.thrash.phase === 'warn') return clamp(this.thrash.t / (0.85 * this.def.stats.telegraph), 0, 1)
    if (this.thrash.phase === 'buck') return 1
    return 0
  }

  get bucking(): boolean {
    return this.thrash.phase === 'buck' && (this.state === 'shake' || this.state === 'ridden')
  }

  reset(pos: THREE.Vector3, heading: number, maxHp: number): void {
    this.pos.copy(pos)
    this.heading = heading
    this.speed = 0
    this.state = 'roam'
    this.stateT = 0
    this.attack = null
    this.lastAttack = null
    this.cooldown = 2.5
    this.enraged = false
    this.sigCooldown = 0
    this.lift = 0
    this.liftTarget = 0
    this.weakened = false
    this.pendingRoar = false
    this.introDone = false
    this.fled = false
    this.resting = false
    this.restT = 0
    this.flashK = 0
    this.enrageK = 0
    this.woundCount = 0
    for (const w of this.rig.skin.uWounds.value) w.set(0, -999, 0, 0)
    this.roarWeak = false
    this.tailRangeMult = 1
    this.highlightVital = null
    this.flinchMeter = 0
    this.flinchThreshold = maxHp * 0.075
    this.volleys = []
    this.ruptures = []
    this.shockwave = null
    this.rideT = 0
    this.roamWait = 1
    this.pickWaypoint()
    for (const def of this.def.vitals) {
      const v = this.rig.vitals[def.slot]
      v.max = v.hp = Math.round(maxHp * def.breakFraction)
      v.broken = false
      v.mesh.scale.setScalar(1)
      v.mat.color.set(this.def.palette.glow)
      v.mat.emissive.set(this.def.palette.glow)
    }
    this.rig.tailEnd.scale.setScalar(1)
    this.rig.eyeMat.color.copy(this.eyeBase)
    this.rig.eyeMat.emissive.copy(this.eyeBase)
    this.placeRoot()
    this.anim.target.bodyY = 0
    this.anim.reset(heightAt)
  }

  statusTags(): string[] {
    const tags: string[] = []
    if (this.state === 'dying' || this.state === 'dead') return ['Slain']
    if (this.enraged) tags.push('Enraged')
    if (this.state === 'topple') tags.push('Toppled')
    if (this.state === 'shake') tags.push('Mounted')
    if (this.state === 'ridden') tags.push('Ridden')
    if (this.weakened) tags.push('Weakened')
    return tags
  }

  private setState(s: MonsterState): void {
    this.state = s
    this.stateT = 0
  }

  private pickWaypoint(): void {
    for (let i = 0; i < 20; i += 1) {
      const a = this.random() * TAU
      const d = 10 + this.random() * 45
      const x = Math.cos(a) * d
      const z = Math.sin(a) * d
      if (OBSTACLES.every(o => Math.hypot(o.x - x, o.z - z) > o.r + 10)) {
        this.waypoint.set(x, 0, z)
        return
      }
    }
    this.waypoint.set(0, 0, 0)
  }

  private turnToward(angle: number, rate: number, dt: number): void {
    const d = angleDelta(this.heading, angle)
    this.heading += clamp(d, -rate * dt, rate * dt)
  }

  /** Body radius and obstacle collision; returns true if the front struck something solid. */
  private moveAndCollide(dt: number): boolean {
    const fwd = this.forward
    this.pos.addScaledVector(fwd, this.speed * dt)
    const R = this.def.plan.bodyWidth * 0.55
    let struck = false
    for (const o of OBSTACLES) {
      const dx = this.pos.x - o.x
      const dz = this.pos.z - o.z
      const min = o.r + R
      const d = Math.hypot(dx, dz)
      if (d < min && d > 1e-4) {
        this.pos.x = o.x + (dx / d) * min
        this.pos.z = o.z + (dz / d) * min
        if (o.kind !== 'tree' || o.r > 1) struck = true
      }
    }
    // Front probe (chest/head) so charges visibly crash into spires.
    const reach = this.def.plan.bodyLength * 0.5 + this.def.plan.neckLength * 0.4
    _c.copy(this.pos).addScaledVector(fwd, reach)
    for (const o of OBSTACLES) {
      if (o.kind === 'tree') continue
      if (Math.hypot(_c.x - o.x, _c.z - o.z) < o.r + 1.6) {
        struck = true
        const push = o.r + 1.6 - Math.hypot(_c.x - o.x, _c.z - o.z)
        this.pos.addScaledVector(fwd, -push)
      }
    }
    const lim = WORLD.monsterArena
    const r = Math.hypot(this.pos.x, this.pos.z)
    if (r > lim) {
      this.pos.x *= lim / r
      this.pos.z *= lim / r
      struck = true
    }
    return struck
  }

  private placeRoot(): void {
    const P = this.def.plan
    const fwd = this.forward
    const half = P.bodyLength * 0.35
    const hf = heightAt(this.pos.x + fwd.x * half, this.pos.z + fwd.z * half)
    const hb = heightAt(this.pos.x - fwd.x * half, this.pos.z - fwd.z * half)
    const rx = -Math.cos(this.heading)
    const rz = Math.sin(this.heading)
    const side = P.bodyWidth * 0.4
    const hr = heightAt(this.pos.x + rx * side, this.pos.z + rz * side)
    const hl = heightAt(this.pos.x - rx * side, this.pos.z - rz * side)
    this.pos.y = Math.max((hf + hb) / 2, WATER_LEVEL - 1.4)
    this.rig.root.position.copy(this.pos)
    this.rig.root.position.y += this.lift
    this.rig.root.rotation.set(0, this.heading, 0)
    this.anim.slopePitch = clamp(-Math.atan2(hf - hb, half * 2), -0.3, 0.3)
    this.anim.slopeRoll = clamp(Math.atan2(hl - hr, side * 2), -0.2, 0.2)
  }

  private startAttack(id: AttackId): void {
    const rel = angleDelta(this.heading, Math.atan2(this.lastHunter.x - this.pos.x, this.lastHunter.z - this.pos.z))
    this.attack = { id, timing: timing(id, this.def.stats.telegraph, this.enraged), phase: 'windup', t: 0, hit: false, spin: rel >= 0 ? 1 : -1 }
    this.lastAttack = id
    if (id === 'signature') {
      this.sigCooldown = 24
      this.ruptureHit = false
      if (this.def.id === 'ashwing') this.liftTarget = 6.5
    }
    this.setState('attack')
    this.events.push({ type: 'telegraph', attack: id, label: abilityOf(this.def, id).name, pos: this.pos.clone() })
  }

  private lastHunter = new THREE.Vector3()

  private chooseAttack(dist: number, rel: number): AttackId | null {
    const a = Math.abs(rel)
    const tailRange = 13 * this.tailRangeMult
    const w: [AttackId, number][] = []
    if (dist < 10 && a < 0.6) w.push(['bite', 3])
    if (dist < tailRange && a > 1.0) w.push(['tail', 4])
    if (dist < tailRange * 0.85 && a > 0.4 && a <= 1.0) w.push(['tail', 1.2])
    if (dist < 13 && a < 0.7) w.push(['slam', 1.6])
    if (dist > 16 && dist < 50 && a < 0.9) w.push(['charge', 2.2])
    if (dist >= 10 && dist <= 16 && a < 0.5) w.push(['charge', 0.8])
    if (dist > 10 && dist < 36) w.push(['volley', 1.3])
    if (dist > 7 && dist < 34 && a < 0.8) w.push(['rupture', 1.7])
    if (this.enraged && this.sigCooldown <= 0 && dist < 38) return 'signature'
    if (!w.length) return null
    for (const e of w) if (e[0] === this.lastAttack) e[1] *= 0.4
    const total = w.reduce((s, e) => s + e[1], 0)
    let r = this.random() * total
    for (const [id, weight] of w) {
      r -= weight
      if (r <= 0) return id
    }
    return w[w.length - 1][0]
  }

  /**
   * Strike test. Every monster attack is authored to land low: the swept volume of each attacking
   * sphere reaches from its top all the way down to the terrain, and it is tested against the
   * hunter's whole standing body (feet to head). Only a hunter genuinely above the strike escapes.
   */
  private hitWith(ctx: MonsterContext, parts: Part[], pad: number, attack: AttackId, damage: number, knock: Knock): void {
    if (!this.attack || this.attack.hit || !ctx.hunterActive || ctx.mounted) return
    const hx = ctx.hunter.x
    const hz = ctx.hunter.z
    const feet = ctx.hunter.y
    const ground = heightAt(hx, hz)
    for (const s of this.rig.hitSpheres) {
      if (!parts.includes(s.part)) continue
      const r = s.radius * (s.part === 'tail' ? this.tailRangeMult : 1) + pad
      if (feet > s.world.y + r + 0.25 && feet > ground + 1.2) continue
      const dx = s.world.x - hx
      const dz = s.world.z - hz
      const rr = r + 0.3
      if (dx * dx + dz * dz < rr * rr) {
        const from = s.world.clone()
        from.y = Math.min(from.y, feet + 0.9)
        const res = ctx.hitHunter({ attack, damage, knock, from, label: abilityOf(this.def, attack).name })
        if (res !== 'ignored') this.attack.hit = true
        return
      }
    }
  }

  private dmg(id: AttackId): number {
    return monsterDamage(abilityOf(this.def, id).damage, this.def.stats.damage, this.enraged)
  }

  private updateAttack(dt: number, ctx: MonsterContext, dist: number, angTo: number): void {
    const a = this.attack!
    const P = this.anim.target
    const stats = this.def.stats
    a.t += dt
    const dur = a.timing[a.phase]
    if (a.t >= dur) {
      a.t -= dur
      if (a.phase === 'windup') {
        a.phase = 'active'
        this.onActive(a, ctx, dist)
      } else if (a.phase === 'active') {
        a.phase = 'recover'
        if (a.id === 'signature') this.signatureFinale(ctx)
      }
      else {
        this.attack = null
        this.setState('stalk')
        this.cooldown = (1.0 + this.random() * 1.4) / Math.max(0.3, stats.aggression * CONFIG.monster.aggression)
        return
      }
    }
    if (!this.attack) return
    const k = clamp(a.t / a.timing[a.phase], 0, 1)
    attackPose(P, a.id, a.phase, k, this.anim.time, this.def.plan.strike)
    this.anim.lambda = a.phase === 'active' ? 14 : 8
    const turn = stats.turnRate
    if (a.phase === 'windup') {
      this.speed = damp(this.speed, 0, 6, dt)
      if (a.id !== 'tail' && a.id !== 'roar') this.turnToward(angTo, turn * 1.6, dt)
    } else if (a.phase === 'active') {
      switch (a.id) {
        case 'bite':
          this.speed = 12 * Math.sin(Math.PI * k)
          this.hitWith(ctx, ['head'], 0.7, 'bite', this.dmg('bite'), 'back')
          break
        case 'tail':
          this.speed = 0
          this.heading += a.spin * ((TAU * 1.08) / a.timing.active) * dt
          this.hitWith(ctx, ['tail'], 0.5, 'tail', this.dmg('tail'), 'down')
          break
        case 'charge': {
          const top = stats.runSpeed * (this.enraged ? 1.12 : 1)
          this.speed = damp(this.speed, top, 5, dt)
          if (k < 0.35) this.turnToward(angTo, 0.9, dt)
          this.hitWith(ctx, ['head', 'neck', 'body', 'leg'], 0.5, 'charge', this.dmg('charge'), 'down')
          break
        }
        case 'signature': {
          this.speed = damp(this.speed, 0, 8, dt)
          const cyc = Math.floor(k * 3)
          if (cyc !== a.cycle) {
            a.cycle = cyc
            this.ruptureHit = false
            if (this.def.id !== 'ashwing') {
              const impact = this.pos.clone().addScaledVector(this.forward, this.def.plan.bodyLength * 0.45)
              impact.y = heightAt(impact.x, impact.z)
              this.events.push({ type: 'slam', pos: impact, radius: 7 })
            }
          }
          break
        }
        default:
          this.speed = damp(this.speed, 0, 8, dt)
      }
    } else {
      if (a.id === 'charge') this.speed = damp(this.speed, 0, 2.2, dt)
      else this.speed = damp(this.speed, 0, 8, dt)
      if (a.id === 'charge' && k > 0.4) this.turnToward(angTo, turn, dt)
    }
  }

  /** Enraged signature: species-specific hazard waves, all striking at ground level. */
  private signatureWaves(): void {
    const damage = this.dmg('signature')
    const id = this.def.id
    const H = this.lastHunter
    const push = (x: number, z: number, t: number, radius: number, idx: number, mark: boolean) => {
      const p = new THREE.Vector3(x, 0, z)
      p.y = heightAt(x, z)
      this.ruptures.push({ pos: p, t, radius, idx, damage })
      if (mark) this.events.push({ type: 'ruptureMark', pos: p, radius: radius * 1.15, delay: t })
    }
    if (id === 'mossback') {
      // Three expanding rings of roots, one per slam, each with a single escape gap.
      const c = this.pos
      const rings = [6, 11, 16, 21]
      rings.forEach((r, ri) => {
        const n = Math.round((TAU * r) / 2.5)
        const gap = this.random() * TAU
        for (let i = 0; i < n; i += 1) {
          const ang = (i / n) * TAU
          if (Math.abs(angleDelta(ang, gap)) < 0.32) continue
          push(c.x + Math.sin(ang) * r, c.z + Math.cos(ang) * r, 0.35 + ri * 0.85 + (i % 3) * 0.03, 1.9, i * 3, i % 2 === 0)
        }
      })
    } else if (id === 'tidehorn') {
      // Two spiral arms of geysers winding inward on the hunter.
      const base = this.random() * TAU
      for (const arm of [0, Math.PI]) {
        for (let i = 0; i < 16; i += 1) {
          const ang = base + arm + i * 0.4
          const r = Math.max(1.2, 21 - i * 1.3)
          push(H.x + Math.sin(ang) * r, H.z + Math.cos(ang) * r, 0.35 + i * 0.16, 2.1, i, i % 2 === 0)
        }
      }
      push(H.x, H.z, 0.35 + 16 * 0.16 + 0.25, 3.4, 0, true)
    } else {
      // Ashwing: airborne ember carpet in a spiral around the hunter.
      this.events.push({ type: 'volleyLaunch', pos: this.pos.clone().setY(this.pos.y + this.lift + this.def.plan.hipHeight + this.def.plan.bodyHeight) })
      for (let i = 0; i < 20; i += 1) {
        const ang = i * 2.4
        const d = i === 0 ? 0 : 1.4 + i * 0.85
        const p = new THREE.Vector3(H.x + Math.sin(ang) * d, 0, H.z + Math.cos(ang) * d)
        p.y = heightAt(p.x, p.z)
        const delay = 0.6 + i * 0.12
        this.volleys.push({ pos: p, t: delay, radius: 3, damage: Math.round(damage * 0.7) })
        this.events.push({ type: 'volleyMark', pos: p, radius: 3, delay })
      }
    }
  }

  /** Signature finale: a massive ground-level shockwave from the monster's body. */
  private signatureFinale(ctx: MonsterContext): void {
    const impact = this.pos.clone()
    impact.y = heightAt(impact.x, impact.z)
    const radius = this.def.id === 'ashwing' ? 17 : this.def.id === 'tidehorn' ? 19 : 12
    this.liftTarget = 0
    this.events.push({ type: 'slam', pos: impact, radius })
    this.shockwave = { origin: impact, t: 0, hit: false, max: radius, damage: Math.round(this.dmg('signature') * 0.8) }
    if (this.def.id === 'ashwing' && ctx.hunterActive && !ctx.mounted && Math.hypot(ctx.hunter.x - impact.x, ctx.hunter.z - impact.z) < 5) {
      ctx.hitHunter({ attack: 'signature', damage: this.dmg('signature'), knock: 'down', from: impact, label: abilityOf(this.def, 'signature').name })
      if (this.shockwave) this.shockwave.hit = true
    }
  }

  private onActive(a: AttackRun, ctx: MonsterContext, dist: number): void {
    const head = this.rig.head.getWorldPosition(new THREE.Vector3())
    const fwd = this.forward.clone()
    switch (a.id) {
      case 'bite':
        this.events.push({ type: 'bite', pos: head })
        break
      case 'tail':
        this.events.push({ type: 'whoosh', pos: this.pos.clone() })
        break
      case 'charge':
        this.events.push({ type: 'chargeStart', pos: this.pos.clone() })
        break
      case 'slam': {
        const impact = this.pos.clone().addScaledVector(fwd, this.def.plan.bodyLength * 0.45)
        impact.y = heightAt(impact.x, impact.z)
        const radius = abilityOf(this.def, 'slam').range
        this.events.push({ type: 'slam', pos: impact, radius })
        this.shockwave = { origin: impact, t: 0, hit: false, max: radius, damage: Math.round(this.dmg('slam') * 0.65) }
        if (ctx.hunterActive && !ctx.mounted && Math.hypot(ctx.hunter.x - impact.x, ctx.hunter.z - impact.z) < 3.6) {
          ctx.hitHunter({ attack: 'slam', damage: this.dmg('slam'), knock: 'down', from: impact, label: abilityOf(this.def, 'slam').name })
          if (this.shockwave) this.shockwave.hit = true
        }
        break
      }
      case 'volley': {
        this.events.push({ type: 'volleyLaunch', pos: this.pos.clone().setY(this.pos.y + this.def.plan.hipHeight + this.def.plan.bodyHeight) })
        const n = this.def.stats.volleyCount + (this.enraged ? 2 : 0)
        const radius = this.def.id === 'tidehorn' ? 3.8 : 3.2
        const damage = this.dmg('volley')
        for (let i = 0; i < n; i += 1) {
          const p = new THREE.Vector3()
          if (i === 0) p.copy(this.lastHunter)
          else {
            const ang = this.random() * TAU
            const d = 3 + this.random() * 10
            p.set(this.lastHunter.x + Math.cos(ang) * d, 0, this.lastHunter.z + Math.sin(ang) * d)
          }
          p.y = heightAt(p.x, p.z)
          const delay = 1.05 + i * 0.13
          this.volleys.push({ pos: p, t: delay, radius, damage })
          this.events.push({ type: 'volleyMark', pos: p, radius, delay })
        }
        break
      }
      case 'rupture': {
        // Forelegs and head drive into the earth; a line of eruptions races out along the ground
        // toward where the hunter stood (three fanned lines when enraged).
        const origin = this.pos.clone().addScaledVector(fwd, this.def.plan.bodyLength * 0.5 + this.def.plan.neckLength * 0.45)
        origin.y = heightAt(origin.x, origin.z)
        this.events.push({ type: 'ruptureStart', pos: origin.clone() })
        this.ruptureHit = false
        const aim = Math.atan2(this.lastHunter.x - origin.x, this.lastHunter.z - origin.z)
        const reach = Math.min(34, Math.max(14, Math.hypot(this.lastHunter.x - origin.x, this.lastHunter.z - origin.z) + 9))
        const step = 2.3
        const count = Math.round(reach / step)
        const fans = this.enraged ? [-0.3, 0, 0.3] : this.def.id === 'tidehorn' ? [-0.14, 0.14] : [0]
        const damage = this.dmg('rupture')
        const radius = this.def.id === 'tidehorn' ? 2.1 : 1.8
        for (const f of fans) {
          const ang = aim + f
          const dx = Math.sin(ang)
          const dz = Math.cos(ang)
          for (let i = 0; i < count; i += 1) {
            const d = 1.6 + i * step
            const wob = Math.sin(i * 1.7 + f * 9) * 0.6
            const p = new THREE.Vector3(origin.x + dx * d + dz * wob, 0, origin.z + dz * d - dx * wob)
            p.y = heightAt(p.x, p.z)
            const delay = 0.42 + i * 0.075
            this.ruptures.push({ pos: p, t: delay, radius, idx: i, damage })
            if (i % 2 === 0) this.events.push({ type: 'ruptureMark', pos: p, radius: radius * 1.15, delay })
          }
        }
        break
      }
      case 'signature':
        this.signatureWaves()
        break
      case 'roar': {
        this.events.push({ type: 'roar', pos: head, weak: this.roarWeak })
        const range = abilityOf(this.def, 'roar').range * (this.roarWeak ? 0.55 : 1)
        if (ctx.hunterActive && !ctx.mounted && dist < range) ctx.hitHunter({ attack: 'roar', damage: 0, knock: 'stun', from: head, label: abilityOf(this.def, 'roar').name })
        break
      }
    }
  }

  private updateThrash(dt: number, ridden: boolean): void {
    const th = this.thrash
    th.t += dt
    const warnDur = 0.85 * this.def.stats.telegraph
    if (th.phase === 'idle' && th.t > th.next) {
      th.phase = 'warn'
      th.t = 0
      this.events.push({ type: 'thrashWarn' })
    } else if (th.phase === 'warn' && th.t > warnDur) {
      th.phase = 'buck'
      th.t = 0
      this.events.push({ type: 'buck', forced: false })
    } else if (th.phase === 'buck' && th.t > 0.5) {
      th.phase = 'idle'
      th.t = 0
      th.next = ridden ? 3 + this.random() * 1.5 : 1.7 + this.random() * 1.4
    }
  }

  topple(duration: number, reason: 'break' | 'crash' | 'slam'): void {
    if (!this.alive) return
    this.attack = null
    this.speed = 0
    this.toppleDur = duration
    this.setState('topple')
    this.events.push({ type: 'topple', reason })
  }

  onMounted(): void {
    if (!this.alive || this.state === 'topple') return
    this.attack = null
    this.setState('shake')
    this.thrash = { phase: 'idle', t: 0, next: 1.5 + this.random() }
  }

  startRide(): void {
    if (!this.alive || this.state === 'topple') return
    this.setState('ridden')
    this.rideT = 0
    this.thrash = { phase: 'idle', t: 0, next: 2.5 + this.random() }
  }

  onDismounted(): void {
    if (this.state === 'shake' || this.state === 'ridden') {
      this.setState('stalk')
      this.cooldown = 1.4
    }
  }

  kill(): void {
    if (!this.alive) return
    this.attack = null
    this.volleys = []
    this.ruptures = []
    this.shockwave = null
    this.speed = 0
    this.setState('dying')
    this.events.push({ type: 'death', pos: this.pos.clone() })
  }

  /** Register hunter damage. Returns a broken vital slot if this hit broke one. */
  takeHit(amount: number, vital?: VitalSlot): { broke?: VitalSlot; flinched: boolean } {
    if (!this.alive) return { flinched: false }
    if (this.state === 'roam' || this.state === 'alert') {
      if (!this.introDone) {
        this.introDone = true
        this.startAttack('roar')
      } else this.setState('stalk')
    }
    if (this.state === 'flee' && this.resting) this.wake()
    this.flashK = Math.min(1, this.flashK + (vital ? 0.9 : 0.55))
    const out: { broke?: VitalSlot; flinched: boolean } = { flinched: false }
    if (vital) {
      const v = this.rig.vitals[vital]
      if (!v.broken) {
        v.hp -= amount
        if (v.hp <= 0) {
          v.broken = true
          out.broke = vital
          this.applyBreak(vital)
        }
      }
    }
    const busy = this.state === 'topple' || this.state === 'shake' || this.state === 'ridden' || (this.attack?.id === 'charge' && this.attack.phase === 'active')
    if (!busy && !out.broke) {
      this.flinchMeter += amount
      if (this.flinchMeter >= this.flinchThreshold) {
        this.flinchMeter = 0
        this.flinchThreshold *= 1.12
        this.flinch(0.9)
        out.flinched = true
      }
    }
    return out
  }

  private flinch(duration: number): void {
    this.attack = null
    this.flinchDur = duration
    this.flinchDir = this.random() > 0.5 ? 1 : -1
    this.setState('flinch')
    this.events.push({ type: 'flinch' })
  }

  private applyBreak(slot: VitalSlot): void {
    const v = this.rig.vitals[slot]
    this.events.push({ type: 'break', slot, pos: v.mesh.getWorldPosition(new THREE.Vector3()) })
    v.mesh.scale.setScalar(0.55)
    v.mat.color.set('#2a2622')
    v.mat.emissive.set('#3a1d0c')
    if (slot === 'head') {
      this.roarWeak = true
      if (this.state !== 'topple' && this.state !== 'shake' && this.state !== 'ridden') this.flinch(1.8)
    } else if (slot === 'back') {
      this.topple(5.5, 'break')
    } else {
      this.tailRangeMult = 0.7
      this.rig.tailEnd.scale.setScalar(0.6)
      if (this.state !== 'topple' && this.state !== 'shake' && this.state !== 'ridden') this.flinch(1.2)
    }
  }

  /** Mark a wounded body area (glowing scar in the skin shader). */
  markWound(sphere: HitSphere): void {
    const list = this.rig.skin.uWounds.value
    const w = list[this.woundCount % list.length]
    this.woundCount += 1
    restPositionOf(this.rig, sphere, _v)
    w.set(_v.x, _v.y, _v.z, sphere.radius * 1.25)
  }

  private wake(): void {
    this.resting = false
    this.enraged = true
    this.events.push({ type: 'wake' })
    this.startAttack('roar')
  }

  update(dt: number, ctx: MonsterContext): MonsterEvent[] {
    this.events.length = 0
    this.stateT += dt
    const stats = this.def.stats
    const P = this.anim.target
    const time = this.anim.time
    this.lastHunter.copy(ctx.hunter)
    const dx = ctx.hunter.x - this.pos.x
    const dz = ctx.hunter.z - this.pos.z
    const dist = Math.hypot(dx, dz)
    const angTo = Math.atan2(dx, dz)
    const rel = angleDelta(this.heading, angTo)
    if (this.alive && !this.enraged && ctx.hpFraction <= stats.rageAt) this.pendingRoar = true
    this.weakened = this.alive && ctx.hpFraction < 0.2
    const walk = stats.walkSpeed * (this.enraged ? 1.15 : 1) * (this.weakened ? 0.8 : 1)
    this.anim.lambda = 6

    switch (this.state) {
      case 'roam': {
        if (ctx.hunterActive && dist < 44) {
          this.setState('alert')
          this.events.push({ type: 'alert' })
          break
        }
        if (this.roamWait > 0) {
          this.roamWait -= dt
          this.grazeT += dt
          this.speed = damp(this.speed, 0, 3, dt)
          grazePose(P, (this.grazeT % 5) / 5, time)
          if (this.roamWait <= 0) this.pickWaypoint()
        } else {
          const wx = this.waypoint.x - this.pos.x
          const wz = this.waypoint.z - this.pos.z
          this.turnToward(Math.atan2(wx, wz), stats.turnRate * 0.7, dt)
          this.speed = damp(this.speed, walk * 0.8, 2, dt)
          locomotion(P, this.speed, 0, time)
          if (Math.hypot(wx, wz) < 6) {
            this.roamWait = 3 + this.random() * 4
            this.grazeT = 0
          }
        }
        break
      }
      case 'alert':
        this.speed = damp(this.speed, 0, 4, dt)
        this.turnToward(angTo, stats.turnRate, dt)
        locomotion(P, 0, 0, time)
        P.neckYaw = clamp(rel, -0.7, 0.7) * 0.6
        if (this.stateT > 0.7) {
          if (!this.introDone) {
            this.introDone = true
            this.startAttack('roar')
          } else this.setState('stalk')
        }
        break
      case 'stalk': {
        if (!ctx.hunterActive || dist > 80) {
          this.setState('roam')
          this.roamWait = 2
          break
        }
        if (!this.fled && this.alive && ctx.hpFraction <= 0.25 && this.cooldown < 1.5) {
          this.fled = true
          this.resting = false
          this.restT = 0
          this.setState('flee')
          this.events.push({ type: 'flee' })
          break
        }
        if (this.pendingRoar && this.cooldown < 1) {
          this.pendingRoar = false
          this.enraged = true
          this.sigCooldown = 4
          this.events.push({ type: 'enrage' })
          this.startAttack('roar')
          break
        }
        this.cooldown -= dt * (this.enraged ? 1.3 : 1)
        this.sigCooldown -= dt
        if (this.cooldown <= 0) {
          const id = this.chooseAttack(dist, rel)
          if (id) {
            this.startAttack(id)
            break
          }
        }
        this.turnToward(angTo, stats.turnRate, dt)
        const want = dist > 32 ? stats.runSpeed * 0.5 : dist > 11 ? walk : Math.abs(rel) > 0.8 ? walk * 0.3 : 0
        this.speed = damp(this.speed, want, 2.5, dt)
        locomotion(P, this.speed, clamp((this.speed - walk) / (stats.runSpeed * 0.5 - walk + 1e-3), 0, 1), time, this.weakened ? 1 : 0)
        P.neckYaw = clamp(rel, -0.8, 0.8) * 0.5
        P.headYaw = clamp(rel, -0.8, 0.8) * 0.35
        break
      }
      case 'attack':
        this.updateAttack(dt, ctx, dist, angTo)
        break
      case 'flinch':
        this.speed = damp(this.speed, 0, 6, dt)
        flinchPose(P, this.stateT / this.flinchDur, this.flinchDir)
        this.anim.lambda = 10
        if (this.stateT > this.flinchDur) {
          this.setState('stalk')
          this.cooldown = 0.6
        }
        break
      case 'topple':
        this.speed = damp(this.speed, 0, 5, dt)
        topplePose(P, this.stateT / this.toppleDur, time)
        this.anim.lambda = 5
        if (this.stateT > this.toppleDur) {
          this.setState('stalk')
          this.cooldown = 0.8
        }
        break
      case 'shake': {
        if (!ctx.mounted) {
          this.onDismounted()
          break
        }
        this.updateThrash(dt, false)
        this.heading += Math.sin(time * 0.9) * dt * 0.9
        this.speed = damp(this.speed, this.thrash.phase === 'idle' ? walk * 0.7 : 0, 3, dt)
        const th = this.thrash
        thrashPose(P, th.phase, th.phase === 'warn' ? th.t / (0.85 * stats.telegraph) : th.phase === 'buck' ? th.t / 0.5 : 0, time)
        this.anim.lambda = th.phase === 'buck' ? 12 : 7
        break
      }
      case 'ridden': {
        if (!ctx.mounted) {
          this.onDismounted()
          break
        }
        this.rideT += dt
        this.updateThrash(dt, true)
        if (ctx.rideDir && (ctx.rideDir.x || ctx.rideDir.z)) this.turnToward(Math.atan2(ctx.rideDir.x, ctx.rideDir.z), stats.turnRate * 1.3, dt)
        this.speed = damp(this.speed, stats.runSpeed * 0.72, 1.8, dt)
        const th = this.thrash
        if (th.phase === 'idle') locomotion(P, this.speed, 1, time)
        else thrashPose(P, th.phase, th.phase === 'warn' ? th.t / (0.85 * stats.telegraph) : th.t / 0.5, time)
        if (this.rideT > CONFIG.grapple.rideTime) {
          this.events.push({ type: 'buck', forced: true })
          this.setState('stalk')
          this.cooldown = 1.5
        }
        break
      }
      case 'flee': {
        const lx = LAIR.x - this.pos.x
        const lz = LAIR.z - this.pos.z
        const ld = Math.hypot(lx, lz)
        if (!this.resting && (ld < 6 || this.stateT > 25)) {
          this.resting = true
          this.restT = 0
          this.events.push({ type: 'rest' })
        }
        if (this.resting) {
          this.restT += dt
          this.speed = damp(this.speed, 0, 3, dt)
          grazePose(P, (this.restT % 4) / 4, time)
          // Disturbed by a close hunter, or rested long enough: return enraged.
          if ((ctx.hunterActive && dist < 11) || this.restT > 16) this.wake()
        } else {
          this.turnToward(Math.atan2(lx, lz), stats.turnRate * 0.8, dt)
          this.speed = damp(this.speed, walk * 1.25, 2, dt)
          locomotion(P, this.speed, 0.2, time, 1)
          P.neckYaw = Math.sin(time * 0.7) * 0.15
        }
        break
      }
      case 'dying':
        this.speed = damp(this.speed, 0, 4, dt)
        deathPose(P, this.stateT / 2.4)
        this.anim.lambda = 4
        if (this.stateT > 3.2) this.setState('dead')
        break
      case 'dead':
        deathPose(P, 1)
        break
    }

    const struck = this.moveAndCollide(dt)
    if (struck && this.state === 'attack' && this.attack?.id === 'charge' && this.attack.phase === 'active' && this.speed > 7) {
      this.events.push({ type: 'crash', pos: this.pos.clone().addScaledVector(this.forward, this.def.plan.bodyLength * 0.6) })
      this.topple(3.4, 'crash')
    }
    if (struck && this.state === 'ridden' && this.speed > 5) {
      this.events.push({ type: 'wallSlam', pos: this.pos.clone().addScaledVector(this.forward, this.def.plan.bodyLength * 0.6) })
      this.topple(6, 'slam')
    }

    this.updateHazards(dt, ctx)
    this.flashK = Math.max(0, this.flashK - dt * 7)
    this.enrageK = damp(this.enrageK, this.enraged && this.alive ? 1 : 0, 1.5, dt)
    if (!this.attack || this.attack.id !== 'signature' || !this.alive) this.liftTarget = 0
    this.lift = damp(this.lift, this.liftTarget, this.liftTarget > this.lift ? 1.6 : 5, dt)
    this.rig.skin.uFlash.value = this.flashK * 0.28
    this.rig.skin.uEnrage.value = this.enrageK
    this.placeRoot()
    this.anim.update(dt, { ground: heightAt, hover: this.lift / 5 })
    tickMeshRig(this.rig, time)
    this.updateGlow(time)
    return this.events
  }

  private updateHazards(dt: number, ctx: MonsterContext): void {
    _c.copy(ctx.hunter)
    for (let i = this.volleys.length - 1; i >= 0; i -= 1) {
      const v = this.volleys[i]
      v.t -= dt
      if (v.t > 0) continue
      this.volleys.splice(i, 1)
      this.events.push({ type: 'volleyImpact', pos: v.pos, radius: v.radius })
      if (ctx.hunterActive && !ctx.mounted && Math.hypot(_c.x - v.pos.x, _c.z - v.pos.z) < v.radius && _c.y < v.pos.y + 3)
        ctx.hitHunter({ attack: 'volley', damage: v.damage, knock: 'back', from: v.pos, label: abilityOf(this.def, 'volley').name })
    }
    for (let i = this.ruptures.length - 1; i >= 0; i -= 1) {
      const r = this.ruptures[i]
      r.t -= dt
      if (r.t > 0) continue
      this.ruptures.splice(i, 1)
      this.events.push({ type: 'rupture', pos: r.pos, radius: r.radius, idx: r.idx })
      if (!this.ruptureHit && ctx.hunterActive && !ctx.mounted && Math.hypot(_c.x - r.pos.x, _c.z - r.pos.z) < r.radius + 0.35 && _c.y < r.pos.y + 4.5) {
        const res = ctx.hitHunter({ attack: 'rupture', damage: r.damage, knock: 'down', from: r.pos.clone().setY(r.pos.y - 1), label: abilityOf(this.def, 'rupture').name })
        if (res !== 'ignored') this.ruptureHit = true
      }
    }
    const sw = this.shockwave
    if (sw) {
      sw.t += dt
      const r = (sw.t / 0.5) * sw.max
      if (!sw.hit && ctx.hunterActive && !ctx.mounted && ctx.hunterGrounded) {
        const d = Math.hypot(_c.x - sw.origin.x, _c.z - sw.origin.z)
        if (Math.abs(d - r) < 1.3) {
          const res = ctx.hitHunter({ attack: 'shockwave', damage: sw.damage, knock: 'back', from: sw.origin, label: 'Shockwave' })
          if (res !== 'ignored') sw.hit = true
        }
      }
      if (sw.t > 0.5) this.shockwave = null
    }
  }

  private updateGlow(time: number): void {
    const eye = this.rig.eyeMat
    const rage = this.enraged ? 1 : 0
    eye.color.copy(this.eyeBase).lerp(this.eyeRage, rage)
    eye.emissive.copy(eye.color)
    if (this.enraged && this.anim.target.plateGlow < 0.35) this.anim.target.plateGlow = 0.35 + Math.sin(time * 2.4) * 0.15
    for (const slot of ['head', 'back', 'tail'] as VitalSlot[]) {
      const v = this.rig.vitals[slot]
      if (v.broken) {
        v.mat.emissiveIntensity = 0.15
        continue
      }
      const hot = this.highlightVital === slot ? 1.6 : 0
      const exposed = this.exposed ? 1.2 : 0
      v.mat.emissiveIntensity = 0.6 + Math.sin(time * 3.2) * 0.25 + (hot + exposed) * 0.55
      v.mesh.scale.setScalar(1 + (hot ? Math.sin(time * 8) * 0.08 : 0))
    }
    const agitation = Math.min(1, Math.abs(this.speed) / 10 + (this.state === 'shake' ? 0.8 : 0) + (this.attack ? 0.3 : 0))
    animateFeatures(this.rig.features, time, agitation, this.anim.target.plateGlow + this.enrageK)
  }

  /** Ambient creature particles: accumulate each emitter's rate, returning world points to spawn at. */
  tickEmitters(dt: number, spawn: (kind: import('./features').EmitKind, p: THREE.Vector3, vel: THREE.Vector3) => void): void {
    if (!this.alive) return
    const agit = Math.min(1.5, 0.5 + Math.abs(this.speed) / 8 + (this.state === 'shake' ? 1 : 0))
    _vel.copy(this.forward).multiplyScalar(this.speed)
    for (const e of this.rig.features.emitters) {
      e.acc += dt * e.rate * agit
      while (e.acc >= 1) {
        e.acc -= 1
        _emit.copy(e.offset)
        e.bone.localToWorld(_emit)
        spawn(e.kind, _emit, _vel)
      }
    }
  }
}
const _vel = new THREE.Vector3()
const _emit = new THREE.Vector3()
