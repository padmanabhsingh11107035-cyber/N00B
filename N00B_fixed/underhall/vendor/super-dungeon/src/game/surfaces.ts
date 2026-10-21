import * as THREE from 'three'
import { gltf, texture, type TexOpts } from './assets3d'

/**
 * Per-wing physical surfaces (Poly Haven CC0 texture sets, public/tex/<id>_{diff,nor,arm}.webp)
 * and prop models (public/models/props/<id>.glb). Levels read from here; the streamer preloads
 * the same lists stage by stage so nothing pops in.
 */

export type SurfaceId =
  | 'marble_tiles' | 'painted_plaster_wall' | 'dark_wooden_planks' | 'checkered_pavement_tiles' | 'beige_wall_001'
  | 'floor_tiles_06' | 'floor_tiles_02' | 'rectangular_parquet' | 'red_plaster_weathered' | 'old_wood_floor'
  | 'plaster_stone_wall_01' | 'wood_floor_worn' | 'grey_plaster' | 'laminate_floor' | 'blue_plaster_weathered'
  | 'crepe_satin' | 'caban'

export type PropId =
  | 'schooldesk_01' | 'schoolchair_01' | 'shelf_01' | 'wooden_display_shelves_01' | 'steel_frame_shelves_01'
  | 'book_encyclopedia_set_01' | 'marble_bust_01' | 'vintage_cabinet_01' | 'drawer_cabinet' | 'painted_wooden_bench'
  | 'fancy_picture_frame_01' | 'industrial_wall_lamp'

export type WingLook = {
  floor: SurfaceId
  /** Metres covered by one texture repeat on the floor. */
  floorScale: number
  wall: SurfaceId
  wallScale: number
  /** How strongly the palette colour tints the textures (0 = raw photo texture). */
  tint: number
  /** Environment reflection strength (after-hours interiors stay moody). */
  env: number
  /** Floor gloss multiplier (<1 = shinier, polished). */
  gloss: number
  /** Props that dress wall faces (stand against the wall). */
  wallProps: PropId[]
  /** Wall-mounted pieces (frames, lamps). */
  mounted: PropId[]
}

export const WING_LOOKS: Record<string, WingLook> = {
  hub: { floor: 'marble_tiles', floorScale: 4, wall: 'painted_plaster_wall', wallScale: 3, tint: 0.25, env: 0.47, gloss: 0.9, wallProps: ['painted_wooden_bench', 'marble_bust_01'], mounted: ['fancy_picture_frame_01', 'industrial_wall_lamp'] },
  classrooms: { floor: 'checkered_pavement_tiles', floorScale: 3, wall: 'beige_wall_001', wallScale: 3, tint: 0.35, env: 0.34, gloss: 0.9, wallProps: ['drawer_cabinet'], mounted: ['industrial_wall_lamp'] },
  labs: { floor: 'floor_tiles_06', floorScale: 2, wall: 'floor_tiles_02', wallScale: 2, tint: 0.3, env: 0.42, gloss: 0.9, wallProps: ['steel_frame_shelves_01'], mounted: ['industrial_wall_lamp'] },
  trophy: { floor: 'rectangular_parquet', floorScale: 3, wall: 'red_plaster_weathered', wallScale: 3, tint: 0.2, env: 0.42, gloss: 0.9, wallProps: ['vintage_cabinet_01', 'marble_bust_01'], mounted: ['fancy_picture_frame_01'] },
  library: { floor: 'old_wood_floor', floorScale: 3, wall: 'plaster_stone_wall_01', wallScale: 3, tint: 0.3, env: 0.3, gloss: 0.9, wallProps: ['shelf_01'], mounted: ['industrial_wall_lamp'] },
  stacks: { floor: 'wood_floor_worn', floorScale: 3, wall: 'grey_plaster', wallScale: 3, tint: 0.4, env: 0.26, gloss: 0.9, wallProps: ['shelf_01'], mounted: ['industrial_wall_lamp'] },
  gym: { floor: 'laminate_floor', floorScale: 4, wall: 'blue_plaster_weathered', wallScale: 3, tint: 0.2, env: 0.38, gloss: 0.9, wallProps: ['painted_wooden_bench'], mounted: ['industrial_wall_lamp'] },
}

