import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'

/**
 * Runtime cache for glTF models and textures (the realistic asset set under public/models, tex, fx).
 *
 * - Loads are de-duplicated and cached forever (the whole set is a few MB).
 * - `texture()` returns a THREE.Texture synchronously; its image streams in and three.js uploads it
 *   when ready, so materials can be built before a stage finishes preloading.
 * - `preload*()` return promises used by the staged AssetStreamer so a stage only starts once the
 *   meshes and maps it shows are resident.
 */

const BASE = (import.meta.env?.BASE_URL ?? '/').replace(/\/?$/, '/')
export const assetUrl = (p: string): string => BASE + p.replace(/^\//, '')

const loader = new GLTFLoader()
loader.setMeshoptDecoder(MeshoptDecoder)
const gltfPending = new Map<string, Promise<GLTF>>()
const gltfDone = new Map<string, GLTF>()

export function loadGLTF(path: string): Promise<GLTF> {
  let p = gltfPending.get(path)
  if (!p) {
    p = loader.loadAsync(assetUrl(path)).then(g => {
      gltfDone.set(path, g)
      return g
    })
    gltfPending.set(path, p)
    p.catch(() => gltfPending.delete(path))
  }
  return p
}

/** A loaded glTF, or undefined when it has not finished loading (callers fall back). */
export function gltf(path: string): GLTF | undefined {
  return gltfDone.get(path)
}

export type TexOpts = { srgb?: boolean; repeat?: number; flipY?: boolean; aniso?: number }
const texLoader = new THREE.TextureLoader()
const texCache = new Map<string, { tex: THREE.Texture; ready: Promise<THREE.Texture> }>()
let maxAniso = 4

export function setMaxAnisotropy(n: number): void {
  maxAniso = Math.max(1, Math.min(8, n))
}

function texKey(path: string, o: TexOpts): string {
  return `${path}|${o.srgb ? 1 : 0}|${o.repeat ?? 0}|${o.flipY === false ? 0 : 1}`
}

export function texture(path: string, opts: TexOpts = {}): THREE.Texture {
  const key = texKey(path, opts)
  let e = texCache.get(key)
  if (!e) {
    let resolve!: (t: THREE.Texture) => void
    let reject!: (err: unknown) => void
    const ready = new Promise<THREE.Texture>((res, rej) => { resolve = res; reject = rej })
    const tex = texLoader.load(assetUrl(path), t => resolve(t), undefined, err => reject(err))
    tex.colorSpace = opts.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
    tex.flipY = opts.flipY ?? true
    tex.anisotropy = opts.aniso ?? maxAniso
    if (opts.repeat) {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping
      tex.repeat.set(opts.repeat, opts.repeat)
    }
    ready.catch(() => { /* surfaced by preloadTextures */ })
    e = { tex, ready }
    texCache.set(key, e)
  }
  return e.tex
}

export function preloadTexture(path: string, opts: TexOpts = {}): Promise<THREE.Texture> {
  texture(path, opts)
  return texCache.get(texKey(path, opts))!.ready
}

export async function preloadAll(models: string[], textures: Array<[string, TexOpts]> = []): Promise<void> {
  await Promise.all([...models.map(loadGLTF), ...textures.map(([p, o]) => preloadTexture(p, o))])
}

/** JSON sidecar files (variants manifest etc.). */
const jsonCache = new Map<string, Promise<unknown>>()
const jsonDone = new Map<string, unknown>()
export function loadJSON<T>(path: string): Promise<T> {
  let p = jsonCache.get(path)
  if (!p) {
    p = fetch(assetUrl(path)).then(r => {
      if (!r.ok) throw new Error(`${path}: ${r.status}`)
      return r.json()
    }).then(j => {
      jsonDone.set(path, j)
      return j
    })
    jsonCache.set(path, p)
    p.catch(() => jsonCache.delete(path))
  }
  return p as Promise<T>
}
export function json<T>(path: string): T | undefined {
  return jsonDone.get(path) as T | undefined
}
