import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import type { Quality } from './save'

type Preset = { pixelRatio: number; shadows: boolean; shadowMap: number; bloom: boolean; antialias: boolean; speedBlur: boolean }
export const QUALITY_PRESETS: Record<Quality, Preset> = {
  low: { pixelRatio: 1, shadows: false, shadowMap: 512, bloom: false, antialias: false, speedBlur: false },
  medium: { pixelRatio: 1.5, shadows: true, shadowMap: 1024, bloom: false, antialias: true, speedBlur: true },
  high: { pixelRatio: 2, shadows: true, shadowMap: 2048, bloom: true, antialias: true, speedBlur: true },
}

/**
 * Speed blur: samples along the ray toward the vanishing point, masked so the centre (rider,
 * upcoming obstacles) stays sharp while the screen edges streak. Adds a slight chromatic fringe.
 */
const SpeedBlurShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uStrength: { value: 0 },
    uCenter: { value: new THREE.Vector2(0.5, 0.56) },
    uAspect: { value: 1.6 },
  },
  vertexShader: `varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse;
uniform float uStrength;
uniform vec2 uCenter;
uniform float uAspect;
varying vec2 vUv;
void main() {
  vec2 d = vUv - uCenter;
  float r = length(d * vec2(uAspect, 1.0));
  float m = smoothstep(0.16, 0.85, r) * uStrength;
  if (m < 0.002) { gl_FragColor = texture2D(tDiffuse, vUv); return; }
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 10; i++) {
    float t = float(i) / 9.0;
    acc += texture2D(tDiffuse, vUv - d * t * 0.13 * m).rgb;
  }
  vec3 col = acc / 10.0;
  float ca = 0.012 * m;
  col.r = mix(col.r, texture2D(tDiffuse, vUv + d * ca).r, 0.6);
  col.b = mix(col.b, texture2D(tDiffuse, vUv - d * ca).b, 0.6);
  gl_FragColor = vec4(col, 1.0);
}`,
}

/** Pick a starting quality from device hints; the player can override it in Settings. */
export function suggestQuality(): Quality {
  const coarse = matchMedia('(pointer: coarse)').matches
  const cores = navigator.hardwareConcurrency ?? 4
  if (coarse || cores <= 4) return 'medium'
  return 'high'
}

/**
 * Owns the WebGL renderer, the optional post-processing chain and resize handling.
 * Scenes call `render(scene, camera)`; they never touch the composer directly.
 */
export class Renderer {
  readonly gl: THREE.WebGLRenderer
  private composer?: EffectComposer
  private bloom?: UnrealBloomPass
  private blur?: ShaderPass
  private speedFx = 0
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
    this.blur = undefined
    this.resize()
  }

  private ensureComposer(scene: THREE.Scene, camera: THREE.PerspectiveCamera): EffectComposer | undefined {
    if (!this.preset.bloom && !this.preset.speedBlur) return undefined
    if (this.composer && this.scene === scene && this.camera === camera) return this.composer
    this.scene = scene
    this.camera = camera
    const size = this.gl.getSize(new THREE.Vector2())
    this.composer = new EffectComposer(this.gl)
    this.composer.addPass(new RenderPass(scene, camera))
    if (this.preset.bloom) {
      this.bloom = new UnrealBloomPass(size, 0.45, 0.3, 1.6)
      this.composer.addPass(this.bloom)
    }
    if (this.preset.speedBlur) {
      this.blur = new ShaderPass(SpeedBlurShader)
      this.composer.addPass(this.blur)
    }
    this.composer.addPass(new OutputPass())
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

  /** 0..1 speed effect strength for the blur pass (ignored on Low quality). */
  setSpeedFx(amount: number): void {
    this.speedFx = Math.min(1, Math.max(0, amount))
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    const w = this.canvas.clientWidth || window.innerWidth
    const h = this.canvas.clientHeight || window.innerHeight
    if (Math.abs(camera.aspect - w / h) > 1e-3) {
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    const composer = this.ensureComposer(scene, camera)
    if (this.blur) {
      this.blur.uniforms.uStrength.value = this.speedFx
      this.blur.uniforms.uAspect.value = w / h
      this.blur.enabled = this.speedFx > 0.01
    }
    if (composer) composer.render()
    else this.gl.render(scene, camera)
  }
}
