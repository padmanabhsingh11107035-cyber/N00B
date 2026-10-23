// Tests NOOB Cold Drinks, the scrolling page of ten 3D cans (source in N00B_fixed/cold-drinks, built into public/cold-drinks and served at /cold-drinks/): the ten cans are all there with their
// text, price and design, the built page loads only its own files, nothing is fetched from anywhere, the maker platform's name is nowhere, and the caching rules are in place.
//
// Usage: node scripts/supabase/test-cold-drinks.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const SRC = path.resolve('..', 'cold-drinks');
const OUT = path.resolve('public', 'cold-drinks');
const read = (p) => fs.readFileSync(p, 'utf8');
const MAKER = ['ma', 'nus'].join('');

section('1. The ten cans');
const { FLAVORS } = await import(pathToFileURL(path.join(SRC, 'src', 'flavors.js')).href);
check(FLAVORS.length === 10, 'ten cans');
check(new Set(FLAVORS.map((f) => f.id)).size === 10 && new Set(FLAVORS.map((f) => f.name)).size === 10, 'every can has its own id and name');
check(FLAVORS.every((f) => f.name && f.tagline && Array.isArray(f.notes) && f.notes.length >= 3 && f.size === '330 ml'), 'each has a name, a tagline, three notes and the size');
check(FLAVORS.every((f) => Number.isFinite(f.price) && f.price > 0 && f.sweet >= 1 && f.sweet <= 5 && f.fizz >= 1 && f.fizz <= 5), 'each has a price and sweet / fizz levels from 1 to 5');
const hex = /^#[0-9a-f]{6}$/i;
check(FLAVORS.every((f) => ['a', 'b', 'bg1', 'bg2'].every((k) => hex.test(f.colors[k]))), 'each has its page colours');
const paintSrc = read(path.join(SRC, 'src', 'paint.js'));
check(FLAVORS.every((f) => hex.test(f.design.color) && hex.test(f.design.ink) && hex.test(f.design.word) && f.design.metalness > 0 && f.design.metalness <= 1), 'each can is plain: one colour, the colour of its doodles, the colour of the logo, how metallic it is');
const lum = (h) => { const n = parseInt(h.slice(1), 16); return 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255); };
check(new Set(FLAVORS.map((f) => f.design.color)).size === 10, 'ten different colours');
check(FLAVORS.some((f) => lum(f.design.color) > 240) && FLAVORS.some((f) => lum(f.design.color) < 40), 'one white can and one black can among them');
check(FLAVORS.every((f) => Math.abs(lum(f.design.word) - lum(f.design.color)) > 90), 'the logo can be read on every can (it is much lighter or darker than the can)');
check(!/halftone|stripes|waves|flake|glitter|brushed|barcode|STAY NOOB/i.test(paintSrc), 'the cans are kept plain: no extra patterns, glitter, bar code or slogans');
const icons = [...paintSrc.matchAll(/function (\w+)\(c, s\)/g)].map((m) => m[1]);
check(['chat', 'star', 'heart', 'moon', 'bolt', 'notes', 'code', 'plus', 'spiral', 'camera', 'headphones', 'squiggle'].every((n) => icons.includes(n)), 'the doodles are the ones of the app\'s own wallpaper (chat bubble, star, heart, moon, bolt, music notes, < >, plus, swirl, camera, headphones, squiggle)');
check(/NOOB/.test(read(path.join(SRC, 'src', 'main.js'))) && /noob-wordmark/.test(read(path.join(SRC, 'src', 'main.js'))) && /tint\(logo, d\.word\)/.test(paintSrc), 'the NOOB logo is printed big on every can');

