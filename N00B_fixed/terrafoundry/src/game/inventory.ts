import { ITEMS, type ItemId, type Recipe } from './items'

export type Stack = { id: ItemId; n: number; dur?: number }
export type Slot = Stack | null
export const HOTBAR = 9
export const INV_SIZE = 36

const maxDur = (id: ItemId) => ITEMS[id].tool?.durability

/**
 * 36 slots: 0–8 are the hotbar, 9–35 the backpack. Pure logic (unit tested); the UI and game
 * call these methods and re-render from `slots`.
 */
export class Inventory {
  slots: Slot[] = new Array(INV_SIZE).fill(null)
  /** Item held by the mouse cursor while the inventory screen is open. */
  cursor: Slot = null
  /** Creative mode: placing and crafting never consume items. */
  infinite = false

  /** Adds items; returns how many did not fit. */
  add(id: ItemId, n = 1, dur?: number): number {
    const def = ITEMS[id]
    let left = n
    if (def.stack > 1) {
      for (const s of this.slots) {
        if (left <= 0) break
        if (s && s.id === id && s.n < def.stack) {
          const put = Math.min(def.stack - s.n, left)
          s.n += put
          left -= put
        }
      }
    }
    for (let i = 0; i < INV_SIZE && left > 0; i++) {
      if (this.slots[i]) continue
      const put = Math.min(def.stack, left)
      this.slots[i] = { id, n: put, ...(def.tool ? { dur: dur ?? def.tool.durability } : {}) }
      left -= put
    }
    return left
  }

  /** How many of `id` fit right now. */
  room(id: ItemId): number {
    const def = ITEMS[id]
    let room = 0
    for (const s of this.slots) {
      if (!s) room += def.stack
      else if (s.id === id && def.stack > 1) room += def.stack - s.n
    }
    return room
  }

  count(id: ItemId): number {
    let n = 0
    for (const s of this.slots) if (s && s.id === id) n += s.n
    return n
  }

  has(cost: [ItemId, number][]): boolean {
    return this.infinite || cost.every(([id, n]) => this.count(id) >= n)
  }

  /** Removes items, taking from the backpack before the hotbar. */
  remove(id: ItemId, n = 1): boolean {
    if (this.infinite) return true
    if (this.count(id) < n) return false
    let left = n
    for (let i = INV_SIZE - 1; i >= 0 && left > 0; i--) {
      const s = this.slots[i]
      if (!s || s.id !== id) continue
      const take = Math.min(s.n, left)
      s.n -= take
      left -= take
      if (s.n <= 0) this.slots[i] = null
    }
    return true
  }

  /** Removes one item from a specific slot (placing, eating). */
  takeFrom(index: number): boolean {
    const s = this.slots[index]
    if (!s) return false
    if (this.infinite) return true
    s.n -= 1
    if (s.n <= 0) this.slots[index] = null
    return true
  }

  canCraft(r: Recipe): boolean {
    return this.has(r.cost) && this.room(r.out) >= r.n
  }

  craft(r: Recipe): boolean {
    if (!this.has(r.cost)) return false
    if (this.room(r.out) < r.n && !this.infinite) return false
    for (const [id, n] of r.cost) this.remove(id, n)
    this.add(r.out, r.n)
    return true
  }

  /** Wears the tool in `index`; returns true when it broke. */
  wear(index: number, amount = 1): boolean {
    const s = this.slots[index]
    if (!s || s.dur === undefined || this.infinite) return false
    s.dur -= amount
    if (s.dur <= 0) {
      this.slots[index] = null
      return true
    }
    return false
  }

  /** Minecraft-style click: pick up, drop, merge or swap with the cursor stack. */
  click(index: number, half = false): void {
    this.clickIn(this.slots, index, half)
  }

