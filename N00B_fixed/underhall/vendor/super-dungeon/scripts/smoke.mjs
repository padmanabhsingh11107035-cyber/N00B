// Headless smoke test: drives the real game through its main flow and captures screenshots.
// Usage: node scripts/smoke.mjs [baseUrl]   (defaults to http://127.0.0.1:3000/)
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const base = process.argv[2] ?? 'http://127.0.0.1:3000/'
const out = 'smoke-shots'
mkdirSync(out, { recursive: true })
const errors = []
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
// The dev server has no favicon link (the sharing build injects it), so ignore that one request.
page.on('console', m => { if (m.type() === 'error' && !(m.location()?.url ?? '').endsWith('/favicon.ico')) errors.push(`${m.text()} @ ${m.location()?.url ?? ''}`) })
page.on('response', r => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`) })
page.on('pageerror', e => errors.push(`pageerror: ${e.message}\n${e.stack ?? ''}`))
const wait = ms => page.waitForTimeout(ms)
const shot = async name => { await page.screenshot({ path: `${out}/${name}.png` }); console.log('shot', name) }
const g = (fn, arg) => page.evaluate(fn, arg)
// Run start and floor descent happen behind a curtain while the stage finishes loading.
const settled = () => page.waitForFunction(() => !window.__aegis.loading, null, { timeout: 30000 })
const streamStats = () => g(() => window.__aegis.streamer.stats)

await page.goto(`${base}?debug=1`, { waitUntil: 'load' })
await page.waitForFunction(() => !!window.__aegis, null, { timeout: 30000 })
await wait(1500)
await shot('01-title')
{
  const st = await streamStats()
  console.log('stream at title:', JSON.stringify({ ready: st.ready, done: st.done, total: st.total, readyAt: st.readyAt }))
}
await page.waitForFunction(() => window.__aegis?.campusLive, null, { timeout: 120000 }) // title is instant; campus streams in behind it
// The title shows before anything streams; the title + first-wave stages must finish behind it.
await page.waitForFunction(() => { const st = window.__aegis.streamer?.stats; return !st || (st.ready.title && st.ready.wave1) }, null, { timeout: 90000 })
  .catch(() => errors.push('title/wave1 stages not ready after the campus went live'))
await page.click('.title-menu .btn.primary')
await wait(400)
await shot('02-intro')
for (let i = 0; i < 3; i += 1) { await page.click('.modal .btn.primary'); await wait(250) }
await wait(1200)
await shot('03-hub')
// Walk forward in the hub for a moment.
await page.keyboard.down('KeyW'); await wait(900); await page.keyboard.up('KeyW')
await wait(300)
await shot('04-hub-walk')
// Open the development board + codex through the game API.
await g(() => window.__aegis.openBoard())
await wait(300)
await shot('05-board')
await page.keyboard.press('Escape')
await wait(200)
// Start a seeded run.
await g(() => window.__aegis.startRun(12345))
await wait(300)
await shot('06a-curtain')
await settled()
await wait(900)
await shot('06-run-start')
const info = await g(() => { const r = window.__aegis.run; return { wing: r.plan.wing, rooms: r.plan.rooms.map(x => x.kind), path: r.plan.path, fallback: r.plan.fallback } })
console.log('plan', JSON.stringify(info))
// Teleport into the first combat room on the path and fight.
const combatId = await g(() => { const a = window.__aegis; const r = a.run; const id = r.plan.path.find(i => ['combat', 'elite'].includes(r.plan.rooms[i].kind)); const c = a.level.roomCenter(r.plan.rooms[id]); a.hero.place(c.x, c.z + 2); a.cam.snap(); return id })
await wait(1800)
await shot('07-combat')
for (let i = 0; i < 14; i += 1) { await g(() => { const a = window.__aegis; a.input.pressed_.add('attack') }); await wait(140) }
await g(() => { window.__aegis.hero.power = 100; window.__aegis.input.pressed_.add('nova') })
await wait(200)
await shot('08-combat-nova')
// Kill the rest to test clearing + reward.
for (let k = 0; k < 6; k += 1) {
  await g(() => { const a = window.__aegis; for (const e of a.enemies) if (e.targetable) e.hurt(9999, null, 0, a.fx) })
  await wait(1200)
}
const cleared = await g(id => window.__aegis.run.cleared.has(id), combatId)
console.log('combat room cleared:', cleared)
await shot('09-cleared')
// Grab the power card if it dropped.
await g(() => { const a = window.__aegis; const it = a.items.find(i => i.kind === 'upgrade' && !i.used); if (it) a.hero.place(it.pos.x, it.pos.z) })
await wait(600)
await shot('10-upgrade')
if (await page.$('.modal-upgrades')) { await page.keyboard.press('Digit1'); await wait(300) }
// Map overlay.
await g(() => { for (const r of window.__aegis.run.plan.rooms) window.__aegis.run.discovered.add(r.id) })
await page.keyboard.press('Tab'); await wait(300)
await shot('11-map')
await page.keyboard.press('Tab'); await wait(200)
// Boss.
await g(() => { const a = window.__aegis; const r = a.run; const b = r.plan.rooms[r.plan.boss]; const c = a.level.roomCenter(b); a.hero.place(c.x, c.z + 7); a.hero.stats.maxHp = 9999; a.hero.hp = 9999; a.cam.snap() })
await wait(3800)
await shot('12-boss')
{
  const st = await streamStats()
  console.log('stream in boss fight:', JSON.stringify({ heat: st.heat, hot: st.hot, focus: st.focus }))
  if (!st.hot) errors.push('streamer not paused during the boss fight')
}
await wait(2500)
await shot('13-boss-attack')
await page.waitForFunction(() => window.__aegis.boss?.targetable, null, { timeout: 60000 }).catch(() => {})
await g(() => { const a = window.__aegis; a.boss.hp = 20; a.boss.hurt(9999, null, 0, a.bossCtx()) })
await page.waitForFunction(() => window.__aegis.run.bosses >= 1, null, { timeout: 90000 }).catch(() => {})
await wait(800)
await shot('14-boss-dead')
const bossDone = await g(() => window.__aegis.run.bossDefeated)
console.log('boss defeated:', bossDone)
console.log('hub/title audio check done')
const audioState = () => g(() => {
  const au = window.__aegis.audio
  const ch = au.currentTrack ? au.channels.get(au.currentTrack) : null
  return { ctx: au.ctx.state, clips: au.loadedClips, track: au.currentTrack, playing: ch ? !ch.el.paused : false, t: ch ? +ch.el.currentTime.toFixed(1) : 0, failed: ch ? ch.failed : null }
})
console.log('audio after boss 1:', JSON.stringify(await audioState()))
const usePortal = async () => {
  await g(() => { const a = window.__aegis; const it = a.items.find(i => i.kind === 'portal'); a.hero.place(it.pos.x, it.pos.z + 1.5) })
  await wait(500)
  // Retry E until the portal fires (a floor change or the results screen); a single press can land
  // while the post-boss banner/prompt is still settling and be dropped.
  const before = await g(() => ({ floor: window.__aegis.run?.floor, mode: window.__aegis.mode }))
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press('KeyE')
    await wait(700)
    const now = await g(() => ({ floor: window.__aegis.run?.floor, mode: window.__aegis.mode, loading: window.__aegis.loading }))
    if (now.loading || now.mode !== before.mode || now.floor !== before.floor) return
  }
  errors.push('portal did not fire')
}
// Floor 2: The Stacks Below.
await usePortal()
await wait(400)
await settled()
await wait(1500)
await shot('15-floor2-start')
const f2 = await g(() => { const a = window.__aegis; const r = a.run; return { floor: r.floor, wing: r.plan.wing, seed: r.plan.seed, rooms: r.plan.rooms.length, hp: a.hero.hp, bosses: r.bosses, fallback: r.plan.fallback } })
console.log('floor 2:', JSON.stringify(f2), 'audio:', JSON.stringify(await audioState()))
if (f2.floor !== 2 || f2.wing !== 'stacks') errors.push('did not descend to floor 2')
// A Stacks combat room for a look at the new wing.
await g(() => { const a = window.__aegis; const r = a.run; const id = r.plan.path.find(i => ['combat', 'elite'].includes(r.plan.rooms[i].kind)); const c = a.level.roomCenter(r.plan.rooms[id]); a.hero.place(c.x, c.z + 2); a.cam.snap() })
await wait(2000)
await shot('16-floor2-combat')
console.log('audio in floor-2 combat:', JSON.stringify(await audioState()), 'intensity', await g(() => window.__aegis.audio.intensity))
// The Librarian.
await g(() => { const a = window.__aegis; for (const e of a.enemies) if (e.targetable) e.hurt(9999, null, 0, a.fx) })
await wait(600)
await g(() => { const a = window.__aegis; const r = a.run; const b = r.plan.rooms[r.plan.boss]; const c = a.level.roomCenter(b); a.hero.place(c.x, c.z + 7); a.hero.stats.maxHp = 9999; a.hero.hp = 9999; a.cam.snap() })
await wait(1400)
await shot('17-librarian-intro')
await wait(2600)
await shot('18-librarian')
console.log('librarian:', JSON.stringify(await g(() => { const b = window.__aegis.boss; return { name: b.def.name, state: b.state, hp: b.hp, phase: b.phase } })), 'audio:', JSON.stringify(await audioState()))
for (const [attack, delay, name] of [['shelves', 900, '19-lib-shelves'], ['storm', 1500, '20-lib-storm'], ['shush', 1250, '21-lib-shush']]) {
  await g(k => { const a = window.__aegis; a.boss.state = 'idle'; a.boss.t = 99; a.boss.begin(k, a.bossCtx()) }, attack)
  await wait(delay)
  await shot(name)
}
await g(() => { const a = window.__aegis; a.boss.state = 'idle'; a.boss.t = 0.2; a.boss.hurt(a.boss.hp - a.boss.maxHp * 0.3, null, 0, a.bossCtx()) })
await wait(1500)
await shot('22-lib-phase3')
const ph = await g(() => window.__aegis.boss.phase)
console.log('librarian phase after big hit:', ph)
await wait(2500)
await shot('23-lib-phase3-attack')
await page.waitForFunction(() => window.__aegis.boss?.targetable, null, { timeout: 60000 }).catch(() => {})
await g(() => { const a = window.__aegis; a.boss.hurt(99999, null, 0, a.bossCtx()) })
await page.waitForFunction(() => window.__aegis.run.bosses >= 2, null, { timeout: 90000 }).catch(() => {})
await wait(800)
await shot('24-lib-dead')
console.log('floor 2 boss defeated:', await g(() => window.__aegis.run.bossDefeated), 'bosses:', await g(() => window.__aegis.run.bosses))
await usePortal()
await wait(1500)
await shot('25-results')
const resAudio = await audioState()
console.log('audio at results:', JSON.stringify(resAudio), 'mode:', await g(() => window.__aegis.mode))
if (resAudio.track !== 'victory') errors.push(`results music is ${resAudio.track}, expected victory`)
await page.keyboard.press('Enter')
await wait(1500)
await shot('26-back-hub')
// Death flow on a new seed.
await g(() => window.__aegis.startRun(777))
await settled()
await wait(800)
await g(() => { const a = window.__aegis; a.hero.iframes = 0; a.hurtHero(9999, a.hero.pos.clone(), 0) })
await wait(2200)
await shot('27-death')
{
  const st = await streamStats()
  console.log('stream at end:', JSON.stringify(st))
  if (st.hotStarts !== 0) errors.push(`background tasks started while hot: ${st.hotStarts}`)
  if (st.done !== st.total) errors.push(`streaming incomplete: ${st.done}/${st.total}`)
}
console.log('ERRORS', errors.length)
for (const e of errors.slice(0, 15)) console.log(' -', e)
await browser.close()
process.exit(errors.length ? 1 : 0)
