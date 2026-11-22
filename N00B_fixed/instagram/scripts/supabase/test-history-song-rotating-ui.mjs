// Watch history (YouTube-style), Subscription history, Search song, and the Rotating Story: the words, the rules and how they are put together.
// (The database side of the first two is test-history-subscription-db.mjs.) Usage: node --liftoff-only scripts/supabase/test-history-song-rotating-ui.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const load = (p) => import(pathToFileURL(path.resolve(p)).href);

section('1. History: the day headings');
const D = await load('src/utils/dateGroups.ts');
const now = new Date('2026-10-20T15:00:00');
check(D.dayGroupLabel('2026-10-20T01:00:00', now) === 'Today' && D.dayGroupLabel('2026-10-19T23:00:00', now) === 'Yesterday', 'today and yesterday');
check(D.dayGroupLabel('2026-10-17T12:00:00', now) === 'Saturday', 'the rest of the week by weekday');
check(D.dayGroupLabel('2026-10-05T12:00:00', now) === '5 Oct' && D.dayGroupLabel('2025-12-31T12:00:00', now) === '31 Dec 2025', 'older days by date (with the year only when it is another year)');
check(D.dayGroupLabel('nonsense', now) === 'Earlier', 'a broken date is "Earlier", not a crash');
const g = D.groupByDay([{ t: '2026-10-20T10:00:00' }, { t: '2026-10-20T08:00:00' }, { t: '2026-10-19T08:00:00' }, { t: '2026-10-05T08:00:00' }, { t: null }], (x) => x.t, now);
check(g.length === 4 && g[0].label === 'Today' && g[0].items.length === 2 && g[1].label === 'Yesterday' && g[3].label === 'Earlier', 'items are grouped in the order given, one heading per day', JSON.stringify(g.map((x) => [x.label, x.items.length])));

