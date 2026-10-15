// Tests for migration 20261016000003: Mood Status, on a REAL Postgres (PGlite) with every migration applied.
// Usage: node scripts/supabase/test-mood-status.mjs
import { createTestDb, asUser, asAnon } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const expectFail = async (fn, pattern, label) => {
  try { await fn(); check(false, label, '(expected an error, but it succeeded)'); }
  catch (e) { check(pattern.test(e.message), label, `(got: ${e.message})`); }
};
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
const rpc = async (uid, fn, ...args) => asUser(db, uid, async () => (await db.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).rows[0].r);
const rpcAnon = async (fn, ...args) => asAnon(db, async () => (await db.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).rows[0].r);
const follow = (a, b) => db.query(`insert into public.follows (follower_id, followee_id) values ($1, $2) on conflict do nothing`, [a, b]);
// let the 2-second guard pass between changes
const settle = (uid) => db.query(`update public.user_moods set updated_at = updated_at - interval '1 minute' where user_id = $1`, [uid]);

const ann = await mkUser('ann_mood');       // sets moods
const fan = await mkUser('fan_mood');       // follows ann
const stranger = await mkUser('stranger_mood');
const blocked = await mkUser('blocked_mood');
const hidden = await mkUser('hidden_mood');
const priv = await mkUser('private_mood', { account_type: 'private' });
const susp = await mkUser('susp_mood');
await follow(fan, ann);
await db.query(`insert into public.blocks (blocker_id, blocked_id) values ($1, $2)`, [ann, blocked]);
await db.query(`insert into public.profile_hides (owner_id, hidden_from_id) values ($1, $2)`, [ann, hidden]);

section('1. The table and helpers can not be touched from the app');
await expectFail(() => asAnon(db, () => db.query(`select * from public.user_moods`)), /permission denied/i, 'a visitor can not read the table directly');
await expectFail(() => asUser(db, ann, () => db.query(`select * from public.user_moods`)), /permission denied/i, 'a member can not either');
await expectFail(() => asUser(db, ann, () => db.query(`insert into public.user_moods (user_id, mood) values ($1, 'happy')`, [ann])), /permission denied/i, 'nor write around the function');
await expectFail(() => asUser(db, ann, () => db.query(`select public.mood_visible(m) from public.user_moods m`)), /permission denied/i, 'the visibility check is not callable from the app');
await expectFail(() => asUser(db, ann, () => db.query(`select public.mood_json(m) from public.user_moods m`)), /permission denied/i, 'nor the answer builder');
await expectFail(() => asAnon(db, () => db.query(`select public.mood_set('happy')`)), /permission denied/i, 'a visitor can not set a mood');
const idx = (await db.query(`select indexname from pg_indexes where tablename = 'user_moods'`)).rows.map((r) => r.indexname);
check(idx.includes('user_moods_community_idx') && idx.includes('user_moods_recent_idx') && idx.includes('user_moods_expiry_idx'), 'the community list, the friends list and the expiry each have an index');

section('2. Nothing exists until someone sets a mood');
check((await rpc(ann, 'mood_my')) === null, 'a person who never set a mood has none');
check((await rpc(fan, 'mood_get', ann)) === null && (await rpcAnon('mood_get', ann)) === null, 'and nobody sees one');
check((await rpc(fan, 'mood_friends')).moods.length === 0 && (await rpc(fan, 'mood_community')).moods.length === 0, 'the lists are empty');

