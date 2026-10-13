// Tests the practice rules that run on the phone (src/utils/studyQuiz.ts) AND proves they agree with the database. The phone shows "right" or "wrong" and
// "back in 6 days" the moment the student acts; the database does the real, saved marking and scheduling. If the two ever disagreed, the student would
// be told one thing and shown another, so here the same cases are put through both and compared.
//
// Usage: node scripts/supabase/test-noob-study-practice-logic.mjs
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createTestDb, asUser } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const Q = await import(pathToFileURL(path.resolve('src/utils/studyQuiz.ts')).href);

section('1. Checking an answer');
check(Q.norm('  NEWTON. ') === 'newton' && Q.norm('Newton,  the   law!') === 'newton the law' && Q.norm(null) === '' && Q.norm(5) === '5', 'capital letters, punctuation and extra spaces do not matter');
check(Q.norm('न्यूटन') === 'न्यूटन' && Q.norm('न्यूटन') !== Q.norm('ज्ञान'), 'other scripts are kept (two different Hindi words are different)');
check(Q.parseNumber('1,200') === 1200 && Q.parseNumber('6 N') === 6 && Q.parseNumber('-3') === -3 && Q.parseNumber('2e3') === 2000 && Q.parseNumber('0.5') === 0.5, 'numbers: thousands commas, a unit after, negatives, powers');
check(Q.parseNumber('abc') === null && Q.parseNumber('') === null && Q.parseNumber(null) === null && Q.parseNumber('N 6') === null, 'a word, nothing, or a number that does not start the answer is not a number');
const mcq = { type: 'mcq', question: 'q', options: ['a', 'b', 'c', 'd'], answer: 1, explanation: 'e' };
const tf = { type: 'tf', question: 'q', answer: false, explanation: 'e' };
const num = { type: 'numerical', question: 'q', answer: 6, unit: 'N', explanation: 'e' };
const fill = { type: 'fill', question: 'q', answer: 'newton', explanation: 'e' };
const short = { type: 'short', question: 'q', answer: 'x', explanation: 'e', marks: 4 };
check(Q.checkObjective(mcq, 1) === true && Q.checkObjective(mcq, 0) === false && Q.checkObjective(mcq, '1') === false && Q.checkObjective(mcq, null) === false, 'multiple choice: only the right option number');
check(Q.checkObjective(tf, false) === true && Q.checkObjective(tf, true) === false && Q.checkObjective(tf, 'false') === false, 'true or false');
check(Q.checkObjective(num, '6') === true && Q.checkObjective(num, '6 N') === true && Q.checkObjective(num, 6.05) === true && Q.checkObjective(num, '6.1') === false && Q.checkObjective(num, '') === false, 'a number within 1 percent');
check(Q.checkObjective(fill, 'Newton!') === true && Q.checkObjective(fill, 'newtons') === false && Q.checkObjective(fill, '') === false, 'a fill-in ignores capitals and full stops, but not a different word');
check(Q.checkObjective(short, 'anything') === null && Q.isOpenQuestion(short) && Q.isOpenQuestion({ ...short, type: 'case' }) && !Q.isOpenQuestion(fill), 'a written answer is left for the student to mark');
check(Q.answerText(mcq) === 'b' && Q.answerText(tf) === 'False' && Q.answerText({ ...tf, answer: true }) === 'True' && Q.answerText(num) === '6 N' && Q.answerText({ ...num, unit: '' }) === '6' && Q.answerText(fill) === 'newton', 'the right answer is written out for each kind');
check([100, 95, 90].every((p) => /Excellent/.test(Q.percentMessage(p))) && /Good job/.test(Q.percentMessage(75)) && /fair start/.test(Q.percentMessage(55)) && /okay/.test(Q.percentMessage(10)) && !/fail|bad|poor|stupid|wrong/i.test([0, 30, 60, 80, 100].map(Q.percentMessage).join(' ')), 'every score gets kind words, never harsh ones');

