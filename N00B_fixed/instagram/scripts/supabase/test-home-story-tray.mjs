// Tests for migration 20261010000010: the home-page story tray (who sees whose story, and the 10 random "suggested" accounts),
// on a REAL Postgres (PGlite) with every migration applied.
//
// Usage: node scripts/supabase/test-home-story-tray.mjs
import { createTestDb, asUser, asAnon } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
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
const call = (uid, sql, params = []) => asUser(db, uid, async () => (await db.query(sql, params)).rows);
const tray = async (uid) => (await call(uid, `select public.home_story_tray() as t`))[0].t;
const storyOf = (uid, closeFriends = false) => call(uid, `select public.create_story('stories/${uid}.jpg', 'image', '[]'::jsonb, $1) as s`, [closeFriends]).then((r) => r[0].s);
const follow = (a, b) => db.query(`insert into public.follows (follower_id, followee_id) values ($1, $2) on conflict do nothing`, [a, b]);
const users = (t) => new Set(t.stories.map((s) => s.userId));

// ---- the cast
const me = await mkUser('me');
const pubA = await mkUser('pub_a');
const bizB = await mkUser('biz_b', { account_type: 'business' });
const privC = await mkUser('priv_c', { account_type: 'private' });          // private, does not follow me back... follows me, I do not follow
const privD = await mkUser('priv_d', { account_type: 'private' });          // private, I follow
const blockedE = await mkUser('blocked_e');                                 // I blocked
const blockerF = await mkUser('blocker_f');                                 // blocked me
const hiderG = await mkUser('hider_g');                                     // hid their profile from me
const suspendedH = await mkUser('suspended_h');
const closeI = await mkUser('close_i');                                     // close-friends story, I am NOT on the list
const closeJ = await mkUser('close_j');                                     // close-friends story, I AM on the list
const expiredK = await mkUser('expired_k');
const followedL = await mkUser('followed_l');                               // followed, no story
const aiM = await mkUser('ai_m', { is_ai: true });
const privN = await mkUser('priv_n', { account_type: 'private' });          // private, no story
const pool = [];
for (let i = 0; i < 14; i++) pool.push(await mkUser(`pool_${i}`, i % 3 === 0 ? { account_type: 'business' } : {}));

await follow(me, privD); await follow(me, followedL); await follow(privC, me);
await db.query(`insert into public.blocks (blocker_id, blocked_id) values ($1, $2), ($3, $4)`, [me, blockedE, blockerF, me]);
await db.query(`insert into public.profile_hides (owner_id, hidden_from_id) values ($1, $2)`, [hiderG, me]);
await db.query(`insert into public.close_friends (owner_id, friend_id) values ($1, $2)`, [closeJ, me]);

const sMe = await storyOf(me);
const sPub = await storyOf(pubA);
const sBiz = await storyOf(bizB);
await storyOf(privC); const sPrivD = await storyOf(privD);
await storyOf(blockedE); await storyOf(blockerF); await storyOf(hiderG); await storyOf(suspendedH);
await storyOf(closeI, true); const sCloseJ = await storyOf(closeJ, true);
const sExpired = await storyOf(expiredK);
await db.query(`update public.stories set expires_at = now() - interval '1 hour' where id = $1`, [sExpired.id]);
await db.query(`update public.profiles set is_suspended = true where id = $1`, [suspendedH]);

// =========================================================================================== 1. who is in the tray
section('1. Whose stories show up');
const t = await tray(me);
const u = users(t);
check(u.has(me), 'my own story is there');
check(u.has(pubA) && u.has(bizB), 'public and business accounts show, although I do not follow them');
check(u.has(privD), 'a private account I follow shows');
check(!u.has(privC), 'a private account I do not follow does not show (even though it follows me)');
check(!u.has(blockedE) && !u.has(blockerF), 'blocked accounts (either way) do not show');
check(!u.has(hiderG), 'an account that hid its profile from me does not show');
check(!u.has(suspendedH), 'a suspended account does not show');
check(!u.has(expiredK), 'an expired story does not show');
check(!u.has(closeI), 'a Close Friends story does not show to someone not on the list');
check(u.has(closeJ), 'a Close Friends story shows to someone on the list');
check(t.stories.length === 5 && u.size === 5, 'exactly the five expected people (one story each)', String(t.stories.length));
check(t.stories.every((s) => s.id && s.username && 'isViewed' in s && Array.isArray(s.comments)), 'each story carries the usual story fields');

