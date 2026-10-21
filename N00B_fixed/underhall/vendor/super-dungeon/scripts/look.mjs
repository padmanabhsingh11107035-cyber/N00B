// Look-dev capture: title, hub, and a combat room for several seeded runs (one per wing).
// Usage: node scripts/look.mjs [outDir] [seeds...]   (dev server on :3000)
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
const out = process.argv[2] ?? '/tmp/look'
const seeds = process.argv.slice(3).map(Number)
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
const errors = []
page.on('response', r => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`) })
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`))
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`) })
const wait = ms => page.waitForTimeout(ms)
const g = (fn, arg) => page.evaluate(fn, arg)
const t0 = Date.now()
await page.goto('http://127.0.0.1:3000/?debug=1', { waitUntil: 'load' })
await page.waitForFunction(() => !!window.__aegis && !document.querySelector('.boot'), null, { timeout: 90000 }).catch(() => {})
console.log('boot ms', Date.now() - t0)
await wait(1500)
await page.screenshot({ path: `${out}/title.png` })
await page.waitForFunction(() => window.__aegis?.campusLive, null, { timeout: 120000 }) // title is instant; campus streams in behind it
await page.click('.title-menu .btn.primary')
await wait(300)
for (let i = 0; i < 3; i += 1) { const b = await page.$('.modal .btn.primary'); if (b) await b.click(); await wait(250) }
await wait(1500)
await page.screenshot({ path: `${out}/hub.png` })
for (const seed of seeds.length ? seeds : [12345]) {
  await g(s => window.__aegis.startRun(s), seed)
  await page.waitForFunction(() => !window.__aegis.loading, null, { timeout: 90000 })
  await wait(800)
  const wing = await g(() => window.__aegis.run.plan.wing)
  await page.screenshot({ path: `${out}/${seed}-${wing}-start.png` })
  await g(() => { const a = window.__aegis; const r = a.run; const id = r.plan.path.find(i => ['combat', 'elite'].includes(r.plan.rooms[i].kind)); const c = a.level.roomCenter(r.plan.rooms[id]); a.hero.place(c.x, c.z + 5); a.cam.snap() })
  await wait(1600)
  await page.screenshot({ path: `${out}/${seed}-${wing}-combat.png` })
  const fps = await page.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(n / 2) }; requestAnimationFrame(f) }))
  const info = await page.evaluate(() => new Promise(res => { const r = window.__aegis.renderer; const gl = r.gl ?? r.renderer; gl.info.autoReset = false; gl.info.reset(); requestAnimationFrame(() => requestAnimationFrame(() => { const i = gl.info; const o = { calls: i.render.calls, tris: i.render.triangles, tex: i.memory.textures, progs: i.programs?.length, shadowLights: (() => { let n = 0; window.__aegis.scene.traverse(x => { if (x.isLight && x.castShadow) n++ }); return n })() }; gl.info.autoReset = true; res(o) })) }))
  console.log(seed, wing, 'fps', fps, JSON.stringify(info))
  if (process.env.TRIS) console.log((await page.evaluate(() => {
    const rows = {}
    window.__aegis.scene.traverse(o => {
      if (!o.isMesh || !o.visible) return
      const g = o.geometry
      const n = (g.index ? g.index.count : g.attributes.position.count) / 3
      const k = o.isInstancedMesh ? o.count : 1
      const mat = Array.isArray(o.material) ? o.material[0] : o.material
      const key = (o.isSkinnedMesh ? 'SKIN ' : o.isInstancedMesh ? 'INST ' : '') + (o.name || mat?.name || mat?.type) + ' x' + k + (o.castShadow ? ' [sh]' : '')
      rows[key] = (rows[key] || 0) + n * k
    })
    return Object.entries(rows).sort((x, y) => y[1] - x[1]).slice(0, 22).map(([k, v]) => Math.round(v) + '\t' + k)
  })).join('\n'))
  await g(() => window.__aegis.endRun?.('abandon')).catch(() => {})
  await g(() => window.__aegis.enterHub?.(true)).catch(() => {})
  await wait(500)
}
console.log(errors.slice(0, 12).join('\n') || 'no errors')
await browser.close()
