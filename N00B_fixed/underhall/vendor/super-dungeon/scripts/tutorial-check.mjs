// Movement-training check: first-time auto tutorial (real Shift/Space/C input), persistence, manual replay
// and skip from the hub pause menu. Manual replay must never start a run.
// Usage: node scripts/tutorial-check.mjs [outDir]  (dev server on :3000)
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
const out = process.argv[2] ?? '/tmp/tutorial'
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const context = await browser.newContext({ viewport: { width: 1100, height: 720 } }) // fresh storage = first-time player
const page = await context.newPage()
const errors = []
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`))
const wait = ms => page.waitForTimeout(ms)
const g = (fn, arg) => page.evaluate(fn, arg)
let fails = 0
const check = (name, ok, info) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${info ?? ''}`); if (!ok) fails++ }
const state = () => g(() => {
  const a = window.__aegis; const c = document.querySelector('.coach')
  return {
    mode: a.mode, run: !!a.run, loading: !!a.loading, step: a.tutorial?.stepIndex ?? null, manual: a.tutorial?.manual ?? null,
    coach: c && !c.classList.contains('hidden') ? c.textContent : null, modal: a.ui.modalOpen,
    done: JSON.parse(localStorage.getItem('aegis-after-hours.save') ?? '{}').tutorialDone === true,
    dashHi: !!document.querySelector('.slot-dash.coach-hi'),
  }
})
const toOpenFloor = () => g(() => { const a = window.__aegis; a.hero.place(a.markers.P.x, a.markers.P.z - 1, Math.PI); a.cam.yaw = 0; a.cam.snap() })
const enterHub = async () => {
  await page.goto('http://127.0.0.1:3000/?debug=1', { waitUntil: 'load' })
  await page.waitForFunction(() => window.__aegis?.campusLive, null, { timeout: 120000 })
  await page.click('.title-menu .btn.primary')
  await wait(400)
  for (let i = 0; i < 4; i += 1) { const b = await page.$('.modal .btn.primary'); if (b) await b.click(); await wait(300) } // story intro (first time only)
  await page.waitForFunction(() => window.__aegis.mode === 'hub' && !window.__aegis.ui.modalOpen, null, { timeout: 30000 })
  await g(() => {
    const h = window.__aegis.hero; const orig = h.step.bind(h); window.__tc = { jumps: 0, dashes: 0 }
    h.step = (...a) => { const ev = orig(...a); for (const e of ev) { if (e.type === 'jump') window.__tc.jumps++; if (e.type === 'dash') window.__tc.dashes++ } return ev }
  })
}
// Hold Shift+W until the sprint step is done (min `ms`), re-centring if the hero nears a wall.
const sprint = async ms => {
  await toOpenFloor(); await page.keyboard.down('ShiftLeft'); await page.keyboard.down('KeyW'); await wait(ms)
  for (let i = 0; i < 12 && !(await g(() => (window.__aegis.tutorial?.stepIndex ?? 9) > 0 || !!document.querySelector('.coach.celebrate'))); i += 1) {
    await page.keyboard.up('KeyW'); await toOpenFloor(); await page.keyboard.down('KeyW'); await wait(900)
  }
  await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft')
}
// Press a key n times, each time waiting until the game has actually performed the move.
const press = async (key, n, gap) => {
  const ev = key === 'Space' ? 'jumps' : 'dashes'
  for (let i = 0; i < n; i += 1) {
    const before = await g(e => window.__tc?.[e] ?? 0, ev)
    for (let t = 0; t < 5; t += 1) {
      await page.keyboard.press(key)
      if (await until(`(window.__tc?.${ev} ?? 0) > ${before}`, gap * 3)) break
    }
    await wait(gap)
  }
}
const finishAll = async () => {
  await sprint(1900); await stepIs(1)
  await press('Space', 2, 1100); await stepIs(2)
  await press('KeyC', 2, 1300); await until('!window.__aegis.tutorial')
}
// Game time runs slower than wall time under software GL, so wait on state instead of fixed delays.
const until = (fn, timeout = 15000) => page.waitForFunction(fn, null, { timeout, polling: 100 }).then(() => true, () => false)
const stepIs = n => until(`(window.__aegis.tutorial?.stepIndex ?? null) === ${n} && !document.querySelector('.coach.celebrate')`)
const openPause = async () => { await g(() => window.__aegis.pause()); await wait(300) }
const pauseButtons = () => g(() => [...document.querySelectorAll('.modal .pause-menu .btn')].map(b => b.textContent.trim()))
const clickPause = async label => { const bs = await page.$$('.modal .pause-menu .btn'); for (const b of bs) if ((await b.textContent()).trim() === label) { await b.click(); return true } return false }

