import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'

/**
 * Cached asset loading plus a staged loader.
 *
 * Stages map to gameplay segments: `title` (menu art + theme), `day` (the first playable day:
 * world textures, first-person arms, wildlife, core SFX), `night1` (wolves, night music),
 * `night2` (the Hollow ghouls) and `boss` (Elder Howler). Boot waits only for `title`; the
 * first world waits for `day`; later stages prefetch in the background and pause whenever the
 * game reports it is busy (heavy VFX, many creatures, or slow frames).
 */
export class Assets {
  private readonly gltfLoader = new GLTFLoader()
  private readonly cache = new Map<string, Promise<unknown>>()
  private readonly resolved = new Map<string, unknown>()
  constructor() {
    this.gltfLoader.setMeshoptDecoder(MeshoptDecoder)
  }
  gltf(url: string): Promise<GLTF> {
    return this.memo(url, () => this.gltfLoader.loadAsync(url))
  }
  /** Loaded GLTF if its promise already resolved (sync access for spawners). */
  peekGltf(url: string): GLTF | undefined {
    return this.resolved.get(url) as GLTF | undefined
  }
  /** Raw bytes (audio is decoded later by the mixer, once an AudioContext exists). */
  bytes(url: string): Promise<ArrayBuffer> {
    return this.memo(`bytes:${url}`, async () => {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Failed to load ${url}`)
      return res.arrayBuffer()
    })
  }
  /** Warms the HTTP cache and decodes an image (for DOM art). */
  image(url: string): Promise<void> {
    return this.memo(`img:${url}`, async () => {
      const img = new Image()
      img.src = url
      await img.decode().catch(() => undefined)
    })
  }
  private memo<T>(key: string, load: () => Promise<T>): Promise<T> {
    let pending = this.cache.get(key) as Promise<T> | undefined
    if (!pending) {
      pending = load()
      this.cache.set(key, pending)
      pending.then((v) => this.resolved.set(key, v)).catch(() => this.cache.delete(key))
    }
    return pending
  }
}

export type StageId = 'title' | 'day' | 'night1' | 'night2' | 'boss'
export const STAGE_ORDER: StageId[] = ['title', 'day', 'night1', 'night2', 'boss']
export type Task = { id: string; weight: number; run: () => Promise<unknown> }

type StageState = { tasks: Task[]; done: Set<string>; promise?: Promise<void>; required: boolean }

/**
 * Loads stage task lists. `require(stage)` loads now at full concurrency (title, the first day,
 * or any stage the game needs immediately). `prefetch()` walks the remaining stages in order with
 * low concurrency and waits while `busy()` is true. Required stages never wait.
 */
export class StageLoader {
  private readonly stages = new Map<StageId, StageState>()
  private readonly listeners = new Set<(stage: StageId, progress: number) => void>()
  private prefetching = false
  busy: () => boolean = () => false
  /** Seconds the prefetcher has spent paused (debug/telemetry). */
  pausedSeconds = 0
  /** True while a background worker is waiting on `busy()`. */
  paused = false
  constructor(defs: Record<StageId, Task[]>) {
    for (const id of STAGE_ORDER) this.stages.set(id, { tasks: defs[id], done: new Set(), required: false })
  }
  onProgress(fn: (stage: StageId, progress: number) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  progress(id: StageId): number {
    const s = this.stages.get(id)!
    const total = s.tasks.reduce((a, t) => a + t.weight, 0)
    if (total <= 0) return 1
    let done = 0
    for (const t of s.tasks) if (s.done.has(t.id)) done += t.weight
    return done / total
  }
  ready(id: StageId): boolean {
    const s = this.stages.get(id)!
    return s.done.size >= s.tasks.length
  }
  /** Loads a stage now (idempotent). An in-flight background load is upgraded: it stops yielding. */
  require(id: StageId): Promise<void> {
    const s = this.stages.get(id)!
    const wasBackground = !!s.promise && !s.required
    s.required = true
    if (!s.promise) s.promise = this.run(id, 4)
    else if (wasBackground && !this.ready(id)) s.promise = Promise.all([s.promise, this.run(id, 2)]).then(() => undefined)
    return s.promise
  }
  /** Starts the background prefetch of every stage from `from` (inclusive) onward. */
  prefetch(from: StageId = 'night1'): void {
    if (this.prefetching) return
    this.prefetching = true
    void (async () => {
      for (const id of STAGE_ORDER.slice(STAGE_ORDER.indexOf(from))) {
        const s = this.stages.get(id)!
        if (!s.promise) s.promise = this.run(id, 2)
        await s.promise.catch(() => undefined)
      }
      this.prefetching = false
    })()
  }
  private async run(id: StageId, concurrency: number): Promise<void> {
    const s = this.stages.get(id)!
    const emit = () => {
      const p = this.progress(id)
      for (const fn of this.listeners) fn(id, p)
    }
    emit()
    const claimed = STAGE_CLAIMS.get(s) ?? new Set<string>()
    STAGE_CLAIMS.set(s, claimed)
    const worker = async () => {
      for (;;) {
        // Background loads yield to gameplay: wait while the game is busy.
        while (!s.required && this.busy()) {
          this.paused = true
          await sleep(250)
          this.pausedSeconds += 0.25
        }
        this.paused = false
        const task = s.tasks.find((t) => !claimed.has(t.id))
        if (!task) return
        claimed.add(task.id)
        try {
          await task.run()
        } catch (err) {
          console.warn(`[assets] ${task.id} failed`, err)
        }
        s.done.add(task.id)
        emit()
      }
    }
    await Promise.all(Array.from({ length: concurrency }, worker))
    // Wait for tasks claimed by a parallel runner of the same stage.
    while (!this.ready(id)) await sleep(50)
  }
}

const STAGE_CLAIMS = new WeakMap<object, Set<string>>()
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
