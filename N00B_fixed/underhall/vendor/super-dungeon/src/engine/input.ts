/**
 * Unified input: keyboard + mouse (pointer lock), gamepad and touch all feed one action state.
 * Gameplay reads `move`, `look` and `held()/consume()`; it never checks raw keys.
 */
export type Action = 'attack' | 'bolt' | 'dash' | 'jump' | 'sprint' | 'nova' | 'interact' | 'map' | 'pause' | 'confirm' | 'back'
export type InputMethod = 'keyboard' | 'gamepad' | 'touch'

const KEY_BINDINGS: Record<Action, string[]> = {
  attack: ['KeyJ'],
  bolt: ['KeyK'],
  dash: ['KeyC'],
  jump: ['Space'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  nova: ['KeyQ'],
  interact: ['KeyE', 'KeyF'],
  map: ['Tab', 'KeyM'],
  pause: ['Escape', 'KeyP'],
  confirm: ['Enter', 'NumpadEnter'],
  back: [],
}
const MOVE_KEYS = { up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'] }
// Standard mapping: A=0 B=1 X=2 Y=3 LB=4 RB=5 LT=6 RT=7 View=8 Start=9.
const PAD_BINDINGS: Record<Action, number[]> = { attack: [2, 7], bolt: [5, 6], dash: [1], jump: [0], sprint: [10], nova: [4], interact: [3], map: [8], pause: [9], confirm: [0], back: [1] }

export class Input {
  readonly move = { x: 0, y: 0 }
  readonly look = { x: 0, y: 0 }
  method: InputMethod = 'keyboard'
  sensitivity = 1
  invertY = false
  /** When false (menus), mouse buttons don't queue attacks. */
  gameplay = false
  /** Pointer lock was refused (e.g. inside a sandboxed iframe): fall back to drag-to-look. */
  lockFailed = false
  private clickLock = false
  private keys = new Set<string>()
  private mouse = new Set<Action>()
  private held_ = new Set<Action>()
  private pressed_ = new Set<Action>()
  private touchMove = { x: 0, y: 0 }
  private touchButtons = new Set<Action>()
  private padPrev = new Set<Action>()

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', e => {
      const typing = (e.target as HTMLElement | null)?.matches?.('input, textarea')
      if (typing) return
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault()
      if (e.repeat) return
      this.keys.add(e.code)
      this.method = 'keyboard'
      for (const [action, codes] of Object.entries(KEY_BINDINGS) as [Action, string[]][]) if (codes.includes(e.code)) this.pressed_.add(action)
    })
    window.addEventListener('keyup', e => this.keys.delete(e.code))
    window.addEventListener('blur', () => {
      this.keys.clear()
      this.mouse.clear()
    })
    const mouseAction = (b: number): Action | null => (b === 0 ? 'attack' : b === 2 ? 'bolt' : null)
    document.addEventListener('pointerlockerror', () => {
      // Programmatic re-locks can fail transiently (browser cooldown); only a refused click counts.
      if (this.clickLock) this.lockFailed = true
      this.clickLock = false
    })
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement === canvas) this.lockFailed = false
      this.clickLock = false
    })
    window.addEventListener('mousedown', e => {
      const a = mouseAction(e.button)
      if (!a || !this.gameplay) return
      if (document.pointerLockElement !== canvas) {
        if (e.target !== canvas) return
        if (!this.lockFailed) {
          // First click captures the mouse instead of attacking.
          this.clickLock = true
          this.lockPointer()
          return
        }
      }
      this.method = 'keyboard'
      this.mouse.add(a)
      this.pressed_.add(a)
    })
    window.addEventListener('mouseup', e => {
      const a = mouseAction(e.button)
      if (a) this.mouse.delete(a)
    })
    canvas.addEventListener('contextmenu', e => e.preventDefault())
    window.addEventListener('mousemove', e => {
      if (document.pointerLockElement !== canvas) {
        // Fallback when pointer lock is unavailable: hold a mouse button and drag to look.
        if (!this.lockFailed || !this.gameplay || !e.buttons || e.target !== canvas) return
      }
      this.look.x += e.movementX * 0.0022
      this.look.y += e.movementY * 0.0022
    })
  }

  lockPointer(): void {
    if (this.method !== 'touch' && document.pointerLockElement !== this.canvas) {
      try {
        const p = this.canvas.requestPointerLock?.() as unknown as Promise<void> | undefined
        p?.catch?.(() => {
          if (this.clickLock) this.lockFailed = true
          this.clickLock = false
        })
      } catch {
        if (this.clickLock) this.lockFailed = true
        this.clickLock = false
      }
    }
  }
  unlockPointer(): void {
    if (document.pointerLockElement) document.exitPointerLock()
    this.mouse.clear()
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
  /** Sample continuous sources once per rendered frame. */
  update(): void {
    const k = (codes: string[]) => codes.some(code => this.keys.has(code))
    let x = (k(MOVE_KEYS.right) ? 1 : 0) - (k(MOVE_KEYS.left) ? 1 : 0)
    let y = (k(MOVE_KEYS.up) ? 1 : 0) - (k(MOVE_KEYS.down) ? 1 : 0)
    this.held_.clear()
    for (const [action, codes] of Object.entries(KEY_BINDINGS) as [Action, string[]][]) if (k(codes)) this.held_.add(action)
    for (const a of this.mouse) this.held_.add(a)
    for (const a of this.touchButtons) this.held_.add(a)
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
      if (lx || ly || rx || ry || pad.buttons.some(b => b.pressed)) this.method = 'gamepad'
      if (lx || ly) {
        x = lx
        y = -ly
      }
      this.look.x += rx * 0.05
      this.look.y += ry * 0.04
      const now = new Set<Action>()
      for (const [action, buttons] of Object.entries(PAD_BINDINGS) as [Action, number[]][]) if (buttons.some(i => pad.buttons[i]?.pressed)) now.add(action)
      for (const action of now) {
        this.held_.add(action)
        if (!this.padPrev.has(action)) this.pressed_.add(action)
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
  consume(action: Action): boolean {
    return this.pressed_.delete(action)
  }
  takeLook(): { x: number; y: number } {
    const out = { x: this.look.x * this.sensitivity, y: this.look.y * this.sensitivity * (this.invertY ? -1 : 1) }
    this.look.x = 0
    this.look.y = 0
    return out
  }
  clearPresses(): void {
    this.pressed_.clear()
  }
}
