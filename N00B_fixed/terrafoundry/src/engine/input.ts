/**
 * Unified input: keyboard + mouse (pointer lock), gamepad and touch all feed one action state.
 * Gameplay reads `move`, `look`, `held()/consume()`, hotbar selection and the scroll wheel.
 */
export type Action = 'jump' | 'sprint' | 'pause' | 'primary' | 'secondary' | 'inventory' | 'map' | 'rotate' | 'fly' | 'descend' | 'prev' | 'next'
export type InputMethod = 'keyboard' | 'gamepad' | 'touch'

const KEY_BINDINGS: Record<Action, string[]> = {
  jump: ['Space'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  pause: ['Escape', 'KeyP'],
  primary: ['Mouse0'],
  secondary: ['Mouse2'],
  inventory: ['KeyE', 'Tab'],
  map: ['KeyM'],
  rotate: ['KeyR'],
  fly: ['KeyF'],
  descend: ['ControlLeft', 'KeyC'],
  prev: [],
  next: [],
}
const MOVE_KEYS = { up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'] }
// Standard gamepad: A=0 B=1 X=2 Y=3 LB=4 RB=5 LT=6 RT=7 Back=8 Start=9 L3=10 R3=11.
const PAD_BINDINGS: Record<Action, number[]> = {
  jump: [0], sprint: [10], pause: [9], primary: [7], secondary: [6], inventory: [3], map: [8], rotate: [2], fly: [11], descend: [1], prev: [4], next: [5],
}

export class Input {
  readonly move = { x: 0, y: 0 }
  readonly look = { x: 0, y: 0 }
  method: InputMethod = 'keyboard'
  sensitivity = 1
  invertY = false
  /** Hotbar slot chosen with number keys since the last read (0-based) or null. */
  slot: number | null = null
  /** Accumulated wheel steps since the last read (positive = next). */
  wheel = 0
  /** Pointer lock unavailable (e.g. sandboxed iframe): mouse buttons act on the canvas and dragging looks. */
  freeLook = false
  private keys = new Set<string>()
  private held_ = new Set<Action>()
  private pressed_ = new Set<Action>()
  private touchMove = { x: 0, y: 0 }
  private touchButtons = new Set<Action>()
  private padPrev = new Set<Action>()
  private listeners: Array<() => void> = []

  constructor(private readonly canvas: HTMLCanvasElement) {
    const on = <K extends keyof WindowEventMap>(target: Window | Document, type: K, fn: (e: WindowEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      target.addEventListener(type, fn as EventListener, opts)
      this.listeners.push(() => target.removeEventListener(type, fn as EventListener, opts))
    }
    const typing = (e: Event) => !!(e.target as HTMLElement | null)?.matches?.('input, textarea, select')
    on(window, 'keydown', e => {
      if (typing(e)) return
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow') || (e.ctrlKey && /^Key[WSADF]$/.test(e.code))) e.preventDefault()
      if (e.repeat) return
      this.keys.add(e.code)
      this.method = 'keyboard'
      for (const [action, codes] of Object.entries(KEY_BINDINGS) as [Action, string[]][]) {
        if (codes.includes(e.code)) this.pressed_.add(action)
      }
      const m = /^Digit([1-9])$/.exec(e.code)
      if (m) this.slot = Number(m[1]) - 1
    })
    on(window, 'keyup', e => this.keys.delete(e.code))
    on(window, 'blur', () => this.keys.clear())
    on(window, 'mousedown', e => {
      if (document.pointerLockElement !== canvas && !(this.freeLook && e.target === canvas)) return
      const code = `Mouse${e.button}`
      this.keys.add(code)
      this.method = 'keyboard'
      for (const [action, codes] of Object.entries(KEY_BINDINGS) as [Action, string[]][]) if (codes.includes(code)) this.pressed_.add(action)
    })
    on(window, 'mouseup', e => this.keys.delete(`Mouse${e.button}`))
    on(window, 'contextmenu', e => {
      if (document.pointerLockElement === canvas || e.target === canvas) e.preventDefault()
    })
    on(window, 'wheel', e => {
      if (document.pointerLockElement !== canvas && !(this.freeLook && e.target === canvas)) return
      this.wheel += Math.sign(e.deltaY)
    }, { passive: true })
    on(window, 'mousemove', e => {
      if (document.pointerLockElement !== canvas && !(this.freeLook && e.buttons && e.target === canvas)) return
      this.look.x += e.movementX * 0.0022
      this.look.y += e.movementY * 0.0022
    })
    on(document, 'pointerlockchange' as keyof WindowEventMap, () => {
      if (document.pointerLockElement !== canvas) {
        this.keys.delete('Mouse0')
        this.keys.delete('Mouse2')
      }
    })
  }

  get locked(): boolean {
    return document.pointerLockElement === this.canvas
  }

  lockPointer(): void {
    if (this.method !== 'touch' && document.pointerLockElement !== this.canvas) {
      this.canvas.requestPointerLock?.()?.catch?.(() => undefined)
    }
  }

  unlockPointer(): void {
    if (document.pointerLockElement) document.exitPointerLock()
  }

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

  /** Simulate a press (UI buttons, tests). */
  press(action: Action): void {
    this.pressed_.add(action)
  }

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
    const pad = navigator.getGamepads?.().find(p => p && p.connected)
    if (pad) {
      const dead = (v: number) => (Math.abs(v) < 0.18 ? 0 : v)
      const lx = dead(pad.axes[0] ?? 0)
      const ly = dead(pad.axes[1] ?? 0)
      const rx = dead(pad.axes[2] ?? 0)
      const ry = dead(pad.axes[3] ?? 0)
      const padActive = lx !== 0 || ly !== 0 || rx !== 0 || ry !== 0 || pad.buttons.some(b => b.pressed)
      if (padActive) this.method = 'gamepad'
      if (lx !== 0 || ly !== 0) {
        x = lx
        y = -ly
      }
      this.look.x += rx * 0.045
      this.look.y += ry * 0.045
      const now = new Set<Action>()
      for (const [action, buttons] of Object.entries(PAD_BINDINGS) as [Action, number[]][]) {
        if (buttons.some(i => pad.buttons[i]?.pressed)) now.add(action)
      }
      for (const action of now) {
        this.held_.add(action)
        if (!this.padPrev.has(action)) {
          this.pressed_.add(action)
          if (action === 'prev') this.wheel -= 1
          if (action === 'next') this.wheel += 1
        }
      }
      this.padPrev = now
    }
    const len = Math.hypot(x, y)
    this.move.x = len > 1 ? x / len : x
    this.move.y = len > 1 ? y / len : y
  }

  held(action: Action): boolean {
    return this.held_.has(action)
  }

  pressed(action: Action): boolean {
    return this.pressed_.has(action)
  }

  consume(action: Action): boolean {
    return this.pressed_.delete(action)
  }

  takeLook(): { x: number; y: number } {
    const out = { x: this.look.x * this.sensitivity, y: this.look.y * this.sensitivity * (this.invertY ? -1 : 1) }
    this.look.x = 0
    this.look.y = 0
    return out
  }

  takeSlot(): number | null {
    const s = this.slot
    this.slot = null
    return s
  }

  takeWheel(): number {
    const w = this.wheel
    this.wheel = 0
    return w
  }

  /** Forget held keys (e.g. when a menu opens). */
  releaseAll(): void {
    this.keys.clear()
    this.touchButtons.clear()
    this.touchMove.x = this.touchMove.y = 0
    this.pressed_.clear()
  }

  endFrame(): void {
    this.pressed_.clear()
  }

  dispose(): void {
    for (const off of this.listeners) off()
    this.listeners = []
  }
}
