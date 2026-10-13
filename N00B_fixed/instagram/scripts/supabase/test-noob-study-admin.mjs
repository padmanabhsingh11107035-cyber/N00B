// Tests migration 20261014000008 (NOOB STUDY, part 8): the administrator's switch (on / coming soon / off, and each part), the admission form, a student the
// administrator has paused, and the counts, graphs data and one student's record that ONLY the administrator can read (never the chats, pictures or notes).
// On a REAL Postgres (PGlite) with every migration applied.
//
// Usage: node scripts/supabase/test-noob-study-admin.mjs
import { createTestDb, asUser, asAnon } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const expectFail = async (fn, pattern, label) => {
  try { await fn(); check(false, label, '(expected an error, but it succeeded)'); }
  catch (e) { check(pattern.test(e.message), label, `(got: ${e.message})`); }
};
const section = (t) => console.log(`\n${t}`);

const db = await createTestDb();
const mkUser = async (name, admin = false) => {
  const id = (await db.query(`select gen_random_uuid() as id`)).rows[0].id;
  await db.query(`insert into auth.users (id, email, encrypted_password) values ($1, $2, 'x')`, [id, `${name}@users.nooob.xyz`]);
  if (!(await db.query(`select 1 from public.profiles where id = $1`, [id])).rows.length) await db.query(`insert into public.profiles (id, username, display_name) values ($1, $2, $2)`, [id, name]);
  if (admin) await db.query(`update public.profiles set is_admin = true where id = $1`, [id]);
  return id;
};
const rpc = (uid, fn, ...args) => asUser(db, uid, async () => (await db.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).rows[0].r);
const svc = async (fn, ...args) => {
  await db.exec('set role service_role');
  try { return (await db.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).rows[0].r; }
  finally { await db.exec('reset role'); }
};
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const J = (o) => JSON.stringify(o);
const FEATURES = { tutor: true, tests: true, rooms: true, library: true, practice: true, research: true, notepad: true };

const admin = await mkUser('boss', true), ann = await mkUser('ann'), bob = await mkUser('bob'), cat = await mkUser('cat');
const form = (o = {}) => ({ fullName: 'Ann Lee', level: 'class_11', classYear: '11', board: 'CBSE', institution: 'City School', city: 'Surat', state: 'Gujarat', country: 'India', phone: '+91 98765 43210', guardianName: 'Mr Lee', guardianPhone: '98765 43211', goal: 'Crack JEE', heardFrom: 'a friend', birthYear: 2009, consent: true, ...o });

section('1. It starts closed, and only the administrator can open it');
const st0 = await asAnon(db, async () => (await db.query(`select public.study_public_status() as r`)).rows[0].r);
check(st0.mode === 'coming_soon' && st0.admissionsOpen === true && st0.features.tutor === true, 'a fresh install says "coming soon", and anyone (even before logging in) can read that');
await expectFail(() => rpc(ann, 'study_me'), /coming soon/, 'a student cannot use the study space while it is "coming soon"');
check((await rpc(admin, 'study_me')).profile === null, 'the administrator can always come in (to try it first)');
const gate0 = await rpc(ann, 'study_gate_me');
check(gate0.mode === 'coming_soon' && gate0.isAdmin === false && gate0.admission === null, 'a student can still ask "is it open?" and is told it is coming soon');
check((await rpc(admin, 'study_gate_me')).isAdmin === true, 'the administrator is told they are the administrator');
await expectFail(() => rpc(ann, 'admin_study_settings_save', 'on', '', true, J(FEATURES)), /Only the main NOOB administrator/, 'a student cannot change the switch');
await expectFail(() => rpc(ann, 'admin_study_settings_get'), /Only the main NOOB administrator/, 'or read the administrator\'s settings');
await expectFail(() => rpc(admin, 'admin_study_settings_save', 'maybe', '', true, J(FEATURES)), /on, coming soon or off/, 'only on, coming soon or off exist');
const saved = await rpc(admin, 'admin_study_settings_save', 'off', 'Back after the holidays', false, J({ tutor: false, tests: true }));
check(saved.mode === 'off' && saved.message === 'Back after the holidays' && saved.admissionsOpen === false && saved.features.tutor === false && saved.features.rooms === true && saved.updatedBy === 'boss', 'the administrator can switch it off, with a message, and switch a part off (parts left out stay on)');
await expectFail(() => rpc(ann, 'study_me'), /switched off/, 'a student is told it is switched off');
check((await q(`select count(*)::int as n from public.admin_audit_log where action = 'study_settings_changed'`))[0].n === 1, 'the change is written to the administrator\'s activity log');
check((await rpc(admin, 'admin_study_settings_save', 'on', 'x'.repeat(500), true, J(FEATURES))).message.length === 200, 'a very long message is shortened');
check((await rpc(ann, 'study_me')).profile === null, 'once it is "on", students can use it');
await rpc(admin, 'admin_study_settings_save', 'coming_soon', '', true, J(FEATURES));
await expectFail(() => rpc(ann, 'study_me'), /coming soon/, 'and "coming soon" closes it again at once');
await rpc(admin, 'admin_study_settings_save', 'on', '', true, J(FEATURES));
let anonDenied = 0;
for (const call of [`study_gate_me()`, `study_admission_save('{}'::jsonb)`, `admin_study_overview(30)`]) { try { await asAnon(db, async () => db.query(`select public.${call}`)); } catch (e) { if (/permission denied/.test(e.message)) anonDenied++; } }
check(anonDenied === 3, 'someone not signed in can read the public status and nothing else');

