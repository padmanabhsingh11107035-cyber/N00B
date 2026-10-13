// Tests migration 20261014000002 (NOOB STUDY, part 2): the tutor's conversations and messages, what the server may know for one question, the
// daily fair-use limits, sending a message twice, the private storage for pictures, and that only the server can use the server-side functions.
// On a REAL Postgres (PGlite) with every migration applied.
//
// Usage: node scripts/supabase/test-noob-study-ai.mjs
import fs from 'node:fs';
import { createTestDb, asUser, asAnon } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const expectFail = async (fn, pattern, label) => {
  try { await fn(); check(false, label, '(expected an error, but it succeeded)'); }
  catch (e) { check(pattern.test(e.message), label, `(got: ${e.message})`); }
};
const section = (t) => console.log(`\n${t}`);

const db = await createTestDb();
const mkUser = async (name, patch = {}) => {
  const id = (await db.query(`select gen_random_uuid() as id`)).rows[0].id;
  await db.query(`insert into auth.users (id, email, encrypted_password) values ($1, $2, 'x')`, [id, `${name}@users.nooob.xyz`]);
  const has = (await db.query(`select 1 from public.profiles where id = $1`, [id])).rows.length;
  if (!has) await db.query(`insert into public.profiles (id, username, display_name) values ($1, $2, $2)`, [id, name]);
  for (const [col, val] of Object.entries(patch)) await db.query(`update public.profiles set ${col} = $2 where id = $1`, [id, val]);
  return id;
};
const rpc = (uid, fn, ...args) => asUser(db, uid, async () => (await db.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).rows[0].r);
const svc = async (fn, ...args) => {
  await db.exec('set role service_role');
  try { return (await db.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).rows[0].r; }
  finally { await db.exec('reset role'); }
};
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const J = (o) => JSON.stringify(o);
const ref = () => crypto.randomUUID();

const ann = await mkUser('ann'), bob = await mkUser('bob');
await rpc(ann, 'study_save_profile', J({ displayName: 'Ann Lee', language: 'hi', level: 'class_12', board: 'CBSE', goals: { biggestProblem: 'Focus' }, tutor: { name: 'Nova', style: 'calm' } }), 4);
const aSubj = (await rpc(ann, 'study_set_subjects', J(['Physics', 'Maths']))).subjects;
const phys = aSubj[0].id;
const bSubj = (await rpc(bob, 'study_set_subjects', J(['History']))).subjects[0].id;

section('1. Who can call what');
let denied = 0;
for (const [fn, args] of [['study_svc_take', [ann, 'chat']], ['study_svc_context', [ann, null, null, '']], ['study_svc_msg_user', [ann, ref(), 'hi', '[]', ref()]], ['study_svc_msg_assistant', [ann, ref(), 'x', '{}']], ['study_svc_conv_create', [ann, null, 'chat', '', '']], ['study_svc_limits', [ann]]]) {
  try { await rpc(ann, fn, ...args); } catch (e) { if (/permission denied/.test(e.message)) denied++; }
}
check(denied === 6, 'a signed-in student cannot call any of the server-side functions (not even for themselves)');
let anonDenied = 0;
for (const fn of ['study_conv_list', 'study_conv_create', 'study_ai_status']) { try { await asAnon(db, async () => db.query(`select public.${fn}()`)); } catch (e) { if (/permission denied/.test(e.message)) anonDenied++; } }
check(anonDenied === 3, 'someone not signed in cannot use the student functions');
check((await svc('study_svc_limits', ann)).chat.limit === 150, 'the server can');
let direct = 0;
for (const t of ['study_conversations', 'study_messages', 'study_ai_usage', 'study_ai_limits']) { try { direct += (await asUser(db, ann, async () => db.query(`select * from public.${t}`))).rows.length; } catch { /* denied is fine */ } }
check(direct === 0, 'the new tables cannot be read directly');

