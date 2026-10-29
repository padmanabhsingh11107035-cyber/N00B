import * as THREE from 'three'
import type { Audio, Sfx } from '../engine/audio'
import type { Input } from '../engine/input'
import type { Renderer } from '../engine/renderer'
import type { Quality } from '../engine/save'
import type { TimeScale } from '../engine/timescale'
import { launchVelocity, releasePoint, type Aim } from './aim'
import { ArtKit, PALETTE } from './art'
import { CameraDirector } from './camera'
import { Catapult } from './catapult'
import { CONFIG } from './config'
import { Effects } from './fx'
import { CATAPULT_BASE, RELEASE_LOCAL } from './layout'
import { LEVELS, guardCount, type LevelDef } from './levels'
import { createRun, destroy, fire, guardDown, resolveShot, stars, tick, type RunState } from './rules'
import { SiegeSim, type SimEvent } from './sim'
import { World } from './world'

export type GameMode = 'title' | 'intro' | 'aiming' | 'flight' | 'watching' | 'finale' | 'ended'
export type PopupKind = 'score' | 'guard' | 'chain' | 'boom' | 'info'
export type Hint = 'aim' | 'pitch' | 'survey' | 'powder' | 'skip' | null

export type GameHooks = {
  popup(text: string, x: number, y: number, kind: PopupKind): void
  hint(hint: Hint): void
  /** Short banner text (level intro, "last stone!"). */
  banner(key: string, vars?: Record<string, string | number>): void
  end(run: RunState, level: LevelDef, stars: number): void
  flash(strength: number): void
  tutorialDone(): void
  /** Localized text for in-world popups. */
  t(key: string, vars?: Record<string, string | number>): string
}

export type HudState = {
  ammo: number
  ammoMax: number
  guardsLeft: number
  guardsTotal: number
  score: number
  pitchDeg: number
  yawDeg: number
  power: number
  charging: boolean
  mode: GameMode
  canSkip: boolean
  survey: boolean
  level: number
  chain: number
}

const WOOD = new THREE.Color(PALETTE.wood[0])
const STONE = new THREE.Color(PALETTE.stone[0])
const POWDER = new THREE.Color(PALETTE.powder)
const DUST_WOOD = new THREE.Color(0xd9c29a)
const DUST_STONE = new THREE.Color(0xc9c5bb)

export class Game {
  mode: GameMode = 'title'
  paused = false
  run!: RunState
  level: LevelDef = LEVELS[0]
  reducedMotion = false
  slowmoEnabled = true
  invertDrag = false
  tutorial = false
  private scene = new THREE.Scene()
  private world!: World
  private art!: ArtKit
  private fx!: Effects
  private sim!: SiegeSim
  private catapult!: Catapult
  private director: CameraDirector
  private aim: Aim = { yaw: 0, pitch: CONFIG.aim.startPitch, power: 0 }
  private charging: 'drag' | 'key' | 'pad' | 'touch' | null = null
  private dragBase = { yaw: 0 }
  private survey = false
  private shotTime = 0
  private hitTime = -1
  private finaleTime = 0
  private time = 0
  private gameTime = 0
  private quality: Quality
  private pendingLaunch = false
  private lastCreak = 0
  private hintShown = new Set<Hint>()
  private currentHint: Hint = null
  private shotBroke = 0
  private flightTimer = 0
  private titleSpin = 0

  constructor(
    private readonly renderer: Renderer,
    private readonly input: Input,
    private readonly audio: Audio,
    private readonly timeScale: TimeScale,
    private readonly hooks: GameHooks,
    quality: Quality,
    private readonly projectileModel?: THREE.Object3D,
  ) {
    this.quality = quality
    this.director = new CameraDirector(window.innerWidth / Math.max(1, window.innerHeight), CONFIG.camera.fov)
    this.timeScale.onChange(s => this.audio.setWarp(s))
    this.build(LEVELS[0])
    this.director.set('title', true)
  }

  // ─── scene lifecycle ────────────────────────────────────────────────────