/** Cover-tile prop models per cover kind (procedural fallback lives in level.ts). */
export const COVER_PROPS: Record<string, PropId[]> = {
  desk: ['schooldesk_01', 'schoolchair_01'],
  bench: ['steel_frame_shelves_01'],
  case: ['wooden_display_shelves_01'],
  shelf: ['shelf_01', 'book_encyclopedia_set_01'],
  mat: [],
}

export const TRIM_SURFACE: SurfaceId = 'dark_wooden_planks'

const COVER_OF: Record<string, string> = { hub: 'bench', classrooms: 'desk', labs: 'bench', trophy: 'case', library: 'shelf', stacks: 'shelf', gym: 'mat' }

export const propPath = (id: PropId) => `models/props/${id}.glb`

/** Everything a wing's level needs loaded: [models, textures]. */
export function wingAssets(wing: string): { models: string[]; textures: Array<[string, TexOpts]> } {
  const look = WING_LOOKS[wing] ?? WING_LOOKS.classrooms
  const props = new Set<PropId>([...look.wallProps, ...look.mounted, ...(COVER_PROPS[COVER_OF[wing] ?? 'desk'] ?? [])])
  const surf = new Set<SurfaceId>([look.floor, look.wall, TRIM_SURFACE])
  const textures: Array<[string, TexOpts]> = []
  for (const id of surf) textures.push(...surfaceTextureList(id, id === look.floor ? look.floorScale : id === look.wall ? look.wallScale : 2))
  return { models: [...props].map(propPath), textures }
}

function surfaceTextureList(id: SurfaceId, _scale: number): Array<[string, TexOpts]> {
  return [[`tex/${id}_diff.webp`, { srgb: true, repeat: 1 }], [`tex/${id}_nor.webp`, { repeat: 1 }], [`tex/${id}_arm.webp`, { repeat: 1 }]]
}

const surfCache = new Map<string, THREE.MeshStandardMaterial>()
/**
 * A tiling PBR surface. Geometry supplies world-space UVs in metres/`scale`, so textures use
 * repeat 1 and stay continuous across tiles. ARM = AO (r) / roughness (g) / metalness (b).
 */
