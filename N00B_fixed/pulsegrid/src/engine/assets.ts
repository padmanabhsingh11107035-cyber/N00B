import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { managedMediaUrl } from './media-url'

/**
 * Staged asset loader.
 *
 * - Assets are declared in named groups (`boot`, `title-music`, `song:<id>`, `extra`).
 * - `load(group)` fetches a group in the foreground (bounded concurrency, progress callback).
 * - `prefetch(groups)` walks later groups one entry at a time in the background, and before each
 *   entry waits until `gate()` says the game is calm (menus, intros, breaks, low VFX load).
 * - Every entry has one shared promise, so a foreground request simply joins an in-flight
 *   background fetch instead of downloading twice. Failed entries retry with backoff.
 */
export type Kind = 'glb' | 'tex' | 'img' | 'audio' | 'bin'
export type Entry = { key: string; url: string; kind: Kind; weight?: number; srgb?: boolean; flipY?: boolean }
type Slot = { entry: Entry; promise?: Promise<unknown>; done: boolean; failed: boolean }

export const assetUrl = managedMediaUrl

export class Assets {
  /** Background prefetch waits while this returns false (set by the game each frame). */
  gate: () => boolean = () => true
  private readonly slots = new Map<string, Slot>()
  private readonly groups = new Map<string, string[]>()
  private readonly data = new Map<string, unknown>()
  private readonly gltf = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
  private readonly texLoader = new THREE.TextureLoader()
  private prefetching = false
  private readonly listeners = new Set<(group: string) => void>()
  maxAnisotropy = 4

  constructor(private readonly audioCtx: BaseAudioContext) {}

  define(group: string, entries: Entry[]): void {
    this.groups.set(group, entries.map((e) => e.key))
    for (const e of entries) if (!this.slots.has(e.key)) this.slots.set(e.key, { entry: e, done: false, failed: false })
  }

  has(key: string): boolean {
    return this.data.has(key)
  }

  get<T>(key: string): T {
    if (!this.data.has(key)) throw new Error(`asset not loaded: ${key}`)
    return this.data.get(key) as T
  }

  tryGet<T>(key: string): T | undefined {
    return this.data.get(key) as T | undefined
  }

  /** Called with a group name whenever a group finishes. */
  onGroupReady(fn: (group: string) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  isReady(group: string): boolean {
    const keys = this.groups.get(group)
    return !!keys && keys.every((k) => this.slots.get(k)!.done)
  }

  /** Weighted progress 0..1 of a group. */
  progress(group: string): number {
    const keys = this.groups.get(group) ?? []
    let total = 0
    let done = 0
    for (const k of keys) {
      const s = this.slots.get(k)!
      const w = s.entry.weight ?? 1
      total += w
      if (s.done) done += w
    }
    return total ? done / total : 1
  }

  /** Foreground load; resolves when every entry of the group is ready. */
  async load(group: string, onProgress?: (p: number) => void, concurrency = 6): Promise<void> {
    const keys = this.groups.get(group)
    if (!keys) throw new Error(`unknown asset group ${group}`)
    const queue = [...keys]
    onProgress?.(this.progress(group))
    const worker = async () => {
      for (;;) {
        const k = queue.shift()
        if (!k) return
        await this.fetchSlot(this.slots.get(k)!)
        onProgress?.(this.progress(group))
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, keys.length) }, worker))
    const failed = keys.filter((k) => this.slots.get(k)!.failed)
    if (failed.length) throw new Error(`failed to load: ${failed.join(', ')}`)
    this.emit(group)
  }

  /** Background, calm-gated, one entry at a time, in group order. */
  prefetch(order: string[]): void {
    if (this.prefetching) return
    this.prefetching = true
    void (async () => {
      for (const group of order) {
        for (const k of this.groups.get(group) ?? []) {
          const slot = this.slots.get(k)!
          if (slot.done) continue
          while (!this.gate()) await sleep(300)
          await this.fetchSlot(slot)
          await sleep(30)
        }
        if (this.isReady(group)) this.emit(group)
      }
      this.prefetching = false
    })()
  }

  private emit(group: string) {
    for (const fn of this.listeners) fn(group)
  }

  private fetchSlot(slot: Slot): Promise<unknown> {
    if (slot.done) return Promise.resolve(this.data.get(slot.entry.key))
    if (slot.promise) return slot.promise
    const run = async () => {
      let lastErr: unknown
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const value = await this.fetchEntry(slot.entry)
          this.data.set(slot.entry.key, value)
          slot.done = true
          slot.failed = false
          return value
        } catch (err) {
          lastErr = err
          await sleep(400 * (attempt + 1))
        }
      }
      slot.failed = true
      slot.promise = undefined
      console.warn('[assets] failed', slot.entry.url, lastErr)
      return undefined
    }
    slot.promise = run()
    return slot.promise
  }

  private async fetchEntry(e: Entry): Promise<unknown> {
    const url = assetUrl(e.url)
    switch (e.kind) {
      case 'glb': {
        const g: GLTF = await this.gltf.loadAsync(url)
        return g
      }
      case 'tex': {
        const t = await this.texLoader.loadAsync(url)
        t.colorSpace = e.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace
        t.flipY = e.flipY ?? true
        t.anisotropy = this.maxAnisotropy
        t.needsUpdate = true
        return t
      }
      case 'img': {
        const img = new Image()
        img.decoding = 'async'
        img.src = url
        await img.decode()
        return img
      }
      case 'audio': {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`${res.status} ${url}`)
        const buf = await res.arrayBuffer()
        return await this.audioCtx.decodeAudioData(buf)
      }
      case 'bin': {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`${res.status} ${url}`)
        return await res.arrayBuffer()
      }
    }
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