  private build(level: LevelDef): void {
    this.dispose()
    this.level = level
    this.scene = new THREE.Scene()
    const detail = this.quality
    this.world = new World(level.theme, detail, level.center[2])
    this.world.setShadowSize(this.renderer.shadowMapSize)
    this.scene.add(this.world.group)
    this.scene.fog = new THREE.Fog(this.world.fogColor, this.world.theme.fogNear, this.world.theme.fogFar)
    this.renderer.gl.toneMappingExposure = this.world.theme.exposure
    this.art = new ArtKit(this.projectileModel)
    this.fx = new Effects(detail)
    this.scene.add(this.fx.group)
    this.sim = new SiegeSim(level, {
      create: (spec, fragment) => this.art.piece(spec, fragment),
      ball: r => this.art.ball(r),
      damaged: obj => this.art.crack(obj),
      dazed: obj => this.art.daze(obj),
    })
    this.sim.debrisScale = detail === 'low' ? 0.5 : 1
    this.scene.add(this.sim.root)
    this.catapult = new Catapult(this.art.ball(CONFIG.ball.radius), this.art.solid)
    this.scene.add(this.catapult.root, ...this.catapult.extras)
    this.director.setCastle(new THREE.Vector3(...level.center))
    this.run = createRun(level, guardCount(level))
    this.aim = { yaw: 0, pitch: CONFIG.aim.startPitch, power: 0 }
    this.catapult.yaw = 0
    this.catapult.reset(true)
    this.catapult.showPreview(null)
    this.charging = null
    this.survey = false
    this.hitTime = -1
    this.pendingLaunch = false
    this.timeScale.clear()
    this.audio.setRumble(0)
  }

  private dispose(): void {
    if (!this.sim) return
    this.sim.dispose()
    this.world.dispose()
    this.fx.clear()
    this.scene.clear()
  }

