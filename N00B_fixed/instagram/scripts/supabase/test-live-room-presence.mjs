// Tests that people who close the app / tab without tapping Leave are taken out of NOOB Rooms and Live Lounge rooms, on a REAL Postgres
// (PGlite) with every migration applied. Time is simulated by moving the "last seen" times back.
//
// Usage: node scripts/supabase/test-live-room-presence.mjs
import { createTestDb, asUser } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);

const db = await createTestDb();
const mkUser = async (name) => {
  const id = (await db.query(`select gen_random_uuid() as id`)).rows[0].id;
  await db.query(`insert into auth.users (id, email, encrypted_password) values ($1, $2, 'x')`, [id, `${name}@users.nooob.xyz`]);
  const has = (await db.query(`select 1 from public.profiles where id = $1`, [id])).rows.length;
  if (!has) await db.query(`insert into public.profiles (id, username, display_name) values ($1, $2, $2)`, [id, name]);
  return id;
};
const [alice, bob, carol] = [await mkUser('alice'), await mkUser('bob'), await mkUser('carol')];
const call = (uid, sql, params = []) => asUser(db, uid, async () => (await db.query(sql, params)).rows);
const one = async (uid, sql, params = []) => Object.values((await call(uid, sql, params))[0])[0];
// Pretend someone went quiet `secs` seconds ago.
const quietFor = (table, room, user, secs) => {
  const also = table === 'live_lounge_room_participants' ? `, updated_at = now() - ($3 || ' seconds')::interval` : '';
  return db.query(`update public.${table} set last_seen_at = now() - ($3 || ' seconds')::interval${also} where room_id = $1 and user_id = $2`, [room, user, String(secs)]);
};

// =========================================================================================== 1. NOOB Rooms
section('1. NOOB Rooms: a person who closes the app disappears from the count');
const roomId = (await one(alice, `select public.start_noob_room('Test room', 'General', '') as r`)).roomId;
await call(alice, `select public.noob_room_join($1)`, [roomId]);
await call(bob, `select public.noob_room_join($1)`, [roomId]);
await call(carol, `select public.noob_room_join($1)`, [roomId]);
const count = async () => (await one(alice, `select public.list_noob_rooms() as l`)).find((r) => r.id === roomId)?.participantCount;
check(await count() === 3, 'three people in the room are counted');

await quietFor('noob_room_participants', roomId, bob, 200); // bob closed the app 200 s ago
check(await count() === 2, 'bob stopped signalling: he is no longer in the count');
check((await one(alice, `select public.noob_room_participants_list($1) as l`, [roomId])).every((p) => p.userId !== bob), 'bob is gone from the people list');
check((await db.query(`select 1 from public.noob_room_participants where room_id=$1 and user_id=$2`, [roomId, bob])).rows.length === 0, 'bob\'s row was actually removed');

check(await one(bob, `select public.noob_room_heartbeat($1) as h`, [roomId]) === false, 'bob\'s next signal says "you are no longer listed" (the app then puts him back)');
check(await one(carol, `select public.noob_room_heartbeat($1) as h`, [roomId]) === true, 'carol, still here, is told she is still listed');

await quietFor('noob_room_participants', roomId, carol, 30); // a short pause is fine
check(await one(alice, `select public.noob_room_heartbeat($1) as h`, [roomId]) === true && await count() === 2, 'a 30 second pause does NOT remove anyone');

await call(bob, `select public.noob_room_join($1)`, [roomId]);
check(await count() === 3, 'bob can join again');

await quietFor('noob_room_participants', roomId, alice, 500);
await quietFor('noob_room_participants', roomId, bob, 500);
await quietFor('noob_room_participants', roomId, carol, 500);
let rooms = await one(alice, `select public.list_noob_rooms() as l`);
check(rooms.find((r) => r.id === roomId)?.participantCount === 0, 'when everyone has gone the room shows 0 people');
check((await db.query(`select status from public.noob_rooms where id = $1`, [roomId])).rows[0].status === 'live', 'but it waits 90 seconds before ending (a host who refreshes keeps their room)');
await call(alice, `select public.noob_room_join($1)`, [roomId]);
check((await db.query(`select empty_since from public.noob_rooms where id = $1`, [roomId])).rows[0].empty_since === null, 'someone coming back during the wait cancels it');
await quietFor('noob_room_participants', roomId, alice, 500);
await call(bob, `select public.list_noob_rooms()`);
await db.query(`update public.noob_rooms set empty_since = now() - interval '100 seconds' where id = $1`, [roomId]);
rooms = await one(alice, `select public.list_noob_rooms() as l`);
check(!rooms.find((r) => r.id === roomId), 'after 90 seconds with nobody back, the room ends and leaves the lobby');
check((await db.query(`select status from public.noob_rooms where id = $1`, [roomId])).rows[0].status === 'ended', 'it is marked ended');
const defaults = rooms.filter((r) => r.host == null);
check(defaults.length >= 1, 'the always-on default rooms stay, even with nobody inside');

const fresh = (await one(alice, `select public.start_noob_room('Brand new', 'General', '') as r`)).roomId;
check((await one(bob, `select public.list_noob_rooms() as l`)).some((r) => r.id === fresh), 'a brand-new room (host has not joined yet) is NOT ended by a lobby refresh');

