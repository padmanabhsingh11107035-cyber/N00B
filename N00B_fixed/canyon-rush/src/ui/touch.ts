import type { Input } from '../engine/input'

/**
 * Compact on-screen racing controls for phones. The race surface stays visible while a small
 * steering pad and forward/reverse controls write into `input.touch`.
 */
export class TouchControls {
  private readonly root: HTMLElement
  private steerId = -1
  private steerX = 0

  constructor(parent: HTMLElement, private readonly input: Input, private readonly active: () => boolean, private readonly repairsLeft: () => number = () => 0, private readonly raceOpen: () => boolean = active, private readonly pauseRace: () => void = () => {}, private readonly setStable: (enabled: boolean) => void = () => {}) {
    this.root = document.createElement('div')
    this.root.className = 'touch'
    this.root.innerHTML = `
      <div class="t-steer" data-steer aria-label="Steering"><div class="t-knob" data-knob></div><span>STEER</span></div>
      <div class="t-buttons" aria-label="Driving controls">
        <button type="button" class="t-btn t-reverse" data-k="brake" aria-label="Reverse"><span>▼</span><small>REV</small></button>
        <button type="button" class="t-btn t-forward" data-k="throttle" aria-label="Forward"><span>▲</span><small>GO</small></button>
      </div>
      <div class="t-top-actions"><button type="button" class="t-repair" data-repair aria-label="Repair car"><span>✚</span><small>FIX <b data-repair-count>2</b></small></button><button type="button" class="t-stable" data-stable aria-pressed="false" aria-label="Toggle Stable Mode"><span>◎</span><small>STABLE</small></button><button type="button" class="t-pause" data-pause aria-label="Pause">Ⅱ</button></div>`
    this.root.insertAdjacentHTML('beforeend', `<div class="orientation-gate" data-orientation-gate role="dialog" aria-modal="true" aria-live="polite"><div class="orientation-card"><span class="orientation-icon" aria-hidden="true">↻</span><b>Rotate to landscape</b><p>Canyon Rush is built for a wide race view. Turn your phone sideways to continue driving.</p><button type="button" class="btn primary" data-orientation-lock>Try landscape mode</button></div></div>`)
    parent.appendChild(this.root)
    const steer = this.root.querySelector<HTMLElement>('[data-steer]')!
    const knob = this.root.querySelector<HTMLElement>('[data-knob]')!
    const repair = this.root.querySelector<HTMLButtonElement>('[data-repair]')!
    const repairCount = this.root.querySelector<HTMLElement>('[data-repair-count]')!
    const stable = this.root.querySelector<HTMLButtonElement>('[data-stable]')!
    const setSteer = (clientX: number) => {
      const r = steer.getBoundingClientRect()
      const v = Math.max(-1, Math.min(1, (clientX - (r.left + r.width / 2)) / (r.width * 0.38)))
      this.input.touch.steer = v
      knob.style.transform = `translateX(${v * r.width * 0.34}px)`
    }
    steer.addEventListener('pointerdown', e => {
      this.steerId = e.pointerId
      this.steerX = e.clientX
      steer.setPointerCapture(e.pointerId)
      setSteer(e.clientX)
    })
    steer.addEventListener('pointermove', e => {
      if (e.pointerId === this.steerId) setSteer(e.clientX)
    })
    const release = (e: PointerEvent) => {
      if (e.pointerId !== this.steerId) return
      this.steerId = -1
      this.input.touch.steer = 0
      knob.style.transform = ''
    }
    steer.addEventListener('pointerup', release)
    steer.addEventListener('pointercancel', release)
    void this.steerX
    for (const btn of this.root.querySelectorAll<HTMLButtonElement>('[data-k]')) {
      const k = btn.dataset.k as keyof Input['touch']
      const set = (on: boolean) => {
        ;(this.input.touch as Record<string, boolean | number>)[k] = on
        btn.classList.toggle('on', on)
      }
      btn.addEventListener('pointerdown', e => {
        e.preventDefault()
        btn.setPointerCapture(e.pointerId)
        set(true)
      })
      btn.addEventListener('pointerup', () => set(false))
      btn.addEventListener('pointercancel', () => set(false))
      btn.addEventListener('lostpointercapture', () => set(false))
    }
    this.root.querySelector('[data-pause]')!.addEventListener('click', () => window.dispatchEvent(new Event('game:pause')))
    this.root.querySelector('[data-repair]')!.addEventListener('click', e => {
      e.preventDefault()
      window.dispatchEvent(new Event('game:repair'))
    })
    stable.addEventListener('click', e => {
      e.preventDefault()
      const enabled = !stable.classList.contains('on')
      stable.classList.toggle('on', enabled)
      stable.setAttribute('aria-pressed', String(enabled))
      this.setStable(enabled)
    })
    this.root.querySelector('[data-orientation-lock]')!.addEventListener('click', async () => {
      try {
        const doc = document.documentElement as HTMLElement & { requestFullscreen?: () => Promise<void> }
        if (!document.fullscreenElement && doc.requestFullscreen) await doc.requestFullscreen()
        const orientation = screen.orientation as ScreenOrientation & { lock?: (value: 'landscape') => Promise<void> }
        await orientation.lock?.('landscape')
      } catch {
        // iOS and some embedded browsers do not expose orientation lock; the prompt remains useful.
      }
    })
    let portraitPause = false
    const tick = () => {
      const show = this.active()
      const phone = navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches
      const portrait = window.innerHeight > window.innerWidth
      // Do not cover the pause menu: Resume and Restart must remain tappable so the player can
      // recover from the menu. If Resume is chosen while portrait, the next tick pauses again.
      const blocked = phone && portrait && show
      const gate = this.root.querySelector<HTMLElement>('[data-orientation-gate]')!
      gate.classList.toggle('show', blocked)
      if (blocked && !portraitPause) {
        portraitPause = true
        this.pauseRace()
      } else if (!blocked) portraitPause = false
      this.root.classList.toggle('show', show || blocked)
      const remaining = Math.max(0, this.repairsLeft())
      repairCount.textContent = String(remaining)
      repair.classList.toggle('empty', remaining === 0)
      if (!show || blocked) {
        this.input.touch.steer = 0
        this.input.touch.throttle = false
        this.input.touch.brake = false
        this.input.touch.drift = false
        this.input.touch.boost = false
        this.input.touch.item = false
        this.input.touch.recover = false
        knob.style.transform = ''
      }
      if (!this.raceOpen()) {
        stable.classList.remove('on')
        stable.setAttribute('aria-pressed', 'false')
        this.setStable(false)
      }
      requestAnimationFrame(tick)
    }
    tick()
    window.setInterval(tick, 250)
  }
}
