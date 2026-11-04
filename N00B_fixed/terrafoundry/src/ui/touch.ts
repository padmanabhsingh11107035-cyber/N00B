import type { Action, Input } from '../engine/input'

/** On-screen controls for touch devices: left stick, right-side look drag and action buttons. */
export class TouchControls {
  readonly el: HTMLElement
  constructor(root: HTMLElement, input: Input, handlers: { inventory(): void; pause(): void; map(): void }) {
    const el = document.createElement('div')
    el.className = 'touch hidden'
    el.innerHTML = `
      <div class="t-look"></div>
      <div class="t-stick"><div class="t-knob"></div></div>
      <div class="t-buttons">
        <button data-a="primary" class="t-big t-mine">MINE</button>
        <button data-a="secondary" class="t-big t-use">USE</button>
        <button data-a="jump" class="t-mid t-jump">JUMP</button>
        <button data-a="sprint" class="t-small t-sprint">RUN</button>
        <button data-a="rotate" class="t-small t-rot">ROTATE</button>
        <button data-a="descend" class="t-small t-down">DOWN</button>
      </div>
      <div class="t-top"><button data-u="map"><img src="./assets/icons/hud_map.webp" alt="">MAP</button><button data-u="inventory"><img src="./assets/icons/hud_chest.webp" alt="">PACK</button><button data-u="pause">II</button></div>`
    root.append(el)
    this.el = el
    const stick = el.querySelector('.t-stick') as HTMLElement
    const knob = el.querySelector('.t-knob') as HTMLElement
    let stickId: number | null = null
    let cx = 0
    let cy = 0
    stick.addEventListener('pointerdown', e => {
      stickId = e.pointerId
      stick.setPointerCapture(e.pointerId)
      const r = stick.getBoundingClientRect()
      cx = r.left + r.width / 2
      cy = r.top + r.height / 2
    })
    stick.addEventListener('pointermove', e => {
      if (e.pointerId !== stickId) return
      const max = 48
      let dx = e.clientX - cx
      let dy = e.clientY - cy
      const len = Math.hypot(dx, dy)
      if (len > max) {
        dx = (dx / len) * max
        dy = (dy / len) * max
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`
      input.setTouchMove(dx / max, -dy / max)
    })
    const endStick = (e: PointerEvent) => {
      if (e.pointerId !== stickId) return
      stickId = null
      knob.style.transform = ''
      input.setTouchMove(0, 0)
    }
    stick.addEventListener('pointerup', endStick)
    stick.addEventListener('pointercancel', endStick)

    const look = el.querySelector('.t-look') as HTMLElement
    const lastPos = new Map<number, { x: number; y: number }>()
    look.addEventListener('pointerdown', e => {
      look.setPointerCapture(e.pointerId)
      lastPos.set(e.pointerId, { x: e.clientX, y: e.clientY })
    })
    look.addEventListener('pointermove', e => {
      const p = lastPos.get(e.pointerId)
      if (!p) return
      input.addTouchLook(e.clientX - p.x, e.clientY - p.y)
      p.x = e.clientX
      p.y = e.clientY
    })
    const endLook = (e: PointerEvent) => lastPos.delete(e.pointerId)
    look.addEventListener('pointerup', endLook)
    look.addEventListener('pointercancel', endLook)

    el.querySelectorAll<HTMLButtonElement>('[data-a]').forEach(b => {
      const a = b.dataset.a as Action
      const toggle = a === 'sprint'
      b.addEventListener('pointerdown', e => {
        e.preventDefault()
        b.setPointerCapture(e.pointerId)
        if (toggle) {
          const on = !b.classList.contains('on')
          b.classList.toggle('on', on)
          input.setTouchButton(a, on)
          return
        }
        b.classList.add('on')
        input.setTouchButton(a, true)
      })
      const up = () => {
        if (toggle) return
        b.classList.remove('on')
        input.setTouchButton(a, false)
      }
      b.addEventListener('pointerup', up)
      b.addEventListener('pointercancel', up)
    })
    el.querySelector('[data-u="inventory"]')!.addEventListener('click', () => handlers.inventory())
    el.querySelector('[data-u="pause"]')!.addEventListener('click', () => handlers.pause())
    el.querySelector('[data-u="map"]')!.addEventListener('click', () => handlers.map())
  }

  setVisible(on: boolean): void {
    this.el.classList.toggle('hidden', !on)
  }
}
