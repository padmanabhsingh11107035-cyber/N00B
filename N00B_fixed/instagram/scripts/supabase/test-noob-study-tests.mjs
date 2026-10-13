// Tests migration 20261014000009 (NOOB STUDY, part 9): the weekly tests (only on what the student has learned in the app; one set a week; only the marks are
// kept), the history, and the student's own progress numbers. On a REAL Postgres (PGlite) with every migration applied.
//
// Usage: node scripts/supabase/test-noob-study-tests.mjs
import { createTestDb, asUser, asAnon } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const expectFail = async (fn, pattern, label) => {
  try { await fn(); check(false, label, '(expected an error, but it succeeded)'); }
  catch (e) { check(pattern.test(e.message), label, `(got: ${e.message})`); }
};
const section = (t) => console.log(`\n${t}`);

const db = await createTestDb();
await db.exec("update public.study_settings set mode = 'on'");
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
const ref = () => crypto.randomUUID();

const admin = await mkUser('boss', true), ann = await mkUser('ann'), bob = await mkUser('bob');
await rpc(ann, 'study_save_profile', J({ displayName: 'Ann', level: 'class_11', board: 'CBSE' }), 1);
await rpc(bob, 'study_save_profile', J({ displayName: 'Bob' }), 1);
const subj = (await rpc(ann, 'study_set_subjects', J(['Physics', 'Maths', 'Chemistry']))).subjects;
const phys = subj[0].id, maths = subj[1].id, chem = subj[2].id;
const bobSubj = (await rpc(bob, 'study_set_subjects', J(['History']))).subjects[0].id;
const mcq = (i, over = {}) => ({ type: 'mcq', question: 'Question number ' + i + ' about motion?', options: ['alpha ' + i, 'beta ' + i, 'gamma ' + i, 'delta ' + i], answer: i % 4, explanation: 'Because of reason ' + i + '.', ...over });
const ten = (offset = 0) => Array.from({ length: 10 }, (_, i) => mcq(offset + i));

section('1. Who can call what');
let anon = 0;
for (const call of [`study_tests_status()`, `study_tests_history()`, `study_progress(30)`, `study_test_get(gen_random_uuid())`]) { try { await asAnon(db, async () => db.query(`select public.${call}`)); } catch (e) { if (/permission denied/.test(e.message)) anon++; } }
check(anon === 4, 'someone not signed in cannot use the tests');
let svcDenied = 0;
for (const [fn, args] of [['study_svc_test_context', [ann, phys]], ['study_svc_test_save', [ann, phys, J(ten()), '[]']]]) { try { await rpc(ann, fn, ...args); } catch (e) { if (/permission denied/.test(e.message)) svcDenied++; } }
check(svcDenied === 2, 'a student cannot call the server-side functions that make a test');
let direct = 0;
for (const t of ['study_tests', 'study_test_hashes']) { try { direct += (await asUser(db, ann, async () => db.query(`select * from public.${t}`))).rows.length; } catch { /* denied is fine */ } }
check(direct === 0, 'the test tables cannot be read directly');

