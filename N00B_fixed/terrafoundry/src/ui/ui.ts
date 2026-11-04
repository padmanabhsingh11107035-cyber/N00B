import type { Difficulty, Mode, Quality, SandboxConfig, SaveData } from '../engine/save'
import type { Sfx } from '../engine/audio'
import { HOTBAR, INV_SIZE, moveAll, moveStack, type Inventory, type Slot } from '../game/inventory'
import { CATEGORY_NAMES, ITEMS, RECIPES, STATION_NAMES, itemIcon, type ItemCat, type ItemId, type Recipe, type Station } from '../game/items'
import { MAX_SKILL, SKILLS, SKILL_DESC, SKILL_NAMES, xpToNext, type SkillId, type Skills } from '../game/progress'
import type { Stats } from '../game/survival'
import { HudFx } from './hudfx'

export type CompassMarker = { bearing: number; label: string; dist: number; known: boolean; camp?: boolean; /** Waypoint colour. */ pin?: string }
export type TipView = { id: string; text: string; done: boolean }
export type BuffView = { id: 'rested' | 'warming'; label: string; remaining: number | null; progress?: number }
export type WaveView = { night: number; title: string; remaining: number; total: number; boss: boolean }
export type TitleInfo = {
  save: { seed: string; mode: Mode; difficulty: Difficulty; day: number; savedAt: number } | null
  config: SandboxConfig
  settings: SaveData
}
export type UIHandlers = {
  continueWorld(): void
  newWorld(cfg: SandboxConfig): void
  resume(): void
  save(): void
  quit(): void
  reset(): void
  respawn(): void
  settings(patch: Partial<SaveData>): void
  craft(r: Recipe, n: number): void
  closeInventory(): void
  selectSlot(i: number): void
  invChanged(): void
  dismissTips(): void
  uiSound(name: Sfx): void
}

const SEEDS = ['Hearthvale', 'Mossreach', 'Emberfall', 'Cinderglen', 'Stonewake', 'Fernhollow', 'Duskmere', 'Amberlight', 'Wildbarrow', 'Tidewood', 'Greyridge', 'Sunward']
const ICON = {
  dice: '<svg viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="17" height="17" rx="4" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="8.5" cy="8.5" r="1.4"/><circle cx="15.5" cy="15.5" r="1.4"/><circle cx="15.5" cy="8.5" r="1.4"/><circle cx="8.5" cy="15.5" r="1.4"/><circle cx="12" cy="12" r="1.4"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="m5.5 12.5 4.2 4.2 8.8-9.4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  ward: '<svg viewBox="0 0 24 24"><path d="M12 2.8 4.5 5.7v5.6c0 4.6 3.1 8.3 7.5 9.9 4.4-1.6 7.5-5.3 7.5-9.9V5.7Z"/></svg>',
}

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (html) e.innerHTML = html
  return e
}
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const icon = (name: string, cls = '') => `<img class="${cls ? `${cls} ` : ''}icon-img" src="./assets/icons/${name}.webp" alt="">`
const mmss = (n: number | null) => n === null ? '' : `${Math.max(0, Math.floor(n / 60)).toString().padStart(2, '0')}:${Math.max(0, Math.floor(n % 60)).toString().padStart(2, '0')}`

export class UI {
  private readonly root: HTMLElement
  private readonly fx: HudFx
  private title: HTMLElement
  private hud: HTMLElement
  private inv: HTMLElement
  private pauseEl: HTMLElement
  private deathEl: HTMLElement
  private modal: HTMLElement
  private hotbar: HTMLElement
  private hotSlots: HTMLElement[] = []
  private stats: Record<'health' | 'hunger' | 'stamina', { fill: HTMLElement; val: HTMLElement; row: HTMLElement }>
  private statsEl: HTMLElement
  private buffsEl: HTMLElement
  private compassStrip: HTMLElement
  private compassMarks: HTMLElement
  private markerPool: HTMLElement[] = []
  private compassWidth = 0
  private lastHeading = Number.NaN
  private clock: HTMLElement
  private toasts: HTMLElement
  private bannerEl: HTMLElement
  private waveEl: HTMLElement
  private bossEl: HTMLElement
  private stageEl: HTMLElement
  private hintEl: HTMLElement
  private nameEl: HTMLElement
  private targetEl: HTMLElement
  private tipsEl: HTMLElement
  private vignette: HTMLElement
  private water: HTMLElement
  private crosshair: HTMLElement
  private hitEl: HTMLElement
  private floaters: HTMLElement
  private skillPopups: HTMLElement
  private levelPlate: HTMLElement
  private flashHint = 0
  private nameTimer = 0
  private bannerTimer = 0
  private tipsKey = ''
  private tipsHidden = false
  private markers: CompassMarker[] = []
  private invData: Inventory | null = null
  private invSlots: HTMLElement[] = []
  private chestData: Slot[] | null = null
  private chestSlots: HTMLElement[] = []
  private chestPanel!: HTMLElement
  private invPanel!: HTMLElement
  private cursorEl: HTMLElement
  private tooltip: HTMLElement
  private recipeList: HTMLElement
  private recipeDetail: HTMLElement
  private stationLine: HTMLElement
  private skillsList: HTMLElement
  private tab: ItemCat | 'all' | 'skills' = 'all'
  private selRecipe: Recipe | null = null
  private stations = new Set<Station>()
  private settings: SaveData | null = null
  private skills: Skills | null = null
  private lastStats: Partial<Record<'health' | 'hunger' | 'stamina', number>> = {}
  private lastHotSelected = -1
  private lastHover = 0
  private titleFxTimer = 0

