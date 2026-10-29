import type { Audio } from '../engine/audio'
import type { I18n } from '../engine/i18n'
import type { Input } from '../engine/input'
import { insertScore, mergeProgress, type Locale, type Quality, type SaveData, type SaveStore } from '../engine/save'
import type { HudState, Hint, PopupKind } from '../game/game'
import { LEVELS, type LevelDef } from '../game/levels'
import type { RunState } from '../game/rules'
import { CONFIG } from '../game/config'

/**
 * HTML/CSS game UI: every screen is a `[data-screen]` section; only one is active. Buttons are
 * real <button>s so mouse, touch, keyboard and gamepad (via focus navigation) all work.
 */
export type Screen = 'boot' | 'title' | 'levels' | 'hud' | 'pause' | 'settings' | 'results' | 'leaderboard'

export type UiActions = {
  play(level: number): void
  resume(): void
  restart(): void
  quit(): void
  previewLevel(level: number): void
  settings(patch: Partial<SaveData>): void
  pause(): void
  survey(): void
}

const ICON = {
  pause: '<svg viewBox="0 0 24 24"><rect x="5" y="4" width="5" height="16" rx="1.5"/><rect x="14" y="4" width="5" height="16" rx="1.5"/></svg>',
  eye: '<svg viewBox="0 0 24 24"><path d="M1.5 12S5.5 4.5 12 4.5 22.5 12 22.5 12 18.5 19.5 12 19.5 1.5 12 1.5 12Z"/><circle cx="12" cy="12" r="3.6" fill="#1b1430"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="M12 1.8l3.1 6.6 7.2.9-5.3 5 1.4 7.1L12 17.9l-6.4 3.5L7 14.3 1.7 9.3l7.2-.9Z"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="12" rx="2.5"/><path d="M7.5 10V7a4.5 4.5 0 0 1 9 0v3" fill="none" stroke="currentColor" stroke-width="3"/></svg>',
  helmet: '<svg viewBox="0 0 24 24"><path d="M3 15a9 9 0 0 1 18 0v2H3Z"/><rect x="1.5" y="16" width="21" height="3.5" rx="1.5"/><rect x="10.8" y="4" width="2.4" height="8" rx="1" fill="#1b1430" opacity=".35"/></svg>',
  stone: '<svg viewBox="0 0 24 24"><path d="M6 4.5 15.5 3l5.5 6-1.5 8.5-8 4-7-3.5L3 10Z"/><path d="M8 8l5-1.5M6.5 13l4 1" stroke="#1b1430" stroke-width="1.2" opacity=".35" fill="none"/></svg>',
}

export class Ui {
  screen: Screen = 'boot'
  private root: HTMLElement
  private screens = new Map<Screen, HTMLElement>()
  private settingsReturn: Screen = 'title'
  private boardReturn: Screen = 'title'
  private boardLevel = 0
  private lastResult: { run: RunState; level: LevelDef; stars: number; rank: number; entryAt: number } | null = null
  private navCooldown = 0
  private hudCache = ''
  private hintEl!: HTMLElement
  private bannerTimer = 0

  constructor(
    private readonly i18n: I18n,
    private readonly save: SaveStore,
    private readonly audio: Audio,
    private readonly input: Input,
    private readonly actions: UiActions,
  ) {
    this.root = document.getElementById('ui')!
    this.build()
    i18n.onChange(() => {
      this.build()
      this.show(this.screen)
      if (this.screen === 'results' && this.lastResult) this.renderResults(false)
    })
    window.addEventListener('keydown', e => {
      if ((e.target as HTMLElement)?.matches?.('input')) {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        return
      }
      if (e.key === 'Escape' || e.key === 'Backspace') {
        if (this.back()) {
          e.preventDefault()
          // The same key press must not also toggle pause in the game loop.
          this.input.consume('pause')
        }
      }
    })
  }

  private t(key: string, vars?: Record<string, string | number>): string {
    return this.i18n.t(key, vars)
  }

  // ─── construction ───────────────────────────────────────────────────────

