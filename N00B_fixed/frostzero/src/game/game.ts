import * as THREE from 'three'
import type { Audio } from '../engine/audio'
import type { Input } from '../engine/input'
import type { Renderer } from '../engine/renderer'
import type { Quality } from '../engine/save'
import { QUALITY_PRESETS } from '../engine/renderer'
import { choose } from './autopilot'
import { ChaseCamera } from './camera'
import { CONFIG } from './config'
import { Effects } from './fx'
import { LEVEL } from './level'
import { RiderView } from './rider'
import { createRun, die, finish, reachCheckpoint, tick, type RunState } from './rules'
import { createSim, respawn, stepSim, type DeathCause, type SimEvent, type SimInput, type SimState } from './sim'
import { World } from './world'

export type Mode = 'attract' | 'playing' | 'paused' | 'dying' | 'ended'

export type GameHooks = {
  death: (cause: DeathCause, run: RunState) => void
  checkpoint: (index: number, total: number) => void
  section: (key: string, hint: string | null) => void
  finish: (run: RunState) => void
  perfect: () => void
  boost: () => void
  respawned: () => void
}

export type HudInfo = {
  time: number
  deaths: number
  kmh: number
  progress: number
  checkpoints: number[]
  danger: number
  boost: number
  grinding: boolean
}

const DT = 1 / 60

export class Game {
  mode: Mode = 'attract'
  run: RunState = createRun()
  sim: SimState
  private readonly world: World
  private readonly rider = new RiderView()
  private readonly cam = new ChaseCamera()
  private readonly fx = new Effects()
  private readonly prev = new THREE.Vector3()
  private readonly cur = new THREE.Vector3()
  private readonly view = new THREE.Vector3()
  private readonly events: SimEvent[] = []
  private dyingLeft = 0
  private pausedFrom: Mode = 'playing'
  private botPlan: ReturnType<typeof choose> | null = null
  private botStep = 0
  private steps = 0
  private orbit = 0
  private sparkT = 0
  private sprayT = 0
  private readonly sprayVel = new THREE.Vector3()
  private danger = 0
  /** True if at least one fixed step ran since the last `takeStepped()`. */
  private stepped = false
  reducedMotion = false

  constructor(private readonly renderer: Renderer, private readonly input: Input, private readonly audio: Audio, private readonly hooks: GameHooks) {
    this.world = new World(LEVEL, renderer.shadowMapSize)
    this.world.buildChunks()
    const scene = this.world.scene
    scene.add(this.rider.root, ...this.rider.extras, this.fx.mesh, this.cam.camera)
    this.sim = createSim(LEVEL, 0)
    this.snapView()
  }

  set motionReduced(v: boolean) {
    this.reducedMotion = v
    this.cam.reducedMotion = v
  }

  private snapView(): void {
    const p = this.sim.p
    this.cur.set(p.x, p.y, p.z)
    this.prev.copy(this.cur)
    this.cam.snap(this.cur)
    this.rider.resetTrail()
    this.rider.visible = true
  }

  // ── Mode control ────────────────────────────────────────────────────────
  start(): void {
    this.run = createRun()
    this.sim = createSim(LEVEL, 0)
    this.mode = 'playing'
    this.fx.clear()
    this.audio.setIntensity(1)
    this.snapView()
    this.hooks.section(LEVEL.sections[0].key, LEVEL.sections[0].hint)
  }

  /** The run as it stands now (for saving it at a checkpoint). */
  runState(): RunState {
    return this.run
  }

  /** Continue a saved run: the rider stands on the saved checkpoint, with the time and deaths so far. */
  startFrom(cp: number, elapsed: number, deaths: number): void {
    const n = Math.max(0, Math.min(LEVEL.checkpoints.length - 1, Math.floor(cp)))
    this.run = { ...createRun(), checkpoint: n, elapsed: Math.max(0, elapsed), deaths: Math.max(0, Math.floor(deaths)) }
    this.sim = createSim(LEVEL, n)
    this.mode = 'playing'
    this.fx.clear()
    this.audio.setIntensity(1)
    this.snapView()
    const sec = LEVEL.sections[this.sim.section] ?? LEVEL.sections[0]
    this.hooks.section(sec.key, sec.hint)
  }

  /** Back to the last checkpoint without the death animation (pause menu / after a mistake). */
  retryCheckpoint(): void {
    if (this.mode !== 'playing' && this.mode !== 'paused' && this.mode !== 'dying') return
    this.run = die(this.run)
    respawn(this.sim, LEVEL)
    this.mode = 'playing'
    this.snapView()
    this.hooks.respawned()
  }

  pause(): void {
    if (this.mode !== 'playing' && this.mode !== 'dying') return
    this.pausedFrom = this.mode
    this.mode = 'paused'
  }

