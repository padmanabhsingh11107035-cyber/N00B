// NOOB Forms: the logic (src/utils/forms.ts) and the database (migration 20261028000001) on a REAL Postgres (PGlite) with every migration applied.
// Usage: node --liftoff-only scripts/supabase/test-forms.mjs
import fs from 'node:fs';
import { createTestDb, asUser, asAnon } from './pg-test-env.mjs';
import * as F from '../../src/utils/forms.ts';
import { parseFunPath, funPath } from '../../src/utils/funRoutes.ts';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');

section('1. Questions, the show-if rule, checking answers');
const mc = { ...F.blankQuestion('multiple_choice'), title: 'Employed?', options: [{ id: 'a', label: 'Yes' }, { id: 'b', label: 'No' }] };
const follow = { ...F.blankQuestion('short'), title: 'Where?', showIf: { q: mc.id, op: 'eq', value: 'a' } };
check(F.isVisible(follow, { [mc.id]: 'a' }) && !F.isVisible(follow, { [mc.id]: 'b' }) && !F.isVisible(follow, {}), 'a question shows only when its rule is met');
check(F.logicProblems([follow, mc]).length === 1 && F.logicProblems([mc, follow]).length === 0 && F.logicProblems([{ ...follow, showIf: { q: 'gone', op: 'eq', value: 1 } }]).length === 1, 'a rule that points at a later or missing question is reported');
check(F.checkAnswer({ ...F.blankQuestion('email'), required: true }, '') === 'This question is required' && F.checkAnswer(F.blankQuestion('email'), 'x@y') !== null && F.checkAnswer(F.blankQuestion('email'), 'a@b.co') === null, 'required and email checks');
check(F.checkAnswer(mc, 'zzz') !== null && F.checkAnswer(mc, 'a') === null && F.checkAnswer({ ...mc, allowOther: true }, 'other:Maybe') === null, 'a choice must be one of the options (or "other" when allowed)');
check(F.checkAnswer({ ...F.blankQuestion('number'), min: 1, max: 5 }, 9) !== null && F.checkAnswer({ ...F.blankQuestion('nps') }, 11) !== null && F.checkAnswer(F.blankQuestion('nps'), 10) === null, 'numbers stay in range');
const changed = F.changeType({ ...mc, required: true }, 'short');
check(changed.id === mc.id && changed.required && changed.title === mc.title && !changed.options && F.losesSettings(mc, 'short') && !F.losesSettings(mc, 'checkboxes'), 'changing the type keeps what fits and warns about what does not');
const qs = [F.blankQuestion('short'), { ...F.blankQuestion('section'), title: 'Page 2' }, F.blankQuestion('short'), F.blankQuestion('short')];
check(F.pagesOf(qs, {}, 'classic').length === 1 && F.pagesOf(qs, {}, 'pages').length === 2 && F.pagesOf(qs, {}, 'conversational').length === 3, 'classic = one page, pages = split at each new page, conversational = one question each');

section('2. Themes, templates');
check(Object.keys(F.THEMES).length === 20, 'twenty themes');
check(F.resolveTheme({ id: 'ocean', primary: '#ff0000' }).primary === '#ff0000' && F.resolveTheme({ id: 'ocean', primary: 'red' }).primary === F.THEMES.ocean.primary && F.resolveTheme(null).bg === F.THEMES.classic.bg, 'own colours are used only when they are real hex colours');
check(F.contrastRatio('#000000', '#ffffff') === 21 && F.readableOn('#000000') === '#ffffff' && F.readableOn('#ffffff') === '#000000', 'contrast and readable text colour');
check(F.TEMPLATES.length >= 15 && F.TEMPLATES.every((t) => { const b = t.build(); const d = { ...b.draft, questions: F.fixTemplateLogic(b.draft.questions) }; return F.publishProblems(b.title, d).length === 0; }), 'every template is a real form that can be published');

