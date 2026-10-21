// Movement check: Shift sprint, Space jump, C dash. Usage: node scripts/move-check.mjs [outDir]  (dev server on :3000)
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
const out = process.argv[2] ?? '/tmp/move'
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 960, height: 720 } })
const errors = []
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`))
const wait = ms => page.waitForTimeout(ms)
const g = (fn, arg) => page.evaluate(fn, arg)
let fails = 0
const check = (name, ok, info) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${info ?? ''}`); if (!ok) fails++ }
await page.goto('http://127.0.0.1:3000/?debug=1', { waitUntil: 'load' })
await page.waitForFunction(() => !!window.__aegis && !document.querySelector('.boot'), null, { timeout: 90000 }).catch(() => {})
await wait(1000)
await page.waitForFunction(() => window.__aegis?.campusLive, null, { timeout: 120000 }) // title is instant; campus streams in behind it
await page.click('.title-menu .btn.primary')
await wait(300)
for (let i = 0; i < 3; i += 1) { const b = await page.$('.modal .btn.primary'); if (b) await b.click(); await wait(250) }
await g(() => window.__aegis.startRun(12345))
await page.waitForFunction(() => !window.__aegis.loading, null, { timeout: 90000 })
await wait(800)
const c0 = await g(() => { const a = window.__aegis; const c = a.level.roomCenter(a.run.plan.rooms[a.run.plan.path[0]]); return { x: c.x, z: c.z } })
const reset = async (dz = 4) => {
  await g(([c, d]) => { const a = window.__aegis; a.hero.place(c.x, c.z + d, Math.PI); a.cam.yaw = Math.PI; a.cam.pitch = 0.2; a.cam.snap() }, [c0, dz])
  await wait(500)
}
// Sample hero state every animation frame while an action plays out.
const sample = ms => g(t => new Promise(res => {
  const h = window.__aegis.hero; const s = { maxY: 0, maxSpeed: 0, sprint: false, dash: false, landed: false, fov: 0, clips: new Set() }
  const t0 = performance.now()
  const f = () => {
    s.maxY = Math.max(s.maxY, h.y); s.maxSpeed = Math.max(s.maxSpeed, h.speedNow); s.sprint ||= h.sprinting; s.dash ||= h.dashT > 0 || h.dashCd > 0
    s.fov = Math.max(s.fov, window.__aegis.cam.camera.fov); if (h.rig.char) s.clips.add(h.rig.char.current)
    if (performance.now() - t0 < t) requestAnimationFrame(f); else res({ ...s, clips: [...s.clips], endY: h.y })
  }
  requestAnimationFrame(f)
}), ms)

await reset()
let p = sample(1500)
await page.keyboard.down('KeyW'); await wait(1200); const jog = await p; await page.keyboard.up('KeyW')
check('jog speed ~ base', jog.maxSpeed > 5 && jog.maxSpeed < 9.5 && !jog.sprint, JSON.stringify({ speed: jog.maxSpeed.toFixed(2), clips: jog.clips }))

await reset()
p = sample(1500)
await page.keyboard.down('ShiftLeft'); await page.keyboard.down('KeyW'); await wait(700)
await page.screenshot({ path: `${out}/sprint.png`, clip: { x: 240, y: 60, width: 480, height: 620 } })
await wait(500)
const spr = await p; await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft')
check('shift sprint faster + FOV kick', spr.sprint && spr.maxSpeed > jog.maxSpeed * 1.3 && spr.fov > 64, JSON.stringify({ speed: spr.maxSpeed.toFixed(2), fov: spr.fov.toFixed(1), clips: spr.clips }))

await reset()
p = sample(3500)
await page.keyboard.press('Space'); await wait(220)
await page.screenshot({ path: `${out}/jump.png`, clip: { x: 240, y: 60, width: 480, height: 620 } })
const jmp = await p
check('space jumps and lands', jmp.maxY > 1.1 && jmp.maxY < 2 && jmp.endY === 0 && !jmp.dash, JSON.stringify({ maxY: jmp.maxY.toFixed(2), endY: jmp.endY, clips: jmp.clips }))

await reset()
p = sample(800)
await page.keyboard.press('KeyC')
const dsh = await p
check('C dashes (not Space/Shift)', dsh.dash && dsh.maxY < 0.05, JSON.stringify({ speed: dsh.maxSpeed.toFixed(1) }))

// Running jump while sprinting: the cape should stay behind/over the body.
await reset(6)
await page.keyboard.down('ShiftLeft'); await page.keyboard.down('KeyD'); await wait(500)
await page.keyboard.press('Space'); await wait(200)
await page.screenshot({ path: `${out}/sprint-jump-side.png`, clip: { x: 240, y: 60, width: 480, height: 620 } })
await page.keyboard.up('KeyD'); await page.keyboard.up('ShiftLeft')
const hint = await g(() => document.querySelector('.slot-dash')?.textContent ?? '')
check('HUD dash hint shows C', /C/.test(hint), JSON.stringify(hint))
console.log('errors', errors.length, errors.slice(0, 5).join(' | '))
await browser.close()
process.exit(fails || errors.length ? 1 : 0)
