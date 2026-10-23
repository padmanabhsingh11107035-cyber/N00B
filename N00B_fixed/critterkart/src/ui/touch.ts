import type { Action, Input } from '../engine/input'
import type { I18n } from '../engine/i18n'

/**
 * Landscape touch controls: a horizontal steering stick on the left and DRIFT / ITEM / BRAKE
 * buttons on the right. Everything feeds the unified Input so gameplay code is unaware of touch.
 * No gyro or other phone-only APIs.
 */
export class TouchControls {
  private readonly el: HTMLElement
  private readonly steerButtons = new Set<'left' | 'right'>()

  constructor(root: HTMLElement, private readonly input: Input, private readonly i18n: I18n, private readonly active: () => boolean) {
    this.el = document.createElement('div')
    this.el.className = 'touch'
    this.el.innerHTML = `
      <div class="tbtns-drive" aria-label="Driving controls">
        <button class="tbtn tbtn-forward" data-a="accelerate"><b>▲</b><span data-l="touch.forward"></span></button>
        <button class="tbtn tbtn-backward" data-a="brake"><b>▼</b><span data-l="touch.backward"></span></button>
      </div>
      <div class="tbtns-steer" aria-label="Steering controls">
        <button class="tbtn tbtn-left" data-s="left"><b>◀</b><span data-l="touch.left"></span></button>
        <button class="tbtn tbtn-right" data-s="right"><b>▶</b><span data-l="touch.right"></span></button>
      </div>
      <div class="tbtns-actions">
        <button class="tbtn tbtn-item" data-a="item"><span data-l="touch.item"></span></button>
        <button class="tbtn tbtn-drift" data-a="drift"><span data-l="touch.drift"></span></button>
      </div>`
    root.appendChild(this.el)
    for (const btn of this.el.querySelectorAll<HTMLElement>('[data-a]')) {
      const action = btn.dataset.a as Action
      const down = (e: PointerEvent) => {
        e.preventDefault()
        btn.setPointerCapture(e.pointerId)
        btn.classList.add('down')
        this.input.setTouchButton(action, true)
      }
      const up = () => {
        btn.classList.remove('down')
        this.input.setTouchButton(action, false)
      }
      btn.addEventListener('pointerdown', down)
      btn.addEventListener('pointerup', up)
      btn.addEventListener('pointercancel', up)
      btn.addEventListener('contextmenu', e => e.preventDefault())
    }
    for (const btn of this.el.querySelectorAll<HTMLElement>('[data-s]')) {
      const direction = btn.dataset.s as 'left' | 'right'
      const down = (e: PointerEvent) => {
        e.preventDefault()
        btn.setPointerCapture(e.pointerId)
        btn.classList.add('down')
        this.steerButtons.add(direction)
        this.updateSteer()
      }
      const up = () => {
        btn.classList.remove('down')
        this.steerButtons.delete(direction)
        this.updateSteer()
      }
      btn.addEventListener('pointerdown', down)
      btn.addEventListener('pointerup', up)
      btn.addEventListener('pointercancel', up)
      btn.addEventListener('contextmenu', e => e.preventDefault())
    }
    this.relabel()
    i18n.onChange(() => this.relabel())
    const coarse = matchMedia('(pointer: coarse)')
    const mark = () => document.body.classList.toggle('touch-device', coarse.matches || this.input.method === 'touch')
    mark()
    coarse.addEventListener?.('change', mark)
    window.addEventListener('touchstart', () => document.body.classList.add('touch-device'), { passive: true })
    const tick = () => {
      this.el.classList.toggle('on', this.active())
      requestAnimationFrame(tick)
    }
    tick()
  }

  private relabel(): void {
    for (const el of this.el.querySelectorAll<HTMLElement>('[data-l]')) el.textContent = this.i18n.t(el.dataset.l!)
  }

  private updateSteer(): void {
    const steer = this.steerButtons.has('right') ? 1 : this.steerButtons.has('left') ? -1 : 0
    this.input.setTouchSteer(steer)
  }
}
