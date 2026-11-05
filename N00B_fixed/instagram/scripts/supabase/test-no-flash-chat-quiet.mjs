// Two things from the messages of 2026-11-05 (evening):
//   1. The page must never flash white (dark mode) or dark (light mode) while scrolling, most on Explore. Measured on the video: the whole page background (and the strip behind the clock)
//      went white 4 times for 0.3 - 0.9 s while Explore scrolled. The cause: a colour read from the screen changed while the page scrolled, and every change nudged the phone with a
//      changed viewport tag, which makes an iPhone lay the page out again for a moment. The nudge now only happens when a page with a colour of its own (Messages) comes or goes.
//   2. A chat alert (banner + sound) is only for a person who is AWAY from NOOB. With the app open in front: no banner, no sound, only the red number on the Chat icon.
// Usage: node scripts/supabase/test-no-flash-chat-quiet.mjs
import fs from 'node:fs';

let passed = 0, failed = 0;
const check = (cond, label) => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const strip = read('src/utils/statusStrip.ts');

section('1. The strip behind the clock can not flash the page');
const sampled = strip.slice(strip.indexOf('function paint(): void {'), strip.indexOf('const queue ='));
check(!/applyColour\([^)]*,\s*(true|'full'|'light')\)/.test(sampled.replace(/applyColour\(own, 'light'\)/, '')), 'a colour read from the screen is never applied with a nudge (the nudge changes the phone\'s layout)');
check(/if \(bouncing\(\)\) return;/.test(sampled) && /lightness\(colour\) > 0\.75/.test(sampled) && /if \(pending === colour\)/.test(sampled), 'nothing is read during a rubber-band bounce, a nearly white reading is never used in the dark theme, and any other new colour must be seen twice');
check(/function poke\(colour: string, viewport: boolean\)/.test(strip) && /const vp = viewport \? document\.querySelector/.test(strip), 'the viewport tag is only touched when asked to');
check(/const transition = \(colour === null\) !== \(override === null\)/.test(strip) && /const mode = transition \? 'full' : 'light'/.test(strip) && /poke\(colour, nudge === 'full'\)/.test(strip), 'and only when a page with its own colour (Messages) comes or goes');
check(!/viewport/.test(read('src/App.tsx').replace(/viewport-fit/g, '')) || !/setAttribute\('content'/.test(read('src/App.tsx')), 'nothing else in the app changes the viewport tag while the app is used');
const others = fs.readdirSync('src', { recursive: true }).filter((f) => /\.(tsx?|ts)$/.test(String(f)) && !/statusStrip/.test(String(f))).filter((f) => /meta\[name="viewport"\]/.test(read(`src/${f}`)));
check(others.length === 0, `no other file touches the viewport tag${others.length ? ' -> ' + others.join(', ') : ''}`);

section('2. Chat alerts only reach a person who is away');
const sql = read('supabase/migrations/20261105000003_chat_alert_only_when_away.sql');
check(/add column if not exists in_front_until/.test(sql) && /interval '25 seconds'/.test(sql) && /function public\.touch_in_front\(p_on boolean\)/.test(sql), 'the database remembers "in front" for 25 seconds at a time (it forgets by itself)');
check(/n\.type = 'new_message' and exists \(\s*select 1 from public\.profile_private pp where pp\.user_id = s\.user_id and pp\.in_front_until is not null and pp\.in_front_until > now\(\)/.test(sql), 'a chat alert skips everybody whose app is in front');
check(/not public\.in_quiet_hours/.test(sql) && /m\.is_muted/.test(sql) && /delete from public\.notifications where id = p_id/.test(sql) && /grant execute on function public\.push_claim\(text, uuid\) to service_role/.test(sql), 'everything else of push_claim is as before (quiet hours, muted chats, nothing kept in the app, service-only)');
check(!/n\.type = 'new_message'[^\n]*\n[^\n]*in_front[\s\S]{0,40}n\.type <> 'new_message'/.test(sql), 'other kinds of notification (likes, follows, NOOB Draw ...) are not held back');
const api = read('src/services/supabaseApi.ts'), app = read('src/App.tsx');
check(/export function startInFrontHeartbeat/.test(api) && /rpc\('touch_in_front', \{ p_on: on \}\)/.test(api) && /window\.setInterval\(tick, 15_000\)/.test(api) && /visibilityState === 'visible'/.test(api) && /addEventListener\('pagehide'/.test(api), 'the open app tells the database every 15 seconds while visible, and at once when it is hidden');
check(/startInFrontHeartbeat\(\)/.test(app) && /stopInFront\(\)/.test(app), 'it runs for as long as someone is signed in');
check(!/playNotificationSound\('message'\)/.test(app) && /useUnreadChatCount\(currentUser\)/.test(app), 'no sound in the app when a chat message arrives (the red number is enough)');
const sw = read('public/sw.js');
check(/visibilityState === 'visible'/.test(sw) && /silent: true/.test(sw), 'the service worker is the second line: if an alert still arrives while the app is in front it is silent and gone at once');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
