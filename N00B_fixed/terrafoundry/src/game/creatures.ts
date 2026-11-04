import * as THREE from 'three'
import type { Sfx } from '../engine/audio'
import { CONFIG, SEA_LEVEL } from './config'
import type { ItemId } from './items'
import { createModel, modelReady, type ModelId, type ModelInstance } from './models'
import type { Body, TargetSphere, WorldPhysics } from './physics'
import type { Terrain } from './terrain'

export type Kind = 'deer' | 'stag' | 'fox' | 'wolf' | 'hollow' | 'howler'
type State = 'idle' | 'wander' | 'flee' | 'chase' | 'windup' | 'recover' | 'dying'

export const CREATURE_NAMES: Record<Kind, string> = { deer: 'Red Deer', stag: 'Great Stag', fox: 'Fox', wolf: 'Grey Wolf', hollow: 'Hollow', howler: 'Elder Howler' }
const MODEL_OF: Record<Kind, ModelId> = { deer: 'deer', stag: 'stag', fox: 'fox', wolf: 'wolf', hollow: 'ghoul', howler: 'werewolf' }

type Stat = {
  hp: number
  radius: number
  height: number
  walk: number
  run: number
  aim: number
  /** 'passive' flees, 'defensive' charges when hit, 'hostile' hunts the player. */
  temper: 'passive' | 'defensive' | 'hostile'
  damage: number
  reach: number
  windup: number
  cooldown: number
  knock: number
  night: boolean
}
export const STATS: Record<Kind, Stat> = {
  deer: { hp: 10, radius: 0.45, height: 1.5, walk: 1.3, run: 7.6, aim: 0.95, temper: 'passive', damage: 0, reach: 0, windup: 0, cooldown: 0, knock: 1, night: false },
  fox: { hp: 6, radius: 0.3, height: 0.62, walk: 1.5, run: 8.2, aim: 0.42, temper: 'passive', damage: 0, reach: 0, windup: 0, cooldown: 0, knock: 1.3, night: false },
  stag: { hp: 24, radius: 0.55, height: 1.95, walk: 1.2, run: 7, aim: 1.2, temper: 'defensive', damage: 12, reach: 1.9, windup: 0.42, cooldown: 1.6, knock: 0.6, night: false },
  wolf: { hp: 16, radius: 0.4, height: 0.95, walk: 1.7, run: 6.5, aim: 0.62, temper: 'hostile', damage: 8, reach: 1.6, windup: 0.34, cooldown: 1.25, knock: 1, night: true },
  hollow: { hp: 28, radius: 0.4, height: 1.85, walk: 1.1, run: 3.9, aim: 1.35, temper: 'hostile', damage: 12, reach: 1.7, windup: 0.55, cooldown: 1.5, knock: 0.7, night: true },
  howler: { hp: 240, radius: 0.95, height: 3.3, walk: 1.6, run: 5.4, aim: 2.2, temper: 'hostile', damage: 22, reach: 2.9, windup: 0.7, cooldown: 1.8, knock: 0.15, night: true },
}

export function creatureMaxHp(kind: Kind): number {
  return STATS[kind].hp
}

export class Creature {
  readonly body: Body
  readonly mesh: THREE.Group
  readonly stat: Stat
  yaw = Math.random() * Math.PI * 2
  hp: number
  state: State = 'idle'
  timer = 1 + Math.random() * 3
  heading = Math.random() * Math.PI * 2
  aggro = 0
  attackCd = 0
  flash = 0
  phase = Math.random() * 10
  stuck = 0
  fade = 1
  /** Part of the current night wave (counts toward the wave tracker). */
  wave = false
  /** Pack leader (wolves follow it while wandering). */
  leader: Creature | null = null
  special = 4 + Math.random() * 3
  leap = 0
  pitch = 0
  prev = new THREE.Vector3()
  constructor(readonly id: number, readonly kind: Kind, pos: THREE.Vector3, readonly model: ModelInstance) {
    this.stat = STATS[kind]
    this.hp = this.stat.hp
    this.body = { pos: pos.clone(), vel: new THREE.Vector3(), radius: this.stat.radius, height: this.stat.height, grounded: false }
    this.mesh = model.object
    this.mesh.position.copy(pos)
    if (kind === 'wolf') model.grade(0x4a4640, 0.35)
  }
  get maxHp(): number {
    return this.stat.hp
  }
  get alive(): boolean {
    return this.state !== 'dying'
  }
}