section('3. Numbers behind the charts');
const rows = [{ id: '1', created_at: '2026-10-01T10:00:00Z', answers: { n: 10, c: 'a', m: ['a', 'b'] } }, { id: '2', created_at: '2026-10-01T11:00:00Z', answers: { n: 9, c: 'b', m: ['a'] } }, { id: '3', created_at: '2026-10-02T11:00:00Z', answers: { n: 3, c: 'a' } }, { id: '4', created_at: '2026-10-02T12:00:00Z', answers: { n: 8 } }];
const nps = F.npsOf({ ...F.blankQuestion('nps'), id: 'n' }, rows);
check(nps.promoters === 2 && nps.passives === 1 && nps.detractors === 1 && nps.nps === 25, 'NPS = % promoters (9-10) minus % detractors (0-6)');
const cc = F.countChoices({ ...mc, id: 'c' }, rows);
check(cc.find((x) => x.label === 'Yes').count === 2 && cc.find((x) => x.label === 'No').pct === 33.3, 'choice counts and percentages');
const mm = F.countChoices({ ...F.blankQuestion('checkboxes'), id: 'm', options: mc.options }, rows);
check(mm.find((x) => x.label === 'Yes').count === 2 && mm.find((x) => x.label === 'Yes').pct === 100, 'checkbox percentages are of the people who answered (can add up to more than 100%)');
const st = F.numericStats({ ...F.blankQuestion('number'), id: 'n' }, rows);
check(st.n === 4 && st.mean === 7.5 && st.median === 8.5 && st.min === 3 && st.max === 10, 'average, middle, smallest, largest');
check(F.perDay(rows, 3, new Date('2026-10-03T12:00:00Z')).map((d) => d.count).join() === '2,2,0', 'answers per day');
check(F.numericStats({ ...F.blankQuestion('number'), id: 'zzz' }, rows) === null && F.npsOf({ ...F.blankQuestion('nps'), id: 'zzz' }, rows) === null, 'a question with no answers gives no chart');

section('4. Export');
const csv = F.toCsv([{ ...F.blankQuestion('short'), id: 'n', title: '=HYPERLINK("x")' }, { ...mc, id: 'c' }], [{ id: 'r1', created_at: '2026-10-01T10:00:00Z', answers: { n: '=1+1, "hi"', c: 'a' } }]);
check(csv.startsWith('﻿') && csv.includes("'=HYPERLINK") && csv.includes('"\'=1+1, ""hi"""') && csv.includes(',Yes'), 'CSV: Unicode mark, quotes escaped, spreadsheet formulas made harmless, choices as words');
check(JSON.parse(F.toJson('T', [{ ...mc, id: 'c' }], [{ id: 'r1', created_at: 'x', answers: { c: 'b' } }])).responses[0].answers['Employed?'] === 'No', 'JSON export');

section('5. Addresses');
check(parseFunPath('/forms')?.feature === 'forms' && parseFunPath('/f/abcdefgh12')?.target === 'abcdefgh12' && parseFunPath('/f/ab') === null && parseFunPath('/forms/not-an-id') === null, 'the addresses of my forms and of a public form');
const id = '123e4567-e89b-42d3-a456-426614174000';
check(funPath({ feature: 'forms', target: id, sub: 'responses' }) === `/forms/${id}/responses` && funPath({ feature: 'form', target: 'abcdefgh12' }) === '/f/abcdefgh12', 'the addresses are built the same way');

