/**
 * Unified input for a lane runner: keyboard, gamepad and pointer drag (mouse or touch) all feed
 * one steering state. Gameplay reads `steer` (continuous, -1..1) and `takeDrag()` (metres of
 * direct drag), plus edge-triggered actions via `consume()`.
 */
export type Action = 'pause' | 'confirm' | 'mute' | 'grenade' | 'medkit'
export type InputMethod = 'keyboard' | 'gamepad' | 'touch'

const KEY_BINDINGS: Record<Action, string[]> = {
  pause: ['Escape', 'KeyP'],
  confirm: ['Enter', 'NumpadEnter', 'Space'],
  mute: ['KeyM'],
  grenade: ['KeyQ', 'KeyG'],
  medkit: ['KeyE', 'KeyH'],
}
const LEFT = ['KeyA', 'ArrowLeft']
const RIGHT = ['KeyD', 'ArrowRight']
const PAD_BINDINGS: Record<Action, number[]> = { pause: [9], confirm: [0], mute: [8], grenade: [2, 4], medkit: [3, 5] }

export class Input {
  /** Continuous steering in [-1, 1] from keys or stick. */
  steer = 0
  method: InputMethod = 'keyboard'
  /** True while a pointer drag is steering. */
  dragging = false
  private keys = new Set<string>()
  private pressed_ = new Set<Action>()
  private padPrev = new Set<Action>()
  private dragPx = 0
  private dragId: number | null = null
  private lastX = 0
  private listeners: Array<() => void> = []

  constructor(surface: HTMLElement, private readonly active: () => boolean) {
    const on = <K extends keyof WindowEventMap>(target: Window | HTMLElement, type: K, fn: (e: WindowEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      target.addEventListener(type, fn as EventListener, opts)
      this.listeners.push(() => target.removeEventListener(type, fn as EventListener, opts))
    }
    on(window, 'keydown', e => {
      const typing = (e.target as HTMLElement | null)?.matches?.('input, textarea')
      if (typing) return
      if (!e.repeat) {
        for (const [action, codes] of Object.entries(KEY_BINDINGS) as [Action, string[]][]) if (codes.includes(e.code)) this.pressed_.add(action)
      }
      this.keys.add(e.code)
      this.method = 'keyboard'
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault()
    })
    on(window, 'keyup', e => this.keys.delete(e.code))
    on(window, 'blur', () => {
      this.keys.clear()
      this.endDrag()
    })
    on(surface, 'pointerdown', e => {
      if (!this.active() || this.dragId !== null) return
      if ((e.target as HTMLElement).closest('button, input, [data-no-drag]')) return
      this.dragId = e.pointerId
      this.lastX = e.clientX
      this.dragging = true
      if (e.pointerType === 'touch') this.method = 'touch'
      surface.setPointerCapture?.(e.pointerId)
    })
    on(window, 'pointermove', e => {
      if (e.pointerId !== this.dragId) return
      this.dragPx += e.clientX - this.lastX
      this.lastX = e.clientX
    })
    const end = (e: PointerEvent) => {
      if (e.pointerId === this.dragId) this.endDrag()
    }
    on(window, 'pointerup', end)
    on(window, 'pointercancel', end)
    on(window, 'pointerdown', e => {
      if (e.pointerType === 'touch') this.method = 'touch'
      else if (this.method === 'touch') this.method = 'keyboard'
    }, { capture: true })
  }

  private endDrag(): void {
    this.dragId = null
    this.dragging = false
  }

  /** Sample continuous sources. Call once per rendered frame before gameplay reads input. */
  update(): void {
    const k = (codes: string[]) => codes.some(code => this.keys.has(code))
    let x = (k(RIGHT) ? 1 : 0) - (k(LEFT) ? 1 : 0)
    const pad = navigator.getGamepads?.().find(p => p && p.connected)
    if (pad) {
      const lx = Math.abs(pad.axes[0] ?? 0) < 0.18 ? 0 : pad.axes[0]
      const dpad = (pad.buttons[15]?.pressed ? 1 : 0) - (pad.buttons[14]?.pressed ? 1 : 0)
      if (lx !== 0 || dpad !== 0 || pad.buttons.some(b => b.pressed)) this.method = 'gamepad'
      if (lx !== 0) x = lx
      else if (dpad !== 0) x = dpad
      const now = new Set<Action>()
      for (const [action, buttons] of Object.entries(PAD_BINDINGS) as [Action, number[]][]) if (buttons.some(i => pad.buttons[i]?.pressed)) now.add(action)
      for (const action of now) if (!this.padPrev.has(action)) this.pressed_.add(action)
      this.padPrev = now
    }
    this.steer = Math.max(-1, Math.min(1, x))
  }

  /** Pixels dragged since the last call. */
  takeDrag(): number {
    const d = this.dragPx
    this.dragPx = 0
    return d
  }

  consume(action: Action): boolean {
    return this.pressed_.delete(action)
  }

  clear(): void {
    this.pressed_.clear()
    this.dragPx = 0
  }

  dispose(): void {
    for (const off of this.listeners) off()
    this.listeners = []
  }
}