section('2. Flashcard waits (SM-2)');
let st = { reps: 0, intervalDays: 0, ease: 2.5, lapses: 0 };
const step = (qual) => { st = Q.nextCard(st, qual); return st; };
let s = step(3); check(s.reps === 1 && s.intervalDays === 1 && s.ease === 2.5, 'good: 1 day');
s = step(3); check(s.reps === 2 && s.intervalDays === 6, 'good again: 6 days');
s = step(3); check(s.reps === 3 && s.intervalDays === 15, 'good again: 6 x 2.5 = 15 days');
s = step(4); check(s.reps === 4 && s.ease === 2.6 && s.intervalDays === 39, 'easy: ease 2.6, 39 days');
s = step(2); check(s.reps === 5 && s.ease === 2.46 && s.intervalDays === 96, 'hard: ease 2.46, a longer wait still');
s = step(1); check(s.reps === 0 && s.intervalDays === 0 && s.lapses === 1 && s.ease === 2.26 && s.dueInMinutes === 10, 'again: starts over, back in 10 minutes');
for (let i = 0; i < 20; i++) step(1);
check(st.ease === 1.3, 'ease never falls below 1.3');
st = { reps: 5, intervalDays: 3000, ease: 4, lapses: 0 };
check(Q.nextCard(st, 4).ease === 4 && Q.nextCard(st, 4).intervalDays === 3650, 'ease never passes 4, and a wait never passes ten years');
check(Q.waitLabel(10) === '10 min' && Q.waitLabel(1440) === '1 day' && Q.waitLabel(6 * 1440) === '6 days' && Q.waitLabel(45 * 1440) === '2 months' && Q.waitLabel(400 * 1440) === '1.1 years' && Q.waitLabel(30 * 1440) === '1 month', 'waits are written in plain words');
const prev = Q.previewWaits({ reps: 0, intervalDays: 0, lapses: 0 });
check(prev[1] === '10 min' && prev[2] === '1 day' && prev[3] === '1 day' && prev[4] === '1 day', 'a new card: again 10 min; hard, good and easy 1 day');
const prev2 = Q.previewWaits({ reps: 3, intervalDays: 15, lapses: 0, ease: 2.5 });
check(prev2[1] === '10 min' && prev2[3] === '1 month' && prev2[4] === '1 month', 'each button says when the card will come back');
check(Q.parseCardLines('Force - A push\nMass: Amount of matter\nSpeed = distance / time\nWork\tforce x distance\nno separator here\n\n  \nEnergy :: ability to do work').map((c) => c.front + '|' + c.back).join('; ') === 'Force|A push; Mass|Amount of matter; Speed|distance / time; Work|force x distance; Energy|ability to do work', 'pasted lines become cards (dash, colon, equals sign, tab or ::)');
check(Q.parseCardLines('a - b\n'.repeat(100)).length === 60 && Q.parseCardLines('').length === 0 && Q.parseCardLines('Well-known - fact')[0].front === 'Well-known', 'at most 60 at a time; a hyphen inside a word is not a separator');