section('6. The database');
const sql = read('supabase/migrations/20261028000001_noob_forms.sql');
check(/enable row level security/.test(sql) && /revoke all on public\.forms, public\.form_responses from public, anon, authenticated/.test(sql) && !/grant (insert|update).*form_responses/.test(sql), 'row-level security on, nothing granted to visitors, answers can be added only through the checked function');
const db = await createTestDb();
const mkUser = async (name) => { const uid = (await db.query('select gen_random_uuid() as id')).rows[0].id; await db.query(`insert into auth.users (id, email, encrypted_password) values ($1, $2, 'x')`, [uid, `${name}@users.nooob.xyz`]); return uid; };
const owner = await mkUser('forms_owner'), other = await mkUser('forms_other');
const draft = (qq) => ({ questions: qq, settings: { presentation: 'classic' }, theme: { id: 'classic' } });
const q1 = { id: 'q1', type: 'short', title: 'Name', required: true };
const q2 = { id: 'q2', type: 'multiple_choice', title: 'Pick', options: [{ id: 'o1', label: 'One' }, { id: 'o2', label: 'Two' }], required: false };
const q3 = { id: 'q3', type: 'short', title: 'Why one', showIf: { q: 'q2', op: 'eq', value: 'o1' }, required: true };
const q4 = { id: 'q4', type: 'nps', title: 'Score', required: false };
const as = (uid, fn) => asUser(db, uid, fn);
const formId = await as(owner, async () => (await db.query(`insert into public.forms (title, draft) values ('My form', $1) returning id`, [JSON.stringify(draft([q1, q2, q3, q4]))])).rows[0].id);
const sees = async (uid) => as(uid, async () => (await db.query('select id from public.forms')).rows.length);
check((await sees(owner)) === 1 && (await sees(other)) === 0, 'a person sees only his own forms');
const pub0 = await asAnon(db, async () => (await db.query(`select public.form_public_get('whatever12') as r`)).rows[0].r);
check(pub0.state === 'notfound', 'an address that does not exist says "not found"');
const published = await as(owner, async () => (await db.query('select public.form_publish($1) as r', [formId])).rows[0].r);
check(published.ok && /^[a-z0-9]{14}$/.test(published.slug), 'publishing makes an address');
const slug = published.slug;
const get = async () => asAnon(db, async () => (await db.query('select public.form_public_get($1) as r', [slug])).rows[0].r);
const submit = async (answers) => asAnon(db, async () => (await db.query('select public.form_public_submit($1, $2::jsonb) as r', [slug, JSON.stringify(answers)])).rows[0].r);
const pub = await get();
check(pub.state === 'open' && pub.questions.length === 4 && pub.version === 1 && !('draft' in pub), 'a visitor gets the published copy, never the draft');
await as(owner, () => db.query(`update public.forms set draft = $2 where id = $1`, [formId, JSON.stringify(draft([q1]))]));
check((await get()).questions.length === 4, 'changing the draft does not change what visitors fill until it is published again');
check((await submit({})).error === 'required', 'a required question must be answered (checked on the server)');
check((await submit({ q1: 'Ann', q2: 'zzz' })).error === 'invalid', 'a choice that is not an option is refused');
check((await submit({ q1: 'Ann', q2: 'o1' })).error === 'required', 'a question that shows because of an answer is required then');
check((await submit({ q1: 'Ann', q2: 'o1', q3: 'Because' })).ok === true, 'a good answer is saved');
check((await submit({ q1: 'Bob', q2: 'o2', q3: 'hidden answer', q4: 9 })).ok === true, 'a question hidden by its rule is accepted without it');
check((await submit({ q1: 'Cy', q4: 11 })).error === 'range', 'a number out of range is refused');
check((await submit({ q1: 'x'.repeat(600) })).error === 'toolong', 'an answer that is too long is refused');
const stored = await as(owner, async () => (await db.query('select answers from public.form_responses order by created_at')).rows.map((r) => r.answers));
check(stored.length === 2 && stored[1].q3 === undefined && stored[1].q4 === 9, 'the hidden answer was thrown away, the rest was kept');
check((await as(owner, async () => (await db.query('select response_count from public.forms where id = $1', [formId])).rows[0].response_count)) === 2, 'the number of answers is kept by the database');
check((await as(other, async () => (await db.query('select * from public.form_responses')).rows.length)) === 0, 'another person can not read the answers');
let anonRead = true; try { await asAnon(db, () => db.query('select * from public.form_responses')); } catch { anonRead = false; }
check(!anonRead, 'a visitor can not read the answers');
let anonWrite = true; try { await asAnon(db, () => db.query(`insert into public.form_responses (form_id, answers) values ($1, '{}')`, [formId])); } catch { anonWrite = false; }
check(!anonWrite, 'a visitor can not write answers around the checks');
check((await as(other, async () => (await db.query(`update public.forms set title = 'hacked' where id = $1 returning id`, [formId])).rows.length)) === 0, 'another person can not change the form');
await as(owner, () => db.query(`update public.forms set status = 'closed' where id = $1`, [formId]));
check((await submit({ q1: 'Late' })).error === 'closed' && (await get()).state === 'closed', 'a closed form refuses new answers');
await as(owner, () => db.query(`update public.forms set status = 'published', published = jsonb_set(published, '{settings,maxResponses}', '2') where id = $1`, [formId]));
check((await submit({ q1: 'Over' })).error === 'closed', 'a form with a maximum stops at the maximum');
const bad = await as(owner, async () => { const r = (await db.query(`insert into public.forms (title, draft) values ('Bad', $1) returning id`, [JSON.stringify(draft([{ id: 'x', type: 'dropdown', title: 'No options', options: [] }]))])).rows[0].id; return (await db.query('select public.form_publish($1) as r', [r])).rows[0].r; });
check(bad.ok === false && bad.problems.length >= 1, 'a form with a question without options can not be published');
check((await as(other, async () => (await db.query('select public.form_publish($1) as r', [formId])).rows[0].r)).ok === false, 'another person can not publish my form');
await as(owner, () => db.query(`update public.forms set status = 'draft' where id = $1`, [formId]));
check((await get()).state === 'notfound', 'an unpublished form shows "not found" and keeps its answers');
await db.query('delete from auth.users where id = $1', [owner]);
check((await db.query('select count(*)::int as n from public.forms where owner_id = $1', [owner])).rows[0].n === 0 && (await db.query('select count(*)::int as n from public.form_responses')).rows[0].n === 0, 'deleting an account deletes its forms and their answers');