  private build(): void {
    const t = (k: string, v?: Record<string, string | number>) => this.t(k, v)
    const d = this.save.data
    const langSeg = (['zh-CN', 'en'] as Locale[]).map(l => `<button class="seg ${this.i18n.locale === l ? 'on' : ''}" data-locale="${l}">${l === 'en' ? 'English' : '中文'}</button>`).join('')
    const qualSeg = (['low', 'medium', 'high'] as Quality[]).map(q => `<button class="seg ${d.quality === q ? 'on' : ''}" data-quality="${q}">${t(`settings.quality.${q}`)}</button>`).join('')
    const slider = (key: keyof SaveData, label: string, min: number, max: number, step: number) =>
      `<label class="row"><span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${d[key] as number}" data-setting="${key}"/><output>${this.fmt(key, d[key] as number)}</output></label>`
    const toggle = (key: keyof SaveData, label: string) =>
      `<label class="row"><span>${label}</span><button class="toggle ${d[key] ? 'on' : ''}" data-toggle="${key}"><i></i></button></label>`
    this.root.innerHTML = `
      <div class="vignette"></div>
      <div class="flash"></div>
      <div class="popups"></div>
      <div class="banner"><span></span></div>
      <div class="rotate"><div class="panel card"><h2 class="heading" data-text="${t('rotate.title')}">${t('rotate.title')}</h2><p>${t('rotate.body')}</p></div></div>
      <section data-screen="boot" class="screen boot">
        <div class="logo">
          <img class="logo-mark" src="./logo.png" width="72" height="72" alt="" aria-hidden="true" fetchpriority="high" />
          <h1 data-text="${t('game.title')}">${t('game.title')}</h1><small>${t('game.subtitle')}</small>
        </div>
        <div class="bar"><i></i></div>
        <p class="boot-note">${t('boot.loading')}</p>
        <p class="made-by">${t('credits.maker')}</p>
      </section>
      <section data-screen="title" class="screen title">
        <div class="logo big">
          <svg class="logo-mark" viewBox="0 0 80 42" aria-hidden="true"><path class="mark-flight" d="M8 28C22 5 51 5 68 24"/><path class="mark-wall" d="M10 23h9v-9h9v9h8v-9h9v9h7v-6h8v6h9v12H10z"/><path class="mark-stone" d="m55 4 5 5-5 5-5-5z"/></svg>
          <h1 data-text="${t('game.title')}">${t('game.title')}</h1><small>${t('game.subtitle')}</small>
        </div>
        <p class="tagline">${t('game.tagline')}</p>
        <nav class="menu">
          <button class="btn primary" data-act="play">${t('menu.play')}</button>
          <button class="btn" data-act="levels">${t('menu.levels')}</button>
          <button class="btn" data-act="board">${t('menu.leaderboard')}</button>
          <button class="btn" data-act="settings">${t('menu.settings')}</button>
        </nav>
        <div class="corner"><div class="segs small">${langSeg}</div></div>
        <p class="controls-note">${t(`title.controls.${this.input.method}`)}</p>
        <p class="made-by">${t('credits.maker')}</p>
      </section>
      <section data-screen="levels" class="screen levels">
        <h2 class="heading" data-text="${t('levels.title')}">${t('levels.title')}</h2>
        <div class="cards">${LEVELS.map(l => this.levelCard(l)).join('')}</div>
        <nav class="menu row"><button class="btn" data-act="back">${t('menu.back')}</button></nav>
      </section>
      <section data-screen="hud" class="screen hud">
        <div class="hud-tl panel slim">
          <div class="hud-level"></div>
          <div class="hud-score"><b>0</b><small>${t('hud.score')}</small></div>
        </div>
        <div class="hud-top"><div class="guards"></div><small>${t('hud.guards')}</small></div>
        <button class="icon-btn hud-pause" data-act="pause" aria-label="${t('menu.pause')}">${ICON.pause}</button>
        <div class="hud-ammo panel slim"><small>${t('hud.stones')}</small><div class="stones"></div></div>
        <div class="hud-aim panel slim">
          <div class="aim-read"><span class="k">${t('hud.angle')}</span><b class="pitch">36°</b><span class="k">${t('hud.power')}</span><b class="pow">0%</b></div>
          <div class="power"><i></i><em></em></div>
        </div>
        <button class="icon-btn hud-view" data-act="survey" aria-label="${t('hud.view')}">${ICON.eye}<span>${t('hud.view')}</span></button>
        <div class="skip">${t('hud.skip')}</div>
        <div class="hint panel"><div class="hint-icon"></div><p></p></div>
      </section>
      <section data-screen="pause" class="screen pause dim">
        <div class="panel card">
          <h2 class="heading" data-text="${t('pause.title')}">${t('pause.title')}</h2>
          <nav class="menu">
            <button class="btn primary" data-act="resume">${t('menu.resume')}</button>
            <button class="btn" data-act="restart">${t('menu.restart')}</button>
            <button class="btn" data-act="settings">${t('menu.settings')}</button>
            <button class="btn" data-act="quit">${t('menu.quit')}</button>
          </nav>
          <p class="controls-note">${t(`pause.controls.${this.input.method}`)}</p>
        </div>
      </section>
      <section data-screen="settings" class="screen settings dim">
        <div class="panel card wide">
          <h2 class="heading" data-text="${t('settings.title')}">${t('settings.title')}</h2>
          <div class="settings-grid">
            <div class="col">
              <h3>${t('settings.audio')}</h3>
              ${slider('masterVolume', t('settings.master'), 0, 1, 0.05)}
              ${slider('musicVolume', t('settings.music'), 0, 1, 0.05)}
              ${slider('sfxVolume', t('settings.sfx'), 0, 1, 0.05)}
              <h3>${t('settings.controls')}</h3>
              ${slider('sensitivity', t('settings.sensitivity'), 0.4, 2, 0.1)}
              ${toggle('invertDrag', t('settings.invertDrag'))}
            </div>
            <div class="col">
              <h3>${t('settings.video')}</h3>
              <div class="row"><span>${t('settings.quality')}</span><div class="segs">${qualSeg}</div></div>
              ${toggle('slowmo', t('settings.slowmo'))}
              ${toggle('reducedMotion', t('settings.reducedMotion'))}
              <h3>${t('settings.language')}</h3>
              <div class="row"><span>${t('settings.language')}</span><div class="segs">${langSeg}</div></div>
            </div>
          </div>
          <nav class="menu row"><button class="btn primary" data-act="back">${t('menu.back')}</button></nav>
          <p class="credits"><b>${t('credits.maker')}</b><br>${t('credits.fonts')}</p>
        </div>
      </section>
      <section data-screen="results" class="screen results dim"><div class="panel card"></div></section>
      <section data-screen="leaderboard" class="screen leaderboard dim">
        <div class="panel card wide">
          <h2 class="heading" data-text="${t('board.title')}">${t('board.title')}</h2>
          <div class="segs tabs">${LEVELS.map((l, i) => `<button class="seg ${i === this.boardLevel ? 'on' : ''}" data-board="${i}">${t(`level.${l.id}.name`)}</button>`).join('')}</div>
          <div class="board"></div>
          <nav class="menu row"><button class="btn primary" data-act="back">${t('menu.back')}</button></nav>
        </div>
      </section>
    `
    this.screens.clear()
    this.root.querySelectorAll<HTMLElement>('[data-screen]').forEach(el => this.screens.set(el.dataset.screen as Screen, el))
    this.hintEl = this.root.querySelector('.hint')!
    this.hudCache = ''
    this.wire()
    this.renderBoard()
  }

