import type { Audio } from '../engine/audio'
import type { I18n } from '../engine/i18n'
import type { Input } from '../engine/input'
import type { Locale, Quality, SaveData, SaveStore } from '../engine/save'
import { CONFIG } from '../game/config'
import type { HudInfo } from '../game/game'
import { formatTime, PAR_SECONDS, type RunState } from '../game/rules'
import type { DeathCause } from '../game/sim'

export type Screen = 'boot' | 'title' | 'hud' | 'pause' | 'settings' | 'results'

export type UiActions = {
  play(): void
  resume(): void
  retry(): void
  restart(): void
  quit(): void
  settings(patch: Partial<SaveData>): void
}

const ICON = {
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="4" width="5" height="16" rx="1.5" fill="currentColor"/><rect x="14" y="4" width="5" height="16" rx="1.5" fill="currentColor"/></svg>',
  skull: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C6.9 2 3 5.7 3 10.4c0 2.7 1.3 4.9 3.3 6.3V20a1 1 0 0 0 1 1h2v-2h1.4v2h2.6v-2H15v2h1.7a1 1 0 0 0 1-1v-3.3c2-1.4 3.3-3.6 3.3-6.3C21 5.7 17.1 2 12 2Zm-3.6 11.2a2 2 0 1 1 0-4 2 2 0 0 1 0 4Zm7.2 0a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z" fill="currentColor"/></svg>',
  flake: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1v22M2.5 6.5l19 11M2.5 17.5l19-11M9 3l3 3 3-3M9 21l3-3 3 3M3 9.8l4-.7-1.3-3.8M21 14.2l-4 .7 1.3 3.8M3 14.2l4 .7-1.3 3.8M21 9.8l-4-.7 1.3-3.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
}

const GLYPH = {
  keyboard: { left: '<kbd>A</kbd>', right: '<kbd>D</kbd>', jump: '<kbd class="wide">Space</kbd>', slam: '<kbd class="wide">Shift</kbd>', brake: '<kbd>S</kbd>', select: '<kbd>Enter</kbd>', back: '<kbd>Esc</kbd>' },
  gamepad: { left: '<kbd class="round">L</kbd>', right: '', jump: '<kbd class="round a">A</kbd>', slam: '<kbd class="round x">X</kbd>', brake: '<kbd class="round">L↓</kbd>', select: '<kbd class="round a">A</kbd>', back: '<kbd class="round b">B</kbd>' },
}

/**
 * DOM game UI layered over the canvas. Screens are keyboard-, gamepad- and touch-navigable;
 * all text comes from i18n keys and re-renders on language change.
 */
export class Ui {
  screen: Screen = 'boot'
  private readonly root: HTMLElement
  private readonly stack: Screen[] = []
  private readonly hudCache = new Map<string, string>()
  private hintKey: string | null = null
  private hintTimer = 0
  private navRepeat = 0
  private lastMethod = ''
  private dangerShown = false

  constructor(
    private readonly i18n: I18n,
    private readonly save: SaveStore,
    private readonly audio: Audio,
    private readonly input: Input,
    private readonly actions: UiActions,
  ) {
    this.root = document.getElementById('ui')!
    this.root.innerHTML = this.template()
    this.root.addEventListener('click', e => this.onClick(e))
    this.root.addEventListener('input', e => this.onInput(e))
    this.root.addEventListener('focusin', e => {
      if ((e.target as HTMLElement).matches('.btn, .seg button, .toggle')) this.audio.play('ui')
    })
    window.addEventListener('keydown', e => this.onKey(e))
    i18n.onChange(() => this.translate())
    this.translate()
    this.refreshSettings()
  }

  // ─── screens ────────────────────────────────────────────────────────────
  show(screen: Screen): void {
    this.stack.length = 0
    this.setScreen(screen)
  }

  push(screen: Screen): void {
    this.stack.push(this.screen)
    this.setScreen(screen)
  }

  back(): void {
    const prev = this.stack.pop()
    if (prev) this.setScreen(prev)
    else if (this.screen === 'pause') this.actions.resume()
  }