export type CreatureCtx = {
  player: THREE.Vector3
  playerMoving: boolean
  playerSprinting: boolean
  night: number
  hostileScale: number
  wards: { x: number; z: number; r: number }[]
  physics: WorldPhysics
  terrain: Terrain
  /** Allow ambient night spawns (waves spawn explicitly). */
  ambientHostiles: boolean
  onAttack: (c: Creature, damage: number) => void
  onSound: (c: Creature, sound: Sfx) => void
  onDeath: (c: Creature, cause: 'killed' | 'dawn' | 'ward') => void
  onRoar: (c: Creature) => void
  onTelegraph: (c: Creature) => void
}

/** Spawns, animates and runs AI for wildlife and night creatures around the player. */
export class Creatures {
  readonly group = new THREE.Group()
  readonly list: Creature[] = []
  private nextId = 1
  private spawnTimer = 1
  private buf: TargetSphere[] = []

  clear(): void {
    for (const c of this.list) {
      this.group.remove(c.mesh)
      c.model.dispose()
    }
    this.list.length = 0
  }

  get hostiles(): number {
    let n = 0
    for (const c of this.list) if (c.alive && c.stat.temper === 'hostile') n++
    return n
  }

  targets(): TargetSphere[] {
    this.buf.length = 0
    for (const c of this.list) {
      if (!c.alive) continue
      const s = c.stat
      const p = c.body.pos
      this.buf.push({ x: p.x, y: p.y + s.aim, z: p.z, r: Math.max(s.radius * 1.4, s.height * 0.42), ref: c })
    }
    return this.buf
  }

  spawn(kind: Kind, pos: THREE.Vector3, wave = false): Creature | null {
    const model = createModel(MODEL_OF[kind])
    if (!model) return null
    const c = new Creature(this.nextId++, kind, pos, model)
    c.wave = wave
    if (kind === 'wolf' || kind === 'hollow' || kind === 'howler') {
      c.state = 'chase'
      c.fade = 0
      model.setOpacity(0)
    }
    this.list.push(c)
    this.group.add(c.mesh)
    return c
  }

  /** Finds a valid spawn point on a ring around `center`. */
  findSpot(ctx: CreatureCtx, center: THREE.Vector3, rMin: number, rMax: number, avoidWards: boolean): THREE.Vector3 | null {
    for (let attempt = 0; attempt < 10; attempt++) {
      const a = Math.random() * Math.PI * 2
      const r = rMin + Math.random() * (rMax - rMin)
      const x = center.x + Math.cos(a) * r
      const z = center.z + Math.sin(a) * r
      const h = ctx.terrain.height(x, z)
      if (h < SEA_LEVEL + 1.2 || h > 46) continue
      if (ctx.terrain.normal(x, z).y < 0.8) continue
      if (avoidWards && ctx.wards.some((w) => Math.hypot(w.x - x, w.z - z) < w.r + 5)) continue
      return new THREE.Vector3(x, h + 0.1, z)
    }
    return null
  }