  resume(): void {
    if (this.mode === 'paused') this.mode = this.pausedFrom
  }

  toTitle(): void {
    this.mode = 'attract'
    this.run = createRun()
    this.sim = createSim(LEVEL, 0)
    this.botPlan = null
    this.audio.setIntensity(0)
    this.fx.clear()
    this.snapView()
  }

  setQuality(q: Quality): void {
    this.renderer.applyQuality(q)
    const size = QUALITY_PRESETS[q].shadowMap
    const sh = this.world.sun.shadow
    if (sh.mapSize.x !== size) {
      sh.mapSize.set(size, size)
      sh.map?.dispose()
      sh.map = null
    }
  }

  takeStepped(): boolean {
    const s = this.stepped
    this.stepped = false
    return s
  }

  // ── Fixed step ──────────────────────────────────────────────────────────
  step(dt: number): void {
    this.stepped = true
    this.steps += 1
    if (this.mode === 'paused') return
    const p = this.sim.p
    this.prev.set(p.x, p.y, p.z)

    if (this.mode === 'attract') {
      if (this.steps % 6 === 0 || !this.botPlan) {
        this.botPlan = choose(this.sim, LEVEL)
        this.botStep = 0
      }
      const b = this.botPlan
      const inp: SimInput = { steer: b.steer, brake: b.brake, jumpPressed: b.jump > 0 && this.botStep === 0, jumpHeld: b.jump === 2, slamPressed: b.slam && this.botStep === 0 }
      this.botStep += 1
      this.events.length = 0
      stepSim(this.sim, LEVEL, inp, dt, this.events)
      this.handleEvents(false)
      if (this.sim.dead) {
        respawn(this.sim, LEVEL)
        this.snapView()
      } else if (this.sim.finished) {
        this.sim = createSim(LEVEL, 0)
        this.snapView()
      }
      this.cur.set(this.sim.p.x, this.sim.p.y, this.sim.p.z)
      return
    }

    if (this.mode === 'playing' || this.mode === 'dying') this.run = tick(this.run, dt)
    if (this.mode === 'dying') {
      this.dyingLeft -= dt
      if (this.dyingLeft <= 0) {
        respawn(this.sim, LEVEL)
        this.mode = 'playing'
        this.snapView()
        this.hooks.respawned()
      }
      return
    }
    if (this.mode !== 'playing') return

    if (this.input.consume('restart')) {
      this.start()
      return
    }
    const inp: SimInput = {
      // The chase camera looks down +z, so world +x is screen-left: flip so right means right.
      steer: -this.input.move.x,
      brake: this.input.move.y < -0.5,
      jumpPressed: this.input.consume('jump'),
      jumpHeld: this.input.held('jump'),
      slamPressed: this.input.consume('sprint') || this.input.consume('dash'),
    }
    this.events.length = 0
    stepSim(this.sim, LEVEL, inp, dt, this.events)
    this.cur.set(this.sim.p.x, this.sim.p.y, this.sim.p.z)
    this.handleEvents(true)
  }

