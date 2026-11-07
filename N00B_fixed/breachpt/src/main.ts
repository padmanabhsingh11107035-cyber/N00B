import './styles/main.css'
import { TouchControls } from './ui/touch'
import { createLeaderboardClient, type RunTicket } from '../leaderboard.js'
import { Audio } from './engine/audio'
import { AdaptiveResolution } from './engine/adaptive-resolution'
import { assetUrl } from './engine/asset-paths'
import { I18n } from './engine/i18n'
import { Input } from './engine/input'
import { GameLoop } from './engine/loop'
import { SAVE_KEY, SaveStore, type SaveData } from './engine/save'
import type { Game, GameMode, RunSummary } from './game/game'
import { tuning } from './game/tuning'
import { Ui } from './ui/ui'

type ActiveRankedRun = {
  mode: GameMode
  ticket: RunTicket | null
  summary: RunSummary | null
  issuing: boolean
  submitting: boolean
  error: string | null
}

/**
 * Boot flow (staged streaming):
 *  1. The new Breachpoint Zero loading screen shows immediately.
 *  2. Code, Rapier WASM, the arena library and Stage 1 load in parallel.
 *  3. The title screen appears; remaining combat assets stream in the background.
 */
async function boot(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#game')!
  document.documentElement.style.setProperty('--title-art-url', `url("${assetUrl('assets/ui/breachpoint-zero-title.webp')}")`)
  const firstRun = safeGet(SAVE_KEY) === null
  const save = new SaveStore()
  const adaptiveResolution = new AdaptiveResolution(save.data.quality)
  const i18n = new I18n()
  const input = new Input(canvas)
  const audio = new Audio()
  const onlineBoard = createLeaderboardClient({
    identity: 'guest',
    boardId: 'onslaught-score-v1',
    rulesVersion: 'v1',
  })
  const operatorName = guestCallsign(save.data.playerName)
  let game: Game | undefined
  let ui!: Ui
  let activeRankedRun: ActiveRankedRun | null = null
  let lockLostAt = 0

  const refreshOnlineBoard = async (): Promise<void> => {
    if (import.meta.env.DEV) {
      ui.setOnlineBoard([], 'CHECKPOINT PREVIEW REQUIRED')
      return
    }
    ui.setOnlineBoard([], 'LOADING SCORES')
    const result = await onlineBoard.list(5)
    if (!result.ok) {
      ui.setOnlineBoard([], `UNAVAILABLE · ${result.error}`)
      return
    }
    ui.setOnlineBoard(result.value.entries, result.value.entries.length ? 'THIS DEVICE' : 'NO SCORES YET')
  }

  const submitOnlineScore = async (run: ActiveRankedRun, retry = false): Promise<void> => {
    if (!run.ticket || !run.summary || run.submitting) return
    run.submitting = true
    ui.setOnlineRunStatus(retry ? 'RETRYING THE SAME SCORE…' : 'SUBMITTING CASUAL ONSLAUGHT SCORE…')
    const result = retry
      ? await onlineBoard.retryRun(run.ticket)
      : await onlineBoard.submitRun(run.ticket, Math.round(run.summary.score), Math.round(run.summary.time * 1000))
    run.submitting = false
    if (!result.ok) {
      run.error = result.error
      ui.setOnlineRunStatus(`SUBMISSION FAILED · ${result.error}`, true)
      return
    }
    run.error = null
    const refreshed = result.value.leaderboard
    if (refreshed.ok) {
      ui.setOnlineBoard(refreshed.value.entries, refreshed.value.entries.length ? 'CASUAL · CLIENT-REPORTED' : 'NO SCORES YET')
      ui.setOnlineRunStatus('SCORE ACCEPTED · CLIENT-REPORTED CASUAL BOARD')
    } else {
      run.error = refreshed.error
      ui.setOnlineRunStatus(`SCORE ACCEPTED · BOARD REFRESH FAILED · ${refreshed.error}`, true)
    }
  }

  const issueOnlineTicket = async (run: ActiveRankedRun): Promise<void> => {
    if (run.mode !== 'onslaught' || tuning.unranked || import.meta.env.DEV) return
    run.issuing = true
    const guest = await onlineBoard.ensureGuest(operatorName)
    if (!guest.ok) {
      run.issuing = false
      run.error = guest.error
      if (run.summary) ui.setOnlineRunStatus(`GUEST SESSION FAILED · ${guest.error}`)
      return
    }
    const ticket = await onlineBoard.beginRun()
    run.issuing = false
    if (!ticket.ok) {
      run.error = ticket.error
      if (run.summary) ui.setOnlineRunStatus(`ONLINE RUN TICKET FAILED · ${ticket.error}`)
      return
    }
    run.ticket = ticket.value
    run.error = null
    if (run.summary) void submitOnlineScore(run)
  }

  const settleOnlineScore = (summary?: RunSummary): void => {
    if (!summary || summary.mode !== 'onslaught') {
      ui.setOnlineRunStatus('DEATHMATCH SCORES STAY LOCAL · THE BOARD IS ONSLAUGHT ONLY')
      return
    }
    const run = activeRankedRun
    if (!run || run.mode !== 'onslaught') {
      ui.setOnlineRunStatus('ONLINE RUN STATE UNAVAILABLE · LOCAL SCORE RETAINED')
      return
    }
    run.summary = summary
    if (summary.unranked || tuning.unranked) {
      ui.setOnlineRunStatus('UNRANKED TUNED RUN · ONLINE SUBMISSION SKIPPED')
      return
    }
    if (import.meta.env.DEV) {
      ui.setOnlineRunStatus('ONLINE SUBMISSION IS AVAILABLE IN THE SAVED CHECKPOINT PREVIEW')
      return
    }
    if (run.ticket) {
      void submitOnlineScore(run)
    } else if (run.issuing) {
      ui.setOnlineRunStatus('ISSUING GUEST RUN TICKET…')
    } else {
      ui.setOnlineRunStatus(`ONLINE TICKET UNAVAILABLE · ${run.error ?? 'START A NEW RUN TO RETRY'}`)
    }
  }

  const retryOnlineScore = async (): Promise<void> => {
    const run = activeRankedRun
    if (!run?.ticket || !run.summary) return
    await submitOnlineScore(run, true)
  }

  const applySettings = (d: SaveData) => {
    input.sensitivity = d.sensitivity
    input.invertY = d.invertY
    audio.setVolumes(d.musicVolume, d.sfxVolume, d.muted)
    if (game) {
      game.reducedMotion = d.reducedMotion
      game.fovSetting = d.fov
      game.aimAssistEnabled = d.aimAssistEnabled
    }
  }
  const startMatch = (mode?: GameMode) => {
    if (!game) return
    audio.unlock()
    audio.retryMusic()
    ui.resetHud()
    const nextMode = mode ?? game.gameMode
    game.start(nextMode)
    const run: ActiveRankedRun = { mode: nextMode, ticket: null, summary: null, issuing: false, submitting: false, error: null }
    activeRankedRun = run
    if (nextMode === 'onslaught') {
      if (tuning.unranked) ui.setOnlineRunStatus('TUNED RUN · ONLINE SUBMISSION DISABLED')
      else if (import.meta.env.DEV) ui.setOnlineRunStatus('ONLINE SCORES AVAILABLE IN THE SAVED CHECKPOINT PREVIEW')
      else {
        ui.setOnlineRunStatus('ISSUING GUEST RUN TICKET…')
        void issueOnlineTicket(run)
      }
    } else {
      ui.setOnlineRunStatus('DEATHMATCH IS OFFLINE · SCORE KEPT LOCALLY')
    }
    ui.show('hud')
    loop.resetAccumulator()
    input.lockPointer()
  }
  const pause = () => {
    if (game?.mode !== 'playing' && game?.mode !== 'countdown') return
    if (game.choosingPerk) return
    game.pause()
    ui.show('pause')
    input.unlockPointer()
  }
  const resume = () => {
    if (game?.mode !== 'paused') return
    game.resume()
    ui.show('hud')
    loop.resetAccumulator()
    if (!game.choosingPerk) input.lockPointer()
  }
  const pickPerk = (i: number) => {
    if (!game?.choosingPerk) return
    game.choosePerk(i)
    if (game.mode === 'playing') input.lockPointer()
  }
  ui = new Ui(i18n, save, audio, {
    play: mode => startMatch(mode),
    restart: () => startMatch(),
    resume,
    quit: () => {
      game?.toTitle()
      ui.resetHud()
      ui.show('title')
      input.unlockPointer()
      void refreshOnlineBoard()
    },
    settings: patch => {
      const qualityChanged = patch.quality !== undefined && patch.quality !== save.data.quality
      save.update(patch)
      applySettings(save.data)
      if (qualityChanged && game) {
        adaptiveResolution.setQuality(save.data.quality)
        game.renderer.applyQuality(save.data.quality)
        game.setQuality()
      }
    },
    pickPerk,
    refreshLeaderboard: () => { void refreshOnlineBoard() },
    retryLeaderboard: () => { void retryOnlineScore() },
  })
  ui.setOperatorName(operatorName)
  ui.setOnlineBoard([], import.meta.env.DEV ? 'CHECKPOINT PREVIEW REQUIRED' : 'LOADING GLOBAL SCORES')
  document.title = 'Breachpoint Zero'
  ui.show('boot')
  applySettings(save.data)
  // Keep the spark layer and loading tips alive while the heavy modules download.
  let bootRaf = 0
  let bootLast = performance.now()
  const bootTick = (now: number) => {
    ui.tick(Math.min(0.05, (now - bootLast) / 1000))
    bootLast = now
    bootRaf = requestAnimationFrame(bootTick)
  }
  bootRaf = requestAnimationFrame(bootTick)

  const parts = { code: 0, library: 0, stage: 0 }
  const progress = (label?: string) => ui.setBootProgress(0.04 + parts.code * 0.16 + parts.library * 0.5 + parts.stage * 0.3, label)
  progress('STABILISING BREACH')
  const [{ Game }, { Renderer, suggestQuality }, physics, { Assets }, { loadLibrary }, { StageLoader }] = await Promise.all([
    import('./game/game'),
    import('./engine/renderer'),
    import('./engine/physics'),
    import('./engine/assets'),
    import('./game/library'),
    import('./game/stages'),
    document.fonts.ready,
  ])
  await physics.initPhysics()
  parts.code = 1
  progress('BUILDING ARENA')
  if (firstRun) {
    save.update({ quality: suggestQuality() })
    ui.refreshSettings()
  }
      const renderer = new Renderer(canvas, save.data.quality)
  renderer.setAdaptivePixelRatio(adaptiveResolution.ratio)
  const assets = new Assets()
  const aniso = renderer.gl.capabilities.getMaxAnisotropy()
  const loader = new StageLoader(assets, audio, aniso)
  const [lib] = await Promise.all([
    loadLibrary(assets, aniso, p => {
      parts.library = p
      progress()
    }),
    loader.boot(p => {
      parts.stage = p
      progress(p < 1 ? 'ARMING WAVE 1' : undefined)
    }),
  ])
  progress('CALIBRATING OPTICS')
  game = new Game(renderer, input, audio, lib, loader.staged, loader, {
    ...ui.events,
    perks: offer => {
      ui.events.perks(offer)
      // Free the cursor so the perk cards can be clicked; re-lock after the pick.
      if (offer) input.unlockPointer()
    },
    perkChosen: i => ui.perkChosen(i),
    ended: (match, summary) => {
      input.unlockPointer()
      ui.showResults(match, game!.standings(), summary)
      settleOnlineScore(summary)
    },
  })
  applySettings(save.data)
  // Warm up shaders for every material present so the first explosion does not hitch.
  renderer.gl.compile(game.scene, game.camera)

  // Background streaming waits while the fight is heavy (enemy/VFX counts or slow frames).
  let frameAvg = 16
  loader.isBusy = () => game!.isBusy() || frameAvg > 21 || document.hidden
  const loop = new GameLoop({
    step: dt => game!.step(dt),
    render: (alpha, frameSeconds) => {
      frameAvg += (Math.min(0.1, frameSeconds) * 1000 - frameAvg) * 0.05
      if (game!.mode === 'playing' && !document.hidden) {
        const ratio = adaptiveResolution.observe(frameSeconds)
        if (ratio !== undefined) renderer.setAdaptivePixelRatio(ratio)
      }
      // Real frame time drives the VFX budget (bulk emitters shed particles when frames run long).
      game!.fx.frameTime(frameSeconds * 1000)
      input.update()
      touchUi?.frame()
      if (input.consume('pause') && performance.now() - lockLostAt > 300) {
        if (game!.mode === 'playing' || game!.mode === 'countdown') pause()
        else if (game!.mode === 'paused' && ui.screen === 'pause') resume()
      }
      // Keyboard perk selection (1–3) while the perk cards are up.
      if (game!.choosingPerk) {
        if (input.consume('slot1')) pickPerk(0)
        if (input.consume('slot2')) pickPerk(1)
        if (input.consume('slot3')) pickPerk(2)
      }
      game!.render(alpha, frameSeconds)
      ui.tick(frameSeconds)
      if (game!.mode === 'playing' || game!.mode === 'countdown' || game!.mode === 'ended' || game!.mode === 'paused') {
        const pxPerRad = window.innerHeight / 2 / Math.tan((game!.camera.fov * Math.PI) / 360)
        ui.updateHud(game!.hud(), game!.standings(), input.held('scoreboard'), pxPerRad, frameSeconds)
      }
    },
  })
  cancelAnimationFrame(bootRaf)
  ui.setBootProgress(1, 'READY')
  loop.start()
  document.addEventListener('pointerlockchange', () => {
    // Browsers release pointer lock on Escape without delivering the key: treat that as pause.
    if (!document.pointerLockElement && (game!.mode === 'playing' || game!.mode === 'countdown') && input.method === 'keyboard' && !game!.choosingPerk) {
      lockLostAt = performance.now()
      pause()
    }
  })
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause()
  })
  window.addEventListener('game:pause', pause)
  // a phone or tablet: the on-screen controls (stick, look, fire, scope, reload ...)
  const touchUi = window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window
    ? new TouchControls(document.getElementById('ui')!, input, () => (game!.mode === 'playing' || game!.mode === 'countdown') && !game!.choosingPerk)
    : null
  canvas.addEventListener('click', () => {
    if ((game!.mode === 'playing' || game!.mode === 'countdown') && !game!.choosingPerk) input.lockPointer()
  })
  // First gesture unlocks audio and (re)starts music blocked by the autoplay policy.
  const gesture = () => {
    audio.unlock()
    audio.retryMusic()
  }
  window.addEventListener('pointerdown', gesture)
  window.addEventListener('keydown', gesture)
  window.setTimeout(() => {
    ui.show('title')
    document.getElementById('boot-ph')?.remove()
    audio.playMusic('title', 1.5)
    void refreshOnlineBoard()
    // Background streaming starts once the title is up.
    window.setTimeout(() => loader.startBackground(), 600)
  }, 250)
  // Debug/test hook (read-only use): smoke tests inspect match state through it.
  ;(window as unknown as { __game: unknown }).__game = { game, ui, input, save, loader, audio }
}