section('2. History: the page');
const hp = read('src/components/Videos/WatchHistoryPage.tsx');
check(/groupByDay<LongVideo>\(shown, \(v\) => v\.watchedAt\)/.test(hp) && /history-day-label/.test(hp), 'videos are listed under the day they were watched');
check(!/formatExactDateTime|toLocaleTimeString/.test(hp), 'only the day is shown, not the time');
check(/removeFromWatchHistory\(id\)/.test(hp) && /Remove from watch history/.test(hp) && /setVideos\(before\)/.test(hp), 'each video has a remove button (and comes back if the removal fails)');
check(/Clear all watch history/.test(hp) && /history-clear-confirm/.test(hp) && /clearWatchHistory\(\)/.test(hp), 'the whole history can be cleared, after asking');
check(/Pause watch history/.test(hp) && /'history\.paused': !paused/.test(hp) && /history-paused-note/.test(hp), 'it can be paused, and says when it is');
check(/history-search/.test(hp) && /Search watch history/.test(hp), 'it can be searched');
const feed = read('src/components/Videos/HomeVideoFeedView.tsx');
check(/<WatchHistoryPage\s+onClose=\{\(\) => setShowHistory\(false\)\}/.test(feed) && !/title="History"/.test(feed), 'the Feed\'s History opens this page');
check(/recordView=\{recordLongVideoView\}/.test(feed) && /onPlay=\{\(\) => \{ void recordView\(video\.id\)/.test(read('src/components/Videos/VideoWatchPage.tsx')), 'a video is written into the history the moment it starts playing');

section('3. Subscription history: the words');
const S = await load('src/utils/subscriptionView.ts');
check(S.statusOf({ tier: null, billing: null, autoRenew: false, endsAt: null, active: false, daysLeft: null }).text === 'You are on the free plan.', 'no plan');
check(S.statusOf({ tier: 'pro', billing: 'monthly', autoRenew: true, endsAt: 'x', active: true, daysLeft: 20 }).text === 'Active · 20 days left' && S.statusOf({ tier: 'pro', billing: 'monthly', autoRenew: true, endsAt: 'x', active: true, daysLeft: 20 }).tone === 'good', 'an active plan');
check(S.statusOf({ tier: 'pro', billing: 'monthly', autoRenew: true, endsAt: 'x', active: true, daysLeft: 1 }).text === 'Active · ends in 1 day' && S.statusOf({ tier: 'pro', billing: 'monthly', autoRenew: true, endsAt: 'x', active: true, daysLeft: 2 }).tone === 'warn', 'a plan about to end');
check(S.statusOf({ tier: 'pro', billing: 'monthly', autoRenew: false, endsAt: 'x', active: false, daysLeft: 0 }).text === 'This plan has ended.', 'a plan that ended');
let d = S.describeHistoryRow({ at: 'x', kind: 'purchase', tier: 'starter', planName: 'NOOB Pro Starter', billing: 'monthly', paid: 5000000000, listPrice: 5000000000, coupon: 'WELCOME', paidBy: null });
check(d.title === 'NOOB Pro Starter bought' && /Paid from your wallet, monthly · coupon WELCOME/.test(d.detail) && d.amount === '−5,00,00,00,000', 'a purchase: plan, how it was paid, coupon and the amount', JSON.stringify(d));
d = S.describeHistoryRow({ at: 'x', kind: 'renewal', tier: 'plus', planName: null, billing: 'yearly', paid: 7500000000, listPrice: null, coupon: null, paidBy: null });
check(d.title === 'NOOB Pro Plus renewed' && /yearly/.test(d.detail), 'a renewal');
d = S.describeHistoryRow({ at: 'x', kind: 'friend', tier: 'elite', planName: 'NOOB Pro Elite', billing: 'monthly', paid: 0, listPrice: 12500000000, coupon: null, paidBy: 'bob' });
check(d.title === 'NOOB Pro Elite, paid by @bob' && /a gift/.test(d.detail), 'a gift from a friend');
d = S.describeHistoryRow({ at: 'x', kind: 'prize', tier: 'starter', planName: 'NOOB Pro Starter (7 days)', billing: null, paid: 0, listPrice: null, coupon: null, paidBy: null });
check(d.title === 'NOOB Pro Starter (7 days) won' && /NOOB Draw/.test(d.detail) && d.amount === '', 'a prize');
const sp = read('src/components/Settings/pages/subscription.tsx');
check(/data-testid="current-plan"/.test(sp) && /Bought on/.test(sp) && /Ends on/.test(sp) && /Days left/.test(sp) && /To renew it you need/.test(sp) && /Your wallet has/.test(sp) && /more points/.test(sp), 'the page shows the plan, when it was bought, when it ends, the days left, what renewing costs, the wallet and what is missing');
check(/All your plans/.test(sp) && /What each plan costs/.test(sp) && /ctx\.actions\.openPro\(\)/.test(sp), 'the history, the price list, and a button to change or renew the plan');
const reg = read('src/components/Settings/registry.ts'), pages = read('src/components/Settings/pages/index.tsx');
check(/id: 'subscription-history', section: 'Subscriptions'/.test(reg) && /'subscription-history': SubscriptionHistoryPage/.test(pages), 'it is in Settings and activity, under Subscriptions');

section('6. Rotating Story');
const R = await load('src/utils/rotatingStory.ts');
check(R.ROTATE_MODES.map((x) => x.id).join() === 'off,spin,swing,tilt', 'still, spin, swing and 3D tilt');
check(R.rotateSticker('off') === null && R.rotateSticker('spin').type === 'effect' && R.rotateSticker('tilt').data.mode === 'tilt', 'a choice becomes one more sticker (nothing for "still")');
check(R.rotateModeOf([{ type: 'poll' }, { type: 'effect', data: { kind: 'rotate', mode: 'swing' } }]) === 'swing' && R.rotateModeOf([]) === 'off' && R.rotateModeOf(null) === 'off' && R.rotateModeOf([{ type: 'effect', data: { kind: 'rotate', mode: 'weird' } }]) === 'off', 'a story\'s rotation is read from its stickers; unknown values mean still');
check(R.rotateClass('spin') === 'noob-rotate-spin' && R.rotateClass('off') === '', 'each mode has its animation class');
const css = read('src/index.css');
check(['spin', 'swing', 'tilt'].every((k) => new RegExp(`@keyframes noob-rotate-${k}`).test(css) && new RegExp(`\\.noob-rotate-${k} \\{ animation:`).test(css)), 'the three animations exist');
check(/prefers-reduced-motion: reduce\) \{ \.noob-rotate-spin, \.noob-rotate-swing, \.noob-rotate-tilt \{ animation: none; \}/.test(css), 'and stand still for people who ask for less motion');
const cs = read('src/components/Stories/CreateStoryModal.tsx'), sv = read('src/components/Stories/StoryViewerModal.tsx');
check(/rotating-story-picker/.test(cs) && /ROTATE_MODES\.map/.test(cs) && /rotateSticker\(rotateMode\)/.test(cs) && /rotateClass\(rotateMode\)/.test(cs), 'the story creator has the picker, saves the choice with the story and shows the picture turning in its preview');
check(/rotateClass\(rotateModeOf\(story\.stickers\)\)/.test(sv) && /sticker\.type === 'effect'\) return null/.test(sv), 'the story viewer plays the rotation and does not draw the effect as a layer');
check(/'draw' \| 'question' \| 'anon_messages' \| 'effect'/.test(read('src/types.ts')), 'the story type knows the new kind');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
