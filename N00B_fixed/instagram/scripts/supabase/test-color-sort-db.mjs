// Color Sort ranking on the database: one row per player (the highest level cleared), levels one after the other and never faster than they can be played, and the board
// (everyone once, best first, you marked). On a REAL Postgres (PGlite) with every migration applied.
// Usage: node --liftoff-only scripts/supabase/test-color-sort-db.mjs
import { createTestDb, asUser } from './pg-test-env.mjs';

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
const rpc = async (uid, sql, args = []) => asUser(db, uid, async () => (await db.query(sql, args)).rows[0]?.r);
const fails = async (uid, sql, args = []) => { try { await rpc(uid, sql, args); return ''; } catch (e) { return String(e.message || e); } };
const done = (u, n) => rpc(u, `select public.color_sort_level_done($1) as r`, [n]);
const board = (u) => rpc(u, `select public.color_sort_leaderboard() as r`);
// pretend the last level was cleared a while ago, so the next one is not "too fast"
const age = (u) => db.query(`update public.color_sort_scores set updated_at = now() - interval '1 minute' where user_id = $1`, [u]);

const ann = await mkUser('ann'), bob = await mkUser('bob'), cat = await mkUser('cat');

section('1. A cleared level is saved');
let r = await done(ann, 1);
check(r.success && r.bestLevel === 1 && r.newBest === true, 'level 1 is the first best');
check(/too fast/.test(await fails(ann, `select public.color_sort_level_done(2) as r`)), 'level 2 a moment later is refused: no level can be played in no time');
await age(ann);
r = await done(ann, 2);
check(r.bestLevel === 2 && r.newBest === true, 'a minute later level 2 counts');
r = await done(ann, 1);
check(r.bestLevel === 2 && r.newBest === false, 'clearing an older level again changes nothing');
await age(ann);
check(/earlier levels/.test(await fails(ann, `select public.color_sort_level_done(40) as r`)), 'jumping 38 levels ahead is refused');
await age(ann);
r = await done(ann, 7);
check(r.bestLevel === 7, 'a few levels ahead (a message that got lost on the way) is allowed once enough time has passed');
check(/Invalid level/.test(await fails(ann, `select public.color_sort_level_done(0) as r`)) && /Invalid level/.test(await fails(ann, `select public.color_sort_level_done(null) as r`)), 'level 0 or none is refused');
check((await db.query(`select count(*)::int n from public.color_sort_scores where user_id = $1`, [ann])).rows[0].n === 1, 'one row per player however many levels');

section('2. The board');
await done(bob, 1); await age(bob); await done(bob, 2); await age(bob); await done(bob, 3);
await done(cat, 1);
r = await board(ann);
check(r.total === 3 && r.entries.length === 3, 'three players, each once');
check(r.entries[0].username === 'ann' && r.entries[0].level === 7 && r.entries[0].rank === 1, 'the highest level is first');
check(r.entries[1].username === 'bob' && r.entries[1].level === 3 && r.entries[2].username === 'cat', 'then the others, best first');
check(r.entries[0].isMe === true && r.entries[1].isMe === false && r.me.rank === 1 && r.me.level === 7, 'you are marked, with your place');
r = await board(cat);
check(r.me.rank === 3 && r.me.level === 1, 'someone else sees their own place');
check(r.entries[0].displayName === 'ann' && 'avatar' in r.entries[0], 'a name and a picture for every row');
const drift = await mkUser('dan');
r = await board(drift);
check(r.me === null && r.total === 3, 'someone who cleared nothing is not on the board');

section('3. Who may use it');
const rls = (await db.query(`select relrowsecurity from pg_class where relname = 'color_sort_scores'`)).rows[0];
check(rls.relrowsecurity === true, 'the table is not open: only the functions read and write it');
const anon = (await db.query(`select has_function_privilege('anon', 'public.color_sort_level_done(integer)', 'execute') a, has_function_privilege('anon', 'public.color_sort_leaderboard()', 'execute') b`)).rows[0];
check(anon.a === false && anon.b === false, 'a visitor who is not signed in can not call either function');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
