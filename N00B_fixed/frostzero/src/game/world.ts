import * as THREE from 'three'
import { CONFIG } from './config'
import { railY, slopeY, topAt, type Hazard, type Level, type Platform } from './level'
import { hazardPose, platformX, type Pose, type SimState } from './sim'

/**
 * Everything static-ish in the world, built once from the level data: sky, canyon, decks,
 * hazards, rails, pads, gates, the avalanche and weather. `update()` animates moving parts from
 * the simulation clock so visuals always match collision.
 */
const lin = (r: number, g: number, b: number) => new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace)
export const FOG = lin(0.2, 0.17, 0.5)

function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d')!)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

/** A deck-like slab whose top follows y0→y1 along its length. */
function slab(w: number, thick: number, len: number, y0: number, y1: number, segZ = 1): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, 1, len, 1, 1, segZ)
  const pos = g.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i += 1) {
    const t = (pos.getZ(i) + len / 2) / len
    const top = y0 + (y1 - y0) * t
    pos.setY(i, pos.getY(i) > 0 ? top : top - thick)
  }
  g.computeVertexNormals()
  g.computeBoundingSphere()
  return g
}

type HazardView = { h: Hazard; obj: THREE.Object3D; beam?: THREE.Mesh[]; pose: Pose }
type PlatView = { p: Platform; group: THREE.Group; mats: THREE.Material[] }
type GateView = { index: number; mats: THREE.MeshBasicMaterial[] }

export class World {
  readonly scene = new THREE.Scene()
  readonly sun: THREE.DirectionalLight
  private readonly sky: THREE.Mesh
  private readonly skyMat: THREE.ShaderMaterial
  private readonly hazards: HazardView[] = []
  private readonly moving: PlatView[] = []
  private readonly crumbles: PlatView[] = []
  private readonly gates: GateView[] = []
  private readonly padTex: THREE.CanvasTexture
  private readonly wall: THREE.Group
  /** Track objects bucketed into 100 m chunks; only chunks near the rider are drawn. */
  private readonly chunks = new Map<number, THREE.Group>()
  private readonly wallMat: THREE.ShaderMaterial
  private readonly boulders: THREE.InstancedMesh
  private readonly snow: THREE.Points
  private readonly finishGlow: THREE.MeshBasicMaterial
  private time = 0
  private readonly dummy = new THREE.Object3D()

