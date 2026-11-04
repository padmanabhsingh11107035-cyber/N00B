import type { Input, HitAction } from '../engine/input'
import { assetUrl } from '../engine/assets'
import type { SaveStore, Quality } from '../engine/save'
import { OFFSET_LIMIT } from '../engine/save'
import type { Dir, HintKey, Round, Song } from '../game/chart'
import { CONFIG } from '../game/config'
import type { BannerTone, FreestyleEvent, Game, Result } from '../game/game'
import { comboMultiplier, formatClock, ordinal, type Grade, type Perf } from '../game/rules'
import { SONGS } from '../game/songs'
import { HudFx } from './hudfx'

export type Screen = 'boot' | 'title' | 'songs' | 'howto' | 'settings' | 'hud' | 'pause' | 'results'
export type UiActions = {
  startSong(id: string): void
  pause(): void
  resume(): void
  restart(): void
  quit(): void
  settingsChanged(): void
}

const TILE = '<i class="tile"></i>'
const ui = (name: string) => assetUrl(`ui/${name}.webp`)
const GRADE_COLOR: Record<Grade, string> = { perfect: '#ffd84a', great: '#3fd8ff', cool: '#8cff9a', bad: '#ff9a3d', miss: '#ff3355' }
const ARROW = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 5 43 25H31.5v18h-15V25H5Z"/></svg>'
const GRADE_LABEL: Record<Grade, string> = { perfect: 'Perfect', great: 'Great', cool: 'Cool', bad: 'Bad', miss: 'Miss' }
const HINTS: Record<HintKey, { key: string; touch: string }> = {
  arrows: { key: 'Type the arrows in order with the <kbd>Arrow keys</kbd> or <kbd>WASD</kbd>. A wrong key restarts the sequence.', touch: 'Tap the arrows in order on the pad. A wrong tap restarts the sequence.' },
  beat: { key: 'Once the arrows are lit, tap <kbd>Space</kbd> as the marker crosses the gold zone on beat 4.', touch: 'Once the arrows are lit, tap <b>BEAT</b> as the marker crosses the gold zone on beat 4.' },
  reverse: { key: 'Red arrows are reversed. Press the <b>opposite</b> direction.', touch: 'Red arrows are reversed. Tap the <b>opposite</b> direction.' },
  finish: { key: 'Finish Move! Land this long one for triple points.', touch: 'Finish Move! Land this long one for triple points.' },
  freestyle: { key: 'Freestyle! Land every link to chain power moves. The bonus grows with each link.', touch: 'Freestyle! Land every link to chain power moves. The bonus grows with each link.' },
}
const fmt = (n: number) => Math.round(n).toLocaleString('en-US')
const stars = (n: number) => '★'.repeat(n) + '<i>' + '★'.repeat(5 - n) + '</i>'
const songLength = (s: Song) => formatClock((s.sections.reduce((a, x) => a + x.bars, 0) * 240) / s.bpm)

export class Ui {
  screen: Screen = 'boot'
  private readonly el: Record<string, HTMLElement> = {}
  private settingsFrom: Screen = 'title'
  private renderedRound?: Round
  private renderedGrade?: Grade
  private boardKey = ''
  private navCooldown = 0
  private hudVisible = false
  private tagEls: HTMLElement[] = []
  private lastHint = ''
  private lastProgress = 0
  private lastHover?: Element
  private resultTimers: number[] = []
  private palette = { a: '#ff3fb8', b: '#28e0ff', c: '#ffd84a' }
  readonly fx: HudFx
  game?: Game

  constructor(private readonly root: HTMLElement, private readonly save: SaveStore, private readonly input: Input, private readonly actions: UiActions) {
    root.innerHTML = TEMPLATE
    root.querySelectorAll<HTMLElement>('[data-el]').forEach(n => (this.el[n.dataset.el!] = n))
    this.fx = new HudFx(document.body)
    this.tagEls = Array.from(root.querySelectorAll<HTMLElement>('.tag'))
    this.renderSongs()
    this.bind()
    this.syncSettings()
    if (matchMedia('(pointer: coarse)').matches) document.documentElement.classList.add('touch')
    window.addEventListener('touchstart', () => document.documentElement.classList.add('touch'), { once: true, passive: true })
  }

  // ─── screens ─────────────────────────────────────────────────────────────

  show(screen: Screen): void {
    this.screen = screen
    this.root.querySelectorAll<HTMLElement>('[data-screen]').forEach(s => {
      const on = s.dataset.screen === screen || (screen === 'pause' && s.dataset.screen === 'hud')
      s.classList.toggle('is-on', on)
      s.toggleAttribute('inert', !on || (screen === 'pause' && s.dataset.screen === 'hud'))
    })
    document.body.dataset.screen = screen
    this.hudVisible = screen === 'hud' || screen === 'pause'
    if (screen === 'hud') {
      ;(document.activeElement as HTMLElement | null)?.blur?.()
    } else {
      const panel = this.root.querySelector<HTMLElement>(`[data-screen="${screen}"]`)
      const first = panel?.querySelector<HTMLElement>('[data-autofocus]') ?? panel?.querySelector<HTMLElement>('[data-nav]')
      window.setTimeout(() => first?.focus({ preventScroll: true }), 30)
    }
    if (screen === 'songs') this.renderSongs()
    if (screen === 'songs' || screen === 'results' || screen === 'howto') this.sfx('whoosh')
  }

