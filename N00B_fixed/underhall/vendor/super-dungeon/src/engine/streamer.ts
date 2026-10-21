/**
 * Staged, heat-gated asset streaming.
 *
 * Every asset task belongs to a stage of play (title, first wave, hub, floor 1, boss 1, ...).
 * - `require(stage)` loads a stage's essential tasks now, several at a time, regardless of heat.
 *   Boot uses it for the title + first-wave stages; scene transitions use it behind a curtain.
 *   Non-essential tasks (music buffering, which may take seconds on slow links and streams on
 *   its own anyway) are never waited on; they load in the background.
 * - Otherwise the streamer trickles tasks in the background, one at a time: first the stage the
 *   player is in (`focus`) and the next one, then everything later, then anything skipped.
 * - Background work pauses while the game is "hot" (enemy, VFX and projectile counts, boss
 *   fights) and resumes only after the heat has stayed low for a short calm period, so
 *   decoding and shader compilation never compete with a busy fight for the main thread.
 *
 * Tasks never reject: a failed task is marked done (its caller keeps a fallback, e.g. the
 * synthesized sound), so a flaky network can't block the game.
 */
export type LoadTask = {
  id: string
  stage: string
  label: string
  run: () => Promise<unknown> | unknown
  state: 'pending' | 'running' | 'done'
  essential: boolean
  failed: boolean
  ms: number
}

export type StreamerOptions = {
  /** Stages in play order. */
  stages: readonly string[]
  /** 0 = calm, 1 = as hot as it gets. Sampled every update. */
  heat: () => number
  /** Heat at or above this pauses background loading. */
  pauseAt?: number
  /** Heat must stay at or below this for `calmFor` seconds before background loading resumes. */
  resumeAt?: number
  calmFor?: number
  /** Minimum pause between background tasks, in seconds. */
  gap?: number
  /** Parallel tasks while a stage is required. */
  concurrency?: number
  now?: () => number
}

export type StreamerStats = {
  done: number
  total: number
  failed: number
  running: number
  hot: boolean
  heat: number
  focus: string
  ready: Record<string, boolean>
  /** Background tasks started so far, and how many of them started while hot (should stay 0). */
  backgroundStarts: number
  hotStarts: number
  /** When each stage's essential tasks were done, in ms since the streamer was created. */
  readyAt: Record<string, number>
}

export class AssetStreamer {
  private readonly tasks: LoadTask[] = []
  private readonly stages: readonly string[]
  private readonly required = new Set<string>()
  private readonly waiters = new Map<string, Array<() => void>>()
  private readonly readyAt: Record<string, number> = {}
  private focusStage: string
  private hot = false
  private calm = 0
  private lastHeat = 0
  private lastUpdate = -1
  private lastBackgroundEnd = -Infinity
  private running = 0
  private backgroundStarts = 0
  private hotStarts = 0
  private readonly born: number
  private readonly o: Required<Omit<StreamerOptions, 'stages' | 'heat' | 'now'>> & { heat: () => number; now: () => number }

  constructor(opts: StreamerOptions) {
    this.stages = opts.stages
    this.focusStage = opts.stages[0] ?? ''
    this.o = {
      heat: opts.heat,
      now: opts.now ?? (() => performance.now() / 1000),
      pauseAt: opts.pauseAt ?? 0.5,
      resumeAt: opts.resumeAt ?? 0.3,
      calmFor: opts.calmFor ?? 1,
      gap: opts.gap ?? 0.05,
      concurrency: opts.concurrency ?? 4,
    }
    this.born = this.o.now()
  }

  add(stage: string, id: string, run: LoadTask['run'], opts: { label?: string; essential?: boolean } = {}): void {
    if (!this.stages.includes(stage)) throw new Error(`Unknown stage ${stage}`)
    this.tasks.push({ id, stage, label: opts.label ?? id, run, state: 'pending', essential: opts.essential ?? true, failed: false, ms: 0 })
  }

  /** The stage the player is in now; background loading prioritizes it and the next one. */
  focus(stage: string): void {
    if (this.stages.includes(stage)) this.focusStage = stage
  }

  get currentFocus(): string {
    return this.focusStage
  }

  /** Every task of the stage is done (`essentialOnly`: just the ones transitions wait for). */
  isReady(stage: string, essentialOnly = false): boolean {
    return this.tasks.every(t => t.stage !== stage || t.state === 'done' || (essentialOnly && !t.essential))
  }

  /** Fraction of tasks done across the given stages (all stages when omitted). */
  progress(stages: readonly string[] = this.stages, essentialOnly = false): number {
    const list = this.tasks.filter(t => stages.includes(t.stage) && (!essentialOnly || t.essential))
    if (!list.length) return 1
    return list.filter(t => t.state === 'done').length / list.length
  }

