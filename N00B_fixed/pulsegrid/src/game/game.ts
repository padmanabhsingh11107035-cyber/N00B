import * as THREE from 'three'
import type { Audio } from '../engine/audio'
import { Feedback } from './feedback'
import type { HitAction, Input } from '../engine/input'
import type { Renderer } from '../engine/renderer'
import { buildTimeline, expectedKey, PLAYABLE, TARGET_BEAT, type Dir, type HintKey, type Round, type Song, type Timeline } from './chart'
import { CONFIG } from './config'
import { CAST } from './cast'
import { Dancer, type Mood, type CharacterKit } from './dancer'
import { Effects } from './fx'
import { TRACKS } from './manifest'
import { Music, type MusicBar } from './music'
import { accuracy, applyGrade, clearPerf, createPerf, judge, placement, rankFor, rivalGrade, type Grade, type Perf, type Rank } from './rules'
import { LOBBY, SONGS } from './songs'
import { Stage, type StageTextures } from './stage'
import { tuning } from './tuning'

export type Mode = 'attract' | 'playing' | 'paused' | 'resuming' | 'ended'
export type Standing = { name: string; score: number; you: boolean; last?: Grade }
export type Result = { song: Song; perf: Perf; rank: Rank; accuracy: number; standings: Standing[]; place: number; unranked: boolean }
export type Tag = { name: string; x: number; y: number; visible: boolean; you: boolean; last?: Grade; lastAt: number }
export type BannerTone = 'level' | 'fever' | 'break' | 'finish' | 'info' | 'spotlight' | 'combo' | 'freestyle'
/** Freestyle HUD events: run start, each landed link, a broken chain, and the final payout. */
export type FreestyleEvent = { kind: 'start' | 'link' | 'break' | 'end'; chain: number; bonus: number; total: number; links: number; link: number }
export type GameHooks = {
  judged(grade: Grade, points: number, perf: Perf, finish: boolean, spotlight: boolean): void
  milestone(combo: number): void
  wrong(): void
  banner(text: string, tone: BannerTone): void
  countdown(label: string): void
  freestyle(ev: FreestyleEvent): void
  ended(result: Result): void
}
export type View = {
  song?: Song
  round?: Round
  open: boolean
  progress: number
  /** Timing marker position across the round's bar (0..1); the target sits at 0.75. */
  cursor: number
  barSeconds: number
  songProgress: number
  elapsed: number
  duration: number
  level: number
  perf: Perf
  standings: Standing[]
  hint?: HintKey
  /** Last judgment of the current round (shown until the next round opens). */
  lastGrade?: Grade
  /** Current round is a Spotlight round (double points on Perfect/Great). */
  spotlight: boolean
  /** Current (or just-judged) round is a freestyle link. */
  freestyle: boolean
  /** Screen position of the player's chest (CSS px) for HUD bursts. */
  playerX: number
  playerY: number
}

type Rival = { name: string; perf: Perf; skill: number; last?: Grade; lastAt: number; dancer: Dancer; rand: () => number }
type CamShot = { pos: THREE.Vector3; look: THREE.Vector3 }

const INTENSITY: Record<string, number> = { intro: 0.35, verse: 0.55, build: 0.7, drop: 1, break: 0.3, outro: 0.45, lobby: 0.5 }