  private bind(): void {
    this.root.addEventListener('click', e => {
      const target = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')
      if (!target) return
      const act = target.dataset.act!
      this.click(target, act)
      switch (act) {
        case 'play': this.show('songs'); break
        case 'warmup': this.actions.startSong('warmup'); break
        case 'howto': this.show('howto'); break
        case 'settings': this.settingsFrom = this.screen; this.show('settings'); break
        case 'back': this.back(); break
        case 'song': this.actions.startSong(target.dataset.song!); break
        case 'pause': this.actions.pause(); break
        case 'resume': this.actions.resume(); break
        case 'restart': this.actions.restart(); break
        case 'quit': this.actions.quit(); break
        case 'songs': this.actions.quit(); this.show('songs'); break
        case 'mute': this.save.update({ muted: !this.save.data.muted }); this.syncSettings(); this.actions.settingsChanged(); break
        case 'motion': this.save.update({ reducedMotion: !this.save.data.reducedMotion }); this.syncSettings(); this.actions.settingsChanged(); break
        case 'assist': this.save.update({ beatAssist: !this.save.data.beatAssist }); this.syncSettings(); this.actions.settingsChanged(); break
        case 'quality': this.save.update({ quality: target.dataset.q as Quality }); this.syncSettings(); this.actions.settingsChanged(); break
      }
    })
    this.root.addEventListener('pointerover', e => this.hover(e))
    this.root.addEventListener('focusin', e => {
      if (this.input.method === 'keyboard' || this.input.method === 'gamepad') this.hover(e)
    })
    this.root.addEventListener('input', e => {
      const t = e.target as HTMLInputElement
      if (t.dataset.set === 'music') this.save.update({ musicVolume: Number(t.value) / 100 })
      if (t.dataset.set === 'sfx') this.save.update({ sfxVolume: Number(t.value) / 100 })
      if (t.dataset.set === 'offset') this.save.update({ offsetMs: Number(t.value) })
      this.syncSettings()
      this.actions.settingsChanged()
    })
    window.addEventListener('keydown', e => {
      if (this.screen === 'hud' || this.screen === 'boot') return
      const dirs: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }
      const onRange = (e.target as HTMLElement)?.matches?.('input[type="range"]')
      if (dirs[e.code] && !(onRange && (e.code === 'ArrowLeft' || e.code === 'ArrowRight'))) {
        e.preventDefault()
        this.moveFocus(...dirs[e.code])
      }
      if (e.code === 'Escape' && this.screen !== 'pause') {
        e.preventDefault()
        this.back()
      }
    })
    this.root.querySelectorAll<HTMLElement>('[data-hit]').forEach(btn => {
      const action = btn.dataset.hit as HitAction
      btn.addEventListener('pointerdown', e => {
        e.preventDefault()
        btn.classList.add('is-down')
        this.input.pushHit(action, e.timeStamp || performance.now())
      })
      const up = () => btn.classList.remove('is-down')
      btn.addEventListener('pointerup', up)
      btn.addEventListener('pointercancel', up)
      btn.addEventListener('pointerleave', up)
      btn.addEventListener('contextmenu', e => e.preventDefault())
    })
  }

  /** Ask main to play a cue (audio stays out of the DOM layer). */
  sfx(name: string): void {
    this.root.dispatchEvent(new CustomEvent('ui-sfx', { detail: name }))
  }

  private click(target: HTMLElement, act: string): void {
    const back = act === 'back' || act === 'quit'
    this.sfx(back ? 'back' : act === 'play' || act === 'song' || act === 'warmup' || act === 'restart' ? 'select' : 'ui')
    const r = target.getBoundingClientRect()
    if (r.width) {
      this.fx.burst(r.left + r.width / 2, r.top + r.height / 2, back ? '#9fa8ff' : this.palette.c, 12, 320, { stars: 4 })
      this.fx.ring(r.left + r.width / 2, r.top + r.height / 2, '#ffffff', Math.max(r.width, r.height) * 0.7, 0.35, 3)
    }
  }

  private hover(e: Event): void {
    const t = (e.target as HTMLElement).closest?.('.btn, .song, .toggle, .seg button, .btn-back')
    if (!t || t === this.lastHover || this.screen === 'hud') return
    this.lastHover = t
    this.sfx('hover')
    this.fx.sparkleRect(t.getBoundingClientRect(), t.classList.contains('song') ? (getComputedStyle(t).getPropertyValue('--c') || '#ffd84a') : '#ffd84a', 5)
  }

  back(): void {
    if (this.screen === 'settings') this.show(this.settingsFrom)
    else if (this.screen === 'songs' || this.screen === 'howto') this.show('title')
    else if (this.screen === 'results') this.actions.quit()
  }

  private moveFocus(dx: number, dy: number): void {
    const panel = this.root.querySelector<HTMLElement>(`[data-screen="${this.screen}"]`)
    if (!panel) return
    const items = Array.from(panel.querySelectorAll<HTMLElement>('[data-nav]')).filter(n => n.offsetParent !== null)
    if (!items.length) return
    const cur = document.activeElement as HTMLElement
    if (!items.includes(cur)) {
      items[0].focus()
      return
    }
    const a = cur.getBoundingClientRect()
    const ax = a.left + a.width / 2
    const ay = a.top + a.height / 2
    let best: HTMLElement | undefined
    let bestScore = Infinity
    for (const n of items) {
      if (n === cur) continue
      const b = n.getBoundingClientRect()
      const vx = b.left + b.width / 2 - ax
      const vy = b.top + b.height / 2 - ay
      const along = vx * dx + vy * dy
      if (along <= 4) continue
      const across = Math.abs(vx * dy) + Math.abs(vy * dx)
      const score = along + across * 2.2
      if (score < bestScore) {
        bestScore = score
        best = n
      }
    }
    best?.focus()
  }

  // ─── settings & songs ────────────────────────────────────────────────────

  syncSettings(): void {
    const d = this.save.data
    const q = (sel: string) => this.root.querySelector<HTMLInputElement>(sel)!
    q('[data-set="music"]').value = String(Math.round(d.musicVolume * 100))
    q('[data-set="sfx"]').value = String(Math.round(d.sfxVolume * 100))
    q('[data-set="offset"]').value = String(d.offsetMs)
    this.el.musicVal.textContent = `${Math.round(d.musicVolume * 100)}%`
    this.el.sfxVal.textContent = `${Math.round(d.sfxVolume * 100)}%`
    this.el.offsetVal.textContent = `${d.offsetMs > 0 ? '+' : ''}${d.offsetMs} ms`
    this.root.querySelector('[data-act="mute"]')!.setAttribute('aria-pressed', String(d.muted))
    this.root.querySelector('[data-act="mute"] b')!.textContent = d.muted ? 'On' : 'Off'
    this.root.querySelector('[data-act="motion"]')!.setAttribute('aria-pressed', String(d.reducedMotion))
    this.root.querySelector('[data-act="motion"] b')!.textContent = d.reducedMotion ? 'On' : 'Off'
    this.root.querySelector('[data-act="assist"]')!.setAttribute('aria-pressed', String(d.beatAssist))
    this.root.querySelector('[data-act="assist"] b')!.textContent = d.beatAssist ? 'On' : 'Off'
    this.root.querySelectorAll<HTMLElement>('[data-act="quality"]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.q === d.quality)))
    document.documentElement.classList.toggle('calm', d.reducedMotion)
  }

  private renderSongs(): void {
    const best = this.save.data.best
    this.el.songList.innerHTML = SONGS.map(s => {
      const b = best[s.id]
      const fresh = s.id === 'warmup' && !this.save.data.tutorialDone
      return `<button class="song" data-nav data-act="song" data-song="${s.id}" style="--a:${s.palette.a};--b:${s.palette.b};--c:${s.palette.c}"${s.id === (this.save.data.lastSong || 'warmup') ? ' data-autofocus' : ''}>
        ${fresh ? '<span class="song-ribbon">Start here</span>' : ''}
        <span class="song-art"><span class="song-eq">${'<i></i>'.repeat(9)}</span></span>
        <span class="song-diff diff-${s.difficulty.toLowerCase().replace('-', '')}">${s.difficulty}</span>
        <span class="song-title">${s.title}</span>
        <span class="song-stars" aria-label="${s.stars} of 5 stars">${stars(s.stars)}</span>
        <span class="song-tag">${s.tagline}</span>
        <span class="song-meta"><span>${Math.round(s.bpm)} BPM</span><span>${songLength(s)}</span>${s.noFail ? '<span>No fail</span>' : ''}</span>
        <span class="song-best">${b ? `<b class="rank rank-${b.rank}">${b.rank}</b><span>Best ${fmt(b.score)}</span>` : '<span class="muted">Not played yet</span>'}</span>
      </button>`
    }).join('')
  }

  // ─── HUD ─────────────────────────────────────────────────────────────────

  resetHud(song: Song): void {
    this.renderedRound = undefined
    this.renderedGrade = undefined
    this.boardKey = ''
    this.lastHint = ''
    this.el.seq.innerHTML = ''
    this.el.seqWrap.className = 'seq-wrap'
    this.el.fs.className = 'fs'
    window.clearTimeout(this.fsTimer)
    this.el.judge.className = 'judge'
    this.el.banner.className = 'banner'
    this.el.count.className = 'count'
    this.el.coach.classList.remove('is-on')
    this.el.hudTitle.textContent = song.title
    this.el.hudMeta.textContent = `${song.difficulty} · ${Math.round(song.bpm)} BPM`
    this.palette = { ...song.palette }
    this.fx.clear()
    this.el.hud.classList.remove('is-spot', 'is-fever')
    this.el.hud.style.setProperty('--a', song.palette.a)
    this.el.hud.style.setProperty('--b', song.palette.b)
    this.el.hud.style.setProperty('--c', song.palette.c)
    this.el.intro.innerHTML = `<small>Now performing</small><b>${song.title}</b><span>${song.artist} · ${Math.round(song.bpm)} BPM · ${song.difficulty}</span>`
    this.retrigger(this.el.intro, 'is-on')
  }

  frame(dt: number): void {
    this.navCooldown = Math.max(0, this.navCooldown - dt)
    this.fx.scale = this.save.data.reducedMotion ? 0.4 : 1
    this.fx.update(Math.min(0.05, dt))
    if (this.screen !== 'hud' && this.screen !== 'boot') {
      const m = this.input.move
      if ((Math.abs(m.x) > 0.5 || Math.abs(m.y) > 0.5) && this.navCooldown === 0) {
        this.navCooldown = 0.2
        if (Math.abs(m.x) > Math.abs(m.y)) this.moveFocus(Math.sign(m.x), 0)
        else this.moveFocus(0, -Math.sign(m.y))
      }
      if (this.input.consume('confirm') && this.input.method === 'gamepad') (document.activeElement as HTMLElement | null)?.click?.()
      if (this.input.consume('back')) this.back()
    }
    if (!this.hudVisible || !this.game) return
    const v = this.game.view()
    const p = v.perf
    this.el.score.textContent = fmt(p.score)
    this.el.progress.style.transform = `scaleX(${v.songProgress})`
    this.el.clock.textContent = `${formatClock(v.elapsed)} / ${formatClock(v.duration)}`
    this.el.level.textContent = v.round ? `Lv ${v.level + 1}` : 'Lv —'
    this.el.energy.style.transform = `scaleX(${p.energy / CONFIG.energy.max})`
    this.el.energyBox.classList.toggle('is-low', p.energy < 30 && !p.noFail)
    const fever = p.feverRounds > 0
    this.el.feverFill.style.transform = `scaleX(${fever ? p.feverRounds / CONFIG.fever.rounds : p.fever / 100})`
    this.el.feverBox.classList.toggle('is-fever', fever)
    this.el.feverLabel.textContent = fever ? `Fever ×${CONFIG.score.feverMultiplier} · ${p.feverRounds} left` : 'Fever'
    this.el.hud.classList.toggle('is-fever', fever)
    this.el.feverBox.classList.toggle('is-ready', !fever && p.fever >= 80)
    this.el.hud.classList.toggle('is-spot', v.spotlight)
    this.el.energyBox.classList.toggle('is-danger', p.energy < 20 && !p.noFail)
    this.fx.setEdge(fever ? 1 : 0, this.palette.a)
    this.el.mult.textContent = `×${(comboMultiplier(p.combo) * (fever ? CONFIG.score.feverMultiplier : 1)).toFixed(2)}`
    this.updateBoard(v.standings)
    this.updateSequence(v.round, v.open, v.progress, v.cursor, v.barSeconds, v.lastGrade)
    this.updateTags()
    const hintKey = v.hint ?? ''
    if (hintKey !== this.lastHint) {
      this.lastHint = hintKey
      const touch = document.documentElement.classList.contains('touch')
      this.el.coach.innerHTML = v.hint ? `<span class="coach-tag">Coach</span><p>${HINTS[v.hint][touch ? 'touch' : 'key']}</p>` : ''
      this.el.coach.classList.toggle('is-on', !!v.hint)
    }
  }

  private updateBoard(list: Array<{ name: string; score: number; you: boolean }>): void {
    const key = list.map(s => `${s.name}:${s.score}`).join('|')
    if (key === this.boardKey) return
    this.boardKey = key
    this.el.board.innerHTML = list.map((s, i) => `<li class="${s.you ? 'is-you' : ''}"><span class="pos">${i + 1}</span><span class="nm">${s.name}</span><span class="sc">${fmt(s.score)}</span></li>`).join('')
  }

  private updateSequence(round: Round | undefined, open: boolean, progress: number, cursor: number, barSeconds: number, grade?: Grade): void {
    const wrap = this.el.seqWrap
    if (!round) {
      wrap.classList.remove('is-on')
      return
    }
    if (round !== this.renderedRound) {
      this.renderedRound = round
      this.renderedGrade = undefined
      this.el.seq.innerHTML = round.arrows.map((d: Dir, i) => `<span class="arr dir-${d}${round.reversed[i] ? ' is-rev' : ''}" style="--i:${i}">${TILE}</span>`).join('')
      this.lastProgress = 0
      this.el.seq.style.setProperty('--n', String(round.arrows.length))
      this.el.seqLevel.textContent = round.finish ? 'Finish Move' : round.freestyle ? `Freestyle · Link ${round.link + 1}` : `Lv ${round.level + 1}`
      wrap.classList.toggle('is-finish', round.finish)
      wrap.classList.toggle('is-freestyle', round.freestyle)
      const zone = (2 * CONFIG.judge.bad) / 1000 / barSeconds
      const perfect = (2 * CONFIG.judge.perfect) / 1000 / barSeconds
      this.el.zone.style.width = `${zone * 100}%`
      this.el.zonePerfect.style.width = `${(perfect / zone) * 100}%`
    }
    wrap.classList.add('is-on')
    wrap.classList.toggle('is-open', open)
    wrap.classList.toggle('is-ready', open && progress >= round.arrows.length)
    const tiles = this.el.seq.children
    if (open && progress > this.lastProgress) {
      for (let i = this.lastProgress; i < progress; i++) {
        const r = tiles[i]?.getBoundingClientRect()
        if (r) this.fx.burst(r.left + r.width / 2, r.top + r.height / 2, progress >= round.arrows.length ? '#ffd84a' : '#7fe9ff', 10, 260, { stars: 3 })
      }
      if (progress >= round.arrows.length) {
        const r = this.el.seq.getBoundingClientRect()
        this.fx.ring(r.left + r.width / 2, r.top + r.height / 2, '#ffd84a', r.width * 0.6, 0.45, 4)
        this.sfx('lock')
      }
    }
    this.lastProgress = open ? progress : 0
    for (let i = 0; i < tiles.length; i += 1) {
      tiles[i].classList.toggle('is-done', i < progress)
      tiles[i].classList.toggle('is-next', open && i === progress)
    }
    if (!open && grade && grade !== this.renderedGrade) {
      this.renderedGrade = grade
      wrap.dataset.grade = grade
    } else if (open) {
      delete wrap.dataset.grade
    }
    const c = Math.max(0, Math.min(1.08, cursor))
    this.el.cursor.style.left = `${c * 100}%`
    this.el.cursor.classList.toggle('is-hot', open && Math.abs(cursor - 0.75) < 0.06)
  }

  private updateTags(): void {
    if (!this.game) return
    const tags = this.game.dancerTags()
    const now = performance.now()
    tags.forEach((t, i) => {
      const el = this.tagEls[i]
      if (!el) return
      el.style.transform = `translate(${t.x.toFixed(1)}px, ${t.y.toFixed(1)}px) translate(-50%, -100%)`
      el.style.opacity = t.visible ? '1' : '0'
      const g = el.querySelector('em')!
      const fresh = t.last && now - t.lastAt < 900
      g.textContent = fresh ? GRADE_LABEL[t.last!] : ''
      g.className = fresh ? `g-${t.last}` : ''
    })
  }

  onJudged(grade: Grade, points: number, perf: Perf, finish: boolean, spotlight = false): void {
    const j = this.el.judge
    ;(this.el.judgeArt as HTMLImageElement).src = ui(`j_${grade}`)
    this.el.judgeSpot.textContent = spotlight && (grade === 'perfect' || grade === 'great') ? 'Spotlight ×2' : ''
    const jr = this.el.judgeArt.getBoundingClientRect()
    const cx = jr.width ? jr.left + jr.width / 2 : window.innerWidth / 2
    const cy = jr.height ? jr.top + jr.height / 2 : window.innerHeight * 0.36
    const col = GRADE_COLOR[grade]
    if (grade === 'perfect') {
      this.fx.flare(cx, cy, '#ffd84a', 360, 0.4)
      this.fx.burst(cx, cy, '#ffd84a', finish ? 60 : 32, 620, { stars: finish ? 22 : 12, ring: true })
      if (spotlight) this.fx.ring(cx, cy, '#fff2b0', 320, 0.7, 7)
    } else if (grade === 'great') {
      this.fx.flare(cx, cy, col, 240, 0.3)
      this.fx.burst(cx, cy, col, 20, 480, { stars: 7, ring: true })
    } else if (grade === 'cool') {
      this.fx.burst(cx, cy, col, 10, 320, { stars: 3 })
    } else {
      this.fx.shards(cx, cy, grade === 'miss' ? 14 : 8, col)
    }
    if (points > 0) {
      const sr = this.el.score.getBoundingClientRect()
      this.fx.burst(sr.left + sr.width * 0.8, sr.top + sr.height / 2, col, 8, 220, { stars: 2 })
      this.retrigger(this.el.score, 'is-bump')
    }
    if (perf.combo >= 2) this.retrigger(this.el.judgeCombo, 'is-pop')
    this.el.judgeGrade.textContent = finish && grade !== 'miss' && grade !== 'bad' ? `Finish ${GRADE_LABEL[grade]}!` : `${GRADE_LABEL[grade]}${grade === 'miss' ? '' : '!'}`
    this.el.judgeCombo.textContent = perf.combo >= 2 ? `${perf.combo} Combo` : ''
    this.el.judgeChain.textContent = grade === 'perfect' && perf.chain >= 2 ? `Perfect ×${perf.chain}` : ''
    this.el.judgePts.textContent = points > 0 ? `+${fmt(points)}` : ''
    j.className = `judge g-${grade}`
    this.retrigger(j, 'is-on')
    if (grade === 'miss') this.retrigger(this.el.flash, 'is-miss')
    else if (grade === 'perfect') this.retrigger(this.el.flash, 'is-perfect')
  }

  onWrong(): void {
    this.retrigger(this.el.seq, 'is-wrong')
    const r = this.el.seq.getBoundingClientRect()
    if (r.width) this.fx.shards(r.left + r.width / 2, r.top + r.height / 2, 12)
  }

  private fsTimer = 0
  /** Freestyle chain meter: link pips, escalating chain count, and the bonus payout. */
  freestyle(ev: FreestyleEvent): void {
    const el = this.el.fs
    const seq = this.el.seqWrap.getBoundingClientRect()
    if (seq.height) el.style.bottom = `${Math.round(window.innerHeight - seq.top + 16)}px`
    const r = () => el.getBoundingClientRect()
    const P = this.palette
    window.clearTimeout(this.fsTimer)
    if (ev.kind === 'start') {
      this.el.fsPips.innerHTML = Array.from({ length: ev.links }, (_, i) => `<i style="--i:${i}"></i>`).join('')
      this.el.fsChain.textContent = '×0'
      this.el.fsGain.textContent = `${ev.links} links`
      el.className = 'fs is-on'
      requestAnimationFrame(() => {
        const b = r()
        this.fx.flare(b.left + b.width / 2, b.top + b.height / 2, P.c, 380, 0.5)
        this.fx.burst(b.left + b.width / 2, b.top + b.height / 2, P.c, 26, 520, { stars: 10, ring: true })
      })
      return
    }
    const pips = this.el.fsPips.children
    if (ev.kind === 'link' || ev.kind === 'break') {
      pips[ev.link]?.classList.add(ev.kind === 'link' ? 'is-lit' : 'is-broken')
      this.el.fsChain.textContent = `×${ev.chain}`
      this.el.fsGain.textContent = ev.kind === 'link' ? `+${fmt(ev.bonus)}` : 'Chain broken'
      el.classList.toggle('is-hot', ev.chain >= 3)
      el.classList.remove('is-pop', 'is-broke')
      void el.offsetWidth
      el.classList.add(ev.kind === 'link' ? 'is-pop' : 'is-broke')
      const b = r()
      const cx = b.left + b.width / 2
      const cy = b.top + b.height / 2
      if (ev.kind === 'link') {
        const hot = ev.chain >= 3
        this.fx.ring(cx, cy, hot ? P.c : '#ffd84a', 160 + ev.chain * 50, 0.45, 4 + ev.chain)
        this.fx.burst(cx, cy, hot ? P.c : '#ffd84a', 14 + ev.chain * 8, 380 + ev.chain * 60, { stars: 4 + ev.chain * 2 })
        if (hot) this.fx.streamers(20 + ev.chain * 10, [P.a, P.b, P.c, '#ffffff'])
      } else {
        this.fx.shards(cx, cy, 14)
      }
      return
    }
    // Payout: count the total bonus up, then retire the meter.
    const total = ev.total
    el.classList.remove('is-pop', 'is-broke')
    el.classList.add('is-payout')
    this.el.fsChain.textContent = total > 0 ? `+${fmt(0)}` : 'No bonus'
    this.el.fsGain.textContent = total > 0 ? `Freestyle bonus · best chain ×${ev.chain}` : 'Freestyle over'
    const t0 = performance.now()
    const step = () => {
      const u = Math.min(1, (performance.now() - t0) / 900)
      if (total > 0) this.el.fsChain.textContent = `+${fmt(total * (1 - Math.pow(1 - u, 3)))}`
      if (u < 1) requestAnimationFrame(step)
      else if (total > 0) {
        const b = r()
        this.fx.burst(b.left + b.width / 2, b.top + b.height / 2, '#ffd84a', 40, 640, { stars: 16, ring: true })
        this.fx.cannons([P.a, P.b, P.c, '#ffffff'], 40)
      }
    }
    requestAnimationFrame(step)
    this.fsTimer = window.setTimeout(() => el.classList.remove('is-on'), 2600)
  }
  /** Combo milestone callout (10, 20, 25, 30 …). */
  milestone(combo: number): void {
    const big = combo % 25 === 0
    this.el.mile.innerHTML = `<b>${combo}</b><span>Combo${big ? '!' : ''}</span>`
    this.el.mile.className = `milestone${big ? ' is-big' : ''}`
    this.retrigger(this.el.mile, 'is-on')
    const r = this.el.mile.getBoundingClientRect()
    const x = r.width ? r.left + r.width / 2 : window.innerWidth / 2
    const y = r.height ? r.top + r.height / 2 : window.innerHeight * 0.25
    this.fx.ring(x, y, this.palette.c, big ? 420 : 260, 0.6, 6)
    this.fx.burst(x, y, this.palette.c, big ? 40 : 20, 520, { stars: big ? 16 : 8 })
    this.fx.streamers(big ? 80 : 36, [this.palette.a, this.palette.b, this.palette.c, '#ffffff'])
  }

  banner(text: string, tone: BannerTone): void {
    this.el.bannerText.textContent = text
    const art = tone === 'fever' || tone === 'finish' || tone === 'spotlight'
    const img = this.el.bannerArt as HTMLImageElement
    if (art) img.src = ui(`b_${tone}`)
    img.hidden = !art
    this.el.banner.className = `banner tone-${tone}${art ? ' has-art' : ''}`
    this.retrigger(this.el.banner, 'is-on')
    const cx = window.innerWidth / 2
    const cy = window.innerHeight * 0.3
    if (tone === 'fever') {
      this.fx.cannons([this.palette.a, this.palette.b, this.palette.c, '#ffffff'], 70)
      this.fx.flare(cx, cy, '#ff7a3d', 520, 0.5)
      this.fx.burst(cx, cy, '#ff9a3d', 40, 700, { stars: 14, ring: true })
    } else if (tone === 'finish') {
      this.fx.flare(cx, cy, this.palette.c, 480, 0.5)
      this.fx.burst(cx, cy, this.palette.c, 30, 600, { stars: 12, ring: true })
    } else if (tone === 'spotlight') {
      this.fx.flare(cx, cy, '#fff2b0', 420, 0.6)
      this.fx.burst(cx, cy, '#ffe28a', 24, 420, { stars: 14 })
    } else if (tone === 'freestyle') {
      this.fx.cannons([this.palette.a, this.palette.b, this.palette.c, '#ffffff'], 60)
      this.fx.flare(cx, cy, this.palette.c, 520, 0.5)
      this.fx.burst(cx, cy, this.palette.c, 36, 680, { stars: 16, ring: true })
    } else if (tone === 'level') {
      this.fx.burst(cx, cy, this.palette.b, 16, 380, { stars: 5 })
    }
  }

  countdown(label: string): void {
    this.el.count.textContent = label
    this.el.count.className = `count${label.length > 2 ? ' is-go' : ''}`
    this.retrigger(this.el.count, 'is-on')
    const go = label.length > 2
    this.fx.ring(window.innerWidth / 2, window.innerHeight * 0.42, go ? this.palette.c : '#ffffff', go ? 380 : 200, 0.5, go ? 7 : 4)
    if (go) this.fx.burst(window.innerWidth / 2, window.innerHeight * 0.42, this.palette.c, 30, 620, { stars: 10 })
  }

  /** Small overlay while a song's music streams in on demand. */
  loading(on: boolean, title = ''): void {
    this.el.songLoad.classList.toggle('is-on', on)
    if (on) {
      this.el.songLoadTitle.textContent = title
      this.loadingProgress(0)
    }
  }

  loadingProgress(p: number): void {
    this.el.songLoadBar.style.transform = `scaleX(${p.toFixed(3)})`
  }

  private retrigger(el: HTMLElement, cls: string): void {
    el.classList.remove(cls)
    void el.offsetWidth
    el.classList.add(cls)
  }

  // ─── results ─────────────────────────────────────────────────────────────

  showResults(r: Result, newBest: boolean): void {
    const p = r.perf
    const cleared = p.phase === 'cleared'
    const el = this.el.results
    for (const t of this.resultTimers) window.clearTimeout(t)
    this.resultTimers = []
    this.fx.clear()
    el.classList.remove('is-stamped', 'is-badged')
    ;(this.el.resArt as HTMLImageElement).hidden = !cleared
    el.style.setProperty('--a', r.song.palette.a)
    el.style.setProperty('--b', r.song.palette.b)
    el.style.setProperty('--c', r.song.palette.c)
    this.el.resRank.textContent = r.rank
    this.el.resRank.className = `res-rank rank-${r.rank}`
    this.el.resTitle.textContent = cleared ? (r.rank === 'S' ? 'Superstar!' : 'Stage Clear!') : 'Out of Energy'
    this.el.resSong.textContent = `${r.song.title} · ${r.song.difficulty} · ${Math.round(r.song.bpm)} BPM`
    this.el.resBadge.textContent = r.unranked ? 'Tuned run · not saved' : newBest ? 'New personal best!' : cleared ? `${ordinal(r.place)} place` : 'Try again'
    this.el.resBadge.className = `res-badge${newBest && !r.unranked ? ' is-best' : ''}`
    const rows: Array<[string, string, string]> = [
      ['Perfect', String(p.counts.perfect), 'g-perfect'],
      ['Great', String(p.counts.great), 'g-great'],
      ['Cool', String(p.counts.cool), 'g-cool'],
      ['Bad', String(p.counts.bad), 'g-bad'],
      ['Miss', String(p.counts.miss), 'g-miss'],
      ['Max combo', String(p.maxCombo), ''],
      ['Accuracy', `${(r.accuracy * 100).toFixed(1)}%`, ''],
      ['Finish move', p.finishHit ? 'Landed' : '—', ''],
      ...((r.song.freestyle ?? 0) > 0 ? [['Freestyle', p.fsBest ? `×${p.fsBest} · +${fmt(p.fsBonus)}` : '—', ''] as [string, string, string]] : []),
    ]
    this.el.resStats.innerHTML = rows.map(([k, v, c], i) => `<li class="${c}" style="--d:${250 + i * 90}ms"><span>${k}</span><b>${v}</b></li>`).join('')
    const badges: string[] = []
    if (p.counts.miss === 0 && p.counts.bad === 0 && cleared) badges.push('Full Combo')
    if (p.counts.perfect > 0 && p.counts.perfect === p.rounds) badges.push('All Perfect')
    if (p.finishHit) badges.push('Finish Landed')
    if ((r.song.freestyle ?? 0) > 0 && p.fsBest >= (r.song.freestyle ?? 0)) badges.push('Freestyle Master')
    if (newBest && !r.unranked) badges.push('New Best')
    this.el.resBadges.innerHTML = badges.map((b, i) => `<span style="--d:${i * 140}ms">${b}</span>`).join('')
    this.el.resBoard.innerHTML = r.standings.map((s, i) => `<li class="${s.you ? 'is-you' : ''}"><span class="pos">${ordinal(i + 1)}</span><span class="nm">${s.name}</span><span class="sc">${fmt(s.score)}</span></li>`).join('')
    this.show('results')
    // Ceremony: stats cascade in, score counts up with ticks, then the rank stamps down.
    const target = p.score
    const start = performance.now() + 350
    let lastTick = 0
    const tick = () => {
      const now = performance.now()
      const u = Math.max(0, Math.min(1, (now - start) / 1400))
      this.el.resScore.textContent = fmt(target * (1 - Math.pow(1 - u, 3)))
      if (u > 0 && u < 1 && now - lastTick > 70) {
        lastTick = now
        this.sfx('tick')
      }
      if (u < 1 && this.screen === 'results') requestAnimationFrame(tick)
    }
    tick()
    const P = [r.song.palette.a, r.song.palette.b, r.song.palette.c, '#ffffff']
    this.resultTimers.push(window.setTimeout(() => {
      if (this.screen !== 'results') return
      el.classList.add('is-stamped')
      this.sfx('stamp')
      const rr = this.el.resRank.getBoundingClientRect()
      const x = rr.left + rr.width / 2
      const y = rr.top + rr.height / 2
      const good = cleared && (r.rank === 'S' || r.rank === 'A')
      this.fx.flare(x, y, r.rank === 'S' ? '#ffd84a' : r.song.palette.b, 420, 0.5)
      this.fx.ring(x, y, r.rank === 'S' ? '#ffd84a' : r.song.palette.b, 300, 0.6, 8)
      this.fx.burst(x, y, r.rank === 'S' ? '#ffd84a' : r.song.palette.c, good ? 48 : 20, 640, { stars: good ? 18 : 6 })
      if (good) {
        this.fx.cannons(P, 80)
        this.sfx('applause')
      }
      if (!cleared) this.fx.shards(x, y, 16, '#ff5577')
    }, 1850))
    this.resultTimers.push(window.setTimeout(() => {
      if (this.screen !== 'results') return
      el.classList.add('is-badged')
      if (badges.length) this.sfx('badge')
      if (newBest && !r.unranked) this.sfx('newBest')
      if (cleared) this.fx.streamers(60, P)
    }, 2500))
  }
}

