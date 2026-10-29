import './styles/main.css'
import { Audio } from './engine/audio'
import { Assets } from './engine/assets'
import { I18n, resolveLocale } from './engine/i18n'
import { Input } from './engine/input'
import { GameLoop } from './engine/loop'
import { SAVE_KEY, SaveStore, type SaveData } from './engine/save'
import { TimeScale } from './engine/timescale'
import type { Game } from './game/game'
import { TouchControls } from './ui/touch'
import { Ui } from './ui/ui'
import PROJECTILE_URL from './assets/stone-projectile.glb?url'

async function boot(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#game')!
  const firstRun = safeGet(SAVE_KEY) === null
  const save = new SaveStore()
  const i18n = new I18n(resolveLocale(save.data.locale, navigator.languages))
  document.documentElement.lang = i18n.locale
  i18n.onChange(l => (document.documentElement.lang = l))
  const input = new Input(canvas)
  const audio = new Audio()
  const timeScale = new TimeScale()
  const assets = new Assets()
  let game: Game | undefined

  const applySettings = (d: SaveData) => {
    input.sensitivity = d.sensitivity
    audio.setVolumes(d.musicVolume, d.sfxVolume, d.muted, d.masterVolume)
    if (game) {
      game.reducedMotion = d.reducedMotion
      game.slowmoEnabled = d.slowmo
      game.invertDrag = d.invertDrag
    }
  }

  const play = (level: number) => {
    if (!game) return
    audio.unlock()
    audio.startMusic()
    game.start(level, !save.data.tutorialDone)
    ui.show('hud')
    loop.resetAccumulator()
  }
  const pause = () => {
    if (!game || !game.playing) return
    game.pause()
    ui.show('pause')
  }
  const resume = () => {
    if (!game || !game.paused) return
    game.resume()
    ui.show('hud')
    loop.resetAccumulator()
  }

  const ui = new Ui(i18n, save, audio, input, {
    play,
    resume,
    pause,
    restart: () => {
      if (!game) return
      game.restart()
      ui.show('hud')
      loop.resetAccumulator()
    },
    quit: () => {
      game?.toTitle()
      timeScale.clear()
      ui.show('title')
    },
    previewLevel: i => game?.preview(i),
    survey: () => {
      input.setTouchButton('view', true)
      window.setTimeout(() => input.setTouchButton('view', false), 60)
    },
    settings: patch => {
      const qualityChanged = patch.quality !== undefined && patch.quality !== save.data.quality
      save.update(patch)
      applySettings(save.data)
      if (patch.locale && patch.locale !== i18n.locale) i18n.set(patch.locale)
      if (qualityChanged) game?.setQuality(save.data.quality)
    },
  })
  ui.show('boot')
  applySettings(save.data)

  // Boot: the UI is already on screen; three.js, Rapier (WASM) and the game load as a separate
  // chunk behind the progress bar.
  let loaded = 0
  const track = <T>(p: Promise<T>): Promise<T> => p.then(v => (ui.setBootProgress(0.1 + (++loaded / 5) * 0.85), v))
  ui.setBootProgress(0.1)
  const loadRequired = () => Promise.all([
    track(import('./game/game')),
    track(import('./engine/renderer')),
    track(import('./engine/physics')),
    track(document.fonts.ready),
    track(assets.gltf(PROJECTILE_URL)),
  ])
  let required: Awaited<ReturnType<typeof loadRequired>>
  try {
    required = await loadRequired()
  } catch (err) {
    console.error('Required Siegecraft content failed to load', err)
    ui.showBootFailure()
    return
  }
  const [{ Game }, { Renderer, suggestQuality }, physics, , projectile] = required
  await physics.initPhysics()
  if (firstRun) {
    save.update({ quality: suggestQuality() })
    ui.refreshSettings()
  }
  const renderer = new Renderer(canvas, save.data.quality)
  game = new Game(
    renderer,
    input,
    audio,
    timeScale,
    {
      popup: (text, x, y, kind) => ui.popup(text, x, y, kind),
      hint: h => ui.hint(h),
      banner: (key, vars) => ui.banner(key, vars),
      flash: s => ui.flash(s),
      tutorialDone: () => save.update({ tutorialDone: true }),
      t: (key, vars) => i18n.t(key, vars),
      end: (run, level, stars) => window.setTimeout(() => ui.showResults(run, level, stars), 300),
    },
    save.data.quality,
    projectile.scene,
  )
  applySettings(save.data)
  const g = game
  ui.setBootProgress(1)

  const loop = new GameLoop(
    {
      step: dt => g.step(dt),
      render: (alpha, frameSeconds, gameSeconds) => {
        input.update()
        // Keyboard Escape in menus is handled by the UI's "back"; here Escape/P/Start pause the
        // game, and Start (gamepad) also resumes from the pause menu.
        if (input.consume('pause')) {
          if (ui.screen === 'hud' && g.playing) pause()
          else if (ui.screen === 'pause' && input.method === 'gamepad') resume()
        }
        ui.frame(frameSeconds)
        if (ui.screen === 'hud') g.frame(frameSeconds)
        loop.paused = g.paused
        g.render(alpha, frameSeconds, g.paused ? 0 : gameSeconds)
        if (ui.screen === 'hud') ui.updateHud(g.hud, g.level.id)
        input.endFrame()
      },
    },
    60,
    timeScale,
  )
  loop.start()
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause()
  })
  window.addEventListener('resize', () => renderer.resize())
  new TouchControls(document.getElementById('ui')!, input, () => ui.screen === 'hud' && !g.paused, () => i18n.t('hud.fire'))
  window.setTimeout(() => {
    ui.show('title')
    document.body.classList.add('ready')
  }, 350)
  // First interaction anywhere unlocks audio and starts the ambient score.
  const unlock = () => {
    audio.unlock()
    audio.startMusic()
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('keydown', unlock)
  }
  window.addEventListener('pointerdown', unlock)
  window.addEventListener('keydown', unlock)
  // Opened on its own on a phone or tablet: the first touch asks for full screen held sideways (inside NOOB the Games page does this for the frame it shows the game in).
  window.addEventListener(
    'pointerdown',
    () => {
      if (window.self !== window.top || !window.matchMedia('(pointer: coarse)').matches || document.fullscreenElement) return
      const lock = (screen.orientation as unknown as { lock?: (o: string) => Promise<void> } | undefined)?.lock
      document.documentElement
        .requestFullscreen?.()
        .then(() => lock?.call(screen.orientation, 'landscape'))
        .catch(() => undefined)
    },
    { once: true },
  )
  // Debug/test hook: tests drive and inspect the game through it.
  ;(window as unknown as { __game: unknown }).__game = { game: g, ui, input, save, loop }
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
