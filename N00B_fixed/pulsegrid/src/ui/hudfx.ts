/**
 * HUD VFX: a full-screen 2D canvas above the DOM HUD (pointer-events: none). Sparks, stars,
 * shards, rings, streamers and edge embers for arrow inputs, judgements, combo milestones,
 * Fever, button presses and the results ceremony. Sprites come from the same particle atlas as
 * the 3D effects and are pre-tinted per colour into small offscreen canvases.
 */
type Kind = 'spark' | 'star' | 'flare' | 'shard' | 'ring' | 'streamer' | 'ember' | 'dot'
type P = {
  kind: Kind
  x: number; y: number; vx: number; vy: number
  life: number; max: number
  size: number; size1: number
  rot: number; spin: number
  color: string
  g: number; drag: number
  w?: number
}

const ATLAS_CELL: Partial<Record<Kind, number>> = { star: 4, flare: 8, ember: 9, dot: 9, spark: 0 }

export class HudFx {
  private readonly canvas: HTMLCanvasElement
  private readonly g: CanvasRenderingContext2D
  private readonly parts: P[] = []
  private atlas?: HTMLImageElement
  private readonly tints = new Map<string, HTMLCanvasElement>()
  private dpr = 1
  private w = 0
  private h = 0
  private edge = 0
  private edgeColor = '#ff4fd8'
  scale = 1
  max = 700

  constructor(parent: HTMLElement) {
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'hudfx'
    this.canvas.setAttribute('aria-hidden', 'true')
    parent.appendChild(this.canvas)
    this.g = this.canvas.getContext('2d')!
    this.resize()
    window.addEventListener('resize', () => this.resize())
  }

  setAtlas(img: HTMLImageElement): void {
    this.atlas = img
    this.tints.clear()
  }

  get active(): number {
    return this.parts.length
  }

