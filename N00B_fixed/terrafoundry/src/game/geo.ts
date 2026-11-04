import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/** Shared animated time for wind/flicker shaders. */
export const shaderTime = { value: 0 }

const _v = new THREE.Vector3()
const _n = new THREE.Vector3()
const _nm = new THREE.Matrix3()

type ColorFn = (x: number, y: number, z: number, nx: number, ny: number, nz: number) => THREE.Color

/**
 * Accumulates transformed primitive geometries into one vertex-coloured BufferGeometry so a
 * whole chunk of trees and rocks renders in a single draw call.
 */
export class MeshBuilder {
  pos: number[] = []
  nor: number[] = []
  col: number[] = []
  sway: number[] = []
  uv: number[] = []
  idx: number[] = []
  private hasUv = false

  get empty(): boolean {
    return this.pos.length === 0
  }

  /**
   * `opt.uv` maps the geometry's uv into an atlas rect (u0, v0, su, sv).
   * `opt.center` (builder space) replaces normals with a soft spherical normal — used for
   * foliage cards so canopies shade like volumes instead of flat planes.
   */
  add(geo: THREE.BufferGeometry, m: THREE.Matrix4, color: THREE.Color | ColorFn, sway = 0, jitter = 0, rnd?: () => number, opt?: { uv?: readonly number[]; center?: THREE.Vector3; up?: number; swayY?: number }): void {
    const p = geo.getAttribute('position') as THREE.BufferAttribute
    const nAttr = geo.getAttribute('normal') as THREE.BufferAttribute | undefined
    const uvAttr = geo.getAttribute('uv') as THREE.BufferAttribute | undefined
    const r = opt?.uv
    if (r) this.hasUv = true
    const base = this.pos.length / 3
    _nm.getNormalMatrix(m)
    const fixed = color instanceof THREE.Color ? color : null
    const j = jitter && rnd ? 1 + (rnd() - 0.5) * jitter : 1
    for (let i = 0; i < p.count; i++) {
      _v.fromBufferAttribute(p, i).applyMatrix4(m)
      if (opt?.center) {
        _n.subVectors(_v, opt.center).normalize()
        _n.y += opt.up ?? 0.35
        _n.normalize()
      } else if (nAttr) _n.fromBufferAttribute(nAttr, i).applyMatrix3(_nm).normalize()
      else _n.set(0, 1, 0)
      this.pos.push(_v.x, _v.y, _v.z)
      if (uvAttr && r) this.uv.push(r[0] + uvAttr.getX(i) * r[2], r[1] + uvAttr.getY(i) * r[3])
      else this.uv.push(0, 0)
      this.nor.push(_n.x, _n.y, _n.z)
      const c = fixed ?? (color as ColorFn)(_v.x, _v.y, _v.z, _n.x, _n.y, _n.z)
      this.col.push(c.r * j, c.g * j, c.b * j)
      // swayY: sway grows with the vertex's local height (cards bend from the root).
      this.sway.push(opt?.swayY !== undefined ? sway * Math.max(0, p.getY(i) - opt.swayY) : sway)
    }
    const index = geo.getIndex()
    if (index) for (let i = 0; i < index.count; i++) this.idx.push(base + index.getX(i))
    else for (let i = 0; i < p.count; i++) this.idx.push(base + i)
  }

  build(): THREE.BufferGeometry | null {
    if (this.empty) return null
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3))
    g.setAttribute('aSway', new THREE.Float32BufferAttribute(this.sway, 1))
    if (this.hasUv) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2))
    g.setIndex(this.idx)
    g.computeBoundingSphere()
    g.computeBoundingBox()
    return g
  }
}

/** Indexed (vertex-shared) unit icospheres, so displacement keeps surfaces smooth and closed. */
const smoothIco = (detail: number) => {
  const g = new THREE.IcosahedronGeometry(1, detail)
  g.deleteAttribute('normal')
  g.deleteAttribute('uv')
  return mergeVertices(g)
}
export const ICO1 = smoothIco(1)
export const ICO2 = smoothIco(2)
export const ICO3 = smoothIco(3)

/** Organic blob: an icosphere displaced by a few seeded sine waves, then smooth-shaded. */
export function lumpy(base: THREE.BufferGeometry, rnd: () => number, amp: number, freq = 2.2): THREE.BufferGeometry {
  const g = base.clone()
  const p = g.getAttribute('position') as THREE.BufferAttribute
  const waves: number[][] = []
  for (let i = 0; i < 4; i++) {
    const a = rnd() * Math.PI * 2
    const b = Math.acos(rnd() * 2 - 1)
    waves.push([Math.sin(b) * Math.cos(a) * freq * (0.7 + i * 0.45), Math.cos(b) * freq * (0.7 + i * 0.45), Math.sin(b) * Math.sin(a) * freq * (0.7 + i * 0.45), rnd() * 6.28, 1 / (1 + i * 0.8)])
  }
  for (let i = 0; i < p.count; i++) {
    _v.fromBufferAttribute(p, i)
    let d = 0
    for (const [wx, wy, wz, ph, w] of waves) d += Math.sin(_v.x * wx + _v.y * wy + _v.z * wz + ph) * w
    _v.multiplyScalar(1 + d * amp * 0.5)
    p.setXYZ(i, _v.x, _v.y, _v.z)
  }
  g.computeVertexNormals()
  return g
}

/** Standard material with vertex colours and a gentle wind sway driven by the `aSway` attribute. */
export function windMaterial(opts: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0, ...opts })
  mat.onBeforeCompile = shader => {
    shader.uniforms.uTime = shaderTime
    shader.vertexShader = 'attribute float aSway;\nuniform float uTime;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      float sw = aSway * (0.65 + 0.35 * sin(uTime * 0.6 + position.x * 0.04));
      transformed.x += sin(uTime * 1.6 + position.x * 0.33 + position.z * 0.21) * 0.07 * sw;
      transformed.z += cos(uTime * 1.25 + position.z * 0.31 + position.y * 0.2) * 0.055 * sw;`,
    )
  }
  mat.customProgramCacheKey = () => 'wind'
  return mat
}

export const color = (hex: string | number) => new THREE.Color(hex)

/** Canvas-generated tiling textures (no image assets). */
export function canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void, repeat = 1): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  draw(ctx, size)
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(repeat, repeat)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

export function grain(ctx: CanvasRenderingContext2D, size: number, lo: number, hi: number, seed = 1): void {
  let s = seed
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  const img = ctx.getImageData(0, 0, size, size)
  for (let i = 0; i < img.data.length; i += 4) {
    const k = lo + (hi - lo) * rnd()
    img.data[i] *= k
    img.data[i + 1] *= k
    img.data[i + 2] *= k
  }
  ctx.putImageData(img, 0, 0)
}