  private levelCard(l: LevelDef): string {
    const p = this.save.data.progress[l.id]
    const locked = !this.unlocked(l.index)
    const stars = [0, 1, 2].map(i => `<i class="${p && p.stars > i ? 'on' : ''}">${ICON.star}</i>`).join('')
    return `<button class="level-card ${locked ? 'locked' : ''} theme-${l.theme}" data-level="${l.index}" ${locked ? 'aria-disabled="true"' : ''}>
      <span class="num">${l.index + 1}</span>
      <span class="art art-${l.id}"></span>
      <b>${this.t(`level.${l.id}.name`)}</b>
      <small>${this.t(`level.${l.id}.desc`)}</small>
      <span class="stars">${stars}</span>
      <span class="best">${p?.best ? this.t('levels.best', { score: p.best.toLocaleString() }) : this.t('levels.new')}</span>
      <span class="meta">${this.t('levels.meta', { stones: l.ammo, guards: l.pieces.filter(x => x.kind === 'guard').length })}</span>
      ${locked ? `<span class="lock">${ICON.lock}<em>${this.t('levels.locked')}</em></span>` : ''}
    </button>`
  }

  unlocked(index: number): boolean {
    if (index === 0) return true
    const prev = LEVELS[index - 1]
    return (this.save.data.progress[prev.id]?.stars ?? 0) > 0
  }

