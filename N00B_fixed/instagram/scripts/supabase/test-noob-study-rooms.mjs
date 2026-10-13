// Tests migration 20261014000007 (NOOB STUDY, part 7): study rooms. Private groups with an invite code; what is shared with a room only when the
// student switches it on; kind fixed cheers; the owner's controls; and what happens when someone leaves or erases their data. On a REAL Postgres (PGlite).
//
// Usage: node scripts/supabase/test-noob-study-rooms.mjs
import { createTestDb, asUser, asAnon } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const expectFail = async (fn, pattern, label) => {
  try { await fn(); check(false, label, '(expected an error, but it succeeded)'); }
  catch (e) { check(pattern.test(e.message), label, `(got: ${e.message})`); }
};
const section = (t) => console.log(`\n${t}`);

const db = await createTestDb();
await db.exec("update public.study_settings set mode = 'on'");   // NOOB STUDY ships as "coming soon"; these tests are about everything that happens once it is open
const mkUser = async (name, display) => {
  const id = (await db.query(`select gen_random_uuid() as id`)).rows[0].id;
  await db.query(`insert into auth.users (id, email, encrypted_password) values ($1, $2, 'x')`, [id, `${name}@users.nooob.xyz`]);
  if (!(await db.query(`select 1 from public.profiles where id = $1`, [id])).rows.length) await db.query(`insert into public.profiles (id, username, display_name) values ($1, $2, $3)`, [id, name, display ?? name]);
  return id;
};
const rpc = (uid, fn, ...args) => asUser(db, uid, async () => (await db.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).rows[0].r);
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const J = (o) => JSON.stringify(o);

const ann = await mkUser('ann', 'Ann Lee'), ben = await mkUser('ben', 'Ben Ray'), cat = await mkUser('cat', 'Cat Moss'), dan = await mkUser('dan', 'Dan Fox'), eve = await mkUser('eve', 'Eve Kay');
for (const u of [ann, ben, cat, dan, eve]) await rpc(u, 'study_save_profile', J({ displayName: 'x' }), 1);
const event = (uid, minutes, daysAgo = 0, kind = 'focus_done') => db.query(`insert into public.study_events (user_id, kind, minutes, created_at) values ($1, $2, $3, now() - ($4 || ' days')::interval)`, [uid, kind, minutes, String(daysAgo)]);

section('1. Who can call what');
let anon = 0;
for (const call of [`study_rooms_list()`, `study_room_create('x', '', '', null)`, `study_room_join('ABC234')`, `study_room_get(gen_random_uuid())`]) { try { await asAnon(db, async () => db.query(`select public.${call}`)); } catch (e) { if (/permission denied/.test(e.message)) anon++; } }
check(anon === 4, 'someone not signed in cannot use rooms');
let direct = 0;
for (const t of ['study_rooms', 'study_room_members', 'study_room_cheers', 'study_room_tries']) { try { direct += (await asUser(db, ann, async () => db.query(`select * from public.${t}`))).rows.length; } catch { /* denied is fine */ } }
check(direct === 0, 'the room tables cannot be read directly');
let internal = 0;
for (const call of [`study_int_room_code()`, `study_int_in_room('${ann}', gen_random_uuid())`, `study_int_room_handover(gen_random_uuid(), '${ann}')`]) { try { await asUser(db, ann, async () => db.query(`select public.${call}`)); } catch (e) { if (/permission denied/.test(e.message)) internal++; } }
check(internal === 3, 'the helper functions are not available to students');

