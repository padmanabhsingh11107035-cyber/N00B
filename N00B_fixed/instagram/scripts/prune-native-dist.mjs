// The Android app loads the LIVE website (capacitor.config.json server.url), so the copy of the website that `cap sync` packs inside the app is never shown, except the
// "no connection" page (errorPath native-offline.html) and the one picture it uses. Packing the whole website (games, music, pictures: 266 MB) made every app file 230+ MB,
// slow to build, download and upload. This keeps only what the app can really show, in the folder the app is built from (dist, in the build runner only).
// usage: node scripts/prune-native-dist.mjs [dist folder]
import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve(process.argv[2] || 'dist');
// index.html must exist (Capacitor insists); it is never shown, because the app opens the live address, so it only forwards there
const STUB = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>NOOB</title>'
  + '<meta http-equiv="refresh" content="0;url=https://noobsocials.com/"></head><body style="background:#F8CB46"></body></html>\n';
const KEEP = ['native-offline.html', 'noob-icon-192.png'];

const missing = KEEP.filter((f) => !fs.existsSync(path.join(dist, f)));
if (missing.length) { console.error('prune-native-dist: missing ' + missing.join(', ') + ' in ' + dist); process.exit(1); }
const size = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? size(path.join(d, e.name)) : fs.statSync(path.join(d, e.name)).size), 0);
const before = size(dist);
const kept = new Map(KEEP.map((f) => [f, fs.readFileSync(path.join(dist, f))]));
for (const e of fs.readdirSync(dist)) fs.rmSync(path.join(dist, e), { recursive: true, force: true });
fs.writeFileSync(path.join(dist, 'index.html'), STUB);
for (const [f, buf] of kept) fs.writeFileSync(path.join(dist, f), buf);
console.log(`prune-native-dist: ${(before / 1048576).toFixed(1)} MB -> ${(size(dist) / 1048576).toFixed(2)} MB (${fs.readdirSync(dist).join(', ')})`);