section('2. Fair-use limits');
await db.query(`update public.study_ai_limits set per_day = 2 where kind = 'chat'`);
let t1 = await svc('study_svc_take', ann, 'chat'), t2 = await svc('study_svc_take', ann, 'chat'), t3 = await svc('study_svc_take', ann, 'chat');
check(t1.allowed && t1.remaining === 1 && t2.allowed && t2.remaining === 0 && !t3.allowed && t3.remaining === 0 && t3.limit === 2, 'two are allowed, the third is refused, with the numbers to show');
check((await q(`select used from public.study_ai_usage where user_id = $1 and kind = 'chat'`, [ann]))[0].used === 2, 'a refused request is not counted');
check((await svc('study_svc_take', bob, 'chat')).allowed, 'each student has their own count');
check((await svc('study_svc_take', ann, 'vision')).allowed && (await svc('study_svc_take', ann, 'research')).remaining === 19, 'each kind of request has its own limit');
await expectFail(() => svc('study_svc_take', ann, 'unlimited'), /not known/, 'an unknown kind is refused');
await db.query(`update public.study_ai_usage set day = day - 1 where user_id = $1`, [ann]);
check((await svc('study_svc_take', ann, 'chat')).allowed, 'a new day starts again from nothing');
await db.query(`update public.study_ai_limits set per_day = 0 where kind = 'generate'`);
check(!(await svc('study_svc_take', ann, 'generate')).allowed, 'a limit of 0 switches a kind off');
await db.query(`update public.study_ai_limits set per_day = 150 where kind = 'chat'`);
await db.query(`update public.study_ai_limits set per_day = 40 where kind = 'generate'`);
const st = await rpc(ann, 'study_ai_status');
check(st.chat.limit === 150 && st.chat.used === 1 && st.chat.remaining === 149 && st.vision.used === 0 && st.vision.remaining === 30, 'the student can see how many they have left today');
let parallel = 0;
await db.query(`update public.study_ai_limits set per_day = 3 where kind = 'transcribe'`);
for (const r of await Promise.all(Array.from({ length: 6 }, () => svc('study_svc_take', bob, 'transcribe').catch(() => ({ allowed: false }))))) if (r.allowed) parallel++;
check(parallel === 3, 'even six requests at the same moment can never get more than the limit through');
await db.query(`update public.study_ai_limits set per_day = 60 where kind = 'transcribe'`);

section('3. Conversations');
await expectFail(() => rpc(ann, 'study_conv_create', bSubj, 'chat', '', ''), /not yours/, 'a chat cannot use someone else\'s subject');
await expectFail(() => rpc(ann, 'study_conv_create', null, 'dance', '', ''), /not known/, 'an unknown kind of chat is refused');
const c1 = await rpc(ann, 'study_conv_create', phys, 'chat', '  Newton  ', 'Laws of motion');
check(c1.title === 'Newton' && c1.subjectId === phys && c1.topic === 'Laws of motion' && c1.preview === '', 'a chat is made for a subject, with a topic');
const c2 = await rpc(ann, 'study_conv_create', null, 'teach', '', '');
const bc = await rpc(bob, 'study_conv_create', bSubj, 'chat', 'Bob\'s secret chat', '');
check((await rpc(ann, 'study_conv_list')).conversations.length === 2 && (await rpc(bob, 'study_conv_list')).conversations.length === 1, 'each student lists only their own chats');
check((await rpc(ann, 'study_conv_list', phys)).conversations.map((c) => c.id).join() === c1.id, 'a list can be limited to one subject');
for (let i = 0; i < 5; i++) await rpc(ann, 'study_conv_create', null, 'chat', `Extra ${i}`, '');
const page1 = await rpc(ann, 'study_conv_list', null, 3, null);
check(page1.conversations.length === 3 && page1.more === true, 'long lists are paged');
const page2 = await rpc(ann, 'study_conv_list', null, 3, page1.conversations[2].lastMessageAt);
check(page2.conversations.length >= 1 && page2.conversations.every((c) => !page1.conversations.some((p) => p.id === c.id)), 'and the next page continues after the first');
await expectFail(() => rpc(bob, 'study_conv_get', c1.id), /not found/, 'another student cannot open my chat by its id');
await expectFail(() => rpc(bob, 'study_conv_rename', c1.id, 'mine now'), /not found/, 'nor rename it');
check((await rpc(bob, 'study_conv_delete', c1.id)).deleted === false && (await q(`select 1 from public.study_conversations where id = $1`, [c1.id])).length === 1, 'nor delete it');
await expectFail(() => rpc(ann, 'study_conv_rename', c1.id, '   '), /write a name/, 'a chat needs a name');
check((await rpc(ann, 'study_conv_rename', c1.id, 'Newton\'s laws')).title === 'Newton\'s laws', 'a chat can be renamed');

