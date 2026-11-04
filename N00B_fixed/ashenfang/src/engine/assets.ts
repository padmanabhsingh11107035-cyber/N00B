import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'

/**
 * Staged, pressure-aware asset streaming.
 *
 * Assets are grouped into named bundles (see `game/manifest.ts`). A bundle is requested with a
 * priority: `current` (needed now; may block a loading overlay), `next` (the following stage) or
 * `background` (everything else). A small scheduler runs at most `concurrency` downloads at once,
 * highest priority first. Background work is held back while the game reports pressure (frame
 * time spikes, heavy VFX, a monster in combat range) and resumes after a calm period.
 *
 * Textures are handed out synchronously (`texture(key)`) and fill in when their bundle arrives,
 * so the world can be built before every file is present. Models and audio buffers are only
 * available once loaded (`gltf(key)` / `buffer(key)`).
 */
export type AssetKind = 'texture' | 'gltf' | 'hdr' | 'audio' | 'image'
export type AssetEntry = { key: string; url: string; kind: AssetKind; color?: boolean; kb?: number; required?: boolean; /** false for glTF-convention UVs (catalog models). */ flipY?: boolean }
export type Priority = 'current' | 'next' | 'background'
const PRIORITY: Record<Priority, number> = { current: 0, next: 1, background: 2 }

type Job = { entry: AssetEntry; priority: number; resolve: () => void }
type BundleState = { entries: AssetEntry[]; done: number; promise: Promise<void>; ready: boolean; priority: number }

export class Assets {
  private readonly gltfLoader = new GLTFLoader()
  private readonly hdrLoader = new HDRLoader()
  private readonly imageLoader = new THREE.ImageLoader()
  private readonly textures = new Map<string, THREE.Texture>()
  private readonly loaded = new Map<string, unknown>()
  private readonly inflight = new Map<string, Promise<void>>()
  private readonly queue: Job[] = []
  private readonly bundles = new Map<string, BundleState>()
  private readonly entries = new Map<string, AssetEntry>()
  private readonly failures = new Map<string, unknown>()
  private running = 0
  private pressureUntil = 0
  private listeners = new Set<(name: string, progress: number) => void>()
  concurrency = 4
  /** Set by the audio engine so buffers decode on its context. */
  decodeAudio: ((data: ArrayBuffer) => Promise<AudioBuffer>) | null = null
  /** Log of bundle completions (debug + tests). */
  readonly log: { bundle: string; at: number }[] = []

  constructor(private readonly manifest: Record<string, AssetEntry[]>, private readonly base = '') {
    this.gltfLoader.setMeshoptDecoder(MeshoptDecoder)
    for (const list of Object.values(manifest)) for (const e of list) this.entries.set(e.key, e)
  }

