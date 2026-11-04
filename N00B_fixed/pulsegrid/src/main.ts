import './styles/main.css'
import { Assets, assetUrl } from './engine/assets'
import { Audio } from './engine/audio'
import { Input } from './engine/input'
import { GameLoop } from './engine/loop'
import { SaveStore } from './engine/save'
import { betterRank, type Rank } from './game/rules'
import { songById } from './game/songs'
import { Ui } from './ui/ui'

/**
 * Boot: the static loading screen in index.html paints first. We then load only the `boot` asset
 * group (title screen + the first song, Warm-Up) and jump straight to the title. The title BGM,
 * later songs and extra SFX stream in the background, paused whenever the game heats up.
 * Audio starts on the first click or key press (browser autoplay rules).
 */
const TIPS = [
  'Type the arrows, then hit Space on beat 4.',
  'Chain Perfects to fill the Fever gauge for double points.',
  'Red arrows are reversed: press the opposite direction.',
  'Spotlight rounds score double on Perfect and Great.',
  'Land the Finish Move for triple points and pyro.',
  'Bluetooth headphones? Raise the timing offset in Settings.',
]
function loaderUi() {
  const root = document.getElementById('loader')
  const bar = root?.querySelector<HTMLElement>('.bar i')
  const pct = root?.querySelector<HTMLElement>('.pct')
  const tip = root?.querySelector<HTMLElement>('.tip')
  const retry = root?.querySelector<HTMLButtonElement>('.retry')
  retry?.addEventListener('click', () => window.location.reload())
  let k = 0
  let failed = false
  const rot = window.setInterval(() => {
    if (!failed && tip) tip.textContent = TIPS[k++ % TIPS.length]
  }, 1600)
  return {
    progress(p: number) {
      if (bar) bar.style.transform = `scaleX(${p.toFixed(3)})`
      if (pct) pct.textContent = `${Math.round(p * 100)}%`
    },
    error(msg: string) {
      failed = true
      if (tip) tip.textContent = msg
      retry?.classList.add('is-on')
    },
    done() {
      window.clearInterval(rot)
      root?.classList.add('is-done')
      window.setTimeout(() => root?.remove(), 900)
    },
  }
}

