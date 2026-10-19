// Every deleted account is recorded (who it was, when, by whom) and a failing record can never stop a deletion. On a REAL Postgres (PGlite) with every migration applied.
// Usage: node --liftoff-only scripts/supabase/test-account-deletion-log-db.mjs
import fs from 'node:fs';
import { createTestDb, asUser } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const db = await createTestDb();
const mkUser = async (name, email) => {
  const id = (await db.query(`select gen_random_uuid() as id`)).rows[0].id;
  await db.query(`insert into auth.users (id, email, encrypted_password) values ($1, $2, extensions.crypt('secret pass', extensions.gen_salt('bf')))`, [id, `${name}@users.nooob.xyz`]);
  if (!(await db.query(`select 1 from public.profiles where id = $1`, [id])).rows.length) await db.query(`insert into public.profiles (id, username, display_name) values ($1, $2, $3)`, [id, name, `${name} Display`]);
  await db.query(`insert into public.profile_private (user_id, email, mobile_number, date_of_birth) values ($1, $2, '9876543210', '2000-01-01') on conflict (user_id) do update set email = excluded.email, mobile_number = excluded.mobile_number, date_of_birth = excluded.date_of_birth`, [id, email]);
  await db.query(`update public.profiles set pro_tier = 'pro' where id = $1`, [id]).catch(() => undefined);
  return id;
};
const asClaim = async (uid, fn) => { await db.exec(`select set_config('request.jwt.claim.sub', '${uid}', false)`); try { return await fn(); } finally { await db.exec(`select set_config('request.jwt.claim.sub', '', false)`); } };
const rows = async (name) => (await db.query(`select * from public.account_deletions where username = $1 order by deleted_at`, [name])).rows;
const exists = async (id) => (await db.query(`select (select count(*) from auth.users where id = $1)::int u, (select count(*) from public.profiles where id = $1)::int p`, [id])).rows[0];

section('1. A person deletes their own account');
const ann = await mkUser('ann', 'anaybopche@gmail.com');
await asUser(db, ann, async () => db.query(`select public.create_post($1::jsonb, 'hello') as r`, [JSON.stringify([{ objectKey: 'posts/a.jpg', mediaType: 'image' }])]));
await asUser(db, ann, async () => db.query(`select public.create_reel('reels/a.mp4', '', 'r') as r`));
await asUser(db, ann, async () => db.query(`select public.delete_my_account('secret pass') as r`));
let r = await rows('ann');
check(r.length === 1 && r[0].how === 'self', 'it is recorded as "self"', JSON.stringify(r));
check(r[0] && r[0].display_name === 'ann Display' && r[0].had_profile === true && r[0].user_id === ann && r[0].deleted_by === ann && r[0].deleted_by_username === 'ann', 'with who it was and who deleted it');
check(r[0] && r[0].email_hint === 'an***@gmail.com' && !JSON.stringify(r[0]).includes('anaybopche') && !JSON.stringify(r[0]).includes('9876543210') && !JSON.stringify(r[0]).includes('2000'), 'the email is hidden down to two letters and the domain; no phone number, no date of birth');
check(r[0] && r[0].posts_count === 1 && r[0].reels_count === 1 && r[0].signed_up_at && r[0].deleted_at, 'and how much they had made, when they signed up and when they left');
const gone = await exists(ann);
check(gone.u === 0 && gone.p === 0, 'the account is really deleted (login and profile)');

section('2. An admin deletes an account');
const bob = await mkUser('bob', 'bobby@example.com'), boss = await mkUser('bossadmin', 'boss@example.com');
await asClaim(boss, async () => db.query(`delete from auth.users where id = $1`, [bob]));
r = await rows('bob');
check(r.length === 1 && r[0].how === 'admin' && r[0].deleted_by === boss && r[0].deleted_by_username === 'bossadmin', 'it is recorded as "admin", with which admin');

section('3. Deleted straight in the database');
const cat = await mkUser('cat', 'cat@example.com');
await db.query(`delete from auth.users where id = $1`, [cat]);
r = await rows('cat');
check(r.length === 1 && r[0].how === 'system' && r[0].deleted_by === null, 'it is recorded as "system" (nobody signed in did it)');

section('4. A Google login that never got a profile');
const gid = (await db.query(`select gen_random_uuid() as id`)).rows[0].id;
await db.query(`insert into auth.users (id, email) values ($1, 'kartavya.rao@gmail.com')`, [gid]);
await db.query(`delete from auth.users where id = $1`, [gid]);
r = (await db.query(`select * from public.account_deletions where user_id = $1`, [gid])).rows;
check(r.length === 1 && r[0].had_profile === false && r[0].username === null && r[0].email_hint === 'ka***@gmail.com', 'it is recorded too, marked "had no profile", so you can tell it was never finished');

section('5. A failing record never blocks a deletion');
const dan = await mkUser('dan', 'dan@example.com');
await db.exec(`alter table public.account_deletions add constraint boom check (false) not valid`);
let blocked = '';
try { await asClaim(dan, async () => db.query(`delete from auth.users where id = $1`, [dan])); } catch (e) { blocked = e.message; }
await db.exec(`alter table public.account_deletions drop constraint boom`);
const d = await exists(dan);
check(!blocked && d.u === 0 && d.p === 0, 'even when the record cannot be written, the account is still deleted', blocked);
check((await rows('dan')).length === 0, '(and nothing half-written is left behind)');

section('6. Private, and safe to run twice');
let denied = 0;
for (const sql of [`select * from public.account_deletions`, `select public.log_account_deletion()`]) {
  try { await asUser(db, boss, async () => db.query(sql)); } catch (e) { if (/permission denied/i.test(e.message)) denied++; }
}
check(denied === 2, 'no signed-in person (not even by the app) can read the log or call the function');
await db.query(`insert into public.admin_audit_log (actor_id, actor_name, action, target_id, target_name, details, created_at) values ($1, 'NOOB', 'account_deleted', null, 'ichha18', '{"username":"ichha18"}', '2026-10-15 17:50:40+00')`, [boss]);
const sql = fs.readFileSync('supabase/migrations/20261019000002_account_deletion_log.sql', 'utf8');
await db.exec(sql);
await db.exec(sql);
const old = (await db.query(`select * from public.account_deletions where username = 'ichha18'`)).rows;
check(old.length === 1 && old[0].how === 'admin' && old[0].deleted_by_username === 'NOOB', 'earlier admin deletions from the admin log are copied in, once, however many times it is run');
check((await db.query(`select count(*)::int n from pg_trigger where tgname = 'log_account_deletion' and not tgisinternal`)).rows[0].n === 1, 'there is exactly one trigger');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
