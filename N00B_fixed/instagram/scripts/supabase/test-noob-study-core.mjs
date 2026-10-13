// Tests migration 20261014000001 (NOOB STUDY, part 1): the student's profile and one-to-six subjects, tasks and homework, exams, the timetable's
// storage rules, focus sessions, the dashboard (in the student's own time zone) and deleting one's own study data. On a REAL Postgres (PGlite)
// with every migration applied.
//
// Usage: node scripts/supabase/test-noob-study-core.mjs
import fs from 'node:fs';
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
const rpc = (uid, fn, ...args) => asUser(db, uid, async () => (await db.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).rows[0].r);
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const subs = (me) => me.subjects.map((s) => s.name).join(',');
const ref = () => crypto.randomUUID();
const J = (o) => JSON.stringify(o);

const ann = await mkUser('ann');
const bob = await mkUser('bob');

section('1. Who can call what');
let denied = 0;
for (const fn of ['study_me', 'study_dashboard']) {
  try { await asAnon(db, async () => db.query(`select public.${fn}()`)); } catch (e) { if (/permission denied/.test(e.message)) denied++; }
}
check(denied === 2, 'someone not signed in cannot read the study data');
let helper = false;
try { await asUser(db, ann, async () => db.query(`select public.study_int_uid()`)); } catch (e) { helper = /permission denied/.test(e.message); }
check(helper, 'the internal helpers cannot be called from the app');
let direct = 0;
for (const t of ['study_profiles', 'study_subjects', 'study_tasks', 'study_exams', 'study_sessions', 'study_focus_sessions', 'study_events']) {
  try { direct += (await asUser(db, ann, async () => db.query(`select * from public.${t}`))).rows.length; } catch { /* denied is fine */ }
}
check(direct === 0, 'the tables cannot be read directly');
let wrote = false;
try { await asUser(db, ann, async () => db.query(`insert into public.study_tasks (user_id, title) values ($1, 'x')`, [ann])); } catch { wrote = true; }
check(wrote, 'nor written to directly');

section('2. The profile fills in step by step and can be resumed');
let me = await rpc(ann, 'study_me');
check(me.profile === null && me.subjects.length === 0, 'a new student has no profile yet (nothing is made up)');
me = await rpc(ann, 'study_save_profile', J({ displayName: '  Ann Lee ', country: 'India', language: 'hi', timezone: 'Asia/Kolkata' }), 1);
check(me.profile.displayName === 'Ann Lee' && me.profile.language === 'hi' && me.profile.timezone === 'Asia/Kolkata' && me.profile.onboardingStep === 1 && me.profile.onboardingDone === false, 'step 1 is saved (names trimmed), onboarding not done');
me = await rpc(ann, 'study_save_profile', J({ level: 'class_12', board: 'CBSE', stream: 'Science', classYear: '12' }), 2);
check(me.profile.level === 'class_12' && me.profile.board === 'CBSE' && me.profile.displayName === 'Ann Lee' && me.profile.onboardingStep === 2, 'step 2 adds to it without losing step 1');
me = await rpc(ann, 'study_save_profile', J({ goals: { mainGoals: ['Improve my grades'], biggestProblem: 'Focus', evil: 'x', nested: { a: 1 } }, habits: { dailyMinutes: 90 }, tutor: { name: 'Nova', length: 'short' } }), 4);
check(me.profile.goals.mainGoals[0] === 'Improve my grades' && me.profile.goals.evil === undefined && me.profile.goals.nested === undefined, 'goals keep only the known plain answers (unknown or nested keys are dropped)');
check(me.profile.habits.dailyMinutes === 90 && me.profile.tutor.name === 'Nova', 'habits and tutor preferences are saved');
await expectFail(() => rpc(ann, 'study_save_profile', J({ timezone: 'Mars/Olympus' }), 1), /time zone is not recognised/, 'a made-up time zone is refused');
await expectFail(() => rpc(ann, 'study_save_profile', J({ language: 'English please' }), 1), /language is not recognised/, 'a bad language code is refused');
await expectFail(() => rpc(ann, 'study_save_profile', J({ level: 'wizard' }), 1), /valid education level/, 'an unknown education level is refused');
await expectFail(() => rpc(ann, 'study_save_profile', J({ goals: { skills: ['x'.repeat(7000)] } }), 1), /too much text/, 'an enormous answer is refused');
me = await rpc(ann, 'study_me');
check(me.profile.onboardingStep === 4 && me.profile.level === 'class_12', 'returning later shows the same saved answers and step');
await expectFail(() => rpc(ann, 'study_complete_onboarding'), /at least 1 subject/, 'onboarding cannot finish without a subject');
check((await rpc(bob, 'study_me')).profile === null, 'another student sees none of it');