async function boot(): Promise<void> {
  const save = new SaveStore()
  const input = new Input()
  const audio = new Audio()
  const applyAudio = () => audio.setVolumes(save.data.musicVolume, save.data.sfxVolume, save.data.muted)
  applyAudio()
  const loader = loaderUi()
  const assets = new Assets(audio.ctx)

  let game: import('./game/game').Game | undefined
  let renderer: import('./engine/renderer').Renderer | undefined
  let lastSongId = save.data.lastSong || 'warmup'

  const ui = new Ui(document.getElementById('ui')!, save, input, {
    startSong(id) {
      if (!game) return
      audio.unlock()
      const song = songById(id)
      // A song whose track hasn't streamed yet: fetch it now (foreground) with a short overlay.
      if (!game.hasTrack(song.id) && !assets.isReady(`song:${song.id}`)) {
        ui.loading(true, song.title)
        assets.load(`song:${song.id}`, p => ui.loadingProgress(p)).catch(() => undefined).finally(() => {
          ui.loading(false)
          this.startSong(id)
        })
        return
      }
      lastSongId = song.id
      save.update({ lastSong: song.id })
      ui.resetHud(song)
      ui.show('hud')
      game.offsetMs = save.data.offsetMs
      game.start(song)
    },
    pause,
    resume,
    restart() {
      if (!game) return
      const song = game.activeSong ?? songById(lastSongId)
      game.toTitle()
      ui.resetHud(song)
      ui.show('hud')
      game.offsetMs = save.data.offsetMs
      game.start(song)
    },
    quit() {
      game?.toTitle()
      ui.show('title')
    },
    settingsChanged() {
      applyAudio()
      if (game) {
        game.reducedMotion = save.data.reducedMotion
        game.offsetMs = save.data.offsetMs
        game.beatAssist = save.data.beatAssist
      }
      renderer?.applyQuality(save.data.quality)
    },
  })
  document.getElementById('ui')!.addEventListener('ui-sfx', e => audio.play((e as CustomEvent<string>).detail as never))

  function pause(): void {
    if (!game || (game.mode !== 'playing' && game.mode !== 'resuming')) return
    game.pause()
    ui.show('pause')
  }
  function resume(): void {
    if (!game || game.mode !== 'paused') return
    ui.show('hud')
    game.resume()
  }

  // Unlock audio + start the lobby groove on the first gesture.
  const unlock = () => {
    audio.unlock()
    window.setTimeout(() => {
      game?.startLobby()
      if (ui.screen === 'title') audio.play('welcome')
    }, 60)
  }
  window.addEventListener('pointerdown', unlock, { once: true })
  window.addEventListener('keydown', unlock, { once: true })

  const [{ Renderer, suggestQuality }, { Game }, manifest] = await Promise.all([import('./engine/renderer'), import('./game/game'), import('./game/manifest')])
  manifest.defineAssets(assets)
  try {
    await assets.load('boot', p => loader.progress(p))
  } catch (err) {
    loader.error('Some files failed to load. Check your connection and reload.')
    throw err
  }
  const registerSfx = () => {
    for (const k of manifest.sfxKeys()) {
      const b = assets.tryGet<AudioBuffer>(`sfx:${k}`)
      if (b && !audio.hasSample(k)) audio.setSample(k, b)
    }
    for (const k of ['music:sting_clear', 'music:sting_fail']) {
      const b = assets.tryGet<AudioBuffer>(k)
      if (b && !audio.hasSample(k)) audio.setSample(k, b)
    }
  }
  registerSfx()
  ui.fx.setAtlas(await loadImage(assetUrl('fx/particles.webp')))
  if (!localStorage.getItem('noob.pulsegrid.save')) save.update({ quality: suggestQuality() })
  ui.syncSettings()
  renderer = new Renderer(document.getElementById('game') as HTMLCanvasElement, save.data.quality)
  const three = await import('three')
  const tex = (k: string) => assets.get<import('three').Texture>(k)
  const kit = manifest.buildKit(assets)
  game = new Game(renderer, input, audio, {
    judged: (grade, points, perf, finish, spotlight) => ui.onJudged(grade, points, perf, finish, spotlight),
    milestone: combo => ui.milestone(combo),
    wrong: () => ui.onWrong(),
    banner: (text, tone) => ui.banner(text, tone),
    countdown: label => ui.countdown(label),
    freestyle: ev => ui.freestyle(ev),
    ended: result => {
      const prev = save.data.best[result.song.id]
      const cleared = result.perf.phase === 'cleared'
      const better = !prev || result.perf.score > prev.score
      const newBest = !result.unranked && cleared && better && result.perf.score > 0
      if (newBest) {
        save.update({
          best: {
            ...save.data.best,
            [result.song.id]: {
              score: result.perf.score,
              rank: prev && betterRank(prev.rank as Rank, result.rank) ? prev.rank : result.rank,
              combo: Math.max(prev?.combo ?? 0, result.perf.maxCombo),
              accuracy: Math.max(prev?.accuracy ?? 0, result.accuracy),
            },
          },
        })
      }
      if (result.song.id === 'warmup' && cleared) save.update({ tutorialDone: true })
      ui.showResults(result, newBest)
      window.setTimeout(() => {
        if (game?.mode === 'ended' || game?.mode === 'attract') {
          game.music.stop(0.4)
          game.startLobbyAfterSong()
        }
      }, 2600)
    },
  },
  kit,
  { floor: tex('tex:floor'), crowd: tex('tex:crowd'), atlas: tex('fx:atlas') },
  id => assets.tryGet<AudioBuffer>(`music:${id}`))
  void three
  assets.maxAnisotropy = renderer.gl.capabilities.getMaxAnisotropy()
  game.reducedMotion = save.data.reducedMotion
  game.offsetMs = save.data.offsetMs
  game.beatAssist = save.data.beatAssist
  ui.game = game
  const g = game

  let frameEma = 1 / 60
  const loop = new GameLoop({
    step: dt => g.step(dt),
    render: (alpha, frameSeconds) => {
      input.update()
      if (input.consume('pause')) {
        if (g.mode === 'playing' || g.mode === 'resuming') pause()
        else if (g.mode === 'paused' && ui.screen === 'pause') resume()
      }
      ui.frame(frameSeconds)
      g.render(alpha, frameSeconds)
      // Smoothed frame time: background streaming backs off while the device is struggling.
      frameEma += (Math.min(frameSeconds, 0.25) - frameEma) * 0.05
    },
  })
  loop.start()
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause()
  })
  window.addEventListener('blur', () => pause())
  if (audio.ctx.state === 'running') g.startLobby()

  ui.show('title')
  loader.done()
  // Background streaming: title BGM first, then the next song, extras, then the rest — only while calm.
  assets.gate = () => g.isCalm() && ui.fx.active < 200 && (g.mode !== 'playing' || frameEma < 1 / 40)
  assets.onGroupReady(group => {
    registerSfx()
    if (group === 'extra') {
      // Merge the streamed move pack between songs, never mid-performance.
      const attach = () => {
        if (g.mode === 'playing' || g.mode === 'paused' || g.mode === 'resuming') window.setTimeout(attach, 1500)
        else manifest.attachExtraDances(assets, kit)
      }
      attach()
    }
    if (group === 'title-music' && g.mode === 'attract' && audio.ctx.state === 'running') {
      g.music.stop(0.5)
      window.setTimeout(() => g.startLobby(), 450)
    }
  })
  assets.prefetch(manifest.PREFETCH_ORDER)
  // Debug/test hook (read-only use): smoke tests inspect state and enable autoplay through it.
  ;(window as unknown as { __game: unknown }).__game = { game: g, ui, input, save, audio }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image()
  img.src = src
  return img.decode().then(() => img)
}

boot().catch(err => {
  console.error(err)
  const ui = document.getElementById('ui')
  if (ui) ui.innerHTML = '<div class="fatal"><h2>PulseGrid Arena could not start</h2><p>Your browser may not support WebGL or Web Audio. Try a recent Chrome, Edge, Firefox or Safari.</p><button type="button" onclick="location.reload()">Retry</button></div>'
})
