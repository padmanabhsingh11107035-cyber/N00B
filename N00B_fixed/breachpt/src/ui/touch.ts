import type { Action, Input } from '../engine/input'

/**
 * Phone / tablet controls, drawn over the game while a match is on: a stick on the left to walk, a drag anywhere on the right half to look around,
 * and buttons for FIRE, SCOPE (tap to switch on and off), RELOAD, JUMP, CROUCH, GRENADE, SWITCH weapon and PAUSE.
 * Everything feeds the one Input the keyboard and the gamepad use, so the game itself does not know about touch.
 */
export class TouchControls {
  private readonly el: HTMLElement
  private shown = false
  private scoped = false

  constructor(root: HTMLElement, private readonly input: Input, private readonly active: () => boolean) {
    this.el = document.createElement('div')
    this.el.className = 'tc'
    this.el.hidden = true
    this.el.innerHTML = `
      <div class="tc-look" data-look></div>
      <div class="tc-stick" data-stick><i data-knob></i></div>
      <button class="tc-btn tc-pause" data-pause aria-label="Pause">II</button>
      <button class="tc-btn tc-switch" data-act="nextWeapon" data-tap>SWAP</button>
      <button class="tc-btn tc-nade" data-act="grenade" data-tap>NADE</button>
      <button class="tc-btn tc-reload" data-act="reload" data-tap>RELOAD</button>
      <button class="tc-btn tc-crouch" data-act="slide" data-tap>DUCK</button>
      <button class="tc-btn tc-jump" data-act="jump" data-tap>JUMP</button>
      <button class="tc-btn tc-scope" data-scope>SCOPE</button>
      <button class="tc-btn tc-fire" data-fire>FIRE</button>`
    root.appendChild(this.el)
    const stop = (e: Event) => e.preventDefault()
    this.el.addEventListener('contextmenu', stop)
    this.el.addEventListener('touchstart', stop, { passive: false })
    this.bindStick()
    this.bindLook()
    this.bindButtons()
  }

  /** Call every frame: shows the controls only while a match is on (and the device is touch). */
  frame(): void {
    const on = this.active()
    if (on !== this.shown) {
      this.shown = on
      this.el.hidden = !on
      if (!on) this.releaseAll()
    }
  }

  private releaseAll(): void {
    this.input.touchMove.x = 0
    this.input.touchMove.y = 0
    this.input.touchHeld.clear()
    this.scoped = false
    this.el.querySelector('[data-scope]')?.classList.remove('on')
    const knob = this.el.querySelector<HTMLElement>('[data-knob]')
    if (knob) knob.style.transform = ''
  }

  private bindStick(): void {
    const base = this.el.querySelector<HTMLElement>('[data-stick]')!
    const knob = this.el.querySelector<HTMLElement>('[data-knob]')!
    let id = -1
    const set = (e: PointerEvent) => {
      const r = base.getBoundingClientRect()
      const radius = r.width / 2
      let dx = (e.clientX - (r.left + radius)) / radius
      let dy = (e.clientY - (r.top + radius)) / radius
      const len = Math.hypot(dx, dy)
      if (len > 1) { dx /= len; dy /= len }
      const dead = Math.hypot(dx, dy) < 0.12
      this.input.touchMove.x = dead ? 0 : dx
      this.input.touchMove.y = dead ? 0 : -dy
      // pushed right to the edge: run
      if (Math.hypot(dx, dy) > 0.92) this.input.touchHeld.add('sprint')
      else this.input.touchHeld.delete('sprint')
      knob.style.transform = `translate(${dx * radius * 0.55}px, ${dy * radius * 0.55}px)`
    }
    base.addEventListener('pointerdown', e => {
      if (id !== -1) return
      id = e.pointerId
      base.setPointerCapture(id)
      set(e)
    })
    base.addEventListener('pointermove', e => { if (e.pointerId === id) set(e) })
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return
      id = -1
      this.input.touchMove.x = 0
      this.input.touchMove.y = 0
      this.input.touchHeld.delete('sprint')
      knob.style.transform = ''
    }
    base.addEventListener('pointerup', end)
    base.addEventListener('pointercancel', end)
  }

  private bindLook(): void {
    const pad = this.el.querySelector<HTMLElement>('[data-look]')!
    let id = -1
    let lx = 0
    let ly = 0
    pad.addEventListener('pointerdown', e => {
      if (id !== -1) return
      id = e.pointerId
      pad.setPointerCapture(id)
      lx = e.clientX
      ly = e.clientY
    })
    pad.addEventListener('pointermove', e => {
      if (e.pointerId !== id) return
      this.input.look.x += (e.clientX - lx) * 0.0042
      this.input.look.y += (e.clientY - ly) * 0.0042
      lx = e.clientX
      ly = e.clientY
    })
    const end = (e: PointerEvent) => { if (e.pointerId === id) id = -1 }
    pad.addEventListener('pointerup', end)
    pad.addEventListener('pointercancel', end)
  }

  private bindButtons(): void {
    const hold = (btn: HTMLElement, action: Action, onDown?: () => void, onUp?: () => void) => {
      btn.addEventListener('pointerdown', e => {
        e.preventDefault()
        btn.setPointerCapture(e.pointerId)
        btn.classList.add('down')
        onDown?.()
        this.input.touchHeld.add(action)
        this.input.touchPress(action)
      })
      const up = () => {
        btn.classList.remove('down')
        this.input.touchHeld.delete(action)
        onUp?.()
      }
      btn.addEventListener('pointerup', up)
      btn.addEventListener('pointercancel', up)
    }
    // tap buttons: one press each time
    for (const btn of this.el.querySelectorAll<HTMLElement>('[data-tap]')) {
      const action = btn.dataset.act as Action
      if (action === 'slide') hold(btn, action)
      else {
        btn.addEventListener('pointerdown', e => {
          e.preventDefault()
          btn.classList.add('down')
          this.input.touchPress(action)
        })
        const up = () => btn.classList.remove('down')
        btn.addEventListener('pointerup', up)
        btn.addEventListener('pointercancel', up)
      }
    }
    // fire: held while the finger is on it
    const fire = this.el.querySelector<HTMLElement>('[data-fire]')!
    hold(fire, 'fire')
    // scope: tap to look through the sight, tap again to come out
    const scope = this.el.querySelector<HTMLElement>('[data-scope]')!
    scope.addEventListener('pointerdown', e => {
      e.preventDefault()
      this.scoped = !this.scoped
      scope.classList.toggle('on', this.scoped)
      if (this.scoped) {
        this.input.touchHeld.add('ads')
        this.input.touchPress('ads')
      } else this.input.touchHeld.delete('ads')
    })
    this.el.querySelector<HTMLElement>('[data-pause]')!.addEventListener('pointerdown', e => {
      e.preventDefault()
      window.dispatchEvent(new Event('game:pause'))
    })
  }
}