  private resize(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1)
    this.w = window.innerWidth
    this.h = window.innerHeight
    this.canvas.width = Math.round(this.w * this.dpr)
    this.canvas.height = Math.round(this.h * this.dpr)
  }

  private tinted(cell: number, color: string): HTMLCanvasElement | undefined {
    if (!this.atlas) return undefined
    const key = `${cell}|${color}`
    let c = this.tints.get(key)
    if (c) return c
    c = document.createElement('canvas')
    c.width = c.height = 64
    const g = c.getContext('2d')!
    const cw = this.atlas.naturalWidth / 5
    g.drawImage(this.atlas, (cell % 5) * cw, Math.floor(cell / 5) * cw, cw, cw, 0, 0, 64, 64)
    g.globalCompositeOperation = 'source-in'
    g.fillStyle = color
    g.fillRect(0, 0, 64, 64)
    // Keep a hot white core for additive glow.
    g.globalCompositeOperation = 'lighter'
    g.globalAlpha = 0.35
    g.drawImage(this.atlas, (cell % 5) * cw, Math.floor(cell / 5) * cw, cw, cw, 0, 0, 64, 64)
    this.tints.set(key, c)
    return c
  }

  private add(p: P): void {
    if (this.parts.length >= this.max) return
    this.parts.push(p)
  }

  /** Radial burst of sparks + stars (arrow input, judgements, button presses). */
  burst(x: number, y: number, color: string, count = 14, speed = 380, opts: { stars?: number; ring?: boolean; up?: boolean } = {}): void {
    const n = Math.round(count * this.scale)
    for (let i = 0; i < n; i++) {
      const a = opts.up ? -Math.PI / 2 + (Math.random() - 0.5) * 2.2 : Math.random() * Math.PI * 2
      const s = speed * (0.35 + Math.random() * 0.75)
      this.add({ kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: 0.35 + Math.random() * 0.35, size: 2 + Math.random() * 2, size1: 0.5, rot: a, spin: 0, color, g: 500, drag: 3.2 })
    }
    const st = Math.round((opts.stars ?? Math.ceil(count / 3)) * this.scale)
    for (let i = 0; i < st; i++) {
      const a = Math.random() * Math.PI * 2
      const s = speed * (0.2 + Math.random() * 0.5)
      this.add({ kind: 'star', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life: 0, max: 0.5 + Math.random() * 0.5, size: 16 + Math.random() * 16, size1: 2, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 8, color, g: 260, drag: 2.4 })
    }
    if (opts.ring) this.ring(x, y, color)
  }

  ring(x: number, y: number, color: string, size = 150, dur = 0.5, w = 5): void {
    this.add({ kind: 'ring', x, y, vx: 0, vy: 0, life: 0, max: dur, size: 12, size1: size, rot: 0, spin: 0, color, g: 0, drag: 0, w })
  }

  flare(x: number, y: number, color: string, size = 220, dur = 0.35): void {
    this.add({ kind: 'flare', x, y, vx: 0, vy: 0, life: 0, max: dur, size: size * 0.5, size1: size, rot: Math.random() * 6, spin: 1, color, g: 0, drag: 0 })
  }

  /** Red glass shards (wrong input / miss). */
  shards(x: number, y: number, count = 10, color = '#ff3355'): void {
    const n = Math.round(count * this.scale)
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const s = 160 + Math.random() * 260
      this.add({ kind: 'shard', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 120, life: 0, max: 0.55 + Math.random() * 0.3, size: 5 + Math.random() * 7, size1: 3, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 16, color, g: 900, drag: 1.2 })
    }
  }

  /** Paper streamers raining down from the top edge (milestones, results). */
  streamers(count: number, colors: string[]): void {
    const n = Math.round(count * this.scale)
    for (let i = 0; i < n; i++) {
      this.add({ kind: 'streamer', x: Math.random() * this.w, y: -20 - Math.random() * 120, vx: (Math.random() - 0.5) * 80, vy: 80 + Math.random() * 120, life: 0, max: 2.2 + Math.random() * 1.4, size: 7 + Math.random() * 6, size1: 7, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 10, color: colors[i % colors.length], g: 90, drag: 0.6 })
    }
  }

  /** Streamer cannons from both lower corners (Fever / Stage Clear). */
  cannons(colors: string[], count = 50): void {
    const n = Math.round(count * this.scale)
    for (let i = 0; i < n; i++) {
      const left = i % 2 === 0
      const a = left ? -Math.PI / 2 + 0.35 + Math.random() * 0.45 : -Math.PI / 2 - 0.35 - Math.random() * 0.45
      const s = 700 + Math.random() * 500
      this.add({ kind: 'streamer', x: left ? 0 : this.w, y: this.h, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: 2.4 + Math.random(), size: 7 + Math.random() * 6, size1: 7, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 12, color: colors[i % colors.length], g: 520, drag: 1.1 })
    }
  }

  /** Sparkles orbiting out of an element (hover/click on buttons). */
  sparkleRect(r: DOMRect, color: string, count = 8): void {
    const n = Math.round(count * this.scale)
    for (let i = 0; i < n; i++) {
      const x = r.left + Math.random() * r.width
      const y = r.top + Math.random() * r.height
      this.add({ kind: 'star', x, y, vx: (Math.random() - 0.5) * 60, vy: -40 - Math.random() * 60, life: 0, max: 0.5 + Math.random() * 0.4, size: 8 + Math.random() * 10, size1: 1, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 6, color, g: -20, drag: 1 })
    }
  }

  /** Continuous embers rising from the screen edges while Fever is on. */
  setEdge(level: number, color?: string): void {
    this.edge = level
    if (color) this.edgeColor = color
  }

  clear(): void {
    this.parts.length = 0
    this.edge = 0
  }

  update(dt: number): void {
    if (this.edge > 0 && this.parts.length < this.max * 0.7) {
      const rate = 60 * this.edge * this.scale
      let n = Math.floor(rate * dt + Math.random())
      while (n-- > 0) {
        const side = Math.random()
        const x = side < 0.5 ? Math.random() * 60 : this.w - Math.random() * 60
        this.add({ kind: 'ember', x, y: this.h + 10, vx: (Math.random() - 0.5) * 30, vy: -120 - Math.random() * 180, life: 0, max: 1.4 + Math.random() * 1.2, size: 10 + Math.random() * 12, size1: 2, rot: 0, spin: 0, color: Math.random() < 0.5 ? this.edgeColor : '#ffb347', g: -30, drag: 0.4 })
      }
    }
    const g = this.g
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    g.clearRect(0, 0, this.w, this.h)
    if (!this.parts.length) return
    g.globalCompositeOperation = 'lighter'
    let w = 0
    for (let i = 0; i < this.parts.length; i++) {
      const p = this.parts[i]
      p.life += dt
      if (p.life >= p.max) continue
      const u = p.life / p.max
      const k = Math.exp(-p.drag * dt)
      p.vx *= k
      p.vy = p.vy * k + p.g * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.rot += p.spin * dt
      const size = p.size + (p.size1 - p.size) * u
      const alpha = Math.min(1, p.life / 0.04) * (u > 0.6 ? 1 - (u - 0.6) / 0.4 : 1)
      g.globalAlpha = alpha
      switch (p.kind) {
        case 'spark': {
          const len = Math.min(30, Math.hypot(p.vx, p.vy) * 0.045)
          const a = Math.atan2(p.vy, p.vx)
          g.strokeStyle = p.color
          g.lineWidth = size
          g.lineCap = 'round'
          g.beginPath()
          g.moveTo(p.x, p.y)
          g.lineTo(p.x - Math.cos(a) * len, p.y - Math.sin(a) * len)
          g.stroke()
          break
        }
        case 'ring': {
          g.strokeStyle = p.color
          g.lineWidth = (p.w ?? 4) * (1 - u) + 0.5
          g.beginPath()
          g.arc(p.x, p.y, size, 0, Math.PI * 2)
          g.stroke()
          break
        }
        case 'shard':
        case 'streamer': {
          g.globalCompositeOperation = 'source-over'
          g.save()
          g.translate(p.x, p.y)
          g.rotate(p.rot)
          g.fillStyle = p.color
          if (p.kind === 'shard') {
            g.beginPath()
            g.moveTo(0, -size)
            g.lineTo(size * 0.5, size * 0.6)
            g.lineTo(-size * 0.6, size * 0.3)
            g.closePath()
            g.fill()
          } else {
            g.scale(1, Math.abs(Math.cos(p.life * 7 + i)))
            g.fillRect(-size * 0.5, -size * 1.2, size, size * 2.4)
          }
          g.restore()
          g.globalCompositeOperation = 'lighter'
          break
        }
        default: {
          const img = this.tinted(ATLAS_CELL[p.kind] ?? 4, p.color)
          if (img) {
            g.save()
            g.translate(p.x, p.y)
            g.rotate(p.rot)
            g.drawImage(img, -size / 2, -size / 2, size, size)
            g.restore()
          } else {
            g.fillStyle = p.color
            g.beginPath()
            g.arc(p.x, p.y, size / 4, 0, Math.PI * 2)
            g.fill()
          }
        }
      }
      this.parts[w++] = p
    }
    this.parts.length = w
    g.globalAlpha = 1
    g.globalCompositeOperation = 'source-over'
  }
}
