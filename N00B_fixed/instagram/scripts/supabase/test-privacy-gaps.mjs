// Tests migration 20261114000010 (privacy gap A: user_public_json followingIds of private accounts) on a real Postgres (PGlite).
// The database is built from every migration BEFORE ours, answers are recorded for nine kinds of reader, the migration is applied (twice), and the answers are compared:
// everything except followingIds must be byte-identical; followingIds must equal an independently computed expectation (see expectIds).
// Also proves gap B was left alone (profiles rows/columns unchanged). Usage: node --liftoff-only scripts/supabase/test-privacy-gaps.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createTestDb, asUser, asAnon, MIGRATIONS_DIR } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const MIG = '20261114000010_privacy_gaps.sql';
const migSql = fs.readFileSync(path.join(MIGRATIONS_DIR, MIG), 'utf8');

const db = await createTestDb({ upTo: '20261114000009_privacy_hardening.sql' });
const mkUser = async (name) => {
  const id = (await db.query('select gen_random_uuid() as id')).rows[0].id;
  await db.query(`insert into auth.users (id, email, encrypted_password) values ($1, $2, 'x')`, [id, `${name}@users.nooob.xyz`]);
  if (!(await db.query('select 1 from public.profiles where id = $1', [id])).rows.length) await db.query(`insert into public.profiles (id, username, display_name) values ($1, $2, $3)`, [id, name, `${name} Display`]);
  await db.query(`insert into public.profile_private (user_id, email, country_code) values ($1, $2, '+91') on conflict (user_id) do nothing`, [id, `${name}@users.nooob.xyz`]);
  return id;
};
const A = await mkUser('ann');     // the reader
const B = await mkUser('bob');     // public
const C = await mkUser('cat');     // private, A follows
const C2 = await mkUser('cyd');    // private, A does not follow (but cyd follows ann)
const D = await mkUser('dan');     // suspended
const E = await mkUser('eve');     // hid from A
const F = await mkUser('fay');     // public, follows C and C2
const G = await mkUser('gus');     // stranger
const ADMIN = await mkUser('noob'); await db.query(`update public.profiles set is_admin = true where id = $1`, [ADMIN]);
await db.query(`update public.profiles set account_type = 'private' where id in ($1, $2)`, [C, C2]);
await db.query(`update public.profiles set is_suspended = true where id = $1`, [D]);
await db.query(`insert into public.profile_hides (owner_id, hidden_from_id) values ($1, $2)`, [E, A]);
const follow = (a, b) => db.query('insert into public.follows (follower_id, followee_id) values ($1, $2) on conflict do nothing', [a, b]);
await follow(A, C); await follow(A, B); await follow(A, F); await follow(F, C); await follow(F, C2); await follow(B, F); await follow(C, B); await follow(C2, B); await follow(C2, A);
await follow(G, B); await follow(E, B); await follow(B, E); await follow(D, B); await follow(B, D); await follow(B, C);

const call = async (uid, sql, args = []) => asUser(db, uid, async () => (await db.query(sql, args)).rows[0]?.r);
const viewers = { A, B, C, C2, D, E, F, G, ADMIN };
const names = Object.fromEntries(Object.entries(viewers).map(([n, id]) => [id, n]));
const snapshot = async () => {
  const s = {};
  for (const [n, id] of Object.entries(viewers)) {
    s[`search_all:${n}`] = await call(id, `select public.search_users('') as r`);
    s[`me:${n}`] = await call(id, `select public.get_my_user() as r`);
    for (const [t, tid] of Object.entries(viewers)) s[`user_by_id:${n}->${t}`] = await call(id, `select public.user_by_id($1) as r`, [tid]);
  }
  return s;
};
// the raw truth, read with full rights
const edges = (await db.query('select follower_id as a, followee_id as b from public.follows')).rows;
const isPrivate = new Set((await db.query(`select id from public.profiles where account_type = 'private'`)).rows.map((r) => r.id));
const followsSet = new Set(edges.map((e) => `${e.a}>${e.b}`));
// independent expectation of followingIds of account x as seen by reader r
const expectIds = (r, x) => {
  const all = edges.filter((e) => e.a === x).map((e) => e.b);
  if (r === ADMIN) return all.sort();
  const canSee = (acc) => acc === r || !isPrivate.has(acc) || followsSet.has(`${r}>${acc}`);
  return all.filter((b) => b === r || (canSee(x) && canSee(b))).sort();
};

