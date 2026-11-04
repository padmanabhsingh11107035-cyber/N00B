import './styles/main.css'
import { creatureAssets } from './game/creatures'
import { type AssetRef, Assets } from './engine/assets'
import { Audio } from './engine/audio'
import { Input } from './engine/input'
import { GameLoop } from './engine/loop'
import { defaultSave, LEGACY_SAVE_KEYS, SAVE_KEY, SaveStore, type SaveData } from './engine/save'
import type { Game, RunStats } from './game/game'
import { buyUpgrade, dailySeed, startingStats } from './game/rules'
import { VatLibrary } from './game/vat'
import { Ui } from './ui/ui'

/**
 * Staggered loading. Only `boot` (title screen + the first sector's opening waves) blocks the
 * title; each later group is required when its sector begins (current + next), and the rest is
 * prefetched in the background while the game reports it is calm (Assets.busy pauses it).
 */
const tex = (key: string, dir: string, o: Partial<Extract<AssetRef, { kind: 'tex' }>> = {}): AssetRef => ({ kind: 'tex', key, url: `assets/${dir}/${key}.webp`, ...o })
const sfx = (...keys: string[]): AssetRef[] => keys.map(key => ({ kind: 'sfx', key, url: `assets/audio/${key}.mp3` }))
const model = (...keys: string[]): AssetRef[] => keys.map(key => ({ kind: 'model', key, url: `assets/props/${key}.glb` }))
const clips = (...keys: Extract<AssetRef, { kind: 'clip' }>['key'][]): AssetRef[] => keys.map(key => ({ kind: 'clip', key }))
const ASSET_GROUPS: Record<string, AssetRef[]> = {
  boot: [
    tex('soldier', 'chars'), tex('walker', 'chars'), tex('walker2', 'chars'), tex('runner', 'chars'),
    tex('asphalt', 'env', { repeat: true, aniso: 8 }), tex('sidewalk', 'env', { repeat: true, aniso: 8 }),
    tex('facade_a', 'env', { repeat: true }), tex('facade_b', 'env', { repeat: true }), tex('skyline', 'env'),
    ...['muzzle', 'fireball', 'sparks', 'flame', 'smoke', 'blood', 'acid', 'scorch'].map(k => tex(k, 'fx')),
    ...clips('soldier_run', 'z_walk', 'z_idle', 'z_run', 'z_hit', 'z_death', 'z_attack'),
    ...model('car', 'barrier'),
    ...sfx('shot_rifle', 'shot_heavy', 'hit_flesh', 'zombie_die', 'gate_good', 'gate_bad', 'ui_click', 'coin', 'join', 'soldier_down', 'spikes', 'saw_loop', 'explosion', 'crate', 'perk'),
  ],
  // sector 1 boss (Brute King), celebration and boss audio
  'sector-0': [tex('brute', 'chars'), ...model('barrel_fire', 'trashcan', 'tyre', 'barrel_red', 'barrel_blue'), ...clips('soldier_cheer', 'z_slam', 'z_cast'),
    ...sfx('roar', 'boss_intro', 'slam', 'victory', 'defeat', 'whistle', 'shield_break', 'horde_loop', 'beep', 'crusher'),
    // first Lurker contact (a Leaper pack) comes right after the tutorial
    ...creatureAssets('leaper'), ...sfx('leaper_shriek', 'leap', 'land')],
  'sector-1': [tex('retcher', 'chars'), tex('blister', 'chars'), tex('wailer', 'chars'), tex('facade_c', 'env', { repeat: true }), ...clips('z_crawl'), ...sfx('spit', 'flame', 'scream'),
    ...creatureAssets('quiller'), ...creatureAssets('gulper'), ...sfx('skitter', 'needle_spit', 'burrow_rumble', 'erupt', 'tongue')],
  'sector-2': [tex('riot', 'chars'), ...model('barrel_toxic'), ...sfx('laser', 'turret'), ...creatureAssets('howler'), ...sfx('sac_charge', 'pulse_blast')],
  'sector-3': [tex('abomination', 'chars')],
  late: [],
}

