// Tests migration 20261114000006: a deleted account leaves nothing behind (profile, followers/following lists, counters), the clean-up of accounts that were already
// left over works (and is a no-op the second time), and the safety limits hold. On a REAL Postgres (PGlite) with every migration applied.
// Usage: node --liftoff-only scripts/supabase/test-deleted-accounts-cleanup.mjs
import fs from 'node:fs';
import { createTestDb, asUser } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const db = await createTestDb();
const mkUser = async (name) => {
  const id = (await db.query(`select gen_random_uuid() as id`)).rows[0].id;
  await db.query(`insert into auth.users (id, email, encrypted_password) values ($1, $2, extensions.crypt('secret pass', extensions.gen_salt('bf')))`, [id, `${name}@users.nooob.xyz`]);
  if (!(await db.query(`select 1 from public.profiles where id = $1`, [id])).rows.length) await db.query(`insert into public.profiles (id, username, display_name) values ($1, $2, $2)`, [id, name]);
  return id;
};
const follow = (a, b) => db.query(`insert into public.follows (follower_id, followee_id) values ($1, $2) on conflict do nothing`, [a, b]);
const one = async (sql, p = []) => (await db.query(sql, p)).rows[0];
const counts = async (id) => one(`select followers_count f, following_count g from public.profiles where id = $1`, [id]);
const people = async (as) => (await asUser(db, as, async () => db.query(`select public.search_users('') as r`))).rows[0].r.map((u) => u.id);
const leftovers = async (id) => (await one(`select
  (select count(*) from public.follows where follower_id = $1 or followee_id = $1)::int follows,
  (select count(*) from public.follow_requests where requester_id = $1 or target_id = $1)::int reqs,
  (select count(*) from public.notifications where actor_id = $1 or target_user_id = $1)::int notifs,
  (select count(*) from public.chat_members where user_id = $1)::int members,
  (select count(*) from public.profiles where id = $1)::int profiles,
  (select count(*) from auth.users where id = $1)::int logins`, [id]));

const noob = await mkUser('noob');
await db.query(`update public.profiles set is_admin = true where id = $1`, [noob]);
const a = await mkUser('alice'), b = await mkUser('bella'), c = await mkUser('carl'), d = await mkUser('dora'), e = await mkUser('erin');

section('1. Deleting your own account removes you everywhere');
await follow(a, b); await follow(b, a); await follow(b, c); await follow(c, b); await follow(a, c); await follow(d, b);
await db.query(`insert into public.follow_requests (requester_id, target_id) values ($1, $2)`, [e, b]);
await db.query(`insert into public.notifications (target_user_id, actor_id, type, message) values ($1, $2, 'follow', 'bella followed you')`, [a, b]);
const chat = (await one(`insert into public.chats (name, is_group, creator_id) values ('g', true, $1) returning id`, [b])).id;
await db.query(`insert into public.chat_members (chat_id, user_id) values ($1, $2), ($1, $3)`, [chat, a, b]);
await db.query(`insert into public.messages (chat_id, sender_id, text) values ($1, $2, 'hello from bella')`, [chat, b]);
await db.query(`insert into public.chat_mute_until (user_id, chat_id, until) values ($1, $2, now() + interval '1 day')`, [b, chat]).catch(() => undefined);
check((await counts(a)).f === 1 && (await counts(c)).f === 2 && (await counts(b)).f === 3, 'before: counts are as seeded');
check((await people(a)).includes(b), 'before: bella is in the people list');

await asUser(db, b, async () => db.query(`select public.delete_my_account('secret pass') as r`));
let l = await leftovers(b);
check(l.profiles === 0 && l.logins === 0, 'bella: login and profile are gone');
check(l.follows === 0 && l.reqs === 0 && l.notifs === 0 && l.members === 0, 'no follows (either direction), requests, notifications or chat memberships left', JSON.stringify(l));
check((await counts(a)).f === 0 && (await counts(a)).g === 1 && (await counts(c)).f === 1 && (await counts(c)).g === 0 && (await counts(d)).g === 0, 'everybody else\'s followers / following counts are correct');
check(!(await people(a)).includes(b), 'bella is no longer in anybody\'s people list');
const m = await one(`select count(*)::int n, count(sender_id)::int s from public.messages where text = 'hello from bella'`);
check(m.n === 1 && m.s === 0, 'her message stays (name blanked) exactly as the old flow did');
check((await one(`select count(*)::int n from public.chat_mute_until where user_id = $1`, [b])).n === 0, 'her chat mute settings are gone');

section('2. The administrator deletes one account, then several');
await follow(a, c); await follow(c, a); await follow(d, c);
await asUser(db, noob, async () => db.query(`select public.admin_delete_user($1, 'secret pass') as r`, [c]));
l = await leftovers(c);
check(l.profiles === 0 && l.logins === 0 && l.follows === 0, 'carl is gone with every follow');
check((await counts(a)).f === 0 && (await counts(a)).g === 0 && (await counts(d)).g === 0, 'counts of alice and dora are correct');
await follow(d, e); await follow(e, d); await follow(a, e);
await asUser(db, noob, async () => db.query(`select public.admin_bulk_delete_users($1::uuid[], 'secret pass') as r`, [[e]]));
l = await leftovers(e);
check(l.profiles === 0 && l.follows === 0 && l.reqs === 0, 'bulk delete: erin is gone with every follow');
check((await counts(d)).f === 0 && (await counts(d)).g === 0 && (await counts(a)).g === 0, 'counts correct after the bulk delete');
check(!(await people(a)).includes(e) && !(await people(a)).includes(c), 'neither shows up in people lists');