section('3. Setting a mood');
await expectFail(() => rpc(ann, 'mood_set', 'furious', '', 'everyone', 24), /Pick one of the moods/i, 'a mood that is not one of the eight is refused');
await expectFail(() => rpc(ann, 'mood_set', null), /Pick one of the moods/i, 'no mood is refused');
await expectFail(() => rpc(ann, 'mood_set', 'happy', 'x'.repeat(81), 'everyone', 24), /80 characters/i, 'a note over 80 characters is refused');
await expectFail(() => rpc(ann, 'mood_set', 'happy', '', 'friends', 24), /who can see/i, 'a visibility that is not one of the three is refused');
await expectFail(() => rpc(ann, 'mood_set', 'happy', '', 'everyone', 0), /1 to 168/i, 'a lifetime under an hour is refused');
await expectFail(() => rpc(ann, 'mood_set', 'happy', '', 'everyone', 500), /1 to 168/i, 'or over a week');
await db.query(`update public.profiles set is_suspended = true where id = $1`, [susp]);
await expectFail(() => rpc(susp, 'mood_set', 'happy'), /can not change/i, 'a suspended account is refused by the database');
await db.query(`update public.profiles set is_suspended = false where id = $1`, [susp]);
const mine = await rpc(ann, 'mood_set', 'excited', '  Big ‮day​\n tomorrow!  ', 'followers', 24);
check(mine.mood === 'excited' && mine.note === 'Big day tomorrow!' && mine.visibility === 'followers' && mine.updatedAt && mine.expiresAt, 'the mood is saved: tidied one-line note, who can see it, when it was set, when it clears', JSON.stringify(mine));
const hours = (await db.query(`select extract(epoch from (expires_at - updated_at)) / 3600 as h from public.user_moods where user_id = $1`, [ann])).rows[0].h;
check(Math.round(hours) === 24, 'it clears itself after 24 hours');
await expectFail(() => rpc(ann, 'mood_set', 'happy', '', 'followers', 24), /wait a moment/i, 'changing it twice within two seconds is refused');
check((await rpc(ann, 'mood_my')).mood === 'excited', 'the person sees their own mood');
await settle(ann);
const changed = await rpc(ann, 'mood_set', 'loved', '', 'followers', null);
check(changed.mood === 'loved' && changed.expiresAt === null, 'it can be changed, and set to stay until changed (no expiry)');
check((await db.query(`select count(*)::int as n from public.user_moods where user_id = $1`, [ann])).rows[0].n === 1, 'there is only ever one mood per person');
await settle(ann);
await rpc(ann, 'mood_set', 'happy', 'Good vibes', 'followers', 24);

section('4. Who can see it: followers only');
const view = await rpc(fan, 'mood_get', ann);
check(view.mood === 'happy' && view.note === 'Good vibes', 'a follower sees it');
check(JSON.stringify(Object.keys(view).sort()) === JSON.stringify(['mood', 'note', 'updatedAt']), 'and only the mood, the note and the time (not the settings)');
check((await rpc(stranger, 'mood_get', ann)) === null, 'someone who does not follow does not');
check((await rpcAnon('mood_get', ann)) === null, 'a visitor does not');
check((await rpc(blocked, 'mood_get', ann)) === null && (await rpc(hidden, 'mood_get', ann)) === null, 'a person who is blocked, or whom the owner hid from, does not');
check((await rpc(fan, 'mood_friends')).moods.length === 1 && (await rpc(stranger, 'mood_friends')).moods.length === 0, 'the friends\' list shows it to the follower only');
check((await rpc(stranger, 'mood_community')).moods.length === 0, 'and it is not in the community list');

section('5. Who can see it: only me');
await settle(ann);
await rpc(ann, 'mood_set', 'sad', 'Just for me', 'only_me', 24);
check((await rpc(ann, 'mood_my')).visibility === 'only_me', 'the owner still sees it');
check((await rpc(fan, 'mood_get', ann)) === null && (await rpc(fan, 'mood_friends')).moods.length === 0, 'nobody else does, not even a follower');

section('6. Who can see it: everyone');
await settle(ann);
await rpc(ann, 'mood_set', 'confident', 'Feeling great', 'everyone', 24);
check((await rpc(stranger, 'mood_get', ann)).mood === 'confident' && (await rpcAnon('mood_get', ann)).mood === 'confident', 'a stranger and a visitor see it');
check((await rpc(blocked, 'mood_get', ann)) === null && (await rpc(hidden, 'mood_get', ann)) === null, 'but not someone who is blocked or hidden from');
const comm = await rpc(stranger, 'mood_community');
check(comm.moods.length === 1 && comm.moods[0].username === 'ann_mood' && comm.moods[0].mood === 'confident' && comm.moods[0].note === 'Feeling great', 'it is in the community list');
check(JSON.stringify(Object.keys(comm.moods[0]).sort()) === JSON.stringify(['avatar', 'displayName', 'isVerified', 'mood', 'note', 'updatedAt', 'userId', 'username']), 'with the person\'s public details and nothing private');
check((await rpc(ann, 'mood_community')).moods.length === 0, 'the person does not see themselves in it');
check((await rpc(blocked, 'mood_community')).moods.length === 0 && (await rpc(hidden, 'mood_community')).moods.length === 0, 'and a blocked or hidden person does not see them in it');
check((await rpc(stranger, 'mood_community', 20, null, null, 'happy')).moods.length === 0 && (await rpc(stranger, 'mood_community', 20, null, null, 'confident')).moods.length === 1, 'the list can be filtered by mood');
check((await rpc(fan, 'mood_friends')).moods.length === 1, 'a follower sees it in the friends\' list as well');
await db.query(`update public.profiles set is_suspended = true where id = $1`, [ann]);
check((await rpc(stranger, 'mood_get', ann)) === null && (await rpc(stranger, 'mood_community')).moods.length === 0, 'a suspended account\'s mood disappears for everyone');
await db.query(`update public.profiles set is_suspended = false where id = $1`, [ann]);