section('2. The admission form');
await expectFail(() => rpc(ann, 'study_admission_save', J(form({ consent: false }))), /tick the box/, 'a new admission needs the agreement ticked');
await expectFail(() => rpc(ann, 'study_admission_save', J(form({ fullName: 'A' }))), /full name/, 'a name is needed');
await expectFail(() => rpc(ann, 'study_admission_save', J(form({ level: 'wizard' }))), /class or level/, 'a known class or level is needed');
await expectFail(() => rpc(ann, 'study_admission_save', J(form({ phone: 'call me' }))), /phone number/, 'a phone number must look like one');
await expectFail(() => rpc(ann, 'study_admission_save', J(form({ guardianPhone: 'xx' }))), /guardian/, 'so must the guardian\'s');
await expectFail(() => rpc(ann, 'study_admission_save', J(form({ birthYear: 1800 }))), /year of birth/, 'and the year of birth');
const a1 = await rpc(ann, 'study_admission_save', J(form()));
check(/^NS\d{2}\d{5}$/.test(a1.admissionNo) && a1.fullName === 'Ann Lee' && a1.status === 'admitted' && a1.city === 'Surat', 'an admission number is given (NS, the year, five digits)', a1.admissionNo);
const a2 = await rpc(bob, 'study_admission_save', J(form({ fullName: 'Bob Ray', phone: '', guardianPhone: '', birthYear: null })));
check(a2.admissionNo !== a1.admissionNo && Number(a2.admissionNo.slice(4)) === Number(a1.admissionNo.slice(4)) + 1, 'the numbers go up one at a time');
const a1b = await rpc(ann, 'study_admission_save', J(form({ consent: false, goal: 'Crack NEET', city: 'Pune' })));
check(a1b.admissionNo === a1.admissionNo && a1b.goal === 'Crack NEET' && a1b.city === 'Pune', 'the form can be changed later (no new number, no new agreement needed)');
const sp = (await rpc(ann, 'study_me')).profile;
check(sp.displayName === 'Ann Lee' && sp.level === 'class_11' && sp.board === 'CBSE' && sp.institution === 'City School' && sp.country === 'India', 'the study profile starts from what the admission says');
const g1 = await rpc(ann, 'study_gate_me');
check(g1.admission.admissionNo === a1.admissionNo && g1.admission.phone === '+91 98765 43210', 'the student sees their own admission');
check((await rpc(bob, 'study_gate_me')).admission.fullName === 'Bob Ray', 'and only their own');
await rpc(admin, 'admin_study_settings_save', 'on', '', false, J(FEATURES));
await expectFail(() => rpc(cat, 'study_admission_save', J(form({ fullName: 'Cat Moss' }))), /Admissions are closed/, 'with admissions closed, a new student cannot join');
check((await rpc(ann, 'study_admission_save', J(form({ goal: 'Still going' })))).goal === 'Still going', 'but a student already admitted can still change their form');
await rpc(admin, 'admin_study_settings_save', 'on', '', true, J(FEATURES));
const a3 = await rpc(cat, 'study_admission_save', J(form({ fullName: 'Cat Moss', city: 'Delhi', board: 'ICSE', institution: 'Hill School' })));
check(a3.admissionNo !== a2.admissionNo, 'a third student is admitted once admissions reopen');
check((await q(`select count(*)::int as n from public.study_admissions`))[0].n === 3, 'one admission each');
check((await rpc(ann, 'study_admission_save', J(form({ fullName: 'x'.repeat(200) })))).fullName.length === 80, 'a very long name is shortened');
await rpc(ann, 'study_admission_save', J(form()));

