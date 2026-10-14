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
const { buildReel, reelOffset, cardAtMarker, formatCountdown, msUntil, isPackOpen, pointsShort, RARITY, RARITY_ORDER, rarityOf, byRarityDesc, livePictureUrl, firstStickerUrl, winTones, winBuzz, tickFreq, tickGapOk, SPIN_MS, TICK_BUZZ_MS, MIN_TICK_GAP_MS, periodWord, canAfford, pointsNeeded, priceShort } = M;

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
check(!/openNoobDraw/.test(prof) && !/preloadNoobDraw/.test(prof), 'the Profile three-dots menu no longer has NOOB Draw (it is on the Home page menu, and a notification tells people when their spin is back)');
check(/<NoobDrawHost currentUser=\{currentUser\} onUserUpdated=\{\(u\) => setCurrentUser\(u\)\} \/>/.test(app), 'the page is mounted once in the app and updates the account (balance, Pro, tick) after a spin');
const api = fs.readFileSync('src/services/api.ts', 'utf8');
check(/fetchNoobDraw,/.test(api) && /spinNoobDraw,/.test(api), 'the two server calls are exported');
check(/\.draw-stage\.force-dark/.test(css) && /@layer base \{[^}]*\.draw-stage\.force-dark/.test(css), 'the Draw keeps its own deep colours over the theme\'s dark-surface rule');
const host = fs.readFileSync('src/components/Draw/NoobDrawHost.tsx', 'utf8');
check(/React\.lazy\(\(\) => import\('\.\/NoobDrawPage'\)\)/.test(host), 'the heavy page is fetched only when opened');