export class Game {
  readonly camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, 16 / 9, 0.1, 120)
  readonly music: Music
  mode: Mode = 'attract'
  reducedMotion = false
  offsetMs = 0
  /** Test/demo only: plays the chart automatically. */
  autoplay: 'off' | 'perfect' | 'miss' = 'off'

  private readonly stage: Stage
  private readonly fx: Effects
  /** Round indices that are Spotlight rounds for the current chart. */
  private spotRounds = new Set<number>()
  private spotAmt = 0
  private trailUntil = 0
  private trailColor = '#ffd84a'
  private readonly shadows: THREE.Mesh[] = []
  private readonly bands = new Float32Array(16)
  private readonly fft = new Uint8Array(128)
  private lastMilestone = 0
  private player!: Dancer
  private readonly rivals: Rival[] = []
  private song?: Song
  private tl?: Timeline
  private perf: Perf = createPerf()
  private ri = 0
  private open = false
  private progress = 0
  private resolvedAt = -Infinity
  /** Soft in-key beat ticks + riser into each target (settings). */
  beatAssist = true
  private feedback!: Feedback
  private hitT: number | undefined
  private feverOn = false
  private lastGrade?: Grade
  private rivalRi = 0
  private lastBar = -1
  private lastBeat = -1
  private lastLevel = 0
  private beatLen = 60 / LOBBY.bpm
  private songT = 0
  private localT = 0
  private flash = 0
  private missFlash = 0
  private shake = 0
  private endAt = 0
  private result?: Result
  private resumeAt = 0
  private resumeShown = 0
  private shot = 0
  private shotSince = 0
  /** Perfect close-up: active until `closeUntil` (song s); alternates sides; throttled by `closeAt`. */
  private closeUntil = -1
  private closeAt = -99
  private closeSide = 1
  private cutNow = false
  private lastEffShot = -1
  private readonly chestV = new THREE.Vector3()
  private readonly lookV = new THREE.Vector3()
  private fsLinks = 0
  private camPos = new THREE.Vector3(0, 3, 12)
  private camLook = new THREE.Vector3(0, 1.2, 0)
  private crewPhrase = -1
  private crewSeed = 0
  private attractMoveBar = -1
  private readonly v = new THREE.Vector3()
  private readonly tags: Tag[]
  private readonly shots: CamShot[]

  constructor(
    private readonly renderer: Renderer,
    private readonly input: Input,
    private readonly audio: Audio,
    private readonly hooks: GameHooks,
    kit: CharacterKit,
    tex: StageTextures,
    /** Decoded music buffer for a track id, when it has streamed in. */
    private readonly track: (id: string) => AudioBuffer | undefined,
  ) {
    this.music = new Music(audio)
    this.feedback = new Feedback(audio, this.music)
    this.stage = new Stage(renderer.gl, SONGS[1].palette, tex)
    const scene = this.stage.scene
    this.fx = new Effects(tex.atlas)
    scene.add(this.fx.group)
    const shadowTex = blobTexture()
    const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, color: '#000000', transparent: true, opacity: 0.62, depthWrite: false })
    CAST.forEach((c, k) => {
      const dancer = new Dancer(kit, c.outfit, c.style, c.genres)
      dancer.root.position.set(...c.pos)
      dancer.root.rotation.y = -c.pos[0] * 0.06
      scene.add(dancer.root)
      const sh = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.25), shadowMat)
      sh.rotation.x = -Math.PI / 2
      sh.position.set(c.pos[0], c.pos[1] + 0.006, c.pos[2])
      sh.renderOrder = 1
      scene.add(sh)
      this.shadows.push(sh)
      if (k === 0) this.player = dancer
      else this.rivals.push({ name: c.name, perf: createPerf(true), skill: 0.5, lastAt: 0, dancer, rand: mulberry(k + 6) })
    })
    this.tags = CAST.map((c, k) => ({ name: c.name, x: 0, y: 0, visible: false, you: k === 0, lastAt: 0 }))
    this.shots = [
      { pos: new THREE.Vector3(0, 2.6, 8.8), look: new THREE.Vector3(0, 1.15, -0.2) },
      // 3/4 angles sit in front of both crowd rows and above the near row's heads, aimed at YOU.
      { pos: new THREE.Vector3(-4.2, 2.4, 6.0), look: new THREE.Vector3(0.2, 1.15, 0.4) },
      { pos: new THREE.Vector3(4.2, 2.4, 6.0), look: new THREE.Vector3(-0.2, 1.15, 0.4) },
      { pos: new THREE.Vector3(0, 1.3, 5.0), look: new THREE.Vector3(0, 1.45, -0.2) },
      { pos: new THREE.Vector3(0, 6.2, 8.2), look: new THREE.Vector3(0, 0.6, -0.6) },
      { pos: new THREE.Vector3(1.2, 1.9, 4.6), look: new THREE.Vector3(0, 1.25, 0.6) },
      // 6 = tracked Perfect close-up, 7 = tracked hero orbit (positions computed per frame).
      { pos: new THREE.Vector3(0.9, 1.5, 3.2), look: new THREE.Vector3(0, 1.3, 1) },
      { pos: new THREE.Vector3(0, 2.0, 5.2), look: new THREE.Vector3(0, 1.2, 1) },
    ]
  }

  get activeSong(): Song | undefined {
    return this.song
  }

  /** Start (or keep) the title-screen groove. Needs an unlocked AudioContext to be audible. */
  startLobby(): void {
    if (this.mode !== 'attract') return
    const buf = this.track('title')
    if (buf && !this.music.lobbyTrack) {
      this.music.playTrack(buf, TRACKS.title.bpm, TRACKS.title.firstBeat, 0.1, true, 0.85)
      this.beatLen = 60 / TRACKS.title.bpm
    } else if (!this.music.active) {
      this.music.playLobby(LOBBY.style, LOBBY.bpm)
      this.beatLen = 60 / LOBBY.bpm
    }
  }

  /** Title groove under the results screen (mode stays 'ended' until the player leaves). */
  startLobbyAfterSong(): void {
    const mode = this.mode
    this.mode = 'attract'
    this.startLobby()
    this.mode = mode
  }

  /** Background-loading gate: true while nothing intense is happening on screen. */
  /**
   * Fever crew routine: on every 8-beat phrase the whole crew hits the same mocap routine in
   * unison (NOVA on stage-left mirrored, so the formation reads symmetric from the audience).
   */
  private crewRoutine(beat: number) {
    const ph = Math.floor((beat + 0.25) / 8)
    if (ph === this.crewPhrase || beat + 0.25 - ph * 8 > 0.75) return
    this.crewPhrase = ph
    const pool = this.player.movePool(8)
    if (!pool.length) return
    const name = pool[(ph * 7 + (this.crewSeed = (this.crewSeed + 1) % 97)) % pool.length]
    const all = [this.player, ...this.rivals.map((r) => r.dancer)]
    for (const d of all) d.cue(name, ph * 8, d.root.position.x < -0.5)
    this.flash = Math.max(this.flash, 0.35)
  }

  isCalm(): boolean {
    if (this.mode !== 'playing') return this.fx.active < 400
    const tl = this.tl
    if (!tl) return true
    const t = this.songT
    const info = tl.bars[Math.max(0, Math.min(tl.bars.length - 1, Math.floor(t / tl.barSeconds)))]
    const heated = info.kind === 'drop' || info.kind === 'build' || this.perf.feverRounds > 0 || info.finish
    return !heated && this.fx.active < 250
  }

  /** Is the given song's track decoded (or will the procedural fallback be used)? */
  hasTrack(id: string): boolean {
    return !!this.track(id)
  }

  start(song: Song): void {
    tuning.activate('run')
    this.song = song
    this.tl = buildTimeline(song, (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0)
    this.perf = { ...createPerf(song.noFail), unranked: tuning.unranked }
    this.rivals.forEach((r, k) => {
      r.perf = createPerf(true)
      r.skill = Math.max(0, Math.min(1, song.rivalSkill[k] + CONFIG.rivals.skillBias))
      r.last = undefined
    })
    this.ri = 0
    this.open = false
    this.progress = 0
    this.resolvedAt = -Infinity
    this.lastGrade = undefined
    this.rivalRi = 0
    this.lastBar = -1
    this.lastBeat = -1
    this.lastLevel = 0
    this.result = undefined
    this.endAt = 0
    this.shot = 0
    this.beatLen = this.tl.beat
    this.stage.setPalette(song.palette)
    this.fx.clear()
    const bars: MusicBar[] = []
    const tl = this.tl
    tl.bars.forEach((b, i) => {
      const first = tl.bars.findIndex(x => x.section === b.section)
      const len = song.sections[b.section].bars
      bars.push({ kind: b.kind, pos: i - first, len, finish: b.finish })
    })
    // Spotlight rounds: the first playable round of every verse/drop section after the first
    // (never a Finish round) — double points on Perfect/Great, the stage focuses on you.
    // Precompile every material now so tracked close-ups and new angles never stall on first draw.
    try {
      this.renderer.gl.compile(this.stage.scene, this.camera)
    } catch {
      /* compile is an optimisation only */
    }
    this.spotRounds.clear()
    this.closeUntil = -1
    this.closeAt = -99
    this.fsLinks = 0
    const seen = new Set<number>()
    tl.rounds.forEach((r, i) => {
      const b = tl.bars[r.bar]
      if (!b || r.finish || r.freestyle || seen.has(b.section)) return
      seen.add(b.section)
      if ((b.kind === 'drop' || b.kind === 'verse') && i > 1 && !song.noFail) this.spotRounds.add(i)
    })
    this.lastMilestone = 0
    this.spotAmt = 0
    const buf = this.track(song.id)
    if (buf) this.music.playTrack(buf, TRACKS[song.id]?.bpm ?? song.bpm, TRACKS[song.id]?.firstBeat ?? 0, 0.6, false, 1)
    else this.music.playSong(song.style, song.bpm, bars, 0.6)
    this.feedback.begin(song.id, tl)
    this.feverOn = false
    this.hitT = undefined
    this.audio.crowd(0.6)
    this.songT = -0.6
    this.mode = 'playing'
    this.input.rhythm = true
    this.input.clearHits()
  }

  pause(): void {
    if (this.mode !== 'playing' && this.mode !== 'resuming') return
    this.mode = 'paused'
    this.music.pause()
    this.input.rhythm = false
    this.input.clearHits()
  }

  /** Resume after a short 3-2-1 so the player can find the rhythm again. */
  resume(): void {
    if (this.mode !== 'paused') return
    this.mode = 'resuming'
    this.resumeAt = performance.now() + 1500
    this.resumeShown = 4
    this.input.rhythm = false
  }

  toTitle(): void {
    this.music.stop(0.3)
    this.feedback.end()
    this.mode = 'attract'
    this.song = undefined
    this.tl = undefined
    this.input.rhythm = false
    this.input.clearHits()
    this.fx.clear()
    this.audio.crowd(0)
    this.stage.setPalette(SONGS[1].palette)
    if (this.audio.ctx.state === 'running') this.startLobby()
  }

  // ─── simulation ──────────────────────────────────────────────────────────

  step(_dt: number): void {
    if (this.mode !== 'playing' || !this.tl || !this.song) {
      if (this.mode !== 'resuming') this.input.drainHits()
      return
    }
    const tl = this.tl
    const t = this.music.songTime()
    this.songT = t
    this.openRound(t)
    if (this.autoplay !== 'off') this.autoPlay(t)
    const offset = this.offsetMs / 1000
    for (const hit of this.input.drainHits()) {
      const te = this.music.songTime(hit.t) - offset
      if (hit.action === 'beat') this.onBeat(te)
      else this.onArrow(hit.action)
      this.openRound(t)
    }
    const r = tl.rounds[this.ri]
    if (this.open && r && t > r.target + CONFIG.judge.bad / 1000) this.resolve('miss', t)
    // Rivals perform each round right on its beat.
    while (this.rivalRi < tl.rounds.length && t >= tl.rounds[this.rivalRi].target) {
      const round = tl.rounds[this.rivalRi]
      for (const rival of this.rivals) {
        const grade = rivalGrade(rival.skill, rival.rand())
        rival.perf = applyGrade(rival.perf, grade, { arrows: round.arrows.length, finish: round.finish }).state
        rival.last = grade
        rival.lastAt = performance.now()
        // During the freestyle the rivals step back and hype YOU instead of competing.
        if (!round.freestyle) rival.dancer.react(grade, t / tl.beat, rival.rand())
      }
      this.rivalRi += 1
    }
    this.barEvents(t)
    if (this.mode === 'playing' && t >= tl.duration + 0.1) this.finish(false)
  }

  private openRound(t: number): void {
    const r = this.tl?.rounds[this.ri]
    if (!r || this.open || t < r.openAt || t < this.resolvedAt + 0.05) return
    this.open = true
    this.progress = 0
    this.lastGrade = undefined
    if (r.freestyle && r.link === 0) {
      this.fsLinks = this.tl!.rounds.filter((x) => x.freestyle).length
      this.hooks.banner('Freestyle!', 'freestyle')
      this.hooks.freestyle({ kind: 'start', chain: 0, bonus: 0, total: 0, links: this.fsLinks, link: 0 })
      this.audio.play('fever')
      this.audio.play('whoosh')
      this.stage.wallText('FREESTYLE', 2.4)
      const P = this.song!.palette
      this.fx.confetti(this.v.set(0, 3.8, 1), 110, [P.a, P.b, P.c, '#ffffff'], 1)
      for (const rival of this.rivals) rival.dancer.perform('cheer', t / this.tl!.beat + 0.5)
    }
    if (r.finish) {
      this.hooks.banner('Finish Move!', 'finish')
      this.audio.play('finish')
      this.stage.wallText('FINISH', 2.4)
    } else if (this.spotRounds.has(this.ri)) {
      this.hooks.banner('Spotlight!', 'spotlight' as BannerTone)
      this.audio.play('spotlight')
      this.stage.wallText('SPOTLIGHT', 2)
    }
  }

  private autoPlay(t: number): void {
    const r = this.tl!.rounds[this.ri]
    if (!r || !this.open) return
    if (this.autoplay === 'miss') {
      if (t >= r.target - 0.5) this.onBeat(r.target - 0.5)
      return
    }
    // Test/demo autoplay types the whole sequence at once so slow software-GL frames can't make it late.
    if (this.progress < r.arrows.length && t > r.openAt + 0.25) {
      while (this.open && this.progress < r.arrows.length) this.onArrow(expectedKey(r.arrows[this.progress], r.reversed[this.progress]))
    }
    if (this.open && this.progress >= r.arrows.length && t >= r.target) this.onBeat(r.target)
  }

  private onArrow(dir: Dir): void {
    const r = this.tl?.rounds[this.ri]
    if (!r || !this.open || this.progress >= r.arrows.length) return
    if (dir === expectedKey(r.arrows[this.progress], r.reversed[this.progress])) {
      this.progress += 1
      this.feedback.arrow(this.progress - 1, r.arrows.length, dir, r.reversed[this.progress - 1])
      if (this.progress === r.arrows.length) this.feedback.locked(r.target, this.beatAssist)
      this.player.gesture(dir)
    } else {
      this.progress = 0
      this.feedback.wrong()
      this.shake = Math.max(this.shake, 0.25)
      this.hooks.wrong()
    }
  }

  private onBeat(te: number): void {
    const r = this.tl?.rounds[this.ri]
    if (!r || !this.open) return
    const offset = te - r.target
    this.hitT = te
    if (offset < -CONFIG.judge.bad / 1000) {
      this.resolve('miss', this.songT)
      return
    }
    if (this.progress < r.arrows.length) {
      this.resolve('miss', this.songT)
      return
    }
    this.resolve(judge(offset), this.songT)
  }

  private resolve(grade: Grade, t: number): void {
    const tl = this.tl!
    const r = tl.rounds[this.ri]
    const spotlight = this.spotRounds.has(this.ri)
    const res = applyGrade(this.perf, grade, { arrows: r.arrows.length, finish: r.finish, spotlight, freestyle: r.freestyle })
    this.perf = res.state
    this.open = false
    this.resolvedAt = Math.max(t, r.target)
    this.lastGrade = grade
    this.ri += 1
    const beat = Math.max(t, r.target - 0.05) / tl.beat
    const good = grade === 'perfect' || grade === 'great' || grade === 'cool'
    const colors = [this.song!.palette.a, this.song!.palette.b, this.song!.palette.c, '#ffffff']
    this.tags[0].last = grade
    this.tags[0].lastAt = performance.now()
    const P = this.song!.palette
    const chest = this.player.boneWorld('spine_03', new THREE.Vector3())
    const now = performance.now()
    if (r.finish && good) {
      this.player.perform('finale', beat)
      for (const rival of this.rivals) rival.dancer.perform('cheer', beat + 0.5)
      this.fx.starburst(chest, P.c, 1.6)
      this.fx.confetti(this.v.set(0, 4.2, 1), 260, colors, 1.25)
      this.fx.shockwave(this.v.set(0, 0, 1), P.c, 9, 1.2)
      for (const p of this.stage.pyroPoints) this.fx.fountain(p, 2.2)
      for (const p of this.stage.co2Points) this.fx.co2(p, 1.1)
      this.audio.play('finishImpact')
      this.audio.play('co2')
      this.flash = 1
      this.shake = Math.max(this.shake, 0.35)
      this.shot = 5
      this.shotSince = t
      this.trailUntil = now + 1400
      this.trailColor = P.c
    } else if (r.freestyle) {
      const n = this.perf.fsChain
      const last = !!tl.rounds[this.ri]?.finish || this.ri >= tl.rounds.length
      if (good) {
        // Chain straight into the next power move; every link hits harder than the last.
        this.player.power(n, beat)
        const k = Math.min(n, 5)
        this.fx.starburst(chest, grade === 'perfect' ? '#ffd84a' : P.b, 1 + k * 0.22)
        this.fx.shockwave(this.v.set(0, 0, 1), k >= 3 ? P.c : P.a, 4 + k * 1.3, 0.9 + k * 0.08)
        this.fx.sparkle(this.v.set(0, 0.25, 1), 14 + k * 8, k >= 3 ? P.c : P.b)
        if (k >= 2) for (const p of this.stage.pyroPoints.slice(1, 3)) this.fx.fountain(p, 0.8 + k * 0.25)
        if (k >= 3) {
          for (const p of [this.stage.pyroPoints[0], this.stage.pyroPoints[3]]) this.fx.fountain(p, 1.2, P.c)
          for (const p of this.stage.co2Points) this.fx.co2(p, 0.7)
          this.audio.play('co2')
        }
        this.audio.play(k >= 2 ? 'pyro' : 'whoosh')
        this.flash = 1
        this.shake = Math.max(this.shake, 0.1 + k * 0.05)
        this.trailUntil = now + 900
        this.trailColor = k >= 3 ? P.c : '#ffd84a'
        this.stage.wallText(`CHAIN x${n}`, 1.3)
        this.hooks.freestyle({ kind: 'link', chain: n, bonus: res.bonus, total: this.perf.fsBonus, links: this.fsLinks, link: r.link })
      } else {
        this.player.react(grade, beat)
        this.fx.puff(this.v.set(0, 0.4, 1.2))
        this.missFlash = 1
        this.shake = Math.max(this.shake, 0.4)
        if (res.chainBroken) this.audio.play('aww')
        this.hooks.freestyle({ kind: 'break', chain: 0, bonus: 0, total: this.perf.fsBonus, links: this.fsLinks, link: r.link })
      }
      if (last) {
        this.hooks.freestyle({ kind: 'end', chain: this.perf.fsBest, bonus: 0, total: this.perf.fsBonus, links: this.fsLinks, link: r.link })
        if (this.perf.fsBonus > 0) {
          this.audio.play('milestone')
          this.fx.confetti(this.v.set(0, 4, 1), 90 + this.perf.fsBest * 30, colors, 1.1)
        }
      }
    } else {
      this.player.react(grade, beat)
      if (grade === 'perfect') {
        this.fx.starburst(chest, '#ffd84a', spotlight ? 1.3 : 1)
        this.fx.sparkle(this.v.set(0, 0.2, 1), 22, P.c)
        this.fx.shockwave(this.v.set(0, 0, 1), P.c, 5)
        this.flash = 1
        this.trailUntil = now + 700
        this.trailColor = '#ffd84a'
        if (Math.random() < 0.35) this.audio.play('voPerfect')
      } else if (grade === 'great') {
        this.fx.sparkle(chest, 18, P.b)
        this.fx.shockwave(this.v.set(0, 0, 1), P.b, 3.5)
        this.flash = 0.6
        this.trailUntil = now + 450
        this.trailColor = P.b
      } else if (grade === 'cool') {
        this.fx.sparkle(chest, 8, '#9fe8ff')
        this.flash = 0.3
      } else {
        this.fx.puff(this.v.set(0, 0.4, 1.2))
        this.missFlash = 1
        this.shake = Math.max(this.shake, grade === 'miss' ? 0.5 : 0.25)
      }
      if (spotlight && (grade === 'perfect' || grade === 'great')) {
        for (const p of this.stage.pyroPoints.slice(1, 3)) this.fx.fountain(p, 1)
        this.audio.play('pyro')
      }
    }
    // Cut to a tracked close-up on a Perfect (throttled so the camera never strobes).
    if (grade === 'perfect' && !r.finish && !this.reducedMotion && this.shot !== 5 && t - this.closeAt > tl.barSeconds * 1.9) {
      this.closeAt = t
      this.closeUntil = t + tl.barSeconds * (r.freestyle ? 0.8 : 1)
      this.closeSide = -this.closeSide
    }
    this.audio.play(grade)
    this.feedback.hit(grade, this.hitT ?? t, r.target, this.perf.combo, this.perf.feverRounds > 0)
    this.hitT = undefined
    if (r.freestyle && good) this.feedback.chain(this.perf.fsChain)
    this.hooks.judged(grade, res.points, this.perf, r.finish, spotlight)
    // Combo milestones: every 10, with bigger celebrations at 25/50/100.
    const combo = this.perf.combo
    const mark = combo >= 10 ? (combo % 25 === 0 ? combo : combo % 10 === 0 ? combo : 0) : 0
    if (mark && mark !== this.lastMilestone) {
      this.lastMilestone = mark
      const big = mark % 25 === 0
      this.hooks.milestone(mark)
      this.audio.play('milestone')
      this.feedback.milestone(big)
      this.stage.wallText(`${mark} COMBO`, 1.8)
      this.fx.confetti(this.v.set(0, 3.4, 1), big ? 160 : 70, colors, big ? 1.1 : 0.8)
      if (big) {
        for (const p of this.stage.co2Points) this.fx.co2(p, 0.7)
        this.audio.play('co2')
      }
    }
    if (res.feverStarted) {
      this.audio.play('fever')
      this.feverOn = true
      this.feedback.fever(true)
      this.hooks.banner('Fever Time!', 'fever')
      this.stage.wallText('FEVER', 2.2)
      this.fx.confetti(this.v.set(0, 3.4, 1), 120, colors, 1)
      for (const p of this.stage.pyroPoints) this.fx.fountain(p, 1.4, P.a)
    }
    if (res.failed) this.finish(true)
  }

  private barEvents(t: number): void {
    const tl = this.tl!
    const bar = Math.floor(t / tl.barSeconds)
    while (this.lastBar < bar && this.lastBar < tl.bars.length - 1) {
      this.lastBar += 1
      const info = tl.bars[this.lastBar]
      const prev = tl.bars[this.lastBar - 1]
      const sectionStart = !prev || prev.section !== info.section
      if (!sectionStart) continue
      if (info.kind === 'break') this.hooks.banner('Dance Break', 'break')
      if (PLAYABLE.has(info.kind) && info.level > this.lastLevel && this.lastBar > 4) {
        this.hooks.banner(`Level ${info.level + 1}`, 'level')
        this.audio.play('levelup')
      }
      if (PLAYABLE.has(info.kind)) this.lastLevel = Math.max(this.lastLevel, info.level)
      this.nextShot(info.kind, t)
    }
    // Count-in on the last intro bar.
    const beatIndex = Math.floor(t / tl.beat)
    if (beatIndex !== this.lastBeat && beatIndex >= 0) {
      this.lastBeat = beatIndex
      const first = tl.rounds[0]
      const introLast = first ? first.bar - 1 : -1
      if (Math.floor(beatIndex / 4) === introLast) {
        const k = beatIndex % 4
        this.hooks.countdown(['3', '2', '1', 'Dance!'][k])
      }
      // Two-bar camera cuts during drops keep the energy up.
      const info = tl.bars[Math.floor(beatIndex / 4)]
      // Freestyle holds the hero orbit on YOU; ordinary drops rotate angles that all frame YOU.
      if (info && info.freestyle && this.shot !== 5 && !this.reducedMotion) this.shot = 7
      else if (info && info.kind === 'drop' && beatIndex % 8 === 0 && this.shot !== 5 && !this.reducedMotion) this.shot = [7, 1, 4, 2][(beatIndex / 8) % 4]
    }
    if (this.shot === 5 && t - this.shotSince > tl.barSeconds * 1.5) this.shot = 0
  }

  private nextShot(kind: string, t: number): void {
    if (this.reducedMotion) {
      this.shot = 0
      return
    }
    const choice: Record<string, number[]> = { intro: [4], verse: [0, 1, 2], build: [3, 0], drop: [7, 1, 2], break: [5, 3], outro: [0] }
    const list = choice[kind] ?? [0]
    this.shot = list[Math.floor(Math.random() * list.length)]
    this.shotSince = t
  }

  private finish(failed: boolean): void {
    if (this.mode !== 'playing') return
    const song = this.song!
    this.perf = failed ? this.perf : clearPerf(this.perf)
    this.input.rhythm = false
    this.mode = 'ended'
    this.feedback.end()
    const beat = this.songT / this.beatLen
    this.fx.embers(false)
    this.audio.crowd(0.25)
    if (failed) {
      this.music.stop(0.8)
      this.audio.play('fail')
      this.audio.sample('music:sting_fail', 0.9)
      this.audio.play('aww')
      this.player.perform('slump', beat)
      for (const r of this.rivals) r.dancer.perform('cheer', beat)
    } else {
      this.audio.play('clear')
      this.audio.play('applause')
      this.audio.sample('music:sting_clear', 0.9, 1, 0.4)
      this.player.perform('cheer', beat)
      this.fx.confetti(this.v.set(0, 4, 1), 240, [song.palette.a, song.palette.b, song.palette.c, '#ffffff'], 1.15)
      for (const p of this.stage.pyroPoints) this.fx.fountain(p, 2)
      for (const p of this.stage.co2Points) this.fx.co2(p, 1)
      this.stage.wallText('STAGE CLEAR', 3)
    }
    const standings = this.standings()
    this.result = {
      song,
      perf: this.perf,
      rank: rankFor(this.perf),
      accuracy: accuracy(this.perf),
      standings,
      place: placement(standings.map(s => s.score), this.perf.score),
      unranked: this.perf.unranked || tuning.unranked,
    }
    this.localT = this.songT
    this.endAt = performance.now() + (failed ? 1800 : 1400)
  }

  standings(): Standing[] {
    const list: Standing[] = [
      { name: 'YOU', score: this.perf.score, you: true, last: this.tags[0].last },
      ...this.rivals.map(r => ({ name: r.name, score: r.perf.score, you: false, last: r.last })),
    ]
    return list.sort((a, b) => b.score - a.score || (a.you ? -1 : b.you ? 1 : 0))
  }

  view(): View {
    const tl = this.tl
    const round = tl?.rounds[this.open ? this.ri : Math.max(0, this.ri - 1)]
    const t = this.songT
    let cursor = 0
    if (tl && round) cursor = (t - (round.target - TARGET_BEAT * tl.beat)) / tl.barSeconds
    const bar = tl ? tl.bars[Math.max(0, Math.min(tl.bars.length - 1, Math.floor(t / tl.barSeconds)))] : undefined
    const current = tl?.rounds[this.ri]
    return {
      song: this.song,
      round: this.open ? current : this.lastGrade ? round : undefined,
      open: this.open,
      progress: this.open ? this.progress : round?.arrows.length ?? 0,
      cursor,
      barSeconds: tl?.barSeconds ?? 1,
      songProgress: tl ? Math.max(0, Math.min(1, t / tl.duration)) : 0,
      elapsed: Math.max(0, t),
      duration: tl?.duration ?? 0,
      level: this.lastLevel || (bar?.level ?? 0),
      perf: this.perf,
      standings: this.standings(),
      hint: this.song?.noFail ? (this.open && current?.hint) || bar?.hint : undefined,
      lastGrade: this.lastGrade,
      spotlight: this.open && this.spotRounds.has(this.ri),
      freestyle: !!(this.open ? current : round)?.freestyle,
      playerX: this.tags[0].x,
      playerY: this.tags[0].y + 110,
    }
  }

  /** Screen-space name tags above each dancer (CSS pixels). */
  dancerTags(): Tag[] {
    const w = this.renderer.canvas.clientWidth
    const h = this.renderer.canvas.clientHeight
    const all = [this.player, ...this.rivals.map(r => r.dancer)]
    all.forEach((d, k) => {
      const tag = this.tags[k]
      d.headWorld(this.v)
      this.v.y += 0.42
      this.v.project(this.camera)
      tag.visible = this.v.z < 1 && Math.abs(this.v.x) < 1.1 && Math.abs(this.v.y) < 1.1
      tag.x = (this.v.x * 0.5 + 0.5) * w
      tag.y = (-this.v.y * 0.5 + 0.5) * h
      if (k > 0) {
        tag.last = this.rivals[k - 1].last
        tag.lastAt = this.rivals[k - 1].lastAt
      }
    })
    return this.tags
  }

  // ─── rendering ───────────────────────────────────────────────────────────

  render(_alpha: number, frameSeconds: number): void {
    const dt = Math.min(0.1, frameSeconds)
    if (this.mode === 'resuming') {
      const left = this.resumeAt - performance.now()
      const n = Math.ceil(left / 500)
      if (n < this.resumeShown && n > 0) {
        this.resumeShown = n
        this.hooks.countdown(String(n))
        this.audio.play('count')
      }
      if (left <= 0) {
        this.music.resume()
        this.mode = 'playing'
        this.input.rhythm = true
        this.input.clearHits()
      }
    }
    let t: number
    if (this.mode === 'ended') {
      this.localT += dt
      t = this.localT
      if (this.endAt && performance.now() >= this.endAt && this.result) {
        this.endAt = 0
        this.hooks.ended(this.result)
      }
    } else if (this.mode === 'playing' || this.mode === 'paused' || this.mode === 'resuming') {
      t = this.music.songTime()
      if (this.mode === 'playing') {
        this.songT = t
        const r = this.tl?.rounds[this.ri]
        this.feedback.schedule(t, r, !!r && this.open && this.progress >= r.arrows.length, this.beatAssist)
      }
    } else {
      t = this.music.active ? this.music.songTime() : (this.localT += dt)
    }
    const beat = t / this.beatLen
    const tl = this.tl
    let kind = 'lobby'
    let intensity = INTENSITY.lobby
    if (tl && this.mode !== 'attract') {
      const barIdx = Math.max(0, Math.min(tl.bars.length - 1, Math.floor(t / tl.barSeconds)))
      const info = tl.bars[barIdx]
      kind = this.mode === 'ended' ? 'outro' : info.kind
      intensity = INTENSITY[kind]
      if (kind === 'build') {
        const first = tl.bars.findIndex(b => b.section === info.section)
        intensity += ((barIdx - first) / this.song!.sections[info.section].bars) * 0.25
      }
    } else if (this.mode === 'attract') {
      const bar = Math.floor(beat / 4)
      if (bar !== this.attractMoveBar && bar % 2 === 1 && bar > 0) {
        this.attractMoveBar = bar
        this.player.react(['perfect', 'great', 'perfect', 'cool'][bar % 4] as Grade, bar * 4 + 0.02)
      }
    }
    const fever = this.perf.feverRounds > 0 && this.mode !== 'attract'
    if (this.feverOn && !fever) {
      this.feverOn = false
      this.feedback.fever(false)
    }
    const energy = 0.55 + intensity * 0.6 + (fever ? 0.2 : 0)
    const bpm = 60 / this.beatLen
    const grooving = this.music.active || this.mode === 'ended'
    this.player.shine = fever ? 0.4 : this.spotAmt * 0.25
    const mood = (this.mode === 'attract' ? 'lobby' : kind) as Mood
    this.player.mood = mood
    for (const r of this.rivals) r.dancer.mood = mood
    if (fever && this.mode === 'playing') this.crewRoutine(beat)
    this.player.update(beat, dt, energy, bpm, grooving)
    for (const r of this.rivals) r.dancer.update(beat, dt, energy * 0.9, bpm, grooving)
    this.flash = Math.max(0, this.flash - dt * 2.5)
    this.missFlash = Math.max(0, this.missFlash - dt * 2.5)
    const fsNow = this.mode === 'playing' && !!this.tl?.rounds[this.ri]?.freestyle
    const spotTarget = this.mode === 'playing' && ((this.open && this.spotRounds.has(this.ri)) || fsNow) ? 1 : 0
    this.spotAmt += (spotTarget - this.spotAmt) * (1 - Math.exp(-dt * 4))
    // Music spectrum → 16 log-spaced bands for the LED wall.
    const an = this.audio.analyser
    an.getByteFrequencyData(this.fft)
    for (let i = 0; i < 16; i++) {
      const lo = Math.floor(Math.pow(2, (i / 16) * 6.6))
      const hi = Math.max(lo + 1, Math.floor(Math.pow(2, ((i + 1) / 16) * 6.6)))
      let sum = 0
      for (let k = lo; k < hi && k < this.fft.length; k++) sum += this.fft[k]
      this.bands[i] = Math.min(1, sum / (hi - lo) / 200)
    }
    const lasers = (kind === 'drop' ? 0.7 : 0) + (fever ? 0.5 : 0) + (fsNow ? 0.6 : 0) + this.flash * 0.3
    this.stage.update(dt, { beat, intensity, fever, flash: this.flash, miss: this.missFlash, spotlight: this.spotAmt, lasers: Math.min(1, lasers), bands: this.bands }, this.reducedMotion)
    this.fx.embers(fever && !this.reducedMotion, [this.song?.palette.a ?? '#ff3fb8', this.song?.palette.c ?? '#ffd27a', '#ff7a3d'])
    if (performance.now() < this.trailUntil) {
      this.fx.trail(this.player.boneWorld('hand_l', this.v), this.trailColor)
      this.fx.trail(this.player.boneWorld('hand_r', this.v), this.trailColor)
    }
    this.fx.scale = this.reducedMotion ? 0.5 : 1
    this.fx.update(dt, beat)
    this.fx.setViewport(this.renderer.canvas.clientHeight || 720, this.camera.fov)
    this.updateCamera(dt, beat, t)
    this.renderer.render(this.stage.scene, this.camera)
  }

  private updateCamera(dt: number, beat: number, t: number): void {
    const c = CONFIG.camera
    const cam = this.camera
    const sway = this.reducedMotion ? 0 : c.sway
    let pos: THREE.Vector3
    let look: THREE.Vector3
    if (this.mode === 'attract') {
      const a = t * 0.12
      pos = this.v.set(Math.sin(a) * 7.5 + 1.8, 2.6 + Math.sin(t * 0.2) * 0.4 * sway, Math.cos(a) * 2 + 8.4)
      look = new THREE.Vector3(1.3, 1.25, 0)
    } else {
      const close = this.mode !== 'ended' && t < this.closeUntil && this.shot !== 5
      const eff = close ? 6 : this.shot
      // Hard cut into and out of the close-up; other shot changes glide.
      if (eff !== this.lastEffShot && (eff === 6 || this.lastEffShot === 6)) this.cutNow = true
      this.lastEffShot = eff
      if (eff === 6 || eff === 7) {
        const chest = this.player.boneWorld('spine_03', this.chestV)
        if (eff === 6) {
          // Knees-up close shot beside YOU with a slow push-in over the bar.
          const u = THREE.MathUtils.clamp(1 - (this.closeUntil - t) / Math.max(0.01, this.tl?.barSeconds ?? 2), 0, 1)
          const d = 2.35 - u * 0.35
          pos = this.v.set(chest.x + this.closeSide * 0.95, chest.y + 0.18, chest.z + d)
          look = this.lookV.set(chest.x, chest.y + 0.02, chest.z)
        } else {
          // Hero orbit: sweeps ±34° in front of YOU at 4.2 m, always centred on the chest.
          const a = Math.sin(t * 0.45) * 0.6 * (sway || 0.3)
          pos = this.v.set(chest.x + Math.sin(a) * 4.2, chest.y + 0.75, chest.z + Math.cos(a) * 4.2)
          look = this.lookV.set(chest.x, chest.y - 0.1, chest.z)
        }
      } else {
        const s = this.shots[eff]
        const scale = c.distance / 8.8
        pos = this.v.copy(s.pos)
        pos.z = s.look.z + (s.pos.z - s.look.z) * scale
        pos.x += Math.sin(t * 0.35) * 0.6 * sway
        pos.y += Math.sin(t * 0.27) * 0.2 * sway
        look = s.look
      }
    }
    const tracked = this.lastEffShot === 6 || this.lastEffShot === 7
    const k = this.cutNow ? 1 : 1 - Math.exp(-dt * (this.mode === 'attract' ? 1.2 : tracked ? 4.5 : 2.2))
    this.cutNow = false
    this.camPos.lerp(pos, k)
    this.camLook.lerp(look, k)
    cam.position.copy(this.camPos)
    if (this.shake > 0 && !this.reducedMotion) {
      cam.position.x += (Math.random() - 0.5) * this.shake * 0.12
      cam.position.y += (Math.random() - 0.5) * this.shake * 0.12
    }
    this.shake = Math.max(0, this.shake - dt * 2)
    cam.lookAt(this.camLook)
    const phase = ((beat % 1) + 1) % 1
    const punch = this.reducedMotion || this.mode !== 'playing' ? 0 : Math.pow(1 - phase, 4) * c.beatPunch * 1.4
    const fov = c.fov - punch
    if (Math.abs(cam.fov - fov) > 1e-3) {
      cam.fov = fov
      cam.updateProjectionMatrix()
    }
  }
}

function mulberry(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let x = a
    x = Math.imul(x ^ (x >>> 15), x | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

export type { HitAction }

function blobTexture(): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62)
  grad.addColorStop(0, 'rgba(255,255,255,0.9)')
  grad.addColorStop(0.5, 'rgba(255,255,255,0.45)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(c)
}
