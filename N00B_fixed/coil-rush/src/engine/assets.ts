/**
 * Staged asset loading. Nothing here depends on three.js so the boot chunk stays tiny.
 *
 * Stage 0 (boot)    HUD/menu icons and UI clicks (~100 KB). The only load that blocks the title.
 * Stage 1 (opening) everything the first match needs: painted backdrop, particle atlas, every
 *                   celestial/asteroid/pylon surface and core SFX. Streams while
 *                   the title is up; `play()` shows a recoverable gate only if it is still late.
 * Stage 2 (mid)     title and arena music (the mixer starts a track whenever it lands) plus
 *                   heavier stings.
 * Stage 3 (late)    intense music layer, results music and rare stings.
 *
 * After stage 0 the scheduler streams the remaining stages in order, one request at a time during
 * play, and pauses whenever the game reports high "heat" (busy frames, many particles or worms on
 * screen). Consumers either `await ensure(stage)` or subscribe with `when(id)` and upgrade from a
 * procedural fallback once the file arrives, so late assets never block play.
 */
export type AssetKind = 'image' | 'audio' | 'binary'
export type AssetEntry = { id: string; url: string; kind: AssetKind; stage: 0 | 1 | 2 | 3 }

const img = (id: string, url: string, stage: AssetEntry['stage']): AssetEntry => ({ id, url, kind: 'image', stage })
const snd = (id: string, url: string, stage: AssetEntry['stage']): AssetEntry => ({ id, url, kind: 'audio', stage })
const bin = (id: string, url: string, stage: AssetEntry['stage']): AssetEntry => ({ id, url, kind: 'binary', stage })

// Everything the game loads sits next to its page, under ./assets/ (a relative address, so it works from whatever folder the page is served from).
const mediaUrl = (file: string): string => `./assets/media/${file}`
const faviconUrl = './assets/share/favicon-coil-rush-128.png'
const asteroidModelUrl = './assets/models/nebula-asteroid-512.glb'

