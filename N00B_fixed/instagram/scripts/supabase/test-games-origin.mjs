// Tests utils/gamesOrigin.ts (finding M2): with no games address nothing changes; with one, the frame, the sandbox and the message origin follow it exactly.
// Usage: node scripts/supabase/test-games-origin.mjs
import fs from 'fs';
import ts from 'typescript';
let passed = 0, failed = 0;
const check = (ok, name) => { if (ok) { passed++; console.log('  ok  ', name); } else { failed++; console.log('  FAIL', name); } };

const src = fs.readFileSync('src/utils/gamesOrigin.ts', 'utf8');
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const m = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const APP = 'https://noobsocials.com';

console.log('1. The address');
check(m.cleanGamesOrigin('') === '' && m.cleanGamesOrigin(undefined) === '', 'empty stays empty');
check(m.cleanGamesOrigin('https://games.noobsocials.com/') === 'https://games.noobsocials.com', 'a trailing slash is dropped');
check(m.cleanGamesOrigin('https://games.noobsocials.com/x?y#z') === 'https://games.noobsocials.com', 'only the origin is kept');
check(m.cleanGamesOrigin('http://games.example.com') === '' && m.cleanGamesOrigin('javascript:alert(1)') === '' && m.cleanGamesOrigin('//evil.com') === '' && m.cleanGamesOrigin('https://u:p@x.com') === '', 'plain http, other schemes and credentials are refused');
check(m.cleanGamesOrigin('http://localhost:5173') === 'http://localhost:5173', 'http is allowed for a local test host only');
check(m.GAMES_ORIGIN === '', 'with no build setting the games address is empty');

console.log('2. No games address (today)');
let p = m.planGameFrame('/games/siegecraft/', { appOrigin: APP }, '');
check(p.src === '/games/siegecraft/' && p.origin === APP && p.sandbox === 'allow-scripts allow-pointer-lock allow-popups allow-same-origin' && !p.separate, 'same address, same sandbox as before, messages to and from the app origin');
p = m.planGameFrame('/games/royal-ludo/', { isolated: true, appOrigin: APP }, '');
check(!/allow-same-origin/.test(p.sandbox) && p.origin === '' && p.src === '/games/royal-ludo/', 'an isolated game gets no allow-same-origin');
p = m.planGameFrame('/games/color-sort/', { isolated: true, bridge: true, appOrigin: APP }, '');
check(/allow-same-origin/.test(p.sandbox) && p.origin === APP, 'a game with a bridge is never isolated (and its messages are checked against the app origin)');

console.log('3. With a games address');
const G = 'https://games.noobsocials.com';
p = m.planGameFrame('/games/siegecraft/', { appOrigin: APP }, G);
check(p.separate && p.src === `${G}/games/siegecraft/#noob-parent=${encodeURIComponent(APP)}` && p.origin === G && /allow-same-origin/.test(p.sandbox), 'the frame loads from the games address; messages are checked against exactly that origin');
p = m.planGameFrame('/games/royal-ludo/', { isolated: true, appOrigin: APP }, G);
check(p.separate && /allow-same-origin/.test(p.sandbox), 'an isolated game keeps its saves on the games address (nothing of the app is there)');
p = m.planGameFrame('/games/noob-run-3d/', { bridge: true, appOrigin: APP }, G);
check(p.separate && p.origin === G && p.src === `${G}/games/noob-run-3d/#noob-parent=${encodeURIComponent(APP)}`, 'noob-run-3d is on the games address now');
p = m.planGameFrame('/games/helix-fall/?embed=1&name=A', { bridge: true, appOrigin: APP }, G);
check(p.separate && p.origin === G && p.src === `${G}/games/helix-fall/?embed=1&name=A#noob-parent=${encodeURIComponent(APP)}` && /allow-same-origin/.test(p.sandbox) && !/allow-top-navigation/.test(p.sandbox), 'helix fall is on the games address (query kept, fragment added, strict sandbox)');
p = m.planGameFrame('/games/x/', { sameOriginOnly: true, bridge: true, appOrigin: APP }, G);
check(!p.separate && p.src === '/games/x/' && p.origin === APP, 'the sameOriginOnly flag (kept for a game that cannot move) still keeps a game on the app address');

console.log('4. The patched game files use the fragment value as target and accepted origin');
const types = fs.readFileSync('src/components/Games/types.ts', 'utf8');
check(!/sameOriginOnly: true/.test(types), 'no game in the list is flagged sameOriginOnly any more');
// the exact expression the three bundles carry in place of window.location.origin
const EXPR = "(()=>{try{let m=/[#&]noob-parent=([^&]+)/.exec(window.location.hash);if(m){let o=new URL(decodeURIComponent(m[1])).origin;if(o!=='null'&&o!==window.location.origin)return o}}catch{}return window.location.origin})()";
const files = {
  'noob-run-3d': ['public/games/noob-run-3d/build/index-RczImZTD-n1.js', 2],
  critterkart: ['public/games/critterkart/build/index-CHyWxhOt-n1.js', 2],
  'helix-fall': ['public/games/helix-fall/assets/index-b2ec185e-n1.js', 6],
};
for (const [name, [file, uses]] of Object.entries(files)) {
  const code = fs.readFileSync(file, 'utf8');
  const stripped = code.split(EXPR).join('@@');
  check(code.split(EXPR).length - 1 === uses, `${name}: ${uses} bridge places carry the fragment-origin expression`);
  check(!/postMessage\([^;]*?,\s*(window\.)?location\.origin\)/.test(stripped) && !/\.origin\s*!==\s*(window\.)?location\.origin/.test(stripped), `${name}: no message target or accepted origin is still the page's own origin`);
  check(!/postMessage\([^;]*?,\s*['"`]\*['"`]\)/.test(stripped), `${name}: no message is addressed to *`);
}
const probe = fs.readFileSync('public/games/helix-fall/embed-probe.js', 'utf8');
check(probe.includes(EXPR) && !/postMessage\([^;]*,\s*location\.origin\)/.test(probe), 'helix fall probe: reports to the fragment origin only');
for (const dir of ['noob-run-3d', 'critterkart', 'helix-fall']) {
  const html = fs.readFileSync(`public/games/${dir}/index.html`, 'utf8');
  const named = [...html.matchAll(/(?:src|href)="\.\/([^"?]+\.js)/g)].map((x) => x[1]);
  check(named.length > 0 && named.every((n) => fs.existsSync(`public/games/${dir}/${n}`)), dir + ': the page names files that exist');
  check(named.some((n) => /-n1\.js$/.test(n)), dir + ': the page loads the renamed (patched) bundle, so the year-long browser cache cannot serve the old one');
}
p = m.planGameFrame('//evil.com/x', { appOrigin: APP }, G);
check(!p.separate && !p.src.startsWith(G), 'a protocol-relative path is never sent to the games address');
check(!['*', 'null', undefined].includes(m.planGameFrame('/games/a/', { appOrigin: APP }, G).origin), 'the message origin is never * or null for a game that has a bridge');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
