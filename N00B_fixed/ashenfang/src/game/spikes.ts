import * as THREE from 'three'
import { envTexture } from './envAssets'
import { heightAt, normalAt } from './terrain'

/**
 * Ground-eruption spikes for the Rupture attacks: gnarled roots (Mossback), obsidian shards
 * (Ashwing) and coral lances (Tidehorn). One instanced mesh per theme; each spike bursts out of
 * the ground with an overshoot, trembles, then sinks back in. Nothing allocates per frame.
 */
export type SpikeTheme = 'root' | 'obsidian' | 'coral'

type Spike = {
  alive: boolean
  t: number
  hold: number
  pos: THREE.Vector3
  quat: THREE.Quaternion
  w: number
  h: number
}

const RISE = 0.13
const SINK = 0.5
const MAX = 120

function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

/** Faceted tapered shard with ring-wise lumps; `bend` curls it like a root. */
function shardGeometry(sides: number, bend: number, lump: number, seed: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.03, 1, 1, sides, 6, false)
  g.translate(0, 0.5, 0)
  const pos = g.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i += 1) {
    const y = pos.getY(i)
    const ring = Math.round(y * 6)
    const k = 1 + (hash(ring * 13 + seed) - 0.5) * lump * (1 - y)
    const x = pos.getX(i) * k + bend * y * y
    const z = pos.getZ(i) * k + bend * 0.4 * Math.sin(y * 3)
    pos.setXYZ(i, x, y, z)
  }
  g.computeVertexNormals()
  return g
}

const CORAL = ['#c8715a', '#d68f6d', '#a9533f', '#4faea4', '#b88a68']

/**
 * Adds a geometry-space height varying (0 at the ground, 1 at the tip) so spike materials can grade
 * colour and emission along their length. `diffuse` runs after the map; `emissive` after emissive.
 */
function graded(key: string, m: THREE.MeshStandardMaterial, diffuse: string, emissive: string): THREE.MeshStandardMaterial {
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vSpikeY;\nvarying vec3 vSpikeP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSpikeY = clamp(position.y, 0.0, 1.0);\nvSpikeP = position;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vSpikeY;\nvarying vec3 vSpikeP;')
      .replace('#include <map_fragment>', '#include <map_fragment>' + diffuse)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>' + emissive)
  }
  m.customProgramCacheKey = () => 'spike:' + key
  return m
}

export class GroundSpikes {
  private meshes = new Map<SpikeTheme, THREE.InstancedMesh>()
  private pools = new Map<SpikeTheme, Spike[]>()
  private readonly m = new THREE.Matrix4()
  private readonly s = new THREE.Vector3()
  private readonly p = new THREE.Vector3()
  private readonly q = new THREE.Quaternion()
  private readonly n = new THREE.Vector3()
  private readonly c = new THREE.Color()

  constructor(scene: THREE.Scene) {
    const bark = envTexture('tex.bark_d')
    const rock = envTexture('tex.rock_face1_d')
    const mats: Record<SpikeTheme, THREE.MeshStandardMaterial> = {
      // Earthy roots: darker, damp base fading to dry bark near the tips.
      root: graded('root', new THREE.MeshStandardMaterial({ map: bark, color: '#d8bc90', roughness: 0.92, metalness: 0, envMapIntensity: 0.6 }), `
        diffuseColor.rgb *= mix(0.6, 1.1, smoothstep(0.0, 0.45, vSpikeY));`, ''),
      // Volcanic glass: black glossy tips, a molten root and hairline ember cracks.
      obsidian: graded('obsidian', new THREE.MeshStandardMaterial({ color: '#17110f', roughness: 0.2, metalness: 0.0, envMapIntensity: 0.45, flatShading: true, emissive: new THREE.Color('#ff5a18'), emissiveIntensity: 1 }), '', `
        float crack = smoothstep(0.93, 1.0, abs(sin(vSpikeY * 23.0 + vSpikeP.x * 9.0 + vSpikeP.z * 7.0)));
        float root = smoothstep(0.42, 0.0, vSpikeY);
        totalEmissiveRadiance *= root * 1.35 + crack * (1.0 - vSpikeY) * 0.9;`),
      // Reef coral: porous rock detail tinted per instance, bioluminescent tips.
      coral: graded('coral', new THREE.MeshStandardMaterial({ map: rock, color: '#ffffff', roughness: 0.82, metalness: 0, envMapIntensity: 0.3, emissive: new THREE.Color('#4fe3d4'), emissiveIntensity: 1 }), `
        diffuseColor.rgb *= mix(0.8, 1.35, smoothstep(0.0, 0.7, vSpikeY));`, `
        totalEmissiveRadiance *= smoothstep(0.72, 1.0, vSpikeY) * 0.55;`),
    }
    const geos: Record<SpikeTheme, THREE.BufferGeometry> = {
      root: shardGeometry(7, 0.35, 0.5, 3),
      obsidian: shardGeometry(5, 0.05, 0.35, 11),
      coral: shardGeometry(6, 0.18, 0.6, 7),
    }
    for (const theme of ['root', 'obsidian', 'coral'] as SpikeTheme[]) {
      const mesh = new THREE.InstancedMesh(geos[theme], mats[theme], MAX)
      mesh.count = 0
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.frustumCulled = false
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      scene.add(mesh)
      this.meshes.set(theme, mesh)
      this.pools.set(
        theme,
        Array.from({ length: MAX }, () => ({ alive: false, t: 0, hold: 1, pos: new THREE.Vector3(), quat: new THREE.Quaternion(), w: 1, h: 1 })),
      )
      if (theme === 'coral') {
        const palette = CORAL
        for (let i = 0; i < MAX; i += 1) mesh.setColorAt(i, this.c.set(palette[i % palette.length]))
        mesh.instanceColor!.needsUpdate = true
      }
    }
  }

