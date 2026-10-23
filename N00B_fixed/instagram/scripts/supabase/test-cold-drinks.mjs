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
check(FLAVORS.every((f) => f.design.base.length === 3 && f.design.base.every((c) => hex.test(c)) && hex.test(f.design.ink) && hex.test(f.design.word) && hex.test(f.design.accent)), 'each has the colours of its can (three steps of colour, doodles, logo, accent)');
check(FLAVORS.every((f) => ['gloss', 'metal'].includes(f.design.finish) && f.design.flake >= 0 && f.design.flake <= 1 && new RegExp(`\\b${f.design.deco}\\(`).test(paintSrc)), 'each is glossy paint or shiny metal, with a pattern that exists');
const bases = FLAVORS.map((f) => f.design.base[1]);
check(new Set(bases).size === 10, 'ten different colours');
const lum = (h) => { const n = parseInt(h.slice(1), 16); return 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255); };
check(FLAVORS.some((f) => lum(f.design.base[1]) > 225) && FLAVORS.some((f) => lum(f.design.base[1]) < 30), 'one white can and one black can among them');
check(FLAVORS.filter((f) => f.design.finish === 'metal').length >= 4 && FLAVORS.filter((f) => f.design.finish === 'gloss').length >= 3, 'both finishes are used: glossy paint and metal');
check(/NOOB/.test(read(path.join(SRC, 'src', 'main.js'))) && /noob-wordmark/.test(read(path.join(SRC, 'src', 'main.js'))) && /tint\(logo, d\.word\)/.test(paintSrc), 'the NOOB logo is printed big on every can');

section('2. How it is made');
const main = read(path.join(SRC, 'src', 'main.js'));
check(/scrollY \/ sectionH\(\)/.test(main) && /rotation\.y = -d \* Math\.PI \* 1\.5/.test(main), 'scrolling moves the cans and turns the one in front');
check(/--bg1/.test(main) && /rimA\.color\.copy\(colA\)/.test(main), 'the page and the lights take the colours of the can in front');
check(/FLAVORS\.findIndex\(\(f, i\) => f\.id === want/.test(main), 'a link can open on one can (#cherry-blaze or #8)');
check(/aspect < 1\.05/.test(main) && /body\.stacked/.test(read(path.join(SRC, 'src', 'style.css'))), 'an upright phone gets its own layout (text under the can)');
check(/prefers-reduced-motion/.test(read(path.join(SRC, 'src', 'style.css'))) && /reduceMotion/.test(main), 'people who ask for less motion get it');
const srcFiles = ['main.js', 'can.js', 'paint.js', 'flavors.js', 'dims.js'].map((f) => read(path.join(SRC, 'src', f))).join('\n');
check(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|https?:\/\//.test(srcFiles), 'the page never reaches out to the network and names no other site');

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
