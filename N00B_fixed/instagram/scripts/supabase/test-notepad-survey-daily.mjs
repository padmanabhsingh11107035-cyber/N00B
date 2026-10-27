// Tests migration 20261027000005 and the screens that use it: the Notepad, "where did you hear about NOOB?", Daily NOOB coming back, and the message ticks.
// Usage: node --liftoff-only scripts/supabase/test-notepad-survey-daily.mjs
import fs from 'node:fs';
import { createTestDb } from './pg-test-env.mjs';
import { filterNotes, noteStats, noteTitle } from '../../src/utils/notes.ts';
import { ASK_KEY, SOURCE_OPTIONS, cleanSource, clearAskSource, markAskSource, shouldAskSource } from '../../src/utils/signupSource.ts';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8');

const db = await createTestDb();
const user = async (name, extra = '') => {
  const id = crypto.randomUUID();
  await db.query(`insert into auth.users (id, email) values ($1, $2)`, [id, `${name}@users.nooob.xyz`]);
  await db.query(`insert into public.profiles (id, username, display_name ${extra ? ', ' + extra.split('=')[0] : ''}) values ($1, $2, $2 ${extra ? ', ' + extra.split('=')[1] : ''})`, [id, name]);
  return id;
};
const as = async (uid, role, fn) => {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${uid || ''}', false)`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false)`); }
};
const tryq = async (uid, role, sql, params = []) => as(uid, role, async () => { try { return { ok: true, rows: (await db.query(sql, params)).rows, n: undefined }; } catch (e) { return { ok: false, error: String(e.message || e) }; } });

const A = await user('alice'), B = await user('bob'), S = await user('susp', 'is_suspended=true');
const ADMIN = await user('noob', 'is_admin=true');

section('1. Notepad: only the owner');
const text = 'Line one 🎉\n\nLine three — with "quotes" and \'apostrophes\' \\ and unicode: नमस्ते';
let r = await tryq(A, 'authenticated', `insert into public.profile_notes (body) values ($1) returning id, user_id, body`, [text]);
check(r.ok && r.rows[0].user_id === A && r.rows[0].body === text, 'a note is saved for the person who is logged in (the database fills in the owner), text kept exactly', r.error);
const noteId = r.rows[0].id;
check((await tryq(A, 'authenticated', `select count(*)::int c from public.profile_notes`)).rows[0].c === 1, 'the owner sees it');
check((await tryq(B, 'authenticated', `select count(*)::int c from public.profile_notes`)).rows[0].c === 0, 'nobody else sees it');
check((await tryq(B, 'authenticated', `update public.profile_notes set body = 'hacked' where id = $1 returning id`, [noteId])).rows.length === 0, "nobody else can change it");
check((await tryq(B, 'authenticated', `delete from public.profile_notes where id = $1 returning id`, [noteId])).rows.length === 0, 'nobody else can delete it');
r = await tryq(B, 'authenticated', `insert into public.profile_notes (user_id, body) values ($1, 'planted')`, [A]);
check(!r.ok, "nobody can write a note into somebody else's notepad");
check(!(await tryq(null, 'anon', `select * from public.profile_notes`)).ok, 'a visitor who is not logged in can not even look');
await db.query(`update public.profile_notes set updated_at = now() - interval '1 day' where id = $1`, [noteId]);
r = await tryq(A, 'authenticated', `update public.profile_notes set body = 'changed' where id = $1 returning updated_at > now() - interval '1 minute' as fresh`, [noteId]);
check(r.ok && r.rows[0]?.fresh === true, 'the time of the last change is kept by the database');
r = await tryq(A, 'authenticated', `insert into public.profile_notes (body) values (repeat('x', 100001))`);
check(!r.ok, 'a note over 100,000 characters is refused');
for (let i = 0; i < 299; i++) await db.query(`insert into public.profile_notes (user_id, body) values ($1, 'n')`, [A]);
r = await tryq(A, 'authenticated', `insert into public.profile_notes (body) values ('one too many')`);
check(!r.ok && /300 notes/.test(r.error), 'the 301st note is refused, with a kind message');
await db.query(`delete from public.profiles where id = $1`, [S]);

section('2. Notepad helpers');
check(noteTitle('\n  Shopping list\nmilk') === 'Shopping list' && noteTitle('') === 'Empty note' && noteTitle('x'.repeat(80)).length === 49, 'the title is the first line, shortened');
const st = noteStats('hello big world\nsecond line');
check(st.words === 5 && st.chars === 27 && st.lines === 2 && noteStats('').words === 0, 'words, characters and lines are counted');
const sample = [{ id: '1', body: 'Milk and eggs', createdAt: '', updatedAt: '' }, { id: '2', body: 'Call Rahul', createdAt: '', updatedAt: '' }];
check(filterNotes(sample, 'RAHUL').length === 1 && filterNotes(sample, '').length === 2 && filterNotes(sample, 'zzz').length === 0, 'search ignores capitals and an empty search shows all');

