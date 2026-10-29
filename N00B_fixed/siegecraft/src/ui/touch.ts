import type { Input } from '../engine/input'

/**
 * On-screen controls for phones/tablets (landscape): a virtual stick for angle/direction and a
 * hold-to-charge FIRE button. Dragging on the 3D view also aims (slingshot), like the mouse.
 * Shown only on touch devices; nothing here uses device sensors.
 */
export class TouchControls {
  private stick: HTMLElement
  private knob: HTMLElement
  private fire: HTMLElement
  private stickId = -1
  private center = { x: 0, y: 0 }

  constructor(host: HTMLElement, private readonly input: Input, private readonly active: () => boolean, label: () => string) {
    const wrap = document.createElement('div')
    wrap.className = 'touch'
    wrap.innerHTML = `<div class="stick"><div class="ring"></div><div class="knob"></div><span class="arr u"></span><span class="arr d"></span><span class="arr l"></span><span class="arr r"></span></div><button class="fire-btn"><span></span></button>`
    host.appendChild(wrap)
    this.stick = wrap.querySelector('.stick')!
    this.knob = wrap.querySelector('.knob')!
    this.fire = wrap.querySelector('.fire-btn')!
    const setLabel = () => (this.fire.querySelector('span')!.textContent = label())
    setLabel()
    new MutationObserver(setLabel).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] })
    const coarse = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window
    document.body.classList.toggle('touch-device', coarse)
    window.addEventListener('pointerdown', e => {
      if (e.pointerType === 'touch') document.body.classList.add('touch-device')
      else if (e.pointerType === 'mouse') document.body.classList.remove('touch-device')
    }, { capture: true })

    this.stick.addEventListener('pointerdown', e => {
      if (!this.active()) return
      e.preventDefault()
      e.stopPropagation()
      this.stickId = e.pointerId
      const r = this.stick.getBoundingClientRect()
      this.center = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
      this.stick.setPointerCapture(e.pointerId)
      this.moveStick(e.clientX, e.clientY)
    })
    this.stick.addEventListener('pointermove', e => {
      if (e.pointerId === this.stickId) this.moveStick(e.clientX, e.clientY)
    })
    const endStick = (e: PointerEvent) => {
      if (e.pointerId !== this.stickId) return
      this.stickId = -1
      this.knob.style.transform = ''
      this.input.setTouchMove(0, 0)
    }
    this.stick.addEventListener('pointerup', endStick)
    this.stick.addEventListener('pointercancel', endStick)

    const press = (down: boolean) => (e: PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (down && !this.active()) return
      this.fire.classList.toggle('down', down)
      this.input.setTouchButton('fire', down)
    }
    this.fire.addEventListener('pointerdown', press(true))
    this.fire.addEventListener('pointerup', press(false))
    this.fire.addEventListener('pointercancel', press(false))
    this.fire.addEventListener('pointerleave', press(false))
    this.fire.addEventListener('contextmenu', e => e.preventDefault())
  }

  private moveStick(x: number, y: number): void {
    const max = this.stick.clientWidth * 0.36
    let dx = x - this.center.x
    let dy = y - this.center.y
    const len = Math.hypot(dx, dy)
    if (len > max) {
      dx = (dx / len) * max
      dy = (dy / len) * max
    }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`
    const nx = dx / max
    const ny = -dy / max
    const dead = (v: number) => (Math.abs(v) < 0.12 ? 0 : v)
    this.input.setTouchMove(dead(nx), dead(ny))
  }
}