section('3. The phone and the database agree');
const db = await createTestDb();
await db.exec("update public.study_settings set mode = 'on'");   // NOOB STUDY ships as "coming soon"; these tests are about everything that happens once it is open
const mk = async (name) => {
  const id = (await db.query(`select gen_random_uuid() as id`)).rows[0].id;
  await db.query(`insert into auth.users (id, email, encrypted_password) values ($1, $2, 'x')`, [id, `${name}@users.nooob.xyz`]);
  if (!(await db.query(`select 1 from public.profiles where id = $1`, [id])).rows.length) await db.query(`insert into public.profiles (id, username, display_name) values ($1, $2, $2)`, [id, name]);
  return id;
};
const rpc = (uid, fn, ...args) => asUser(db, uid, async () => (await db.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).rows[0].r);
const J = (o) => JSON.stringify(o);
const user = await mk('zed');
await rpc(user, 'study_save_profile', J({ displayName: 'Zed' }), 1);
const qs = [
  { type: 'mcq', question: 'M', options: ['a', 'b', 'c', 'd'], answer: 2, explanation: 'x' },
  { type: 'tf', question: 'T', answer: true, explanation: 'x' },
  { type: 'numerical', question: 'N1', answer: 6, unit: 'N', explanation: 'x' },
  { type: 'numerical', question: 'N2', answer: 1200, explanation: 'x' },
  { type: 'numerical', question: 'N3', answer: -0.5, explanation: 'x' },
  { type: 'fill', question: 'F1', answer: 'newton', explanation: 'x' },
  { type: 'fill', question: 'F2', answer: 'न्यूटन', explanation: 'x' },
  { type: 'fill', question: 'F3', answer: 'Speed of light', explanation: 'x' }
];
const quiz = await rpc(user, 'study_quiz_save', J({ clientRef: crypto.randomUUID(), title: 'Parity', questions: qs }));
const tries = [
  [2, 1, 0, 0, 0, '', '', ''], [0, true, '6', '1200', '-0.5', 'Newton', 'न्यूटन', 'speed of light'], [3, false, '6.05', '1,200', '-0.50', ' NEWTON. ', 'ज्ञान', 'Speed  of   LIGHT!'],
  [null, null, '5.9', '1188', '-0.4', 'newtons', null, 'light speed'], ['2', 'true', '6 N', '1200 m', '+6', 'new ton', 'न्यूटन ', '  '], [2, true, '7', '1212.1', '-0.5005', '', 'न्यूटन.', 'speed-of-light'],
  [2, true, '6.0599', '1211.99', '-0.505', 'N E W T O N', '  न्यूटन  ', 'SPEED OF LIGHT'], [1, false, '0', '0', '0', '0', '0', '0'], [2, true, 'six', '1.2e3', '-5e-1', 'newton newton', 'न्यू टन', 'speed of light!!!']
];
let agree = 0, total = 0, firstBad = '';
for (const a of tries) {
  const res = await rpc(user, 'study_quiz_attempt_save', quiz.id, J(a), J({}), 0, crypto.randomUUID());
  qs.forEach((qq, i) => {
    const phone = Q.checkObjective(qq, a[i]);
    const server = res.results[i].correct;
    total++;
    if (phone === server) agree++; else if (!firstBad) firstBad = `${qq.question} given ${J(a[i])}: phone ${phone}, database ${server}`;
  });
}
check(agree === total, `the phone and the database mark ${total} answers the same way`, firstBad);
// the right answer written out, as the list of mistakes keeps it
const wrongRes = await rpc(user, 'study_quiz_attempt_save', quiz.id, J([0, false, '1', '1', '1', 'x', 'x', 'x']), J({}), 0, crypto.randomUUID());
const ml = (await rpc(user, 'study_mistakes_list', null, true, 50)).mistakes;
check(wrongRes.newMistakes >= 7 && qs.every((qq) => { const m = ml.find((x) => x.question === qq.question); return m && m.correctAnswer === Q.answerText(qq); }), 'the right answer is written the same way on the phone and in the list of mistakes');

// every card state the scheduler can reach, through every button
const cardOwner = await mk('yan');
await rpc(cardOwner, 'study_save_profile', J({ displayName: 'Yan' }), 1);
const deck = await rpc(cardOwner, 'study_deck_save', J({ title: 'Parity' }));
await rpc(cardOwner, 'study_cards_add', deck.id, J(Array.from({ length: 40 }, (_, i) => ({ front: 'f' + i, back: 'b' }))));
const cardIds = (await rpc(cardOwner, 'study_cards_list', deck.id, 60)).cards.map((c) => c.id);
const states = [];
for (const reps of [0, 1, 2, 3, 6, 12]) for (const iv of [0, 1, 6, 15, 90, 2000, 3649]) for (const ease of [1.3, 1.46, 2.5, 3.9, 4]) { if (reps === 0 && iv > 0) continue; if (reps === 1 && iv !== 1) continue; if (reps === 2 && iv !== 6) continue; states.push({ reps, iv, ease }); }
let cardAgree = 0, cardTotal = 0, cardBad = '';
let used = 0;
for (const stt of states) {
  for (const quality of [1, 2, 3, 4]) {
    const id = cardIds[used++ % cardIds.length];
    await db.query(`update public.study_cards set reps = $2, interval_days = $3, ease = $4, lapses = 2, due_at = now() where id = $1`, [id, stt.reps, stt.iv, stt.ease]);
    const server = await rpc(cardOwner, 'study_card_review', id, quality);
    const phone = Q.nextCard({ reps: stt.reps, intervalDays: stt.iv, ease: stt.ease, lapses: 2 }, quality);
    cardTotal++;
    const wait = (Date.parse(server.dueAt) - Date.now()) / 60000;
    const same = server.reps === phone.reps && server.intervalDays === phone.intervalDays && Math.abs(server.ease - phone.ease) < 0.0001 && server.lapses === phone.lapses && Math.abs(wait - phone.dueInMinutes) < 2;
    if (same) cardAgree++; else if (!cardBad) cardBad = `state ${J(stt)} quality ${quality}: phone ${J(phone)}, database ${J({ r: server.reps, i: server.intervalDays, e: server.ease, l: server.lapses, w: Math.round(wait) })}`;
  }
}
check(cardAgree === cardTotal, `the phone and the database schedule ${cardTotal} different card reviews the same way`, cardBad);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
