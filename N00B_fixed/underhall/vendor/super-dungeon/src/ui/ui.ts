import type { Input, InputMethod } from '../engine/input'
import type { Quality, SaveData } from '../engine/save'
import { CLASSMATES, DEV_BOARD, LORE, RELICS, WINGS, type DevId, type Rarity, type UpgradeDef } from '../game/content'
import { wingForSeed } from '../game/dungeon'
import { ROOM_ICON } from '../game/minimap'
import { parseSeed, randomSeed } from '../game/rng'
import { formatClock, type RunSummary } from '../game/rules'
import type { TutorialView } from '../game/tutorial'
import { icon } from './icons'

export type HudData = {
  hp: number
  maxHp: number
  power: number
  maxPower: number
  boltCost: number
  novaCost: number
  dash: number
  shield: number
  credits: number
  merits: number
  prompt: string | null
  method: InputMethod
  inRun: boolean
  wing: string
  roomLabel: string
  progress: { at: number; total: number; boss: boolean } | null
  enemiesLeft: number
  wave: string
  time: number
  build: { icon: string; name: string; n: number; rarity: Rarity }[]
  relics: string[]
  rerolls: number
}

export type ShopItem = { id: string; name: string; desc: string; price: number; sold: boolean; rarity?: Rarity }

/** Hub-only movement training state for the pause menu: running now, or finished and replayable. */
export type TrainingState = 'active' | 'replay' | null
export type PauseInfo = { training?: TrainingState; inRun: boolean; seed: number; wing: string; report: string[]; fallback: boolean; rooms: number; build: string[]; relics: string[] }
export type PauseHandlers = { resume: () => void; abandon: () => void; quit: () => void; settings: () => void; training?: () => void; skipTraining?: () => void }
export type ResultsInfo = { won: boolean; rank: string; summary: RunSummary; merits: number; newBest: boolean; wing: string; rescued: string[]; build: string[] }

type Tone = 'gold' | 'purple' | 'red' | 'blue' | 'green'

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '', parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text) e.textContent = text
  parent?.appendChild(e)
  return e
}

function button(label: string, cls: string, onClick: () => void, parent?: HTMLElement): HTMLButtonElement {
  const b = el('button', `btn ${cls}`, label, parent)
  b.type = 'button'
  b.addEventListener('click', e => {
    e.stopPropagation()
    onClick()
  })
  return b
}

const KEY_HINTS: Record<'attack' | 'bolt' | 'dash' | 'nova' | 'interact' | 'map', Partial<Record<InputMethod, string>>> = {
  attack: { keyboard: 'LMB', gamepad: 'X' },
  bolt: { keyboard: 'RMB', gamepad: 'RB' },
  dash: { keyboard: 'C', gamepad: 'B' },
  nova: { keyboard: 'Q', gamepad: 'LB' },
  interact: { keyboard: 'E', gamepad: 'Y', touch: 'TAP' },
  map: { keyboard: 'TAB', gamepad: 'VIEW' },
}

/** Phones and tablets only: the finger is the main pointer (a laptop with a touch screen keeps its mouse and keyboard). `?touch=1` forces the on-screen controls for testing. */
export function isTouchDevice(): boolean {
  try {
    if (new URLSearchParams(location.search).get('touch') === '1') return true
    if (matchMedia('(pointer: coarse)').matches) return true
    return navigator.maxTouchPoints > 0 && !matchMedia('(any-pointer: fine)').matches
  } catch {
    return false
  }
}

export class UI {
  readonly root: HTMLElement
  readonly minimapCanvas: HTMLCanvasElement
  readonly mapCanvas: HTMLCanvasElement
  private title: HTMLElement
  private hudEl: HTMLElement
  private modalRoot: HTMLElement
  private curtainEl: HTMLElement
  private curtainText: HTMLElement
  private curtainBar: HTMLElement
  private bannerEl: HTMLElement
  private toastEl: HTMLElement
  private popLayer: HTMLElement
  private vignette: HTMLElement
  private mapOverlay: HTMLElement
  private bossEl: HTMLElement
  private promptEl: HTMLElement
  private captureEl: HTMLElement
  private touchEl?: HTMLElement
  private touchReset?: () => void
  private modalClose: (() => void) | null = null
  private modalKeys: ((e: KeyboardEvent) => boolean) | null = null
  private bannerTimer = 0
  private toastTimer = 0
  private cache = new Map<string, string>()
  private refs: Record<string, HTMLElement> = {}
  private lastPause?: { info: PauseInfo; h: PauseHandlers }
  onPlay: () => void = () => undefined
  onTitleSettings: () => void = () => undefined
  onTitleHowTo: () => void = () => undefined
  sound: () => void = () => undefined

  constructor(root: HTMLElement, private readonly input: Input) {
    this.root = root
    this.title = this.buildTitle()
    this.hudEl = this.buildHud()
    this.minimapCanvas = this.refs.minimap as HTMLCanvasElement
    this.bossEl = this.refs.boss
    this.promptEl = this.refs.prompt
    this.captureEl = this.refs.capture
    this.bannerEl = el('div', 'banner', '', root)
    this.toastEl = el('div', 'toast', '', root)
    this.popLayer = el('div', 'pops', '', root)
    this.vignette = el('div', 'vignette', '', root)
    this.mapOverlay = el('div', 'map-overlay hidden', '', root)
    const mapCard = el('div', 'map-card', '', this.mapOverlay)
    el('h2', 'display', 'FLOOR MAP', mapCard)
    this.mapCanvas = el('canvas', 'map-canvas', '', mapCard)
    const legend = el('div', 'legend', '', mapCard)
    for (const k of ['heal', 'shop', 'rescue', 'treasure', 'challenge', 'lore', 'elite', 'boss', 'exit'] as const) {
      const row = el('span', 'legend-item', '', legend)
      const dot = el('i', 'legend-dot', ROOM_ICON[k].glyph, row)
      dot.style.background = ROOM_ICON[k].color
      el('span', '', ROOM_ICON[k].label, row)
    }
    el('p', 'map-hint', 'Dashed rooms are discovered but unexplored. Press TAB or M to close.', mapCard)
    this.modalRoot = el('div', 'modal-root hidden', '', root)
    this.curtainEl = el('div', 'curtain', '', root)
    const cc = el('div', 'curtain-card', '', this.curtainEl)
    this.curtainText = el('p', 'curtain-text', '', cc)
    this.curtainBar = el('i', '', '', el('div', 'curtain-bar', '', cc))
    window.addEventListener('keydown', e => {
      if (!this.modalOpen) {
        if (!this.title.classList.contains('hidden') && (e.code === 'Enter' || e.code === 'Space')) {
          e.preventDefault()
          this.onPlay()
        }
        return
      }
      if (this.modalKeys?.(e)) {
        e.preventDefault()
        return
      }
      if (e.code === 'Escape' && this.modalClose) {
        e.preventDefault()
        const f = this.modalClose
        f()
      }
    })
    if (isTouchDevice()) this.buildTouch()
    this.setMode('none')
  }

