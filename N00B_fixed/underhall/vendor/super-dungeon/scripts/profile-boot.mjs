// Boot profiler: time-to-title, requests before title, long tasks and frame hitches at scene changes.
// Usage: node scripts/profile-boot.mjs [baseUrl]
import { chromium } from 'playwright'
const base = process.argv[2] ?? 'http://127.0.0.1:3000/'
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
const reqs = []
const t0 = Date.now()
page.on('requestfinished', async r => {
  const res = await r.response()
  let size = 0
  try { size = (await res.body()).length } catch { /* streamed */ }
  reqs.push({ t: Date.now() - t0, url: r.url().replace(base, '/'), size, type: r.resourceType() })
})
await page.addInitScript(() => {
  window.__long = []
  new PerformanceObserver(l => { for (const e of l.getEntries()) window.__long.push([Math.round(e.startTime), Math.round(e.duration)]) }).observe({ type: 'longtask', buffered: true })
  window.__frames = []
  let last = performance.now()
  const tick = now => { window.__frames.push([Math.round(now), Math.round(now - last)]); last = now; requestAnimationFrame(tick) }
  requestAnimationFrame(tick)
})
await page.goto(`${base}?debug=1`, { waitUntil: 'commit' })
await page.waitForSelector('#boot.done', { timeout: 120000 })
const titleAt = Date.now() - t0
const marks = await page.evaluate(() => performance.getEntriesByType('mark').filter(m => m.name.startsWith('aegis:')).map(m => [m.name.slice(6), Math.round(m.startTime)]))
const nav = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return { domContentLoaded: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd) } })
await page.waitForTimeout(1500)
const hitch = async (label, from) => {
  const fr = await page.evaluate(f => window.__frames.filter(x => x[0] >= f), from)
  const worst = fr.reduce((m, x) => Math.max(m, x[1]), 0)
  const over50 = fr.filter(x => x[1] > 50).length
  console.log(`${label}: frames ${fr.length}, worst ${worst} ms, >50ms: ${over50}`)
}
console.log('time to title (wall):', titleAt, 'ms', 'nav', JSON.stringify(nav))
console.log('marks', JSON.stringify(marks))
const before = reqs.filter(r => r.t <= titleAt)
console.log(`requests before title: ${before.length}, bytes ${(before.reduce((n, r) => n + r.size, 0) / 1024).toFixed(0)} KB`)
const byType = {}
for (const r of before) { byType[r.type] = byType[r.type] ?? { n: 0, kb: 0 }; byType[r.type].n++; byType[r.type].kb += r.size / 1024 }
console.log('by type', JSON.stringify(byType, (k, v) => typeof v === 'number' ? Math.round(v) : v))
for (const r of before.filter(r => r.size > 30000).sort((a, b) => b.size - a.size).slice(0, 8)) console.log('  big', r.url, (r.size / 1024).toFixed(0) + 'KB', '@' + r.t)
console.log('long tasks before title', JSON.stringify(await page.evaluate(() => window.__long.slice(0, 20))))
let from = await page.evaluate(() => performance.now())
const nReq = reqs.length
await page.waitForFunction(() => window.__aegis?.campusLive, null, { timeout: 120000 }) // title is instant; campus streams in behind it
await page.click('.title-menu .btn.primary')
for (let i = 0; i < 3; i += 1) { await page.waitForTimeout(250); if (await page.$('.modal .btn.primary')) await page.click('.modal .btn.primary') }
await page.waitForTimeout(3000)
await hitch('title -> hub', from)
console.log('requests after play click:', reqs.length - nReq, reqs.slice(nReq).map(r => r.url.split('/').pop()).join(' '))
from = await page.evaluate(() => performance.now())
await page.evaluate(() => window.__aegis.startRun(12345))
await page.waitForTimeout(3000)
await hitch('hub -> run start', from)
from = await page.evaluate(() => performance.now())
await page.evaluate(() => { const a = window.__aegis; const r = a.run; const id = r.plan.path.find(i => ['combat', 'elite'].includes(r.plan.rooms[i].kind)); const c = a.level.roomCenter(r.plan.rooms[id]); a.hero.place(c.x, c.z + 2); a.cam.snap() })
await page.waitForTimeout(3000)
await hitch('first combat', from)
console.log('long tasks total', JSON.stringify(await page.evaluate(() => window.__long.filter(x => x[1] > 100))))
await browser.close()
