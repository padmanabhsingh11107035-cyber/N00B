// Three things from the video of 2026-11-05 (5.24 PM):
//   1. The phone's three-line menu is a full-screen page from the very first moment and stays that way (it used to open full, then shrink to a narrow drawer: the app's page-frame
//      rules judged it a card and a drawer by turns). It is marked data-noob-keep so those rules leave it alone, and has its own "<" back button.
//   2. Chat messages ring the phone (also for group chats) and are NOT kept in the app's Notifications list.
//   3. The bottom bar shows red numbers of new things: new posts (Home), new reels (Reels), unread messages (Chat), challenges (Games).
// Usage: node scripts/supabase/test-nav-badges.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildSync } from 'esbuild';

let passed = 0, failed = 0;
const check = (cond, label) => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const feed = read('src/components/Feed/FeedView.tsx'), app = read('src/App.tsx'), nav = read('src/components/Navigation/FloatingNavBar.tsx');

section('1. The three-line menu is a full-screen page, steady');
const drawer = feed.slice(feed.indexOf("{showNoobMenu && createPortal("), feed.indexOf('document.body', feed.indexOf("{showNoobMenu && createPortal(")));
check(/className="nmenu md:hidden fixed inset-0 z-\[95\] flex flex-col/.test(drawer), 'it fills the whole screen (fixed, inset 0), only on a phone');
check(/data-noob-keep="1"/.test(drawer), 'the page-frame rules (pageFrames.ts) are told to leave it alone, so it can not flip between a card and a page');
check(!/Math\.min\(288/.test(drawer) && !/width: `/.test(drawer) && !/onClick=\{\(\) => setShowNoobMenu\(false\)\}\s*>\s*\n\s*<div/.test(drawer), 'no narrow fixed width and no tap-outside backdrop any more');
check(/<ChevronLeft \/>/.test(drawer) && /aria-label="Close menu"/.test(drawer) && /paddingTop: 'env\(safe-area-inset-top\)'/.test(drawer), 'it has its own "<" back button and keeps clear of the notch');
const frames = read('src/utils/pageFrames.ts');
check(/KEEP_ATTR = 'data-noob-keep'/.test(frames) && /opts\.keep \|\| opts\.hasMedia/.test(frames), 'that attribute really makes pageFrames skip a layer');

section('2. Chat alerts: phone only');
const sql = read('supabase/migrations/20261105000001_chat_alerts_phone_only.sql');
check(/create trigger messages_group_alert after insert on public\.messages/.test(sql) && /c\.is_group/.test(sql) && /is_global_default/.test(sql) && /not is_muted/.test(sql), 'a message in a group chat alerts the other members (not the Global Lounge, not muted ones)');
check(/exception when others then\s+null;/.test(sql), 'an alert can never stop a message from being sent');
check(/n\.type <> 'new_message'/.test(sql) && /function public\.my_notifications/.test(sql), 'the Notifications list leaves chat alerts out');
check(/if n\.type = 'new_message' then delete from public\.notifications where id = p_id/.test(sql), 'the alert row is removed once the phone has been told (nothing stays in the app)');
check(/not public\.in_quiet_hours/.test(sql) && /m\.is_muted/.test(sql) && /grant execute on function public\.push_claim\(text, uuid\) to service_role/.test(sql), 'quiet hours, muted chats and the service-only grant are kept');
const api = read('src/services/supabaseApi.ts');
check(/filter\(\(n: any\) => n\?\.type !== 'new_message'\)\.map\(mapNotification\)/.test(api), 'the app also leaves them out by itself (right even before the SQL is run)');
const sw = read('public/sw.js'), fn = read('supabase/functions/dynamic-handler/index.ts');
check(/data\.type === 'new_message'/.test(sw) && /visibilityState === 'visible'/.test(sw) && /getNotifications\(\{ tag: 'noob-in-app-chat' \}\)/.test(sw) && /silent: true/.test(sw), 'with the app open in front of the person the alert is silent and taken away again at once; otherwise it is the normal banner with sound');
check(/data\.type === 'new_message'\) \{ notifPayload\.url = '\/chat'/.test(fn), 'tapping the alert opens the Chat page');

section('3. Red numbers on the bottom bar');
check(/badges\?: Partial<Record<NavTab, number>>/.test(nav) && /const NavBadge/.test(nav) && /count > 99 \? '99\+' : count/.test(nav), 'the bar takes a number for each page and shows 99+ for many');
check(['feed', 'explore', 'reels', 'chat', 'games', 'profile'].every((t) => nav.includes(`count('${t}')`)), 'every icon of the bar can carry a number');
check(/tab === 'chat' \? \(unreadChatCount > 0 \? unreadChatCount : 0\)/.test(nav), 'Chat keeps showing its unread messages');
check(/badges=\{navBadges\}/.test(app) && /newPosts \+ Math\.max\(0, unreadNotificationCount - unreadGames\)/.test(app) && /reels: newReels, games: unreadGames/.test(app), 'the app feeds it: Home = new posts + bell items, Reels = new reels, Games = unread challenges');
check(/badge: navBadges\.feed > 0/.test(app) && /badge: navBadges\.reels > 0/.test(app) && /badge: navBadges\.games > 0/.test(app), 'the long strip on a tablet / computer shows the same numbers');

const out = path.resolve('node_modules/.cache-nav-badges.mjs');
buildSync({ entryPoints: [path.resolve('src/utils/navBadges.ts')], bundle: true, format: 'esm', platform: 'node', packages: 'external', outfile: out, logLevel: 'error' });
const { countNewSince, newestOf } = await import(pathToFileURL(out).href);
const t = (s) => new Date(s).toISOString();
const items = [
  { userId: 'a', createdAt: t('2026-11-05T10:00:00Z') },
  { userId: 'b', createdAt: t('2026-11-05T11:00:00Z') },
  { userId: 'me', createdAt: t('2026-11-05T12:00:00Z') },
  { userId: 'a', createdAt: t('2026-11-05T13:00:00Z') },
  { userId: 'c' },
];
const since = Date.parse('2026-11-05T10:30:00Z');
check(countNewSince(items, since, 'me') === 2, 'counts only what is newer than the last look and is not your own');
check(countNewSince(items, since, 'me', (i) => i.userId === 'a') === 1, 'Home counts only people you follow');
check(countNewSince(items, newestOf(items), 'me') === 0 && newestOf(items) === Date.parse('2026-11-05T13:00:00Z'), 'after a look (the newest time is remembered) nothing is new; a missing date never counts');
check(countNewSince([], 0, 'me') === 0, 'an empty page has no number');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
