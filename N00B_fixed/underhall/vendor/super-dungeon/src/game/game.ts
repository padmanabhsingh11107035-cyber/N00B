import * as THREE from 'three'
import type { Audio, Sfx, Track } from '../engine/audio'
import { AssetStreamer } from '../engine/streamer'
import type { Input } from '../engine/input'
import type { Renderer } from '../engine/renderer'
import type { SaveStore } from '../engine/save'
import { Boss, type BossActor, type BossCtx } from './boss'
import { Librarian } from './librarian'
import { ShoulderCamera } from './camera'
import { WING_IDS,
  BOSSES, CLASSMATE_BY_ID, FLOOR_BOSS, FLOOR_COUNT, CLASSMATES, DEV_BOARD, ENEMIES, LORE, RELIC_BY_ID, RELICS, UPGRADE_BY_ID, UPGRADES, WINGS,
  type ClassmateId, type DevId, type EnemyType, type HazardType, type UpgradeId,
} from './content'
import { floorSeed, generateDungeon, TILE, type DungeonPlan, type RoomPlan } from './dungeon'
import { Enemy, type CombatCtx } from './enemies'
import { Fx, type Shot } from './fx'
import { Hazard } from './hazards'
import { HERO_RADIUS, Hero, NOVA_COST, type HeroEvent, type HeroIntent } from './hero'
import { buildHubSource, dressHub, type HubMarkers } from './hub'
import { Level, tileCenter } from './level'
import { drawMap } from './minimap'
import { makeCrystal, makeFountain, makeLectern, makePedestal, makePortal, makeVending } from './models'
import { makeClassmate, RescueSequence, updateAmbient, upgradeHeroView } from './actors'
import { DANCE_FOR } from './dances'
import { preloadCharacters } from './character'
import { preloadAll, preloadTexture } from './assets3d'
import { wingAssets } from './surfaces'
import { makeCoin, makeOrb, makeRelicGem, makeUpgradeOrb } from './pickups'
import { hashSeed, mulberry32, randomSeed } from './rng'
import { Tutorial } from './tutorial'
import {
  addUpgrade, computeMerits, deriveStats, emptyBuild, heroRank, rollDamage, rollUpgradeChoices, takeDamage,
  type HeroStats, type RunBuild, type RunSummary,
} from './rules'
import type { HudData, ShopItem, UI } from '../ui/ui'
import { tuning } from '../../../../src/game/tuning'

type Mode = 'title' | 'hub' | 'run' | 'results'

type Interactable = {
  kind: 'upgrade' | 'heal' | 'power' | 'coin' | 'relic' | 'fountain' | 'vending' | 'capsule' | 'lore' | 'portal' | 'vault' | 'board' | 'codex' | 'notice' | 'npc'
  pos: THREE.Vector3
  radius: number
  prompt: string
  auto: boolean
  obj: THREE.Object3D
  bob?: THREE.Object3D
  room: number
  used: boolean
  enabled: boolean
  value?: number
  data?: string
  vel?: THREE.Vector3
}

type RunState = {
  seed: number
  plan: DungeonPlan
  build: RunBuild
  credits: number
  kills: number
  roomsCleared: number
  rescues: ClassmateId[]
  relics: number
  lore: number
  time: number
  discovered: Set<number>
  visited: Set<number>
  cleared: Set<number>
  current: number
  active: number | null
  wave: number
  waveDelay: number
  rerolls: number
  revived: boolean
  bossDefeated: boolean
  shop: Map<number, ShopItem[]>
  over: boolean
  /** 1-based floor the hero is on. */
  floor: number
  /** Bosses beaten this run. */
  bosses: number
}

const MELEE_BASE = [14, 14, 28]
const MELEE_KNOCK = [5, 5, 13]
const MELEE_RANGE = 2.7
const COMBAT_KINDS = new Set(['combat', 'elite', 'challenge', 'rescue'])

/**
 * Stages of play, in order. Boot loads `title` + `wave1` (everything the title screen and the
 * first fight need) and then shows the title; every later stage streams in the background.
 */
export const LOAD_STAGES = ['title', 'hub', 'wave1', 'floor1', 'boss1', 'floor2', 'boss2'] as const
export type LoadStage = (typeof LOAD_STAGES)[number]
/** Title audio is ready before the menu; campus and first-wave assets load on their own stages. */
const BOOT_STAGES: LoadStage[] = ['title']
/** Sound clips each stage needs (a clip not loaded yet plays its synthesized fallback). */
const STAGE_SFX: Partial<Record<LoadStage, Sfx[]>> = {
  title: ['ui', 'portal'],
  wave1: ['swing', 'hit', 'crit', 'bolt', 'nova', 'dash', 'hurt', 'block', 'enemyDie', 'enemyShoot', 'telegraph', 'lock', 'unlock', 'reward', 'coin'],
  floor1: ['heal', 'rescue', 'lose'],
  boss1: ['roar', 'slam', 'bossDie', 'descend'],
  boss2: ['shush', 'shelf', 'pages', 'blink', 'libRoar'],
}
/** Music each stage buffers ahead of time (never waited on: tracks stream as they play). */
const STAGE_MUSIC: Partial<Record<LoadStage, Track[]>> = {
  hub: ['hub'], floor1: ['floor1'], boss1: ['boss1'], floor2: ['floor2'], boss2: ['boss2', 'victory'],
}

const mark = (name: string) => performance.mark(`aegis:${name}`)
const nextFrame = () => new Promise<void>(res => requestAnimationFrame(() => res()))

export class Game {
  readonly scene = new THREE.Scene()
  readonly cam = new ShoulderCamera()
  readonly hero = new Hero()
  readonly fx = new Fx()
  private level?: Level
  private markers?: HubMarkers
  private portalSwirl?: THREE.Mesh
  private mode: Mode = 'title'
  private run: RunState | null = null
  private enemies: Enemy[] = []
  private boss?: BossActor
  private hazards = new Map<number, Hazard[]>()
  private items: Interactable[] = []
  private npcs: { obj: THREE.Group; id: ClassmateId }[] = []
  private hitstop = 0
  private time = 0
  private mapOpen = false
  /** First-time / replayed movement training. Only ever lives in the hub. */
  private tutorial: Tutorial | null = null
  private tutorialWait = 0
  private dashHits = new Set<unknown>()
  private swingId = 0
  private focus?: Interactable
  private titleAngle = 0
  /** Freed classmates playing their drop / get-up / dance sequence. */
  private rescueSeqs: { seq: RescueSequence; pos: THREE.Vector3; color: string; talk: (() => void) | null }[] = []
  private readonly intent: HeroIntent = { move: new THREE.Vector3(), attack: false, bolt: false, dash: false, jump: false, sprint: false, nova: false, aim: new THREE.Vector3(0, 0, -1) }
  private readonly v1 = new THREE.Vector3()
  private readonly v2 = new THREE.Vector3()
  private debug = false

  /** Staged background loading; paused while the fight is hot (see `heat`). */
  readonly streamer = new AssetStreamer({ stages: LOAD_STAGES, heat: () => this.heat() })
  /** True while a scene transition is building/warming behind the curtain. */
  private loading = false
  private transitionId = 0
  private corePromise?: Promise<void>
  private hubBuilt!: () => void
  private readonly hubReady = new Promise<void>(res => { this.hubBuilt = res })
  /** Campus built, its assets loaded and shaders compiled: the title can show the live scene. */
  campusLive = false
  /** The campus may render (under the poster) once its shaders and textures are ready. */
  private campusPrimed = false
  private campusPromise?: Promise<void>

  constructor(
    private readonly renderer: Renderer,
    private readonly input: Input,
    private readonly audio: Audio,
    private readonly save: SaveStore,
    private readonly ui: UI,
  ) {
    this.scene.add(this.fx.group, this.hero.rig.root)
    this.fx.reduced = save.data.reducedMotion
    this.cam.reducedMotion = save.data.reducedMotion
    this.debug = new URLSearchParams(location.search).has('debug')
    if (this.debug) (window as unknown as Record<string, unknown>).__aegis = this
    this.registerAssets()
  }

  // ─── Staged loading ────────────────────────────────────────────────────

  private registerAssets(): void {
    const st = this.streamer
    // Campus (behind the title): hero + campus models/surfaces, then its shaders once it's built.
    st.add('hub', 'models:campus', () => this.loadCore(), { label: 'Suiting up' })
    st.add('hub', 'shaders:campus', async () => {
      await this.hubReady
      await this.renderer.warm(this.scene, this.scene, this.cam.camera)
    }, { label: 'Compiling campus shaders' })
    // First wave: enemy bodies, then every enemy archetype, pickup, hazard and room prop a first fight can show.
    st.add('wave1', 'models:enemies', () => preloadCharacters(['shade', 'bruiser']), { label: 'Loading the Underhall' })
    st.add('wave1', 'shaders:combat', async () => {
      await preloadCharacters(['shade', 'bruiser'])
      mark('wave1-warm')
      await this.renderer.warm(this.combatWarmSet(), this.scene, this.cam.camera)
      mark('wave1-warmed')
    }, { label: 'Compiling enemy shaders' })
    // Floors: wing surfaces/props for every wing the floor can roll, plus classmates to rescue.
    st.add('floor1', 'models:floor1', () => Promise.all([
      preloadCharacters(CLASSMATES.map(c => c.id)),
      ...WING_IDS.filter(w => w !== 'stacks').map(w => { const a = wingAssets(w); return preloadAll(a.models, a.textures) }),
    ]).then(() => undefined), { label: 'Loading the wings' })
    st.add('floor2', 'models:floor2', () => { const a = wingAssets('stacks'); return preloadAll(a.models, a.textures) }, { label: 'Loading the Stacks' })
    st.add('boss1', 'models:proctor', () => preloadCharacters(['proctor']), { label: 'Summoning The Proctor' })
    st.add('boss2', 'models:librarian', () => preloadCharacters(['librarian']), { label: 'Waking The Librarian' })
    st.add('boss1', 'shaders:proctor', async () => {
      await preloadCharacters(['proctor'])
      await this.renderer.warm(new Boss(0, 0).rig.root, this.scene, this.cam.camera)
    }, { label: 'Compiling The Proctor' })
    st.add('boss2', 'shaders:librarian', async () => {
      await preloadCharacters(['librarian'])
      await this.renderer.warm(new Librarian(0, 0, 22).warmSet(), this.scene, this.cam.camera)
    }, { label: 'Compiling The Librarian' })
    for (const stage of LOAD_STAGES) {
      const clips = STAGE_SFX[stage]
      if (clips) st.add(stage, `sfx:${stage}`, () => this.audio.loadClips(clips), { label: stage === 'wave1' ? 'Loading combat sounds' : 'Loading sounds', essential: stage !== 'title' })
      for (const t of STAGE_MUSIC[stage] ?? []) st.add(stage, `music:${t}`, () => this.audio.prefetch(t), { label: `Buffering ${t} music`, essential: false })
    }
  }