  private handleEvents(live: boolean): void {
    const p = this.sim.p
    const at = this.view.set(p.x, p.y + 0.2, p.z)
    for (const e of this.events) {
      switch (e.type) {
        case 'jump':
          if (live) this.audio.play('jump')
          this.fx.puff(at, 0.4)
          break
        case 'land':
          if (live) this.audio.play(e.slam ? 'perfect' : 'land')
          this.fx.puff(at, 0.4 + e.impact)
          this.cam.addShake(e.impact * 0.45 + (e.slam ? 0.4 : 0))
          if (e.slam) {
            this.cam.addKick(0.6)
            this.fx.burst(at, 0x7ff7ff, 26, 9)
            if (live) this.hooks.perfect()
          }
          break
        case 'slam':
          if (live) this.audio.play('slam')
          break
        case 'boost':
          if (live) {
            this.audio.play('boost')
            this.hooks.boost()
          }
          this.cam.addKick(1)
          this.fx.burst(at, 0x57f4ff, 18, 7)
          break
        case 'grind':
          if (live) this.audio.play('grind')
          this.fx.burst(at, 0xff6af0, 14, 6)
          break
        case 'crumble':
          if (live) this.audio.play('crumble')
          break
        case 'checkpoint':
          if (!live) break
          this.run = reachCheckpoint(this.run, e.index)
          this.audio.play('checkpoint')
          this.hooks.checkpoint(e.index, LEVEL.checkpoints.length - 1)
          break
        case 'section':
          if (!live) break
          this.audio.play('section')
          this.hooks.section(LEVEL.sections[e.index].key, LEVEL.sections[e.index].hint)
          break
        case 'death':
          this.fx.burst(at.setY(p.y + 0.9), 0xff5a2a, 40, 12)
          this.fx.burst(at, 0xeaf6ff, 30, 9)
          this.cam.addShake(1)
          this.rider.visible = false
          if (!live) break
          this.audio.play('death')
          this.run = die(this.run)
          this.mode = 'dying'
          this.dyingLeft = CONFIG.run.respawnDelay
          this.hooks.death(e.cause, this.run)
          break
        case 'finish':
          if (!live) break
          this.run = finish(this.run)
          this.mode = 'ended'
          this.audio.play('win')
          this.fx.burst(at.setY(p.y + 1.2), 0xffd35c, 60, 12)
          this.hooks.finish(this.run)
          break
      }
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────
  render(alpha: number, frameSeconds: number): void {
    const p = this.sim.p
    const frozen = this.mode === 'paused'
    const dt = frozen ? 0 : frameSeconds
    const a = frozen || this.mode === 'dying' || this.mode === 'ended' ? 1 : alpha
    this.view.lerpVectors(this.prev, this.cur, a)
    const simT = Math.max(0, this.sim.t - (1 - a) * DT)
    const speed01 = Math.min(1, Math.max(0, (p.speed - 20) / 28))
    const gap = p.z - this.sim.wallZ
    const dangerTarget = this.mode === 'playing' || this.mode === 'dying' ? Math.min(1, Math.max(0, 1 - (gap - 5) / 24)) : 0
    this.danger += (dangerTarget - this.danger) * (1 - Math.exp(-frameSeconds * 5))

    if (this.mode !== 'dying') this.rider.update(Math.max(dt, 1e-4), this.view, p, this.steps * DT)
    if (this.mode === 'ended') {
      this.orbit += frameSeconds * 0.35
      const cam = this.cam.camera
      cam.position.set(this.view.x + Math.sin(this.orbit) * 7, this.view.y + 2.6, this.view.z + Math.cos(this.orbit) * 7)
      cam.lookAt(this.view.x, this.view.y + 1.2, this.view.z)
    } else if (!frozen) {
      if (this.danger > 0.6) this.cam.addShake(frameSeconds * this.danger * 0.8)
      this.cam.update(frameSeconds, this.view, p.vx, speed01, !p.grounded)
    }
    if (!frozen) {
      this.world.update(frameSeconds, simT, this.sim, this.view, this.cam.camera)
      // Rail sparks and carve spray.
      this.sparkT -= frameSeconds
      if (p.rail >= 0 && this.sparkT <= 0 && this.mode !== 'dying') {
        this.sparkT = 0.04
        this.fx.burst(this.view.clone().setY(this.view.y + 0.1), Math.random() > 0.5 ? 0xff6af0 : 0xfff0a0, 3, 5)
      }
      // Snow spray off the board: outward from carves, a big curtain on hockey stops.
      this.sprayT -= frameSeconds
      if (p.grounded && p.rail < 0 && this.sprayT <= 0 && this.mode !== 'dying' && this.mode !== 'ended' && this.rider.root.visible) {
        this.sprayT = 0.03
        const carve = Math.min(1, Math.abs(this.rider.edge) / 0.5)
        const skid = this.rider.skid
        const n = Math.round(1 + carve * 3 + skid * 7 + speed01)
        const side = p.vx > 0 ? -1 : 1
        this.sprayVel.set(side * (1.5 + carve * 7) + skid * 3, 2 + carve * 2.5 + skid * 3.5, -p.speed * 0.15 + skid * p.speed * 0.45)
        this.fx.spray(skid > 0.3 ? this.rider.noseWorld : this.rider.tailWorld, this.sprayVel, n, 0.8 + skid * 0.9)
      }
      this.fx.update(frameSeconds)
    }
    const live = this.mode === 'playing' || this.mode === 'dying'
    this.audio.setLayers(live ? 0.25 + speed01 * 0.75 : this.mode === 'attract' ? 0.2 : 0.1, live ? this.danger : 0, live && p.rail >= 0 ? 1 : 0)
    const blur = live || this.mode === 'attract' ? speed01 * speed01 * 0.85 + this.cam.kickAmount * 0.5 + (p.slam ? 0.25 : 0) : 0
    this.renderer.setSpeedFx(this.reducedMotion ? blur * 0.4 : blur)
    this.renderer.render(this.world.scene, this.cam.camera)
  }

  hud(): HudInfo {
    const p = this.sim.p
    return {
      time: this.run.elapsed,
      deaths: this.run.deaths,
      kmh: Math.round(p.speed * 3.6),
      progress: Math.min(1, Math.max(0, p.z / LEVEL.finishZ)),
      checkpoints: LEVEL.checkpoints.slice(1).map(c => c.z / LEVEL.finishZ),
      danger: this.danger,
      boost: Math.min(1, p.boost / 12),
      grinding: p.rail >= 0,
    }
  }
}
