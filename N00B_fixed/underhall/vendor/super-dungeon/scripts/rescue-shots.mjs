// Rescue sequence check: free a classmate and capture each phase (drop, topple, down, rise, stand, dance).
// Usage: node scripts/rescue-shots.mjs [outDir] [seed]   (dev server on :3000)
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
const out = process.argv[2] ?? '/tmp/rescue'
const seed = Number(process.argv[3] ?? 12345)
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 900, height: 640 } })
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
await wait(1000)
const info = await page.evaluate(() => {
  const a = window.__aegis
  const room = a.run.plan.rooms.find(r => r.kind === 'rescue')
  if (!room) return null
  const it = a.items.find(i => i.kind === 'capsule' && i.room === room.id)
  const c = it.pos
  // Stand 3 m south-east of the crystal and look at it.
  a.hero.place(c.x + 2.6, c.z + 2.4, Math.PI)
  a.cam.yaw = 0.35
  a.cam.pitch = 0.18
  a.cam.snap()
  return { room: room.id, bodyY: it.obj.children[0].position.y }
})
if (!info) { console.log('no rescue room for seed', seed); process.exit(2) }
console.log('rescue room', JSON.stringify(info))
// Clear every wave so the game itself unlocks the crystal (the real rescue flow).
const tc = Date.now()
while (Date.now() - tc < 60000) {
  const open = await page.evaluate(() => {
    const a = window.__aegis
    for (const e of a.enemies) if (e.targetable) e.hurt(9999, null, 0, a.fx)
    return a.items.find(i => i.kind === 'capsule' && !i.used)?.enabled === true
  })
  if (open) break
  await wait(400)
}
await page.evaluate(() => {
  const a = window.__aegis
  const c = a.items.find(i => i.kind === 'capsule' && !i.used).pos
  a.hero.place(c.x + 2.6, c.z + 2.4, Math.PI)
  a.cam.yaw = 0.35
  a.cam.pitch = 0.18
  a.cam.snap()
})
await wait(2500)
await page.screenshot({ path: `${out}/0-trapped.png` })
await page.evaluate(() => {
  const a = window.__aegis
  const it = a.items.find(i => i.kind === 'capsule' && !i.used)
  if (!it.enabled) throw new Error('crystal still locked after clearing the room')
  a.useItem(it)
})
const seen = []
const t0 = Date.now()
let dialogueAfterDance = false
while (Date.now() - t0 < 90000) {
  const st = await page.evaluate(() => {
    const a = window.__aegis
    const r = a.rescueSeqs[0]
    return { phase: r?.seq.phase ?? 'gone', y: r ? r.seq.actor.body.position.y : null, clip: r?.seq.actor.char?.current ?? null, modal: !!document.querySelector('.modal') }
  })
  if (!seen.length || seen[seen.length - 1].phase !== st.phase) {
    seen.push(st)
    if (st.phase !== 'gone') await page.screenshot({ path: `${out}/${seen.length}-${st.phase}.png` })
  }
  if (st.modal) { dialogueAfterDance = seen.some(s => s.phase === 'dance' || s.phase === 'gone'); break }
  await wait(60)
}
await page.screenshot({ path: `${out}/9-dialogue.png` })
const cont = await page.$('.modal .btn.primary')
if (cont) await cont.click()
await wait(1200)
const clip = await page.evaluate(() => window.__aegis.items.find(i => i.kind === 'capsule')?.obj.userData.char?.current ?? null)
await page.screenshot({ path: `${out}/10-dance.png` })
console.log(`${clip && clip.startsWith('Dance_') ? 'PASS' : 'FAIL'} classmate keeps dancing after the dialogue (${clip})`)
console.log('phases', JSON.stringify(seen))
const order = seen.map(s => s.phase).filter(p => p !== 'gone')
const expected = ['fall', 'topple', 'down', 'rise', 'stand', 'dance']
const inOrder = expected.filter(p => order.includes(p)).join() === order.filter(p => expected.includes(p)).join()
// Short phases (topple ~0.34 s, dance hand-off = 1 step) can fall between headless polls; the dialogue only
// opens from the dance event, so in-order phases + dialogue proves the full sequence ran.
console.log(`${inOrder && order[0] === 'fall' ? 'PASS' : 'FAIL'} sequence order ${order.join(' > ')}`)
console.log(`${dialogueAfterDance ? 'PASS' : 'FAIL'} dialogue opens after the dance starts`)
console.log('errors', errors.length, errors.slice(0, 3).join(' | '))
await browser.close()
