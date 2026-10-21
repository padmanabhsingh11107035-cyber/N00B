import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { setMaxAnisotropy } from '../game/assets3d'
import type { Quality } from './save'

type Preset = { pixelRatio: number; shadows: boolean; shadowMap: number; bloom: boolean; antialias: boolean }
export const QUALITY_PRESETS: Record<Quality, Preset> = {
  low: { pixelRatio: 1, shadows: false, shadowMap: 512, bloom: false, antialias: false },
  medium: { pixelRatio: 1.5, shadows: true, shadowMap: 1024, bloom: true, antialias: true },
  high: { pixelRatio: 2, shadows: true, shadowMap: 2048, bloom: true, antialias: true },
}

/** Pick a starting quality from device hints; the player can override it in Settings. */
export function suggestQuality(): Quality {
  const coarse = matchMedia('(pointer: coarse)').matches
  const cores = navigator.hardwareConcurrency ?? 4
  if (coarse || cores <= 4) return 'medium'
  return 'high'
}

/**
 * Display-space finishing pass: gentle split-tone grade (cool shadows, warm highlights),
 * vignette and a whisper of film grain. Runs after tone mapping.
 */
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uVignette: { value: 0.32 }, uGrain: { value: 0.025 } },
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVignette; uniform float uGrain;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      vec3 shadowTint = vec3(0.93, 0.97, 1.08);
      vec3 highTint = vec3(1.05, 1.0, 0.94);
      c.rgb *= mix(shadowTint, highTint, smoothstep(0.15, 0.75, l));
      c.rgb = mix(vec3(l), c.rgb, 1.06);
      vec2 d = vUv - 0.5;
      c.rgb *= 1.0 - uVignette * smoothstep(0.25, 0.85, dot(d, d) * 2.2);
      c.rgb += (hash(vUv * 1024.0 + uTime) - 0.5) * uGrain;
      gl_FragColor = c;
    }`,
}

/**
 * Owns the WebGL renderer, the optional post-processing chain and resize handling.
 * Scenes call `render(scene, camera)`; they never touch the composer directly.
 */
export class Renderer {
  readonly gl: THREE.WebGLRenderer
  private composer?: EffectComposer
  private bloom?: UnrealBloomPass
  private preset: Preset
  private scene?: THREE.Scene
  private camera?: THREE.PerspectiveCamera
  private grade?: ShaderPass
  private env?: THREE.Texture

  constructor(readonly canvas: HTMLCanvasElement, quality: Quality) {
    this.preset = QUALITY_PRESETS[quality]
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: this.preset.antialias, powerPreference: 'high-performance' })
    this.gl.outputColorSpace = THREE.SRGBColorSpace
    this.gl.toneMapping = THREE.ACESFilmicToneMapping
    this.gl.toneMappingExposure = 1
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap
    setMaxAnisotropy(this.gl.capabilities.getMaxAnisotropy())
    this.applyQuality(quality)
    window.addEventListener('resize', () => this.resize())
  }

  /** Neutral studio-room reflection probe (PMREM), shared by every scene for PBR image lighting. */
  get environment(): THREE.Texture {
    if (!this.env) {
      const pm = new THREE.PMREMGenerator(this.gl)
      this.env = pm.fromScene(new RoomEnvironment(), 0.04).texture
      pm.dispose()
    }
    return this.env
  }

  get shadowMapSize(): number {
    return this.preset.shadowMap
  }

  applyQuality(quality: Quality): void {
    this.preset = QUALITY_PRESETS[quality]
    this.gl.shadowMap.enabled = this.preset.shadows
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.preset.pixelRatio))
    this.bloom?.dispose()
    this.composer?.dispose()
    this.composer = undefined
    this.bloom = undefined
    this.grade = undefined
    this.resize()
  }

  private ensureComposer(scene: THREE.Scene, camera: THREE.PerspectiveCamera): EffectComposer | undefined {
    if (!this.preset.bloom) return undefined
    if (this.composer && this.scene === scene && this.camera === camera) return this.composer
    this.scene = scene
    this.camera = camera
    const size = this.gl.getSize(new THREE.Vector2())
    this.composer = new EffectComposer(this.gl)
    this.composer.addPass(new RenderPass(scene, camera))
    const half = this.preset.pixelRatio < 2
    this.bloom = new UnrealBloomPass(half ? size.clone().multiplyScalar(0.5) : size, 0.4, 0.4, 1.25)
    this.composer.addPass(this.bloom)
    this.composer.addPass(new OutputPass())
    this.grade = new ShaderPass(GradeShader)
    this.composer.addPass(this.grade)
    this.composer.setSize(size.x, size.y)
    return this.composer
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth
    const h = this.canvas.clientHeight || window.innerHeight
    this.gl.setSize(w, h, false)
    this.composer?.setSize(w, h)
    if (this.camera) {
      this.camera.aspect = w / h
      this.camera.updateProjectionMatrix()
    }
  }

  /**
   * Compile every material under `object` without drawing, lit by `scene`'s lights and fog.
   * With bloom on, the scene is drawn into the composer's render target, and three.js builds
   * different programs for that target (no tone mapping, linear output), so warm against it.
   */
  async warm(object: THREE.Object3D, scene: THREE.Scene, camera: THREE.PerspectiveCamera): Promise<void> {
    const composer = this.ensureComposer(scene, camera)
    // compile() skips the shadow pass and post-processing, so proxies for those ride along.
    const extras = this.warmProxies(object, composer)
    object.add(extras)
    try {
      if (this.parallelCompile) await this.warmAsync(object, scene, camera, composer)
      else await this.warmIncremental(object, scene, camera, composer)
    } finally {
      extras.removeFromParent()
    }
  }

  /** KHR_parallel_shader_compile: the driver compiles in the background and tells us when it's done. */
  private get parallelCompile(): boolean {
    return this.gl.extensions.has('KHR_parallel_shader_compile')
  }

  private async warmAsync(object: THREE.Object3D, scene: THREE.Scene, camera: THREE.PerspectiveCamera, composer?: EffectComposer): Promise<void> {
    const prev = this.gl.getRenderTarget()
    let pending: Promise<unknown>
    try {
      if (composer) this.gl.setRenderTarget(composer.readBuffer)
      // Programs are created synchronously here; compileAsync then waits for the driver.
      pending = this.gl.compileAsync(object, camera, scene)
    } finally {
      this.gl.setRenderTarget(prev)
    }
    await pending
    await this.settlePrograms()
  }

  /**
   * Without the extension there's no way to know when a program is done, and the first blocking
   * GL query waits for every queued compile. So create and finish programs a few meshes at a
   * time, yielding a frame whenever the budget is spent: many short slices instead of one stall.
   */
  private async warmIncremental(object: THREE.Object3D, scene: THREE.Scene, camera: THREE.PerspectiveCamera, composer?: EffectComposer, budgetMs = 12): Promise<void> {
    const meshes: THREE.Object3D[] = []
    const seen = new Set<string>()
    object.traverse(o => {
      const m = (o as THREE.Mesh).material
      if (!m) return
      const kind = (o as THREE.SkinnedMesh).isSkinnedMesh ? 's' : (o as THREE.InstancedMesh).isInstancedMesh ? 'i' : (o as THREE.Points).isPoints ? 'p' : (o as THREE.Sprite).isSprite ? 'r' : 'm'
      const key = `${kind}|${(Array.isArray(m) ? m : [m]).map(x => x.uuid).join(',')}`
      if (seen.has(key)) return
      seen.add(key)
      meshes.push(o)
    })
    let start = performance.now()
    for (const mesh of meshes) {
      const prev = this.gl.getRenderTarget()
      try {
        if (composer) this.gl.setRenderTarget(composer.readBuffer)
        this.gl.compile(mesh, camera, scene)
      } finally {
        this.gl.setRenderTarget(prev)
      }
      this.settleNow()
      if (performance.now() - start > budgetMs) {
        await new Promise<void>(res => requestAnimationFrame(() => res()))
        start = performance.now()
      }
    }
  }

  /** Finish every program created so far (see settlePrograms). */
  private settleNow(): void {
    for (const p of (this.gl.info.programs ?? []) as unknown as Array<{ getUniforms(): unknown; getAttributes(): unknown }>) {
      if (this.settled.has(p)) continue
      this.settled.add(p)
      p.getUniforms()
      p.getAttributes()
    }
  }

  private readonly settled = new WeakSet<object>()

  /**
   * Finish compiling new programs a few per frame. Without KHR_parallel_shader_compile,
   * compileAsync can't tell when the driver is done, so the first frame would block on every
   * program at once; three's first-use step (uniform lookup + error check) forces one program
   * to finish, and doing that within a frame budget keeps the page responsive meanwhile.
   * With the extension, programs are already done and this is nearly free.
   */
  private async settlePrograms(budgetMs = 12): Promise<void> {
    const programs = (this.gl.info.programs ?? []) as unknown as Array<{ getUniforms(): unknown; getAttributes(): unknown }>
    let start = performance.now()
    for (const p of programs) {
      if (this.settled.has(p)) continue
      this.settled.add(p)
      p.getUniforms()
      p.getAttributes()
      if (performance.now() - start > budgetMs) {
        await new Promise<void>(res => requestAnimationFrame(() => res()))
        start = performance.now()
      }
    }
  }

  /**
   * Upload every texture the scene uses to the GPU a few at a time (about `budgetMs` of work per
   * frame), so a freshly built scene's first frame doesn't upload them all in one long stall.
   */
  async prime(scene: THREE.Object3D, budgetMs = 8): Promise<void> {
    const textures = new Set<THREE.Texture>()
    scene.traverse(o => {
      const m = (o as THREE.Mesh).material
      if (!m) return
      for (const mat of Array.isArray(m) ? m : [m]) {
        for (const value of Object.values(mat)) if ((value as THREE.Texture)?.isTexture) textures.add(value as THREE.Texture)
        const uniforms = (mat as THREE.ShaderMaterial).uniforms
        if (uniforms) for (const u of Object.values(uniforms)) if ((u?.value as THREE.Texture)?.isTexture) textures.add(u.value as THREE.Texture)
      }
    })
    let start = performance.now()
    for (const t of textures) {
      if (!t.image || (t as THREE.CubeTexture).isCubeTexture) continue
      this.gl.initTexture(t)
      if (performance.now() - start > budgetMs) {
        await new Promise<void>(res => requestAnimationFrame(() => res()))
        start = performance.now()
      }
    }
  }

  private readonly depthProxyMaterial = new THREE.MeshDepthMaterial()

  /**
   * Stand-ins that make compileAsync build the programs the first real frame would otherwise
   * compile synchronously: the shadow pass's depth material for each kind of shadow caster
   * (plain / instanced / skinned, alpha-tested) and the post-processing pass materials.
   * Programs are cached by their parameters, so matching the kind of object is enough.
   */
  private warmProxies(object: THREE.Object3D, composer?: EffectComposer): THREE.Group {
    const g = new THREE.Group()
    g.name = 'warm-proxies'
    const seen = new Set<string>()
    if (this.gl.shadowMap.enabled) {
      object.traverse(o => {
        const mesh = o as THREE.Mesh
        if (!mesh.isMesh || !mesh.castShadow) return
        const src = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial
        const alpha = !!src && src.alphaTest > 0 && !!(src.map || src.alphaMap)
        const kind = (mesh as THREE.SkinnedMesh).isSkinnedMesh ? 'skin' : (mesh as THREE.InstancedMesh).isInstancedMesh ? 'inst' : 'mesh'
        const key = `${kind}|${alpha}|${!!mesh.geometry.morphAttributes.position}`
        if (seen.has(key)) return
        seen.add(key)
        let mat: THREE.Material = this.depthProxyMaterial
        if (alpha) {
          const m = this.depthProxyMaterial.clone()
          m.map = src.map
          m.alphaMap = src.alphaMap
          m.alphaTest = src.alphaTest
          mat = m
        }
        let proxy: THREE.Object3D
        if (kind === 'skin') {
          const sk = mesh as THREE.SkinnedMesh
          const p = new THREE.SkinnedMesh(sk.geometry, mat)
          p.bind(sk.skeleton, sk.bindMatrix)
          proxy = p
        } else if (kind === 'inst') proxy = new THREE.InstancedMesh(mesh.geometry, mat, 1)
        else proxy = new THREE.Mesh(mesh.geometry, mat)
        proxy.frustumCulled = false
        g.add(proxy)
      })
    }
    if (composer) {
      const quad = new THREE.PlaneGeometry(2, 2)
      const mats = new Set<THREE.Material>()
      const collect = (v: unknown) => {
        if ((v as THREE.Material)?.isMaterial) mats.add(v as THREE.Material)
        else if (Array.isArray(v)) v.forEach(collect)
      }
      for (const pass of composer.passes) {
        for (const v of Object.values(pass)) collect(v)
        const fs = (pass as unknown as { fsQuad?: { material?: THREE.Material } }).fsQuad
        if (fs?.material) collect(fs.material)
      }
      for (const m of mats) {
        const q = new THREE.Mesh(quad, m)
        q.frustumCulled = false
        g.add(q)
      }
    }
    return g
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    const w = this.canvas.clientWidth || window.innerWidth
    const h = this.canvas.clientHeight || window.innerHeight
    if (Math.abs(camera.aspect - w / h) > 1e-3) {
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    const composer = this.ensureComposer(scene, camera)
    if (this.grade) this.grade.uniforms.uTime.value = (performance.now() / 1000) % 100
    if (composer) composer.render()
    else this.gl.render(scene, camera)
  }
}
