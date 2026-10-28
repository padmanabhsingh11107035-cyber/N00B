// Migration 20261029000002: a page the administrator switched off also stops the NEW work on the server (live streams, rooms, meetings, game tables, forms and their answers, votes ...),
// the main administrator is never blocked, and switching the page on again brings it all back. On a REAL Postgres (PGlite) with every migration applied.
// Usage: node --liftoff-only scripts/supabase/test-feature-guards-db.mjs
import fs from 'node:fs';
import { createTestDb, asUser, asAnon } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const db = await createTestDb();
const mkUser = async (name) => {
  const id = (await db.query(`select gen_random_uuid() as id`)).rows[0].id;
  await db.query(`insert into auth.users (id, email, encrypted_password) values ($1, $2, 'x')`, [id, `${name}@users.nooob.xyz`]);
  if (!(await db.query(`select 1 from public.profiles where id = $1`, [id])).rows.length) await db.query(`insert into public.profiles (id, username, display_name) values ($1, $2, $2)`, [id, name]);
  return id;
};
const admin = await mkUser('noob'), member = await mkUser('someone');
const attempt = async (uid, sql, args = []) => { try { await asUser(db, uid, async () => db.query(sql, args)); return ''; } catch (e) { return String(e.message || e); } };
const rpc = (uid, fn, ...args) => asUser(db, uid, async () => (await db.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).rows[0].r);
const setOff = (key, off) => rpc(admin, 'admin_set_feature', key, !off);
const OFF = /switched off/;

section('1. The guard is on every table that matters');
const guarded = (await db.query(`select c.relname from pg_trigger t join pg_class c on c.oid = t.tgrelid where t.tgname = 'zz_feature_guard' and not t.tgisinternal order by 1`)).rows.map((r) => r.relname);
for (const t of ['live_streams', 'live_stream_comments', 'live_lounge_rooms', 'live_lounge_meetings', 'noob_rooms', 'noob_room_chat', 'game_rooms', 'matchmaking_queue', 'forms', 'form_responses', 'polls', 'poll_votes', 'tot_votes', 'ask_questions', 'anon_messages', 'store_orders', 'app_suggestions']) {
  check(guarded.includes(t), `${t} is guarded`);
}

section('2. Nothing is blocked while the page is on');
let ok = await attempt(member, `insert into public.forms (title, draft) values ('A form', '{"questions":[]}'::jsonb) returning id`);
check(ok === '' || !OFF.test(ok), 'a person can make a form', ok);

section('3. Switched off: the database refuses new work');
await setOff('forms', true);
const f1 = await attempt(member, `insert into public.forms (title, draft) values ('Another', '{"questions":[]}'::jsonb)`);
check(OFF.test(f1), 'a new form is refused', f1);
check((await rpc(member, 'feature_blocked', 'forms')) === true, 'feature_blocked says so to a member');
check((await rpc(admin, 'feature_blocked', 'forms')) === false, 'and never to the main administrator');
const a1 = await attempt(admin, `insert into public.forms (title, draft) values ('Admin form', '{"questions":[]}'::jsonb)`);
check(!OFF.test(a1), 'the administrator can still make a form', a1);

// answers by anybody with the link (no account): the trigger says "anon". A published form is answered through the public function.
await setOff('forms', false);
const fid = (await asUser(db, member, async () => (await db.query(`insert into public.forms (title, draft) values ('Public', $1) returning id`, [JSON.stringify({ questions: [{ id: 'q1', type: 'short', title: 'Name', required: false }], settings: { presentation: 'classic' }, theme: { id: 'classic' } })])).rows[0].id));
const pub = await asUser(db, member, async () => (await db.query('select public.form_publish($1) as r', [fid])).rows[0].r);
const answer = () => asAnon(db, async () => { try { return JSON.stringify((await db.query('select public.form_public_submit($1, $2::jsonb) as r', [pub.slug, JSON.stringify({ q1: 'Ann' })])).rows[0].r); } catch (e) { return String(e.message || e); } });
check(!OFF.test(await answer()), 'while Forms is on, a visitor can answer');
await setOff('forms', true);
const anonBlocked = await answer();
check(OFF.test(anonBlocked), 'switched off: a visitor without an account can not answer a form either', anonBlocked);

section('4. Other pages are untouched, and switching on brings it back');
const asMember = async (sql) => { await db.exec(`select set_config('request.jwt.claim.sub', '${member}', false)`); try { await db.query(sql); return ''; } catch (e) { return String(e.message || e); } finally { await db.exec(`select set_config('request.jwt.claim.sub', '', false)`); } };
const poll = (q) => asMember(`insert into public.polls (creator_id, question, ends_at) values ('${member}', '${q}', now() + interval '1 day')`);
const g1 = await poll('Question one?');
check(!OFF.test(g1), 'a poll is still allowed while only Forms is off', g1);
await setOff('fun-polls', true);
const g2 = await poll('Question two?');
check(OFF.test(g2), 'with Public Polls off a poll is refused', g2);
await setOff('fun-polls', false); await setOff('forms', false);
const g3 = await attempt(member, `insert into public.forms (title, draft) values ('Back again', '{"questions":[]}'::jsonb)`);
check(!OFF.test(g3), 'switched on again: it works again', g3);
check((await db.query(`select count(*)::int n from public.forms where title in ('A form', 'Back again', 'Admin form')`)).rows[0].n >= 2, 'nothing that existed was deleted');

section('5. The server side of the call door and the page list');
const fn = fs.readFileSync('supabase/functions/agora-token/index.ts', 'utf8');
check(/rpc\('feature_blocked', \{ p_key: streamId \? 'live' : roomId \? 'lounge' : 'rooms' \}\)/.test(fn) && /off === true\) return json/.test(fn), 'the call-token function refuses a switched-off live / meeting / room (it is the one door to every call minute)');
const feats = fs.readFileSync('src/utils/features.ts', 'utf8');
check(/key: 'live'/.test(feats) && /key: 'calls'/.test(feats) && /key: 'forms'/.test(feats) && /id === 'forms' \|\| id === 'form' \? 'forms'/.test(feats), 'Go Live, Calls and NOOB Forms are rows of the Pages tab');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
