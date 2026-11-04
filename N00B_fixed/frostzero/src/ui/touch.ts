import type { Input } from '../engine/input'

/**
 * On-screen touch buttons: ◀ ▶ steer and BRAKE on the left thumb, JUMP and SLAM on the right.
 * Multi-touch safe (each button tracks its own pointers). Shown automatically on touch devices.
 */
export class TouchControls {
  private readonly held = new Map<string, Set<number>>()

  constructor(root: HTMLElement, private readonly input: Input) {
    const layer = root.querySelector<HTMLElement>('.touch')!
    const enable = () => document.body.classList.add('has-touch')
    if (matchMedia('(pointer: coarse)').matches) enable()
    window.addEventListener('touchstart', enable, { once: true, passive: true })
    window.addEventListener('pointerdown', e => {
      if (e.pointerType === 'touch') this.input.method = 'touch'
    }, { capture: true })

    for (const btn of layer.querySelectorAll<HTMLElement>('[data-touch]')) {
      const key = btn.dataset.touch!
      this.held.set(key, new Set())
      const down = (e: PointerEvent) => {
        e.preventDefault()
        try {
          btn.setPointerCapture(e.pointerId)
        } catch {
          // Synthetic or already-released pointers cannot be captured; the button still works.
        }
        this.held.get(key)!.add(e.pointerId)
        btn.classList.add('is-down')
        this.apply(key, true)
      }
      const up = (e: PointerEvent) => {
        const set = this.held.get(key)!
        if (!set.delete(e.pointerId)) return
        if (set.size === 0) {
          btn.classList.remove('is-down')
          this.apply(key, false)
        }
      }
      btn.addEventListener('pointerdown', down)
      btn.addEventListener('pointerup', up)
      btn.addEventListener('pointercancel', up)
      btn.addEventListener('lostpointercapture', up)
      btn.addEventListener('contextmenu', e => e.preventDefault())
    }
  }

  private isHeld(key: string): boolean {
    return (this.held.get(key)?.size ?? 0) > 0
  }

  private apply(key: string, down: boolean): void {
    if (key === 'jump') this.input.setTouchButton('jump', down)
    else if (key === 'slam') this.input.setTouchButton('sprint', down)
    else {
      const x = (this.isHeld('right') ? 1 : 0) - (this.isHeld('left') ? 1 : 0)
      const y = this.isHeld('brake') ? -1 : 0
      this.input.setTouchMove(x, y)
    }
  }
}