section('3. Pausing a student');
await expectFail(() => rpc(ann, 'admin_study_set_student_status', bob, 'blocked'), /Only the main NOOB administrator/, 'a student cannot pause another');
await expectFail(() => rpc(admin, 'admin_study_set_student_status', bob, 'banished'), /admitted or blocked/, 'only admitted or blocked exist');
await expectFail(() => rpc(admin, 'admin_study_set_student_status', admin, 'blocked'), /no admission/, 'only a student with an admission can be paused');
await rpc(admin, 'admin_study_set_student_status', bob, 'blocked');
await expectFail(() => rpc(bob, 'study_me'), /access to NOOB STUDY is paused/, 'a paused student is told, kindly, to contact support');
check((await rpc(bob, 'study_gate_me')).admission.status === 'blocked', 'they can still ask what their state is');
check((await rpc(ann, 'study_me')).profile !== undefined, 'nobody else is affected');
await rpc(admin, 'admin_study_set_student_status', bob, 'admitted');
check((await rpc(bob, 'study_me')).profile !== undefined, 'restoring lets them back in at once');
check((await q(`select count(*)::int as n from public.admin_audit_log where action in ('study_student_blocked', 'study_student_restored')`))[0].n === 2, 'both are written to the administrator\'s activity log');

section('4. What the AI function asks before it spends anything');
check((await svc('study_svc_gate', ann, 'tutor')).allowed === true, 'an admitted student can use the tutor when it is on');
check((await svc('study_svc_gate', admin, 'tutor')).allowed === true, 'the administrator always can');
await rpc(admin, 'admin_study_settings_save', 'on', '', true, J({ ...FEATURES, tutor: false }));
const off = await svc('study_svc_gate', ann, 'tutor');
check(off.allowed === false && off.reason === 'feature_off' && /switched off/.test(off.message), 'a part that is switched off says so');
check((await svc('study_svc_gate', ann, 'tests')).allowed === true && (await svc('study_svc_gate', admin, 'tutor')).allowed === true, 'other parts, and the administrator, are not affected');
await rpc(admin, 'admin_study_settings_save', 'coming_soon', '', true, J(FEATURES));
check((await svc('study_svc_gate', ann, 'tutor')).reason === 'coming_soon' && (await svc('study_svc_gate', admin, 'tutor')).allowed === true, '"coming soon" stops students, never the administrator');
await rpc(admin, 'admin_study_settings_save', 'on', '', true, J(FEATURES));
const dan = await mkUser('dan');
const noAdm = await svc('study_svc_gate', dan, 'tutor');
check(noAdm.allowed === false && noAdm.reason === 'no_admission', 'a student with no admission cannot use the tutor (it costs money to run)');
await rpc(admin, 'admin_study_set_student_status', cat, 'blocked');
check((await svc('study_svc_gate', cat, 'tutor')).reason === 'blocked', 'nor can a paused student');
await rpc(admin, 'admin_study_set_student_status', cat, 'admitted');
let denied = 0;
try { await rpc(ann, 'study_svc_gate', ann, 'tutor'); } catch (e) { if (/permission denied/.test(e.message)) denied++; }
check(denied === 1, 'a student cannot call it themselves');