  private wire(): void {
    const click = (sel: string, fn: (el: HTMLElement) => void) =>
      this.root.querySelectorAll<HTMLElement>(sel).forEach(el =>
        el.addEventListener('click', e => {
          e.stopPropagation()
          this.audio.unlock()
          fn(el)
        }),
      )
    click('[data-act]', el => this.act(el.dataset.act!))
    click('[data-level]', el => {
      const i = Number(el.dataset.level)
      if (!this.unlocked(i)) {
        this.audio.play('uiBack')
        el.classList.remove('shake')
        void el.offsetWidth
        el.classList.add('shake')
        return
      }
      this.audio.play('ui')
      this.actions.play(i)
    })
    this.root.querySelectorAll<HTMLElement>('[data-level]').forEach(el => {
      const i = Number(el.dataset.level)
      const hover = () => {
        if (this.unlocked(i)) this.actions.previewLevel(i)
      }
      el.addEventListener('pointerenter', hover)
      el.addEventListener('focus', hover)
    })
    click('[data-locale]', el => {
      this.audio.play('ui')
      this.actions.settings({ locale: el.dataset.locale as Locale })
    })
    click('[data-quality]', el => {
      this.audio.play('ui')
      this.actions.settings({ quality: el.dataset.quality as Quality })
      this.root.querySelectorAll('[data-quality]').forEach(b => b.classList.toggle('on', b === el))
    })
    click('[data-toggle]', el => {
      const key = el.dataset.toggle as keyof SaveData
      const value = !this.save.data[key]
      this.audio.play(value ? 'ui' : 'uiBack')
      el.classList.toggle('on', value)
      this.actions.settings({ [key]: value } as Partial<SaveData>)
    })
    click('[data-board]', el => {
      this.boardLevel = Number(el.dataset.board)
      this.root.querySelectorAll('[data-board]').forEach(b => b.classList.toggle('on', b === el))
      this.audio.play('ui')
      this.renderBoard()
    })
    this.root.querySelectorAll<HTMLInputElement>('input[type=range]').forEach(el => {
      el.addEventListener('input', () => {
        const key = el.dataset.setting as keyof SaveData
        const v = Number(el.value)
        ;(el.nextElementSibling as HTMLOutputElement).textContent = this.fmt(key, v)
        this.actions.settings({ [key]: v } as Partial<SaveData>)
      })
      el.addEventListener('change', () => this.audio.play('ui'))
    })
    // Hover focuses buttons so keyboard/gamepad and mouse share one highlight.
    this.root.querySelectorAll<HTMLElement>('button').forEach(b => b.addEventListener('pointerenter', () => b.focus({ preventScroll: true })))
  }

  private fmt(key: keyof SaveData, v: number): string {
    return key === 'sensitivity' ? `${v.toFixed(1)}×` : `${Math.round(v * 100)}`
  }

  private act(a: string): void {
    this.audio.play(a === 'back' || a === 'quit' ? 'uiBack' : 'ui')
    switch (a) {
      case 'play': {
        // Continue from the first level without 3 stars that is unlocked, else level 1.
        const next = LEVELS.findIndex(l => this.unlocked(l.index) && (this.save.data.progress[l.id]?.stars ?? 0) === 0)
        this.actions.play(next >= 0 ? next : 0)
        break
      }
      case 'levels':
        this.show('levels')
        break
      case 'board':
        this.boardReturn = this.screen
        this.show('leaderboard')
        break
      case 'settings':
        this.settingsReturn = this.screen
        this.show('settings')
        break
      case 'back':
        this.back()
        break
      case 'resume':
        this.actions.resume()
        break
      case 'restart':
        this.actions.restart()
        break
      case 'quit':
        this.actions.quit()
        break
      case 'pause':
        this.actions.pause()
        break
      case 'survey':
        this.actions.survey()
        break
      case 'next':
        if (this.lastResult) this.actions.play(Math.min(LEVELS.length - 1, this.lastResult.level.index + 1))
        break
      case 'retry':
        this.actions.restart()
        break
      case 'toLevels':
        this.actions.quit()
        this.show('levels')
        break
    }
  }

