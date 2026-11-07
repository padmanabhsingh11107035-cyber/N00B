/**
 * Online races. The page that shows this game (NOOB) opens a Supabase Realtime room for us and only passes small messages between the phones:
 *  hello  {id, name, char, host}   every second in the lobby: who is here
 *  start  {order: [{id, char}]}    the host starts the race; everybody uses the same order and grid
 *  pose   {id, x, y, z, yaw, ...}  15 times a second during the race: where my kart is
 * Everyone drives their own kart on their own phone; the others' karts follow the poses they send. Nothing else is shared.
 */
export type Peer = { id: string; name: string; char: string; host: boolean; seen: number }
export type StartOrder = { id: string; char: string }[]

const CHANNEL = 'critterkart'

export class Online {
  me: { id: string; name: string } | null = null
  room = ''
  host = false
  ready = false
  failed = false
  peers = new Map<string, Peer>()
  char = ''
  onChange: () => void = () => undefined
  onStart: (order: StartOrder) => void = () => undefined
  onPose: (id: string, p: Record<string, unknown>) => void = () => undefined
  private timer = 0
  private readonly handler = (e: MessageEvent) => this.onMessage(e)

  /** Is this page shown by NOOB (which brings the room)? Opened on its own the game has no online races. */
  static available(): boolean {
    return window.parent !== window
  }

  private post(msg: Record<string, unknown>): void {
    try { window.parent.postMessage({ noobMp: CHANNEL, ...msg }, window.location.origin) } catch { /* not framed */ }
  }

  send(event: string, payload: Record<string, unknown>): void {
    this.post({ type: 'send', event, payload })
  }

  join(room: string, host: boolean, char: string): void {
    this.leave()
    this.room = room
    this.host = host
    this.char = char
    this.ready = false
    this.failed = false
    this.peers.clear()
    window.addEventListener('message', this.handler)
    this.post({ type: 'join', room })
    this.timer = window.setInterval(() => this.hello(), 1000)
    this.onChange()
  }

  setChar(char: string): void {
    this.char = char
    this.hello()
  }

  leave(): void {
    if (this.timer) window.clearInterval(this.timer)
    this.timer = 0
    if (this.room) this.post({ type: 'leave' })
    window.removeEventListener('message', this.handler)
    this.room = ''
    this.ready = false
    this.peers.clear()
  }

  private hello(): void {
    if (!this.ready || !this.me) return
    this.send('hello', { id: this.me.id, name: this.me.name, char: this.char, host: this.host })
    const now = performance.now()
    let dropped = false
    for (const [id, p] of this.peers) if (now - p.seen > 4500) { this.peers.delete(id); dropped = true }
    if (dropped) this.onChange()
  }

  /** The people in the lobby: the host first, then in the order they arrived. */
  roster(): { id: string; name: string; char: string; host: boolean; me: boolean }[] {
    const list = [...this.peers.values()].map(p => ({ id: p.id, name: p.name, char: p.char, host: p.host, me: false }))
    if (this.me) list.push({ id: this.me.id, name: this.me.name, char: this.char, host: this.host, me: true })
    list.sort((a, b) => (a.host === b.host ? a.id.localeCompare(b.id) : a.host ? -1 : 1))
    return list.slice(0, 6)
  }

  private onMessage(e: MessageEvent): void {
    if (e.source !== window.parent || e.origin !== window.location.origin) return
    const d = e.data as { noobMp?: string; type?: string; event?: string; payload?: Record<string, unknown>; me?: { id: string; name: string } } | null
    if (!d || d.noobMp !== CHANNEL) return
    if (d.type === 'ready' && d.me) {
      this.me = { id: String(d.me.id), name: String(d.me.name || 'Player').slice(0, 16) }
      this.ready = true
      this.hello()
      this.onChange()
    } else if (d.type === 'error') {
      this.failed = true
      this.onChange()
    } else if (d.type === 'msg' && d.payload && typeof d.event === 'string') {
      const p = d.payload
      if (d.event === 'hello') {
        const id = String(p.id ?? '')
        if (!id || id === this.me?.id) return
        const isNew = !this.peers.has(id)
        this.peers.set(id, { id, name: String(p.name ?? 'Player').slice(0, 16), char: String(p.char ?? ''), host: !!p.host, seen: performance.now() })
        if (isNew) { this.hello(); this.onChange() }
        else this.onChange()
      } else if (d.event === 'start' && Array.isArray(p.order)) {
        const order = (p.order as { id?: unknown; char?: unknown }[]).map(o => ({ id: String(o.id ?? ''), char: String(o.char ?? '') })).slice(0, 6)
        if (order.some(o => o.id === this.me?.id)) this.onStart(order)
      } else if (d.event === 'pose') {
        const id = String(p.id ?? '')
        if (id && id !== this.me?.id) this.onPose(id, p)
      }
    }
  }
}
