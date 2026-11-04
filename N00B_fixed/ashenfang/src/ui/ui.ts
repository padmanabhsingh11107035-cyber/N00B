import { Color } from 'three'
import type { AudioEngine } from '../engine/audio'
import { t } from '../engine/i18n'
import type { Device, Input } from '../engine/input'
import type { Quality, SaveStore, Settings } from '../engine/save'
import type { DamageKind, Game, GameHooks, GameMode, HudState, Prompt, ResultSummary, ScreenPulse, Tone } from '../game/game'
import { UiFx } from './uifx'
import { MONSTERS, monsterById } from '../game/monsters/defs'
import { formatClock } from '../game/rules'
import { CAMP, LAKE, SPIRES, WORLD } from '../game/terrain'
import { groundColor } from '../game/environment'
import { assetUrl } from '../game/assetPaths'

/**
 * DOM interface: title & quarry select, HUD, pause, settings, field guide, results, banners,
 * toasts and damage numbers. The HUD reads `game.hud()` each frame and only touches the DOM
 * when a value actually changes.
 */
const MAP_COLOR = new Color()
const UI = (name: string) => assetUrl(`assets/ui/${name}.webp`)
const BANNER_ICON: Record<Tone, string> = { gold: 'icon_sword', flow: 'icon_hook', danger: 'icon_claw', good: 'icon_herb', neutral: 'icon_claw' }
const CHARGE_COLORS = ['#ffe2a8', '#ffd27a', '#ffb347', '#ff8a3a']
/** SVG arc path on a 100x100 viewbox (degrees clockwise from 12 o'clock). */
const arc = (r: number, a0: number, a1: number) => {
  const p = (a: number) => `${(50 + Math.sin((a * Math.PI) / 180) * r).toFixed(2)} ${(50 - Math.cos((a * Math.PI) / 180) * r).toFixed(2)}`
  return `M ${p(a0)} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${p(a1)}`
}

type Screen = 'none' | 'title' | 'pause' | 'settings' | 'guide' | 'results' | 'confirm'

const PAD_KEYS: Record<string, string> = { LMB: 'X', RMB: 'Y', E: 'RB', Space: 'A', Shift: 'LB', F: 'B', R: 'D-Up', W: 'LS', A: 'LS', S: 'LS', D: 'LS' }
const TOUCH_KEYS: Record<string, string> = { LMB: 'Slash', RMB: 'Heavy', E: 'Hook', Space: 'Roll', Shift: 'Sprint', F: 'Use', R: 'Potion', W: 'Stick', A: 'Stick', S: 'Stick', D: 'Stick' }

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag)
  if (cls) el.className = cls
  if (html) el.innerHTML = html
  return el
}

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

