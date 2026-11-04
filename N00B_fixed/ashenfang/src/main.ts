import './styles/main.css'
import './styles/hud.css'
import { Assets } from './engine/assets'
import { AudioEngine } from './engine/audio'
import { applyStrings, t } from './engine/i18n'
import { Input } from './engine/input'
import { GameLoop } from './engine/loop'
import { Renderer, suggestQuality } from './engine/renderer'
import { SaveStore } from './engine/save'
import { Game } from './game/game'
import { setEnvSource } from './game/envAssets'
import { setHunterSource } from './game/hunterModel'
import { MANIFEST, MUSIC, STAGE_ORDER, stageBundle, type MonsterId } from './game/manifest'
import { setMonsterTextureSource } from './game/monsters/rig'
import { setMonsterModelSource } from './game/monsters/meshRig'
import { TouchControls } from './ui/touch'
import { Ui } from './ui/ui'

function safeStorage(): Storage | null {
  try {
    const s = window.localStorage
    s.getItem('probe')
    return s
  } catch {
    return null
  }
}

function showBootFailure(message: string): void {
  const boot = document.querySelector<HTMLElement>('#boot')
  if (!boot) return
  const status = boot.querySelector<HTMLElement>('.boot-text')
  if (status) status.textContent = message
  const tip = boot.querySelector<HTMLElement>('.boot-tip')
  if (tip) tip.hidden = true
  const retry = boot.querySelector<HTMLButtonElement>('.boot-retry')
  if (retry) retry.hidden = false
  boot.classList.remove('done')
}

let envHdr: import('three').DataTexture | null = null

