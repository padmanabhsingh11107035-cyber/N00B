// Tests migration 20261014000010 (NOOB STUDY, part 10): the notepad and the sketch board (small, private, and never readable by the administrator), and the
// last, complete version of "delete my data". On a REAL Postgres (PGlite) with every migration applied.
//
// Usage: node scripts/supabase/test-noob-study-notepad.mjs
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
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const J = (o) => JSON.stringify(o);
const ref = () => crypto.randomUUID();

const admin = await mkUser('boss', true), ann = await mkUser('ann'), bob = await mkUser('bob');
await rpc(ann, 'study_save_profile', J({ displayName: 'Ann' }), 1);
const subj = (await rpc(ann, 'study_set_subjects', J(['Physics', 'Maths']))).subjects;
const phys = subj[0].id;
const bobSubj = (await rpc(bob, 'study_set_subjects', J(['History']))).subjects[0].id;

section('1. Who can call what');
let anon = 0;
for (const call of [`study_notes_list()`, `study_note_save('{}'::jsonb)`, `study_sketches_list()`, `study_sketch_save('{}'::jsonb)`]) { try { await asAnon(db, async () => db.query(`select public.${call}`)); } catch (e) { if (/permission denied/.test(e.message)) anon++; } }
check(anon === 4, 'someone not signed in cannot use the notepad');
let direct = 0;
for (const t of ['study_notes', 'study_sketches']) { try { direct += (await asUser(db, ann, async () => db.query(`select * from public.${t}`))).rows.length; } catch { /* denied is fine */ } }
check(direct === 0, 'the notepad tables cannot be read directly');

section('2. Notes');
const n1 = await rpc(ann, 'study_note_save', J({ clientRef: ref(), title: 'Laws of motion', body: 'F = ma and the third law', subjectId: phys }));
check(n1.id && n1.updatedAt, 'a note is saved');
const g1 = await rpc(ann, 'study_note_get', n1.id);
check(g1.title === 'Laws of motion' && g1.body === 'F = ma and the third law' && g1.subjectId === phys && g1.pinned === false, 'and read back whole');
const cref = ref();
const a = await rpc(ann, 'study_note_save', J({ clientRef: cref, title: 'Twice', body: 'x' })), b = await rpc(ann, 'study_note_save', J({ clientRef: cref, title: 'Twice', body: 'y' }));
check(a.id === b.id && (await rpc(ann, 'study_note_get', a.id)).body === 'x', 'saving the same new note twice (a double tap) makes one');
const e1 = await rpc(ann, 'study_note_save', J({ id: n1.id, body: 'F = ma, the third law, and friction' }));
const g2 = await rpc(ann, 'study_note_get', n1.id);
check(g2.body.endsWith('friction') && g2.title === 'Laws of motion' && g2.subjectId === phys, 'changing only the words keeps the title and the subject');
await rpc(ann, 'study_note_save', J({ id: n1.id, title: 'Newton\'s laws', pinned: true }));
check((await rpc(ann, 'study_note_get', n1.id)).body.endsWith('friction') && (await rpc(ann, 'study_note_get', n1.id)).pinned === true, 'changing only the title and the pin keeps the words');
await rpc(ann, 'study_note_save', J({ id: n1.id, subjectId: null }));
check((await rpc(ann, 'study_note_get', n1.id)).subjectId === null, 'a note can be taken out of a subject');
await expectFail(() => rpc(ann, 'study_note_save', J({ title: 'x', subjectId: bobSubj })), /not yours/, 'a subject that is not theirs is refused');
await expectFail(() => rpc(ann, 'study_note_save', J({ title: 'big', body: 'a'.repeat(50001) })), /50,000 letters/, 'a note over 50,000 letters is refused, kindly');
check((await rpc(ann, 'study_note_save', J({ title: 't'.repeat(300), body: '' }))).id, 'a very long title is shortened, not refused');
const list = await rpc(ann, 'study_notes_list');
check(list.notes.length === 3 && list.notes[0].title === 'Newton\'s laws' && list.notes[0].pinned === true && list.count === 3 && list.countMax === 300, 'the list puts pinned notes first and says how full it is');
check(!('body' in list.notes[0]) && list.notes[0].preview.endsWith('friction'), 'it shows a short preview, not the whole note');
check((await rpc(ann, 'study_notes_list', null, 'FRICTION')).notes.length === 1 && (await rpc(ann, 'study_notes_list', null, 'newton')).notes.length === 1 && (await rpc(ann, 'study_notes_list', null, 'nothing like this')).notes.length === 0, 'search finds words in the title or the note, whatever the capitals');
check((await rpc(ann, 'study_notes_list', null, '%')).notes.length === 0 && (await rpc(ann, 'study_notes_list', null, '_')).notes.length === 0, 'search characters like % and _ are just characters, not wildcards');
check((await rpc(ann, 'study_notes_list', phys)).notes.length === 0, 'the list can be filtered by subject');
await expectFail(() => rpc(bob, 'study_note_get', n1.id), /no longer exists/, 'nobody else can read a note');
await expectFail(() => rpc(bob, 'study_note_save', J({ id: n1.id, body: 'hijack' })), /no longer exists/, 'nor change it');
check((await rpc(bob, 'study_note_delete', n1.id)).deleted === false && (await rpc(bob, 'study_notes_list')).notes.length === 0, 'nor delete it; and they see none of the student\'s notes');
check((await rpc(ann, 'study_note_delete', a.id)).deleted === true && (await rpc(ann, 'study_note_delete', a.id)).deleted === false, 'a note can be deleted (and deleting it again is harmless)');
await db.query(`insert into public.study_notes (user_id, title) select $1, 'bulk ' || g from generate_series(1, 299) g`, [ann]);
await expectFail(() => rpc(ann, 'study_note_save', J({ title: 'one too many' })), /300 notes/, 'at most 300 notes');
await db.query(`delete from public.study_notes where title like 'bulk %'`);
await db.query(`insert into public.study_notes (user_id, title, body) select $1, 'fat ' || g, repeat('a', 49000) from generate_series(1, 45) g`, [ann]);
await expectFail(() => rpc(ann, 'study_note_save', J({ title: 'too much', body: 'a'.repeat(100) })), /notepad is full/, 'the notepad as a whole is limited (about 2 million letters)');
await db.query(`delete from public.study_notes where title like 'fat %'`);

