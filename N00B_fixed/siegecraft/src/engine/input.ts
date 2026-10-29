/**
 * Unified input: keyboard, mouse, gamepad and touch all feed one action/axis state.
 * Gameplay reads `move`, `look`, `trigger`, drag gestures and `pressed()/held()`; it never
 * checks raw keys or pointer events.
 *
 *  - `move`   : digital/analog aim axis (WASD/arrows, left stick, on-screen stick), [-1, 1].
 *  - `look`   : camera orbit delta (right stick, right-mouse drag), consumed with `takeLook()`.
 *  - `trigger`: analog charge value 0..1 (gamepad right trigger).
 *  - drag     : primary-pointer drag on the canvas (mouse left button or a finger), with
 *               start/end edges consumed via `takeDragStart()` / `takeDragEnd()`.
 *  - wheel    : accumulated scroll, consumed with `takeWheel()`.
 *
 * Call `update()` once per rendered frame before gameplay reads input and `endFrame()` after.
 */
export type Action = 'fire' | 'cancel' | 'view' | 'pause' | 'confirm' | 'back' | 'restart'
export type InputMethod = 'keyboard' | 'gamepad' | 'touch'

const KEY_BINDINGS: Record<Action, string[]> = {
  fire: ['Space'],
  cancel: ['KeyX', 'Backspace'],
  view: ['KeyV', 'Tab'],
  pause: ['Escape', 'KeyP'],
  confirm: ['Enter', 'NumpadEnter'],
  // Menus handle Escape/Backspace themselves via DOM keydown; `back` is the gamepad B button.
  back: [],
  restart: ['KeyR'],
}

