// Fails the build when the shipped bundle grows past the budget, so starter projects stay fast
// to load on mobile networks. JS/CSS are measured gzipped (what the CDN sends); fonts are already
// compressed woff2 and budgeted separately because CJK coverage is large. Audio (Lyria music,
// ElevenLabs SFX) is fetched after the first click and music streams per track, so it has its
// own budget and is not part of the initial transfer. Sharing artwork is only used by link previews.
// 3D assets (models/, tex/, fx/) are fetched per stage by the heat-gated streamer (title + first wave
// before the title screen, the rest in the background), so they also get their own budget (raw bytes;
// meshopt GLBs shrink a further ~4x when the host gzips them).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const MB = 1024 * 1024
const BUDGET = { js: 2.0 * MB, fonts: 2.2 * MB, transfer: 4.4 * MB, audio: 10 * MB, assets3d: 10 * MB }
const walk = dir => readdirSync(dir).flatMap(name => {
  const p = join(dir, name)
  return statSync(p).isDirectory() ? walk(p) : [p]
})
const files = walk('dist').map(path => {
  const raw = readFileSync(path)
  const text = /\.(js|css|html|json|svg)$/.test(path)
  return { path, size: raw.length, wire: text ? gzipSync(raw).length : raw.length }
})
const sum = pred => files.filter(pred).reduce((n, f) => n + f.wire, 0)
const js = sum(f => f.path.endsWith('.js'))
const fonts = sum(f => f.path.endsWith('.woff2'))
const isAudio = f => /[\\/]audio[\\/]/.test(f.path)
const isShare = f => /[\\/]share[\\/]/.test(f.path) && !f.path.endsWith('.html')
const audio = sum(isAudio)
const is3d = f => /[\\/](models|tex|fx)[\\/]/.test(f.path)
const assets3d = sum(is3d)
const transfer = sum(f => !f.path.endsWith('.txt') && !isAudio(f) && !isShare(f) && !is3d(f))
const mb = n => `${(n / MB).toFixed(2)} MB`
console.log(`bundle (gzip): js ${mb(js)} / fonts ${mb(fonts)} / initial transfer ${mb(transfer)} / audio ${mb(audio)} / streamed 3D ${mb(assets3d)}`)
const over = Object.entries({ js, fonts, transfer, audio, assets3d }).filter(([k, v]) => v > BUDGET[k])
if (over.length) {
  for (const [k, v] of over) console.error(`over budget: ${k} ${mb(v)} > ${mb(BUDGET[k])}`)
  process.exit(1)
}