  // ─── Title ─────────────────────────────────────────────────────────────

  private buildTitle(): HTMLElement {
    const t = el('div', 'title-screen hidden', '', this.root)
    this.refs.titleLoading = el('div', 'title-loading', 'Warming up the campus...', t)
    const logo = el('div', 'logo', '', t)
    el('div', 'logo-kicker', 'UNDERHALL:', logo)
    el('div', 'logo-main display', 'AFTER CURFEW', logo)
    el('div', 'logo-sub', 'A superhero high school dungeon beneath Super Academy', logo)
    const menu = el('div', 'title-menu', '', t)
    button('START PATROL', 'primary big', () => this.onPlay(), menu)
    button('HOW TO PLAY', '', () => this.onTitleHowTo(), menu)
    button('SETTINGS', '', () => this.onTitleSettings(), menu)
    this.refs.titleStats = el('div', 'title-stats', '', t)
    el('div', 'title-foot', 'Best with keyboard + mouse. Gamepad and touch supported.', t)
    return t
  }

  /** Full-screen scene-transition curtain. Resolves once fully opaque (or immediately when lifting). */
  curtain(on: boolean, text = ''): Promise<void> {
    if (on) {
      this.curtainText.textContent = text
      this.curtainBar.style.width = '0%'
    }
    const el = this.curtainEl
    if (!on || el.classList.contains('on') || getComputedStyle(el).opacity === '1') {
      el.classList.toggle('on', on)
      return Promise.resolve()
    }
    // Resolve once it is actually opaque (slow devices can lag the fade), with a fallback.
    return new Promise(resolve => {
      const done = (): void => {
        window.clearTimeout(timer)
        el.removeEventListener('transitionend', done)
        resolve()
      }
      const timer = window.setTimeout(done, 700)
      el.addEventListener('transitionend', done)
      el.classList.add('on')
    })
  }

  curtainProgress(p: number): void {
    this.curtainBar.style.width = `${Math.round(Math.min(1, Math.max(0, p)) * 100)}%`
  }

  /** The live campus is ready behind the title: fade the poster out. */
  titleLive(): void {
    this.title.classList.add('live')
  }

  showTitle(show: boolean, save?: SaveData): void {
    this.title.classList.toggle('hidden', !show)
    if (show && save) {
      this.refs.titleStats.textContent = save.runs
        ? `Runs ${save.runs}  |  Exams passed ${save.wins}  |  Classmates rescued ${save.rescued.length}/${CLASSMATES.length}  |  Merits ${save.merits}`
        : 'Curfew was an hour ago. Something under the school just woke up.'
    }
  }

  // ─── HUD ───────────────────────────────────────────────────────────────

  private buildHud(): HTMLElement {
    const hud = el('div', 'hud', '', this.root)
    const tl = el('div', 'hud-tl', '', hud)
    const card = el('div', 'hero-card', '', tl)
    const badge = el('div', 'badge', '', card)
    badge.innerHTML = icon('shieldCrest')
    const bars = el('div', 'bars', '', card)
    const hpRow = el('div', 'bar hp', '', bars)
    this.refs.hpFill = el('div', 'fill', '', hpRow)
    this.refs.hpGhost = el('div', 'ghost', '', hpRow)
    this.refs.hpText = el('span', 'bar-text', '', hpRow)
    const pwRow = el('div', 'bar power', '', bars)
    this.refs.pwFill = el('div', 'fill', '', pwRow)
    this.refs.pwMark = el('div', 'mark', '', pwRow)
    this.refs.pwText = el('span', 'bar-text', '', pwRow)
    const cur = el('div', 'currency', '', tl)
    this.refs.credits = el('span', 'chip credits', '', cur)
    this.refs.merits = el('span', 'chip merits', '', cur)
    this.refs.shield = el('span', 'chip shield', 'BARRIER', cur)
    this.refs.clock = el('span', 'chip clock', '', cur)

    const top = el('div', 'hud-top', '', hud)
    this.refs.wing = el('div', 'wing-name display', '', top)
    this.refs.room = el('div', 'room-name', '', top)
    this.refs.pips = el('div', 'pips', '', top)
    this.refs.fight = el('div', 'fight', '', top)

    const tr = el('div', 'hud-tr', '', hud)
    this.refs.minimap = el('canvas', 'minimap', '', tr)
    this.refs.mapHint = el('div', 'map-key', '', tr)

    this.refs.build = el('div', 'hud-bl', '', hud)

    const abil = el('div', 'abilities', '', hud)
    const slot = (id: string, name: string, ic: string) => {
      const s = el('div', `slot slot-${id}`, '', abil)
      const i = el('div', 'slot-icon', '', s)
      i.innerHTML = icon(ic)
      this.refs[`${id}Cd`] = el('div', 'slot-cd', '', s)
      this.refs[`${id}Key`] = el('div', 'slot-key', '', s)
      el('div', 'slot-name', name, s)
      this.refs[`${id}Slot`] = s
    }
    slot('attack', 'Combo', 'fist')
    slot('bolt', 'Bolt', 'bolt')
    slot('dash', 'Dash', 'dash')
    slot('nova', 'Nova', 'star')

    this.refs.prompt = el('div', 'prompt hidden', '', hud)
    this.refs.coach = el('div', 'coach hidden', '', hud)
    el('div', 'crosshair', '', hud)
    this.refs.capture = el('div', 'capture hidden', 'Click to capture the mouse', hud)
    const boss = el('div', 'bossbar hidden', '', hud)
    const bh = el('div', 'boss-head', '', boss)
    this.refs.bossName = el('span', 'display', '', bh)
    this.refs.bossPhase = el('span', 'boss-phase', '', bh)
    const bb = el('div', 'boss-track', '', boss)
    this.refs.bossFill = el('div', 'boss-fill', '', bb)
    this.refs.boss = boss
    return hud
  }

  setMode(mode: 'hub' | 'run' | 'none'): void {
    this.hudEl.classList.toggle('hidden', mode === 'none')
    this.hudEl.classList.toggle('in-hub', mode === 'hub')
    this.touchEl?.classList.toggle('hidden', mode === 'none')
    if (mode === 'none') this.touchReset?.()
    if (mode !== 'run') this.showMap(false)
    this.cache.clear()
  }

