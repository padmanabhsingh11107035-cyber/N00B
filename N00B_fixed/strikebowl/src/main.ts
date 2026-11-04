import './styles/main.css'
import { Audio } from './engine/audio'
import { I18n, resolveLocale } from './engine/i18n'
import { Input } from './engine/input'
import { GameLoop } from './engine/loop'
import { SAVE_KEY, SaveStore, type SaveData } from './engine/save'
import type { Game } from './game/game'
import type { Renderer as RendererT } from './engine/renderer'
import { Leaderboard, type SubmitResult } from './net/leaderboard'
import pinModelUrl from './assets/bowling-pin.glb?url'
import { readChallenge } from './ui/share'
import { Ui } from './ui/ui'
import { dailyLane, utcDay } from './game/daily'
import { Assets } from './engine/assets'

let bootLabels = { failed: 'Strike Bowl could not start.', retry: 'Retry' }

async function boot(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#game')!
  const firstRun = safeGet(SAVE_KEY) === null
  const save = new SaveStore()
  const i18n = new I18n(resolveLocale(save.data.locale, navigator.languages))
  bootLabels = { failed: i18n.t('boot.failed'), retry: i18n.t('boot.retry') }
  document.documentElement.lang = i18n.locale
  const input = new Input(canvas)
  const audio = new Audio()
  const board = new Leaderboard()
  const lane = dailyLane(utcDay())
  const challenge = readChallenge()
  let game: Game | undefined
  let renderer: RendererT | undefined
  let runId: Promise<string | null> | null = null
  let gameToken = 0

  // Day rollover for the personal "today" best.
  if (save.data.bestDay !== lane.day) save.update({ bestDay: lane.day, dayBest: 0 })
  if (!save.data.playerName) save.update({ playerName: `${i18n.t('name.auto')}${Math.floor(1000 + Math.random() * 9000)}` })

  const applySettings = (d: SaveData) => {
    audio.setVolumes(d.musicVolume, d.sfxVolume, d.muted)
    if (game) game.reducedMotion = d.reducedMotion
  }

  const startGame = () => {
    if (!game) return
    audio.unlock()
    audio.startMusic()
    gameToken += 1
    game.best = save.data.best
    game.target = challenge?.score ?? null
    game.start()
    ui.show('hud')
    loop.paused = false
    loop.resetAccumulator()
    // Ask the server clock to start timing this run; the game never waits on it.
    runId = board.startRun(save.data.playerName)
  }

  const pause = () => {
    if (!game || ui.screen !== 'hud') return
    loop.paused = true
    audio.setRoll(0)
    audio.setCharge(null)
    ui.show('pause')
  }
  const resume = () => {
    if (!game) return
    loop.paused = false
    loop.resetAccumulator()
    input.reset()
    ui.show('hud')
  }

  const ui = new Ui(i18n, save, audio, input, board, {
    play: startGame,
    restart: startGame,
    resume,
    pause,
    quit: () => {
      loop.paused = false
      game?.toTitle()
      ui.show('title')
    },
    settings: patch => {
      const qualityChanged = patch.quality !== undefined && patch.quality !== save.data.quality
      save.update(patch)
      applySettings(save.data)
      if (patch.locale) {
        i18n.set(patch.locale)
        document.documentElement.lang = patch.locale
      }
      if (qualityChanged) renderer?.applyQuality(save.data.quality)
    },
  })
  ui.day = lane.day
  ui.challenge = challenge
  ui.onNameChange = name => void board.rename(name)
  ui.show('boot')
  applySettings(save.data)

  let loaded = 0
  const track = <T>(p: Promise<T>): Promise<T> => p.then(v => (ui.setBootProgress(0.1 + (++loaded / 5) * 0.9), v))
  ui.setBootProgress(0.1)
  const assets = new Assets()
  const pinModelPromise = track(assets.gltf(pinModelUrl)
    .then(model => model.scene)
    .catch(error => {
      console.warn('Generated pin model unavailable; retaining the built-in pin visual.', error)
      return null
    }))
  const [{ Game: GameClass }, { Renderer, suggestQuality }, , pinModel] = await Promise.all([
    track(import('./game/game')),
    track(import('./engine/renderer')),
    track(import('./engine/physics').then(async physics => {
      await physics.initPhysics()
      return physics
    })),
    pinModelPromise,
    track(document.fonts.ready),
  ])
  if (firstRun) {
    save.update({ quality: suggestQuality() })
    ui.refreshSettings()
  }
  const r = new Renderer(canvas, save.data.quality)
  renderer = r
  const g = new GameClass(input, audio, ui, lane, r.shadowMapSize)
  game = g
  g.reducedMotion = save.data.reducedMotion
  g.best = save.data.best
  g.target = challenge?.score ?? null
  g.alley.bakeEnvironment(r.gl, g.scene)
  if (pinModel) g.setPinModel(pinModel)

  // Game over: save locally, then post to the server (never blocks the restart key).
  const showOver = ui.over.bind(ui)
  ui.over = summary => {
    const token = gameToken
    const newBest = summary.score > save.data.best
    save.update({
      best: Math.max(save.data.best, summary.score),
      dayBest: Math.max(save.data.dayBest, summary.score),
      bestDay: lane.day,
      games: save.data.games + 1,
      strikes: save.data.strikes + summary.strikes,
    })
    showOver({ ...summary, newBest })
    const pending = runId
    runId = null
    void (async () => {
      const id = pending ? await pending : null
      let result: SubmitResult
      if (!id) result = { accepted: false, error: 'offline' }
      else result = await board.submit(id, summary.score, summary.durationMs, summary.rolls)
      if (token === gameToken) ui.setSubmitResult(result)
    })()
  }

  const loop = new GameLoop({
    step: dt => g.step(dt),
    render: (alpha, frameSeconds) => {
      input.poll()
      ui.frame(frameSeconds)
      if (input.wasPressed('pause') && ui.screen === 'hud') pause()
      else if (input.wasPressed('pause') && ui.screen === 'pause') resume()
      if (input.wasPressed('restart') && ui.screen === 'hud') startGame()
      if (!loop.paused) g.frame(Math.min(frameSeconds, 0.1))
      g.sync(alpha)
      r.render(g.scene, g.director.camera)
      input.endStep()
    },
  })
  loop.start()
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause()
  })
  window.setTimeout(() => ui.show('title'), 200)
  // Debug/test hook: smoke tests drive and inspect the game through it.
  ;(window as unknown as { __sb: unknown }).__sb = { game: g, ui, input, save, board, loop }
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

boot().catch(err => {
  console.error(err)
  const el = document.getElementById('ui')
  if (el) {
    const detail = String((err as Error)?.message ?? err).replace(/[<>&]/g, '')
    el.innerHTML = `<div class="fatal"><div class="fatal-copy" role="alert"><h1>${bootLabels.failed}</h1><p>${detail}</p><button class="btn btn-primary" type="button" data-retry>${bootLabels.retry}</button></div></div>`
    el.querySelector<HTMLButtonElement>('[data-retry]')?.addEventListener('click', () => window.location.reload())
  }
})
