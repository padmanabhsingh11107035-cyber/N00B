// Renders the title-screen backdrop: the live campus from the title camera, UI hidden, saved as a
// small webp the page can show on first paint (before any JS) and crossfade into the live scene.
// Usage: node scripts/assets/title-poster.mjs [baseUrl]   (dev server on :3000 by default)
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import { mkdirSync, statSync } from 'node:fs'
const base = process.argv[2] ?? 'http://127.0.0.1:3000/'
const out = 'public/title'
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
// Fresh save (no rescued classmates), poster disabled so the capture is the real render.
await page.goto(`${base}?debug=1&noposter=1`, { waitUntil: 'load' })
await page.waitForFunction(() => window.__aegis?.campusLive === true, null, { timeout: 180000 })
await page.addStyleTag({ content: '#ui, #boot { display: none !important; }' })
await page.waitForTimeout(4000)
// Title camera orbit angle 0 = where the live title scene starts, so the crossfade lines up.
await page.evaluate(() => { window.__aegis.titleAngle = 0 })
await page.screenshot({ path: '/tmp/title-poster.png' })
await browser.close()
execFileSync('python3', ['-c', `
from PIL import Image
im = Image.open('/tmp/title-poster.png').convert('RGB').resize((1280, 720), Image.LANCZOS)
im.save('${out}/campus.webp', quality=62, method=6)
`])
console.log('poster', statSync(`${out}/campus.webp`).size, 'bytes')