section('2. A test is only possible on what the student has learned');
const st0 = await rpc(ann, 'study_tests_status');
check(/^\d{4}-W\d{2}$/.test(st0.weekKey) && /^Week \d+, \d{4}$/.test(st0.weekTitle) && st0.subjects.length === 3, 'each subject is listed for this week');
check(st0.subjects.every((s) => s.state === 'locked' && s.covered === 0), 'with nothing learned yet, every subject is "locked"');
await rpc(ann, 'study_topic_save', J({ subjectId: phys, title: 'Laws of motion', status: 'not_started' }));
check((await rpc(ann, 'study_tests_status')).subjects[0].state === 'locked', 'a topic only listed ("not started") is not learned');
await rpc(ann, 'study_topic_save', J({ subjectId: phys, title: 'Gravitation', status: 'learning' }));
await rpc(ann, 'study_topic_save', J({ subjectId: phys, title: 'Work and energy', status: 'confident' }));
let s1 = (await rpc(ann, 'study_tests_status')).subjects;
check(s1[0].state === 'available' && s1[0].covered === 2 && s1[1].state === 'locked', 'topics marked "learning" or "confident" count, and only in their own subject');
const covered = async (sid) => (await svc('study_svc_test_context', ann, sid)).covered;
check((await covered(phys)).sort().join('|') === 'Gravitation|Work and energy', 'the list of what was learned is exactly those topics');
await db.query(`insert into public.study_sessions (user_id, subject_id, topic, starts_at, duration_min, status) values ($1, $2, 'Friction', now() - interval '3 days', 30, 'done'), ($1, $2, 'Ignored planned one', now() - interval '2 days', 30, 'planned'), ($1, $2, 'Old thing', now() - interval '400 days', 30, 'done')`, [ann, phys]);
await db.query(`insert into public.study_tasks (user_id, subject_id, title, status, completed_at) values ($1, $2, 'Worksheet on momentum', 'done', now() - interval '1 day'), ($1, $2, 'Not finished task', 'todo', null)`, [ann, phys]);
await db.query(`insert into public.study_conversations (user_id, subject_id, title, topic) values ($1, $2, 'Explain refraction', 'Light'), ($1, $2, '', '')`, [ann, phys]);
await db.query(`insert into public.study_materials (user_id, subject_id, title, kind, status) values ($1, $2, 'Chapter 5 notes', 'notes', 'ready'), ($1, $2, 'Half added doc', 'notes', 'processing'), ($1, $2, 'Old past paper', 'pyq', 'ready')`, [ann, phys]);
const quizId = (await rpc(ann, 'study_quiz_save', J({ clientRef: ref(), title: 'Waves quiz', subjectId: phys, questions: [mcq(1)] }))).id;
const quiz2 = (await rpc(ann, 'study_quiz_save', J({ clientRef: ref(), title: 'Never tried quiz', subjectId: phys, questions: [mcq(2)] }))).id;
await rpc(ann, 'study_quiz_attempt_save', quizId, J([1]), J({}), 30, ref());
const deck = await rpc(ann, 'study_deck_save', J({ title: 'Formulas', subjectId: phys }));
await rpc(ann, 'study_cards_add', deck.id, J([{ front: 'F', back: 'ma' }]));
const deck2 = await rpc(ann, 'study_deck_save', J({ title: 'Untouched deck', subjectId: phys }));
await rpc(ann, 'study_cards_add', deck2.id, J([{ front: 'a', back: 'b' }]));
await rpc(ann, 'study_card_review', (await rpc(ann, 'study_cards_list', deck.id)).cards[0].id, 3);
const cov = (await covered(phys)).sort();
check(cov.join('|') === ['Chapter 5 notes', 'Explain refraction', 'Formulas', 'Friction', 'Gravitation', 'Light', 'Waves quiz', 'Work and energy', 'Worksheet on momentum'].sort().join('|'),
  'it also counts finished sessions and tasks, tutor chat topics, quizzes done, decks reviewed and notes (not planned sessions, unfinished tasks, quizzes never tried, decks never used, half-added or past-paper documents, or things from over 120 days ago)', cov.join('|'));
await db.query(`insert into public.study_topics (user_id, subject_id, title, status) values ($1, $2, 'gravitation', 'confident') on conflict do nothing`, [ann, chem]);
check((await covered(chem)).join('|') === 'gravitation', 'another subject only has what was learned in it');
check((await svc('study_svc_test_context', bob, bobSubj)).covered.length === 0 && (await covered(phys)).every((t) => t !== 'History'), 'nothing of another student is ever counted');
await expectFail(() => svc('study_svc_test_context', ann, bobSubj), /not yours/, 'a subject that is not theirs is refused');
const ctx = await svc('study_svc_test_context', ann, phys);
check(ctx.subject.name === 'Physics' && ctx.existing === null && ctx.profile.level === 'class_11' && ctx.profile.board === 'CBSE' && ctx.recent.length === 0, 'the server is told the subject, the level and board, that there is no test yet this week, and no old questions');
check((await rpc(ann, 'study_tests_status')).subjects[0].covered === 9, 'the student sees how many things the test can draw on');

