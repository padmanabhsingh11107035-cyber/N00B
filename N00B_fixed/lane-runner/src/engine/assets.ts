/**
 * Staggered asset loading.
 *
 * Assets are declared in named groups (boot, sector-0, sector-1, …). `require(group)` loads a group
 * right now at top priority (used for boot and for the current/next sector). `prefetch(groups)`
 * queues everything else for background loading, which pauses whenever the game reports it is
 * busy (heavy frame time, many enemies/particles on screen, boss fights) and resumes when calm.
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { VatLibrary, type ClipName } from '../game/vat'

export type AssetRef =
  | { kind: 'tex'; key: string; url: string; srgb?: boolean; repeat?: boolean; aniso?: number }
  | { kind: 'sfx'; key: string; url: string }
  | { kind: 'clip'; key: ClipName }
  | { kind: 'model'; key: string; url: string }
  /** A whole VAT library (creature mesh + every clip) under `base`. */
  | { kind: 'vat'; key: string; base: string }

interface Entry { ref: AssetRef; state: 'idle' | 'loading' | 'done' | 'error'; promise?: Promise<void>; bytes: number }

export class Assets {
  readonly textures = new Map<string, THREE.Texture>()
  readonly buffers = new Map<string, AudioBuffer>()
  /** Parsed GLB scenes (props). Consumers poll this and swap in real meshes when present. */
  readonly models = new Map<string, THREE.Group>()
  /** Creature VAT libraries, fully loaded. */
  readonly vats = new Map<string, VatLibrary>()
  private gltf?: GLTFLoader
  private entries = new Map<string, Entry>()
  private groups = new Map<string, string[]>()
  private queue: string[] = []
  private active = 0
  private readonly concurrency = 3
  private _busy = false
  /** Called whenever any asset completes (UI progress). */
  onProgress?: (done: number, total: number) => void
  loadedBytes = 0

  constructor(private readonly lib: VatLibrary, private readonly audioCtx: () => BaseAudioContext | null) {}

  private id(ref: AssetRef) { return `${ref.kind}:${ref.key}` }

  define(group: string, refs: AssetRef[]): void {
    const ids: string[] = []
    for (const ref of refs) {
      const id = this.id(ref)
      if (!this.entries.has(id)) {
        this.entries.set(id, { ref, state: 'idle', bytes: 0 })
        if (ref.kind === 'tex') {
          // Create the texture object up front so materials can reference it before it arrives.
          const t = new THREE.Texture()
          if (ref.srgb !== false) t.colorSpace = THREE.SRGBColorSpace
          if (ref.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping
          t.anisotropy = ref.aniso ?? 4
          this.textures.set(ref.key, t)
        }
      }
      ids.push(id)
    }
    this.groups.set(group, [...(this.groups.get(group) ?? []), ...ids])
  }

  tex(key: string): THREE.Texture {
    const t = this.textures.get(key)
    if (!t) throw new Error(`texture not declared: ${key}`)
    return t
  }
  has(kind: AssetRef['kind'], key: string): boolean {
    return this.entries.get(`${kind}:${key}`)?.state === 'done'
  }
  groupReady(group: string): boolean {
    return (this.groups.get(group) ?? []).every(id => this.entries.get(id)!.state === 'done')
  }
  groupProgress(group: string): number {
    const ids = this.groups.get(group) ?? []
    if (!ids.length) return 1
    return ids.filter(id => this.entries.get(id)!.state === 'done').length / ids.length
  }

  /** Load a group immediately (ignores the busy gate). */
  require(group: string): Promise<void> {
    const ids = this.groups.get(group) ?? []
    return Promise.all(ids.map(id => this.start(id))).then(() => undefined)
  }

  /** Queue groups for background loading (in order). */
  prefetch(groups: string[]): void {
    for (const g of groups) for (const id of this.groups.get(g) ?? []) {
      const e = this.entries.get(id)!
      if (e.state === 'idle' && !this.queue.includes(id)) this.queue.push(id)
    }
    this.pump()
  }

  /** The game sets this every frame; background prefetch pauses while busy. */
  set busy(v: boolean) {
    if (this._busy === v) return
    this._busy = v
    if (!v) this.pump()
  }
  get busy() { return this._busy }
  get pending() { return this.queue.length }

  private pump(): void {
    while (!this._busy && this.active < this.concurrency && this.queue.length) {
      const id = this.queue.shift()!
      const e = this.entries.get(id)!
      if (e.state !== 'idle') continue
      this.active++
      this.start(id).finally(() => { this.active--; this.pump() })
    }
  }

  private start(id: string): Promise<void> {
    const e = this.entries.get(id)!
    if (e.promise && e.state !== 'error') return e.promise
    e.state = 'loading'
    e.promise = this.load(e).then(
      () => { e.state = 'done'; this.report() },
      err => { e.state = 'error'; console.warn('asset failed', id, err); this.report() },
    )
    return e.promise
  }

  private report() {
    let done = 0
    for (const e of this.entries.values()) if (e.state === 'done') done++
    this.onProgress?.(done, this.entries.size)
  }

  private async load(e: Entry): Promise<void> {
    const ref = e.ref
    if (ref.kind === 'clip') { await this.lib.load(ref.key); return }
    if (ref.kind === 'vat') {
      const lib = new VatLibrary(ref.base)
      await lib.init()
      await Promise.all([...lib.clips.keys()].map(k => lib.load(k)))
      this.vats.set(ref.key, lib)
      return
    }
    const res = await fetchRetry(ref.url)
    const buf = await res.arrayBuffer()
    e.bytes = buf.byteLength
    this.loadedBytes += buf.byteLength
    if (ref.kind === 'model') {
      this.gltf ??= new GLTFLoader()
      const g = await this.gltf.parseAsync(buf, '')
      this.models.set(ref.key, g.scene)
      return
    }
    if (ref.kind === 'tex') {
      const blob = new Blob([buf], { type: ref.url.endsWith('.png') ? 'image/png' : 'image/webp' })
      const img = await createImageBitmap(blob, { imageOrientation: 'flipY' }).catch(() => null)
      const t = this.textures.get(ref.key)!
      if (img) {
        t.image = img
        t.flipY = false
      } else {
        const el = new Image()
        el.src = URL.createObjectURL(blob)
        await el.decode()
        t.image = el
      }
      t.needsUpdate = true
      return
    }
    const ctx = this.audioCtx()
    if (!ctx) return
    const audio = await ctx.decodeAudioData(buf)
    this.buffers.set(ref.key, audio)
  }
}

async function fetchRetry(url: string, tries = 3): Promise<Response> {
  let last: unknown
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url)
      if (r.ok) return r
      last = new Error(`${url}: ${r.status}`)
    } catch (err) { last = err }
    await new Promise(r => setTimeout(r, 400 * (i + 1)))
  }
  throw last
}
