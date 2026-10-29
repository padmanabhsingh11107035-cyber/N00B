import type RAPIER from '@dimforge/rapier3d-compat'

/**
 * Reusable rigid-body sleep & budget manager (island-aware).
 *
 * Rapier sleeps bodies eventually, but destruction scenes want something stricter and observable:
 *  - **Faster settling**: once every body of a *contact group* (bodies touching each other) has
 *    stayed under the speed thresholds for `settleSeconds`, the whole group is put to sleep, so a
 *    collapsed pile stops costing CPU quickly.
 *  - **Awake budget**: when more than `maxAwake` bodies are simulated, the slowest groups are put
 *    to sleep first (never groups with a fast mover), capping the worst-case frame cost.
 *  - **Tag budgets & lifetimes**: short-lived bodies (debris) get a lifetime and a per-tag cap; the
 *    oldest are expired through a callback so the owner removes mesh and body.
 *  - **Queries**: awake counts, kinetic energy (for rumble audio), `wakeInRadius` for explosions,
 *    and `isSettled()` so gameplay knows when a scene has come to rest.
 *
 * Why groups: putting a single body to sleep while a neighbour resting on it is still awake makes
 * Rapier wake it again on the next contact but without its static contacts, so it sinks through the
 * floor. Sleeping only whole contact-connected groups keeps islands consistent. Grouping uses the
 * narrow-phase pairs (`world.contactPairsWith`) and runs every `groupInterval` steps.
 *
 * It never removes bodies itself; expiry is reported to the owner via `onExpire`.
 */
export type SleepPolicy = {
  /** Linear speed (m/s) below which a body counts as still. */
  linear: number
  /** Angular speed (rad/s) below which a body counts as still. */
  angular: number
  /** Seconds a body must stay still before its group may be forced to sleep. */
  settleSeconds: number
}

export type TrackOptions = {
  /** Groups bodies for budgets, stats and settle queries (e.g. 'block', 'debris', 'projectile'). */
  tag?: string
  /** Seconds after which `onExpire` fires (lifetime-limited debris). */
  lifetime?: number
  /** Called once when the lifetime or tag budget expires the body. The owner must remove it. */
  onExpire?: () => void
  /** Per-body policy override. */
  policy?: Partial<SleepPolicy>
  /** Never force-sleep this body or anything touching it (e.g. a projectile in flight). */
  neverForceSleep?: boolean
}

export type SleepStats = {
  total: number
  awake: number
  sleeping: number
  /** Bodies put to sleep by this manager so far. */
  forced: number
  /** Groups found by the last grouping pass. */
  groups: number
  /** Sum of ½mv² over awake bodies (drives rumble audio). */
  kinetic: number
  byTag: Record<string, { total: number; awake: number }>
}

type Tracked = {
  body: RAPIER.RigidBody
  tag: string
  policy: SleepPolicy
  still: number
  speed: number
  age: number
  lifetime: number
  onExpire?: () => void
  expired: boolean
  neverForceSleep: boolean
  order: number
}

export type SleepManagerOptions = Partial<SleepPolicy> & {
  /** Hard cap on simultaneously awake tracked bodies. */
  maxAwake?: number
  /** Maximum number of live bodies per tag; the oldest are expired beyond this. */
  budgets?: Record<string, number>
  /** Fixed steps between grouping passes (sleep decisions). */
  groupInterval?: number
}

export class SleepManager {
  readonly policy: SleepPolicy
  maxAwake: number
  budgets: Record<string, number>
  groupInterval: number
  private tracked = new Map<number, Tracked>()
  private order = 0
  private forced = 0
  private stepIndex = 0
  private groupsFound = 0
  private last: SleepStats = { total: 0, awake: 0, sleeping: 0, forced: 0, groups: 0, kinetic: 0, byTag: {} }

