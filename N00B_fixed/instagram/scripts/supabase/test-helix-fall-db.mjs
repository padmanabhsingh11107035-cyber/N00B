// Helix Fall on the database: 50,000,000 NOOBs for every level cleared (never twice within 20 seconds), one best score per player (Daily Tower runs only),
// and the board (best of each player, once). On a REAL Postgres (PGlite) with every migration applied.
// Usage: node --liftoff-only scripts/supabase/test-helix-fall-db.mjs
import { createTestDb, asUser } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const db = await createTestDb();
const mkUser = async (name) => {
  const id = (await db.query(`select gen_random_uuid() as id`)).rows[0].id;
  await db.query(`insert into auth.users (id, email, encrypted_password) values ($1, $2, 'x')`, [id, `${name}@users.nooob.xyz`]);
  if (!(await db.query(`select 1 from public.profiles where id = $1`, [id])).rows.length) await db.query(`insert into public.profiles (id, username, display_name) values ($1, $2, $2)`, [id, name]);
  await db.query(`update public.profiles set noob_points = 0 where id = $1`, [id]);
  return id;
};
const rpc = async (uid, sql, args = []) => asUser(db, uid, async () => (await db.query(sql, args)).rows[0]?.r);
const fails = async (uid, sql, args = []) => { try { await rpc(uid, sql, args); return ''; } catch (e) { return String(e.message || e); } };
const points = async (u) => Number((await db.query(`select noob_points from public.profiles where id = $1`, [u])).rows[0].noob_points);
const level = (u, n) => rpc(u, `select public.helix_level_complete($1) as r`, [n]);
const run = (u, score, floors, lvl, daily = true) => rpc(u, `select public.helix_submit_run($1, $2, $3, $4) as r`, [score, floors, lvl, daily]);
const board = (u, period) => rpc(u, `select public.helix_leaderboard($1) as r`, [period]);
// pretend the last payout was a while ago, so the next one is not "too fast"
const age = (u) => db.query(`update public.helix_state set last_level_at = now() - interval '1 minute' where user_id = $1`, [u]);

const ann = await mkUser('ann'), bob = await mkUser('bob'), cat = await mkUser('cat');

section('1. A cleared level pays 50,000,000');
let r = await level(ann, 1);
check(r.success && r.earnedPoints === 50000000 && r.totalNoobPoints === 50000000, 'level 1 pays 50,000,000');
check(await points(ann) === 50000000, 'and the balance has it');
check(/too fast/.test(await fails(ann, `select public.helix_level_complete(2) as r`)), 'a second payout within 20 seconds is refused');
check(await points(ann) === 50000000, 'and pays nothing');
await age(ann);
r = await level(ann, 2);
check(r.earnedPoints === 50000000 && await points(ann) === 100000000, 'level 2 pays another 50,000,000 (levels never run out)');
await age(ann);
await level(ann, 41);
check(await points(ann) === 150000000, 'level 41 pays the same');
check(/Invalid level/.test(await fails(ann, `select public.helix_level_complete(0) as r`)) && /Invalid level/.test(await fails(ann, `select public.helix_level_complete(null) as r`)), 'level 0 or none is refused');
const ledger = (await db.query(`select amount::bigint::text as amount, reason from public.noob_transactions where user_id = $1 order by created_at, id`, [ann])).rows;
check(ledger.length === 3 && ledger.every((x) => x.amount === '50000000') && /Helix Fall: cleared level 1/.test(ledger[0].reason), 'each payout is in the points history');
check((await db.query(`select games_won_count from public.profiles where id = $1`, [ann])).rows[0].games_won_count === 3, 'each level counts as a game won');

section('2. One best score per player');
r = await run(bob, 400, 30, 1);
check(r.success && r.bestScore === 400 && r.todayBest === 400 && r.newBest === true, 'the first Daily Tower run is the best');
r = await run(bob, 250, 20, 1);
check(r.bestScore === 400 && r.newBest === false, 'a worse run does not replace it');
r = await run(bob, 900, 95, 2);
check(r.bestScore === 900 && r.bestLevel === 2 && r.newBest === true, 'a better one does');
r = await run(bob, 5000, 40, 1, false);
check(r.bestScore === 900 && r.newBest === false, 'a Practice run never counts for the board');
check((await db.query(`select count(*)::int n from public.helix_scores where user_id = $1`, [bob])).rows[0].n === 2, 'one row for all-time and one for today, however many runs');
check((await db.query(`select games_played_count from public.profiles where id = $1`, [bob])).rows[0].games_played_count === 4, 'every run counts as a game played');
check(/not possible/.test(await fails(bob, `select public.helix_submit_run(100000, 10, 1, true) as r`)), 'a score the rules can never give is refused');
check(/not possible/.test(await fails(bob, `select public.helix_submit_run(100, 10, 3, true) as r`)), 'and so is level 3 after only 10 floors');
check(/Invalid run/.test(await fails(bob, `select public.helix_submit_run(-5, 10, 1, true) as r`)), 'a negative score is refused');

section('3. The board shows each player once, best first');
await run(cat, 700, 80, 1);
await run(cat, 650, 70, 1);
await run(cat, 720, 85, 1);
await run(ann, 100, 15, 1);
let b = await board(ann, 'today');
check(b.entries.length === 3, 'three players, three rows (ann, bob, cat), not one row per run', JSON.stringify(b.entries.map((e) => e.displayName)));
check(b.entries.map((e) => e.displayName).join() === 'bob,cat,ann' && b.entries.map((e) => e.score).join() === '900,720,100', 'in order of their best score');
check(b.entries[0].rank === 1 && b.entries[2].rank === 3 && b.entries[0].level === 2, 'with rank and level');
check(b.entries.filter((e) => e.isMe).length === 1 && b.entries[2].isMe === true && b.me.rank === 3 && b.me.score === 100, 'and says which row is "you"');
b = await board(bob, 'all');
check(b.period === 'all' && b.entries.length === 3 && b.me.rank === 1 && b.total === 3, 'the all-time board is the same idea');
await db.query(`update public.helix_scores set day = '2000-01-01' where day <> 'all' and user_id = $1`, [cat]);
b = await board(bob, 'today');
check(b.entries.length === 2 && !b.entries.some((e) => e.displayName === 'cat'), 'a score from another day is not on today\'s board');
b = await board(bob, 'all');
check(b.entries.some((e) => e.displayName === 'cat' && e.score === 720), 'but is still on the all-time board');
check(b.entries.every((e) => e.score > 0), 'nobody sits on the board with 0');

section('4. Locked down');
const direct = await asUser(db, ann, async () => { try { return (await db.query(`select count(*)::int n from public.helix_scores`)).rows[0].n; } catch (e) { return 'denied'; } });
check(direct === 0 || direct === 'denied', 'a player cannot read the score table directly (only through the board)', String(direct));
const anon = await (async () => { try { await db.exec(`set role anon;`); await db.query(`select public.helix_leaderboard('today')`); return 'allowed'; } catch (e) { return 'denied'; } finally { await db.exec(`reset role;`); } })();
check(anon === 'denied', 'an anonymous visitor cannot use the functions', anon);

console.log(`\n${passed} passed, ${failed} failed`);
await db.close();
process.exit(failed ? 1 : 0);
