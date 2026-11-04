/**
 * The HTML interface: loading, title, HUD, perk draft, pause, results, Armory and settings.
 * Everything here is real: every button does what it says, every number is the live game value,
 * and nothing is for sale.
 *
 * Juice: buttons squash and throw sparks, counters roll, coins fly into the HUD, the squad badge
 * pulses on gains/losses, the combo meter heats up, perk cards flip in, the boss bar chips with a
 * delayed trail, and the screen edge flashes on hits and gates.
 */
import type { SaveData } from '../engine/save'
import type { RunStats } from '../game/game'
import {
  formatClock, formatDistance, MOD_LABEL, PERK_BY_ID, type PerkDef, type PerkId, ROMAN, seedLabel, UPGRADES, upgradeCost,
  type UpgradeId, WEAPONS,
} from '../game/rules'

export type Screen = 'loading' | 'title' | 'hud' | 'perk' | 'pause' | 'results' | 'armory' | 'settings'
export interface UiHandlers {
  play: (daily: boolean) => void
  resume: () => void
  pause: () => void
  restart: () => void
  quit: () => void
  buy: (id: UpgradeId) => boolean
  settings: (patch: Partial<SaveData>) => void
  resetProgress: () => void
  perk: (id: PerkId) => void
  grenade: () => void
  medkit: () => void
  toggleMute: () => void
  sfx: (key: string, vol?: number, rate?: number) => void
}
export type HudState = ReturnType<import('../game/game').Game['hud']>

const ICON = (n: string) => `assets/ui/${n}.webp`
const CAUSE_LABEL: Record<string, string> = {
  saw: 'Saw blades', spikes: 'Spike plates', flame: 'Flame bars', laser: 'Laser fences', crusher: 'Crushers', mines: 'Mines',
  toxic: 'Toxic pools', airstrike: 'Airstrikes', barrel: 'Barrels', turret: 'Turrets', bomb: 'Bombs', explosion: 'Explosions',
  contact: 'Zombie bites', bite: 'Zombie bites', brute: 'Brute smashes', acid: 'Acid', spit: 'Retchers', gate: 'Bad gates',
  boss: 'Boss hits', charge: 'Boss charges', slam: 'Boss slams', shockwave: 'Shockwaves', sweep: 'Boss sweeps', boulder: 'Boulders',
}
const TIPS = [
  'Blue gates help, red gates hurt. Gold gates with a number grow when you shoot them.',
  'Traps always warn you first: flashing lights, red shadows, glowing nozzles.',
  'Shoot supply crates for weapon upgrades, grenades and medkits.',
  'Elite zombies glow. They hit harder and have special powers.',
  'Every boss is different: random body, modifiers and attack set.',
  'Coins earned in runs buy permanent upgrades in the Armory. Nothing is for sale.',
  'Medkits revive fallen soldiers. Save them for after a big loss.',
  'Bosses draw every attack on the ground before it lands. Step out of the red.',
]

export class Ui {
  readonly root: HTMLElement
  readonly textLayer: HTMLElement
  private screen: Screen = 'loading'
  private prevScreen: Screen = 'title'
  private els: Record<string, HTMLElement> = {}
  private last: Record<string, string | number> = {}
  private roll = { score: 0, coins: 0, count: 0 }
  private hintTimer = 0
  private bannerTimer = 0
  private perkChoices: PerkDef[] = []
  private perkLocked = false
  private coinFlying = 0

  constructor(host: HTMLElement, private readonly save: { data: SaveData }, private readonly h: UiHandlers) {
    this.root = host
    host.innerHTML = this.template()
    this.textLayer = host.querySelector('#ftext')!
    host.querySelectorAll<HTMLElement>('[data-el]').forEach(el => { this.els[el.dataset.el!] = el })
    host.addEventListener('click', e => this.onClick(e))
    host.addEventListener('pointerdown', e => {
      const b = (e.target as HTMLElement).closest('button')
      if (b && !b.disabled) { this.sparks(e.clientX, e.clientY, b.classList.contains('btn-primary') ? 14 : 8); b.classList.remove('press'); void b.offsetWidth; b.classList.add('press') }
    })
    host.addEventListener('input', e => this.onInput(e))
    window.addEventListener('keydown', e => {
      if (this.screen === 'perk' && /^Digit[1-3]$/.test(e.code)) { const i = Number(e.code.slice(5)) - 1; if (this.perkChoices[i]) this.pickPerk(i) }
    })
    this.els.tip.textContent = TIPS[Math.floor(Math.random() * TIPS.length)]
    this.refreshTitle()
    this.refreshSettings()
    this.refreshArmory()
  }