// =========================================================================================== 2. seen / not seen
section('2. Seen and unseen');
check(t.stories.every((s) => s.isViewed === false), 'nothing is seen to begin with');
await call(me, `select public.record_story_view($1)`, [sPub.id]);
const t2 = await tray(me);
check(t2.stories.find((s) => s.id === sPub.id).isViewed === true, 'after viewing, that story comes back as seen');
check(t2.stories.find((s) => s.id === sBiz.id).isViewed === false, 'the others are still unseen');
check(t2.stories.find((s) => s.id === sMe.id).viewedBy.length === 0 && t2.stories.find((s) => s.id === sPub.id).viewedBy.length === 0, 'the list of viewers is only filled in for the author');
const tPub = await tray(pubA);
check(tPub.stories.find((s) => s.id === sPub.id).viewedBy.includes(me), 'the author sees who viewed their story');

// =========================================================================================== 3. suggestions
section('3. The ten suggested accounts');
const sug = t.suggestions;
const sugIds = sug.map((x) => x.id);
check(sug.length === 10, 'ten are suggested', String(sug.length));
check(new Set(sugIds).size === 10, 'no one is suggested twice');
const never = new Set([me, pubA, bizB, privC, privD, blockedE, blockerF, hiderG, suspendedH, closeJ, followedL, aiM, privN]);
check(sugIds.every((id) => !never.has(id)), 'never myself, someone I follow, blocked / hidden / suspended / AI / private accounts, or someone already in the tray with a story');
const eligible = new Set([...pool, closeI, expiredK]);   // closeI / expiredK have no story I can see, so they are fair suggestions
check(sugIds.every((id) => eligible.has(id)), 'only from the eligible public / business accounts');
check(sug.every((x) => x.id && x.username && 'avatar' in x && 'isVerified' in x && ['public', 'business'].includes(x.accountType)), 'each suggestion carries what the tray needs');

const orders = new Set();
const members = new Set();
for (let i = 0; i < 8; i++) { const r = (await tray(me)).suggestions.map((x) => x.id); orders.add(r.join(',')); r.forEach((id) => members.add(id)); }
check(orders.size > 1, 'the suggestions are shuffled differently on different calls', `distinct orders: ${orders.size}`);
check(members.size > 10, 'over several calls different accounts get suggested, not always the same ten', `distinct accounts: ${members.size}`);

const other = await mkUser('other_viewer');
const otherSug = (await tray(other)).suggestions.map((x) => x.id);
check(otherSug.length === 10 && otherSug.join(',') !== sugIds.join(','), 'another person gets their own list');

await follow(me, sugIds[0]);
const after = (await tray(me)).suggestions.map((x) => x.id);
check(!after.includes(sugIds[0]), 'someone I just followed is no longer suggested');

// =========================================================================================== 4. other viewers
section('4. Other people see their own version');
const tPriv = await tray(privC);
const pu = users(tPriv);
check(pu.has(privC) && pu.has(pubA) && pu.has(bizB), 'a private account\'s owner sees their own story plus every public / business story');
check(!pu.has(privD), 'and not another private account they do not follow');
check(tPriv.suggestions.every((x) => ['public', 'business'].includes(x.accountType) && x.id !== privC), 'a private account is never suggested');

const tBlock = await tray(blockedE);
check(!users(tBlock).has(me), 'a blocked account does not see my story either');

// =========================================================================================== 5. safety
section('5. Not for everyone');
let denied = false;
try { await asAnon(db, async () => db.query(`select public.home_story_tray()`)); } catch (e) { denied = /permission denied/.test(e.message); }
check(denied, 'someone not signed in cannot call it');
const susp = await tray(suspendedH);
check(susp.stories.length === 0 && susp.suggestions.length === 0, 'a suspended account gets an empty tray');

// a few stories from the same person all come back
await storyOf(pubA);
const multi = (await tray(me)).stories.filter((s) => s.userId === pubA);
check(multi.length === 2, 'every live story of a person is returned, not just the newest');

// stories that exist but whose author is capped out: the cap is by person, never cutting one person's stories in half
const heavy = [];
for (let i = 0; i < 65; i++) { const p = await mkUser(`heavy_${i}`); heavy.push(p); await storyOf(p); await storyOf(p); }
const big = await tray(me);
const perUser = {};
for (const s of big.stories) perUser[s.userId] = (perUser[s.userId] || 0) + 1;
check(Object.keys(perUser).length === 60, 'the tray holds at most 60 people', String(Object.keys(perUser).length));
check(Object.entries(perUser).filter(([id]) => heavy.includes(id)).every(([, n]) => n === 2), 'and a person is never cut in half');
check(Object.keys(perUser).includes(me) && Object.keys(perUser).includes(privD), 'my own story and the people I follow are always ranked inside the cap');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