function guestCallsign(savedName: string): string {
  const trimmed = savedName.trim()
  if (trimmed && trimmed.toUpperCase() !== 'PLAYER') return trimmed.slice(0, 48)
  const key = 'breachpoint-zero.operator.v1'
  try {
    const current = localStorage.getItem(key)
    if (current) return current
    const bytes = new Uint8Array(3)
    crypto.getRandomValues(bytes)
    const alias = `OP-${Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('').toUpperCase()}`
    localStorage.setItem(key, alias)
    return alias
  } catch {
    return `OP-${Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, '0')}`
  }
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function showBootFailure(error: unknown): void {
  console.error(error)
  const root = document.getElementById('ui')
  if (!root) return
  const screen = document.createElement('div')
  screen.className = 'fatal'
  const emblem = document.createElement('img')
  emblem.src = assetUrl('assets/share/favicon.png')
  emblem.alt = ''
  const title = document.createElement('h1')
  title.textContent = 'BREACHPOINT ZERO'
  const message = document.createElement('p')
  const detail = error instanceof Error ? error.message : String(error)
  message.textContent = `Failed to start: ${detail}`
  const retry = document.createElement('button')
  retry.type = 'button'
  retry.textContent = 'RETRY'
  retry.addEventListener('click', () => window.location.reload())
  screen.append(emblem, title, message, retry)
  root.replaceChildren(screen)
}

boot().catch(showBootFailure)