section('0. Before the migration (the gap)');
const before = await snapshot();
const beforeCyd = before['user_by_id:G->C2'];
check(beforeCyd.followingIds.length === 2 && beforeCyd.followingIds.includes(B), 'before: a stranger gets the private account cyd\'s followingIds');
const colsQ = `select column_name from information_schema.columns where table_name='profiles' and table_schema='public' and has_column_privilege('authenticated','public.profiles',column_name,'select') order by 1`;
const beforeRaw = {
  profilesCols: JSON.stringify((await db.query(colsQ)).rows),
  profPolicies: JSON.stringify((await db.query(`select policyname, cmd, qual from pg_policies where tablename = 'profiles' order by 1`)).rows),
  followPolicy: JSON.stringify((await db.query(`select policyname, qual from pg_policies where tablename = 'follows' order by 1`)).rows)
};
const defQ = `select prosecdef, provolatile, proconfig::text as cfg, pg_get_function_arguments(oid) as args, pg_get_function_result(oid) as res, proacl::text as acl from pg_proc where proname = 'user_public_json'`;
const defBefore = (await db.query(defQ)).rows[0];

await db.exec(migSql);
await db.exec(migSql);
check(true, 'the migration ran twice without an error');
const defAfter = (await db.query(defQ)).rows[0];
check(JSON.stringify(defBefore) === JSON.stringify(defAfter), 'user_public_json: same signature, result type, security mode, volatility, search_path, grants');

section('1. everything except followingIds is identical for every reader');
const after = await snapshot();
const strip = (v) => { if (Array.isArray(v)) return v.map(strip); if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) if (k !== 'followingIds') o[k] = strip(x); return o; } return v; };
let same = 0; const diff = [];
for (const k of Object.keys(before)) { if (JSON.stringify(strip(before[k])) === JSON.stringify(strip(after[k]))) same++; else diff.push(k); }
check(diff.length === 0, `${same} answers (search_users, user_by_id, get_my_user; 9 readers: public, own, private followed / not followed, suspended, hidden-from-reader, stranger, admin) identical apart from followingIds`, diff.join(', '));
check(JSON.stringify(Object.keys(before['user_by_id:A->B']).sort()) === JSON.stringify(Object.keys(after['user_by_id:A->B']).sort()), 'same JSON keys');

