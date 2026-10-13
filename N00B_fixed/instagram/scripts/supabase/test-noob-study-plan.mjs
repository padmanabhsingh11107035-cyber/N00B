// Tests the NOOB STUDY timetable maker (src/utils/studyPlanner.ts): that a plan respects the student's time, days off, parts of the day and
// time zone; never lands on top of anything that already exists; puts exam revision and due tasks where they belong; is fair between subjects; is
// the same every time; and that every session it makes is acceptable to the database. Pure logic: no browser or database needed.
//
// Usage: node scripts/supabase/test-noob-study-plan.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);

// Node reads .ts files directly but wants file endings on imports: a temporary copy with the one import spelled out
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noob-plan-'));
fs.copyFileSync('src/utils/studyTime.ts', path.join(tmp, 'studyTime.ts'));
fs.writeFileSync(path.join(tmp, 'studyPlanner.ts'), fs.readFileSync('src/utils/studyPlanner.ts', 'utf8').replace("from './studyTime'", "from './studyTime.ts'"));
const P = await import(pathToFileURL(path.join(tmp, 'studyPlanner.ts')).href);
const T = await import(pathToFileURL(path.join(tmp, 'studyTime.ts')).href);
process.on('exit', () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* the system's temp folder is cleaned anyway */ } });

const TZ = 'Asia/Kolkata';
const S = [{ id: 's1', name: 'Physics' }, { id: 's2', name: 'Maths' }, { id: 's3', name: 'Chemistry' }];
// Wednesday 14 October 2026, 08:30 in India
const base = { tz: TZ, now: new Date('2026-10-14T03:00:00Z'), fromYmd: '2026-10-14', days: 7, dailyMinutes: 120, sessionMinutes: 30, daysPerWeek: 5, partOfDay: ['evening'], subjects: S, tasks: [], exams: [], existing: [] };
const plan = (over = {}) => P.planStudy({ ...base, ...over });
const local = (iso, tz = TZ) => T.utcToLocalInput(iso, tz);
const ymd = (iso, tz = TZ) => local(iso, tz).slice(0, 10);
const minOfDay = (iso, tz = TZ) => { const l = local(iso, tz); return Number(l.slice(11, 13)) * 60 + Number(l.slice(14, 16)); };
const byDay = (r, tz = TZ) => { const m = {}; for (const s of r.sessions) (m[ymd(s.startsAt, tz)] ||= []).push(s); return m; };
const total = (arr) => arr.reduce((a, s) => a + s.durationMin, 0);
const noOverlap = (arr) => { const a = arr.slice().sort((x, y) => x.startsAt.localeCompare(y.startsAt)); for (let i = 1; i < a.length; i++) if (new Date(a[i].startsAt) < new Date(new Date(a[i - 1].startsAt).getTime() + (a[i - 1].durationMin + 10) * 60000)) return false; return true; };
const task = (o) => ({ id: 't' + Math.random().toString(36).slice(2, 8), subjectId: 's1', title: 'Worksheet', description: '', kind: 'homework', dueAt: null, priority: 'normal', estMinutes: 60, status: 'todo', completedAt: null, attachment: null, createdAt: '', updatedAt: '', ...o });
const exam = (o) => ({ id: 'e1', subjectId: 's2', title: 'Maths unit test', examAt: '2026-10-19T03:30:00Z', notes: '', ...o });
const sess = (o) => ({ id: 'x' + Math.random().toString(36).slice(2, 8), subjectId: 's1', topic: '', startsAt: '2026-10-15T12:00:00Z', durationMin: 60, objective: '', activity: 'study', priority: 'normal', status: 'planned', source: 'manual', why: '', ...o });

section('1. The basic plan');
const r = plan();
const days = byDay(r);
const dow = (y) => T.weekdayOf(y);
check(r.sessions.length > 0 && Object.keys(days).every((y) => dow(y) !== 0 && dow(y) !== 6), 'a 5-day week keeps Saturday and Sunday free');
check(Object.keys(days).length === 5, 'all five study days of the week get sessions', Object.keys(days).join());
check(Object.values(days).every((d) => total(d) <= 120), 'no day is given more than the time the student has');
const full = Object.entries(days).filter(([y]) => y !== '2026-10-14');
check(full.every(([, d]) => total(d) === 120), 'a normal day is filled with exactly the daily time (four sessions of 30 minutes)', JSON.stringify(full.map(([y, d]) => [y, total(d)])));
check(Object.values(days).every((d) => noOverlap(d)), 'sessions never overlap, and a short break (10 minutes) is kept between them');
check(r.sessions.every((s) => minOfDay(s.startsAt) >= 17 * 60 + 30 && minOfDay(s.startsAt) + s.durationMin <= 21 * 60), 'every session sits inside the "evening" time the student chose (17:30 to 21:00)');
check(S.every((s) => r.sessions.some((x) => x.subjectId === s.id)), 'every subject gets time');
check(JSON.stringify(plan()) === JSON.stringify(plan()), 'the same facts always give the same plan (nothing random)');
check(r.sessions.every((s) => s.durationMin % 5 === 0 && s.durationMin >= 15 && s.durationMin <= 240 && s.topic.length <= 140 && s.objective.length <= 300 && s.why.length > 0 && s.why.length <= 400
  && ['study', 'revise', 'practice', 'homework', 'review_mistakes', 'read', 'flashcards'].includes(s.activity) && ['low', 'normal', 'high'].includes(s.priority) && (s.subjectId === null || S.some((x) => x.id === s.subjectId)) && !Number.isNaN(Date.parse(s.startsAt))),
  'every session is something the database accepts (length, texts, activity, priority, subject)');
check(r.sessions.every((s) => s.why.length > 10), 'every session says why it is there');
check(/sessions?, .* over \d+ days?/.test(r.summary) && r.totalMinutes === total(r.sessions) && r.studyDays === 5, 'the summary says how much was planned', r.summary);

section('2. Subjects take turns, fairly');
const dayLists = Object.values(days).map((d) => d.slice().sort((a, b) => a.startsAt.localeCompare(b.startsAt)));
check(dayLists.every((d) => d.every((s, i) => i === 0 || s.subjectId !== d[i - 1].subjectId)), 'the same subject is never given twice in a row');
check(dayLists.every((d) => S.every((s) => d.filter((x) => x.subjectId === s.id).length <= 2)), 'no subject has more than two sessions in one day');
const mins = (r2, id) => total(r2.sessions.filter((s) => s.subjectId === id));
const even = plan();
check(Math.max(...S.map((s) => mins(even, s.id))) - Math.min(...S.map((s) => mins(even, s.id))) <= 60, 'with nothing to tip the balance, the time is shared about evenly', S.map((s) => mins(even, s.id)).join());
const hard = plan({ subjects: [{ ...S[0], hard: true }, S[1], S[2]] });
check(mins(hard, 's1') > mins(hard, 's3'), 'a subject the student finds hard gets more time');
check(hard.sessions.some((s) => s.subjectId === 's1' && /harder one/.test(s.why)), '…and says so');
const strong = plan({ subjects: [S[0], S[1], { ...S[2], strong: true }] });
check(mins(strong, 's3') < mins(strong, 's1'), 'a subject the student is strong in gets a little less');
const neglected = plan({ recentMinutes: { s1: 120, s2: 120, s3: 0 } });
check(mins(neglected, 's3') >= mins(neglected, 's1'), 'a subject with no time this week is brought back');
check(plan({ subjects: [S[0]] }).sessions.length > 0, 'one subject alone still gets a plan (it may repeat)');

section('3. Free days, and the parts of the day');
check(Object.keys(byDay(plan({ restDays: [1] }))).every((y) => dow(y) !== 1) && Object.keys(byDay(plan({ restDays: [1] }))).some((y) => dow(y) === 6), 'chosen free days are kept (Monday here) and the weekend is then used');
check(Object.keys(byDay(plan({ daysPerWeek: 7 }))).length === 7, 'seven days a week means no free day');
check(Object.keys(byDay(plan({ restDays: [] }))).length === 7, 'an empty list of free days means none');
check(P.defaultRestDays(7).length === 0 && P.defaultRestDays(6).join() === '0' && P.defaultRestDays(5).join() === '0,6' && P.defaultRestDays(4).join() === '0,3,6' && P.defaultRestDays(1).length === 6 && P.defaultRestDays(NaN).join() === '0,6', 'free days follow days a week (weekend first, then midweek)');
const allRest = plan({ restDays: [0, 1, 2, 3, 4, 5, 6] });
check(allRest.sessions.length === 0 && allRest.warnings.some((w) => /free day/.test(w)), 'if every day is free nothing is planned, and it says why');
const morn = plan({ partOfDay: ['morning'], dailyMinutes: 480, days: 3, fromYmd: '2026-10-15', restDays: [] });
check(morn.sessions.every((s) => minOfDay(s.startsAt) >= 7 * 60 && minOfDay(s.startsAt) + s.durationMin <= 12 * 60), 'morning sessions stay between 07:00 and 12:00');
check(morn.warnings.some((w) => /times of day you chose/.test(w)) && total(byDay(morn)['2026-10-15']) <= 300, 'if the chosen times cannot hold the daily time, less is planned, and it says so');
check(P.windowsFor([]).length === 3 && P.windowsFor(['flexible', 'morning']).length === 3 && P.windowsFor(['night', 'morning']).join() === '420,720,1260,1410' && P.windowMinutes(['morning', 'evening']) === 510, 'parts of the day: empty or "it changes" means afternoon, evening and morning; chosen ones go in clock order', P.windowMinutes(['morning', 'evening']));
const two = plan({ partOfDay: ['morning', 'evening'], dailyMinutes: 240, days: 2, fromYmd: '2026-10-15' });
check(two.sessions.some((s) => minOfDay(s.startsAt) < 12 * 60) && two.sessions.some((s) => minOfDay(s.startsAt) >= 17 * 60), 'two chosen parts of the day are both used when one is not enough');

section('4. Today starts from now');
const eve = plan({ now: new Date('2026-10-14T14:30:00Z'), days: 1 });
check(eve.sessions.length === 1 && minOfDay(eve.sessions[0].startsAt) >= 20 * 60 + 10, 'at 20:00 only what still fits before 21:00 is planned, and not before ten minutes from now', JSON.stringify(eve.sessions.map((s) => local(s.startsAt))));
const late = plan({ now: new Date('2026-10-14T16:30:00Z'), days: 1 });
check(late.sessions.length === 0, 'after the day\'s time has gone, nothing is planned for today');
const nowTs = base.now.getTime();
check(plan().sessions.every((s) => new Date(s.startsAt).getTime() >= nowTs + 10 * 60000), 'nothing is ever planned in the past');

section('5. What already exists is never touched, and is worked around');
const manual = sess({ id: 'm1', startsAt: '2026-10-15T12:00:00Z', durationMin: 60 });                       // Thursday 17:30 India, 60 min
const doneS = sess({ id: 'd1', startsAt: '2026-10-14T00:30:00Z', durationMin: 45, status: 'done' });         // Wednesday 06:00 India
const skipped = sess({ id: 'k1', startsAt: '2026-10-16T12:00:00Z', durationMin: 60, status: 'skipped' });
const ex = plan({ existing: [manual, doneS, skipped] });
const dEx = byDay(ex);
check(noOverlap([...(dEx['2026-10-15'] || []), manual]), 'new sessions keep clear of a session the student made (with the break)');
check(total(dEx['2026-10-15']) + 60 <= 120, 'what the student already scheduled counts against that day\'s time');
check(total(dEx['2026-10-14'] || []) + 45 <= 120, 'a session already done today counts against today\'s time');
check((dEx['2026-10-16'] || []).some((s) => minOfDay(s.startsAt) === 17 * 60 + 30), 'a skipped session does not block the time it had');
const ai = sess({ id: 'a1', startsAt: '2026-10-16T12:00:00Z', durationMin: 30, source: 'ai', status: 'planned' });
check((byDay(plan({ existing: [ai] }))['2026-10-16'] || []).some((s) => minOfDay(s.startsAt) === 17 * 60 + 30), 'an old planned session from an earlier plan does not block: it is being replaced');
check(!(byDay(plan({ existing: [ai], replaceAi: false }))['2026-10-16'] || []).some((s) => minOfDay(s.startsAt) === 17 * 60 + 30), 'but when nothing is being replaced it is worked around too');
check(plan({ existing: [ai, { ...ai, id: 'a2', status: 'done' }, { ...ai, id: 'a3', source: 'manual' }] }).sessions.length > 0, 'a done or hand-made session from an earlier plan always stays (only "planned" AI sessions are replaced)');

section('6. Exams');
const e1 = plan({ exams: [exam({})] });
const eSess = e1.sessions.filter((s) => s.topic === 'Maths unit test');
check(eSess.length === 3 && eSess.every((s) => s.subjectId === 's2' && s.priority === 'high'), 'an exam in 5 days gets three revision sessions, marked important', String(eSess.length));
check(!(byDay(e1)['2026-10-19']), 'nothing is planned on the day of the exam');
const lastE = eSess.slice().sort((a, b) => a.startsAt.localeCompare(b.startsAt)).pop();
check(lastE.activity === 'revise' && ymd(lastE.startsAt) === '2026-10-16', 'the last one is a calm look at what is known, on the last study day before it');
check(new Set(eSess.map((s) => ymd(s.startsAt))).size === 3 && eSess.every((s) => /Maths unit test is in 5 days/.test(s.why)), 'they are spread over different days and explain themselves');
const e2 = plan({ exams: [exam({ examAt: '2026-10-16T03:30:00Z' })] });
const thu = (byDay(e2)['2026-10-15'] || []);
check(total(thu) <= 70 && !(byDay(e2)['2026-10-16']), 'the day before an exam is lighter, and the exam day is free');
check(plan({ exams: [exam({ examAt: '2026-10-14T03:30:00Z' })] }).sessions.length > 0 && !byDay(plan({ exams: [exam({ examAt: '2026-10-14T03:30:00Z' })] }))['2026-10-14'], 'an exam today leaves today free');
check(plan({ exams: [exam({ examAt: '2026-10-10T03:30:00Z' })] }).sessions.every((s) => s.topic !== 'Maths unit test'), 'an exam that has passed is ignored');
const far = plan({ exams: [exam({ examAt: '2026-12-20T03:30:00Z' })] });
check(far.sessions.every((s) => s.topic !== 'Maths unit test') && mins(far, 's2') >= mins(far, 's3'), 'a far exam adds no special sessions yet (its subject only gets slightly more attention)');
const none = plan({ exams: [exam({ examAt: '2026-10-15T03:30:00Z' })], restDays: [], dailyMinutes: 15, days: 1, now: new Date('2026-10-14T17:30:00Z') });
check(none.warnings.some((w) => /no free (study day|time) before/.test(w)), 'when there is no day to revise on, it says so instead of pretending');
const eOnly = P.planStudy({ ...base, exams: [exam({}), exam({ id: 'e2', subjectId: 's3', title: 'Chemistry quiz', examAt: '2026-10-20T03:30:00Z' })], onlyExamId: 'e1' });
check(eOnly.sessions.length === 3 && eOnly.sessions.every((s) => s.topic === 'Maths unit test'), 'revision for one chosen exam makes only that exam\'s sessions');
const eOnlyBusy = P.planStudy({ ...base, exams: [exam({})], onlyExamId: 'e1', replaceAi: false, existing: [ai, manual] });
check(noOverlap([...eOnlyBusy.sessions.filter((s) => ymd(s.startsAt) === '2026-10-15'), manual]), 'and it works around what is there');

section('7. Tasks that are due');
const t1 = task({ id: 'tA', title: 'Physics worksheet', dueAt: '2026-10-16T12:30:00Z', estMinutes: 90 });          // Friday 18:00 India
const rt = plan({ tasks: [t1] });
const tSess = rt.sessions.filter((s) => s.topic === 'Physics worksheet');
check(tSess.length === 2 && total(tSess) === 90 && tSess.every((s) => s.activity === 'homework' && s.subjectId === 's1'), 'a 90-minute task becomes two sessions that add up to 90 minutes');
check(tSess.every((s) => ymd(s.startsAt) <= '2026-10-16') && tSess.every((s) => /Due Friday/.test(s.why)), 'they are all before the deadline, and say when it is due', tSess.map((s) => s.startsAt + ' ' + s.why).join(' | '));
check(new Set(tSess.map((s) => ymd(s.startsAt))).size === 2, 'on two different days');
const overdue = plan({ tasks: [task({ title: 'Late essay', dueAt: '2026-10-12T12:00:00Z', estMinutes: 40, subjectId: 's2', kind: 'task' })] });
const oS = overdue.sessions.filter((s) => s.topic === 'Late essay');
check(oS.length === 1 && ymd(oS[0].startsAt) <= '2026-10-15' && oS[0].priority === 'high' && /overdue/.test(oS[0].why), 'an overdue task is placed at the very start and marked important, with a gentle note');
const done = plan({ tasks: [task({ title: 'Done thing', status: 'done', dueAt: '2026-10-15T12:00:00Z' })] });
check(done.sessions.every((s) => s.topic !== 'Done thing'), 'a finished task is not planned');
const worked = plan({ tasks: [task({ title: 'Lab report', dueAt: '2026-10-16T12:30:00Z', estMinutes: 60 })], existing: [sess({ topic: 'Lab report', subjectId: 's1', status: 'done', durationMin: 60, startsAt: '2026-10-14T00:30:00Z' })] });
check(worked.sessions.every((s) => s.topic !== 'Lab report'), 'time already done on a task is taken off what is planned for it');
const big = plan({ tasks: [task({ title: 'Huge project', dueAt: '2026-10-15T12:30:00Z', estMinutes: 240 })], dailyMinutes: 30, days: 3 });
check(big.warnings.some((w) => /Huge project.*could not fully fit/.test(w)), 'a task that cannot fit before its date is reported honestly');
const earlyDue = plan({ tasks: [task({ title: 'Morning thing', dueAt: '2026-10-16T01:30:00Z', estMinutes: 30 })] });          // Friday 07:00 India: due "early", so by Thursday
check(earlyDue.sessions.filter((s) => s.topic === 'Morning thing').every((s) => ymd(s.startsAt) <= '2026-10-15'), 'a task due early in the morning is done the day before');
const noDue = plan({ tasks: [task({ title: 'Read chapter 4', dueAt: null, subjectId: 's3', kind: 'task' })] });
check(noDue.sessions.some((s) => s.subjectId === 's3' && s.topic === 'Read chapter 4' && /task list/.test(s.why)), 'a task without a date shows up in its subject\'s sessions');
check(plan({ tasks: [task({ title: 'Later', dueAt: '2027-03-01T12:00:00Z' })] }).sessions.every((s) => s.topic !== 'Later' || /task list/.test(s.why)), 'a task due far away is not rushed');

section('8. Time zones and the clock changing');
const ny = P.planStudy({ ...base, tz: 'America/New_York', now: new Date('2027-03-10T12:00:00Z'), fromYmd: '2027-03-10', days: 7, partOfDay: ['morning'] });
const nyDays = byDay(ny, 'America/New_York');
const firstOf = (d) => d.slice().sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
check(firstOf(nyDays['2027-03-11']).startsAt === '2027-03-11T12:00:00.000Z', 'before the clocks change, 07:00 in New York is 12:00 UTC');
check(firstOf(nyDays['2027-03-15']).startsAt === '2027-03-15T11:00:00.000Z', 'after the clocks change, the same 07:00 is 11:00 UTC (the student\'s clock time stays 07:00)');
check(Object.values(nyDays).every((d) => noOverlap(d)), 'no overlaps across the change');
const ind = plan({ partOfDay: ['morning'] });
check(byDay(ind)['2026-10-15'].some((s) => s.startsAt === '2026-10-15T01:30:00.000Z'), 'in India 07:00 is 01:30 UTC');
const kath = P.planStudy({ ...base, tz: 'Asia/Kathmandu', partOfDay: ['morning'], fromYmd: '2026-10-15', now: new Date('2026-10-14T03:00:00Z') });
check(kath.sessions.some((s) => s.startsAt === '2026-10-15T01:15:00.000Z'), 'a time zone with a 45-minute offset is right too');

section('9. Limits and odd input');
const huge = P.planStudy({ ...base, days: 28, dailyMinutes: 480, sessionMinutes: 15, daysPerWeek: 7, partOfDay: ['morning', 'afternoon', 'evening', 'night'] });
check(huge.sessions.length <= 200 && Object.values(byDay(huge)).every((d) => d.length <= 8), 'a plan is never more than 200 sessions, or 8 in one day');
const spans = P.planStudy({ ...base, days: 100 });
check(Object.keys(byDay(spans)).length <= 28 && ymd(spans.sessions.at(-1).startsAt) <= '2026-11-10', 'at most 28 days are planned at once');
const tiny = plan({ dailyMinutes: 5, sessionMinutes: 5 });
check(tiny.sessions.every((s) => s.durationMin >= 15), 'absurdly small times are lifted to a sensible minimum (15 minutes)');
const giant = plan({ dailyMinutes: 5000, sessionMinutes: 1000, partOfDay: ['morning', 'afternoon', 'evening', 'night'] });
check(Object.values(byDay(giant)).every((d) => total(d) <= 480) && giant.sessions.every((s) => s.durationMin <= 90), 'absurdly large times are held to 8 hours a day and 90-minute sessions');
const nosub = plan({ subjects: [], tasks: [task({ title: 'One task', dueAt: '2026-10-16T12:30:00Z', subjectId: null, estMinutes: 30 })] });
check(nosub.sessions.length === 1 && nosub.sessions[0].subjectId === null && nosub.warnings.some((w) => /not added any subjects/.test(w)), 'with no subjects only the tasks and exams are planned, and it asks for subjects');
check(plan({ subjects: [] }).sessions.length === 0, 'with no subjects and nothing due, nothing is invented');
check(P.planStudy({ ...base, fromYmd: '2026-10-21', now: new Date('2026-10-14T03:00:00Z'), days: 3 }).sessions.every((s) => ymd(s.startsAt) >= '2026-10-21'), 'a plan for a later week starts there');

section('10. Moving a missed session');
const slotIn = { tz: TZ, now: base.now, fromYmd: '2026-10-14', dailyMinutes: 120, sessionMinutes: 30, daysPerWeek: 5, partOfDay: ['evening'], existing: [] };
check(local(P.nextFreeSlot(slotIn, 30)).endsWith('T17:30') && ymd(P.nextFreeSlot(slotIn, 30)) === '2026-10-14', 'the next free time is the first one in the student\'s chosen part of the day');
const wholeEve = sess({ startsAt: '2026-10-14T12:00:00Z', durationMin: 210 });
check(ymd(P.nextFreeSlot({ ...slotIn, existing: [wholeEve] }, 30)) === '2026-10-15', 'a full evening is skipped');
check(ymd(P.nextFreeSlot({ ...slotIn, fromYmd: '2026-10-17' }, 30)) === '2026-10-19', 'free days (the weekend) are skipped');
check(P.nextFreeSlot({ ...slotIn, existing: [sess({ startsAt: '2026-10-14T12:00:00Z', durationMin: 210 }), sess({ startsAt: '2026-10-15T12:00:00Z', durationMin: 210 })] }, 30, 2) === null, 'if nothing fits in the days searched, it says so (null), not a wrong time');
const nextAfterOne = P.nextFreeSlot({ ...slotIn, existing: [sess({ startsAt: '2026-10-14T12:00:00Z', durationMin: 60 })] }, 30);
check(local(nextAfterOne) === '2026-10-14T18:40', 'it keeps the 10-minute break after a session that is already there', local(nextAfterOne));
const missedAt = new Date('2026-10-16T05:00:00Z');
const ms = P.missedSessions([sess({ id: 'a', startsAt: '2026-10-15T12:00:00Z' }), sess({ id: 'b', startsAt: '2026-10-15T12:00:00Z', status: 'done' }), sess({ id: 'c', startsAt: '2026-10-15T12:00:00Z', status: 'skipped' }), sess({ id: 'd', startsAt: '2026-10-16T12:00:00Z' }), sess({ id: 'e', startsAt: '2026-10-16T04:30:00Z', durationMin: 30 })], missedAt);
check(ms.map((s) => s.id).join() === 'a', 'a missed session is one planned for a time that has passed: not done, not skipped, not still ahead (and a few minutes of grace)');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
