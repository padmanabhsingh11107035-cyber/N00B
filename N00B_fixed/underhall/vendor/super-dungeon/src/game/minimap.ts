import * as THREE from 'three'
import type { DungeonPlan, RoomPlan } from './dungeon'
import { TILE } from './dungeon'

export type MapState = { discovered: Set<number>; visited: Set<number>; cleared: Set<number>; current: number; bossDefeated: boolean }

export const ROOM_ICON: Record<RoomPlan['kind'], { glyph: string; color: string; label: string }> = {
  entrance: { glyph: 'S', color: '#b7c4ff', label: 'Entry stairwell' },
  combat: { glyph: '', color: '#ff9aa9', label: 'Combat' },
  elite: { glyph: 'E', color: '#ff4f6d', label: 'Elite encounter' },
  boss: { glyph: 'B', color: '#ff2d55', label: 'The Proctor' },
  exit: { glyph: 'X', color: '#7ef9ff', label: 'Exit portal' },
  heal: { glyph: '+', color: '#6dff9e', label: 'Healing fountain' },
  shop: { glyph: '$', color: '#ffd35c', label: 'School store' },
  rescue: { glyph: '!', color: '#7ef9ff', label: 'Trapped classmate' },
  challenge: { glyph: 'C', color: '#ff7a45', label: 'Challenge (relic)' },
  lore: { glyph: '?', color: '#c58cff', label: 'Lore page' },
  treasure: { glyph: 'T', color: '#ffcf4d', label: 'Treasure' },
}

const center = (r: RoomPlan) => ({ x: r.x0 + r.w / 2, y: r.y0 + r.h / 2 })

/**
 * Draws the floor map. The minimap follows the hero; the full map fits every discovered room.
 * Coordinates are tiles (1 tile = 2 m); the hero's world position converts with TILE.
 */
export function drawMap(canvas: HTMLCanvasElement, plan: DungeonPlan, st: MapState, hero: THREE.Vector3, facing: number, full: boolean): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const cssW = canvas.clientWidth || 160
  const cssH = canvas.clientHeight || 160
  if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
    canvas.width = Math.round(cssW * dpr)
    canvas.height = Math.round(cssH * dpr)
  }
  const c = canvas.getContext('2d')
  if (!c) return
  c.setTransform(dpr, 0, 0, dpr, 0, 0)
  c.clearRect(0, 0, cssW, cssH)
  const hx = hero.x / TILE
  const hy = hero.z / TILE
  let scale: number
  let ox: number
  let oy: number
  if (full) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const r of plan.rooms) {
      if (!st.discovered.has(r.id)) continue
      minX = Math.min(minX, r.x0 - 2)
      minY = Math.min(minY, r.y0 - 2)
      maxX = Math.max(maxX, r.x0 + r.w + 2)
      maxY = Math.max(maxY, r.y0 + r.h + 2)
    }
    if (!Number.isFinite(minX)) return
    scale = Math.min(cssW / (maxX - minX), cssH / (maxY - minY))
    ox = cssW / 2 - ((minX + maxX) / 2) * scale
    oy = cssH / 2 - ((minY + maxY) / 2) * scale
  } else {
    scale = 2.6
    ox = cssW / 2 - hx * scale
    oy = cssH / 2 - hy * scale
  }
  const X = (x: number) => ox + x * scale
  const Y = (y: number) => oy + y * scale

  // Connections first.
  c.lineCap = 'round'
  for (const r of plan.rooms) {
    if (!st.visited.has(r.id)) continue
    for (const l of r.links) {
      if (!st.discovered.has(l.to)) continue
      const a = center(r)
      const b = center(plan.rooms[l.to])
      c.strokeStyle = st.visited.has(l.to) ? 'rgba(255,244,216,0.55)' : 'rgba(255,244,216,0.22)'
      c.lineWidth = Math.max(2, scale * 1.4)
      c.beginPath()
      c.moveTo(X(a.x), Y(a.y))
      c.lineTo(X(b.x), Y(b.y))
      c.stroke()
    }
  }
  for (const r of plan.rooms) {
    if (!st.discovered.has(r.id)) continue
    const visited = st.visited.has(r.id)
    const x = X(r.x0)
    const y = Y(r.y0)
    const w = r.w * scale
    const h = r.h * scale
    const icon = ROOM_ICON[r.kind]
    c.fillStyle = visited ? (st.cleared.has(r.id) ? 'rgba(62,70,140,0.92)' : 'rgba(120,40,70,0.9)') : 'rgba(30,26,60,0.75)'
    c.strokeStyle = r.id === st.current ? '#ffd35c' : visited ? 'rgba(255,244,216,0.7)' : 'rgba(255,244,216,0.3)'
    c.lineWidth = r.id === st.current ? 2.5 : 1.25
    if (!visited) c.setLineDash([3, 3])
    c.beginPath()
    c.roundRect(x, y, w, h, Math.min(6, scale * 1.5))
    c.fill()
    c.stroke()
    c.setLineDash([])
    if (icon.glyph && (visited || r.kind === 'boss' || full)) {
      const cx = x + w / 2
      const cy = y + h / 2
      const rad = Math.max(6, Math.min(12, scale * 2.6))
      const done = (r.kind === 'boss' && st.bossDefeated) || ((r.kind === 'elite' || r.kind === 'challenge' || r.kind === 'rescue') && st.cleared.has(r.id))
      c.fillStyle = done ? 'rgba(255,255,255,0.25)' : icon.color
      c.beginPath()
      c.arc(cx, cy, rad, 0, Math.PI * 2)
      c.fill()
      c.strokeStyle = '#1b1838'
      c.lineWidth = 2
      c.stroke()
      c.fillStyle = '#1b1838'
      c.font = `800 ${Math.round(rad * 1.25)}px Figtree, system-ui, sans-serif`
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.fillText(icon.glyph, cx, cy + 1)
    }
  }
  // Hero arrow.
  const px = X(hx)
  const py = Y(hy)
  const dx = -Math.sin(facing)
  const dy = -Math.cos(facing)
  const s = full ? 9 : 7
  c.fillStyle = '#ffd35c'
  c.strokeStyle = '#1b1838'
  c.lineWidth = 2
  c.beginPath()
  c.moveTo(px + dx * s * 1.4, py + dy * s * 1.4)
  c.lineTo(px - dx * s + -dy * s * 0.8, py - dy * s + dx * s * 0.8)
  c.lineTo(px - dx * s * 0.4, py - dy * s * 0.4)
  c.lineTo(px - dx * s - -dy * s * 0.8, py - dy * s - dx * s * 0.8)
  c.closePath()
  c.fill()
  c.stroke()
}
