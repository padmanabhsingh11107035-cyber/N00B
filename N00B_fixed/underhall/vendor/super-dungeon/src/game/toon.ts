import * as THREE from 'three'

/**
 * Comic-book look helpers: 3-band toon shading, inverted-hull ink outlines and small canvas
 * textures (paper, chalkboards, banners) drawn at runtime so the game ships no image files.
 */

let gradient: THREE.DataTexture | undefined
export function toonGradient(): THREE.DataTexture {
  if (gradient) return gradient
  const data = new Uint8Array([70, 70, 70, 255, 160, 160, 160, 255, 255, 255, 255, 255])
  gradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat)
  gradient.minFilter = THREE.NearestFilter
  gradient.magFilter = THREE.NearestFilter
  gradient.generateMipmaps = false
  gradient.needsUpdate = true
  return gradient
}

const toonCache = new Map<string, THREE.MeshStandardMaterial>()
/**
 * Shared PBR surface for procedural parts (historically a toon ramp; kept under the old name so
 * every builder upgraded at once). Lit by the scene environment map, casts/receives shadows.
 */
export function toon(color: THREE.ColorRepresentation, opts: { emissive?: THREE.ColorRepresentation; emissiveIntensity?: number; key?: string; roughness?: number; metalness?: number } = {}): THREE.MeshStandardMaterial {
  const key = `${new THREE.Color(color).getHexString()}|${opts.emissive ? new THREE.Color(opts.emissive).getHexString() : ''}|${opts.emissiveIntensity ?? 0}|${opts.key ?? ''}|${opts.roughness ?? ''}|${opts.metalness ?? ''}`
  let m = toonCache.get(key)
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: opts.roughness ?? 0.55, metalness: opts.metalness ?? 0.05 })
    if (opts.emissive) {
      m.emissive = new THREE.Color(opts.emissive)
      m.emissiveIntensity = opts.emissiveIntensity ?? 1
    }
    toonCache.set(key, m)
  }
  return m
}
const glowCache = new Map<string, THREE.MeshBasicMaterial>()
/** Unlit, un-tonemapped colour: reads as neon and feeds bloom. */
export function glow(color: THREE.ColorRepresentation, opacity = 1): THREE.MeshBasicMaterial {
  const key = `${new THREE.Color(color).getHexString()}|${opacity}`
  let m = glowCache.get(key)
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 })
    glowCache.set(key, m)
  }
  return m
}

export const INK = '#120d1f'
const inkMat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide })
const eliteInk = new THREE.MeshBasicMaterial({ color: '#ffcf4d', side: THREE.BackSide, toneMapped: false })

/**
 * Ink outlines are retired with the realistic look; only elites keep a thin gold back-face shell
 * as a gameplay read. Regular calls are no-ops.
 */
export function outline(root: THREE.Object3D, thickness = 0.045, elite = false): void {
  if (!elite) return
  const targets: THREE.Mesh[] = []
  root.traverse(o => {
    const m = o as THREE.Mesh
    if (m.isMesh && !m.userData.noOutline && m.material instanceof THREE.MeshStandardMaterial) targets.push(m)
  })
  for (const m of targets) {
    m.geometry.computeBoundingSphere()
    const r = m.geometry.boundingSphere?.radius ?? 1
    const shell = new THREE.Mesh(m.geometry, elite ? eliteInk : inkMat)
    shell.userData.noOutline = true
    shell.userData.shell = true
    const k = 1 + (elite ? thickness * 1.8 : thickness) / Math.max(0.05, r)
    shell.scale.setScalar(k)
    shell.raycast = () => undefined
    m.add(shell)
  }
}

export function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, parent?: THREE.Object3D): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat)
  m.position.set(x, y, z)
  m.castShadow = !(mat instanceof THREE.MeshBasicMaterial)
  parent?.add(m)
  return m
}

// ─── Canvas textures ──────────────────────────────────────────────────────

const texCache = new Map<string, THREE.CanvasTexture>()
export function canvasTexture(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  let t = texCache.get(key)
  if (t) return t
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d')!)
  t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  texCache.set(key, t)
  return t
}

export function paperTexture(): THREE.CanvasTexture {
  return canvasTexture('paper', 128, 160, g => {
    g.fillStyle = '#fbf6e9'
    g.fillRect(0, 0, 128, 160)
    g.strokeStyle = '#9cc3ff'
    g.lineWidth = 2
    for (let y = 30; y < 160; y += 14) {
      g.beginPath()
      g.moveTo(10, y)
      g.lineTo(118, y)
      g.stroke()
    }
    g.strokeStyle = '#ff8fa3'
    g.beginPath()
    g.moveTo(22, 0)
    g.lineTo(22, 160)
    g.stroke()
    g.fillStyle = '#e8384f'
    g.font = 'bold 76px Bangers, Impact, sans-serif'
    g.textAlign = 'center'
    g.fillText('F', 70, 108)
    g.beginPath()
    g.lineWidth = 5
    g.strokeStyle = '#e8384f'
    g.arc(70, 84, 40, 0, Math.PI * 2)
    g.stroke()
  })
}