// The staged list of everything the game loads (scripts/make-warm.mjs and tests/assets.test.ts read the files named here).
export const MANIFEST: AssetEntry[] = [
  img('icon/magnet', mediaUrl('icons/magnet.webp'), 0),
  img('icon/shield', mediaUrl('icons/shield.webp'), 0),
  img('icon/boost', mediaUrl('icons/boost.webp'), 0),
  img('icon/stardust', mediaUrl('icons/stardust.webp'), 0),
  img('icon/crown', mediaUrl('icons/crown.webp'), 0),
  img('icon/moon', mediaUrl('icons/moon.webp'), 0),
  img('icon/comet', mediaUrl('icons/comet.webp'), 0),
  img('icon/planet', mediaUrl('icons/planet.webp'), 0),
  img('icon/star', mediaUrl('icons/star.webp'), 0),
  img('icon/pulsar', mediaUrl('icons/pulsar.webp'), 0),
  img('share/favicon', faviconUrl, 0),
  snd('sfx/ui-hover', mediaUrl('audio/sfx-ui-hover.mp3'), 0),
  snd('sfx/ui-click', mediaUrl('audio/sfx-ui-click.mp3'), 0),
  img('bg/nebula', mediaUrl('bg/nebula.webp'), 1),
  img('fx/particles', mediaUrl('fx/particles.webp'), 1),
  img('tex/moon', mediaUrl('tex/moon.webp'), 1),
  img('tex/comet', mediaUrl('tex/comet.webp'), 1),
  img('tex/rock', mediaUrl('tex/rock.webp'), 1),
  img('tex/rock-normal', mediaUrl('tex/rock-normal.webp'), 1),
  bin('model/nebula-asteroid', asteroidModelUrl, 1),
  img('tex/metal', mediaUrl('tex/metal.webp'), 1),
  img('tex/metal-normal', mediaUrl('tex/metal-normal.webp'), 1),
  snd('sfx/bite', mediaUrl('audio/sfx-bite.mp3'), 1),
  snd('sfx/nova', mediaUrl('audio/sfx-nova.mp3'), 1),
  snd('sfx/boost', mediaUrl('audio/sfx-boost.mp3'), 1),
  snd('sfx/pickup', mediaUrl('audio/sfx-pickup.mp3'), 1),
  snd('sfx/shield-up', mediaUrl('audio/sfx-shield-up.mp3'), 1),
  snd('sfx/shield-break', mediaUrl('audio/sfx-shield-break.mp3'), 1),
  snd('sfx/gulp', mediaUrl('audio/sfx-gulp.mp3'), 1),
  snd('sfx/power', mediaUrl('audio/sfx-power.mp3'), 1),
  snd('sfx/gate', mediaUrl('audio/sfx-gate.mp3'), 1),
  snd('sfx/well', mediaUrl('audio/sfx-well.mp3'), 1),
  snd('sfx/death', mediaUrl('audio/sfx-death.mp3'), 1),
  snd('sfx/kill', mediaUrl('audio/sfx-kill.mp3'), 1),
  snd('sfx/start', mediaUrl('audio/sfx-start.mp3'), 1),
  snd('sfx/bounce', mediaUrl('audio/sfx-bounce.mp3'), 1),
  snd('sfx/tick', mediaUrl('audio/sfx-tick.mp3'), 1),
  snd('sfx/expire', mediaUrl('audio/sfx-expire.mp3'), 1),
  snd('sfx/combo', mediaUrl('audio/sfx-combo.mp3'), 1),
  img('tex/gasgiant', mediaUrl('tex/gasgiant.webp'), 1),
  img('tex/star', mediaUrl('tex/star.webp'), 1),
  img('tex/pulsar', mediaUrl('tex/pulsar.webp'), 1),
  snd('bgm/title', mediaUrl('audio/bgm-title.mp3'), 2),
  snd('bgm/arena', mediaUrl('audio/bgm-arena.mp3'), 2),
  snd('sfx/supernova', mediaUrl('audio/sfx-supernova.mp3'), 2),
  snd('sfx/crown', mediaUrl('audio/sfx-crown.mp3'), 2),
  snd('bgm/intense', mediaUrl('audio/bgm-intense.mp3'), 3),
  snd('sfx/purchase', mediaUrl('audio/sfx-purchase.mp3'), 3),
  snd('bgm/results', mediaUrl('audio/bgm-results.mp3'), 3),
]

type Loaded = HTMLImageElement | ArrayBuffer
type Status = 'queued' | 'loading' | 'done' | 'failed'

export class Assets {
  private status = new Map<string, Status>()
  private data = new Map<string, Loaded>()
  private waiters = new Map<string, ((v: Loaded | null) => void)[]>()
  private byId = new Map<string, AssetEntry>()
  private active = 0
  private hot = false
  private calmSince = 0
  private lastTrickle = 0
  private started = false
  private priorityStage = 0
  private listeners = new Set<() => void>()
  /** Max parallel requests while idle (menus) and while playing. */
  concurrency = { idle: 3, play: 1 }
  playing = false

  constructor(readonly manifest: AssetEntry[] = MANIFEST) {
    for (const e of manifest) {
      this.byId.set(e.id, e)
      this.status.set(e.id, 'queued')
    }
  }