export type UiActions = {
  start(): void
  resume(): void
  abandon(): void
  quarry(id: string): void
  settings(patch: Partial<Settings>): void
  resetTips(): void
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

export class Ui {
  readonly root: HTMLElement
  screen: Screen = 'none'
  private game?: Game
  private prevScreen: Screen = 'title'
  private screens = {} as Record<Exclude<Screen, 'none'>, HTMLElement>
  private hudEl!: HTMLElement
  private cache = new Map<HTMLElement, string>()
  private els = {} as Record<string, HTMLElement>
  private mapCanvas!: HTMLCanvasElement
  private mapBg?: HTMLCanvasElement
  private bannerTimer = 0
  private device: Device = 'keyboard'
  private dmgCount = 0
  private hurtT = 0
  private promptKey = ''
  private mountKey = ''
  private fx!: UiFx
  private lastPotions = -1
  private lastBroken = 0
  private lastHpFrac = 1
  private chargeShown = 0

  constructor(root: HTMLElement, private readonly save: SaveStore, private readonly audio: AudioEngine, input: Input, private readonly actions: UiActions) {
    this.root = root
    this.build()
    input.onDevice = d => {
      this.device = d
      this.root.dataset.device = d
      this.promptKey = ''
    }
  }

  bind(game: Game): void {
    this.game = game
    this.renderTitle()
  }

  get hooks(): GameHooks {
    return {
      banner: (title, sub, tone) => this.banner(title, sub, tone),
      toast: text => this.toast(text),
      damage: (x, y, amount, kind) => this.damage(x, y, amount, kind),
      hurt: amount => this.hurt(amount),
      pulse: k => this.pulse(k),
      chargeBurst: l => this.chargeBurst(l),
      mode: m => this.onMode(m),
      results: s => this.showResults(s),
    }
  }

  // ─── construction ──────────────────────────────────────────────────────
  private build(): void {
    const r = this.root
    r.innerHTML = ''
    const vignette = h('div', 'vignette')
    const hurt = h('div', 'hurt')
    this.els.vignette = vignette
    this.els.hurt = hurt
    r.append(vignette, hurt)
    this.buildHud()
    this.els.dmg = h('div', 'dmg-layer')
    this.els.banner = h(
      'div',
      'banner',
      `<img class="banner-bg" src="${UI('banner')}" alt=""><img class="banner-icon" src="${UI('icon_claw')}" alt=""><div class="banner-text"><div class="banner-title"></div><div class="banner-sub"></div></div>`,
    )
    this.els.toasts = h('div', 'toasts')
    this.els.flash = h('div', 'screen-flash')
    r.append(this.els.dmg, this.els.banner, this.els.toasts, this.els.flash)
    for (const s of ['title', 'pause', 'settings', 'guide', 'results', 'confirm'] as const) {
      const el = h('section', `screen screen-${s}`)
      el.hidden = true
      this.screens[s] = el
      r.append(el)
    }
    this.buildPause()
    this.buildConfirm()
    this.fx = new UiFx(r)
    // Interface juice: every button sparkles on hover and ripples on press.
    let hoverEl: Element | null = null
    r.addEventListener('pointerover', e => {
      const b = (e.target as HTMLElement).closest('.btn, .quarry, .tab, .seg button')
      if (!b || b === hoverEl) return
      hoverEl = b
      this.fx.edge(b, 10, b.classList.contains('primary') ? '#ffd27a' : '#f3ead7')
    })
    r.addEventListener('pointerdown', e => {
      const b = (e.target as HTMLElement).closest('.btn, .quarry, .tab, .seg button')
      if (!b) return
      this.fx.ring(e.clientX, e.clientY, 46, '#ffd27a', 0.4, 2.5)
      this.fx.burst(e.clientX, e.clientY, 12, '#ffe2a8', 220, 2.4)
      b.classList.remove('pressed')
      void (b as HTMLElement).offsetWidth
      b.classList.add('pressed')
    })
  }

  private buildHud(): void {
    const hud = h('div', 'hud')
    hud.hidden = true
    hud.innerHTML = `
      <div class="hud-vitals">
        <div class="pframe">
          <img class="pframe-art" src="${UI('player_frame')}" alt="">
          <div class="slot slot-hp hp"><div class="bar-red"></div><div class="bar-fill"></div><div class="bar-sheen"></div></div>
          <div class="slot slot-st st"><div class="bar-fill"></div><div class="bar-sheen"></div></div>
        </div>
        <div class="hud-items">
          <div class="item potion"><img src="${UI('icon_potion')}" alt=""><b class="potion-count">0</b></div>
          <div class="faints"></div>
        </div>
      </div>
      <div class="hud-boss">
        <div class="bframe">
          <img class="bframe-art" src="${UI('boss_frame')}" alt="">
          <div class="b-portrait"><img src="${UI('icon_claw')}" alt=""></div>
          <div class="boss-name"></div>
          <div class="slot slot-boss"><div class="boss-ghost"></div><div class="boss-fill"></div><div class="bar-sheen"></div></div>
        </div>
        <div class="boss-row"><span class="boss-tags"></span><span class="boss-vitals"></span></div>
        <div class="telegraph"></div>
      </div>
      <div class="hud-map">
        <div class="map-wrap"><canvas class="map" width="180" height="180"></canvas><img class="map-bezel" src="${UI('minimap')}" alt=""></div>
        <div class="objective"><span class="obj-text"></span><span class="obj-clock"></span></div>
      </div>
      <div class="reticle">
        <svg viewBox="0 0 100 100" class="ret-svg">
          <circle cx="50" cy="50" r="2.6" class="ret-dot"/>
          <circle cx="50" cy="50" r="12" class="ret-ring"/>
          <g class="ret-brackets"><path d="M30 38 V30 H38"/><path d="M62 30 H70 V38"/><path d="M70 62 V70 H62"/><path d="M38 70 H30 V62"/><path d="M50 40 L60 50 L50 60 L40 50 Z" class="ret-diamond"/></g>
        </svg>
        <div class="cring">
          <img src="${UI('ring')}" alt="">
          <svg viewBox="0 0 100 100">
            <path class="cseg-bg" d="${arc(40, 4, 116)}"/><path class="cseg-bg" d="${arc(40, 124, 236)}"/><path class="cseg-bg" d="${arc(40, 244, 356)}"/>
            <path class="cseg" data-i="0" pathLength="100" d="${arc(40, 4, 116)}"/><path class="cseg" data-i="1" pathLength="100" d="${arc(40, 124, 236)}"/><path class="cseg" data-i="2" pathLength="100" d="${arc(40, 244, 356)}"/>
          </svg>
        </div>
        <div class="ret-label"></div>
        <div class="ret-lock">${t('hud.lockOn')}</div>
      </div>
      <div class="grip">
        <img class="grip-ring" src="${UI('ring')}" alt="">
        <svg viewBox="0 0 100 100"><circle class="grip-bg" cx="50" cy="50" r="40"/><circle class="grip-fill" cx="50" cy="50" r="40" pathLength="100"/></svg>
        <img class="grip-icon" src="${UI('icon_hook')}" alt="">
        <div class="grip-label">${t('hud.grip')}</div>
      </div>
      <div class="combo"><span class="combo-name"></span><span class="combo-steps"><i></i><i></i><i></i></span></div>
      <div class="tip"><div class="tip-head">Field notes</div><div class="tip-text"></div></div>
      <div class="mount">
        <div class="mount-title"></div>
        <div class="mount-chain"></div>
        <div class="mount-ride"><div class="mount-ride-fill"></div></div>
      </div>
      <div class="brace"><div class="brace-text">${t('hud.brace')}</div><div class="brace-sub">${t('hud.braceHint')}</div></div>
      <div class="prompts"></div>
    `
    this.hudEl = hud
    this.root.append(hud)
    const q = (s: string) => hud.querySelector<HTMLElement>(s)!
    const names = {
      hpFill: '.hp .bar-fill', hpRed: '.hp .bar-red', hpBar: '.hp', stFill: '.st .bar-fill', stBar: '.st', potions: '.potion-count', faints: '.faints',
      boss: '.hud-boss', bossName: '.boss-name', bossTags: '.boss-tags', bossFill: '.boss-fill', bossGhost: '.boss-ghost', bossVitals: '.boss-vitals', telegraph: '.telegraph',
      objText: '.obj-text', objClock: '.obj-clock', reticle: '.reticle', retLabel: '.ret-label', cring: '.cring', combo: '.combo', comboName: '.combo-name',
      grip: '.grip', gripFill: '.grip-fill', vitals: '.hud-vitals', potion: '.potion', portrait: '.b-portrait', bossBar: '.slot-boss', mapWrap: '.map-wrap',
      comboSteps: '.combo-steps', tip: '.tip', tipText: '.tip-text', mount: '.mount', mountTitle: '.mount-title', mountChain: '.mount-chain', mountRide: '.mount-ride',
      mountRideFill: '.mount-ride-fill', brace: '.brace', prompts: '.prompts',
    }
    for (const [k, s] of Object.entries(names)) this.els[k] = q(s)
    this.mapCanvas = hud.querySelector('canvas.map')!
  }

  private buildPause(): void {
    const el = this.screens.pause
    el.innerHTML = `
      <div class="panel panel-pause">
        <h2>${t('pause.title')}</h2>
        <div class="menu">
          <button data-a="resume" class="btn primary">${t('pause.resume')}</button>
          <button data-a="settings" class="btn">${t('pause.settings')}</button>
          <button data-a="guide" class="btn">${t('pause.guide')}</button>
          <button data-a="abandon" class="btn danger">${t('pause.abandon')}</button>
        </div>
        ${this.controlsHtml()}
      </div>`
    el.addEventListener('click', e => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a
      if (!a) return
      this.audio.play('ui')
      if (a === 'resume') this.actions.resume()
      if (a === 'settings') this.openSettings('pause')
      if (a === 'guide') this.openGuide('pause')
      if (a === 'abandon') this.show('confirm')
    })
  }

  private buildConfirm(): void {
    const el = this.screens.confirm
    el.innerHTML = `
      <div class="panel panel-confirm">
        <p>${t('pause.abandonConfirm')}</p>
        <div class="row">
          <button data-a="no" class="btn primary">${t('common.no')}</button>
          <button data-a="yes" class="btn danger">${t('common.yes')}</button>
        </div>
      </div>`
    el.addEventListener('click', e => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a
      if (!a) return
      this.audio.play('ui')
      if (a === 'no') this.show('pause')
      if (a === 'yes') this.actions.abandon()
    })
  }

  private controlsHtml(): string {
    const rows: [string, string][] = [
      ['WASD', t('controls.move')],
      ['Mouse', t('controls.look')],
      ['Shift', t('controls.sprint')],
      ['Space', t('controls.dodge')],
      ['LMB', t('controls.attack')],
      ['RMB', t('controls.heavy')],
      ['E', t('controls.grapple')],
      ['C', t('controls.lockon')],
      ['R', t('controls.potion')],
      ['F', t('controls.interact')],
      ['Esc', t('controls.pause')],
    ]
    return `<div class="controls"><h3>${t('title.controls')}</h3><dl>${rows.map(([k, v]) => `<dt><kbd>${k}</kbd></dt><dd>${v}</dd>`).join('')}</dl></div>`
  }

  // ─── title ─────────────────────────────────────────────────────────────
  renderTitle(): void {
    const el = this.screens.title
    const current = this.game?.quarryId ?? this.save.data.quarry
    const cards = MONSTERS.map(m => {
      const rec = this.save.data.records[m.id]
      const best = rec && rec.bestTime > 0 ? t('title.best', { time: formatClock(rec.bestTime), rank: rec.bestRank }) : t('title.unhunted')
      const stars = Array.from({ length: 5 }, (_, i) => `<i class="${i < m.threat ? 'on' : ''}"></i>`).join('')
      return `
        <button class="quarry ${m.id === current ? 'selected' : ''}" data-q="${m.id}" style="--glow:${m.palette.glow}">
          <span class="q-name">${esc(m.name)}</span>
          <span class="q-title">${esc(m.title)}</span>
          <span class="q-meta"><span class="q-threat">${t('title.threat')} <span class="stars">${stars}</span></span><span class="q-best">${best}</span></span>
        </button>`
    }).join('')
    const def = monsterById(current)
    el.innerHTML = `
      <div class="title-left">
        <div class="logo">
          <div class="logo-mark"></div>
          <h1>${t('app.title')}</h1>
          <div class="logo-sub">${t('app.subtitle')}</div>
        </div>
        <p class="tagline">${t('app.tagline')}</p>
        <div class="quarry-label">${t('title.chooseQuarry')}</div>
        <div class="quarries">${cards}</div>
        <p class="quarry-desc">${esc(def.description)}</p>
        <div class="menu">
          <button class="btn primary big" data-a="start">${t('title.begin')}</button>
          <div class="row">
            <button class="btn" data-a="guide">${t('title.guide')}</button>
            <button class="btn" data-a="settings">${t('title.settings')}</button>
            <a class="btn" href="./enemies/">${t('title.library')}</a>
          </div>
        </div>
        <p class="hint">${t('title.clickToStart')}</p>
      </div>
      <div class="title-right">${this.controlsHtml()}</div>`
    el.onclick = e => {
      const target = e.target as HTMLElement
      const q = target.closest<HTMLElement>('[data-q]')?.dataset.q
      if (q) {
        this.audio.unlock()
        this.audio.play('ui')
        this.actions.quarry(q)
        this.renderTitle()
        return
      }
      const a = target.closest<HTMLElement>('[data-a]')?.dataset.a
      if (!a) return
      this.audio.unlock()
      this.audio.play(a === 'start' ? 'uiConfirm' : 'ui')
      if (a === 'start') this.actions.start()
      if (a === 'guide') this.openGuide('title')
      if (a === 'settings') this.openSettings('title')
    }
  }

  // ─── settings & guide ──────────────────────────────────────────────────
  private openSettings(from: Screen): void {
    this.prevScreen = from
    const s = this.save.settings
    const el = this.screens.settings
    const slider = (k: keyof Settings, min: number, max: number, step: number) =>
      `<label class="set"><span>${t(`settings.${k}`)}</span><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${s[k] as number}"/><output>${this.fmtSetting(k, s[k] as number)}</output></label>`
    const toggle = (k: keyof Settings) => `<label class="set toggle"><span>${t(`settings.${k}`)}</span><input type="checkbox" data-k="${k}" ${s[k] ? 'checked' : ''}/><i></i></label>`
    const qualities: Quality[] = ['low', 'medium', 'high']
    el.innerHTML = `
      <div class="panel panel-settings">
        <h2>${t('settings.title')}</h2>
        ${slider('music', 0, 1, 0.05)}
        ${slider('sfx', 0, 1, 0.05)}
        ${toggle('muted')}
        ${slider('sensitivity', 0.2, 3, 0.05)}
        ${toggle('invertY')}
        <label class="set"><span>${t('settings.quality')}</span><span class="seg">${qualities.map(q => `<button data-quality="${q}" class="${s.quality === q ? 'on' : ''}">${t(`settings.quality.${q}`)}</button>`).join('')}</span></label>
        ${toggle('shake')}
        ${toggle('damageNumbers')}
        ${toggle('tips')}
        <div class="row">
          <button class="btn" data-a="tips">${t('settings.resetTips')}</button>
          <button class="btn primary" data-a="back">${t('common.back')}</button>
        </div>
      </div>`
    el.oninput = e => {
      const inp = e.target as HTMLInputElement
      const k = inp.dataset.k as keyof Settings | undefined
      if (!k) return
      const value = inp.type === 'checkbox' ? inp.checked : Number(inp.value)
      this.actions.settings({ [k]: value } as Partial<Settings>)
      const out = inp.parentElement?.querySelector('output')
      if (out && typeof value === 'number') out.textContent = this.fmtSetting(k, value)
    }
    el.onclick = e => {
      const target = e.target as HTMLElement
      const q = target.closest<HTMLElement>('[data-quality]')?.dataset.quality as Quality | undefined
      if (q) {
        this.audio.play('ui')
        this.actions.settings({ quality: q })
        el.querySelectorAll('[data-quality]').forEach(b => b.classList.toggle('on', (b as HTMLElement).dataset.quality === q))
        return
      }
      const a = target.closest<HTMLElement>('[data-a]')?.dataset.a
      if (a === 'back') {
        this.audio.play('ui')
        this.show(this.prevScreen)
      }
      if (a === 'tips') {
        this.audio.play('ui')
        this.actions.resetTips()
        this.toast(t('settings.resetTips'))
      }
    }
    this.show('settings')
  }

  private fmtSetting(k: keyof Settings, v: number): string {
    return k === 'sensitivity' ? `${v.toFixed(2)}×` : `${Math.round(v * 100)}%`
  }

  private openGuide(from: Screen): void {
    this.prevScreen = from
    const def = monsterById(this.game?.quarryId ?? this.save.data.quarry)
    const el = this.screens.guide
    const parts = Object.entries(def.parts)
      .sort((a, b) => b[1] - a[1])
      .map(([p, v]) => `<li><span>${p[0].toUpperCase() + p.slice(1)}</span><span class="meter"><i style="width:${Math.min(100, (v / 1.4) * 100)}%"></i></span><b>${v.toFixed(2)}×</b></li>`)
      .join('')
    el.innerHTML = `
      <div class="panel panel-guide" style="--glow:${def.palette.glow}">
        <div class="guide-head">
          <div>
            <h2>${esc(def.name)}</h2>
            <div class="guide-title">${esc(def.title)} · ${t('guide.habitat')}: ${esc(def.habitat)}</div>
          </div>
          <button class="btn" data-a="back">${t('common.back')}</button>
        </div>
        <p class="guide-desc">${esc(def.description)}</p>
        <div class="guide-grid">
          <div>
            <h3>${t('guide.abilities')}</h3>
            <ul class="abilities">${def.abilities
              .map(a => `<li><div class="ab-head"><b>${esc(a.name)}</b><span>${a.damage ? `${t('guide.damage')} ${a.damage}` : 'Stun'} · ${t('guide.windup')} ${a.windup.toFixed(2)}s · ${t('guide.range')} ${a.range}m</span></div><div class="ab-desc">${esc(a.description)}</div><div class="ab-counter"><em>${t('guide.counter')}:</em> ${esc(a.counter)}</div></li>`)
              .join('')}</ul>
          </div>
          <div>
            <h3>${t('guide.vitals')}</h3>
            <ul class="vitals">${def.vitals.map(v => `<li><b>${esc(v.name)}</b><span>${esc(v.effect)}</span></li>`).join('')}</ul>
            <h3>${t('guide.weakness')}</h3>
            <ul class="parts">${parts}</ul>
            <h3>${t('guide.tactics')}</h3>
            <ul class="tactics">${[1, 2, 3, 4, 5].map(i => `<li>${t(`guide.tactic${i}`)}</li>`).join('')}</ul>
          </div>
        </div>
      </div>`
    el.onclick = e => {
      if ((e.target as HTMLElement).closest('[data-a="back"]')) {
        this.audio.play('ui')
        this.show(this.prevScreen)
      }
    }
    this.show('guide')
  }

  // ─── screens ───────────────────────────────────────────────────────────
  show(s: Screen): void {
    this.screen = s
    for (const [k, el] of Object.entries(this.screens)) el.hidden = k !== s
    this.root.dataset.screen = s
  }

  private onMode(m: GameMode): void {
    this.root.dataset.mode = m
    this.hudEl.hidden = !(m === 'playing' || m === 'paused' || m === 'ending')
    if (m === 'title') {
      this.renderTitle()
      this.show('title')
    } else if (m === 'playing') this.show('none')
    else if (m === 'paused') this.show('pause')
    else if (m === 'ending') this.show('none')
  }

  private showResults(r: ResultSummary): void {
    const el = this.screens.results
    const row = (k: string, v: string | number) => `<div class="res-row"><span>${k}</span><b>${v}</b></div>`
    el.innerHTML = `
      <div class="panel panel-results ${r.won ? 'won' : 'lost'}">
        <div class="res-head">
          <div class="res-kicker">${esc(r.quarry)}</div>
          <h2>${r.won ? t('results.victory') : t('results.defeat')}</h2>
          ${r.reason ? `<div class="res-reason">${esc(r.reason)}</div>` : ''}
        </div>
        ${r.won ? `<div class="rank rank-${r.rank}"><img src="${UI('stamp')}" alt=""><b>${r.rank}</b><span>${t('results.rank')}</span></div>` : ''}
        ${r.isBest ? `<div class="res-best">${t('results.newBest')}</div>` : r.best ? `<div class="res-prev">${t('results.best', { time: r.best })}</div>` : ''}
        ${r.unranked ? `<div class="res-prev">${t('results.unranked')}</div>` : ''}
        <div class="res-grid">
          ${row(t('results.time'), r.time)}
          ${row(t('results.damage'), r.damage.toLocaleString('en-US'))}
          ${row(t('results.biggest'), r.biggest)}
          ${row(t('results.vitals'), r.vitals)}
          ${row(t('results.parts'), r.parts)}
          ${row(t('results.faints'), r.faints)}
          ${row(t('results.mounts'), r.mounts)}
          ${row(t('results.wallSlams'), r.wallSlams)}
        </div>
        <div class="row">
          <button class="btn primary big" data-a="again">${t('results.again')}</button>
          <button class="btn" data-a="title">${t('results.title')}</button>
        </div>
      </div>`
    el.onclick = e => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a
      if (!a) return
      this.audio.play('uiConfirm')
      if (a === 'again') this.actions.start()
      if (a === 'title') this.game?.toTitle()
    }
    this.show('results')
    if (r.won) {
      // Stamp slams in (CSS), then bursts on contact.
      window.setTimeout(() => {
        const st = el.querySelector('.rank')
        this.audio.play('stamp')
        this.fx.burstAt(st, 60, '#ffd27a', 520)
        if (st) {
          const rc = st.getBoundingClientRect()
          this.fx.ring(rc.left + rc.width / 2, rc.top + rc.height / 2, 190, '#ffe2a8', 0.6, 5)
          this.fx.motes(rc.left + rc.width / 2, rc.top + rc.height * 0.6, 30, '#ffd27a', 90)
        }
      }, 520)
    }
  }

  // ─── transient feedback ────────────────────────────────────────────────
  banner(title: string, sub = '', tone: Tone = 'neutral'): void {
    const b = this.els.banner
    b.querySelector('.banner-title')!.textContent = title
    b.querySelector('.banner-sub')!.textContent = sub
    b.dataset.tone = tone
    ;(b.querySelector('.banner-icon') as HTMLImageElement).src = UI(BANNER_ICON[tone])
    b.classList.remove('show')
    void b.offsetWidth
    b.classList.add('show')
    this.bannerTimer = 2.8
    const col = tone === 'flow' ? '#9fe8ff' : tone === 'danger' ? '#ff8a5a' : tone === 'good' ? '#b8ff9a' : '#ffd27a'
    window.setTimeout(() => {
      this.fx.edge(b.querySelector('.banner-bg'), 40, col)
      this.fx.burstAt(b.querySelector('.banner-icon'), 24, col, 300)
    }, 160)
  }

  /** Screen-level feedback: edge flash + overlay particles + HUD reactions. */
  pulse(kind: ScreenPulse): void {
    const f = this.els.flash
    f.dataset.kind = kind
    f.classList.remove('on')
    void f.offsetWidth
    f.classList.add('on')
    const cx = window.innerWidth / 2
    const cy = window.innerHeight / 2
    switch (kind) {
      case 'flow':
        this.fx.ring(cx, cy, 420, '#9fe8ff', 0.7, 6)
        this.fx.motes(cx, cy + 80, 40, '#9fe8ff', 260)
        break
      case 'hurt': {
        const hp = this.els.hpBar.getBoundingClientRect()
        this.fx.shards(hp.left + hp.width * Math.max(0.05, this.lastHpFrac), hp.top + hp.height / 2, 12, '#ff5a3a', 260)
        this.shake(this.els.vitals)
        break
      }
      case 'vital':
        this.fx.burst(cx, cy, 26, '#ffd27a', 420)
        break
      case 'true':
        this.fx.ring(cx, cy, 520, '#ffe2a8', 0.55, 8)
        this.fx.burst(cx, cy, 40, '#ffb347', 700, 3.5)
        this.shake(this.hudEl)
        break
      case 'roar':
        this.shake(this.hudEl)
        break
      case 'break': {
        const icons = this.els.bossVitals.querySelectorAll('.vit.broken')
        const last = icons[icons.length - 1] ?? this.els.portrait
        const rc = last.getBoundingClientRect()
        this.fx.shards(rc.left + rc.width / 2, rc.top + rc.height / 2, 22, '#e8c070', 360)
        this.fx.burst(rc.left + rc.width / 2, rc.top + rc.height / 2, 30, '#ffd27a', 360)
        this.shake(this.els.boss)
        break
      }
      case 'heal': {
        const hp = this.els.hpBar.getBoundingClientRect()
        this.fx.motes(hp.left + hp.width / 2, hp.top + hp.height / 2, 34, '#9dff8a', hp.width / 2)
        this.els.hpBar.classList.remove('healed')
        void this.els.hpBar.offsetWidth
        this.els.hpBar.classList.add('healed')
        break
      }
      case 'kill':
        this.fx.burst(cx, cy, 80, '#ffd27a', 900, 4)
        this.fx.ring(cx, cy, 700, '#ffe2a8', 0.9, 10)
        break
    }
  }

  chargeBurst(level: number): void {
    const rc = this.els.cring.getBoundingClientRect()
    const x = rc.left + rc.width / 2
    const y = rc.top + rc.height / 2
    const col = CHARGE_COLORS[Math.min(3, level)]
    this.fx.ring(x, y, 70 + level * 30, col, 0.45, 3 + level)
    this.fx.burst(x, y, 14 + level * 10, col, 240 + level * 90, 2.6)
    this.els.cring.classList.remove('lvl-up')
    void this.els.cring.offsetWidth
    this.els.cring.classList.add('lvl-up')
  }

  private shake(el: HTMLElement): void {
    el.classList.remove('shake')
    void el.offsetWidth
    el.classList.add('shake')
  }

  toast(text: string): void {
    const el = h('div', 'toast')
    el.textContent = text
    this.els.toasts.prepend(el)
    while (this.els.toasts.children.length > 4) this.els.toasts.lastElementChild?.remove()
    window.setTimeout(() => el.classList.add('out'), 2600)
    window.setTimeout(() => el.remove(), 3100)
  }

  damage(x: number, y: number, amount: number, kind: DamageKind): void {
    if (this.dmgCount > 24) return
    const el = h('div', `dmg dmg-${kind}`)
    const label = kind === 'vital' ? t('hud.critical') : kind === 'wound' ? t('hud.wound') : kind === 'weak' ? t('hud.weak') : ''
    el.innerHTML = `<b>${amount}</b>${label ? `<small>${esc(label)}</small>` : ''}`
    const px = x + (Math.random() - 0.5) * 30
    const py = y + (Math.random() - 0.5) * 16
    el.style.left = `${px}px`
    el.style.top = `${py}px`
    if (amount >= 100 || kind === 'vital') el.classList.add('big')
    this.els.dmg.append(el)
    if (kind === 'vital') this.fx.burst(px, py, 22, '#ffd27a', 320)
    else if (kind === 'wound') this.fx.burst(px, py, 12, '#ff8a3a', 240)
    else if (kind === 'weak') this.fx.burst(px, py, 8, '#ffb347', 200, 2)
    else this.fx.burst(px, py, 4, '#f3ead7', 140, 1.6)
    this.dmgCount += 1
    window.setTimeout(() => {
      el.remove()
      this.dmgCount -= 1
    }, 950)
  }

  hurt(amount: number): void {
    this.hurtT = Math.min(1, 0.35 + amount / 60)
  }

  // ─── per-frame HUD ─────────────────────────────────────────────────────
  private text(el: HTMLElement, v: string): void {
    if (this.cache.get(el) === v) return
    this.cache.set(el, v)
    el.textContent = v
  }

  private html(el: HTMLElement, v: string): void {
    if (this.cache.get(el) === v) return
    this.cache.set(el, v)
    el.innerHTML = v
  }

  private style(el: HTMLElement, prop: string, v: string): void {
    const key = `${prop}`
    const tag = `${key}:${v}`
    if ((el as HTMLElement & { _s?: Record<string, string> })._s?.[key] === tag) return
    const store = ((el as HTMLElement & { _s?: Record<string, string> })._s ??= {})
    store[key] = tag
    el.style.setProperty(prop, v)
  }

  private keycap(k: string): string {
    const label = this.device === 'gamepad' ? PAD_KEYS[k] ?? k : this.device === 'touch' ? TOUCH_KEYS[k] ?? k : k
    return `<kbd>${label}</kbd>`
  }

  private promptsHtml(list: Prompt[]): string {
    return list
      .map(p => {
        const keys = this.device === 'keyboard' ? p.keys : [...new Set(p.keys.map(k => (this.device === 'gamepad' ? PAD_KEYS[k] ?? k : TOUCH_KEYS[k] ?? k)))]
        return `<span class="prompt">${keys.map(k => (this.device === 'keyboard' ? this.keycap(k) : `<kbd>${k}</kbd>`)).join('')}<span>${esc(p.label)}</span></span>`
      })
      .join('')
  }

  frame(dt: number): void {
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt
      if (this.bannerTimer <= 0) this.els.banner.classList.remove('show')
    }
    this.hurtT = Math.max(0, this.hurtT - dt * 1.8)
    this.style(this.els.hurt, 'opacity', this.hurtT.toFixed(2))
    this.fx.update(Math.min(dt, 0.05))
    const g = this.game
    if (!g || this.hudEl.hidden) return
    const s = g.hud()
    this.updateHud(s)
  }

  private updateHud(s: HudState): void {
    const E = this.els
    // Hunter vitals: bar width scales with max health like a real health gauge.
    const hpf = s.hp / s.maxHp
    this.lastHpFrac = hpf
    this.style(E.hpFill, 'transform', `scaleX(${hpf.toFixed(3)})`)
    this.style(E.hpRed, 'transform', `scaleX(${((s.hp + s.red) / s.maxHp).toFixed(3)})`)
    this.style(E.stFill, 'transform', `scaleX(${(s.stamina / s.maxStamina).toFixed(3)})`)
    E.stBar.classList.toggle('exhausted', s.exhausted)
    E.hpBar.classList.toggle('low', s.lowHealth)
    this.text(E.potions, String(s.potions))
    if (this.lastPotions >= 0 && s.potions > this.lastPotions) {
      this.fx.burstAt(E.potion, 16, '#ff7a6a', 200)
      this.shake(E.potion)
    }
    this.lastPotions = s.potions
    this.html(E.faints, Array.from({ length: s.maxFaints }, (_, i) => `<i class="${i < s.faints ? 'used' : ''}"></i>`).join(''))
    this.style(E.vignette, 'opacity', s.lowHealth ? '1' : '0')
    // Monster.
    E.boss.classList.toggle('hidden', !s.monster.seen)
    this.text(E.bossName, s.monster.name)
    this.html(E.bossTags, s.monster.tags.map(x => `<span class="tag tag-${x.toLowerCase()}">${x}</span>`).join(''))
    this.style(E.bossFill, 'transform', `scaleX(${s.monster.hp.toFixed(4)})`)
    this.style(E.bossGhost, 'transform', `scaleX(${s.monster.hp.toFixed(3)})`)
    E.boss.classList.toggle('enraged', s.monster.enraged)
    const broken = s.monster.vitals.filter(v => v.broken).length
    if (broken < this.lastBroken) this.lastBroken = broken
    this.lastBroken = broken
    this.html(
      E.bossVitals,
      s.monster.vitals.map(v => `<span class="vit ${v.broken ? 'broken' : ''}" title="${esc(v.name)}"><i style="--f:${v.frac.toFixed(2)}"></i><em>${esc(v.name)}</em></span>`).join(''),
    )
    this.text(E.telegraph, s.telegraph ?? '')
    E.telegraph.classList.toggle('show', !!s.telegraph)
    // Objective & clock.
    this.text(E.objText, s.objective)
    this.text(E.objClock, s.clock)
    E.objClock.classList.toggle('warn', s.timeLeft < 300)
    // Reticle, grapple target and charge ring.
    E.reticle.classList.toggle('target', !!s.reticle.label)
    E.reticle.classList.toggle('vital', s.reticle.vital)
    E.reticle.classList.toggle('locked', s.reticle.locked)
    E.reticle.classList.toggle('hidden', !!s.mount)
    this.text(E.retLabel, s.reticle.label ? `${s.reticle.label}${s.reticle.vital ? ` · ${t('hud.vital')}` : ''}` : '')
    // Charge ring: three segments fill in sequence; the ring lingers briefly after release.
    this.chargeShown = s.charge > 0 ? 1 : Math.max(0, this.chargeShown - 0.04)
    E.cring.classList.toggle('show', this.chargeShown > 0)
    const segs = E.cring.querySelectorAll<SVGPathElement>('.cseg')
    const c3 = s.charge * 3
    segs.forEach((el, i) => this.style(el as unknown as HTMLElement, 'stroke-dashoffset', `${(100 - clamp01(c3 - i) * 100).toFixed(1)}`))
    E.reticle.dataset.level = String(s.chargeLevel)
    // Grip gauge while mounted (stamina is what keeps you clinging on).
    E.grip.classList.toggle('show', !!s.mount)
    if (s.mount) {
      const g = s.stamina / s.maxStamina
      this.style(E.gripFill, 'stroke-dashoffset', `${(100 - g * 100).toFixed(1)}`)
      E.grip.classList.toggle('low', g < 0.3)
      E.grip.classList.toggle('bracing', s.mount.bracing)
    }
    // Combo.
    this.text(E.comboName, s.combo)
    E.combo.classList.toggle('show', !!s.combo)
    E.comboSteps.dataset.step = String(s.comboStep)
    // Tip.
    E.tip.classList.toggle('show', !!s.tip)
    if (s.tip) this.text(E.tipText, s.tip)
    // Mount panel.
    E.mount.classList.toggle('show', !!s.mount)
    if (s.mount) {
      const m = s.mount
      this.text(E.mountTitle, m.riding ? t('hud.riding') : m.bracing ? t('hud.bracing') : t('hud.grip'))
      const key = `${m.index}|${m.labels.map(l => `${l.label}${l.broken}`).join(',')}`
      if (key !== this.mountKey) {
        this.mountKey = key
        E.mountChain.innerHTML = m.labels
          .map((l, i) => `<div class="link ${i === m.index ? 'here' : ''} ${l.vital ? 'vital' : ''} ${l.broken ? 'broken' : ''} ${l.ride ? 'ride' : ''}"><i></i><span>${esc(l.label)}</span></div>`)
          .reverse()
          .join('')
      }
      E.mountRide.classList.toggle('show', m.riding)
      this.style(E.mountRideFill, 'transform', `scaleX(${(1 - m.ride).toFixed(3)})`)
      E.brace.classList.toggle('show', m.thrash > 0)
      E.brace.classList.toggle('bucking', m.bucking)
      E.brace.classList.toggle('ok', m.bracing)
    } else {
      E.brace.classList.remove('show')
      this.mountKey = ''
    }
    // Prompts.
    const pk = `${this.device}|${s.prompts.map(p => p.keys.join('+') + p.label).join('|')}`
    if (pk !== this.promptKey) {
      this.promptKey = pk
      E.prompts.innerHTML = this.promptsHtml(s.prompts)
    }
    this.drawMap(s)
  }

  private drawMap(s: HudState): void {
    const c = this.mapCanvas
    const ctx = c.getContext('2d')!
    const R = c.width / 2
    const scale = R / (WORLD.arena + 8)
    if (!this.mapBg) {
      const bg = document.createElement('canvas')
      bg.width = bg.height = c.width
      const b = bg.getContext('2d')!
      const img = b.createImageData(bg.width, bg.height)
      for (let y = 0; y < bg.height; y += 1) {
        for (let x = 0; x < bg.width; x += 1) {
          const wx = (x - R) / scale
          const wz = (y - R) / scale
          const i = (y * bg.width + x) * 4
          const d = Math.hypot(x - R, y - R)
          if (d > R) {
            img.data[i + 3] = 0
            continue
          }
          const cc = this.mapColor(wx, wz)
          img.data[i] = cc[0]
          img.data[i + 1] = cc[1]
          img.data[i + 2] = cc[2]
          img.data[i + 3] = 235
        }
      }
      b.putImageData(img, 0, 0)
      b.fillStyle = 'rgba(30,26,22,0.9)'
      for (const sp of SPIRES) {
        b.beginPath()
        b.arc(R + sp.x * scale, R + sp.z * scale, Math.max(2.5, sp.r * scale), 0, Math.PI * 2)
        b.fill()
      }
      b.strokeStyle = '#f3ead7'
      b.lineWidth = 1.5
      b.beginPath()
      b.rect(R + CAMP.x * scale - 4, R + CAMP.z * scale - 4, 8, 8)
      b.stroke()
      this.mapBg = bg
    }
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.drawImage(this.mapBg, 0, 0)
    ctx.fillStyle = '#ffb35a'
    for (const hb of s.map.herbs) {
      ctx.beginPath()
      ctx.arc(R + hb.x * scale, R + hb.z * scale, 2, 0, Math.PI * 2)
      ctx.fill()
    }
    if (s.map.seen) {
      const mx = R + s.map.mx * scale
      const mz = R + s.map.mz * scale
      ctx.save()
      ctx.translate(mx, mz)
      ctx.rotate(-s.map.mh)
      ctx.fillStyle = s.monster.enraged ? '#ff5a3a' : '#e8a13c'
      ctx.strokeStyle = '#1a1512'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(0, 9)
      ctx.lineTo(6, -5)
      ctx.lineTo(0, -2)
      ctx.lineTo(-6, -5)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      ctx.restore()
    }
    // Camera view cone and hunter arrow.
    const hx = R + s.map.hx * scale
    const hz = R + s.map.hz * scale
    const fx = Math.sin(s.map.yaw)
    const fz = Math.cos(s.map.yaw)
    const grad = ctx.createRadialGradient(hx, hz, 0, hx, hz, 34)
    grad.addColorStop(0, 'rgba(255,245,220,0.35)')
    grad.addColorStop(1, 'rgba(255,245,220,0)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.moveTo(hx, hz)
    const a = Math.atan2(fz, fx)
    ctx.arc(hx, hz, 34, a - 0.55, a + 0.55)
    ctx.closePath()
    ctx.fill()
    ctx.save()
    ctx.translate(hx, hz)
    ctx.rotate(-s.map.hh)
    ctx.fillStyle = '#f7f1e0'
    ctx.strokeStyle = '#1a1512'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(0, 7)
    ctx.lineTo(4.5, -4)
    ctx.lineTo(-4.5, -4)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.restore()
    // Ring.
    ctx.strokeStyle = 'rgba(243,234,215,0.55)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(R, R, R - 1, 0, Math.PI * 2)
    ctx.stroke()
  }

  private mapColor(x: number, z: number): [number, number, number] {
    if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r * 0.95) return [58, 104, 112]
    const c = groundColor(x, z, MAP_COLOR)
    return [Math.round(Math.sqrt(c.r) * 190), Math.round(Math.sqrt(c.g) * 190), Math.round(Math.sqrt(c.b) * 190)]
  }
}
