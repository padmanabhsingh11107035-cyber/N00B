import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { AudioEngine, Sfx } from '../engine/audio'
import { t } from '../engine/i18n'
import type { Input } from '../engine/input'
import type { Renderer } from '../engine/renderer'
import type { SaveStore } from '../engine/save'
import { HuntCamera } from './camera'
import { CONFIG } from './config'
import { Environment } from './environment'
import { Fx } from './fx'
import { Hunter, type HunterEvent, type HunterIntent } from './hunter'
import { clamp } from './noise'
import { Monster, type HunterHit, type HitResult, type MonsterEvent } from './monsters/monster'
import { monsterById, type Part, type VitalSlot } from './monsters/defs'
import type { HitSphere } from './monsters/rig'
import { breakPart, createHunt, dealDamage, formatClock, hunterDamage, rankHunt, recordFaint, tickHunt, type HuntState, type Rank } from './rules'
import { CAMP, heightAt, WATER_LEVEL } from './terrain'

export type GameMode = 'title' | 'playing' | 'paused' | 'ending' | 'results'
export type Tone = 'neutral' | 'danger' | 'good' | 'gold' | 'flow'
export type DamageKind = 'normal' | 'weak' | 'vital' | 'wound'
/** Full-screen feedback pulses (CSS overlay + post grade). */
export type ScreenPulse = 'flow' | 'hurt' | 'vital' | 'true' | 'roar' | 'break' | 'heal' | 'kill'
export type Prompt = { keys: string[]; label: string }

export type ResultSummary = {
  won: boolean
  reason?: string
  rank: Rank
  time: string
  damage: number
  biggest: number
  vitals: number
  parts: string
  faints: string
  mounts: number
  wallSlams: number
  isBest: boolean
  best: string
  unranked: boolean
  quarry: string
}

export type GameHooks = {
  banner(title: string, sub?: string, tone?: Tone): void
  toast(text: string): void
  damage(x: number, y: number, amount: number, kind: DamageKind): void
  hurt(amount: number): void
  /** Screen-level juice: edge flashes, vignettes, HUD shakes. */
  pulse(kind: ScreenPulse): void
  /** Charge ring burst for a new charge level. */
  chargeBurst(level: number): void
  mode(mode: GameMode): void
  results(summary: ResultSummary): void
}

export type TuningHook = { activate(boundary: 'run' | 'dodge'): void; readonly unranked: boolean }

export type HudState = {
  hp: number
  red: number
  maxHp: number
  stamina: number
  maxStamina: number
  exhausted: boolean
  potions: number
  faints: number
  maxFaints: number
  clock: string
  timeLeft: number
  objective: string
  monster: { name: string; title: string; hp: number; tags: string[]; enraged: boolean; vitals: { slot: VitalSlot; name: string; broken: boolean; frac: number }[]; seen: boolean }
  reticle: { label: string | null; vital: boolean; locked: boolean }
  charge: number
  chargeLevel: number
  combo: string
  comboStep: number
  mount: { active: boolean; index: number; labels: { label: string; vital: boolean; ride: boolean; broken: boolean }[]; riding: boolean; ride: number; thrash: number; bucking: boolean; bracing: boolean } | null
  prompts: Prompt[]
  telegraph: string | null
  lockOn: boolean
  tip: string | null
  map: { hx: number; hz: number; hh: number; mx: number; mz: number; mh: number; yaw: number; herbs: { x: number; z: number }[]; seen: boolean }
  lowHealth: boolean
}

const PART_BY_ANCHOR: Record<string, Part> = { tail: 'tail', tailBase: 'tail', back: 'body', shoulders: 'body', neck: 'neck', head: 'head' }
const COMBO_STEP: Record<string, number> = { overhead: 1, sweep: 2, rising: 3, charged: 4 }
const _v = new THREE.Vector3()
const _v2 = new THREE.Vector3()
const _base = new THREE.Vector3()
const _tip = new THREE.Vector3()
const _pb = new THREE.Vector3()
const _pt = new THREE.Vector3()
const _s = new THREE.Vector3()
const _fwd = new THREE.Vector3()
const _lowTint = new THREE.Color('#4a0606')

export class Game {
  readonly scene = new THREE.Scene()
  readonly cam = new HuntCamera()
  readonly env: Environment
  readonly fx: Fx
  readonly hunter = new Hunter()
  monster: Monster
  mode: GameMode = 'title'
  hunt: HuntState
  tuning?: TuningHook
  private lockOn = false
  private grappleTarget = -1
  private freeze = 0
  private slowmo = 0
  private slowmoScale = 0.3
  private killCam = 0
  private wispT = 0
  private partDamage: Partial<Record<Part, number>> = {}
  private wounded = new Set<Part>()
  /** Screen grade targets decay toward zero each frame. */
  private grade = { chroma: 0, desat: 0, vignette: 0, tint: new THREE.Color('#000000') }
  private faintTimer = 0
  private endTimer = 0
  private telegraph: { text: string; t: number } | null = null
  private prevBase = new THREE.Vector3()
  private prevTip = new THREE.Vector3()
  private hasPrevBlade = false
  private trailOn = false
  private seen = false
  private tipIndex = -1
  private tipTimer = 0
  private tipProgress = 0
  private timeWarned = false
  private lastPos = new THREE.Vector3()
  private summary: ResultSummary | null = null

  constructor(
    private readonly renderer: Renderer,
    private readonly input: Input,
    private readonly audio: AudioEngine,
    private readonly save: SaveStore,
    private readonly hooks: GameHooks,
    envHdr: THREE.DataTexture | null = null,
  ) {
    this.env = new Environment(this.scene, save.settings.quality)
    // Image-based light from the meadow HDRI (kept dim: reflections are used sparingly, no glare).
    const pmrem = new THREE.PMREMGenerator(renderer.gl)
    if (envHdr) {
      envHdr.mapping = THREE.EquirectangularReflectionMapping
      this.scene.environment = pmrem.fromEquirectangular(envHdr).texture
      this.scene.environmentIntensity = 0.32
    } else {
      this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
      this.scene.environmentIntensity = 0.22
    }
    pmrem.dispose()
    this.fx = new Fx(this.scene)
    this.fx.density = save.settings.quality === 'low' ? 0.45 : save.settings.quality === 'medium' ? 0.75 : 1
    this.scene.add(this.hunter.model.root, this.hunter.model.hook, this.hunter.model.rope)
    this.monster = new Monster(monsterById(save.data.quarry))
    this.scene.add(this.monster.rig.root)
    this.hunt = createHunt(this.monster.def.id, this.monsterHp(), 3)
    this.resetWorld()
    this.hunter.model.root.visible = false
    this.cam.camera.position.set(0, 20, 60)
  }

  get quarryId(): string {
    return this.monster.def.id
  }

  private monsterHp(): number {
    return Math.round(this.monster.def.stats.hp * CONFIG.monster.healthScale)
  }

  /** True while combat is heating up: background asset streaming should pause. */
  get loadPressure(): boolean {
    if (this.mode !== 'playing' && this.mode !== 'ending') return false
    const m = this.monster
    const combat = m.alive && m.state !== 'roam' && m.pos.distanceTo(this.hunter.pos) < 60
    return this.fx.activeCount > 450 || this.hunter.mounted || this.slowmo > 0 || (combat && m.state === 'attack')
  }

  setQuality(q: 'low' | 'medium' | 'high'): void {
    this.fx.density = q === 'low' ? 0.45 : q === 'medium' ? 0.75 : 1
    this.env.setQuality(q)
    this.renderer.applyQuality(q)
  }

  /** Swap the active quarry (title screen). */
  setQuarry(id: string): void {
    if (id === this.monster.def.id) return
    this.scene.remove(this.monster.rig.root)
    this.monster.rig.dispose()
    this.monster = new Monster(monsterById(id))
    this.scene.add(this.monster.rig.root)
    this.save.update({ quarry: id })
    this.resetWorld()
  }

