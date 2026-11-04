/**
 * Unified input: keyboard + mouse (pointer lock), gamepad and on-screen touch controls all feed
 * the same named actions. Presses are buffered until consumed by the fixed simulation step.
 */
export type Action = 'attack' | 'heavy' | 'dodge' | 'sprint' | 'grapple' | 'interact' | 'potion' | 'lockon' | 'pause' | 'confirm' | 'back'
export type Device = 'keyboard' | 'gamepad' | 'touch'

export const KEY_BINDINGS: Record<Action, string[]> = {
  attack: ['Mouse0', 'KeyJ'],
  heavy: ['Mouse2', 'KeyK'],
  dodge: ['Space'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  grapple: ['KeyE', 'Mouse1'],
  interact: ['KeyF'],
  potion: ['KeyR'],
  lockon: ['KeyC', 'Tab'],
  pause: ['Escape', 'KeyP'],
  confirm: ['Enter'],
  back: ['Escape'],
}

/** Standard gamepad button indices. */
const PAD_BINDINGS: Record<Action, number[]> = {
  attack: [2],
  heavy: [3],
  dodge: [0],
  sprint: [4, 10],
  grapple: [5, 7],
  interact: [1],
  potion: [12],
  lockon: [11],
  pause: [9],
  confirm: [0],
  back: [1],
}

const ACTIONS = Object.keys(KEY_BINDINGS) as Action[]
const MOVE_KEYS: Record<string, [number, number]> = {
  KeyW: [0, 1], ArrowUp: [0, 1],
  KeyS: [0, -1], ArrowDown: [0, -1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
}

export class Input {
  private keys = new Set<string>()
  private pressed_ = new Set<Action>()
  private touchHeld = new Set<Action>()
  private padHeld = new Set<Action>()
  private padPrev: boolean[] = []
  private look = { x: 0, y: 0 }
  private stick = { x: 0, y: 0 }
  private padMove = { x: 0, y: 0 }
  private padLook = { x: 0, y: 0 }
  device: Device = 'keyboard'
  onDevice?: (d: Device) => void
  /** Only while true do mouse buttons fire gameplay actions (menus stay clickable). */
  gameplay = false

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', e => {
      if (e.code === 'Tab') e.preventDefault()
      if (e.repeat) return
      if ((e.target as HTMLElement)?.tagName === 'INPUT' && e.code !== 'Escape') return
      this.keys.add(e.code)
      this.press(e.code)
      this.setDevice('keyboard')
    })
    window.addEventListener('keyup', e => this.keys.delete(e.code))
    window.addEventListener('blur', () => this.keys.clear())
    canvas.addEventListener('contextmenu', e => e.preventDefault())
    window.addEventListener('mousedown', e => {
      if (!this.gameplay || document.pointerLockElement !== canvas) return
      const code = `Mouse${e.button}`
      this.keys.add(code)
      this.press(code)
      this.setDevice('keyboard')
    })
    window.addEventListener('mouseup', e => this.keys.delete(`Mouse${e.button}`))
    window.addEventListener('mousemove', e => {
      if (document.pointerLockElement !== canvas) return
      this.look.x += e.movementX
      this.look.y += e.movementY
    })
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement !== canvas) {
        this.keys.delete('Mouse0')
        this.keys.delete('Mouse1')
        this.keys.delete('Mouse2')
      }
    })
  }

  private press(code: string): void {
    for (const a of ACTIONS) if (KEY_BINDINGS[a].includes(code)) this.pressed_.add(a)
  }

  private setDevice(d: Device): void {
    if (this.device === d) return
    this.device = d
    this.onDevice?.(d)
  }

  get pointerLocked(): boolean {
    return document.pointerLockElement === this.canvas
  }

  lockPointer(): void {
    if (matchMedia('(pointer: coarse)').matches) return
    if (document.pointerLockElement === this.canvas) return
    try {
      const res = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined
      res?.catch?.(() => undefined)
    } catch {
      /* pointer lock unavailable (iframe restrictions): drag-look still works */
    }
  }

  unlockPointer(): void {
    if (document.pointerLockElement) document.exitPointerLock()
  }

  /** Poll gamepads once per frame. */
  update(): void {
    const pads = navigator.getGamepads?.() ?? []
    const pad = Array.from(pads).find(p => p && p.connected)
    this.padHeld.clear()
    this.padMove.x = this.padMove.y = 0
    this.padLook.x = this.padLook.y = 0
    if (!pad) return
    const dz = (v: number) => (Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82)
    this.padMove.x = dz(pad.axes[0] ?? 0)
    this.padMove.y = -dz(pad.axes[1] ?? 0)
    this.padLook.x = dz(pad.axes[2] ?? 0)
    this.padLook.y = dz(pad.axes[3] ?? 0)
    let any = Math.abs(this.padMove.x) + Math.abs(this.padMove.y) + Math.abs(this.padLook.x) + Math.abs(this.padLook.y) > 0
    pad.buttons.forEach((b, i) => {
      const down = b.pressed || b.value > 0.5
      if (down) any = true
      if (down && !this.padPrev[i]) for (const a of ACTIONS) if (PAD_BINDINGS[a].includes(i)) this.pressed_.add(a)
      if (down) for (const a of ACTIONS) if (PAD_BINDINGS[a].includes(i)) this.padHeld.add(a)
      this.padPrev[i] = down
    })
    if (any) this.setDevice('gamepad')
  }

  held(a: Action): boolean {
    if (this.touchHeld.has(a) || this.padHeld.has(a)) return true
    return KEY_BINDINGS[a].some(k => this.keys.has(k))
  }

  /** True once per press; consumes it. */
  pressed(a: Action): boolean {
    if (!this.pressed_.has(a)) return false
    this.pressed_.delete(a)
    return true
  }

  clearPresses(): void {
    this.pressed_.clear()
  }

  /** Movement intent: x = right, y = forward, length ≤ 1. */
  move(): { x: number; y: number } {
    let x = this.stick.x + this.padMove.x
    let y = this.stick.y + this.padMove.y
    for (const [code, [kx, ky]] of Object.entries(MOVE_KEYS)) {
      if (this.keys.has(code)) {
        x += kx
        y += ky
      }
    }
    const len = Math.hypot(x, y)
    if (len > 1) {
      x /= len
      y /= len
    }
    return { x, y }
  }

  /** Look delta since last call, in "mouse pixels" (gamepad stick scaled to match). */
  consumeLook(dt: number): { x: number; y: number } {
    const out = { x: this.look.x + this.padLook.x * 900 * dt, y: this.look.y + this.padLook.y * 600 * dt }
    this.look.x = this.look.y = 0
    return out
  }

  // ─── touch hooks ─────────────────────────────────────────────────────────
  setStick(x: number, y: number): void {
    this.stick.x = x
    this.stick.y = y
    if (x || y) this.setDevice('touch')
  }
  addLook(dx: number, dy: number): void {
    this.look.x += dx
    this.look.y += dy
  }
  touchAction(a: Action, down: boolean): void {
    if (down) {
      if (!this.touchHeld.has(a)) this.pressed_.add(a)
      this.touchHeld.add(a)
      this.setDevice('touch')
    } else this.touchHeld.delete(a)
  }
}
