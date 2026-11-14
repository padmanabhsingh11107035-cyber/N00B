// Tests migration 20261114000014 (clean-up of old READ notifications) on a real Postgres (PGlite).
// Only a notification that is older than 90 days, addressed to one person, read by that person, not a pending request and not a scratch-card reward may go - at most 500 per run -
// and nothing in any other table. record_visit still counts visits exactly as before.
// Usage: node --liftoff-only scripts/supabase/test-notification-cleanup.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createTestDb, asUser, asAnon, MIGRATIONS_DIR } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const migSql = fs.readFileSync(path.join(MIGRATIONS_DIR, '20261114000014_notification_cleanup.sql'), 'utf8');

const db = await createTestDb({ upTo: '20261114000013_storage_per_person.sql' });
const mkUser = async (name) => {
  const id = (await db.query('select gen_random_uuid() as id')).rows[0].id;
  await db.query(`insert into auth.users (id, email, encrypted_password) values ($1, $2, 'x')`, [id, `${name}@users.nooob.xyz`]);
  if (!(await db.query('select 1 from public.profiles where id = $1', [id])).rows.length) await db.query(`insert into public.profiles (id, username, display_name) values ($1, $2, $3)`, [id, name, `${name} Display`]);
  return id;
};
const ann = await mkUser('ann'), bob = await mkUser('bob');
const note = async (target, ageDays, { type = 'like', status = null, data = {}, readBy = [] } = {}) => {
  const id = (await db.query(`insert into public.notifications (target_user_id, actor_id, type, title, action_status, data, created_at) values ($1, $2, $3, 't', $4, $5::jsonb, now() - $6 * interval '1 day') returning id`, [target, bob, type, status, JSON.stringify(data), ageDays])).rows[0].id;
  for (const r of readBy) await db.query(`insert into public.notification_reads (notification_id, user_id) values ($1, $2)`, [id, r]);
  return id;
};
// the ones that must go
const oldRead = await note(ann, 100, { readBy: [ann] });
const oldReadMsg = await note(ann, 400, { type: 'new_message', readBy: [ann] });
const oldAccepted = await note(ann, 120, { status: 'accepted', readBy: [ann] });
// the ones that must stay
const oldUnread = await note(ann, 500);
const young = await note(ann, 89, { readBy: [ann] });
const youngish = await note(ann, 60, { readBy: [ann] });
const broadcast = await note(null, 300, { readBy: [ann] });                  // a shared announcement, read by ann
const readByOther = await note(ann, 200, { readBy: [bob] });                  // read by somebody else, not by its owner
const pending = await note(ann, 200, { status: 'pending', readBy: [ann] });  // a follow request still waiting
const reward = await note(ann, 200, { data: { scratchCardId: 'abc' }, readBy: [ann] });
const goes = [oldRead, oldReadMsg, oldAccepted], stays = [oldUnread, young, youngish, broadcast, readByOther, pending, reward];

// the other tables the rule must never touch
const tables = ['messages', 'chats', 'chat_members', 'posts', 'reels', 'comments', 'profiles', 'follows', 'store_orders', 'noob_transactions', 'admin_audit_log', 'notification_clears'];
const exist = [];
for (const t of tables) if ((await db.query(`select to_regclass('public.${t}') r`)).rows[0].r) exist.push(t);
const counts = async () => JSON.stringify(await Promise.all(exist.map(async (t) => (await db.query(`select count(*) n from public.${t}`)).rows[0].n)));
await db.query(`insert into public.chats (name, is_group, creator_id) values ('c', true, $1)`, [ann]);
const others0 = await counts();

section('1. the migration itself changes nothing');
const total0 = Number((await db.query('select count(*) n from public.notifications')).rows[0].n);
await db.exec(migSql);
await db.exec(migSql);
check(Number((await db.query('select count(*) n from public.notifications')).rows[0].n) === total0, 'applying it (twice) deletes nothing by itself');
check(await asUser(db, ann, () => db.query('select public.purge_old_read_notifications()')).then(() => false, () => true), 'nobody signed in can call the clean-up directly');
check(await asAnon(db, () => db.query('select public.purge_old_read_notifications()')).then(() => false, () => true), 'nor a visitor');