section('3. Making this week\'s test');
const saved = await svc('study_svc_test_save', ann, phys, J(ten()), J(['h1', 'h2']));
check(saved.status === 'ready' && saved.existing === false, 'ten multiple-choice questions make a test');
const row = (await q(`select * from public.study_tests where id = $1`, [saved.id]))[0];
check(row.name === 'Weekly test: Physics, ' + (await rpc(ann, 'study_tests_status')).weekTitle && row.subject_name === 'Physics' && row.questions.length === 10, 'it is named after the subject and the week');
check((await svc('study_svc_test_save', ann, phys, J(ten(50)), '[]')).existing === true && (await q(`select count(*)::int as n from public.study_tests where user_id = $1`, [ann]))[0].n === 1, 'asking again the same week gives the same test (one set a week)');
await expectFail(() => svc('study_svc_test_save', ann, maths, J(ten().slice(0, 9)), '[]'), /did not come out right/, 'nine questions are not a test');
await expectFail(() => svc('study_svc_test_save', ann, maths, J([...ten().slice(0, 9), { type: 'tf', question: 'q', answer: true, explanation: 'x' }]), '[]'), /did not come out right/, 'a question that is not multiple choice is not counted');
await expectFail(() => svc('study_svc_test_save', ann, maths, J([...ten().slice(0, 9), mcq(77, { options: ['a', 'a', 'b', 'c'] })]), '[]'), /did not come out right/, 'an unsound question is dropped, so ten are needed');
await expectFail(() => svc('study_svc_test_save', ann, bobSubj, J(ten()), '[]'), /not yours/, 'only the student\'s own subject');
const big = await svc('study_svc_test_save', ann, maths, J(Array.from({ length: 14 }, (_, i) => mcq(100 + i))), '[]');
check((await q(`select jsonb_array_length(questions) as n from public.study_tests where id = $1`, [big.id]))[0].n === 10, 'if more than ten sound questions come, ten are kept');
const hashes = (await q(`select qhash from public.study_test_hashes where user_id = $1 and subject_name = 'Physics'`, [ann])).map((r) => r.qhash).sort().join();
check(hashes === 'h1,h2' && (await svc('study_svc_test_context', ann, phys)).recent.sort().join() === 'h1,h2', 'the fingerprints of the questions are kept (never the questions) so they are not asked again');
await db.query(`insert into public.study_test_hashes (user_id, subject_name, qhash, at) select $1, 'Physics', 'old' || g, now() - (g || ' hours')::interval from generate_series(1, 320) g`, [ann]);
await db.query(`delete from public.study_tests where subject_name = 'Maths'`);
await svc('study_svc_test_save', ann, maths, J(ten(200)), J(['m1']));
const physFps = (await q(`select count(*)::int as n from public.study_test_hashes where user_id = $1 and subject_name = 'Physics'`, [ann]))[0].n;
check(physFps === 322, 'old fingerprints of another subject are not touched');
await db.query(`delete from public.study_tests where subject_name = 'Physics'`);
await svc('study_svc_test_save', ann, phys, J(ten(300)), J(['n1']));
check((await q(`select count(*)::int as n from public.study_test_hashes where user_id = $1 and subject_name = 'Physics'`, [ann]))[0].n === 300, 'at most the latest 300 fingerprints are kept for a subject');
check((await svc('study_svc_test_context', ann, phys)).recent.length === 300, 'and all of them are sent when asking for new questions');

