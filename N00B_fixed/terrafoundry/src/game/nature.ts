import * as THREE from 'three'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { MeshBuilder } from './geo'
import { kitCell } from './materials'

/** Optimized, meshopt-compressed CC0 Quaternius environment bundle loaded by the day stage. */
export const NATURE_URL = './assets/nature/megakit.glb'

const scenes = new Map<string, THREE.Group>()
const white = new THREE.Color(0xffffff)
const bark = new THREE.Color('#e0c2a2')
const leaf = new THREE.Color('#dcebb2')
const pine = new THREE.Color('#b8d39a')
const flora = new THREE.Color('#eaf2c5')
const stone = new THREE.Color('#aaa397')
const berry = new THREE.Color('#fff0ef')
const amber = new THREE.Color('#fff4e2')
const soft = new THREE.Color('#f6f8ee')

export function registerNatureKit(gltf: GLTF): void {
  scenes.clear()
  for (const scene of gltf.scenes) {
    scene.updateMatrixWorld(true)
    const root = scene.children[0]
    const name = root?.name || scene.name
    if (name) scenes.set(name, scene)
  }
}

export function natureReady(): boolean { return scenes.size > 0 }

export type NatureLayers = { main: MeshBuilder; bark: MeshBuilder; leaf: MeshBuilder; rock: MeshBuilder; kit: MeshBuilder }

/** Append a named kit scene to merged world layers; never creates an Object3D/draw call per prop. */
export function appendNature(name: string, B: NatureLayers, matrix: THREE.Matrix4, rnd: () => number, sway = 0): boolean {
  const scene = scenes.get(name)
  if (!scene) return false
  scene.updateMatrixWorld(true)
  scene.traverse(o => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry) return
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const groups = mesh.geometry.groups.length ? mesh.geometry.groups : [{ start: 0, count: mesh.geometry.getIndex()?.count ?? mesh.geometry.getAttribute('position').count, materialIndex: 0 }]
    for (const group of groups) {
      const mat = mats[group.materialIndex ?? 0] as THREE.MeshStandardMaterial | undefined
      const mn = mat?.name || ''
      const g = mesh.geometry.clone()
      g.clearGroups()
      g.setDrawRange(group.start, group.count)
      const world = new THREE.Matrix4().multiplyMatrices(matrix, mesh.matrixWorld)
      const cell = kitCell(mn)
      if (/Bark/i.test(mn)) B.bark.add(g, world, bark, sway * 0.25, 0.05, rnd, { uv: [0, 0, 1, 1] })
      else if (mn === 'Rocks' || !cell) B.rock.add(g, world, stone, 0, 0.05, rnd)
      else {
        // The kit's own cut-out cards. glTF uvs are in [0,1] per source texture; clamp so any
        // slightly out-of-range texel stays inside its atlas cell.
        clampUv(g)
        const solid = mn === 'Mushrooms' || mn === 'PathRocks'
        const tint = mn === 'Flowers' ? (/Bush/.test(name) ? berry : white) : mn === 'Leaves_Pine' ? pine : mn === 'Leaves_TwistedTree' ? amber : mn === 'Leaves' || mn === 'Grass' ? flora : solid ? soft : leaf
        B.kit.add(g, world, tint, solid ? 0 : sway, solid ? 0.04 : 0.06, rnd, { uv: cell, swayY: 0 })
      }
    }
  })
  return true
}

function clampUv(g: THREE.BufferGeometry): void {
  const uv = g.getAttribute('uv') as THREE.BufferAttribute | undefined
  if (!uv) return
  const out = new Float32Array(uv.count * 2)
  for (let i = 0; i < uv.count; i++) {
    out[i * 2] = Math.min(1, Math.max(0, uv.getX(i)))
    out[i * 2 + 1] = Math.min(1, Math.max(0, uv.getY(i)))
  }
  g.setAttribute('uv', new THREE.BufferAttribute(out, 2))
}

const COVER = {
  grass: ['Grass_Common_Short', 'Grass_Wispy_Short', 'Grass_Common_Tall'],
  flower: ['Flower_3_Group', 'Flower_4_Group'],
  fern: ['Fern_1', 'Plant_1', 'Plant_7'],
  clover: ['Clover_1', 'Clover_2'],
  mushroom: ['Mushroom_Common', 'Mushroom_Laetiporus'],
  pebble: ['Pebble_Round_1', 'Pebble_Round_2', 'Pebble_Square_2'],
} as const
export type CoverKind = keyof typeof COVER

export function appendCover(kind: CoverKind, B: NatureLayers, matrix: THREE.Matrix4, variant: number, rnd: () => number): boolean {
  const list = COVER[kind]
  return appendNature(list[Math.abs(variant) % list.length], B, matrix, rnd, kind === 'pebble' || kind === 'mushroom' ? 0 : 1.15)
}

export const natureFallbackColor = white