  /**
   * Called every frame by the game. `heat` is 0..1; above 0.6 pauses prefetch until 1.5 s of calm.
   * Devices that never calm down (steady 30 fps) still get one request every `trickleMs` while
   * nothing else is in flight, so late-stage art always arrives eventually.
   */
  trickleMs = 4000
  setHeat(heat: number, now = performance.now()): void {
    if (heat > 0.6) {
      this.hot = true
      this.calmSince = now
      if (this.started && this.active === 0 && now - this.lastTrickle > this.trickleMs) {
        const next = this.manifest.find(e => e.stage <= this.priorityStage && this.status.get(e.id) === 'queued')
        if (next) {
          this.lastTrickle = now
          this.fetch(next.id)
        }
      }
    } else if (this.hot && now - this.calmSince > 1500) {
      this.hot = false
      this.pump()
    } else if (heat <= 0.6 && !this.hot) {
      this.calmSince = now
    }
  }
  get paused(): boolean {
    return this.hot
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  progress(stage: number): { done: number; total: number; ratio: number } {
    let done = 0
    let total = 0
    for (const e of this.manifest) {
      if (e.stage > stage) continue
      total++
      const s = this.status.get(e.id)
      if (s === 'done' || s === 'failed') done++
    }
    return { done, total, ratio: total ? done / total : 1 }
  }

  stageReady(stage: number): boolean {
    return this.progress(stage).ratio >= 1
  }

  /** Load everything up to `stage` with priority and resolve when complete (failures are tolerated). */
  ensure(stage: number): Promise<void> {
    this.priorityStage = Math.max(this.priorityStage, stage)
    this.started = true
    this.pump(true)
    const need = this.manifest.filter(e => e.stage <= stage)
    return Promise.all(need.map(e => this.load(e.id))).then(() => undefined)
  }

  /** Begin streaming remaining stages in the background after boot. */
  startBackground(): void {
    this.started = true
    this.priorityStage = 3
    this.pump()
  }

  get(id: string): Loaded | undefined {
    return this.data.get(id)
  }
  image(id: string): HTMLImageElement | undefined {
    const d = this.data.get(id)
    return d instanceof HTMLImageElement ? d : undefined
  }
  buffer(id: string): ArrayBuffer | undefined {
    const d = this.data.get(id)
    return d instanceof ArrayBuffer ? d : undefined
  }
  url(id: string): string {
    return this.byId.get(id)?.url ?? ''
  }

  /** Resolves with the asset (or null on failure) and starts loading it immediately if needed. */
  load(id: string): Promise<Loaded | null> {
    const cur = this.data.get(id)
    if (cur) return Promise.resolve(cur)
    if (this.status.get(id) === 'failed') return Promise.resolve(null)
    const p = new Promise<Loaded | null>(res => {
      const list = this.waiters.get(id) ?? []
      list.push(res)
      this.waiters.set(id, list)
    })
    if (this.status.get(id) === 'queued') this.fetch(id)
    return p
  }

  /** Callback once the asset exists (immediately if already loaded). Never starts a load. */
  when(id: string, fn: (v: Loaded) => void): void {
    const cur = this.data.get(id)
    if (cur) {
      fn(cur)
      return
    }
    const list = this.waiters.get(id) ?? []
    list.push(v => {
      if (v) fn(v)
    })
    this.waiters.set(id, list)
  }

  private limit(): number {
    return this.playing ? this.concurrency.play : this.concurrency.idle
  }

  private pump(force = false): void {
    if (!this.started) return
    if (this.hot && !force) return
    while (this.active < this.limit()) {
      const next = this.manifest.find(e => e.stage <= this.priorityStage && this.status.get(e.id) === 'queued')
      if (!next) return
      this.fetch(next.id)
    }
  }

  private fetch(id: string): void {
    const e = this.byId.get(id)
    if (!e) return
    this.status.set(id, 'loading')
    this.active++
    const job = e.kind === 'image' ? this.loadImage(e.url) : fetch(e.url).then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
    job
      .then(v => {
        this.data.set(id, v)
        this.status.set(id, 'done')
        this.flush(id, v)
      })
      .catch(() => {
        this.status.set(id, 'failed')
        this.flush(id, null)
      })
      .finally(() => {
        this.active--
        for (const fn of this.listeners) fn()
        this.pump()
      })
  }

  private flush(id: string, v: Loaded | null): void {
    const list = this.waiters.get(id)
    this.waiters.delete(id)
    if (list) for (const fn of list) fn(v)
  }

  private loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const im = new Image()
      im.decoding = 'async'
      im.onload = () => {
        if (im.decode) im.decode().then(() => resolve(im), () => resolve(im))
        else resolve(im)
      }
      im.onerror = () => reject(new Error('image ' + url))
      im.src = url
    })
  }
}

export const assets = new Assets()