  private resetWorld(): void {
    const spawn = this.monster.def.id === 'tidehorn' ? new THREE.Vector3(26, 0, -28) : this.monster.def.id === 'ashwing' ? new THREE.Vector3(-22, 0, -12) : new THREE.Vector3(0, 0, -6)
    this.monster.reset(spawn, 0.6, this.monsterHp())
    this.fx.clearAll()
    this.seen = false
    this.partDamage = {}
    this.wounded.clear()
  }

  startHunt(): void {
    this.tuning?.activate('run')
    this.resetWorld()
    this.hunt = createHunt(this.monster.def.id, this.monsterHp(), this.monster.def.vitals.length)
    const start = new THREE.Vector3(CAMP.x, 0, CAMP.z - 8)
    this.hunter.reset(start, Math.PI)
    this.hunter.model.root.visible = true
    this.cam.snap(this.hunter.pos, Math.PI, 0.16)
    this.lockOn = false
    this.freeze = this.slowmo = this.faintTimer = this.endTimer = this.killCam = 0
    this.slowmoScale = 0.3
    this.telegraph = null
    this.summary = null
    this.timeWarned = false
    this.tipIndex = this.save.settings.tips && !this.save.data.tutorialDone ? 0 : -1
    this.tipTimer = 0
    this.tipProgress = 0
    this.lastPos.copy(this.hunter.pos)
    this.setMode('playing')
    this.input.lockPointer()
    this.audio.play('banner')
    this.hooks.banner(t('banner.huntBegins'), t('hud.objective', { name: this.monster.def.name }), 'gold')
  }

  setMode(m: GameMode): void {
    this.mode = m
    this.input.gameplay = m === 'playing'
    this.audio.setPaused(m === 'paused')
    if (m !== 'playing') this.fx.trailEnd()
    this.hooks.mode(m)
  }

  pause(): void {
    if (this.mode !== 'playing') return
    this.input.unlockPointer()
    this.setMode('paused')
  }

  resume(): void {
    if (this.mode !== 'paused') return
    this.input.clearPresses()
    this.setMode('playing')
    this.input.lockPointer()
  }

  toTitle(): void {
    this.input.unlockPointer()
    this.hunter.model.root.visible = false
    this.resetWorld()
    this.setMode('title')
  }

  // ─── simulation ────────────────────────────────────────────────────────
  step(dt: number): void {
    if (this.mode === 'title' || this.mode === 'results') {
      this.stepMonster(dt, false)
      return
    }
    if (this.mode === 'paused') return
    let sdt = dt
    if (this.slowmo > 0) {
      this.slowmo -= dt
      sdt = dt * this.slowmoScale
    }
    const frozen = this.freeze > 0
    this.freeze = Math.max(0, this.freeze - dt)
    const mdt = frozen ? sdt * 0.08 : sdt

    if (this.hunt.phase === 'hunting' && this.mode === 'playing') {
      this.hunt = tickHunt(this.hunt, sdt)
      if (this.tuning?.unranked) this.hunt.unranked = true
      if (!this.timeWarned && this.hunt.timeLimit - this.hunt.elapsed < 300 && this.hunt.timeLimit > 600) {
        this.timeWarned = true
        this.hooks.toast(t('toast.timeWarning'))
      }
      if (this.hunt.phase === 'lost') this.fail()
    }
    const playing = this.mode === 'playing' && this.hunt.phase === 'hunting'
    const intent = this.intent(playing)
    this.grappleTarget = playing ? this.pickAnchor() : -1
    if (playing && this.input.pressed('lockon')) this.lockOn = !this.lockOn
    if (playing && this.input.pressed('interact')) this.interact()
    if (intent.potion && this.hunter.potions <= 0 && this.hunter.state === 'move') this.hooks.toast(t('toast.noPotions'))

    const events = this.hunter.update(sdt, intent, {
      anchors: this.monster.rig.anchors,
      grappleTarget: this.grappleTarget,
      bucking: this.monster.bucking,
      monsterAlive: this.monster.alive,
      pushSpheres: this.monster.rig.hitSpheres,
    })
    for (const e of events) this.onHunterEvent(e)
    if (this.hunter.state === 'faint' && this.faintTimer <= 0 && this.hunt.phase === 'hunting') this.onFaint()
    this.stepMonster(mdt, playing)
    this.resolveSwing()
    this.updateFaint(dt)
    this.updateTutorial(sdt)
    if (this.telegraph) {
      this.telegraph.t -= dt
      if (this.telegraph.t <= 0) this.telegraph = null
    }
    if (this.mode === 'ending') {
      this.endTimer -= dt
      if (this.endTimer <= 0 && this.summary) {
        this.input.unlockPointer()
        this.setMode('results')
        this.hooks.results(this.summary)
      }
    }
  }

  private intent(active: boolean): HunterIntent {
    const move = active ? this.input.move() : { x: 0, y: 0 }
    const i = this.input
    return {
      moveX: move.x,
      moveY: move.y,
      camYaw: this.cam.yaw,
      sprint: active && i.held('sprint'),
      attack: active && i.pressed('attack'),
      heavyHeld: active && i.held('heavy'),
      heavy: active && i.pressed('heavy'),
      dodge: active && i.pressed('dodge'),
      grapple: active && i.pressed('grapple'),
      potion: active && i.pressed('potion'),
    }
  }

  private stepMonster(dt: number, playing: boolean): void {
    const h = this.hunter
    const active = playing && h.state !== 'faint' && h.state !== 'victory'
    this.monster.tickEmitters(dt, (k, p, v) => this.fx.ambient(k, p, v))
    const events = this.monster.update(dt, {
      hunter: h.pos,
      hunterGrounded: h.grounded,
      hunterActive: active,
      mounted: h.mounted,
      riding: h.riding,
      rideDir: h.rideDirection(this.rideIntent(active)),
      hpFraction: this.hunt.monsterHp / this.hunt.monsterMax,
      hitHunter: hit => this.hitHunter(hit),
    })
    for (const e of events) this.onMonsterEvent(e, playing)
  }

  private rideIntent(active: boolean): HunterIntent {
    const move = active ? this.input.move() : { x: 0, y: 0 }
    return { moveX: move.x, moveY: move.y, camYaw: this.cam.yaw, sprint: false, attack: false, heavyHeld: false, heavy: false, dodge: false, grapple: false, potion: false }
  }

  private pickAnchor(): number {
    const h = this.hunter
    if (h.mounted || !this.monster.alive || h.state !== 'move') return -1
    const cam = this.cam.camera
    cam.getWorldDirection(_fwd)
    const anchors = this.monster.rig.anchors
    let best = -1
    let bestScore = -1
    const cone = this.lockOn ? 0.93 : 0.965
    for (let i = 0; i < anchors.length; i += 1) {
      const a = anchors[i]
      if (a.world.distanceTo(h.pos) > CONFIG.grapple.range) continue
      _v.subVectors(a.world, cam.position).normalize()
      let score = _v.dot(_fwd)
      if (a.vital && !this.monster.rig.vitals[a.vital].broken) score += 0.006
      if (score > cone && score > bestScore) {
        bestScore = score
        best = i
      }
    }
    return best
  }

  private interact(): void {
    const h = this.hunter
    if (h.state !== 'move') return
    const herb = this.nearHerb()
    if (herb >= 0) {
      if (h.potions >= CONFIG.hunt.maxPotions) {
        this.hooks.toast(t('toast.potionsFull'))
        return
      }
      this.env.gatherHerb(herb)
      h.potions += 1
      this.audio.play('gather')
      this.fx.embers(this.env.herbs[herb].pos.clone().setY(this.env.herbs[herb].pos.y + 0.6), 14, '#ffb35a', 0.6, 2)
      this.hooks.toast(t('toast.gathered'))
      return
    }
    if (this.nearSupply() && h.potions < CONFIG.hunt.potions) {
      h.potions = CONFIG.hunt.potions
      this.audio.play('gather', { pitch: 1.2 })
      this.hooks.toast(t('toast.resupplied'))
    }
  }

