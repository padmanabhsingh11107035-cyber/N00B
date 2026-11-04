import * as THREE from 'three'
import type { Audio } from '../engine/audio'
import type { Input } from '../engine/input'
import type { Renderer } from '../engine/renderer'
import type { SaveStore, StorySave } from '../engine/save'
import { CONFIG } from '../game/config'
import { tuning } from '../game/tuning'
import { EN_BOOK, chooseScript, STARS, type Choice, type StoryState, type Target } from './story'

export type Mode = 'title' | 'playing' | 'paused'
export type GameHooks = {
  onDialogue(speaker: string, text: string): void
  onDialogueEnd(): void
  onFocus(text: string): void
  onProgress(found: number, total: number): void
  onMode(mode: Mode): void
}
type Landmark = { id: Target; group: THREE.Group; position: THREE.Vector3; focus: THREE.Vector3 }
type Conversation = { choice: Choice; index: number; target: Target }

const HILL = 38
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
export function hillHeight(x: number, z: number): number {
  const r = Math.sqrt((x / 39) ** 2 + (z / 36) ** 2)
  const t = clamp(1 - r, 0, 1)
  return 0.25 + 5.4 * t * t
}
const SPEAKERS: Record<string, string> = { fox: 'Fox', rose: 'Rose', sheep: 'Sheep', tapir: 'Tapir', shoebill: 'Shoebill', you: 'You' }

