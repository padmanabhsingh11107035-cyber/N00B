import type { Action, Input } from '../engine/input'

/**
 * On-screen touch controls: a floating stick on the left, drag-to-look on the right and action
 * buttons for the hunt. Shown automatically on coarse pointers or after the first touch.
 */
const BUTTONS: { action: Action; label: string; cls: string }[] = [
  { action: 'attack', label: 'Slash', cls: 'b-attack' },
  { action: 'heavy', label: 'Heavy', cls: 'b-heavy' },
  { action: 'dodge', label: 'Roll', cls: 'b-dodge' },
  { action: 'grapple', label: 'Hook', cls: 'b-grapple' },
  { action: 'sprint', label: 'Sprint', cls: 'b-sprint' },
  { action: 'potion', label: 'Potion', cls: 'b-potion' },
  { action: 'interact', label: 'Use', cls: 'b-use' },
  { action: 'lockon', label: 'Lock', cls: 'b-lock' },
  { action: 'pause', label: 'II', cls: 'b-pause' },
]

export class TouchControls {
  private stickId: number | null = null
  private lookId: number | null = null
  private origin = { x: 0, y: 0 }
  private last = { x: 0, y: 0 }

  constructor(root: HTMLElement, canvas: HTMLCanvasElement, private readonly input: Input, private readonly active: () => boolean) {
    const layer = document.createElement('div')
    layer.className = 'touch'
    layer.innerHTML = `<div class="touch-stick"><i></i></div>${BUTTONS.map(b => `<button class="tbtn ${b.cls}" data-touch="${b.action}">${b.label}</button>`).join('')}`
    root.append(layer)
    const stick = layer.querySelector<HTMLElement>('.touch-stick')!
    const knob = stick.querySelector('i')!
    const radius = 56
    const enable = () => document.body.classList.add('has-touch')
    if (matchMedia('(pointer: coarse)').matches) enable()
    window.addEventListener('touchstart', enable, { once: true, passive: true })
    canvas.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'touch' || !this.active()) return
      if (e.clientX < innerWidth * 0.42 && this.stickId === null) {
        this.stickId = e.pointerId
        this.origin = { x: e.clientX, y: e.clientY }
        stick.style.left = `${e.clientX}px`
        stick.style.top = `${e.clientY}px`
        stick.classList.add('is-active')
      } else if (this.lookId === null) {
        this.lookId = e.pointerId
        this.last = { x: e.clientX, y: e.clientY }
      }
    })
    window.addEventListener('pointermove', e => {
      if (e.pointerId === this.stickId) {
        let dx = e.clientX - this.origin.x
        let dy = e.clientY - this.origin.y
        const len = Math.hypot(dx, dy)
        if (len > radius) {
          dx = (dx / len) * radius
          dy = (dy / len) * radius
        }
        knob.style.transform = `translate(${dx}px, ${dy}px)`
        this.input.setStick(dx / radius, -dy / radius)
      } else if (e.pointerId === this.lookId) {
        this.input.addLook((e.clientX - this.last.x) * 1.6, (e.clientY - this.last.y) * 1.6)
        this.last = { x: e.clientX, y: e.clientY }
      }
    })
    const end = (e: PointerEvent) => {
      if (e.pointerId === this.stickId) {
        this.stickId = null
        knob.style.transform = ''
        stick.classList.remove('is-active')
        this.input.setStick(0, 0)
      }
      if (e.pointerId === this.lookId) this.lookId = null
    }
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    for (const btn of layer.querySelectorAll<HTMLElement>('[data-touch]')) {
      const action = btn.dataset.touch as Action
      btn.addEventListener('pointerdown', e => {
        e.preventDefault()
        btn.setPointerCapture(e.pointerId)
        btn.classList.add('is-down')
        this.input.touchAction(action, true)
      })
      const up = () => {
        btn.classList.remove('is-down')
        this.input.touchAction(action, false)
      }
      btn.addEventListener('pointerup', up)
      btn.addEventListener('pointercancel', up)
    }
  }
}