section('3. A login that is only SOFT-deleted (the profile used to stay)');
const f = await mkUser('fred'), g = await mkUser('gina');
await follow(a, f); await follow(f, g); await follow(g, f);
check((await counts(a)).g === 1, 'alice follows fred');
await db.query(`update auth.users set deleted_at = now() where id = $1`, [f]);
l = await leftovers(f);
check(l.profiles === 0 && l.follows === 0, 'the profile and all follows are removed at once');
check((await counts(a)).g === 0 && (await counts(g)).f === 0 && (await counts(g)).g === 0, 'counts of the others are correct');
check((await one(`select count(*)::int n from public.deleted_accounts_cleanup_backup where user_id = $1`, [f])).n === 1, 'and a backup copy of the profile row was kept for you');

section('4. Clean-up of accounts that were ALREADY left over (login missing / soft-deleted)');
const h = await mkUser('hugo'), i = await mkUser('iris'), j = await mkUser('jack'), k = await mkUser('kate');
await follow(a, h); await follow(h, a); await follow(i, a); await follow(a, i); await follow(j, a); await follow(k, a);
await db.query(`insert into public.follow_requests (requester_id, target_id) values ($1, $2)`, [h, g]);
// simulate the old state: remove the logins WITHOUT the cascade (session_replication_role = replica switches triggers and FK actions off)
await db.exec(`set session_replication_role = replica`);
await db.query(`delete from auth.users where id = $1`, [h]);                                   // login missing
await db.query(`update auth.users set deleted_at = now() where id = $1`, [i]);                // login soft-deleted (trigger is off in replica mode: row stays)
await db.exec(`set session_replication_role = origin`);
check((await one(`select count(*)::int n from public.profiles where id = any($1::uuid[])`, [[h, i]])).n === 2, 'seeded: two orphan profiles with follows still exist');
check((await people(a)).filter((x) => x === h || x === i).length === 0, 'they are already hidden from the people lists (belt and braces)');
check((await one(`select count(*)::int n from public.profiles where id = any($1::uuid[])`, [[j, k]])).n === 2, 'real, active people are present');
const dry = await one(`select public.purge_gone_accounts(true) as r`);
check(dry.r.dryRun === true && dry.r.gone === 2 && (await one(`select count(*)::int n from public.profiles where id = any($1::uuid[])`, [[h, i]])).n === 2, 'dry run reports 2 and changes nothing', JSON.stringify(dry.r));
const run = await one(`select public.purge_gone_accounts(false) as r`);
check(run.r.success === true && run.r.purged === 2 && run.r.skipped.length === 0, 'real run purges exactly those two', JSON.stringify(run.r));
check((await one(`select count(*)::int n from public.profiles where id = any($1::uuid[])`, [[h, i]])).n === 0, 'their profiles are gone');
check((await leftovers(h)).follows === 0 && (await leftovers(i)).follows === 0 && (await leftovers(h)).reqs === 0, 'and every follow / request of theirs');
check((await counts(a)).f === 2 && (await counts(a)).g === 0, 'alice\'s counts recomputed from the real rows (followed by jack and kate)', JSON.stringify(await counts(a)));
check((await one(`select count(*)::int n from public.profiles where id = any($1::uuid[])`, [[a, j, k, g, d, noob]])).n === 6, 'nobody else was touched (including the admin)');
check((await one(`select count(*)::int n from public.deleted_accounts_cleanup_backup where user_id = any($1::uuid[])`, [[h, i]])).n === 2, 'both were backed up first');
const again = await one(`select public.purge_gone_accounts(false) as r`);
check(again.r.gone === 0 && again.r.purged === 0, 'running it again does nothing');

section('5. Safety limits and who may run it');
const x1 = await mkUser('xo1'), x2 = await mkUser('xo2'), x3 = await mkUser('xo3');
await db.exec(`set session_replication_role = replica`);
await db.query(`delete from auth.users where id = any($1::uuid[])`, [[x1, x2, x3]]);
await db.exec(`set session_replication_role = origin`);
const lim = await one(`select public.purge_gone_accounts(false, 2) as r`);
check(lim.r.aborted === true && (await one(`select count(*)::int n from public.profiles where id = any($1::uuid[])`, [[x1, x2, x3]])).n === 3, 'more than the limit: it refuses and changes nothing');
const ok = await one(`select public.purge_gone_accounts(false, 3) as r`);
check(ok.r.purged === 3, 'with an explicit higher limit it proceeds');
const adminProfile = await one(`select public.account_is_gone($1) as r`, [noob]);
check(adminProfile.r === false, 'an administrator is never "gone"');
let denied = 0;
for (const sql of [`select public.purge_gone_accounts(true)`, `select public.gone_account_ids()`, `select * from public.deleted_accounts_cleanup_backup`]) {
  try { await asUser(db, a, async () => db.query(sql)); } catch (err) { if (/permission denied/i.test(err.message)) denied++; }
}
check(denied === 3, 'no signed-in member can run the clean-up, list the ids or read the backup');

section('6. Preview file is read-only');
const preview = fs.readFileSync(new URL('../../supabase/one-off/deleted-accounts-preview.sql', import.meta.url), 'utf8').replace(/--.*$/gm, '');
check(!/\b(insert|update|delete|drop|alter|create|truncate|grant|revoke)\b/i.test(preview), 'only SELECTs');
const parts = preview.split(/;\s*(?:\n|$)/).map((s) => s.trim()).filter(Boolean);
let okParts = 0;
for (const sql of parts) { try { await db.query(sql); okParts++; } catch (err) { console.log('   ', err.message); } }
check(okParts === parts.length && parts.length === 4, 'all four preview queries run', `${okParts}/${parts.length}`);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