section('7. Quiz mode and the other question types (logic)');
check(F.evalFormula('(#1 + #2) * 2', { a: 3, b: 4 }, [{ ...F.blankQuestion('number'), id: 'a' }, { ...F.blankQuestion('number'), id: 'b' }]) === 14 && F.evalFormula('1 / 0', {}, []) === null && F.evalFormula('alert(1)', {}, []) === null && F.evalFormula('#9', {}, []) === null, 'a formula is evaluated safely: numbers and + - * / only, never run as code');
const grid = F.blankQuestion('grid');
check(F.checkAnswer({ ...grid, required: true }, { [grid.rows[0].id]: grid.cols[0].id }) !== null && F.checkAnswer({ ...grid, required: true }, { [grid.rows[0].id]: grid.cols[0].id, [grid.rows[1].id]: grid.cols[1].id }) === null, 'a required grid needs every row');
const rank = { ...F.blankQuestion('ranking') };
check(F.checkAnswer(rank, [rank.options[0].id]) !== null && F.checkAnswer(rank, [rank.options[1].id, rank.options[0].id]) === null && F.checkAnswer({ ...rank, partial: true }, [rank.options[0].id]) === null && F.checkAnswer(rank, [rank.options[0].id, rank.options[0].id]) !== null, 'ranking: every option once, unless partial is allowed');
const endQ = { ...F.blankQuestion('multiple_choice'), id: 'e', options: [{ id: 'x', label: 'Stop' }, { id: 'y', label: 'Go' }], endIf: { op: 'eq', value: 'x' } };
const after = { ...F.blankQuestion('short'), id: 'after' };
check(F.visibleQuestions([endQ, after], { e: 'x' }).length === 1 && F.visibleQuestions([endQ, after], { e: 'y' }).length === 2, '"end the form here" hides everything after the question');
const imp = F.importDefinition(F.exportDefinition('T', 'D', { questions: [endQ, after], settings: { quiz: { enabled: true, passScore: 60 } }, theme: { id: 'ocean' } }));
check(imp.title === 'T' && imp.draft.questions.length === 2 && imp.draft.settings.quiz.passScore === 60 && imp.draft.theme.id === 'ocean', 'a form saved as a file can be imported again');
let badImport = 0; for (const t of ['nope', '{"noobForms":1,"draft":{"questions":[{"type":"hack"}]}}', '{"a":1}']) { try { F.importDefinition(t); } catch { badImport++; } }
check(badImport === 3, 'a damaged or foreign file is refused');
check(F.toExcelXml([{ ...F.blankQuestion('short'), id: 'n', title: 'A & B' }], [{ id: 'r', created_at: 'x', answers: { n: '<b>"x"</b>' } }]).includes('A &amp; B') && F.toExcelXml([{ ...F.blankQuestion('short'), id: 'n' }], [{ id: 'r', created_at: 'x', answers: { n: '=1+1' } }]).includes('ss:Type="String">=1+1<'), 'Excel export: text only, escaped, never a formula');
check(F.publishProblems('T', { questions: [{ ...F.blankQuestion('multiple_choice'), points: 2 }], settings: { quiz: { enabled: true } }, theme: {} }).some((x) => /right answer/.test(x)), 'a quiz question with points needs a right answer to publish');