  constructor(root: HTMLElement, private readonly on: UIHandlers) {
    this.root = root
    root.innerHTML = ''
    this.fx = new HudFx(root)
    this.water = h('div', 'underwater')
    this.vignette = h('div', 'vignette')
    this.hud = h('div', 'hud hidden')
    this.hud.innerHTML = `
      <div class="compass"><div class="compass-strip"></div><div class="compass-marks"></div><div class="compass-needle"></div></div>
      <div class="wave-tracker hidden"></div><div class="clock"></div><div class="tips"></div>
      <div class="crosshair"><i></i><b class="charge"></b><em class="hit-marker"></em></div><div class="target"></div>
      <div class="banner"><h2></h2><p></p></div><div class="boss-bar hidden"><b></b><div><i></i></div></div>
      <div class="skill-popups"></div><div class="level-plate"></div><div class="damage-floaters"></div><div class="toasts"></div>
      <div class="stage-status hidden"><i></i><span></span></div>
      <div class="bottom"><div class="hint"></div><div class="item-name"></div><div class="bottom-row"><div class="stat-bundle"><div class="stats"></div><div class="buffs"></div></div><div class="hotbar"></div></div></div>`
    root.append(this.water, this.vignette, this.hud)
    const q = <T extends HTMLElement>(sel: string, el: HTMLElement = this.hud) => el.querySelector(sel) as T
    this.compassStrip = q('.compass-strip')
    this.compassMarks = q('.compass-marks')
    this.clock = q('.clock')
    this.tipsEl = q('.tips')
    this.targetEl = q('.target')
    this.bannerEl = q('.banner')
    this.waveEl = q('.wave-tracker')
    this.bossEl = q('.boss-bar')
    this.stageEl = q('.stage-status')
    this.toasts = q('.toasts')
    this.hintEl = q('.hint')
    this.nameEl = q('.item-name')
    this.hotbar = q('.hotbar')
    this.statsEl = q('.stats')
    this.buffsEl = q('.buffs')
    this.crosshair = q('.crosshair')
    this.hitEl = q('.hit-marker')
    this.floaters = q('.damage-floaters')
    this.skillPopups = q('.skill-popups')
    this.levelPlate = q('.level-plate')
    this.buildCompass()
    const stat = (key: 'health' | 'hunger' | 'stamina', iconId: string, label: string) => {
      const row = h('div', `stat stat-${key}`, `<span class="stat-icon" title="${label}">${icon(iconId)}</span><div class="stat-bar"><div class="stat-fill"></div></div><span class="stat-val"></span>`)
      this.statsEl.append(row)
      return { row, fill: row.querySelector('.stat-fill') as HTMLElement, val: row.querySelector('.stat-val') as HTMLElement }
    }
    this.stats = { health: stat('health', 'hud_health', 'Health'), hunger: stat('hunger', 'hud_hunger', 'Hunger'), stamina: stat('stamina', 'hud_stamina', 'Stamina') }
    for (let i = 0; i < HOTBAR; i++) {
      const slot = h('button', 'slot hot', `<span class="key">${i + 1}</span>`)
      slot.addEventListener('pointerdown', e => { e.preventDefault(); this.on.selectSlot(i) })
      this.hotbar.append(slot)
      this.hotSlots.push(slot)
    }
    this.title = h('div', 'screen title-screen')
    this.inv = h('div', 'screen inv-screen hidden')
    this.pauseEl = h('div', 'screen pause-screen hidden')
    this.deathEl = h('div', 'screen death-screen hidden')
    this.modal = h('div', 'modal-layer hidden')
    this.cursorEl = h('div', 'cursor-stack hidden')
    this.tooltip = h('div', 'tooltip hidden')
    root.append(this.title, this.inv, this.pauseEl, this.deathEl, this.modal, this.cursorEl, this.tooltip)
    this.recipeList = h('div', 'recipes')
    this.recipeDetail = h('div', 'recipe-detail')
    this.stationLine = h('div', 'station-line')
    this.skillsList = h('div', 'skills-list hidden')
    this.buildInventory()
    this.buildPause()
    root.addEventListener('pointerover', e => {
      if ((e.target as HTMLElement).closest('button, .slot, .recipe, .tab')) this.sound('hover')
    })
    root.addEventListener('click', e => {
      if ((e.target as HTMLElement).closest('button')) this.sound('click')
    })
    window.addEventListener('keydown', e => {
      if (!this.modal.classList.contains('hidden')) {
        if (e.code === 'Escape') this.closeModal()
        return
      }
      if (!this.inv.classList.contains('hidden') && (e.code === 'KeyE' || e.code === 'Escape' || e.code === 'Tab')) { e.preventDefault(); this.on.closeInventory() }
      else if (!this.pauseEl.classList.contains('hidden') && (e.code === 'Escape' || e.code === 'KeyP')) { e.preventDefault(); this.on.resume() }
    })
    document.addEventListener('pointermove', e => {
      if (!this.cursorEl.classList.contains('hidden')) this.cursorEl.style.transform = `translate(${e.clientX - 26}px, ${e.clientY - 26}px)`
      if (!this.tooltip.classList.contains('hidden')) this.tooltip.style.transform = `translate(${Math.min(innerWidth - 260, e.clientX + 16)}px, ${Math.min(innerHeight - 120, e.clientY + 18)}px)`
    })
    window.addEventListener('resize', () => { this.compassWidth = 0; this.lastHeading = Number.NaN }, { passive: true })
  }

  get fxCount(): number { return this.fx.active }

  private sound(name: 'click' | 'hover'): void {
    if (name === 'hover') {
      const t = performance.now()
      if (t - this.lastHover < 60) return
      this.lastHover = t
    }
    this.on.uiSound(name as Sfx)
  }

  // ─── Title ─────────────────────────────────────────────────────────────
  showTitle(info: TitleInfo): void {
    this.settings = info.settings
    this.closeModal()
    this.title.classList.remove('hidden')
    const save = info.save
    const ago = save ? this.ago(save.savedAt) : ''
    this.title.innerHTML = `<div class="title-bg"></div><div class="title-shade"></div><div class="title-inner">
      <div class="title-logo title-wordmark" role="img" aria-label="TerraFoundry">TerraFoundry</div><p class="title-tagline">Shape the wild. Survive the night.</p>
      <div class="title-menu">
        ${save ? `<button class="btn primary big" data-a="continue"><span>Continue</span><small>${esc(save.seed)} · ${save.mode === 'creative' ? 'Creative' : 'Survival'} · Day ${save.day}${ago ? ` · ${ago}` : ''}</small></button>` : ''}
        <button class="btn ${save ? '' : 'primary'} big" data-a="new"><span>New World</span><small>Pick a seed, mode and difficulty</small></button>
        <div class="btn-row"><button class="btn" data-a="settings">Settings</button><button class="btn" data-a="controls">Controls</button></div>
      </div><p class="title-foot">Single-player · Your world saves automatically in this browser</p></div>`
    this.title.querySelector('[data-a="continue"]')?.addEventListener('click', () => this.on.continueWorld())
    this.title.querySelector('[data-a="new"]')?.addEventListener('click', () => this.newWorldPanel(info))
    this.title.querySelector('[data-a="settings"]')?.addEventListener('click', () => this.settingsPanel())
    this.title.querySelector('[data-a="controls"]')?.addEventListener('click', () => this.controlsPanel())
    this.fx.canvas.classList.add('title-fx')
    this.startTitleFx()
  }

  private startTitleFx(): void {
    clearInterval(this.titleFxTimer)
    this.titleFxTimer = window.setInterval(() => {
      if (this.title.classList.contains('hidden') || document.hidden) return
      this.fx.burst(innerWidth * (0.08 + Math.random() * 0.72), innerHeight * (0.62 + Math.random() * 0.28), { sprite: Math.random() > 0.5 ? 4 : 7, count: 1, speed: 15, life: 2.2, size: 14, gravity: -7 })
    }, 500)
  }

