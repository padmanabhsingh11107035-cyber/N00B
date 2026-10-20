// Small fixes of 2026-10-20: the rounded browser-tab icon, the black figure in emails, nothing behind the comment screens, the six notification buttons, the blue "has the app" tick
// (real Android app only), one view per person on a reel, and the new points amounts in the app's own text.
// Usage: node --liftoff-only scripts/supabase/test-quick-fixes-20261020.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const load = (p) => import(pathToFileURL(path.resolve(p)).href);

// a tiny PNG reader (8-bit RGBA, no interlace): enough to look at a corner and the centre
function pixel(file, x, y) {
  const buf = fs.readFileSync(file);
  let pos = 8, w = 0, h = 0; const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString('ascii', pos + 4, pos + 8);
    if (type === 'IHDR') { w = buf.readUInt32BE(pos + 8); h = buf.readUInt32BE(pos + 12); }
    if (type === 'IDAT') idat.push(buf.subarray(pos + 8, pos + 8 + len));
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat)), bpp = 4, stride = w * bpp;
  const rows = []; let prev = Buffer.alloc(stride);
  for (let r = 0; r < h; r++) {
    const f = raw[r * (stride + 1)], line = Buffer.from(raw.subarray(r * (stride + 1) + 1, (r + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      const pr = (p) => { const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
      line[i] = (line[i] + (f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? ((a + b) >> 1) : pr(a + b - c))) & 255;
    }
    rows.push(line); prev = line;
  }
  const o = x * bpp; return { w, h, rgba: [rows[y][o], rows[y][o + 1], rows[y][o + 2], rows[y][o + 3]] };
}

section('1. The rounded icon in the browser tab');
for (const size of [32, 48, 96, 192]) {
  const f = `public/favicon-${size}.png`;
  const corner = pixel(f, 0, 0), centre = pixel(f, size >> 1, size >> 1), edge = pixel(f, size >> 1, 0);
  check(corner.w === size && corner.rgba[3] === 0, `${size} px: the corner is see-through (curved edge)`, JSON.stringify(corner.rgba));
  check(edge.rgba[3] === 255, `${size} px: the middle of the edge is solid`);
  check(centre.rgba[3] === 255, `${size} px: the logo area is solid`);
}
const html = read('index.html');
check(/sizes="32x32" href="\/favicon-32\.png"/.test(html) && /sizes="96x96" href="\/favicon-96\.png"/.test(html) && /sizes="192x192" href="\/favicon-192\.png"/.test(html), 'the page head points at them');
check(/rel="apple-touch-icon" href="\/noob-logo-circle\.png"/.test(html), 'the phone home-screen icon stays square (the phone rounds it itself)');
check(['about', 'screenshots', 'privacy', 'terms', 'data-deletion'].every((n) => /favicon-32\.png/.test(read(`public/${n}.html`))), 'so do the About, Screenshots, Privacy, Terms and Data deletion pages');

section('2. The email: the big figure is black, whatever the mail app does');
const fn = read('supabase/functions/dynamic-handler/index.ts');
check(/font:900 28px\/1\.2 \$\{FONT\};letter-spacing:-\.5px;color:#000000;-webkit-text-fill-color:#000000/.test(fn), 'the figure is black, and a mail app\'s dark mode cannot turn it white');
check(/<meta name="color-scheme" content="light only">/.test(fn) && /supported-color-schemes/.test(fn), 'the email says "light only" to mail apps that listen');
check(/bgcolor="#fbf6f3"/.test(fn), 'and the card has a plain colour under its gradient');

section('3. Nothing behind the comment screens');
const files = ['src/components/Feed/CommentsSheet.tsx', 'src/components/Videos/VideoCommentsSheet.tsx', 'src/components/Reels/ReelsView.tsx'].map(read);
check(files.every((f) => /useVisibleArea\(\)/.test(f) && /visibleAreaStyle\(visibleArea\)/.test(f)), 'the post, video and reel comment screens fill exactly the part above the keyboard');
check(/bg-black flex items-end/.test(files[0]) && /bg-black flex items-end/.test(files[1]) && !/bg-black\/80/.test(files[0] + files[1]), 'post and video: a solid black backdrop, not 80 %');
check(/z-\[60\] bg-zinc-950 p-4/.test(files[2]) && !/z-\[60\] bg-zinc-950\/95/.test(files[2]), 'reel: a solid panel over the whole reel, not a see-through one');
const vv = await load('src/utils/useVisualViewport.ts');
check(JSON.stringify(vv.visibleAreaStyle({ top: 12, height: 300 })) === JSON.stringify({ top: 12, height: 300, bottom: 'auto' }) && vv.visibleAreaStyle(null) === undefined, 'the helper fills the visible area, or the whole screen when the phone cannot say');

section('4. The six notification buttons');
const F = await load('src/utils/notificationFilters.ts');
check(F.NOTIFICATION_FILTERS.length === 6 && F.NOTIFICATION_FILTERS[0].id === 'all', 'there are six buttons, the first is All');
const types = ['admin_direct', 'post_comment', 'live_lounge_meeting', 'new_message', 'store_order', 'new_follower', 'points_transfer', 'points_removed', 'points_earned', 'payment_request_declined', 'payment_request_approved', 'payment_request', 'follow_request_received', 'screenshot_alert', 'post_like', 'reel_like', 'live_gift', 'call_started', 'suggestion_reply', 'suggested_user', 'noob_draw_ready', 'mention', 'live_lounge_invite', 'instant_reaction', 'instant', 'follow_request_accepted', 'birthday_follower_alert', 'ai_feedback_reply', 'game_challenge', 'music_share', 'something_new'];
const ids = F.NOTIFICATION_FILTERS.filter((f) => f.id !== 'all').map((f) => f.id);
check(types.every((t) => ids.filter((id) => F.matchesFilter(t, id)).length === 1), 'every kind of notification (including a brand new one) is under exactly one button');
check(types.every((t) => F.matchesFilter(t, 'all')), '"All" shows every one');
check(F.groupOf('reel_like') === 'likes' && F.groupOf('points_earned') === 'points' && F.groupOf('points_removed') === 'points' && F.groupOf('new_follower') === 'follows' && F.groupOf('game_challenge') === 'games_music' && F.groupOf('admin_direct') === 'updates' && F.groupOf('new_message') === 'updates', 'a reel like is under Likes, the new points notices under Points, the team\'s messages under Updates');
const nm = read('src/components/Modals/NotificationsModal.tsx');
check(/NOTIFICATION_FILTERS\.map\(/.test(nm) && /matchesFilter\(n\.type, filterType\)/.test(nm) && /notif-filter-/.test(nm), 'the screen uses them');

section('5. The blue tick: the real Android app only');
const P = await load('src/utils/appPlatform.ts');
check(P.detectPlatform(true, false) === 'app' && P.detectPlatform(true, true) === 'app' && P.detectPlatform(false, true) === 'pwa' && P.detectPlatform(false, false) === 'web', 'the Android app is "app"; the website on the home screen is "pwa"; a browser tab is "web"');
const now = Date.parse('2026-10-20T12:00:00Z'), day = 86400000;
check(P.hasNativeApp({ liveOnApp: true, now }), 'on the app right now: the tick');
check(P.hasNativeApp({ lastSeenPlatform: 'app', lastSeenAt: new Date(now - 3 * day).toISOString(), now }), 'last seen on the app 3 days ago: the tick');
check(!P.hasNativeApp({ lastSeenPlatform: 'app', lastSeenAt: new Date(now - 20 * day).toISOString(), now }), 'not seen on the app for 20 days (deleted it): no tick');
check(!P.hasNativeApp({ lastSeenPlatform: 'web', lastSeenAt: new Date(now - 1000).toISOString(), now }) && !P.hasNativeApp({ lastSeenPlatform: 'pwa', lastSeenAt: new Date(now - 1000).toISOString(), now }), 'opened it in a browser (the usual sign the app is gone), or installed from the website: no tick');
check(!P.hasNativeApp({}) && !P.hasNativeApp({ lastSeenPlatform: 'app', lastSeenAt: 'garbage', now }), 'nothing known, or a broken date: no tick');
const admin = read('src/components/Modals/AdminControlModal.tsx');
check(/hasNativeApp\(\{ liveOnApp: onApp/.test(admin) && /data-testid="app-tick"/.test(admin) && /bg-sky-500/.test(admin), 'the admin list uses that rule and draws a solid blue tick');
const app = read('src/App.tsx');
check((app.match(/detectPlatform\(Capacitor\.isNativePlatform\(\), isInstalled\(\)\)/g) || []).length === 2, 'the app reports the platform that way in both places (last seen, and live presence)');

section('6. One view per person on a reel, and the new amounts in the app\'s text');
const reels = read('src/components/Reels/ReelsView.tsx');
check(/viewedReelsRef = useRef<Set<string>>/.test(reels) && /!viewedReelsRef\.current\.has\(currentReel\.id\)/.test(reels), 'a reel is reported once each time the page is open');
const stats = read('src/components/Profile/AccountsStatisticsModal.tsx');
check(/\+10,000,000 pts/.test(stats) && /\+1,000,000 pts/.test(stats) && !/\+25 pts/.test(stats) && !/\+5 pts/.test(stats), 'the profile\'s points page says +10,000,000 for content and +1,000,000 for a comment');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
