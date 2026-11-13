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
p = m.planGameFrame('/games/noob-run-3d/', { sameOriginOnly: true, bridge: true, appOrigin: APP }, G);
check(!p.separate && p.src === '/games/noob-run-3d/' && p.origin === APP, 'a game that cannot move yet stays on the app address');
p = m.planGameFrame('//evil.com/x', { appOrigin: APP }, G);
check(!p.separate && !p.src.startsWith(G), 'a protocol-relative path is never sent to the games address');
check(!['*', 'null', undefined].includes(m.planGameFrame('/games/a/', { appOrigin: APP }, G).origin), 'the message origin is never * or null for a game that has a bridge');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