const ctxChanged = await rpc(ann, 'study_conv_set_context', c2.id, phys, '  Waves  ');
check(ctxChanged.subjectId === phys && ctxChanged.topic === 'Waves', 'a student can change what a chat is about (subject and topic)');
await expectFail(() => rpc(ann, 'study_conv_set_context', c2.id, bSubj, ''), /not yours/, 'but only to one of their own subjects');
await expectFail(() => rpc(bob, 'study_conv_set_context', c2.id, bSubj, 'x'), /not found/, 'and only in their own chat');
check((await rpc(ann, 'study_conv_set_context', c2.id, null, '')).subjectId === null, 'the subject can be cleared');

section('4. What the server may know for one question');
await expectFail(() => svc('study_svc_context', bob, c1.id, null, ''), /not found/, 'the server will not build context for a chat that is not that student\'s');
for (let i = 0; i < 20; i++) await svc('study_svc_msg_user', ann, c1.id, `question ${i}`, '[]', ref()).then(() => svc('study_svc_msg_assistant', ann, c1.id, `answer ${i}`, '{}'));
let cx = await svc('study_svc_context', ann, c1.id, null, 'q');
check(cx.history.length === 16 && cx.history[0].role && cx.history[cx.history.length - 1].content === 'answer 19', 'the history is the latest 16 turns, oldest first (a long chat is never sent whole)');
check(cx.profile.displayName === 'Ann Lee' && cx.profile.language === 'hi' && cx.profile.level === 'class_12' && cx.profile.tutor.name === 'Nova' && cx.profile.board === 'CBSE', 'the profile the tutor needs is there');
check(cx.profile.email === undefined && cx.profile.userId === undefined && JSON.stringify(cx).indexOf('@users.nooob.xyz') < 0, 'but nothing private (no email, no account id)');
check(cx.subject.name === 'Physics' && cx.conversation.topic === 'Laws of motion', 'the chat\'s subject and topic are given');
check(cx.recentTopics.length >= 0 && !cx.recentTopics.includes('Newton\'s laws'), 'recent topics never include the current chat');
await rpc(ann, 'study_conv_rename', c2.id, 'Waves'); await svc('study_svc_msg_user', ann, c2.id, 'what is a wave', '[]', ref());
cx = await svc('study_svc_context', ann, c2.id, null, '');
check(cx.recentTopics.includes('Newton\'s laws'), 'with the student\'s permission, titles of their recent chats are given for continuity');
await rpc(ann, 'study_save_profile', J({ privacy: { useHistory: false } }), 4);
cx = await svc('study_svc_context', ann, c2.id, null, '');
check(cx.recentTopics.length === 0, 'but not when they switch "remember earlier chats" off');
await rpc(ann, 'study_save_profile', J({ privacy: { useHistory: true } }), 4);
check(!JSON.stringify(await svc('study_svc_context', ann, c1.id, null, '')).includes('secret'), 'nothing of another student ever appears');
const fresh = await mkUser('fresh');
cx = await svc('study_svc_context', fresh, null, null, '');
check(cx.profile === null && cx.history.length === 0 && cx.chunks.length === 0, 'a student who has not set up gets an empty (honest) context');

