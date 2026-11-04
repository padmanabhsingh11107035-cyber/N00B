/**
 * HUD particle overlay: one full-screen 2D canvas for all interface juice (button hover sparkles,
 * click ripples, charge-level bursts, part-break shards, rank stamp explosions, heal motes).
 * No DOM nodes are created per particle, so dozens of bursts per second stay cheap.
 */
type P = {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  size: number
  color: string
  kind: 'spark' | 'mote' | 'shard' | 'ring' | 'streak'
  rot: number
  spin: number
  drag: number
  grav: number
}

const MAX = 700

export class UiFx {
  readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private parts: P[] = []
  private dpr = 1
  /** Global multiplier (quality / reduced motion). */
  density = 1

  constructor(parent: HTMLElement) {
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'ui-fx'
    parent.append(this.canvas)
    this.ctx = this.canvas.getContext('2d')!
    this.resize()
    window.addEventListener('resize', () => this.resize())
  }

  private resize(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1)
    this.canvas.width = Math.round(window.innerWidth * this.dpr)
    this.canvas.height = Math.round(window.innerHeight * this.dpr)
  }

  get count(): number {
    return this.parts.length
  }

  private push(p: P): void {
    if (this.parts.length >= MAX) this.parts.shift()
    this.parts.push(p)
  }

  /** Radial spark burst (gold by default). */
  burst(x: number, y: number, n = 18, color = '#ffd27a', speed = 260, size = 3): void {
    const count = Math.round(n * this.density)
    for (let i = 0; i < count; i += 1) {
      const a = Math.random() * Math.PI * 2
      const v = speed * (0.35 + Math.random() * 0.8)
      const life = 0.35 + Math.random() * 0.45
      this.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, size: size * (0.6 + Math.random() * 0.9), color, kind: Math.random() < 0.35 ? 'streak' : 'spark', rot: a, spin: 0, drag: 3.2, grav: 180 })
    }
  }

  /** Expanding ring (click ripple, charge level). */
  ring(x: number, y: number, radius = 60, color = '#ffd27a', life = 0.45, width = 3): void {
    this.push({ x, y, vx: radius, vy: width, life, max: life, size: 0, color, kind: 'ring', rot: 0, spin: 0, drag: 0, grav: 0 })
  }

  /** Tumbling shards (part break, hurt chips). */
  shards(x: number, y: number, n = 12, color = '#e8c070', speed = 320): void {
    const count = Math.round(n * this.density)
    for (let i = 0; i < count; i += 1) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.6
      const v = speed * (0.4 + Math.random() * 0.8)
      const life = 0.6 + Math.random() * 0.5
      this.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, size: 4 + Math.random() * 6, color, kind: 'shard', rot: Math.random() * 6, spin: (Math.random() - 0.5) * 18, drag: 1.2, grav: 900 })
    }
  }

  /** Slow rising motes (heal, flow, ambient hover glow). */
  motes(x: number, y: number, n = 10, color = '#9dff8a', spread = 40): void {
    const count = Math.round(n * this.density)
    for (let i = 0; i < count; i += 1) {
      const life = 0.7 + Math.random() * 0.8
      this.push({ x: x + (Math.random() - 0.5) * spread * 2, y: y + (Math.random() - 0.5) * spread * 0.5, vx: (Math.random() - 0.5) * 30, vy: -40 - Math.random() * 70, life, max: life, size: 2 + Math.random() * 3, color, kind: 'mote', rot: 0, spin: 0, drag: 0.6, grav: -20 })
    }
  }

  /** Burst centred on an element. */
  burstAt(el: Element | null, n = 18, color = '#ffd27a', speed = 260): void {
    if (!el) return
    const r = el.getBoundingClientRect()
    if (!r.width) return
    this.burst(r.left + r.width / 2, r.top + r.height / 2, n, color, speed)
  }

  /** Sparkles scattered along an element's edge (banner arrival, hover). */
  edge(el: Element | null, n = 24, color = '#ffd27a'): void {
    if (!el) return
    const r = el.getBoundingClientRect()
    if (!r.width) return
    const count = Math.round(n * this.density)
    for (let i = 0; i < count; i += 1) {
      const top = Math.random() < 0.5
      const x = r.left + Math.random() * r.width
      const y = top ? r.top + r.height * 0.2 : r.bottom - r.height * 0.2
      const life = 0.4 + Math.random() * 0.5
      this.push({ x, y, vx: (Math.random() - 0.5) * 120, vy: (top ? -1 : 1) * (30 + Math.random() * 90), life, max: life, size: 1.5 + Math.random() * 2.5, color, kind: 'spark', rot: 0, spin: 0, drag: 2, grav: 60 })
    }
  }

  update(dt: number): void {
    dt = Math.max(0, dt)
    const c = this.ctx
    const d = this.dpr
    c.setTransform(1, 0, 0, 1, 0, 0)
    c.clearRect(0, 0, this.canvas.width, this.canvas.height)
    if (!this.parts.length) return
    c.setTransform(d, 0, 0, d, 0, 0)
    c.globalCompositeOperation = 'lighter'
    const keep: P[] = []
    for (const p of this.parts) {
      p.life -= dt
      if (p.life <= 0) continue
      keep.push(p)
      const k = p.life / p.max
      if (p.kind === 'ring') {
        const t = 1 - k
        c.globalAlpha = k * 0.9
        c.strokeStyle = p.color
        c.lineWidth = p.vy * (0.4 + k)
        c.beginPath()
        c.arc(p.x, p.y, Math.max(0, p.vx * (0.25 + t * 0.75)), 0, Math.PI * 2)
        c.stroke()
        continue
      }
      const damp = Math.exp(-p.drag * dt)
      p.vx *= damp
      p.vy = p.vy * damp + p.grav * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.rot += p.spin * dt
      c.globalAlpha = Math.min(1, k * 1.6)
      c.fillStyle = p.color
      if (p.kind === 'streak') {
        c.strokeStyle = p.color
        c.lineWidth = p.size * 0.6
        c.beginPath()
        c.moveTo(p.x, p.y)
        c.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04)
        c.stroke()
      } else if (p.kind === 'shard') {
        c.save()
        c.translate(p.x, p.y)
        c.rotate(p.rot)
        c.beginPath()
        c.moveTo(-p.size * 0.5, -p.size * 0.2)
        c.lineTo(p.size * 0.6, -p.size * 0.35)
        c.lineTo(p.size * 0.1, p.size * 0.5)
        c.closePath()
        c.fill()
        c.restore()
      } else {
        const s = p.size * (p.kind === 'mote' ? 1 : 0.5 + k * 0.5)
        const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, s * 2.4)
        g.addColorStop(0, '#ffffff')
        g.addColorStop(0.25, p.color)
        g.addColorStop(1, 'rgba(0,0,0,0)')
        c.fillStyle = g
        c.fillRect(p.x - s * 2.4, p.y - s * 2.4, s * 4.8, s * 4.8)
      }
    }
    this.parts = keep
    c.globalAlpha = 1
    c.globalCompositeOperation = 'source-over'
  }
}