section('2. Making a room');
const room = await rpc(ann, 'study_room_create', 'Physics gang', 'Class 11 physics', 'Finish the chapter on motion', 600);
check(room.name === 'Physics gang' && /^[A-HJ-NP-Z2-9]{6}$/.test(room.code), 'a room has a name and a 6-letter invite code (no confusing letters like O and 0)', room.code);
const got = await rpc(ann, 'study_room_get', room.id);
check(got.room.role === 'owner' && got.room.code === room.code && got.room.memberCount === 1 && got.room.goalMinutes === 600 && got.room.maxMembers === 8, 'the maker is the owner and sees the code');
await expectFail(() => rpc(ann, 'study_room_create', '  ', '', '', null), /give your room a name/, 'a room needs a name');
await expectFail(() => rpc(ann, 'study_room_create', 'x', '', '', 5), /between 30 minutes and 100 hours/, 'a goal that is too small is refused');
await expectFail(() => rpc(ann, 'study_room_create', 'x', '', '', 99999), /between 30 minutes and 100 hours/, 'and one that is too big');
check((await rpc(ann, 'study_room_create', 'n'.repeat(200), 't'.repeat(300), 'g'.repeat(500), null)).name.length === 60, 'very long words are shortened');
for (let i = 0; i < 3; i++) await rpc(ann, 'study_room_create', 'Room ' + i, '', '', null);
await expectFail(() => rpc(ann, 'study_room_create', 'one too many', '', '', null), /run 5 rooms/, 'a student can run at most 5 rooms');
const codes = (await q(`select code from public.study_rooms`)).map((r) => r.code);
check(new Set(codes).size === codes.length, 'every room has its own code');
await db.query(`delete from public.study_rooms where name like 'Room %' or name like 'nnnn%'`);

section('3. Joining with the code');
const j1 = await rpc(ben, 'study_room_join', room.code.toLowerCase());
check(j1.success === true && j1.id === room.id && j1.already === false, 'a friend joins with the code, in any letter case');
check((await rpc(cat, 'study_room_join', '  ' + room.code.slice(0, 3) + '-' + room.code.slice(3) + ' ')).success === true, 'spaces and a dash in the code do not matter');
check((await rpc(ben, 'study_room_join', room.code)).already === true && (await rpc(ann, 'study_room_get', room.id)).room.memberCount === 3, 'joining twice changes nothing');
const bad = await rpc(dan, 'study_room_join', 'ZZZZZZ');
check(bad.success === false && /No room has that code/.test(bad.error), 'a wrong code is answered kindly, not with an error');
check((await rpc(dan, 'study_room_join', 'AB')).success === false && /does not look right/.test((await rpc(dan, 'study_room_join', '')).error), 'a code that is too short is explained');
for (let i = 0; i < 12; i++) await rpc(dan, 'study_room_join', 'ZZZ' + String(100 + i));
const blocked = await rpc(dan, 'study_room_join', room.code);
check(blocked.success === false && /lot of tries/.test(blocked.error), 'after many wrong guesses even the right code waits (so codes can not be found by trying)');
check((await q(`select count(*)::int as n from public.study_room_tries where user_id = $1`, [dan]))[0].n === 15, 'the wrong guesses were really remembered');
check((await rpc(eve, 'study_room_join', room.code)).success === true, 'one student\'s wrong guesses never block another');
await db.query(`delete from public.study_room_tries where user_id = $1`, [dan]);
for (const u of [dan]) check((await rpc(u, 'study_room_join', room.code)).success === true, 'after the wait the code works again');
const full = await rpc(ann, 'study_room_create', 'Full house', '', '', null);
const extra = [];
for (let i = 0; i < 4; i++) extra.push(await mkUser('x' + i));
for (const u of extra) await rpc(u, 'study_save_profile', J({ displayName: 'x' }), 1);
for (const u of [ben, cat, dan]) await rpc(u, 'study_room_join', full.code);
for (const u of extra) await rpc(u, 'study_room_join', full.code);
check((await rpc(ann, 'study_room_get', full.id)).room.memberCount === 8, 'a room holds up to 8 people');
const late = await mkUser('late');
await rpc(late, 'study_save_profile', J({ displayName: 'x' }), 1);
const fullTry = await rpc(late, 'study_room_join', full.code);
check(fullTry.success === false && /room is full/.test(fullTry.error), 'a ninth person is told the room is full');
await db.query(`insert into public.study_rooms (owner_id, name, code) select $1, 'filler ' || g, 'FILL' || lpad(g::text, 2, '0') from generate_series(1, 10) g`, [late]);
await db.query(`insert into public.study_room_members (room_id, user_id) select id, $1 from public.study_rooms where owner_id = $1 limit 10`, [late]);
await db.query(`delete from public.study_room_members where room_id = $1 and user_id = $2`, [full.id, late]);
const tenRooms = await rpc(late, 'study_room_join', room.code);
check(tenRooms.success === false && /10 rooms already/.test(tenRooms.error), 'a student can be in at most 10 rooms');
await db.query(`delete from public.study_rooms where owner_id = $1`, [late]);

