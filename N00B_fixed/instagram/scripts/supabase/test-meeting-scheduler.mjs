// Tests migration 20261011000004: planned Live Lounge meetings (schedule, repeat, invite, passcode, waiting room, who may join,
// registration, lock, chat, reminders, helpers for scheduling on someone's behalf), on a REAL Postgres (PGlite) with every migration applied.
//
// Usage: node scripts/supabase/test-meeting-scheduler.mjs
import { createTestDb, asUser } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const expectFail = async (fn, pattern, label) => {
  try { await fn(); check(false, label, '(expected an error, but it succeeded)'); }
  catch (e) { check(pattern.test(e.message), label, `(got: ${e.message})`); }
};
const section = (t) => console.log(`\n${t}`);

const db = await createTestDb();
const mkUser = async (name, email = null) => {
  const id = (await db.query(`select gen_random_uuid() as id`)).rows[0].id;
  await db.query(`insert into auth.users (id, email, encrypted_password) values ($1, $2, 'x')`, [id, `${name}@users.nooob.xyz`]);
  const has = (await db.query(`select 1 from public.profiles where id = $1`, [id])).rows.length;
  if (!has) await db.query(`insert into public.profiles (id, username, display_name) values ($1, $2, $2)`, [id, name]);
  if (email) await db.query(`insert into public.profile_private (user_id, email) values ($1, $2) on conflict (user_id) do update set email = excluded.email`, [id, email]);
  return id;
};
const call = (uid, sql, params = []) => asUser(db, uid, async () => (await db.query(sql, params)).rows);
const rpc = async (uid, fn, ...args) => (await call(uid, `select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args))[0].r;
const J = (o) => JSON.stringify(o);
const inMinutes = (m) => new Date(Date.now() + m * 60000).toISOString();
const inDays = (d, h = 10) => { const t = new Date(Date.now() + d * 86400000); t.setUTCHours(h, 0, 0, 0); return t.toISOString(); };
const notes = async (uid, type = 'live_lounge_meeting') => (await db.query(`select * from public.notifications where target_user_id = $1 and type = $2 order by created_at`, [uid, type])).rows;

const host = await mkUser('host', 'host@school.edu');
const g1 = await mkUser('guest1', 'g1@gmail.com');
const g2 = await mkUser('guest2', 'g2@gmail.com');
const g3 = await mkUser('guest3', 'g3@school.edu');
const pa = await mkUser('pa', 'pa@gmail.com');

const base = (extra = {}) => ({ title: 'Robotics club', description: 'Weekly sync', meetingType: 'class', scheduledFor: inDays(1), durationMinutes: 45, timezone: 'Asia/Kolkata', waitingRoom: true, passcode: 'abc123', ...extra });

// ====================================================================================================== 1. personal id
section('1. Personal Meeting ID');
const pmi = await rpc(host, 'live_lounge_my_personal_id');
check(/^\d{10}$/.test(pmi) && (await rpc(host, 'live_lounge_my_personal_id')) === pmi, 'a fixed 10-digit number per person');
check((await rpc(g1, 'live_lounge_my_personal_id')) !== pmi, 'and everyone has their own');

// ====================================================================================================== 2. scheduling
section('2. Scheduling and its checks');
await expectFail(() => rpc(host, 'save_live_lounge_meeting', J(base({ title: '  ' }))), /title/, 'a title is required');
await expectFail(() => rpc(host, 'save_live_lounge_meeting', J(base({ scheduledFor: inMinutes(-600) }))), /already passed/, 'a time in the past is refused');
await expectFail(() => rpc(host, 'save_live_lounge_meeting', J(base({ timezone: 'Mars/Base' }))), /time zone/, 'an unknown time zone is refused');
await expectFail(() => rpc(host, 'save_live_lounge_meeting', J(base({ passcode: 'a b' }))), /passcode/, 'a bad passcode is refused');
await expectFail(() => rpc(host, 'save_live_lounge_meeting', J(base({ durationMinutes: 2 }))), /5 minutes/, 'too short is refused');
await expectFail(() => rpc(host, 'save_live_lounge_meeting', J(base({ recurrence: 'weekly' }))), /ends/, 'a repeating meeting must say when it ends');
await expectFail(() => rpc(host, 'save_live_lounge_meeting', J(base({ restrictDomains: true, allowedDomains: [] }))), /domain/, 'a domain restriction needs a domain');
await expectFail(() => rpc(host, 'save_live_lounge_meeting', J(base({ allowedDomains: ['not a domain'] }))), /looks like/, 'a bad domain is refused');
const m1 = await rpc(host, 'save_live_lounge_meeting', J(base({ inviteeIds: [g1, g3] })));
check(/^\d{9}$/.test(m1.meetingCode) && m1.passcode === 'abc123' && m1.waitingRoom === true && m1.timezone === 'Asia/Kolkata', 'a meeting gets a 9-digit Meeting ID and keeps its settings', J(m1));
check((await notes(g1)).length === 1 && (await notes(g3)).length === 1 && (await notes(g2)).length === 0, 'the invited people are notified, nobody else');
check(/Meeting ID/.test((await notes(g1))[0].title), 'the notification says when and which Meeting ID');

section('3. Updating and who may');
await expectFail(() => rpc(g1, 'save_live_lounge_meeting', J(base({ title: 'Hijack' })), m1.id), /Only the host/, 'a guest cannot change the meeting');
const m1b = await rpc(host, 'save_live_lounge_meeting', J(base({ title: 'Robotics club v2', passcode: 'zzz999', inviteeIds: [g1, g3, pa] })), m1.id);
check(m1b.title === 'Robotics club v2' && m1b.passcode === 'zzz999' && m1b.meetingCode === m1.meetingCode, 'the host changes it; the Meeting ID stays');
check((await notes(g1)).length === 1 && (await notes(pa)).length === 1, 'only the newly added person is notified');
await rpc(host, 'save_live_lounge_meeting', J(base({ title: 'Robotics club v2', passcode: 'zzz999', inviteeIds: [g1, g3] })), m1.id);
check((await rpc(host, 'live_lounge_meeting_details', m1.id)).invitees.length === 2, 'people taken off the list in the form are removed');

// ====================================================================================================== 3. looking
section('4. Upcoming meetings and details');
let list = await rpc(host, 'my_live_lounge_meetings');
check(list.length === 1 && list[0].isHost && list[0].canManage && list[0].passcode === 'zzz999', 'the host sees it, with the passcode');
list = await rpc(g1, 'my_live_lounge_meetings');
check(list.length === 1 && !list[0].canManage && list[0].passcode === 'zzz999' && list[0].allowedDomains === null, 'an invited person sees it with the passcode, but not the host-only settings');
check((await rpc(g2, 'my_live_lounge_meetings')).length === 0, 'a stranger does not see it');
await expectFail(() => rpc(g2, 'live_lounge_meeting_details', m1.id), /not invited/, 'and cannot open its details');
const det = await rpc(host, 'live_lounge_meeting_details', m1.id);
check(det.invitees.map((i) => i.username).sort().join() === 'guest1,guest3' && det.invitees.every((i) => i.joined === false), 'the host sees the guest list and who has joined');

section('5. A repeating meeting');
const rec = await rpc(host, 'save_live_lounge_meeting', J(base({ title: 'Daily stand-up', scheduledFor: inDays(1), recurrence: 'daily', recurrenceCount: 4 })));
list = (await rpc(host, 'my_live_lounge_meetings', 30)).filter((x) => x.id === rec.id);
check(list.length === 4, 'four occurrences are listed', String(list.length));
const second = list[1].occurrenceStart;
await rpc(host, 'cancel_live_lounge_meeting', rec.id, second);
list = (await rpc(host, 'my_live_lounge_meetings', 30)).filter((x) => x.id === rec.id);
check(list.length === 3 && !list.some((x) => x.occurrenceStart === second), 'one day can be skipped without cancelling the rest');
const wk = await rpc(host, 'save_live_lounge_meeting', J(base({ title: 'Weekly', scheduledFor: inDays(1), recurrence: 'weekly', recurrenceEndDate: new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10) })));
check((await rpc(host, 'my_live_lounge_meetings', 60)).filter((x) => x.id === wk.id).length === 3, 'a weekly meeting stops at its end date');

// ====================================================================================================== 4. start + join
section('6. Starting, and joining with a passcode and the waiting room');
await expectFail(() => rpc(g1, 'start_live_lounge_meeting', m1.id), /Only the host/, 'only the host can start it');
await expectFail(() => rpc(g1, 'join_live_lounge_room_by_code', m1.meetingCode, 'zzz999'), /not started/, 'before it starts, a guest is told when it is planned');
const started = await rpc(host, 'start_live_lounge_meeting', m1.id);
check(started.roomCode === m1.meetingCode && !!started.roomId, 'starting opens a room whose code is the Meeting ID');
check((await notes(g1)).some((n) => /Join now/.test(n.title)), 'the invited people are told it has started');
check((await rpc(host, 'start_live_lounge_meeting', m1.id)).roomId === started.roomId, 'starting again takes the host back into the same room');
await expectFail(() => rpc(g1, 'join_live_lounge_room_by_code', m1.meetingCode, null), /passcode/, 'no passcode: refused');
await expectFail(() => rpc(g1, 'join_live_lounge_room_by_code', m1.meetingCode, 'wrong'), /not right/, 'wrong passcode: refused');
const j1 = await rpc(g1, 'join_live_lounge_room_by_code', '  ' + m1.meetingCode.slice(0, 3) + ' ' + m1.meetingCode.slice(3), 'ZZZ999');
check(j1.roomId === started.roomId && j1.status === 'waiting', 'right passcode (any capitals, spaces in the ID): into the waiting room');
const lst = await rpc(host, 'live_lounge_room_participants_list', started.roomId);
check(lst.waiting.some((w) => w.username === 'guest1'), 'the host sees them waiting');
await rpc(host, 'live_lounge_room_admit', started.roomId, g1, true);

section('7. Who may join');
const m2 = await rpc(host, 'save_live_lounge_meeting', J(base({ title: 'Private', passcode: '', restrictUsers: true, inviteeIds: [g1] })));
await rpc(host, 'start_live_lounge_meeting', m2.id);
check((await rpc(g1, 'join_live_lounge_room_by_code', m2.meetingCode, null)).status === 'waiting', 'an invited person can join without a passcode when there is none');
await expectFail(() => rpc(g2, 'join_live_lounge_room_by_code', m2.meetingCode, null), /people the host chose/, 'someone who was not invited is refused');
const m3 = await rpc(host, 'save_live_lounge_meeting', J(base({ title: 'School only', passcode: '', restrictDomains: true, allowedDomains: ['school.edu'] })));
await rpc(host, 'start_live_lounge_meeting', m3.id);
check((await rpc(g3, 'join_live_lounge_room_by_code', m3.meetingCode, null)).roomId, 'an e-mail from the allowed domain can join');
await expectFail(() => rpc(g2, 'join_live_lounge_room_by_code', m3.meetingCode, null), /people the host chose/, 'another domain cannot');

section('8. No waiting room, and joining before the host');
const m4 = await rpc(host, 'save_live_lounge_meeting', J(base({ title: 'Open door', passcode: '', waitingRoom: false })));
await rpc(host, 'start_live_lounge_meeting', m4.id);
check((await rpc(g2, 'join_live_lounge_room_by_code', m4.meetingCode, null)).status === 'admitted', 'with the waiting room off, people go straight in');
const m5 = await rpc(host, 'save_live_lounge_meeting', J(base({ title: 'Early birds', passcode: '', waitingRoom: false, joinBeforeHost: true, scheduledFor: inMinutes(10) })));
const early = await rpc(g2, 'join_live_lounge_room_by_code', m5.meetingCode, null);
check(early.status === 'admitted', 'join-before-host lets a guest in before the host (ten minutes to go)');
check((await rpc(host, 'start_live_lounge_meeting', m5.id)).roomId === early.roomId, 'the host then arrives in that same room');
const m6 = await rpc(host, 'save_live_lounge_meeting', J(base({ title: 'Too early', passcode: '', waitingRoom: false, joinBeforeHost: true, scheduledFor: inDays(2) })));
await expectFail(() => rpc(g2, 'join_live_lounge_room_by_code', m6.meetingCode, null), /not started/, 'but not days before it');
const m7 = await rpc(host, 'save_live_lounge_meeting', J(base({ title: 'Waiting room wins', passcode: '', waitingRoom: true, joinBeforeHost: true })));
check(m7.joinBeforeHost === false, 'a waiting room turns join-before-host off');

section('9. Registration');
const m8 = await rpc(host, 'save_live_lounge_meeting', J(base({ title: 'Webinar', meetingType: 'webinar', passcode: '', registrationRequired: true, registrationApproval: 'manual' })));
await rpc(host, 'start_live_lounge_meeting', m8.id);
await expectFail(() => rpc(g1, 'join_live_lounge_room_by_code', m8.meetingCode, null), /Registration is required/, 'without registering: refused');
const rg = await rpc(g1, 'register_for_live_lounge_meeting', m8.meetingCode, 'I love robots');
check(rg.status === 'pending' && (await notes(host)).some((n) => /Asked to join/.test(n.title)), 'registering waits for the host, who is told');
await expectFail(() => rpc(g1, 'join_live_lounge_room_by_code', m8.meetingCode, null), /waiting for the host to approve/, 'pending: still refused');
check((await rpc(host, 'live_lounge_meeting_details', m8.id)).registrations[0].note === 'I love robots', 'the host sees who registered and what they wrote');
await rpc(host, 'review_live_lounge_registration', m8.id, g1, true);
check((await rpc(g1, 'join_live_lounge_room_by_code', m8.meetingCode, null)).roomId, 'approved: can join');
const m9 = await rpc(host, 'save_live_lounge_meeting', J(base({ title: 'Auto webinar', passcode: '', registrationRequired: true, registrationApproval: 'auto' })));
check((await rpc(g2, 'register_for_live_lounge_meeting', m9.meetingCode, '')).status === 'approved', 'automatic approval admits at once');
await expectFail(() => rpc(g2, 'register_for_live_lounge_meeting', m4.meetingCode, ''), /does not need registration/, 'a meeting without registration refuses it');

section('10. Lock, chat and the rules inside the room');
const room1 = started.roomId;
await rpc(host, 'set_live_lounge_room_locked', room1, true);
await expectFail(() => rpc(g3, 'join_live_lounge_room_by_code', m1.meetingCode, 'zzz999'), /locked/, 'a locked meeting refuses newcomers');
await expectFail(() => rpc(g1, 'set_live_lounge_room_locked', room1, false), /Only the host/, 'only the host can unlock');
check((await rpc(host, 'start_live_lounge_meeting', m1.id)).roomId === room1, 'the host can always get back in');
await rpc(host, 'set_live_lounge_room_locked', room1, false);
const m10 = await rpc(host, 'save_live_lounge_meeting', J(base({ title: 'Auto lock', passcode: '', waitingRoom: false, autoLock: true, chatEnabled: false, inviteeIds: [g1, g2] })));
const r10 = await rpc(host, 'start_live_lounge_meeting', m10.id);
await rpc(g1, 'join_live_lounge_room_by_code', m10.meetingCode, null);
await rpc(host, 'live_lounge_room_participants_list', r10.roomId);
check((await rpc(g3, 'live_lounge_room_my_status', r10.roomId)) === null, 'a stranger gets nothing about the room');
check(!(await db.query(`select locked from public.live_lounge_rooms where id = $1`, [r10.roomId])).rows[0].locked, 'not locked while one invited person is still missing');
await rpc(g2, 'join_live_lounge_room_by_code', m10.meetingCode, null);
await rpc(host, 'live_lounge_room_participants_list', r10.roomId);
check((await db.query(`select locked from public.live_lounge_rooms where id = $1`, [r10.roomId])).rows[0].locked === true, 'it locks by itself once everyone invited has arrived');
await expectFail(() => rpc(g1, 'live_lounge_room_chat_send', r10.roomId, 'hello'), /turned chat off/, 'chat is off when the host said so');
const st = await rpc(g1, 'live_lounge_room_my_status', r10.roomId);
check(st.settings.chatEnabled === false && st.settings.passcode === null && st.locked === true, 'a guest is told the rules but not the passcode');
const sth = await rpc(host, 'live_lounge_room_my_status', room1);
check(sth.settings.passcode === 'zzz999' && sth.settings.meetingCode === m1.meetingCode, 'the host also gets the passcode');
check((await rpc(host, 'live_lounge_room_chat_send', room1, 'welcome')).text === 'welcome', 'chat works when it is on');

section('11. Cancelling');
await rpc(host, 'cancel_live_lounge_meeting', m6.id);
check((await rpc(host, 'my_live_lounge_meetings')).every((x) => x.id !== m6.id), 'a cancelled meeting leaves the list');
await expectFail(() => rpc(g1, 'cancel_live_lounge_meeting', m1.id), /not found/, 'a guest cannot cancel it');
await rpc(host, 'cancel_live_lounge_meeting', m1.id);
check((await notes(g1)).some((n) => /Cancelled the meeting/.test(n.title)), 'invited people are told it was cancelled');

section('12. Scheduling on someone\'s behalf');
await expectFail(() => rpc(pa, 'save_live_lounge_meeting', J(base({ hostId: host }))), /not allowed you/, 'not without the host\'s permission');
await rpc(host, 'set_live_lounge_assistant', pa, true);
const forHost = await rpc(pa, 'save_live_lounge_meeting', J(base({ title: 'By assistant', hostId: host })));
check(forHost.hostId === host && forHost.createdBy === pa, 'with permission the meeting is the host\'s, made by the assistant');
check((await rpc(host, 'my_live_lounge_meetings')).some((x) => x.id === forHost.id) && (await rpc(pa, 'my_live_lounge_meetings')).some((x) => x.id === forHost.id), 'both see it, and both can manage it');
await expectFail(() => rpc(pa, 'save_live_lounge_meeting', J(base({ hostId: host, usesPersonalId: true }))), /own meetings/, 'the personal ID stays personal');
const asst = await rpc(pa, 'my_live_lounge_assistants');
check(asst.hostsForMe.length === 1 && (await rpc(host, 'my_live_lounge_assistants')).allowed.length === 1, 'each side can see the arrangement');
await rpc(host, 'set_live_lounge_assistant', pa, false);
await expectFail(() => rpc(pa, 'save_live_lounge_meeting', J(base({ hostId: host }))), /not allowed you/, 'and the host can take it back');

section('13. Instant meeting with the Personal Meeting ID');
const inst = await rpc(host, 'save_live_lounge_meeting', J(base({ title: 'Quick chat', instant: true, usesPersonalId: true, passcode: '' })));
check(inst.meetingCode === pmi && inst.instant === true, 'an instant meeting can use the personal ID');
const ir = await rpc(host, 'start_live_lounge_meeting', inst.id);
check(ir.roomCode === pmi, 'and its room has that code');

section('14. Reminders');
const rem = await rpc(host, 'save_live_lounge_meeting', J(base({ title: 'Soon', passcode: '', scheduledFor: inMinutes(8), reminderMinutes: 10, inviteeIds: [g1] })));
const reminders = async (uid) => (await notes(uid)).filter((n) => /Reminder/.test(n.title) && /"Soon"/.test(n.title)).length;
await db.query(`select public.send_live_lounge_meeting_reminders()`);
check((await reminders(host)) === 1 && (await reminders(g1)) === 1 && (await reminders(g2)) === 0, 'the host and the invited people get a reminder (nobody else)');
await db.query(`select public.send_live_lounge_meeting_reminders()`);
check((await reminders(host)) === 1 && (await reminders(g1)) === 1, 'only one reminder per meeting time');
const far = await rpc(host, 'save_live_lounge_meeting', J(base({ title: 'Later', scheduledFor: inDays(3) })));
await db.query(`select public.send_live_lounge_meeting_reminders()`);
check(!(await notes(host)).some((n) => /"Later"/.test(n.title) && /Reminder/.test(n.title)), 'nothing for a meeting that is days away');

section('15. Ordinary rooms still work');
const old = (await call(host, `select public.start_live_lounge_room($1) as r`, ['Plain room']))[0].r;
const oj = await rpc(g2, 'join_live_lounge_room_by_code', old.roomCode);
check(oj.roomId === old.roomId && oj.status === 'waiting', 'a plain room code still goes through the waiting room');
await expectFail(() => rpc(g2, 'join_live_lounge_room_by_code', 'NOPE12'), /not valid/, 'an unknown code is refused');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
