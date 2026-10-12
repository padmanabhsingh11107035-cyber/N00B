// Tests the parts of NOOB Draw that run on the phone: the spinning reel, the countdown, the rarity look, and that the page is reachable from
// both menus. Pure logic (src/utils/noobDraw.ts) plus a few checks of the wiring: no browser or database needed.
//
// Usage: node scripts/supabase/test-noob-draw-ui.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const M = await import(pathToFileURL(path.resolve('src/utils/noobDraw.ts')).href);
const { buildReel, reelOffset, cardAtMarker, formatCountdown, msUntil, isPackOpen, pointsShort, RARITY, RARITY_ORDER, rarityOf, byRarityDesc, livePictureUrl, firstStickerUrl } = M;

// a repeatable "random" so the checks never flake
const seeded = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const prize = (id, rarity, odds, extra = {}) => ({ id, kind: 'points', label: id, subtitle: '', rarity, odds, amount: 1000000, ref: null, ...extra });
const prizes = [prize('a', 'common', 60), prize('b', 'uncommon', 25), prize('c', 'rare', 10), prize('d', 'epic', 4), prize('e', 'mythic', 1)];

section('1. The reel strip');
const strip = buildReel(prizes, 'e', { length: 56, winnerIndex: 46, rng: seeded(7) });
check(strip.length === 56 && strip[46].id === 'e', 'the strip has the asked length and the won prize sits exactly at the stopping place');
check(strip.every((p) => prizes.some((q) => q.id === p.id)), 'every card on the strip is a real prize of the pack');
check(strip.every((p, i) => i === 0 || p.id !== strip[i - 1].id || i === 46 || i === 47), 'the same card never appears twice in a row (apart from next to the winner)');
const long = buildReel(prizes, null, { length: 4000, rng: seeded(11) });
const share = (id) => long.filter((p) => p.id === id).length / long.length * 100;
check(share('a') > share('b') && share('b') > share('c') && share('c') > share('d') && share('d') > share('e'), 'the filler cards follow the real odds: common ones are seen most, the mythic one least');
check(share('e') > 0, 'even the rarest prize shows up now and then in the filler');
check(buildReel([], 'x').length === 0, 'no prizes: an empty strip, no crash');
check(buildReel(prizes, 'does-not-exist', { rng: seeded(3) }).length === 56, 'a winner that is not in the pack leaves a normal strip');
const one = buildReel([prize('only', 'common', 100)], 'only', { length: 10, winnerIndex: 5 });
check(one.length === 10 && one.every((p) => p.id === 'only'), 'a pack with a single prize still works');
check(buildReel(prizes, 'a', { length: 10, winnerIndex: 99, rng: seeded(1) }).length === 10, 'a stopping place outside the strip is ignored');

section('2. Where the strip stops');
let allRight = true;
for (const index of [3, 20, 46, 55]) for (const jitter of [-0.4, -0.2, 0, 0.2, 0.4]) for (const viewport of [320, 375, 430, 520]) {
  const off = reelOffset(104, 8, index, viewport, jitter);
  if (cardAtMarker(104, 8, off, viewport) !== index) allRight = false;
}
check(allRight, 'with the marker in the middle, the card it points at is always the winner (any phone width, any small offset)');
check(reelOffset(104, 8, 0, 300) === 150 - 52 && reelOffset(104, 8, 10, 300) < reelOffset(104, 8, 0, 300), 'the further the card, the further the strip moves to the left');
check(cardAtMarker(104, 8, reelOffset(104, 8, 7, 360, 0.49), 360) === 7 && cardAtMarker(104, 8, reelOffset(104, 8, 7, 360, 0.6), 360) !== undefined, 'at the very edge of a card it is still that card');

section('3. The countdown');
check(formatCountdown(0) === '0s' && formatCountdown(9500) === '10s' && formatCountdown(61000) === '1m 01s' && formatCountdown(3600000 + 12 * 60000) === '1h 12m', 'seconds, minutes and hours');
check(formatCountdown(6 * 864e5 + 23 * 36e5 + 59 * 6e4) === '6d 23h' && formatCountdown(7 * 864e5) === '7d 0h', 'days and hours for the long wait');
check(formatCountdown(-5000) === '0s', 'never negative');
const now = Date.parse('2026-10-12T10:00:00Z');
check(msUntil('2026-10-12T11:00:00Z', now) === 3600000 && msUntil('2026-10-12T09:00:00Z', now) === 0 && msUntil(null, now) === 0 && msUntil('garbage', now) === 0, 'time until a date (past, missing or broken dates count as now)');
check(isPackOpen({ availableAt: null }, now) && isPackOpen({ availableAt: '2026-10-12T09:59:59Z' }, now) && !isPackOpen({ availableAt: '2026-10-19T10:00:00Z' }, now), 'a spin is open when it has no waiting time left');