section('4. Who sees the room');
const bGet = await rpc(ben, 'study_room_get', room.id);
check(bGet.room.role === 'member' && bGet.room.code === null && bGet.members.length === 5, 'a member sees the room and its members, but not the invite code');
check(bGet.members[0].role === 'owner' && bGet.members[0].displayName === 'Ann Lee' && bGet.members.filter((m) => m.isMe).length === 1, 'the owner is listed first, with real names, and "me" is marked');
await expectFail(() => rpc(late, 'study_room_get', room.id), /not in this room/, 'someone outside the room cannot look inside');
await expectFail(() => rpc(late, 'study_room_settings', room.id, true, true), /not in this room/, 'nor change settings in it');
check((await rpc(late, 'study_rooms_list')).rooms.length === 0, 'someone outside sees none of its rooms');
const bList = (await rpc(ben, 'study_rooms_list')).rooms;
const bRoom = bList.find((r) => r.id === room.id);
check(bList.length === 2 && bRoom && bRoom.name === 'Physics gang' && bRoom.members === 5 && bRoom.role === 'member', 'a student\'s own list shows their rooms (here two)');
await db.query(`update public.profiles set avatar = $2 where id = $1`, [ben, 'data:image/jpeg;base64,' + 'A'.repeat(5000)]);
await db.query(`update public.profiles set avatar = '/pics/cat.png' where id = $1`, [cat]);
const av = (await rpc(ann, 'study_room_get', room.id)).members;
check(av.find((m) => m.userId === ben).avatar === null && av.find((m) => m.userId === cat).avatar === '/pics/cat.png', 'a huge inline picture is never sent (only a normal picture address)');

section('5. Only what each student chooses to share');
await event(ann, 60, 1); await event(ann, 30, 3, 'session_done'); await event(ann, 500, 10); await event(ben, 45, 2); await event(cat, 90, 0); await event(cat, 20, 1, 'practice');
const d0 = await rpc(ann, 'study_room_get', room.id);
const byId = (g, id) => g.members.find((m) => m.userId === id);
check(byId(d0, ann).minutes === 90 && byId(d0, ann).studyingNow === false, 'a student always sees their own minutes this week (older ones do not count)');
check(byId(d0, ben).minutes === null && byId(d0, ben).studyingNow === null && byId(d0, cat).minutes === null, 'by default nobody else\'s minutes or "focusing now" are shown');
check(d0.totalMinutes === 90 && d0.sharingCount === 1, 'the room total counts only what is shared (and your own)');
await rpc(ben, 'study_room_settings', room.id, true, null);
const d1 = await rpc(ann, 'study_room_get', room.id);
check(byId(d1, ben).minutes === 45 && byId(d1, ben).sharesMinutes === true && byId(d1, cat).minutes === null, 'when Ben switches sharing on, his minutes appear (and only his)');
check(d1.totalMinutes === 135 && d1.sharingCount === 2, 'the total grows');
check((await rpc(ben, 'study_room_get', room.id)).me.shareMinutes === true && (await rpc(ben, 'study_room_get', room.id)).me.shareStatus === false, 'a student sees their own choices');
await rpc(ben, 'study_room_settings', room.id, false, null);
check(byId(await rpc(ann, 'study_room_get', room.id), ben).minutes === null, 'switching it off hides them again at once');
check((await rpc(ben, 'study_room_settings', room.id, null, true)).shareStatus === true && (await rpc(ben, 'study_room_get', room.id)).me.shareMinutes === false, 'settings change one thing at a time');
check(byId(await rpc(ann, 'study_room_get', room.id), ben).studyingNow === false, 'sharing "focusing now" shows "not now" when there is no timer running');
await rpc(ben, 'study_focus_start', null, 25, 'focus');
check(byId(await rpc(ann, 'study_room_get', room.id), ben).studyingNow === true, 'while a focus timer runs, a friend who chose to show it is "focusing now"');
check(byId(await rpc(ann, 'study_room_get', room.id), cat).studyingNow === null, 'a friend who did not choose to show it is never revealed');
await db.query(`update public.study_focus_sessions set started_at = now() - interval '2 hours' where user_id = $1`, [ben]);
check(byId(await rpc(ann, 'study_room_get', room.id), ben).studyingNow === false, 'a timer left running long ago is not "focusing now"');
await db.query(`update public.study_focus_sessions set started_at = now(), status = 'completed' where user_id = $1`, [ben]);
check(byId(await rpc(ann, 'study_room_get', room.id), ben).studyingNow === false, 'a finished timer is not "focusing now"');
await rpc(ben, 'study_room_settings', room.id, false, false);
check(!JSON.stringify(await rpc(ann, 'study_room_get', room.id)).includes('"subject"'), 'a student\'s subjects are never shown to the room');