  private set(key: string, elm: HTMLElement, text: string): void {
    if (this.cache.get(key) === text) return
    this.cache.set(key, text)
    elm.textContent = text
  }
  private style(key: string, elm: HTMLElement, prop: string, value: string): void {
    const k = `${key}:${prop}`
    if (this.cache.get(k) === value) return
    this.cache.set(k, value)
    elm.style.setProperty(prop, value)
  }
  private toggle(key: string, elm: HTMLElement, cls: string, on: boolean): void {
    const k = `${key}:${cls}`
    const v = on ? '1' : '0'
    if (this.cache.get(k) === v) return
    this.cache.set(k, v)
    elm.classList.toggle(cls, on)
  }

  hud(d: HudData): void {
    const r = this.refs
    const hpPct = Math.max(0, d.hp / d.maxHp) * 100
    this.style('hp', r.hpFill, 'width', `${hpPct.toFixed(1)}%`)
    this.style('hpg', r.hpGhost, 'width', `${hpPct.toFixed(1)}%`)
    this.toggle('hpLow', r.hpFill.parentElement!, 'low', hpPct < 30)
    this.set('hpT', r.hpText, `${Math.ceil(d.hp)} / ${d.maxHp}`)
    this.style('pw', r.pwFill, 'width', `${((d.power / d.maxPower) * 100).toFixed(1)}%`)
    this.style('pwm', r.pwMark, 'left', `${(d.novaCost / d.maxPower) * 100}%`)
    this.toggle('pwNova', r.pwFill.parentElement!, 'nova-ready', d.power >= d.novaCost)
    this.set('pwT', r.pwText, `POWER ${Math.floor(d.power)}`)
    this.set('cr', r.credits, `${d.credits} CR`)
    this.toggle('crH', r.credits, 'hidden', !d.inRun)
    this.set('me', r.merits, `${d.merits} MERITS`)
    this.toggle('meH', r.merits, 'hidden', d.inRun)
    this.toggle('shH', r.shield, 'hidden', d.shield < 0)
    this.toggle('shR', r.shield, 'ready', d.shield >= 1)
    this.set('clk', r.clock, formatClock(d.time))
    this.toggle('clkH', r.clock, 'hidden', !d.inRun)
    this.set('wing', r.wing, d.wing)
    this.set('room', r.room, d.roomLabel)
    this.set('fight', r.fight, d.enemiesLeft ? `${d.wave ? `${d.wave}  |  ` : ''}${d.enemiesLeft} ${d.enemiesLeft === 1 ? 'enemy' : 'enemies'} left` : '')
    this.toggle('fightH', r.fight, 'hidden', !d.enemiesLeft)
    // Critical path pips.
    const pk = d.progress ? `${d.progress.at}/${d.progress.total}/${d.progress.boss}` : ''
    if (this.cache.get('pips') !== pk) {
      this.cache.set('pips', pk)
      r.pips.innerHTML = ''
      if (d.progress) {
        // Critical path: entrance ... boss, then the exit portal once the boss falls.
        for (let i = 0; i <= d.progress.total; i += 1) {
          const bossPip = i === d.progress.total
          el('i', `pip${i <= d.progress.at ? ' on' : ''}${bossPip ? ' boss' : ''}${bossPip && d.progress.boss ? ' done' : ''}`, bossPip ? 'B' : '', r.pips)
        }
        el('i', `pip exit${d.progress.boss ? ' on' : ''}`, 'X', r.pips)
      }
    }
    // Build chips.
    const bk = d.build.map(b => `${b.icon}${b.n}`).join(',') + d.relics.join(',')
    if (this.cache.get('build') !== bk) {
      this.cache.set('build', bk)
      r.build.innerHTML = ''
      for (const b of d.build) {
        const c = el('div', `bchip ${b.rarity}`, '', r.build)
        c.innerHTML = icon(b.icon)
        c.title = b.name
        if (b.n > 1) el('b', '', `${b.n}`, c)
      }
      for (const rl of d.relics) {
        const c = el('div', 'bchip relic', '', r.build)
        c.innerHTML = icon('gem')
        c.title = rl
      }
    }
    // Abilities.
    const m = d.method
    for (const k of ['attack', 'bolt', 'dash', 'nova'] as const) this.set(`${k}K`, r[`${k}Key`], KEY_HINTS[k][m] ?? '')
    this.toggle('boltNo', r.boltSlot, 'unavailable', d.power < d.boltCost)
    this.toggle('novaNo', r.novaSlot, 'unavailable', d.power < d.novaCost)
    this.toggle('novaRdy', r.novaSlot, 'ready', d.power >= d.novaCost)
    this.style('dashCd', r.dashCd, '--p', `${Math.round((1 - d.dash) * 100)}`)
    this.toggle('dashCdOn', r.dashSlot, 'cooling', d.dash < 1)
    this.set('mapK', r.mapHint, d.inRun ? `${KEY_HINTS.map[m] ?? 'MAP'}  Full map` : '')
    this.toggle('trH', r.minimap.parentElement!, 'hidden', !d.inRun)
    // Prompt.
    if (d.prompt) {
      const key = KEY_HINTS.interact[m] ?? 'E'
      const html = `<kbd>${key}</kbd> ${d.prompt}`
      if (this.cache.get('prompt') !== html) {
        this.cache.set('prompt', html)
        this.promptEl.innerHTML = html
      }
    }
    this.toggle('promptH', this.promptEl, 'hidden', !d.prompt)
    this.touchEl?.querySelector('.t-interact')?.classList.toggle('hidden', !d.prompt)
    const needCapture = m === 'keyboard' && !document.pointerLockElement && !this.modalOpen && !this.input.lockFailed
    this.toggle('cap', this.captureEl, 'hidden', !needCapture)
  }

  bossBar(show: boolean, name = '', ratio = 1, phase = ''): void {
    this.toggle('bossH', this.bossEl, 'hidden', !show)
    if (!show) return
    this.set('bossN', this.refs.bossName, name)
    this.set('bossP', this.refs.bossPhase, phase)
    this.style('bossF', this.refs.bossFill, 'width', `${(Math.max(0, ratio) * 100).toFixed(1)}%`)
  }

  flashPower(): void {
    const bar = this.refs.pwFill.parentElement!
    bar.classList.remove('shake')
    void bar.offsetWidth
    bar.classList.add('shake')
    this.toast('Not enough Power: land melee hits to charge up')
  }

  hurt(intensity: number): void {
    this.vignette.style.setProperty('--a', `${0.35 + intensity * 0.5}`)
    this.vignette.classList.remove('on')
    void this.vignette.offsetWidth
    this.vignette.classList.add('on')
  }

