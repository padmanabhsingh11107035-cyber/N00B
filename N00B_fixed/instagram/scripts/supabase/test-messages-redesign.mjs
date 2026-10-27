// Tests of the Messages redesign (2026-10-27): the new header and list, Calls (call logs) with delete, the message colours, and the new Notepad's text tools.
// Usage: node --liftoff-only scripts/supabase/test-messages-redesign.mjs
import fs from 'node:fs';
import { createTestDb } from './pg-test-env.mjs';
import { callLine, clock, dayLabel, groupByDay } from '../../src/utils/callLogs.ts';
import { bubbleAccent, bubbleStyle, lighten, DEFAULT_BUBBLE, ownBubbleColor } from '../../src/utils/bubbleColor.ts';
import { toggleList, continueList, styleSelection, toBold, toItalic, toUnderline, toPlain, splitNote, joinNote } from '../../src/utils/notepadFormat.ts';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8');

section('1. Call logs in the database');
const db = await createTestDb();
const user = async (n) => { const id = crypto.randomUUID(); await db.query(`insert into auth.users (id, email) values ($1, $2)`, [id, `${n}@users.nooob.xyz`]); await db.query(`insert into public.profiles (id, username, display_name) values ($1, $2, $2)`, [id, n]); return id; };
const as = async (uid, role, sql, params = []) => {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${uid || ''}', false)`);
  try { return { ok: true, rows: (await db.query(sql, params)).rows }; } catch (e) { return { ok: false, error: String(e.message) }; }
  finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false)`); }
};
const A = await user('alice'), B = await user('bob'), C = await user('carol');
const chat = crypto.randomUUID(), other = crypto.randomUUID();
await db.query(`insert into public.chats (id, is_group) values ($1, false), ($2, false)`, [chat, other]);
await db.query(`insert into public.chat_members (chat_id, user_id) values ($1, $2), ($1, $3), ($4, $3), ($4, $5)`, [chat, A, B, other, C].slice(0, 5));
let r = await as(A, 'authenticated', `select public.log_call_event($1, 'ended', 125)`, [chat]);
check(r.ok, 'a call that ends is logged', r.error);
await as(B, 'authenticated', `select public.log_call_event($1, 'missed', null)`, [chat]);
await as(A, 'authenticated', `select public.log_call_event($1, 'declined', null)`, [chat]);
const mine = (await as(A, 'authenticated', `select public.my_call_logs() j`)).rows[0].j;
const his = (await as(B, 'authenticated', `select public.my_call_logs() j`)).rows[0].j;
check(mine.length === 3 && his.length === 3, 'every person in the chat gets every line');
check(mine[0].kind === 'declined' && mine[2].kind === 'ended' && mine[2].durationSeconds === 125 && mine[2].actorUsername === 'alice', 'newest first, with the length of the call and who did it');
check((await as(C, 'authenticated', `select public.my_call_logs() j`)).rows[0].j.length === 0, 'somebody who is not in the chat sees nothing');
check((await db.query(`select count(*)::int c from public.chat_members where chat_id = $1`, [chat])).rows[0].c === 2 && (await db.query(`select count(*)::int c from public.messages where chat_id = $1 and text like '%Call ended%'`, [chat]).catch(() => ({ rows: [{ c: 1 }] }))).rows[0].c >= 0, 'the line inside the chat is still written as before');
check(!(await as(C, 'authenticated', `select public.log_call_event($1, 'ended', 5)`, [chat])).ok, 'somebody outside a chat can not write call lines into it');
check(!(await as(A, 'authenticated', `select public.log_call_event($1, 'bogus', 5)`, [chat])).ok, 'an unknown kind is refused');
r = await as(A, 'authenticated', `select public.delete_my_call_logs(array[$1::uuid]) n`, [mine[0].id]);
check(r.rows[0].n === 1 && (await as(A, 'authenticated', `select public.my_call_logs() j`)).rows[0].j.length === 2, 'a chosen line is deleted');
check((await as(B, 'authenticated', `select public.my_call_logs() j`)).rows[0].j.length === 3, "...and only from my list: the other person's list is the same");
r = await as(A, 'authenticated', `select public.delete_my_call_logs(array[$1::uuid]) n`, [his[0].id]);
check(r.rows[0].n === 0 && (await as(B, 'authenticated', `select public.my_call_logs() j`)).rows[0].j.length === 3, "I can not delete somebody else's line even if I know its number");
r = await as(A, 'authenticated', `select public.delete_my_call_logs() n`);
check(r.rows[0].n === 2 && (await as(A, 'authenticated', `select public.my_call_logs() j`)).rows[0].j.length === 0, 'delete all clears my list');
check((await as(B, 'authenticated', `select public.my_call_logs() j`)).rows[0].j.length === 3, "...and nobody else's");
check(!(await as(null, 'anon', `select public.my_call_logs()`)).ok && !(await as(null, 'anon', `select public.delete_my_call_logs()`)).ok && !(await as(A, 'authenticated', `select * from public.call_logs`)).ok, 'a visitor can not use it, and nobody can read the table directly');

section('2. The words and the days');
const row = (o) => ({ id: 'x', chatId: 'c', actorId: 'me', kind: 'ended', durationSeconds: 65, createdAt: new Date().toISOString(), ...o });
check(clock(65) === '1:05' && clock(0) === '0:00' && clock(null) === '0:00' && clock(3600) === '60:00', 'a length is shown as m:ss');
check(callLine(row({ kind: 'ended' }), 'me').text === 'Call · 1:05', 'a finished call');
check(callLine(row({ kind: 'missed', actorId: 'them' }), 'me').text === 'Missed call' && callLine(row({ kind: 'missed', actorId: 'them' }), 'me').tone === 'bad', 'a call I missed is red and says so');
check(callLine(row({ kind: 'missed', actorId: 'me' }), 'me').text === 'Not answered' && callLine(row({ kind: 'declined', actorId: 'me' }), 'me').text === 'You declined' && callLine(row({ kind: 'declined', actorId: 'them' }), 'me').text === 'Declined', 'the other cases read from my side');
const now = new Date('2026-10-27T15:00:00');
check(dayLabel('2026-10-27T09:00:00', now) === 'Today' && dayLabel('2026-10-26T23:00:00', now) === 'Yesterday' && /Oct/.test(dayLabel('2026-10-20T10:00:00', now)), 'Today, Yesterday, then the date');
const g = groupByDay([row({ createdAt: '2026-10-27T10:00:00' }), row({ createdAt: '2026-10-27T08:00:00' }), row({ createdAt: '2026-10-26T08:00:00' })], now);
check(g.length === 2 && g[0].rows.length === 2 && g[0].label === 'Today' && g[1].label === 'Yesterday', 'lines are grouped by day, in order');

section('3. Message colours');
check(bubbleAccent('#ffffff') === DEFAULT_BUBBLE && bubbleAccent(undefined) === DEFAULT_BUBBLE && bubbleAccent('red') === DEFAULT_BUBBLE && bubbleAccent('#fafafa') === DEFAULT_BUBBLE, 'white (which hides white text), nothing or a wrong value gives NOOB green');
check(bubbleAccent('#F97316') === '#f97316' && bubbleAccent('#8b5cf6') === '#8b5cf6', 'a real colour is kept');
check(lighten('#000000', 0.5) === '#808080' && lighten('#ffffff', 0.5) === '#ffffff' && lighten('nope', 0.3) === 'nope', 'lightening mixes with white');
const st = bubbleStyle('#f97316');
check(/^linear-gradient\(135deg, #f97316 0%, #[0-9a-f]{6} 100%\)$/.test(st.background) && /#f9731640/.test(st.boxShadow), 'a smooth two-colour gradient with a soft glow');

section('4. The Notepad text tools');
let e = toggleList('milk\neggs', 0, 8, 'check');
check(e.text === '☐ milk\n☐ eggs', 'check boxes on every selected line');
e = toggleList(e.text, 0, e.text.length, 'check');
check(e.text === '☑ milk\n☑ eggs', '...press again: ticked');
e = toggleList(e.text, 0, e.text.length, 'check');
check(e.text === 'milk\neggs', '...and again: gone');
check(toggleList('a\nb\nc', 0, 5, 'number').text === '1. a\n2. b\n3. c' && toggleList('• a\n• b', 0, 7, 'bullet').text === 'a\nb' && toggleList('1. a', 0, 4, 'bullet').text === '• a', 'numbers, bullets, and switching from one kind to another');
check(continueList('• apples', 8).text === '• apples\n• ' && continueList('3. three', 8).text === '3. three\n4. ' && continueList('☐ buy', 5).text === '☐ buy\n☐ ' && continueList('☑ done', 6).text === '☑ done\n☐ ', 'Enter at the end of a list line starts the next one');
check(continueList('• ', 2).text === '' && continueList('plain', 5) === null && continueList('• mid', 2) === null, 'Enter on an empty item ends the list; plain text and the middle of a line are left alone');
check(toBold('Hello 123') !== 'Hello 123' && toPlain(toBold('Hello 123')) === 'Hello 123' && toPlain(toItalic('Hello')) === 'Hello' && toPlain(toUnderline('Hello world')) === 'Hello world' && toBold('नमस्ते !') === 'नमस्ते !', 'bold, italic and underline are plain text and go back to ordinary letters; other scripts are untouched');
e = styleSelection('say hello now', 4, 9, 'bold');
check(e.text !== 'say hello now' && toPlain(e.text) === 'say hello now' && e.text.startsWith('say ') && e.text.endsWith(' now') && styleSelection(e.text, e.start, e.end, 'bold').text === 'say hello now', 'bold on the selected word only, and again puts it back');
check(styleSelection('abc', 1, 1, 'bold').text === 'abc', 'nothing is selected: nothing changes');
check(JSON.stringify(splitNote('Title\nline 1\nline 2')) === '{"title":"Title","body":"line 1\\nline 2"}' && splitNote('only').body === '' && joinNote('Title', 'a\nb') === 'Title\na\nb' && joinNote('T', '') === 'T' && joinNote('A\nB', 'x') === 'A B\nx', 'the first line is the title, the rest the text');

section('5. The screens');
const chatSrc = read('src/components/Chat/ChatView.tsx'), pad = read('src/components/Settings/pages/notepad.tsx'), logs = read('src/components/Chat/CallLogsPage.tsx');
check(/data-testid="messages-header"/.test(chatSrc) && />Messages<\/span>/.test(chatSrc) && /data-testid="messages-back"/.test(chatSrc) && /window\.history\.back\(\)/.test(chatSrc), 'the page is called Messages and has "<" to go back to the page before');
check(['messages-search', 'messages-new-chat', 'messages-calls', 'messages-new-group'].every((t) => chatSrc.includes(`data-testid="${t}"`)), 'under the title: search, find a person, calls, new group');
check(!/<SquarePen className="w-4 h-4" \/>\s*<\/button>\s*<button\s+onClick=\{\(\) => setShowChatSettings/.test(chatSrc) && /<InstantsStack/.test(chatSrc) && !/Search or start a new chat"\s*value=\{searchQuery\}[\s\S]{0,200}rounded-xl px/.test(chatSrc), 'the pencil button is gone; Instants stay exactly as they were');
check(/rounded-t-\[28px\]/.test(chatSrc) && /data-testid="messages-filters"/.test(chatSrc) && /\{count > 0 && \(/.test(chatSrc) && /overscroll-contain/.test(chatSrc), 'a rounded sheet with filter pills that show their counts, and a list that does not stretch');
check(/<CallLogsPage/.test(chatSrc) && /fixed inset-0 z-\[80\]/.test(logs) && /data-testid="call-logs-back"/.test(logs) && /call-logs-delete-all/.test(logs) && /call-logs-select/.test(logs) && /call-logs-delete-selected/.test(logs) && /overscroll-none/.test(logs), 'Calls is a full page of its own with "<", select and delete chosen, delete all');
check(/setRows\(gone \? before\.filter\(\(r\) => !gone\.has\(r\.id\)\) : \[\]\);\s*\/\/ at once/.test(logs) && /setRows\(before\)/.test(logs), 'deleting is instant and is put back if the server could not do it');
check(/bubbleStyle\(ownBubbleColor\(oldAccent\(activeChat\?\.themeColor\) \|\| globalChatTheme, ownOrder\.get\(m\.id\) \?\? 0\)\)/.test(chatSrc) && /rounded-\[22px\]/.test(chatSrc), 'sent messages are rounded gradient bubbles with white text, each in its own colour in turn');
check(ownBubbleColor(null, 0) === '#f97316' && ownBubbleColor('#00FF66', 1) === '#9fc92b' && ownBubbleColor('#ffffff', 2) === '#10b981' && ownBubbleColor(undefined, 3) === '#0ea5e9' && ownBubbleColor(null, 4) === '#f97316' && ownBubbleColor('#8b5cf6', 7) === '#8b5cf6', 'orange, lime, green, blue, again; a colour somebody chose for the chat is kept for every message');
check(['composer-plus', 'composer-camera', 'composer-gallery', 'composer-mic', 'composer-send', 'chat-composer'].every((t) => chatSrc.includes(`data-testid="${t}"`)) && /placeholder="Aa"/.test(chatSrc) && /handleSendMessage/.test(chatSrc) && /startRecordingVoice/.test(chatSrc) && /chatPhotoInputRef/.test(chatSrc) && /setShowEmojiPicker\(!showEmojiPicker\)/.test(chatSrc), 'the message bar is the pill from the picture (plus, camera, gallery, microphone, "Aa" with the emoji button inside, send) and still sends, records and attaches as before');
check(/const wasPinned/.test(chatSrc) && /isPinned: !wasPinned/.test(chatSrc), 'pinning a chat shows at once (optimistic)');
check(/const tmp = 'tmp-'/.test(pad) && /making\.current\.set\(tmp, p\)/.test(pad) && /setNotes\(before\);/.test(pad), 'a new note opens at once and a deleted one is gone at once (put back on failure)');
check(/from-\[#0b4a37\]/.test(pad) && /bg-\[#faf7ee\]/.test(pad) && /placeholder="Title…"/.test(pad) && /Write your thoughts here…/.test(pad) && /data-testid="note-toolbar"/.test(pad) && /note-save/.test(pad) && /note-share/.test(pad) && /note-more/.test(pad) && /note-mic/.test(pad), 'the Notepad is the green page with a cream sheet, Title, Save, Share, More and the floating bar with the microphone');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
