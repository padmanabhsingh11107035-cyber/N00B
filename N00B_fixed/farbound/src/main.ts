import './styles/main.css'
import { Audio } from './engine/audio'
import { Input } from './engine/input'
import { GameLoop } from './engine/loop'
import { SAVE_KEY, SaveStore, type SaveData } from './engine/save'
import { Renderer } from './engine/renderer'
import { FarboundGame } from './farbound/game'
import { FarboundUI } from './farbound/ui'
import { TouchControls } from './ui/touch'
import { I18n } from './engine/i18n'

async function boot(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#game')!
  const root = document.getElementById('ui')!
  const firstRun = safeGet(SAVE_KEY) === null
  const save = new SaveStore()
  if (firstRun) save.update({ quality: 'low' })
  // This remix is English-only: deliberately ignore browser/OS language and any previous locale.
  const i18n = new I18n('en')
  if (save.data.locale !== 'en') save.update({ locale: 'en' })
  const input = new Input(canvas)
  const audio = new Audio()
  const renderer = new Renderer(canvas, save.data.quality)
  let game: FarboundGame | undefined
  let loop: GameLoop | undefined

  const applySettings = (patch: Partial<SaveData>) => {
    const qualityChanged = patch.quality !== undefined && patch.quality !== save.data.quality
    save.update(patch)
    input.sensitivity = save.data.sensitivity
    input.invertY = save.data.invertY
    audio.setVolumes(save.data.musicVolume, save.data.sfxVolume, save.data.muted)
    if (game) game.reducedMotion = save.data.reducedMotion
    if (qualityChanged) renderer.applyQuality(save.data.quality)
  }

  const ui = new FarboundUI(save, {
    play: () => {
      audio.unlock()
      audio.startMusic()
      audio.setVolumes(save.data.musicVolume, save.data.sfxVolume, save.data.muted)
      game?.start()
      ui.show('play')
      loop?.resetAccumulator()
    },
    pause: () => {
      game?.pause()
      ui.show('pause')
      input.unlockPointer()
    },
    resume: () => {
      audio.unlock()
      game?.resume()
      ui.show('play')
      loop?.resetAccumulator()
    },
    quit: () => {
      game?.toTitle()
      ui.show('title')
      input.unlockPointer()
    },
    advance: () => game?.advanceDialogue(),
    settings: applySettings,
  }, input)
  applySettings({})

  game = new FarboundGame(renderer, input, audio, save, {
    onDialogue: (speaker, text) => { ui.showDialogue(speaker, text); input.unlockPointer() },
    onDialogueEnd: () => ui.closeDialogue(),
    onFocus: text => ui.setPrompt(text),
    onProgress: (found, total) => ui.updateProgress(found, total),
    onMode: mode => {
      if (mode === 'paused') { ui.show('pause'); input.unlockPointer() }
      if (mode === 'playing' && ui.screen !== 'play') ui.show('play')
      if (mode === 'title') ui.show('title')
    },
  })
  game.reducedMotion = save.data.reducedMotion
  input.sensitivity = save.data.sensitivity
  input.invertY = save.data.invertY

  loop = new GameLoop({
    beforeFrame: frameSeconds => input.update(frameSeconds),
    step: dt => game?.step(dt),
    render: (alpha, frameSeconds) => {
      if (game?.mode === 'paused' && (input.consume('pause') || input.consume('back'))) {
        game.resume(); ui.show('play'); loop?.resetAccumulator()
      }
      if (game) {
        loop!.paused = game.mode === 'paused'
        game.render(alpha, frameSeconds)
      }
      input.endFrame()
    },
  })
  loop.start()

  document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement && game?.mode === 'playing' && !game.talking && input.method === 'keyboard') {
      game.pause()
      ui.show('pause')
    }
  })
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game?.mode === 'playing') {
      game.pause()
      ui.show('pause')
      input.unlockPointer()
    }
  })
  canvas.addEventListener('click', () => {
    if (game?.mode === 'playing' && input.method === 'keyboard') input.lockPointer()
  })
  new TouchControls(root, input, () => game?.mode === 'playing')
  window.addEventListener('beforeunload', () => { input.dispose(); audio.stopMusic() })
  // Debug/test hook: gameplay is inspectable without exposing any online service.
  ;(window as unknown as { __game: unknown }).__game = { game, ui, input, save, i18n }
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  document.getElementById('loading-screen')?.classList.add('is-hidden')
}

boot().catch(error => {
  console.error(error)
  const loader = document.getElementById('loading-screen')
  const status = loader?.querySelector<HTMLElement>('[data-loading-status]')
  if (status) status.textContent = 'The hill did not wake up. Please try again.'
  loader?.classList.add('is-error')
  const retry = loader?.querySelector<HTMLButtonElement>('[data-retry]')
  if (retry) {
    retry.hidden = false
    retry.addEventListener('click', () => window.location.reload(), { once: true })
  }
  const root = document.getElementById('ui')
  if (!loader && root) root.textContent = 'The hill did not wake up. Please reload and try again.'
})

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