  /** The same click rules on any slot array (chests share the pack's cursor). */
  clickIn(slots: Slot[], index: number, half = false): void {
    const slot = slots[index]
    const cur = this.cursor
    if (!cur) {
      if (!slot) return
      if (half && slot.n > 1) {
        const take = Math.ceil(slot.n / 2)
        this.cursor = { ...slot, n: take }
        slot.n -= take
      } else {
        this.cursor = slot
        slots[index] = null
      }
      return
    }
    if (!slot) {
      if (half && cur.n > 1) {
        slots[index] = { ...cur, n: 1 }
        cur.n -= 1
      } else {
        slots[index] = cur
        this.cursor = null
      }
      return
    }
    const stack = ITEMS[cur.id].stack
    if (slot.id === cur.id && stack > 1) {
      const put = Math.min(stack - slot.n, half ? 1 : cur.n)
      slot.n += put
      cur.n -= put
      if (cur.n <= 0) this.cursor = null
      return
    }
    slots[index] = cur
    this.cursor = slot
  }

  /** Shift-click: move a stack between hotbar and backpack. */
  quickMove(index: number): void {
    const [a, b] = index < HOTBAR ? [HOTBAR, INV_SIZE] : [0, HOTBAR]
    moveStack(this.slots, index, this.slots, a, b)
  }

  /** Return the cursor stack to the inventory (closing the screen). */
  stowCursor(): void {
    if (!this.cursor) return
    const c = this.cursor
    this.cursor = null
    this.add(c.id, c.n, c.dur)
  }

  serialize(): SavedSlots {
    return serializeSlots(this.slots)
  }

  load(data: unknown): void {
    this.slots = loadSlots(data, INV_SIZE)
    this.cursor = null
  }
}

export type SavedSlots = Array<[ItemId, number, number?] | 0>

/**
 * Moves the stack at src[index] into dst[a..b): merges into matching stacks first, then empty
 * slots. Whatever does not fit stays behind. Returns how many items moved.
 */
export function moveStack(src: Slot[], index: number, dst: Slot[], a = 0, b = dst.length): number {
  const s = src[index]
  if (!s) return 0
  const before = s.n
  const stack = ITEMS[s.id].stack
  if (stack > 1) {
    for (let i = a; i < b && s.n > 0; i++) {
      const t = dst[i]
      if (t && t !== s && t.id === s.id && t.n < stack) {
        const put = Math.min(stack - t.n, s.n)
        t.n += put
        s.n -= put
      }
    }
  }
  for (let i = a; i < b && s.n > 0; i++) {
    if (!dst[i]) {
      dst[i] = { ...s }
      s.n = 0
    }
  }
  if (s.n <= 0) src[index] = null
  return before - s.n
}

/** Moves every stack in src into dst (optionally only item kinds dst already holds). */
export function moveAll(src: Slot[], dst: Slot[], onlyMatching = false, a = 0, b = src.length): number {
  let moved = 0
  const kinds = new Set(dst.filter(Boolean).map(t => t!.id))
  for (let i = a; i < b; i++) {
    const s = src[i]
    if (!s || (onlyMatching && !kinds.has(s.id))) continue
    moved += moveStack(src, i, dst)
  }
  return moved
}

export function serializeSlots(slots: Slot[]): SavedSlots {
  return slots.map(s => (s ? (s.dur !== undefined ? [s.id, s.n, s.dur] : [s.id, s.n]) : 0))
}

export function loadSlots(data: unknown, size: number): Slot[] {
  const out: Slot[] = new Array(size).fill(null)
  if (!Array.isArray(data)) return out
  for (let i = 0; i < Math.min(size, data.length); i++) {
    const e = data[i]
    if (!Array.isArray(e) || typeof e[0] !== 'string' || !(e[0] in ITEMS)) continue
    const id = e[0] as ItemId
    const n = Math.floor(Number(e[1]))
    if (!(n > 0)) continue
    const md = maxDur(id)
    const dur = md !== undefined ? Math.min(md, Math.max(1, Math.floor(Number(e[2]) || md))) : undefined
    out[i] = { id, n: Math.min(n, ITEMS[id].stack), ...(dur !== undefined ? { dur } : {}) }
  }
  return out
}