  /** Escape / B: go back one level of menus. Returns true when handled. */
  back(): boolean {
    switch (this.screen) {
      case 'levels':
        this.show('title')
        return true
      case 'settings':
        this.show(this.settingsReturn)
        return true
      case 'leaderboard':
        this.show(this.boardReturn)
        return true
      case 'pause':
        this.actions.resume()
        return true
      default:
        return false
    }
  }

  show(screen: Screen): void {
    if (screen === 'levels' && this.screen !== 'levels') {
      // Rebuild cards so stars/best/unlocks are current.
      const cards = this.root.querySelector('.levels .cards')
      if (cards) {
        cards.innerHTML = LEVELS.map(l => this.levelCard(l)).join('')
        this.wireCards()
      }
    }
    this.screen = screen
    for (const [name, el] of this.screens) el.classList.toggle('is-active', name === screen)
    this.root.classList.toggle('in-game', screen === 'hud')
    if (screen === 'leaderboard') this.renderBoard()
    if (screen !== 'hud') this.hint(null)
    // Focus the primary button for keyboard / gamepad navigation.
    if (screen !== 'hud' && screen !== 'boot') {
      const el = this.screens.get(screen)
      const first = el?.querySelector<HTMLElement>('.btn.primary, .level-card:not(.locked), .btn')
      window.setTimeout(() => {
        if (this.input.method !== 'touch') first?.focus({ preventScroll: true })
      }, 30)
    } else (document.activeElement as HTMLElement | null)?.blur?.()
  }

  private wireCards(): void {
    this.root.querySelectorAll<HTMLElement>('.levels [data-level]').forEach(el => {
      const i = Number(el.dataset.level)
      el.addEventListener('click', e => {
        e.stopPropagation()
        if (!this.unlocked(i)) {
          this.audio.play('uiBack')
          el.classList.remove('shake')
          void el.offsetWidth
          el.classList.add('shake')
          return
        }
        this.audio.play('ui')
        this.actions.play(i)
      })
      const hover = () => {
        if (this.unlocked(i)) this.actions.previewLevel(i)
      }
      el.addEventListener('pointerenter', () => {
        el.focus({ preventScroll: true })
        hover()
      })
      el.addEventListener('focus', hover)
    })
  }

  setBootProgress(p: number): void {
    const bar = this.root.querySelector<HTMLElement>('.boot .bar i')
    if (bar) bar.style.width = `${Math.round(p * 100)}%`
  }

  showBootFailure(): void {
    const boot = this.root.querySelector<HTMLElement>('.boot')
    if (!boot) return
    const note = boot.querySelector<HTMLElement>('.boot-note')
    if (note) note.textContent = this.t('boot.failed')
    if (!boot.querySelector('.boot-retry')) {
      const retry = document.createElement('button')
      retry.type = 'button'
      retry.className = 'btn primary boot-retry'
      retry.textContent = this.t('boot.retry')
      retry.addEventListener('click', () => window.location.reload())
      boot.append(retry)
    }
    this.show('boot')
  }

  refreshSettings(): void {
    const s = this.screen
    this.build()
    this.show(s)
  }

  // ─── in-game feedback ───────────────────────────────────────────────────