section('7. Private accounts');
await rpc(priv, 'mood_set', 'bored', 'Nothing to do', 'everyone', 24);
check((await rpc(stranger, 'mood_get', priv)) === null && (await rpcAnon('mood_get', priv)) === null, 'a private account\'s "everyone" mood still does not reach strangers or visitors');
check((await rpc(stranger, 'mood_community')).moods.every((m) => m.username !== 'private_mood'), 'and it is not in the community list');
await follow(stranger, priv);
check((await rpc(stranger, 'mood_get', priv)).mood === 'bored', 'a follower of a private account sees it');

section('8. Clearing itself, and removing');
await db.query(`update public.user_moods set expires_at = now() - interval '1 minute' where user_id = $1`, [ann]);
check((await rpc(ann, 'mood_my')) === null && (await rpc(stranger, 'mood_get', ann)) === null && (await rpc(stranger, 'mood_community')).moods.every((m) => m.username !== 'ann_mood'), 'a mood that has expired is gone for everybody, its owner included');
await settle(ann);
await rpc(ann, 'mood_set', 'tired', '', 'everyone', 24);
check((await rpc(stranger, 'mood_get', ann)).mood === 'tired', 'setting a new one brings it back');
const cleared = await rpc(ann, 'mood_clear');
check(JSON.stringify(cleared) === JSON.stringify({ ok: true }) && (await rpc(ann, 'mood_my')) === null && (await rpc(stranger, 'mood_get', ann)) === null, 'the person can remove it at any time');
check((await rpc(ann, 'mood_clear')).ok === true, 'removing when there is none is harmless');
await expectFail(() => asAnon(db, () => db.query(`select public.mood_clear()`)), /permission denied/i, 'a visitor can not remove anyone\'s mood');

section('9. The lists, a page at a time');
const names = [];
for (let i = 0; i < 5; i++) {
  const u = await mkUser(`pager_${i}`);
  await follow(fan, u);
  await rpc(u, 'mood_set', 'happy', `note ${i}`, 'everyone', 24);
  await db.query(`update public.user_moods set updated_at = now() - ($2 || ' minutes')::interval where user_id = $1`, [u, String(i * 10 + 5)]);
  names.push(`pager_${i}`);
}
const p1 = await rpc(fan, 'mood_friends', 2);
check(p1.moods.length === 2 && p1.hasMore === true && p1.moods[0].username === 'pager_0' && p1.moods[1].username === 'pager_1', 'friends: two at a time, newest first, with "more"');
const last = p1.moods[1];
const p2 = await rpc(fan, 'mood_friends', 2, last.updatedAt, last.userId);
check(p2.moods.length === 2 && p2.moods[0].username === 'pager_2' && p2.moods[1].username === 'pager_3' && p2.hasMore === true, 'the next page continues where the last ended');
const p3 = await rpc(fan, 'mood_friends', 2, p2.moods[1].updatedAt, p2.moods[1].userId);
check(p3.moods.length === 1 && p3.moods[0].username === 'pager_4' && p3.hasMore === false, 'and the last page ends the list');
const cp = await rpc(stranger, 'mood_community', 3);
check(cp.moods.length === 3 && cp.hasMore === true, 'the community list pages too');

section('10. An account that is deleted');
const gone = await mkUser('gone_mood');
await rpc(gone, 'mood_set', 'happy', '', 'everyone', 24);
await db.query(`delete from public.profiles where id = $1`, [gone]);
await db.query(`delete from auth.users where id = $1`, [gone]);
check((await db.query(`select count(*)::int as n from public.user_moods where user_id = $1`, [gone])).rows[0].n === 0, 'a deleted account\'s mood goes with it');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
