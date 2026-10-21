// Dev capture for the hero cape: idle (back / side / 3-4) and running (back / side) in the hub.
// Usage: node scripts/cape-shots.mjs [outDir]   (dev server on :3000). Writes <outDir>/cape-sheet.png
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
const out = process.argv[2] ?? '/tmp/cape'
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 960, height: 720 } })
const errors = []
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`))
const wait = ms => page.waitForTimeout(ms)
const g = (fn, arg) => page.evaluate(fn, arg)
await page.goto('http://127.0.0.1:3000/?debug=1', { waitUntil: 'load' })
await page.waitForFunction(() => !!window.__aegis && !document.querySelector('.boot'), null, { timeout: 90000 }).catch(() => {})
await wait(1000)
await page.waitForFunction(() => window.__aegis?.campusLive, null, { timeout: 120000 }) // title is instant; campus streams in behind it
await page.click('.title-menu .btn.primary')
await wait(300)
for (let i = 0; i < 3; i += 1) { const b = await page.$('.modal .btn.primary'); if (b) await b.click(); await wait(250) }
await page.waitForFunction(() => !!window.__aegis.hero.rig?.cape, null, { timeout: 60000 }).catch(() => errors.push('no cape'))
await g(() => { const c = window.__aegis.cam; c.shoulder = 0; c.zoom = 0.5 })
await wait(1500)
// Orbit: camera yaw relative to the hero facing (hero faces -Z at facing = PI; camera behind at yaw = facing).
const view = async (name, rel, pitch = 0.2) => {
  await g(([r, p]) => { const a = window.__aegis; a.cam.yaw = a.hero.facing + r; a.cam.pitch = p; a.cam.snap() }, [rel, pitch])
  await wait(900)
  await page.screenshot({ path: `${out}/${name}.png`, clip: { x: 240, y: 60, width: 480, height: 620 } })
}
const p0 = await g(() => ({ x: window.__aegis.hero.pos.x, z: window.__aegis.hero.pos.z }))
await g(p => { const a = window.__aegis; a.hero.place(p.x, p.z - 2, Math.PI) }, p0)
await wait(1500)
await view('1-idle-back', 0)
await view('2-idle-side', Math.PI / 2)
await view('3-idle-34', Math.PI * 0.75, 0.1)
// Runs happen in the (safe) entrance room of a seeded dungeon: open floor, no statues.
await g(() => window.__aegis.startRun(12345))
await page.waitForFunction(() => !window.__aegis.loading, null, { timeout: 90000 })
await wait(800)
const c0 = await g(() => { const a = window.__aegis; const c = a.level.roomCenter(a.run.plan.rooms[a.run.plan.path[0]]); return { x: c.x, z: c.z } })
const shotRun = async (name, key, place, yaw, ms) => {
  await g(([c, pl, y]) => { const a = window.__aegis; a.hero.place(c.x + pl[0], c.z + pl[1], Math.PI); a.cam.shoulder = 0; a.cam.zoom = 0.75; a.cam.yaw = y; a.cam.pitch = 0.18; a.cam.snap() }, [c0, place, yaw])
  await wait(700)
  await page.keyboard.down(key)
  await wait(ms)
  await page.screenshot({ path: `${out}/${name}.png`, clip: { x: 240, y: 60, width: 480, height: 620 } })
  await page.keyboard.up(key)
}
await shotRun('4-run-back', 'KeyW', [0, 4], Math.PI, 900)
await shotRun('5-run-side', 'KeyD', [-5, 0], Math.PI, 1100)
console.log('errors', errors.length, errors.slice(0, 5).join(' | '))
await browser.close()
execFileSync('python3', ['-c', `
from PIL import Image
import glob
fs=sorted(glob.glob('${out}/[0-9]-*.png'))
ims=[Image.open(f) for f in fs]
W=sum(i.width for i in ims); H=max(i.height for i in ims)
s=Image.new('RGB',(W,H))
x=0
for i in ims: s.paste(i,(x,0)); x+=i.width
s=s.resize((W*2//3,H*2//3))
s.save('${out}/cape-sheet.png')
print('sheet', s.size)
`], { stdio: 'inherit' })
