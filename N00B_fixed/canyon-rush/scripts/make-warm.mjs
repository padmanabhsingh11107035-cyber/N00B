// Writes dist/warm.json: the files the Games page fetches quietly in the background so the game starts at once.
//   "shell": what the title screen needs (scripts, style, fonts, logo, interface sounds, title music)
//   "race":  what the first race needs (the game's own "race" stage + the race music)
// Run after `vite build` (the script and style names change with every build, so they are read from dist).
import { readdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const dist = 'dist'
const list = (dir, keep = () => true) => (existsSync(join(dist, dir)) ? readdirSync(join(dist, dir)).filter(keep).map(f => `${dir}/${f}`) : [])
const CARS = ['mesa', 'dune', 'arroyo', 'sidewinder', 'longhorn', 'stingbolt', 'scorchquill']
const PROPS = ['boulder', 'spire', 'saguaro']
const shell = [
  ...list('build'),
  ...list('fonts', f => f.endsWith('.woff2')),
  'assets/ui/canyon-rush-mark.png', 'assets/ui/logo.webp', 'assets/ui/loading-bg-sm.webp',
  ...list('assets/audio', f => f.startsWith('ui-')),
  'assets/audio/m-title.mp3'
]
const race = [
  ...list('assets/fx'), ...list('assets/sky'), ...list('assets/tex'),
  ...[...CARS, ...PROPS].map(n => `assets/models/${n}.glb`),
  ...list('assets/audio', f => !f.startsWith('ui-') && !f.startsWith('m-')),
  'assets/audio/m-race.mp3'
]
for (const f of [...shell, ...race]) if (!existsSync(join(dist, f))) throw new Error(`warm list names a file that is not in the build: ${f}`)
writeFileSync(join(dist, 'warm.json'), JSON.stringify({ shell, race }, null, 1) + '\n')
console.log(`warm.json: ${shell.length} files for the title screen, ${race.length} for the first race`)

// The game's main script is loaded by the small first script: tell the browser about it from the start, so the two download side by side instead of one after the other.
const html = readFileSync(join(dist, 'index.html'), 'utf8')
const main = shell.find(f => f.startsWith('build/bootstrap-') && f.endsWith('.js'))
if (main && !html.includes('modulepreload')) {
  writeFileSync(join(dist, 'index.html'), html.replace('</head>', `    <link rel="modulepreload" crossorigin href="./${main}">
  </head>`))
  console.log('index.html: main script preloaded')
}