section('4. Rarity and looks');
check(RARITY_ORDER.join() === 'common,uncommon,rare,epic,legendary,mythic' && RARITY_ORDER.every((r, i) => RARITY[r].rank === i), 'six rarities from common to mythic, in order');
check(RARITY_ORDER.every((r) => /^#[0-9a-f]{6}$/i.test(RARITY[r].color) && RARITY[r].label) && new Set(RARITY_ORDER.map((r) => RARITY[r].color)).size === 6, 'each has its own colour and a name');
check(rarityOf('epic') === 'epic' && rarityOf('weird') === 'common' && rarityOf(null) === 'common', 'an unknown rarity is shown as common');
check([prize('x', 'common', 50), prize('y', 'mythic', 1), prize('z', 'epic', 4), prize('w', 'epic', 2)].sort(byRarityDesc).map((p) => p.id).join() === 'y,w,z,x', 'the list inside a pack: best prizes first (rarer first among equals)');
check(pointsShort(1000000) === '1M' && pointsShort(2500000) === '2.5M' && pointsShort(1000000000) === '1B' && pointsShort(5000000000) === '5B' && pointsShort(250000) === '250K' && pointsShort(999) === '999' && pointsShort(0) === '' && pointsShort(null) === '', 'big numbers in short form');
check(livePictureUrl('neon_pulse') === '/live-avatars/neon-pulse.svg' && firstStickerUrl('crown,gem') === '/draw-stickers/crown.svg' && firstStickerUrl('') === '' && firstStickerUrl(null) === '', 'picture addresses for live pictures and stickers');
const migration = fs.readFileSync('supabase/migrations/20261012000005_noob_draw.sql', 'utf8');
const refs = [...migration.matchAll(/'live_avatar',\s*'[^']*',\s*'[^']*',\s*'[a-z]+',\s*\d+,\s*null,\s*null,\s*null,\s*'([a-z_]+)'/g)].map((m) => m[1]);
check(refs.length >= 6 && refs.every((id) => fs.existsSync(`public${livePictureUrl(id)}`)), `every live picture that can be won has its file (${refs.length} of them)`, refs.filter((id) => !fs.existsSync(`public${livePictureUrl(id)}`)).join());

section('5. The page is reachable');
const feed = fs.readFileSync('src/components/Feed/FeedView.tsx', 'utf8');
const prof = fs.readFileSync('src/components/Profile/ProfileView.tsx', 'utf8');
const app = fs.readFileSync('src/App.tsx', 'utf8');
const css = fs.readFileSync('src/index.css', 'utf8');
check(feed.indexOf('openNoobDraw()') > 0 && feed.indexOf('openNoobDraw()') < feed.indexOf('setShowDailyNoob(true); }}'), 'the Home page menu (three lines) has NOOB Draw as its FIRST item, above Daily NOOB');
check(/isOwnProfile && \(\s*<button[\s\S]{0,260}openNoobDraw\(\)/.test(prof) && prof.indexOf('openNoobDraw()') < prof.indexOf('<AppearanceSetting />'), 'the Profile three-dots menu has NOOB Draw at the top (own profile)');
check(/<NoobDrawHost currentUser=\{currentUser\} onUserUpdated=\{\(u\) => setCurrentUser\(u\)\} \/>/.test(app), 'the page is mounted once in the app and updates the account (balance, Pro, tick) after a spin');
const api = fs.readFileSync('src/services/api.ts', 'utf8');
check(/fetchNoobDraw,/.test(api) && /spinNoobDraw,/.test(api), 'the two server calls are exported');
check(/\.draw-stage\.force-dark/.test(css) && /@layer base \{[^}]*\.draw-stage\.force-dark/.test(css), 'the Draw keeps its own deep colours over the theme\'s dark-surface rule');
const host = fs.readFileSync('src/components/Draw/NoobDrawHost.tsx', 'utf8');
check(/React\.lazy\(\(\) => import\('\.\/NoobDrawPage'\)\)/.test(host), 'the heavy page is fetched only when opened');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
