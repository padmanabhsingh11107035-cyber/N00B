import * as THREE from 'three'
import type { HazardType } from './content'
import type { HazardSpawn } from './dungeon'
import type { Enemy } from './enemies'
import type { Fx } from './fx'
import { HERO_RADIUS, type Hero } from './hero'
import { tileCenter } from './level'
import { glow } from './toon'

/**
 * Room hazards, driven by the generator's authored anchors. Every hazard telegraphs before it
 * hurts, and it hurts enemies too, so luring packs into traps is a valid tactic.
 *
 * chalk  – Chalk Storm: electric chalk dust rune that detonates on a cycle
 * spark  – Tesla Coil: lab coil that discharges in a wide ring
 * tomes  – Falling Tomes: haunted books slam down from above
 * vent   – Grav Vent: launches anyone standing on it (and hurts a little)
 * acid   – Acid Spill: persistent puddle that slows and burns
 * laser  – Trophy Laser: security beam across the room on a timer
 */

const COLORS: Record<HazardType, string> = { chalk: '#fff4c2', spark: '#7ef9ff', tomes: '#c58cff', vent: '#7ef9ff', acid: '#6dff9e', laser: '#ff4f6d' }
export const HAZARD_NAMES: Record<HazardType, string> = { chalk: 'Chalk Storm', spark: 'Tesla Coil', tomes: 'Falling Tomes', vent: 'Grav Vent', acid: 'Acid Spill', laser: 'Trophy Laser' }

export type HazardHit = (amount: number, from: THREE.Vector3, knock: number) => void

export class Hazard {
  readonly group = new THREE.Group()
  readonly type: HazardType
  private readonly x: number
  private readonly z: number
  private readonly radius: number
  private readonly period: number
  private clock: number
  private fill: THREE.Mesh
  private edge: THREE.Mesh
  private extra?: THREE.Object3D
  private beam?: THREE.Mesh
  private ticks = 0
  private from = 0
  private to = 0
  private axis: 'x' | 'y' = 'x'
  private fired = false