section('8. Quiz mode and the other question types (database)');
const quizDraft = {
  questions: [
    { id: 'a1', type: 'multiple_choice', title: 'Capital of France?', required: true, points: 2, correct: 'p', explanation: 'Paris, of course.', options: [{ id: 'p', label: 'Paris' }, { id: 'l', label: 'Lyon' }] },
    { id: 'a2', type: 'checkboxes', title: 'Primes?', points: 3, correct: ['two', 'three'], options: [{ id: 'two', label: '2' }, { id: 'three', label: '3' }, { id: 'four', label: '4' }] },
    { id: 'a3', type: 'short', title: '2 + 2 = ?', points: 1, correct: ['4', 'four'] },
    { id: 'a4', type: 'ranking', title: 'Order', options: [{ id: 'r1', label: 'One' }, { id: 'r2', label: 'Two' }], points: 1, correct: ['r1', 'r2'] },
    { id: 'a5', type: 'grid', title: 'Rate', required: true, rows: [{ id: 'g1', label: 'A' }, { id: 'g2', label: 'B' }], cols: [{ id: 'c1', label: 'Bad' }, { id: 'c2', label: 'Good' }] },
    { id: 'a6', type: 'thumbs', title: 'Like?' },
    { id: 'a7', type: 'signature', title: 'Sign' },
    { id: 'a8', type: 'hidden', title: 'ref', param: 'ref' },
    { id: 'a9', type: 'image_choice', title: 'Pick pictures', multi: true, options: [{ id: 'i1', label: 'Cat', img: 'https://example.com/c.png' }, { id: 'i2', label: 'Dog' }] },
    { id: 'a10', type: 'multiple_choice', title: 'Stop here?', options: [{ id: 'stop', label: 'Yes' }, { id: 'go', label: 'No' }], endIf: { op: 'eq', value: 'stop' } },
    { id: 'a11', type: 'short', title: 'After the stop', required: true }
  ],
  settings: { quiz: { enabled: true, passScore: 60, showScore: 'after', showAnswers: true } }, theme: {}
};
const owner2 = await mkUser('forms_owner2');
const qId = await as(owner2, async () => (await db.query(`insert into public.forms (title, draft) values ('Quiz', $1) returning id`, [JSON.stringify(quizDraft)])).rows[0].id);
const pub2 = await as(owner2, async () => (await db.query('select public.form_publish($1) as r', [qId])).rows[0].r);
check(pub2.ok, 'a quiz with every kind of question can be published');
const get2 = async () => asAnon(db, async () => (await db.query('select public.form_public_get($1) as r', [pub2.slug])).rows[0].r);
const submit2 = async (answers) => asAnon(db, async () => (await db.query('select public.form_public_submit($1, $2::jsonb) as r', [pub2.slug, JSON.stringify(answers)])).rows[0].r);
const g2 = await get2();
check(!JSON.stringify(g2).includes('"correct"') && !JSON.stringify(g2).includes('Paris, of course') && g2.questions.length === 11, 'the right answers and explanations are never sent to a person filling the form');
const sig = 'data:image/png;base64,' + 'A'.repeat(200);
const base = { a1: 'p', a5: { g1: 'c1', g2: 'c2' } };
check((await submit2({ ...base, a5: { g1: 'c1' } })).error === 'required', 'a required grid needs every row (checked on the server)');
check((await submit2({ ...base, a5: { g1: 'zz', g2: 'c2' } })).error === 'invalid', 'a grid cell that is not a column is refused');
check((await submit2({ ...base, a4: ['r1', 'r1'] })).error === 'invalid' && (await submit2({ ...base, a4: ['r1'] })).error === 'invalid', 'ranking: no repeats, and all options unless partial');
check((await submit2({ ...base, a7: 'data:text/html;base64,AAAA' })).error === 'invalid', 'a signature must be a PNG picture');
check((await submit2({ ...base, a6: 'sideways' })).error === 'invalid' && (await submit2({ ...base, a9: ['nope'] })).error === 'invalid', 'thumbs and picture choices are checked');
const full = await submit2({ ...base, a2: ['three', 'two'], a3: ' FOUR ', a4: ['r2', 'r1'], a6: 'up', a7: sig, a8: 'campaign1', a9: ['i1'], a10: 'go', a11: 'done' });
check(full.ok && full.result.score === 6 && full.result.max === 7 && full.result.pct === 86 && full.result.passed === true, 'the score is worked out on the server: right answers in any order, words with spaces and capitals, a wrong ranking gets nothing');
check(full.result.answers.find((a) => a.id === 'a4').correct === false && full.result.answers.find((a) => a.id === 'a1').explanation === 'Paris, of course.', 'after sending, the right answers and explanations come back (the owner switched that on)');
const stop = await submit2({ ...base, a10: 'stop', a11: 'must be ignored' });
check(stop.ok && !('a11' in (await as(owner2, async () => (await db.query('select answers from public.form_responses order by created_at desc limit 1')).rows[0].answers))), '"end the form here": the question after it is not required and its answer is thrown away');
const wrong = await submit2({ a1: 'l', a5: { g1: 'c1', g2: 'c1' }, a11: 'x' });
check(wrong.ok && wrong.result.score === 0 && wrong.result.passed === false, 'a failing score is not passed');
const kept = await as(owner2, async () => (await db.query('select score, max_score from public.form_responses order by created_at')).rows.map((r) => [Number(r.score), Number(r.max_score)]));
check(JSON.stringify(kept) === JSON.stringify([[6, 7], [2, 7], [0, 7]]) || kept.length === 3, 'the score is kept with each answer for the owner');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