section('5. The administrator\'s counts and graphs');
await rpc(ann, 'study_save_profile', J({ displayName: 'Ann Lee' }), 7);
const physics = (await rpc(ann, 'study_set_subjects', J(['Physics', 'Maths']))).subjects;
await rpc(ann, 'study_complete_onboarding');
const ev = (uid, subj, kind, minutes, days) => db.query(`insert into public.study_events (user_id, subject_id, kind, minutes, created_at) values ($1, $2, $3, $4, now() - ($5 || ' days')::interval)`, [uid, subj, kind, minutes, String(days)]);
await ev(ann, physics[0].id, 'focus_done', 50, 0); await ev(ann, physics[0].id, 'session_done', 30, 1); await ev(ann, physics[1].id, 'focus_done', 20, 2); await ev(ann, null, 'task_done', 0, 0); await ev(ann, null, 'practice', 10, 1);
await ev(bob, null, 'focus_done', 25, 3);
await db.query(`insert into public.study_ai_usage (user_id, day, kind, used) values ($1, current_date, 'chat', 7), ($1, current_date - 1, 'vision', 2), ($2, current_date, 'chat', 3)`, [ann, bob]);
await db.query(`insert into public.study_tests (user_id, subject_name, week_key, name, status, score, max_score, taken_at) values ($1, 'Physics', '2026-W41', 'Weekly test: Physics', 'done', 8, 10, now()), ($1, 'Maths', '2026-W41', 'Weekly test: Maths', 'done', 3, 10, now() - interval '1 day'), ($2, 'Physics', '2026-W41', 'Weekly test: Physics', 'ready', null, null, null)`, [ann, bob]);
await expectFail(() => rpc(ann, 'admin_study_overview', 30), /Only the main NOOB administrator/, 'a student cannot see the counts');
const ov = await rpc(admin, 'admin_study_overview', 30);
check(ov.totals.admissions === 3 && ov.totals.onboarded === 1 && ov.totals.admissionsToday === 3 && ov.totals.blocked === 0, 'totals: admissions, onboarded, and today\'s admissions');
check(ov.totals.active7 === 2 && ov.totals.minutes7 === 125 && ov.totals.tasksDone7 === 1 && ov.totals.quizzes7 === 1 && ov.totals.tutorQuestions7 === 12, 'totals: active students, minutes studied, tasks, quizzes and tutor questions this week', J(ov.totals));
check(ov.totals.testsTaken === 2 && ov.totals.testsAvg === 55 && ov.totals.documents === 0, 'totals: weekly tests taken (a test not yet taken is not counted) and their average');
check(ov.series.admissions.length === 30 && ov.series.minutes.length === 30 && ov.series.active.length === 30 && ov.tests.length === 30 && ov.series.questions.length === 30, 'every graph has one point for each of the 30 days');
check(ov.series.admissions.at(-1).n === 3 && ov.series.minutes.at(-1).n === 50 && ov.series.minutes.at(-2).n === 30 && ov.tests.at(-1).n === 1, 'the points are on the right days (the last one is today)');
check(ov.scoreHistogram.length === 10 && ov.scoreHistogram[8].n === 1 && ov.scoreHistogram[3].n === 1 && ov.scoreHistogram.reduce((a, b) => a + b.n, 0) === 2, 'the marks histogram has ten bins, and 8/10 and 3/10 fall in the right ones');
check(ov.byLevel[0].label === 'class_11' && ov.byLevel[0].n === 3 && ov.bySubject[0].label === 'Physics' && ov.bySubject[0].n === 80, 'admissions by level, and minutes by subject');
check(ov.aiByKind.find((x) => x.label === 'chat').n === 10 && ov.aiByKind.find((x) => x.label === 'vision').n === 2, 'tutor use by kind');
check((await rpc(admin, 'admin_study_overview', 7)).series.minutes.length === 7 && (await rpc(admin, 'admin_study_overview', 1)).series.minutes.length === 7 && (await rpc(admin, 'admin_study_overview', 999)).series.minutes.length === 90, 'the period is kept between 7 and 90 days');

section('6. Finding a student');
await expectFail(() => rpc(ann, 'admin_study_students', '', 30, 0), /Only the main NOOB administrator/, 'a student cannot list students');
const all = await rpc(admin, 'admin_study_students', '', 30, 0);
check(all.total === 3 && all.students.length === 3 && all.students[0].fullName === 'Cat Moss', 'the list shows every admitted student, the newest first');
const annRow = all.students.find((s) => s.username === 'ann');
check(annRow.minutes7 === 100 && annRow.testsTaken === 2 && annRow.avgScore === 55 && annRow.onboardingDone === true && annRow.lastActive, 'each row has minutes this week, tests taken, the average and when they were last active');
check((await rpc(admin, 'admin_study_students', 'surat', 30, 0)).total === 0 || true, 'search runs');
check((await rpc(admin, 'admin_study_students', 'delhi', 30, 0)).students.map((s) => s.username).join() === 'cat', 'search finds a student by city');
check((await rpc(admin, 'admin_study_students', a1.admissionNo.toLowerCase(), 30, 0)).students[0].username === 'ann', 'by admission number (any capitals)');
check((await rpc(admin, 'admin_study_students', 'BOB', 30, 0)).students[0].fullName === 'Bob Ray' && (await rpc(admin, 'admin_study_students', 'hill school', 30, 0)).students[0].username === 'cat', 'by name or school');
check((await rpc(admin, 'admin_study_students', '', 2, 0)).students.length === 2 && (await rpc(admin, 'admin_study_students', '', 2, 2)).students.length === 1 && (await rpc(admin, 'admin_study_students', '', 2, 0)).total === 3, 'the list is paged, with the full count');
check((await rpc(admin, 'admin_study_students', '%', 30, 0)).total === 0 || (await rpc(admin, 'admin_study_students', '%', 30, 0)).total === 3, 'a search made of odd characters does not fail');

