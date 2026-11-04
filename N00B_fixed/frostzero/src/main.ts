import './styles/main.css'
import { Audio } from './engine/audio'
import { I18n, resolveLocale } from './engine/i18n'
import { Input } from './engine/input'
import { GameLoop } from './engine/loop'
import { isNewBest, SAVE_KEY, SaveStore, type SaveData } from './engine/save'
import type { Game } from './game/game'
import { betterRank } from './game/rules'
import { TouchControls } from './ui/touch'
import { Ui } from './ui/ui'

async function boot(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#game')!
  const firstRun = safeGet(SAVE_KEY) === null
  const save = new SaveStore()
  const i18n = new I18n(resolveLocale(save.data.locale, navigator.languages))
  const input = new Input(canvas)
  const audio = new Audio()
  let game: Game | undefined

  const applySettings = (d: SaveData) => {
    audio.setVolumes(d.musicVolume, d.sfxVolume, d.muted)
    if (game) game.motionReduced = d.reducedMotion
  }

  const startRun = () => {
    if (!game) return
    audio.unlock()
    audio.startMusic()
    save.update({ attempts: save.data.attempts + 1 })
    game.start()
    ui.show('hud')
    loop.resetAccumulator()
  }
  const pause = () => {
    if (game?.mode !== 'playing' && game?.mode !== 'dying') return
    game.pause()
    ui.show('pause')
  }
  const resume = () => {
    if (game?.mode !== 'paused') return
    game.resume()
    ui.show('hud')
    loop.resetAccumulator()
  }

  const ui = new Ui(i18n, save, audio, input, {
    play: startRun,
    restart: startRun,
    resume,
    retry: () => {
      if (!game) return
      game.resume()
      game.retryCheckpoint()
      ui.show('hud')
      loop.resetAccumulator()
    },
    quit: () => {
      game?.toTitle()
      ui.show('title')
    },
    settings: patch => {
      const qualityChanged = patch.quality !== undefined && patch.quality !== save.data.quality
      save.update(patch)
      applySettings(save.data)
      if (patch.locale) i18n.set(patch.locale)
      if (qualityChanged) game?.setQuality(save.data.quality)
    },
  })
  ui.show('boot')
  applySettings(save.data)

  let loaded = 0
  const track = <T>(p: Promise<T>): Promise<T> => p.then(v => (ui.setBootProgress(0.1 + (++loaded / 3) * 0.9), v))
  ui.setBootProgress(0.1)
  const [{ Game }, { Renderer, suggestQuality }] = await Promise.all([track(import('./game/game')), track(import('./engine/renderer')), track(document.fonts.ready)])
  if (firstRun) {
    save.update({ quality: suggestQuality() })
    ui.refreshSettings()
  }
  const renderer = new Renderer(canvas, save.data.quality)
  game = new Game(renderer, input, audio, {
    death: (cause, run) => {
      save.update({ totalDeaths: save.data.totalDeaths + 1 })
      ui.death(cause)
      void run
    },
    checkpoint: (n, total) => ui.checkpoint(n, total),
    section: (key, hint) => ui.section(key, hint),
    perfect: () => ui.toast(i18n.t('hud.perfect'), 'perfect'),
    boost: () => ui.toast(i18n.t('hud.boost'), 'boost'),
    respawned: () => undefined,
    finish: run => {
      if (run.unranked) {
        window.setTimeout(() => ui.showResults(run, false), 1500)
        return
      }
      const d = save.data
      const newBest = isNewBest(d, run.elapsed)
      save.update({
        clears: d.clears + 1,
        bestTime: newBest ? run.elapsed : d.bestTime,
        bestDeaths: newBest ? run.deaths : d.bestDeaths,
        bestRank: run.rank && betterRank(d.bestRank, run.rank) ? run.rank : d.bestRank,
      })
      window.setTimeout(() => ui.showResults(run, newBest), 1500)
    },
  })
  game.motionReduced = save.data.reducedMotion
  const g = game

  const loop = new GameLoop({
    step: dt => g.step(dt),
    render: (alpha, frameSeconds) => {
      input.update()
      if (input.consume('pause')) {
        if (g.mode === 'playing' || g.mode === 'dying') pause()
        else if (g.mode === 'paused' && ui.screen === 'pause') resume()
      }
      ui.frame(frameSeconds)
      loop.paused = g.mode === 'paused'
      g.render(alpha, frameSeconds)
      if (g.mode !== 'attract') ui.updateHud(g.hud())
      // Presses must survive frames in which no fixed step ran (high-refresh displays).
      if (g.takeStepped() || g.mode !== 'playing') input.endFrame()
    },
  })
  loop.start()

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause()
  })
  window.addEventListener('game:pause', pause)
  new TouchControls(document.getElementById('ui')!, input)
  window.setTimeout(() => ui.show('title'), 250)
  // Any first gesture on the title unlocks audio so the title music can play.
  const unlock = () => {
    audio.unlock()
    audio.startMusic()
  }
  window.addEventListener('pointerdown', unlock, { once: true })
  window.addEventListener('keydown', unlock, { once: true })

  // Debug/test hook (read-only use): smoke tests inspect run state through it.
  ;(window as unknown as { __game: unknown }).__game = { game: g, ui, input, save }
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
  if (el) el.innerHTML = `<div class="fatal">Failed to start: ${String((err as Error)?.message ?? err).replace(/[<>&]/g, '')}</div>`
})