const TEMPLATE = /* html */ `
<section class="screen boot is-on" data-screen="boot"></section>
<div class="song-load" data-el="songLoad" role="status"><small>Loading track</small><b data-el="songLoadTitle"></b><div class="bar"><i data-el="songLoadBar"></i></div></div>

<section class="screen title" data-screen="title">
  <div class="title-panel">
    <div class="logo">
      <span class="logo-kicker">Rhythm · Dance · Club</span>
      <h1><span>PULSE</span><span class="logo-beat">GRID<em>ARENA</em></span></h1>
      <p class="logo-tag">Enter the sequence. Land the beat. Own the stage.</p>
    </div>
    <nav class="menu">
      <button class="btn btn-primary" data-nav data-act="play" data-autofocus><span>Play</span><small>Choose a song</small></button>
      <button class="btn" data-nav data-act="warmup"><span>Warm-Up</span><small>Guided tutorial stage</small></button>
      <button class="btn" data-nav data-act="howto"><span>How to Play</span></button>
      <button class="btn" data-nav data-act="settings"><span>Settings</span></button>
    </nav>
  </div>
  <footer class="title-foot">
    <span><kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd> arrows</span><span><kbd>Space</kbd> beat</span><span><kbd>Esc</kbd> pause</span>
    <span class="foot-credit">Original music · Dance mocap: AIST++ (CC BY 4.0) · Headphones recommended</span>
  </footer>
</section>

<section class="screen songs" data-screen="songs">
  <header class="screen-head">
    <button class="btn-back" data-nav data-act="back" aria-label="Back">‹ Back</button>
    <div><small>Select stage</small><h2>Tonight's Setlist</h2></div>
  </header>
  <div class="song-list" data-el="songList"></div>
  <p class="screen-note">Every song builds from easy grooves to long, fast sequences. Beat the three rivals on stage for 1st place.</p>
</section>

<section class="screen howto" data-screen="howto">
  <header class="screen-head">
    <button class="btn-back" data-nav data-act="back" aria-label="Back">‹ Back</button>
    <div><small>Learn the moves</small><h2>How to Play</h2></div>
  </header>
  <ol class="steps">
    <li><span class="step-n">1</span><div class="demo-seq"><span class="arr dir-left is-done">${TILE}</span><span class="arr dir-up is-done">${TILE}</span><span class="arr dir-right is-next">${TILE}</span><span class="arr dir-down">${TILE}</span></div><h3>Type the arrows</h3><p>Every bar shows a new arrow sequence. Enter it in order with <kbd>Arrow keys</kbd> or <kbd>WASD</kbd>. One wrong key and it starts over.</p></li>
    <li><span class="step-n">2</span><div class="demo-timing"><i class="t1"></i><i class="t2"></i><i class="t3"></i><b></b><em></em></div><h3>Hit the beat</h3><p>When the row lights up, tap <kbd>Space</kbd> as the marker crosses the gold zone on <b>beat 4</b>. Closer to the centre means a better grade.</p></li>
    <li><span class="step-n">3</span><div class="demo-seq"><span class="arr dir-up is-rev">${TILE}</span><span class="demo-eq">=</span><span class="arr dir-down is-done">${TILE}</span></div><h3>Watch for red arrows</h3><p>Red arrows are reversed: press the <b>opposite</b> direction. They show up in harder levels and in Finish Moves.</p></li>
    <li><span class="step-n">4</span><div class="demo-grades"><b class="g-perfect">Perfect</b><b class="g-great">Great</b><b class="g-cool">Cool</b><b class="g-miss">Miss</b></div><h3>Combo into Fever</h3><p>Good grades build your combo multiplier and fill the <b>Fever</b> gauge for double points. Misses drain energy. Run out and the show is over.</p></li>
  </ol>
  <div class="howto-cta"><button class="btn btn-primary" data-nav data-act="warmup"><span>Try the Warm-Up</span><small>Guided, no fail</small></button><p>Touch screens get an on-screen arrow pad and a <b>BEAT</b> button. Gamepads use the D-pad and <b>A</b>.</p></div>
</section>

<section class="screen settings" data-screen="settings">
  <header class="screen-head">
    <button class="btn-back" data-nav data-act="back" aria-label="Back">‹ Back</button>
    <div><small>Tune your setup</small><h2>Settings</h2></div>
  </header>
  <div class="settings-grid">
    <label class="field"><span>Music volume <b data-el="musicVal"></b></span><input data-nav type="range" min="0" max="100" step="5" data-set="music" data-autofocus /></label>
    <label class="field"><span>Effects volume <b data-el="sfxVal"></b></span><input data-nav type="range" min="0" max="100" step="5" data-set="sfx" /></label>
    <label class="field"><span>Timing offset <b data-el="offsetVal"></b></span><input data-nav type="range" min="-${OFFSET_LIMIT}" max="${OFFSET_LIMIT}" step="5" data-set="offset" /><small>Raise it if your hits feel late (e.g. Bluetooth headphones).</small></label>
    <div class="field"><span>Graphics</span><div class="seg"><button data-nav data-act="quality" data-q="low">Low</button><button data-nav data-act="quality" data-q="medium">Medium</button><button data-nav data-act="quality" data-q="high">High</button></div></div>
    <button class="toggle" data-nav data-act="mute" aria-pressed="false"><span>Mute all audio</span><b>Off</b></button>
    <button class="toggle" data-nav data-act="motion" aria-pressed="false"><span>Reduce motion</span><b>Off</b></button>
    <button class="toggle" data-nav data-act="assist" aria-pressed="true"><span>Beat assist ticks</span><b>On</b></button>
  </div>
</section>

<section class="screen hud" data-screen="hud" data-el="hud">
  <div class="hud-flash" data-el="flash"></div>
  <div class="hud-top">
    <div class="hud-song">
      <b data-el="hudTitle"></b><span data-el="hudMeta"></span>
      <div class="hud-progress"><i data-el="progress"></i></div>
      <small data-el="clock"></small>
    </div>
    <div class="hud-score"><small>Score</small><b data-el="score">0</b><span class="hud-mult" data-el="mult">×1.00</span></div>
    <button class="hud-pause" data-act="pause" aria-label="Pause"><i></i><i></i></button>
  </div>
  <div class="hud-meters">
    <div class="meter energy" data-el="energyBox"><span>Energy</span><div class="meter-bar"><i data-el="energy"></i></div></div>
    <div class="meter fever" data-el="feverBox"><span data-el="feverLabel">Fever</span><div class="meter-bar"><i data-el="feverFill"></i></div></div>
    <div class="hud-level" data-el="level">Lv —</div>
  </div>
  <ol class="hud-board" data-el="board"></ol>
  <div class="tags">
    <div class="tag is-you"><span>YOU</span><em></em></div>
    <div class="tag"><span>NOVA</span><em></em></div>
    <div class="tag"><span>KAI</span><em></em></div>
    <div class="tag"><span>REMI</span><em></em></div>
  </div>
  <div class="intro-card" data-el="intro"></div>
  <div class="banner" data-el="banner"><img data-el="bannerArt" alt="" hidden /><span data-el="bannerText"></span></div>
  <div class="milestone" data-el="mile"></div>
  <div class="count" data-el="count"></div>
  <div class="judge" data-el="judge"><img class="j-art" data-el="judgeArt" alt="" /><b class="j-text" data-el="judgeGrade"></b><span class="j-spot" data-el="judgeSpot"></span><span class="j-pts" data-el="judgePts"></span><span class="j-combo" data-el="judgeCombo"></span><span class="j-chain" data-el="judgeChain"></span></div>
  <div class="coach" data-el="coach"></div>
  <div class="fs" data-el="fs" aria-live="polite">
    <span class="fs-title">Freestyle</span>
    <b class="fs-chain" data-el="fsChain">×0</b>
    <span class="fs-pips" data-el="fsPips"></span>
    <span class="fs-gain" data-el="fsGain"></span>
  </div>
  <div class="seq-wrap" data-el="seqWrap">
    <div class="seq-level" data-el="seqLevel"></div>
    <div class="seq" data-el="seq"></div>
    <div class="timing">
      <div class="timing-track">
        <i class="tick" style="left:0%"></i><i class="tick" style="left:25%"></i><i class="tick" style="left:50%"></i>
        <div class="zone" data-el="zone"><i data-el="zonePerfect"></i></div>
        <div class="cursor" data-el="cursor"></div>
      </div>
    </div>
  </div>
  <div class="pad" aria-label="Touch controls">
    <div class="pad-dirs">
      <button data-hit="up" class="pad-up" aria-label="Up">${ARROW}</button>
      <button data-hit="left" class="pad-left" aria-label="Left">${ARROW}</button>
      <button data-hit="right" class="pad-right" aria-label="Right">${ARROW}</button>
      <button data-hit="down" class="pad-down" aria-label="Down">${ARROW}</button>
    </div>
    <button data-hit="beat" class="pad-beat">Beat</button>
  </div>
</section>

<section class="screen pause" data-screen="pause">
  <div class="modal">
    <small>Paused</small><h2>Take a breather</h2>
    <nav class="menu">
      <button class="btn btn-primary" data-nav data-act="resume" data-autofocus><span>Resume</span></button>
      <button class="btn" data-nav data-act="restart"><span>Restart song</span></button>
      <button class="btn" data-nav data-act="settings"><span>Settings</span></button>
      <button class="btn" data-nav data-act="quit"><span>Quit to title</span></button>
    </nav>
    <p class="muted">Press <kbd>Esc</kbd> to resume</p>
  </div>
</section>

<section class="screen results" data-screen="results" data-el="results">
  <div class="res-card">
    <div class="res-left">
      <img class="res-art" data-el="resArt" src="${ui('b_clear')}" alt="" hidden />
      <small class="res-kicker">Results</small>
      <div class="res-rank" data-el="resRank">A</div>
      <h2 data-el="resTitle">Stage Clear!</h2>
      <p class="res-song" data-el="resSong"></p>
      <div class="res-score"><small>Score</small><b data-el="resScore">0</b></div>
      <span class="res-badge" data-el="resBadge"></span>
      <div class="res-badges" data-el="resBadges"></div>
    </div>
    <div class="res-right">
      <ul class="res-stats" data-el="resStats"></ul>
      <h3>Final standings</h3>
      <ol class="res-board" data-el="resBoard"></ol>
      <nav class="res-actions">
        <button class="btn btn-primary" data-nav data-act="restart" data-autofocus><span>Dance again</span></button>
        <button class="btn" data-nav data-act="songs"><span>Song select</span></button>
        <button class="btn" data-nav data-act="quit"><span>Title</span></button>
      </nav>
    </div>
  </div>
</section>
`