async function boot(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#game')!
  const firstRun = [SAVE_KEY, ...LEGACY_SAVE_KEYS].every(k => safeGet(k) === null)
  const save = new SaveStore()
  let game: Game | undefined
  const audio = new Audio()
  const lib = new VatLibrary()
  const assets = new Assets(lib, () => audio.ctx)
  audio.getBuffer = key => assets.buffers.get(key)
  for (const [g, refs] of Object.entries(ASSET_GROUPS)) assets.define(g, refs)
  const input = new Input(document.body, () => game?.mode === 'playing')
  let lastDaily = false

  const applySettings = (d: SaveData) => {
    audio.setVolumes(d.musicVolume, d.sfxVolume, d.muted)
    if (game) {
      game.reducedMotion = d.reducedMotion
      game.damageNumbers = d.damageNumbers
      game.screenShake = d.screenShake
    }
  }
  const startRun = (daily: boolean) => {
    if (!game) return
    audio.unlock()
    lastDaily = daily
    ui.clearTransient()
    input.clear()
    const seed = daily ? dailySeed() : (Math.random() * 0xffffffff) >>> 0
    game.start({ seed, daily, stats: startingStats(save.data.upgrades), upgrades: save.data.upgrades, tutorial: !save.data.tutorialDone })
    if (!save.data.tutorialDone) save.update({ tutorialDone: true })
    ui.show('hud')
    loop.resetAccumulator()
  }
  const pause = () => {
    if (game?.mode !== 'playing') return
    game.pause()
    ui.pauseStats(game.hud())
    ui.show('pause')
  }
  const resume = () => {
    if (game?.mode !== 'paused') return
    game.resume()
    ui.show('hud')
    input.clear()
    loop.resetAccumulator()
  }
  const toTitle = () => {
    ui.clearTransient()
    game?.toTitle()
    audio.playMusic('title')
    ui.show('title')
  }
  const onGameOver = (s: RunStats) => {
    const d = save.data
    const recordScore = s.score > d.bestScore
    const recordDist = s.distance > d.bestDistance
    const today = dailySeed()
    save.update({
      coins: d.coins + s.coins,
      bestScore: Math.max(d.bestScore, s.score),
      bestDistance: Math.max(d.bestDistance, Math.floor(s.distance)),
      bestSector: Math.max(d.bestSector, s.sector + 1),
      runs: d.runs + 1,
      totalKills: d.totalKills + s.kills,
      bossesKilled: d.bossesKilled + s.bosses,
      ...(s.daily ? { dailySeed: today, dailyBest: d.dailySeed === today ? Math.max(d.dailyBest, s.score) : s.score } : {}),
    })
    window.setTimeout(() => ui.results(s, recordScore, recordDist, s.coins), 500)
  }

  const ui = new Ui(document.getElementById('ui')!, save, {
    play: daily => startRun(daily),
    restart: () => startRun(lastDaily),
    resume,
    pause,
    quit: toTitle,
    buy: id => {
      const res = buyUpgrade(save.data.upgrades, save.data.coins, id)
      if (!res) { audio.play('gate_bad', { vol: 0.4 }); return false }
      save.update({ upgrades: res.levels, coins: res.coins })
      ui.refreshArmory()
      return true
    },
    settings: patch => {
      const qualityChanged = patch.quality !== undefined && patch.quality !== save.data.quality
      save.update(patch)
      applySettings(save.data)
      ui.refreshSettings()
      if (qualityChanged && game) applyQuality(game, save.data.quality)
    },
    resetProgress: () => {
      const d = defaultSave()
      save.update({ coins: 0, upgrades: d.upgrades, bestScore: 0, bestDistance: 0, bestSector: 0, runs: 0, totalKills: 0, bossesKilled: 0, tutorialDone: false, dailySeed: 0, dailyBest: 0 })
      ui.refreshArmory()
      ui.refreshTitle()
    },
    perk: id => game?.choosePerk(id),
    grenade: () => game?.pressGrenade(),
    medkit: () => game?.pressMedkit(),
    toggleMute: () => { save.update({ muted: !save.data.muted }); applySettings(save.data); ui.refreshSettings() },
    sfx: (key, vol = 0.5, rate = 1) => audio.play(key, { vol, rate, max: 3, gap: 0.03 }),
  })
  ui.show('loading')
  applySettings(save.data)

  // ── boot load: engine code + mesh + the boot asset group, with a real progress bar ──
  let bootDone = 0
  const bootTotal = ASSET_GROUPS.boot.length + 3
  const bump = (label?: string) => ui.setLoading(Math.min(1, ++bootDone / bootTotal), label)
  assets.onProgress = () => { if (!assets.groupReady('boot')) bump() }
  const [{ Game: GameClass }, { Renderer, suggestQuality }] = await Promise.all([
    import('./game/game').then(m => (bump('ARMING WEAPONS…'), m)),
    import('./engine/renderer').then(m => (bump(), m)),
    lib.init().then(() => bump('RAISING THE DEAD…')),
  ])
  audio.preloadMusic('title')
  await assets.require('boot')
  assets.onProgress = undefined
  ui.setLoading(1, 'READY')
  if (firstRun) { save.update({ quality: suggestQuality() }); ui.refreshSettings() }
  await document.fonts.ready.catch(() => undefined)

  const renderer = new Renderer(canvas, save.data.quality)
  game = new GameClass(renderer, assets, lib, audio, input, ui.textLayer, {
    hint: text => ui.hint(text),
    banner: (t, s, style) => ui.banner(t, s, style),
    toast: (t, tone) => ui.toast(t, tone),
    perkChoice: perks => ui.perks(perks, game!.perks),
    gameOver: onGameOver,
    coinFly: (x, y) => ui.coinFly(x, y),
    hurt: n => ui.hurt(n),
    squadPulse: d => ui.squadPulse(d),
    gate: good => ui.edge(good ? 'good' : 'bad', 0.6),
  })
  game.initFx()
  applyQuality(game, save.data.quality)
  applySettings(save.data)
  // Background prefetch starts right away while the title is calm: current + next sector first.
  assets.prefetch(['sector-0', 'sector-1', 'sector-2', 'sector-3', 'late'])

  const g = game
  const loop = new GameLoop({
    step: dt => g.step(dt),
    render: (alpha, frameSeconds) => {
      input.update()
      if (input.consume('mute')) { save.update({ muted: !save.data.muted }); applySettings(save.data); ui.refreshSettings() }
      if (input.consume('pause')) {
        if (g.mode === 'playing') pause()
        else if (g.mode === 'paused' && ui.current === 'pause') resume()
        else if (ui.current === 'settings' || ui.current === 'armory') { audio.play('ui_click', { vol: 0.5 }); ui.back() }
      }
      if (ui.current === 'hud') input.consume('confirm')
      else if (input.consume('confirm')) {
        if (ui.current === 'title') startRun(false)
        else if (ui.current === 'results') startRun(lastDaily)
        else if (ui.current === 'pause') resume()
      }
      loop.paused = g.mode === 'paused' || g.mode === 'perk'
      g.render(alpha, frameSeconds)
      renderer.render(g.scene, g.camera)
      if (g.mode === 'playing' || g.mode === 'perk' || g.mode === 'over') {
        ui.updateHud(g.hud(), frameSeconds)
        ui.squadTag(g.squadAnchor(), g.squad.count)
      }
    },
  })
  loop.start()
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause() })
  window.addEventListener('game:pause', pause)
  const unlock = () => {
    audio.unlock()
    if (g.mode === 'title') audio.playMusic('title')
  }
  window.addEventListener('pointerdown', unlock, { once: true })
  window.addEventListener('keydown', unlock, { once: true })
  window.setTimeout(() => { ui.show('title'); if (audio.unlocked) audio.playMusic('title') }, 250)
  // Debug/test hook (read-only use): smoke tests inspect run state through it.
  ;(window as unknown as { __game: unknown }).__game = { game: g, ui, input, save, assets }
}

function applyQuality(game: Game, q: SaveData['quality']) {
  game.renderer.applyQuality(q)
  game.baseDensity = q === 'low' ? 0.5 : q === 'medium' ? 0.75 : 1
  game.fx.density = game.baseDensity
  game.setVisibleCap(q === 'low' ? 70 : q === 'medium' ? 110 : 150)
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