export function surface(id: SurfaceId, o: { tint?: THREE.ColorRepresentation; tintAmount?: number; roughness?: number; vertexColors?: boolean; key?: string; env?: number; minRough?: number } = {}): THREE.MeshStandardMaterial {
  const minRough = o.minRough ?? 0.6
  const key = `${id}|${o.tint ? new THREE.Color(o.tint).getHexString() : ''}|${o.tintAmount ?? 0}|${o.roughness ?? 1}|${o.vertexColors ? 1 : 0}|${o.key ?? ''}|${o.env ?? 1}|${minRough}`
  let m = surfCache.get(key)
  if (!m) {
    const arm = texture(`tex/${id}_arm.webp`, { repeat: 1 })
    m = new THREE.MeshStandardMaterial({
      map: texture(`tex/${id}_diff.webp`, { srgb: true, repeat: 1 }),
      normalMap: texture(`tex/${id}_nor.webp`, { repeat: 1 }),
      roughnessMap: arm,
      aoMap: arm,
      aoMapIntensity: 0.8,
      roughness: o.roughness ?? 1,
      metalness: 0,
      vertexColors: !!o.vertexColors,
      envMapIntensity: o.env ?? 1,
    })
    if (o.tint) m.color.set('#ffffff').lerp(new THREE.Color(o.tint), o.tintAmount ?? 0.3)
    // Anti-glare: glossy texel values never drop below minRough, so point lights and the
    // environment give soft sheens instead of blown-out hotspots.
    m.onBeforeCompile = sh => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n  roughnessFactor = max(roughnessFactor, ${minRough.toFixed(2)});`)
    }
    m.customProgramCacheKey = () => `minrough-${minRough}`
    surfCache.set(key, m)
  }
  return m
}

// ─── Prop models ─────────────────────────────────────────────────────────

export type PropPart = { geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[]; matrix: THREE.Matrix4 }
export type PropModel = { parts: PropPart[]; size: THREE.Vector3; min: THREE.Vector3 }

const propCache = new Map<string, PropModel>()

/** Flattened mesh parts of a loaded prop (null if the GLB isn't loaded). */
export function propModel(id: PropId): PropModel | null {
  const hit = propCache.get(id)
  if (hit) return hit
  const g = gltf(propPath(id))
  if (!g) return null
  const scene = g.scene
  scene.updateMatrixWorld(true)
  const parts: PropPart[] = []
  scene.traverse(o => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    const mats = Array.isArray(m.material) ? m.material : [m.material]
    for (const mm of mats) {
      const s = mm as THREE.MeshStandardMaterial
      if (s.isMeshStandardMaterial) {
        s.envMapIntensity = 0.45
        s.roughness = Math.max(s.roughness, 0.45)
        // Anti-glare: Poly Haven bulbs ship with emissiveStrength 100; keep them a warm glow.
        if (s.emissiveIntensity > 1.2) s.emissiveIntensity = 1.2
        if (s.emissive.getHex() === 0xffffff) s.emissive.set('#ffd9a0')
        const ph = s as THREE.MeshPhysicalMaterial
        if (ph.isMeshPhysicalMaterial) {
          // Transmission forces an extra full-scene render pass every frame; fake glass instead.
          if (ph.transmission > 0) {
            ph.transmission = 0
            ph.transparent = true
            ph.opacity = 0.3
            ph.depthWrite = false
          }
          ph.specularIntensity = Math.min(ph.specularIntensity, 1)
          ph.specularColor.setScalar(Math.min(1, ph.specularColor.r))
        }
        if (/glass/i.test(s.name)) {
          s.transparent = true
          s.opacity = 0.35
          s.roughness = 0.05
          s.depthWrite = false
        }
      }
    }
    parts.push({ geometry: m.geometry, material: m.material, matrix: m.matrixWorld.clone() })
  })
  const box = new THREE.Box3().setFromObject(scene)
  const model = { parts, size: box.getSize(new THREE.Vector3()), min: box.min.clone() }
  propCache.set(id, model)
  return model
}

/** Uniform scale that fits a prop within a footprint (x/z) and optional max height. */
export function fitScale(model: PropModel, footprint: number, maxH = Infinity): number {
  const s = Math.min(footprint / Math.max(model.size.x, model.size.z, 1e-3), maxH / Math.max(model.size.y, 1e-3))
  return Math.min(s, 3)
}

/**
 * Instance a prop at many placements. `placements` are world matrices of the prop's floor pivot;
 * `scale` applies before placement. Returns one InstancedMesh per part.
 */
export function instanceProp(model: PropModel, placements: THREE.Matrix4[], scale: number, shadows = true): THREE.InstancedMesh[] {
  const out: THREE.InstancedMesh[] = []
  if (!placements.length) return out
  const S = new THREE.Matrix4().makeScale(scale, scale, scale)
  const tmp = new THREE.Matrix4()
  for (const part of model.parts) {
    const inst = new THREE.InstancedMesh(part.geometry, part.material, placements.length)
    placements.forEach((p, i) => inst.setMatrixAt(i, tmp.copy(p).multiply(S).multiply(part.matrix)))
    inst.castShadow = shadows
    inst.receiveShadow = true
    inst.computeBoundingSphere()
    out.push(inst)
  }
  return out
}