  private combatWarmSet(): THREE.Object3D {
    const g = new THREE.Group()
    for (const type of Object.keys(ENEMIES) as EnemyType[]) for (const elite of [false, true]) g.add(new Enemy(type, elite, 0, 0, '#ffd35c').rig.root)
    g.add(makeUpgradeOrb(), makeOrb('#6dff9e'), makeCoin(), makeRelicGem(), makePortal('#7ef9ff', 1.8).root)
    g.add(makeCrystal(), makeFountain(), makeVending(), makeLectern(), makePedestal('#ffd35c'))
    const hazards: HazardType[] = ['chalk', 'acid', 'spark', 'laser', 'tomes', 'vent']
    for (const type of hazards) g.add(new Hazard({ type, tx: 0, ty: 0, axis: 'x', from: 0, to: 2, phase: 0 }).group)
    return g
  }

  /**
   * How busy the screen is, 0..1: an active fight, live enemies, particles, projectiles and
   * telegraphs, or a boss fight (always hot). Background loading pauses above ~0.5.
   */
  private heat(): number {
    if (this.mode !== 'run' || !this.run || this.loading) return 0
    const b = this.boss
    if (b && b.state !== 'dormant' && b.state !== 'dead') return 1
    let alive = 0
    for (const e of this.enemies) if (e.alive) alive += 1
    return Math.min(1, (this.run.active !== null ? 0.35 : 0) + alive * 0.08 + this.fx.load)
  }

  /** Hero, rescued classmates, campus props/surfaces and the particle atlas (memoized). */
  private loadCore(): Promise<void> {
    this.corePromise ??= (async () => {
      const hub = wingAssets('hub')
      await Promise.all([
        preloadCharacters(['hero', ...this.save.data.rescued]),
        preloadAll(hub.models, hub.textures),
        preloadTexture('fx/particles.webp', { srgb: true }),
        preloadTexture('tex/crepe_satin_nor.webp', { repeat: 2 }),
        preloadTexture('tex/crepe_satin_arm.webp', { repeat: 2 }),
      ])
    })().catch(err => {
      // Missing assets degrade to the procedural look instead of blocking the game.
      console.warn('[aegis] core assets failed, using fallback visuals', err)
    })
    return this.corePromise
  }
  /** Load the title's UI/portal sounds, then prepare the live campus behind the menu. */
  async boot(progress: (p: number, label: string) => void): Promise<void> {
    const report = () => progress(this.streamer.progress(BOOT_STAGES, true), this.streamer.activity(BOOT_STAGES))
    const timer = window.setInterval(report, 60)
    report()
    await Promise.all(BOOT_STAGES.map(s => this.streamer.require(s)))
    window.clearInterval(timer)
    progress(1, 'Opening the doors...')
    void this.prepareCampus()
  }

  /**
   * Behind the title: load and build the campus, compile its shaders, then reveal the live scene
   * under the title (the poster crossfades away) and move straight on to the first wave's assets.
   */
  prepareCampus(): Promise<void> {
    this.campusPromise ??= (async () => {
      this.streamer.focus('hub')
      const hub = this.streamer.require('hub')
      await this.loadCore()
      mark('campus-loaded')
      // Heavy steps each get their own frame so the title stays responsive: the PBR
      // environment probe (a small synchronous GPU render), then the campus build.
      await nextFrame()
      void this.renderer.environment
      mark('campus-env')
      await nextFrame()
      upgradeHeroView(this.hero.rig)
      this.enterHub(this.mode === 'title')
      mark('campus-built')
      this.hubBuilt()
      await hub
      // Shaders are compiled; now upload textures over several frames, then show the scene.
      await this.renderer.prime(this.scene)
      mark('campus-primed')
      this.campusPrimed = true
      await nextFrame()
      await nextFrame()
      mark('campus-live')
      this.campusLive = true
      this.ui.titleLive()
      this.streamer.focus('wave1')
      void this.streamer.require('wave1')
    })()
    return this.campusPromise
  }

  showTitle(): void {
    this.streamer.focus('title')
    this.ui.showTitle(true, this.save.data)
  }

  /**
   * Swap scenes behind a short curtain: fade out, build, then wait for the stage's essential
   * assets and the new scene's shaders before fading back in, so no hitch is ever visible.
   */
  private async transition(stages: LoadStage | LoadStage[], text: string, build: () => void): Promise<void> {
    const list = Array.isArray(stages) ? stages : [stages]
    const id = ++this.transitionId
    this.loading = true
    this.input.clearPresses()
    await this.ui.curtain(true, text)
    if (id !== this.transitionId) return
    build()
    const warmed = this.renderer.warm(this.scene, this.scene, this.cam.camera)
    const timer = window.setInterval(() => this.ui.curtainProgress(this.streamer.progress(list, true)), 60)
    await Promise.all([...list.map(st => this.streamer.require(st)), warmed])
    window.clearInterval(timer)
    if (id !== this.transitionId) return
    this.ui.curtainProgress(1)
    this.loading = false
    this.input.clearPresses()
    void this.ui.curtain(false)
  }

  // ─── Public flow ───────────────────────────────────────────────────────

  /** Synchronous start without staged boot (tests/tools); the game uses `boot()` + `showTitle()`. */
  start(): void {
    upgradeHeroView(this.hero.rig)
    this.hubBuilt()
    this.enterHub(true)
    this.campusLive = true
    this.campusPrimed = true
    this.showTitle()
  }

  /** Title → campus (first-time players get the story intro). */
  play(): void {
    this.audio.unlock()
    this.audio.music('hub')
    if (!this.campusLive) {
      // Faster than the network: cover the last of the campus loading with the curtain.
      if (this.loading) return
      this.loading = true
      void (async () => {
        await this.ui.curtain(true, 'Opening the Hall of Origins...')
        const timer = window.setInterval(() => this.ui.curtainProgress(this.streamer.progress(['hub'], true)), 60)
        await this.prepareCampus()
        window.clearInterval(timer)
        this.ui.curtainProgress(1)
        this.loading = false
        this.play()
        void this.ui.curtain(false)
      })()
      return
    }
    this.streamer.focus('hub')
    this.ui.showTitle(false)
    const go = () => {
      this.mode = 'hub'
      this.ui.setMode('hub')
      this.ui.banner('HALL OF ORIGINS', 'Super Academy  -  11:59 PM', 'gold')
      this.input.lockPointer()
    }
    if (!this.save.data.introSeen) {
      this.ui.openIntro(() => {
        this.save.update({ introSeen: true })
        go()
      })
    } else go()
  }

  get modalBlocking(): boolean {
    return this.ui.modalOpen
  }

  pause(): void {
    if (this.mode !== 'hub' && this.mode !== 'run') return
    if (this.ui.modalOpen) return
    this.input.unlockPointer()
    const r = this.run
    this.ui.openPause({
      training: this.mode !== 'hub' ? null : this.tutorial || !this.save.data.tutorialDone ? 'active' : 'replay',
      inRun: !!r,
      seed: r?.seed ?? this.save.data.lastSeed,
      wing: r ? WINGS[r.plan.wing].name : 'Hall of Origins',
      report: r ? r.plan.report : [],
      fallback: r?.plan.fallback ?? false,
      rooms: r ? r.plan.rooms.length : 0,
      build: r ? Object.entries(r.build.upgrades).map(([id, n]) => `${UPGRADE_BY_ID[id as UpgradeId].name}${n! > 1 ? ` x${n}` : ''}`) : [],
      relics: r ? r.build.relics.map(id => RELIC_BY_ID[id].name) : [],
    }, {
      resume: () => this.resume(),
      abandon: () => {
        this.ui.closeModal()
        if (this.run) this.endRun(false, true)
      },
      quit: () => {
        this.ui.closeModal()
        this.run = null
        this.enterHub(true)
        this.mode = 'title'
        this.ui.setMode('none')
        this.ui.showTitle(true, this.save.data)
      },
      settings: () => this.openSettings(() => this.pause()),
      training: () => this.startTraining(),
      skipTraining: () => this.skipTraining(),
    })
  }

  // ─── Movement training ─────────────────────────────────────────────────

  /**
   * Replay movement training from the hub pause menu. Purely a hub side activity: finishing or
   * skipping it leaves the player standing in the Hall of Origins, it never starts a run.
   */
  startTraining(): void {
    if (this.mode !== 'hub' || this.run) return
    this.tutorial = new Tutorial(true)
    this.audio.play('ui')
    this.resume()
  }
  skipTraining(): void {
    this.tutorial = null
    this.save.update({ tutorialDone: true })
    this.resume()
    this.ui.toast('Training skipped. Replay it any time from the pause menu.')
  }
  private stepTutorial(dt: number, events: HeroEvent[]): void {
    if (!this.tutorial) {
      if (this.save.data.tutorialDone || this.run) return
      // Let the "back on campus" banner land first.
      this.tutorialWait += dt
      if (this.tutorialWait < 1.8) return
      this.tutorial = new Tutorial(false)
      this.audio.play('ui')
    }
    const res = this.tutorial.update(dt, {
      sprinting: this.hero.sprinting,
      jumped: events.some(e => e.type === 'jump'),
      dashed: events.some(e => e.type === 'dash'),
    })
    if (res === 'step') this.audio.play('coin')
    else if (res === 'done') {
      const manual = this.tutorial.manual
      this.tutorial = null
      this.save.update({ tutorialDone: true })
      this.audio.play('reward')
      // Stay right here in the hub either way; the player walks to the portal when ready.
      this.ui.banner('TRAINING COMPLETE', manual ? 'Moves sharp. Carry on, hero.' : 'Now head north to the Vault Portal', 'green')
    }
  }

  resume(): void {
    this.ui.closeModal()
    this.input.clearPresses()
    this.input.lockPointer()
  }

  openSettings(back: () => void): void {
    this.ui.openSettings(this.save.data, patch => {
      this.save.update(patch)
      const d = this.save.data
      this.audio.setVolumes(d.musicVolume, d.sfxVolume, d.muted)
      this.input.sensitivity = d.sensitivity
      this.input.invertY = d.invertY
      this.fx.reduced = d.reducedMotion
      this.cam.reducedMotion = d.reducedMotion
      if (patch.quality) {
        this.renderer.applyQuality(d.quality)
        if (this.level) this.level.moon.shadow.mapSize.set(this.renderer.shadowMapSize, this.renderer.shadowMapSize)
      }
    }, back)
  }

