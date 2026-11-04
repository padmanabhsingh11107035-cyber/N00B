/**
 * Unified input. Menus read edge-triggered actions (`consume`) and the gamepad stick (`move`);
 * the rhythm game reads *timestamped* hits (`drainHits`) so judgments use the exact moment a key
 * went down, not the frame it was noticed.
 */
export type Dir = 'up' | 'down' | 'left' | 'right'
export type HitAction = Dir | 'beat'
export type Action = HitAction | 'pause' | 'confirm' | 'back'
export type InputMethod = 'keyboard' | 'gamepad' | 'touch'
export type Hit = { action: HitAction; t: number }

const KEY_HITS: Record<string, HitAction> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
  Numpad8: 'up', Numpad2: 'down', Numpad4: 'left', Numpad6: 'right',
  Space: 'beat', Numpad0: 'beat', Numpad5: 'beat',
}
const KEY_ACTIONS: Record<string, Action> = { Escape: 'pause', KeyP: 'pause', Enter: 'confirm', NumpadEnter: 'confirm' }
// Standard mapping: A=0, B=1, RB=5, RT=7, Start=9, D-pad 12..15.
const PAD_HITS: Array<[number, HitAction]> = [[12, 'up'], [13, 'down'], [14, 'left'], [15, 'right'], [0, 'beat'], [5, 'beat'], [7, 'beat']]
const PAD_ACTIONS: Array<[number, Action]> = [[9, 'pause'], [0, 'confirm'], [1, 'back']]

export class Input {
  /** Menu navigation intent from the gamepad stick / d-pad, in [-1, 1]. */
  readonly move = { x: 0, y: 0 }
  method: InputMethod = 'keyboard'
  /** While true, direction/beat presses are queued as timed hits (and never scroll the page). */
  rhythm = false
  private hits: Hit[] = []
  private pressed_ = new Set<Action>()
  private padPrev = new Set<number>()
  private padIndex = -1
  private padId = ''
  private padStickDir?: Dir
  private listeners: Array<() => void> = []

  constructor() {
    const on = <K extends keyof WindowEventMap>(type: K, fn: (e: WindowEventMap[K]) => void) => {
      window.addEventListener(type, fn as EventListener)
      this.listeners.push(() => window.removeEventListener(type, fn as EventListener))
    }
    on('gamepaddisconnected', e => {
      if (e.gamepad.index === this.padIndex) this.resetPad()
    })
    on('keydown', e => {
      if (e.repeat) return
      this.method = 'keyboard'
      const typing = (e.target as HTMLElement | null)?.matches?.('input[type="text"], textarea')
      if (typing) return
      const hit = KEY_HITS[e.code]
      if (hit && this.rhythm) {
        e.preventDefault()
        this.hits.push({ action: hit, t: e.timeStamp || performance.now() })
      } else if (hit === 'beat' || e.code.startsWith('Arrow')) {
        // Menus: arrows move focus (handled by the UI), Space must not scroll.
        if (e.code === 'Space' && !(e.target as HTMLElement)?.matches?.('button')) e.preventDefault()
      }
      const action = KEY_ACTIONS[e.code]
      if (action) this.pressed_.add(action)
    })
  }

  /** Touch buttons feed hits directly with their event timestamp. */
  pushHit(action: HitAction, t: number): void {
    this.method = 'touch'
    if (this.rhythm) this.hits.push({ action, t })
  }

  drainHits(): Hit[] {
    if (this.hits.length === 0) return []
    const out = this.hits
    this.hits = []
    return out
  }

  clearHits(): void {
    this.hits = []
  }

  /** Sample the gamepad. Call once per rendered frame. */
  update(): void {
    this.move.x = 0
    this.move.y = 0
    const pad = navigator.getGamepads?.().find(p => p && p.connected)
    if (!pad) {
      this.resetPad()
      return
    }
    if (pad.index !== this.padIndex || pad.id !== this.padId) {
      this.resetPad()
      this.padIndex = pad.index
      this.padId = pad.id
    }
    const dead = (v: number) => (Math.abs(v) < 0.3 ? 0 : v)
    const lx = dead(pad.axes[0] ?? 0)
    const ly = dead(pad.axes[1] ?? 0)
    const stickDir: Dir | undefined = Math.max(Math.abs(lx), Math.abs(ly)) >= 0.55
      ? Math.abs(lx) > Math.abs(ly) ? (lx > 0 ? 'right' : 'left') : (ly > 0 ? 'down' : 'up')
      : undefined
    if (stickDir !== this.padStickDir) {
      this.padStickDir = stickDir
      if (stickDir && this.rhythm) this.hits.push({ action: stickDir, t: performance.now() })
    }
    const now = new Set<number>()
    pad.buttons.forEach((b, i) => b.pressed && now.add(i))
    if (lx || ly || now.size) this.method = 'gamepad'
    this.move.x = lx || (now.has(15) ? 1 : 0) - (now.has(14) ? 1 : 0)
    this.move.y = -ly || (now.has(12) ? 1 : 0) - (now.has(13) ? 1 : 0)
    const t = performance.now()
    const pressedNow = new Set([...now].filter(i => !this.padPrev.has(i)))
    if (this.rhythm) for (const [b, a] of PAD_HITS) if (pressedNow.has(b)) this.hits.push({ action: a, t })
    for (const [b, a] of PAD_ACTIONS) if (pressedNow.has(b)) this.pressed_.add(a)
    this.padPrev = now
  }

  private resetPad(): void {
    this.padPrev.clear()
    this.padIndex = -1
    this.padId = ''
    this.padStickDir = undefined
  }

  /** Read and clear an edge-triggered press. */
  consume(action: Action): boolean {
    return this.pressed_.delete(action)
  }

  dispose(): void {
    for (const off of this.listeners) off()
    this.listeners = []
  }
}