/** Lightweight first-person hill exploration. Geometry is procedural and shared; no physics WASM, textures, or post-processing are loaded. */
export class FarboundGame {
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, 1, 0.1, 130)
  mode: Mode = 'title'
  reducedMotion = false
  readonly story: StoryState
  private readonly materials: Record<string, THREE.Material>
  private readonly lowSphere: THREE.SphereGeometry
  private readonly box: THREE.BoxGeometry
  private readonly cylinder: THREE.CylinderGeometry
  private readonly cone: THREE.ConeGeometry
  private readonly landmarks = new Map<Target, Landmark>()
  private readonly eyes: THREE.Mesh[] = []
  private ribbon?: THREE.Group
  private roseDome?: THREE.Mesh
  private readonly flowers: THREE.InstancedMesh
  private conversation: Conversation | null = null
  private focus: Target | null = null
  private time = 0
  private yaw = -0.55
  private pitch = -0.12
  private readonly moveVelocity = new THREE.Vector2()
  private readonly feet = new THREE.Vector3(-18, hillHeight(-18, 8), 8)
  private velocityY = 0
  private grounded = true
  private readonly scratch = new THREE.Vector3()
  private readonly starLocations: Record<Target, [number, number]> = {
    plane: [-16, 15], hat: [-8, -8], sprout: [5, -11], fox: [10, 4], rose: [3, 4],
    sheep: [-8, -1], box: [-11, 4], tapir: [10, 12], shoebill: [-12, -7], guardian: [0, 0],
  }

  constructor(
    private readonly renderer: Renderer,
    private readonly input: Input,
    private readonly audio: Audio,
    private readonly save: SaveStore,
    private readonly hooks: GameHooks,
  ) {
    this.story = { ...save.data.story, stars: [...save.data.story.stars] as Target[], visits: {}, sproutsLeft: save.data.story.sproutsLeft, roseSmeltFox: save.data.story.roseSmeltFox }
    this.lowSphere = new THREE.SphereGeometry(1, 8, 6)
    this.box = new THREE.BoxGeometry(1, 1, 1)
    this.cylinder = new THREE.CylinderGeometry(0.5, 0.5, 1, 8)
    this.cone = new THREE.ConeGeometry(0.5, 1, 7)
    this.materials = {
      ivory: new THREE.MeshLambertMaterial({ color: 0xc7c3ad }),
      pale: new THREE.MeshLambertMaterial({ color: 0xe1dec9 }),
      moss: new THREE.MeshLambertMaterial({ color: 0x687954 }),
      darkMoss: new THREE.MeshLambertMaterial({ color: 0x405e49 }),
      stone: new THREE.MeshLambertMaterial({ color: 0x817f70, flatShading: true }),
      wood: new THREE.MeshLambertMaterial({ color: 0x805b3f }),
      bark: new THREE.MeshLambertMaterial({ color: 0x574b3b }),
      orange: new THREE.MeshLambertMaterial({ color: 0xd47b43 }),
      white: new THREE.MeshLambertMaterial({ color: 0xf1ecd9 }),
      black: new THREE.MeshLambertMaterial({ color: 0x303b3d }),
      red: new THREE.MeshLambertMaterial({ color: 0xb94f47 }),
      flower: new THREE.MeshLambertMaterial({ color: 0xe8a6a0 }),
      gold: new THREE.MeshLambertMaterial({ color: 0xe7ca7c }),
      sky: new THREE.MeshBasicMaterial({ color: 0xffffff }),
      eye: new THREE.MeshStandardMaterial({ color: 0x253d3a, emissive: 0x111a18, roughness: 0.85 }),
    }
    this.scene.background = new THREE.Color(0xa8d7e4)
    this.scene.fog = new THREE.Fog(0xa8d7e4, 54, 118)
    this.scene.add(new THREE.HemisphereLight(0xe4f4f6, 0x66774e, 1.45))
    const sun = new THREE.DirectionalLight(0xffe5b8, 1.65)
    sun.position.set(-24, 38, 28)
    this.scene.add(sun)
    this.buildHill()
    this.buildCloudSea()
    this.buildGrass()
    this.flowers = this.buildFlowers()
    this.addLandmarks()
    if (this.story.sproutsLeft <= 0) {
      const sprout = this.landmarks.get('sprout')
      if (sprout) sprout.group.visible = false
    }
    if (this.story.awake) for (const eye of this.eyes) (eye.material as THREE.MeshStandardMaterial).emissive.set(0x9c6e37)
    this.camera.fov = CONFIG.camera.fov
    this.camera.updateProjectionMatrix()
    this.hooks.onProgress(this.story.stars.length, STARS.length)
    this.setTitleCamera()
  }

  start(): void {
    this.mode = 'playing'
    this.conversation = null
    this.story.visits = {}
    this.feet.set(-18, hillHeight(-18, 8), 8)
    this.velocityY = 0
    this.grounded = true
    this.moveVelocity.set(0, 0)
    this.yaw = Math.atan2(-2, -6)
    this.pitch = -0.09
    tuning.activate('run')
    this.audio.play('ui')
    this.hooks.onMode(this.mode)
  }
  pause(): void { if (this.mode === 'playing') { this.mode = 'paused'; this.hooks.onMode(this.mode) } }
  resume(): void { if (this.mode === 'paused') { this.mode = 'playing'; this.hooks.onMode(this.mode) } }
  toTitle(): void { this.mode = 'title'; this.conversation = null; this.hooks.onDialogueEnd(); this.hooks.onMode(this.mode) }
  get talking(): boolean { return this.conversation !== null }
  get found(): number { return this.story.stars.length }

  step(dt: number): void {
    if (this.mode !== 'playing') return
    if (this.input.consume('pause') && !this.conversation) { this.pause(); return }
    if (this.conversation) {
      if (this.input.consume('interact') || this.input.consume('confirm')) this.advanceDialogue()
      return
    }
    if (this.input.consume('interact')) { this.interact(); return }
    if (this.input.consume('jump') && this.grounded) {
      tuning.activate('jump')
      this.velocityY = CONFIG.player.jumpSpeed * 0.42
      this.grounded = false
      this.audio.play('jump')
    }
    const ix = this.input.move.x
    const iy = this.input.move.y
    const speed = this.input.held('sprint') ? CONFIG.player.sprintSpeed : CONFIG.player.walkSpeed
    const rightX = Math.cos(this.yaw)
    const rightZ = -Math.sin(this.yaw)
    const forwardX = -Math.sin(this.yaw)
    const forwardZ = -Math.cos(this.yaw)
    const magnitude = Math.hypot(ix, iy)
    const divisor = Math.max(1, magnitude)
    const targetX = (rightX * ix / divisor + forwardX * iy / divisor) * speed
    const targetZ = (rightZ * ix / divisor + forwardZ * iy / divisor) * speed
    const blend = Math.min(1, dt * CONFIG.player.acceleration / Math.max(speed, 1)) * (this.grounded ? 1 : CONFIG.player.airControl)
    this.moveVelocity.x += (targetX - this.moveVelocity.x) * blend
    this.moveVelocity.y += (targetZ - this.moveVelocity.y) * blend
    const nx = this.feet.x + this.moveVelocity.x * dt
    const nz = this.feet.z + this.moveVelocity.y * dt
    if (Math.hypot(nx / 1, nz / 1) < HILL - 2) {
      this.feet.x = nx
      this.feet.z = nz
    }
    const floor = hillHeight(this.feet.x, this.feet.z)
    this.velocityY = Math.max(CONFIG.player.maxFall, this.velocityY + CONFIG.player.gravity * dt)
    this.feet.y += this.velocityY * dt
    if (this.feet.y <= floor) { this.feet.y = floor; this.velocityY = 0; this.grounded = true }
  }

  advanceDialogue(): void {
    const talk = this.conversation
    if (!talk) return
    if (talk.index + 1 < talk.choice.lines.length) {
      talk.index++
      this.displayLine(talk)
      return
    }
    this.applyEffects(talk.choice, talk.target)
    this.conversation = null
    this.hooks.onDialogueEnd()
    this.audio.play('ui')
  }

  render(_alpha: number, frameSeconds: number): void {
    const dt = Math.min(frameSeconds, 0.06)
    this.time += dt
    if (this.mode !== 'title' && this.camera.fov !== CONFIG.camera.fov) {
      this.camera.fov = CONFIG.camera.fov
      this.camera.updateProjectionMatrix()
    }
    if (this.mode === 'title') this.setTitleCamera()
    else {
      if (this.mode === 'playing') {
        const look = this.input.takeLook()
        this.yaw -= look.x
        this.pitch = clamp(this.pitch - look.y, -0.72, 0.46)
      } else this.input.takeLook()
      this.camera.position.set(this.feet.x, this.feet.y + 1.62 + (this.reducedMotion ? 0 : Math.sin(this.time * 4) * 0.018), this.feet.z)
      this.camera.rotation.order = 'YXZ'
      this.camera.rotation.set(this.pitch, this.yaw, 0)
    }
    if (this.ribbon) this.ribbon.rotation.z = Math.sin(this.time * 1.2) * 0.14
    const fox = this.landmarks.get('fox')
    if (fox) {
      const foxMesh = fox.group
      foxMesh.position.y = hillHeight(foxMesh.position.x, foxMesh.position.z) + Math.sin(this.time * 2.1) * 0.03
      if (this.story.fox >= 3 && this.mode === 'playing' && !this.conversation) {
        const targetX = this.feet.x + Math.sin(this.yaw) * 2.2
        const targetZ = this.feet.z + Math.cos(this.yaw) * 2.2
        const distance = Math.hypot(targetX - foxMesh.position.x, targetZ - foxMesh.position.z)
        if (distance > 2.7) {
          foxMesh.position.x += (targetX - foxMesh.position.x) * Math.min(1, dt * 0.65)
          foxMesh.position.z += (targetZ - foxMesh.position.z) * Math.min(1, dt * 0.65)
          foxMesh.position.y = hillHeight(foxMesh.position.x, foxMesh.position.z)
        }
      }
    }
    this.flowers.rotation.y = Math.sin(this.time * 0.12) * 0.008
    const focus = this.mode === 'playing' && !this.conversation ? this.findFocus() : null
    if (focus !== this.focus) {
      this.focus = focus
      this.hooks.onFocus(focus ? this.promptFor(focus) : '')
    }
    if (this.mode === 'playing' && !this.conversation && this.input.method !== 'touch') {
      // Take mouse deltas in render; interact presses are consumed in the fixed step.
    }
    this.renderer.render(this.scene, this.camera, frameSeconds)
  }

  private setTitleCamera(): void {
    const a = 0.02 * Math.sin(this.time * 0.09)
    this.camera.position.set(-18 + a * 2, 13 + Math.sin(this.time * 0.11) * 0.25, 24)
    this.camera.lookAt(0, 4.3, 0)
    const fov = window.innerWidth < window.innerHeight ? 55 : 43
    if (this.camera.fov !== fov) {
      this.camera.fov = fov
      this.camera.updateProjectionMatrix()
    }
  }

  private buildHill(): void {
    const geo = new THREE.PlaneGeometry(84, 78, 64, 60)
    geo.rotateX(-Math.PI / 2)
    const p = geo.attributes.position as THREE.BufferAttribute
    const colors: number[] = []
    const a = new THREE.Color(0x566d4c)
    const b = new THREE.Color(0x829260)
    const c = new THREE.Color(0xb0a57a)
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i)
      const h = hillHeight(x, z) + Math.sin(x * 1.4 + z * 0.7) * 0.055
      p.setY(i, h)
      const n = Math.sin(x * 0.21 + z * 0.13) * Math.cos(z * 0.18 - x * 0.08) * 0.045
      const shade = clamp((h + n - 0.2) / 5.5, 0, 1)
      const color = shade < 0.55 ? a.clone().lerp(b, shade / 0.55) : b.clone().lerp(c, (shade - 0.55) / 0.45)
      colors.push(color.r, color.g, color.b)
    }
    p.needsUpdate = true
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geo.computeVertexNormals()
    this.scene.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })))
  }

  private buildCloudSea(): void {
    const geometry = new THREE.SphereGeometry(1, 8, 6)
    const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshLambertMaterial({ color: 0xf4f5e9 }), 64)
    const dummy = new THREE.Object3D()
    let seed = 19
    const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
    for (let i = 0; i < 64; i++) {
      const angle = rand() * Math.PI * 2
      const radius = 54 + rand() * 28
      dummy.position.set(Math.cos(angle) * radius, 1 + rand() * 10, Math.sin(angle) * radius)
      const size = 3 + rand() * 6
      dummy.scale.set(size * 1.25, size * 0.42, size * 0.85)
      dummy.rotation.y = rand() * Math.PI
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
    mesh.frustumCulled = true
    this.scene.add(mesh)
  }

  private buildGrass(): void {
    const vertices = new Float32Array([-0.09, 0, 0, 0.09, 0, 0, 0, 0.36, 0, 0, 0, -0.09, 0, 0, 0.09, 0, 0.3, 0])
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
    const blades = new THREE.InstancedMesh(g, mat, 480)
    const dummy = new THREE.Object3D()
    const colors = [new THREE.Color(0x879765), new THREE.Color(0xa1ac75), new THREE.Color(0x71895d)]
    let seed = 11
    const rand = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296 }
    let used = 0
    for (let i = 0; i < 480; i++) {
      const x = (rand() - 0.5) * 70, z = (rand() - 0.5) * 66
      if (Math.hypot(x, z) > 35 || Math.hypot(x, z) < 6) continue
      dummy.position.set(x, hillHeight(x, z) - 0.08, z)
      dummy.rotation.set(0, rand() * Math.PI, 0)
      const s = 0.45 + rand() * 0.9
      dummy.scale.set(s, s, s)
      dummy.updateMatrix()
      blades.setMatrixAt(used, dummy.matrix)
      blades.setColorAt(used, colors[Math.floor(rand() * colors.length)])
      used++
    }
    blades.count = used
    blades.instanceMatrix.needsUpdate = true
    this.scene.add(blades)
  }

  private buildFlowers(): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 6, 5), new THREE.MeshLambertMaterial({ color: 0xffffff }), 72)
    const dummy = new THREE.Object3D()
    const palette = [new THREE.Color(0xf3d881), new THREE.Color(0xd88c96), new THREE.Color(0xc7c9e7)]
    let seed = 77
    const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
    for (let i = 0; i < 72; i++) {
      const a = rand() * Math.PI * 2, r = 6 + rand() * 26
      const x = Math.cos(a) * r, z = Math.sin(a) * r
      dummy.position.set(x, hillHeight(x, z) + 0.13, z)
      const s = 0.65 + rand() * 0.7
      dummy.scale.set(s, s * 0.7, s)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      mesh.setColorAt(i, palette[i % palette.length])
    }
    mesh.instanceMatrix.needsUpdate = true
    this.scene.add(mesh)
    return mesh
  }

  private addLandmarks(): void {
    for (const id of STARS) {
      const [x, z] = this.starLocations[id]
      const group = new THREE.Group()
      group.position.set(x, hillHeight(x, z), z)
      this.scene.add(group)
      const landmark: Landmark = { id, group, position: new THREE.Vector3(x, group.position.y, z), focus: new THREE.Vector3(x, group.position.y + 1.25, z) }
      this.landmarks.set(id, landmark)
      this.buildProp(id, group)
    }
  }

  private buildProp(id: Target, group: THREE.Group): void {
    const m = this.materials
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number], scale: [number, number, number], rot?: [number, number, number]) => {
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(...pos); mesh.scale.set(...scale)
      if (rot) mesh.rotation.set(...rot)
      group.add(mesh)
      return mesh
    }
    if (id === 'plane') {
      add(this.cylinder, m.ivory, [0, 0.62, 0], [0.42, 2.7, 0.42], [Math.PI / 2, 0, 0])
      add(this.box, m.red, [0, 0.65, 0], [3.4, 0.12, 0.62])
      add(this.box, m.wood, [0, 0.94, -0.25], [1.5, 0.1, 0.38])
      add(this.box, m.darkMoss, [0, 0.75, 1.38], [0.1, 1.6, 0.1])
      const prop = add(this.cylinder, m.stone, [0, 0.62, -1.45], [0.06, 0.9, 0.06], [0, 0, Math.PI / 2]); prop.rotation.z = Math.PI / 2
    } else if (id === 'hat') {
      add(new THREE.IcosahedronGeometry(1, 1), m.stone, [0, 0.55, 0], [1.2, 0.7, 0.85], [0.2, 0.3, 0.1])
    } else if (id === 'sprout') {
      for (const [x, height] of [[-0.43, 0.52], [-0.16, 0.66], [0.15, 0.76], [0.42, 0.56]] as const) {
        add(this.cylinder, m.darkMoss, [x, height * 0.35, 0], [0.045, height * 0.7, 0.045])
        add(this.lowSphere, m.moss, [x - 0.13, height, 0], [0.25, 0.1, 0.16], [0, 0, -0.28])
        add(this.lowSphere, m.moss, [x + 0.13, height + 0.08, 0], [0.24, 0.1, 0.15], [0, 0, 0.3])
      }
    } else if (id === 'fox') {
      add(this.lowSphere, m.orange, [0, 0.52, 0], [0.62, 0.42, 0.92])
      add(this.lowSphere, m.orange, [0, 0.8, 0.7], [0.47, 0.43, 0.45])
      add(this.lowSphere, m.white, [0, 0.58, -0.72], [0.32, 0.27, 0.65], [0.6, 0, 0])
      add(this.cone, m.orange, [-0.24, 1.12, 0.82], [0.18, 0.5, 0.18], [0, 0, -0.15])
      add(this.cone, m.orange, [0.24, 1.12, 0.82], [0.18, 0.5, 0.18], [0, 0, 0.15])
      add(this.lowSphere, m.white, [0, 0.69, 1.11], [0.44, 0.31, 0.42], [0.3, 0, 0])
      add(this.lowSphere, m.eye, [-0.19, 0.84, 0.96], [0.055, 0.06, 0.04])
      add(this.lowSphere, m.eye, [0.19, 0.84, 0.96], [0.055, 0.06, 0.04])
    } else if (id === 'rose') {
      add(this.cylinder, m.darkMoss, [0, 0.48, 0], [0.045, 0.9, 0.045])
      add(this.lowSphere, m.red, [0, 1.02, 0], [0.29, 0.24, 0.28])
      add(this.lowSphere, m.moss, [-0.18, 0.52, 0], [0.32, 0.09, 0.14], [0, 0, -0.25])
      add(this.lowSphere, m.moss, [0.18, 0.7, 0], [0.28, 0.09, 0.13], [0, 0, 0.28])
      const dome = add(this.lowSphere, new THREE.MeshBasicMaterial({ color: 0xe5f5ef, transparent: true, opacity: 0.14, depthWrite: false }), [0, 0.78, 0], [0.74, 0.89, 0.74])
      dome.material.side = THREE.DoubleSide
      this.roseDome = dome
    } else if (id === 'sheep') {
      add(this.lowSphere, m.white, [0, 0.58, 0], [0.75, 0.58, 0.88])
      for (const [x, y, z] of [[-0.4, 0.88, 0.14], [0, 1.02, 0.22], [0.38, 0.87, 0.2], [-0.15, 0.81, -0.3], [0.25, 0.86, -0.32]] as [number,number,number][]) add(this.lowSphere, m.pale, [x, y, z], [0.34, 0.31, 0.34])
      add(this.lowSphere, m.black, [0, 0.62, 0.76], [0.28, 0.29, 0.27])
    } else if (id === 'box') {
      add(this.box, m.wood, [0, 0.42, 0], [1.05, 0.82, 0.9])
      add(this.box, m.bark, [0, 0.86, 0], [1.12, 0.13, 0.98])
      for (const x of [-0.22, 0, 0.22]) add(this.lowSphere, m.black, [x, 0.48, 0.47], [0.055, 0.055, 0.018])
    } else if (id === 'tapir') {
      add(this.lowSphere, m.black, [0, 0.83, 0], [0.84, 0.62, 1.12])
      add(this.lowSphere, m.white, [0, 0.91, -0.06], [0.86, 0.48, 0.66])
      add(this.lowSphere, m.black, [0, 0.78, 0.93], [0.45, 0.45, 0.54])
      add(this.cylinder, m.black, [0, 0.46, 1.22], [0.16, 0.7, 0.16], [0.1, 0, 0])
    } else if (id === 'shoebill') {
      add(this.lowSphere, m.stone, [0, 1.15, 0], [0.55, 0.82, 0.55])
      add(this.lowSphere, m.stone, [0, 1.84, 0.12], [0.35, 0.39, 0.37])
      add(this.cone, m.gold, [0, 1.77, 0.58], [0.22, 0.64, 0.2], [Math.PI / 2, 0, 0])
      add(this.cylinder, m.bark, [-0.18, 0.48, 0], [0.07, 0.94, 0.07])
      add(this.cylinder, m.bark, [0.18, 0.48, 0], [0.07, 0.94, 0.07])
    } else if (id === 'guardian') this.buildGuardian(group)
  }

  private buildGuardian(group: THREE.Group): void {
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number], scale: [number, number, number], rot?: [number, number, number]) => {
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(...pos); mesh.scale.set(...scale)
      if (rot) mesh.rotation.set(...rot)
      group.add(mesh)
      return mesh
    }
    add(this.lowSphere, this.materials.ivory, [0, 2.5, 0], [2.05, 2.5, 1.45])
    add(this.lowSphere, this.materials.pale, [0, 4.75, 0.16], [1.75, 1.25, 1.2])
    add(this.lowSphere, this.materials.moss, [-0.87, 5.27, -0.12], [0.54, 0.16, 0.45])
    add(this.lowSphere, this.materials.moss, [0.66, 5.37, -0.12], [0.63, 0.14, 0.42])
    for (const x of [-0.62, 0.62]) {
      add(this.lowSphere, this.materials.stone, [x, 4.83, 1.18], [0.45, 0.47, 0.16])
      const eye = add(this.lowSphere, this.materials.eye, [x, 4.86, 1.32], [0.23, 0.25, 0.12])
      this.eyes.push(eye)
    }
    // Long segmented arms rest in the grass, matching the supplied guardian design.
    const joint = (pos: [number,number,number], scale: [number,number,number]) => add(this.lowSphere, this.materials.ivory, pos, scale)
    const arm = (from: THREE.Vector3, to: THREE.Vector3, radius: number) => {
      const v = new THREE.Vector3().subVectors(to, from)
      const mesh = add(this.cylinder, this.materials.ivory, [0, 0, 0], [radius * 2, v.length(), radius * 2])
      mesh.position.copy(from).add(to).multiplyScalar(0.5)
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize())
      joint([to.x, to.y, to.z], [radius * 1.5, radius, radius * 1.5])
    }
    arm(new THREE.Vector3(-1.35, 3.6, 0.25), new THREE.Vector3(-2.35, 1.55, 1.25), 0.42)
    arm(new THREE.Vector3(-2.35, 1.55, 1.25), new THREE.Vector3(-2.65, 0.22, 2.0), 0.34)
    arm(new THREE.Vector3(1.35, 3.6, 0.25), new THREE.Vector3(2.35, 1.55, 1.25), 0.42)
    arm(new THREE.Vector3(2.35, 1.55, 1.25), new THREE.Vector3(2.65, 0.22, 2.0), 0.34)
    joint([-2.65, 0.16, 2.0], [0.55, 0.27, 0.7]); joint([2.65, 0.16, 2.0], [0.55, 0.27, 0.7])
    for (const x of [-1.2, 1.2]) add(this.lowSphere, this.materials.stone, [x, 0.28, -0.72], [0.78, 0.38, 1.2])
    // A simple red ribbon remains a small, cheap wind-swept signature.
    const ribbon = new THREE.Group(); ribbon.position.set(2.6, 0.55, 2.05); group.add(ribbon); this.ribbon = ribbon
    const strip = new THREE.Mesh(this.box, this.materials.red)
    strip.position.set(0.58, 0.12, 0)
    strip.scale.set(1.2, 0.09, 0.035)
    strip.rotation.z = 0.12
    ribbon.add(strip)
  }

  private findFocus(): Target | null {
    this.camera.updateMatrixWorld()
    const forward = this.camera.getWorldDirection(this.scratch)
    let best: Target | null = null
    let bestScore = Infinity
    for (const [id, landmark] of this.landmarks) {
      if (!landmark.group.visible) continue
      const d = landmark.focus.distanceTo(this.camera.position)
      if (d > 7.5) continue
      const toward = landmark.focus.clone().sub(this.camera.position).normalize()
      const dot = forward.dot(toward)
      if (dot < 0.76) continue
      const score = d + (1 - dot) * 7
      if (score < bestScore) { best = id; bestScore = score }
    }
    return best
  }

  private promptFor(id: Target): string {
    const name: Record<Target, string> = { plane: 'your aeroplane', hat: 'the strange stone', sprout: 'a little sprout', fox: 'the fox', rose: 'the rose', sheep: 'the small sheep', box: 'the wooden box', tapir: 'the tapir', shoebill: 'the shoebill', guardian: 'the silent guardian' }
    return `E · Discover ${name[id]}`
  }

  private interact(): void {
    const id = this.focus
    if (!id) return
    const choice = chooseScript(EN_BOOK, id, this.story)
    this.conversation = { choice, index: 0, target: id }
    this.displayLine(this.conversation)
    this.audio.play('ui')
  }

  private displayLine(talk: Conversation): void {
    const [speaker, raw] = talk.choice.lines[talk.index]
    const name = this.save.data.playerName || 'Traveller'
    const text = raw.split('{name}').join(name)
    this.hooks.onDialogue(SPEAKERS[speaker] ?? '', text)
  }

  private applyEffects(choice: Choice, target: Target): void {
    const e = choice.effects
    if (choice.repeat) this.story.visits[target] = (this.story.visits[target] ?? 0) + 1
    if (e.star && !this.story.stars.includes(e.star)) this.story.stars.push(e.star)
    if (e.fox !== undefined) this.story.fox = e.fox
    if (e.pullSprout) {
      this.story.sproutsLeft = Math.max(0, this.story.sproutsLeft - 1)
      if (this.story.sproutsLeft === 0) {
        const sprout = this.landmarks.get('sprout')
        if (sprout) sprout.group.visible = false
      }
    }
    if (e.liftDome && this.roseDome) this.roseDome.visible = false
    if (e.roseSmeltFox) this.story.roseSmeltFox = true
    if (e.awaken) {
      this.story.awake = true
      for (const eye of this.eyes) (eye.material as THREE.MeshStandardMaterial).emissive.set(0x9c6e37)
    }
    const saved: StorySave = { stars: [...this.story.stars], fox: this.story.fox, awake: this.story.awake, sproutsLeft: this.story.sproutsLeft, roseSmeltFox: this.story.roseSmeltFox }
    this.save.update({ story: saved })
    this.hooks.onProgress(this.story.stars.length, STARS.length)
    if (e.star) this.audio.play('pickup')
    if (e.awaken) this.audio.play('win')
  }
}
