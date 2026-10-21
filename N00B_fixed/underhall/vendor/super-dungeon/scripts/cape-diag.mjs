// Cape penetration diagnostic: during run/sprint, casts a ray from every (sub-sampled) skinned body
// vertex along -back; if it hits a cape triangle the vertex is outside the cloth (clipping). Reports
// penetration grouped by the vertex's dominant bone, plus the cape row that was pierced.
import { chromium } from 'playwright'
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 480, height: 600 } })
const wait = ms => page.waitForTimeout(ms)
const g = (fn, arg) => page.evaluate(fn, arg)
await page.goto('http://127.0.0.1:3000/?debug=1', { waitUntil: 'load' })
await page.waitForFunction(() => window.__aegis?.campusLive, null, { timeout: 120000 })
await page.click('.title-menu .btn.primary')
await wait(300)
for (let i = 0; i < 3; i += 1) { const b = await page.$('.modal .btn.primary'); if (b) await b.click(); await wait(250) }
await page.waitForFunction(() => !!window.__aegis.hero.rig?.cape, null, { timeout: 60000 })
await g(() => window.__aegis.startRun(12345))
await page.waitForFunction(() => !window.__aegis.loading, null, { timeout: 90000 })
await wait(800)
const c0 = await g(() => { const a = window.__aegis; const c = a.level.roomCenter(a.run.plan.rooms[a.run.plan.path[0]]); return { x: c.x, z: c.z } })
await g(() => { window.requestAnimationFrame = () => 0 })
await g(() => {
  const a = window.__aegis
  const v = a.hero.rig
  const cape = v.cape
  const body = []
  v.char.root.traverse(o => { if (o.isSkinnedMesh) body.push(o) })
  const V = a.cam.camera.position.constructor
  const tmp = new V()
  window.__diag = () => {
    const CW = 11, P = cape.p
    const CH = P.length / CW
    const bx = -cape.back.x, bz = -cape.back.z // ray direction: from vertex away from the camera
    const hits = []
    for (const m of body) {
      const pos = m.geometry.getAttribute('position')
      const si = m.geometry.getAttribute('skinIndex'), sw = m.geometry.getAttribute('skinWeight')
      for (let i = 0; i < pos.count; i += 2) {
        m.getVertexPosition(i, tmp)
        tmp.applyMatrix4(m.matrixWorld)
        const ox = tmp.x, oy = tmp.y, oz = tmp.z
        let best = Infinity, row = -1
        for (let y = 0; y < CH - 1; y += 1) for (let x = 0; x < CW - 1; x += 1) {
          const i0 = y * CW + x
          for (const tri of [[i0, i0 + 1, i0 + CW], [i0 + 1, i0 + CW + 1, i0 + CW]]) {
            const A = P[tri[0]], B = P[tri[1]], C = P[tri[2]]
            const e1x = B.x - A.x, e1y = B.y - A.y, e1z = B.z - A.z
            const e2x = C.x - A.x, e2y = C.y - A.y, e2z = C.z - A.z
            // p = d x e2 (d = (bx,0,bz))
            const px = 0 * e2z - bz * e2y, py = bz * e2x - bx * e2z, pz = bx * e2y - 0 * e2x
            const det = e1x * px + e1y * py + e1z * pz
            if (Math.abs(det) < 1e-9) continue
            const inv = 1 / det
            const tx = ox - A.x, ty = oy - A.y, tz = oz - A.z
            const u = (tx * px + ty * py + tz * pz) * inv
            if (u < 0 || u > 1) continue
            const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x
            const w = (bx * qx + 0 * qy + bz * qz) * inv
            if (w < 0 || u + w > 1) continue
            const t = (e2x * qx + e2y * qy + e2z * qz) * inv
            if (t > 0 && t < best) { best = t; row = y }
          }
        }
        if (best < Infinity && best < 0.5) {
          let bi = 0, bw = -1
          for (let k = 0; k < 4; k += 1) { const wv = sw.getComponent(i, k); if (wv > bw) { bw = wv; bi = si.getComponent(i, k) } }
          hits.push({ bone: m.skeleton.bones[bi].name, depth: best, row, mesh: m.name })
        }
      }
    }
    const by = {}
    for (const h of hits) { const o = (by[h.bone] ??= { n: 0, max: 0, rows: {} }); o.n += 1; o.max = Math.max(o.max, h.depth); o.rows[h.row] = (o.rows[h.row] ?? 0) + 1 }
    return by
  }
})
const steps = n => g(k => { const a = window.__aegis; for (let i = 0; i < k; i += 1) { a.step(1 / 60); a.render(1, 1 / 60) } }, n)
const place = (dx, dz) => g(([c, d]) => { const a = window.__aegis; a.hero.place(c.x + d[0], c.z + d[1], Math.PI); a.cam.yaw = Math.PI; a.cam.snap() }, [c0, [dx, dz]])
await place(0, 0); await steps(30)
await page.keyboard.down('KeyW'); await steps(20); await page.keyboard.up('KeyW')
const d = await g(c => { const p = window.__aegis.hero.pos; return { x: p.x - c.x, z: p.z - c.z } }, c0)
const len = Math.hypot(d.x, d.z) || 1
const dir = { x: d.x / len, z: d.z / len }
const agg = {}
for (const keys of [['KeyW'], ['ShiftLeft', 'KeyW']]) {
  await place(-dir.x * 4.5, -dir.z * 4.5); await steps(45)
  for (const k of keys) await page.keyboard.down(k)
  await steps(14)
  for (let f = 0; f < 10; f += 1) {
    await steps(3)
    const by = await g(() => window.__diag())
    for (const [b, o] of Object.entries(by)) { const A = (agg[b] ??= { n: 0, max: 0, rows: {} }); A.n += o.n; A.max = Math.max(A.max, o.max); for (const [r, c] of Object.entries(o.rows)) A.rows[r] = (A.rows[r] ?? 0) + c }
  }
  for (const k of keys) await page.keyboard.up(k)
}
for (const [b, o] of Object.entries(agg).sort((x, y) => y[1].n - x[1].n)) console.log(b.padEnd(14), 'verts', String(o.n).padStart(5), 'maxDepth', o.max.toFixed(3), 'rows', JSON.stringify(o.rows))
await browser.close()