section('2. followingIds equals the expectation for every reader and every account');
let idOk = 0; const idBad = [];
for (const [rn, rid] of Object.entries(viewers)) {
  for (const [tn, tid] of Object.entries(viewers)) {
    const got = after[`user_by_id:${rn}->${tn}`];
    if (got == null) { if (rn === 'A' && tn === 'E') { idOk++; continue; } idBad.push(`${rn}->${tn} missing`); continue; }
    const g = [...got.followingIds].sort(), e = expectIds(rid, tid);
    if (JSON.stringify(g) === JSON.stringify(e)) idOk++; else idBad.push(`${rn}->${tn}: got ${g.map((x) => names[x]).join(',')} expected ${e.map((x) => names[x]).join(',')}`);
  }
  for (const u of after[`search_all:${rn}`]) { const e = expectIds(rid, u.id); if (JSON.stringify([...u.followingIds].sort()) === JSON.stringify(e)) idOk++; else idBad.push(`search ${rn}: ${names[u.id]}`); }
}
check(idBad.length === 0, `${idOk} followingIds lists match the independent expectation`, idBad.slice(0, 5).join(' | '));
const ids = (r, t) => (after[`user_by_id:${r}->${t}`]?.followingIds || []);
check(ids('G', 'C2').includes(C2) === false && JSON.stringify(ids('G', 'C2')) === '[]', 'a stranger who does not follow cyd gets an EMPTY list for her (it used to list bob)');
check(JSON.stringify(ids('A', 'C2')) === JSON.stringify([A]), 'ann reading cyd (private, not followed, cyd follows ann): only ann herself, so "follows you" and chat eligibility still work');
check(JSON.stringify(ids('A', 'C')) === JSON.stringify(before['user_by_id:A->C'].followingIds), 'private account ann follows: list unchanged');
check(after['user_by_id:G->C2'].followersCount === before['user_by_id:G->C2'].followersCount && after['user_by_id:G->C2'].followingCount === before['user_by_id:G->C2'].followingCount, 'counts of the private account are kept');
check(!ids('A', 'F').includes(C2) && ids('A', 'F').includes(C), 'a public account\'s list drops a private account the reader does not follow (fay -> cyd gone for ann) but keeps the one she follows (cat)');
check(ids('A', 'F').length === 1, 'fay\'s list for ann is exactly [cat]', JSON.stringify(ids('A', 'F').map((x) => names[x])));
check(JSON.stringify(after['me:A'].followingIds) === JSON.stringify(before['me:A'].followingIds) && after['me:A'].followingIds.length === edges.filter((e) => e.a === A).length, 'ann\'s OWN following ids are complete and unchanged');
for (const n of ['B', 'C', 'C2', 'F', 'G', 'D']) check(JSON.stringify(after[`me:${n}`].followingIds) === JSON.stringify(before[`me:${n}`].followingIds), `${n}'s OWN following ids unchanged (get_my_user)`);
for (const t of ['A', 'B', 'C', 'C2', 'D', 'F', 'G']) check(JSON.stringify([...ids('ADMIN', t)].sort()) === JSON.stringify([...before[`user_by_id:ADMIN->${t}`].followingIds].sort()), `admin sees the full, unchanged list of ${t}`);
check(JSON.stringify(ids('B', 'C')) === JSON.stringify(before['user_by_id:B->C'].followingIds), 'bob follows cat so he sees cat\'s full list as before');
check(after['user_by_id:A->D'] != null && ids('A', 'D').includes(B), 'a suspended public account: answer and list as before');
check(after['user_by_id:A->E'] == null && after['search_all:A'].every((u) => u.id !== E), 'the account hidden from ann is still not returned at all');

section('3. Follow lists screens still make sense (what the app computes from these answers)');
// FollowListPage: followers of T = accounts whose followingIds include T; following of T = T.followingIds
const followersOf = (r, t) => Object.keys(viewers).filter((x) => x !== t && ids(r, x).includes(viewers[t]));
check(followersOf('G', 'C2').length === 0, 'followers list of a private account the reader does not follow is empty (no leak through other people\'s lists)');
check(followersOf('A', 'C').includes('F') && followersOf('A', 'C').includes('B'), 'followers of a private account the reader follows are complete (fay, bob)');
check(followersOf('A', 'B').includes('G') && followersOf('A', 'B').includes('C'), 'followers of a public account: complete');
check(ids('A', 'C2').includes(A), 'targetFollowsMe (ProfileView) stays true when the private account follows the reader');

section('4. gap B left alone (no change to profiles or follows rules)');
check(JSON.stringify((await db.query(colsQ)).rows) === beforeRaw.profilesCols, 'readable profiles columns unchanged');
check(JSON.stringify((await db.query(`select policyname, cmd, qual from pg_policies where tablename = 'profiles' order by 1`)).rows) === beforeRaw.profPolicies, 'profiles policies unchanged');
check(JSON.stringify((await db.query(`select policyname, qual from pg_policies where tablename = 'follows' order by 1`)).rows) === beforeRaw.followPolicy, 'follows policy unchanged');
const hiddenDirect = await call(A, `select username as r from public.profiles where id = $1`, [E]);
check(hiddenDirect === 'eve', 'documented residual: a hidden account\'s username is still readable straight from the table (not closed, see the doc)');

section('5. anonymous / no reader');
const anon = await asAnon(db, async () => { try { await db.query('select public.user_by_id($1)', [B]); return 'ok'; } catch (e) { return 'denied'; } });
check(anon === 'denied', 'a visitor still cannot call user_by_id');
const noReader = (await db.query(`select public.user_public_json(p) as r from public.profiles p where id = $1`, [C2])).rows[0].r;
check(noReader.followingIds.length === 2, 'with no logged-in person (server side) the full list is returned as before');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