  constructor(private readonly level: Level, shadowMapSize: number) {
    const scene = this.scene
    scene.fog = new THREE.Fog(FOG, 70, 520)
    scene.background = FOG

    // ── Sky: gradient, aurora, stars, moon ────────────────────────────────
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uHorizon: { value: new THREE.Vector3(FOG.r, FOG.g, FOG.b) } },
      vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform vec3 uHorizon; varying vec3 vDir;
        float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        void main(){
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 top = vec3(0.004, 0.006, 0.03);
          vec3 mid = vec3(0.035, 0.03, 0.14);
          vec3 col = mix(uHorizon, mid, smoothstep(-0.02, 0.22, h));
          col = mix(col, top, smoothstep(0.22, 0.75, h));
          col += vec3(0.05, 0.35, 0.55) * pow(1.0 - clamp(abs(h), 0.0, 1.0), 14.0) * 0.5;
          float wave = sin(d.x * 5.0 + uTime * 0.12 + sin(d.z * 3.0 + uTime * 0.08) * 2.2);
          float band = smoothstep(0.16, 0.0, abs(h - 0.3 - 0.07 * wave));
          float curtain = 0.55 + 0.45 * sin(d.x * 38.0 + d.z * 22.0 + uTime * 0.6);
          vec3 aur = mix(vec3(0.05, 0.9, 0.55), vec3(0.6, 0.2, 1.0), 0.5 + 0.5 * sin(d.x * 2.5 + uTime * 0.15));
          col += band * curtain * aur * 0.35;
          vec3 sp = floor(d * 260.0);
          float s = hash(sp);
          col += step(0.9972, s) * smoothstep(0.04, 0.35, h) * (0.5 + 0.5 * sin(uTime * 2.0 + s * 80.0)) * vec3(0.9, 0.95, 1.0);
          vec3 md = normalize(vec3(-0.45, 0.36, 1.0));
          float m = dot(d, md);
          col += smoothstep(0.9982, 0.9988, m) * vec3(1.2, 1.15, 1.25);
          col += pow(max(m, 0.0), 90.0) * vec3(0.25, 0.3, 0.7);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    })
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), this.skyMat)
    this.sky.frustumCulled = false
    this.sky.renderOrder = -10
    scene.add(this.sky)

    // ── Lights ─────────────────────────────────────────────────────────────
    scene.add(new THREE.HemisphereLight(0xc4dcff, 0x2b1c63, 1.35))
    this.sun = new THREE.DirectionalLight(0xe4ecff, 2.1)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(shadowMapSize, shadowMapSize)
    const sc = this.sun.shadow.camera
    sc.left = -34
    sc.right = 34
    sc.top = 34
    sc.bottom = -34
    sc.near = 1
    sc.far = 180
    this.sun.shadow.bias = -0.0006
    this.sun.shadow.normalBias = 0.04
    scene.add(this.sun, this.sun.target)
    const rim = new THREE.DirectionalLight(0x5fd8ff, 0.9)
    rim.position.set(20, 10, -30)
    scene.add(rim)

    // ── Shared materials and textures ─────────────────────────────────────
    const snowTop = new THREE.MeshStandardMaterial({ color: 0xeaf3ff, roughness: 0.82, metalness: 0, flatShading: true })
    // Groomed snow in world space: fine corduroy along the run and a cross band every 4 m, so the
    // ground visibly streams past at speed regardless of how each deck's UVs are laid out.
    snowTop.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGroomPos;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGroomPos = (modelMatrix * vec4(transformed, 1.0)).xyz;')
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGroomPos;')
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float cord = 0.5 + 0.5 * sin(vGroomPos.x * 28.0);
          diffuseColor.rgb *= 1.0 - 0.07 * cord;
          float band = fract(vGroomPos.z / 4.0);
          float line = smoothstep(0.0, 0.03, band) * (1.0 - smoothstep(0.1, 0.16, band));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.55, 0.72, 1.0), line * 0.5);
          float streak = step(0.965, fract(sin(floor(vGroomPos.x * 1.3) * 91.7) * 43758.5));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.7, 0.95, 1.0), streak * 0.35);`,
        )
    }
    const iceSide = new THREE.MeshStandardMaterial({ color: 0x5f8cf0, roughness: 0.28, metalness: 0.08, emissive: 0x15247a, emissiveIntensity: 0.55, flatShading: true })
    const rootMat = new THREE.MeshStandardMaterial({ color: 0x4a5fd0, roughness: 0.35, emissive: 0x10165a, emissiveIntensity: 0.6, flatShading: true })
    const crackTex = canvasTexture(256, 256, g => {
      g.fillStyle = '#d6f6ff'
      g.fillRect(0, 0, 256, 256)
      const r = rng(9)
      g.strokeStyle = 'rgba(40,140,220,0.85)'
      for (let i = 0; i < 16; i += 1) {
        g.lineWidth = 1 + r() * 2.5
        g.beginPath()
        let x = r() * 256
        let y = r() * 256
        g.moveTo(x, y)
        for (let k = 0; k < 5; k += 1) {
          x += (r() - 0.5) * 90
          y += (r() - 0.5) * 90
          g.lineTo(x, y)
        }
        g.stroke()
      }
    })
    crackTex.wrapS = crackTex.wrapT = THREE.RepeatWrapping
    const stripeTex = canvasTexture(128, 128, g => {
      g.fillStyle = '#2a0707'
      g.fillRect(0, 0, 128, 128)
      g.fillStyle = '#ff4a1c'
      for (let i = -128; i < 256; i += 44) {
        g.beginPath()
        g.moveTo(i, 0)
        g.lineTo(i + 22, 0)
        g.lineTo(i + 22 + 128, 128)
        g.lineTo(i + 128, 128)
        g.fill()
      }
    })
    stripeTex.wrapS = stripeTex.wrapT = THREE.RepeatWrapping
    const hazardMat = new THREE.MeshStandardMaterial({ color: 0xff3a1a, emissive: 0xff2400, emissiveIntensity: 1.35, roughness: 0.3, metalness: 0.1, flatShading: true })
    const hazardDark = new THREE.MeshStandardMaterial({ color: 0x3a0d18, emissive: 0x5a0710, emissiveIntensity: 0.6, roughness: 0.5, flatShading: true })
    const metal = new THREE.MeshStandardMaterial({ color: 0x232a5c, roughness: 0.45, metalness: 0.6, emissive: 0x0a0e30, emissiveIntensity: 0.5 })
    const glowRed = new THREE.MeshBasicMaterial({ color: 0xff5a2a, toneMapped: false })
    const edgeColor: Record<string, number> = { ice: 0x74f2ff, bridge: 0x74f2ff, ramp: 0xffe27a, safe: 0xb88cff, crumble: 0xbffcff, finish: 0xffd35c }

    // ── Decks ──────────────────────────────────────────────────────────────
    const postSpots: [number, number, number, number][] = []
    const archSpots: [number, number, number, number][] = []
    const roots = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 5, 1), rootMat, 400)
    let rootCount = 0
    const r = rng(42)
    for (const p of level.platforms) {
      const len = p.z1 - p.z0
      const group = new THREE.Group()
      group.position.set(p.x, 0, (p.z0 + p.z1) / 2)
      const crumble = p.kind === 'crumble'
      const top = crumble
        ? new THREE.MeshStandardMaterial({ color: 0xc6f4ff, map: crackTex, roughness: 0.15, metalness: 0.05, emissive: 0x2a9ce0, emissiveIntensity: 0.35, transparent: true, opacity: 0.92 })
        : snowTop
      const side = crumble ? new THREE.MeshStandardMaterial({ color: 0x8fd8ff, roughness: 0.1, emissive: 0x1d6ac0, emissiveIntensity: 0.5, transparent: true, opacity: 0.8, flatShading: true }) : iceSide
      const deck = new THREE.Mesh(slab(p.w, p.thick, len, p.y0, p.y1, Math.max(1, Math.round(len / 40))), [side, side, top, side, side, side])
      deck.receiveShadow = true
      deck.castShadow = p.kind !== 'finish'
      group.add(deck)
      const edgeMat = new THREE.MeshBasicMaterial({ color: p.move ? 0xff5fe0 : edgeColor[p.kind], toneMapped: false, transparent: true })
      for (const sx of [-1, 1]) {
        const e = new THREE.Mesh(slab(0.16, 0.16, len, p.y0 + 0.08, p.y1 + 0.08), edgeMat)
        e.position.x = (sx * p.w) / 2
        group.add(e)
      }
      for (const [zz, yy] of [[-len / 2, p.y0], [len / 2, p.y1]] as const) {
        const e = new THREE.Mesh(new THREE.BoxGeometry(p.w + 0.16, 0.16, 0.16), edgeMat)
        e.position.set(0, yy + 0.08 - 0.0, zz)
        group.add(e)
      }
      const view: PlatView = { p, group, mats: [top, side, edgeMat] }
      // Jagged ice roots hanging under the deck.
      const n = Math.max(1, Math.round(len / 14))
      for (let i = 0; i < n; i += 1) {
        const zc = p.z0 + ((i + 0.5) * len) / n
        const depth = (crumble ? 3 : 6) + r() * (crumble ? 3 : 12)
        const bottom = topAt(p, zc) - p.thick
        if (p.move || crumble) {
          const cone = new THREE.Mesh(roots.geometry, crumble ? side : rootMat)
          cone.position.set((r() - 0.5) * p.w * 0.3, bottom - depth / 2, zc - group.position.z)
          cone.scale.set(p.w * 0.42, depth, Math.min(len / n, 12) * 0.42)
          cone.rotation.set(Math.PI, r() * 6, 0)
          group.add(cone)
        } else if (rootCount < 400) {
          this.dummy.position.set(p.x + (r() - 0.5) * p.w * 0.35, bottom - depth / 2 + 0.2, zc)
          this.dummy.rotation.set(Math.PI, r() * 6, 0)
          this.dummy.scale.set(p.w * (0.35 + r() * 0.2), depth, Math.min(len / n, 14) * (0.4 + r() * 0.15))
          this.dummy.updateMatrix()
          roots.setMatrixAt(rootCount++, this.dummy.matrix)
        }
      }
      if (p.move) this.moving.push(view)
      if (crumble) this.crumbles.push(view)
      scene.add(group)
      if (!p.move && !crumble && p.kind !== 'finish') {
        // Marker stakes just outside both edges: close lateral objects give strong parallax.
        for (let z = p.z0 + 2; z < p.z1 - 1; z += 6) {
          for (const sx of [-1, 1]) postSpots.push([p.x + sx * (p.w / 2 + 0.45), topAt(p, z), z, sx])
        }
        // Neon arches over long open decks, kept clear of hazards so they never read as danger.
        if (p.w >= 5 && len > 36) {
          for (let z = p.z0 + 14; z < p.z1 - 10; z += 44) {
            const clear = level.hazards.every(h => Math.abs(h.z - z) > h.hz + 9)
            if (clear) archSpots.push([p.x, topAt(p, z), z, p.w])
          }
        }
      }
    }
    roots.count = rootCount
    roots.instanceMatrix.needsUpdate = true
    roots.computeBoundingSphere()
    scene.add(roots)
    {
      const postGeo = new THREE.BoxGeometry(0.12, 1.1, 0.12)
      postGeo.translate(0, 0.55, 0)
      const posts = new THREE.InstancedMesh(postGeo, new THREE.MeshStandardMaterial({ color: 0x2a3070, roughness: 0.4, metalness: 0.5 }), postSpots.length)
      const capGeo = new THREE.BoxGeometry(0.16, 0.26, 0.16)
      capGeo.translate(0, 1.2, 0)
      const caps = new THREE.InstancedMesh(capGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), postSpots.length)
      const cA = new THREE.Color(0x5ff3ff)
      const cB = new THREE.Color(0xff5fe0)
      postSpots.forEach(([x, y, z, sx], i) => {
        this.dummy.position.set(x, y, z)
        this.dummy.rotation.set(0, 0, sx * 0.08)
        this.dummy.scale.set(1, 1, 1)
        this.dummy.updateMatrix()
        posts.setMatrixAt(i, this.dummy.matrix)
        caps.setMatrixAt(i, this.dummy.matrix)
        caps.setColorAt(i, Math.floor(z / 6) % 2 === 0 ? cA : cB)
      })
      posts.computeBoundingSphere()
      caps.computeBoundingSphere()
      scene.add(posts, caps)
      const archGeo = new THREE.TorusGeometry(1, 0.035, 4, 28, Math.PI)
      const arches = new THREE.InstancedMesh(archGeo, new THREE.MeshBasicMaterial({ color: 0x7ff7ff, toneMapped: false, transparent: true, opacity: 0.85 }), Math.max(1, archSpots.length))
      archSpots.forEach(([x, y, z, w], i) => {
        this.dummy.position.set(x, y, z)
        this.dummy.rotation.set(0, 0, 0)
        const r = w / 2 + 1.2
        this.dummy.scale.set(r, Math.max(6.5, r * 0.85), r)
        this.dummy.updateMatrix()
        arches.setMatrixAt(i, this.dummy.matrix)
      })
      arches.count = archSpots.length
      arches.computeBoundingSphere()
      scene.add(arches)
    }

    // ── Boost pads (animated chevrons) ────────────────────────────────────
    this.padTex = canvasTexture(128, 256, g => {
      g.clearRect(0, 0, 128, 256)
      g.strokeStyle = '#ffffff'
      g.lineWidth = 16
      g.lineCap = 'round'
      g.lineJoin = 'round'
      // The pad plane lies flat with the canvas top toward -z (behind the rider), so the
      // chevron apex is drawn at the bottom to point down the course (+z).
      for (const y of [40, 168]) {
        g.beginPath()
        g.moveTo(20, y)
        g.lineTo(64, y + 60)
        g.lineTo(108, y)
        g.stroke()
      }
    })
    this.padTex.wrapT = THREE.RepeatWrapping
    for (const pad of level.pads) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x57f4ff, map: this.padTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
      this.padTex.repeat.set(1, pad.len / 3)
      const geo = new THREE.PlaneGeometry(pad.w, pad.len)
      geo.rotateX(-Math.PI / 2)
      geo.rotateX(Math.atan(CONFIG.sim.grade))
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(pad.x, pad.y + 0.06, pad.z)
      scene.add(mesh)
      const base = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x0b3b66, transparent: true, opacity: 0.7, depthWrite: false }))
      base.position.set(pad.x, pad.y + 0.04, pad.z)
      scene.add(base)
    }

    // ── Rails ──────────────────────────────────────────────────────────────
    const railMat = new THREE.MeshBasicMaterial({ color: 0xff6af0, toneMapped: false })
    const railCore = new THREE.MeshStandardMaterial({ color: 0xdfe6ff, metalness: 0.8, roughness: 0.2 })
    for (const rl of level.rails) {
      const a = new THREE.Vector3(rl.x, rl.y0, rl.z0)
      const b = new THREE.Vector3(rl.x, rl.y1, rl.z1)
      const dir = b.clone().sub(a)
      const len = dir.length()
      for (const [rad, mat] of [[0.09, railCore], [0.16, railMat]] as const) {
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, len, 10, 1), mat)
        tube.position.copy(a).add(b).multiplyScalar(0.5)
        tube.position.y -= mat === railMat ? 0.1 : 0
        tube.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize())
        if (mat === railMat) tube.scale.set(1, 1, 0.5)
        scene.add(tube)
      }
      for (let z = rl.z0 + 4; z < rl.z1; z += 14) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 26, 6), metal)
        post.position.set(rl.x, railY(rl, z) - 13.2, z)
        scene.add(post)
      }
    }

    // ── Hazards ────────────────────────────────────────────────────────────
    for (const h of level.hazards) this.hazards.push(this.buildHazard(h, { hazardMat, hazardDark, metal, glowRed, stripeTex }))

    // ── Checkpoint gates and the finish arch ─────────────────────────────
    level.checkpoints.forEach((c, index) => {
      const deck = level.platforms.find(p => c.z >= p.z0 && c.z <= p.z1 && Math.abs(c.x - p.x) <= p.w / 2)!
      const half = deck.w / 2 + 0.5
      const mats: THREE.MeshBasicMaterial[] = []
      const group = new THREE.Group()
      group.position.set(c.x, c.y, c.z)
      for (const sx of [-1, 1]) {
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.7, 7, 0.7), metal)
        pillar.position.set(sx * half, 3.5, 0)
        pillar.castShadow = true
        group.add(pillar)
        const m = new THREE.MeshBasicMaterial({ color: 0x74f2ff, toneMapped: false })
        mats.push(m)
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.2, 6.4, 0.78), m)
        strip.position.set(sx * (half - 0.3), 3.5, 0)
        group.add(strip)
      }
      const beamMat = new THREE.MeshBasicMaterial({ color: 0x74f2ff, toneMapped: false, transparent: true, opacity: 0.9 })
      mats.push(beamMat)
      const beam = new THREE.Mesh(new THREE.BoxGeometry(half * 2 + 0.7, 0.35, 0.35), beamMat)
      beam.position.y = 7
      group.add(beam)
      scene.add(group)
      this.gates.push({ index, mats })
    })
    const finishDeck = level.platforms[level.platforms.length - 1]
    const fy = topAt(finishDeck, level.finishZ)
    const finish = new THREE.Group()
    finish.position.set(0, fy, level.finishZ)
    this.finishGlow = new THREE.MeshBasicMaterial({ color: 0xffd35c, toneMapped: false })
    for (const sx of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 13, 1.4), metal)
      pillar.position.set(sx * 11, 6.5, 0)
      finish.add(pillar)
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.3, 12, 1.5), this.finishGlow)
      strip.position.set(sx * 10.4, 6.5, 0)
      finish.add(strip)
    }
    const banner = canvasTexture(1024, 160, g => {
      g.fillStyle = '#10143a'
      g.fillRect(0, 0, 1024, 160)
      for (let i = 0; i < 32; i += 1) {
        g.fillStyle = i % 2 ? '#ffd35c' : '#10143a'
        g.fillRect(i * 32, 0, 32, 16)
        g.fillStyle = i % 2 ? '#10143a' : '#ffd35c'
        g.fillRect(i * 32, 144, 32, 16)
      }
      g.fillStyle = '#fff4d0'
      g.font = '900 88px Sora, "Noto Sans SC", sans-serif'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText('FINISH · 终点', 512, 82)
    })
    const bannerMesh = new THREE.Mesh(new THREE.PlaneGeometry(22, 3.4), new THREE.MeshBasicMaterial({ map: banner, toneMapped: false, side: THREE.DoubleSide }))
    bannerMesh.position.y = 12
    // PlaneGeometry faces +z; the rider approaches from -z, so turn the text toward them.
    bannerMesh.rotation.y = Math.PI
    finish.add(bannerMesh)
    scene.add(finish)

    // ── Canyon: cliffs, far mountains, glowing crystals, abyss floor ─────
    const cliffGeo = new THREE.IcosahedronGeometry(1, 0)
    const cliffMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, metalness: 0.05, flatShading: true, emissive: 0x0b0f3a, emissiveIntensity: 0.6 })
    const cliffs = new THREE.InstancedMesh(cliffGeo, cliffMat, 720)
    const color = new THREE.Color()
    let ci = 0
    const rc = rng(7)
    for (let z = -120; z < level.length + 260 && ci < 720; z += 7.5) {
      for (const side of [-1, 1]) {
        if (ci >= 720) break
        const sx = 7 + rc() * 12
        const sy = 16 + rc() * 42
        this.dummy.position.set(side * (30 + rc() * 22 + sx * 0.6), slopeY(z) - 22 + sy * 0.55, z + rc() * 5)
        // Upright and leaning away from the track so no slab ever hangs over the racing line.
        this.dummy.rotation.set((rc() - 0.5) * 0.3, rc() * Math.PI * 2, -side * rc() * 0.3, 'ZYX')
        this.dummy.scale.set(sx, sy, 6 + rc() * 10)
        this.dummy.updateMatrix()
        cliffs.setMatrixAt(ci, this.dummy.matrix)
        const k = rc()
        cliffs.setColorAt(ci, color.setHSL(0.62 + k * 0.1, 0.45 + k * 0.2, 0.42 + rc() * 0.25))
        ci += 1
      }
    }
    cliffs.count = ci
    cliffs.receiveShadow = false
    cliffs.computeBoundingSphere()
    scene.add(cliffs)

    const mountains = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 6, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true, emissive: 0x141a55, emissiveIntensity: 0.5 }), 120)
    let mi = 0
    for (let z = -200; z < level.length + 600 && mi < 120; z += 52) {
      for (const side of [-1, 1]) {
        if (mi >= 120) break
        const hgt = 90 + rc() * 170
        const wid = 50 + rc() * 80
        this.dummy.position.set(side * (120 + rc() * 170), slopeY(z) - 50 + hgt / 2, z + rc() * 30)
        this.dummy.rotation.set(0, rc() * 3, 0)
        this.dummy.scale.set(wid, hgt, wid)
        this.dummy.updateMatrix()
        mountains.setMatrixAt(mi, this.dummy.matrix)
        mountains.setColorAt(mi, color.setHSL(0.66 + rc() * 0.08, 0.35, 0.62 + rc() * 0.2))
        mi += 1
      }
    }
    mountains.count = mi
    mountains.computeBoundingSphere()
    scene.add(mountains)

    const crystals = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), 260)
    for (let i = 0; i < 260; i += 1) {
      const z = -60 + rc() * (level.length + 200)
      const side = rc() > 0.5 ? 1 : -1
      this.dummy.position.set(side * (22 + rc() * 30), slopeY(z) - 6 + rc() * 22, z)
      this.dummy.rotation.set(rc() * 0.4, rc() * 3, rc() * 0.4)
      const s = 0.4 + rc() * 1.2
      this.dummy.scale.set(s * 0.5, s * 1.8, s * 0.5)
      this.dummy.updateMatrix()
      crystals.setMatrixAt(i, this.dummy.matrix)
      crystals.setColorAt(i, color.set(rc() > 0.6 ? 0xff6af0 : 0x5ff3ff))
    }
    crystals.computeBoundingSphere()
    scene.add(crystals)

    const floorGeo = new THREE.PlaneGeometry(900, level.length + 1400)
    floorGeo.rotateX(-Math.PI / 2 + Math.atan(CONFIG.sim.grade))
    const floor = new THREE.Mesh(floorGeo, new THREE.MeshBasicMaterial({ color: 0x0c0a2a }))
    floor.position.set(0, slopeY(level.length / 2) - 70, level.length / 2)
    scene.add(floor)

    // ── Avalanche wall (a churning shader curtain plus tumbling chunks) ───
    this.wallMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; varying vec2 vUv;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 45758.5); }
        float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
        float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
        void main(){
          vec2 p = vUv * vec2(9.0, 4.0);
          float n = fbm(p + vec2(0.0, -uTime * 1.4)) * 0.7 + fbm(p * 2.3 + vec2(uTime * 0.6, -uTime * 2.2)) * 0.3;
          float edge = smoothstep(1.0, 0.55 + n * 0.25, vUv.y);
          vec3 snow = mix(vec3(0.75, 0.8, 1.0), vec3(1.4, 1.45, 1.6), n);
          vec3 glow = vec3(0.7, 0.25, 1.2) * smoothstep(0.55, 0.0, vUv.y) * 0.8;
          gl_FragColor = vec4(snow + glow, edge);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    this.wall = new THREE.Group()
    for (let i = 0; i < 3; i += 1) {
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(170, 60), this.wallMat)
      plane.position.set((i - 1) * 4, 22 + i * 4, -i * 7)
      this.wall.add(plane)
    }
    this.boulders = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0xf0f4ff, roughness: 0.9, flatShading: true, emissive: 0x303a80, emissiveIntensity: 0.4 }), 40)
    this.boulders.frustumCulled = false
    this.wall.add(this.boulders)
    scene.add(this.wall)

    // ── Snowfall (world-space flakes streaming past the camera) ──────────
    const flake = canvasTexture(32, 32, g => {
      const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16)
      grad.addColorStop(0, 'rgba(255,255,255,1)')
      grad.addColorStop(0.4, 'rgba(220,240,255,0.7)')
      grad.addColorStop(1, 'rgba(220,240,255,0)')
      g.fillStyle = grad
      g.fillRect(0, 0, 32, 32)
    })
    const count = 2200
    const pos = new Float32Array(count * 3)
    for (let i = 0; i < count; i += 1) {
      pos[i * 3] = (Math.random() - 0.5) * 70
      pos[i * 3 + 1] = (Math.random() - 0.5) * 40
      pos[i * 3 + 2] = Math.random() * 130 - 20
    }
    const snowGeo = new THREE.BufferGeometry()
    snowGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    this.snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({ size: 0.32, map: flake, transparent: true, depthWrite: false, opacity: 0.9, sizeAttenuation: true, color: 0xeaf4ff }))
    this.snow.frustumCulled = false
    scene.add(this.snow)
  }

  private buildHazard(h: Hazard, m: { hazardMat: THREE.Material; hazardDark: THREE.Material; metal: THREE.Material; glowRed: THREE.Material; stripeTex: THREE.Texture }): HazardView {
    const pose = hazardPose(h, 0)
    const group = new THREE.Group()
    const shadow = (o: THREE.Mesh) => {
      o.castShadow = true
      return o
    }
    const view: HazardView = { h, obj: group, pose }
    switch (h.kind) {
      case 'spike':
      case 'stub': {
        const main = shadow(new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), m.hazardMat))
        main.scale.set(h.hx * 1.15, h.hy, h.hz * 1.15)
        main.rotation.y = h.id * 0.7
        group.add(main)
        for (let i = 0; i < 3; i += 1) {
          const shard = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), m.hazardMat)
          const a = h.id * 1.3 + i * 2.1
          shard.position.set(Math.cos(a) * h.hx * 0.7, -h.hy * 0.55, Math.sin(a) * h.hz * 0.7)
          shard.scale.set(h.hx * 0.35, h.hy * 0.45, h.hz * 0.35)
          shard.rotation.set(Math.cos(a) * 0.5, a, Math.sin(a) * 0.5)
          group.add(shard)
        }
        break
      }
      case 'barrier':
      case 'slider':
      case 'gate':
      case 'block': {
        const tex = m.stripeTex.clone()
        tex.needsUpdate = true
        tex.repeat.set(Math.max(1, h.hx), Math.max(1, h.hy))
        const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xff3a10, emissiveIntensity: 1.1, roughness: 0.4 })
        group.add(shadow(new THREE.Mesh(new THREE.BoxGeometry(h.hx * 2, h.hy * 2, h.hz * 2), mat)))
        const edge = new THREE.Mesh(new THREE.BoxGeometry(h.hx * 2 + 0.06, 0.12, h.hz * 2 + 0.06), m.glowRed)
        edge.position.y = h.hy
        group.add(edge)
        if (h.kind === 'gate' || h.kind === 'slider' || h.kind === 'block') {
          for (const sx of [-1, 1]) {
            const bar = new THREE.Mesh(new THREE.BoxGeometry(0.14, h.hy * 2, h.hz * 2 + 0.08), m.glowRed)
            bar.position.x = sx * h.hx
            group.add(bar)
          }
        }
        break
      }
      case 'pendulum': {
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, h.len, 6), m.metal)
        arm.position.y = -h.len / 2
        group.add(arm)
        const bob = shadow(new THREE.Mesh(new THREE.IcosahedronGeometry(1.05, 0), m.hazardMat))
        bob.position.y = -h.len
        group.add(bob)
        for (let i = 0; i < 6; i += 1) {
          const spike = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.9, 5), m.hazardMat)
          const dir = new THREE.Vector3(Math.cos(i), Math.sin(i * 2.3), Math.sin(i)).normalize()
          spike.position.copy(dir).multiplyScalar(1.05).add(new THREE.Vector3(0, -h.len, 0))
          spike.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
          group.add(spike)
        }
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.6, 10), m.metal)
        hub.rotation.x = Math.PI / 2
        const gantry = new THREE.Group()
        gantry.position.set(h.x, h.y, h.z)
        gantry.add(hub)
        const beam = new THREE.Mesh(new THREE.BoxGeometry(13, 0.5, 0.5), m.metal)
        gantry.add(beam)
        for (const sx of [-1, 1]) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, h.len + 14, 0.5), m.metal)
          post.position.set(sx * 6.5, -(h.len + 14) / 2, 0)
          gantry.add(post)
          const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.25, 0.6), m.glowRed)
          lamp.position.set(sx * 6.5, 0.35, 0)
          gantry.add(lamp)
        }
        this.scene.add(gantry)
        break
      }
      case 'spinner': {
        const bar = shadow(new THREE.Mesh(new THREE.BoxGeometry(h.hx * 2, h.hy * 2, h.hz * 2), m.hazardMat))
        group.add(bar)
        for (const sx of [-1, 1]) {
          const cap = new THREE.Mesh(new THREE.BoxGeometry(0.3, h.hy * 2 + 0.1, h.hz * 2 + 0.1), m.glowRed)
          cap.position.x = sx * h.hx
          group.add(cap)
        }
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 1.3, 8), m.metal)
        hub.position.set(h.x, h.y - 0.1, h.z)
        this.scene.add(hub)
        break
      }
      case 'laser': {
        const beams: THREE.Mesh[] = []
        const core = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, h.hx * 2, 6), new THREE.MeshBasicMaterial({ color: 0xffd0c0, toneMapped: false, transparent: true }))
        const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, h.hx * 2, 8), new THREE.MeshBasicMaterial({ color: 0xff2a10, toneMapped: false, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }))
        for (const b of [core, glow]) {
          b.rotation.z = Math.PI / 2
          group.add(b)
          beams.push(b)
        }
        view.beam = beams
        const posts = new THREE.Group()
        posts.position.set(h.x, h.y, h.z)
        for (const sx of [-1, 1]) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.45, 3.4, 0.45), m.metal)
          post.position.set(sx * (h.hx + 0.1), this.deckTopBelow(h) - h.y + 1.7, 0)
          posts.add(post)
          const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.3, 0.55), m.glowRed)
          lamp.position.set(sx * (h.hx + 0.1), 0, 0)
          posts.add(lamp)
        }
        this.scene.add(posts)
        break
      }
      case 'ceiling': {
        const slabMesh = shadow(new THREE.Mesh(new THREE.BoxGeometry(h.hx * 2, h.hy * 2, h.hz * 2), m.hazardDark))
        group.add(slabMesh)
        const under = new THREE.Mesh(new THREE.BoxGeometry(h.hx * 2 + 0.05, 0.14, h.hz * 2 + 0.05), m.glowRed)
        under.position.y = -h.hy
        group.add(under)
        for (let i = 0; i < 5; i += 1) {
          const fang = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.8, 5), m.hazardMat)
          fang.rotation.x = Math.PI
          fang.position.set(-h.hx + ((i + 0.5) * h.hx * 2) / 5, -h.hy - 0.3, 0)
          group.add(fang)
        }
        break
      }
    }
    group.position.set(pose.x, pose.y, pose.z)
    if (h.kind === 'pendulum') group.position.set(h.x, h.y, h.z)
    this.scene.add(group)
    return view
  }

  /** Deck top under a hazard (for posts that stand on the deck). */
  /** Re-parent static track pieces into z-chunks so far-away sections cost no draw calls. */
  buildChunks(): void {
    if (this.chunks.size > 0) return
    const box = new THREE.Box3()
    for (const obj of [...this.scene.children]) {
      if (obj === this.sky || obj === this.wall || obj === this.snow || obj instanceof THREE.Light || (obj as THREE.InstancedMesh).isInstancedMesh) continue
      box.setFromObject(obj)
      if (box.isEmpty() || box.max.z - box.min.z > 150) continue
      const key = Math.floor((box.min.z + box.max.z) / 2 / 100)
      let chunk = this.chunks.get(key)
      if (!chunk) {
        chunk = new THREE.Group()
        chunk.userData.z0 = key * 100 - 60
        chunk.userData.z1 = key * 100 + 160
        this.chunks.set(key, chunk)
        this.scene.add(chunk)
      }
      chunk.add(obj)
    }
  }

  private deckTopBelow(h: Hazard): number {
    const p = this.level.platforms.find(pl => h.z >= pl.z0 && h.z <= pl.z1 && Math.abs(h.x - pl.x) <= pl.w / 2 + 1)
    return p ? topAt(p, h.z) : h.y - 1
  }

  /** Animate everything from the (interpolated) simulation clock. */
  update(frameSeconds: number, simT: number, sim: SimState | null, focus: THREE.Vector3, camera: THREE.Camera): void {
    for (const c of this.chunks.values()) c.visible = c.userData.z1 > focus.z - 40 && c.userData.z0 < focus.z + 560
    this.time += frameSeconds
    this.skyMat.uniforms.uTime.value = this.time
    this.wallMat.uniforms.uTime.value = this.time
    this.sky.position.copy(camera.position)
    this.sun.position.set(focus.x - 26, focus.y + 48, focus.z + 34)
    this.sun.target.position.copy(focus).add(new THREE.Vector3(0, 0, 10))
    // Scroll toward +z so the chevrons stream forward with the rider.
    this.padTex.offset.y = this.time * 2.2
    this.finishGlow.color.setHSL(0.12 + Math.sin(this.time * 3) * 0.03, 1, 0.62)

    for (const v of this.hazards) {
      if (v.h.kind === 'spike' || v.h.kind === 'stub' || v.h.kind === 'barrier' || v.h.kind === 'ceiling' || v.h.kind === 'block') continue
      hazardPose(v.h, simT, v.pose)
      if (v.h.kind === 'pendulum') v.obj.rotation.z = v.pose.rotZ
      else if (v.h.kind === 'spinner') v.obj.rotation.y = -v.pose.rotY
      else v.obj.position.set(v.pose.x, v.pose.y, v.pose.z)
      if (v.beam) {
        const flicker = v.pose.warn > 0 ? (Math.sin(this.time * 70) > 0.2 ? v.pose.warn * 0.5 : 0.05) : 0
        const on = v.pose.on
        v.beam[0].visible = on || flicker > 0
        v.beam[1].visible = on || flicker > 0
        ;(v.beam[0].material as THREE.MeshBasicMaterial).opacity = on ? 1 : flicker
        ;(v.beam[1].material as THREE.MeshBasicMaterial).opacity = on ? 0.5 + Math.sin(this.time * 30) * 0.08 : flicker * 0.5
        v.beam[1].scale.set(on ? 1 : 0.5, 1, on ? 1 : 0.5)
      }
    }
    for (const v of this.moving) v.group.position.x = platformX(v.p, simT)
    for (const v of this.crumbles) {
      const at = sim?.crumble.get(v.p.id)
      const g = v.group
      if (at === undefined) {
        g.position.set(v.p.x, 0, (v.p.z0 + v.p.z1) / 2)
        g.rotation.set(0, 0, 0)
        g.visible = true
        continue
      }
      const e = simT - at
      const d = CONFIG.sim.crumbleDelay
      if (e < d) {
        const k = e / d
        g.position.x = v.p.x + Math.sin(this.time * 90) * 0.07 * k
        g.position.y = Math.sin(this.time * 77) * 0.05 * k
        g.rotation.set(0, 0, 0)
      } else {
        const f = e - d
        g.position.y = -0.5 * 30 * f * f
        g.rotation.set(f * 0.5, 0, f * 0.35 * (v.p.id % 2 ? 1 : -1))
        g.visible = f < 2.5
      }
    }
    if (sim) {
      for (const gate of this.gates) {
        const lit = sim.cp >= gate.index
        for (const m of gate.mats) m.color.set(lit ? 0xffd35c : 0x74f2ff)
      }
    }

    // Avalanche position and tumbling chunks.
    const wallZ = sim ? sim.wallZ : focus.z - 60
    this.wall.position.set(focus.x * 0.4, slopeY(wallZ) - 6, wallZ)
    for (let i = 0; i < 40; i += 1) {
      const a = this.time * (1.5 + (i % 5) * 0.4) + i * 2.3
      this.dummy.position.set(((i * 37) % 80) - 40, 2 + Math.abs(Math.sin(a)) * 6 + (i % 4) * 2, 2 + (i % 6))
      this.dummy.rotation.set(a, a * 0.7, a * 0.3)
      this.dummy.scale.setScalar(0.8 + (i % 7) * 0.35)
      this.dummy.updateMatrix()
      this.boulders.setMatrixAt(i, this.dummy.matrix)
    }
    this.boulders.instanceMatrix.needsUpdate = true

    // Snow: wrap flakes into a box around the camera; world-static so speed reads naturally.
    const pos = this.snow.geometry.attributes.position as THREE.BufferAttribute
    const arr = pos.array as Float32Array
    const cx = camera.position.x
    const cy = camera.position.y
    const cz = camera.position.z
    const fall = frameSeconds * 2.2
    for (let i = 0; i < arr.length; i += 3) {
      arr[i + 1] -= fall
      arr[i] += Math.sin(this.time * 0.8 + i) * frameSeconds * 0.6
      if (arr[i + 2] < cz - 15) arr[i + 2] += 130
      else if (arr[i + 2] > cz + 115) arr[i + 2] -= 130
      if (arr[i] < cx - 35) arr[i] += 70
      else if (arr[i] > cx + 35) arr[i] -= 70
      if (arr[i + 1] < cy - 20) arr[i + 1] += 40
      else if (arr[i + 1] > cy + 20) arr[i + 1] -= 40
    }
    pos.needsUpdate = true
  }
}