section('5. Saving a message, and sending it twice');
const conv = (await svc('study_svc_conv_create', ann, phys, 'chat', '', 'Gravity')).id;
const r1 = ref();
const m1 = await svc('study_svc_msg_user', ann, conv, '  Why do things fall?  ', '[]', r1);
check(m1.duplicate === false && m1.assistant === null && !!m1.id, 'the student\'s message is saved first');
check((await q(`select title from public.study_conversations where id = $1`, [conv]))[0].title === 'Gravity', 'a chat that already has a name keeps it');
const untitled = (await svc('study_svc_conv_create', ann, null, 'chat', '', '')).id;
await svc('study_svc_msg_user', ann, untitled, 'Explain photosynthesis in simple words please, I do not understand the light reaction at all', '[]', ref());
check((await q(`select title from public.study_conversations where id = $1`, [untitled]))[0].title.length === 60, 'an unnamed chat is named after the first question (kept short)');
const m1b = await svc('study_svc_msg_user', ann, conv, 'Why do things fall?', '[]', r1);
check(m1b.duplicate === true && m1b.id === m1.id && m1b.assistant === null && (await q(`select count(*)::int n from public.study_messages where conversation_id = $1`, [conv]))[0].n === 1, 'the same message sent again is saved once, and is reported as a repeat');
const a1 = await svc('study_svc_msg_assistant', ann, conv, 'Because of gravity.', J({ provider: 'groq', model: 'llama', mode: 'chat', secret: 'x', evil: { a: 1 } }));
const m1c = await svc('study_svc_msg_user', ann, conv, 'Why do things fall?', '[]', r1);
check(m1c.duplicate === true && m1c.assistant.content === 'Because of gravity.' && m1c.assistant.id === a1.id, 'once answered, sending it again returns the saved answer (the AI is not asked twice)');
const meta = (await q(`select meta from public.study_messages where id = $1`, [a1.id]))[0].meta;
check(meta.provider === 'groq' && meta.model === 'llama' && meta.secret === undefined && meta.evil === undefined, 'only known notes are kept with an answer');
await expectFail(() => svc('study_svc_msg_user', bob, conv, 'hi', '[]', ref()), /not found/, 'nobody can add to another student\'s chat');
await expectFail(() => svc('study_svc_msg_assistant', bob, conv, 'hi', '{}'), /not found/, 'nor answer into it');
await expectFail(() => svc('study_svc_msg_user', ann, conv, 'x'.repeat(4001), '[]', ref()), /4000/, 'a message over 4000 characters is refused');
await expectFail(() => svc('study_svc_msg_user', ann, conv, '   ', '[]', ref()), /write your question/, 'an empty message is refused');
check((await svc('study_svc_msg_user', ann, conv, '', J([{ key: `${ann}/chat/a.jpg` }]), ref())).duplicate === false, 'a picture alone is a valid message');
await expectFail(() => svc('study_svc_msg_user', ann, conv, 'hi', J([{ key: `${bob}/chat/a.jpg` }]), ref()), /not yours/, 'a picture from someone else\'s folder is refused');
await expectFail(() => svc('study_svc_msg_user', ann, conv, 'hi', J([{ key: `${ann}/../${bob}/a.jpg` }]), ref()), /not yours/, 'a path trick is refused');
await expectFail(() => svc('study_svc_msg_user', ann, conv, 'hi', J(Array.from({ length: 5 }, (_, i) => ({ key: `${ann}/chat/${i}.jpg` }))), ref()), /up to 4/, 'at most four pictures per message');

section('6. Opening, paging and deleting a chat');
const got = await rpc(ann, 'study_conv_get', c1.id, 5, null);
check(got.messages.length === 5 && got.more === true && got.messages[4].content === 'answer 19' && got.messages[0].createdAt <= got.messages[4].createdAt, 'a chat opens at its newest messages (oldest of those first), with a sign that there are more');
const older = await rpc(ann, 'study_conv_get', c1.id, 5, got.messages[0].createdAt);
check(older.messages.length === 5 && older.messages.every((m) => m.createdAt < got.messages[0].createdAt), 'and the page before it can be fetched');
const withPic = (await svc('study_svc_conv_create', ann, null, 'photo', 'Photo', '')).id;
await svc('study_svc_msg_user', ann, withPic, 'solve', J([{ key: `${ann}/chat/a.jpg` }, { key: `${ann}/chat/b.png` }]), ref());
const del = await rpc(ann, 'study_conv_delete', withPic);
check(del.deleted === true && del.files.length === 2 && del.files.includes(`${ann}/chat/a.jpg`), 'deleting a chat lists its pictures, for the app to delete');
check((await q(`select count(*)::int n from public.study_messages where conversation_id = $1`, [withPic]))[0].n === 0, 'and its messages are gone');
check((await rpc(ann, 'study_conv_delete', withPic)).deleted === false, 'deleting it again is harmless');