section('6. Sound and vibration');
const sig = (r) => JSON.stringify(winTones(r));
check(new Set(RARITY_ORDER.map(sig)).size === 6, 'every rarity has its OWN winning sound');
const counts = RARITY_ORDER.map((r) => winTones(r).length);
check(counts.every((n, i) => i === 0 || n > counts[i - 1]), `the better the prize, the richer the sound (${counts.join(' < ')} tones)`);
const length = (r) => Math.max(...winTones(r).map((t) => t.at + t.dur));
check(RARITY_ORDER.every((r, i) => i === 0 || length(r) > length(RARITY_ORDER[i - 1])) && length('common') < 1 && length('mythic') < 3.5, 'and longer, but never longer than a few seconds');
check(RARITY_ORDER.every((r) => winTones(r).every((t) => t.f > 20 && t.f < 4000 && t.at >= 0 && t.dur > 0 && t.gain > 0 && t.gain <= 0.5)) && RARITY_ORDER.every((r) => winTones(r).every((t, i, a) => i === 0 || t.at >= a[i - 1].at)), 'every note is audible, safe in loudness and in time order');
check(winTones('common').every((t) => t.f > 400) && !winTones('common').some((t) => t.slideTo) && winTones('epic').some((t) => t.slideTo && t.slideTo < t.f) && winTones('mythic').some((t) => t.type === 'sine' && t.dur > 1.2), 'a common win is a light chime; epic and above get a deep thump and a long chord');
check(sig('legendary') === sig('legendary'), 'the same prize always sounds the same');
check(winBuzz('common').length === 1 && winBuzz('rare').length === 3 && winBuzz('legendary').length === 5 && winBuzz('mythic').length === 7 && RARITY_ORDER.every((r) => winBuzz(r).every((n) => n > 0 && n <= 200)), 'the vibration when the reel stops grows with the rarity');
check(tickFreq(0) === 1500 && tickFreq(1) === 850 && tickFreq(0.5) < tickFreq(0.1) && tickFreq(-3) === 1500 && tickFreq(9) === 850 && tickFreq(NaN) === 1500, 'the click gets lower and heavier as the reel slows (and odd values stay in range)');
check(tickGapOk(100, 50) && !tickGapOk(100, 80) && tickGapOk(100, 100 - MIN_TICK_GAP_MS) && tickGapOk(0, -1000), 'clicks are spaced: the fastest part of the spin does not turn into one buzz');
check(SPIN_MS === 6400 && TICK_BUZZ_MS > 0 && TICK_BUZZ_MS < 30, 'the spin lasts 6.4 seconds and each card buzzes briefly');
const reelSrc = fs.readFileSync('src/components/Draw/DrawReel.tsx', 'utf8');
const resSrc = fs.readFileSync('src/components/Draw/DrawResult.tsx', 'utf8');
const pageSrc = fs.readFileSync('src/components/Draw/NoobDrawPage.tsx', 'utf8');
check(/startSpinSound\(SPIN_MS\)/.test(reelSrc) && /tickSound\(/.test(reelSrc) && /buzz\(TICK_BUZZ_MS\)/.test(reelSrc) && /thumpSound\(\)/.test(reelSrc) && /stopSpinSound\(\)/.test(reelSrc), 'the reel plays the rushing sound, a click and a buzz per card, and a thump when it stops');
check(/winSound\(prize\.rarity\)/.test(resSrc) && /buzz\(winBuzz\(prize\.rarity\)\)/.test(resSrc), 'the reveal plays the winning sound and vibration of that rarity');
check(pageSrc.indexOf('unlockAudio();') > 0 && pageSrc.indexOf('unlockAudio();') < pageSrc.indexOf('await spinNoobDraw'), 'sound is unlocked inside the tap, before the spin is awaited (phones refuse it later)');
check(/setFxEnabled\(next\)/.test(pageSrc) && /Volume2/.test(pageSrc) && /VolumeX/.test(pageSrc), 'a speaker button turns sound and vibration off and on');

section('7. Spinning again with NOOB Points');
check(periodWord('week') === 'week' && periodWord('month') === 'month' && periodWord(undefined) === 'month' && periodWord('weird') === 'month', 'the free spin comes back every month (week only if the settings say so)');
check(canAfford(100000000, 100000000) && canAfford(250000000, 100000000) && !canAfford(99999999, 100000000) && !canAfford(0, 100000000) && !canAfford(undefined, 100000000) && !canAfford(null, 100000000) && !canAfford(5e8, 0), 'can the person pay: exactly the price is enough, one point short is not, missing balance is not');
check(pointsNeeded(30000000, 100000000) === 70000000 && pointsNeeded(100000000, 100000000) === 0 && pointsNeeded(500000000, 100000000) === 0 && pointsNeeded(undefined, 100000000) === 100000000, 'how many more points are needed (never negative)');
check(priceShort(100000000) === '100M' && priceShort(250000000) === '250M' && priceShort(1500000000) === '1.5B', 'the price in short form on the buttons');
const pageSrc2 = fs.readFileSync('src/components/Draw/NoobDrawPage.tsx', 'utf8');
const apiSrc = fs.readFileSync('src/services/supabaseApi.ts', 'utf8');
check(/spinNoobDraw\(pack\.id, paid\)/.test(pageSrc2) && /p_paid: true/.test(apiSrc) && /paid \? \{ p_pack: packId, p_paid: true \} : \{ p_pack: packId \}/.test(apiSrc), 'the app asks for a paid spin only when it was confirmed, and a normal spin sends no payment flag');
check(/setConfirming\(true\)/.test(pageSrc2) && /void spin\(true\)/.test(pageSrc2) && /Spin the \{pack\.name\} again\?/.test(pageSrc2), 'a paid spin asks first ("This takes 100,000,000 points") and only the Spin button of that question pays');
check(/\(paid && isPackOpen\(pack\)\)/.test(pageSrc2) && /!free && !afford/.test(pageSrc2), 'no paid spin while the free one is waiting, and the button is off when the points are short');
check(/Need \{priceShort\(pointsNeeded\(balance, pack\.price\)\)\} more points/.test(pageSrc2) && /Free in <Countdown/.test(pageSrc2) && /Spin again · \{priceShort\(pack\.price\)\}/.test(pageSrc2), 'the cards and the button say how long until the free spin and what another spin costs');
check(/periodWord\(state\.freePeriod\)/.test(pageSrc2) && !/once every 7 days|Weekly free spins/.test(pageSrc2), 'the page talks about the month (or the week if the settings say so), never a fixed "7 days"');
check(/prize\.kind === 'pro' \|\| prize\.kind === 'verified'\) && prize\.applied === 'ok'/.test(resSrc) && /Check Spam and tap “Not spam”/.test(resSrc), 'a Pro or verified-tick win tells the winner an email is on its way and to check Spam, only when the prize really applied (the only time the email is sent)');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