  /** Label of a running (or next) task in the given stages, for loading screens. */
  activity(stages: readonly string[]): string {
    const t = this.tasks.find(x => stages.includes(x.stage) && x.state === 'running') ?? this.tasks.find(x => stages.includes(x.stage) && x.state === 'pending')
    return t?.label ?? ''
  }

  /** Load a stage's essential tasks now (in parallel, ignoring heat); resolves when they're done. */
  require(stage: string): Promise<void> {
    if (this.isReady(stage, true)) {
      this.markReady(stage)
      return Promise.resolve()
    }
    this.required.add(stage)
    const p = new Promise<void>(resolve => {
      const list = this.waiters.get(stage) ?? []
      list.push(resolve)
      this.waiters.set(stage, list)
    })
    this.pump()
    return p
  }

  /** Call once per frame. Updates heat hysteresis and starts background work when calm. */
  update(): void {
    const now = this.o.now()
    const dt = this.lastUpdate < 0 ? 0 : Math.min(0.25, now - this.lastUpdate)
    this.lastUpdate = now
    const heat = this.o.heat()
    this.lastHeat = heat
    if (heat >= this.o.pauseAt) {
      this.hot = true
      this.calm = 0
    } else if (heat <= this.o.resumeAt) {
      this.calm += dt
      if (this.calm >= this.o.calmFor) this.hot = false
    } else this.calm = 0
    this.pump(true)
  }

  get paused(): boolean {
    return this.hot
  }

  get stats(): StreamerStats {
    const ready: Record<string, boolean> = {}
    for (const s of this.stages) ready[s] = this.isReady(s)
    return {
      done: this.tasks.filter(t => t.state === 'done').length,
      total: this.tasks.length,
      failed: this.tasks.filter(t => t.failed).length,
      running: this.running,
      hot: this.hot,
      heat: Math.round(this.lastHeat * 100) / 100,
      focus: this.focusStage,
      ready,
      backgroundStarts: this.backgroundStarts,
      hotStarts: this.hotStarts,
      readyAt: { ...this.readyAt },
    }
  }

  /** Background order: focus stage, the next stage, later stages, then earlier leftovers. */
  private backgroundOrder(): string[] {
    const i = Math.max(0, this.stages.indexOf(this.focusStage))
    return [...this.stages.slice(i), ...this.stages.slice(0, i)]
  }

  private nextRequired(): LoadTask | undefined {
    for (const s of this.stages) {
      if (!this.required.has(s)) continue
      const t = this.tasks.find(x => x.stage === s && x.state === 'pending' && x.essential)
      if (t) return t
    }
    return undefined
  }

  private nextBackground(): LoadTask | undefined {
    for (const s of this.backgroundOrder()) {
      const t = this.tasks.find(x => x.stage === s && x.state === 'pending')
      if (t) return t
    }
    return undefined
  }

  /** `frame`: called from update(). Background tasks start only there, at most one per frame. */
  private pump(frame = false): void {
    // Required stages: fill the parallel slots.
    for (let t = this.nextRequired(); t && this.running < this.o.concurrency; t = this.nextRequired()) this.start(t, false)
    if (this.hasRequiredPending()) return
    // Background: one task at a time, only while calm, with a short breather between tasks.
    if (!frame || this.hot || this.running > 0) return
    if (this.o.now() - this.lastBackgroundEnd < this.o.gap) return
    const t = this.nextBackground()
    if (t) this.start(t, true)
  }

  private hasRequiredPending(): boolean {
    for (const s of this.required) if (!this.isReady(s, true)) return true
    return false
  }

  private start(t: LoadTask, background: boolean): void {
    t.state = 'running'
    this.running += 1
    if (background) {
      this.backgroundStarts += 1
      if (this.hot) this.hotStarts += 1
    }
    const t0 = this.o.now()
    const finish = (failed: boolean): void => {
      t.state = 'done'
      t.failed = failed
      t.ms = Math.round((this.o.now() - t0) * 1000)
      this.running -= 1
      if (background) this.lastBackgroundEnd = this.o.now()
      if (this.isReady(t.stage, true)) this.markReady(t.stage)
      this.pump()
    }
    let result: unknown
    try {
      result = t.run()
    } catch {
      finish(true)
      return
    }
    Promise.resolve(result).then(() => finish(false), () => finish(true))
  }

  private markReady(stage: string): void {
    if (this.readyAt[stage] === undefined) this.readyAt[stage] = Math.round((this.o.now() - this.born) * 1000)
    this.required.delete(stage)
    const list = this.waiters.get(stage)
    if (!list) return
    this.waiters.delete(stage)
    for (const w of list) w()
  }
}