  /** Movement-training coach card (hub only). Pass null to hide it. Cheap to call every frame. */
  coach(v: TutorialView | null, method: InputMethod): void {
    const r = this.refs
    const id = v?.step.id ?? ''
    this.toggle('coachOn', r.coach, 'hidden', !v)
    this.toggle('coachDash', r.dashSlot, 'coach-hi', id === 'dash' && !v?.celebrating)
    if (r.tDash) this.toggle('coachTDash', r.tDash, 'coach-hi', id === 'dash' && !v?.celebrating)
    if (r.tJump) this.toggle('coachTJump', r.tJump, 'coach-hi', id === 'jump' && !v?.celebrating)
    if (!v) return
    const esc = (t: string) => t.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)
    const key = method === 'touch' ? `<b>${esc(v.key)}</b>` : `<kbd>${esc(v.key)}</kbd>`
    const action = esc(v.action).replace('{key}', key)
    const skip = method === 'touch' ? 'Pause (II)' : method === 'gamepad' ? 'Pause (MENU)' : 'Pause (ESC)'
    const pips = Array.from({ length: v.total }, (_, i) => `<i class="${i < v.index || (i === v.index && v.celebrating) ? 'done' : i === v.index ? 'now' : ''}"></i>`).join('')
    const html = `<div class="coach-head"><span>${v.celebrating ? 'NICE!' : `MOVE TRAINING ${v.index + 1}/${v.total}`}</span><span class="coach-pips">${pips}</span></div>`
      + `<div class="coach-title display">${v.step.title}</div>`
      + `<div class="coach-action">${action}</div>`
      + `<div class="coach-bar"><i style="width:${Math.round(v.progress * 100)}%"></i></div>`
      + `<div class="coach-tip">${esc(v.step.tip)}</div>`
      + `<div class="coach-skip">${skip} to skip</div>`
    if (this.cache.get('coach') !== html) {
      this.cache.set('coach', html)
      r.coach.innerHTML = html
    }
    this.toggle('coachCel', r.coach, 'celebrate', v.celebrating)
  }
  banner(title: string, sub = '', tone: Tone = 'gold'): void {
    this.bannerEl.className = `banner tone-${tone}`
    this.bannerEl.innerHTML = ''
    el('div', 'banner-title display', title, this.bannerEl)
    if (sub) el('div', 'banner-sub', sub, this.bannerEl)
    void this.bannerEl.offsetWidth
    this.bannerEl.classList.add('show')
    clearTimeout(this.bannerTimer)
    this.bannerTimer = window.setTimeout(() => this.bannerEl.classList.remove('show'), 2300)
  }

  toast(text: string): void {
    if (!text) return
    this.toastEl.textContent = text
    this.toastEl.classList.add('show')
    clearTimeout(this.toastTimer)
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), 2200)
  }

  popAt(x: number, y: number, text: string, cls: string): void {
    if (this.popLayer.childElementCount > 40) this.popLayer.firstElementChild?.remove()
    const p = el('div', `pop ${cls}`, text, this.popLayer)
    p.style.left = `${x + (Math.random() - 0.5) * 24}px`
    p.style.top = `${y}px`
    if (cls === 'ko') p.style.setProperty('--rot', `${(Math.random() - 0.5) * 24}deg`)
    window.setTimeout(() => p.remove(), 900)
  }

  showMap(show: boolean): void {
    this.mapOverlay.classList.toggle('hidden', !show)
  }

  // ─── Modals ────────────────────────────────────────────────────────────

  get modalOpen(): boolean {
    return !this.modalRoot.classList.contains('hidden')
  }

  closeModal(): void {
    this.modalRoot.classList.add('hidden')
    this.modalRoot.innerHTML = ''
    this.modalClose = null
    this.modalKeys = null
    this.input.gameplay = false
  }

  private modal(kind: string, onClose: (() => void) | null, keys: ((e: KeyboardEvent) => boolean) | null = null): HTMLElement {
    this.modalRoot.innerHTML = ''
    this.modalRoot.classList.remove('hidden')
    this.modalClose = onClose
      ? () => {
          this.sound()
          this.closeModal()
          onClose()
        }
      : null
    this.modalKeys = keys
    const card = el('div', `modal modal-${kind}`, '', this.modalRoot)
    return card
  }

  private closeBtn(card: HTMLElement, label = 'CLOSE'): void {
    if (!this.modalClose) return
    const f = this.modalClose
    const foot = el('div', 'modal-foot', '', card)
    button(`${label}`, '', f, foot).append(el('kbd', '', 'ESC'))
  }

  openIntro(onDone: () => void): void {
    const panels = [
      { k: '11:58 PM', t: 'Super Academy. The finest hero school in the world. Curfew was an hour ago, and you were definitely not sneaking back from the training gym.' },
      { k: '11:59 PM', t: 'The floor shudders. Deep under the Hall of Origins, the seal on the Underhall - a vault from another dimension - cracks open. Classrooms fold into the dark.' },
      { k: '12:00 AM', t: 'Six classmates are missing. The staff are frozen in time. The only hero awake is you. Descend, fight, rescue, and find out who opened the vault.' },
    ]
    let i = 0
    const render = () => {
      const card = this.modal('intro', null, e => {
        if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyE') {
          next()
          return true
        }
        return false
      })
      const p = panels[i]
      const panel = el('div', `comic-panel panel-${i}`, '', card)
      el('div', 'panel-kicker display', p.k, panel)
      el('p', 'panel-text', p.t, panel)
      const foot = el('div', 'modal-foot', '', card)
      el('span', 'panel-count', `${i + 1} / ${panels.length}`, foot)
      button(i < panels.length - 1 ? 'NEXT' : "LET'S GO!", 'primary', next, foot)
    }
    const next = () => {
      this.sound()
      i += 1
      if (i >= panels.length) {
        this.closeModal()
        onDone()
      } else render()
    }
    render()
  }

  openHowTo(onClose: () => void, _save?: SaveData): void {
    const card = this.modal('howto', onClose)
    el('h2', 'display', 'HERO HANDBOOK', card)
    const grid = el('div', 'howto-grid', '', card)
    const controls = el('div', 'howto-col', '', grid)
    el('h3', '', 'Controls', controls)
    const rows: [string, string, string][] = [
      ['Move', 'WASD', 'Left stick'],
      ['Look / aim', 'Mouse', 'Right stick'],
      ['Combo strike (x3)', 'Left click / J', 'X / RT'],
      ['Power Bolt (hold)', 'Right click / K', 'RB / LT'],
      ['Sprint (hold)', 'Shift', 'L3'],
      ['Jump (clears ground attacks)', 'Space', 'A'],
      ['Dash (invulnerable)', 'C', 'B'],
      ['Super Nova (60 Power)', 'Q', 'LB'],
      ['Interact', 'E / F', 'Y'],
      ['Floor map', 'Tab / M', 'View'],
      ['Pause', 'Esc / P', 'Start'],
    ]
    const table = el('table', 'controls', '', controls)
    const head = el('tr', '', '', table)
    for (const h of ['', 'Keyboard + mouse', 'Gamepad']) el('th', '', h, head)
    for (const r of rows) {
      const tr = el('tr', '', '', table)
      el('td', '', r[0], tr)
      el('td', '', r[1], tr)
      el('td', '', r[2], tr)
    }
    el('p', 'small', 'Touch: left thumb moves, drag the right side to look, and use the on-screen buttons.', controls)
    const tips = el('div', 'howto-col', '', grid)
    el('h3', '', 'How a run works', tips)
    const list = el('ul', 'tips', '', tips)
    for (const t of [
      'Step through the Vault Portal to descend. Every floor is generated from a seed you can replay.',
      'Doors lock when you enter a combat room. Clear every wave to open them and claim the reward.',
      'Red zones are telegraphs: an attack lands there when the fill completes. Dash through or step out.',
      'Melee hits charge Power. Spend it on Power Bolts or a room-clearing Super Nova that also erases bullets.',
      'Power cards offer 3 upgrades: build around melee, bolts, dashes or Nova.',
      'Side branches hold shops, fountains, lore, relics and trapped classmates. The minimap shows icons.',
      'Beat The Proctor to open the way down to The Stacks Below, then defeat The Librarian and take the portal home. Win or lose, you earn Merits for permanent upgrades on campus.',
    ]) el('li', '', t, list)
    this.closeBtn(card, 'GOT IT')
  }

  openSettings(save: SaveData, onChange: (patch: Partial<SaveData>) => void, back: () => void): void {
    const card = this.modal('settings', back)
    el('h2', 'display', 'SETTINGS', card)
    const form = el('div', 'settings', '', card)
    const slider = (label: string, key: 'musicVolume' | 'sfxVolume' | 'sensitivity', min: number, max: number, step: number) => {
      const row = el('label', 'set-row', '', form)
      el('span', '', label, row)
      const input = el('input', '', '', row)
      input.type = 'range'
      input.min = `${min}`
      input.max = `${max}`
      input.step = `${step}`
      input.value = `${save[key]}`
      const out = el('output', '', '', row)
      const fmt = () => (out.textContent = key === 'sensitivity' ? `${Number(input.value).toFixed(1)}x` : `${Math.round(Number(input.value) * 100)}%`)
      fmt()
      input.addEventListener('input', () => {
        fmt()
        onChange({ [key]: Number(input.value) })
      })
    }
    const toggle = (label: string, key: 'muted' | 'invertY' | 'reducedMotion') => {
      const row = el('label', 'set-row toggle', '', form)
      el('span', '', label, row)
      const input = el('input', '', '', row)
      input.type = 'checkbox'
      input.checked = save[key]
      input.addEventListener('change', () => onChange({ [key]: input.checked }))
    }
    slider('Music volume', 'musicVolume', 0, 1, 0.05)
    slider('Effects volume', 'sfxVolume', 0, 1, 0.05)
    toggle('Mute all audio', 'muted')
    slider('Look sensitivity', 'sensitivity', 0.3, 2.5, 0.1)
    toggle('Invert vertical look', 'invertY')
    toggle('Reduced motion (less shake and flashes)', 'reducedMotion')
    const q = el('div', 'set-row', '', form)
    el('span', '', 'Graphics quality', q)
    const seg = el('div', 'segmented', '', q)
    for (const v of ['low', 'medium', 'high'] as Quality[]) {
      const b = button(v.toUpperCase(), save.quality === v ? 'on' : '', () => {
        onChange({ quality: v })
        seg.querySelectorAll('button').forEach(x => x.classList.remove('on'))
        b.classList.add('on')
      }, seg)
    }
    this.closeBtn(card, 'BACK')
  }

  openPause(info: PauseInfo, h: PauseHandlers): void {
    this.lastPause = { info, h }
    const card = this.modal('pause', h.resume)
    el('h2', 'display', 'PAUSED', card)
    const cols = el('div', 'pause-grid', '', card)
    const menu = el('div', 'pause-menu', '', cols)
    button('RESUME', 'primary', () => {
      this.closeModal()
      h.resume()
    }, menu)
    button('SETTINGS', '', () => {
      this.closeModal()
      h.settings()
    }, menu)
    button('HANDBOOK', '', () => this.openHowTo(() => this.openPause(info, h)), menu)
    // Replaying training is a hub-only side activity: it resumes play right here and never starts a run.
    if (info.training === 'replay' && h.training) button('MOVEMENT TRAINING', '', () => {
      this.closeModal()
      h.training!()
    }, menu)
    if (info.training === 'active' && h.skipTraining) button('SKIP TRAINING', 'ghost', () => {
      this.closeModal()
      h.skipTraining!()
    }, menu)
    if (info.inRun) button('ABANDON RUN (half merits)', 'danger', h.abandon, menu)
    button('QUIT TO TITLE', 'ghost', h.quit, menu)
    const side = el('div', 'pause-info', '', cols)
    if (info.inRun) {
      el('h3', '', 'This floor', side)
      const seedRow = el('div', 'seed-row', '', side)
      el('span', '', `${info.wing}  |  Seed `, seedRow)
      el('code', '', `${info.seed}`, seedRow)
      button('COPY', 'mini', () => navigator.clipboard?.writeText(`${info.seed}`).then(() => this.toast('Seed copied'), () => undefined), seedRow)
      el('p', 'small', `${info.rooms} rooms${info.fallback ? '  |  safe fallback layout' : ''}`, side)
      const det = el('details', 'report', '', side)
      el('summary', '', 'Generation report', det)
      const ul = el('ul', '', '', det)
      for (const line of info.report) el('li', '', line, ul)
      el('h3', '', 'Your build', side)
      el('p', 'small', info.build.length ? info.build.join(', ') : 'No upgrades yet. Clear rooms to find power cards.', side)
      if (info.relics.length) el('p', 'small relic-line', `Relics: ${info.relics.join(', ')}`, side)
    } else {
      el('h3', '', 'Hall of Origins', side)
      el('p', 'small', 'You are safe on campus. Spend Merits at the Hero Development Board, check the Codex, then walk north into the Vault Portal.', side)
      if (info.training === 'replay') el('p', 'small', 'Rusty? MOVEMENT TRAINING runs the sprint, jump and dash drills again right here. It never starts a run.', side)
      if (info.training === 'active') el('p', 'small', 'Movement training is running. Skip it now and replay it any time from this menu.', side)
    }
  }

  reopenPause(): void {
    if (this.lastPause) this.openPause(this.lastPause.info, this.lastPause.h)
  }

  openDialogue(title: string, subtitle: string, text: string, color: string, onClose: () => void): void {
    const card = this.modal('dialogue', onClose, e => {
      if (e.code === 'Enter' || e.code === 'KeyE' || e.code === 'Space') {
        this.modalClose?.()
        return true
      }
      return false
    })
    card.style.setProperty('--accent', color)
    el('div', 'dlg-stripe', '', card)
    el('h2', 'display', title, card)
    el('div', 'dlg-sub', subtitle, card)
    el('p', 'dlg-text', text, card)
    const foot = el('div', 'modal-foot', '', card)
    button('CONTINUE', 'primary', () => this.modalClose?.(), foot).append(el('kbd', '', 'E'))
  }

  openUpgrades(choices: { def: UpgradeDef; stacks: number }[], rerolls: number, onPick: (i: number) => void, onReroll: () => void): void {
    const card = this.modal('upgrades', null, e => {
      const n = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code)
      if (n >= 0 && n < choices.length) {
        onPick(n)
        return true
      }
      if (e.code === 'KeyR' && rerolls > 0) {
        onReroll()
        return true
      }
      return false
    })
    el('h2', 'display', 'CHOOSE A POWER', card)
    el('p', 'modal-lede', 'Pick one upgrade for this run. Stacks shown as level.', card)
    const row = el('div', 'cards', '', card)
    choices.forEach((c, i) => {
      const b = el('button', `ucard ${c.def.rarity}`, '', row)
      b.type = 'button'
      b.style.animationDelay = `${i * 70}ms`
      el('div', 'u-rarity', c.def.rarity.toUpperCase(), b)
      const ic = el('div', 'u-icon', '', b)
      ic.innerHTML = icon(c.def.icon)
      el('div', 'u-name display', c.def.name, b)
      el('div', 'u-desc', c.def.desc, b)
      el('div', 'u-meta', `${c.def.tag.toUpperCase()}  |  ${c.stacks ? `Lv ${c.stacks} -> ${c.stacks + 1}` : 'NEW'}${c.def.max > 1 ? ` (max ${c.def.max})` : ''}`, b)
      el('kbd', 'u-key', `${i + 1}`, b)
      b.addEventListener('click', () => onPick(i))
    })
    const foot = el('div', 'modal-foot', '', card)
    const rr = button(`REROLL (${rerolls})`, rerolls > 0 ? '' : 'disabled', () => onReroll(), foot)
    rr.disabled = rerolls <= 0
    rr.append(el('kbd', '', 'R'))
    if (rerolls <= 0) el('span', 'small', 'Unlock rerolls at the Study Hall on campus.', foot)
  }

  openShop(items: ShopItem[], credits: number, onBuy: (i: number) => void, onClose: () => void): void {
    const card = this.modal('shop', onClose)
    el('h2', 'display', 'HERO SUPPLY VENDING', card)
    el('p', 'modal-lede', `You have ${credits} credits.`, card)
    const list = el('div', 'shop-list', '', card)
    items.forEach((it, i) => {
      const row = el('div', `shop-item${it.sold ? ' sold' : ''}${it.rarity ? ` ${it.rarity}` : ''}`, '', list)
      const info = el('div', 'shop-info', '', row)
      el('div', 'shop-name', it.name, info)
      el('div', 'shop-desc', it.desc, info)
      const b = button(it.sold ? 'SOLD' : `${it.price} CR`, it.sold || credits < it.price ? 'disabled' : 'primary', () => onBuy(i), row)
      b.disabled = it.sold || credits < it.price
    })
    this.closeBtn(card)
  }

  openBoard(dev: Record<DevId, number>, merits: number, onBuy: (id: DevId) => void, onClose: () => void): void {
    const card = this.modal('board', onClose)
    el('h2', 'display', 'HERO DEVELOPMENT BOARD', card)
    el('p', 'modal-lede', `Permanent upgrades. You have ${merits} Merits (earned on every run, win or lose).`, card)
    const list = el('div', 'dev-list', '', card)
    for (const d of DEV_BOARD) {
      const lvl = dev[d.id]
      const row = el('div', 'dev-row', '', list)
      const info = el('div', 'dev-info', '', row)
      el('div', 'dev-name display', d.name, info)
      el('div', 'dev-desc', lvl ? `Now: ${d.desc(lvl)}` : 'Not trained yet', info)
      el('div', 'dev-next', lvl < d.max ? `Next: ${d.desc(lvl + 1)}` : 'MASTERED', info)
      const pips = el('div', 'dev-pips', '', row)
      for (let i = 0; i < d.max; i += 1) el('i', i < lvl ? 'on' : '', '', pips)
      const cost = d.cost(lvl)
      const b = button(lvl >= d.max ? 'MAX' : `${cost} M`, lvl >= d.max || merits < cost ? 'disabled' : 'primary', () => onBuy(d.id), row)
      b.disabled = lvl >= d.max || merits < cost
    }
    this.closeBtn(card)
  }

  openCodex(save: SaveData, onClose: () => void): void {
    const card = this.modal('codex', onClose)
    el('h2', 'display', 'ACADEMY CODEX', card)
    const tabs = el('div', 'tabs', '', card)
    const body = el('div', 'codex-body', '', card)
    const show = (tab: string) => {
      tabs.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab))
      body.innerHTML = ''
      if (tab === 'relics') {
        for (const r of RELICS) {
          const got = save.relics.includes(r.id)
          const e = el('div', `codex-entry${got ? '' : ' locked'}`, '', body)
          el('div', 'ce-name', got ? r.name : '??? Undiscovered relic', e)
          el('div', 'ce-desc', got ? `${r.effect} ${r.lore}` : 'Found in treasure vaults and challenge rooms.', e)
        }
      } else if (tab === 'classmates') {
        for (const c of CLASSMATES) {
          const got = save.rescued.includes(c.id)
          const e = el('div', `codex-entry${got ? '' : ' locked'}`, '', body)
          e.style.setProperty('--accent', c.color)
          el('div', 'ce-name', got ? `${c.name}  |  ${c.power}` : '??? Missing student', e)
          el('div', 'ce-desc', got ? `Permanent assist: ${c.assist}. "${c.line}"` : 'Trapped somewhere in the Underhall. Look for detention cells (!).', e)
        }
      } else if (tab === 'lore') {
        for (const l of LORE) {
          const got = save.lore.includes(l.id)
          const e = el('div', `codex-entry${got ? '' : ' locked'}`, '', body)
          el('div', 'ce-name', got ? l.title : '??? Missing page', e)
          el('div', 'ce-desc', got ? l.text : 'Archive nooks (?) hold lost pages about the vault.', e)
        }
      } else {
        const stats: [string, string][] = [
          ['Runs', `${save.runs}`], ['Exams passed', `${save.wins}`], ['Best clear time', save.bestClear ? formatClock(save.bestClear) : '-'],
          ['Total KOs', `${save.totalKills}`], ['Classmates rescued', `${save.rescued.length} / ${CLASSMATES.length}`],
          ['Relics found', `${save.relics.length} / ${RELICS.length}`], ['Lore pages', `${save.lore.length} / ${LORE.length}`], ['Merits banked', `${save.merits}`],
        ]
        const g = el('div', 'stat-grid', '', body)
        for (const [k, v] of stats) {
          const s = el('div', 'stat', '', g)
          el('div', 'stat-v display', v, s)
          el('div', 'stat-k', k, s)
        }
      }
    }
    for (const [id, label] of [['relics', `Relics ${save.relics.length}/${RELICS.length}`], ['classmates', `Classmates ${save.rescued.length}/${CLASSMATES.length}`], ['lore', `Lore ${save.lore.length}/${LORE.length}`], ['records', 'Records']]) {
      const b = button(label, '', () => show(id), tabs)
      b.dataset.tab = id
    }
    show('relics')
    this.closeBtn(card)
  }

  openDescent(lastSeed: number, onStart: (seed: number) => void, onClose: () => void): void {
    const card = this.modal('descent', onClose, e => {
      if (e.code === 'Enter') {
        go()
        return true
      }
      return false
    })
    el('h2', 'display', 'DESCEND INTO THE UNDERHALL', card)
    el('p', 'modal-lede', 'Each floor is assembled from modular rooms by a seeded generator. The same seed always builds the same floor.', card)
    const preview = el('div', 'wing-preview', '', card)
    const wname = el('div', 'wp-name display', '', preview)
    const wtag = el('div', 'wp-tag', '', preview)
    const row = el('div', 'seed-entry', '', card)
    el('label', '', 'Seed', row)
    const input = el('input', '', '', row)
    input.maxLength = 24
    input.spellcheck = false
    input.value = `${randomSeed()}`
    button('RANDOM', '', () => {
      input.value = `${randomSeed()}`
      update()
    }, row)
    if (lastSeed) button('LAST SEED', '', () => {
      input.value = `${lastSeed}`
      update()
    }, row)
    const err = el('div', 'seed-err', '', card)
    const update = () => {
      const s = parseSeed(input.value)
      err.textContent = s === null ? 'Enter a seed: any number or word works.' : ''
      if (s === null) return
      const w = WINGS[wingForSeed(s)]
      wname.textContent = `Floor 1: ${w.name}`
      wtag.textContent = `${w.tagline}  Then Floor 2: The Stacks Below.`
      preview.style.setProperty('--accent', w.trim)
      preview.style.setProperty('--bg', w.fog)
    }
    input.addEventListener('input', update)
    update()
    const facts = el('ul', 'descent-facts', '', card)
    for (const f of ['Two floors, each a 7-room critical path to a boss: The Proctor, then The Librarian', 'Optional branches: fountain, store, trapped classmate, relic vault, lore', 'At least one healing stop before every boss, always']) el('li', '', f, facts)
    const foot = el('div', 'modal-foot', '', card)
    button('NOT YET', 'ghost', () => this.modalClose?.(), foot)
    const go = () => {
      const s = parseSeed(input.value)
      if (s === null) return
      this.sound()
      onStart(s)
    }
    button('DESCEND', 'primary big', go, foot).append(el('kbd', '', 'ENTER'))
  }

  openResults(r: ResultsInfo, h: { hub: () => void; retry: () => void; fresh: () => void }): void {
    const card = this.modal(`results ${r.won ? 'won' : 'lost'}`, null, e => {
      if (e.code === 'Enter') {
        h.hub()
        return true
      }
      return false
    })
    const head = el('div', 'res-head', '', card)
    el('div', 'res-title display', r.won ? 'UNDERHALL SEALED!' : 'KNOCKED OUT!', head)
    el('div', 'res-sub', r.won ? 'The Proctor and The Librarian are sealed. The Underhall is quiet... for tonight.' : `Your classmates carried you back to campus from ${r.wing}.`, head)
    const rank = el('div', `rank rank-${r.rank}`, '', head)
    el('span', 'display', r.rank, rank)
    el('small', '', 'RANK', rank)
    const s = r.summary
    const g = el('div', 'stat-grid', '', card)
    for (const [k, v] of [
      ['Time', formatClock(s.seconds) + (r.newBest ? '  NEW BEST' : '')], ['Rooms cleared', `${s.roomsCleared}`], ['KOs', `${s.kills}`],
      ['Rescued', `${s.rescues}`], ['Relics', `${s.relics}`], ['Bosses', `${s.bosses} / 2`],
    ] as [string, string][]) {
      const st = el('div', 'stat', '', g)
      el('div', 'stat-v display', v, st)
      el('div', 'stat-k', k, st)
    }
    const m = el('div', 'merit-line', '', card)
    el('span', 'display', `+${r.merits} MERITS`, m)
    el('span', 'small', 'Spend them at the Hero Development Board.', m)
    if (r.rescued.length) el('p', 'small', `Rescued: ${r.rescued.join(', ')}`, card)
    if (r.build.length) el('p', 'small', `Build: ${r.build.join(', ')}`, card)
    el('p', 'small seed-note', `Seed ${s.seed}`, card)
    const foot = el('div', 'modal-foot', '', card)
    button('RETRY SEED', '', h.retry, foot)
    button('NEW FLOOR', '', h.fresh, foot)
    button('RETURN TO CAMPUS', 'primary', h.hub, foot).append(el('kbd', '', 'ENTER'))
  }

  // ─── Touch controls ────────────────────────────────────────────────────
  // Landscape layout for phones and tablets: a joystick under the left thumb (it opens where the thumb lands and rests in its corner otherwise), the action buttons
  // under the right thumb, a run switch beside the stick, pause and map at the top, and a drag anywhere on the right half to look around.

  private buildTouch(): void {
    const t = el('div', 'touch', '', this.root)
    this.touchEl = t
    const buzz = (ms = 8) => {
      try { navigator.vibrate?.(ms) } catch { /* not supported */ }
    }
    t.addEventListener('contextmenu', e => e.preventDefault())

    // ── joystick
    const stickZone = el('div', 't-stick-zone', '', t)
    const base = el('div', 't-stick', '', stickZone)
    el('div', 't-stick-rim', '', base)
    const knob = el('div', 't-knob', '', base)
    let stickId: number | null = null
    let cx = 0
    let cy = 0
    const DEAD = 0.1
    const releaseStick = () => {
      stickId = null
      knob.style.transform = ''
      base.classList.remove('on', 'rim')
      base.style.removeProperty('--sx')
      base.style.removeProperty('--sy')
      this.input.setTouchMove(0, 0)
    }
    stickZone.addEventListener('pointerdown', e => {
      if (stickId !== null) return
      e.preventDefault()
      stickId = e.pointerId
      // the stick opens under the thumb, kept fully inside its zone
      const r = stickZone.getBoundingClientRect()
      const half = base.offsetWidth / 2
      cx = Math.min(Math.max(e.clientX, r.left + half), r.right - half)
      cy = Math.min(Math.max(e.clientY, r.top + half), r.bottom - half)
      base.style.setProperty('--sx', `${cx - r.left}px`)
      base.style.setProperty('--sy', `${cy - r.top}px`)
      base.classList.add('on')
      try { stickZone.setPointerCapture(e.pointerId) } catch { /* the pointer is already gone */ }
    })
    stickZone.addEventListener('pointermove', e => {
      if (e.pointerId !== stickId) return
      e.preventDefault()
      const radius = base.offsetWidth * 0.5
      const dx = e.clientX - cx
      const dy = e.clientY - cy
      const len = Math.hypot(dx, dy)
      const a = Math.atan2(dy, dx)
      const k = Math.min(1, len / radius)
      knob.style.transform = `translate(${Math.cos(a) * Math.min(len, radius)}px, ${Math.sin(a) * Math.min(len, radius)}px)`
      // a small dead zone, then the push grows smoothly from nothing to full
      const m = k < DEAD ? 0 : (k - DEAD) / (1 - DEAD)
      this.input.setTouchMove(Math.cos(a) * m, -Math.sin(a) * m)
      base.classList.toggle('rim', k > 0.92)
    })
    const endStick = (e: PointerEvent) => {
      if (e.pointerId === stickId) releaseStick()
    }
    stickZone.addEventListener('pointerup', endStick)
    stickZone.addEventListener('pointercancel', endStick)
    stickZone.addEventListener('lostpointercapture', endStick)

    // ── look: drag on the right half
    const look = el('div', 't-look-zone', '', t)
    let lookId: number | null = null
    let lx = 0
    let ly = 0
    look.addEventListener('pointerdown', e => {
      if (lookId !== null) return
      e.preventDefault()
      lookId = e.pointerId
      lx = e.clientX
      ly = e.clientY
      try { look.setPointerCapture(e.pointerId) } catch { /* the pointer is already gone */ }
    })
    look.addEventListener('pointermove', e => {
      if (e.pointerId !== lookId) return
      e.preventDefault()
      this.input.addTouchLook(e.clientX - lx, e.clientY - ly)
      lx = e.clientX
      ly = e.clientY
    })
    const endLook = (e: PointerEvent) => {
      if (e.pointerId === lookId) lookId = null
    }
    look.addEventListener('pointerup', endLook)
    look.addEventListener('pointercancel', endLook)
    look.addEventListener('lostpointercapture', endLook)

    // ── run switch (tap to start running, tap again to stop; pushing the stick to its rim also runs)
    let running = false
    const runBtn = el('button', 't-run', '', t)
    runBtn.type = 'button'
    runBtn.setAttribute('aria-label', 'Run')
    runBtn.setAttribute('aria-pressed', 'false')
    runBtn.innerHTML = `${icon('dash')}<span class="t-lbl">RUN</span>`
    const setRun = (on: boolean) => {
      running = on
      runBtn.classList.toggle('on', on)
      runBtn.setAttribute('aria-pressed', String(on))
      this.input.setTouchButton('sprint', on)
    }
    runBtn.addEventListener('pointerdown', e => {
      e.preventDefault()
      buzz()
      setRun(!running)
    })

    // ── action buttons
    const btns = el('div', 't-buttons', '', t)
    const tb = (action: 'attack' | 'bolt' | 'dash' | 'jump' | 'nova' | 'interact', ic: string, cls: string, label: string) => {
      const b = el('button', `t-btn ${cls}`, '', btns)
      b.type = 'button'
      b.setAttribute('aria-label', label)
      b.innerHTML = `${icon(ic)}<span class="t-lbl">${label}</span>`
      b.addEventListener('pointerdown', e => {
        e.preventDefault()
        buzz()
        b.classList.add('down')
        try { b.setPointerCapture(e.pointerId) } catch { /* the pointer is already gone */ }
        this.input.setTouchButton(action, true)
      })
      const up = () => {
        b.classList.remove('down')
        this.input.setTouchButton(action, false)
      }
      b.addEventListener('pointerup', up)
      b.addEventListener('pointercancel', up)
      b.addEventListener('lostpointercapture', up)
      return b
    }
    tb('attack', 'fist', 't-attack', 'PUNCH')
    tb('bolt', 'bolt', 't-bolt', 'BOLT')
    this.refs.tDash = tb('dash', 'dash', 't-dash', 'DASH')
    this.refs.tJump = tb('jump', 'wing', 't-jump', 'JUMP')
    tb('nova', 'star', 't-nova', 'NOVA')
    tb('interact', 'hand', 't-interact hidden', 'USE')

    // ── pause and map
    const topb = el('div', 't-top', '', t)
    const tap = (b: HTMLElement, action: 'pause' | 'map') => {
      b.addEventListener('pointerdown', e => {
        e.preventDefault()
        buzz()
        this.input.setTouchButton(action, true)
        window.setTimeout(() => this.input.setTouchButton(action, false), 60)
      })
    }
    const pb = el('button', 't-small', 'II', topb)
    pb.type = 'button'
    pb.setAttribute('aria-label', 'Pause')
    tap(pb, 'pause')
    const mb = el('button', 't-small', 'MAP', topb)
    mb.type = 'button'
    mb.setAttribute('aria-label', 'Map')
    tap(mb, 'map')

    // the game left play (menu, pause, ...): let go of everything that was held
    this.touchReset = () => {
      releaseStick()
      lookId = null
      setRun(false)
    }
  }
}