section('4. Taking it');
const status = (await rpc(ann, 'study_tests_status')).subjects;
const phys1 = status.find((s) => s.subject === 'Physics');
check(phys1.state === 'ready' && phys1.testId && status.find((s) => s.subject === 'Maths').state === 'ready', 'the subjects with a test waiting say "ready"');
const test = await rpc(ann, 'study_test_get', phys1.testId);
check(test.questions.length === 10 && test.questions[0].options.length === 4 && test.status === 'ready', 'the student gets the questions and their choices');
check(!/answer|explanation/i.test(JSON.stringify(test.questions)), 'and never the right answers or the reasons, before handing in');
await expectFail(() => rpc(bob, 'study_test_get', phys1.testId), /no longer exists/, 'nobody else can open it');
await expectFail(() => rpc(bob, 'study_test_submit', phys1.testId, J([]), 0), /no longer exists/, 'nor hand it in');
const truth = (await q(`select questions from public.study_tests where id = $1`, [phys1.testId]))[0].questions;
const answers = truth.map((x, i) => (i < 7 ? x.answer : (x.answer + 1) % 4));
await expectFail(() => rpc(ann, 'study_test_submit', phys1.testId, J(Array(11).fill(0)), 0), /do not belong to this test/, 'more answers than questions is refused');
await expectFail(() => rpc(ann, 'study_test_submit', phys1.testId, J({ a: 1 }), 0), /do not belong to this test/, 'answers that are not a list are refused');
const done = await rpc(ann, 'study_test_submit', phys1.testId, J(answers), 425);
check(done.score === 7 && done.max === 10 && done.percent === 70 && done.already === false && done.name.startsWith('Weekly test: Physics'), 'it is marked by the database: 7 right out of 10');
check(done.review.length === 10 && done.review[0].answer === truth[0].answer && done.review[0].explanation === truth[0].explanation && done.review[9].correct === false && done.review[9].chosen === answers[9], 'the right answers and the reasons are shown once, in this reply');
const after = (await q(`select * from public.study_tests where id = $1`, [phys1.testId]))[0];
check(after.questions === null && after.status === 'done' && after.score === 7 && after.max_score === 10 && after.duration_sec === 425 && after.taken_at, 'afterwards ONLY the marks, the time taken and the date remain: the questions are gone');
const again = await rpc(ann, 'study_test_submit', phys1.testId, J(answers.map(() => 0)), 1);
check(again.already === true && again.score === 7 && again.review.length === 0, 'handing in again changes nothing and shows nothing more');
const gone = await rpc(ann, 'study_test_get', phys1.testId);
check(gone.status === 'done' && gone.questions === null && gone.score === 7, 'opening a finished test shows only its marks');
check((await q(`select count(*)::int as n from public.study_events where user_id = $1 and kind = 'practice' and (meta->>'test') = $2`, [ann, phys1.testId]))[0].n === 1, 'the test is written once into the student\'s history (for progress)');
const m1 = (await rpc(ann, 'study_tests_status')).subjects.find((s) => s.subject === 'Maths');
const blank = await rpc(ann, 'study_test_submit', m1.testId, J([null, 'x', 2]), 99999);
check(blank.score <= 1 && (await q(`select duration_sec from public.study_tests where id = $1`, [m1.testId]))[0].duration_sec === 86400, 'unanswered questions score nothing, and an impossible time is held to a day');
const st2 = (await rpc(ann, 'study_tests_status')).subjects;
check(st2.find((s) => s.subject === 'Physics').state === 'done' && st2.find((s) => s.subject === 'Physics').score === 7 && st2.find((s) => s.subject === 'Chemistry').state === 'available', 'the list now says "done" with the marks, and "available" where no test was made yet');

section('5. When the week ends');
await db.query(`update public.study_tests set week_key = '2020-W01' where subject_name = 'Chemistry'`);
const chemTest = await svc('study_svc_test_save', ann, chem, J(ten(400)), '[]');
await db.query(`update public.study_tests set week_key = '2020-W01' where id = $1`, [chemTest.id]);
await rpc(ann, 'study_tests_status');
const ex = (await q(`select status, questions from public.study_tests where id = $1`, [chemTest.id]))[0];
check(ex.status === 'expired' && ex.questions === null, 'a test not taken before its week ended is closed, and its questions are removed');
await expectFail(() => rpc(ann, 'study_test_submit', chemTest.id, J([]), 0), /has ended/, 'it can not be handed in late');
check((await rpc(ann, 'study_test_get', chemTest.id)).status === 'expired', 'opening it says it has expired');
const next = await svc('study_svc_test_save', ann, chem, J(ten(500)), '[]');
check(next.existing === false && next.id !== chemTest.id, 'a new week gets a new test for the same subject');
check((await rpc(ann, 'study_tests_history')).tests.every((t) => t.id !== chemTest.id), 'an expired test never appears in the history');

section('6. The history');
const hist = (await rpc(ann, 'study_tests_history')).tests;
check(hist.length === 2 && hist[0].takenAt >= hist[1].takenAt, 'only tests that were taken, the newest first');
const h0 = hist.find((t) => t.subject === 'Physics');
check(Object.keys(h0).sort().join() === 'id,max,name,percent,score,subject,takenAt' && h0.score === 7 && h0.percent === 70, 'a line has only the name, the subject, the marks, the percentage and the time');
check(!/question|option|answer|explanation/i.test(JSON.stringify(hist)), 'nothing about the questions is in it');
check((await rpc(bob, 'study_tests_history')).tests.length === 0, 'another student sees none of it');
check((await rpc(ann, 'study_tests_history', 1)).tests.length === 1, 'it can be limited');

