// Writes dist/warm.json: the files the Games page fetches quietly in the background so the game starts at once.
//   "shell": what the title screen needs (the game's scripts and style, the two interface fonts, the menu icons and the click sounds: about 0.5 MB)
//   "race":  what the first match needs (the painted backdrop, the particle sheet, the surfaces, the asteroid model and the sound effects), fetched once the game's own page opens
// The music (about 5 MB) is not on either list: the game streams it by itself while the title is up.
// Run after `vite build` (the script and style names change with every build, so they are read from dist).
import { readdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const dist = 'dist'
const list = (dir, keep = () => true) => (existsSync(join(dist, dir)) ? readdirSync(join(dist, dir)).filter(keep).map(f => `${dir}/${f}`) : [])
const shell = [
  ...list('build'),
  ...list('assets/fonts'),
  ...list('assets/media/icons'),
  'assets/media/audio/sfx-ui-hover.mp3', 'assets/media/audio/sfx-ui-click.mp3',
  'assets/share/favicon-coil-rush-128.png', 'favicon.svg',
]
const race = [
  ...list('assets/media/bg'), ...list('assets/media/fx'), ...list('assets/media/tex'),
  'assets/models/nebula-asteroid-512.glb',
  ...list('assets/media/audio', f => f.startsWith('sfx-') && !shell.includes(`assets/media/audio/${f}`) && !/supernova|crown|purchase/.test(f)),
]
for (const f of [...shell, ...race]) if (!existsSync(join(dist, f))) throw new Error(`warm list names a file that is not in the build: ${f}`)
writeFileSync(join(dist, 'warm.json'), JSON.stringify({ shell, race }, null, 1) + '\n')
console.log(`warm.json: ${shell.length} files to start, ${race.length} for the first match`)

// The page loads its main script itself: tell the browser about it from the start, so the script and the fonts download side by side.
const html = readFileSync(join(dist, 'index.html'), 'utf8')
const main = shell.find(f => /^build\/index-.*\.js$/.test(f))
if (main && !html.includes('modulepreload')) {
  writeFileSync(join(dist, 'index.html'), html.replace('</head>', `    <link rel="modulepreload" crossorigin href="./${main}">
  </head>`))
  console.log('index.html: main script preloaded')
}
