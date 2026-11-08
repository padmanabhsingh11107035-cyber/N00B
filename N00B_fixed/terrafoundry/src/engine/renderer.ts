import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import type { Quality } from './save'

type Preset = { pixelRatio: number; shadows: boolean; shadowMap: number; bloom: boolean; antialias: boolean }
export const QUALITY_PRESETS: Record<Quality, Preset> = {
  low: { pixelRatio: 1.4, shadows: false, shadowMap: 512, bloom: false, antialias: true },
  medium: { pixelRatio: 1.5, shadows: true, shadowMap: 1024, bloom: true, antialias: true },
  high: { pixelRatio: 2, shadows: true, shadowMap: 2048, bloom: true, antialias: true },
}

/** Pick a starting quality from device hints; the player can override it in Settings. */
export function suggestQuality(): Quality {
  const coarse = matchMedia('(pointer: coarse)').matches
  const cores = navigator.hardwareConcurrency ?? 4
  if (coarse || cores <= 4) return 'low'
  return 'medium'
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
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.preset.pixelRatio) * this.resScale)
    this.bloom?.dispose()
    this.composer?.dispose()
    this.composer = undefined
    this.bloom = undefined
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
    this.bloom = new UnrealBloomPass(size, 0.34, 0.28, 1.35)
    this.composer.addPass(this.bloom)
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


  /** Adaptive resolution: 1 = the preset's sharpness. The game lowers it by itself when frames take too long and gives it back when there is room, so it stays smooth on any device. */
  private resScale = 1
  private resSlow = 0
  private resFast = 0
  private resLast = 0

  private adaptRes(): void {
    const now = performance.now() / 1000
    const dt = this.resLast ? now - this.resLast : 0
    this.resLast = now
    if (dt <= 0 || dt > 0.25) return
    if (dt > 0.024) { this.resSlow += dt; this.resFast = 0 }
    else if (dt < 0.0185) { this.resFast += dt; this.resSlow = Math.max(0, this.resSlow - dt) }
    let next = this.resScale
    if (this.resSlow > 0.6 && this.resScale > 0.5) { next = Math.max(0.5, this.resScale - 0.12); this.resSlow = 0 }
    else if (this.resFast > 5 && this.resScale < 1) { next = Math.min(1, this.resScale + 0.06); this.resFast = 0 }
    if (next !== this.resScale) {
      this.gl.setPixelRatio(this.gl.getPixelRatio() * (next / this.resScale))
      this.resScale = next
      this.resize()
    }
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    this.adaptRes()
    const w = this.canvas.clientWidth || window.innerWidth
    const h = this.canvas.clientHeight || window.innerHeight
    if (Math.abs(camera.aspect - w / h) > 1e-3) {
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    const composer = this.ensureComposer(scene, camera)
    if (composer) composer.render()
    else this.gl.render(scene, camera)
  }
}
