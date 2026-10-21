import './styles/main.css'
import orbUrl from '../assets/models/helix-fall-orb.glb?url'
import faviconUrl from '../assets/share/favicon.png?url'
import { LEVEL_FLOORS, STAGE_FLOORS, boardDay } from '../server/helix-rules.mjs'
import { Assets } from './engine/assets'
import { Audio } from './engine/audio'
import { I18n, resolveLocale } from './engine/i18n'
import { Input } from './engine/input'
import { GameLoop } from './engine/loop'
import { Renderer, suggestQuality } from './engine/renderer'
import { bestPerPlayer, insertScore, SaveStore, SAVE_KEY, type Locale, type Quality } from './engine/save'
import { Game, type RunKind, type RunResult } from './game/game'
import { dailySeed } from './game/level'
import { THEMES } from './game/theme'
import { challengeUrl, copyText, drawCard, readChallenge } from './online/share'
import type { BoardData } from './online/leaderboard'
import { UI } from './ui/ui'

let activeUi: UI | null = null

// Shown inside the NOOB games page: the page around the game is told how every run ended (win = reached the base of the tower), so NOOB can pay out and rank it.
const embedded = (() => {
  try { return window.parent !== window && new URLSearchParams(location.search).has('embed') } catch { return false }
})()
if (embedded) document.documentElement.classList.add('embed')
function tellHost(run: RunResult): void {
  if (!embedded) return
  try {
    window.parent.postMessage({
      type: 'helixfall:run-end',
      outcome: run.outcome,
      kind: run.kind,
      score: run.score,
      floors: run.floors,
      levels: run.levels,
      level: run.levels + 1,
      totalFloors: LEVEL_FLOORS,
      stage: run.stage,
      durationMs: run.durationMs,
    }, location.origin)
  } catch { /* the page around the game is gone: nothing to tell */ }
}
// "ready": the game is on screen. "error": it could not start (the page around the game shows that, with a way to try again).
function tellStatus(type: 'ready' | 'error', detail = ''): void {
  if (!embedded) return
  try { window.parent.postMessage({ type: `helixfall:${type}`, detail }, location.origin) } catch { /* nothing to tell */ }
}
/** A new run began (the page around the game clears what it showed about the last one). */
function tellRunStart(kind: RunKind): void {
  if (!embedded) return
  try { window.parent.postMessage({ type: 'helixfall:run-start', kind }, location.origin) } catch { /* nothing to tell */ }
}
/** A level (90 floors) was cleared: the page around the game pays it at once, while the run goes on. */
function tellLevel(level: number, run: { kind: RunKind; floors: number; score: number; durationMs: number }): void {
  if (!embedded) return
  try { window.parent.postMessage({ type: 'helixfall:level', level, ...run }, location.origin) } catch { /* nothing to tell */ }
}