  onProgress(fn: (name: string, progress: number) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  /** Request a bundle. Re-requesting with a higher priority promotes its queued jobs. */
  bundle(name: string, priority: Priority = 'current'): Promise<void> {
    const p = PRIORITY[priority]
    const existing = this.bundles.get(name)
    if (existing) {
      if (p < existing.priority) {
        existing.priority = p
        const keys = new Set(existing.entries.map(e => e.key))
        for (const job of this.queue) if (keys.has(job.entry.key)) job.priority = Math.min(job.priority, p)
        this.pump()
      }
      return existing.promise
    }
    const entries = this.manifest[name]
    if (!entries) return Promise.reject(new Error(`unknown bundle ${name}`))
    const state: BundleState = { entries, done: 0, promise: Promise.resolve(), ready: false, priority: p }
    this.bundles.set(name, state)
    state.promise = Promise.all(
      entries.map(entry =>
        this.request(entry, p).then(() => {
          state.done += 1
          for (const fn of this.listeners) fn(name, state.done / entries.length)
          const failure = this.failures.get(entry.key)
          if (failure !== undefined && entry.required !== false) throw failure instanceof Error ? failure : new Error(String(failure))
        }),
      ),
    ).then(() => {
      state.ready = true
      this.log.push({ bundle: name, at: Math.round(performance.now()) })
    })
    return state.promise
  }

  ready(name: string): boolean {
    return this.bundles.get(name)?.ready ?? false
  }

  requested(name: string): boolean {
    return this.bundles.has(name)
  }

  /** Size-weighted progress across bundles (for loading bars). */
  progressOf(names: string[]): number {
    let total = 0
    let done = 0
    for (const n of names)
      for (const e of this.manifest[n] ?? []) {
        const w = e.kb ?? 40
        total += w
        if (this.loaded.has(e.key)) done += w
      }
    return total ? done / total : 1
  }

  /** Report load pressure; background downloads wait until `calmSeconds` after the last report. */
  pressure(calmSeconds = 3): void {
    this.pressureUntil = Math.max(this.pressureUntil, performance.now() + calmSeconds * 1000)
  }

  get pressured(): boolean {
    return performance.now() < this.pressureUntil
  }

  get pending(): number {
    return this.queue.length + this.running
  }

  /** A texture handle that fills in when its bundle loads (1×1 neutral until then). */
  texture(key: string): THREE.Texture {
    let tex = this.textures.get(key)
    if (!tex) {
      const entry = this.entries.get(key)
      const color = entry?.color !== false
      const data = color ? new Uint8Array([150, 140, 120, 255]) : new Uint8Array([128, 128, 255, 255])
      tex = new THREE.DataTexture(data, 1, 1)
      tex.name = key
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping
      tex.anisotropy = 4
      tex.generateMipmaps = true
      tex.minFilter = THREE.LinearMipmapLinearFilter
      tex.magFilter = THREE.LinearFilter
      if (color) tex.colorSpace = THREE.SRGBColorSpace
      tex.needsUpdate = true
      this.textures.set(key, tex)
    }
    return tex
  }

  gltf(key: string): GLTF {
    const g = this.loaded.get(key) as GLTF | undefined
    if (!g) throw new Error(`model ${key} not loaded`)
    return g
  }

  maybeGltf(key: string): GLTF | undefined {
    return this.loaded.get(key) as GLTF | undefined
  }

  hdr(key: string): THREE.DataTexture | undefined {
    return this.loaded.get(key) as THREE.DataTexture | undefined
  }

  buffer(key: string): AudioBuffer | undefined {
    return this.loaded.get(key) as AudioBuffer | undefined
  }

  has(key: string): boolean {
    return this.loaded.has(key)
  }

  private request(entry: AssetEntry, priority: number): Promise<void> {
    const existing = this.inflight.get(entry.key)
    if (existing) {
      for (const job of this.queue) if (job.entry.key === entry.key) job.priority = Math.min(job.priority, priority)
      this.pump()
      return existing
    }
    const promise = new Promise<void>(resolve => this.queue.push({ entry, priority, resolve }))
    this.inflight.set(entry.key, promise)
    this.pump()
    return promise
  }

  /** Start queued jobs; called every frame so paused background work resumes when calm. */
  pump(): void {
    while (this.running < this.concurrency && this.queue.length) {
      this.queue.sort((a, b) => a.priority - b.priority)
      const job = this.queue[0]
      if (job.priority >= PRIORITY.background && this.pressured) return
      this.queue.shift()
      this.running += 1
      this.load(job.entry)
        .catch(err => {
          this.failures.set(job.entry.key, err)
          console.warn('asset failed', job.entry.url, err)
        })
        // A missing optional asset must never block the game.
        .finally(() => {
          this.running -= 1
          job.resolve()
          this.pump()
        })
    }
  }

  private async load(entry: AssetEntry): Promise<void> {
    const url = entry.url.startsWith('/') ? entry.url : this.base + entry.url
    switch (entry.kind) {
      case 'texture': {
        const img = await this.imageLoader.loadAsync(url)
        const old = this.texture(entry.key)
        // Swap the placeholder's pixel source in place so existing materials pick it up.
        const tex = old as THREE.Texture & { isDataTexture?: boolean }
        // Free the 1×1 GPU allocation first: otherwise the renderer tries a sub-image update into
        // the placeholder's storage (GL_INVALID_VALUE) and keeps showing the placeholder colour.
        tex.dispose()
        tex.image = img
        tex.isDataTexture = false
        tex.flipY = entry.flipY !== false
        tex.needsUpdate = true
        this.loaded.set(entry.key, tex)
        return
      }
      case 'image':
        await this.imageLoader.loadAsync(url)
        this.loaded.set(entry.key, true)
        return
      case 'gltf':
        this.loaded.set(entry.key, await this.gltfLoader.loadAsync(url))
        return
      case 'hdr': {
        const tex = await this.hdrLoader.loadAsync(url)
        tex.mapping = THREE.EquirectangularReflectionMapping
        this.loaded.set(entry.key, tex)
        return
      }
      case 'audio': {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`${res.status}`)
        const data = await res.arrayBuffer()
        if (!this.decodeAudio) return
        this.loaded.set(entry.key, await this.decodeAudio(data))
        return
      }
    }
  }
}