  private ago(t: number): string {
    if (!t) return ''
    const minutes = Math.round((Date.now() - t) / 60000)
    if (minutes < 1) return 'just now'
    if (minutes < 60) return `${minutes} min ago`
    const hours = Math.round(minutes / 60)
    return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`
  }

  private newWorldPanel(info: TitleInfo): void {
    const cfg: SandboxConfig = { ...info.config }
    const body = h('div', 'new-world')
    const modeText: Record<Mode, string> = { survival: 'Gather, craft and survive. Manage health, hunger and stamina; the Hollow roam at night.', creative: 'Unlimited materials, instant mining and free flight (F). Nothing hunts you.' }
    const diffText: Record<Difficulty, string> = { peaceful: 'No night creatures, no starving. Wildlife only.', normal: 'The intended balance of hunger and danger.', hard: 'Faster hunger, harder hits and more Hollow.' }
    body.innerHTML = `<label class="field"><span>World seed</span><div class="seed-row"><input class="seed" maxlength="32" spellcheck="false" value="${esc(cfg.seed)}" aria-label="World seed"><button class="btn icon" data-a="dice" title="Random seed">${ICON.dice}</button></div></label>
      <div class="field"><span>Mode</span><div class="seg" data-k="mode"><button data-v="survival">Survival</button><button data-v="creative">Creative</button></div><p class="desc mode-desc"></p></div>
      <div class="field diff-field"><span>Difficulty</span><div class="seg" data-k="difficulty"><button data-v="peaceful">Peaceful</button><button data-v="normal">Normal</button><button data-v="hard">Hard</button></div><p class="desc diff-desc"></p></div>
      ${info.save ? '<p class="warn">Creating a new world replaces your current save.</p>' : ''}<div class="modal-actions"><button class="btn" data-a="back">Back</button><button class="btn primary" data-a="create">Create World</button></div>`
    const seed = body.querySelector('.seed') as HTMLInputElement
    const sync = () => {
      body.querySelectorAll<HTMLElement>('.seg').forEach(seg => {
        const key = seg.dataset.k as 'mode' | 'difficulty'
        seg.querySelectorAll<HTMLButtonElement>('button').forEach(button => button.classList.toggle('on', button.dataset.v === cfg[key]))
      })
      ;(body.querySelector('.mode-desc') as HTMLElement).textContent = modeText[cfg.mode]
      ;(body.querySelector('.diff-desc') as HTMLElement).textContent = cfg.mode === 'creative' ? 'Creative worlds are always peaceful.' : diffText[cfg.difficulty]
      body.querySelector('.diff-field')!.classList.toggle('dim', cfg.mode === 'creative')
    }
    body.querySelectorAll<HTMLElement>('.seg').forEach(seg => seg.addEventListener('click', e => {
      const button = (e.target as HTMLElement).closest('button')
      if (!button) return
      const key = seg.dataset.k as 'mode' | 'difficulty'
      ;(cfg as Record<string, string>)[key] = button.dataset.v!
      sync()
    }))
    body.querySelector('[data-a="dice"]')!.addEventListener('click', () => { seed.value = `${SEEDS[Math.floor(Math.random() * SEEDS.length)]}-${Math.floor(Math.random() * 900 + 100)}` })
    body.querySelector('[data-a="back"]')!.addEventListener('click', () => this.closeModal())
    const create = () => { cfg.seed = seed.value.trim().slice(0, 32) || SEEDS[0]; this.closeModal(); this.on.newWorld(cfg) }
    body.querySelector('[data-a="create"]')!.addEventListener('click', create)
    seed.addEventListener('keydown', e => { if (e.key === 'Enter') create() })
    sync(); this.openModal('New World', body)
    if (matchMedia('(pointer: fine)').matches) { seed.focus(); seed.select() }
  }

  hideTitle(): void { this.title.classList.add('hidden'); this.fx.canvas.classList.remove('title-fx'); this.closeModal(); clearInterval(this.titleFxTimer) }
  setHud(on: boolean): void { this.hud.classList.toggle('hidden', !on) }

  // ─── Modal panels ──────────────────────────────────────────────────────
  private openModal(title: string, body: HTMLElement, wide = false): void {
    this.modal.innerHTML = ''
    const box = h('div', `modal ${wide ? 'wide' : ''}`)
    const head = h('div', 'modal-head', `<h3>${esc(title)}</h3>`)
    const close = h('button', 'btn icon ghost', ICON.close)
    close.setAttribute('aria-label', 'Close'); close.addEventListener('click', () => this.closeModal())
    head.append(close); box.append(head, body); this.modal.append(box); this.modal.classList.remove('hidden')
    this.modal.onclick = e => { if (e.target === this.modal) this.closeModal() }
  }
  private closeModal(): void { this.modal.classList.add('hidden'); this.modal.innerHTML = '' }

  settingsPanel(): void {
    const settings = this.settings
    if (!settings) return
    const body = h('div', 'settings')
    const slider = (key: keyof SaveData, label: string, min: number, max: number, step: number, fmt: (value: number) => string) => {
      const row = h('label', 'set-row', `<span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${settings[key]}"><output>${fmt(settings[key] as number)}</output>`)
      const input = row.querySelector('input')!
      input.addEventListener('input', () => { const value = Number(input.value); row.querySelector('output')!.textContent = fmt(value); this.patch({ [key]: value } as Partial<SaveData>) })
      body.append(row)
    }
    const toggle = (key: keyof SaveData, label: string) => {
      const row = h('label', 'set-row toggle', `<span>${label}</span><input type="checkbox" ${settings[key] ? 'checked' : ''}><i></i>`)
      const input = row.querySelector('input')!
      input.addEventListener('change', () => this.patch({ [key]: input.checked } as Partial<SaveData>)); body.append(row)
    }
    const pct = (v: number) => `${Math.round(v * 100)}%`
    body.append(h('h4', '', 'Audio')); slider('musicVolume', 'Music', 0, 1, 0.05, pct); slider('sfxVolume', 'Effects', 0, 1, 0.05, pct); toggle('muted', 'Mute all')
    body.append(h('h4', '', 'Controls')); slider('sensitivity', 'Look sensitivity', 0.2, 3, 0.05, v => v.toFixed(2)); toggle('invertY', 'Invert vertical look')
    body.append(h('h4', '', 'Display')); slider('fov', 'Field of view', 55, 100, 1, v => `${v}°`); slider('viewDistance', 'View distance', 2, 6, 1, v => `${v * 32} m`)
    const quality = h('div', 'set-row', '<span>Graphics quality</span><div class="seg small"><button data-v="low">Low</button><button data-v="medium">Medium</button><button data-v="high">High</button></div>')
    const sync = () => quality.querySelectorAll<HTMLButtonElement>('button').forEach(button => button.classList.toggle('on', button.dataset.v === this.settings!.quality))
    quality.querySelector('.seg')!.addEventListener('click', e => { const button = (e.target as HTMLElement).closest('button'); if (!button) return; this.patch({ quality: button.dataset.v as Quality }); sync() })
    sync(); body.append(quality); toggle('headBob', 'Head bob'); toggle('reducedMotion', 'Reduced motion')
    const again = h('button', 'btn small', 'Show the getting-started tips again')
    again.addEventListener('click', () => { this.patch({ tutorialDone: false }); this.tipsHidden = false; again.textContent = 'Tips will show in your world' })
    body.append(h('h4', '', 'Help'), again); this.openModal('Settings', body)
  }
  private patch(patch: Partial<SaveData>): void { this.settings = { ...this.settings!, ...patch }; this.on.settings(patch) }

  controlsPanel(): void {
    const rows: [string, string, string][] = [['Move', 'W A S D', 'Left stick'], ['Look', 'Mouse', 'Right stick'], ['Jump / swim up', 'Space', 'A'], ['Sprint', 'Shift', 'L3'], ['Mine · chop · dig · attack', 'Hold left mouse', 'RT'], ['Place · eat · use station', 'Right mouse', 'LT'], ['Rotate building part', 'R', 'X'], ['Select hotbar slot', '1–9 · mouse wheel', 'LB / RB'], ['Open pack & crafting', 'E or Tab', 'Y'], ['World map', 'M', 'Back / View'], ['Open door · open chest', 'Right mouse on it', 'LT'], ['Fly (Creative) · descend', 'F · Ctrl / C', 'R3 · B'], ['Pause', 'Esc or P', 'Start']]
    const body = h('div', 'controls')
    body.innerHTML = `<table><thead><tr><th>Action</th><th>Keyboard & mouse</th><th>Gamepad</th></tr></thead><tbody>${rows.map(row => `<tr><td>${row[0]}</td><td><kbd>${row[1]}</kbd></td><td><kbd>${row[2]}</kbd></td></tr>`).join('')}</tbody></table><p class="desc">Touch: left stick moves, drag the right side to look, and use the MINE, USE, JUMP, ROTATE, PACK and MAP buttons. Tap a hotbar slot to select it.</p><p class="desc">Inventory: click to pick up or drop a stack, right-click to split, Shift-click to move between pack and hotbar.</p>`
    this.openModal('Controls', body, true)
  }
  private confirm(title: string, text: string, yes: string, fn: () => void): void {
    const body = h('div', 'confirm', `<p>${esc(text)}</p><div class="modal-actions"><button class="btn" data-a="no">Cancel</button><button class="btn danger" data-a="yes">${esc(yes)}</button></div>`)
    body.querySelector('[data-a="no"]')!.addEventListener('click', () => this.closeModal())
    body.querySelector('[data-a="yes"]')!.addEventListener('click', () => { this.closeModal(); fn() })
    this.openModal(title, body)
  }

  // ─── Pause and death ───────────────────────────────────────────────────
  private buildPause(): void {
    this.pauseEl.innerHTML = `<div class="panel pause"><h2>Paused</h2><button class="btn primary big" data-a="resume">Resume</button><div class="btn-row"><button class="btn" data-a="save">Save World</button><button class="btn" data-a="settings">Settings</button></div><div class="btn-row"><button class="btn" data-a="controls">Controls</button><button class="btn danger-ghost" data-a="reset">Reset World</button></div><button class="btn ghost" data-a="quit">Save & Quit to Title</button></div>`
    const bind = (action: string, fn: () => void) => this.pauseEl.querySelector(`[data-a="${action}"]`)!.addEventListener('click', fn)
    bind('resume', () => this.on.resume()); bind('save', () => this.on.save()); bind('settings', () => this.settingsPanel()); bind('controls', () => this.controlsPanel())
    bind('reset', () => this.confirm('Reset world?', 'This permanently deletes your builds, terrain changes and pack, then starts this seed fresh.', 'Reset World', () => this.on.reset()))
    bind('quit', () => this.on.quit())
  }
  showPause(): void { this.pauseEl.classList.remove('hidden') }
  hidePause(): void { this.pauseEl.classList.add('hidden'); this.closeModal() }
  showDeath(cause: string, day: number): void {
    this.deathEl.innerHTML = `<div class="panel death"><h2>You were lost to the wild</h2><p class="cause">${esc(cause)} · Day ${day}</p><p class="desc">Your pack is intact. You will wake at your campfire, or where you first arrived.</p><button class="btn primary big" data-a="respawn">Respawn</button></div>`
    this.deathEl.querySelector('[data-a="respawn"]')!.addEventListener('click', () => this.on.respawn()); this.deathEl.classList.remove('hidden')
  }
  hideDeath(): void { this.deathEl.classList.add('hidden') }

  // ─── HUD ───────────────────────────────────────────────────────────────
  private buildCompass(): void {
    const labels: Record<number, string> = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' }
    let html = ''
    for (let degrees = -360; degrees <= 720; degrees += 15) {
      const normalized = ((degrees % 360) + 360) % 360
      const label = labels[normalized]
      html += `<span class="tick ${label ? (label.length === 1 ? 'major' : 'mid') : ''}" style="left:${(degrees + 360) * 3}px">${label ?? ''}</span>`
    }
    this.compassStrip.innerHTML = html
  }

  setHeading(yaw: number): void {
    const degrees = ((((-yaw * 180) / Math.PI) % 360) + 360) % 360
    const parent = this.compassStrip.parentElement!
    const width = parent.clientWidth
    if (width !== this.compassWidth || Math.abs(degrees - this.lastHeading) > 0.04) {
      this.compassWidth = width; this.lastHeading = degrees
      this.compassStrip.style.transform = `translateX(${width / 2 - (degrees + 360) * 3}px)`
      let used = 0
      for (const marker of this.markers) {
        const bearing = marker.bearing * 180 / Math.PI
        let relative = bearing - degrees
        relative = ((relative + 540) % 360) - 180
        if (Math.abs(relative) * 3 > width / 2 - 12) continue
        let el = this.markerPool[used]
        if (!el) { el = h('span', 'mark'); this.markerPool.push(el); this.compassMarks.append(el) }
        el.style.display = ''; el.className = `mark ${marker.known ? 'known' : ''} ${marker.camp ? 'camp' : ''} ${marker.pin ? 'pin' : ''}`; if (marker.pin) el.style.setProperty('--pc', marker.pin); el.style.transform = `translateX(${width / 2 + relative * 3}px)`
        const text = `${esc(marker.label)}<small>${Math.round(marker.dist)} m</small>`
        if (el.dataset.t !== text) { el.innerHTML = text; el.dataset.t = text }
        used++
      }
      for (let i = used; i < this.markerPool.length; i++) this.markerPool[i].style.display = 'none'
    }
  }
  setCompassMarkers(markers: CompassMarker[]): void { this.markers = markers; this.lastHeading = Number.NaN }
  setClock(time: string, day: number, night: boolean, warded: boolean, modeLabel: string): void {
    const html = `<span class="clock-ico ${night ? 'night' : ''}">${icon(night ? 'hud_moon' : 'hud_sun')}</span><b>${time}</b><span class="day">Day ${day}</span><span class="mode">${esc(modeLabel)}</span>${warded ? `<span class="ward">${ICON.ward}Warded</span>` : ''}`
    if (this.clock.dataset.h !== html) { this.clock.innerHTML = html; this.clock.dataset.h = html }
  }

  updateStats(stats: Stats, mode: Mode, max: number): void {
    this.statsEl.classList.toggle('creative', mode === 'creative')
    for (const key of ['health', 'hunger', 'stamina'] as const) {
      const value = Math.max(0, stats[key])
      const previous = this.lastStats[key]
      if (previous === value) continue
      this.lastStats[key] = value
      const stat = this.stats[key]
      stat.fill.style.transform = `scaleX(${Math.min(1, value / max)})`
      stat.val.textContent = String(Math.ceil(value))
      if (previous !== undefined && previous - value > 4) this.statPulse(key, 'drain')
      const automaticLow = (key === 'health' && value < 25) || (key === 'hunger' && value < 15)
      stat.row.classList.toggle('low', automaticLow)
    }
    this.vignette.classList.toggle('low', mode !== 'creative' && stats.health < 25)
  }

  renderHotbar(inv: Inventory, selected: number): void {
    for (let i = 0; i < HOTBAR; i++) {
      const slot = this.hotSlots[i]
      const isSelected = i === selected
      if (i === selected && this.lastHotSelected !== selected) { slot.classList.remove('select-pop'); void slot.offsetWidth; slot.classList.add('select-pop'); this.fx.burst(slot.getBoundingClientRect().left + slot.clientWidth / 2, slot.getBoundingClientRect().top + slot.clientHeight / 2, { sprite: 4, count: 6, speed: 45, size: 14, life: 0.6, gravity: -20 }) }
      slot.classList.toggle('sel', isSelected)
      this.fillSlot(slot, inv.slots[i], `<span class="key">${i + 1}</span>`)
    }
    this.lastHotSelected = selected
    if (this.invData && !this.inv.classList.contains('hidden')) this.renderInvSlots()
  }

  private fillSlot(el: HTMLElement, slot: Inventory['slots'][number], extra = ''): void {
    const key = slot ? `${slot.id}:${slot.n}:${slot.dur ?? ''}` : '-'
    if (el.dataset.k === key && extra === (el.dataset.x ?? '')) return
    const previousCount = Number(el.dataset.count ?? '0')
    el.dataset.k = key; el.dataset.x = extra; el.dataset.count = String(slot?.n ?? 0)
    if (!slot) { el.innerHTML = extra; el.classList.add('empty'); return }
    el.classList.remove('empty')
    const tool = ITEMS[slot.id].tool
    const durability = tool && slot.dur !== undefined ? slot.dur / tool.durability : 1
    el.innerHTML = `${extra}${itemIcon(slot.id)}${slot.n > 1 ? `<span class="n">${slot.n}</span>` : ''}${tool && durability < 1 ? `<span class="dur" style="--dur:${Math.round(durability * 100)}%"></span>` : ''}`
    if (slot.n > previousCount && previousCount) { el.classList.remove('count-pop'); void el.offsetWidth; el.classList.add('count-pop') }
  }

  itemName(name: string): void { this.nameEl.textContent = name; this.nameEl.classList.add('show'); clearTimeout(this.nameTimer); this.nameTimer = window.setTimeout(() => this.nameEl.classList.remove('show'), 1400) }
  setTarget(label: string | null, hp: number | null, hint: string): void {
    const html = label ? `<span>${esc(label)}</span>${hp !== null ? `<div class="hp"><i style="transform:scaleX(${Math.max(0, hp)})"></i></div>` : ''}` : ''
    if (this.targetEl.dataset.h !== html) { this.targetEl.innerHTML = html; this.targetEl.dataset.h = html }
    if (performance.now() > this.flashHint) this.showHint(hint, false)
  }
  hint(text: string, flash = false): void { if (flash) this.flashHint = performance.now() + 1500; this.showHint(text, flash) }
  private showHint(text: string, warn: boolean): void { if (this.hintEl.textContent !== text) this.hintEl.textContent = text; this.hintEl.classList.toggle('warn', warn); this.hintEl.classList.toggle('show', !!text) }

  toast(id: ItemId | null, text: string): void {
    const matched = /^\+(\d+) /.exec(text)
    if (id && matched) {
      const existing = this.toasts.querySelector<HTMLElement>(`[data-item="${id}"]`)
      if (existing) {
        const total = Number(existing.dataset.n) + Number(matched[1]); existing.dataset.n = String(total); existing.querySelector('span')!.textContent = `+${total} ${ITEMS[id].name}`
        existing.classList.remove('bump'); void existing.offsetWidth; existing.classList.add('bump'); clearTimeout(Number(existing.dataset.timer)); existing.dataset.timer = String(window.setTimeout(() => this.dropToast(existing), 2600)); return
      }
    }
    const toast = h('div', 'toast', `${id ? itemIcon(id) : ''}<span>${esc(text)}</span>`)
    if (id && matched) { toast.dataset.item = id; toast.dataset.n = matched[1] }
    this.toasts.prepend(toast); while (this.toasts.children.length > 5) this.toasts.lastElementChild!.remove()
    const rect = toast.getBoundingClientRect(); this.fx.burst(rect.left + 22, rect.top + 18, { sprite: 7, count: 3, speed: 20, size: 12, gravity: -15, life: 0.5 })
    toast.dataset.timer = String(window.setTimeout(() => this.dropToast(toast), 2600))
  }
  private dropToast(toast: HTMLElement): void { toast.classList.add('out'); delete toast.dataset.item; setTimeout(() => toast.remove(), 400) }

  banner(title: string, sub: string): void { this.showWave(title, sub, false) }
  setTips(list: TipView[]): void {
    const key = list.map(tip => `${tip.id}${tip.done ? 1 : 0}${tip.text.length}`).join()
    if (key === this.tipsKey) return
    const wasSome = this.tipsKey !== '' && this.tipsKey.includes('0'); this.tipsKey = key
    if (!list.length || this.tipsHidden) { this.tipsEl.classList.add('hidden'); return }
    const allDone = list.every(tip => tip.done); const current = list.find(tip => !tip.done)
    this.tipsEl.classList.remove('hidden')
    this.tipsEl.innerHTML = `<div class="tips-head"><b>Getting started</b><span>${list.filter(tip => tip.done).length}/${list.length}</span><button class="btn icon ghost tiny" aria-label="Hide tips">${ICON.close}</button></div><ol>${list.map(tip => `<li class="${tip.done ? 'done' : tip === current ? 'now' : ''}"><i>${tip.done ? ICON.check : ''}</i><span>${esc(tip.text)}</span></li>`).join('')}</ol>`
    this.tipsEl.querySelector('button')!.addEventListener('click', () => { this.tipsHidden = true; this.tipsEl.classList.add('hidden'); this.on.dismissTips() })
    if (allDone && wasSome) { this.banner("You're settled in", 'The wild is yours to shape. Explore the markers on your compass.'); setTimeout(() => { this.tipsEl.classList.add('hidden'); this.on.dismissTips() }, 4000) }
  }
  flashDamage(): void { this.vignette.classList.remove('hit'); void this.vignette.offsetWidth; this.vignette.classList.add('hit') }
  setUnderwater(on: boolean): void { if (this.water.classList.contains('on') !== on) this.water.classList.toggle('on', on) }

  // ─── New progression and combat feedback API ───────────────────────────
  setBuffs(buffs: BuffView[]): void {
    const key = JSON.stringify(buffs)
    if (this.buffsEl.dataset.k === key) return
    this.buffsEl.dataset.k = key
    this.buffsEl.innerHTML = buffs.map(buff => `<div class="buff ${buff.id}" style="--progress:${Math.round((buff.progress ?? 0) * 100)}%">${icon('buff_rested')}<span><b>${esc(buff.label)}</b>${buff.remaining !== null ? `<small>${mmss(buff.remaining)}</small>` : ''}</span>${buff.id === 'warming' ? '<i></i>' : ''}</div>`).join('')
  }
  showWave(title: string, sub: string, boss: boolean): void {
    ;(this.bannerEl.querySelector('h2') as HTMLElement).textContent = title
    ;(this.bannerEl.querySelector('p') as HTMLElement).textContent = sub
    this.bannerEl.classList.toggle('boss', boss); this.bannerEl.classList.remove('show'); void this.bannerEl.offsetWidth; this.bannerEl.classList.add('show')
    this.vignette.classList.remove('wave-flash'); void this.vignette.offsetWidth; this.vignette.classList.add('wave-flash')
    const x = innerWidth / 2; const y = innerHeight * 0.23
    this.fx.burst(x, y + 40, { sprite: 4, count: boss ? 34 : 22, speed: boss ? 155 : 115, life: 1.25, size: boss ? 24 : 18, gravity: 45, color: boss ? '#e4583d' : '#f2b34d' })
    if (boss) document.documentElement.classList.add('boss-shake')
    clearTimeout(this.bannerTimer); this.bannerTimer = window.setTimeout(() => { this.bannerEl.classList.remove('show'); document.documentElement.classList.remove('boss-shake') }, 4500)
  }
  setWave(view: WaveView | null): void {
    if (!view) { this.waveEl.classList.add('hidden'); return }
    const defeated = Math.max(0, view.total - view.remaining); const frac = view.total ? defeated / view.total : 0
    const html = `<div class="wave-title">${icon('hud_skull')}<b>Night ${view.night}${view.boss ? ' · Boss' : ''}</b><span>${view.remaining} remaining</span></div><div class="wave-progress"><i style="transform:scaleX(${frac})"></i></div>`
    if (this.waveEl.dataset.h !== html) { this.waveEl.innerHTML = html; this.waveEl.dataset.h = html; this.waveEl.classList.toggle('boss', view.boss) }
    this.waveEl.classList.remove('hidden')
  }
  setSkills(skills: Skills): void { this.skills = skills; if (this.tab === 'skills' && !this.inv.classList.contains('hidden')) this.renderSkills() }
  skillXp(id: SkillId, level: number, frac: number): void {
    let popup = this.skillPopups.querySelector<HTMLElement>(`[data-skill="${id}"]`)
    if (!popup) { popup = h('div', 'skill-xp'); popup.dataset.skill = id; this.skillPopups.append(popup) }
    popup.innerHTML = `${icon(`skill_${id}`)}<div><b>${SKILL_NAMES[id]} <small>${level}</small></b><i><em style="transform:scaleX(${Math.max(0, Math.min(1, frac))})"></em></i></div>`
    popup.classList.remove('out'); popup.classList.remove('in'); void popup.offsetWidth; popup.classList.add('in')
    clearTimeout(Number(popup.dataset.timer)); popup.dataset.timer = String(window.setTimeout(() => { popup!.classList.add('out'); setTimeout(() => popup?.remove(), 400) }, 2500))
  }
  levelUp(id: SkillId, level: number): void {
    this.levelPlate.innerHTML = `<div>${icon(`skill_${id}`)}<span><small>Level up</small><b>${SKILL_NAMES[id]} ${level}</b></span></div>`
    this.levelPlate.classList.remove('show'); void this.levelPlate.offsetWidth; this.levelPlate.classList.add('show')
    const x = innerWidth / 2; const y = innerHeight * 0.42; this.fx.ring(x, y, 140); this.fx.burst(x, y, { sprite: 7, count: 28, speed: 125, life: 1.35, size: 20, gravity: -12, color: '#f5c85e' })
  }
  damageNumber(x: number, y: number, value: number, kind: 'hit' | 'crit' | 'kill' | 'hurt' | 'heal'): void {
    const prefix = kind === 'heal' ? '+' : ''; const skull = kind === 'kill' ? '☠ ' : ''
    const el = h('div', `damage-number ${kind}`, `${skull}${prefix}${Math.abs(Math.round(value))}`)
    el.style.left = `${x}px`; el.style.top = `${y}px`; el.style.setProperty('--drift', `${(Math.random() - 0.5) * 54}px`); this.floaters.append(el)
    setTimeout(() => el.remove(), 1050)
  }
  hitMarker(kill: boolean): void { this.hitEl.classList.toggle('kill', kill); this.hitEl.classList.remove('show'); void this.hitEl.offsetWidth; this.hitEl.classList.add('show') }
  pickupFly(id: ItemId, x: number, y: number, n: number): void {
    const target = this.hotSlots.find(slot => slot.dataset.k?.startsWith(`${id}:`))
    const targetRect = (target ?? this.hotbar).getBoundingClientRect()
    const endX = target ? targetRect.left + targetRect.width / 2 : targetRect.right - 16; const endY = targetRect.top + targetRect.height / 2
    const fly = h('div', 'pickup-fly', `${itemIcon(id)}`); fly.style.left = `${x}px`; fly.style.top = `${y}px`; this.root.append(fly)
    const arcX = x + (endX - x) * 0.55 + (Math.random() - 0.5) * 70; const arcY = Math.min(y, endY) - 110
    const animation = fly.animate([{ transform: 'translate(-50%,-50%) scale(.68)', opacity: 0 }, { transform: `translate(${arcX - x}px,${arcY - y}px) scale(1.08)`, opacity: 1, offset: 0.38 }, { transform: `translate(${endX - x}px,${endY - y}px) scale(.4)`, opacity: 0.98 }], { duration: 620, easing: 'cubic-bezier(.22,.82,.28,1)', fill: 'forwards' })
    const trail = window.setInterval(() => this.fx.trail(x + (endX - x) * Math.random(), y + (endY - y) * Math.random(), 7), 95)
    animation.onfinish = () => { clearInterval(trail); fly.remove(); const slot = target ?? this.hotbar; slot.classList.remove('pickup-bump'); void slot.offsetWidth; slot.classList.add('pickup-bump'); const gain = h('span', 'slot-gain', `+${n}`); slot.append(gain); setTimeout(() => gain.remove(), 850); this.fx.burst(endX, endY, { sprite: 7, count: 10, speed: 55, life: 0.7, size: 16, gravity: -20, color: '#f6c45b' }) }
  }
  setCharge(p: number | null): void { if (p === null) { this.crosshair.classList.remove('charging'); return }; this.crosshair.style.setProperty('--charge', `${Math.round(Math.max(0, Math.min(1, p)) * 100)}%`); this.crosshair.classList.toggle('full', p >= 1); this.crosshair.classList.add('charging') }
  hurtFrom(angle: number): void { this.vignette.style.setProperty('--hurt-angle', `${angle * 180 / Math.PI}deg`); this.vignette.classList.remove('hurt-dir'); void this.vignette.offsetWidth; this.vignette.classList.add('hurt-dir') }
  statPulse(stat: 'health' | 'hunger' | 'stamina', kind: 'drain' | 'fill' | 'low'): void {
    const row = this.stats[stat].row
    if (kind !== 'low') row.classList.remove('manual-low')
    if (kind === 'low') { row.classList.add('manual-low'); return }
    row.classList.remove(`pulse-${kind}`); void row.offsetWidth; row.classList.add(`pulse-${kind}`)
  }
  setStageStatus(text: string | null): void { if (text === null) { this.stageEl.classList.add('hidden'); return }; const span = this.stageEl.querySelector('span')!; if (span.textContent !== text) span.textContent = text; this.stageEl.classList.remove('hidden') }
  craftFx(): void {
    const craft = this.recipeDetail.querySelector<HTMLElement>('[data-n="1"]')
    if (craft) { const rect = craft.getBoundingClientRect(); this.fx.burst(rect.left + rect.width / 2, rect.top + rect.height / 2, { sprite: 4, count: 19, speed: 110, life: 0.9, size: 18, gravity: 35, color: '#efad45' }) }
    if (!this.selRecipe) return
    const destination = this.invSlots[HOTBAR]?.getBoundingClientRect()
    if (!craft || !destination) return
    const start = craft.getBoundingClientRect(); const fly = h('div', 'craft-fly', itemIcon(this.selRecipe.out)); fly.style.left = `${start.left + start.width / 2}px`; fly.style.top = `${start.top + start.height / 2}px`; this.root.append(fly)
    const animation = fly.animate([{ transform: 'translate(-50%,-50%) scale(.75)', opacity: 0 }, { transform: `translate(${destination.left + destination.width / 2 - start.left - start.width / 2}px,${destination.top + destination.height / 2 - start.top - start.height / 2}px) scale(.65)`, opacity: 1 }], { duration: 520, easing: 'cubic-bezier(.2,.8,.25,1)', fill: 'forwards' })
    animation.onfinish = () => { fly.remove(); this.fx.burst(destination.left + destination.width / 2, destination.top + destination.height / 2, { sprite: 7, count: 8, speed: 50, size: 15, life: .6, gravity: -15 }) }
  }
  setBossBar(name: string | null, frac: number): void { if (name === null) { this.bossEl.classList.add('hidden'); return }; const label = this.bossEl.querySelector('b')!; if (label.textContent !== name) label.textContent = name; const fill = this.bossEl.querySelector('i')!; fill.style.transform = `scaleX(${Math.max(0, Math.min(1, frac))})`; this.bossEl.classList.remove('hidden') }

  // ─── Inventory and crafting ────────────────────────────────────────────
  private buildInventory(): void {
    const panel = h('div', 'panel inv')
    const left = h('div', 'inv-left', `<h3>${icon('hud_chest')} Pack</h3>`)
    const grid = h('div', 'inv-grid')
    const hotbar = h('div', 'inv-grid hotrow')
    for (let i = 0; i < INV_SIZE; i++) {
      const slot = h('button', 'slot'); slot.dataset.i = String(i)
      slot.addEventListener('mousedown', e => this.slotClick(i, e)); slot.addEventListener('contextmenu', e => e.preventDefault()); slot.addEventListener('pointerenter', () => this.showTooltip(i)); slot.addEventListener('pointerleave', () => this.tooltip.classList.add('hidden'))
      slot.addEventListener('touchend', e => { e.preventDefault(); this.slotClick(i, null) }); (i < HOTBAR ? hotbar : grid).append(slot); this.invSlots.push(slot)
    }
    left.append(grid, h('div', 'inv-label', 'Hotbar'), hotbar, h('p', 'desc small', 'Click to move · Right-click to split · Shift-click to quick-move'))
    const middle = h('div', 'inv-right', `<h3>${icon('hud_craft')} Crafting</h3>`)
    const tabs = h('div', 'tabs')
    const cats: (ItemCat | 'all' | 'skills')[] = ['all', 'tool', 'build', 'material', 'food', 'skills']
    for (const cat of cats) {
      const label = cat === 'all' ? 'All' : cat === 'skills' ? 'Skills' : CATEGORY_NAMES[cat]
      const tab = h('button', `tab ${cat === this.tab ? 'on' : ''}`, cat === 'skills' ? `${icon('skill_mining')} ${label}` : label)
      tab.dataset.tab = cat
      tab.addEventListener('click', () => { this.tab = cat; tabs.querySelectorAll('.tab').forEach(button => button.classList.toggle('on', button === tab)); this.renderRecipes(); this.renderSkills() })
      tabs.append(tab)
    }
    middle.append(this.stationLine, tabs, this.recipeList, this.skillsList)
    const detail = h('div', 'inv-detail'); detail.append(this.recipeDetail)
    const close = h('button', 'btn icon ghost inv-close', ICON.close); close.setAttribute('aria-label', 'Close'); close.addEventListener('click', () => this.on.closeInventory())
    const chest = h('div', 'inv-chest', `<h3>${icon('storage_chest')} Storage Chest <small class="chest-count"></small></h3>`)
    const chestGrid = h('div', 'inv-grid chest-grid')
    for (let i = 0; i < 18; i++) {
      const slot = h('button', 'slot'); slot.dataset.c = String(i)
      slot.addEventListener('mousedown', e => this.chestClick(i, e)); slot.addEventListener('contextmenu', e => e.preventDefault())
      slot.addEventListener('pointerenter', () => this.tooltipFor(this.chestData?.[i] ?? null)); slot.addEventListener('pointerleave', () => this.tooltip.classList.add('hidden'))
      slot.addEventListener('touchend', e => { e.preventDefault(); this.chestClick(i, null) })
      chestGrid.append(slot); this.chestSlots.push(slot)
    }
    const actions = h('div', 'chest-actions', '<button class="btn" data-c="take">Take all</button><button class="btn" data-c="match">Store matching</button><button class="btn" data-c="store">Store all</button>')
    actions.addEventListener('click', e => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-c]'); const inv = this.invData; const box = this.chestData
      if (!b || !inv || !box) return
      const moved = b.dataset.c === 'take' ? moveAll(box, inv.slots) : moveAll(inv.slots, box, b.dataset.c === 'match', HOTBAR, INV_SIZE)
      if (moved > 0) {
        const r = b.getBoundingClientRect(); this.fx.burst(r.left + r.width / 2, r.top + r.height / 2, { sprite: 7, count: 14, speed: 80, size: 15, life: 0.7, gravity: -10, color: '#f2c46b' })
        const from = b.dataset.c === 'take' ? chestGrid : left; const to = b.dataset.c === 'take' ? left : chestGrid
        this.flyStacks(from, to)
      } else this.sound('hover')
      this.renderInvSlots(); this.on.invChanged(); this.renderRecipes()
    })
    chest.append(chestGrid, actions, h('p', 'desc small', 'Shift-click moves stacks between chest and pack · Breaking the chest spills its contents into your pack'))
    this.chestPanel = chest; this.invPanel = panel
    panel.append(close, left, middle, detail, chest); this.inv.append(panel)
    this.inv.addEventListener('mousedown', e => { if (e.target === this.inv) e.preventDefault() })
  }
  private slotClick(index: number, event: MouseEvent | null): void {
    const inv = this.invData; if (!inv) return; if (event) event.preventDefault()
    if (event?.shiftKey && this.chestData) { if (moveStack(inv.slots, index, this.chestData)) this.flyOne(this.invSlots[index], this.chestSlots[this.firstWith(this.chestData, inv.slots[index]?.id)]) }
    else if (event?.shiftKey) inv.quickMove(index); else inv.click(index, event?.button === 2)
    this.renderInvSlots(); this.on.invChanged(); this.showTooltip(index); this.renderRecipes()
  }
  private chestClick(index: number, event: MouseEvent | null): void {
    const inv = this.invData; const box = this.chestData; if (!inv || !box) return; if (event) event.preventDefault()
    if (event?.shiftKey) {
      const id = box[index]?.id
      // Prefer the backpack, then the hotbar.
      const moved = moveStack(box, index, inv.slots, HOTBAR, INV_SIZE) + moveStack(box, index, inv.slots, 0, HOTBAR)
      if (moved && id) this.flyOne(this.chestSlots[index], this.invSlots[inv.slots.findIndex(t => t?.id === id)] ?? this.invSlots[HOTBAR])
    } else inv.clickIn(box, index, event?.button === 2)
    this.renderInvSlots(); this.on.invChanged(); this.tooltipFor(box[index]); this.renderRecipes()
  }
  private firstWith(slots: Slot[], id: ItemId | undefined): number {
    const i = id ? slots.findIndex(t => t?.id === id) : -1
    return i >= 0 ? i : 0
  }
  /** Icon flies from one slot to another with a sparkle on landing. */
  private flyOne(from: HTMLElement | undefined, to: HTMLElement | undefined): void {
    if (!from || !to) return
    const a = from.getBoundingClientRect(); const b = to.getBoundingClientRect()
    const img = to.querySelector('img') ?? from.querySelector('img'); if (!img) return
    const fly = h('div', 'craft-fly'); fly.append(img.cloneNode()); fly.style.left = `${a.left + a.width / 2}px`; fly.style.top = `${a.top + a.height / 2}px`; this.root.append(fly)
    const anim = fly.animate([{ transform: 'translate(-50%,-50%) scale(.9)', opacity: 1 }, { transform: `translate(calc(-50% + ${b.left - a.left}px), calc(-50% + ${b.top - a.top - 30}px)) scale(1.05)`, opacity: 1, offset: 0.55 }, { transform: `translate(calc(-50% + ${b.left - a.left}px), calc(-50% + ${b.top - a.top}px)) scale(.7)`, opacity: 0.9 }], { duration: 380, easing: 'cubic-bezier(.25,.8,.3,1)', fill: 'forwards' })
    anim.onfinish = () => { fly.remove(); this.fx.burst(b.left + b.width / 2, b.top + b.height / 2, { sprite: 7, count: 7, speed: 45, size: 13, life: 0.5, gravity: -12 }); to.classList.remove('pickup-bump'); void to.offsetWidth; to.classList.add('pickup-bump') }
  }
  private flyStacks(from: HTMLElement, to: HTMLElement): void {
    const src = [...from.querySelectorAll<HTMLElement>('.slot:not(.empty)')].slice(0, 6)
    const dst = [...to.querySelectorAll<HTMLElement>('.slot')]
    src.forEach((el, i) => setTimeout(() => this.flyOne(el, dst[Math.min(dst.length - 1, i)]), i * 45))
  }
  private showTooltip(index: number): void { this.tooltipFor(this.invData?.slots[index] ?? null) }
  private tooltipFor(slot: Slot | null): void {
    if (!slot || this.invData?.cursor) { this.tooltip.classList.add('hidden'); return }
    const item = ITEMS[slot.id]; const tool = item.tool
    const extra = tool ? `<small>Durability ${slot.dur ?? tool.durability}/${tool.durability} · Damage ${tool.damage}</small>` : item.food ? `<small>${item.food.hunger ? `+${item.food.hunger} hunger` : ''}${item.food.hunger && item.food.health ? ' · ' : ''}${item.food.health ? `${item.food.health > 0 ? '+' : ''}${item.food.health} health` : ''}</small>` : ''
    this.tooltip.innerHTML = `<b>${esc(item.name)}</b><p>${esc(item.desc)}</p>${extra}`; this.tooltip.classList.remove('hidden')
  }
  /** Pack on the left, chest contents where crafting normally sits. */
  openChest(inv: Inventory, slots: Slot[]): void {
    this.invData = inv; this.chestData = slots; this.invPanel.classList.add('chest-mode')
    this.inv.classList.remove('hidden'); this.hud.classList.add('dimmed'); this.renderInvSlots()
    const r = this.chestPanel.getBoundingClientRect(); this.fx.burst(r.left + r.width / 2, r.top + 40, { sprite: 4, count: 18, speed: 95, size: 16, life: 0.8, gravity: 30, color: '#f2c46b' })
  }
  get chestOpen(): boolean { return !!this.chestData && !this.inv.classList.contains('hidden') }
  openInventory(inv: Inventory, stations: Set<Station>, station?: Station): void {
    this.chestData = null; this.invPanel.classList.remove('chest-mode')
    this.invData = inv; this.stations = stations; if (station === 'campfire') this.tab = 'food'
    this.inv.querySelectorAll<HTMLElement>('.tab').forEach(button => button.classList.toggle('on', button.dataset.tab === this.tab))
    this.inv.classList.remove('hidden'); this.hud.classList.add('dimmed'); this.renderInvSlots(); this.renderRecipes(); this.renderSkills()
  }
  refreshInventory(stations: Set<Station>): void { this.stations = stations; if (this.inv.classList.contains('hidden')) return; this.renderInvSlots(); this.renderRecipes(); this.renderSkills() }
  closeInventory(): void { this.chestData = null; this.inv.classList.add('hidden'); this.hud.classList.remove('dimmed'); this.cursorEl.classList.add('hidden'); this.tooltip.classList.add('hidden') }
  private renderInvSlots(): void {
    const inv = this.invData; if (!inv) return
    for (let i = 0; i < INV_SIZE; i++) this.fillSlot(this.invSlots[i], inv.slots[i])
    const box = this.chestData
    if (box) {
      for (let i = 0; i < this.chestSlots.length; i++) { this.fillSlot(this.chestSlots[i], box[i] ?? null); this.chestSlots[i].classList.toggle('locked', i >= box.length) }
      const used = box.filter(Boolean).length; const c = this.chestPanel.querySelector('.chest-count')!; const text = `${used}/${box.length}`; if (c.textContent !== text) c.textContent = text
    }
    const cursor = inv.cursor
    if (cursor) { this.cursorEl.innerHTML = `${itemIcon(cursor.id)}${cursor.n > 1 ? `<span class="n">${cursor.n}</span>` : ''}`; this.cursorEl.classList.remove('hidden'); this.tooltip.classList.add('hidden') }
    else this.cursorEl.classList.add('hidden')
  }
  private renderSkills(): void {
    const showing = this.tab === 'skills'
    this.skillsList.classList.toggle('hidden', !showing); this.recipeList.classList.toggle('hidden', showing); this.recipeDetail.parentElement!.classList.toggle('hidden', showing); this.stationLine.classList.toggle('hidden', showing)
    if (!showing) return
    const skills = this.skills
    if (!skills) { this.skillsList.innerHTML = '<p class="desc">Skills awaken as you work the land.</p>'; return }
    this.skillsList.innerHTML = SKILLS.map(id => {
      const skill = skills[id]; const next = xpToNext(skill.level); const frac = skill.level >= MAX_SKILL ? 1 : Math.max(0, Math.min(1, skill.xp / next))
      return `<div class="skill-row">${icon(`skill_${id}`)}<div class="skill-main"><div><b>${SKILL_NAMES[id]}</b><span>Level ${skill.level}${skill.level >= MAX_SKILL ? ' · MAX' : ''}</span></div><i><em style="transform:scaleX(${frac})"></em></i><small>${skill.level >= MAX_SKILL ? 'Mastered' : `${Math.floor(skill.xp)}/${next} XP`} · ${esc(SKILL_DESC[id])}</small></div></div>`
    }).join('')
  }
  private renderRecipes(): void {
    const inv = this.invData; if (!inv || this.tab === 'skills') return
    const list = RECIPES.filter(recipe => this.tab === 'all' || ITEMS[recipe.out].cat === this.tab)
    const stations = this.stations
    this.stationLine.innerHTML = `<small>Nearby stations</small><span class="${stations.has('workbench') ? 'ok' : ''}">${stations.has('workbench') ? ICON.check : '·'} Workbench</span><span class="${stations.has('campfire') ? 'ok' : ''}">${stations.has('campfire') ? ICON.check : '·'} Campfire</span>`
    this.recipeList.innerHTML = ''
    if (!this.selRecipe || !list.includes(this.selRecipe)) this.selRecipe = list.find(recipe => inv.canCraft(recipe) && (!recipe.station || stations.has(recipe.station))) ?? list[0] ?? null
    for (const recipe of list) {
      const stationOk = !recipe.station || stations.has(recipe.station); const ok = inv.canCraft(recipe) && stationOk
      const card = h('button', `recipe ${ok ? 'ok' : ''} ${stationOk ? '' : 'locked'} ${recipe === this.selRecipe ? 'sel' : ''}`)
      card.innerHTML = `<span class="r-icon">${itemIcon(recipe.out)}</span><span class="r-name">${esc(ITEMS[recipe.out].name)}${recipe.n > 1 ? ` <em>×${recipe.n}</em>` : ''}</span>${recipe.station && !stationOk ? `<span class="r-station">${STATION_NAMES[recipe.station]}</span>` : ''}`
      card.addEventListener('click', () => { this.selRecipe = recipe; this.renderRecipes() }); card.addEventListener('dblclick', () => this.craftWithFx(recipe, 1)); this.recipeList.append(card)
    }
    const recipe = this.selRecipe
    if (!recipe) { this.recipeDetail.innerHTML = ''; return }
    const item = ITEMS[recipe.out]; const stationOk = !recipe.station || stations.has(recipe.station); const ok = inv.canCraft(recipe) && stationOk
    const cost = recipe.cost.map(([id, count]) => { const have = inv.infinite ? count : inv.count(id); return `<span class="cost ${have >= count ? 'have' : 'need'}">${itemIcon(id)}<b>${Math.min(have, 999)}/${count}</b> ${esc(ITEMS[id].name)}</span>` })
    this.recipeDetail.innerHTML = `<div class="rd-head"><span class="r-icon big">${itemIcon(recipe.out)}</span><div><b>${esc(item.name)}${recipe.n > 1 ? ` ×${recipe.n}` : ''}</b><p>${esc(item.desc)}</p></div></div><div class="costs">${cost.join('')}</div>${recipe.station ? `<p class="req ${stationOk ? 'ok' : ''}">${stationOk ? 'At' : 'Requires'} a ${STATION_NAMES[recipe.station]}${stationOk ? '' : ' within a few steps'}</p>` : ''}<div class="rd-actions"><button class="btn primary craft-btn" data-n="1" ${ok ? '' : 'disabled'}><span>Craft</span><i></i></button><button class="btn" data-n="5" ${ok ? '' : 'disabled'}>Craft ×5</button></div>`
    this.recipeDetail.querySelectorAll<HTMLButtonElement>('[data-n]').forEach(button => button.addEventListener('click', () => this.craftWithFx(recipe, Number(button.dataset.n), button)))
  }
  private craftWithFx(recipe: Recipe, count: number, button?: HTMLButtonElement): void {
    if (button?.disabled) return
    if (!button) { this.on.craft(recipe, count); return }
    button.disabled = true; button.classList.add('crafting')
    setTimeout(() => { this.on.craft(recipe, count); this.craftFx(); button.classList.remove('crafting'); button.disabled = false }, 350)
  }
}
