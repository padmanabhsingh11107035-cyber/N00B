// Cape clipping probe. Freezes the page loop, steps the game at exactly 1/60 s, and for every
// sampled frame renders the hero from directly behind twice with flat colours:
//   pass 1: cape only (red)            -> the cape's silhouette
//   pass 2: cape (red) + body (green)  -> any green pixel inside the silhouette is body in front
//                                         of the cape as seen from behind, i.e. clipping.
// Reports clip pixels / cape pixels per phase (idle, run, sprint, stop) and saves the worst frame.
// Usage: node scripts/cape-clip.mjs [outDir]   (dev server on :3000)
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
const out = process.argv[2] ?? '/tmp/capeclip'
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 480, height: 600 } })
const errors = []
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`))
const wait = ms => page.waitForTimeout(ms)
const g = (fn, arg) => page.evaluate(fn, arg)
await page.goto('http://127.0.0.1:3000/?debug=1', { waitUntil: 'load' })
await page.waitForFunction(() => window.__aegis?.campusLive, null, { timeout: 120000 })
await page.click('.title-menu .btn.primary')
await wait(300)
for (let i = 0; i < 3; i += 1) { const b = await page.$('.modal .btn.primary'); if (b) await b.click(); await wait(250) }
await page.waitForFunction(() => !!window.__aegis.hero.rig?.cape, null, { timeout: 60000 })
await g(() => window.__aegis.startRun(12345))
await page.waitForFunction(() => !window.__aegis.loading, null, { timeout: 90000 })
await wait(800)
const c0 = await g(() => { const a = window.__aegis; const c = a.level.roomCenter(a.run.plan.rooms[a.run.plan.path[0]]); return { x: c.x, z: c.z } })
await g(() => { window.requestAnimationFrame = () => 0 })
await wait(300)

// In-page measurement helper.
await g(() => {
  const a = window.__aegis
  const r = a.renderer.gl
  const v = a.hero.rig
  const Basic = v.aura.material.constructor
  const red = new Basic({ color: 0xff0000, toneMapped: false, side: 2, fog: false })
  const green = new Basic({ color: 0x00ff00, toneMapped: false, side: 2, fog: false })
  const Cam = a.cam.camera.constructor
  const cam = new Cam(34, r.domElement.width / r.domElement.height, 0.05, 40)
  const capeMesh = v.cape.mesh
  const body = []
  v.char.root.traverse(o => { if (o.isMesh) body.push(o) })
  window.__clip = (pitch, keepImage) => {
    // Visibility: only the chain down to the hero root, then only cape + body meshes inside it.
    const saved = []
    const hide = o => { saved.push([o, o.visible]); o.visible = false }
    let chain = new Set()
    for (let o = v.root; o; o = o.parent) chain.add(o)
    const walk = o => { for (const ch of o.children) { if (ch === v.root) continue; if (chain.has(ch)) walk(ch); else hide(ch) } }
    walk(a.scene)
    v.root.traverse(o => { if (o === v.root || o === capeMesh || body.includes(o)) return; if (o.isMesh || o.isSprite || o.isPoints || o.isLine) hide(o) })
    const mats = new Map()
    const setMat = (m, mat) => { if (!mats.has(m)) mats.set(m, m.material); m.material = mat }
    const bg = a.scene.background, fog = a.scene.fog
    a.scene.background = null; a.scene.fog = null
    const clear = r.getClearColor(red.color.clone())
    const clearA = r.getClearAlpha()
    r.setClearColor(0x000000, 1)
    // Camera directly behind the torso (cape frame), looking at the upper back.
    const back = v.cape.back
    const neck = v.cape.neck
    const tx = neck.x, ty = neck.y - 0.45, tz = neck.z
    const dist = 3.4
    cam.position.set(tx + back.x * dist * Math.cos(pitch), ty + dist * Math.sin(pitch), tz + back.z * dist * Math.cos(pitch))
    cam.lookAt(tx, ty, tz)
    cam.updateMatrixWorld()
    const gl = r.getContext()
    const W = r.domElement.width, H = r.domElement.height
    const read = () => { const b = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, b); return b }
    r.setRenderTarget(null)
    // Pass 1: cape only.
    for (const m of body) { saved.push([m, m.visible]); m.visible = false }
    setMat(capeMesh, red)
    r.render(a.scene, cam)
    const p1 = read()
    for (const m of body) m.visible = true
    for (const m of body) setMat(m, green)
    r.render(a.scene, cam)
    const p2 = read()
    let capePx = 0, clipPx = 0
    for (let i = 0; i < p1.length; i += 4) {
      if (p1[i] > 128 && p1[i + 1] < 80) {
        capePx += 1
        if (p2[i + 1] > 128 && p2[i] < 80) clipPx += 1
      }
    }
    let img = null
    if (keepImage) {
      // Highlight clip pixels in yellow for the saved image.
      for (let i = 0; i < p1.length; i += 4) if (p1[i] > 128 && p1[i + 1] < 80 && p2[i + 1] > 128 && p2[i] < 80) { p2[i] = 255; p2[i + 1] = 255; p2[i + 2] = 0 }
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H
      const ctx = cv.getContext('2d'); const id = ctx.createImageData(W, H)
      for (let y = 0; y < H; y += 1) id.data.set(p2.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4)
      ctx.putImageData(id, 0, 0); img = cv.toDataURL('image/png')
    }
    // Restore.
    for (const [m, mat] of mats) m.material = mat
    for (let i = saved.length - 1; i >= 0; i -= 1) saved[i][0].visible = saved[i][1]
    a.scene.background = bg; a.scene.fog = fog
    r.setClearColor(clear, clearA)
    return { capePx, clipPx, img }
  }
})

const steps = n => g(k => { const a = window.__aegis; for (let i = 0; i < k; i += 1) { a.step(1 / 60); a.render(1, 1 / 60) } }, n)
const place = (dx, dz) => g(([c, d]) => { const a = window.__aegis; a.hero.place(c.x + d[0], c.z + d[1], Math.PI); a.cam.yaw = Math.PI; a.cam.snap() }, [c0, [dx, dz]])

// Which way does W run with cam.yaw = PI?
await place(0, 0); await steps(30)
await page.keyboard.down('KeyW'); await steps(20); await page.keyboard.up('KeyW')
const d = await g(c => { const p = window.__aegis.hero.pos; return { x: p.x - c.x, z: p.z - c.z } }, c0)
const len = Math.hypot(d.x, d.z) || 1
const dir = { x: d.x / len, z: d.z / len }

const results = {}
let worst = { ratio: -1 }
async function measure(phase, pitch) {
  const m = await g(([p]) => window.__clip(p, false), [pitch])
  const ratio = m.capePx ? m.clipPx / m.capePx : 0
  ;(results[phase] ??= []).push({ ratio, clip: m.clipPx, cape: m.capePx })
  if (ratio > worst.ratio) {
    const k = await g(([p]) => window.__clip(p, true), [pitch])
    worst = { ratio, phase, pitch, img: k.img }
  }
}
async function phase(name, keys, frames, from = 12) {
  await place(-dir.x * 4.5, -dir.z * 4.5)
  await steps(45)
  for (const k of keys) await page.keyboard.down(k)
  for (let f = 0; f < frames; f += 1) {
    await steps(1)
    if (f >= from) { await measure(name, 0.12); if (f % 2 === 0) await measure(name + '-high', 0.55) }
  }
  for (const k of keys) await page.keyboard.up(k)
}
await phase('idle', [], 40, 0)
await phase('run', ['KeyW'], 64)
await phase('sprint', ['ShiftLeft', 'KeyW'], 46)
// Stop: run briefly, release, measure the settle.
await place(-dir.x * 4.5, -dir.z * 4.5); await steps(45)
await page.keyboard.down('KeyW'); await steps(40); await page.keyboard.up('KeyW')
for (let f = 0; f < 50; f += 1) { await steps(1); await measure('stop', 0.12) }

const summary = {}
for (const [k, arr] of Object.entries(results)) {
  const rs = arr.map(o => o.ratio)
  summary[k] = { frames: rs.length, clipFrames: rs.filter(r => r > 0.001).length, maxPct: +(Math.max(...rs) * 100).toFixed(2), meanPct: +((rs.reduce((s, r) => s + r, 0) / rs.length) * 100).toFixed(3), maxClipPx: Math.max(...arr.map(o => o.clip)) }
}
console.log(JSON.stringify(summary, null, 1))
if (worst.img) writeFileSync(`${out}/worst.png`, Buffer.from(worst.img.split(',')[1], 'base64'))
console.log('worst', worst.phase, worst.pitch, (worst.ratio * 100).toFixed(2) + '%')
console.log('errors', errors.length, errors.slice(0, 3).join(' | '))
await browser.close()