  // ─── Hub ───────────────────────────────────────────────────────────────

  private setLevel(level: Level): void {
    this.level?.dispose()
    this.clearEntities()
    this.level = level
    this.scene.add(level.group)
    const fog = new THREE.Color(level.palette.fog).multiplyScalar(0.7)
    this.scene.background = fog
    this.scene.fog = new THREE.Fog(fog, level.src.kind === 'hub' ? 34 : 18, level.src.kind === 'hub' ? 100 : 52)
    this.scene.environment = this.renderer.environment
    this.scene.environmentIntensity = level.look.env
  }

  private clearEntities(): void {
    for (const e of this.enemies) e.dispose(this.fx)
    this.enemies = []
    this.boss?.dispose()
    this.boss = undefined
    for (const list of this.hazards.values()) for (const h of list) h.group.removeFromParent()
    this.hazards.clear()
    for (const it of this.items) it.obj.removeFromParent()
    this.items = []
    this.rescueSeqs = []
    for (const n of this.npcs) n.obj.removeFromParent()
    this.npcs = []
    this.fx.clear()
  }

  private enterHub(title = false): void {
    const { src, markers } = buildHubSource()
    const level = new Level(src, this.renderer.shadowMapSize)
    this.setLevel(level)
    this.markers = markers
    const props = dressHub(level, markers)
    this.portalSwirl = props.portal.swirl
    this.stats(this.hubStats())
    this.hero.hp = this.hero.stats.maxHp
    this.hero.power = this.hero.maxPower
    this.hero.alive = true
    this.hero.place(markers.P.x, markers.P.z - 1, Math.PI)
    this.hero.facing = 0
    this.cam.yaw = 0
    this.cam.pitch = 0.28
    this.cam.zoom = 1
    this.cam.snap()
    const add = (kind: Interactable['kind'], pos: THREE.Vector3, prompt: string, radius = 2.4) => {
      const obj = new THREE.Group()
      this.items.push({ kind, pos, radius, prompt, auto: false, obj, room: 0, used: false, enabled: true })
    }
    add('vault', markers.V.clone().setZ(markers.V.z - 0.2), 'Descend into the Underhall', 3)
    add('board', markers.B.clone(), 'Hero Development Board')
    add('codex', markers.C.clone(), 'Codex: Relics, Classmates & Lore')
    add('notice', markers.N.clone(), 'Notice Board: How to Play')
    // Rescued classmates hang out by the Rescue Wall.
    this.save.data.rescued.forEach((id, i) => {
      const c = CLASSMATE_BY_ID[id]
      const spot = props.rescueSpots[i]
      if (!spot) return
      const rig = makeClassmate(id, c.color, 'idle')
      rig.root.position.copy(spot)
      rig.body.rotation.y = Math.PI / 2
      level.group.add(rig.root)
      this.npcs.push({ obj: rig.root, id })
      level.circles.push({ x: spot.x, z: spot.z, r: 0.45 })
      this.items.push({ kind: 'npc', pos: spot.clone(), radius: 1.8, prompt: `Talk to ${c.name}`, auto: false, obj: new THREE.Group(), room: 0, used: false, enabled: true, data: id })
    })
    this.mode = title ? 'title' : 'hub'
    this.tutorial = null
    this.tutorialWait = 0
    this.audio.setIntensity(0)
    if (!title) {
      this.audio.music('hub')
      this.streamer.focus('hub')
    }
    this.ui.bossBar(false)
    if (!title) {
      this.ui.setMode('hub')
      this.ui.banner('BACK ON CAMPUS', `${this.save.data.merits} Merits to spend at the Development Board`, 'gold')
    }
  }

  private hubStats(): HeroStats {
    return deriveStats(emptyBuild(), { dev: this.save.data.dev, rescued: this.save.data.rescued })
  }

  private stats(s: HeroStats): void {
    const oldMax = this.hero.stats.maxHp
    this.hero.stats = s
    if (s.maxHp > oldMax) this.hero.hp += s.maxHp - oldMax
    this.hero.hp = Math.min(this.hero.hp, s.maxHp)
  }

  // ─── Run lifecycle ─────────────────────────────────────────────────────

  startRun(seed = randomSeed()): void {
    if (this.loading) return
    tuning.activate('run')
    this.streamer.focus('floor1')
    this.audio.play('portal')
    void this.transition(['wave1', 'floor1'], 'Unsealing the Underhall...', () => this.beginRun(seed))
  }

  private beginRun(seed: number): void {
    const build = emptyBuild()
    const stats = deriveStats(build, { dev: this.save.data.dev, rescued: this.save.data.rescued })
    this.run = {
      seed, plan: undefined as unknown as DungeonPlan, build, credits: 0, kills: 0, roomsCleared: 0, rescues: [], relics: 0, lore: 0, time: 0,
      discovered: new Set(), visited: new Set(), cleared: new Set(), current: 0, active: null, wave: 0, waveDelay: 0,
      rerolls: stats.rerolls, revived: false, bossDefeated: false, shop: new Map(), over: false, floor: 1, bosses: 0,
    }
    this.hero.stats = stats
    this.hero.hp = stats.maxHp
    this.hero.power = stats.startPower
    this.hero.alive = true
    this.hero.shieldCd = 0
    this.save.update({ lastSeed: seed })
    this.loadFloor(1)
  }

  /** Generate and build one floor of the current run. Build, HP, credits and stats carry over. */
  private loadFloor(floor: number): void {
    const r = this.run!
    const plan = generateDungeon(floorSeed(r.seed, floor), { floor })
    const level = new Level({ kind: 'dungeon', size: plan.size, tiles: plan.tiles, rooms: plan.rooms, palette: WINGS[plan.wing] }, this.renderer.shadowMapSize)
    this.setLevel(level)
    this.markers = undefined
    this.portalSwirl = undefined
    Object.assign(r, {
      plan, floor, discovered: new Set(), visited: new Set(), cleared: new Set(), current: plan.entrance, active: null,
      wave: 0, waveDelay: 0, bossDefeated: false, shop: new Map(),
    })
    const entrance = plan.rooms[plan.entrance]
    const start = level.roomCenter(entrance)
    const firstLink = entrance.links[0]
    const facing = firstLink ? { N: 0, S: Math.PI, E: -Math.PI / 2, W: Math.PI / 2 }[firstLink.dir] : 0
    this.hero.place(start.x, start.z, facing)
    this.cam.yaw = facing
    this.cam.pitch = 0.3
    this.cam.zoom = 1
    this.cam.snap()
    this.populateRooms(plan)
    this.enterRoom(entrance)
    if (this.hero.stats.revealMap) for (const room of plan.rooms) r.discovered.add(room.id)
    this.mode = 'run'
    this.ui.setMode('run')
    this.ui.closeModal()
    this.mapOpen = false
    this.ui.showMap(false)
    this.audio.setIntensity(0)
    this.audio.music(floor === 1 ? 'floor1' : 'floor2', 1.8)
    this.ui.banner(`FLOOR ${floor}: ${WINGS[plan.wing].name.toUpperCase()}`, `${WINGS[plan.wing].tagline}  -  Seed ${r.seed}`, floor === 1 ? 'purple' : 'green')
    this.input.clearPresses()
    this.input.lockPointer()
  }

  /** Floor-1 exit portal: drop into The Stacks Below with a breather heal. */
  private descend(): void {
    const r = this.run!
    if (r.floor >= FLOOR_COUNT || this.loading) return
    this.audio.play('descend')
    this.streamer.focus('floor2')
    const breather = Math.round(this.hero.stats.maxHp * 0.25)
    void this.transition('floor2', 'Descending to The Stacks Below...', () => {
      this.loadFloor(r.floor + 1)
      this.heal(breather, false)
      this.ui.toast(`You catch your breath on the way down: +${breather} HP`)
    })
  }

  /** Build every room's non-combat content up front (rewards appear on clear). */
  private populateRooms(plan: DungeonPlan): void {
    const level = this.level!
    const r = this.run!
    const rescuedEver = new Set(this.save.data.rescued)
    for (const room of plan.rooms) {
      const c = level.roomCenter(room)
      const list = room.hazards.map(h => new Hazard(h))
      for (const h of list) level.group.add(h.group)
      this.hazards.set(room.id, list)
      switch (room.kind) {
        case 'heal': {
          const f = makeFountain()
          f.position.copy(c)
          level.group.add(f)
          level.circles.push({ x: c.x, z: c.z, r: 1.5 })
          this.addItem('fountain', c, 'Drink from the Restoration Fountain (full heal)', room.id, f, false, 3)
          break
        }
        case 'shop': {
          const v = makeVending()
          v.position.copy(c)
          level.group.add(v)
          level.circles.push({ x: c.x, z: c.z, r: 1.1 })
          this.addItem('vending', c, 'Use the Hero Supply Vending Machine', room.id, v, false, 3)
          r.shop.set(room.id, this.makeShop(room))
          break
        }
        case 'lore': {
          const l = makeLectern()
          l.position.copy(c)
          level.group.add(l)
          level.circles.push({ x: c.x, z: c.z, r: 0.6 })
          this.addItem('lore', c, 'Read the lost page', room.id, l, false, 2.4).data = room.lore
          break
        }
        case 'treasure': {
          const p = makePedestal('#ffcf4d')
          p.position.copy(c)
          level.group.add(p)
          level.circles.push({ x: c.x, z: c.z, r: 0.85 })
          if (room.reward === 'relic') {
            const gem = makeRelicGem()
            gem.position.copy(c)
            level.group.add(gem)
            this.addItem('relic', c, 'Claim the academy relic', room.id, gem, false, 2.6)
          } else {
            const orb = makeUpgradeOrb()
            orb.position.copy(c).setY(0.6)
            level.group.add(orb)
            this.addItem('upgrade', c, 'Take the power card', room.id, orb, true, 2.2)
          }
          break
        }
        case 'rescue': {
          let id = room.classmate!
          if (rescuedEver.has(id)) id = CLASSMATES.find(x => !rescuedEver.has(x.id) && !r.rescues.includes(x.id))?.id ?? id
          room.classmate = id
          const cm = CLASSMATE_BY_ID[id]
          const rig = makeClassmate(id, cm.color, 'trapped')
          rig.root.position.copy(c)
          rig.root.userData.char = rig.char
          rig.root.userData.actor = rig
          const crystal = makeCrystal()
          rig.root.add(crystal)
          level.group.add(rig.root)
          level.circles.push({ x: c.x, z: c.z, r: 1.2 })
          const it = this.addItem('capsule', c, `Free ${cm.name} from the Detention Crystal`, room.id, rig.root, false, 3)
          it.enabled = false
          it.data = id
          break
        }
        case 'exit': {
          const p = makePortal('#7ef9ff', 1.8)
          p.root.position.copy(c)
          level.group.add(p.root)
          level.animate(p.swirl, 'spin', 1.2)
          const last = plan.floor >= FLOOR_COUNT
          const it = this.addItem('portal', c, last ? 'Escape through the portal to campus' : 'Descend to Floor 2: The Stacks Below', room.id, p.root, false, 3)
          it.enabled = false
          break
        }
        case 'boss': {
          this.boss = FLOOR_BOSS[plan.floor - 1] === 'librarian' ? new Librarian(c.x, c.z, (room.w - 2) * TILE) : new Boss(c.x, c.z)
          level.group.add(this.boss.rig.root)
          break
        }
      }
    }
  }

