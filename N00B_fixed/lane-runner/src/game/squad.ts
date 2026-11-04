/**
 * The squad. `count` is the real number of soldiers (it drives damage and the HUD). Up to
 * `visibleCap` soldiers are simulated and drawn individually; when the squad is larger, each
 * visible soldier fires for count/visible soldiers, and losses beyond the visible set are drawn by
 * killing visible soldiers and refilling from the (invisible) reserve at the back.
 *
 * Every soldier follows its formation slot through a critically-damped spring, so the crowd
 * sways, lags and bunches organically when steering; soldiers lean into turns, have their own
 * stride phase/speed and recoil when firing. Deaths play the fall animation and leave the body
 * sinking into the road for a moment.
 */
import * as THREE from 'three'
import { type VatAnim, type VatCrowd, newAnim, playAnim, stepAnim } from './vat'
import { ROAD_HALF } from './procgen'
import { SQUAD_CAP } from './rules'

export interface Soldier {
  x: number; z: number; vx: number; vz: number
  ox: number; oz: number
  anim: VatAnim
  stride: number
  fireCd: number
  recoil: number
  flash: number
  yaw: number
  alive: boolean
  dead: number // seconds since death (for dying bodies)
  joinT: number
}

export class Squad {
  count = 0
  x = 0
  z = 0
  targetX = 0
  soldiers: Soldier[] = []
  dying: Soldier[] = []
  visibleCap = 150
  spacing = 0.62
  /** half-width of the formation (after compression) */
  halfW = 0.5
  halfD = 0.5
  cheering = 0
  /** chance to shrug off each lethal hit (Body Armor) */
  armor = 0
  /** hits shrugged off since last read (for feedback) */
  blocked = 0
  private xScale = 1
  onDeath?: (s: Soldier) => void
  onJoin?: (s: Soldier) => void

  reset(count: number) {
    this.soldiers.length = 0
    this.dying.length = 0
    this.count = 0
    this.x = 0; this.targetX = 0
    this.setCount(count, null, false)
  }

  get visible() { return this.soldiers.length }
  /** Damage multiplier per visible soldier so hidden reserves still count. */
  get perVisible() { return this.soldiers.length ? this.count / this.soldiers.length : 0 }

  private slot(i: number): [number, number] {
    if (i === 0) return [0, 0]
    const a = i * 2.39996323
    const r = this.spacing * 0.56 * Math.sqrt(i + 0.3)
    return [Math.cos(a) * r, Math.sin(a) * r]
  }
  private relayout() {
    const n = this.soldiers.length
    const R = this.spacing * 0.56 * Math.sqrt(n + 0.3)
    const maxHalf = ROAD_HALF - 0.9
    this.xScale = R > maxHalf ? maxHalf / R : 1
    const zStretch = 1 / Math.sqrt(this.xScale) // compress width, lengthen the column
    for (let i = 0; i < n; i++) {
      const [sx, sz] = this.slot(i)
      this.soldiers[i].ox = sx * this.xScale
      this.soldiers[i].oz = sz * zStretch * 0.9
    }
    this.halfW = Math.max(0.5, R * this.xScale)
    this.halfD = Math.max(0.5, R * zStretch * 0.9)
  }

  private spawn(fromX: number, fromZ: number, fx = true): Soldier {
    const s: Soldier = {
      x: fromX, z: fromZ, vx: 0, vz: 0, ox: 0, oz: 0,
      anim: newAnim('soldier_run', Math.random() * 2), stride: 0.92 + Math.random() * 0.16,
      fireCd: Math.random() * 0.3, recoil: 0, flash: 0, yaw: Math.PI, alive: true, dead: 0, joinT: fx ? 0.6 : 0,
    }
    s.anim.speed = s.stride
    this.soldiers.push(s)
    if (fx) this.onJoin?.(s)
    return s
  }

  /** Set the real soldier count. `at` = where new soldiers appear (gate, rescue cage). */
  setCount(n: number, at: { x: number; z: number } | null, effects = true) {
    n = Math.max(0, Math.min(SQUAD_CAP, Math.round(n)))
    const prev = this.count
    this.count = n
    const want = Math.min(n, this.visibleCap)
    if (n < prev) {
      // remove from the outside of the formation first (the back rows), with death animations
      while (this.soldiers.length > want) {
        let idx = this.soldiers.length - 1
        if (at) {
          let best = Infinity
          for (let i = 0; i < this.soldiers.length; i++) {
            const s = this.soldiers[i]
            const d = (s.x - at.x) ** 2 + (s.z - at.z) ** 2
            if (d < best) { best = d; idx = i }
          }
        }
        this.killIndex(idx, effects)
      }
    } else {
      while (this.soldiers.length < want) {
        const sx = at ? at.x + (Math.random() - 0.5) * 1.5 : this.x + (Math.random() - 0.5)
        const sz = at ? at.z + (Math.random() - 0.5) * 1.5 : this.z + 2
        this.spawn(sx, sz, effects)
      }
    }
    this.relayout()
  }

  private killIndex(i: number, effects: boolean) {
    const s = this.soldiers[i]
    this.soldiers.splice(i, 1)
    if (!effects) return
    s.alive = false
    s.dead = 0
    playAnim(s.anim, 'z_death', 0.08)
    s.anim.speed = 1.2
    this.dying.push(s)
    if (this.dying.length > 60) this.dying.shift()
    this.onDeath?.(s)
  }

