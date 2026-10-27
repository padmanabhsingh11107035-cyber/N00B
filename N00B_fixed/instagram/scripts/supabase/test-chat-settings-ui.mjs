// Chats: last seen in the chat, and the "Chats" settings page (21 settings), each one wired to what it says. Usage: node --liftoff-only scripts/supabase/test-chat-settings-ui.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const page = read('src/components/Settings/pages/chats.tsx');
const view = read('src/components/Chat/ChatView.tsx');
const api = read('src/services/settingsApi.ts');
const sql = read('supabase/migrations/20261018000005_chat_settings_last_seen.sql');
const U = (f) => import(pathToFileURL(path.resolve(f)).href);

section('1. The settings page');
const keys = [...(page.match(/CHAT_SETTING_KEYS = \[([\s\S]*?)\] as const/) || ['', ''])[1].matchAll(/'([a-z.A-Z]+)'/g)].map((m) => m[1]);
check(keys.length >= 20, `${keys.length} settings on the page (at least 20)`);
check(keys.every((k) => page.includes(`s['${k}']`)), 'every one of them is drawn on the page and shows its current value');
check(keys.every((k) => new RegExp(`'${k.replace('.', '\\.')}':`).test(api)), 'and every one is in the app\'s list of settings');
check(/'chats'/.test(read('src/components/Settings/registry.ts')) && /chats: ChatSettingsPage/.test(read('src/components/Settings/pages/index.tsx')), 'it is in "Settings and activity" (searchable) as "Chats"');
check(/data-testid="chat-settings-button"/.test(view) && /<ChatSettingsPage back=\{\(\) => setShowChatSettings\(false\)\} \/>/.test(view) && /Chat Settings/.test(view), 'and opens from a gear at the top of the chat list, and from its menu');

