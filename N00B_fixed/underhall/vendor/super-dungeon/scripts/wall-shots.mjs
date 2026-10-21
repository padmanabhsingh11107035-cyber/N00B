// Close-up captures of wall decals / wall furniture to verify trim never crosses them.
// Usage: node scripts/wall-shots.mjs <outDir> <seed> [count]   (dev server on :3000)
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
const out = process.argv[2] ?? '/tmp/walls'
const seed = Number(process.argv[3] ?? 12345)
const count = Number(process.argv[4] ?? 4)
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 900, height: 700 } })
const errors = []
page.on('pageerror', e => errors.push(e.message))
const wait = ms => page.waitForTimeout(ms)
await page.goto('http://127.0.0.1:3000/?debug=1', { waitUntil: 'load' })
await page.waitForFunction(() => !!window.__aegis && !document.querySelector('.boot'), null, { timeout: 90000 }).catch(() => {})
await wait(800)
await page.waitForFunction(() => window.__aegis?.campusLive, null, { timeout: 120000 }) // title is instant; campus streams in behind it
await page.click('.title-menu .btn.primary')
await wait(300)
for (let i = 0; i < 3; i += 1) { const b = await page.$('.modal .btn.primary'); if (b) await b.click(); await wait(250) }
await page.evaluate(s => window.__aegis.startRun(s), seed)
await page.waitForFunction(() => !window.__aegis.loading, null, { timeout: 90000 })
await wait(1200)
// Targets: decal planes (textured PlaneGeometry on walls) and wall-furniture instances.
const targets = await page.evaluate(n => {
  const a = window.__aegis
  const res = []
  a.level.group.traverse(o => {
    if (o.isMesh && !o.isInstancedMesh && o.geometry?.type === 'PlaneGeometry' && o.position.y > 0.9 && o.material?.map) {
      res.push({ kind: 'panel', x: o.position.x, z: o.position.z, rot: o.rotation.y, h: o.geometry.parameters.height })
    }
  })
  // Spread picks across different rooms.
  const picked = []
  for (const t of res) if (picked.every(p => Math.hypot(p.x - t.x, p.z - t.z) > 6)) picked.push(t)
  return picked.slice(0, n)
}, count)
console.log('targets', targets.length)
let i = 0
for (const t of targets) {
  await page.evaluate(tt => {
    const a = window.__aegis
    const nx = Math.sin(tt.rot)
    const nz = Math.cos(tt.rot)
    // Hero 3.2 m in front of the panel, slightly to the side; camera looks at the wall.
    a.hero.place(tt.x + nx * 3.2 + nz * 0.8, tt.z + nz * 3.2 - nx * 0.8, tt.rot + Math.PI)
    a.cam.yaw = tt.rot + 0.35
    a.cam.pitch = 0.35
    a.cam.snap()
  }, t)
  await wait(1500)
  await page.screenshot({ path: `${out}/wall-${seed}-${i}.png` })
  i += 1
}
console.log('errors', errors.length, errors.slice(0, 3).join(' | '))
await browser.close()