  private nearHerb(): number {
    const p = this.hunter.pos
    return this.env.herbs.findIndex(h => h.available && Math.hypot(h.pos.x - p.x, h.pos.z - p.z) < 2.4)
  }

  private nearSupply(): boolean {
    const p = this.hunter.pos
    return Math.hypot(this.env.supply.x - p.x, this.env.supply.z - p.z) < 3
  }

  private hitHunter(hit: HunterHit): HitResult {
    if (this.mode !== 'playing') return 'ignored'
    // Rupture counter-play: rolling through the eruption (i-frames) or leaping over it vaults the hunter.
    if (hit.attack === 'rupture') {
      const h = this.hunter
      const airborne = h.state === 'air' && h.pos.y > heightAt(h.pos.x, h.pos.z) + 0.5
      if ((h.iframes && (h.state === 'dodge' || h.state === 'air')) || airborne) {
        this.spikeVault(hit)
        return 'evaded'
      }
    }
    const res = this.hunter.applyHit(hit.damage, hit.knock, hit.from)
    if (res === 'hit') {
      this.hunt = { ...this.hunt, damageTaken: this.hunt.damageTaken + hit.damage }
      if (hit.damage > 0) {
        this.audio.play('hurt', { volume: 0.9 })
        this.hooks.hurt(hit.damage)
        this.cam.shake(clamp(hit.damage / 45, 0.3, 0.8))
        this.hooks.pulse('hurt')
        this.punchGrade(0.3, 0.08, 0.4, '#5a0808')
        _v.copy(this.hunter.pos).setY(this.hunter.pos.y + 1.1)
        this.fx.impact(_v, '#d9c8a0', true, false)
        this.fx.flash(_v, '#ff7a5a', 2.6, 'star', 0.14)
        this.fx.dust(this.hunter.pos, 8, 1.2, '#b9a888', 1.3)
      } else this.cam.shake(0.25)
    } else if (res === 'evaded') {
      const h = this.hunter
      if (h.state === 'dodge' && h.stateT <= 0.22 && this.slowmo <= 0) this.flowEvade()
      else {
        this.audio.play('evade', { volume: 0.6, pitch: 1.2 })
        this.hooks.toast(t('toast.evaded'))
      }
      if (this.tipIndex === 3) this.advanceTip()
    }
    return res
  }

  /** Spike Vault: perfect Rupture evade — launched skyward in slow motion with a crushing plunge primed. */
  private spikeVault(hit: HunterHit): void {
    const h = this.hunter
    h.vitals = { ...h.vitals, stamina: h.vitals.maxStamina }
    h.vault()
    this.slowmo = 0.75
    this.slowmoScale = 0.3
    this.audio.play('evade', { volume: 1, pitch: 0.9 })
    this.audio.play('crumble', { volume: 0.8, pitch: 1.3 })
    this.hooks.banner(t('banner.vault'), t('banner.vaultSub'), 'flow')
    this.hooks.pulse('flow')
    this.punchGrade(0.65, 0.6, 0.55, '#07233d')
    _v.copy(h.pos)
    this.fx.ring(_v, 8, '#7fd8ff', 0.8)
    this.fx.ring(_v, 4, '#ffffff', 0.5)
    this.fx.debrisBurst(_v, 12, 7)
    _v.y += 0.8
    this.fx.flash(_v, '#bfeaff', 3.2, 'star', 0.2)
    this.fx.sparks(_v, 28, '#bfeaff', 11, new THREE.Vector3(0, 1, 0))
    this.fx.dust(h.pos, 16, 1.6, '#b9a888', 1.8)
    this.ghostTrail()
    this.cam.kick(0.45)
    this.cam.shake(0.35)
    if (hit.label) this.hooks.toast(t('toast.vaulted'))
  }

  /** Perfect dodge: slow motion, afterimage, stamina refund and a primed charge. */
  private flowEvade(): void {
    const h = this.hunter
    this.slowmo = 0.45
    this.slowmoScale = 0.25
    h.vitals = { ...h.vitals, stamina: Math.min(h.vitals.maxStamina, h.vitals.stamina + 20) }
    h.primed = true
    this.audio.play('evade', { volume: 1 })
    this.hooks.banner(t('banner.flow'), t('banner.flowSub'), 'flow')
    this.hooks.pulse('flow')
    this.punchGrade(0.5, 0.55, 0.5, '#0a2a4a')
    this.fx.ring(h.pos, 7, '#7fd8ff', 0.7)
    this.fx.ring(h.pos, 3.5, '#d6f4ff', 0.45)
    this.ghostTrail()
    this.cam.kick(0.3)
  }

  private ghostTrail(): void {
    const h = this.hunter
    const pts: THREE.Vector3[] = []
    for (let i = 0; i < 7; i += 1) pts.push(new THREE.Vector3(h.pos.x + (Math.random() - 0.5) * 0.5, h.pos.y + 0.2 + i * 0.26, h.pos.z + (Math.random() - 0.5) * 0.5))
    this.fx.ghost(pts)
  }

  /** Kick the full-screen grade (it decays in frame()). */
  private punchGrade(chroma: number, desat: number, vignette: number, tint: string): void {
    const g = this.grade
    g.chroma = Math.max(g.chroma, chroma)
    g.desat = Math.max(g.desat, desat)
    if (vignette >= g.vignette) g.tint.set(tint)
    g.vignette = Math.max(g.vignette, vignette)
  }

  private onFaint(): void {
    this.hunt = recordFaint(this.hunt)
    this.faintTimer = 3.6
    this.lockOn = false
    this.audio.play('faint')
    if (this.hunt.phase === 'lost') {
      this.fail()
      return
    }
    this.hooks.banner(t('banner.fainted'), t('banner.faintedSub', { n: this.hunt.faints, max: this.hunt.maxFaints }), 'danger')
  }

  private updateFaint(dt: number): void {
    if (this.faintTimer <= 0) return
    this.faintTimer -= dt
    if (this.faintTimer <= 0 && this.hunt.phase === 'hunting') {
      this.hunter.respawn(new THREE.Vector3(CAMP.x, 0, CAMP.z - 6), Math.PI)
      this.cam.snap(this.hunter.pos, Math.PI, 0.16)
    }
  }

  private fail(): void {
    if (this.mode === 'ending') return
    const reason = this.hunt.loseReason === 'time' ? t('banner.failTime') : t('banner.failFaints')
    this.audio.play('fail')
    this.hooks.banner(t('banner.questFailed'), reason, 'danger')
    this.finish(false, reason)
  }

  private finish(won: boolean, reason?: string): void {
    const h = this.hunt
    const rank = rankHunt(h)
    let isBest = false
    if (won && !h.unranked) isBest = this.save.recordHunt(h.quarry, h.elapsed, rank)
    const rec = this.save.data.records[h.quarry]
    this.summary = {
      won,
      reason,
      rank,
      time: formatClock(h.elapsed),
      damage: Math.round(h.damageDealt),
      biggest: Math.round(h.biggestHit),
      vitals: h.vitalStrikes,
      parts: `${h.partsBroken.length} / ${h.totalParts}`,
      faints: `${h.faints} / ${h.maxFaints}`,
      mounts: h.mounts,
      wallSlams: h.wallSlams,
      isBest,
      best: rec && rec.bestTime > 0 ? formatClock(rec.bestTime) : '',
      unranked: h.unranked,
      quarry: this.monster.def.name,
    }
    this.endTimer = won ? 6 : 4.5
    this.setMode('ending')
    this.input.gameplay = false
  }

