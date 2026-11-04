import type { Surface } from '../game/terrain'
import { POI_NAMES, type PoiType } from '../game/poi'

/** Map tiles are 64 m squares; explored state and render caches use the same key. */
export const MAP_TILE = 64
const TILE_PX = 32 // 2 m per pixel
export const tileKey = (tx: number, tz: number) => (tx + 32768) * 65536 + (tz + 32768)
const tileXZ = (k: number): [number, number] => [Math.floor(k / 65536) - 32768, (k % 65536) - 32768]

export interface MapTerrain {
  height(x: number, z: number): number
  surfaceAt(x: number, z: number): Surface
  moisture(x: number, z: number): number
}

export type MapPoi = { id: string; x: number; z: number; type: PoiType; known: boolean }
export type MapPiece = { x: number; z: number; w: number; d: number; kind: 'build' | 'light' | 'chest' | 'station' }
export type MapView = {
  player: { x: number; z: number; yaw: number }
  camp: { x: number; z: number } | null
  pois: MapPoi[]
  pieces: MapPiece[]
  day: number
  time: string
  /** Waypoints in drop order (n = 1-based label). */
  pins: MapPin[]
}
export type MapPin = { id: number; x: number; z: number; color: string; n: number }
export interface MapPinApi {
  add(x: number, z: number): void
  remove(id: number): void
  clear(): void
}

type Job = { key: number; tx: number; tz: number; row: number; img: ImageData; heights: Float32Array }

const SURFACE_RGB: Record<Surface, [number, number, number]> = {
  grass: [112, 134, 72],
  dirt: [139, 112, 80],
  sand: [214, 195, 146],
  rock: [132, 125, 114],
  stone: [120, 116, 108],
  snow: [236, 236, 238],
}

const POI_GLYPH: Record<PoiType, string> = { stones: '◈', crystals: '✦', camp: '⌂', ruin: '♜' }

/**
 * Full-screen parchment world map. Tiles render incrementally (row by row inside a frame budget)
 * from the live heightfield, so the map always matches dug/raised terrain. Unexplored land stays
 * under a soft parchment fog.
 */
export class MapScreen {
  readonly el: HTMLElement
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private layer = document.createElement('canvas')
  private mask = document.createElement('canvas')
  private paper: HTMLCanvasElement
  private tiles = new Map<number, HTMLCanvasElement>()
  private queue: Job[] = []
  private queued = new Set<number>()
  private scale = 1.4 // screen px per metre
  private cx = 0
  private cz = 0
  private follow = true
  private dirty = true
  private view: MapView | null = null
  private explored: Set<number> = new Set()
  private drag: { x: number; y: number; cx: number; cz: number; moved: boolean } | null = null
  private pinch: { d: number; scale: number } | null = null
  private pointers = new Map<number, { x: number; y: number }>()
  private readout: HTMLElement
  private hover: HTMLElement
  private icons: Record<string, HTMLImageElement> = {}
  private openT = 0
  private pinT = new Map<number, number>()
  private clearBtn!: HTMLButtonElement
  open = false

