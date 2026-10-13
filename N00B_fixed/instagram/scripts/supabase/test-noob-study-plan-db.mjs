// Tests migration 20261014000003 (NOOB STUDY, part 3): the plan settings (days kept free), adding a plan's sessions without replacing anything,
// and the rule that a plan session becomes the student's own once they change it. On a REAL Postgres (PGlite) with every migration applied.
//
// Usage: node scripts/supabase/test-noob-study-plan-db.mjs
import { createTestDb, asUser, asAnon } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const expectFail = async (fn, pattern, label) => {
  try { await fn(); check(false, label, '(expected an error, but it succeeded)'); }
  catch (e) { check(pattern.test(e.message), label, `(got: ${e.message})`); }
};
const section = (t) => console.log(`\n${t}`);

const db = await createTestDb();
const mkUser = async (name) => {
  const id = (await db.query(`select gen_random_uuid() as id`)).rows[0].id;
  await db.query(`insert into auth.users (id, email, encrypted_password) values ($1, $2, 'x')`, [id, `${name}@users.nooob.xyz`]);
  const has = (await db.query(`select 1 from public.profiles where id = $1`, [id])).rows.length;
  if (!has) await db.query(`insert into public.profiles (id, username, display_name) values ($1, $2, $2)`, [id, name]);
  return id;
};
const rpc = (uid, fn, ...args) => asUser(db, uid, async () => (await db.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).rows[0].r);
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const J = (o) => JSON.stringify(o);

const ann = await mkUser('ann'), bob = await mkUser('bob');
await rpc(ann, 'study_save_profile', J({ displayName: 'Ann', level: 'class_12' }), 1);
const subj = (await rpc(ann, 'study_set_subjects', J(['Physics', 'Maths']))).subjects;
const phys = subj[0].id, maths = subj[1].id;
const bobSubj = (await rpc(bob, 'study_set_subjects', J(['History']))).subjects[0].id;
const at = (h, m = 0, d = 20) => `2026-11-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`;
const item = (o = {}) => ({ subjectId: phys, topic: 'Waves', startsAt: at(10), durationMin: 30, objective: 'Learn', activity: 'study', priority: 'normal', why: 'Because', ...o });
const from = '2026-11-20T00:00:00Z', to = '2026-11-27T00:00:00Z';
const list = async (uid) => (await rpc(uid, 'study_sessions_list', from, to)).sessions;

section('1. Who can call what');
let anon = 0;
for (const call of [`study_plan_prefs_get()`, `study_plan_prefs_save('[]'::jsonb, 7)`, `study_sessions_add_plan('[]'::jsonb)`]) { try { await asAnon(db, async () => db.query(`select public.${call}`)); } catch (e) { if (/permission denied/.test(e.message)) anon++; } }
check(anon === 3, 'someone not signed in cannot use any of them');
let direct = 0;
try { direct += (await asUser(db, ann, async () => db.query(`select * from public.study_plan_prefs`))).rows.length; } catch { /* denied is fine */ }
check(direct === 0, 'the settings table cannot be read directly');