const MOVE_KEYS = { up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'] }

// Standard gamepad mapping: A=0, B=1, X=2, Y=3, LB=4, RB=5, LT=6, RT=7, Back=8, Start=9.
const PAD_BINDINGS: Record<Action, number[]> = { fire: [0], cancel: [1], view: [3], pause: [9], confirm: [0], back: [1], restart: [8] }

export type Drag = {
  active: boolean
  pointerType: string
  startX: number
  startY: number
  x: number
  y: number
  /** Seconds since the drag began (performance clock). */
  startedAt: number
}

export class Input {
  readonly move = { x: 0, y: 0 }
  readonly look = { x: 0, y: 0 }
  /** Right trigger 0..1. */
  trigger = 0
  method: InputMethod = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 'touch' : 'keyboard'
  /** Multiplies aim and look rates; settings screen writes it. */
  sensitivity = 1
  readonly drag: Drag = { active: false, pointerType: 'mouse', startX: 0, startY: 0, x: 0, y: 0, startedAt: 0 }
  private dragStarted = false
  private dragEnded: Drag | null = null
  private dragId = -1
  private orbitId = -1
  private orbitLast = { x: 0, y: 0 }
  private wheel = 0
  private keys = new Set<string>()
  private held_ = new Set<Action>()
  private pressed_ = new Set<Action>()
  private touchMove = { x: 0, y: 0 }
  private touchButtons = new Set<Action>()
  private padPrev = new Set<Action>()
  private padConnected = false
  private listeners: Array<() => void> = []

  constructor(readonly canvas: HTMLCanvasElement) {
    const on = <K extends keyof WindowEventMap>(target: Window | HTMLElement, type: K, fn: (e: WindowEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      target.addEventListener(type, fn as EventListener, opts)
      this.listeners.push(() => target.removeEventListener(type, fn as EventListener, opts))
    }
    on(window, 'keydown', e => {
      const typing = (e.target as HTMLElement | null)?.matches?.('input, textarea')
      if (typing) return
      if (!e.repeat) {
        this.keys.add(e.code)
        this.method = 'keyboard'
        for (const [action, codes] of Object.entries(KEY_BINDINGS) as [Action, string[]][]) if (codes.includes(e.code)) this.pressed_.add(action)
      }
      // Keep the page from scrolling or moving focus.
      if (e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'Tab') e.preventDefault()
    })
    on(window, 'keyup', e => this.keys.delete(e.code))
    on(window, 'blur', () => {
      this.keys.clear()
      this.endDrag(true)
    })
    on(canvas, 'contextmenu', e => e.preventDefault())
    on(canvas, 'pointerdown', e => {
      this.method = e.pointerType === 'touch' ? 'touch' : 'keyboard'
      if (e.button === 2) {
        // Right button: cancel a charge, or orbit the camera while held.
        this.pressed_.add('cancel')
        this.orbitId = e.pointerId
        this.orbitLast = { x: e.clientX, y: e.clientY }
        canvas.setPointerCapture?.(e.pointerId)
        return
      }
      if (e.button !== 0 || this.drag.active) return
      this.dragId = e.pointerId
      Object.assign(this.drag, { active: true, pointerType: e.pointerType, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, startedAt: performance.now() / 1000 })
      this.dragStarted = true
      this.dragEnded = null
      canvas.setPointerCapture?.(e.pointerId)
      e.preventDefault()
    })
    on(canvas, 'pointermove', e => {
      if (e.pointerId === this.dragId && this.drag.active) {
        this.drag.x = e.clientX
        this.drag.y = e.clientY
      } else if (e.pointerId === this.orbitId) {
        this.look.x += (e.clientX - this.orbitLast.x) * 0.005
        this.look.y += (e.clientY - this.orbitLast.y) * 0.005
        this.orbitLast = { x: e.clientX, y: e.clientY }
      }
    })
    const up = (e: PointerEvent) => {
      if (e.pointerId === this.orbitId) this.orbitId = -1
      if (e.pointerId !== this.dragId) return
      this.drag.x = e.clientX
      this.drag.y = e.clientY
      this.endDrag(e.type === 'pointercancel')
    }
    on(canvas, 'pointerup', up)
    on(canvas, 'pointercancel', up)
    on(canvas, 'wheel', e => {
      this.wheel += e.deltaY
      e.preventDefault()
    }, { passive: false })
  }

  private endDrag(cancelled: boolean): void {
    if (!this.drag.active) return
    this.drag.active = false
    this.dragId = -1
    this.dragEnded = cancelled ? null : { ...this.drag }
    if (cancelled) this.pressed_.add('cancel')
  }

  /** Abort the current drag without producing an end event (e.g. menus opened). */
  cancelDrag(): void {
    this.drag.active = false
    this.dragId = -1
    this.dragStarted = false
    this.dragEnded = null
  }

  /** True once when a new primary drag began. */
  takeDragStart(): Drag | null {
    if (!this.dragStarted) return null
    this.dragStarted = false
    return this.drag
  }

  /** Final drag state once when the primary pointer was released. */
  takeDragEnd(): Drag | null {
    const d = this.dragEnded
    this.dragEnded = null
    return d
  }

  takeWheel(): number {
    const w = this.wheel
    this.wheel = 0
    return w
  }

  /** Touch controls feed these from the on-screen joystick and buttons. */
  setTouchMove(x: number, y: number): void {
    this.method = 'touch'
    this.touchMove.x = x
    this.touchMove.y = y
  }

  addTouchLook(dx: number, dy: number): void {
    this.method = 'touch'
    this.look.x += dx * 0.006
    this.look.y += dy * 0.006
  }

  setTouchButton(action: Action, down: boolean): void {
    this.method = 'touch'
    if (down && !this.touchButtons.has(action)) this.pressed_.add(action)
    if (down) this.touchButtons.add(action)
    else this.touchButtons.delete(action)
  }

  get gamepadConnected(): boolean {
    return this.padConnected
  }

  /** Sample continuous sources. Call once per rendered frame before gameplay reads input. */
  update(): void {
    const k = (codes: string[]) => codes.some(code => this.keys.has(code))
    let x = (k(MOVE_KEYS.right) ? 1 : 0) - (k(MOVE_KEYS.left) ? 1 : 0)
    let y = (k(MOVE_KEYS.up) ? 1 : 0) - (k(MOVE_KEYS.down) ? 1 : 0)
    this.held_.clear()
    for (const [action, codes] of Object.entries(KEY_BINDINGS) as [Action, string[]][]) if (k(codes)) this.held_.add(action)
    for (const action of this.touchButtons) this.held_.add(action)
    if (this.touchMove.x !== 0 || this.touchMove.y !== 0) {
      x = this.touchMove.x
      y = this.touchMove.y
    }
    this.trigger = 0
    const pad = navigator.getGamepads?.().find(p => p && p.connected)
    this.padConnected = !!pad
    if (pad) {
      const dead = (v: number) => (Math.abs(v) < 0.16 ? 0 : (v - Math.sign(v) * 0.16) / 0.84)
      const lx = dead(pad.axes[0] ?? 0)
      const ly = dead(pad.axes[1] ?? 0)
      const rx = dead(pad.axes[2] ?? 0)
      const ry = dead(pad.axes[3] ?? 0)
      const rt = pad.buttons[7]?.value ?? 0
      const padActive = lx !== 0 || ly !== 0 || rx !== 0 || ry !== 0 || rt > 0.1 || pad.buttons.some(b => b.pressed)
      if (padActive) this.method = 'gamepad'
      if (lx !== 0 || ly !== 0) {
        x = lx
        y = -ly
      }
      this.look.x += rx * 0.04
      this.look.y += ry * 0.04
      this.trigger = rt < 0.06 ? 0 : rt
      const now = new Set<Action>()
      for (const [action, buttons] of Object.entries(PAD_BINDINGS) as [Action, number[]][]) if (buttons.some(i => pad.buttons[i]?.pressed)) now.add(action)
      for (const action of now) {
        this.held_.add(action)
        if (!this.padPrev.has(action)) this.pressed_.add(action)
      }
      this.padPrev = now
    }
    this.move.x = Math.max(-1, Math.min(1, x))
    this.move.y = Math.max(-1, Math.min(1, y))
  }

  held(action: Action): boolean {
    return this.held_.has(action)
  }

  /** True once per physical press (for per-frame UI checks). */
  pressed(action: Action): boolean {
    return this.pressed_.has(action)
  }

  /** Read and clear a press. Use inside fixed simulation steps so a press triggers exactly once. */
  consume(action: Action): boolean {
    return this.pressed_.delete(action)
  }

  /** Consume the look delta with sensitivity applied. */
  takeLook(): { x: number; y: number } {
    const out = { x: this.look.x * this.sensitivity, y: this.look.y * this.sensitivity }
    this.look.x = 0
    this.look.y = 0
    return out
  }

  endFrame(): void {
    this.pressed_.clear()
  }

  dispose(): void {
    for (const off of this.listeners) off()
    this.listeners = []
  }
}
