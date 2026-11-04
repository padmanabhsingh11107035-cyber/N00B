import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import type { Quality } from './save'

type Preset = { pixelRatio: number; shadows: boolean; shadowMap: number; bloom: boolean; antialias: boolean; post: boolean }
export const QUALITY_PRESETS: Record<Quality, Preset> = {
  low: { pixelRatio: 1, shadows: false, shadowMap: 512, bloom: false, antialias: false, post: false },
  medium: { pixelRatio: 1.5, shadows: true, shadowMap: 1024, bloom: false, antialias: true, post: true },
  high: { pixelRatio: 2, shadows: true, shadowMap: 2048, bloom: true, antialias: true, post: true },
}

/** Pick a starting quality from device hints; the player can override it in Settings. */
export function suggestQuality(): Quality {
  const coarse = matchMedia('(pointer: coarse)').matches
  const cores = navigator.hardwareConcurrency ?? 4
  if (coarse || cores <= 4) return 'medium'
  return 'high'
}

/** Transient full-screen grading driven by gameplay (Flow Evade, true slash, hurt, roar). */
export type ScreenFx = { chroma: number; desat: number; vignette: number; tint: THREE.Color }

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uChroma: { value: 0 },
    uDesat: { value: 0 },
    uVignette: { value: 0 },
    uTint: { value: new THREE.Color('#000000') },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uChroma, uDesat, uVignette; uniform vec3 uTint; varying vec2 vUv;
    void main() {
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);
      vec2 off = d * uChroma * 0.035 * (0.3 + r2 * 3.0);
      vec3 c;
      c.r = texture2D(tDiffuse, vUv + off).r;
      c.g = texture2D(tDiffuse, vUv).g;
      c.b = texture2D(tDiffuse, vUv - off).b;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(c, vec3(l) * vec3(0.92, 1.0, 1.08), uDesat);
      float v = smoothstep(0.22, 0.75, r2 * 2.2) * uVignette;
      c = mix(c, uTint, v);
      gl_FragColor = vec4(c, 1.0);
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
  private grade?: ShaderPass
  /** Written by the game each frame; decays are owned by the caller. */
  readonly screen: ScreenFx = { chroma: 0, desat: 0, vignette: 0, tint: new THREE.Color('#000000') }
  private preset: Preset
  private scene?: THREE.Scene
  private camera?: THREE.PerspectiveCamera

  constructor(readonly canvas: HTMLCanvasElement, quality: Quality) {
    this.preset = QUALITY_PRESETS[quality]
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: this.preset.antialias, powerPreference: 'high-performance' })
    this.gl.outputColorSpace = THREE.SRGBColorSpace
    this.gl.toneMapping = THREE.ACESFilmicToneMapping
    this.gl.toneMappingExposure = 1
    this.gl.shadowMap.type = THREE.PCFShadowMap
    this.applyQuality(quality)
    window.addEventListener('resize', () => this.resize())
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
    if (!this.preset.post) return undefined
    if (this.composer && this.scene === scene && this.camera === camera) return this.composer
    this.scene = scene
    this.camera = camera
    const size = this.gl.getSize(new THREE.Vector2())
    this.composer = new EffectComposer(this.gl)
    this.composer.addPass(new RenderPass(scene, camera))
    if (this.preset.bloom) {
      this.bloom = new UnrealBloomPass(size, 0.4, 0.3, 1.7)
      this.composer.addPass(this.bloom)
    }
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

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    const w = this.canvas.clientWidth || window.innerWidth
    const h = this.canvas.clientHeight || window.innerHeight
    if (Math.abs(camera.aspect - w / h) > 1e-3) {
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    const composer = this.ensureComposer(scene, camera)
    if (this.grade) {
      const u = this.grade.uniforms
      u.uChroma.value = this.screen.chroma
      u.uDesat.value = this.screen.desat
      u.uVignette.value = this.screen.vignette
      u.uTint.value.copy(this.screen.tint)
      this.grade.enabled = this.screen.chroma > 0.002 || this.screen.desat > 0.002 || this.screen.vignette > 0.002
    }
    if (composer) composer.render()
    else this.gl.render(scene, camera)
  }
}