section('7. It can be switched off, and never reaches another student');
await rpc(admin, 'admin_study_settings_save', 'on', '', true, J({ tutor: true, tests: false, rooms: true, library: true, practice: true, research: true, notepad: true }));
await expectFail(() => rpc(ann, 'study_tests_status'), /switched off/, 'when the administrator switches weekly tests off, students are told');
await expectFail(() => rpc(ann, 'study_test_get', phys1.testId), /switched off/, 'the same for opening one');
check((await rpc(admin, 'study_tests_status')).subjects.length === 0, 'the administrator is never stopped');
await rpc(admin, 'admin_study_settings_save', 'on', '', true, J({ tutor: true, tests: true, rooms: true, library: true, practice: true, research: true, notepad: true }));
check((await rpc(ann, 'study_tests_status')).subjects.length === 3, 'and switching it on again brings it back');

section('8. A week is the student\'s own week');
const isoWeek = (date) => { const d = new Date(Date.UTC(date.y, date.m - 1, date.d)); const day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - day); const y = d.getUTCFullYear(); const w = Math.ceil(((d - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7); return y + '-W' + String(w).padStart(2, '0'); };
let tzOk = true, tzBad = '';
for (const tz of ['Asia/Kolkata', 'Pacific/Kiritimati', 'Pacific/Pago_Pago', 'America/New_York', 'Europe/London']) {
  await db.query(`update public.study_profiles set timezone = $2 where user_id = $1`, [ann, tz]);
  const key = (await rpc(ann, 'study_tests_status')).weekKey;
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).split('-').map(Number);
  const want = isoWeek({ y: parts[0], m: parts[1], d: parts[2] });
  if (key !== want) { tzOk = false; tzBad = tz + ' ' + key + ' vs ' + want; }
}
check(tzOk, 'the week number follows the clock of the student\'s own time zone (even where it is already tomorrow or still yesterday)', tzBad);
await db.query(`update public.study_profiles set timezone = 'Asia/Kolkata' where user_id = $1`, [ann]);

section('9. The student\'s own progress');
const ev = (uid, subj2, kind, minutes, days, meta = {}) => db.query(`insert into public.study_events (user_id, subject_id, kind, minutes, meta, created_at) values ($1, $2, $3, $4, $5::jsonb, now() - ($6 || ' days')::interval)`, [uid, subj2, kind, minutes, J(meta), String(days)]);
await ev(ann, phys, 'focus_done', 40, 0); await ev(ann, phys, 'session_done', 20, 1); await ev(ann, maths, 'focus_done', 30, 2); await ev(ann, null, 'task_done', 0, 0); await ev(ann, null, 'review', 5, 1, { cards: 12 }); await ev(ann, phys, 'focus_done', 99, 45);
const pr = await rpc(ann, 'study_progress', 30);
check(pr.days === 30 && pr.minutesByDay.length === 30 && pr.minutesByDay.at(-1).n === 40 && pr.minutesByDay.at(-2).n === 20 && pr.minutesByDay.at(-3).n === 30, 'minutes studied each day, on the right days');
check(pr.totals.minutes === 90 && pr.totals.activeDays >= 3 && pr.totals.tasksDone === 1 && pr.totals.cards === 12 && pr.totals.quizzes >= 2, 'the totals add up (and the day 45 days ago is outside 30 days)', J(pr.totals));
check(pr.minutesBySubject[0].label === 'Physics' && pr.minutesBySubject[0].n === 60 && pr.minutesBySubject[1].label === 'Maths', 'minutes by subject, the most first');
check(pr.testScores.length === 2 && pr.testScores.some((t) => t.percent === 70 && t.subject === 'Physics'), 'test marks over time');
check(pr.quizScores.length === 1 && pr.quizScores[0].title === 'Waves quiz', 'quiz scores over time');
check(Array.isArray(pr.mistakesBySubject) && Array.isArray(pr.topicStatus) && pr.topicStatus.some((t) => t.label === 'learning'), 'mistakes by subject, and how topics stand');
check((await rpc(ann, 'study_progress', 1)).minutesByDay.length === 7 && (await rpc(ann, 'study_progress', 500)).minutesByDay.length === 90, 'the period is kept between 7 and 90 days');
check((await rpc(bob, 'study_progress', 30)).totals.minutes === 0, 'and it only ever counts the student\'s own');

section('10. Erasing');
await rpc(ann, 'study_delete_my_data', 'all');
check((await q(`select count(*)::int as n from public.study_tests where user_id = $1`, [ann]))[0].n === 0 && (await q(`select count(*)::int as n from public.study_test_hashes where user_id = $1`, [ann]))[0].n === 0, 'erasing everything removes the marks and the fingerprints too');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
