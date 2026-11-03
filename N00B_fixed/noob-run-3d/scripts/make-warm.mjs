// Writes dist/warm.json: the files the Games page fetches quietly in the background so the game starts at once.
//   "shell": everything the game needs to start and play (its scripts, style and fonts)
//   "race":  nothing more (the same name as the other hosted games' lists, so one fetcher reads them all)
// Run after `vite build` (the script, style and model names change with every build, so they are read from dist).
import { readdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const dist = 'dist'
const list = (dir, keep = () => true) => (existsSync(join(dist, dir)) ? readdirSync(join(dist, dir)).filter(keep).map(f => `${dir}/${f}`) : [])
const shell = [...list('build')]   // the page, its scripts, its style and its fonts: everything the game needs (the models, the music and the sounds are made by the game itself)
const race = []
for (const f of [...shell, ...race]) if (!existsSync(join(dist, f))) throw new Error(`warm list names a file that is not in the build: ${f}`)
writeFileSync(join(dist, 'warm.json'), JSON.stringify({ shell, race }, null, 1) + '\n')
console.log(`warm.json: ${shell.length} files`)

// The page loads its main script itself: tell the browser about it from the start, so the script and the fonts download side by side.
const html = readFileSync(join(dist, 'index.html'), 'utf8')
const main = shell.find(f => /^build\/index-.*\.js$/.test(f))
if (main && !html.includes('modulepreload')) {
  writeFileSync(join(dist, 'index.html'), html.replace('</head>', `    <link rel="modulepreload" crossorigin href="./${main}">
  </head>`))
  console.log('index.html: main script preloaded')
}