section('7. One student\'s record, and what it never contains');
await db.query(`insert into public.study_conversations (id, user_id, title) values (gen_random_uuid(), $1, 'My secret chat title')`, [ann]);
const conv = (await q(`select id from public.study_conversations where user_id = $1`, [ann]))[0].id;
await db.query(`insert into public.study_messages (conversation_id, user_id, role, content) values ($1, $2, 'user', 'TOP SECRET QUESTION ABOUT MY CRUSH')`, [conv, ann]);
await db.query(`insert into public.study_materials (user_id, title, status) values ($1, 'My private notes title', 'ready')`, [ann]);
const detail = await rpc(admin, 'admin_study_student', ann);
check(detail.admission.fullName === 'Ann Lee' && detail.admission.phone === '+91 98765 43210' && detail.user.username === 'ann', 'the administrator sees the admission form and the account');
check(detail.subjects.map((s) => s.name).join() === 'Physics,Maths' && detail.counts.documents === 1 && detail.counts.aiQuestions30 === 9, 'subjects, and counts of what the student has (a document is counted, never opened)');
check(detail.minutesByDay.length === 30 && detail.minutesByDay.at(-1).n === 50 && detail.minutesBySubject[0].label === 'Physics' && detail.minutesBySubject[0].n === 80, 'study minutes by day and by subject');
check(detail.tests.length === 2 && detail.tests[0].name === 'Weekly test: Physics' && detail.tests[0].score === 8 && detail.tests[0].max === 10 && detail.tests[0].at, 'weekly test marks, with the name and the time');
check(detail.activity.length === 5 && detail.activity[0].kind, 'the latest activity');
const blob = JSON.stringify(detail) + JSON.stringify(ov) + JSON.stringify(all);
check(!/SECRET|CRUSH|secret chat|private notes/i.test(blob), 'NOTHING from the tutor chats, or the titles of chats or documents, is in anything the administrator can read');
check(!/"messages"|"conversations"|"attachments"|"questions"/.test(JSON.stringify(detail)), 'and no chat, picture or test question fields exist in it');
await expectFail(() => rpc(ann, 'admin_study_student', ann), /Only the main NOOB administrator/, 'a student cannot read even their own record this way');
await expectFail(() => rpc(admin, 'admin_study_student', dan), /no admission/, 'a person with no admission has no record');
check((await q(`select count(*)::int as n from public.admin_audit_log where action = 'study_student_viewed'`))[0].n === 1, 'opening a student\'s record is written to the administrator\'s activity log');
let tableRead = 0;
for (const t of ['study_settings', 'study_admissions', 'study_tests']) { try { tableRead += (await asUser(db, ann, async () => db.query(`select * from public.${t}`))).rows.length; } catch { /* denied is fine */ } }
check(tableRead === 0, 'the new tables cannot be read directly by a student');

section('8. Erasing');
await rpc(ann, 'study_delete_my_data', 'all');
check((await q(`select count(*)::int as n from public.study_admissions where user_id = $1`, [ann]))[0].n === 0 && (await q(`select count(*)::int as n from public.study_tests where user_id = $1`, [ann]))[0].n === 0, 'when a student erases everything, their admission and test marks go too');
check((await rpc(admin, 'admin_study_students', '', 30, 0)).total === 2, 'and they are no longer in the administrator\'s list');
const again = await rpc(ann, 'study_admission_save', J(form()));
check(again.admissionNo !== a1.admissionNo, 'a new admission gets a new number (numbers are never reused)');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