section('2. the rule');
const n = (await db.query('select public.purge_old_read_notifications() as n')).rows[0].n;
const left = new Set((await db.query('select id from public.notifications')).rows.map((r) => r.id));
check(n === 3, 'exactly the 3 qualifying notifications were deleted', String(n));
check(goes.every((id) => !left.has(id)), 'older than 90 days + addressed to one person + read by that person: gone (also an old read chat-message alert and an accepted request)');
check(!left.has(oldRead) && left.has(oldUnread), 'an unread notification stays, however old (500 days)');
check(left.has(young) && left.has(youngish), 'younger than 90 days: stays (89 and 60 days)');
check(left.has(broadcast), 'a shared announcement stays (it belongs to everybody)');
check(left.has(readByOther), 'a notification read by somebody other than its owner stays');
check(left.has(pending), 'a request still waiting for an answer stays');
check(left.has(reward), 'a scratch-card reward stays');
check(stays.every((id) => left.has(id)), 'all 7 that must stay are still there');
check(others0 === (await counts()), `nothing else changed: ${exist.join(', ')}`);
check(Number((await db.query('select public.purge_old_read_notifications() as n')).rows[0].n) === 0, 'running it again deletes nothing more');

section('3. at most 500 per run');
await db.query(`insert into public.notifications (target_user_id, actor_id, type, title, created_at) select $1, $2, 'like', 't', now() - interval '200 days' - g * interval '1 second' from generate_series(1, 1200) g`, [bob, ann]);
await db.query(`insert into public.notification_reads (notification_id, user_id) select id, target_user_id from public.notifications where target_user_id = $1 and type = 'like' and created_at < now() - interval '150 days'`, [bob]);
const r1 = Number((await db.query('select public.purge_old_read_notifications() as n')).rows[0].n);
const r2 = Number((await db.query('select public.purge_old_read_notifications() as n')).rows[0].n);
const r3 = Number((await db.query('select public.purge_old_read_notifications() as n')).rows[0].n);
const r4 = Number((await db.query('select public.purge_old_read_notifications() as n')).rows[0].n);
check(r1 === 500 && r2 === 500 && r3 === 200 && r4 === 0, 'run 1 deletes 500, run 2 deletes 500, run 3 the last 200, run 4 nothing', `${r1} ${r2} ${r3} ${r4}`);
check(Number((await db.query(`select count(*) n from public.notifications where id = any($1::uuid[])`, [stays])).rows[0].n) === 7, 'the 7 that must stay survived the big run too');

section('4. it runs by itself with record_visit, and visits still count');
const def = (await db.query(`select pg_get_functiondef(p.oid) d from pg_proc p where p.proname = 'record_visit' and pronamespace = 'public'::regnamespace`)).rows[0].d;
check(/random\(\) < 0\.01/.test(def) && /perform public\.purge_old_read_notifications\(\)/.test(def), 'record_visit calls it inside the existing one-in-100 block');
check(/exception when others then\s+null;/.test(def), 'inside the same safety net: a failure is ignored and never gets in the way of opening the app');
await db.exec(`select setseed(0.5)`);
const old2 = await note(ann, 150, { readBy: [ann] });
let visits = 0;
for (let i = 0; i < 400; i++) { await db.query(`select public.record_visit($1, '{}'::jsonb)`, [`visitor-${String(i).padStart(4, '0')}`]); visits++; }
check(Number((await db.query(`select count(*) n from public.site_visits where visitor_id like 'visitor-%'`)).rows[0].n) === 400, 'all 400 visits were counted exactly as before');
check(!(new Set((await db.query('select id from public.notifications')).rows.map((r) => r.id))).has(old2), 'after enough visits the clean-up has run by itself and removed the old read notification');
const app = fs.readFileSync('src/services/supabaseApi.ts', 'utf8');
check(!/purge_old_read_notifications/.test(app), 'the app never calls the clean-up itself (it is only reachable through record_visit)');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
