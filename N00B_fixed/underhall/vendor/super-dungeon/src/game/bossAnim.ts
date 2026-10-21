import * as THREE from 'three'
import { updateFollowers, type EnemyRig, type Follower } from './models'
import { Cape, type CapeOptions } from './actors'

export type BossGarment = { color: THREE.ColorRepresentation } & CapeOptions

type ClipSpec = [clip: string, opts?: { loop?: boolean; speed?: number; fade?: number }]

/** Drives a realistic boss body: per-state clips, bone followers, hit flash, dissolve and occlusion fade. */
export class BossAnimator {
  private lastT = -1
  private state = ''
  /** Simulated cloth garment (gown / mantle) sharing the hero cape's body collision. */
  private cape: Cape | null = null
  private faded = false
  private readonly lastPos = new THREE.Vector3()
  private readonly tmp = new THREE.Vector3()
  constructor(
    private readonly rig: EnemyRig & { followers?: Follower[] },
    private readonly clips: Record<string, ClipSpec>,
    private readonly garment?: BossGarment,
  ) {}
  get active(): boolean {
    return !!this.rig.char
  }
  update(state: string, t: number, flash: number, dissolve: number): void {
    const c = this.rig.char
    if (!c) return
    const dt = this.lastT < 0 ? 0 : Math.min(0.1, Math.max(0, t - this.lastT))
    this.lastT = t
    if (state !== this.state) {
      this.state = state
      const spec = this.clips[state]
      if (spec) c.play(spec[0], { fade: 0.25, force: true, ...spec[1] })
    }
    c.update(dt)
    c.time = t
    c.flash = flash
    c.dissolve = Math.min(1, Math.max(0, dissolve))
    updateFollowers(this.rig)
    this.updateCape(dt, t, dissolve)
  }

  private updateCape(dt: number, t: number, dissolve: number): void {
    const g = this.garment
    const c = this.rig.char
    if (!g || !c) return
    if (!this.cape) {
      this.cape = new Cape(g.color, c, this.rig.root, g)
      this.rig.root.add(this.cape.mesh)
      this.rig.root.getWorldPosition(this.lastPos)
    }
    const cape = this.cape
    // Dormant bosses are hidden: skip the sim and re-settle when they appear.
    if (!this.rig.root.visible) {
      cape.reset()
      return
    }
    const p = this.rig.root.getWorldPosition(this.tmp)
    const speed = dt > 0 ? Math.hypot(p.x - this.lastPos.x, p.z - this.lastPos.z) / dt : 0
    this.lastPos.copy(p)
    cape.update(dt, this.rig.body.rotation.y, t, Math.min(speed, 12))
    cape.opacity = (this.faded ? 0.3 : 1) * (1 - Math.min(1, Math.max(0, dissolve)))
  }
  /** Materials the owner's fade logic must treat as its own (not hide). */
  get materials(): THREE.Material[] {
    return this.rig.char?.materials ?? []
  }
  setFade(on: boolean): void {
    this.faded = on
    for (const m of this.materials) {
      m.transparent = on
      m.opacity = on ? 0.3 : 1
      m.depthWrite = !on
      m.needsUpdate = true
    }
  }
}
