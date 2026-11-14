// Makes the pictures of the yellow opening screen from public/brand/noob-splash-logo.svg:
//   public/launch/*.png      iPhone / iPad launch pictures (yellow, the logo in the middle, no words), linked in index.html as apple-touch-startup-image
//   public/brand/noob-splash-logo-1024.png   the logo on a transparent background (for the Android launch drawable)
// It uses a headless Chrome or Edge that is already on the computer (nothing to install):  node scripts/gen-splash-assets.mjs
// Run it with TEMP/TMP on a roomy drive. The sizes are in LAUNCH below; index.html carries one <link> per entry (a test checks they match).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const LAUNCH = [   // [pixel width, pixel height, css width, css height, pixel ratio]
  [1320, 2868, 440, 956, 3], [1206, 2622, 402, 874, 3], [1290, 2796, 430, 932, 3], [1179, 2556, 393, 852, 3], [1284, 2778, 428, 926, 3],
  [1170, 2532, 390, 844, 3], [1125, 2436, 375, 812, 3], [1242, 2688, 414, 896, 3], [828, 1792, 414, 896, 2], [1242, 2208, 414, 736, 3],
  [750, 1334, 375, 667, 2], [2048, 2732, 1024, 1366, 2], [1668, 2388, 834, 1194, 2], [1668, 2224, 834, 1112, 2], [1536, 2048, 768, 1024, 2],
];
const YELLOW = '#F8CB46';
const svgFile = 'public/brand/noob-splash-logo.svg';
const inner = (fs.readFileSync(svgFile, 'utf8').match(/<svg[^>]*>([\s\S]*)<\/svg>/) || [])[1];
if (!inner) throw new Error('logo svg not found');
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!chrome) throw new Error('no Chrome or Edge found');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noob-splash-'));

function shot(w, h, body, bg, out) {
  const page = path.join(tmp, 'p.html');
  fs.writeFileSync(page, `<!doctype html><meta charset="utf-8"><body style="margin:0;width:${w}px;height:${h}px;overflow:hidden;background:${bg};display:flex;align-items:center;justify-content:center">${body}</body>`);
  const args = ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--user-data-dir=${path.join(tmp, 'profile')}`, `--window-size=${w},${h}`, `--screenshot=${path.resolve(out)}`];
  if (bg === 'transparent') args.push('--default-background-color=00000000');
  spawnSync(chrome, [...args, 'file:///' + page.split(path.sep).join('/')], { stdio: 'ignore' });
  if (!fs.existsSync(out)) throw new Error('screenshot failed: ' + out);
}
fs.mkdirSync('public/launch', { recursive: true });
for (const [w, h] of LAUNCH) {
  const lw = Math.min(Math.round(w * 0.62), Math.round(w * 0.9));
  const logo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="132 389 758 210" style="width:${lw}px;height:auto">${inner}</svg>`;
  const out = `public/launch/launch-${w}x${h}.png`;
  shot(w, h, logo, YELLOW, out);
  console.log(out, Math.round(fs.statSync(out).size / 1024) + ' KB');
}
shot(1024, 1024, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="132 389 758 210" style="width:900px;height:auto">${inner}</svg>`, 'transparent', 'public/brand/noob-splash-logo-1024.png');
console.log('public/brand/noob-splash-logo-1024.png');
fs.rmSync(tmp, { recursive: true, force: true });