  private setScreen(screen: Screen): void {
    this.screen = screen
    const overHud = screen === 'pause' || screen === 'results' || (screen === 'settings' && this.stack.includes('pause'))
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-screen]')) {
      const active = el.dataset.screen === screen || (el.dataset.screen === 'hud' && overHud)
      el.classList.toggle('is-active', active)
      el.setAttribute('aria-hidden', String(!active))
    }
    this.root.dataset.activeScreen = screen
    if (screen === 'title') this.renderBest()
    if (screen === 'hud') this.dangerShown = false
    requestAnimationFrame(() => {
      const first = this.navItems()[0]
      if (first && this.input.method !== 'touch') first.focus({ preventScroll: true })
      else (document.activeElement as HTMLElement | null)?.blur?.()
    })
  }

  setBootProgress(progress: number): void {
    this.q<HTMLElement>('.boot-bar i').style.transform = `scaleX(${Math.max(0.04, Math.min(1, progress))})`
  }

  // ─── HUD ────────────────────────────────────────────────────────────────
  updateHud(h: HudInfo): void {
    this.set('time', formatTime(h.time))
    this.set('deaths', String(h.deaths))
    this.set('speed', String(h.kmh))
    this.q<HTMLElement>('.hud-progress-fill').style.transform = `scaleX(${h.progress})`
    this.q<HTMLElement>('.hud-progress-rider').style.left = `${h.progress * 100}%`
    this.q<HTMLElement>('.hud-boost i').style.transform = `scaleX(${h.boost})`
    const ticks = this.q('.hud-progress-ticks')
    if (ticks.childElementCount !== h.checkpoints.length) {
      ticks.innerHTML = h.checkpoints.map(c => `<i style="left:${c * 100}%"></i>`).join('')
    }
    ticks.querySelectorAll('i').forEach((el, i) => el.classList.toggle('is-passed', h.progress >= h.checkpoints[i]))
    const frost = this.q<HTMLElement>('.hud-frost')
    frost.style.opacity = String(Math.min(1, h.danger * 1.1))
    const warn = this.q('.hud-danger')
    const hot = h.danger > 0.55
    warn.classList.toggle('is-active', hot)
    if (hot && !this.dangerShown) this.dangerShown = true
    if (h.danger < 0.2) this.dangerShown = false
    this.q('.hud-grind').classList.toggle('is-active', h.grinding)
    this.q('.hud-speed').classList.toggle('is-boost', h.boost > 0.25)
  }

  /** Big centre toast (section names, checkpoints, perfect slams). */
  toast(text: string, kind: 'section' | 'checkpoint' | 'perfect' | 'boost'): void {
    const el = document.createElement('div')
    el.className = `toast toast-${kind}`
    el.textContent = text
    this.q('.toasts').append(el)
    el.addEventListener('animationend', () => el.remove())
  }

  section(key: string, hint: string | null): void {
    const el = this.q('.banner')
    el.querySelector('b')!.textContent = this.i18n.t(key)
    el.classList.remove('show')
    void (el as HTMLElement).offsetWidth
    el.classList.add('show')
    // Hints teach the mechanics until the player has finished once.
    if (hint && this.save.data.clears === 0) this.hint(hint)
  }

  checkpoint(n: number, total: number): void {
    this.toast(this.i18n.t('hud.checkpoint', { n, total }), 'checkpoint')
  }

  death(cause: DeathCause): void {
    const el = this.q('.death')
    el.querySelector('b')!.textContent = this.i18n.t(`death.${cause}`)
    el.classList.remove('show')
    void (el as HTMLElement).offsetWidth
    el.classList.add('show')
  }

  hint(key: string | null): void {
    this.hintKey = key
    this.hintTimer = key ? 5.5 : 0
    this.renderHint()
  }

  private renderHint(): void {
    const el = this.q('.hint')
    if (!this.hintKey) {
      el.classList.remove('is-active')
      return
    }
    const g = this.glyphs()
    el.querySelector('span')!.innerHTML = this.i18n.t(this.hintKey, { left: g.left, right: g.right, jump: g.jump, slam: g.slam, brake: g.brake })
    el.classList.add('is-active')
  }

  // ─── results ────────────────────────────────────────────────────────────
  showResults(run: RunState, newBest: boolean): void {
    const rank = run.rank ?? 'C'
    const el = this.q<HTMLElement>('.results-rank')
    el.textContent = rank
    el.dataset.rank = rank
    this.q('.r-time').textContent = formatTime(run.elapsed)
    this.q('.r-deaths').textContent = String(run.deaths)
    this.q('.r-best').textContent = this.save.data.bestTime > 0 ? formatTime(this.save.data.bestTime) : '—'
    this.q('.r-par').textContent = formatTime(PAR_SECONDS * 1.12)
    this.q('.results-best').classList.toggle('is-active', newBest)
    this.q('.results-note').textContent = this.i18n.t('results.rankNote', { s: CONFIG.run.deathPenalty })
    this.show('results')
  }

  private renderBest(): void {
    const d = this.save.data
    this.q('.best-time').textContent = d.bestTime > 0 ? formatTime(d.bestTime) : this.i18n.t('title.none')
    const rank = this.q<HTMLElement>('.best-rank')
    rank.textContent = d.bestRank || ''
    rank.dataset.rank = d.bestRank
    rank.classList.toggle('is-hidden', !d.bestRank)
    this.q('.best-stats').textContent = this.i18n.t('title.stats', { clears: d.clears, deaths: d.totalDeaths })
  }

  // ─── settings ───────────────────────────────────────────────────────────
  refreshSettings(): void {
    const d = this.save.data
    this.q<HTMLInputElement>('[name="musicVolume"]').value = String(d.musicVolume)
    this.q<HTMLInputElement>('[name="sfxVolume"]').value = String(d.sfxVolume)
    for (const t of this.qa<HTMLButtonElement>('.toggle')) {
      const on = d[t.dataset.setting as 'muted' | 'reducedMotion'] === true
      t.setAttribute('aria-pressed', String(on))
      t.querySelector('span')!.setAttribute('data-i18n', on ? 'settings.on' : 'settings.off')
    }
    for (const b of this.qa<HTMLButtonElement>('.seg button')) {
      const key = b.parentElement!.dataset.setting as 'quality' | 'locale'
      const current = key === 'locale' ? this.i18n.locale : d.quality
      b.setAttribute('aria-pressed', String(b.dataset.value === current))
    }
    for (const r of this.qa<HTMLInputElement>('input[type="range"]')) r.style.setProperty('--fill', `${((Number(r.value) - Number(r.min)) / (Number(r.max) - Number(r.min))) * 100}%`)
    this.translate()
  }

  // ─── events ─────────────────────────────────────────────────────────────
  private onClick(e: MouseEvent): void {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action], .toggle, .seg button')
    if (!target) return
    this.audio.unlock()
    if (target.matches('.toggle')) {
      const key = target.dataset.setting as 'muted' | 'reducedMotion'
      this.actions.settings({ [key]: !this.save.data[key] })
      this.refreshSettings()
      this.audio.play('ui')
      return
    }
    if (target.matches('.seg button')) {
      const key = target.parentElement!.dataset.setting
      if (key === 'quality') this.actions.settings({ quality: target.dataset.value as Quality })
      if (key === 'locale') this.actions.settings({ locale: target.dataset.value as Locale })
      this.refreshSettings()
      this.audio.play('ui')
      return
    }
    switch (target.dataset.action) {
      case 'play': this.actions.play(); break
      case 'resume': this.actions.resume(); break
      case 'retry': this.actions.retry(); break
      case 'restart': this.actions.restart(); break
      case 'quit': this.actions.quit(); break
      case 'settings': this.push('settings'); break
      case 'back': this.back(); break
      case 'pause': window.dispatchEvent(new CustomEvent('game:pause')); break
    }
  }

  private onInput(e: Event): void {
    const el = e.target as HTMLInputElement
    if (el.type !== 'range') return
    el.style.setProperty('--fill', `${((Number(el.value) - Number(el.min)) / (Number(el.max) - Number(el.min))) * 100}%`)
    this.actions.settings({ [el.name]: Number(el.value) } as Partial<SaveData>)
  }

  private onKey(e: KeyboardEvent): void {
    if (this.screen === 'hud' || this.screen === 'boot') return
    if ((e.code === 'Escape' || e.code === 'Backspace') && this.screen !== 'title') {
      if (this.screen !== 'pause' && this.screen !== 'results') {
        e.preventDefault()
        this.input.consume('pause')
        this.back()
      }
      return
    }
    if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
      e.preventDefault()
      this.moveFocus(e.code === 'ArrowDown' ? 1 : -1)
    }
  }

  /** Per-frame work: hint timeout, input-method glyph refresh and gamepad menu navigation. */
  frame(frameSeconds: number): void {
    if (this.input.method !== this.lastMethod) {
      this.lastMethod = this.input.method
      this.renderPrompts()
      this.renderHint()
    }
    if (this.hintTimer > 0) {
      this.hintTimer -= frameSeconds
      if (this.hintTimer <= 0) this.hint(null)
    }
    if (this.screen === 'hud' || this.screen === 'boot') return
    if (this.input.method !== 'gamepad') {
      this.input.consume('confirm')
      this.input.consume('back')
      return
    }
    const y = this.input.move.y
    const x = this.input.move.x
    this.navRepeat = Math.max(0, this.navRepeat - frameSeconds)
    const active = document.activeElement as HTMLElement | null
    if (Math.abs(y) > 0.6 && this.navRepeat <= 0) {
      this.moveFocus(y < 0 ? 1 : -1)
      this.navRepeat = 0.22
    } else if (Math.abs(x) > 0.6 && this.navRepeat <= 0 && active?.matches('input[type="range"]')) {
      const r = active as HTMLInputElement
      r.value = String(Number(r.value) + Math.sign(x) * Number(r.step || 0.1))
      r.dispatchEvent(new Event('input', { bubbles: true }))
      this.navRepeat = 0.12
    } else if (Math.abs(x) > 0.6 && this.navRepeat <= 0 && active?.parentElement?.matches('.seg')) {
      const sib = (Math.sign(x) > 0 ? active.nextElementSibling : active.previousElementSibling) as HTMLElement | null
      sib?.focus()
      this.navRepeat = 0.22
    } else if (Math.abs(y) < 0.3 && Math.abs(x) < 0.3) {
      this.navRepeat = 0
    }
    if (this.input.consume('confirm')) active?.click()
    if (this.input.consume('back') && this.screen !== 'title') this.back()
  }

  private navItems(): HTMLElement[] {
    const screen = this.q(`[data-screen="${this.screen}"]`)
    return [...screen.querySelectorAll<HTMLElement>('[data-nav]')].filter(el => el.offsetParent !== null && !el.closest('.is-hidden'))
  }

  private moveFocus(dir: 1 | -1): void {
    const items = this.navItems()
    if (items.length === 0) return
    const rows: HTMLElement[][] = []
    for (const el of items) {
      const seg = el.parentElement?.matches('.seg') ? el.parentElement : null
      const last = rows[rows.length - 1]
      if (seg && last && last[0].parentElement === seg) last.push(el)
      else rows.push([el])
    }
    const current = rows.findIndex(r => r.includes(document.activeElement as HTMLElement))
    const next = rows[(current + dir + rows.length) % rows.length]
    ;(next.find(el => el.getAttribute('aria-pressed') === 'true') ?? next[0]).focus()
  }

  // ─── helpers ────────────────────────────────────────────────────────────
  private translate(): void {
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-i18n]')) el.textContent = this.i18n.t(el.dataset.i18n!)
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-i18n-label]')) el.setAttribute('aria-label', this.i18n.t(el.dataset.i18nLabel!))
    this.renderPrompts()
    this.renderHint()
    if (this.screen === 'title') this.renderBest()
    this.hudCache.clear()
    document.title = this.i18n.t('game.title')
  }

  renderPrompts(): void {
    const m = this.input.method
    const g = m === 'gamepad' ? GLYPH.gamepad : GLYPH.keyboard
    const html = m === 'touch' ? '' : `<span>${g.select} ${this.i18n.t('prompt.select')}</span><span>${g.back} ${this.i18n.t('prompt.back')}</span>`
    for (const el of this.qa('.prompts')) el.innerHTML = html
    const controls = this.q('.controls-list')
    const rows: [string, string][] =
      m === 'gamepad'
        ? [['<kbd class="round">L</kbd>', 'ctl.steer'], [GLYPH.gamepad.jump, 'ctl.jump'], [GLYPH.gamepad.slam + '<kbd class="round">LB</kbd>', 'ctl.slam'], [GLYPH.gamepad.brake, 'ctl.brake'], ['<kbd class="round">⧉</kbd>', 'ctl.restart'], ['<kbd class="round">☰</kbd>', 'ctl.pause']]
        : m === 'touch'
          ? [[this.glyphs().left + this.glyphs().right, 'ctl.steer'], [this.glyphs().jump, 'ctl.jump'], [this.glyphs().slam, 'ctl.slam'], [this.glyphs().brake, 'ctl.brake']]
          : [['<kbd>A</kbd><kbd>D</kbd> / <kbd>←</kbd><kbd>→</kbd>', 'ctl.steer'], ['<kbd class="wide">Space</kbd>', 'ctl.jump'], ['<kbd class="wide">Shift</kbd>', 'ctl.slam'], ['<kbd>S</kbd> / <kbd>↓</kbd>', 'ctl.brake'], ['<kbd>R</kbd>', 'ctl.restart'], ['<kbd>Esc</kbd>', 'ctl.pause']]
    controls.innerHTML = rows.map(([k, t]) => `<li><span>${k}</span><em>${this.i18n.t(t)}</em></li>`).join('')
  }

  private glyphs(): typeof GLYPH.keyboard {
    if (this.input.method === 'gamepad') return GLYPH.gamepad
    if (this.input.method !== 'touch') return GLYPH.keyboard
    const k = (key: string) => `<kbd class="wide">${this.i18n.t(key)}</kbd>`
    return { left: '<kbd>◀</kbd>', right: '<kbd>▶</kbd>', jump: k('touch.jump'), slam: k('touch.slam'), brake: k('touch.brake'), select: '', back: '' }
  }

  private set(key: string, value: string): boolean {
    if (this.hudCache.get(key) === value) return false
    this.hudCache.set(key, value)
    this.q(`[data-hud="${key}"]`).textContent = value
    return true
  }

  private q<T extends Element = Element>(sel: string): T {
    return this.root.querySelector<T>(sel)!
  }

  private qa<T extends Element = Element>(sel: string): T[] {
    return [...this.root.querySelectorAll<T>(sel)]
  }

  private template(): string {
    const range = (name: string, label: string) =>
      `<label class="row"><span data-i18n="${label}"></span><input data-nav type="range" name="${name}" min="0" max="1" step="0.05" /></label>`
    const toggle = (setting: string, label: string) =>
      `<div class="row"><span data-i18n="${label}"></span><button data-nav class="toggle" data-setting="${setting}" aria-pressed="false"><span data-i18n="settings.off"></span><i></i></button></div>`
    return `
<section class="screen screen-boot is-active" data-screen="boot">
  <div class="boot-logo">FROSTLINE <em>ZERO</em></div>
  <div class="boot-bar"><i></i></div>
  <div class="boot-label" data-i18n="boot.loading"></div>
</section>

<section class="screen screen-title" data-screen="title">
  <div class="title-vignette"></div>
  <div class="title-block">
    <div class="logo">
      <span class="logo-icon">${ICON.flake}</span>
      <div>
        <h1 class="logo-text" data-i18n="game.title"></h1>
        <div class="logo-sub" data-i18n="game.sub"></div>
      </div>
    </div>
    <p class="tagline" data-i18n="game.tagline"></p>
    <nav class="menu">
      <button class="btn btn-primary" data-nav data-action="play"><span data-i18n="menu.play"></span></button>
      <button class="btn" data-nav data-action="settings"><span data-i18n="menu.settings"></span></button>
    </nav>
  </div>
  <aside class="title-side">
    <div class="best-card">
      <span class="best-label" data-i18n="title.best"></span>
      <div class="best-row"><b class="best-time"></b><i class="best-rank rank-badge"></i></div>
      <small class="best-stats"></small>
    </div>
    <div class="controls-card">
      <span class="best-label" data-i18n="title.controls"></span>
      <ul class="controls-list"></ul>
    </div>
  </aside>
  <footer class="bottom-bar"><div class="prompts"></div><small data-i18n="credits.fonts"></small></footer>
</section>

<section class="screen screen-hud" data-screen="hud">
  <div class="hud-frost"></div>
  <div class="hud-top-left">
    <div class="hud-panel hud-time"><span data-i18n="hud.time"></span><b data-hud="time">0:00.00</b></div>
    <div class="hud-panel hud-deaths">${ICON.skull}<b data-hud="deaths">0</b></div>
  </div>
  <div class="hud-top-center">
    <div class="hud-progress">
      <div class="hud-progress-fill"></div>
      <div class="hud-progress-ticks"></div>
      <div class="hud-progress-rider"></div>
      <div class="hud-progress-flag"></div>
    </div>
  </div>
  <div class="hud-top-right">
    <button class="hud-pause" data-action="pause" data-i18n-label="touch.pause">${ICON.pause}</button>
  </div>
  <div class="hud-speed"><b data-hud="speed">0</b><span data-i18n="hud.speed"></span><div class="hud-boost"><i></i></div></div>
  <div class="hud-grind" data-i18n="hud.grind"></div>
  <div class="hud-danger"><b data-i18n="hud.danger"></b></div>
  <div class="banner"><b></b></div>
  <div class="toasts"></div>
  <div class="death"><b></b><small data-i18n="death.retry"></small></div>
  <div class="hint"><span></span></div>
  <div class="touch">
    <button class="touch-btn touch-left" data-touch="left" data-i18n-label="touch.left">◀</button>
    <button class="touch-btn touch-right" data-touch="right" data-i18n-label="touch.right">▶</button>
    <button class="touch-btn touch-brake" data-touch="brake"><span data-i18n="touch.brake"></span></button>
    <button class="touch-btn touch-slam" data-touch="slam"><span data-i18n="touch.slam"></span></button>
    <button class="touch-btn touch-jump" data-touch="jump"><span data-i18n="touch.jump"></span></button>
  </div>
</section>

<section class="screen screen-modal" data-screen="pause">
  <div class="modal">
    <h2 class="modal-title" data-i18n="pause.title"></h2>
    <nav class="menu">
      <button class="btn btn-primary" data-nav data-action="resume"><span data-i18n="menu.continue"></span></button>
      <button class="btn" data-nav data-action="retry"><span data-i18n="menu.retry"></span></button>
      <button class="btn" data-nav data-action="restart"><span data-i18n="menu.restart"></span></button>
      <button class="btn" data-nav data-action="settings"><span data-i18n="menu.settings"></span></button>
      <button class="btn" data-nav data-action="quit"><span data-i18n="menu.quit"></span></button>
    </nav>
  </div>
</section>

<section class="screen screen-modal" data-screen="settings">
  <div class="modal modal-wide">
    <h2 class="modal-title" data-i18n="settings.title"></h2>
    <div class="settings-grid">
      <fieldset><legend data-i18n="settings.audio"></legend>
        ${range('musicVolume', 'settings.music')}
        ${range('sfxVolume', 'settings.sfx')}
        ${toggle('muted', 'settings.mute')}
      </fieldset>
      <fieldset><legend data-i18n="settings.display"></legend>
        <div class="row"><span data-i18n="settings.quality"></span>
          <div class="seg" data-setting="quality">
            <button data-nav data-value="low" data-i18n="settings.quality.low"></button>
            <button data-nav data-value="medium" data-i18n="settings.quality.medium"></button>
            <button data-nav data-value="high" data-i18n="settings.quality.high"></button>
          </div>
        </div>
        ${toggle('reducedMotion', 'settings.reducedMotion')}
        <div class="row"><span data-i18n="settings.language"></span>
          <div class="seg" data-setting="locale">
            <button data-nav data-value="zh-CN">中文</button>
            <button data-nav data-value="en">English</button>
          </div>
        </div>
      </fieldset>
    </div>
    <nav class="menu menu-row"><button class="btn btn-small" data-nav data-action="back"><span data-i18n="menu.back"></span></button></nav>
  </div>
</section>

<section class="screen screen-modal screen-results" data-screen="results">
  <div class="modal modal-results">
    <h2 class="modal-title" data-i18n="results.won"></h2>
    <div class="results-hero">
      <div class="results-rank rank-badge"></div>
      <div class="results-best" data-i18n="results.newBest"></div>
    </div>
    <dl class="results-table">
      <div><dt data-i18n="results.time"></dt><dd class="r-time"></dd></div>
      <div><dt data-i18n="results.deaths"></dt><dd class="r-deaths"></dd></div>
      <div><dt data-i18n="results.best"></dt><dd class="r-best"></dd></div>
      <div><dt data-i18n="results.par"></dt><dd class="r-par"></dd></div>
    </dl>
    <small class="results-note"></small>
    <nav class="menu menu-row">
      <button class="btn btn-primary" data-nav data-action="restart"><span data-i18n="results.retry"></span></button>
      <button class="btn" data-nav data-action="quit"><span data-i18n="results.title"></span></button>
    </nav>
  </div>
</section>`
  }
}