  /**
   * Kill visible soldiers matching `hit` (each with probability `chance`); logical losses scale with
   * hidden reserves. Returns the number of real soldiers lost.
   */
  killWhere(hit: (x: number, z: number) => boolean, chance = 1, max = Infinity): number {
    const scale = this.perVisible
    let killed = 0
    for (let i = this.soldiers.length - 1; i >= 0 && killed < max; i--) {
      const s = this.soldiers[i]
      if (s.joinT > 0.3) continue
      if (hit(s.x, s.z) && Math.random() < chance) {
        if (Math.random() < this.armor) { this.blocked++; continue }
        this.killIndex(i, true); killed++
      }
    }
    if (!killed) return 0
    const lost = Math.min(this.count, Math.max(killed, Math.round(killed * scale)))
    this.count -= lost
    // refill visible set from the reserve (appear at the back of the column)
    while (this.soldiers.length < Math.min(this.count, this.visibleCap)) this.spawn(this.x + (Math.random() - 0.5) * this.halfW, this.z + this.halfD + 1, false)
    this.relayout()
    return lost
  }
  /** Kill the n soldiers nearest to a point (zombie bites, boss hits). */
  killNear(x: number, z: number, n: number): number {
    if (n <= 0 || !this.count) return 0
    let lost = 0
    for (let k = 0; k < n && this.count > 0; k++) {
      if (this.soldiers.length === 0) break
      if (Math.random() < this.armor) { this.blocked++; continue }
      if (this.count > this.soldiers.length && Math.random() > 1 / this.perVisible) {
        // hidden reserve soldier takes it: still show a death at the nearest soldier's spot
        this.count--
        lost++
        continue
      }
      let idx = 0, best = Infinity
      for (let i = 0; i < this.soldiers.length; i++) {
        const s = this.soldiers[i]
        const d = (s.x - x) ** 2 + (s.z - z) ** 2
        if (d < best) { best = d; idx = i }
      }
      this.killIndex(idx, true)
      this.count--
      lost++
    }
    while (this.soldiers.length < Math.min(this.count, this.visibleCap)) this.spawn(this.x, this.z + this.halfD + 1, false)
    this.relayout()
    return lost
  }

  update(dt: number, forward: number, steerSpeed: number) {
    // squad centre
    const lim = ROAD_HALF - 0.4 - this.halfW
    this.targetX = Math.max(-lim, Math.min(lim, this.targetX))
    const dx = this.targetX - this.x
    const maxStep = steerSpeed * dt
    const prevX = this.x
    this.x += Math.max(-maxStep, Math.min(maxStep, dx * Math.min(1, dt * 14)))
    this.z -= forward * dt
    const lateral = (this.x - prevX) / Math.max(1e-4, dt)
    // soldiers: damped spring to slot
    const k = 60, c = 2 * Math.sqrt(k) * 0.85
    for (const s of this.soldiers) {
      const tx = this.x + s.ox, tz = this.z + s.oz
      const ax = (tx - s.x) * k - s.vx * c
      const az = (tz - s.z) * k - (s.vz + forward) * c
      s.vx += ax * dt; s.vz += az * dt
      s.x += s.vx * dt; s.z += s.vz * dt
      s.x = Math.max(-ROAD_HALF + 0.3, Math.min(ROAD_HALF - 0.3, s.x))
      const lean = Math.max(-0.35, Math.min(0.35, (s.vx + lateral * 0.3) * 0.045))
      s.yaw = Math.PI - lean * 1.6
      s.recoil = Math.max(0, s.recoil - dt * 9)
      s.flash = Math.max(0, s.flash - dt * 4)
      s.joinT = Math.max(0, s.joinT - dt)
      const clip = this.cheering > 0 ? 'soldier_cheer' : 'soldier_run'
      if (s.anim.clip !== clip) playAnim(s.anim, clip, 0.2)
      s.anim.speed = forward > 0.5 ? s.stride * (0.85 + forward / 40) : s.stride * 0.6
      stepAnim(s.anim, dt)
    }
    this.cheering = Math.max(0, this.cheering - dt)
    // dying bodies: carry forward inertia briefly, then sink
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const s = this.dying[i]
      s.dead += dt
      stepAnim(s.anim, dt)
      s.vx *= 1 - dt * 4; s.vz *= 1 - dt * 4
      s.x += s.vx * dt * 0.4; s.z += s.vz * dt * 0.4
      if (s.dead > 2.6) this.dying.splice(i, 1)
    }
  }

  render(crowd: VatCrowd, shadow: (x: number, z: number, r: number, a: number) => void, alpha = 1) {
    void alpha
    let n = 0
    for (const s of this.soldiers) {
      const pop = s.joinT > 0 ? 1 + Math.sin((1 - s.joinT / 0.6) * Math.PI) * 0.25 : 1
      crowd.set(n++, s.x, 0, s.z, s.yaw, 0.98 * pop, s.anim, s.flash, 1, -s.recoil * 0.12, (s.yaw - Math.PI) * 0.4)
      shadow(s.x, s.z, 0.42, 0.5)
    }
    for (const s of this.dying) {
      const sink = Math.max(0, s.dead - 1.6) * 0.6
      crowd.set(n++, s.x, -sink, s.z, s.yaw, 0.98, s.anim, 0, 1)
    }
    crowd.commit(n)
  }
}

export const tmpV = new THREE.Vector3()