section('3. Sketches');
const stroke = (n = 5, extra = {}) => ({ t: 'pen', c: '#ff7755', w: 3, p: Array.from({ length: n }, (_, i) => [i * 10, i * 5]), ...extra });
const s1 = await rpc(ann, 'study_sketch_save', J({ clientRef: ref(), title: 'Free body diagram', strokes: [stroke(), stroke(3, { t: 'eraser', w: 12 })], width: 800, height: 600, paper: 'grid' }));
check(s1.id, 'a sketch is saved (as lines, not a picture)');
const sg = await rpc(ann, 'study_sketch_get', s1.id);
check(sg.strokes.length === 2 && sg.strokes[1].t === 'eraser' && sg.paper === 'grid' && sg.width === 800 && sg.title === 'Free body diagram', 'and read back exactly');
const sc = ref();
check((await rpc(ann, 'study_sketch_save', J({ clientRef: sc, strokes: [] }))).id === (await rpc(ann, 'study_sketch_save', J({ clientRef: sc, strokes: [stroke()] }))).id, 'saving the same new sketch twice makes one');
await rpc(ann, 'study_sketch_save', J({ id: s1.id, strokes: [stroke(), stroke(), stroke()], width: 800, height: 600, paper: 'light' }));
check((await rpc(ann, 'study_sketch_get', s1.id)).strokes.length === 3 && (await rpc(ann, 'study_sketch_get', s1.id)).title === 'Free body diagram' && (await rpc(ann, 'study_sketch_get', s1.id)).paper === 'light', 'a sketch can be updated (the title stays)');
check((await rpc(ann, 'study_sketch_save', J({ id: s1.id, strokes: [], paper: 'wallpaper' }))).id && (await rpc(ann, 'study_sketch_get', s1.id)).paper === 'dark', 'an unknown paper becomes the plain one');
await expectFail(() => rpc(ann, 'study_sketch_save', J({ strokes: [{ t: 'pen', c: 'red', w: 2 }] })), /could not be saved/, 'a line with no points is refused');
await expectFail(() => rpc(ann, 'study_sketch_save', J({ strokes: [{ t: 'knife', p: [[1, 1]] }] })), /could not be saved/, 'an unknown tool is refused');
await expectFail(() => rpc(ann, 'study_sketch_save', J({ strokes: 'nope' })), /too many lines|could not be saved/, 'something that is not a list is refused');
await expectFail(() => rpc(ann, 'study_sketch_save', J({ strokes: Array.from({ length: 3001 }, () => stroke(1)) })), /too many lines/, 'more than 3,000 lines is refused');
await expectFail(() => rpc(ann, 'study_sketch_save', J({ strokes: [stroke(30000)] })), /too big/, 'a sketch over about 300 KB is refused');
await expectFail(() => rpc(ann, 'study_sketch_save', J({ strokes: [], width: 99999 })), /could not be saved/, 'an impossible size is refused');
const sl = await rpc(ann, 'study_sketches_list');
check(sl.sketches.length === 2 && !('strokes' in sl.sketches[0]) === false && sl.count === 2 && sl.countMax === 100, 'the list shows how many lines each sketch has, not the lines');
check(sl.sketches.every((x) => typeof x.strokes === 'number'), 'a number, never the drawing itself');
await expectFail(() => rpc(bob, 'study_sketch_get', s1.id), /no longer exists/, 'nobody else can open a sketch');
await expectFail(() => rpc(bob, 'study_sketch_save', J({ id: s1.id, strokes: [] })), /no longer exists/, 'or change it');
check((await rpc(bob, 'study_sketch_delete', s1.id)).deleted === false && (await rpc(bob, 'study_sketches_list')).sketches.length === 0, 'or delete it');
await db.query(`insert into public.study_sketches (user_id, title) select $1, 's' || g from generate_series(1, 98) g`, [ann]);
await expectFail(() => rpc(ann, 'study_sketch_save', J({ strokes: [] })), /100 sketches/, 'at most 100 sketches');
await db.query(`delete from public.study_sketches where title ~ '^s[0-9]+$'`);
check((await rpc(ann, 'study_sketch_delete', s1.id)).deleted === true && (await rpc(ann, 'study_sketch_delete', s1.id)).deleted === false, 'a sketch can be deleted');