  // ─── hunter → monster ──────────────────────────────────────────────────
  private resolveSwing(): void {
    const h = this.hunter
    const sw = h.activeSwing
    h.bladeSegment(_base, _tip)
    if (!sw || !this.monster.alive) {
      this.prevBase.copy(_base)
      this.prevTip.copy(_tip)
      this.hasPrevBlade = true
      return
    }
    let sphere: HitSphere | null = null
    let point: THREE.Vector3 | null = null
    let part: Part = 'body'
    let vital: VitalSlot | undefined
    if (sw.mounted) {
      const idx = h.riding ? this.monster.rig.anchors.findIndex(a => a.ride) : h.mountAnchor
      const a = this.monster.rig.anchors[idx]
      if (!a) return
      part = PART_BY_ANCHOR[a.id] ?? 'body'
      vital = a.vital && !this.monster.rig.vitals[a.vital].broken ? a.vital : undefined
      point = _v2.copy(a.world)
    } else {
      let best = Infinity
      const spheres = this.monster.rig.hitSpheres
      for (let k = 0; k <= 3; k += 1) {
        const f = k / 3
        if (this.hasPrevBlade) {
          _pb.lerpVectors(this.prevBase, _base, f)
          _pt.lerpVectors(this.prevTip, _tip, f)
        } else {
          _pb.copy(_base)
          _pt.copy(_tip)
        }
        for (let j = 0; j <= 6; j += 1) {
          _s.lerpVectors(_pb, _pt, 0.15 + (j / 6) * 0.85)
          for (const sp of spheres) {
            const d = _s.distanceTo(sp.world)
            const reach = sp.radius + 0.3
            if (d > reach) continue
            let score = d / reach
            if (sp.vital && !this.monster.rig.vitals[sp.vital].broken) score -= 0.6
            if (score < best) {
              best = score
              sphere = sp
              point = _v2.copy(_s)
            }
          }
        }
      }
      if (sphere) {
        part = sphere.part
        vital = sphere.vital && !this.monster.rig.vitals[sphere.vital].broken ? sphere.vital : undefined
      }
    }
    this.prevBase.copy(_base)
    this.prevTip.copy(_tip)
    this.hasPrevBlade = true
    if (!point) return
    sw.hit = true
    const def = this.monster.def
    const partMult = def.parts[part]
    const wounded = this.wounded.has(part)
    const raw = hunterDamage(CONFIG.hunter.attackPower, sw.motion, partMult, { vital: !!vital, exposed: this.monster.exposed, mounted: sw.mounted })
    let dmg = wounded ? Math.round(raw * 1.25) : raw
    const vaulted = this.hunter.vaultBoost && this.hunter.attackId === 'plunge'
    if (vaulted) {
      dmg = Math.round(dmg * 1.75)
      this.hunter.vaultBoost = false
      this.hooks.banner(t('banner.vaultHit'), t('banner.vaultHitSub'), 'gold')
      this.punchGrade(0.6, 0.2, 0.5, '#3a2200')
      this.cam.shake(0.9)
    }
    const r = dealDamage(this.hunt, dmg, !!vital)
    this.hunt = r.state
    const res = this.monster.takeHit(dmg, vital)
    const kind: DamageKind = vital ? 'vital' : wounded ? 'wound' : def.parts[part] >= 1.2 ? 'weak' : 'normal'
    // Wounds: each body part that soaks 9% of max HP opens a glowing scar (+25% damage there).
    const pd = (this.partDamage[part] ?? 0) + dmg
    this.partDamage[part] = pd
    if (!wounded && pd >= this.hunt.monsterMax * 0.09 && this.monster.alive) {
      this.wounded.add(part)
      const sp = sphere ?? this.monster.rig.hitSpheres.find(x => x.part === part)
      if (sp) this.monster.markWound(sp)
      this.hooks.toast(t('toast.wounded', { part: t(`part.${part}`) }))
      this.audio.play('break', { volume: 0.45, pitch: 1.35 })
      this.fx.embers(point, 18, '#ff8a3a', 0.8, 2.5)
    }
    // Hitstop scales with commitment: light 60 ms, heavy by charge level up to 180 ms (true slash).
    const trueSlash = sw.heavy && sw.level >= 3
    h.hitstop = trueSlash ? 0.18 : sw.heavy ? [0.08, 0.095, 0.14][Math.max(0, Math.min(2, sw.level - 1))] ?? 0.08 : sw.mounted ? 0.05 : 0.06
    if (vital) h.hitstop = Math.max(h.hitstop, 0.11)
    if (vaulted) h.hitstop = Math.max(h.hitstop, 0.2)
    this.freeze = h.hitstop
    this.cam.shake(trueSlash ? 0.6 : vital ? 0.35 : sw.heavy ? 0.4 : 0.2)
    if (sw.heavy || vital) this.cam.kick(trueSlash ? 0.8 : 0.45)
    this.fx.impact(point, def.palette.hideDark, sw.heavy, !!vital)
    if (vital) {
      this.hooks.pulse('vital')
      this.punchGrade(0.35, 0, 0.18, '#3a1a00')
      this.fx.ring(point, 3, '#ffc56b', 0.35)
    }
    if (trueSlash) {
      this.hooks.pulse('true')
      this.punchGrade(0.9, 0.15, 0.3, '#2a1400')
      _v.set(point.x, heightAt(point.x, point.z), point.z)
      if (!sw.mounted) {
        this.fx.shockwave(_v, 9, '#ffe2a8')
        this.fx.debrisBurst(_v, 10, 7)
      }
      this.audio.play('trueSlash')
    }
    this.audio.play(vital ? 'hitVital' : kind === 'weak' || kind === 'wound' ? 'hitWeak' : 'hit', { volume: sw.heavy ? 1 : 0.8, pitch: sw.heavy ? 0.85 : 1 })
    if (this.save.settings.damageNumbers) {
      const s = this.project(point)
      if (s) this.hooks.damage(s.x, s.y, dmg, kind)
    }
    if (this.tipIndex === 2) this.tipProgress += 1
    if (this.tipIndex === 5 && sw.mounted) this.tipProgress += 1
    if (res.broke) this.onBreak(res.broke)
    if (r.killed) this.onVictory()
  }

  private onBreak(slot: VitalSlot): void {
    const v = this.monster.def.vitals.find(x => x.slot === slot)!
    this.hunt = breakPart(this.hunt, slot)
    this.audio.play('break')
    this.hooks.banner(t('banner.broken'), `${v.name} · ${v.effect}`, 'gold')
    this.hooks.pulse('break')
    this.cam.shake(0.55)
    this.freeze = Math.max(this.freeze, 0.15)
    this.hunter.hitstop = Math.max(this.hunter.hitstop, 0.15)
  }

  private onVictory(): void {
    this.monster.kill()
    this.hunter.victory()
    this.slowmo = 1.6
    this.slowmoScale = 0.2
    this.killCam = 3.2
    this.lockOn = false
    this.hooks.pulse('kill')
    this.punchGrade(0.6, 0.35, 0.35, '#1a1206')
    this.audio.play('victory')
    this.audio.stinger('victory', 22)
    this.hooks.banner(t('banner.questComplete'), `${this.monster.def.name} · ${formatClock(this.hunt.elapsed)}`, 'gold')
    this.finish(true)
  }

  project(p: THREE.Vector3): { x: number; y: number } | null {
    _v.copy(p).project(this.cam.camera)
    if (_v.z > 1 || Math.abs(_v.x) > 1.1 || Math.abs(_v.y) > 1.1) return null
    return { x: (_v.x * 0.5 + 0.5) * innerWidth, y: (-_v.y * 0.5 + 0.5) * innerHeight }
  }