section('6. Cheers');
check((await rpc(ann, 'study_room_cheer', room.id, ben, 'cheer')).success === true && (await rpc(ann, 'study_room_cheer', room.id, null, 'start')).success === true, 'a cheer can go to a friend or to everyone');
const ch = (await rpc(ben, 'study_room_get', room.id)).cheers;
check(ch.length === 2 && ch.find((c) => c.kind === 'cheer').toMe === true && ch.find((c) => c.kind === 'start').to === null && ch[0].from === 'Ann Lee', 'friends see them, and which are for them');
await expectFail(() => rpc(ann, 'study_room_cheer', room.id, ben, 'insult'), /cheer is not known/, 'only the few kind cheers exist (there is no free text)');
await expectFail(() => rpc(ann, 'study_room_cheer', room.id, ann, 'cheer'), /not yourself/, 'a student can not cheer themselves');
await expectFail(() => rpc(ann, 'study_room_cheer', room.id, late, 'cheer'), /not in this room/, 'nor someone who is not in the room');
await expectFail(() => rpc(late, 'study_room_cheer', room.id, ann, 'cheer'), /not in this room/, 'nor can someone outside send one');
for (let i = 0; i < 20; i++) await rpc(cat, 'study_room_cheer', room.id, ann, 'proud');
await expectFail(() => rpc(cat, 'study_room_cheer', room.id, ann, 'proud'), /plenty of cheers/, 'at most 20 cheers a day');
check((await rpc(ann, 'study_room_get', room.id)).cheers.length === 12, 'the room shows the latest 12');
await db.query(`delete from public.study_room_cheers where from_user = $1`, [cat]);

section('7. The owner\'s controls');
await expectFail(() => rpc(ben, 'study_room_update', room.id, 'Hijack', '', '', null), /Only the person who made the room/, 'only the owner can change the room');
const upd = await rpc(ann, 'study_room_update', room.id, 'Physics crew', 'Motion', 'Finish chapter 5', 900);
check(upd.name === 'Physics crew' && (await rpc(ben, 'study_room_get', room.id)).room.goalMinutes === 900, 'the owner can change the name and the goal');
await expectFail(() => rpc(ann, 'study_room_update', room.id, '', '', '', null), /give your room a name/, 'the name can not be emptied');
await expectFail(() => rpc(ben, 'study_room_regenerate_code', room.id), /Only the person who made the room/, 'only the owner can change the code');
const oldCode = room.code;
const newCode = (await rpc(ann, 'study_room_regenerate_code', room.id)).code;
check(newCode !== oldCode && /^[A-Z0-9]{6}$/.test(newCode), 'the owner can make a new code');
check((await rpc(late, 'study_room_join', oldCode)).success === false && (await rpc(late, 'study_room_join', newCode)).success === true, 'the old code stops working and the new one works');
await rpc(late, 'study_room_leave', room.id);
await expectFail(() => rpc(ben, 'study_room_remove_member', room.id, cat), /Only the person who made the room/, 'only the owner can remove someone');
await expectFail(() => rpc(ann, 'study_room_remove_member', room.id, ann), /Leave the room/, 'the owner can not remove themselves (they leave instead)');
check((await rpc(ann, 'study_room_remove_member', room.id, eve)).removed === true && (await rpc(ann, 'study_room_get', room.id)).room.memberCount === 4, 'the owner can remove a member');
await expectFail(() => rpc(eve, 'study_room_get', room.id), /not in this room/, 'who then can not look inside');
check((await rpc(ann, 'study_room_remove_member', room.id, eve)).removed === false, 'removing someone who is not there does nothing');
check((await rpc(ben, 'study_room_delete', room.id)).deleted === false && (await rpc(ann, 'study_rooms_list')).rooms.some((r) => r.id === room.id), 'only the owner can close the room');

