// The Notifications page, drawn like the reference: a full-screen page with a back arrow, the title in the middle and three dots; the notifications of each day under a heading with
// the DATE; a card for each with the picture, the words and the TIME; a swipe to the left slides the card over a red bin; dark and light colours.
// Drawn for real (server rendering of the real component) and checked against the real style sheet. Usage: node scripts/supabase/test-notifications-page.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildSync } from 'esbuild';

let passed = 0, failed = 0;
const check = (cond, label) => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');

const out = path.resolve('node_modules/.cache-notifications-page.mjs');
buildSync({ entryPoints: [path.resolve('src/components/Modals/NotificationsModal.tsx')], bundle: true, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic', outfile: out, logLevel: 'error' });
const M = await import(pathToFileURL(out).href);
const React = (await import('react')).default;
const { renderToStaticMarkup } = await import('react-dom/server');

section('1. Dates and times');
const now = new Date(2026, 10, 5, 18, 0, 0);
const at = (y, mo, d, h, mi) => new Date(y, mo, d, h, mi).toISOString();
check(/^Today, (5 Nov|Nov 5)/.test(M.dateGroupLabel(at(2026, 10, 5, 8, 26), now)), 'a notification of today is under "Today, 5 Nov"');
check(/^Yesterday, (4 Nov|Nov 4)/.test(M.dateGroupLabel(at(2026, 10, 4, 23, 59), now)), 'one of yesterday under "Yesterday, 4 Nov"');
check(/(2 Nov|Nov 2)/.test(M.dateGroupLabel(at(2026, 10, 2, 9, 0), now)) && /^[A-Za-z]{3}, /.test(M.dateGroupLabel(at(2026, 10, 2, 9, 0), now)), 'an older one under its weekday and date ("Mon, 2 Nov")');
check(/2025/.test(M.dateGroupLabel(at(2025, 11, 30, 9, 0), now)), 'a day of another year shows the year');
check(/^8:26\s?am$/i.test(M.clockLabel(at(2026, 10, 5, 8, 26))) && M.clockLabel('not a date') === '', 'the time of day is shown ("8:26 am"); a broken date shows nothing instead of "Invalid Date"');
check(/^8:26/.test(M.clockLabel('2026-11-05T08:26:04.123456+00:00'.replace('2026-11-05T08:26', new Date(2026, 10, 5, 8, 26).toISOString().slice(0, 16)))), 'a date with microseconds (as the database writes it) is read on a phone too');

section('2. The page drawn for real');
const mk = (id, type, d, extra = {}) => ({ id, type, createdAt: d, isRead: true, message: `text of ${id}`, senderUsername: 'ann', senderDisplayName: 'Ann', senderAvatar: '/a.png', ...extra });
const list = [
  mk('n1', 'post_like', new Date().toISOString()),
  mk('n2', 'new_follower', new Date(Date.now() - 3600_000).toISOString()),
  mk('n3', 'post_comment', new Date(Date.now() - 86400_000 * 1.2).toISOString()),
  mk('n4', 'follow_request_received', new Date(Date.now() - 86400_000 * 4).toISOString(), { actionStatus: 'pending', actorId: 'u9' }),
];
const settings = { masterEnabled: true, followRequests: true, newFollowers: true, likesComments: true, gamesLeaderboard: true, musicHub: true, soundAlerts: true };
const html = renderToStaticMarkup(React.createElement(M.NotificationsModal, {
  currentUser: { id: 'me', followingIds: [] }, notifications: list, notificationSettings: settings, onUpdateSettings() {}, onClose() {}, onAcceptFollowRequest() {}, onDeclineFollowRequest() {},
  onClearAll() {}, onDeleteOne() {}, onFollowBack() {}
}));
check(/class="nt fixed inset-0 z-50 flex flex-col"/.test(html) && /data-noob-keep="1"/.test(html), 'a page that fills the whole screen (and the app\'s page-frame rules leave it alone)');
check(/aria-label="Back"/.test(html) && /<h1 class="nt-title">Notifications<\/h1>/.test(html) && /aria-label="More options"/.test(html), 'back arrow, "Notifications" in the middle, the three dots');
check((html.match(/data-testid="notif-date"/g) || []).length === 3, 'the notifications are separated by day: one date heading for each of the 3 days');
check((html.match(/data-testid="notif-row"/g) || []).length === 4 && (html.match(/data-testid="notif-time"/g) || []).length === 4, 'each of the 4 notifications is its own card, with its time');
check((html.match(/data-testid="notif-delete"/g) || []).length === 4 && /aria-label="Delete this notification"/.test(html), 'each card has the red bin behind it (the swipe to the left)');
check(/data-testid="notif-filter-all"/.test(html) && /data-testid="notif-filter-follows"/.test(html) && /data-testid="notif-requests"/.test(html) && /<span class="nt-count">1<\/span>/.test(html), 'the filter buttons and the requests button (with their count) are still there');
check(/Accept<\/button>/.test(html) && /Noob Back|Noobed/.test(html) && /Delete<\/button>/.test(html), 'a follow request still has Accept, Noob Back and Delete');
const noDelete = renderToStaticMarkup(React.createElement(M.NotificationsModal, { currentUser: { id: 'me' }, notifications: list, notificationSettings: settings, onUpdateSettings() {}, onClose() {}, onAcceptFollowRequest() {}, onDeclineFollowRequest() {}, onClearAll() {} }));
check(!/data-testid="notif-delete"/.test(noDelete), 'without a way to delete there is no bin');
const empty = renderToStaticMarkup(React.createElement(M.NotificationsModal, { currentUser: { id: 'me' }, notifications: [], notificationSettings: settings, onUpdateSettings() {}, onClose() {}, onAcceptFollowRequest() {}, onDeclineFollowRequest() {}, onClearAll() {} }));
check(/No notifications here/.test(empty), 'with nothing to show there is a friendly empty page');

section('3. Dark and light');
const css = read('src/index.css');
check(/\.nt \{[^}]*--nt-bg: #0a0a0a[^}]*--nt-card: #1c1d21[^}]*--nt-accent: #ff5a2d/.test(css), 'dark: a black page with dark cards and an orange accent');
check(/:root\[data-theme="light"\] \.nt \{[^}]*--nt-bg: #ffffff[^}]*--nt-card: #f5f3ef[^}]*--nt-text: #141416/.test(css), 'light: a white page with cream cards and dark words');
check(/\.nt-card \{[^}]*background: var\(--nt-card\)/.test(css) && /\.nt-date \{[^}]*color: var\(--nt-text\)/.test(css) && /\.nt-time \{[^}]*color: var\(--nt-sub\)/.test(css), 'the cards, the date headings and the times use those colours (nothing is white on white or black on black)');
check(!/class="[^"]*\b(text-white|bg-zinc-9|bg-black)\b/.test(html.replace(/class="nt-kind"/g, '')), 'the page uses no fixed white or black classes of its own');
check(/\.nt-card-slide \{[^}]*will-change: transform/.test(css) && /\.nt-bin \{[^}]*color: #ef4444/.test(css) && /\.nt-swipe \{[^}]*overflow: hidden/.test(css), 'the card slides over a red bin');

section('4. The app');
const app = read('src/App.tsx'), api = read('src/services/supabaseApi.ts');
check(/onDeleteOne=\{handleDeleteNotification\}/.test(app) && /setNotifications\(\(prev\) => prev\.filter\(\(n\) => n\.id !== id\)\)/.test(app), 'deleting one removes it from the list at once');
check(/from\('notification_clears'\)\.upsert\(\{ notification_id: id, user_id: uid \}/.test(api) && /ignoreDuplicates: true/.test(api), 'and hides it for this person only on the server (the same table "Clear all" uses)');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