// 1. First-time player: tutorial appears by itself in the hub and waits for real input.
await enterHub()
let s = await state()
check('no coach before the arrival banner settles', s.coach === null && !s.done, JSON.stringify(s))
await stepIs(0)
s = await state()
check('auto tutorial starts in hub with SPRINT / SHIFT', s.mode === 'hub' && s.step === 0 && s.manual === false && /SPRINT/.test(s.coach ?? '') && /SHIFT/.test(s.coach ?? ''), JSON.stringify(s))
await page.screenshot({ path: `${out}/1-sprint.png` })
await wait(2500)
check('does not advance without input', (await state()).step === 0)
await sprint(1900)
await stepIs(1)
s = await state()
check('sprinting completes step 1', s.step === 1 && /JUMP/.test(s.coach ?? '') && /SPACE/.test(s.coach ?? ''), JSON.stringify(s))
await page.screenshot({ path: `${out}/2-jump.png` })
await page.keyboard.press('KeyC'); await wait(900)
check('dash does not count for jump step', (await state()).step === 1)
await press('Space', 2, 1100); await stepIs(2)
s = await state()
check('two jumps complete step 2; dash slot highlighted', s.step === 2 && /DASH/.test(s.coach ?? '') && s.dashHi, JSON.stringify(s))
await page.screenshot({ path: `${out}/3-dash.png` })
await press('KeyC', 2, 1300)
await until("!!document.querySelector('.coach.celebrate')", 5000)
await page.screenshot({ path: `${out}/4-nice.png` })
await until('!window.__aegis.tutorial')
await wait(300)
s = await state()
const bannerText = await g(() => document.querySelector('.banner')?.textContent ?? '')
check('training completes, saved, stays in hub', s.step === null && s.coach === null && s.done && s.mode === 'hub' && !s.run && !s.loading && /TRAINING COMPLETE/.test(bannerText), JSON.stringify({ ...s, bannerText }))
await page.screenshot({ path: `${out}/5-complete.png` })

// 2. Returning player: no auto tutorial; pause offers a replay.
await enterHub()
await wait(3000)
s = await state()
check('returning player gets no auto tutorial', s.coach === null && s.step === null, JSON.stringify(s))
await openPause()
let btns = await pauseButtons()
check('hub pause offers MOVEMENT TRAINING', btns.includes('MOVEMENT TRAINING') && !btns.includes('SKIP TRAINING'), JSON.stringify(btns))
await page.screenshot({ path: `${out}/6-pause.png` })
await clickPause('MOVEMENT TRAINING'); await wait(400)
s = await state()
check('manual replay starts in hub without a run', s.mode === 'hub' && !s.run && !s.modal && s.manual === true && s.step === 0, JSON.stringify(s))
await finishAll()
s = await state()
check('manual replay completion stays in hub, no run started', s.mode === 'hub' && !s.run && !s.loading && s.step === null && s.coach === null && !s.modal, JSON.stringify(s))

// 3. Manual replay then close it via SKIP: still in hub, still no run.
await openPause(); await clickPause('MOVEMENT TRAINING'); await wait(400)
await sprint(1900); await stepIs(1)
await openPause()
btns = await pauseButtons()
check('pause during training offers SKIP TRAINING', btns.includes('SKIP TRAINING'), JSON.stringify(btns))
await clickPause('SKIP TRAINING'); await wait(1500)
s = await state()
check('skipping a manual replay stays in hub, no run', s.mode === 'hub' && !s.run && !s.loading && s.step === null && s.coach === null && !s.modal, JSON.stringify(s))

// 4. Pause-menu skip also works for first-time players, and a run never shows the coach.
await g(() => localStorage.removeItem('aegis-after-hours.save'))
await enterHub()
check('fresh save starts auto tutorial again', await stepIs(0))
await g(() => window.__aegis.startRun(12345))
await page.waitForFunction(() => !window.__aegis.loading, null, { timeout: 90000 })
await wait(600)
s = await state()
check('leaving the hub mid-tutorial hides it (not marked done)', s.mode === 'run' && s.coach === null && s.step === null && !s.done, JSON.stringify(s))

console.log('errors', errors.length, errors.slice(0, 5).join(' | '))
await browser.close()
process.exit(fails || errors.length ? 1 : 0)