  updateHud(h: HudState, levelId: string): void {
    const key = `${h.ammo}|${h.ammoMax}|${h.guardsLeft}|${h.guardsTotal}|${h.score}|${h.pitchDeg}|${Math.round(h.power * 100)}|${h.mode}|${h.canSkip}|${h.survey}|${h.charging}|${levelId}|${this.input.method}`
    if (key === this.hudCache) return
    const prev = this.hudCache.split('|')
    this.hudCache = key
    const hud = this.screens.get('hud')!
    hud.querySelector('.hud-level')!.textContent = `${h.level + 1} · ${this.t(`level.${levelId}.name`)}`
    const scoreEl = hud.querySelector('.hud-score b')!
    const scoreText = h.score.toLocaleString()
    if (scoreEl.textContent !== scoreText) {
      scoreEl.textContent = scoreText
      scoreEl.classList.remove('bump')
      void (scoreEl as HTMLElement).offsetWidth
      scoreEl.classList.add('bump')
    }
    const guards = hud.querySelector('.guards')!
    if (prev[2] !== String(h.guardsLeft) || prev[3] !== String(h.guardsTotal)) {
      guards.innerHTML = Array.from({ length: h.guardsTotal }, (_, i) => `<i class="${i < h.guardsTotal - h.guardsLeft ? 'down' : ''}">${ICON.helmet}</i>`).join('')
    }
    const stones = hud.querySelector('.stones')!
    if (prev[0] !== String(h.ammo) || prev[1] !== String(h.ammoMax)) {
      stones.innerHTML = Array.from({ length: h.ammoMax }, (_, i) => `<i class="${i < h.ammo ? '' : 'used'}">${ICON.stone}</i>`).join('')
    }
    const aiming = h.mode === 'aiming' && !h.survey
    hud.classList.toggle('aiming', aiming)
    hud.classList.toggle('charging', h.charging)
    hud.classList.toggle('surveying', h.survey)
    hud.querySelector('.pitch')!.textContent = `${h.pitchDeg}°`
    hud.querySelector('.pow')!.textContent = `${Math.round(h.power * 100)}%`
    const bar = hud.querySelector<HTMLElement>('.power i')!
    bar.style.width = `${h.power * 100}%`
    hud.querySelector<HTMLElement>('.power')!.classList.toggle('max', h.power > 0.97)
    hud.querySelector('.skip')!.classList.toggle('on', h.canSkip)
    hud.querySelector('.skip')!.textContent = this.t(`hud.skip.${this.input.method}`)
  }

  hint(h: Hint): void {
    if (!this.hintEl) return
    if (!h) {
      this.hintEl.classList.remove('on')
      return
    }
    const m = this.input.method
    this.hintEl.querySelector('p')!.innerHTML = this.t(`hint.${h}.${m}`)
    this.hintEl.querySelector('.hint-icon')!.className = `hint-icon icon-${h}`
    this.hintEl.classList.add('on')
  }

  popup(text: string, x: number, y: number, kind: PopupKind): void {
    const host = this.root.querySelector('.popups')!
    // Keep the screen readable during big collapses: small score ticks give way first.
    if (kind === 'score' && host.childElementCount > 9) return
    if (host.childElementCount > 18) host.firstElementChild?.remove()
    const el = document.createElement('div')
    el.className = `popup ${kind}`
    el.textContent = text
    el.style.left = `${x}px`
    el.style.top = `${y}px`
    el.style.setProperty('--dx', `${(Math.random() - 0.5) * 40}px`)
    host.appendChild(el)
    window.setTimeout(() => el.remove(), 1300)
  }

  banner(key: string, vars?: Record<string, string | number>): void {
    const el = this.root.querySelector<HTMLElement>('.banner')!
    const span = el.querySelector('span')!
    span.textContent = this.t(key, vars)
    span.setAttribute('data-text', span.textContent)
    el.classList.remove('on')
    void el.offsetWidth
    el.classList.add('on')
    clearTimeout(this.bannerTimer)
    this.bannerTimer = window.setTimeout(() => el.classList.remove('on'), 2100)
  }

  flash(strength: number): void {
    const el = this.root.querySelector<HTMLElement>('.flash')!
    el.style.setProperty('--a', String(Math.min(0.85, strength)))
    el.classList.remove('on')
    void el.offsetWidth
    el.classList.add('on')
  }

  // ─── results & leaderboard ──────────────────────────────────────────────

  showResults(run: RunState, level: LevelDef, stars: number): void {
    const won = run.phase === 'won'
    let rank = -1
    const entryAt = Date.now()
    if (won && !run.unranked) {
      this.save.update({ progress: mergeProgress(this.save.data.progress, level.id, stars, run.score) })
      const board = this.save.data.boards[level.id] ?? []
      const trial = insertScore(board, { name: '', score: run.score, stars, shots: run.shots, at: entryAt })
      rank = trial.rank
    }
    this.lastResult = { run, level, stars, rank, entryAt }
    this.show('results')
    this.renderResults(true)
  }