  // ─── events ────────────────────────────────────────────────────────────
  private distVolume(p: THREE.Vector3, near = 10, far = 80): number {
    const d = p.distanceTo(this.mode === 'title' || this.mode === 'results' ? this.cam.camera.position : this.hunter.pos)
    return clamp(1 - (d - near) / (far - near), 0.05, 1)
  }

  private sfx(name: Sfx, p: THREE.Vector3, gain = 1, near = 10, far = 80): void {
    this.audio.play(name, { volume: this.distVolume(p, near, far) * gain })
  }

  private onHunterEvent(e: HunterEvent): void {
    const h = this.hunter
    switch (e.type) {
      case 'swing':
        this.audio.play(e.heavy ? 'swingHeavy' : 'swing', { pitch: e.heavy ? 0.9 - e.level * 0.05 : 0.95 + Math.random() * 0.1 })
        break
      case 'step':
        this.audio.play('step', { volume: 0.35, pitch: 0.9 + Math.random() * 0.2 })
        if (e.water) {
          this.fx.splash(_v.copy(e.pos).setY(WATER_LEVEL), 6, 0.5)
          this.audio.play('splash', { volume: 0.25 })
        }
        break
      case 'vault':
        break
      case 'dodge':
        this.tuning?.activate('dodge')
        this.audio.play('dodge', { pitch: e.leap ? 0.85 : 1 })
        if (e.leap) {
          this.fx.ring(h.pos, 3, '#e8dcc0', 0.35)
          this.ghostTrail()
        }
        this.fx.dust(h.pos, 8, 0.9, '#b9a888', 1)
        this.fx.dirtBurst(h.pos, 5, 3)
        if (this.tipIndex === 3) this.advanceTip()
        break
      case 'chargeLevel':
        this.audio.play('charge', { pitch: 0.9 + e.level * 0.18 })
        h.bladeSegment(_base, _tip)
        this.fx.embers(_tip, 8 + e.level * 6, '#ffcc66', 0.5, 2.5)
        this.fx.sparks(_tip, 10 + e.level * 6, '#ffe2a0', 6)
        this.fx.flash(_tip, '#ffd27a', 1.4 + e.level * 0.6, 'star', 0.18)
        this.fx.ring(h.pos, 2.5 + e.level * 1.2, e.level >= 3 ? '#ffb347' : '#ffe2a8', 0.45)
        this.hooks.chargeBurst(e.level)
        if (e.level >= 3) this.punchGrade(0.25, 0, 0.15, '#2a1400')
        this.cam.kick(0.15 * e.level)
        break
      case 'hookFire':
        this.audio.play('grapple')
        this.audio.play('zip', { volume: 0.6 })
        this.fx.sparks(_v.copy(h.pos).setY(h.pos.y + 1.4), 8, '#9ff6ff', 5)
        this.cam.kick(0.35)
        break
      case 'latch': {
        this.audio.play('clamp', { volume: 0.7 })
        const a = this.monster.rig.anchors[e.anchor]
        if (a) {
          this.fx.sparks(a.world, 16, '#9ff6ff', 7)
          this.fx.flash(a.world, '#bff8ff', 1.8, 'star', 0.16)
          this.fx.ring(a.world, 1.6, '#7fe8ff', 0.3)
        }
        break
      }
      case 'mount':
        this.monster.onMounted()
        this.hunt = { ...this.hunt, mounts: this.hunt.mounts + 1 }
        this.audio.play('clamp')
        this.hooks.banner(t('banner.mounted'), t('banner.mountedSub'), 'neutral')
        {
          const a = this.monster.rig.anchors[e.anchor]
          if (a) {
            this.fx.dust(a.world, 10, 1.2, this.monster.def.id === 'mossback' ? '#8a9a5a' : '#a89a80', 1.1)
            this.fx.dirtBurst(a.world, 8, 4)
          }
        }
        if (this.tipIndex === 4) this.advanceTip()
        break
      case 'climb': {
        this.audio.play('clamp', { volume: 0.4, pitch: 1.2 })
        const a = this.monster.rig.anchors[e.anchor]
        if (a) this.fx.sparks(a.world, 6, '#ffe0a8', 4)
        break
      }
      case 'land':
        if (h.state !== 'attack') h.vaultBoost = false
        this.fx.dust(e.pos, e.hard ? 14 : 6, 1.2, '#b9a888', e.hard ? 1.6 : 1)
        if (e.hard) {
          this.cam.shake(0.3)
          this.fx.ring(e.pos, 3, '#fff1c9', 0.35)
        }
        this.audio.play('step', { volume: e.hard ? 0.9 : 0.5, pitch: 0.7 })
        break
      case 'drink':
        this.audio.play('potion')
        this.hunt = { ...this.hunt, potionsUsed: this.hunt.potionsUsed + 1 }
        this.fx.heal(h.pos)
        this.hooks.pulse('heal')
        break
      case 'thrown':
        this.monster.onDismounted()
        this.audio.play('buck')
        this.hooks.toast(t('toast.thrown'))
        this.fx.dust(h.pos, 10, 1.4, '#b9a888', 1.4)
        if (this.tipIndex === 5 || this.tipIndex === 6) this.advanceTip()
        break
      case 'jumpOff':
        this.monster.onDismounted()
        if (this.tipIndex === 5) this.advanceTip()
        break
      case 'rideStart':
        this.monster.startRide()
        this.audio.play('roar', { volume: 0.5, pitch: 1.2 })
        this.fx.ring(this.monster.pos, 10, '#9ff6ff', 0.6)
        this.cam.kick(0.5)
        this.hooks.banner(t('banner.riding'), t('banner.ridingSub'), 'good')
        if (this.tipIndex === 5 || this.tipIndex === 6) this.finishTutorial()
        break
      case 'noStamina':
        this.audio.play('ui', { volume: 0.4, pitch: 0.6 })
        break
      case 'exhausted':
        this.hooks.toast(t('toast.exhausted'))
        break
      default:
        break
    }
  }

