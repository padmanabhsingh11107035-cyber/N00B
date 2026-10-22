// Can a normal, logged-in person promote themselves by editing their own rows directly (what anybody with the public key and their own login can do, without using the app)?
// On a REAL Postgres (PGlite) with every migration applied. Each attempt below is made AS that person, with row-level security on, and the value is read back afterwards.
// Usage: node --liftoff-only scripts/supabase/test-privilege-escalation-db.mjs
import { createTestDb, asUser } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const db = await createTestDb();
const mkUser = async (name) => {
  const id = (await db.query(`select gen_random_uuid() as id`)).rows[0].id;
  await db.query(`insert into auth.users (id, email, encrypted_password) values ($1, $2, extensions.crypt('secret pass', extensions.gen_salt('bf')))`, [id, `${name}@users.nooob.xyz`]);
  if (!(await db.query(`select 1 from public.profiles where id = $1`, [id])).rows.length) await db.query(`insert into public.profiles (id, username, display_name) values ($1, $2, $3)`, [id, name, name]);
  await db.query(`insert into public.profile_private (user_id, email) values ($1, $2) on conflict (user_id) do nothing`, [id, `${name}@example.com`]);
  return id;
};
const ann = await mkUser('ann'), bob = await mkUser('bob');
const profile = async (id) => (await db.query(`select * from public.profiles where id = $1`, [id])).rows[0];
// tries a write as `who`; true when the database REFUSED it or left the value unchanged
async function stays(who, table, col, value, where = 'id', target = who) {
  const before = (await db.query(`select ${col}::text as v from public.${table} where ${where} = $1`, [target])).rows[0]?.v;
  let refused = false;
  try { await asUser(db, who, async () => { await db.query(`update public.${table} set ${col} = $1 where ${where} = $2`, [value, target]); }); } catch { refused = true; }
  const after = (await db.query(`select ${col}::text as v from public.${table} where ${where} = $1`, [target])).rows[0]?.v;
  return refused || after === before;
}

section('1. A person editing their own profile row');
for (const [col, value] of [['is_admin', true], ['is_verified', true], ['verification_tier', 'gold'], ['noob_points', 999999999], ['pro_tier', 'max'], ['pro_renews_at', '2999-01-01'], ['is_suspended', false], ['is_ai', true], ['purchased_item_ids', '{"x"}'], ['followers_count', 123456], ['posts_count', 999], ['games_won_count', 999]]) {
  check(await stays(ann, 'profiles', col, value), `cannot set ${col} on their own profile`);
}
check((await asUser(db, ann, async () => { try { await db.query(`update public.profiles set bio = 'hello' where id = $1`, [ann]); return true; } catch { return false; } })) && (await profile(ann)).bio === 'hello', 'but can still change their own bio (the app keeps working)');

section('2. Somebody else\'s rows');
check(await stays(ann, 'profiles', 'bio', 'hacked', 'id', bob), 'cannot edit another person\'s profile');
check(await stays(ann, 'profiles', 'noob_points', 0, 'id', bob), 'cannot take another person\'s points');
check(await stays(ann, 'profile_private', 'email', 'x@evil.com', 'user_id', bob), 'cannot change another person\'s private details');
check((await asUser(db, ann, async () => (await db.query(`select * from public.profile_private where user_id = $1`, [bob])).rows.length)) === 0, 'cannot even read another person\'s private details (e-mail, phone, birthday)');
check((await asUser(db, ann, async () => (await db.query(`select * from public.profile_private`)).rows.length)) === 1, 'the private table shows a person only their own row');

section('3. Their own private details');
check(await stays(ann, 'profile_private', 'user_id', bob, 'user_id', ann), 'cannot hand their private row to somebody else');

section('4. Making points or rewards out of nothing');
const tables = (await db.query(`select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' and (table_name ~ '(ledger|transaction|wallet|payment|coupon|award|prize|reward|point)') order by 1`)).rows.map((r) => r.table_name);
let wrote = [];
for (const t of tables) {
  const cols = (await db.query(`select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema='public' and table_name=$1`, [t])).rows;
  // an insert with nothing but defaults and our own id where there is a user column: the point is whether the database lets an ordinary person write here at all
  const userCol = cols.find((c) => /^(user_id|owner_id|requester_id|payer_id|sender_id|creator_id)$/.test(c.column_name));
  if (!userCol) continue;
  try {
    await asUser(db, ann, async () => { await db.query(`insert into public.${t} (${userCol.column_name}) values ($1)`, [ann]); });
    wrote.push(t);
  } catch { /* refused (or missing required columns): fine */ }
}
check(wrote.length === 0, 'an ordinary person cannot insert into any of the ' + tables.length + ' money / reward / coupon tables', wrote.join(', '));
for (const fn of ['apply_points(uuid, bigint, text)', 'award_points(uuid, bigint, text)']) {
  const can = (await db.query(`select to_regprocedure($1) is not null as exists, coalesce(has_function_privilege('authenticated', to_regprocedure($1)::oid, 'execute'), false) as can`, [`public.${fn}`])).rows[0];
  check(!can.exists || !can.can, `${fn.split('(')[0]} (the function that adds points) cannot be called by a logged-in person`);
}

section('5. Posts and counters');
const post = (await db.query(`insert into public.posts (user_id, caption) values ($1, 'x') returning id`, [ann])).rows[0].id;
check(await stays(ann, 'posts', 'likes_count', 999999, 'id', post), 'cannot give their own post a million likes by editing the counter');
check(await stays(bob, 'posts', 'caption', 'hacked', 'id', post), 'cannot edit somebody else\'s post');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