section('2. Plan settings');
const none = await rpc(ann, 'study_plan_prefs_get');
check(none.saved === false && none.restDays.length === 0 && none.horizonDays === 7, 'before anything is saved: not saved, no free days, a week ahead');
const saved = await rpc(ann, 'study_plan_prefs_save', J([6, 0, 6]), 14);
check(saved.saved && saved.restDays.join() === '0,6' && saved.horizonDays === 14, 'saving keeps each day once, in order');
const again = await rpc(ann, 'study_plan_prefs_get');
check(again.saved && again.restDays.join() === '0,6' && again.horizonDays === 14, 'and it is read back');
await rpc(ann, 'study_plan_prefs_save', J([]), 7);
check((await rpc(ann, 'study_plan_prefs_get')).restDays.length === 0, 'no free days at all is allowed');
await expectFail(() => rpc(ann, 'study_plan_prefs_save', J([7]), 7), /which days to keep free/, 'a day number outside 0 to 6 is refused, in plain words');
await expectFail(() => rpc(ann, 'study_plan_prefs_save', J([-1]), 7), /which days to keep free/, 'a negative day is refused');
await expectFail(() => rpc(ann, 'study_plan_prefs_save', J(['x']), 7), /which days to keep free/, 'a word instead of a day is refused');
await expectFail(() => rpc(ann, 'study_plan_prefs_save', J({ a: 1 }), 7), /which days to keep free/, 'something that is not a list is refused');
await expectFail(() => rpc(ann, 'study_plan_prefs_save', J([0, 1, 2, 3, 4, 5, 6, 0]), 7), /only seven days/, 'more than seven entries is refused');
await expectFail(() => rpc(ann, 'study_plan_prefs_save', J([]), 0), /between 1 and 28/, 'a plan of 0 days is refused');
await expectFail(() => rpc(ann, 'study_plan_prefs_save', J([]), 29), /between 1 and 28/, 'a plan of 29 days is refused');
check((await rpc(ann, 'study_plan_prefs_get')).horizonDays === 7, 'a refused save changes nothing');
const bobFresh = await rpc(bob, 'study_plan_prefs_get');
check(bobFresh.saved === false, 'one student\'s settings never show for another');
await rpc(bob, 'study_plan_prefs_save', J([3]), 10);
check((await rpc(ann, 'study_plan_prefs_get')).restDays.length === 0 && (await rpc(bob, 'study_plan_prefs_get')).restDays.join() === '3', 'each student has their own');
const fresh = await mkUser('cara');
check((await rpc(fresh, 'study_plan_prefs_save', J([0]), 7)).saved === true && (await q(`select 1 from public.study_profiles where user_id = $1`, [fresh])).length === 1, 'saving settings works even before set-up (it makes the study space)');

section('3. Adding a plan without replacing');
const made = await rpc(ann, 'study_sessions_add_plan', J([item(), item({ startsAt: at(11), topic: 'Optics' }), item({ startsAt: at(12), subjectId: maths })]));
check(made.made === 3 && made.clashed === 0, 'three sessions are added');
let l = await list(ann);
check(l.length === 3 && l.every((s) => s.source === 'ai' && s.status === 'planned'), 'they are plan sessions, planned');
const manual = await rpc(ann, 'study_session_save', J({ clientRef: crypto.randomUUID(), subjectId: phys, topic: 'My own', startsAt: at(15), durationMin: 60 }));
const clash = await rpc(ann, 'study_sessions_add_plan', J([item({ startsAt: at(15, 30) }), item({ startsAt: at(16, 59), durationMin: 15 }), item({ startsAt: at(17, 30), durationMin: 30 })]));
check(clash.made === 2 && clash.clashed === 1, 'one that would sit on top of a session the student made is left out (and counted)', J(clash));
check((await list(ann)).find((s) => s.id === manual.id).topic === 'My own', 'what the student made is untouched');
await rpc(ann, 'study_session_status', (await list(ann)).find((s) => s.topic === 'Waves').id, 'skipped');
check((await rpc(ann, 'study_sessions_add_plan', J([item({ startsAt: at(10, 10), topic: 'Instead' })]))).made === 1, 'a skipped session does not block its time');
const before = (await list(ann)).length;
await expectFail(() => rpc(ann, 'study_sessions_add_plan', J([item({ startsAt: at(8) }), item({ subjectId: bobSubj, startsAt: at(9) })])), /not yours/, 'a subject that is not theirs is refused');
check((await list(ann)).length === before, '…and nothing at all was added from that call');
await expectFail(() => rpc(ann, 'study_sessions_add_plan', J([item({ durationMin: 2, startsAt: at(8) })])), /between 5 and 240/, 'a session that is too short is refused');
await expectFail(() => rpc(ann, 'study_sessions_add_plan', J({ x: 1 })), /no plan to save/, 'something that is not a list is refused');
await expectFail(() => rpc(ann, 'study_sessions_add_plan', J(Array.from({ length: 61 }, (_, i) => item({ startsAt: at(0, 0, 21) })))), /at most 60/, 'more than 60 at once is refused');
check((await rpc(bob, 'study_sessions_add_plan', J([item({ subjectId: bobSubj, startsAt: at(10) })]))).made === 1 && (await list(ann)).length === before, 'another student\'s sessions are separate (the same time does not clash across students)');
check((await q(`select count(*)::int as n from public.study_events where user_id = $1 and kind = 'plan_change'`, [ann]))[0].n >= 1, 'a plan change is logged (for the progress page)');