  private onMonsterEvent(e: MonsterEvent, playing: boolean): void {
    const def = this.monster.def
    switch (e.type) {
      case 'telegraph':
        if (playing) this.telegraph = { text: e.label, t: 1.6 }
        if (e.attack === 'signature') {
          this.sfx('roar', e.pos, 1.2, 20, 200)
          if (playing) {
            this.hooks.banner(e.label, t('banner.signatureSub'), 'danger')
            this.hooks.pulse('roar')
            this.punchGrade(0.6, 0.35, 0.7, '#3a0400')
            this.cam.shake(0.6)
            this.cam.kick(0.35)
          }
          const g = _v.copy(e.pos)
          g.y = heightAt(g.x, g.z)
          this.fx.ring(g, 30, def.palette.glow, 1.4)
          this.fx.ring(g, 18, '#ffffff', 1.0)
          this.fx.dust(g, 24, 8, '#b9a888', 2.6)
          this.fx.embers(g, 40, def.palette.glow, 5, 7)
        }
        break
      case 'roar':
        this.sfx('roar', e.pos, e.weak ? 0.6 : 1, 20, 160)
        {
          // Visible sound wave: expanding rings from the head plus flattened dust.
          const head = this.monster.rig.head.getWorldPosition(_v2)
          const g = _v.set(head.x, heightAt(head.x, head.z), head.z)
          this.fx.ring(g, e.weak ? 14 : 26, '#ffffff', 0.9)
          this.fx.ring(g, e.weak ? 8 : 16, '#fff1c9', 0.6)
          this.fx.dust(g, e.weak ? 8 : 18, 6, '#b9a888', 2.4)
          if (playing) {
            const k = this.distVolume(e.pos, 10, 60)
            this.cam.shake(k * 0.6)
            if (k > 0.3) {
              this.hooks.pulse('roar')
              this.punchGrade(0.45 * k, 0.1, 0.25 * k, '#1a0a00')
            }
          }
        }
        break
      case 'footstep': {
        const vol = this.distVolume(e.pos, 6, 70)
        this.audio.play('stomp', { volume: vol * 0.7, pitch: 0.9 + Math.random() * 0.2 })
        if (e.water) this.fx.splash(_v.copy(e.pos).setY(WATER_LEVEL), 16, 1.4)
        else {
          this.fx.dust(e.pos, 5, 1.6, '#b3a283', 2)
          if (vol > 0.3) this.fx.dirtBurst(e.pos, 4, 3.5)
        }
        if (playing && !this.hunter.mounted) this.cam.shake(vol * vol * 0.12)
        break
      }
      case 'slam':
        this.sfx('slam', e.pos, 1, 10, 110)
        this.fx.shockwave(e.pos, e.radius, '#fff1c9')
        this.fx.dust(e.pos, 22, e.radius * 0.4, '#b9a888', 3)
        this.fx.debrisBurst(e.pos, 14, 8)
        this.fx.flash(_v.copy(e.pos).setY(e.pos.y + 1), '#fff2d8', 4, 'star', 0.14)
        if (playing) this.cam.shake(this.distVolume(e.pos, 6, 50) * 0.8)
        break
      case 'ruptureStart':
        this.sfx('slam', e.pos, 0.9, 10, 110)
        this.sfx('crumble', e.pos, 1, 10, 100)
        this.fx.shockwave(e.pos, 7, def.palette.glow)
        this.fx.debrisBurst(e.pos, 10, 7)
        this.fx.flash(_v.copy(e.pos).setY(e.pos.y + 1), def.palette.glow, 5, 'star', 0.18)
        if (def.id === 'ashwing') this.fx.fire(e.pos, 20, '#ff8a3a', 2, 6)
        else if (def.id === 'tidehorn') this.fx.splash(e.pos, 26, 2)
        else this.fx.embers(e.pos, 30, '#c8e37a', 3, 6)
        if (playing) this.cam.shake(this.distVolume(e.pos, 6, 60) * 0.7)
        break
      case 'ruptureMark':
        this.fx.mark(e.pos, e.radius, e.delay, def.palette.glow)
        break
      case 'rupture': {
        const theme = def.id === 'ashwing' ? 'obsidian' : def.id === 'tidehorn' ? 'coral' : 'root'
        const big = e.idx % 3 === 0
        this.fx.rupture(e.pos, theme, e.radius, big)
        _v.copy(e.pos).setY(e.pos.y + 0.6)
        if (theme === 'obsidian') {
          this.fx.fire(_v, big ? 12 : 7, '#ff9a40', e.radius * 0.6, 7)
          this.fx.embers(_v, 10, '#ffb35a', e.radius * 0.5, 5)
        } else if (theme === 'coral') {
          this.fx.splash(_v, big ? 22 : 12, 1.6)
          this.fx.sparks(_v, 8, '#9ff3ea', 8)
        } else {
          this.fx.embers(_v, big ? 14 : 8, '#c8e37a', e.radius * 0.5, 4)
        }
        if (e.idx % 2 === 0) this.sfx(theme === 'coral' ? 'splash' : 'crumble', e.pos, 0.55, 6, 70)
        if (big && playing) this.cam.shake(this.distVolume(e.pos, 4, 30) * 0.35)
        break
      }
      case 'volleyMark':
        this.fx.mark(e.pos, e.radius, e.delay, def.palette.glow)
        break
      case 'volleyLaunch':
        this.sfx('volley', e.pos, 1, 10, 100)
        if (def.id === 'ashwing') this.fx.fire(e.pos, 16, '#ffb35a', 1.6, 7)
        else if (def.id === 'tidehorn') this.fx.splash(e.pos, 20, 1.4)
        else this.fx.embers(e.pos, 26, def.palette.glow, 3, 8)
        break
      case 'volleyImpact':
        this.sfx('blast', e.pos, 0.8, 6, 70)
        if (def.id === 'ashwing') {
          this.fx.fire(e.pos, 22, '#ffa040', e.radius * 0.8, 8)
          this.fx.flash(_v.copy(e.pos).setY(e.pos.y + 1), '#ffb35a', e.radius * 1.4, 'star', 0.2)
        } else if (def.id === 'tidehorn') {
          this.fx.splash(e.pos, 30, 2.2)
          this.sfx('splash', e.pos, 0.8, 6, 60)
        } else {
          this.fx.embers(e.pos, 30, def.palette.glow, e.radius, 5)
          this.fx.dust(e.pos, 10, e.radius * 0.6, '#b6c070', 2.2)
        }
        this.fx.sparks(e.pos, 18, def.palette.glow, 10)
        this.fx.ring(e.pos, e.radius * 1.3, def.palette.glow, 0.4)
        this.fx.dust(e.pos, 6, e.radius * 0.5, '#8f8570', 2)
        this.fx.dirtBurst(e.pos, 8, 6)
        if (playing) this.cam.shake(this.distVolume(e.pos, 3, 30) * 0.35)
        break
      case 'bite':
        this.sfx('bite', e.pos, 1, 8, 60)
        break
      case 'whoosh':
        this.sfx('whoosh', e.pos, 1, 8, 60)
        break
      case 'chargeStart':
        this.sfx('roar', e.pos, 0.4, 10, 90)
        this.fx.dust(e.pos, 12, 3, '#b9a888', 2.2)
        break
      case 'enrage':
        if (playing) this.hooks.banner(t('banner.enraged'), t('banner.enragedSub'), 'danger')
        {
          const c = _v.copy(this.monster.pos).setY(this.monster.pos.y + this.monster.rig.dims.hipHeight)
          this.fx.embers(c, 40, def.palette.glow, this.monster.rig.dims.bodyWidth * 1.4, 4)
          this.fx.flash(c, def.palette.glow, 8, 'star', 0.3)
        }
        break
      case 'topple':
        if (this.hunter.mounted) this.hunter.throwOff()
        if (playing && e.reason !== 'slam') this.hooks.banner(t('banner.toppled'), t('banner.toppledSub'), 'good')
        this.audio.play('stomp', { volume: 1, pitch: 0.6 })
        this.fx.dust(this.monster.pos, 26, 6, '#b9a888', 3)
        this.fx.shockwave(this.monster.pos, 12, '#fff1c9')
        this.fx.debrisBurst(this.monster.pos, 10, 6)
        break
      case 'break':
        this.fx.impact(e.pos, def.palette.glow, true, true)
        this.fx.embers(e.pos, 36, def.palette.glow, 1.5, 5)
        this.fx.flash(e.pos, '#fff2d8', 7, 'star', 0.26)
        this.fx.ring(e.pos, 5, def.palette.glow, 0.45)
        this.fx.debrisBurst(e.pos, 12, 9)
        break
      case 'thrashWarn':
        if (this.hunter.mounted) this.audio.play('ui', { volume: 0.6, pitch: 1.4 })
        break
      case 'buck':
        this.audio.play('buck')
        if (this.hunter.mounted) {
          if (e.forced) this.hunter.throwOff()
          else if (this.hunter.bracing) {
            this.audio.play('brace')
            this.hooks.toast(t('toast.heldOn'))
          }
        }
        break
      case 'wallSlam': {
        const r = dealDamage(this.hunt, Math.round(this.hunt.monsterMax * 0.05))
        this.hunt = { ...r.state, wallSlams: r.state.wallSlams + 1 }
        this.fx.debrisBurst(e.pos, 36, 13)
        this.fx.dust(e.pos, 34, 5, '#9d9380', 4.5)
        this.fx.shockwave(e.pos, 16, '#fff1c9')
        this.fx.flash(e.pos, '#fff2d8', 10, 'star', 0.3)
        this.sfx('slam', e.pos, 1, 10, 120)
        this.audio.play('crumble')
        this.cam.shake(1)
        this.cam.kick(0.9)
        this.freeze = Math.max(this.freeze, 0.3)
        this.hunter.hitstop = Math.max(this.hunter.hitstop, 0.3)
        this.hooks.pulse('true')
        this.punchGrade(0.9, 0.1, 0.35, '#1a0e00')
        this.hooks.banner(t('banner.wallSlam'), t('banner.wallSlamSub'), 'gold')
        if (this.tipIndex >= 0) this.finishTutorial()
        if (r.killed) this.onVictory()
        break
      }
      case 'crash':
        this.fx.debrisBurst(e.pos, 24, 10)
        this.fx.dust(e.pos, 22, 4, '#9d9380', 3.4)
        this.fx.shockwave(e.pos, 12, '#fff1c9')
        this.sfx('slam', e.pos, 0.9, 10, 110)
        this.sfx('crumble', e.pos, 0.8, 10, 110)
        if (playing) {
          this.cam.shake(this.distVolume(e.pos, 8, 60) * 0.9)
          this.hooks.banner(t('banner.crash'), t('banner.toppledSub'), 'good')
        }
        break
      case 'death':
        this.sfx('roar', e.pos, 0.8, 20, 160)
        this.sfx('faint', e.pos, 0.3, 20, 160)
        this.fx.shockwave(e.pos, 22, '#fff1c9')
        this.fx.dust(e.pos, 30, 8, '#b9a888', 3.5)
        break
      case 'flee':
        if (playing) {
          this.hooks.banner(t('banner.fleeing'), t('banner.fleeingSub', { name: def.name }), 'good')
          this.lockOn = false
        }
        break
      case 'rest':
        if (playing) this.hooks.toast(t('toast.resting', { name: def.name }))
        break
      case 'wake':
        if (playing) this.hooks.toast(t('toast.woke', { name: def.name }))
        break
      case 'alert':
        if (playing && !this.seen) this.hooks.toast(t('toast.alert', { name: def.name }))
        this.seen = true
        if (this.tipIndex === 1) this.advanceTip()
        break
      default:
        break
    }
  }