section('3. "Where did you hear about NOOB?"');
r = await tryq(A, 'authenticated', `insert into public.signup_sources (source, detail) values ('instagram', null) returning user_id`);
check(r.ok && r.rows[0].user_id === A, 'a person can answer (the database fills in who)', r.error);
check(!(await tryq(A, 'authenticated', `insert into public.signup_sources (source) values ('youtube')`)).ok, 'but only once');
check(!(await tryq(B, 'authenticated', `insert into public.signup_sources (user_id, source) values ($1, 'google')`, [A])).ok, "and nobody can answer for somebody else");
check((await tryq(B, 'authenticated', `select count(*)::int c from public.signup_sources`)).rows[0].c === 0, "nobody can read somebody else's answer");
check(!(await tryq(A, 'authenticated', `update public.signup_sources set source = 'x'`)).ok || (await tryq(A, 'authenticated', `select source from public.signup_sources`)).rows[0].source === 'instagram', 'an answer can not be changed afterwards');
await tryq(B, 'authenticated', `insert into public.signup_sources (source, detail) values ('other', 'a poster at my school')`);
r = await tryq(A, 'authenticated', `select public.admin_signup_sources()`);
check(!r.ok, 'the totals are for the administrator only');
r = await tryq(ADMIN, 'authenticated', `select public.admin_signup_sources() s`);
check(r.ok && r.rows[0].s.total === 2 && r.rows[0].s.others[0] === 'a poster at my school' && r.rows[0].s.sources.length === 2, 'the administrator sees the totals and what people typed under "somewhere else"', JSON.stringify(r.rows?.[0]));
check(SOURCE_OPTIONS.length >= 12 && SOURCE_OPTIONS.some((o) => o.id === 'other') && new Set(SOURCE_OPTIONS.map((o) => o.id)).size === SOURCE_OPTIONS.length, 'the card offers plenty of places, each once, with "somewhere else" among them');
check(cleanSource('instagram') === 'instagram' && cleanSource('<script>') === 'other', 'only known places are stored as they are');
const mem = new Map(); const store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
check(shouldAskSource('u1', store) === false, 'an account that was not just made is not asked');
markAskSource('u1', store);
check(shouldAskSource('u1', store) === true && shouldAskSource('u2', store) === false && mem.get(ASK_KEY) === 'u1', 'the account that was just made is asked, nobody else on that device');
clearAskSource(store);
check(shouldAskSource('u1', store) === false, 'after the answer or Skip it is never asked again');

section('4. Daily NOOB is back');
const count = async (uid) => Number((await db.query(`select count(*) c from public.notifications where target_user_id = $1 and title like 'Daily NOOB is back%'`, [uid])).rows[0].c);
await tryq(ADMIN, 'authenticated', `select public.admin_set_feature('daily', false)`);
check((await count(A)) === 0, 'switching Daily NOOB OFF tells nobody');
r = await tryq(ADMIN, 'authenticated', `select public.admin_set_feature('daily', true)`);
check(r.ok, 'the switch still works', r.error);
check((await count(A)) === 1 && (await count(B)) === 1, 'switching it back ON notifies everybody');
check((await count(ADMIN)) === 0, '...except the administrator who did it');
const n = (await db.query(`select type, message from public.notifications where target_user_id = $1 and title like 'Daily NOOB is back%'`, [A])).rows[0];
check(n.type === 'admin_direct' && /Daily NOOB is back/.test(n.message), 'in plain words');
await tryq(ADMIN, 'authenticated', `select public.admin_set_feature('daily', true)`);
check((await count(A)) === 1, 'switching it on when it already is on notifies nobody again');
await tryq(ADMIN, 'authenticated', `select public.admin_set_feature('music', false)`);
await tryq(ADMIN, 'authenticated', `select public.admin_set_feature('music', true)`);
check((await db.query(`select count(*)::int c from public.notifications where target_user_id = $1 and title ilike '%music%'`, [A])).rows[0].c === 0, 'another page coming back notifies nobody');
check(!(await tryq(A, 'authenticated', `select public.admin_set_feature('daily', false)`)).ok, 'an ordinary person still can not use the switch');

section('5. On the screens');
const reg = read('src/components/Settings/registry.ts'), pages = read('src/components/Settings/pages/index.tsx'), app = read('src/App.tsx'), api = read('src/services/supabaseApi.ts');
check(/id: 'notepad', section: 'Quick tools'[^}]*page: 'notepad'/.test(reg) && /notepad: NotepadPage/.test(pages), 'Notepad is the first group of the profile menu (Settings and activity > Quick tools)');
const pad = read('src/components/Settings/pages/notepad.tsx');
check(/autosave|flush/.test(pad) && /Undo/.test(pad) && /Redo/.test(pad) && /Paste/.test(pad) && /Copy all/.test(pad) && /Save as \.txt/.test(pad) && /Search your notes/.test(pad) && /Bigger text/.test(pad), 'it has what a basic notepad has: new, save by itself, undo, redo, paste, copy, save as a file, search, text size, counts');
check(/<SignupSourceCard userId=\{currentUser\.id\} \/>/.test(app) && (api.match(/markAskSource\(/g) || []).length === 2, 'the question is asked after sign-up with the code and after sign-up with Google');
const chat = read('src/components/Chat/ChatView.tsx');
check((chat.match(/m\.status === 'read' \?|lastMsg\?\.status === 'read' \?/g) || []).length === 2 && !/title="Delivered"/.test(chat), 'ticks: two grey ones once sent (in the chat and in the chat list), two blue ones only when seen, never one tick or blue by mistake');
check(/'Delivered'/.test(chat) === false && /title="Seen"/.test(chat), 'the blue ones say "Seen"');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