  constructor(private readonly world: RAPIER.World, options: SleepManagerOptions = {}) {
    this.policy = { linear: options.linear ?? 0.12, angular: options.angular ?? 0.22, settleSeconds: options.settleSeconds ?? 0.45 }
    this.maxAwake = options.maxAwake ?? Infinity
    this.budgets = { ...(options.budgets ?? {}) }
    this.groupInterval = Math.max(1, options.groupInterval ?? 6)
  }

  track(body: RAPIER.RigidBody, options: TrackOptions = {}): void {
    const tag = options.tag ?? 'default'
    this.tracked.set(body.handle, {
      body,
      tag,
      policy: { ...this.policy, ...options.policy },
      still: 0,
      speed: 0,
      age: 0,
      lifetime: options.lifetime ?? Infinity,
      onExpire: options.onExpire,
      expired: false,
      neverForceSleep: options.neverForceSleep ?? false,
      order: this.order++,
    })
    const budget = this.budgets[tag]
    if (budget !== undefined) this.enforceBudget(tag, budget)
  }

  /** Stop tracking (call before removing the body from the world). */
  untrack(body: RAPIER.RigidBody): void {
    this.tracked.delete(body.handle)
  }

  setNeverForceSleep(body: RAPIER.RigidBody, value: boolean): void {
    const t = this.tracked.get(body.handle)
    if (t) t.neverForceSleep = value
  }

  clear(): void {
    this.tracked.clear()
    this.forced = 0
  }

  /** Advance timers and apply sleep rules. Call once per fixed step after the physics step. */
  step(dt: number): SleepStats {
    this.stepIndex += 1
    const stats: SleepStats = { total: 0, awake: 0, sleeping: 0, forced: this.forced, groups: this.groupsFound, kinetic: 0, byTag: {} }
    const expire: Tracked[] = []
    const awake: Tracked[] = []
    for (const t of this.tracked.values()) {
      t.age += dt
      if (!t.expired && t.age >= t.lifetime) expire.push(t)
      const tag = (stats.byTag[t.tag] ??= { total: 0, awake: 0 })
      tag.total += 1
      stats.total += 1
      if (t.body.isSleeping()) {
        t.still = 0
        t.speed = 0
        stats.sleeping += 1
        continue
      }
      const v = t.body.linvel()
      const w = t.body.angvel()
      const lin = Math.hypot(v.x, v.y, v.z)
      const ang = Math.hypot(w.x, w.y, w.z)
      t.speed = lin + ang * 0.3
      stats.kinetic += 0.5 * t.body.mass() * lin * lin
      t.still = lin < t.policy.linear && ang < t.policy.angular ? t.still + dt : 0
      stats.awake += 1
      tag.awake += 1
      awake.push(t)
    }
    if (awake.length > 0 && this.stepIndex % this.groupInterval === 0) {
      const slept = this.sleepGroups(awake)
      for (const t of slept) {
        stats.awake -= 1
        stats.sleeping += 1
        stats.byTag[t.tag].awake -= 1
      }
    }
    stats.forced = this.forced
    stats.groups = this.groupsFound
    for (const t of expire) this.expire(t)
    this.last = stats
    return stats
  }