  private renderResults(animate: boolean): void {
    const r = this.lastResult
    if (!r) return
    const { run, level, stars, rank } = r
    const won = run.phase === 'won'
    const card = this.root.querySelector<HTMLElement>('.results .card')!
    const t = (k: string, v?: Record<string, string | number>) => this.t(k, v)
    const best = this.save.data.progress[level.id]?.best ?? 0
    const isNext = won && level.index < LEVELS.length - 1
    const saved = !run.unranked && this.save.data.boards[level.id]?.some(e => e.at === r.entryAt)
    card.innerHTML = `
      <h2 class="heading ${won ? 'win' : 'lose'}" data-text="${t(won ? 'results.win' : 'results.lose')}">${t(won ? 'results.win' : 'results.lose')}</h2>
      <p class="sub">${t(`level.${level.id}.name`)}</p>
      <div class="big-stars">${[0, 1, 2].map(i => `<i class="${i < stars ? 'earn' : ''}" style="--d:${0.35 + i * 0.32}s">${ICON.star}</i>`).join('')}</div>
      <dl class="tally">
        <dt>${t('results.destruction')}</dt><dd>${run.destruction.toLocaleString()}</dd>
        <dt>${t('results.guards', { n: run.guardsTotal - run.guardsLeft, total: run.guardsTotal })}</dt><dd>${run.guardPoints.toLocaleString()}</dd>
        <dt>${t('results.ammo', { n: won ? run.ammo : 0, each: CONFIG.score.ammoBonus })}</dt><dd>${run.ammoBonus.toLocaleString()}</dd>
        <dt>${t('results.chain')}</dt><dd>${run.bestChain}×</dd>
        <dt class="total">${t('results.total')}</dt><dd class="total">${run.score.toLocaleString()}</dd>
      </dl>
      <p class="best-line">${won && !run.unranked && run.score >= best ? `<b class="newbest">${t('results.newBest')}</b>` : t('results.best', { score: best.toLocaleString() })}
        · ${t('results.thresholds', { two: level.stars[0].toLocaleString(), three: level.stars[1].toLocaleString() })}</p>
      ${run.unranked ? `<p class="unranked-notice">${t('results.unranked')}</p>` : ''}
      ${won && !run.unranked && rank >= 0 && !saved ? `<form class="name-entry"><label>${t('results.rank', { rank: rank + 1 })}</label><input maxlength="12" value="${escapeHtml(this.save.data.playerName)}" placeholder="${t('results.namePlaceholder')}" /><button class="btn small" type="submit">${t('results.saveScore')}</button></form>` : ''}
      ${saved ? `<p class="saved">${t('results.saved')}</p>` : ''}
      <nav class="menu row">
        ${isNext ? `<button class="btn primary" data-res="next">${t('results.next')}</button>` : ''}
        <button class="btn ${isNext ? '' : 'primary'}" data-res="retry">${t('results.retry')}</button>
        <button class="btn" data-res="levels">${t('results.levels')}</button>
        <button class="btn" data-res="board">${t('menu.leaderboard')}</button>
      </nav>`
    card.classList.toggle('animate', animate)
    card.querySelectorAll<HTMLElement>('[data-res]').forEach(b => {
      b.addEventListener('pointerenter', () => b.focus({ preventScroll: true }))
      b.addEventListener('click', e => {
        e.stopPropagation()
        const a = b.dataset.res!
        if (a === 'board') {
          this.boardLevel = level.index
          this.root.querySelectorAll('[data-board]').forEach((x, i) => x.classList.toggle('on', i === level.index))
          this.boardReturn = 'results'
          this.audio.play('ui')
          this.show('leaderboard')
        } else this.act(a === 'levels' ? 'toLevels' : a)
      })
    })
    const form = card.querySelector('form')
    form?.addEventListener('submit', e => {
      e.preventDefault()
      const input = form.querySelector('input')!
      const name = input.value.trim().slice(0, 12) || this.t('results.anon')
      const board = this.save.data.boards[level.id] ?? []
      const res = insertScore(board, { name, score: run.score, stars, shots: run.shots, at: r.entryAt })
      this.save.update({ playerName: name, boards: { ...this.save.data.boards, [level.id]: res.board } })
      this.audio.play('star')
      this.renderResults(false)
    })
    if (animate && won) for (let i = 0; i < stars; i += 1) window.setTimeout(() => this.audio.play('star', { pitch: 1 + i * 0.12 }), (350 + i * 320))
    window.setTimeout(() => {
      if (this.input.method !== 'touch') card.querySelector<HTMLElement>('form input, .btn.primary')?.focus({ preventScroll: true })
    }, animate ? 900 : 30)
  }

