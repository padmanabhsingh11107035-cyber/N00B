// With the keyboard open in a solid full-screen page, the page under it is hidden, so no strip of the feed shows above the keyboard. Usage: node scripts/supabase/test-keyboard-cover.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildSync } from 'esbuild';

let passed = 0, failed = 0;
const check = (cond, label) => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label}`); } };
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const out = path.resolve('node_modules/.cache-keyboard-cover.mjs');
buildSync({ entryPoints: [path.resolve('src/utils/keyboardCover.ts')], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' });
const K = await import(pathToFileURL(out).href);

console.log('\n1. What counts as solid');
check(K.alphaOf('rgb(9, 9, 11)') === 1 && K.alphaOf('rgba(0, 0, 0, 0.75)') === 0.75 && K.alphaOf('rgb(0 0 0 / 50%)') === 0.5 && K.alphaOf('transparent') === 0 && K.alphaOf('rgba(0, 0, 0, 0)') === 0, 'the opacity of a colour is read right (solid, 75%, 50%, clear)');
const view = { width: 390, height: 844 };
check(K.coversPage({ width: 390, height: 844 }, view, 'rgb(9, 9, 11)', false), 'a solid full-screen page covers the page under it');
check(K.coversPage({ width: 390, height: 844 }, view, 'rgba(0, 0, 0, 0.75)', false), 'a dimmed layer with a sheet on it does too (the strip of page under the sheet is what showed)');
check(!K.coversPage({ width: 390, height: 844 }, view, 'rgba(0, 0, 0, 0)', false), 'a plain wrapper with no colour of its own does not');
check(!K.coversPage({ width: 390, height: 400 }, view, 'rgb(9, 9, 11)', false), 'a half-height sheet does not');
check(K.coversPage({ width: 390, height: 844 }, view, 'rgba(0, 0, 0, 0)', true), 'a page painted with a gradient or a picture does');
const notes = read('src/components/Scratch/ScratchNotes.tsx');
check(/bg-black\/75/.test(notes) && /fixed inset-0/.test(notes), 'the Chalk Notes sheet is a dimmed full-screen layer, so it is covered');

console.log('\n2. The wiring');
const css = read('src/index.css'), main = read('src/main.tsx'), up = read('src/components/Scratch/ScratchUpload.tsx');
check(/html\[data-cover-app\] #root \{ visibility: hidden; \}/.test(css) && /html\[data-cover-app\] \[data-cover-layer\] \{ visibility: visible; \}/.test(css), 'while it is on, the page under is hidden and the full-screen layer stays visible');
check(/installKeyboardCover\(\);/.test(main), 'it is switched on when the app starts');
check(/bg-zinc-950 sm:bg-black\/75/.test(up) && /h-full sm:h-auto/.test(up), 'the Scratch create page is a solid full page on a phone');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