section('4. The administrator\'s switch, and the administrator can never read any of it');
await rpc(admin, 'admin_study_settings_save', 'on', '', true, J({ tutor: true, tests: true, rooms: true, library: true, practice: true, research: true, notepad: false }));
await expectFail(() => rpc(ann, 'study_notes_list'), /switched off/, 'when the notepad is switched off, students are told');
await expectFail(() => rpc(ann, 'study_sketch_get', s1.id), /switched off/, 'for sketches too');
check((await rpc(admin, 'study_notes_list')).notes.length === 0, 'the administrator is never stopped');
await rpc(admin, 'admin_study_settings_save', 'on', '', true, J({ tutor: true, tests: true, rooms: true, library: true, practice: true, research: true, notepad: true }));
await rpc(ann, 'study_note_save', J({ title: 'MY SECRET DIARY TITLE', body: 'SECRET WORDS I TELL NOBODY' }));
await rpc(ann, 'study_sketch_save', J({ title: 'MY SECRET DRAWING', strokes: [stroke()] }));
await rpc(ann, 'study_admission_save', J({ fullName: 'Ann Lee', level: 'class_11', consent: true }));
const blob = J(await rpc(admin, 'admin_study_student', ann)) + J(await rpc(admin, 'admin_study_overview', 30)) + J(await rpc(admin, 'admin_study_students', '', 30, 0));
check(!/SECRET/.test(blob), 'nothing from a student\'s notes or sketches is in anything the administrator can read');
check(!/"notes"|"sketches"|"strokes"/.test(blob), 'and the administrator\'s screens have no such fields at all');

section('5. Erasing');
await rpc(ann, 'study_save_profile', J({ displayName: 'Ann' }), 1);
await db.query(`insert into public.study_tests (user_id, subject_name, week_key, name, status, score, max_score, taken_at) values ($1, 'Physics', '2026-W41', 'Weekly test: Physics', 'done', 8, 10, now())`, [ann]);
await rpc(ann, 'study_delete_my_data', 'notepad');
const left = async (t) => Number((await q(`select count(*) as n from public.${t} where user_id = $1`, [ann]))[0].n);
check((await left('study_notes')) === 0 && (await left('study_sketches')) === 0, 'erasing the notepad removes every note and sketch');
check((await left('study_tests')) === 1 && (await left('study_admissions')) === 1, 'but not the test marks or the admission');
await rpc(ann, 'study_delete_my_data', 'practice');
check((await left('study_tests')) === 0 && (await left('study_admissions')) === 1, 'erasing practice removes the test marks too, and still not the admission');
await rpc(ann, 'study_note_save', J({ title: 'again' }));
await rpc(ann, 'study_delete_my_data', 'all');
check((await left('study_notes')) === 0 && (await left('study_admissions')) === 0, 'erasing everything removes the rest, including the admission');
await expectFail(() => rpc(bob, 'study_delete_my_data', 'bananas'), /choice is not known/, 'an unknown erase choice is refused');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
