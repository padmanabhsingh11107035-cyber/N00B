import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'

/**
 * Cached asset loading with one progress stream for the boot screen.
 *
 * Gameplay models are registered in `assets.lock.json` and loaded from their stable managed
 * Storage path through this cache. Preload required title/first-play assets in `main.ts` so the
 * boot progress phase covers them; never inline managed binary media into the Web build.
 */
export class Assets {
  private readonly manager = new THREE.LoadingManager()
  private readonly gltfLoader = new GLTFLoader(this.manager)
  private readonly textureLoader = new THREE.TextureLoader(this.manager)
  private readonly cache = new Map<string, Promise<unknown>>()
  private listeners = new Set<(progress: number) => void>()

  constructor() {
    this.manager.onProgress = (_url, loaded, total) => {
      const progress = total > 0 ? loaded / total : 1
      for (const fn of this.listeners) fn(progress)
    }
  }

  onProgress(fn: (progress: number) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  gltf(url: string): Promise<GLTF> {
    return this.memo(url, () => this.gltfLoader.loadAsync(url))
  }

  /** Color textures are tagged sRGB; pass `color: false` for normal/roughness maps. */
  texture(url: string, { color = true, repeat }: { color?: boolean; repeat?: number } = {}): Promise<THREE.Texture> {
    return this.memo(`${url}#${color}#${repeat ?? 1}`, async () => {
      const tex = await this.textureLoader.loadAsync(url)
      if (color) tex.colorSpace = THREE.SRGBColorSpace
      if (repeat) {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping
        tex.repeat.set(repeat, repeat)
      }
      return tex
    })
  }

  private memo<T>(key: string, load: () => Promise<T>): Promise<T> {
    let pending = this.cache.get(key) as Promise<T> | undefined
    if (!pending) {
      pending = load()
      this.cache.set(key, pending)
      pending.catch(() => this.cache.delete(key))
    }
    return pending
  }
}