  constructor(spec: HazardSpawn) {
    this.type = spec.type
    this.x = tileCenter(spec.tx)
    this.z = tileCenter(spec.ty)
    this.radius = spec.type === 'acid' ? 1.9 : spec.type === 'spark' ? 2.8 : spec.type === 'tomes' ? 2.0 : 2.3
    this.period = spec.type === 'laser' ? 4.2 : spec.type === 'vent' ? 3.4 : 3.6
    this.clock = spec.phase * this.period
    const color = COLORS[spec.type]
    this.group.position.set(this.x, 0.05, this.z)
    this.edge = new THREE.Mesh(new THREE.RingGeometry(this.radius - 0.12, this.radius, 40).rotateX(-Math.PI / 2), glow(color, 0.55))
    this.fill = new THREE.Mesh(new THREE.CircleGeometry(this.radius, 40).rotateX(-Math.PI / 2), glow(color, spec.type === 'acid' ? 0.45 : 0.28))
    this.group.add(this.edge, this.fill)
    if (spec.type === 'spark') {
      const coil = new THREE.Group()
      coil.add(new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 1.6, 10), new THREE.MeshStandardMaterial({ color: '#3d6e73' })))
      coil.children[0].position.y = 0.8
      for (let i = 0; i < 3; i += 1) {
        const t = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.06, 6, 16), glow(color))
        t.rotation.x = Math.PI / 2
        t.position.y = 0.6 + i * 0.4
        coil.add(t)
      }
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), glow('#ffffff'))
      orb.position.y = 1.8
      coil.add(orb)
      this.extra = coil
      this.group.add(coil)
    } else if (spec.type === 'tomes') {
      const books = new THREE.Group()
      const colors = ['#7a3b8f', '#2f5d9f', '#b33a3a', '#c98f3a']
      for (let i = 0; i < 4; i += 1) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.5), new THREE.MeshStandardMaterial({ color: colors[i] }))
        const a = (i / 4) * Math.PI * 2
        b.position.set(Math.cos(a) * 0.9, 4.2, Math.sin(a) * 0.9)
        books.add(b)
      }
      this.extra = books
      this.group.add(books)
    } else if (spec.type === 'vent') {
      const grate = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.1, 20), new THREE.MeshStandardMaterial({ color: '#2c2230' }))
      grate.position.y = 0.04
      this.group.add(grate)
      for (let i = 0; i < 4; i += 1) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(2, 0.06, 0.1), glow(color, 0.8))
        bar.rotation.y = (i / 4) * Math.PI
        bar.position.y = 0.1
        this.group.add(bar)
      }
    } else if (spec.type === 'laser') {
      this.axis = spec.axis
      this.from = spec.from
      this.to = spec.to
      this.group.remove(this.edge, this.fill)
      const len = (spec.to - spec.from + 1) * 2
      const mid = ((spec.from + spec.to + 1) / 2) * 2
      this.group.position.set(spec.axis === 'x' ? mid : this.x, 0, spec.axis === 'y' ? mid : this.z)
      const geo = new THREE.BoxGeometry(spec.axis === 'x' ? len : 0.35, 0.35, spec.axis === 'y' ? len : 0.35)
      this.beam = new THREE.Mesh(geo, glow(color, 0.9))
      this.beam.position.y = 0.9
      this.group.add(this.beam)
      for (const s of [-1, 1]) {
        const emitter = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.6, 0.5), new THREE.MeshStandardMaterial({ color: '#ffcf4d' }))
        emitter.position.set(spec.axis === 'x' ? (s * len) / 2 : 0, 0.8, spec.axis === 'y' ? (s * len) / 2 : 0)
        this.group.add(emitter)
      }
    }
  }

  /** Normalised cycle: 0..0.62 idle, 0.62..0.92 telegraph, 0.92..1 active. */
  update(dt: number, active: boolean, hero: Hero, enemies: Enemy[], fx: Fx, hurtHero: HazardHit, t: number): void {
    this.group.visible = true
    if (!active) {
      this.fill.visible = this.type === 'acid'
      ;(this.edge.material as THREE.MeshBasicMaterial).opacity = 0.25
      if (this.beam) this.beam.visible = false
      return
    }
    this.clock = (this.clock + dt) % this.period
    const k = this.clock / this.period
    const heroIn = (r: number) => Math.hypot(hero.pos.x - this.x, hero.pos.z - this.z) < r + HERO_RADIUS * 0.5
    const center = new THREE.Vector3(this.x, 0.3, this.z)

    if (this.type === 'acid') {
      this.fill.visible = true
      this.fill.scale.setScalar(1 + Math.sin(t * 3) * 0.04)
      this.ticks -= dt
      if (heroIn(this.radius) && hero.y < 0.3) {
        hero.slow = Math.min(hero.slow, 0.6)
        if (this.ticks <= 0) {
          this.ticks = 0.5
          hurtHero(5, center, 0)
          fx.burst(new THREE.Vector3(hero.pos.x, 0.3, hero.pos.z), '#6dff9e', 4, 2, 0.1, 0.4, 2)
        }
      }
      if (Math.random() < dt * 4) fx.burst(new THREE.Vector3(this.x + (Math.random() - 0.5) * this.radius * 1.4, 0.1, this.z + (Math.random() - 0.5) * this.radius * 1.4), '#6dff9e', 1, 1.2, 0.12, 0.6, -1)
      return
    }

    if (this.type === 'laser' && this.beam) {
      const warn = k > 0.55 && k < 0.8
      const live = k >= 0.8
      this.beam.visible = warn || live
      this.beam.scale.set(this.axis === 'x' ? 1 : live ? 1.8 : 0.35, live ? 1.8 : 0.35, this.axis === 'y' ? 1 : live ? 1.8 : 0.35)
      ;(this.beam.material as THREE.MeshBasicMaterial).opacity = warn ? 0.35 + Math.sin(t * 40) * 0.25 : 0.95
      if (!live) this.fired = false
      if (live) {
        const onBeam = (px: number, pz: number, r: number) => {
          const along = this.axis === 'x' ? px : pz
          const across = this.axis === 'x' ? pz - this.group.position.z : px - this.group.position.x
          return Math.abs(across) < 0.45 + r && along > this.from * 2 && along < (this.to + 1) * 2
        }
        if (!this.fired) {
          this.fired = true
          if (onBeam(hero.pos.x, hero.pos.z, HERO_RADIUS) && hero.y < 1.4) hurtHero(18, hero.pos.clone().add(new THREE.Vector3(this.axis === 'y' ? 1 : 0, 0, this.axis === 'x' ? 1 : 0)), 6)
          for (const e of enemies) if (e.targetable && onBeam(e.pos.x, e.pos.z, e.radius)) e.hurt(25, null, 0, fx)
        }
      }
      return
    }

    // Pulse hazards (chalk, spark, tomes, vent).
    const warn = k > 0.62 && k < 0.92
    const live = k >= 0.92
    this.fill.visible = warn || live
    this.fill.scale.setScalar(warn ? (k - 0.62) / 0.3 : 1)
    ;(this.edge.material as THREE.MeshBasicMaterial).opacity = warn ? 0.5 + Math.sin(t * 30) * 0.4 : 0.35
    if (this.extra && this.type === 'tomes') {
      this.extra.rotation.y = t * 2
      this.extra.position.y = live ? -3.6 : warn ? -((k - 0.62) / 0.3) * 1.2 : 0
    }
    if (this.extra && this.type === 'spark') this.extra.children[4].scale.setScalar(warn ? 1 + Math.sin(t * 40) * 0.4 : 1)
    if (!live) {
      this.fired = false
      return
    }
    if (this.fired) return
    this.fired = true
    const color = COLORS[this.type]
    fx.ring(center, color, 0.4, this.radius + 0.4, 0.3)
    fx.burst(center, color, 14, 7, 0.16, 0.5)
    const dmg = this.type === 'vent' ? 6 : this.type === 'spark' ? 16 : 15
    if (heroIn(this.radius) && hero.y < 1) {
      hurtHero(dmg, center, this.type === 'vent' ? 0 : 7)
      if (this.type === 'vent') hero.launch(11)
    }
    for (const e of enemies) {
      if (!e.targetable || Math.hypot(e.pos.x - this.x, e.pos.z - this.z) > this.radius + e.radius * 0.5) continue
      e.hurt(dmg * 1.6, center, 6, fx)
    }
  }
}