section('8. Leaving');
check((await rpc(cat, 'study_room_leave', room.id)).left === true && (await rpc(cat, 'study_rooms_list')).rooms.every((r) => r.id !== room.id), 'a member can leave');
check((await rpc(cat, 'study_room_leave', room.id)).left === false && (await rpc(late, 'study_room_leave', room.id)).left === false, 'leaving a room you are not in does nothing');
await rpc(cat, 'study_room_join', newCode);
await db.query(`update public.study_room_members set joined_at = now() - interval '5 days' where room_id = $1 and user_id = $2`, [room.id, ben]);
check((await rpc(ann, 'study_room_leave', room.id)).left === true, 'the owner can leave');
const after = await rpc(ben, 'study_room_get', room.id);
check(after.room.role === 'owner' && after.room.code !== null && after.members[0].displayName === 'Ben Ray' && after.room.memberCount === 3, 'the room goes to the member who has been there longest, who becomes the owner');
check((await q(`select owner_id from public.study_rooms where id = $1`, [room.id]))[0].owner_id === ben, 'in the database too');
await rpc(cat, 'study_room_leave', room.id); await rpc(dan, 'study_room_leave', room.id);
check((await rpc(ben, 'study_room_leave', room.id)).left === true && (await q(`select count(*)::int as n from public.study_rooms where id = $1`, [room.id]))[0].n === 0, 'when the last person leaves, the room is closed');
check((await q(`select count(*)::int as n from public.study_room_members where room_id = $1`, [room.id]))[0].n === 0 && (await q(`select count(*)::int as n from public.study_room_cheers where room_id = $1`, [room.id]))[0].n === 0, 'and nothing of it is left behind');

section('9. When someone erases their data or their account');
const r2 = await rpc(ann, 'study_room_create', 'Maths club', '', '', null);
for (const u of [ben, cat]) await rpc(u, 'study_room_join', r2.code);
await db.query(`update public.study_room_members set joined_at = now() - interval '3 days' where room_id = $1 and user_id = $2`, [r2.id, cat]);
await rpc(ann, 'study_delete_my_data', 'all');
const own = await q(`select owner_id from public.study_rooms where id = $1`, [r2.id]);
check(own.length === 1 && own[0].owner_id === cat, 'when the owner erases everything, the room goes to the longest-standing member');
check((await rpc(cat, 'study_room_get', r2.id)).room.role === 'owner' && (await rpc(ben, 'study_room_get', r2.id)).room.memberCount === 2, 'the others carry on, one of them now the owner');
await rpc(ben, 'study_delete_my_data', 'all');
check((await rpc(cat, 'study_room_get', r2.id)).room.memberCount === 1, 'a plain member erasing everything just leaves');
await rpc(cat, 'study_delete_my_data', 'all');
check((await q(`select count(*)::int as n from public.study_rooms where id = $1`, [r2.id]))[0].n === 0, 'when the last person erases everything, the room is closed');
const r3 = await rpc(dan, 'study_room_create', 'Account test', '', '', null);
await rpc(eve, 'study_room_join', r3.code);
await db.query(`delete from public.profiles where id = $1`, [dan]);
check((await q(`select owner_id from public.study_rooms where id = $1`, [r3.id]))[0].owner_id === eve, 'when the owner\'s whole NOOB account is deleted, the room goes to a member');
await db.query(`delete from public.profiles where id = $1`, [eve]);
check((await q(`select count(*)::int as n from public.study_rooms where id = $1`, [r3.id]))[0].n === 0, 'and closes when the last person\'s account is deleted');
const orphan = await q(`select (select count(*) from public.study_room_members m where not exists (select 1 from public.study_rooms r where r.id = m.room_id)) + (select count(*) from public.study_room_cheers c where not exists (select 1 from public.study_rooms r where r.id = c.room_id)) as n`);
check(Number(orphan[0].n) === 0, 'nothing is ever left behind without its room');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