  /** Start (or restart) a level. */
  start(levelIndex: number, tutorial: boolean): void {
    const level = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, levelIndex))]
    this.build(level)
    this.tutorial = tutorial
    this.hintShown.clear()
    this.setHint(null)
    this.paused = false
    this.mode = 'intro'
    this.director.set('intro')
    this.hooks.banner(`level.${level.id}.name`)
    this.input.cancelDrag()
    this.audio.musicIntensity = 0.45
  }

  restart(): void {
    this.start(this.level.index, false)
  }

  toTitle(): void {
    this.build(LEVELS[0])
    this.mode = 'title'
    this.paused = false
    this.director.set('title', true)
    this.setHint(null)
    this.audio.musicIntensity = 0.3
  }

  /** Show a level's castle behind the title / level-select screen. */
  preview(levelIndex: number): void {
    if (this.mode !== 'title' || this.level.index === levelIndex) return
    this.build(LEVELS[levelIndex])
    this.director.set('title', true)
  }

  pause(): void {
    this.paused = true
    this.input.cancelDrag()
    this.charging = null
    this.aim.power = 0
    this.catapult.charge = 0
    this.audio.setRumble(0)
  }

  resume(): void {
    this.paused = false
  }

  setQuality(q: Quality): void {
    this.quality = q
    this.renderer.applyQuality(q)
    this.world.setShadowSize(this.renderer.shadowMapSize)
    this.fx.density = q === 'low' ? 0.45 : q === 'medium' ? 0.75 : 1
    this.sim.debrisScale = q === 'low' ? 0.5 : 1
  }

  get playing(): boolean {
    return !this.paused && this.mode !== 'title' && this.mode !== 'ended'
  }

  get hud(): HudState {
    return {
      ammo: this.run.ammo,
      ammoMax: this.run.ammoMax,
      guardsLeft: this.run.guardsLeft,
      guardsTotal: this.run.guardsTotal,
      score: this.run.score,
      pitchDeg: Math.round(THREE.MathUtils.radToDeg(this.aim.pitch)),
      yawDeg: Math.round(THREE.MathUtils.radToDeg(this.aim.yaw)),
      power: this.aim.power,
      charging: this.charging !== null,
      mode: this.mode,
      canSkip: this.canSkip,
      survey: this.survey,
      level: this.level.index,
      chain: this.run.chain,
    }
  }

  private get canSkip(): boolean {
    return this.mode === 'watching' && this.hitTime >= 0 && this.shotTime - this.hitTime > CONFIG.shot.minWatch
  }

  // ─── per-frame input & presentation (real time) ─────────────────────────

  /** Handle input once per rendered frame. `dt` is real seconds. */
  frame(dt: number): void {
    if (this.paused) {
      this.input.takeDragStart()
      this.input.takeDragEnd()
      this.input.takeWheel()
      return
    }
    const input = this.input
    const sens = input.sensitivity
    if (this.mode === 'intro') {
      if (this.director.mode !== 'intro' || input.takeDragStart() || input.consume('fire') || input.consume('confirm') || input.trigger > 0.5) this.beginAiming()
      input.takeDragEnd()
      return
    }
    if (this.mode === 'watching' || this.mode === 'flight') {
      const tap = input.takeDragStart()
      input.takeDragEnd()
      if ((tap || input.consume('fire') || input.consume('confirm')) && this.canSkip) this.finishShot()
      input.takeWheel()
      return
    }
    if (this.mode === 'finale') {
      input.takeDragStart()
      input.takeDragEnd()
      return
    }
    if (this.mode !== 'aiming') return
    if (input.consume('restart')) {
      this.restart()
      return
    }
    if (input.consume('view')) this.toggleSurvey()
    // Survey: orbit with drag / right stick / wheel.
    const look = input.takeLook()
    const wheel = input.takeWheel()
    if (this.survey) {
      const d = input.takeDragStart()
      if (d) this.dragBase.yaw = d.x
      if (input.drag.active) {
        const dx = (input.drag.x - this.dragBase.yaw) / Math.max(1, window.innerWidth)
        this.dragBase.yaw = input.drag.x
        this.director.orbitInput(dx * 2.2, 0, 0)
      }
      input.takeDragEnd()
      this.director.orbitInput(look.x, look.y * 0.6, wheel * 0.02)
      if (input.consume('fire') || input.consume('cancel') || input.trigger > 0.5) this.toggleSurvey()
      return
    }
    if (Math.abs(look.x) + Math.abs(look.y) > 0.02) {
      // Right stick / right-drag in aim mode briefly peeks toward the castle.
      this.toggleSurvey()
      return
    }
    const ready = this.catapult.ready && this.run.ammo > 0
    // Continuous aim: keys, left stick, on-screen stick.
    const mx = input.move.x
    const my = input.move.y
    this.aim.yaw = THREE.MathUtils.clamp(this.aim.yaw + mx * CONFIG.aim.yawSpeed * sens * dt, -CONFIG.aim.maxYaw, CONFIG.aim.maxYaw)
    this.aim.pitch = THREE.MathUtils.clamp(this.aim.pitch + my * CONFIG.aim.pitchSpeed * sens * dt - wheel * CONFIG.aim.wheelPitch * sens, CONFIG.aim.minPitch, CONFIG.aim.maxPitch)
    if (Math.abs(mx) + Math.abs(my) > 0.1 && Math.abs(my) > Math.abs(mx) && this.tutorial) this.markHint('pitch')
    // Mouse / finger drag: horizontal = yaw, pull back = power.
    const start = input.takeDragStart()
    if (start && ready && !this.charging) {
      this.charging = 'drag'
      this.dragBase.yaw = this.aim.yaw
      this.aim.power = 0
    }
    if (this.charging === 'drag') {
      const d = input.drag
      const short = Math.min(window.innerWidth, window.innerHeight)
      const dx = d.x - d.startX
      const dy = d.y - d.startY
      const dir = this.invertDrag ? 1 : -1
      this.aim.yaw = THREE.MathUtils.clamp(this.dragBase.yaw + dir * dx * CONFIG.aim.dragYaw * sens, -CONFIG.aim.maxYaw, CONFIG.aim.maxYaw)
      const pull = this.invertDrag ? -dy : dy
      this.aim.power = THREE.MathUtils.clamp(pull / (CONFIG.aim.dragPower * short), 0, 1)
      const end = input.takeDragEnd()
      if (input.consume('cancel')) this.cancelCharge()
      else if (end) this.release()
    } else input.takeDragEnd()
    // Hold-to-charge: Space / A / right trigger / touch FIRE button.
    const keyHeld = input.held('fire')
    const padHeld = input.trigger > 0.45
    if (!this.charging && ready && (keyHeld || padHeld)) {
      this.charging = padHeld ? 'pad' : 'key'
      this.aim.power = 0
      input.consume('fire')
    }
    if (this.charging === 'key' || this.charging === 'pad') {
      this.aim.power = Math.min(1, this.aim.power + dt / CONFIG.aim.chargeSeconds)
      const stillHeld = this.charging === 'pad' ? input.trigger > 0.2 : keyHeld
      if (input.consume('cancel')) this.cancelCharge()
      else if (!stillHeld) this.release()
    }
    if (this.charging) {
      this.catapult.charge = this.aim.power
      if (this.aim.power > 0.02 && this.time - this.lastCreak > 0.09 - this.aim.power * 0.04) {
        this.lastCreak = this.time
        this.audio.play('creak', { pitch: 0.8 + this.aim.power * 0.6, volume: 0.6 })
      }
    }
    this.catapult.yaw = this.aim.yaw
  }

  private toggleSurvey(): void {
    if (this.mode !== 'aiming') return
    this.survey = !this.survey
    this.cancelCharge()
    this.director.set(this.survey ? 'survey' : 'aim')
    this.audio.play(this.survey ? 'ui' : 'uiBack')
    if (this.survey && this.tutorial) this.markHint('survey')
  }

  private cancelCharge(): void {
    this.charging = null
    this.aim.power = 0
    this.catapult.charge = 0
    this.input.cancelDrag()
  }

  private beginAiming(): void {
    this.mode = 'aiming'
    this.director.set('aim')
    this.survey = false
    this.input.cancelDrag()
    this.input.takeDragEnd()
    if (this.run.ammo === 1) this.hooks.banner('banner.lastStone')
    if (this.tutorial) {
      if (!this.hintShown.has('aim')) this.setHint('aim')
      else if (!this.hintShown.has('pitch')) this.setHint('pitch')
      else if (!this.hintShown.has('survey')) this.setHint('survey')
    }
  }

  private setHint(h: Hint): void {
    this.currentHint = h
    this.hooks.hint(h)
  }

  private markHint(h: Hint): void {
    if (this.hintShown.has(h)) return
    this.hintShown.add(h)
    if (this.currentHint === h) this.setHint(null)
    if (this.hintShown.has('aim') && this.hintShown.has('pitch') && this.hintShown.has('survey')) {
      this.tutorial = false
      this.hooks.tutorialDone()
    }
  }

  private release(): void {
    const power = this.aim.power
    this.charging = null
    if (power < CONFIG.aim.minPower) {
      this.aim.power = 0
      this.catapult.charge = 0
      return
    }
    const next = fire(this.run)
    if (!next) return
    this.run = next
    const aim = { ...this.aim }
    this.mode = 'flight'
    this.shotTime = 0
    this.hitTime = -1
    this.flightTimer = 0
    this.shotBroke = 0
    this.pendingLaunch = true
    if (this.tutorial) this.markHint('aim')
    this.setHint(null)
    this.catapult.fire(() => {
      this.pendingLaunch = false
      const origin = releasePoint(CATAPULT_BASE, aim.yaw, RELEASE_LOCAL)
      this.sim.launch(origin, launchVelocity(aim))
      this.fx.launchPuff(new THREE.Vector3(CATAPULT_BASE.x, CATAPULT_BASE.y + 0.4, CATAPULT_BASE.z))
      this.director.set('follow')
      this.director.kickFov(6 * (0.5 + aim.power))
      this.director.addTrauma(0.25 + aim.power * 0.15)
      this.audio.play('launch', { volume: 0.7 + aim.power * 0.3 })
      this.audio.play('whistle', { pitch: 0.8 + aim.power * 0.4, volume: 0.8 })
    })
    this.aim.power = 0
    this.audio.musicIntensity = 0.75
  }

  // ─── simulation (fixed step, game time) ─────────────────────────────────

  step(dt: number): void {
    if (this.paused || this.mode === 'title' || this.mode === 'ended') {
      if (this.mode === 'title') this.titleSpin += dt
      return
    }
    this.gameTime += dt
    if (this.mode === 'aiming' || this.mode === 'flight' || this.mode === 'watching') this.run = tick(this.run, dt)
    const events = this.sim.step(dt)
    for (const e of events) this.handle(e)
    if (this.mode === 'flight' || this.mode === 'watching') this.shotTime += dt
    if (this.mode === 'flight' && !this.pendingLaunch) {
      this.flightTimer += dt
      const b = this.sim.ballPosition()
      // Missed everything and sailed past, or fell off: go straight to watching.
      if (!b || this.flightTimer > 6 || b.z < this.level.center[2] - 26 || Math.abs(b.x) > 40) {
        this.mode = 'watching'
        this.hitTime = this.shotTime
        this.director.setImpact(b ?? new THREE.Vector3(...this.level.center), new THREE.Vector3(0, 0, -1))
        this.director.set('impact')
      }
    }
    if (this.mode === 'watching') {
      const since = this.shotTime - this.hitTime
      const settled = since > CONFIG.shot.minWatch && this.sim.settled()
      if (settled || since > CONFIG.shot.maxWatch) this.finishShot()
    }
    if (this.mode === 'finale') {
      this.finaleTime += dt
      if (this.finaleTime > CONFIG.shot.finale) this.endLevel()
    }
    // Rumble from the kinetic energy of the collapse.
    const kinetic = this.sim.sleep.stats.kinetic
    const rumble = Math.min(1, kinetic / 9000)
    this.audio.setRumble(this.mode === 'aiming' ? rumble * 0.5 : rumble)
    if (rumble > 0.08) this.director.addTrauma(rumble * 0.02)
  }

  private finishShot(): void {
    if (this.mode !== 'watching' && this.mode !== 'flight') return
    this.run = resolveShot(this.run)
    if (this.run.phase === 'lost') {
      this.mode = 'finale'
      this.finaleTime = CONFIG.shot.finale - 1.2
      this.director.set('finale')
      return
    }
    if (this.run.phase === 'won') return
    this.catapult.reload(this.run.ammo > 0)
    this.audio.play('reload')
    this.audio.musicIntensity = 0.45
    this.beginAiming()
    if (this.tutorial && this.run.shots === 1 && !this.hintShown.has('powder')) {
      this.hintShown.add('powder')
      this.setHint('powder')
    }
  }

  private endLevel(): void {
    this.mode = 'ended'
    this.audio.setRumble(0)
    const s = stars(this.run, this.level)
    this.audio.play(this.run.phase === 'won' ? 'win' : 'lose')
    this.hooks.end(this.run, this.level, s)
  }

  private screen(at: { x: number; y: number; z: number }): { x: number; y: number; visible: boolean } {
    const v = new THREE.Vector3(at.x, at.y, at.z).project(this.director.camera)
    return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight, visible: v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 }
  }

  private pan(at: { x: number }): number {
    return THREE.MathUtils.clamp((at.x - this.director.position.x) / 14, -0.8, 0.8)
  }

  private sfx(name: Sfx, at: { x: number; y: number; z: number }, volume: number, pitch = 1): void {
    const d = this.director.position.distanceTo(new THREE.Vector3(at.x, at.y, at.z))
    const fall = THREE.MathUtils.clamp(1.25 - d / 45, 0.25, 1)
    this.audio.play(name, { volume: volume * fall, pitch, pan: this.pan(at) })
  }

  private popup(text: string, at: { x: number; y: number; z: number }, kind: PopupKind): void {
    const s = this.screen(at)
    if (s.visible) this.hooks.popup(text, s.x, s.y, kind)
  }

  private handle(e: SimEvent): void {
    const V = (a: { x: number; y: number; z: number }) => new THREE.Vector3(a.x, a.y, a.z)
    switch (e.type) {
      case 'ballHit': {
        if (!e.first) break
        const at = V(e.at)
        this.hitTime = this.shotTime
        if (this.mode === 'flight') {
          this.mode = 'watching'
          const vel = this.sim.ballVelocity() ?? new THREE.Vector3(0, 0, -1)
          this.director.setImpact(at, vel)
          this.director.set('impact')
        }
        const hard = e.target !== 'ground'
        const k = THREE.MathUtils.clamp(e.speed / 30, 0, 1)
        this.director.addTrauma(hard ? 0.35 + k * 0.35 : 0.18)
        if (hard && this.slowmoEnabled && e.speed > 12) {
          this.timeScale.pulse({ ...CONFIG.slowmo.impact, id: 'impact' })
          this.audio.play('slowmo', { volume: 0.6 })
          this.hooks.flash(0.25)
        }
        if (!hard) {
          this.sfx('thud', at, 0.9)
          this.fx.puff(at.setY(0.1), DUST_WOOD, 10, 0.6, 1)
        } else {
          const stone = e.target === 'stone'
          this.fx.debris(at, stone ? STONE : WOOD, 16, 7, 0.09)
          this.fx.puff(at, stone ? DUST_STONE : DUST_WOOD, 8, 0.5)
          this.sfx(stone ? 'stoneHit' : 'woodHit', at, 1.0, 0.8)
        }
        break
      }
      case 'impact': {
        const at = V(e.at)
        const vol = THREE.MathUtils.clamp((e.dv - 2) / 6, 0.15, 1)
        if (e.kind === 'stone') this.sfx('stoneHit', at, vol * 0.8, 0.85 + Math.random() * 0.3)
        else if (e.kind === 'wood' || e.kind === 'powder') this.sfx('woodHit', at, vol * 0.7, 0.85 + Math.random() * 0.35)
        if (e.dv > 4) this.fx.debris(at, e.kind === 'stone' ? STONE : WOOD, e.fromBall ? 8 : 3, 3 + e.dv * 0.4, 0.06)
        if (e.dv > 5 && e.kind === 'stone') this.fx.puff(at, DUST_STONE, 2, 0.4, 0.6)
        break
      }
      case 'break': {
        if (e.fragment || e.kind === 'guard') break
        const at = V(e.at)
        if (e.kind === 'powder') {
          this.award(destroy(this.run, 'powder'), at)
          break
        }
        const stone = e.kind === 'stone'
        this.fx.debris(at, stone ? STONE : WOOD, stone ? 14 : 12, stone ? 5 : 6, stone ? 0.11 : 0.08)
        this.fx.puff(at, stone ? DUST_STONE : DUST_WOOD, stone ? 9 : 6, 0.6)
        this.sfx(stone ? 'stoneBreak' : 'woodBreak', at, 0.9, 0.85 + Math.random() * 0.3)
        this.director.addTrauma(stone ? 0.08 : 0.05)
        this.award(destroy(this.run, stone ? 'stone' : 'wood'), at)
        this.shotBroke += 1
        break
      }
      case 'explode': {
        const at = V(e.at)
        this.fx.explosion(at, e.chain > 0 ? 0.85 : 1)
        this.fx.debris(at, POWDER, 10, 9, 0.08)
        this.sfx('boom', at, 1, 1 - Math.min(0.25, e.chain * 0.06))
        this.director.addTrauma(0.65)
        this.director.kickFov(5)
        this.hooks.flash(0.55)
        if (this.slowmoEnabled) this.timeScale.pulse({ ...CONFIG.slowmo.explosion, id: 'explosion' })
        if (this.mode === 'flight') {
          this.mode = 'watching'
          this.hitTime = this.shotTime
          this.director.setImpact(at, new THREE.Vector3(0, 0, -1))
          this.director.set('impact')
        }
        if (this.hitTime >= 0) this.hitTime = Math.max(this.hitTime, this.shotTime - CONFIG.shot.minWatch * 0.5)
        this.popup(e.chain > 0 ? this.hooks.t('popup.boomChain', { n: e.chain + 1 }) : this.hooks.t('popup.boom'), { x: at.x, y: at.y + 1.2, z: at.z }, 'boom')
        break
      }
      case 'guardDown': {
        const at = V(e.at)
        const res = guardDown(this.run)
        this.run = res.state
        this.popup(`+${res.points}`, { x: at.x, y: at.y + 0.6, z: at.z }, 'guard')
        this.sfx('guard', at, 1, 0.9 + Math.random() * 0.25)
        this.fx.sparkBurst(at, 10, 4)
        if (this.run.phase === 'won' && this.mode !== 'finale') this.beginFinale()
        break
      }
      case 'guardVanish': {
        const at = V(e.at)
        this.fx.poof(at)
        this.sfx('poof', at, 0.8)
        break
      }
    }
  }

  private award(res: { state: RunState; points: number }, at: THREE.Vector3): void {
    this.run = res.state
    if (res.points <= 0) return
    this.popup(`+${res.points}`, { x: at.x, y: at.y + 0.5, z: at.z }, 'score')
    if (this.run.chain >= 5 && this.run.chain % 5 === 0) {
      this.popup(this.hooks.t('popup.chain', { n: this.run.chain }), { x: at.x, y: at.y + 1.4, z: at.z }, 'chain')
      this.audio.play('chain', { pitch: 1 + Math.min(1, this.run.chain / 30) })
    }
  }

  private beginFinale(): void {
    this.mode = 'finale'
    this.finaleTime = 0
    this.charging = null
    if (this.slowmoEnabled) this.timeScale.pulse({ ...CONFIG.slowmo.finale, id: 'finale' })
    this.director.set('finale')
    this.hooks.banner('banner.victory')
    this.setHint(null)
  }

  // ─── rendering ──────────────────────────────────────────────────────────

  render(alpha: number, realDt: number, gameDt: number): void {
    this.time += realDt
    this.sim.physics.sync(this.paused ? 1 : alpha)
    if (!this.paused) {
      this.catapult.update(gameDt > 0 ? Math.max(gameDt, realDt * 0.35) : 0, this.time)
      this.sim.animate(gameDt)
      this.fx.update(gameDt)
      this.world.update(this.time, realDt)
      this.art.animate(this.time)
      this.animateGuards(realDt)
    }
    if (this.director.mode === 'follow') this.director.trackBall(this.sim.ballPosition(), this.sim.ballVelocity())
    this.director.motion = this.reducedMotion ? 0.3 : 1
    this.director.update(this.paused ? 0 : realDt, this.time, { yaw: this.aim.yaw, power: this.aim.power })
    const showPreview = this.mode === 'aiming' && !this.survey && this.catapult.ready && this.run.ammo > 0
    this.catapult.showPreview(showPreview ? { ...this.aim, power: this.charging ? Math.max(this.aim.power, 0.02) : 0.5 } : null, this.charging ? 1 : 0.4)
    this.renderer.render(this.scene, this.director.camera)
  }

  private animateGuards(dt: number): void {
    for (const g of this.sim.guards()) {
      const stars = g.object.getObjectByName('stars')
      if (stars?.visible) stars.rotation.y += dt * 6
    }
  }

  /** Debug/test: aim + fire programmatically. */
  debugShoot(aim: Aim): boolean {
    if (this.mode === 'intro') this.beginAiming()
    if (this.mode !== 'aiming' || !this.catapult.ready) return false
    this.aim = { ...aim }
    this.catapult.yaw = aim.yaw
    this.release()
    return true
  }

  debugSkipIntro(): void {
    if (this.mode === 'intro') this.beginAiming()
  }

  debugSettleShot(): void {
    if (this.canSkip) this.finishShot()
  }

  get stats() {
    return { ...this.sim.sleep.stats, bodies: this.sim.physics.bodyCount, timeScale: this.timeScale.scale }
  }
}