export function chalkboardTexture(): THREE.CanvasTexture {
  return canvasTexture('chalk', 256, 128, g => {
    g.fillStyle = '#23402f'
    g.fillRect(0, 0, 256, 128)
    g.strokeStyle = '#8a5a2b'
    g.lineWidth = 10
    g.strokeRect(0, 0, 256, 128)
    g.fillStyle = 'rgba(255,255,255,0.85)'
    g.font = '22px Bangers, Impact, sans-serif'
    g.fillText('E = mc² + COURAGE', 20, 40)
    g.fillText('POWERS 101: DO NOT', 20, 72)
    g.fillText('OPEN THE VAULT', 20, 100)
    g.strokeStyle = 'rgba(255,255,255,0.6)'
    g.lineWidth = 2
    g.beginPath()
    g.arc(210, 80, 22, 0, Math.PI * 1.6)
    g.stroke()
  })
}

export function bannerTexture(text: string, bg: string, fg: string): THREE.CanvasTexture {
  return canvasTexture(`banner:${text}:${bg}:${fg}`, 128, 256, g => {
    g.fillStyle = bg
    g.beginPath()
    g.moveTo(0, 0)
    g.lineTo(128, 0)
    g.lineTo(128, 220)
    g.lineTo(64, 256)
    g.lineTo(0, 220)
    g.closePath()
    g.fill()
    g.strokeStyle = fg
    g.lineWidth = 6
    g.strokeRect(10, 10, 108, 190)
    g.fillStyle = fg
    g.textAlign = 'center'
    g.font = '44px Bangers, Impact, sans-serif'
    const words = text.split(' ')
    words.forEach((w, i) => g.fillText(w, 64, 70 + i * 50))
  })
}

export function lockerTexture(color: string): THREE.CanvasTexture {
  return canvasTexture(`locker:${color}`, 256, 256, g => {
    g.fillStyle = color
    g.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 4; i += 1) {
      const x = i * 64
      g.strokeStyle = 'rgba(0,0,0,0.45)'
      g.lineWidth = 4
      g.strokeRect(x + 3, 3, 58, 250)
      g.fillStyle = 'rgba(0,0,0,0.35)'
      for (let v = 0; v < 4; v += 1) g.fillRect(x + 16, 20 + v * 9, 30, 4)
      g.fillStyle = '#d9d4c7'
      g.fillRect(x + 46, 120, 6, 22)
    }
  })
}

export function booksTexture(): THREE.CanvasTexture {
  return canvasTexture('books', 256, 256, g => {
    g.fillStyle = '#3b2415'
    g.fillRect(0, 0, 256, 256)
    const colors = ['#7a3b8f', '#2f5d9f', '#b33a3a', '#c98f3a', '#3f8f5f', '#5a4a8a', '#8f2f5f']
    for (let shelf = 0; shelf < 4; shelf += 1) {
      let x = 6
      const y0 = shelf * 64 + 8
      while (x < 250) {
        const w = 8 + ((x * 7 + shelf * 13) % 10)
        const h = 44 + ((x * 3) % 10)
        g.fillStyle = colors[(x + shelf * 3) % colors.length]
        g.fillRect(x, y0 + 52 - h, w, h)
        x += w + 2
      }
      g.fillStyle = '#23140b'
      g.fillRect(0, y0 + 52, 256, 8)
    }
  })
}

export function posterTexture(title: string, color: string): THREE.CanvasTexture {
  return canvasTexture(`poster:${title}:${color}`, 128, 180, g => {
    g.fillStyle = '#fff4d8'
    g.fillRect(0, 0, 128, 180)
    g.fillStyle = color
    g.fillRect(8, 8, 112, 110)
    // Halftone dots: the comic print look.
    g.fillStyle = 'rgba(255,255,255,0.35)'
    for (let y = 12; y < 116; y += 8) for (let x = 12; x < 118; x += 8) {
      g.beginPath()
      g.arc(x + ((y / 8) % 2) * 4, y, 1.8, 0, Math.PI * 2)
      g.fill()
    }
    g.fillStyle = '#120d1f'
    g.textAlign = 'center'
    g.font = '26px Bangers, Impact, sans-serif'
    title.split('\n').forEach((line, i) => g.fillText(line, 64, 146 + i * 26))
  })
}

export function stripeTexture(color: string): THREE.CanvasTexture {
  const t = canvasTexture(`stripe:${color}`, 64, 64, g => {
    g.fillStyle = 'rgba(0,0,0,0)'
    g.clearRect(0, 0, 64, 64)
    g.fillStyle = color
    for (let i = -64; i < 128; i += 16) {
      g.beginPath()
      g.moveTo(i, 0)
      g.lineTo(i + 8, 0)
      g.lineTo(i + 8 - 64, 64)
      g.lineTo(i - 64, 64)
      g.closePath()
      g.fill()
    }
  })
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

export function crestTexture(): THREE.CanvasTexture {
  return canvasTexture('crest', 256, 256, g => {
    g.translate(128, 128)
    g.fillStyle = 'rgba(255, 211, 92, 0.9)'
    g.beginPath()
    g.moveTo(0, -110)
    g.lineTo(90, -70)
    g.lineTo(80, 30)
    g.quadraticCurveTo(50, 90, 0, 115)
    g.quadraticCurveTo(-50, 90, -80, 30)
    g.lineTo(-90, -70)
    g.closePath()
    g.fill()
    g.fillStyle = '#1b1838'
    g.beginPath()
    g.moveTo(0, -88)
    g.lineTo(70, -56)
    g.lineTo(62, 24)
    g.quadraticCurveTo(38, 72, 0, 92)
    g.quadraticCurveTo(-38, 72, -62, 24)
    g.lineTo(-70, -56)
    g.closePath()
    g.fill()
    g.fillStyle = '#ffd35c'
    g.font = '120px Bangers, Impact, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('A', 0, 10)
  })
}