  private addItem(kind: Interactable['kind'], pos: THREE.Vector3, prompt: string, room: number, obj: THREE.Object3D, auto: boolean, radius = 1.4): Interactable {
    const it: Interactable = { kind, pos: pos.clone(), radius, prompt, auto, obj, bob: obj.children[0], room, used: false, enabled: true }
    this.items.push(it)
    return it
  }

  private makeShop(room: RoomPlan): ShopItem[] {
    const r = this.run!
    const rng = mulberry32(hashSeed(r.seed, 7000 + room.id))
    const disc = () => this.hero.stats.shopDiscount
    const up = rollUpgradeChoices(rng, r.build, true, 2)
    const items: ShopItem[] = [
      { id: 'snack', name: 'Cafeteria Hero Hoagie', desc: 'Restore 40 HP.', price: Math.round(25 * disc()), sold: false },
      { id: 'soda', name: 'Voltage Cola', desc: 'Refill your Power to full.', price: Math.round(18 * disc()), sold: false },
      ...up.map(id => ({ id: `up:${id}`, name: UPGRADE_BY_ID[id].name, desc: UPGRADE_BY_ID[id].desc, price: Math.round((UPGRADE_BY_ID[id].rarity === 'epic' ? 80 : UPGRADE_BY_ID[id].rarity === 'rare' ? 60 : 45) * disc()), sold: false, rarity: UPGRADE_BY_ID[id].rarity })),
    ]
    return items
  }

  private enterRoom(room: RoomPlan): void {
    const r = this.run!
    r.current = room.id
    if (!r.visited.has(room.id)) {
      r.visited.add(room.id)
      r.discovered.add(room.id)
      for (const l of room.links) r.discovered.add(l.to)
    }
    const level = this.level!
    // Next door is the boss: stream its stage (still heat-gated) while this room plays out.
    const bossStage: LoadStage = r.floor === 1 ? 'boss1' : 'boss2'
    if (room.id === r.plan.boss || room.links.some(l => l.to === r.plan.boss)) this.streamer.focus(bossStage)
    if (COMBAT_KINDS.has(room.kind) && !r.cleared.has(room.id)) {
      r.active = room.id
      r.wave = 0
      r.waveDelay = 0.7
      level.lockRoom(room)
      this.hero.power = Math.max(this.hero.power, this.hero.stats.startPower)
      this.audio.play('lock')
      this.audio.setIntensity(1)
      const label = room.kind === 'elite' ? 'ELITE ENCOUNTER!' : room.kind === 'challenge' ? 'CHALLENGE ROOM!' : room.kind === 'rescue' ? 'RESCUE!' : ['', 'HALL PASS DENIED!', 'DETENTION!', 'EXPULSION RISK!'][room.danger] || 'FIGHT!'
      const sub = room.kind === 'challenge' ? 'Survive 3 waves to earn a relic' : room.kind === 'rescue' ? 'A classmate is trapped - clear the room' : `${room.waves} wave${room.waves > 1 ? 's' : ''} incoming`
      this.ui.banner(label, sub, room.kind === 'elite' || room.danger >= 3 ? 'red' : 'blue')
    } else if (room.kind === 'boss' && !r.bossDefeated && this.boss && this.boss.state === 'dormant') {
      r.active = room.id
      level.lockRoom(room)
      // Its sounds/shaders are nearly always streamed by now; if not, the intro waits for them.
      const boss = this.boss
      if (this.streamer.isReady(bossStage, true)) boss.wake()
      else void this.streamer.require(bossStage).then(() => { if (this.boss === boss) boss.wake() })
      this.cam.zoom = 1.35
      // Face the boss so the intro reads immediately.
      this.cam.yaw = Math.atan2(-(this.boss.pos.x - this.hero.pos.x), -(this.boss.pos.z - this.hero.pos.z))
      this.cam.snap()
      this.audio.play('lock')
      this.audio.setIntensity(1)
      this.audio.music(this.boss.def.id === 'librarian' ? 'boss2' : 'boss1', 0.8)
      this.ui.banner(this.boss.def.name.toUpperCase(), this.boss.def.title, 'red')
    } else if (!r.cleared.has(room.id) && !COMBAT_KINDS.has(room.kind) && room.kind !== 'boss') {
      r.cleared.add(room.id)
      const names: Partial<Record<RoomPlan['kind'], [string, string]>> = {
        heal: ['NURSE\'S OFFICE', 'A Restoration Fountain bubbles here'],
        shop: ['SCHOOL STORE', 'Spend credits on supplies'],
        lore: ['ARCHIVE NOOK', 'Someone left a page behind'],
        treasure: ['TROPHY VAULT', 'Something valuable glints'],
        exit: ['EXIT PORTAL', 'The way home'],
      }
      const n = names[room.kind]
      if (n) this.ui.banner(n[0], n[1], 'gold')
    }
  }

  private spawnWave(room: RoomPlan): void {
    const r = this.run!
    const tint = WINGS[r.plan.wing].trim
    for (const s of room.enemies.filter(e => e.wave === r.wave)) {
      let x = tileCenter(s.tx)
      let z = tileCenter(s.ty)
      const dx = x - this.hero.pos.x
      const dz = z - this.hero.pos.z
      if (Math.hypot(dx, dz) < 3.5) {
        // Never spawn on top of the hero: mirror across the room centre.
        const c = this.level!.roomCenter(room)
        x = c.x * 2 - x
        z = c.z * 2 - z
      }
      this.spawnEnemy(s.type, x, z, s.elite, tint)
    }
    this.ui.toast(r.wave > 0 ? `Wave ${r.wave + 1} of ${room.waves}` : '')
  }

  private spawnEnemy(type: EnemyType, x: number, z: number, elite = false, tint = '#ffd35c'): void {
    const e = new Enemy(type, elite, x, z, tint)
    this.level!.group.add(e.rig.root)
    this.enemies.push(e)
    this.fx.ring(new THREE.Vector3(x, 0, z), elite ? '#ffcf4d' : '#c58cff', 0.2, 1.4, 0.8)
  }