  private trySpawnWildlife(ctx: CreatureCtx): void {
    const wild = this.list.filter((c) => c.stat.temper !== 'hostile').length
    if (wild >= CONFIG.creatures.maxWildlife) return
    const roll = Math.random()
    const kind: Kind = roll < 0.5 ? 'deer' : roll < 0.78 ? 'fox' : 'stag'
    if (!modelReady(MODEL_OF[kind])) return
    const at = this.findSpot(ctx, ctx.player, 36, 75, false)
    if (!at) return
    const c = this.spawn(kind, at)
    // Deer come in small herds.
    if (c && kind === 'deer' && Math.random() < 0.6) {
      for (let i = 0; i < 1 + Math.floor(Math.random() * 2); i++) {
        const p = at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6))
        p.y = ctx.terrain.height(p.x, p.z) + 0.1
        this.spawn('deer', p)
      }
    }
  }

  /** Damage a creature; returns its drops if it died. */
  hit(c: Creature, damage: number, from: THREE.Vector3, knock = 1): [ItemId, number][] | null {
    if (!c.alive) return null
    c.hp -= damage
    c.flash = 0.16
    const away = c.body.pos.clone().sub(from).setY(0).normalize()
    const k = c.stat.knock * knock
    c.body.vel.addScaledVector(away, 5.5 * k)
    c.body.vel.y = Math.max(c.body.vel.y, 2.8 * k)
    if (k > 0.3) c.body.grounded = false
    if (c.hp > 0 && c.model.has('hit') && c.state !== 'windup') c.model.once('hit', 1.3)
    if (c.stat.temper === 'passive') {
      c.state = 'flee'
      c.timer = 6
    } else if (c.state !== 'windup') {
      c.state = 'chase'
      c.aggro = 14
      c.timer = 14
    }
    if (c.hp <= 0) {
      this.kill(c)
      return dropsFor(c.kind)
    }
    return null
  }

  private kill(c: Creature): void {
    c.state = 'dying'
    c.timer = c.model.has('death') ? Math.max(1.4, c.model.once('death', 1.1) + 0.6) : 1.6
    c.body.vel.x *= 0.4
    c.body.vel.z *= 0.4
  }

  update(dt: number, ctx: CreatureCtx): void {
    this.spawnTimer -= dt
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 2.5
      this.trySpawnWildlife(ctx)
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const c = this.list[i]
      const p = c.body.pos
      const dx = ctx.player.x - p.x
      const dz = ctx.player.z - p.z
      const dist = Math.hypot(dx, dz)
      c.model.setDistance(dist)
      const hostileGone = c.stat.night && ctx.hostileScale === 0
      if (dist > 130 || hostileGone) {
        this.remove(i)
        continue
      }
      c.prev.copy(p)
      if (c.state === 'dying') {
        c.timer -= dt
        if (!c.model.has('death')) {
          c.mesh.rotation.z = Math.min(Math.PI / 2, (1.6 - c.timer) * 3)
        }
        if (c.timer < 0.9) {
          c.fade = Math.max(0, c.timer / 0.9)
          c.model.setOpacity(c.fade)
        }
        this.move(c, dt, ctx)
        c.model.update(dt)
        if (c.timer <= 0) {
          ctx.onDeath(c, 'killed')
          this.remove(i)
        }
        continue
      }
      // Fade in from the dark.
      if (c.fade < 1) {
        c.fade = Math.min(1, c.fade + dt * 1.4)
        c.model.setOpacity(c.fade)
      }
      // Night creatures burn away at dawn.
      if (c.stat.night && ctx.night < 0.22) {
        ctx.onDeath(c, 'dawn')
        ctx.onSound(c, 'die')
        this.kill(c)
        c.timer = 1.2
        continue
      }
      this.think(c, dt, dist, dx, dz, ctx)
      this.move(c, dt, ctx)
      this.animate(c, dt, ctx)
    }
  }

  private remove(i: number): void {
    const c = this.list[i]
    this.group.remove(c.mesh)
    c.model.dispose()
    this.list.splice(i, 1)
  }

  private think(c: Creature, dt: number, dist: number, dx: number, dz: number, ctx: CreatureCtx): void {
    const s = c.stat
    c.timer -= dt
    c.attackCd -= dt
    c.special -= dt
    const toPlayer = Math.atan2(dx, dz)
    let speed = 0
    let heading = c.heading
    if (s.temper === 'passive') {
      const scare = dist < 6 || (dist < 14 && ctx.playerSprinting) || (dist < 9 && ctx.playerMoving)
      if (scare && c.state !== 'flee') {
        c.state = 'flee'
        c.timer = 4 + Math.random() * 2
      }
    } else if (s.temper === 'hostile') {
      if (c.state === 'idle' || c.state === 'wander') {
        if (dist < CONFIG.creatures.hostileSight * (c.kind === 'wolf' ? 1.3 : 1)) c.state = 'chase'
      }
    } else if (c.state === 'chase') {
      c.aggro -= dt
      if (c.aggro <= 0 || dist > 32) c.state = 'wander'
    }
    switch (c.state) {
      case 'idle':
        if (c.timer <= 0) {
          c.state = 'wander'
          c.timer = 3 + Math.random() * 5
          c.heading = Math.random() * Math.PI * 2
        }
        break
      case 'wander':
        speed = s.walk
        heading = c.heading
        if (c.timer <= 0) {
          c.state = 'idle'
          c.timer = 2 + Math.random() * 4
        }
        break
      case 'flee':
        speed = s.run
        heading = toPlayer + Math.PI + Math.sin(c.phase * 0.7) * 0.4
        if (c.timer <= 0) {
          c.state = 'wander'
          c.timer = 3
        }
        break
      case 'chase': {
        heading = toPlayer
        speed = s.run
        // Wolves circle and flank before committing.
        if (c.kind === 'wolf' && dist > s.reach * 1.4 && dist < 9) heading = toPlayer + Math.sin(c.phase * 0.35 + c.id) * 0.8
        if (c.kind === 'hollow') speed = s.run * (dist < 6 ? 1.15 : 1)
        // Boss specials: roar (stagger/shake) or a leaping charge.
        if (c.kind === 'howler' && c.special <= 0 && dist < 26) {
          c.special = 7 + Math.random() * 4
          if (Math.random() < 0.5 || dist < 6) {
            ctx.onRoar(c)
            ctx.onSound(c, 'roar')
            c.state = 'recover'
            c.timer = 1.4
            c.model.once('attack', 0.8)
          } else {
            c.leap = 0.6
            c.body.vel.y = 7.5
            c.body.grounded = false
            ctx.onTelegraph(c)
          }
        }
        if (c.leap > 0) {
          c.leap -= dt
          speed = 14
        }
        if (dist < s.reach && c.attackCd <= 0) {
          c.state = 'windup'
          c.timer = s.windup
          c.attackCd = s.cooldown
          c.model.once('attack', c.kind === 'hollow' ? 1.6 : c.kind === 'howler' ? 1.3 : 1.25)
          ctx.onTelegraph(c)
          ctx.onSound(c, c.kind === 'wolf' ? 'wolfAttack' : c.kind === 'hollow' ? 'ghoul' : c.kind === 'howler' ? 'growl' : 'grunt')
        }
        if (dist < s.reach * 0.8) speed = 0
        if (Math.random() < dt * 0.12) ctx.onSound(c, c.kind === 'wolf' ? 'growl' : c.kind === 'hollow' ? 'ghoul' : c.kind === 'howler' ? 'growl' : 'grunt')
        break
      }
      case 'windup':
        heading = toPlayer
        speed = c.kind === 'howler' ? 1.5 : 0.6
        if (c.timer <= 0) {
          if (dist < s.reach * 1.35) ctx.onAttack(c, s.damage)
          c.state = 'recover'
          c.timer = 0.35
        }
        break
      case 'recover':
        heading = toPlayer
        speed = 0.3
        if (c.timer <= 0) c.state = 'chase'
        break
    }
    // Campfire wards repel wolves and the Hollow (the Elder Howler ignores them).
    if (c.stat.night && c.kind !== 'howler') {
      for (const w of ctx.wards) {
        const wx = c.body.pos.x - w.x
        const wz = c.body.pos.z - w.z
        const d = Math.hypot(wx, wz)
        if (d < w.r + 1.5) {
          heading = Math.atan2(wx, wz) + 0.9
          speed = Math.max(speed, 2.2)
          if (c.state === 'windup') c.state = 'recover'
          if (d < w.r * 0.6 && c.kind === 'hollow') {
            ctx.onDeath(c, 'ward')
            ctx.onSound(c, 'die')
            this.kill(c)
            c.timer = 1.1
            return
          }
        }
      }
    }
    // Wander near the pack leader.
    if (c.leader && c.leader.alive && (c.state === 'wander' || c.state === 'idle')) {
      const lx = c.leader.body.pos.x - c.body.pos.x
      const lz = c.leader.body.pos.z - c.body.pos.z
      if (Math.hypot(lx, lz) > 5) {
        heading = Math.atan2(lx, lz)
        speed = s.walk * 1.4
      }
    }
    // Avoid water unless chasing.
    const ahead = ctx.terrain.height(c.body.pos.x + Math.sin(heading) * 2, c.body.pos.z + Math.cos(heading) * 2)
    if (ahead < SEA_LEVEL + 0.6 && c.state !== 'chase') {
      c.heading += Math.PI * 0.7
      heading = c.heading
    }
    const vx = Math.sin(heading) * speed
    const vz = Math.cos(heading) * speed
    const k = Math.min(1, dt * (c.body.grounded ? 8 : 1.5))
    c.body.vel.x += (vx - c.body.vel.x) * k
    c.body.vel.z += (vz - c.body.vel.z) * k
    if (speed > 0.2 || c.state === 'windup') {
      let d = heading - c.yaw
      d = Math.atan2(Math.sin(d), Math.cos(d))
      c.yaw += d * Math.min(1, dt * (c.state === 'windup' ? 10 : 6))
    }
  }

  private move(c: Creature, dt: number, ctx: CreatureCtx): void {
    const b = c.body
    b.vel.y = Math.max(b.vel.y + CONFIG.player.gravity * dt, -40)
    const wantX = b.vel.x
    const wantZ = b.vel.z
    ctx.physics.moveBody(b, dt, 0.65)
    const moved = Math.hypot(b.pos.x - c.prev.x, b.pos.z - c.prev.z)
    const intended = Math.hypot(wantX, wantZ) * dt
    if (c.alive && intended > 0.02 && moved < intended * 0.3) {
      c.stuck += dt
      if (c.stuck > 0.25 && b.grounded) {
        b.vel.y = 6.5
        b.grounded = false
        c.stuck = 0
        c.heading += (Math.random() - 0.5) * 2
      }
    } else c.stuck = 0
    if (b.pos.y < SEA_LEVEL - 1.2) b.vel.y = Math.max(b.vel.y, 2)
    c.mesh.position.copy(b.pos)
    c.mesh.rotation.y = c.yaw
    // Quadrupeds pitch with the slope.
    if (c.kind !== 'hollow' && c.kind !== 'howler' && c.alive) {
      const f = c.stat.radius * 1.6
      const hf = ctx.terrain.height(b.pos.x + Math.sin(c.yaw) * f, b.pos.z + Math.cos(c.yaw) * f)
      const hb = ctx.terrain.height(b.pos.x - Math.sin(c.yaw) * f, b.pos.z - Math.cos(c.yaw) * f)
      const want = b.grounded ? -Math.atan2(hf - hb, f * 2) : 0
      c.pitch += (want - c.pitch) * Math.min(1, dt * 6)
      c.mesh.rotation.x = c.pitch
    }
  }

  private animate(c: Creature, dt: number, _ctx: CreatureCtx): void {
    const speed = Math.hypot(c.body.vel.x, c.body.vel.z)
    c.phase += dt * (1 + speed)
    const def = c.model.def
    if (c.state === 'idle' && c.stat.temper === 'passive' && c.model.has('eat') && (c.id % 3 === 0)) c.model.loop('eat')
    else if (speed < 0.35) c.model.loop('idle')
    else if (speed < c.stat.walk * 1.8 || !c.model.has('run')) c.model.loop('walk', Math.max(0.5, speed * def.walkRate))
    else c.model.loop('run', Math.max(0.6, speed * def.runRate))
    c.model.update(dt)
    if (c.flash > 0) {
      c.flash -= dt
      c.model.setFlash(Math.max(0, c.flash / 0.16) * 0.9)
    } else if (c.state === 'windup') {
      // Telegraph: pulsing ember glow before the strike lands.
      c.model.setFlash(0.25 + 0.2 * Math.sin(c.timer * 40), 0xff8a3c)
    } else c.model.setFlash(0)
  }
}

function dropsFor(kind: Kind): [ItemId, number][] {
  switch (kind) {
    case 'deer': return [['raw_meat', 2], ['fiber', 1]]
    case 'fox': return [['raw_meat', 1]]
    case 'stag': return [['raw_meat', 3], ['fiber', 2]]
    case 'wolf': return Math.random() < 0.5 ? [['raw_meat', 1], ['fiber', 1]] : [['raw_meat', 1]]
    case 'hollow': return Math.random() < 0.55 ? [['crystal', 1], ['fiber', 2]] : [['fiber', 3]]
    case 'howler': return [['crystal', 6], ['raw_meat', 4], ['stone', 6]]
  }
}