section('2. How it is made');
const main = read(path.join(SRC, 'src', 'main.js'));
check(/scrollY \/ sectionH\(\)/.test(main) && /rotation\.y = -d \* Math\.PI \* 1\.5/.test(main), 'scrolling moves the cans and turns the one in front');
check(/--bg1/.test(main) && /mixColors\(p, \(f\) => f\.colors\.bg1/.test(main), 'the page takes the colour of the can in front');
check(/FLAVORS\.findIndex\(\(f, i\) => f\.id === want/.test(main), 'a link can open on one can (#cherry-blaze or #8)');
check(/aspect < 1\.05/.test(main) && /body\.stacked/.test(read(path.join(SRC, 'src', 'style.css'))), 'an upright phone gets its own layout (text under the can)');
check(/prefers-reduced-motion/.test(read(path.join(SRC, 'src', 'style.css'))) && /reduceMotion/.test(main), 'people who ask for less motion get it');
const srcFiles = ['main.js', 'can.js', 'paint.js', 'flavors.js', 'dims.js'].map((f) => read(path.join(SRC, 'src', f))).join('\n');
check(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|https?:\/\//.test(srcFiles), 'the page never reaches out to the network and names no other site');

section('2b. A real can: the shape and the metal');
const canSrc = read(path.join(SRC, 'src', 'can.js'));
const neckBlock = canSrc.slice(canSrc.indexOf('const neckGeometry'), canSrc.indexOf('function tabGeometry'));
const radii = [...neckBlock.matchAll(/\[([0-9.]+), ([0-9.]+|BODY_TO)\]/g)].map((m) => ({ r: parseFloat(m[1]), y: m[2] === 'BODY_TO' ? 4.6 : parseFloat(m[2]) }));
const bodyEndR = 1 - 0.1;   // the body ends at 1 - 0.1 s s with s = 1 (see bodyGeometry)
check(/r = 1 - 0\.1 \* s \* s/.test(canSrc) && radii.length >= 10 && Math.abs(radii[0].r - bodyEndR) < 0.011, 'the body ends in a smooth rounded shoulder and the neck starts exactly where it ends');
const outer = radii.slice(0, radii.findIndex((p) => p.y === Math.max(...radii.map((q) => q.y))) + 1);   // the outside of the neck and the rim, up to the top of the ring
const upToRim = outer.filter((p) => p.y <= 4.79);
check(upToRim.length >= 4 && upToRim.every((p) => p.r >= bodyEndR - 0.01), 'the top never bends inwards: from the shoulder to the rim nothing is narrower than where the body ends');
const rim = Math.max(...radii.map((p) => p.r));
check(rim > radii[0].r && rim < 1, 'the rolled rim is a little wider than the neck and narrower than the body, as on a real can');
check(radii[radii.length - 1].y < Math.max(...radii.map((p) => p.y)), 'the lid is sunk inside the rim');
check(/studioEnvironment/.test(main) && /box\(2\.2, 16/.test(canSrc) && !/RoomEnvironment/.test(main + canSrc), 'the metal reflects the light of a photo studio (tall soft boxes), which gives the long bright lines down the can');
check(/clearcoat: 1/.test(canSrc) && /clearcoatNormalMap/.test(canSrc) && /roughnessMap: brushedMap\(\)/.test(canSrc), 'a glossy clear coat with droplets over coloured metal; brushed aluminium for the rim and the bottom');
check(/rotation\.order = 'ZXY'/.test(main) && /rotation\.x = 0\.3/.test(main), 'the can leans towards us a little so the lid and the pull tab show');
check(!/bubble|BUBBLES|glow/i.test(main + canSrc), 'no floating bubbles and no glow sprites (a calm, photographic look)');
check(/vignette/.test(read(path.join(SRC, 'index.html'))) && /grain/.test(read(path.join(SRC, 'index.html'))), 'a soft dark edge and a little film grain, like a photograph');

section('3. The built page');
const html = read(path.join(OUT, 'index.html'));
const refs = [...html.matchAll(/(?:src|href)="(\.\/assets\/[^"]+)"/g)].map((m) => m[1]);
check(refs.length >= 2 && refs.every((r) => fs.existsSync(path.join(OUT, r))), 'the page names its script and style and they are there', JSON.stringify(refs));
const assets = fs.readdirSync(path.join(OUT, 'assets'));
check(assets.length >= 3 && assets.every((f) => /-[A-Za-z0-9_-]{8}\.(js|css|png)$/.test(f)), 'every file in assets/ has a code in its name (so they can be kept for ever)');
check(!/<script(?![^>]*\bsrc=)[^>]*>[^<]/.test(html), 'no script is written into the page itself');
check(!/https?:\/\/(?!localhost)/.test(html.replace(/<noscript>[\s\S]*?<\/noscript>/g, '')), 'the page loads nothing from another site');
check(/<title>NOOB Cold Drinks<\/title>/.test(html) && /name="description"/.test(html), 'it has a title and a description');
const all = [html, ...assets.filter((f) => /\.(js|css)$/.test(f)).map((f) => read(path.join(OUT, 'assets', f))), srcFiles, read(path.join(SRC, 'src', 'style.css')), read(path.join(SRC, 'index.html')), read(path.join(SRC, 'README.md'))].join('\n').toLowerCase();
check(!all.includes(MAKER), 'the name of the maker platform is nowhere (page, scripts, style, source, notes)');

section('4. Served the right way');
const headers = read(path.resolve('public', '_headers'));
check(/\/cold-drinks\/assets\/\*\s+Cache-Control: public, max-age=31536000, immutable/.test(headers), 'its fingerprinted files are kept for a year');
check(/\/cold-drinks\/index\.html\s+Cache-Control: no-cache/.test(headers), 'its page is asked for again every time (so a new build shows at once)');
check(!/\/cold-drinks\/\*\s+! Content-Security-Policy/.test(headers), 'it keeps the strict rules of the whole site (no loosened page policy)');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
