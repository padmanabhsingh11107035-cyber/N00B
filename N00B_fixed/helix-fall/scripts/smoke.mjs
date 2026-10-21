// End-to-end smoke test: builds must already exist in dist/ (`npm run build`).
// Serves dist/, boots the game in headless Chromium, plays a few seconds, walks the menus in
// English and Chinese, fails on any console error, and writes screenshots to ./shots/.
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const port = 4300 + Math.floor(Math.random() * 500)
const url = `http://127.0.0.1:${port}/`
const out = process.env.SHOTS_DIR ?? 'shots'
mkdirSync(out, { recursive: true })

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore', detached: false })
let browser
const guard = setTimeout(() => fail('timed out'), 120_000)

function cleanup() {
  clearTimeout(guard)
  try { server.kill('SIGTERM') } catch {}
}
async function fail(msg) {
  console.error(`smoke: FAIL — ${msg}`)
  await browser?.close().catch(() => {})
  cleanup()
  process.exit(1)
}

async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try {
      if ((await fetch(url)).ok) return
    } catch {}
    await new Promise(r => setTimeout(r, 250))
  }
  throw new Error('preview server did not start')
}

async function openGame(context, errors) {
  const page = await context.newPage()
  page.on('console', m => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', e => errors.push(String(e)))
  page.on('response', r => r.status() >= 400 && errors.push(`HTTP ${r.status()} ${r.url()}`))
  await page.goto(url)
  await page.waitForSelector('[data-screen="title"].is-active', { timeout: 30_000 })
  await page.waitForFunction(() => !!window.__helix, null, { timeout: 10_000 })
  await page.evaluate(async () => {
    await document.fonts.ready
    const zh = document.documentElement.lang === 'zh-CN'
    const expected = zh ? 'Noto Sans SC' : 'Sora'
    const logo = document.querySelector('.logo-main')
    if (!logo || !getComputedStyle(logo).fontFamily.includes(expected)) throw new Error(`Unexpected display font for ${document.documentElement.lang}`)
    if (!document.fonts.check(`12px "${expected}"`)) throw new Error(`Bundled font did not load: ${expected}`)
    const boot = document.querySelector('.screen-boot')
    const icon = document.querySelector('.boot-icon')
    if (getComputedStyle(boot).backgroundColor !== 'rgb(27, 24, 56)') throw new Error('Helix loader is not using its solid background')
    if (!icon || !icon.naturalWidth) throw new Error('Game-specific loading icon did not load')
    if (document.documentElement.scrollWidth > innerWidth + 1) throw new Error('Title overflows the viewport')
  })
  await page.waitForTimeout(400)
  return page
}

const state = page => page.evaluate(() => {
  const { game, input, save } = window.__helix
  return {
    mode: game.mode,
    kind: game.kind,
    simTime: game.sim.time,
    phi: game.sim.phi,
    floors: game.sim.floors,
    score: game.sim.score,
    inputMethod: input.method,
    best: save.data.best,
  }
})

async function turnByTouch(page, direction) {
  const button = page.locator(`[data-touch="${direction}"]`)
  await button.dispatchEvent('pointerdown', { pointerId: 23, pointerType: 'touch', clientX: 220, clientY: 600 })
  await page.waitForTimeout(320)
  await button.dispatchEvent('pointerup', { pointerId: 23, pointerType: 'touch', clientX: 220, clientY: 600 })
  await page.waitForTimeout(160)
}

try {
  await waitForServer()
  // Prefer Playwright's bundled Chromium; fall back to an installed Google Chrome.
  const args = ['--ignore-gpu-blocklist']
  browser = await chromium.launch({ args }).catch(() => chromium.launch({ args, channel: 'chrome' }))
  const errors = []

  const en = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'en-US' })
  const page = await openGame(en, errors)
  await page.screenshot({ path: `${out}/01-title-en.png` })

  await page.click('[data-action="daily"]')
  await page.waitForSelector('[data-screen="hud"].is-active')
  const before = await state(page)
  await page.keyboard.down('KeyD')
  await page.waitForTimeout(450)
  await page.keyboard.up('KeyD')
  await page.waitForTimeout(250)
  const after = await state(page)
  if (after.mode !== 'playing' || after.kind !== 'daily') throw new Error(`expected Daily Tower gameplay, got ${after.mode}/${after.kind}`)
  if (after.simTime < 0.4) throw new Error('Helix simulation did not advance')
  if (Math.abs(after.phi - before.phi) < 0.08) throw new Error('keyboard rotation did not turn the tower')
  if (after.inputMethod !== 'keyboard') throw new Error(`unexpected desktop input method: ${after.inputMethod}`)
  await page.screenshot({ path: `${out}/02-desktop-hud.png` })

  await page.keyboard.press('Escape')
  await page.waitForSelector('[data-screen="pause"].is-active')
  await page.screenshot({ path: `${out}/03-desktop-pause.png` })
  await page.click('[data-screen="pause"] [data-action="resume"]')
  await page.waitForFunction(() => window.__helix.game.mode === 'playing')
  if ((await state(page)).mode !== 'playing') throw new Error('Resume did not return to gameplay')

  // Finish through the game's result callback to verify device-local daily-score persistence.
  await page.evaluate(() => {
    const { game } = window.__helix
    game.sim.score = 321
    game.sim.floors = 7
    game['finish']('dead')
  })
  await page.waitForSelector('[data-screen="results"].is-active', { timeout: 10_000 })
  const resultState = await page.evaluate(() => ({
    best: window.__helix.save.data.best,
    score: window.__helix.save.data.leaderboard[0]?.score,
    rankMessage: document.querySelector('[data-el="rOnline"]')?.textContent ?? '',
  }))
  if (resultState.best !== 321 || resultState.score !== 321) throw new Error('daily score was not saved locally')
  if (!resultState.rankMessage.includes('local daily rank')) throw new Error(`missing local-rank result message: ${resultState.rankMessage}`)
  await page.screenshot({ path: `${out}/04-desktop-results.png` })
  await page.click('[data-screen="results"] [data-action="board"]')
  await page.waitForSelector('[data-screen="board"].is-active')
  const boardText = await page.locator('[data-screen="board"] .board').innerText()
  const boardNote = await page.locator('[data-screen="board"] .board-note').innerText()
  if (!boardText.includes('321') || !boardNote.includes('device')) throw new Error('local-only Daily Tower board did not show the saved score')
  await page.screenshot({ path: `${out}/05-local-board.png` })
  await page.click('[data-screen="board"] [data-action="closeModal"]')
  await page.click('[data-screen="results"] [data-action="title"]')
  await page.waitForSelector('[data-screen="title"].is-active')
  await page.click('[data-screen="title"] [data-action="settings"]')
  await page.waitForSelector('[data-screen="settings"].is-active')
  await page.click('[data-action="lang"][data-value="zh-CN"]')
  const lang = await page.evaluate(() => document.documentElement.lang)
  if (lang !== 'zh-CN') throw new Error(`language toggle failed (lang=${lang})`)
  await page.screenshot({ path: `${out}/06-settings-zh.png` })
  await page.click('[data-screen="settings"] [data-action="closeModal"]')
  await page.reload()
  await page.waitForSelector('[data-screen="title"].is-active')
  await page.waitForFunction(() => !!window.__helix)
  const persisted = await page.evaluate(() => ({ lang: document.documentElement.lang, score: window.__helix.getBoard('all').entries[0]?.score }))
  if (persisted.lang !== 'zh-CN' || persisted.score !== 321) throw new Error('language choice or local score did not survive reload')
  await page.screenshot({ path: `${out}/07-title-zh-reload.png` })
  await en.close()

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'zh-CN' })
  const phonePage = await openGame(phone, errors)
  if ((await phonePage.evaluate(() => document.documentElement.lang)) !== 'zh-CN') throw new Error('phone browser locale did not select Simplified Chinese')
  await phonePage.tap('[data-action="daily"]')
  await phonePage.waitForSelector('[data-screen="hud"].is-active')
  const phoneBefore = await state(phonePage)
  if (!(await phonePage.locator('[data-touch="1"]').isVisible())) throw new Error('touch controls are not visible on a phone')
  await turnByTouch(phonePage, 1)
  const phoneAfter = await state(phonePage)
  if (phoneAfter.inputMethod !== 'touch' || Math.abs(phoneAfter.phi - phoneBefore.phi) < 0.04) throw new Error('phone touch input did not rotate the tower')
  await phonePage.screenshot({ path: `${out}/07-phone-hud.png` })
  await phone.close()

  const tablet = await browser.newContext({ viewport: { width: 820, height: 1180 }, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true, locale: 'en-US' })
  const tabletPage = await openGame(tablet, errors)
  await tabletPage.tap('[data-action="daily"]')
  await tabletPage.waitForSelector('[data-screen="hud"].is-active')
  if (!(await tabletPage.locator('[data-touch="1"]').isVisible())) throw new Error('touch controls are not visible on a tablet')
  await tabletPage.screenshot({ path: `${out}/08-tablet-hud.png` })
  await tablet.close()

  if (errors.length) throw new Error(`console errors:\n  ${errors.join('\n  ')}`)
  await browser.close()
  cleanup()
  console.log(`smoke: OK — screenshots in ${out}/`)
} catch (err) {
  await fail(err?.message ?? String(err))
}