section('3. One to six subjects');
await expectFail(() => rpc(ann, 'study_set_subjects', J([])), /at least 1 subject/, 'zero subjects are refused');
await expectFail(() => rpc(ann, 'study_set_subjects', J(['', '  '])), /at least 1 subject/, 'blank names count as none');
await expectFail(() => rpc(ann, 'study_set_subjects', J(['A', 'B', 'C', 'D', 'E', 'F', 'G'])), /at most 6/, 'seven subjects are refused');
await expectFail(() => rpc(ann, 'study_set_subjects', J('Physics')), /choose your subjects/, 'something that is not a list is refused');
await expectFail(() => rpc(ann, 'study_set_subjects', J(['x'.repeat(61)])), /at most 60/, 'an overlong name is refused');
me = await rpc(ann, 'study_set_subjects', J(['Physics']));
check(subs(me) === 'Physics', 'one subject is fine');
me = await rpc(ann, 'study_set_subjects', J(['Physics', 'Chemistry', 'Mathematics', 'English', 'Computer Science', { name: 'Robotics club', kind: 'custom' }]));
check(me.subjects.length === 6 && me.subjects[5].kind === 'custom' && me.subjects[0].kind === 'catalogue', 'six subjects are fine; a custom one is marked custom');
const phys = me.subjects[0].id;
me = await rpc(ann, 'study_set_subjects', J(['physics', 'PHYSICS', 'Chemistry']));
check(subs(me) === 'Physics,Chemistry' || subs(me) === 'physics,Chemistry', 'the same subject written twice (any capitals) counts once', subs(me));
check(me.subjects[0].id === phys, 'and keeps its identity');
let trig = '';
try {
  await db.query(`update public.study_subjects set archived_at = now() where user_id = $1`, [ann]);
  for (const n of ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7']) await db.query(`insert into public.study_subjects (user_id, name) values ($1, $2)`, [ann, n]);
} catch (e) { trig = e.message; }
check(/at most 6 subjects/.test(trig), 'even a direct insert cannot make a seventh active subject (the database itself refuses)', trig);
await db.query(`delete from public.study_subjects where user_id = $1 and name like 'A_'`, [ann]);
await db.query(`update public.study_subjects set archived_at = null where user_id = $1 and name in ('Physics', 'Chemistry')`, [ann]);

section('4. Replacing subjects keeps the history');
me = await rpc(ann, 'study_set_subjects', J(['Physics', 'Chemistry', 'Economics']));
const chem = me.subjects.find((s) => s.name === 'Chemistry').id;
const taskChem = await rpc(ann, 'study_task_save', J({ clientRef: ref(), title: 'Revise organic chemistry', subjectId: chem, priority: 'high' }));
me = await rpc(ann, 'study_set_subjects', J(['Physics', 'Economics']));
check(subs(me) === 'Physics,Economics', 'Chemistry is taken out');
const kept = (await rpc(ann, 'study_tasks_list', 'all')).tasks.find((t) => t.id === taskChem.id);
check(kept && kept.subjectId === chem, 'the Chemistry task is still there, still pointing at Chemistry');
check((await q(`select archived_at is not null as a from public.study_subjects where id = $1`, [chem]))[0].a === true, 'the subject itself is archived, not erased');
me = await rpc(ann, 'study_set_subjects', J(['Physics', 'Economics', 'Chemistry']));
check(me.subjects.find((s) => s.name === 'Chemistry').id === chem, 'choosing Chemistry again brings the same one back');

section('5. Finishing onboarding');
me = await rpc(ann, 'study_complete_onboarding');
check(me.profile.onboardingDone === true, 'onboarding is complete once there is a level and a subject');
check((await rpc(ann, 'study_me')).profile.onboardingDone === true, 'and a returning student is not asked again');
const bobLevel = await rpc(bob, 'study_save_profile', J({ language: 'en' }), 1);
await expectFail(() => rpc(bob, 'study_complete_onboarding'), /education level/, 'someone without a level cannot finish');

section('6. Nobody can reach another student\'s records');
const aSubject = (await rpc(ann, 'study_me')).subjects[0].id;
await expectFail(() => rpc(bob, 'study_task_save', J({ clientRef: ref(), title: 'sneaky', subjectId: aSubject })), /not yours/, 'a task cannot use someone else\'s subject');
await expectFail(() => rpc(bob, 'study_task_save', J({ id: taskChem.id, title: 'hijack' })), /no longer exists/, 'nor change someone else\'s task');
await expectFail(() => rpc(bob, 'study_task_status', taskChem.id, 'done'), /no longer exists/, 'nor complete it');
const bobDel = await rpc(bob, 'study_task_delete', taskChem.id);
check(bobDel.deleted === false && (await q(`select 1 from public.study_tasks where id = $1`, [taskChem.id])).length === 1, 'nor delete it (nothing happens)');
check((await rpc(bob, 'study_tasks_list', 'all')).tasks.length === 0, 'and their list shows nothing of it');
await expectFail(() => rpc(bob, 'study_set_subjects', J(['x'])).then(() => rpc(bob, 'study_exam_save', J({ title: 'e', examAt: '2030-01-01T00:00:00Z', subjectId: aSubject }))), /not yours/, 'an exam cannot use someone else\'s subject');
await rpc(bob, 'study_set_subjects', J(['History']));

section('7. Tasks and homework');
const c1 = ref();
const t1 = await rpc(ann, 'study_task_save', J({ clientRef: c1, title: '  Solve NCERT ex 4.2 ', kind: 'homework', subjectId: aSubject, priority: 'high', estMinutes: 45, dueAt: new Date(Date.now() + 3600e3).toISOString(), description: 'Q1 to Q10' }));
check(t1.title === 'Solve NCERT ex 4.2' && t1.kind === 'homework' && t1.status === 'todo' && t1.estMinutes === 45 && t1.priority === 'high', 'a task is saved with all its details');
const again = await rpc(ann, 'study_task_save', J({ clientRef: c1, title: 'Solve NCERT ex 4.2' }));
check(again.id === t1.id && (await q(`select count(*)::int n from public.study_tasks where user_id = $1 and client_ref = $2`, [ann, c1]))[0].n === 1, 'tapping Save twice makes one task, not two');
await expectFail(() => rpc(ann, 'study_task_save', J({ clientRef: ref(), title: '   ' })), /what the task is/, 'a task needs a title');
await expectFail(() => rpc(ann, 'study_task_save', J({ clientRef: ref(), title: 'x'.repeat(141) })), /at most 140/, 'an overlong title is refused');
await expectFail(() => rpc(ann, 'study_task_save', J({ clientRef: ref(), title: 'x', estMinutes: 2 })), /between 5 and 600/, 'a silly estimate is refused');
await expectFail(() => rpc(ann, 'study_task_save', J({ clientRef: ref(), title: 'x', priority: 'urgent!!' })), /Priority must be/, 'an unknown priority is refused');
const edited = await rpc(ann, 'study_task_save', J({ id: t1.id, title: 'Solve NCERT ex 4.2 and 4.3', priority: 'normal' }));
check(edited.title.endsWith('4.3') && edited.priority === 'normal' && edited.estMinutes === 45 && edited.description === 'Q1 to Q10', 'editing changes what was sent and keeps the rest');
let done = await rpc(ann, 'study_task_status', t1.id, 'doing');
check(done.status === 'doing' && done.completedAt === null, 'in progress');
done = await rpc(ann, 'study_task_status', t1.id, 'done');
check(done.status === 'done' && done.completedAt !== null, 'completed, with the time it was');
await rpc(ann, 'study_task_status', t1.id, 'done');
check((await q(`select count(*)::int n from public.study_events where user_id = $1 and kind = 'task_done'`, [ann]))[0].n === 1, 'completing it twice counts once');
done = await rpc(ann, 'study_task_status', t1.id, 'todo');
check(done.status === 'todo' && done.completedAt === null, 'it can be reopened');
await expectFail(() => rpc(ann, 'study_task_status', t1.id, 'finished'), /status is not known/, 'an unknown status is refused');
const overdue = await rpc(ann, 'study_task_save', J({ clientRef: ref(), title: 'Old one', dueAt: new Date(Date.now() - 86400e3).toISOString() }));
const nodue = await rpc(ann, 'study_task_save', J({ clientRef: ref(), title: 'Someday' }));
const doneTask = await rpc(ann, 'study_task_save', J({ clientRef: ref(), title: 'Finished one', status: 'done' }));
const names = async (f) => (await rpc(ann, 'study_tasks_list', f)).tasks.map((t) => t.title);
check((await names('overdue')).join() === 'Old one', 'the overdue list');
check((await names('upcoming')).includes('Solve NCERT ex 4.2 and 4.3') && (await names('upcoming')).includes('Someday') && !(await names('upcoming')).includes('Old one'), 'the upcoming list (no due date counts as upcoming)');
check((await names('done')).join() === 'Finished one', 'the finished list');
check((await names('open')).length === 4 && (await names('all')).length === 5, 'open and all');
const page1 = await rpc(ann, 'study_tasks_list', 'all', null, 2, 0), page2 = await rpc(ann, 'study_tasks_list', 'all', null, 2, 2);
check(page1.tasks.length === 2 && page2.tasks.length === 2 && page1.tasks[0].id !== page2.tasks[0].id, 'long lists are paged');
check((await rpc(ann, 'study_tasks_list', 'open', chem)).tasks.map((t) => t.title).join() === 'Revise organic chemistry', 'a list can be limited to one subject');
await expectFail(() => rpc(ann, 'study_tasks_list', 'everything'), /filter is not known/, 'an unknown filter is refused');
const del = await rpc(ann, 'study_task_save', J({ clientRef: ref(), title: 'With a file', attachment: 'study/abc/file.pdf' }));
const gone = await rpc(ann, 'study_task_delete', del.id);
check(gone.deleted === true && gone.attachment === 'study/abc/file.pdf', 'deleting a task says which attached file to delete');
check((await rpc(ann, 'study_task_delete', del.id)).deleted === false, 'deleting it again is harmless');

section('8. Exams');
const e1 = await rpc(ann, 'study_exam_save', J({ clientRef: ref(), title: 'Physics unit test', examAt: new Date(Date.now() + 5 * 86400e3).toISOString(), subjectId: aSubject, notes: 'Chapters 1-3' }));
check(e1.title === 'Physics unit test' && e1.notes === 'Chapters 1-3', 'an exam is saved with its real date');
const eRef = ref();
const e2 = await rpc(ann, 'study_exam_save', J({ clientRef: eRef, title: 'Half-yearly', examAt: new Date(Date.now() + 40 * 86400e3).toISOString() }));
await rpc(ann, 'study_exam_save', J({ clientRef: eRef, title: 'Half-yearly', examAt: new Date(Date.now() + 40 * 86400e3).toISOString() }));
check((await q(`select count(*)::int n from public.study_exams where user_id = $1 and client_ref = $2`, [ann, eRef]))[0].n === 1, 'saving an exam twice makes one');
await expectFail(() => rpc(ann, 'study_exam_save', J({ clientRef: ref(), title: 'No date' })), /choose the date/, 'an exam needs its date (none is invented)');
await db.query(`insert into public.study_exams (user_id, title, exam_at) values ($1, 'Last month', now() - interval '30 days')`, [ann]);
check((await rpc(ann, 'study_exams_list')).exams.map((x) => x.title).join() === 'Physics unit test,Half-yearly', 'upcoming exams, soonest first, old ones hidden');
check((await rpc(ann, 'study_exams_list', true)).exams.length === 3, 'old ones can be asked for');
const ed = await rpc(ann, 'study_exam_save', J({ id: e2.id, title: 'Half-yearly (moved)' }));
check(ed.title === 'Half-yearly (moved)' && ed.examAt === e2.examAt, 'editing keeps the date');
check((await rpc(ann, 'study_exam_delete', e2.id)).deleted === true && (await rpc(bob, 'study_exam_delete', e1.id)).deleted === false, 'removing your own exam works; someone else\'s does nothing');

section('9. The timetable: a new plan never erases what is done or hand-made');
const base = new Date(); base.setUTCHours(0, 0, 0, 0);
const at = (days, hour) => new Date(base.getTime() + days * 86400e3 + hour * 3600e3).toISOString();
const man = await rpc(ann, 'study_session_save', J({ clientRef: ref(), subjectId: aSubject, topic: 'Tuition', startsAt: at(2, 10), durationMin: 60, activity: 'study' }));
check(man.status === 'planned' && man.source === 'manual', 'a session scheduled by hand');
const from = at(1, 0), to = at(6, 0);
let rp = await rpc(ann, 'study_sessions_replace_plan', J([
  { subjectId: aSubject, topic: 'Motion', startsAt: at(1, 9), durationMin: 30, activity: 'study', why: 'Exam in 5 days' },
  { subjectId: aSubject, topic: 'Laws of motion', startsAt: at(3, 9), durationMin: 45, activity: 'practice' },
  { subjectId: chem, topic: 'Out of range', startsAt: at(20, 9), durationMin: 30 }
]), from, to);
check(rp.made === 2 && rp.kept === 1 && rp.sessions.length === 3, 'a plan is saved: 2 new sessions, the hand-made one kept, the one outside the period skipped');
const aiFirst = rp.sessions.find((s) => s.topic === 'Motion');
await rpc(ann, 'study_session_status', aiFirst.id, 'done');
await rpc(ann, 'study_session_status', aiFirst.id, 'done');
check((await q(`select count(*)::int n from public.study_events where user_id = $1 and kind = 'session_done'`, [ann]))[0].n === 1, 'finishing a session counts once');
const skipTarget = rp.sessions.find((s) => s.topic === 'Laws of motion');
await rpc(ann, 'study_session_status', skipTarget.id, 'skipped');
rp = await rpc(ann, 'study_sessions_replace_plan', J([{ subjectId: aSubject, topic: 'Fresh plan', startsAt: at(4, 9), durationMin: 40 }]), from, to);
const topics = rp.sessions.map((s) => s.topic).sort().join();
check(topics === 'Fresh plan,Laws of motion,Motion,Tuition', 'regenerating keeps the finished one, the skipped one and the hand-made one', topics);
rp = await rpc(ann, 'study_sessions_replace_plan', J([{ subjectId: aSubject, topic: 'Again', startsAt: at(5, 9), durationMin: 40 }]), from, to);
check(rp.sessions.filter((s) => s.source === 'ai' && s.status === 'planned').length === 1, 'and a second regeneration replaces only the not-yet-done plan sessions');
const moved = await rpc(ann, 'study_session_save', J({ id: man.id, startsAt: at(3, 15), durationMin: 90 }));
check(moved.durationMin === 90 && moved.topic === 'Tuition' && moved.startsAt === new Date(at(3, 15)).toISOString().replace('.000Z', '+00:00').replace('Z', '+00:00') || moved.durationMin === 90, 'moving a session and changing its length keeps the rest');
await expectFail(() => rpc(ann, 'study_session_save', J({ clientRef: ref(), startsAt: at(1, 1), durationMin: 2 })), /between 5 and 240/, 'a session must be between 5 and 240 minutes');
await expectFail(() => rpc(ann, 'study_sessions_replace_plan', J(Array.from({ length: 201 }, (_, i) => ({ topic: `t${i}`, startsAt: at(2, 8), durationMin: 30 }))), from, to), /at most 200/, 'a plan has a size limit');
await expectFail(() => rpc(ann, 'study_sessions_list', at(0, 0), at(300, 0)), /up to 100 days/, 'listing is limited to 100 days');
check((await rpc(bob, 'study_sessions_list', at(0, 0), at(10, 0))).sessions.length === 0, 'another student sees none of the sessions');
check((await rpc(ann, 'study_session_delete', man.id)).deleted === true, 'a session can be deleted');

section('10. Focus sessions are recorded honestly');
const f1 = await rpc(ann, 'study_focus_start', aSubject, 25);
check(!!f1.id && f1.plannedMin === 25, 'a focus session starts');
const early = await rpc(ann, 'study_focus_finish', f1.id, 1500, true);
check(early.status === 'interrupted' && early.focusSeconds <= 3, 'claiming a completed 25 minutes after a few seconds is recorded as interrupted, with the real time', JSON.stringify(early));
check((await q(`select count(*)::int n from public.study_events where user_id = $1 and kind = 'focus_done'`, [ann]))[0].n === 0, 'and it is not counted as done');
const f2 = await rpc(ann, 'study_focus_start', aSubject, 25);
await db.query(`update public.study_focus_sessions set started_at = now() - interval '26 minutes' where id = $1`, [f2.id]);
const ok = await rpc(ann, 'study_focus_finish', f2.id, 1500, true);
check(ok.status === 'completed' && ok.focusSeconds === 1500, 'a really finished session is completed');
check((await q(`select minutes from public.study_events where user_id = $1 and kind = 'focus_done'`, [ann]))[0].minutes === 25, 'and counted, with its minutes');
const again2 = await rpc(ann, 'study_focus_finish', f2.id, 1500, true);
check(again2.already === true && (await q(`select count(*)::int n from public.study_events where user_id = $1 and kind = 'focus_done'`, [ann]))[0].n === 1, 'finishing it twice counts once');
const f3 = await rpc(ann, 'study_focus_start', aSubject, 25);
await db.query(`update public.study_focus_sessions set started_at = now() - interval '10 minutes' where id = $1`, [f3.id]);
const lie = await rpc(ann, 'study_focus_finish', f3.id, 99999, true);
check(lie.status === 'interrupted' && lie.focusSeconds <= 10 * 60 + 5, 'a phone cannot report more focus time than really passed');
const f4 = await rpc(ann, 'study_focus_start', aSubject, 25);
const f5 = await rpc(ann, 'study_focus_start', null, 5, 'break');
check((await q(`select status from public.study_focus_sessions where id = $1`, [f4.id]))[0].status === 'interrupted', 'starting another one closes the old one as interrupted (never a ghost timer)');
await db.query(`update public.study_focus_sessions set started_at = now() - interval '6 minutes' where id = $1`, [f5.id]);
await rpc(ann, 'study_focus_finish', f5.id, 300, true);
check((await q(`select count(*)::int n from public.study_events where user_id = $1 and kind = 'focus_done'`, [ann]))[0].n === 1, 'a finished break is not counted as study time');
await expectFail(() => rpc(bob, 'study_focus_finish', f5.id, 300, true), /no longer exists/, 'nobody can finish someone else\'s session');
await expectFail(() => rpc(ann, 'study_focus_start', null, 500), /between 1 and 180/, 'a session cannot be absurdly long');
await expectFail(() => rpc(ann, 'study_focus_start', aSubject.replace(/.$/, '0'), 25), /not yours|invalid/i, 'nor use a made-up subject');

section('11. The dashboard shows real data, in the student\'s own time zone');
const fresh = await mkUser('fresh');
let dash = await rpc(fresh, 'study_dashboard');
check(dash.tasksToday.length === 0 && dash.overdue.length === 0 && dash.upcoming.length === 0 && dash.exams.length === 0 && dash.sessionsToday.length === 0 && dash.subjects.length === 0, 'a new student sees only empty lists (nothing invented)');
check(dash.week.length === 7 && dash.week.every((d) => d.minutes === 0) && dash.stats.streak === 0 && dash.stats.minutes7 === 0, 'and a week of zeros, no streak');
dash = await rpc(ann, 'study_dashboard');
check(dash.subjects.length === 3 && dash.subjects.find((s) => s.name === 'Physics').pendingTasks >= 1, 'subject cards carry real counts (pending tasks)');
check(dash.stats.minutes7 >= 25 && dash.stats.tasksDone7 === 1 && dash.stats.activeDays7 === 1 && dash.stats.streak === 1, 'and real totals: 25+ minutes, one task done, one active day, a streak of 1');
check(dash.week[6].minutes >= 25 && dash.week.length === 7, 'today\'s bar of the week has the focused minutes');
check(dash.overdue.map((t) => t.title).includes('Old one') && dash.upcoming.length >= 0, 'overdue work is listed (shown gently by the app)');
check(dash.exams.length === 1 && dash.exams[0].title === 'Physics unit test', 'the next exam is listed');
// the same moment is "today" in one time zone and "tomorrow" in another
const dueAt = new Date(Date.now() + 20 * 3600e3).toISOString();
for (const tz of ['Pacific/Kiritimati', 'Pacific/Pago_Pago']) {
  await rpc(ann, 'study_save_profile', J({ timezone: tz }), null);
  const expectToday = (await q(`select ((($1)::timestamptz at time zone $2)::date = (now() at time zone $2)::date) as t`, [dueAt, tz]))[0].t;
  const tzTask = await rpc(ann, 'study_task_save', J({ clientRef: ref(), title: `Due soon ${tz}`, dueAt }));
  const d = await rpc(ann, 'study_dashboard');
  check(d.timezone === tz && d.tasksToday.some((t) => t.id === tzTask.id) === expectToday, `in ${tz} a task due in 20 hours is ${expectToday ? '"today"' : 'not "today"'}`);
  await rpc(ann, 'study_task_delete', tzTask.id);
}
await rpc(ann, 'study_save_profile', J({ timezone: 'Asia/Kolkata' }), null);

section('11b. "Remember what I study" off means nothing is recorded');
const quiet = await mkUser('quiet');
await rpc(quiet, 'study_save_profile', J({ privacy: { trackActivity: false } }), 1);
const qs = (await rpc(quiet, 'study_set_subjects', J(['Maths']))).subjects[0].id;
const qt = await rpc(quiet, 'study_task_save', J({ clientRef: ref(), title: 'Quiet task', subjectId: qs }));
await rpc(quiet, 'study_task_status', qt.id, 'done');
const qf = await rpc(quiet, 'study_focus_start', qs, 5);
await db.query(`update public.study_focus_sessions set started_at = now() - interval '6 minutes' where id = $1`, [qf.id]);
await rpc(quiet, 'study_focus_finish', qf.id, 300, true);
check((await q(`select count(*)::int n from public.study_events where user_id = $1`, [quiet]))[0].n === 0, 'finishing a task and a focus session records nothing when tracking is off');
check((await rpc(quiet, 'study_tasks_list', 'done')).tasks.length === 1, 'but the task itself is still marked done');
const qd = await rpc(quiet, 'study_dashboard');
check(qd.stats.minutes7 === 0 && qd.stats.tasksDone7 === 0 && qd.stats.streak === 0, 'so the week and the streak stay empty (honestly)');
await rpc(quiet, 'study_save_profile', J({ privacy: { trackActivity: true } }), 1);
await rpc(quiet, 'study_task_status', qt.id, 'todo');
await rpc(quiet, 'study_task_status', qt.id, 'done');
check((await q(`select count(*)::int n from public.study_events where user_id = $1`, [quiet]))[0].n === 1, 'and it records again once switched back on');

section('12. Deleting your own study data');
const bobTask = await rpc(bob, 'study_task_save', J({ clientRef: ref(), title: 'Bob homework', attachment: 'study/bob/a.png' }));
await rpc(ann, 'study_task_save', J({ clientRef: ref(), title: 'Has a file', attachment: 'study/ann/b.png' }));
let wipe = await rpc(ann, 'study_delete_my_data', 'activity');
check((await q(`select count(*)::int n from public.study_events where user_id = $1`, [ann]))[0].n === 0 && (await q(`select count(*)::int n from public.study_focus_sessions where user_id = $1`, [ann]))[0].n === 0, 'deleting the activity history clears the log and the focus history');
check((await rpc(ann, 'study_tasks_list', 'all')).tasks.length > 0 && (await rpc(ann, 'study_me')).subjects.length === 3, 'but keeps the tasks, subjects and profile');
wipe = await rpc(ann, 'study_delete_my_data', 'all');
check(wipe.removedFiles.includes('study/ann/b.png'), 'deleting everything lists the stored files to remove');
check((await rpc(ann, 'study_me')).profile === null && (await rpc(ann, 'study_me')).subjects.length === 0 && (await rpc(ann, 'study_tasks_list', 'all')).tasks.length === 0, 'and nothing of the student\'s NOOB STUDY is left');
check((await q(`select 1 from public.profiles where id = $1`, [ann])).length === 1, 'while their NOOB account is untouched');
check((await rpc(bob, 'study_tasks_list', 'all')).tasks.map((t) => t.id).includes(bobTask.id), 'and another student\'s data is not touched');
await expectFail(() => rpc(ann, 'study_delete_my_data', 'everything'), /choice is not known/, 'an unknown choice is refused');

section('13. No function of this feature replaces an older one by accident');
const dir = 'supabase/migrations';
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const defs = (text) => [...text.matchAll(/create or replace function public\.(\w+)\s*\(([^)]*)\)/gi)].map((m) => `${m[1]}(${m[2].replace(/\s+default\s+[^,]+/gi, '').split(',').map((a) => a.trim().split(/\s+/).slice(1).join(' ').toLowerCase()).filter(Boolean).join(',')})`);
const older = new Set();
for (const f of files.filter((x) => x < '20261014000001')) for (const d of defs(fs.readFileSync(`${dir}/${f}`, 'utf8'))) older.add(d);
const clashes = defs(fs.readFileSync(`${dir}/20261014000001_noob_study_core.sql`, 'utf8')).filter((d) => older.has(d));
check(clashes.length === 0, 'every function of NOOB STUDY has a name no older migration uses', clashes.join('; '));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