  private clearRoom(room: RoomPlan): void {
    const r = this.run!
    r.cleared.add(room.id)
    r.active = null
    r.roomsCleared += 1
    this.level!.unlockRoom(room)
    this.audio.play('unlock')
    this.audio.setIntensity(0)
    if (this.hero.stats.healOnClear) this.heal(this.hero.stats.healOnClear, false)
    const c = this.level!.roomCenter(room)
    // Rewards drop where the hero isn't standing.
    const spot = c.clone()
    if (spot.distanceTo(this.hero.pos) < 2.5) spot.x += 3
    const rw = room.kind === 'rescue' ? 'none' : room.reward
    if (rw === 'upgrade') {
      const orb = makeUpgradeOrb()
      orb.position.copy(spot)
      this.level!.group.add(orb)
      this.addItem('upgrade', spot, 'Power card', room.id, orb, true, 1.6)
    } else if (rw === 'heal') {
      const orb = makeOrb('#6dff9e', 0.45)
      orb.position.copy(spot)
      this.level!.group.add(orb)
      this.addItem('heal', spot, '', room.id, orb, true, 1.4).value = 35
    } else if (rw === 'power') {
      const orb = makeOrb('#7ef9ff', 0.45)
      orb.position.copy(spot)
      this.level!.group.add(orb)
      this.addItem('power', spot, '', room.id, orb, true, 1.4).value = 100
    } else if (rw === 'credits') {
      for (let i = 0; i < 8; i += 1) this.dropCoin(spot.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2)), 4)
    } else if (rw === 'relic') {
      const p = makePedestal('#ff4f6d')
      p.position.copy(spot)
      this.level!.group.add(p)
      this.level!.circles.push({ x: spot.x, z: spot.z, r: 0.85 })
      const gem = makeRelicGem()
      gem.position.copy(spot)
      this.level!.group.add(gem)
      this.addItem('relic', spot, 'Claim the academy relic', room.id, gem, false, 2.6)
    }
    if (room.kind === 'rescue') {
      const cap = this.items.find(i => i.kind === 'capsule' && i.room === room.id)
      if (cap) cap.enabled = true
    }
    this.ui.banner(room.kind === 'challenge' ? 'CHALLENGE COMPLETE!' : room.kind === 'elite' ? 'ELITE DEFEATED!' : 'ROOM CLEARED!', rw === 'upgrade' ? 'A power card appeared' : rw === 'relic' ? 'A relic appeared' : room.kind === 'rescue' ? 'Free your classmate!' : '', 'gold')
    this.audio.play('reward')
  }

  private dropCoin(pos: THREE.Vector3, value: number): void {
    const c = makeCoin()
    c.position.copy(pos).setY(0)
    this.level!.group.add(c)
    const it = this.addItem('coin', pos.setY(0), '', this.run?.current ?? 0, c, true, 0.9)
    it.value = value
    it.vel = new THREE.Vector3((Math.random() - 0.5) * 4, 0, (Math.random() - 0.5) * 4)
  }

  private endRun(won: boolean, abandoned = false): void {
    const r = this.run
    if (!r || r.over) return
    r.over = true
    const summary: RunSummary = {
      seed: r.seed, won, roomsCleared: r.roomsCleared, kills: r.kills, rescues: r.rescues.length, relics: r.relics, lore: r.lore,
      seconds: r.time, credits: r.credits, bosses: r.bosses, floor: r.floor,
    }
    const unranked = tuning.unranked
    const merits = unranked ? 0 : abandoned ? Math.floor(computeMerits(summary) / 2) : computeMerits(summary)
    const d = this.save.data
    const newBest = !unranked && won && (d.bestClear === 0 || r.time < d.bestClear)
    if (!unranked) {
      this.save.update({
        merits: d.merits + merits,
        runs: d.runs + 1,
        wins: d.wins + (won ? 1 : 0),
        bestClear: newBest ? Math.floor(r.time) : d.bestClear,
        totalKills: d.totalKills + r.kills,
      })
    }
    this.mode = 'results'
    this.audio.setIntensity(0)
    if (won) this.audio.music('victory', 0.6)
    else {
      this.audio.music(null, 1.2)
      this.audio.play('lose')
    }
    this.input.unlockPointer()
    this.ui.bossBar(false)
    this.ui.openResults({
      won, rank: heroRank(summary), summary, merits, newBest, wing: `Floor ${r.floor}: ${WINGS[r.plan.wing].name}`,
      rescued: r.rescues.map(id => CLASSMATE_BY_ID[id].name),
      build: Object.keys(r.build.upgrades).map(id => UPGRADE_BY_ID[id as UpgradeId].name),
    }, {
      hub: () => {
        this.ui.closeModal()
        this.run = null
        this.enterHub()
        this.input.lockPointer()
      },
      retry: () => this.startRun(r.seed),
      fresh: () => this.startRun(),
    })
  }

  // ─── Simulation ────────────────────────────────────────────────────────

  step(dt: number): void {
    this.time += dt
    if (this.mode === 'title') {
      this.fx.update(dt)
      return
    }
    if (this.ui.modalOpen || this.mode === 'results') return
    if (this.loading) {
      this.fx.update(dt)
      return
    }
    if (this.input.consume('pause')) {
      this.pause()
      return
    }
    if (this.input.consume('map') && this.run) {
      this.mapOpen = !this.mapOpen
      this.ui.showMap(this.mapOpen)
      if (this.mapOpen) this.drawMaps(true)
    }
    if (this.hitstop > 0) {
      this.hitstop -= dt
      return
    }
    const level = this.level!
    const r = this.run
    if (r) r.time += dt
    this.buildIntent()
    this.hero.slow = 1
    const current = r ? r.plan.rooms[r.current] : undefined
    // Hazards (they also set hero.slow for acid).
    if (r) for (const [id, list] of this.hazards) {
      const active = r.active === id || (!r.cleared.has(id) && r.current === id)
      for (const h of list) h.update(dt, active && r.active === id, this.hero, this.enemies, this.fx, (a, from, k) => this.hurtHero(a, from, k), this.time)
    }
    const events = this.hero.step(dt, this.intent, level)
    for (const e of events) this.handleHeroEvent(e)
    if (this.mode === 'hub') this.stepTutorial(dt, events)
    else if (this.tutorial) this.tutorial = null
    if (this.hero.dashT > 0 && this.hero.stats.afterimage) this.dashDamage()
    if (this.boss && this.boss.state !== 'dormant' && this.boss.alive) {
      const dx = this.hero.pos.x - this.boss.pos.x
      const dz = this.hero.pos.z - this.boss.pos.z
      const d = Math.hypot(dx, dz)
      const min = this.boss.radius + HERO_RADIUS
      if (d < min && d > 1e-4) {
        this.hero.pos.x = this.boss.pos.x + (dx / d) * min
        this.hero.pos.z = this.boss.pos.z + (dz / d) * min
        level.collide(this.hero.pos, HERO_RADIUS)
      }
    }
    // Room transitions.
    if (r) {
      const room = level.roomAtWorld(this.hero.pos.x, this.hero.pos.z, 1)
      if (room && room.id !== r.current) this.enterRoom(room)
      else if (room && room.id === r.current && !r.visited.has(room.id)) this.enterRoom(room)
      level.updateFlow(this.hero.pos.x, this.hero.pos.z)
      this.stepCombat(dt)
    }
    this.stepShots(dt)
    this.stepItems(dt)
    this.fx.update(dt)
    void current
  }

  private buildIntent(): void {
    const i = this.intent
    const f = this.cam.forward(this.v1)
    const rt = this.cam.right(this.v2)
    i.move.set(0, 0, 0).addScaledVector(f, this.input.move.y).addScaledVector(rt, this.input.move.x)
    if (i.move.lengthSq() > 1) i.move.normalize()
    i.attack = this.input.consume('attack') || this.input.held('attack')
    i.bolt = this.input.held('bolt') || this.input.consume('bolt')
    i.dash = this.input.consume('dash')
    i.jump = this.input.consume('jump')
    // Touch has no sprint button: pushing the stick to the rim sprints.
    i.sprint = this.input.held('sprint') || (this.input.method === 'touch' && Math.hypot(this.input.move.x, this.input.move.y) > 0.92)
    i.nova = this.input.consume('nova')
    if (this.input.consume('interact')) this.interact()
    // Aim assist: prefer the enemy nearest the camera's forward cone.
    const inRun = !!this.run
    const aimBase = this.cam.forward(new THREE.Vector3())
    if (i.move.lengthSq() > 0.05 && !this.input.held('bolt')) aimBase.lerp(i.move.clone().normalize(), 0.35).normalize()
    let best: { d: THREE.Vector3; score: number } | null = null
    if (inRun) {
      const range = i.bolt ? 22 : 5.5
      const cone = i.bolt ? 0.9 : 0.35
      for (const t of this.targets()) {
        const d = new THREE.Vector3(t.pos.x - this.hero.pos.x, 0, t.pos.z - this.hero.pos.z)
        const dist = d.length()
        if (dist > range + t.radius) continue
        d.divideScalar(dist || 1)
        const dot = d.dot(aimBase)
        if (dot < cone) continue
        if (i.bolt && !this.level!.los(this.hero.pos.x, this.hero.pos.z, t.pos.x, t.pos.z)) continue
        const score = dot * 2 - dist / range
        if (!best || score > best.score) best = { d, score }
      }
    }
    i.aim.copy(best ? best.d : aimBase).setY(0).normalize()
  }

  private targets(): { pos: THREE.Vector3; radius: number; ref: Enemy | BossActor }[] {
    const out: { pos: THREE.Vector3; radius: number; ref: Enemy | BossActor }[] = []
    for (const e of this.enemies) if (e.targetable) out.push({ pos: e.pos, radius: e.radius, ref: e })
    if (this.boss?.targetable) out.push({ pos: this.boss.pos, radius: this.boss.radius, ref: this.boss })
    return out
  }

  private bossCtx(): BossCtx {
    const r = this.run!
    const room = r.plan.rooms[r.plan.boss]
    return {
      ...this.combatCtx(),
      spawn: (type, x, z) => this.spawnEnemy(type, x, z, false, WINGS[r.plan.wing].trim),
      enemyCount: this.enemies.filter(e => e.alive).length,
      center: this.level!.roomCenter(room),
      onPhase: p => {
        const def = this.boss?.def ?? BOSSES.proctor
        const lines = def.id === 'librarian'
          ? ['Pages tear loose. She blinks between the stacks.', 'The last bell rings. The shelves fall faster.']
          : ['The Proctor raises the stakes', 'Pencils down. Survive.']
        this.ui.banner(`PHASE ${p}: ${def.phases[p - 1]}`, lines[p - 2] ?? '', 'red')
      },
      say: text => {
        if (this.boss) this.popWorld(this.boss.center.clone().setY(this.boss.center.y + 3.2), text, 'ko')
      },
    }
  }

  private combatCtx(): CombatCtx {
    return {
      hero: this.hero, level: this.level!, fx: this.fx, audio: this.audio,
      hurtHero: (a, from, k) => this.hurtHero(a, from, k), shake: v => this.cam.addTrauma(v),
      slow: this.hero.stats.enemySlow, tint: this.run ? WINGS[this.run.plan.wing].trim : '#ffd35c',
    }
  }

  private stepCombat(dt: number): void {
    const r = this.run!
    const ctx = this.combatCtx()
    for (const e of this.enemies) e.update(dt, ctx, this.enemies)
    // Kills from any source (melee, shots, hazards).
    for (const e of this.enemies) {
      if (!e.alive && !e.removed && !(e as unknown as { counted?: boolean }).counted) {
        ;(e as unknown as { counted?: boolean }).counted = true
        this.onKill(e)
      }
    }
    for (let i = this.enemies.length - 1; i >= 0; i -= 1) {
      if (this.enemies[i].removed) {
        this.enemies[i].dispose(this.fx)
        this.enemies.splice(i, 1)
      }
    }
    if (this.boss && this.boss.state !== 'dormant' && this.boss.state !== 'dead') {
      const was = this.boss.state
      this.boss.update(dt, this.bossCtx())
      this.ui.bossBar((this.boss.state as string) !== 'dead', this.boss.def.name, this.boss.hp / this.boss.maxHp, this.boss.def.phases[this.boss.phase - 1])
      if (was === 'dying' && (this.boss.state as string) === 'dead') this.onBossDefeated()
    }
    // Wave flow.
    if (r.active !== null) {
      const room = r.plan.rooms[r.active]
      if (room.kind !== 'boss') {
        const alive = this.enemies.some(e => e.alive)
        if (r.waveDelay > 0) {
          r.waveDelay -= dt
          if (r.waveDelay <= 0) this.spawnWave(room)
        } else if (!alive) {
          if (r.wave + 1 < room.waves) {
            r.wave += 1
            r.waveDelay = 0.9
            this.audio.play('telegraph')
          } else this.clearRoom(room)
        }
      }
    }
  }

  private onKill(e: Enemy): void {
    const r = this.run
    if (!r) return
    r.kills += 1
    const deathColor = e.type === 'swarm' ? '#fff4c2' : e.type === 'shade' ? '#ff4fd8' : e.type === 'monitor' ? '#ff7a45' : '#c58cff'
    this.fx.burst(e.center.clone(), deathColor, e.type === 'bruiser' ? 26 : 14, 8, 0.2, 0.6)
    this.fx.smoke(e.center.clone(), e.type === 'shade' ? '#000000' : '#6b6474', e.type === 'bruiser' ? 6 : 3, e.type === 'bruiser' ? 2.2 : 1.4, 1.4)
    this.fx.embers(e.center.clone(), deathColor, e.type === 'bruiser' ? 14 : 8, e.radius * 1.5)
    if (e.type !== 'swarm' && e.type !== 'monitor') this.fx.dust(e.pos.clone(), 5, 1.1, 2)
    this.audio.play('enemyDie')
    this.hero.power = Math.min(this.hero.maxPower, this.hero.power + 4 * this.hero.stats.powerGain)
    const value = Math.max(1, Math.round(ENEMIES[e.type].credits * (e.elite ? 3 : 1) * this.hero.stats.creditMult))
    const coins = Math.min(5, Math.ceil(value / 3))
    for (let i = 0; i < coins; i += 1) this.dropCoin(e.pos.clone(), Math.ceil(value / coins))
    if (e.elite || Math.random() < 0.08) {
      const orb = makeOrb('#6dff9e', 0.3)
      orb.position.copy(e.pos).setY(0)
      this.level!.group.add(orb)
      this.addItem('heal', e.pos.clone().setY(0), '', r.current, orb, true, 1.1).value = 12
    }
    this.popWorld(e.center, ['POW!', 'BAM!', 'KAPOW!', 'WHAM!', 'ZAP!'][Math.floor(Math.random() * 5)], 'ko')
  }

  private onBossDefeated(): void {
    const r = this.run!
    r.bossDefeated = true
    r.bosses += 1
    r.kills += 1
    r.roomsCleared += 1
    const room = r.plan.rooms[r.plan.boss]
    r.cleared.add(room.id)
    r.active = null
    for (const e of this.enemies) if (e.alive) e.hurt(9999, null, 0, this.fx)
    this.level!.unlockRoom(room)
    this.cam.zoom = 1
    this.audio.play('bossDie')
    this.audio.setIntensity(0)
    this.cam.addTrauma(0.8)
    this.ui.bossBar(false)
    const def = this.boss?.def ?? BOSSES.proctor
    this.ui.banner(def.defeat[0], def.defeat[1], 'gold')
    this.audio.music(r.floor === 1 ? 'floor1' : 'floor2', 2.5)
    const exit = this.items.find(i => i.kind === 'portal')
    if (exit) exit.enabled = true
    const c = this.level!.roomCenter(room)
    for (let i = 0; i < 12; i += 1) this.dropCoin(c.clone().add(new THREE.Vector3((Math.random() - 0.5) * 4, 0, (Math.random() - 0.5) * 4)), 5)
    this.hitstop = 0.25
  }

  // ─── Hero actions ──────────────────────────────────────────────────────

  private handleHeroEvent(e: HeroEvent): void {
    const s = this.hero.stats
    const h = this.hero
    if (e.type === 'swing') {
      this.audio.play('swing')
      this.swingId += 1
      this.fx.slash(h.pos.clone().addScaledVector(this.intent.aim, 1.1), h.facing, h.combo === 2 ? '#ffd35c' : '#7ef9ff', h.combo === 1, h.combo === 2)
    } else if (e.type === 'melee') {
      let hits = 0
      let heals = 0
      let firstHit: THREE.Vector3 | null = null
      for (const t of this.targets()) {
        const d = this.v1.set(t.pos.x - h.pos.x, 0, t.pos.z - h.pos.z)
        const dist = d.length()
        if (dist > MELEE_RANGE + t.radius + (e.index === 2 ? 0.4 : 0)) continue
        if (dist > t.radius + 0.6 && d.normalize().dot(e.dir) < 0.3) continue
        const hit = rollDamage(MELEE_BASE[e.index], s.meleeMult * s.damageMult, s.critChance, Math.random())
        this.damageTarget(t.ref, hit.amount, hit.crit, h.pos, MELEE_KNOCK[e.index])
        hits += 1
        firstHit ??= t.pos.clone()
        if (s.lifesteal && heals < 3) {
          this.heal(s.lifesteal, false)
          heals += 1
        }
      }
      if (hits) {
        h.power = Math.min(h.maxPower, h.power + 6 * s.powerGain * Math.min(hits, 3))
        this.hitstop = e.index === 2 ? 0.07 : 0.045
        this.cam.addTrauma(e.index === 2 ? 0.25 : 0.12)
      }
      if (e.index === 2 && s.seismic) {
        const center = firstHit ?? h.pos.clone().addScaledVector(e.dir, 1.6)
        this.fx.ring(center, '#ffd35c', 0.4, 3.4, 0.35)
        this.fx.burst(center.clone().setY(0.2), '#ffd35c', 12, 7, 0.15, 0.4)
        this.audio.play('slam')
        for (const t of this.targets()) {
          if (Math.hypot(t.pos.x - center.x, t.pos.z - center.z) > 3.2 + t.radius) continue
          const hit = rollDamage(18, s.damageMult, s.critChance, Math.random())
          this.damageTarget(t.ref, hit.amount, hit.crit, center, 8)
        }
      }
    } else if (e.type === 'bolt') {
      this.audio.play('bolt')
      const dirs = s.splitShot ? [-0.2, 0, 0.2] : [0]
      for (const a of dirs) {
        const d = e.dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), a)
        const hit = rollDamage(22, s.boltMult * s.damageMult, s.critChance, Math.random())
        this.fx.shoot('hero', new THREE.Vector3(h.pos.x + d.x * 0.8, 1.35, h.pos.z + d.z * 0.8), d.multiplyScalar(28), hit.amount, hit.crit ? '#ffd35c' : '#7ef9ff', 0.3, { chain: s.chain, crit: hit.crit, life: 0.9 })
      }
    } else if (e.type === 'nova') {
      this.audio.play('nova')
      this.cam.addTrauma(0.4)
      const c = h.pos.clone()
      this.fx.ring(c, '#7ef9ff', 0.5, s.novaRadius, 0.45)
      this.fx.ring(c, '#ffd35c', 0.3, s.novaRadius * 0.7, 0.35)
      this.fx.burst(c.clone().setY(1), '#7ef9ff', 30, 12, 0.2, 0.6, 6)
      for (const t of this.targets()) {
        if (Math.hypot(t.pos.x - c.x, t.pos.z - c.z) > s.novaRadius + t.radius) continue
        this.damageTarget(t.ref, Math.round(s.novaDamage * s.damageMult), false, c, 14)
        if (t.ref instanceof Enemy) t.ref.stun(s.novaStun, this.fx)
      }
      // Nova also erases incoming projectiles.
      for (const shot of this.fx.shots) if (shot.alive && shot.owner === 'enemy' && shot.pos.distanceTo(c) < s.novaRadius + 1) {
        this.fx.burst(shot.pos.clone(), '#7ef9ff', 3, 3, 0.1, 0.3)
        this.fx.killShot(shot)
      }
      this.popWorld(c.clone().setY(2.5), 'SUPER NOVA!', 'nova')
    } else if (e.type === 'dash') {
      this.audio.play('dash')
      this.dashHits.clear()
      this.fx.dust(h.pos.clone(), 6, 0.9, 2.5)
      this.fx.flash(h.pos.clone().setY(1), '#7ef9ff', 1.8, 0.18)
    } else if (e.type === 'jump') {
      this.audio.play('dash')
      this.fx.dust(h.pos.clone(), 4, 0.6, 1.4)
    } else if (e.type === 'land') {
      if (e.impact > 6) {
        this.fx.dust(h.pos.clone(), 7, 0.9, 2.2)
        this.cam.addTrauma(Math.min(0.18, e.impact * 0.012))
      } else this.fx.dust(h.pos.clone(), 3, 0.55, 1)
    } else if (e.type === 'nopower') {
      this.ui.flashPower()
    }
  }

  private dashDamage(): void {
    for (const t of this.targets()) {
      if (this.dashHits.has(t.ref)) continue
      if (Math.hypot(t.pos.x - this.hero.pos.x, t.pos.z - this.hero.pos.z) > t.radius + 1.3) continue
      this.dashHits.add(t.ref)
      this.damageTarget(t.ref, Math.round(25 * this.hero.stats.damageMult), false, this.hero.pos, 4)
    }
  }

  private damageTarget(target: Enemy | BossActor, amount: number, crit: boolean, from: THREE.Vector3, knock: number): void {
    const pos = target.center.clone()
    if (!(target instanceof Enemy)) target.hurt(amount, from, knock, this.bossCtx())
    else target.hurt(amount, from, knock, this.fx)
    const dir = pos.clone().sub(from).setY(0.25).normalize()
    this.fx.impact(pos, dir, crit ? '#ffd35c' : '#bff8ff', crit ? 1.4 : 1)
    this.audio.play(crit ? 'crit' : 'hit')
    this.popWorld(pos.setY(pos.y + 0.8), crit ? `${amount}!` : `${amount}`, crit ? 'crit' : 'dmg')
  }

  private hurtHero(amount: number, from: THREE.Vector3, knock = 6): void {
    const h = this.hero
    if (!h.alive || h.iframes > 0 || h.dashT > 0 || this.mode !== 'run') return
    if (h.shieldReady) {
      h.shieldCd = 9
      h.iframes = 0.5
      this.audio.play('block')
      this.fx.ring(h.pos.clone(), '#7ef9ff', 0.6, 2.4, 0.3)
      this.popWorld(h.pos.clone().setY(2.4), 'BLOCKED!', 'block')
      return
    }
    const res = takeDamage(h.hp, amount, h.stats, false)
    h.hp = res.hp
    h.iframes = 0.6
    h.hurtFlash = 0.6
    if (knock) h.impulse.add(new THREE.Vector3(h.pos.x - from.x, 0, h.pos.z - from.z).normalize().multiplyScalar(knock))
    this.audio.play('hurt')
    this.cam.addTrauma(0.35)
    this.ui.hurt(Math.min(1, res.taken / 25))
    this.popWorld(h.pos.clone().setY(2.3), `-${res.taken}`, 'hurt')
    if (h.hp <= 0) {
      if (h.stats.revive && this.run && !this.run.revived) {
        this.run.revived = true
        h.hp = Math.round(h.stats.maxHp * 0.5)
        h.iframes = 2
        this.fx.ring(h.pos.clone(), '#ffd35c', 0.5, 8, 0.6)
        this.ui.banner("FOUNDER'S CAPE!", 'You refuse to give up', 'gold')
        this.audio.play('heal')
        for (const e of this.enemies) e.stun(1.5, this.fx)
        return
      }
      h.alive = false
      this.hitstop = 0.4
      this.fx.burst(h.pos.clone().setY(1), '#e8384f', 30, 8, 0.2, 0.8)
      setTimeout(() => this.endRun(false), 900)
    }
  }

  private heal(amount: number, show = true): void {
    const h = this.hero
    const before = h.hp
    h.hp = Math.min(h.stats.maxHp, h.hp + amount)
    if (show && h.hp > before) {
      this.audio.play('heal')
      this.popWorld(h.pos.clone().setY(2.3), `+${Math.round(h.hp - before)}`, 'heal')
    }
  }

  // ─── Projectiles ───────────────────────────────────────────────────────

  private stepShots(dt: number): void {
    const level = this.level!
    for (const s of this.fx.shots) {
      if (!s.alive) continue
      s.life -= dt
      s.pos.addScaledVector(s.vel, dt)
      s.mesh.position.copy(s.pos)
      const tx = Math.floor(s.pos.x / 2)
      const ty = Math.floor(s.pos.z / 2)
      if (s.life <= 0 || level.solidForShot(tx, ty)) {
        this.fx.burst(s.pos.clone(), s.color, 5, 4, 0.1, 0.3)
        this.fx.killShot(s)
        continue
      }
      if (s.owner === 'enemy') {
        const h = this.hero
        if (h.alive && h.y < 1.5 && Math.hypot(s.pos.x - h.pos.x, s.pos.z - h.pos.z) < s.radius + HERO_RADIUS) {
          this.hurtHero(s.damage, s.pos.clone().sub(s.vel), 5)
          this.fx.killShot(s)
        }
        continue
      }
      for (const t of this.targets()) {
        if (s.hit.has(t.ref)) continue
        const r = t.radius + s.radius + (t.ref instanceof Enemy ? 0 : 0.4)
        if (Math.hypot(s.pos.x - t.pos.x, s.pos.z - t.pos.z) > r) continue
        s.hit.add(t.ref)
        this.damageTarget(t.ref, s.damage, s.crit, s.pos.clone().sub(s.vel.clone().multiplyScalar(0.05)), 5)
        if (s.chain) this.chainFrom(t.ref, s)
        this.fx.killShot(s)
        break
      }
    }
  }

  private chainFrom(first: Enemy | BossActor, s: Shot): void {
    let from = first.center.clone()
    const hit = new Set<unknown>([first])
    for (let k = 0; k < 2; k += 1) {
      let best: { ref: Enemy | BossActor; d: number } | null = null
      for (const t of this.targets()) {
        if (hit.has(t.ref)) continue
        const d = Math.hypot(t.pos.x - from.x, t.pos.z - from.z)
        if (d < 7.5 && (!best || d < best.d)) best = { ref: t.ref, d }
      }
      if (!best) return
      hit.add(best.ref)
      const to = best.ref.center.clone()
      for (let i = 1; i <= 10; i += 1) this.fx.flash(from.clone().lerp(to, i / 10).add(new THREE.Vector3((Math.random() - 0.5) * 0.35, (Math.random() - 0.5) * 0.35, (Math.random() - 0.5) * 0.35)), '#7ef9ff', 0.7, 0.22)
      this.fx.impact(to, new THREE.Vector3(0, 1, 0), '#7ef9ff', 0.7)
      this.damageTarget(best.ref, Math.round(s.damage * 0.6), false, from, 2)
      from = to
    }
  }

  // ─── Items & interaction ───────────────────────────────────────────────

  private stepItems(dt: number): void {
    const h = this.hero
    for (const r of this.rescueSeqs) {
      const ev = r.seq.update(dt, h.pos)
      if (ev === 'land') {
        this.fx.dust(r.pos.clone(), 7, 0.9, 2)
        this.audio.play('dash')
      } else if (ev === 'thud') {
        this.fx.dust(r.pos.clone(), 10, 1.2, 2.6)
        this.cam.addTrauma(0.12)
      } else if (ev === 'dance') {
        this.fx.burst(r.pos.clone().setY(1.6), r.color, 26, 7, 0.16, 0.9)
        this.fx.ring(r.pos.clone(), r.color, 0.4, 2.6, 0.5)
        this.audio.play('reward')
        const talk = r.talk
        r.talk = null
        if (talk) window.setTimeout(talk, 700)
      }
    }
    this.rescueSeqs = this.rescueSeqs.filter(r => !r.seq.done || r.talk)
    let focus: Interactable | undefined
    let focusD = Infinity
    for (const it of this.items) {
      if (it.used) continue
      if (it.bob) {
        it.bob.rotation.y += dt * 1.6
        it.bob.position.y = (it.kind === 'relic' ? 1.85 : it.kind === 'upgrade' ? 1.4 : it.kind === 'coin' ? 0.6 : 1) + Math.sin(this.time * 3 + it.pos.x) * 0.12
      }
      if (it.vel) {
        it.pos.addScaledVector(it.vel, dt)
        it.vel.multiplyScalar(Math.exp(-dt * 4))
        this.level!.collide(it.pos, 0.2, true)
        it.obj.position.copy(it.pos)
      }
      const d = Math.hypot(it.pos.x - h.pos.x, it.pos.z - h.pos.z)
      if (it.auto && it.enabled) {
        // Magnet pull for coins and orbs once the room is safe.
        const safe = !this.run || this.run.active === null || it.kind === 'coin'
        if (safe && d < (it.kind === 'coin' ? 3.2 : 2.2) && it.kind !== 'upgrade') {
          it.pos.lerp(h.pos, Math.min(1, dt * 10))
          it.obj.position.copy(it.pos)
        }
        if (d < it.radius) this.useItem(it)
        continue
      }
      if (it.enabled && d < it.radius && d < focusD) {
        focus = it
        focusD = d
      }
    }
    for (let i = this.items.length - 1; i >= 0; i -= 1) if (this.items[i].used && this.items[i].kind === 'coin') this.items.splice(i, 1)
    this.focus = focus
    if (this.portalSwirl) this.portalSwirl.rotation.z = -this.time * 0.8
  }

  private interact(): void {
    if (this.focus && !this.focus.used) this.useItem(this.focus)
  }

  private consumeItem(it: Interactable): void {
    it.used = true
    it.obj.removeFromParent()
  }

  private useItem(it: Interactable): void {
    const r = this.run
    const h = this.hero
    switch (it.kind) {
      case 'coin':
        this.consumeItem(it)
        if (r) r.credits += it.value ?? 1
        this.audio.play('coin')
        break
      case 'heal':
        this.consumeItem(it)
        this.heal(it.value ?? 20)
        break
      case 'power':
        this.consumeItem(it)
        h.power = Math.min(h.maxPower, h.power + (it.value ?? 50))
        this.audio.play('reward')
        this.popWorld(h.pos.clone().setY(2.3), 'POWER UP!', 'nova')
        break
      case 'upgrade':
        this.consumeItem(it)
        this.offerUpgrades(it.room, r?.plan.rooms[it.room]?.kind === 'elite' || r?.plan.rooms[it.room]?.kind === 'treasure')
        break
      case 'relic':
        this.consumeItem(it)
        this.grantRelic()
        break
      case 'fountain':
        it.used = true
        this.heal(h.stats.maxHp)
        h.power = h.maxPower
        this.fx.ring(it.pos.clone(), '#6dff9e', 0.5, 4, 0.5)
        this.ui.banner('FULLY RESTORED!', 'HP and Power refilled', 'green')
        it.obj.traverse(o => {
          if ((o as THREE.Mesh).userData?.water) ((o as THREE.Mesh).material as THREE.MeshBasicMaterial) = new THREE.MeshBasicMaterial({ color: '#2a4a3a' })
        })
        break
      case 'vending':
        if (r) this.openShop(it.room)
        break
      case 'capsule': {
        if (!r) break
        it.used = true
        const id = it.data as ClassmateId
        const already = this.save.data.rescued.includes(id) || r.rescues.includes(id)
        it.obj.children.filter(c => (c as THREE.Mesh).geometry instanceof THREE.OctahedronGeometry).forEach(c => c.removeFromParent())
        const actor = it.obj.userData.actor as ConstructorParameters<typeof RescueSequence>[0] | undefined
        this.fx.smoke(it.pos.clone().setY(1.2), '#bfefff', 6, 2, 1.2)
        this.fx.burst(it.pos.clone().setY(1.5), '#7ef9ff', 30, 8, 0.18, 0.8)
        this.audio.play('rescue')
        const c = CLASSMATE_BY_ID[id]
        if (!already) {
          r.rescues.push(id)
          r.build = { ...r.build, classmates: [...r.build.classmates, id] }
          this.save.update({ rescued: [...this.save.data.rescued, id] })
          this.stats(deriveStats(r.build, { dev: this.save.data.dev, rescued: this.save.data.rescued }))
        } else {
          r.credits += 30
          this.heal(30)
        }
        const talk = () => {
          this.input.unlockPointer()
          this.ui.openDialogue(`${c.name} RESCUED!`, `${c.power}  -  Assist: ${c.assist}`, already ? `"${c.name.split(' ')[0]} again? Thanks for the save! Take these credits."` : `"${c.line}"`, c.color, () => this.resume())
        }
        // Drop to the floor, get back up, then dance; the dialogue waits for the celebration.
        if (actor) this.rescueSeqs.push({ seq: new RescueSequence(actor, DANCE_FOR[c.id]), pos: it.pos.clone(), color: c.color, talk })
        else talk()
        break
      }
      case 'lore': {
        if (!r) break
        it.used = true
        const page = LORE.find(l => l.id === it.data) ?? LORE[0]
        r.lore += 1
        if (!this.save.data.lore.includes(page.id)) this.save.update({ lore: [...this.save.data.lore, page.id] })
        this.audio.play('reward')
        this.input.unlockPointer()
        this.ui.openDialogue(page.title, `Lore page ${LORE.indexOf(page) + 1} of ${LORE.length}`, page.text, '#c58cff', () => this.resume())
        break
      }
      case 'portal':
        if (r && r.floor < FLOOR_COUNT) this.descend()
        else if (r) this.endRun(true)
        break
      case 'vault':
        this.input.unlockPointer()
        this.ui.openDescent(this.save.data.lastSeed, seed => this.startRun(seed), () => this.resume())
        break
      case 'board':
        this.openBoard()
        break
      case 'codex':
        this.input.unlockPointer()
        this.ui.openCodex(this.save.data, () => this.resume())
        break
      case 'notice':
        this.input.unlockPointer()
        this.ui.openHowTo(() => this.resume(), this.save.data)
        break
      case 'npc': {
        const c = CLASSMATE_BY_ID[it.data as ClassmateId]
        this.input.unlockPointer()
        this.ui.openDialogue(c.name, `${c.power}  -  Permanent assist: ${c.assist}`, `"${c.line}"`, c.color, () => this.resume())
        break
      }
    }
  }

  private offerUpgrades(roomId: number, elite: boolean): void {
    const r = this.run
    if (!r) return
    let rerollN = 0
    const roll = () => rollUpgradeChoices(mulberry32(hashSeed(r.seed, 5000 + roomId * 16 + rerollN)), r.build, elite)
    let choices = roll()
    if (choices.length === 0) {
      r.credits += 25
      this.ui.toast('All upgrades maxed! +25 credits')
      return
    }
    this.audio.play('reward')
    this.input.unlockPointer()
    const show = () => this.ui.openUpgrades(choices.map(id => ({ def: UPGRADE_BY_ID[id], stacks: r.build.upgrades[id] ?? 0 })), r.rerolls, i => {
      const id = choices[i]
      r.build = addUpgrade(r.build, id)
      this.stats(deriveStats(r.build, { dev: this.save.data.dev, rescued: this.save.data.rescued }))
      if (id === 'heart') this.heal(25, false)
      this.audio.play('reward')
      this.ui.closeModal()
      this.ui.banner(UPGRADE_BY_ID[id].name.toUpperCase(), UPGRADE_BY_ID[id].desc, 'gold')
      this.resume()
    }, () => {
      if (r.rerolls <= 0) return
      r.rerolls -= 1
      rerollN += 1
      choices = roll()
      this.audio.play('ui')
      show()
    })
    show()
  }

  private grantRelic(): void {
    const r = this.run!
    const owned = new Set(r.build.relics)
    const seen = new Set(this.save.data.relics)
    const pool = RELICS.filter(x => !owned.has(x.id))
    if (!pool.length) {
      r.credits += 60
      this.ui.toast('Relic vault empty: +60 credits')
      return
    }
    const fresh = pool.filter(x => !seen.has(x.id))
    const rng = mulberry32(hashSeed(r.seed, 9000 + r.relics))
    const relic = rng.pick(fresh.length ? fresh : pool)
    r.build = { ...r.build, relics: [...r.build.relics, relic.id] }
    r.relics += 1
    if (!seen.has(relic.id)) this.save.update({ relics: [...this.save.data.relics, relic.id] })
    this.stats(deriveStats(r.build, { dev: this.save.data.dev, rescued: this.save.data.rescued }))
    if (relic.id === 'compass') for (const room of r.plan.rooms) r.discovered.add(room.id)
    this.audio.play('rescue')
    this.input.unlockPointer()
    this.ui.openDialogue(relic.name.toUpperCase(), relic.effect, relic.lore, '#ffcf4d', () => this.resume())
  }

  private openShop(roomId: number): void {
    const r = this.run!
    const stock = r.shop.get(roomId) ?? []
    this.input.unlockPointer()
    const show = () => this.ui.openShop(stock, r.credits, i => {
      const item = stock[i]
      if (item.sold || r.credits < item.price) {
        this.audio.play('telegraph')
        return
      }
      r.credits -= item.price
      item.sold = true
      if (item.id === 'snack') this.heal(40)
      else if (item.id === 'soda') this.hero.power = this.hero.maxPower
      else if (item.id.startsWith('up:')) {
        const id = item.id.slice(3) as UpgradeId
        r.build = addUpgrade(r.build, id)
        this.stats(deriveStats(r.build, { dev: this.save.data.dev, rescued: this.save.data.rescued }))
        if (id === 'heart') this.heal(25, false)
      }
      this.audio.play('coin')
      show()
    }, () => this.resume())
    show()
  }

  private openBoard(): void {
    this.input.unlockPointer()
    const show = () => this.ui.openBoard(this.save.data.dev, this.save.data.merits, (id: DevId) => {
      const def = DEV_BOARD.find(d => d.id === id)!
      const lvl = this.save.data.dev[id]
      const cost = def.cost(lvl)
      if (lvl >= def.max || this.save.data.merits < cost) {
        this.audio.play('telegraph')
        return
      }
      this.save.update({ merits: this.save.data.merits - cost, dev: { ...this.save.data.dev, [id]: lvl + 1 } })
      this.stats(this.hubStats())
      this.hero.hp = this.hero.stats.maxHp
      this.audio.play('reward')
      show()
    }, () => this.resume())
    show()
  }

  // ─── Render ────────────────────────────────────────────────────────────

  render(alpha: number, frame: number): void {
    this.streamer.update()
    const level = this.level
    if (!level) return
    // Behind the title poster the campus isn't drawn until it's primed (no first-frame stall).
    if (this.mode === 'title' && !this.campusPrimed) return
    this.input.update()
    this.input.gameplay = (this.mode === 'hub' || this.mode === 'run') && !this.ui.modalOpen
    if (this.mode === 'title') {
      this.titleAngle += frame * 0.08
      const c = this.markers!.A
      this.cam.camera.position.set(c.x + Math.sin(this.titleAngle) * 15, 6.5, c.z + Math.cos(this.titleAngle) * 13)
      this.cam.camera.lookAt(c.x, 2.2, c.z)
      this.input.takeLook()
    } else {
      const look = this.ui.modalOpen || this.mode === 'results' ? (this.input.takeLook(), { x: 0, y: 0 }) : this.input.takeLook()
      this.hero.render(alpha, this.time)
      if (this.hero.footstep) this.fx.dust(this.hero.pos.clone(), 2, 0.55, 0.8)
      this.cam.sprint += ((this.hero.sprinting ? 1 : 0) - this.cam.sprint) * Math.min(1, frame * 5)
      this.cam.update(this.hero.rig.root.position, look, frame, level)
    }
    this.hero.rig.root.visible = this.mode !== 'title'
    for (const e of this.enemies) e.render(alpha, this.time)
    if (this.boss) {
      this.boss.render(alpha, this.time)
      // Fade the boss when it gets between the camera and the hero.
      const cp = this.cam.camera.position
      const b = this.boss.pos
      const h = this.hero.pos
      const camToBoss = Math.hypot(cp.x - b.x, cp.z - b.z)
      const camToHero = Math.hypot(cp.x - h.x, cp.z - h.z)
      this.boss.setFade(camToBoss < 4.2 || (camToBoss < camToHero + 0.5 && this.segDist(cp, h, b) < 2.6))
    }
    updateAmbient(frame)
    for (const n of this.npcs) n.obj.children[0].rotation.y = Math.PI / 2 + Math.sin(this.time + n.obj.position.z) * 0.3
    const room = this.run ? this.run.plan.rooms[this.run.current] : undefined
    level.update(this.time, this.mode === 'title' ? this.markers!.A : this.hero.pos, room)
    this.renderer.render(this.scene, this.cam.camera)
    this.updateHud()
  }

  private segDist(a: THREE.Vector3, b: THREE.Vector3, p: THREE.Vector3): number {
    const abx = b.x - a.x
    const abz = b.z - a.z
    const len2 = abx * abx + abz * abz || 1
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.z - a.z) * abz) / len2))
    return Math.hypot(a.x + abx * t - p.x, a.z + abz * t - p.z)
  }

  private popWorld(pos: THREE.Vector3, text: string, cls: string): void {
    const p = pos.clone().project(this.cam.camera)
    if (p.z > 1) return
    this.ui.popAt((p.x * 0.5 + 0.5) * window.innerWidth, (-p.y * 0.5 + 0.5) * window.innerHeight, text, cls)
  }

  private drawMaps(full = false): void {
    const r = this.run
    if (!r) return
    const canvas = full ? this.ui.mapCanvas : this.ui.minimapCanvas
    drawMap(canvas, r.plan, { discovered: r.discovered, visited: r.visited, cleared: r.cleared, current: r.current, bossDefeated: r.bossDefeated }, this.hero.pos, this.hero.facing, full)
  }

  private updateHud(): void {
    if (this.mode === 'title' || this.mode === 'results') return
    const h = this.hero
    const r = this.run
    const s = h.stats
    const room = r ? r.plan.rooms[r.current] : undefined
    const pathIndex = r ? Math.max(0, ...r.plan.path.filter(id => r.cleared.has(id) || id === r.current).map(id => r.plan.rooms[id].pathIndex)) : 0
    const enemiesLeft = this.enemies.filter(e => e.alive).length
    const data: HudData = {
      hp: h.hp,
      maxHp: s.maxHp,
      power: h.power,
      maxPower: h.maxPower,
      boltCost: s.boltCost,
      novaCost: NOVA_COST,
      dash: s.dashCooldown > 0 ? 1 - h.dashCd / s.dashCooldown : 1,
      shield: s.shield ? (h.shieldReady ? 1 : 1 - h.shieldCd / 9) : -1,
      credits: r?.credits ?? 0,
      merits: this.save.data.merits,
      prompt: this.focus ? this.focus.prompt : null,
      method: this.input.method,
      inRun: !!r,
      wing: r ? `F${r.floor}/${FLOOR_COUNT}  ${WINGS[r.plan.wing].short}` : 'Hall of Origins',
      roomLabel: r && room ? roomLabel(room, r.cleared.has(room.id), r.floor) : 'Safe Zone  -  Head north to the Vault Portal',
      progress: r ? { at: pathIndex, total: r.plan.path.length - 1, boss: r.bossDefeated } : null,
      enemiesLeft: r && r.active !== null ? enemiesLeft : 0,
      wave: r && r.active !== null && room && room.waves > 1 ? `Wave ${r.wave + 1}/${room.waves}` : '',
      time: r?.time ?? 0,
      build: r ? Object.entries(r.build.upgrades).map(([id, n]) => ({ icon: UPGRADE_BY_ID[id as UpgradeId].icon, name: UPGRADE_BY_ID[id as UpgradeId].name, n: n ?? 1, rarity: UPGRADE_BY_ID[id as UpgradeId].rarity })) : [],
      relics: r ? r.build.relics.map(id => RELIC_BY_ID[id].name) : [],
      rerolls: r?.rerolls ?? 0,
    }
    this.ui.hud(data)
    this.ui.coach(this.mode === 'hub' && this.tutorial ? this.tutorial.view(this.input.method) : null, this.input.method)
    if (r) {
      this.drawMaps(false)
      if (this.mapOpen) this.drawMaps(true)
    }
    void UPGRADES
  }
}

function roomLabel(room: RoomPlan, cleared: boolean, floor: number): string {
  const names: Record<RoomPlan['kind'], string> = {
    entrance: 'Entry Stairwell', combat: 'Corrupted Room', elite: 'Elite Chamber', boss: BOSSES[FLOOR_BOSS[floor - 1] ?? 'proctor'].arena,
    exit: floor < FLOOR_COUNT ? 'Descent Portal' : 'Exit Portal',
    heal: "Nurse's Office", shop: 'School Store', rescue: 'Detention Cell', challenge: 'Challenge Room', lore: 'Archive Nook', treasure: 'Trophy Vault',
  }
  const danger = room.danger ? `  -  Danger ${'I'.repeat(room.danger)}` : ''
  return `${names[room.kind]}${COMBAT_KINDS.has(room.kind) ? (cleared ? '  -  Cleared' : danger) : ''}`
}