  // ───────────────────────── template ─────────────────────────
  private template(): string {
    const perkBadges = ''
    return `
<div class="vignette" data-el="vignette"></div>
<div class="edgeflash" data-el="edge"></div>
<div id="ftext"></div>
<div class="fly-layer" data-el="fly"></div>
<div class="spark-layer" data-el="sparks"></div>

<section class="screen loading" data-screen="loading">
  <div class="load-bg"></div>
  <div class="load-inner">
    <img class="logo" src="${ICON('logo')}" alt="Lane Runner: Endless" />
    <div class="loadbar"><div class="loadfill" data-el="loadfill"></div><div class="loadspark" data-el="loadspark"></div></div>
    <div class="loadlabel" data-el="loadlabel">DEPLOYING SQUAD…</div>
    <p class="tip" data-el="tip"></p>
  </div>
</section>

<section class="screen title" data-screen="title" hidden>
  <div class="load-bg title-bg"></div>
  <div class="title-inner">
    <img class="logo" src="${ICON('logo')}" alt="Lane Runner: Endless" />
    <div class="title-tag"><span class="stripe"></span>RUN · GUN · GROW · SURVIVE<span class="stripe"></span></div>
    <button class="btn btn-primary btn-play" data-action="play"><span>»</span> PLAY <span>»</span></button>
    <div class="title-row">
      <button class="btn btn-alt" data-action="daily">DAILY RUN<small data-el="dailyLabel"></small></button>
      <button class="btn btn-alt" data-action="armory">ARMORY</button>
      <button class="btn btn-alt" data-action="settings">SETTINGS</button>
    </div>
    <div class="records panel">
      <div><small>BEST SCORE</small><b data-el="bestScore">0</b></div>
      <div><small>BEST DISTANCE</small><b data-el="bestDist">0 m</b></div>
      <div><small>COINS</small><b class="coin-t"><img src="${ICON('coin')}" alt="" />${'<span data-el="titleCoins">0</span>'}</b></div>
    </div>
    <p class="honest">Endless and free. No ads, no paywalls, no timers. Everything is earned in play.</p>
  </div>
  <div class="controls-hint" data-el="controlsHint">DRAG or A/D ← → to steer · Q grenade · E medkit · P pause</div>
</section>

<section class="screen hud" data-screen="hud" hidden>
  <div class="squad-tag" data-el="squadTag"><img src="${ICON('soldier')}" alt="" /><b data-el="tagN">0</b></div>
  <div class="hud-top">
    <div class="panel squad-badge" data-el="squadBadge">
      <img src="${ICON('soldier')}" alt="" />
      <div><small>SQUAD</small><b data-el="count">0</b></div>
      <span class="pulse" data-el="squadPulse"></span>
    </div>
    <div class="panel weapon-badge" data-el="weaponBadge">
      <div class="tier" data-el="tier">I</div>
      <div><small>WEAPON</small><b data-el="weapon">Carbine</b></div>
    </div>
    <div class="combo" data-el="combo">
      <div class="combo-t">COMBO <b data-el="comboN">0</b> <span data-el="comboMult">×1.00</span></div>
      <div class="combo-bar"><div data-el="comboFill"></div></div>
    </div>
    <div class="hud-right">
      <div class="panel dist">
        <div><small>DISTANCE</small><b data-el="dist">0 m</b></div>
        <div><small>SECTOR</small><b data-el="sector">1</b></div>
      </div>
      <div class="panel coins" data-el="coinBox"><img src="${ICON('coin')}" alt="" /><b data-el="coins">0</b></div>
      <button class="btn-icon pause-btn" data-action="pause" aria-label="Pause">❚❚</button>
    </div>
  </div>
  <div class="progress" data-el="progressWrap">
    <div class="progress-label" data-el="themeName">DOWNTOWN DUSK</div>
    <div class="progress-bar"><div data-el="progress"></div><img class="skull-mark" src="${ICON('skull')}" alt="" /></div>
    <div class="threat" data-el="threat">THREAT 1.0</div>
  </div>
  <div class="bossbar" data-el="bossbar" hidden>
    <div class="boss-head"><img src="${ICON('skull')}" alt="" /><div><b data-el="bossTitle">BOSS</b><small data-el="bossName"></small></div></div>
    <div class="boss-track"><div class="boss-trail" data-el="bossTrail"></div><div class="boss-fill" data-el="bossFill"></div>
      <i style="left:33%"></i><i style="left:66%"></i><span class="boss-shield">SHIELDED</span></div>
    <div class="boss-mods" data-el="bossMods"></div>
  </div>
  <div class="abilities">
    <button class="ability" data-action="grenade" aria-label="Throw grenade"><img src="${ICON('grenade')}" alt="" /><b data-el="gren">1</b><kbd>Q</kbd></button>
    <button class="ability" data-action="medkit" aria-label="Use medkit"><img src="${ICON('heart')}" alt="" /><b data-el="med">1</b><kbd>E</kbd></button>
  </div>
  <div class="perk-row" data-el="perkRow">${perkBadges}</div>
  <div class="fallen" data-el="fallen"></div>
  <div class="hint" data-el="hint" hidden></div>
  <div class="banner" data-el="banner" hidden><div class="banner-t" data-el="bannerT"></div><div class="banner-s" data-el="bannerS"></div></div>
  <div class="toasts" data-el="toasts"></div>
</section>

<section class="screen perk" data-screen="perk" hidden>
  <div class="perk-title"><span class="stripe"></span>SECTOR CLEAR · CHOOSE A PERK<span class="stripe"></span></div>
  <div class="perk-cards" data-el="perkCards"></div>
  <div class="perk-foot">Press 1 · 2 · 3 or tap a card</div>
</section>

<section class="screen pause" data-screen="pause" hidden>
  <div class="panel modal">
    <h2>PAUSED</h2>
    <div class="pause-stats" data-el="pauseStats"></div>
    <button class="btn btn-primary" data-action="resume">RESUME</button>
    <button class="btn btn-alt" data-action="restart">RESTART RUN</button>
    <button class="btn btn-alt" data-action="settings">SETTINGS</button>
    <button class="btn btn-alt" data-action="quit">QUIT TO TITLE</button>
  </div>
</section>

<section class="screen results" data-screen="results" hidden>
  <div class="panel modal wide">
    <h2 class="res-title">SQUAD WIPED OUT</h2>
    <div class="ribbon" data-el="record" hidden>★ NEW RECORD ★</div>
    <div class="res-grid">
      <div><img src="${ICON('speed')}" alt="" /><small>DISTANCE</small><b data-el="rDist">0</b></div>
      <div><img src="${ICON('skull')}" alt="" /><small>ZOMBIE KILLS</small><b data-el="rKills">0</b></div>
      <div><img src="${ICON('shield')}" alt="" /><small>BOSSES</small><b data-el="rBosses">0</b></div>
      <div><img src="${ICON('soldier')}" alt="" /><small>PEAK SQUAD</small><b data-el="rPeak">0</b></div>
      <div><img src="${ICON('overclock')}" alt="" /><small>TIME</small><b data-el="rTime">0:00</b></div>
      <div><img src="${ICON('sharpshooter')}" alt="" /><small>SCORE</small><b data-el="rScore">0</b></div>
    </div>
    <div class="res-coins"><img src="${ICON('coin')}" alt="" /> +<b data-el="rCoins">0</b> coins <small data-el="rBest"></small></div>
    <div class="res-causes" data-el="rCauses"></div>
    <div class="res-btns">
      <button class="btn btn-primary" data-action="restart">» RUN AGAIN »</button>
      <button class="btn btn-alt" data-action="armory">ARMORY</button>
      <button class="btn btn-alt" data-action="quit">TITLE</button>
    </div>
  </div>
</section>

<section class="screen armory" data-screen="armory" hidden>
  <div class="panel modal wide">
    <h2>ARMORY</h2>
    <p class="sub">Permanent upgrades, bought only with coins earned in runs.</p>
    <div class="arm-coins"><img src="${ICON('coin')}" alt="" /><b data-el="armCoins">0</b></div>
    <div class="arm-grid" data-el="armGrid"></div>
    <button class="btn btn-alt" data-action="back">BACK</button>
  </div>
</section>

<section class="screen settings" data-screen="settings" hidden>
  <div class="panel modal">
    <h2>SETTINGS</h2>
    <label class="row">MUSIC <input type="range" min="0" max="1" step="0.05" data-set="musicVolume" /></label>
    <label class="row">EFFECTS <input type="range" min="0" max="1" step="0.05" data-set="sfxVolume" /></label>
    <div class="row">SOUND <button class="btn-toggle" data-action="mute" data-el="muteBtn">ON</button></div>
    <div class="row">QUALITY <div class="seg" data-el="quality">
      <button data-action="q-low">LOW</button><button data-action="q-medium">MED</button><button data-action="q-high">HIGH</button></div></div>
    <div class="row">SCREEN SHAKE <button class="btn-toggle" data-action="t-screenShake" data-el="t-screenShake">ON</button></div>
    <div class="row">DAMAGE NUMBERS <button class="btn-toggle" data-action="t-damageNumbers" data-el="t-damageNumbers">ON</button></div>
    <div class="row">REDUCED MOTION <button class="btn-toggle" data-action="t-reducedMotion" data-el="t-reducedMotion">OFF</button></div>
    <button class="btn btn-danger" data-action="reset" data-el="resetBtn">RESET PROGRESS</button>
    <button class="btn btn-alt" data-action="back">BACK</button>
  </div>
</section>`
  }

