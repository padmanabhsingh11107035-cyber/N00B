import { ROSTER } from '../game/characters'
import { Online, type StartOrder } from '../net/online'

/** The "Play online" screen: make a room (4 letters) or join one, see who is here, the host starts the race. Plain DOM on top of the game; it never touches the other screens. */
export class Lobby {
  private el: HTMLElement
  private body: HTMLElement
  private open = false
  private view: 'home' | 'room' = 'home'
  private message = ''

  constructor(
    root: HTMLElement,
    readonly net: Online,
    private readonly getChar: () => string,
    private readonly onStart: (order: { id: string; char: string; me: boolean }[]) => void,
    private readonly onClose: () => void,
  ) {
    this.el = document.createElement('div')
    this.el.className = 'lobby'
    this.el.hidden = true
    this.el.innerHTML = '<div class="panel lobby-panel"><h2 class="panel-title">Play online</h2><div data-lobby-body></div></div>'
    this.body = this.el.querySelector('[data-lobby-body]')!
    root.appendChild(this.el)
    for (const type of ['keydown', 'keyup', 'pointerdown']) this.el.addEventListener(type, e => e.stopPropagation())
    net.onChange = () => this.render()
    net.onStart = order => this.begin(order)
  }

  show(): void {
    this.open = true
    this.el.hidden = false
    this.view = this.net.room ? 'room' : 'home'
    this.message = ''
    this.render()
  }

  hide(): void {
    this.open = false
    this.el.hidden = true
  }

  /** After a race: the room is still there, the host can start again. */
  backToRoom(): boolean {
    if (!this.net.room) return false
    this.show()
    return true
  }

  private code(): string {
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let s = ''
    for (let i = 0; i < 4; i += 1) s += letters[Math.floor(Math.random() * letters.length)]
    return s
  }

  private enter(room: string, host: boolean): void {
    this.net.join(room, host, this.getChar())
    this.view = 'room'
    this.render()
  }

  private begin(order: StartOrder): void {
    const me = this.net.me?.id
    this.hide()
    this.onStart(order.map(o => ({ id: o.id, char: o.char, me: o.id === me })))
  }

  private start(): void {
    const roster = this.net.roster()
    if (roster.length < 2) {
      this.message = 'You need at least 2 players.'
      this.render()
      return
    }
    // every player gets a different animal: keep the pick when it is free, otherwise the next free one
    const used = new Set<string>()
    const order: StartOrder = roster.map(p => {
      const c = ROSTER.find(r => r.id === p.char && !used.has(r.id)) ?? ROSTER.find(r => !used.has(r.id))!
      used.add(c.id)
      return { id: p.id, char: c.id }
    })
    this.net.send('start', { order })
    this.begin(order)
  }

  private render(): void {
    if (!this.open) return
    const esc = (s: string) => s.replace(/[<>&"]/g, '')
    if (!Online.available()) {
      this.body.innerHTML = '<p class="lobby-note">Online races are in NOOB, on the Games page.</p><div class="lobby-row"><button class="btn" data-lb="close">Back</button></div>'
    } else if (this.view === 'home') {
      this.body.innerHTML = `
        <p class="lobby-note">Race your friends on their own phones. One of you makes a room and tells the others the 4 letters.</p>
        <div class="lobby-row"><button class="btn btn-primary" data-lb="create">Make a room</button></div>
        <div class="lobby-row"><input class="lobby-input" maxlength="4" placeholder="CODE" autocapitalize="characters" autocomplete="off" spellcheck="false" data-lb-code><button class="btn" data-lb="join">Join</button></div>
        <p class="lobby-msg">${esc(this.message)}</p>
        <div class="lobby-row"><button class="btn" data-lb="close">Back</button></div>`
    } else {
      const list = this.net.roster()
      const rows = list.map(p => `<li class="${p.me ? 'me' : ''}"><b>${esc(p.name || 'Player')}</b>${p.host ? '<em>host</em>' : ''}${p.me ? '<em>you</em>' : ''}</li>`).join('')
      const status = this.net.failed ? 'Could not connect. Check your internet and try again.' : !this.net.ready ? 'Connecting…' : ''
      this.body.innerHTML = `
        <p class="lobby-code">Room <b>${esc(this.net.room)}</b></p>
        <p class="lobby-note">Tell your friends this code. Up to 6 can race.</p>
        <ul class="lobby-list">${rows}</ul>
        <p class="lobby-msg">${esc(status || this.message)}</p>
        <div class="lobby-row">
          ${this.net.host ? '<button class="btn btn-primary" data-lb="start">Start race</button>' : '<p class="lobby-note">Waiting for the host to start…</p>'}
          <button class="btn" data-lb="leave">Leave</button>
        </div>`
    }
    this.body.querySelectorAll<HTMLElement>('[data-lb]').forEach(b => b.addEventListener('click', () => this.act(b.dataset.lb!)))
    const input = this.body.querySelector<HTMLInputElement>('[data-lb-code]')
    input?.addEventListener('input', () => {
      input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '')
    })
    input?.addEventListener('keydown', e => {
      if (e.key === 'Enter') this.act('join')
    })
  }

  private act(what: string): void {
    if (what === 'create') this.enter(this.code(), true)
    else if (what === 'join') {
      const v = this.body.querySelector<HTMLInputElement>('[data-lb-code]')?.value.trim().toUpperCase() ?? ''
      if (!/^[A-Z0-9]{4}$/.test(v)) {
        this.message = 'Type the 4 letters of the room.'
        this.render()
        return
      }
      this.enter(v, false)
    } else if (what === 'start') this.start()
    else if (what === 'leave') {
      this.net.leave()
      this.view = 'home'
      this.message = ''
      this.render()
    } else if (what === 'close') {
      this.hide()
      this.onClose()
    }
  }
}
