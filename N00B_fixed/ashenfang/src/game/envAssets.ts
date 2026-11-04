import * as THREE from 'three'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Where the environment gets streamed textures and catalog models from. Set once at boot
 * (`main.ts`) from the asset loader; the /enemies page and tests may leave it unset, in which
 * case textures are neutral 1×1 placeholders and catalog props fall back to procedural shapes.
 */
export type EnvSource = { texture(key: string): THREE.Texture; gltf(key: string): GLTF | undefined }
let source: EnvSource | null = null
const fallbackTextures = new Map<string, THREE.Texture>()

export function setEnvSource(s: EnvSource): void {
  source = s
}

export function envTexture(key: string): THREE.Texture {
  if (source) return source.texture(key)
  let t = fallbackTextures.get(key)
  if (!t) {
    const normal = /_n$/.test(key)
    t = new THREE.DataTexture(normal ? new Uint8Array([128, 128, 255, 255]) : new Uint8Array([150, 140, 120, 255]), 1, 1)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    if (!normal) t.colorSpace = THREE.SRGBColorSpace
    t.needsUpdate = true
    fallbackTextures.set(key, t)
  }
  return t
}

const baked = new Map<string, THREE.BufferGeometry | null>()

/**
 * Catalog GLBs are meshopt-quantised (normalised int16 positions with the dequantisation folded
 * into the node transform). Bake every mesh into one float geometry in model space so it can be
 * instanced and re-transformed freely. Returns null when the model is not loaded.
 */
export function bakedGeometry(key: string): THREE.BufferGeometry | null {
  if (baked.has(key)) return baked.get(key)!
  const gltf = source?.gltf(key)
  if (!gltf) return null
  gltf.scene.updateMatrixWorld(true)
  const parts: THREE.BufferGeometry[] = []
  gltf.scene.traverse(o => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const src = mesh.geometry
    const g = new THREE.BufferGeometry()
    for (const name of ['position', 'normal', 'uv'] as const) {
      const a = src.getAttribute(name) as THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined
      if (!a) continue
      const out = new Float32Array(a.count * a.itemSize)
      for (let i = 0; i < a.count; i += 1)
        for (let c = 0; c < a.itemSize; c += 1) out[i * a.itemSize + c] = a.getComponent(i, c)
      g.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize))
    }
    if (src.index) g.setIndex(Array.from(src.index.array))
    g.applyMatrix4(mesh.matrixWorld)
    if (!g.getAttribute('normal')) g.computeVertexNormals()
    parts.push(g)
  })
  const geo = parts.length === 1 ? parts[0] : parts.length ? mergeGeometries(parts) : null
  if (geo) {
    // Rest on the ground: shift so the lowest point sits at y = 0 and centre on x/z.
    geo.computeBoundingBox()
    const b = geo.boundingBox!
    geo.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2)
    geo.computeBoundingBox()
    geo.computeBoundingSphere()
  }
  baked.set(key, geo)
  return geo
}