section('1a. Leaving on purpose vs the app closing');
const room2 = (await one(alice, `select public.start_noob_room('Second', 'General', '') as r`)).roomId;
await call(alice, `select public.noob_room_join($1)`, [room2]);
await call(alice, `select public.leave_noob_room($1)`, [room2]);
check((await db.query(`select status from public.noob_rooms where id = $1`, [room2])).rows[0].status === 'live', 'the app closing (or a refresh) does not end the room at once');
await call(alice, `select public.noob_room_join($1)`, [room2]);
await call(alice, `select public.leave_noob_room($1, true)`, [room2]);
check((await db.query(`select status from public.noob_rooms where id = $1`, [room2])).rows[0].status === 'ended', 'tapping Leave as the last person ends the room right away, as before');
const room3 = (await one(alice, `select public.start_noob_room('Third', 'General', '') as r`)).roomId;
await call(alice, `select public.noob_room_join($1)`, [room3]);
await call(bob, `select public.noob_room_join($1)`, [room3]);
await call(alice, `select public.leave_noob_room($1, true)`, [room3]);
check((await db.query(`select status from public.noob_rooms where id = $1`, [room3])).rows[0].status === 'live', 'tapping Leave while others are inside leaves the room running');

section('1b. Only members of the app can use it');
let denied = false;
try { await db.exec(`set role anon`); await db.query(`select public.noob_room_heartbeat($1)`, [roomId]); } catch { denied = true; } finally { await db.exec(`reset role`); }
check(denied, 'a logged-out visitor can not send the signal');
let denied2 = false;
try { await db.exec(`set role authenticated`); await db.query(`select public.sweep_noob_rooms()`); } catch { denied2 = true; } finally { await db.exec(`reset role`); }
check(denied2, 'the cleanup function can not be called from the app');

// =========================================================================================== 2. Live Lounge
section('2. Live Lounge: an admitted guest who closes the app drops out of "In the room"');
await db.query(`insert into public.live_lounge_access (user_id, source) values ($1, 'gift'), ($2, 'gift'), ($3, 'gift')`, [alice, bob, carol]);
const lounge = await one(alice, `select public.start_live_lounge_room('Meeting') as r`);
await call(bob, `select public.join_live_lounge_room_by_code($1)`, [lounge.roomCode]);
await call(carol, `select public.join_live_lounge_room_by_code($1)`, [lounge.roomCode]);
await call(alice, `select public.live_lounge_room_admit($1, $2, true)`, [lounge.roomId, bob]);
await call(alice, `select public.live_lounge_room_admit($1, $2, true)`, [lounge.roomId, carol]);
const inRoom = async () => (await one(alice, `select public.live_lounge_room_participants_list($1) as l`, [lounge.roomId])).admitted.map((p) => p.userId);
check((await inRoom()).length === 3, 'host + two admitted guests are listed');

await quietFor('live_lounge_room_participants', lounge.roomId, bob, 200);
check(!(await inRoom()).includes(bob) && (await inRoom()).length === 2, 'bob went quiet: he is no longer listed');
check(await one(carol, `select public.live_lounge_room_my_status($1) as s`, [lounge.roomId]).then((s) => s.status) === 'admitted', 'carol (still polling) stays admitted');
check((await db.query(`select status from public.live_lounge_room_participants where room_id=$1 and user_id=$2`, [lounge.roomId, bob])).rows[0].status === 'admitted', 'bob is only hidden, not thrown out');
const back = await one(bob, `select public.live_lounge_room_my_status($1) as s`, [lounge.roomId]);
check(back.status === 'admitted' && back.roomStatus === 'active', 'bob refreshes / reopens the app: he is still admitted to the same meeting, no waiting room');
check((await inRoom()).includes(bob), 'and he is listed again straight away');

await quietFor('live_lounge_room_participants', lounge.roomId, alice, 900);
check((await inRoom()).includes(alice), 'the host is never dropped for being quiet');

await call(bob, `select public.leave_live_lounge_room($1)`, [lounge.roomId]);
check(await one(bob, `select public.live_lounge_room_my_status($1) as s`, [lounge.roomId]).then((s) => s.status) === 'left', 'tapping Leave really leaves');
await call(bob, `select public.join_live_lounge_room_by_code($1)`, [lounge.roomCode]);
check((await db.query(`select status from public.live_lounge_room_participants where room_id=$1 and user_id=$2`, [lounge.roomId, bob])).rows[0].status === 'waiting', 'after leaving on purpose, bob needs to be admitted again (waiting room)');

section('2b. Invited people and fresh admissions are not dropped');
const dave = await mkUser('dave');
await db.query(`insert into public.live_lounge_access (user_id, source) values ($1, 'gift')`, [dave]);
await call(alice, `select public.invite_to_live_lounge_room($1, $2)`, [lounge.roomId, dave]);
await quietFor('live_lounge_room_participants', lounge.roomId, dave, 3000); // invited an hour ago, never opened the app
await call(carol, `select public.live_lounge_room_my_status($1)`, [lounge.roomId]);
check((await db.query(`select status from public.live_lounge_room_participants where room_id=$1 and user_id=$2`, [lounge.roomId, dave])).rows[0].status === 'waiting', 'a pending invite stays pending');
await call(alice, `select public.live_lounge_room_admit($1, $2, true)`, [lounge.roomId, dave]);
await call(carol, `select public.live_lounge_room_my_status($1)`, [lounge.roomId]);
check((await db.query(`select status from public.live_lounge_room_participants where room_id=$1 and user_id=$2`, [lounge.roomId, dave])).rows[0].status === 'admitted', 'someone just admitted is not dropped before their app has checked in');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
