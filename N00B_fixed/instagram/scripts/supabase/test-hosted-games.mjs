// Games made with Manus that bring their own sound (Helix Fall, Neon Alley: Last Call): the Games page's arcade loop stays out of them, Neon Alley is on the page with its pictures,
// and it is shown in a boxed-in frame that starts loading before Play is pressed.
//
// Usage: node scripts/supabase/test-hosted-games.mjs
import fs from 'node:fs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');

section('1. Neon Alley is on the Games page');
const types = read('src/components/Games/types.ts');
const neon = (types.match(/id: 'neon_alley'[\s\S]*?\n  \},/) || [''])[0];
check(/title: 'Neon Alley: Last Call'/.test(neon) && /embedUrl: 'https:\/\/neonlast-dpzbm55t\.manus\.game\/'/.test(neon), 'it is listed, with its own address');
check(/pointsReward: 0/.test(neon) && /rewardNote: 'Play for fun'/.test(neon), 'it says plainly that it pays no NOOBs');
const posters = [...neon.matchAll(/'(\/game-posters\/neon-alley\/[^']+)'/g)].map((m) => m[1]);
check(posters.length === 5 && posters.every((p) => fs.existsSync(`public${p}`) && fs.statSync(`public${p}`).size < 200 * 1024), 'five web-sized posters');

section('2. The arcade loop stays out of games with their own sound');
check(/ownSound: true/.test(neon) && /id: 'helix_fall'[\s\S]*?ownSound: true/.test(types), 'both games are marked as bringing their own sound');
const view = read('src/components/Games/GamesView.tsx');
check(/const quietGame = !!selectedGameForPlay\?\.ownSound;/.test(view) && /if \(quietGame\) \{ stopGameMusic\(\); return undefined; \}/.test(view) && /\}, \[quietGame\]\);/.test(view), 'the Games page music stops while one of them is open and comes back when it is closed');
check(!/setGameMusicOn\(false\)/.test(view.replace(/setGameMusicOn\(next\)/g, '')), 'and the person\'s own on/off choice is never changed by that');

section('3. The frame');
const frame = read('src/components/Games/minigames/HostedGameFrame.tsx');
const sandbox = (frame.match(/sandbox="([^"]+)"/) || [])[1] || '';
check(/allow-scripts/.test(sandbox) && /allow-same-origin/.test(sandbox) && !/allow-top-navigation/.test(sandbox) && !/allow-forms/.test(sandbox), 'it is boxed in: it can run but cannot navigate NOOB away');
check(/referrerPolicy="no-referrer"/.test(frame), 'it is told nothing about who opened it');
const modal = read('src/components/Games/GamePlayModal.tsx');
check(/game\.embedUrl && \(currentMode === 'select_mode' \|\| currentMode === 'play_bot'\)/.test(modal) && /visible=\{currentMode === 'play_bot'\}/.test(modal), 'it is added when the game\'s page opens (out of sight) and only brought into view by Play, so the download has a head start');
check(/!game\.embedUrl && \(\s*<GenericArcadeGame/.test(modal), 'the generic arcade engine is never used for it');
const headers = read('public/_headers');
check(/frame-src https:/.test(headers), 'the site\'s security rules let the app show a game page from another address');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
