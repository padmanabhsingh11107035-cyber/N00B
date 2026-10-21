// Boss garment check (dev server on :3000). For The Proctor (floor 1) and The Librarian (floor 2):
//  1. lets the boss fight run at a fixed 1/60 s step and ray-casts every (sub-sampled) body vertex
//     backwards through the simulated gown; any hit = body poking out through the cloth (clipping);
//  2. captures back / side / three-quarter stills with the boss turned away from the camera.
// Usage: node scripts/boss-cape.mjs [outDir] [seed] [floors=1,2]
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
const out = process.argv[2] ?? '/tmp/bosscape'
const seed = Number(process.argv[3] ?? 12345)
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const errors = []
let page
const wait = ms => page.waitForTimeout(ms)
const g = (fn, arg) => page.evaluate(fn, arg)
// Fresh page per floor: freezing requestAnimationFrame for the fixed-step phase stops the game loop.
async function boot(floor) {
if (page) await page.close()
page = await browser.newPage({ viewport: { width: 960, height: 720 } })
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`))
await page.goto('http://127.0.0.1:3000/?debug=1', { waitUntil: 'load' })
await page.waitForFunction(() => window.__aegis?.campusLive, null, { timeout: 120000 })
await page.click('.title-menu .btn.primary')
await wait(300)
for (let i = 0; i < 3; i += 1) { const b = await page.$('.modal .btn.primary'); if (b) await b.click(); await wait(250) }
await g(s => window.__aegis.startRun(s), seed)
await page.waitForFunction(() => !window.__aegis.loading, null, { timeout: 90000 })
if (floor === 2) {
  await g(() => window.__aegis.loadFloor(2))
  await page.waitForFunction(() => !window.__aegis.loading && window.__aegis.run.floor === 2, null, { timeout: 90000 })
  await wait(800)
}
}

const steps = n => g(k => { const a = window.__aegis; for (let i = 0; i < k; i += 1) { a.step(1 / 60); a.render(1, 1 / 60) } }, n)
const grab = async name => {
  const url = await g(() => { const a = window.__aegis; a.step(1 / 60); a.render(1, 1 / 60); return document.querySelector('canvas').toDataURL('image/png') })
  writeFileSync(`${out}/${name}.png`, Buffer.from(url.split(',')[1], 'base64'))
  return `${out}/${name}.png`
}
// Render the current frame from an orbit camera around the boss (rel 0 = directly behind it).
const orbit = async (name, rel, dist = 7, h = 3.2) => {
  const url = await g(([r, d, hh]) => {
    const a = window.__aegis, b = a.boss
    const cam = a.cam.camera.clone()
    const ang = b.facing + Math.PI + r // facing = atan2(forward.x, forward.z)
    cam.position.set(b.pos.x + Math.sin(ang) * d, hh, b.pos.z + Math.cos(ang) * d)
    cam.lookAt(b.pos.x, 2.2, b.pos.z)
    cam.updateMatrixWorld()
    a.renderer.render(a.scene, cam)
    return document.querySelector('canvas').toDataURL('image/png')
  }, [rel, dist, h])
  writeFileSync(`${out}/${name}.png`, Buffer.from(url.split(',')[1], 'base64'))
  return `${out}/${name}.png`
}
const force = process.env.FORCE // e.g. FORCE=slam: restart this attack whenever the boss idles
const summary = {}
const shots = []
const floors = (process.argv[4] ?? '1,2').split(',').map(Number)
for (const floor of floors) {
  await boot(floor)
  await g(() => { const a = window.__aegis; const r = a.run; const b = r.plan.rooms[r.plan.boss]; const c = a.level.roomCenter(b); a.hero.place(c.x, c.z + 7); a.hero.stats.maxHp = 99999; a.hero.hp = 99999; a.cam.snap() })
  await page.waitForFunction(() => window.__aegis.boss?.targetable && window.__aegis.boss?.anim?.cape, null, { timeout: 90000 }).catch(() => errors.push(`floor ${floor}: boss/cape not ready`))
  const name = await g(() => window.__aegis.boss.def.name)
  // Freeze the real loop; only fixed steps advance the game from here.
  await g(() => { window.__raf0 ??= window.requestAnimationFrame; window.requestAnimationFrame = () => 0 })
  await g(() => {
    const a = window.__aegis
    const boss = a.boss
    const cape = boss.anim.cape
    const body = []
    boss.rig.char.root.traverse(o => { if (o.isSkinnedMesh) body.push(o) })
    const tmp = new (a.cam.camera.position.constructor)()
    window.__diag = () => {
      const CW = 11, P = cape.p, CH = P.length / CW
      const bx = -cape.back.x, bz = -cape.back.z
      const lim = 0.5 * cape.s
      let n = 0, total = 0, max = 0
      const bones = {}
      for (const m of body) {
        const pos = m.geometry.getAttribute('position')
        const si = m.geometry.getAttribute('skinIndex'), sw = m.geometry.getAttribute('skinWeight')
        for (let i = 0; i < pos.count; i += 3) {
          m.getVertexPosition(i, tmp); tmp.applyMatrix4(m.matrixWorld)
          total += 1
          const ox = tmp.x, oy = tmp.y, oz = tmp.z
          let best = Infinity
          for (let y = 0; y < CH - 1; y += 1) for (let x = 0; x < CW - 1; x += 1) {
            const i0 = y * CW + x
            for (const tri of [[i0, i0 + 1, i0 + CW], [i0 + 1, i0 + CW + 1, i0 + CW]]) {
              const A = P[tri[0]], B = P[tri[1]], C = P[tri[2]]
              const e1x = B.x - A.x, e1y = B.y - A.y, e1z = B.z - A.z
              const e2x = C.x - A.x, e2y = C.y - A.y, e2z = C.z - A.z
              const px = -bz * e2y, py = bz * e2x - bx * e2z, pz = bx * e2y
              const det = e1x * px + e1y * py + e1z * pz
              if (Math.abs(det) < 1e-9) continue
              const inv = 1 / det
              const tx = ox - A.x, ty = oy - A.y, tz = oz - A.z
              const u = (tx * px + ty * py + tz * pz) * inv
              if (u < 0 || u > 1) continue
              const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x
              const w = (bx * qx + bz * qz) * inv
              if (w < 0 || u + w > 1) continue
              const t = (e2x * qx + e2y * qy + e2z * qz) * inv
              if (t > 0 && t < best) best = t
            }
          }
          if (best < lim) {
            n += 1
            max = Math.max(max, best / cape.s)
            let bi = 0, bw = -1
            for (let k = 0; k < 4; k += 1) { const wv = sw.getComponent(i, k); if (wv > bw) { bw = wv; bi = si.getComponent(i, k) } }
            const b = m.skeleton.bones[bi].name
            bones[b] = (bones[b] ?? 0) + 1
          }
        }
      }
      return { n, total, max, bones, state: boss.state }
    }
  })
  // 1. Penetration over ~9 s of the real fight AI (attacks, moves, blinks).
  const samples = []
  let worstN = -1
  for (let k = 0; k < 22; k += 1) {
    if (force) await g(f => { const a = window.__aegis; if (a.boss.state === 'idle') { a.boss.t = 99; a.boss.begin(f, a.bossCtx()) } }, force)
    await steps(force ? 8 : 24)
    await g(() => { const a = window.__aegis; a.hero.hp = a.hero.stats.maxHp })
    const d = await g(() => window.__diag())
    samples.push(d)
    if (d.n > worstN) { worstN = d.n; await orbit(`${floor}-worst-side`, Math.PI / 2, 6); await orbit(`${floor}-worst-back`, 0.35, 6) }
  }
  const worst = samples.reduce((m, s) => (s.n > m.n ? s : m), samples[0])
  const bones = {}
  for (const s of samples) for (const [b, c] of Object.entries(s.bones)) bones[b] = (bones[b] ?? 0) + c
  summary[name] = {
    hitVerts: samples.reduce((a, s) => a + s.n, 0),
    sampledVerts: samples.reduce((a, s) => a + s.total, 0),
    worstFrame: { n: worst.n, state: worst.state },
    maxDepthHeroUnits: +Math.max(...samples.map(s => s.max)).toFixed(3),
    states: [...new Set(samples.map(s => s.state))],
    bones,
  }
  // 2. Stills from an orbit camera (the boss keeps fighting normally).
  for (const [label, rel] of [['back', 0], ['side', Math.PI / 2], ['34', Math.PI * 0.25]]) {
    await steps(20)
    shots.push(await orbit(`${floor}-${label}`, rel))
  }
  shots.push(`${out}/${floor}-worst-side.png`, `${out}/${floor}-worst-back.png`)
}
console.log(JSON.stringify(summary, null, 1))
execFileSync('python3', ['-c', `
from PIL import Image
import sys
ims=[Image.open(f).convert('RGB') for f in sys.argv[1:]]
w=480; ims=[i.resize((w,int(i.height*w/i.width))) for i in ims]
cols=5; rows=(len(ims)+cols-1)//cols
sheet=Image.new('RGB',(w*cols,ims[0].height*rows))
for k,i in enumerate(ims): sheet.paste(i,((k%cols)*w,(k//cols)*ims[0].height))
sheet.save('${out}/sheet.png')`, ...shots])
console.log(errors.length ? errors.join('\n') : 'no page errors')
await browser.close()