  // ───────────────────────── screens ─────────────────────────
  show(s: Screen) {
    if (s === 'armory' || s === 'settings') { if (this.screen !== 'armory' && this.screen !== 'settings') this.prevScreen = this.screen }
    this.screen = s
    this.root.querySelectorAll<HTMLElement>('[data-screen]').forEach(el => {
      const on = el.dataset.screen === s || (s === 'perk' && el.dataset.screen === 'hud') || (s === 'pause' && el.dataset.screen === 'hud')
      el.hidden = !on
      el.classList.toggle('active', el.dataset.screen === s)
    })
    this.root.dataset.screen = s
    if (s === 'title') this.refreshTitle()
    if (s === 'armory') this.refreshArmory()
    if (s === 'settings') this.refreshSettings()
  }
  get current() { return this.screen }
  /** Leave Settings/Armory for wherever they were opened from. */
  back() { this.show(this.prevScreen === 'results' || this.prevScreen === 'pause' ? this.prevScreen : 'title') }

  setLoading(p: number, label?: string) {
    this.els.loadfill.style.width = `${(p * 100).toFixed(1)}%`
    this.els.loadspark.style.left = `${(p * 100).toFixed(1)}%`
    if (label) this.els.loadlabel.textContent = label
  }

  private onClick(e: MouseEvent) {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-action]')
    if (!b) return
    const a = b.dataset.action!
    this.h.sfx('ui_click', 0.6)
    switch (a) {
      case 'play': this.h.play(false); break
      case 'daily': this.h.play(true); break
      case 'armory': this.show('armory'); break
      case 'settings': this.show('settings'); break
      case 'back': this.back(); break
      case 'pause': this.h.pause(); break
      case 'resume': this.h.resume(); break
      case 'restart': this.h.restart(); break
      case 'quit': this.h.quit(); break
      case 'grenade': this.h.grenade(); break
      case 'medkit': this.h.medkit(); break
      case 'mute': this.h.toggleMute(); break
      case 'reset':
        if (b.dataset.confirm === '1') { this.h.resetProgress(); b.dataset.confirm = ''; b.textContent = 'RESET PROGRESS' }
        else { b.dataset.confirm = '1'; b.textContent = 'TAP AGAIN TO CONFIRM'; setTimeout(() => { b.dataset.confirm = ''; b.textContent = 'RESET PROGRESS' }, 3000) }
        break
      default:
        if (a.startsWith('q-')) this.h.settings({ quality: a.slice(2) as SaveData['quality'] })
        else if (a.startsWith('t-')) { const k = a.slice(2) as 'screenShake' | 'damageNumbers' | 'reducedMotion'; this.h.settings({ [k]: !this.save.data[k] }) }
        else if (a.startsWith('buy-')) {
          const ok = this.h.buy(a.slice(4) as UpgradeId)
          if (ok) { const r = b.getBoundingClientRect(); this.sparks(r.left + r.width / 2, r.top + r.height / 2, 22, 'gold'); this.h.sfx('perk', 0.7, 1.2) }
          else { b.classList.remove('deny'); void b.offsetWidth; b.classList.add('deny') }
        } else if (a.startsWith('perk-')) this.pickPerk(Number(a.slice(5)))
    }
  }
  private onInput(e: Event) {
    const t = e.target as HTMLInputElement
    const k = t.dataset.set as 'musicVolume' | 'sfxVolume' | undefined
    if (k) this.h.settings({ [k]: Number(t.value) })
  }

  refreshTitle() {
    const d = this.save.data
    this.els.bestScore.textContent = d.bestScore.toLocaleString('en-US')
    this.els.bestDist.textContent = formatDistance(d.bestDistance)
    this.els.titleCoins.textContent = d.coins.toLocaleString('en-US')
    const today = new Date()
    this.els.dailyLabel.textContent = `${today.toISOString().slice(0, 10)}${d.dailyBest ? ` · best ${d.dailyBest.toLocaleString('en-US')}` : ''}`
    const touch = matchMedia('(pointer: coarse)').matches
    this.els.controlsHint.textContent = touch ? 'DRAG anywhere to steer · tap the grenade and medkit buttons' : 'DRAG or A/D ← → to steer · Q grenade · E medkit · P pause · M mute'
  }
  refreshSettings() {
    const d = this.save.data
    this.root.querySelectorAll<HTMLInputElement>('[data-set]').forEach(i => { i.value = String(d[i.dataset.set as 'musicVolume']) })
    this.els.muteBtn.textContent = d.muted ? 'OFF' : 'ON'
    this.els.muteBtn.classList.toggle('on', !d.muted)
    this.els.quality.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.action === `q-${d.quality}`))
    for (const k of ['screenShake', 'damageNumbers', 'reducedMotion'] as const) {
      this.els[`t-${k}`].textContent = d[k] ? 'ON' : 'OFF'
      this.els[`t-${k}`].classList.toggle('on', d[k])
    }
    this.root.classList.toggle('reduced-motion', d.reducedMotion)
  }
  refreshArmory() {
    const d = this.save.data
    this.els.armCoins.textContent = d.coins.toLocaleString('en-US')
    this.els.armGrid.innerHTML = UPGRADES.map(u => {
      const lv = d.upgrades[u.id]
      const cost = upgradeCost(u, lv)
      const pips = Array.from({ length: u.max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')
      const can = cost !== null && cost <= d.coins
      return `<div class="arm-card ${cost === null ? 'maxed' : ''}">
        <img src="${ICON(u.icon)}" alt="" />
        <div class="arm-info"><b>${u.name}</b><small>${u.desc}</small><div class="pips">${pips}</div></div>
        <button class="btn btn-buy ${can ? '' : 'poor'}" data-action="buy-${u.id}" ${cost === null ? 'disabled' : ''}>${cost === null ? 'MAX' : `<img src="${ICON('coin')}" alt="" />${cost}`}</button>
      </div>`
    }).join('')
  }

  // ───────────────────────── HUD ─────────────────────────
  private set(key: string, v: string | number, el = this.els[key]) {
    if (this.last[key] === v) return
    this.last[key] = v
    el.textContent = String(v)
  }
  updateHud(h: HudState, dt: number) {
    const k = Math.min(1, dt * 10)
    this.roll.count += (h.count - this.roll.count) * Math.min(1, dt * 14)
    this.roll.coins += (h.coins - this.roll.coins) * k
    this.roll.score += (h.score - this.roll.score) * k
    this.set('count', Math.round(Math.abs(this.roll.count - h.count) < 0.5 ? h.count : this.roll.count))
    this.set('coins', Math.round(Math.abs(this.roll.coins - h.coins) < 0.5 ? h.coins : this.roll.coins).toLocaleString('en-US'))
    this.set('weapon', h.weapon.toUpperCase())
    this.set('tier', ROMAN[h.tier - 1] ?? String(h.tier))
    this.set('dist', formatDistance(h.distance))
    this.set('sector', h.sector)
    this.set('themeName', `SECTOR ${h.sector} · ${h.theme.toUpperCase()}`)
    this.set('threat', `THREAT ${h.threat.toFixed(1)}`)
    this.set('gren', h.grenades)
    this.set('med', h.medkits)
    this.set('fallen', h.fallen > 0 && h.medkits > 0 ? `${h.fallen} FALLEN · MEDKIT REVIVES` : '')
    this.els.progress.style.width = `${(h.progress * 100).toFixed(1)}%`
    this.els.weaponBadge.style.setProperty('--wc', `#${h.weaponColor.toString(16).padStart(6, '0')}`)
    // combo heat
    const tierC = h.combo >= 50 ? 3 : h.combo >= 25 ? 2 : h.combo >= 10 ? 1 : 0
    this.set('comboN', h.combo)
    this.set('comboMult', `×${h.comboMult.toFixed(2)}`)
    this.els.comboFill.style.width = `${(h.comboT * 100).toFixed(0)}%`
    if (this.last.comboTier !== tierC) { this.last.comboTier = tierC; this.els.combo.dataset.heat = String(tierC) }
    this.els.combo.classList.toggle('show', h.combo >= 3)
    // abilities
    const ab = this.root.querySelectorAll<HTMLButtonElement>('.ability')
    ab[0].classList.toggle('empty', h.grenades <= 0)
    ab[1].classList.toggle('empty', h.medkits <= 0 || h.fallen <= 0)
    // perks
    const pk = Object.entries(h.perks).map(([id, n]) => `${id}:${n}`).join(',') + `|${h.shield}`
    if (this.last.perks !== pk) {
      this.last.perks = pk
      this.els.perkRow.innerHTML = Object.entries(h.perks).map(([id, n]) => {
        const p = PERK_BY_ID[id as PerkId]
        const off = id === 'shield' && !h.shield ? ' used' : ''
        return `<div class="perk-badge r-${p.rarity}${off}" title="${p.name}"><img src="${ICON(p.icon)}" alt="${p.name}" />${n && n > 1 ? `<b>${n}</b>` : ''}</div>`
      }).join('')
    }
    // boss bar
    const b = h.boss
    this.els.bossbar.hidden = !b
    this.els.progressWrap.hidden = !!b
    if (b) {
      this.set('bossTitle', b.title.toUpperCase())
      this.set('bossName', b.name)
      this.els.bossFill.style.width = `${(b.hp * 100).toFixed(2)}%`
      this.els.bossTrail.style.width = `${(b.trail * 100).toFixed(2)}%`
      this.els.bossbar.classList.toggle('enraged', b.enraged)
      this.els.bossbar.classList.toggle('shielded', b.shielded)
      const mods = b.mods.map(m => `<span>${MOD_LABEL[m]}</span>`).join('')
      if (this.last.mods !== mods) { this.last.mods = mods; this.els.bossMods.innerHTML = mods }
    }
    if (this.coinFlying > 0) this.coinFlying = Math.max(0, this.coinFlying - dt)
  }
  /** Floating squad-count ring above the squad (screen position from the game camera). */
  squadTag(p: { x: number; y: number } | null, n: number) {
    const el = this.els.squadTag
    if (!p) { el.style.opacity = '0'; return }
    el.style.opacity = '1'
    el.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`
    this.set('tagN', n)
  }
  pauseStats(h: HudState) {
    this.els.pauseStats.innerHTML = `<span>${formatDistance(h.distance)}</span><span>${h.kills} kills</span><span>Sector ${h.sector}</span><span>${h.count} soldiers</span>`
  }

  // ───────────────────────── transient feedback ─────────────────────────
  hint(text: string) {
    const el = this.els.hint
    el.textContent = text
    el.hidden = false
    el.classList.remove('in'); void el.offsetWidth; el.classList.add('in')
    clearTimeout(this.hintTimer)
    this.hintTimer = window.setTimeout(() => { el.hidden = true }, 4200)
  }
  banner(title: string, sub: string, style: string) {
    const el = this.els.banner
    this.els.bannerT.textContent = title
    this.els.bannerS.textContent = sub
    el.className = `banner b-${style}`
    el.hidden = false
    void el.offsetWidth
    el.classList.add('in')
    clearTimeout(this.bannerTimer)
    this.bannerTimer = window.setTimeout(() => { el.hidden = true }, style === 'boss' ? 3200 : 2400)
    if (style === 'boss' || style === 'clear') this.edge(style === 'boss' ? 'bad' : 'gold', 0.9)
  }
  toast(text: string, tone: string) {
    const el = document.createElement('div')
    el.className = `toast t-${tone}`
    el.textContent = text
    this.els.toasts.appendChild(el)
    while (this.els.toasts.children.length > 3) this.els.toasts.firstElementChild!.remove()
    setTimeout(() => el.remove(), 2600)
  }
  hurt(n: number) {
    const v = this.els.vignette
    v.style.setProperty('--hurt', Math.min(1, 0.35 + n * 0.08).toFixed(2))
    v.classList.remove('hit'); void v.offsetWidth; v.classList.add('hit')
  }
  edge(tone: 'good' | 'bad' | 'gold', a = 0.7) {
    const e = this.els.edge
    e.dataset.tone = tone
    e.style.setProperty('--a', String(a))
    e.classList.remove('on'); void e.offsetWidth; e.classList.add('on')
  }
  squadPulse(d: number) {
    const b = this.els.squadBadge
    b.classList.remove('up', 'down'); void b.offsetWidth; b.classList.add(d > 0 ? 'up' : 'down')
    const tg = this.els.squadTag
    tg.classList.remove('up', 'down'); void tg.offsetWidth; tg.classList.add(d > 0 ? 'up' : 'down')
    const p = document.createElement('span')
    p.className = `delta ${d > 0 ? 'up' : 'down'}`
    p.textContent = d > 0 ? `+${d}` : `${d}`
    b.appendChild(p)
    setTimeout(() => p.remove(), 900)
    if (d > 0) { const r = b.getBoundingClientRect(); this.sparks(r.left + r.width * 0.3, r.top + r.height / 2, Math.min(16, 4 + d), 'cyan') }
  }
  coinFly(sx: number, sy: number) {
    const target = this.els.coinBox.getBoundingClientRect()
    const el = document.createElement('img')
    el.src = ICON('coin')
    el.className = 'flycoin'
    el.style.transform = `translate(${sx}px, ${sy}px) scale(0.6)`
    this.els.fly.appendChild(el)
    const tx = target.left + 16, ty = target.top + target.height / 2 - 12
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.style.transform = `translate(${tx}px, ${ty}px) scale(1)`
      el.style.opacity = '1'
    }))
    setTimeout(() => {
      el.remove()
      const c = this.els.coinBox
      c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump')
      if (Math.random() < 0.5) this.sparks(tx + 10, ty + 12, 4, 'gold')
    }, 560)
  }
  /** DOM spark burst (for buttons and HUD). */
  sparks(x: number, y: number, n: number, tone: 'gold' | 'cyan' | 'white' = 'gold') {
    if (this.save.data.reducedMotion) n = Math.ceil(n / 3)
    for (let i = 0; i < n; i++) {
      const s = document.createElement('i')
      s.className = `spark s-${tone}`
      const a = Math.random() * Math.PI * 2, d = 30 + Math.random() * 60
      s.style.left = `${x}px`; s.style.top = `${y}px`
      s.style.setProperty('--dx', `${Math.cos(a) * d}px`)
      s.style.setProperty('--dy', `${Math.sin(a) * d - 10}px`)
      s.style.setProperty('--r', `${(a * 180) / Math.PI}deg`)
      this.els.sparks.appendChild(s)
      setTimeout(() => s.remove(), 650)
    }
  }
  clearTransient() {
    this.els.hint.hidden = true
    this.els.banner.hidden = true
    this.els.toasts.innerHTML = ''
    this.els.fly.innerHTML = ''
    this.textLayer.querySelectorAll<HTMLElement>('.ftext').forEach(t => { t.style.display = 'none' })
    this.last = {}
  }

  // ───────────────────────── perk draft ─────────────────────────
  perks(choices: PerkDef[], owned: Partial<Record<PerkId, number>>) {
    this.perkChoices = choices
    this.perkLocked = true
    this.els.perkCards.innerHTML = choices.map((p, i) => {
      const n = owned[p.id] ?? 0
      return `<button class="perk-card r-${p.rarity}" data-action="perk-${i}" style="--i:${i}">
        <div class="rarity">${p.rarity.toUpperCase()}</div>
        <div class="perk-icon"><img src="${ICON(p.icon)}" alt="" /></div>
        <b>${p.name}</b>
        <p>${p.desc}</p>
        <div class="perk-stat">${p.stat}${n ? ` · owned ${n}/${p.max}` : ''}</div>
        <kbd>${i + 1}</kbd>
      </button>`
    }).join('')
    this.show('perk')
    this.h.sfx('perk', 0.5, 0.8)
    setTimeout(() => { this.perkLocked = false }, 650) // avoid accidental picks from held fire/taps
  }
  private pickPerk(i: number) {
    if (this.perkLocked || this.screen !== 'perk') return
    const p = this.perkChoices[i]
    if (!p) return
    const card = this.els.perkCards.children[i] as HTMLElement
    const r = card.getBoundingClientRect()
    this.sparks(r.left + r.width / 2, r.top + r.height / 2, 26, p.rarity === 'epic' ? 'white' : p.rarity === 'rare' ? 'cyan' : 'gold')
    this.perkLocked = true
    card.classList.add('chosen')
    setTimeout(() => { this.h.perk(p.id); this.show('hud'); this.toast(`PERK: ${p.name.toUpperCase()}`, 'gold') }, 380)
  }

  // ───────────────────────── results ─────────────────────────
  results(s: RunStats, recordScore: boolean, recordDist: boolean, coinsEarned: number) {
    this.els.record.hidden = !(recordScore || recordDist)
    const rows: [string, string][] = [
      ['rDist', formatDistance(s.distance)], ['rKills', s.kills.toLocaleString('en-US')], ['rBosses', String(s.bosses)],
      ['rPeak', String(s.peakSquad)], ['rTime', formatClock(s.time)], ['rScore', s.score.toLocaleString('en-US')],
    ]
    for (const [k, v] of rows) this.els[k].textContent = v
    this.els.rBest.textContent = `· Weapon reached: ${WEAPONS[s.weapon].name}${s.daily ? ` · Daily seed ${seedLabel(s.seed)}` : ''}`
    const causes = Object.entries(s.causes).sort((a, b) => b[1] - a[1]).slice(0, 3)
    this.els.rCauses.innerHTML = causes.length
      ? `<small>SOLDIERS LOST TO</small>${causes.map(([c, n]) => `<span>${CAUSE_LABEL[c] ?? c} <b>${n}</b></span>`).join('')}`
      : ''
    this.show('results')
    // roll the coin counter up
    const el = this.els.rCoins
    const t0 = performance.now()
    const tick = () => {
      const f = Math.min(1, (performance.now() - t0) / 1100)
      el.textContent = Math.round(coinsEarned * (1 - Math.pow(1 - f, 3))).toLocaleString('en-US')
      if (f < 1) requestAnimationFrame(tick)
      else { const r = el.getBoundingClientRect(); this.sparks(r.left + r.width / 2, r.top + r.height / 2, 18, 'gold') }
    }
    requestAnimationFrame(tick)
  }
}
