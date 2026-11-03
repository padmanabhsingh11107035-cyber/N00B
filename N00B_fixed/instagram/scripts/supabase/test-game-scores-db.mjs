// The shared ranking of the score games (migration 20261103000002) on a REAL Postgres (PGlite) with every migration applied: one best score per player per game, impossible scores and
// scores sent too quickly refused, a board that shows everyone once with your own place, and tables nobody can reach directly.
// Usage: node --liftoff-only scripts/supabase/test-game-scores-db.mjs
import { createTestDb, asUser, asAnon } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (c, l, d = '') => { if (c) { passed++; console.log(`  ok   ${l}`); } else { failed++; console.log(`  FAIL ${l} ${d}`); } };
const section = (t) => console.log(`\n${t}`);
const db = await createTestDb();
const mkUser = async (name) => {
  const id = (await db.query(`select gen_random_uuid() as id`)).rows[0].id;
  await db.query(`insert into auth.users (id, email, encrypted_password) values ($1, $2, 'x')`, [id, `${name}@users.nooob.xyz`]);
  if (!(await db.query(`select 1 from public.profiles where id = $1`, [id])).rows.length) await db.query(`insert into public.profiles (id, username, display_name) values ($1, $2, $2)`, [id, name]);
  return id;
};
const rpc = async (uid, sql, args = []) => asUser(db, uid, async () => (await db.query(sql, args)).rows[0]?.r);
const send = (u, game, score) => rpc(u, `select public.hosted_score_submit($1, $2) as r`, [game, score]);
const board = (u, game) => rpc(u, `select public.hosted_score_board($1, 50) as r`, [game]);
const age = (u, game) => db.query(`update public.hosted_scores set last_sent = now() - interval '1 minute' where user_id = $1 and game = $2`, [u, game]);
const ann = await mkUser('ann'), bob = await mkUser('bob'), cat = await mkUser('cat');

section('1. Sending a score');
let r = await send(ann, 'flappy20', 40);
check(r.success && r.best === 40 && r.newBest === true, 'the first score is the best');
r = await send(ann, 'flappy20', 90);
check(!r.success && /every few seconds/.test(r.error), 'a second score right away is refused');
await age(ann, 'flappy20');
r = await send(ann, 'flappy20', 30);
check(r.success && r.best === 40 && r.newBest === false, 'a lower score keeps the best');
await age(ann, 'flappy20');
r = await send(ann, 'flappy20', 75);
check(r.best === 75 && r.newBest === true, 'a higher score becomes the best');
check((await db.query(`select count(*)::int n, max(plays)::int p from public.hosted_scores where user_id = $1`, [ann])).rows[0].n === 1, 'one row per player and game, however many rounds');
check(!(await send(ann, 'flappy20', 100001)).success && !(await send(ann, 'flappy20', -1)).success, 'a score that the game cannot give is refused');
check(/no ranking/.test((await send(ann, 'no_such_game', 5)).error), 'a game without a rule has no ranking');
check(/log in/i.test((await asAnon(db, async () => { try { return (await db.query(`select public.hosted_score_submit('flappy20', 5) as r`)).rows[0].r.error; } catch (e) { return 'log in: ' + e.message; } }))), 'a visitor who is not logged in cannot send a score');
await send(bob, 'flappy20', 75); await send(cat, 'flappy20', 120); await send(bob, 'noob_run_3d', 5000);

section('2. The board');
const b = await board(bob, 'flappy20');
check(b.rows.length === 3 && b.rows[0].username === 'cat' && b.rows[0].rank === 1, 'everyone once, best first');
check(b.rows[1].username === 'ann' && b.rows[1].rank === 2 && b.rows[2].username === 'bob' && b.rows[2].rank === 3, 'a tie goes to the one who got there first');
check(b.me.rank === 3 && b.me.best === 75 && b.rows.find((x) => x.username === 'bob').isMe === true && b.rows.filter((x) => x.isMe).length === 1, 'your own place and row are marked');
check((await board(bob, 'noob_run_3d')).rows.length === 1, 'each game has its own board');
check((await board(bob, 'nonsense')).rows.length === 0, 'an unknown game has an empty board');

section('3. Who can read what');
const direct = async (sql) => asAnon(db, async () => { try { await db.query(sql); return ''; } catch (e) { return String(e.message); } });
check(/permission denied/i.test(await direct(`select * from public.hosted_scores`)) && /permission denied/i.test(await direct(`select * from public.hosted_score_rules`)), 'a visitor cannot read the tables');
const asPlain = async (sql) => { try { await asUser(db, ann, async () => db.query(sql)); return ''; } catch (e) { return String(e.message); } };
check(/permission denied/i.test(await asPlain(`select * from public.hosted_scores`)) && /permission denied/i.test(await asPlain(`update public.hosted_scores set best = 99999 where user_id = '${ann}'`)), 'a signed-in player cannot read or change the tables directly (only through the two functions)');
check(/permission denied/i.test(await direct(`select public.hosted_score_board('flappy20', 5)`)), 'a visitor cannot ask for a board');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