  // ─── tutorial ──────────────────────────────────────────────────────────
  private advanceTip(): void {
    if (this.tipIndex < 0) return
    this.tipIndex += 1
    this.tipTimer = 0
    this.tipProgress = 0
    if (this.tipIndex > 6) this.finishTutorial()
  }

  private finishTutorial(): void {
    this.tipIndex = -1
    this.save.update({ tutorialDone: true })
  }

  private updateTutorial(dt: number): void {
    if (this.tipIndex < 0 || this.mode !== 'playing') return
    this.tipTimer += dt
    const h = this.hunter
    switch (this.tipIndex) {
      case 0:
        this.tipProgress += h.pos.distanceTo(this.lastPos)
        if (this.tipProgress > 12 || this.tipTimer > 14) this.advanceTip()
        break
      case 1:
        if (this.monster.pos.distanceTo(h.pos) < 40 || this.tipTimer > 25) this.advanceTip()
        break
      case 2:
        if (this.tipProgress >= 3 || this.tipTimer > 30) this.advanceTip()
        break
      case 3:
        if (this.tipTimer > 16) this.advanceTip()
        break
      case 4:
        if (this.tipTimer > 40) this.advanceTip()
        break
      case 5:
        if (this.tipProgress >= 2 || this.tipTimer > 30) this.advanceTip()
        break
      case 6:
        if (this.tipTimer > 22) this.finishTutorial()
        break
    }
    this.lastPos.copy(h.pos)
  }

  // ─── rendering ─────────────────────────────────────────────────────────
  frame(dt: number): void {
    if (this.input.pressed('pause')) {
      if (this.mode === 'playing') this.pause()
      else if (this.mode === 'paused') this.resume()
    }
    const h = this.hunter
    const m = this.monster
    const look = this.input.consumeLook(dt)
    if (this.mode === 'title' || this.mode === 'results') {
      _v.copy(m.pos).setY(m.pos.y + m.rig.dims.height * 0.5)
      this.cam.orbit(dt, _v, 36, 7, 0.045, this.mode === 'title' ? 11 : 0)
    } else if (this.killCam > 0 && this.mode === 'ending') {
      // Kill cam: slow cinematic orbit around the fallen quarry.
      this.killCam -= dt
      _v.copy(m.pos).setY(m.pos.y + m.rig.dims.height * 0.45)
      this.cam.orbit(dt, _v, m.rig.dims.length * 1.15 + 8, m.rig.dims.height * 0.6, 0.35, 0)
      if (this.killCam <= 0) this.cam.snap(h.pos, this.cam.yaw, 0.2)
    } else {
      const playing = this.mode === 'playing' || this.mode === 'ending'
      const lock = this.lockOn && m.alive && !h.mounted ? _v.copy(m.pos).setY(m.pos.y + m.rig.dims.hipHeight) : null
      const target = _v2.copy(h.pos)
      if (h.mounted) target.y -= 0.8
      this.cam.update(dt, {
        target,
        look: this.mode === 'paused' || !playing ? { x: 0, y: 0 } : look,
        sensitivity: this.save.settings.sensitivity,
        invertY: this.save.settings.invertY,
        lockTarget: lock,
        mounted: h.mounted,
        riding: h.riding,
        sprinting: h.sprinting,
        charge: h.chargeProgress,
        monsterDistance: m.pos.distanceTo(h.pos),
        monsterHeight: m.rig.dims.height,
        shakeEnabled: this.save.settings.shake,
        occluders: m.alive || m.rig.root.visible ? m.rig.hitSpheres : undefined,
      })
    }
    if (this.mode !== 'paused') {
      h.sync(dt)
      // Slash trail.
      if (h.inSwingWindow) {
        if (!this.trailOn) {
          this.trailOn = true
          this.fx.trailStart(h.swing?.heavy ? '#ffc56b' : '#fff0d0')
        }
        h.bladeSegment(_base, _tip)
        this.fx.trailPush(_base, _tip)
      } else if (this.trailOn) {
        this.trailOn = false
        this.fx.trailEnd()
      }
      if (h.state === 'charge' && h.chargeLevel >= 2 && Math.random() < 0.4) {
        h.bladeSegment(_base, _tip)
        this.fx.embers(_tip, 1, '#ffcc66', 0.3, 1.5)
      }
      this.updateWisps(dt)
      this.fx.update(dt)
      const tramplers = [{ x: h.pos.x, y: h.pos.y, z: h.pos.z, r: 1.3 }]
      for (const leg of m.rig.legs) {
        leg.foot.getWorldPosition(_v)
        tramplers.push({ x: _v.x, y: _v.y, z: _v.z, r: m.def.plan.legThick * 2.4 })
      }
      tramplers.push({ x: m.pos.x, y: heightAt(m.pos.x, m.pos.z), z: m.pos.z, r: m.def.plan.bodyWidth * 0.9 })
      this.env.setTramplers(tramplers)
      const focus = this.mode === 'title' || this.mode === 'results' ? m.pos : h.pos
      const r = this.env.update(dt, this.cam.camera, focus)
      if (r.embers) this.fx.embers(_v.copy(r.embers).setY(r.embers.y + 0.6), 1, '#ffb35a', 0.4, 1.8)
      this.updateAudio()
    }
    // Screen grade decays smoothly toward neutral; Flow Evade holds it during slow motion.
    const g = this.grade
    const hold = this.slowmo > 0 && this.slowmoScale < 0.3
    const k = Math.exp(-dt * (hold ? 1.5 : 5))
    g.chroma *= k
    g.desat *= hold ? 1 : k
    g.vignette *= k
    const sc = this.renderer.screen
    const low = this.mode === 'playing' && this.hunter.vitals.hp / this.hunter.vitals.max < 0.3
    sc.chroma = g.chroma
    sc.desat = g.desat
    sc.vignette = Math.max(g.vignette, low ? 0.3 + Math.sin(performance.now() * 0.006) * 0.08 : 0)
    sc.tint.copy(g.vignette > 0.05 ? g.tint : _lowTint)
    this.renderer.render(this.scene, this.cam.camera)
  }