// The leaderboard of an embedded game is the one of NOOB (one best score per player): the page around the game fetches it and answers here.
type HostBoard = { id: number; ok: boolean; period: 'today' | 'all'; total: number; entries: { rank: number; userId: string; displayName: string; score: number; isMe: boolean }[]; me: { rank: number; score: number } | null }
let boardRequestId = 0
const boardWaiters = new Map<number, (board: HostBoard | null) => void>()
function askHostBoard(period: 'today' | 'all', timeoutMs = 8000): Promise<HostBoard | null> {
  return new Promise(resolve => {
    const id = (boardRequestId += 1)
    const timer = window.setTimeout(() => { boardWaiters.delete(id); resolve(null) }, timeoutMs)
    boardWaiters.set(id, board => { window.clearTimeout(timer); boardWaiters.delete(id); resolve(board) })
    try { window.parent.postMessage({ type: 'helixfall:board-request', id, period }, location.origin) } catch { window.clearTimeout(timer); boardWaiters.delete(id); resolve(null) }
  })
}
const toBoardData = (b: HostBoard): BoardData => ({
  period: b.period,
  day: boardDay(),
  total: b.total,
  entries: b.entries.map(e => ({ playerId: e.userId, displayName: e.displayName, score: e.score, rank: e.rank })),
  myRank: b.me,
})
const myIdOf = (b: HostBoard | null): string | null => b?.entries.find(e => e.isMe)?.userId ?? null
type HostNote = { type: string; bestScore?: number; newBest?: boolean }
let onHostNote: ((note: HostNote) => void) | null = null
if (embedded) {
  window.addEventListener('message', e => {
    if (e.origin !== location.origin || e.source !== window.parent) return
    const d = e.data as (HostBoard & { type?: string }) | HostNote | null
    if (!d || typeof d.type !== 'string') return
    if (d.type === 'helixfall:board' && typeof (d as HostBoard).id === 'number') boardWaiters.get((d as HostBoard).id)?.((d as HostBoard).ok ? (d as HostBoard) : null)
    else if (d.type === 'helixfall:saved' || d.type === 'helixfall:profile') onHostNote?.(d as HostNote)
  })
}
// The name on the board is the player's NOOB name (given by the page around the game).
const hostName = (() => {
  if (!embedded) return ''
  try { return (new URLSearchParams(location.search).get('name') ?? '').normalize('NFKC').replace(/[<>\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16) } catch { return '' }
})()
const storedGame = (): string | null => {
  try { return localStorage.getItem(SAVE_KEY) } catch { return null }
}

async function boot(): Promise<void> {
  // The ball's model starts downloading at once, while the rest of the game is being set up.
  const assets = new Assets()
  const modelLoading = assets.gltf(orbUrl)
  modelLoading.catch(() => undefined)
  const save = new SaveStore()
  if (storedGame() === null) save.update({ quality: suggestQuality() })
  const i18n = new I18n(resolveLocale(save.data.locale, navigator.languages))
  const canvas = document.getElementById('game') as HTMLCanvasElement
  const input = new Input(canvas)
  input.sensitivity = save.data.sensitivity
  const audio = new Audio()
  const applyVolumes = () => audio.setVolumes(save.data.musicVolume, save.data.sfxVolume, save.data.muted)
  applyVolumes()
  const challenge = readChallenge()
  const handlers: Record<string, (el: HTMLElement) => void> = {}
  const ui = new UI(i18n, save, input, handlers)
  activeUi = ui
  ui.setBootIcon(faviconUrl)
  ui.bootProgress(0.04)
  ui.bootIndeterminate(true)
  handlers.retryBoot = () => window.location.reload()

  if (hostName && save.data.playerName !== hostName) save.update({ playerName: hostName })
  if (!save.data.playerName) {
    save.update({ playerName: `${i18n.locale === 'zh-CN' ? '玩家' : 'Player'}${Math.floor(1000 + Math.random() * 9000)}` })
  }

  const previewUnranked: () => boolean = () => false
  const activateTuningRun: () => void = () => undefined
  try {
    const model = await modelLoading
    const renderer = new Renderer(canvas, save.data.quality)
    let currentDay = boardDay()
    let lastKind: RunKind = 'daily'
    let lastRun: RunResult | null = null
    let lastRank: number | null = null
    let lastWasBest = false
    let runWasUnranked = false
    let resultsTimer = 0
    let titleToken = 0
    let boardToken = 0
    let shareUrl = ''
    let shareBlob: Blob | null = null

    const target = () => challenge ? { name: challenge.name, score: challenge.score } : null
    const meId = () => `device:${save.data.playerName || 'player'}`
    function localBoard(period: 'today' | 'all', limit = 50): BoardData {
      const today = boardDay()
      // One row per player: the all-time board keeps each player's best of all days.
      const rows = bestPerPlayer(save.data.leaderboard.filter(entry => period === 'all' || boardDay(entry.at) === today), false)
        .slice(0, limit)
      const entries = rows.map((entry, index) => ({
        playerId: entry.name === save.data.playerName ? meId() : `saved:${entry.at}:${index}`,
        displayName: entry.name,
        score: entry.score,
        rank: index + 1,
      }))
      const mine = entries.find(entry => entry.playerId === meId())
      return { period, day: today, total: entries.length, entries, myRank: mine ? { rank: mine.rank, score: mine.score } : null }
    }

    const game = new Game(renderer, input, audio, {
      popup: (text, kind) => ui.popup(text, kind, game.ballScreen()),
      flash: (color, strength) => strength > 0.02 && ui.flash(color, strength),
      smashMode: on => ui.smashMode(on),
      chain: n => ui.chain(n),
      stage: (stage, theme) => ui.stageBanner(stage, theme.accent),
      level: level => {
        ui.levelBanner(level)
        tellLevel(level, { kind: game.kind, floors: game.sim.floors, score: game.sim.score, durationMs: Math.floor(game.sim.time * 1000) })
      },
      scored: () => undefined,
      end: run => onEnd(run),
      startRequest: () => {
        if (ui.screen === 'title' && !ui.modal) startRun('daily')
      },
    }, model.scene)
    game.setQuality(save.data.quality)
    game.reducedMotion = save.data.reducedMotion
    game.targetScore = challenge?.score ?? 0

    const todayBest = () => save.data.dailyDay === currentDay ? save.data.dailyBest : 0
    function refreshTitle(): void {
      ui.setTitle({ day: currentDay, best: save.data.best, todayBest: todayBest(), challenge: target() })
      if (!embedded) {
        ui.setTitleTop(localBoard('today', 5), false, meId())
        return
      }
      // In NOOB: today's top 5 of everybody, one best score each.
      const token = (titleToken += 1)
      ui.setTitleTop(null, false, null)
      void askHostBoard('today', 8000).then(board => {
        if (token !== titleToken) return
        ui.setTitleTop(board ? toBoardData(board) : null, !board, myIdOf(board))
      })
    }

    function startRun(kind: RunKind): void {
      audio.unlock()
      audio.startMusic()
      window.clearTimeout(resultsTimer)
      lastKind = kind
      lastRank = null
      lastRun = null
      activateTuningRun()
      runWasUnranked = previewUnranked()
      ui.clearPopups()
      if (ui.modal) ui.closeModal()
      game.personalBest = save.data.best
      if (kind === 'daily') {
        currentDay = boardDay()
        game.start('daily', dailySeed(currentDay), currentDay)
      } else {
        game.start('practice', (Math.random() * 2 ** 32) >>> 0, '')
      }
      tellRunStart(kind)
      ui.show('hud')
      ui.touchHint(save.data.plays < 2 && document.body.classList.contains('is-touch'))
      loop.resetAccumulator()
    }

    function toTitle(): void {
      window.clearTimeout(resultsTimer)
      if (ui.modal) ui.closeModal()
      ui.clearPopups()
      currentDay = boardDay()
      game.toTitle('daily', dailySeed(currentDay), currentDay)
      refreshTitle()
      ui.show('title')
    }

    function onEnd(run: RunResult): void {
      lastRun = run
      tellHost(run)
      const previousBest = save.data.best
      const eligible = !runWasUnranked
      lastWasBest = eligible && run.score > previousBest && run.score > 0
      const patch: Partial<typeof save.data> = { plays: save.data.plays + 1 }
      if (eligible) patch.best = Math.max(previousBest, run.score)
      if (run.kind === 'daily' && eligible) {
        currentDay = run.seedDay
        patch.dailyDay = run.seedDay
        patch.dailyBest = save.data.dailyDay === run.seedDay ? Math.max(save.data.dailyBest, run.score) : run.score
        const inserted = insertScore(save.data.leaderboard, {
          name: save.data.playerName,
          score: run.score,
          seconds: run.durationMs / 1000,
          at: Date.now(),
        })
        patch.leaderboard = inserted.board
        lastRank = inserted.rank >= 0 ? inserted.rank + 1 : null
      }
      save.update(patch)

      const t = i18n.t.bind(i18n)
      let note = ''
      const challengeTarget = target()
      if (challengeTarget) {
        note = run.score > challengeTarget.score
          ? t('results.targetBeat', { name: challengeTarget.name || t('challenge.anon'), score: challengeTarget.score })
          : t('results.targetMiss', { name: challengeTarget.name || t('challenge.anon'), score: challengeTarget.score, diff: challengeTarget.score - run.score })
      } else if (!lastWasBest && previousBest > 0 && previousBest - run.score <= Math.max(40, previousBest * 0.15)) {
        note = t('results.nearBest', { diff: previousBest - run.score })
      }
      const show = () => ui.showResults({
        won: run.levels > 0,
        levels: run.levels,
        score: run.score,
        newBest: lastWasBest,
        floors: run.floors,
        chain: run.bestChain,
        smashes: run.smashes,
        seconds: run.durationMs / 1000,
        note,
        name: save.data.playerName,
        showName: run.kind === 'daily',
      })
      resultsTimer = window.setTimeout(show, run.outcome === 'won' ? 1400 : 750)
      if (run.kind === 'practice') ui.setOnline(`<p class="muted">${t('results.practice')}</p>`)
      else if (runWasUnranked) ui.setOnline(`<p class="muted">${t('results.unranked')}</p>`)
      else if (embedded) ui.setOnline(`<p class="muted">${t('results.bestKept', { score: Math.max(save.data.best, run.score) })}</p>`)
      else if (lastRank) ui.setOnline(`<p class="muted">${t('results.localRank', { rank: lastRank })}</p>`)
      else ui.setOnline(`<p class="muted">${t('results.localOnly')}</p>`)
    }

    async function openShare(): Promise<void> {
      if (!lastRun) return
      const t = i18n.t.bind(i18n)
      const run = lastRun
      const theme = THEMES[Math.min(run.stage, THEMES.length - 1)]
      shareUrl = challengeUrl(run.score, save.data.playerName, run.kind === 'daily' ? run.seedDay : null)
      const display = getComputedStyle(document.documentElement).getPropertyValue('--display') || 'sans-serif'
      const { blob, url } = await drawCard({
        title: t('title.name'),
        sub: t('title.sub'),
        score: run.score,
        modeLine: run.kind === 'daily' ? t('share.cardDaily', { day: run.seedDay }) : t('share.cardPractice'),
        rankLine: lastRank ? t('share.cardRank', { rank: lastRank, pct: 0 }) : null,
        statsLine: t('share.cardStats', { floors: run.floors, chain: run.bestChain, sec: Math.round(run.durationMs / 1000) }),
        call: t('share.cardCall'),
        scan: t('share.cardScan'),
        url: shareUrl,
        name: save.data.playerName,
        colors: { sky: theme.sky, low: theme.skyLow, safe: theme.safe, safeAlt: theme.safeAlt, accent: theme.accent },
        display,
      })
      shareBlob = blob
      const file = new File([blob], 'helix-fall.png', { type: 'image/png' })
      ui.setShare(url, shareUrl, !!navigator.canShare?.({ files: [file] }))
      ui.openModal('share')
    }

    async function copyChallenge(): Promise<void> {
      if (!lastRun) return
      const t = i18n.t.bind(i18n)
      shareUrl = challengeUrl(lastRun.score, save.data.playerName, lastRun.kind === 'daily' ? lastRun.seedDay : null)
      const ok = await copyText(`${t('share.text', { score: lastRun.score })} ${shareUrl}`)
      ui.toast(t(ok ? 'share.copied' : 'share.copyFail'), ui.modal === 'share' ? 'share' : 'results')
    }

    function openBoard(period: 'today' | 'all'): void {
      if (ui.modal !== 'board') ui.openModal('board')
      if (!embedded) {
        ui.setBoard(period, localBoard(period), meId())
        return
      }
      const token = (boardToken += 1)
      ui.setBoard(period, 'loading', null)
      void askHostBoard(period).then(board => {
        if (token !== boardToken || ui.modal !== 'board') return
        ui.setBoard(period, board ? toBoardData(board) : 'error', myIdOf(board))
      })
    }

    function pause(): void {
      if (game.mode !== 'playing') return
      game.pause()
      ui.openModal('pause')
    }

    function resume(): void {
      if (ui.modal) ui.closeModal()
      game.resume()
      loop.resetAccumulator()
    }

    Object.assign(handlers, {
      daily: () => startRun('daily'),
      practice: () => startRun('practice'),
      restart: () => startRun(lastKind),
      title: () => toTitle(),
      pause: () => pause(),
      resume: () => resume(),
      board: () => openBoard('today'),
      boardToday: () => openBoard('today'),
      boardAll: () => openBoard('all'),
      settings: () => ui.openModal('settings'),
      share: () => void openShare(),
      copy: () => void copyChallenge(),
      systemShare: () => {
        if (!shareBlob || !lastRun) return
        const file = new File([shareBlob], 'helix-fall.png', { type: 'image/png' })
        void navigator.share?.({ files: [file], text: `${i18n.t('share.text', { score: lastRun.score })} ${shareUrl}` }).catch(() => undefined)
      },
      closeModal: () => {
        if (ui.modal === 'settings' && game.mode === 'paused') {
          ui.openModal('pause')
          return
        }
        if (ui.modal === 'pause') resume()
        else ui.closeModal()
      },
      lang: (el: HTMLElement) => {
        const locale = el.dataset.value as Locale
        save.update({ locale })
        i18n.set(locale)
        refreshTitle()
      },
      quality: (el: HTMLElement) => {
        save.update({ quality: el.dataset.value as Quality })
        game.setQuality(save.data.quality)
        ui.syncSettings(save.data)
      },
      toggle: (el: HTMLElement) => {
        const key = el.dataset.value as 'muted' | 'reducedMotion'
        save.update({ [key]: !save.data[key] })
        game.reducedMotion = save.data.reducedMotion
        applyVolumes()
        ui.syncSettings(save.data)
      },
    })
    ui.onSetting((key, value) => {
      save.update({ [key]: value })
      input.sensitivity = save.data.sensitivity
      applyVolumes()
    })
    ui.nameForm(raw => {
      const name = raw.normalize('NFKC').replace(/[<>\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16)
      if (!name) return
      save.update({ playerName: name })
      ui.nameSaved()
      refreshTitle()
    })

    const loop = new GameLoop({
      step: dt => game.step(dt),
      render: (alpha, frame) => {
        routeActions()
        game.attractStarts = ui.screen === 'title' && !ui.modal
        game.render(alpha, frame)
        if (ui.screen === 'hud') {
          const sim = game.sim
          ui.setHud({ score: sim.score, best: save.data.best, level: sim.level, shield: sim.shield > 0, stage: sim.stage, stages: STAGE_FLOORS.length, depth: (sim.floor % LEVEL_FLOORS) / LEVEL_FLOORS, practice: game.kind === 'practice', target: target() })
        }
        input.endFrame()
        input.update()
      },
    })

    function routeActions(): void {
      const typing = (document.activeElement as HTMLElement | null)?.matches?.('input:not([readonly])')
      if (input.consume('pause')) {
        if (ui.modal === 'pause') resume()
        else if (ui.modal) handlers.closeModal(document.body)
        else if (ui.screen === 'hud') pause()
      }
      if (input.consume('back')) {
        if (ui.modal) handlers.closeModal(document.body)
        else if (ui.screen === 'results') toTitle()
      }
      if (ui.screen !== 'hud' || ui.modal) {
        if (input.consume('navUp') || input.consume('navLeft')) ui.nav(-1)
        if (input.consume('navDown') || input.consume('navRight')) ui.nav(1)
        if (input.consume('select') && !typing) ui.select()
      }
      if (input.consume('share') && ui.screen === 'results' && !ui.modal) void openShare()
      if (input.consume('confirm') && !typing) {
        if (ui.modal === 'pause') resume()
        else if (ui.modal) return
        else if (ui.screen === 'title') startRun('daily')
        else if (ui.screen === 'results' || (ui.screen === 'hud' && game.mode === 'ended')) startRun(lastKind)
      }
      if (ui.screen === 'hud' && game.mode === 'ended' && input.consume('select')) startRun(lastKind)
    }

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) pause()
    })
    const firstGesture = () => {
      audio.unlock()
      audio.startMusic()
    }
    window.addEventListener('pointerdown', firstGesture, { once: true })
    window.addEventListener('keydown', firstGesture, { once: true })

    // What the page around the game knows about the account: its best score (from any device) and, after a run, whether that run set a new one.
    onHostNote = note => {
      const t = i18n.t.bind(i18n)
      if (typeof note.bestScore === 'number' && note.bestScore >= 0) {
        if (note.bestScore !== save.data.best) save.update({ best: note.bestScore })
        game.personalBest = note.bestScore
        if (note.type === 'helixfall:saved') ui.setOnline(`<p class="muted">${t('results.bestKept', { score: note.bestScore })}</p>`)
      }
      if (note.type === 'helixfall:saved') ui.setNewBest(note.newBest === true)
      if (ui.screen === 'title') refreshTitle()
    }

    ui.bootIndeterminate(false)
    ui.bootProgress(1)
    toTitle()
    input.update()
    loop.start()
    ;(window as unknown as { __helix: unknown }).__helix = { game, ui, save, input, getBoard: localBoard }
    tellStatus('ready')
  } catch (error) {
    console.error('Helix Fall startup failed:', error)
    tellStatus('error', `startup: ${error instanceof Error ? error.message : String(error)}`)
    ui.showBootFailure()
  }
}

void boot().catch(error => {
  console.error('Helix Fall could not start:', error)
  tellStatus('error', `boot: ${error instanceof Error ? error.message : String(error)}`)
  activeUi?.showBootFailure()
})