  private renderBoard(): void {
    const el = this.root.querySelector('.leaderboard .board')
    if (!el) return
    const level = LEVELS[this.boardLevel]
    const list = this.save.data.boards[level.id] ?? []
    if (!list.length) {
      el.innerHTML = `<p class="empty">${this.t('board.empty')}</p>`
      return
    }
    el.innerHTML = `<table><thead><tr><th>#</th><th>${this.t('board.name')}</th><th>${this.t('board.stars')}</th><th>${this.t('board.shots')}</th><th>${this.t('board.score')}</th></tr></thead><tbody>${list
      .map((e, i) => `<tr class="${this.lastResult?.entryAt === e.at ? 'me' : ''}"><td>${i + 1}</td><td>${escapeHtml(e.name)}</td><td class="st">${'★'.repeat(e.stars)}<span>${'★'.repeat(3 - e.stars)}</span></td><td>${e.shots}</td><td>${e.score.toLocaleString()}</td></tr>`)
      .join('')}</tbody></table>`
  }

  // ─── keyboard / gamepad menu navigation ─────────────────────────────────

  /** Call once per frame. Moves focus with stick/D-pad/arrows and activates with A/Enter. */
  frame(dt: number): void {
    if (this.screen === 'hud' || this.screen === 'boot') return
    this.navCooldown -= dt
    const typing = document.activeElement?.matches?.('input[type=text], input:not([type])')
    const y = this.input.move.y
    const x = this.input.move.x
    const el = this.screens.get(this.screen)
    if (!el) return
    const focusables = [...el.querySelectorAll<HTMLElement>('button, input')].filter(b => b.offsetParent !== null)
    if (this.navCooldown <= 0 && !typing && (Math.abs(y) > 0.5 || Math.abs(x) > 0.5)) {
      const active = document.activeElement as HTMLElement | null
      if (active?.matches('input[type=range]') && Math.abs(x) > 0.5) {
        const r = active as HTMLInputElement
        r.value = String(Number(r.value) + Math.sign(x) * Number(r.step))
        r.dispatchEvent(new Event('input'))
      } else {
        const idx = Math.max(0, focusables.indexOf(active as HTMLElement))
        const next = this.spatialNext(focusables, idx, Math.abs(y) > Math.abs(x) ? (y > 0 ? 'up' : 'down') : x > 0 ? 'right' : 'left')
        next?.focus({ preventScroll: true })
        if (next) this.audio.play('ui', { volume: 0.5, pitch: 1.3 })
      }
      this.navCooldown = 0.2
    }
    if (Math.abs(y) < 0.3 && Math.abs(x) < 0.3) this.navCooldown = Math.min(this.navCooldown, 0)
    if (this.input.gamepadConnected && this.input.consume('confirm')) {
      const a = document.activeElement as HTMLElement | null
      if (a && a.tagName === 'BUTTON') a.click()
    }
    if (this.input.consume('back')) this.back()
  }

  private spatialNext(list: HTMLElement[], idx: number, dir: 'up' | 'down' | 'left' | 'right'): HTMLElement | undefined {
    const cur = list[idx]
    if (!cur) return list[0]
    const a = cur.getBoundingClientRect()
    const ax = a.left + a.width / 2
    const ay = a.top + a.height / 2
    let best: HTMLElement | undefined
    let bestScore = Infinity
    for (const el of list) {
      if (el === cur) continue
      const b = el.getBoundingClientRect()
      const bx = b.left + b.width / 2
      const by = b.top + b.height / 2
      const dx = bx - ax
      const dy = by - ay
      const ok = dir === 'up' ? dy < -4 : dir === 'down' ? dy > 4 : dir === 'left' ? dx < -4 : dx > 4
      if (!ok) continue
      const main = dir === 'up' || dir === 'down' ? Math.abs(dy) : Math.abs(dx)
      const cross = dir === 'up' || dir === 'down' ? Math.abs(dx) : Math.abs(dy)
      const score = main + cross * 2.2
      if (score < bestScore) {
        bestScore = score
        best = el
      }
    }
    return best
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