  /** Emberwisps: guide lights drifting from the hunter toward the quarry (brighter when facing it). */
  private updateWisps(dt: number): void {
    const h = this.hunter
    const m = this.monster
    if (this.mode !== 'playing' || !m.alive || h.mounted || h.state === 'faint') return
    const dist = m.pos.distanceTo(h.pos)
    const fleeing = m.state === 'flee'
    if (dist < (fleeing ? 14 : 26)) return
    const rate = (fleeing ? 22 : 12) * this.fx.density
    this.wispT += dt * rate
    _fwd.set(m.pos.x - h.pos.x, 0, m.pos.z - h.pos.z).normalize()
    const facing = clamp((-Math.sin(this.cam.yaw) * _fwd.x - Math.cos(this.cam.yaw) * _fwd.z + 1) * 0.5, 0, 1)
    while (this.wispT >= 1) {
      this.wispT -= 1
      const a = Math.random() * Math.PI * 2
      _v.set(h.pos.x + Math.cos(a) * 1.4 + _fwd.x * 1.5, h.pos.y + 0.8 + Math.random() * 1.2, h.pos.z + Math.sin(a) * 1.4 + _fwd.z * 1.5)
      _v2.set(_fwd.x * (3.5 + Math.random() * 2) + (Math.random() - 0.5), 0.2 + (Math.random() - 0.5) * 0.6, _fwd.z * (3.5 + Math.random() * 2) + (Math.random() - 0.5))
      this.fx.wisp(_v, _v2, facing)
    }
  }

  private updateAudio(): void {
    const m = this.monster
    const h = this.hunter
    let intensity = 0.15
    if (this.mode === 'playing' || this.mode === 'ending') {
      const combat = m.state !== 'roam' && m.alive
      intensity = combat ? (m.enraged ? 1 : 0.7) : 0.25
      if (h.mounted) intensity = Math.max(intensity, 0.85)
      if (!m.alive) intensity = 0.1
    }
    this.audio.setIntensity(intensity)
    const hpk = this.mode === 'playing' ? h.vitals.hp / h.vitals.max : 1
    this.audio.setHeartbeat(hpk < 0.3 ? 1 - hpk / 0.3 * 0.6 : 0)
    const listener = this.mode === 'title' || this.mode === 'results' ? this.cam.camera.position : h.pos
    this.audio.setAmbience(0.55 + Math.min(0.35, Math.max(0, listener.y - 4) * 0.01), this.env.waterAt(listener))
  }

  // ─── HUD ───────────────────────────────────────────────────────────────
  hud(): HudState {
    const h = this.hunter
    const m = this.monster
    const v = h.vitals
    const anchors = m.rig.anchors
    const target = this.grappleTarget >= 0 ? anchors[this.grappleTarget] : null
    const prompts: Prompt[] = []
    const mode = this.mode
    if (mode === 'playing') {
      if (h.mounted) {
        if (h.riding) {
          prompts.push({ keys: ['W', 'A', 'S', 'D'], label: t('prompt.steer') }, { keys: ['LMB'], label: t('prompt.stab') })
        } else {
          prompts.push({ keys: ['W', 'S'], label: t('prompt.climb') }, { keys: ['LMB'], label: t('prompt.stab') }, { keys: ['RMB'], label: t('prompt.finisher') })
          if (anchors[h.mountAnchor]?.ride) prompts.push({ keys: ['E'], label: t('prompt.ride') })
        }
        prompts.push({ keys: ['Shift'], label: t('prompt.brace') }, { keys: ['Space'], label: t('prompt.jumpOff') })
      } else if (h.state === 'air') {
        prompts.push({ keys: ['LMB'], label: t(h.vaultBoost ? 'prompt.vaultPlunge' : 'prompt.plunge') })
      } else if (h.state === 'down') {
        prompts.push({ keys: ['Space'], label: t('prompt.getUp') })
      } else {
        if (this.monster.ruptureThreat(h.pos) < 1.1) prompts.push({ keys: ['Space'], label: t('prompt.vault') })
        if (target) prompts.push({ keys: ['E'], label: `${t('prompt.grapple')} · ${target.label}` })
        if (this.nearHerb() >= 0) prompts.push({ keys: ['F'], label: t('prompt.gather') })
        else if (this.nearSupply() && h.potions < CONFIG.hunt.potions) prompts.push({ keys: ['F'], label: t('prompt.resupply') })
        if (v.hp < v.max * 0.5 && h.potions > 0) prompts.push({ keys: ['R'], label: `${t('prompt.potion')} (${h.potions})` })
      }
    }
    const mountLabels = anchors.map(a => ({ label: a.label, vital: !!a.vital, ride: !!a.ride, broken: a.vital ? m.rig.vitals[a.vital].broken : false }))
    const combo = h.attackName
    return {
      hp: v.hp,
      red: v.red,
      maxHp: v.max,
      stamina: v.stamina,
      maxStamina: v.maxStamina,
      exhausted: h.exhausted,
      potions: h.potions,
      faints: this.hunt.faints,
      maxFaints: this.hunt.maxFaints,
      clock: formatClock(this.hunt.elapsed),
      timeLeft: this.hunt.timeLimit - this.hunt.elapsed,
      objective: t('hud.objective', { name: m.def.name }),
      monster: {
        name: m.def.name,
        title: m.def.title,
        hp: this.hunt.monsterHp / this.hunt.monsterMax,
        tags: this.wounded.size ? [...m.statusTags(), t('hud.tagWounded')] : m.statusTags(),
        enraged: m.enraged,
        vitals: m.def.vitals.map(d => {
          const vv = m.rig.vitals[d.slot]
          return { slot: d.slot, name: d.name, broken: vv.broken, frac: vv.broken ? 0 : clamp(vv.hp / Math.max(1, vv.max), 0, 1) }
        }),
        seen: this.seen || m.state !== 'roam' || m.pos.distanceTo(h.pos) < 60,
      },
      reticle: { label: target ? target.label : null, vital: !!target?.vital, locked: this.lockOn },
      charge: h.chargeProgress,
      chargeLevel: h.state === 'charge' ? h.chargeLevel : 0,
      combo: combo ? t(`combo.${combo}`) : '',
      comboStep: COMBO_STEP[combo] ?? 0,
      mount: h.mounted
        ? { active: true, index: h.mountAnchor, labels: mountLabels, riding: h.riding, ride: clamp(m.rideT / CONFIG.grapple.rideTime, 0, 1), thrash: m.thrashWarning, bucking: m.bucking, bracing: h.bracing }
        : null,
      prompts,
      telegraph: this.telegraph?.text ?? null,
      lockOn: this.lockOn,
      tip: this.tipIndex >= 0 && mode === 'playing' ? t(`tip.${this.tipIndex}`) : null,
      map: {
        hx: h.pos.x,
        hz: h.pos.z,
        hh: h.heading,
        mx: m.pos.x,
        mz: m.pos.z,
        mh: m.heading,
        yaw: this.cam.yaw,
        herbs: this.env.herbs.filter(x => x.available).map(x => ({ x: x.pos.x, z: x.pos.z })),
        seen: this.seen || m.state !== 'roam',
      },
      lowHealth: v.hp < v.max * 0.3,
    }
  }
}
