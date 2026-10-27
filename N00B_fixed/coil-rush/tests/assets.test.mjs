import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const read = p => readFileSync(join(process.cwd(), p), 'utf8')

it('every picture, sound, model and font the game asks for is in public/assets', () => {
  const assets = read('src/engine/assets.ts')
  const media = [...assets.matchAll(/mediaUrl\('([^']+)'\)/g)].map(m => `public/assets/media/${m[1]}`)
  const fonts = [...read('src/engine/fonts.ts').matchAll(/fontUrl\('([^']+)'\)/g)].map(m => `public/assets/fonts/${m[1]}`)
  const others = ['public/assets/share/favicon-coil-rush-128.png', 'public/assets/models/nebula-asteroid-512.glb']
  expect(media.length).toBeGreaterThan(40)
  expect(fonts.length).toBe(2)
  for (const f of [...media, ...fonts, ...others]) expect(existsSync(join(process.cwd(), f)), f).toBe(true)
})

it('nothing in the source depends on a tool or a host outside the game', () => {
  const name = new RegExp(['ma', 'nus'].join('') + '|assets[.]lock', 'i')
  for (const f of ['src/engine/assets.ts', 'src/engine/fonts.ts', 'src/main.ts', 'src/game/config.ts', 'index.html', 'vite.config.ts', 'package.json']) {
    expect(read(f), f).not.toMatch(name)
  }
})

it('the game never talks to another site', () => {
  for (const f of ['src/main.ts', 'src/engine/assets.ts', 'src/engine/fonts.ts', 'src/ui/online.ts', 'index.html']) {
    expect(read(f), f).not.toMatch(/https?:\/\/(?!www\.w3\.org)/)
  }
})