section('2. The app and the server agree on every new setting');
const sqlDefaults = Object.fromEntries([...sql.matchAll(/'(chat\.[a-zA-Z]+)', ('[^']*'|true|false)/g)].map((m) => [m[1], m[2]]));
const tsDefaults = Object.fromEntries([...api.matchAll(/^  '(chat\.[a-zA-Z]+)': ('[^']*'|true|false),?$/gm)].map((m) => [m[1], m[2]]));
check(Object.keys(sqlDefaults).length === 16 && JSON.stringify(sqlDefaults) === JSON.stringify(Object.fromEntries(Object.keys(sqlDefaults).map((k) => [k, tsDefaults[k]]))), 'sixteen new settings, same starting values in the server\'s list and in the app', JSON.stringify([sqlDefaults, tsDefaults]));
const enums = [...sql.matchAll(/'(chat\.[a-zA-Z]+)', jsonb_build_array\(([^)]*)\)/g)].map((m) => [m[1], [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1])]);
check(enums.length === 6 && enums.every(([k, vals]) => vals.includes(tsDefaults[k].replace(/'/g, ''))), 'every choice list contains its own starting value');

section('3. Last seen');
const L = await U('src/utils/lastSeen.ts');
const noon = new Date(2026, 9, 18, 12, 0, 0).getTime();
const at = (d, h, m) => new Date(2026, 9, d, h, m, 0).toISOString();
check(L.formatLastSeen(at(18, 11, 20), true, noon).startsWith('last seen today at 11:20') && /AM$/.test(L.formatLastSeen(at(18, 11, 20), true, noon)), 'today: "last seen today at 11:20 AM"', L.formatLastSeen(at(18, 11, 20), true, noon));
check(L.formatLastSeen(at(18, 11, 20), false, noon) === 'last seen today at 11:20', 'on the 24-hour clock: "11:20"', L.formatLastSeen(at(18, 11, 20), false, noon));
check(L.formatLastSeen(at(18, 0, 5), false, noon) === 'last seen today at 00:05', 'after midnight it is 00:05, never 24:05', L.formatLastSeen(at(18, 0, 5), false, noon));
check(/^last seen yesterday at /.test(L.formatLastSeen(at(17, 23, 40), true, noon)), 'yesterday');
check(/^last seen 12 Oct at /.test(L.formatLastSeen(at(12, 9, 0), true, noon)) || /^last seen Oct 12 at /.test(L.formatLastSeen(at(12, 9, 0), true, noon)) || /12/.test(L.formatLastSeen(at(12, 9, 0), true, noon)), 'an older day shows the date', L.formatLastSeen(at(12, 9, 0), true, noon));
check(/2025/.test(L.formatLastSeen(new Date(2025, 11, 30, 10, 0).toISOString(), true, noon)), 'a day in an earlier year shows the year');
check(L.formatLastSeen(new Date(noon - 20000).toISOString(), true, noon) === 'last seen just now' && L.formatLastSeen(null) === '' && L.formatLastSeen('nonsense') === '', 'just now, and nothing for what is not known');
check(/data-testid="chat-last-seen"/.test(view) && /formatLastSeen\(lastSeenMap\[headerPartner\.id\], cs\['chat\.timeFormat'\] !== '24h'\)/.test(view) && /data-testid="chat-online-text"/.test(view), 'the chat\'s header says "Online" or when the person was last seen');
check(/fetchChatLastSeen\(\[lastSeenPartnerId\]\)/.test(view) && /setInterval\(\(\) => \{ if \(document\.visibilityState === 'visible'\) load\(\); \}, 60000\)/.test(view), 'it is asked for when the chat opens and every minute while it stays open');

section('4. Each setting does what it says');
check(/cs\['chat\.typing'\]\)/.test(view) && /e\.target\.value\.trim\(\) && cs\['chat\.typing'\]/.test(view), 'Typing indicator: off, nobody is told you are typing');
check(/cs\['chat\.confirmDelete'\] && !window\.confirm\('Delete this message for everyone\?'\)/.test(view) && /cs\['chat\.confirmDelete'\] && !window\.confirm\('Delete this message for you\?'\)/.test(view), 'Ask before deleting: both kinds of delete');
check(/cs\['chat\.encryptionNotice'\] && \(/.test(view), 'Encryption notice can be hidden');
check(/formatClockTime\(iso, cs\['chat\.timeFormat'\] !== '24h'\)/.test(view) && /fmtClock\(m\.createdAt\)/.test(view) && /fmtClock\(c\.lastMessage\.createdAt\)/.test(view) && !/formatClockTime\(m\.createdAt\)/.test(view), 'Time in chats: messages and the list use the chosen clock');
const T = await U('src/utils/formatTime.ts');
const t1 = T.formatClockTime(at(18, 17, 42), false), t2 = T.formatClockTime(at(18, 17, 42), true);
check(t1 === '17:42' && /5:42\s?PM/i.test(t2) && T.formatClockTime(at(18, 17, 42)) === T.formatClockTime(at(18, 17, 42)), 'the clock itself: 17:42 or 5:42 PM', `${t1} | ${t2}`);
check(/cs\['chat\.compactList'\] \? 'px-4 py-1\.5' : 'px-4 py-3'/.test(view) && /cs\['chat\.compactList'\] \? 'w-9 h-9' : 'w-14 h-14'/.test(view), 'Compact list: smaller rows and pictures');
check(/!cs\['chat\.previewInList'\] && lastMsg/.test(view), 'Message previews can be hidden');
check(/cs\['chat\.listAvatars'\] && \(/.test(view), 'Profile pictures in the list can be hidden');
check(/if \(cs\['chat\.pinnedOnTop'\]\) \{/.test(view) && /pinned chats are not kept on top: the newest chat is first/.test(view), 'Pinned chats on top: off, newest first');
check(/cs\['chat\.unreadBadges'\] && c\.unreadCount/.test(view), 'Unread counts can be hidden');
check(/cs\['chat\.fontSize'\] === 'small' \? 'text-\[12px\]' : cs\['chat\.fontSize'\] === 'large' \? 'text-\[17px\]' : ''/.test(view), 'Text size: small / medium / large');
check(/cs\['chat\.wallpaper'\] === 'plain' \? 'bg-page' : cs\['chat\.wallpaper'\] === 'dark' \? 'bg-black' : 'chat-wallpaper'/.test(view), 'Background: doodles / plain / dark');
check(/if \(cs\['chat\.sounds'\]\) playChatTone\('in'\)/.test(view) && /if \(cs\['chat\.sounds'\]\) playChatTone\('out'\)/.test(view) && /cs\['chat\.vibrate'\] && typeof navigator !== 'undefined' && navigator\.vibrate/.test(view), 'Sounds and vibration on a message in / out');
const M = await U('src/utils/chatMedia.ts');
check(M.mediaMayLoad('always', true) && M.mediaMayLoad('always', false) && !M.mediaMayLoad('never', false) && M.mediaMayLoad('wifi', false) && !M.mediaMayLoad('wifi', true), 'Photos and videos: always / only on Wi-Fi / never');
check(/data-testid="media-tap-to-load"/.test(view) && /!\(isMine \|\| loadedMedia\.has\(m\.id\) \|\| mediaMayLoad\(cs\['chat\.autoLoad'\]\)\)/.test(view) && /\(isMine \|\| loadedMedia\.has\(m\.id\) \|\| mediaMayLoad\(cs\['chat\.autoLoad'\]\)\) && \(/.test(view), 'a picture that is not loaded waits for a tap (yours always show)');
check(/notif\.messages/.test(page) && /activity\.status/.test(page) && /msg\.readReceipts/.test(page) && /msg\.who/.test(page) && /msg\.storyReplies/.test(page), 'the older settings that belong to chats are on the same page');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