  /** Union awake bodies by contact, then sleep settled groups (and slow groups over budget). */
  private sleepGroups(awake: Tracked[]): Tracked[] {
    const parent = new Map<number, number>()
    const find = (h: number): number => {
      let r = h
      while (parent.get(r) !== r) r = parent.get(r)!
      let c = h
      while (c !== r) {
        const n = parent.get(c)!
        parent.set(c, r)
        c = n
      }
      return r
    }
    for (const t of awake) parent.set(t.body.handle, t.body.handle)
    // Groups touching an awake body we do not manage (or a protected one) must stay awake.
    const blocked = new Set<number>()
    for (const t of awake) {
      const n = t.body.numColliders()
      for (let i = 0; i < n; i += 1) {
        this.world.contactPairsWith(t.body.collider(i), other => {
          const ob = other.parent()
          if (!ob || !ob.isDynamic()) return
          if (parent.has(ob.handle)) {
            const a = find(t.body.handle)
            const b = find(ob.handle)
            if (a !== b) parent.set(a, b)
          } else if (!ob.isSleeping()) blocked.add(t.body.handle)
        })
      }
    }
    const groups = new Map<number, { members: Tracked[]; settled: boolean; maxSpeed: number; locked: boolean }>()
    for (const t of awake) {
      const root = find(t.body.handle)
      let g = groups.get(root)
      if (!g) groups.set(root, (g = { members: [], settled: true, maxSpeed: 0, locked: false }))
      g.members.push(t)
      if (t.still < t.policy.settleSeconds) g.settled = false
      if (t.neverForceSleep || blocked.has(t.body.handle)) g.locked = true
      g.maxSpeed = Math.max(g.maxSpeed, t.speed / Math.max(1e-3, t.policy.linear))
    }
    this.groupsFound = groups.size
    const slept: Tracked[] = []
    const sleepGroup = (members: Tracked[]) => {
      for (const m of members) {
        m.body.sleep()
        m.still = 0
        this.forced += 1
        slept.push(m)
      }
    }
    let awakeCount = awake.length
    const rest: { members: Tracked[]; maxSpeed: number }[] = []
    for (const g of groups.values()) {
      if (g.locked) continue
      if (g.settled) {
        sleepGroup(g.members)
        awakeCount -= g.members.length
      } else rest.push(g)
    }
    if (awakeCount > this.maxAwake) {
      rest.sort((a, b) => a.maxSpeed - b.maxSpeed)
      for (const g of rest) {
        if (awakeCount <= this.maxAwake || g.maxSpeed > 6) break
        sleepGroup(g.members)
        awakeCount -= g.members.length
      }
    }
    return slept
  }

  get stats(): SleepStats {
    return this.last
  }

  /** Awake count, optionally restricted to (or excluding) tags. */
  awakeCount(filter?: { only?: string[]; except?: string[] }): number {
    let n = 0
    for (const t of this.tracked.values()) {
      if (filter?.only && !filter.only.includes(t.tag)) continue
      if (filter?.except?.includes(t.tag)) continue
      if (!t.body.isSleeping()) n += 1
    }
    return n
  }

  /**
   * True when at most `tolerance` tracked bodies (outside `except`) are awake and moving faster
   * than three times the policy's still threshold — i.e. the scene has visually come to rest.
   */
  isSettled(tolerance = 0, except: string[] = []): boolean {
    let moving = 0
    for (const t of this.tracked.values()) {
      if (except.includes(t.tag) || t.body.isSleeping()) continue
      const v = t.body.linvel()
      if (Math.hypot(v.x, v.y, v.z) > t.policy.linear * 3) moving += 1
      if (moving > tolerance) return false
    }
    return true
  }

  /** Wake every tracked body whose centre lies within `radius` of `center`. Returns the count. */
  wakeInRadius(center: { x: number; y: number; z: number }, radius: number): number {
    const r2 = radius * radius
    let n = 0
    for (const t of this.tracked.values()) {
      const p = t.body.translation()
      const dx = p.x - center.x
      const dy = p.y - center.y
      const dz = p.z - center.z
      if (dx * dx + dy * dy + dz * dz <= r2) {
        if (t.body.isSleeping()) n += 1
        t.body.wakeUp()
        t.still = 0
      }
    }
    return n
  }

  /** Iterate tracked bodies (read-only use). */
  *bodies(tag?: string): IterableIterator<RAPIER.RigidBody> {
    for (const t of this.tracked.values()) if (!tag || t.tag === tag) yield t.body
  }

  private enforceBudget(tag: string, budget: number): void {
    const list = [...this.tracked.values()].filter(t => t.tag === tag && !t.expired).sort((a, b) => a.order - b.order)
    for (let i = 0; i < list.length - budget; i += 1) this.expire(list[i])
  }

  private expire(t: Tracked): void {
    if (t.expired) return
    t.expired = true
    t.onExpire?.()
  }
}