async function boot(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#game')!
  const root = document.querySelector<HTMLElement>('#ui')!
  const bootEl = document.querySelector<HTMLElement>('#boot')
  applyStrings(document)
  bootEl?.querySelector<HTMLButtonElement>('.boot-retry')?.addEventListener('click', () => window.location.reload())
  const save = new SaveStore(safeStorage(), suggestQuality())
  const input = new Input(canvas)
  const audio = new AudioEngine()
  const applyAudio = () => audio.setVolumes(save.settings.music, save.settings.sfx, save.settings.muted)
  applyAudio()
  let renderer: Renderer
  try {
    renderer = new Renderer(canvas, save.settings.quality)
  } catch (err) {
    console.error(err)
    showBootFailure(t('boot.error'))
    return
  }
  // Boot bundle: only what the title screen and the first hunt need.
  const assets = new Assets(MANIFEST, import.meta.env.BASE_URL)
  // Decode sounds before the first user gesture: AudioBuffers are portable across contexts.
  const Offline = window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext
  if (Offline) {
    const decoder = new Offline(2, 44100, 44100)
    assets.decodeAudio = data => decoder.decodeAudioData(data)
  }
  audio.buffers = name => assets.buffer(`sfx.${name}`)
  audio.setMusic({ explore: MUSIC.explore, battle: MUSIC.battle, enraged: MUSIC.enraged, victory: MUSIC.victory })
  const bar = bootEl?.querySelector<HTMLElement>('.boot-fill')
  const pct = bootEl?.querySelector<HTMLElement>('.boot-pct')
  const progress = bootEl?.querySelector<HTMLElement>('.boot-bar')
  const setBoot = (p: number) => {
    if (bar) bar.style.transform = `scaleX(${p.toFixed(3)})`
    if (pct) pct.textContent = `${Math.round(p * 100)}%`
    progress?.setAttribute('aria-valuenow', String(Math.round(p * 100)))
  }
  // Downloads fill the first 85% (byte-weighted); building the valley fills the rest.
  assets.onProgress(name => {
    if (name === 'boot') setBoot(assets.progressOf(['boot']) * 0.85)
  })
  const tipEl = bootEl?.querySelector<HTMLElement>('.boot-tip')
  const TIPS = ['boot.tip1', 'boot.tip2', 'boot.tip3', 'boot.tip4', 'boot.tip5']
  let tipI = 0
  const tipTimer = window.setInterval(() => {
    tipI = (tipI + 1) % TIPS.length
    if (tipEl) tipEl.textContent = t(TIPS[tipI])
  }, 3200)
  if (tipEl) tipEl.textContent = t(TIPS[0])
  performance.mark('boot:start')
  try {
    await assets.bundle('boot')
    // The first stage is whichever quarry the player last chose (Mossback ships in boot).
    const firstQuarry = save.data.quarry as MonsterId
    if (STAGE_ORDER.includes(firstQuarry) && firstQuarry !== 'mossback') await assets.bundle(stageBundle(firstQuarry), 'current')
  } catch (err) {
    console.error('required hunt assets failed', err)
    window.clearInterval(tipTimer)
    showBootFailure(t('boot.assetError'))
    return
  }
  performance.mark('boot:assets')
  const statusEl = bootEl?.querySelector<HTMLElement>('.boot-text')
  if (statusEl) statusEl.textContent = t('boot.building')
  setBoot(0.92)
  await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)))
  setHunterSource({ gltf: k => assets.maybeGltf(k), texture: k => assets.texture(k) })
  setMonsterTextureSource(k => assets.texture(k))
  setMonsterModelSource(k => assets.maybeGltf(k))
  setEnvSource({ texture: k => assets.texture(k), gltf: k => assets.maybeGltf(k) })
  envHdr = assets.hdr('env.hdr') ?? null
  // Let the loading screen paint before the heavy procedural build.
  await new Promise(r => requestAnimationFrame(() => setTimeout(r, 30)))

  let game: Game | undefined
  const ui = new Ui(root, save, audio, input, {
    start: () => {
      if (!game) return
      audio.unlock()
      game.startHunt()
      loop.resetAccumulator()
    },
    resume: () => {
      game?.resume()
      loop.resetAccumulator()
    },
    abandon: () => game?.toTitle(),
    quarry: id => void switchQuarry(id),
    settings: patch => {
      const prevQuality = save.settings.quality
      save.updateSettings(patch)
      applyAudio()
      if (patch.quality && patch.quality !== prevQuality) game?.setQuality(patch.quality)
    },
    resetTips: () => save.update({ tutorialDone: false }),
  })
  game = new Game(renderer, input, audio, save, ui.hooks, envHdr)
  ui.bind(game)
  performance.mark('boot:game')
  // ─── staged streaming ─────────────────────────────────────────────
  // Current quarry + combat sounds first, the next quarry second, everything else in spare time
  // (paused while the fight heats up; see game.loadPressure).
  const nextOf = (id: string): MonsterId => STAGE_ORDER[(STAGE_ORDER.indexOf(id as MonsterId) + 1) % STAGE_ORDER.length]
  const scheduleStages = (id: string) => {
    void assets.bundle(stageBundle(id as MonsterId), 'current').catch(err => console.warn('current stage prefetch failed', err))
    void assets.bundle(stageBundle(nextOf(id)), 'next').catch(err => console.warn('next stage prefetch failed', err))
    for (const s of STAGE_ORDER) void assets.bundle(stageBundle(s), 'background').catch(err => console.warn('background stage prefetch failed', err))
    void assets.bundle('env:hi', 'background').catch(err => console.warn('environment prefetch failed', err))
  }
  const switchQuarry = async (id: string) => {
    if (!game) return
    const bundle = stageBundle(id as MonsterId)
    try {
      if (!assets.ready(bundle)) {
        ui.toast(t('boot.loadingQuarry'))
        await assets.bundle(bundle, 'current')
      }
      game.setQuarry(id)
      void assets.bundle(stageBundle(nextOf(id)), 'next').catch(err => console.warn('next stage prefetch failed', err))
    } catch (err) {
      console.error(`required ${id} stage assets failed`, err)
      showBootFailure(t('boot.assetError'))
    }
  }
  new TouchControls(root, canvas, input, () => game?.mode === 'playing')


  const g = game
  let lockLostAt = 0
  const loop = new GameLoop({
    step: dt => g.step(dt),
    render: (_alpha, frameSeconds) => {
      if (g.loadPressure || frameSeconds > 1 / 40) assets.pressure(3)
      assets.pump()
      input.update()
      loop.paused = g.mode === 'paused'
      g.frame(frameSeconds)
      ui.frame(frameSeconds)
    },
  })
  ui.show('title')
  root.dataset.mode = 'title'
  loop.start()
  performance.mark('boot:title')
  setBoot(1)
  // Title is interactive now; stream the hunt's combat sounds and stage bundles behind it.
  void assets.bundle('hunt', 'current').catch(err => console.warn('optional combat audio prefetch failed', err))
  scheduleStages(g.quarryId)
  bootEl?.classList.add('done')

  document.addEventListener('pointerlockchange', () => {
    // Browsers release pointer lock on Escape without delivering the key: treat that as pause.
    if (!document.pointerLockElement && g.mode === 'playing' && input.device === 'keyboard') {
      lockLostAt = performance.now()
      g.pause()
    }
  })
  // Clicking the canvas during play re-captures the mouse (e.g. after an alt-tab).
  canvas.addEventListener('click', () => {
    if (g.mode === 'playing' && !input.pointerLocked && performance.now() - lockLostAt > 250) input.lockPointer()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      g.pause()
      audio.suspend()
    } else audio.resume()
  })
  window.addEventListener('keydown', e => {
    if (e.code === 'Escape' && g.mode === 'paused' && ui.screen === 'pause' && performance.now() - lockLostAt > 300) {
      g.resume()
      loop.resetAccumulator()
    } else if (e.code === 'Escape' && (ui.screen === 'settings' || ui.screen === 'guide' || ui.screen === 'confirm')) {
      ui.show(g.mode === 'paused' ? 'pause' : 'title')
    }
  })
}

// The enemy library normally has its own page (/enemies/); if a host serves the root page for
// that path instead, load the library in place of the game.
if (/\/enemies\/?$/.test(location.pathname)) {
  document.querySelector('#boot')?.remove()
  document.querySelector('#game')?.remove()
  document.querySelector('#ui')?.remove()
  document.body.className = 'lib'
  const lib = document.createElement('div')
  lib.id = 'lib'
  document.body.append(lib)
  void import('./enemies/main')
} else void boot()
