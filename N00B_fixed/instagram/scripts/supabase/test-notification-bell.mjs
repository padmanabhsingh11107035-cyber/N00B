// The notification button at the top of Home: a solid bell in the accent colour (white in the dark modes, black in Light) that keeps its size;
// a new notification only puts a small red number on its corner. Usage: node scripts/supabase/test-notification-bell.mjs
import fs from 'node:fs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const feed = read('src/components/Feed/FeedView.tsx');
const btn = (feed.match(/<button\s+id="notifications-bar-trigger"[\s\S]*?<\/button>/) || [''])[0];

check(btn.length > 0 && /onClick=\{onOpenNotifications\}/.test(btn), 'the button is still there and opens the notifications');
check(/<Bell className="w-6 h-6" fill="currentColor"/.test(btn) && !/BellRing/.test(feed), 'it is a solid bell');
check(/relative w-9 h-9 shrink-0 flex items-center justify-center text-noob/.test(btn), 'a fixed 36-pixel square in the accent colour (white in dark, black in Light)');
check(!/Alerts<\/span>|hidden sm:inline|bg-noob\/20|border border-noob/.test(btn), 'no word and no outlined pill: nothing in it grows when a notification comes');
check(/\{unreadNotificationCount > 0 && \(\s*<span\s+data-testid="notification-badge"\s+className="absolute top-0 right-0 min-w-\[17px\] h-\[17px\][^"]*bg-red-500 text-white/.test(btn), 'the number is a small red circle laid over the corner of the bell');
check(/unreadNotificationCount > 99 \? '99\+' : unreadNotificationCount/.test(btn), 'big numbers read 99+');
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
