// Dev look-dev helper: node scripts/assets/shot.mjs <out.png> "<query>" [width] [height]
import { chromium } from 'playwright'

const [out, query = '', w = '1280', h = '720'] = process.argv.slice(2)
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } })
const errors = []
page.on('pageerror', e => errors.push(String(e)))
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
await page.goto(`http://127.0.0.1:3000/viewer.html?${query}`)
await page.waitForFunction(() => window.__viewerReady || window.__viewerError, null, { timeout: 120000 })
const err = await page.evaluate(() => window.__viewerError)
await page.waitForTimeout(400)
await page.screenshot({ path: out })
if (err) console.log('VIEWER ERROR', err)
if (errors.length) console.log('ERRORS', errors.slice(0, 5).join('\n'))
console.log('saved', out)
await browser.close()