  constructor(root: HTMLElement, private readonly terrain: () => MapTerrain | null, private readonly onClose: () => void, private readonly pinApi?: MapPinApi) {
    this.el = document.createElement('div')
    this.el.className = 'screen map-screen hidden'
    this.el.innerHTML = `<div class="map-frame"><canvas class="map-canvas"></canvas>
      <div class="map-head"><img src="./assets/icons/hud_map.webp" alt=""><div><b>World Map</b><span class="map-sub"></span></div></div>
      <div class="map-tools"><button class="btn icon" data-a="in" aria-label="Zoom in">+</button><button class="btn icon" data-a="out" aria-label="Zoom out">−</button><button class="btn" data-a="center">Center <kbd>C</kbd></button><button class="btn ghost hidden" data-a="clear">Clear pins</button><button class="btn icon ghost" data-a="close" aria-label="Close map">✕</button></div>
      <div class="map-legend"><span><i class="lg-you"></i>You</span><span><i class="lg-camp"></i>Camp</span><span><i class="lg-poi"></i>Discovered</span><span><i class="lg-unk"></i>Unvisited</span><span><i class="lg-build"></i>Your builds</span><span><i class="lg-pin"></i>Waypoint</span></div>
      <div class="map-hint">Click to drop a waypoint · click a pin to remove it</div>
      <div class="map-readout"></div><div class="map-hover hidden"></div><div class="map-compass">N</div></div>`
    root.append(this.el)
    this.canvas = this.el.querySelector('canvas')!
    this.ctx = this.canvas.getContext('2d')!
    this.readout = this.el.querySelector('.map-readout')!
    this.hover = this.el.querySelector('.map-hover')!
    this.paper = this.makePaper()
    for (const name of ['campfire', 'hud_poi']) {
      const img = new Image()
      img.src = `./assets/icons/${name}.webp`
      img.onload = () => (this.dirty = true)
      this.icons[name] = img
    }
    const act = (a: string, fn: () => void) => this.el.querySelector(`[data-a="${a}"]`)!.addEventListener('click', fn)
    act('in', () => this.zoom(1.4))
    act('out', () => this.zoom(1 / 1.4))
    act('center', () => this.recenter())
    act('close', () => this.onClose())
    act('clear', () => { this.pinApi?.clear(); this.dirty = true })
    this.clearBtn = this.el.querySelector('[data-a="clear"]')!
    this.canvas.addEventListener('wheel', e => {
      e.preventDefault()
      this.zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.offsetX, e.offsetY)
    }, { passive: false })
    this.canvas.addEventListener('pointerdown', e => {
      this.canvas.setPointerCapture(e.pointerId)
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()]
        this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), scale: this.scale }
        this.drag = null
      } else this.drag = { x: e.clientX, y: e.clientY, cx: this.cx, cz: this.cz, moved: false }
    })
    this.canvas.addEventListener('pointermove', e => {
      if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (this.pinch && this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()]
        this.setScale((this.pinch.scale * Math.hypot(a.x - b.x, a.y - b.y)) / Math.max(1, this.pinch.d))
        return
      }
      if (this.drag) {
        const dx = e.clientX - this.drag.x
        const dy = e.clientY - this.drag.y
        if (Math.abs(dx) + Math.abs(dy) > 3) this.drag.moved = true
        this.cx = this.drag.cx - dx / this.scale
        this.cz = this.drag.cz - dy / this.scale
        this.follow = false
        this.dirty = true
      }
      this.updateHover(e.offsetX, e.offsetY)
    })
    const up = (e: PointerEvent) => {
      const click = e.type === 'pointerup' && this.drag && !this.drag.moved && this.pointers.size === 1 && !this.pinch
      this.pointers.delete(e.pointerId)
      if (this.pointers.size < 2) this.pinch = null
      this.drag = null
      if (click && e.button === 0) this.clickAt(e.offsetX, e.offsetY)
    }
    this.canvas.addEventListener('pointerup', up)
    this.canvas.addEventListener('pointercancel', up)
    this.canvas.addEventListener('pointerleave', () => this.hover.classList.add('hidden'))
    window.addEventListener('keydown', e => {
      if (!this.open) return
      if (e.code === 'KeyC') this.recenter()
      else if (e.code === 'Equal' || e.code === 'NumpadAdd') this.zoom(1.4)
      else if (e.code === 'Minus' || e.code === 'NumpadSubtract') this.zoom(1 / 1.4)
    })
    window.addEventListener('resize', () => (this.dirty = true), { passive: true })
  }

  /** Clears cached tiles (new world or reset). */
  reset(explored: Set<number>): void {
    this.tiles.clear()
    this.queue.length = 0
    this.queued.clear()
    this.explored = explored
    this.dirty = true
  }

  /** Terrain changed around (x, z): drop cached tiles so they re-render from the edited field. */
  invalidate(x: number, z: number): void {
    const tx = Math.floor(x / MAP_TILE)
    const tz = Math.floor(z / MAP_TILE)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const k = tileKey(tx + dx, tz + dz)
        const [ox, oz] = [tx + dx, tz + dz]
        const nearEdge = Math.abs(x - (ox + 0.5) * MAP_TILE) < MAP_TILE / 2 + 4 && Math.abs(z - (oz + 0.5) * MAP_TILE) < MAP_TILE / 2 + 4
        if (nearEdge) this.tiles.delete(k)
      }
    }
  }

  show(view: MapView): void {
    this.open = true
    this.view = view
    this.follow = true
    this.cx = view.player.x
    this.cz = view.player.z
    this.el.classList.remove('hidden')
    this.el.classList.remove('closing')
    this.openT = performance.now()
    this.resize()
    this.dirty = true
  }

  hide(): void {
    this.open = false
    this.el.classList.add('hidden')
    this.hover.classList.add('hidden')
  }

  setView(view: MapView): void {
    this.view = view
    if (this.follow) {
      this.cx = view.player.x
      this.cz = view.player.z
    }
    this.dirty = true
  }

  private recenter(): void {
    if (!this.view) return
    this.follow = true
    this.cx = this.view.player.x
    this.cz = this.view.player.z
    this.dirty = true
  }

  private setScale(s: number): void {
    this.scale = Math.min(6, Math.max(0.25, s))
    this.dirty = true
  }

  private zoom(f: number, sx?: number, sy?: number): void {
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    const ax = sx ?? w / 2
    const ay = sy ?? h / 2
    const wx = this.cx + (ax - w / 2) / this.scale
    const wz = this.cz + (ay - h / 2) / this.scale
    this.setScale(this.scale * f)
    this.cx = wx - (ax - w / 2) / this.scale
    this.cz = wz - (ay - h / 2) / this.scale
    if (sx !== undefined) this.follow = false
  }

  private resize(): void {
    const dpr = Math.min(2, devicePixelRatio || 1)
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr))
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr))
    for (const c of [this.canvas, this.layer, this.mask]) {
      if (c.width !== w || c.height !== h) {
        c.width = w
        c.height = h
      }
    }
  }

  /** Background tile rendering. Call every frame with a time budget (ms). */
  work(budgetMs: number, px: number, pz: number): void {
    const t = this.terrain()
    if (!t) return
    // Keep the queue topped up with explored tiles that have no cache, nearest first.
    if (this.queue.length < 3) {
      const cx = this.open ? this.cx : px
      const cz = this.open ? this.cz : pz
      let best: [number, number] | null = null
      for (const k of this.explored) {
        if (this.tiles.has(k) || this.queued.has(k)) continue
        const [tx, tz] = tileXZ(k)
        const d = Math.hypot((tx + 0.5) * MAP_TILE - cx, (tz + 0.5) * MAP_TILE - cz)
        if (!best || d < best[1]) best = [k, d]
      }
      if (best) {
        const [tx, tz] = tileXZ(best[0])
        this.queued.add(best[0])
        this.queue.push({ key: best[0], tx, tz, row: -1, img: new ImageData(TILE_PX, TILE_PX), heights: new Float32Array((TILE_PX + 2) * (TILE_PX + 2)) })
      }
    }
    const end = performance.now() + budgetMs
    while (this.queue.length && performance.now() < end) {
      const job = this.queue[0]
      this.renderRow(t, job)
      if (job.row >= TILE_PX) {
        this.queue.shift()
        this.queued.delete(job.key)
        const c = document.createElement('canvas')
        c.width = c.height = TILE_PX
        c.getContext('2d')!.putImageData(job.img, 0, 0)
        this.tiles.set(job.key, c)
        this.dirty = true
      }
    }
  }

  private renderRow(t: MapTerrain, job: Job): void {
    const step = MAP_TILE / TILE_PX
    const x0 = job.tx * MAP_TILE
    const z0 = job.tz * MAP_TILE
    const W = TILE_PX + 2
    if (job.row < 0) {
      // Heights including a one-pixel border for hill shading and contours.
      for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) job.heights[j * W + i] = t.height(x0 + (i - 0.5) * step, z0 + (j - 0.5) * step)
      job.row = 0
      return
    }
    const j = job.row
    const data = job.img.data
    for (let i = 0; i < TILE_PX; i++) {
      const x = x0 + (i + 0.5) * step
      const z = z0 + (j + 0.5) * step
      const hc = job.heights[(j + 1) * W + i + 1]
      const hl = job.heights[(j + 1) * W + i]
      const hr = job.heights[(j + 1) * W + i + 2]
      const hu = job.heights[j * W + i + 1]
      const hd = job.heights[(j + 2) * W + i + 1]
      let r: number, g: number, b: number
      if (hc < 0.15) {
        const depth = Math.min(1, -hc / 14)
        r = 96 - depth * 46
        g = 136 - depth * 44
        b = 140 - depth * 22
        // Shoreline foam band.
        if (hc > -0.9) { r += 30; g += 26; b += 16 }
      } else {
        const s = t.surfaceAt(x, z)
        ;[r, g, b] = SURFACE_RGB[s]
        if (s === 'grass') {
          const m = t.moisture(x, z)
          r -= m * 34
          g -= m * 12
          b -= m * 18
        }
        // Hillshade from the north-west.
        const dx = (hr - hl) / (2 * step)
        const dz = (hd - hu) / (2 * step)
        const shade = Math.max(0.55, Math.min(1.3, 1 + (-dx - dz) * 0.55))
        r *= shade
        g *= shade
        b *= shade
        // Contour every 6 m.
        const band = Math.floor(hc / 6)
        if (band !== Math.floor(hr / 6) || band !== Math.floor(hd / 6)) { r *= 0.8; g *= 0.78; b *= 0.74 }
      }
      const o = (j * TILE_PX + i) * 4
      data[o] = r
      data[o + 1] = g
      data[o + 2] = b
      data[o + 3] = 255
    }
    job.row++
  }

  private makePaper(): HTMLCanvasElement {
    const c = document.createElement('canvas')
    c.width = c.height = 256
    const g = c.getContext('2d')!
    g.fillStyle = '#d8c6a0'
    g.fillRect(0, 0, 256, 256)
    const img = g.getImageData(0, 0, 256, 256)
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 18
      img.data[i] += n
      img.data[i + 1] += n
      img.data[i + 2] += n * 0.8
    }
    g.putImageData(img, 0, 0)
    g.strokeStyle = 'rgba(120, 92, 58, 0.08)'
    for (let i = -256; i < 256; i += 7) {
      g.beginPath()
      g.moveTo(i, 0)
      g.lineTo(i + 256, 256)
      g.stroke()
    }
    return c
  }

  /** Pin under a screen point (the pin head floats ~20 px above its ground point). */
  private pinAt(sx: number, sy: number): MapPin | null {
    const v = this.view
    if (!v) return null
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    for (let i = v.pins.length - 1; i >= 0; i--) {
      const pin = v.pins[i]
      const [px, py] = this.toScreen(pin.x, pin.z, w, h)
      if (Math.hypot(px - sx, py - 18 - sy) < 14 || Math.hypot(px - sx, py - sy) < 8) return pin
    }
    return null
  }

  private clickAt(sx: number, sy: number): void {
    if (!this.pinApi || !this.view) return
    const hit = this.pinAt(sx, sy)
    if (hit) this.pinApi.remove(hit.id)
    else {
      const w = this.canvas.clientWidth
      const h = this.canvas.clientHeight
      this.pinApi.add(this.cx + (sx - w / 2) / this.scale, this.cz + (sy - h / 2) / this.scale)
    }
    this.dirty = true
    this.updateHover(sx, sy)
  }

  private toScreen(x: number, z: number, w: number, h: number): [number, number] {
    return [w / 2 + (x - this.cx) * this.scale, h / 2 + (z - this.cz) * this.scale]
  }

  private updateHover(sx: number, sy: number): void {
    const v = this.view
    if (!v) return
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    let text = ''
    const pin = this.pinAt(sx, sy)
    if (pin) text = `Waypoint ${pin.n} · ${Math.round(Math.hypot(pin.x - v.player.x, pin.z - v.player.z))} m — click to remove`
    if (!text) for (const p of v.pois) {
      const [px, py] = this.toScreen(p.x, p.z, w, h)
      if (Math.hypot(px - sx, py - sy) < 16 && this.explored.has(tileKey(Math.floor(p.x / MAP_TILE), Math.floor(p.z / MAP_TILE)))) {
        text = p.known ? POI_NAMES[p.type] : 'Unvisited landmark'
        break
      }
    }
    if (!text && v.camp) {
      const [px, py] = this.toScreen(v.camp.x, v.camp.z, w, h)
      if (Math.hypot(px - sx, py - sy) < 16) text = 'Camp — your respawn point'
    }
    const wx = this.cx + (sx - w / 2) / this.scale
    const wz = this.cz + (sy - h / 2) / this.scale
    if (!text && this.explored.has(tileKey(Math.floor(wx / MAP_TILE), Math.floor(wz / MAP_TILE)))) {
      const d = Math.hypot(wx - v.player.x, wz - v.player.z)
      text = `${Math.round(d)} m away`
    }
    if (!text) { this.hover.classList.add('hidden'); return }
    this.hover.textContent = text
    this.hover.style.transform = `translate(${sx + 14}px, ${sy + 10}px)`
    this.hover.classList.remove('hidden')
  }

  /** Redraw if anything changed. Call every frame while open. */
  draw(): void {
    if (!this.open || !this.view) return
    if (!this.dirty) return
    this.dirty = false
    this.resize()
    const dpr = this.canvas.width / Math.max(1, this.canvas.clientWidth)
    const W = this.canvas.width
    const H = this.canvas.height
    const w = W / dpr
    const h = H / dpr
    const ctx = this.ctx
    const v = this.view
    // Parchment base.
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = ctx.createPattern(this.paper, 'repeat')!
    ctx.fillRect(0, 0, W, H)

    // Terrain layer masked by a feathered explored-area mask.
    const L = this.layer.getContext('2d')!
    const M = this.mask.getContext('2d')!
    L.setTransform(1, 0, 0, 1, 0, 0)
    L.clearRect(0, 0, W, H)
    M.setTransform(1, 0, 0, 1, 0, 0)
    M.clearRect(0, 0, W, H)
    L.setTransform(dpr, 0, 0, dpr, 0, 0)
    M.setTransform(dpr, 0, 0, dpr, 0, 0)
    L.imageSmoothingEnabled = this.scale < 1.2
    const tpx = MAP_TILE * this.scale
    const tx0 = Math.floor((this.cx - w / 2 / this.scale) / MAP_TILE) - 1
    const tx1 = Math.floor((this.cx + w / 2 / this.scale) / MAP_TILE) + 1
    const tz0 = Math.floor((this.cz - h / 2 / this.scale) / MAP_TILE) - 1
    const tz1 = Math.floor((this.cz + h / 2 / this.scale) / MAP_TILE) + 1
    M.fillStyle = '#fff'
    for (let tx = tx0; tx <= tx1; tx++) {
      for (let tz = tz0; tz <= tz1; tz++) {
        const k = tileKey(tx, tz)
        if (!this.explored.has(k)) continue
        const [sx, sy] = this.toScreen(tx * MAP_TILE, tz * MAP_TILE, w, h)
        M.fillRect(sx - 1, sy - 1, tpx + 2, tpx + 2)
        const tile = this.tiles.get(k)
        if (tile) L.drawImage(tile, sx, sy, tpx + 0.6, tpx + 0.6)
        else {
          L.fillStyle = 'rgba(150, 132, 100, 0.5)'
          L.fillRect(sx, sy, tpx, tpx)
        }
      }
    }
    // Feather the fog edge.
    L.setTransform(1, 0, 0, 1, 0, 0)
    L.globalCompositeOperation = 'destination-in'
    L.filter = `blur(${Math.max(4, tpx * 0.18) * dpr}px)`
    L.drawImage(this.mask, 0, 0)
    L.filter = 'none'
    L.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 0.92
    ctx.drawImage(this.layer, 0, 0)
    ctx.globalAlpha = 1
    // Sepia wash so the map reads as ink on parchment.
    ctx.globalCompositeOperation = 'multiply'
    ctx.fillStyle = 'rgba(232, 214, 176, 0.55)'
    ctx.fillRect(0, 0, W, H)
    ctx.globalCompositeOperation = 'source-over'

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    // Grid every 128 m.
    ctx.strokeStyle = 'rgba(92, 66, 38, 0.13)'
    ctx.lineWidth = 1
    const grid = 128
    for (let gx = Math.floor((this.cx - w / 2 / this.scale) / grid) * grid; gx < this.cx + w / 2 / this.scale; gx += grid) {
      const [sx] = this.toScreen(gx, 0, w, h)
      ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, h); ctx.stroke()
    }
    for (let gz = Math.floor((this.cz - h / 2 / this.scale) / grid) * grid; gz < this.cz + h / 2 / this.scale; gz += grid) {
      const [, sy] = this.toScreen(0, gz, w, h)
      ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(w, sy); ctx.stroke()
    }

    // Builds.
    for (const p of v.pieces) {
      const [sx, sy] = this.toScreen(p.x, p.z, w, h)
      if (sx < -10 || sy < -10 || sx > w + 10 || sy > h + 10) continue
      const pw = Math.max(2, p.w * this.scale)
      const pd = Math.max(2, p.d * this.scale)
      ctx.fillStyle = p.kind === 'light' ? '#e8943c' : p.kind === 'chest' ? '#9c7b48' : p.kind === 'station' ? '#6b4a32' : 'rgba(84, 56, 34, 0.85)'
      ctx.fillRect(sx - pw / 2, sy - pd / 2, pw, pd)
    }

    // Points of interest.
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const p of v.pois) {
      if (!this.explored.has(tileKey(Math.floor(p.x / MAP_TILE), Math.floor(p.z / MAP_TILE)))) continue
      const [sx, sy] = this.toScreen(p.x, p.z, w, h)
      if (sx < -40 || sy < -40 || sx > w + 40 || sy > h + 40) continue
      ctx.beginPath()
      ctx.arc(sx, sy, 11, 0, Math.PI * 2)
      ctx.fillStyle = p.known ? 'rgba(242, 180, 77, 0.95)' : 'rgba(120, 100, 76, 0.7)'
      ctx.fill()
      ctx.lineWidth = 2
      ctx.strokeStyle = 'rgba(58, 38, 20, 0.9)'
      ctx.stroke()
      ctx.fillStyle = '#2b1b0e'
      ctx.font = '600 13px Sora, system-ui, sans-serif'
      ctx.fillText(p.known ? POI_GLYPH[p.type] : '?', sx, sy + 0.5)
      if (p.known && this.scale > 0.6) {
        ctx.font = '600 11px Sora, system-ui, sans-serif'
        ctx.lineWidth = 3
        ctx.strokeStyle = 'rgba(236, 222, 190, 0.9)'
        ctx.strokeText(POI_NAMES[p.type], sx, sy + 21)
        ctx.fillStyle = '#3a2614'
        ctx.fillText(POI_NAMES[p.type], sx, sy + 21)
      }
    }

    // Camp.
    if (v.camp) {
      const [sx, sy] = this.toScreen(v.camp.x, v.camp.z, w, h)
      const pulse = 1 + Math.sin(performance.now() / 300) * 0.08
      ctx.beginPath()
      ctx.arc(sx, sy, 15 * pulse, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(232, 120, 42, 0.25)'
      ctx.fill()
      const img = this.icons.campfire
      if (img?.complete && img.naturalWidth) ctx.drawImage(img, sx - 13, sy - 13, 26, 26)
      this.dirty = true // keep the pulse alive
    }

    // Waypoints: a teardrop pin that drops in with a bounce and a ripple.
    {
      const now = performance.now()
      const live = new Set<number>()
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      for (const pin of v.pins) {
        live.add(pin.id)
        if (!this.pinT.has(pin.id)) this.pinT.set(pin.id, now)
        const age = (now - this.pinT.get(pin.id)!) / 1000
        const [sx, sy] = this.toScreen(pin.x, pin.z, w, h)
        if (sx < -40 || sy < -60 || sx > w + 40 || sy > h + 40) continue
        const fall = Math.min(1, age / 0.45)
        const bounce = fall < 1 ? -46 * (1 - fall * fall) : -Math.abs(Math.sin(Math.min(1, (age - 0.45) / 0.35) * Math.PI)) * 7 * Math.max(0, 1 - (age - 0.45) / 0.35)
        if (age < 1.2) this.dirty = true
        // Ground shadow and landing ripple.
        ctx.beginPath()
        ctx.ellipse(sx, sy, 6 * (0.6 + 0.4 * fall), 2.6, 0, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(40, 24, 10, 0.35)'
        ctx.fill()
        if (age > 0.4 && age < 1.2) {
          const r = (age - 0.4) / 0.8
          ctx.beginPath()
          ctx.ellipse(sx, sy, 6 + r * 26, 2.5 + r * 10, 0, 0, Math.PI * 2)
          ctx.strokeStyle = pin.color
          ctx.globalAlpha = 1 - r
          ctx.lineWidth = 2.5
          ctx.stroke()
          ctx.globalAlpha = 1
        }
        const hy = sy - 20 + bounce
        ctx.beginPath()
        ctx.moveTo(sx, sy + bounce)
        ctx.bezierCurveTo(sx - 4, hy + 10, sx - 10, hy + 5, sx - 10, hy)
        ctx.arc(sx, hy, 10, Math.PI, 0)
        ctx.bezierCurveTo(sx + 10, hy + 5, sx + 4, hy + 10, sx, sy + bounce)
        ctx.closePath()
        ctx.fillStyle = pin.color
        ctx.fill()
        ctx.lineWidth = 2
        ctx.strokeStyle = 'rgba(40, 26, 14, 0.9)'
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(sx, hy, 6, 0, Math.PI * 2)
        ctx.fillStyle = '#fff6e4'
        ctx.fill()
        ctx.fillStyle = '#3a2614'
        ctx.font = '800 10px Sora, system-ui, sans-serif'
        ctx.fillText(String(pin.n), sx, hy + 0.5)
      }
      for (const id of this.pinT.keys()) if (!live.has(id)) this.pinT.delete(id)
      this.clearBtn.classList.toggle('hidden', v.pins.length === 0)
    }

    // Player arrow (yaw 0 faces −z, i.e. up the map).
    {
      const [sx, sy] = this.toScreen(v.player.x, v.player.z, w, h)
      ctx.save()
      ctx.translate(sx, sy)
      ctx.rotate(-v.player.yaw)
      ctx.beginPath()
      ctx.arc(0, 0, 18, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5)
      ctx.lineTo(0, 0)
      ctx.closePath()
      ctx.fillStyle = 'rgba(255, 236, 190, 0.35)'
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(0, -11)
      ctx.lineTo(7.5, 8)
      ctx.lineTo(0, 4)
      ctx.lineTo(-7.5, 8)
      ctx.closePath()
      ctx.fillStyle = '#c8452f'
      ctx.fill()
      ctx.lineWidth = 2
      ctx.strokeStyle = '#fff4dc'
      ctx.stroke()
      ctx.restore()
    }

    // Scale bar.
    const target = 120 / this.scale
    const nice = [10, 25, 50, 100, 200, 250, 500, 1000].find(n => n >= target) ?? 1000
    const bar = nice * this.scale
    ctx.fillStyle = 'rgba(58, 38, 20, 0.85)'
    ctx.fillRect(28, h - 34, bar, 4)
    ctx.fillRect(28, h - 40, 2, 12)
    ctx.fillRect(28 + bar - 2, h - 40, 2, 12)
    ctx.font = '600 11px Sora, system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText(`${nice} m`, 28, h - 48)

    const sub = this.el.querySelector('.map-sub')!
    const subText = `Day ${v.day} · ${v.time} · ${this.explored.size} regions explored`
    if (sub.textContent !== subText) sub.textContent = subText
    const read = `X ${Math.round(v.player.x)} · Z ${Math.round(v.player.z)}`
    if (this.readout.textContent !== read) this.readout.textContent = read
    if (performance.now() - this.openT < 400) this.dirty = true
  }
}