section('7. The private store for pictures');
check((await q(`select public from storage.buckets where id = 'study'`))[0].public === false, 'the "study" store is private');
await asUser(db, ann, async () => db.query(`insert into storage.objects (bucket_id, name) values ('study', $1)`, [`${ann}/chat/mine.jpg`]));
check(true, 'a student can add a file in their own folder');
await expectFail(() => asUser(db, ann, async () => db.query(`insert into storage.objects (bucket_id, name) values ('study', $1)`, [`${bob}/chat/sneaky.jpg`])), /row-level security/, 'not in someone else\'s folder');
await expectFail(() => asUser(db, ann, async () => db.query(`insert into storage.objects (bucket_id, name) values ('study', 'loose.jpg')`)), /row-level security/, 'nor loose at the top');
await db.query(`insert into storage.objects (bucket_id, name) values ('study', $1)`, [`${bob}/chat/bobs.jpg`]);
const seen = (await asUser(db, ann, async () => db.query(`select name from storage.objects where bucket_id = 'study'`))).rows.map((r) => r.name);
check(seen.length === 1 && seen[0] === `${ann}/chat/mine.jpg`, 'a student sees only their own files');
await asUser(db, ann, async () => db.query(`delete from storage.objects where bucket_id = 'study' and name = $1`, [`${bob}/chat/bobs.jpg`]));
check((await q(`select 1 from storage.objects where name = $1`, [`${bob}/chat/bobs.jpg`])).length === 1, 'and cannot delete anybody else\'s');
await asUser(db, ann, async () => db.query(`delete from storage.objects where bucket_id = 'study' and name = $1`, [`${ann}/chat/mine.jpg`]));
check((await q(`select 1 from storage.objects where name = $1`, [`${ann}/chat/mine.jpg`])).length === 0, 'but can delete their own');

section('8. Deleting one\'s own study data covers the chats');
const dd = await mkUser('dd');
const ds = await rpc(dd, 'study_set_subjects', J(['Maths']));
const dc = (await svc('study_svc_conv_create', dd, null, 'chat', 'Mine', '')).id;
await svc('study_svc_msg_user', dd, dc, 'hello', J([{ key: `${dd}/chat/p.jpg` }]), ref());
await svc('study_svc_take', dd, 'chat');
let wipe = await rpc(dd, 'study_delete_my_data', 'conversations');
check(wipe.removedFiles.includes(`${dd}/chat/p.jpg`) && (await q(`select count(*)::int n from public.study_conversations where user_id = $1`, [dd]))[0].n === 0, 'deleting only the chats removes the chats and lists their pictures');
check((await rpc(dd, 'study_me')).subjects.length === 1, 'and leaves the rest');
await svc('study_svc_conv_create', dd, null, 'chat', 'Again', '');
wipe = await rpc(dd, 'study_delete_my_data', 'all');
check((await q(`select count(*)::int n from public.study_conversations where user_id = $1`, [dd]))[0].n === 0 && (await q(`select count(*)::int n from public.study_ai_usage where user_id = $1`, [dd]))[0].n === 0, 'deleting everything removes the chats and the usage counts too');
check((await rpc(bob, 'study_conv_list')).conversations.length === 1, 'and nobody else\'s chats');

section('9. No function replaces an older one by accident');
const dir = 'supabase/migrations';
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const defs = (text) => [...text.matchAll(/create or replace function public\.(\w+)\s*\(([^)]*)\)/gi)].map((m) => `${m[1]}(${m[2].replace(/\s+default\s+[^,]+/gi, '').split(',').map((a) => a.trim().split(/\s+/).slice(1).join(' ').toLowerCase()).filter(Boolean).join(',')})`);
const earlier = new Set();
for (const f of files.filter((x) => x < '20261014000002')) for (const d of defs(fs.readFileSync(`${dir}/${f}`, 'utf8'))) earlier.add(d);
const intended = new Set(['study_delete_my_data(text)']);   // redefined on purpose: it now covers the chats too
const clashes = defs(fs.readFileSync(`${dir}/20261014000002_noob_study_ai.sql`, 'utf8')).filter((d) => earlier.has(d) && !intended.has(d));
check(clashes.length === 0, 'every new function has a new name (only study_delete_my_data is redefined, on purpose)', clashes.join('; '));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