  /** Erupt a cluster of `count` spikes around `at` (roughly `radius` wide, `height` tall). */
  burst(at: THREE.Vector3, theme: SpikeTheme, count: number, radius: number, height: number): void {
    const pool = this.pools.get(theme)!
    for (let i = 0; i < count; i += 1) {
      const s = pool.find(x => !x.alive) ?? pool.reduce((a, b) => (a.t > b.t ? a : b))
      const a = Math.random() * Math.PI * 2
      const d = i === 0 ? 0 : radius * (0.35 + Math.random() * 0.65)
      s.pos.set(at.x + Math.cos(a) * d, 0, at.z + Math.sin(a) * d)
      s.pos.y = heightAt(s.pos.x, s.pos.z) - 0.25
      const nrm = normalAt(s.pos.x, s.pos.z)
      this.n.set(nrm.x, nrm.y, nrm.z)
      // Lean outward from the cluster centre, with a random twist.
      const lean = i === 0 ? 0.08 : 0.25 + Math.random() * 0.35
      this.p.set(Math.cos(a) * lean, 1, Math.sin(a) * lean).add(this.n).normalize()
      s.quat.setFromUnitVectors(UP, this.p)
      this.q.setFromAxisAngle(UP, Math.random() * Math.PI * 2)
      s.quat.multiply(this.q)
      const big = i === 0 ? 1.25 : 0.55 + Math.random() * 0.5
      s.h = height * big
      s.w = s.h * (theme === 'obsidian' ? 0.2 : theme === 'coral' ? 0.13 : 0.16) * (0.8 + Math.random() * 0.4)
      s.t = 0
      s.hold = 0.75 + Math.random() * 0.5
      s.alive = true
    }
  }

  clear(): void {
    for (const pool of this.pools.values()) for (const s of pool) s.alive = false
    for (const mesh of this.meshes.values()) mesh.count = 0
  }

  update(dt: number): void {
    for (const [theme, mesh] of this.meshes) {
      const pool = this.pools.get(theme)!
      let n = 0
      for (let i = 0; i < pool.length; i += 1) {
        const s = pool[i]
        if (!s.alive) continue
        s.t += dt
        const end = RISE + s.hold + SINK
        if (s.t >= end) {
          s.alive = false
          continue
        }
        let grow: number
        let sink = 0
        if (s.t < RISE) {
          // Back-out ease: overshoot then settle, so each spike punches out of the earth.
          const k = s.t / RISE
          const c = 2.2
          grow = 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2)
        } else if (s.t < RISE + s.hold) {
          grow = 1 + Math.sin((s.t - RISE) * 38) * 0.02 * Math.max(0, 1 - (s.t - RISE) * 3)
        } else {
          grow = 1
          const k = (s.t - RISE - s.hold) / SINK
          sink = k * k * s.h * 1.05
        }
        this.p.copy(s.pos)
        this.p.y -= sink
        this.s.set(s.w, s.h * Math.max(0.02, grow), s.w)
        this.m.compose(this.p, s.quat, this.s)
        mesh.setMatrixAt(n, this.m)
        if (theme === 'coral') mesh.setColorAt(n, this.c.set(CORAL[i % CORAL.length]))
        n += 1
      }
      mesh.count = n
      mesh.instanceMatrix.needsUpdate = true
      if (theme === 'coral' && mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
  }

  get active(): number {
    let n = 0
    for (const mesh of this.meshes.values()) n += mesh.count
    return n
  }
}

const UP = new THREE.Vector3(0, 1, 0)