section('4. A plan session becomes the student\'s own once changed');
const target = (await list(ann)).find((s) => s.topic === 'Optics');
check(target.source === 'ai', 'it starts as a plan session');
await rpc(ann, 'study_session_status', target.id, 'done');
check((await list(ann)).find((s) => s.id === target.id).source === 'ai', 'marking it done does not change who owns it');
const moveMe = (await list(ann)).find((s) => s.topic === 'Instead');
const moved = await rpc(ann, 'study_session_save', J({ id: moveMe.id, startsAt: at(14, 0, 22) }));
check(moved.source === 'manual' && new Date(moved.startsAt).toISOString().startsWith('2026-11-22T14:00'), 'moving it makes it the student\'s own', J(moved));
const planAgain = await rpc(ann, 'study_sessions_replace_plan', J([item({ startsAt: at(9, 0, 21), topic: 'Fresh' })]), from, to);
const after = await list(ann);
check(after.some((s) => s.id === moveMe.id) && after.some((s) => s.id === target.id) && after.some((s) => s.id === manual.id), 'making a new plan keeps what was moved, what is done, and what the student made');
check(after.filter((s) => s.source === 'ai' && s.status === 'planned').every((s) => s.topic === 'Fresh') && planAgain.made === 1, 'only the plan sessions still waiting were replaced');
check(planAgain.kept >= 3, 'and it reports how many it kept', J(planAgain));
const edited = await rpc(ann, 'study_session_save', J({ id: after.find((s) => s.topic === 'Fresh').id, topic: 'Fresh, my words' }));
check(edited.source === 'manual', 'even a change of words is the student taking it over');
await expectFail(() => rpc(bob, 'study_session_save', J({ id: manual.id, topic: 'hijack' })), /no longer exists/, 'nobody else can change a student\'s session');
const idem = crypto.randomUUID();
const c1 = await rpc(ann, 'study_session_save', J({ clientRef: idem, subjectId: maths, topic: 'Twice', startsAt: at(9, 0, 24), durationMin: 30 }));
const c2 = await rpc(ann, 'study_session_save', J({ clientRef: idem, subjectId: maths, topic: 'Twice', startsAt: at(9, 0, 24), durationMin: 30 }));
check(c1.id === c2.id && c1.source === 'manual', 'creating a session twice (a double tap) makes one, and it is the student\'s own');

section('5. Erasing');
await rpc(ann, 'study_delete_my_data', 'activity');
check((await rpc(ann, 'study_plan_prefs_get')).horizonDays === 7 && (await q(`select 1 from public.study_plan_prefs where user_id = $1`, [ann])).length === 1, 'erasing the activity history keeps the plan settings');
await rpc(bob, 'study_delete_my_data', 'all');
check((await q(`select 1 from public.study_plan_prefs where user_id = $1`, [bob])).length === 0 && (await rpc(bob, 'study_plan_prefs_get')).saved === false, 'erasing everything removes the plan settings too');
check((await q(`select 1 from public.study_plan_prefs where user_id = $1`, [ann])).length === 1, 'and only that student\'s');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
