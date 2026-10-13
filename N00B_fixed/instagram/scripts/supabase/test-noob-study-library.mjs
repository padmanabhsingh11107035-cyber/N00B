// Tests migration 20261014000004 (NOOB STUDY, part 4): the library. Adding a document in pieces, finishing it, listing, reading, searching a
// student's own notes, what the tutor reads for one question (with numbered sources), renaming, deleting, the limits, and that nothing of
// one student ever reaches another. On a REAL Postgres (PGlite) with every migration applied.
//
// Usage: node scripts/supabase/test-noob-study-library.mjs
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
const mkUser = async (name) => {
  const id = (await db.query(`select gen_random_uuid() as id`)).rows[0].id;
  await db.query(`insert into auth.users (id, email, encrypted_password) values ($1, $2, 'x')`, [id, `${name}@users.nooob.xyz`]);
  const has = (await db.query(`select 1 from public.profiles where id = $1`, [id])).rows.length;
  if (!has) await db.query(`insert into public.profiles (id, username, display_name) values ($1, $2, $2)`, [id, name]);
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

const ann = await mkUser('ann'), bob = await mkUser('bob');
await rpc(ann, 'study_save_profile', J({ displayName: 'Ann', level: 'class_11' }), 1);
const subj = (await rpc(ann, 'study_set_subjects', J(['Physics', 'Biology']))).subjects;
const phys = subj[0].id, bio = subj[1].id;
const bobSubj = (await rpc(bob, 'study_set_subjects', J(['History']))).subjects[0].id;

const NEWTON = [
  { page: 1, text: 'Newton\'s first law says an object stays at rest or moves in a straight line at constant speed unless a net force acts on it. This is also called the law of inertia.' },
  { page: 2, text: 'Newton\'s second law states that the net force on an object equals its mass multiplied by its acceleration, F = ma. A larger force gives a larger acceleration.' },
  { page: 3, text: 'Newton\'s third law: for every action there is an equal and opposite reaction. A rocket pushes gas down and the gas pushes the rocket up.' }
];
const PHOTO = [{ page: 1, text: 'Photosynthesis is the process by which green plants make glucose from carbon dioxide and water using sunlight absorbed by chlorophyll.' }];
const add = async (uid, title, chunks, opts = {}) => {
  const m = await rpc(uid, 'study_material_create', title, opts.subject ?? null, opts.kind ?? 'pdf', opts.source ?? 'file.pdf', opts.pages ?? null, ref());
  await rpc(uid, 'study_material_add_chunks', m.id, J(chunks));
  return rpc(uid, 'study_material_finish', m.id, '');
};

section('1. Who can call what');
let anon = 0;
for (const call of [`study_materials_list()`, `study_material_create('x', null, 'notes', '', null, null)`, `study_material_search('x')`]) { try { await asAnon(db, async () => db.query(`select public.${call}`)); } catch (e) { if (/permission denied/.test(e.message)) anon++; } }
check(anon === 3, 'someone not signed in cannot use the library');
let direct = 0;
for (const t of ['study_materials', 'study_chunks']) { try { direct += (await asUser(db, ann, async () => db.query(`select * from public.${t}`))).rows.length; } catch { /* denied is fine */ } }
check(direct === 0, 'the library tables cannot be read directly');
let internal = 0;
for (const call of [`study_int_chunks('${ann}', null, 'x')`, `study_int_ortsquery('x')`, `study_int_own_material('${ann}', gen_random_uuid())`]) { try { await rpc(ann, call.replace(/\(.*$/, ''), ...[]); } catch (e) { if (/permission denied|does not exist/.test(e.message)) internal++; } }
check(internal === 3, 'the helper functions are not available to students');
let svcDenied = 0;
try { await rpc(ann, 'study_svc_context', ann, null, null, 'x'); } catch (e) { if (/permission denied/.test(e.message)) svcDenied++; }
check(svcDenied === 1, 'the server-side function that reads notes for the tutor is not available to students');

section('2. Adding a document');
const m1 = await rpc(ann, 'study_material_create', 'Laws of motion', phys, 'pdf', 'motion.pdf', 3, ref());
check(m1.title === 'Laws of motion' && m1.status === 'processing' && m1.kind === 'pdf' && m1.subjectId === phys && m1.pages === 3 && m1.chunkCount === 0, 'a document starts as "processing" with its details');
const sameRef = ref();
const r1 = await rpc(ann, 'study_material_create', 'Twice', null, 'notes', '', null, sameRef), r2 = await rpc(ann, 'study_material_create', 'Twice', null, 'notes', '', null, sameRef);
check(r1.id === r2.id, 'creating the same document twice (a double tap) makes one');
await expectFail(() => rpc(ann, 'study_material_create', '   ', null, 'notes', '', null, ref()), /give the document a name/, 'a document needs a name');
await expectFail(() => rpc(ann, 'study_material_create', 'X', null, 'virus', '', null, ref()), /kind of document is not known/, 'an unknown kind is refused');
await expectFail(() => rpc(ann, 'study_material_create', 'X', bobSubj, 'notes', '', null, ref()), /not yours/, 'a subject that is not theirs is refused');
check((await rpc(ann, 'study_material_create', 'x'.repeat(300), null, 'notes', '', 99999, ref())).title.length === 140, 'a very long name is shortened, and an impossible page count ignored');

const a1 = await rpc(ann, 'study_material_add_chunks', m1.id, J(NEWTON));
check(a1.added === 3 && a1.material.chunkCount === 3 && a1.material.charCount === NEWTON.reduce((a, c) => a + c.text.length, 0), 'the pieces are added in order, and counted');
const a2 = await rpc(ann, 'study_material_add_chunks', m1.id, J([{ page: 4, text: '  Extra piece  ' }, { text: '   ' }, { page: 'x', text: 'no page here' }, { page: 99999, text: 'impossible page' }]));
check(a2.added === 3, 'blank pieces are skipped');
const read = await rpc(ann, 'study_material_get', m1.id, -1, 40);
check(read.chunks.map((c) => c.idx).join() === '0,1,2,3,4,5' && read.chunks[3].text === 'Extra piece' && read.chunks[4].page === null && read.chunks[5].page === null, 'order continues across calls; text is trimmed; a bad page number becomes "no page"', J(read.chunks.map((c) => [c.idx, c.page])));
await expectFail(() => rpc(ann, 'study_material_add_chunks', m1.id, J([{ text: 'a'.repeat(4001) }])), /too long/, 'one huge piece is refused');
await expectFail(() => rpc(ann, 'study_material_add_chunks', m1.id, J(Array.from({ length: 41 }, () => ({ text: 'x' })))), /smaller pieces/, 'more than 40 pieces at once is refused');
await expectFail(() => rpc(ann, 'study_material_add_chunks', m1.id, J({ text: 'x' })), /no text to add/, 'something that is not a list is refused');
await expectFail(() => rpc(bob, 'study_material_add_chunks', m1.id, J([{ text: 'hello' }])), /no longer exists/, 'nobody else can add to a student\'s document');
check((await rpc(ann, 'study_material_get', m1.id, -1, 40)).material.chunkCount === 6, 'refused additions left nothing behind');

section('3. Finishing');
const fin = await rpc(ann, 'study_material_finish', m1.id, 'Read from a PDF');
check(fin.status === 'ready' && fin.note === 'Read from a PDF', 'a document with text becomes ready');
check((await rpc(ann, 'study_material_finish', m1.id, 'again')).note === 'Read from a PDF', 'finishing twice changes nothing');
await expectFail(() => rpc(ann, 'study_material_add_chunks', m1.id, J([{ text: 'late' }])), /already finished/, 'a finished document can not be added to');
const empty = await rpc(ann, 'study_material_create', 'Scanned', null, 'pdf', 's.pdf', 2, ref());
const emptyDone = await rpc(ann, 'study_material_finish', empty.id, '');
check(emptyDone.status === 'failed' && /No readable text/.test(emptyDone.note), 'a document with no text is "failed", with a plain reason');
await rpc(ann, 'study_material_delete', empty.id);

section('4. The library list');
const bioM = await add(ann, 'Plants', PHOTO, { subject: bio, kind: 'notes' });
const bobM = await add(bob, 'Rome', [{ page: 1, text: 'The Roman Republic was replaced by the Empire under Augustus. Newton was not born yet.' }], { subject: bobSubj });
const all = await rpc(ann, 'study_materials_list');
check(all.materials.map((m) => m.title).sort().join('|') === 'Laws of motion|Plants|Twice|' + 'x'.repeat(140), 'the student sees their own documents (newest first)', all.materials.map((m) => m.title).join('|'));
check(all.count === 4 && all.countMax === 60 && all.charsMax === 4000000 && all.charsUsed > 0, 'and how full the library is');
check((await rpc(ann, 'study_materials_list', phys)).materials.length === 1 && (await rpc(ann, 'study_materials_list', bio)).materials[0].title === 'Plants', 'it can be filtered by subject');
check((await rpc(bob, 'study_materials_list')).materials.map((m) => m.title).join() === 'Rome', 'another student sees only theirs');

section('5. Searching');
const s1 = await rpc(ann, 'study_material_search', 'what is newton\'s second law?');
check(s1.hits.length > 0 && s1.hits[0].page === 2 && s1.hits[0].title === 'Laws of motion' && /second law/i.test(s1.hits[0].snippet.replace(/[⟦⟧]/g, '')) && /⟦second⟧/.test(s1.hits[0].snippet), 'a question finds the right page first, with the matching words marked', J(s1.hits.map((h) => [h.page, h.rank])));
check((await rpc(ann, 'study_material_search', 'photosynthesis chlorophyll')).hits[0].title === 'Plants', 'a search across the whole library finds another document');
check((await rpc(ann, 'study_material_search', 'newton', phys)).hits.length >= 3 && (await rpc(ann, 'study_material_search', 'photosynthesis', phys)).hits.length === 0, 'it can be limited to a subject');
check((await rpc(ann, 'study_material_search', 'newton', null, bioM.id)).hits.length === 0 && (await rpc(ann, 'study_material_search', 'newton', null, m1.id)).hits.length >= 3, 'or to one document');
check((await rpc(ann, 'study_material_search', 'Augustus Roman Empire')).hits.length === 0, 'it never finds another student\'s notes');
check((await rpc(bob, 'study_material_search', 'newton')).hits.length === 1 && (await rpc(bob, 'study_material_search', 'newton')).hits[0].title === 'Rome', 'and another student searches only theirs');
check((await rpc(ann, 'study_material_search', 'the and what')).hits.length === 0 && (await rpc(ann, 'study_material_search', '')).hits.length === 0 && (await rpc(ann, 'study_material_search', null)).hits.length === 0, 'a search with only common words, or nothing, finds nothing (and does not fail)');
let odd = true;
for (const w of ['&|!:*', '\'; drop table study_materials; --', '((((', 'a b', '\\', 'x'.repeat(5000), '🙂🙂🙂']) { try { await rpc(ann, 'study_material_search', w); } catch { odd = false; } }
check(odd, 'odd characters in a search never cause an error');
const open = await rpc(ann, 'study_material_create', 'Still reading', null, 'notes', '', null, ref());
await rpc(ann, 'study_material_add_chunks', open.id, J([{ text: 'newton secret unfinished' }]));
check((await rpc(ann, 'study_material_search', 'secret unfinished')).hits.length === 0, 'a document that is not finished is not searched yet');
await rpc(ann, 'study_material_delete', open.id);
const hindi = await add(ann, 'हिंदी नोट्स', [{ page: 1, text: 'न्यूटन का दूसरा नियम बल और त्वरण का संबंध बताता है।' }], { kind: 'text' });
check((await rpc(ann, 'study_material_search', 'न्यूटन')).hits.some((h) => h.materialId === hindi.id), 'notes in another script are stored and found');
check((await rpc(ann, 'study_material_search', 'newton', null, null, 2)).hits.length === 2 && (await rpc(ann, 'study_material_search', 'newton', null, null, 500)).hits.length <= 25, 'the number of results is limited');

section('6. What the tutor reads for a question');
const ctx = await svc('study_svc_context', ann, null, m1.id, 'explain newton\'s second law');
check(ctx.chunks.length > 0 && ctx.chunks[0].n === 1 && ctx.chunks[0].title === 'Laws of motion' && ctx.chunks[0].page === 2 && /second law/.test(ctx.chunks[0].text), 'the best-matching piece comes first, numbered [1], with the document\'s name and page', J(ctx.chunks.map((c) => [c.n, c.page])));
check(ctx.chunks.every((c, i) => c.n === i + 1) && ctx.chunks.length <= 5, 'the numbers run 1, 2, 3 … and no more than five pieces are used');
const startOnly = await svc('study_svc_context', ann, null, m1.id, '');
check(startOnly.chunks.length >= 1 && startOnly.chunks[0].page === 1 && startOnly.chunks.length <= 4, 'with no question the start of the document is used (a summary)');
const nomatch = await svc('study_svc_context', ann, null, m1.id, 'zebra giraffe');
check(nomatch.chunks.length >= 1 && nomatch.chunks[0].page === 1, 'a question that matches nothing falls back to the start of the document');
check((await svc('study_svc_context', ann, null, bobM.id, 'newton')).chunks.length === 0, 'a student can not make the tutor read another student\'s document');
check((await svc('study_svc_context', ann, null, null, 'newton')).chunks.length === 0, 'with no document chosen the tutor reads none');
check((await svc('study_svc_context', ann, null, ref(), 'newton')).chunks.length === 0, 'a document that does not exist gives none');
const proc = await rpc(ann, 'study_material_create', 'Half done', null, 'notes', '', null, ref());
await rpc(ann, 'study_material_add_chunks', proc.id, J([{ text: 'newton half done' }]));
check((await svc('study_svc_context', ann, null, proc.id, 'newton')).chunks.length === 0, 'a document still being added is not read yet');
await rpc(ann, 'study_material_delete', proc.id);

section('7. Reading a document');
const p1 = await rpc(ann, 'study_material_get', m1.id, -1, 2);
check(p1.chunks.length === 2 && p1.more === true && p1.material.title === 'Laws of motion', 'a document is read a page at a time');
const p2 = await rpc(ann, 'study_material_get', m1.id, p1.chunks[1].idx, 40);
check(p2.chunks.length === 4 && p2.more === false && p2.chunks[0].idx === 2, 'the next page carries on after the last one');
await expectFail(() => rpc(bob, 'study_material_get', m1.id), /no longer exists/, 'nobody else can read it');
check((await rpc(ann, 'study_material_get', m1.id, -1, 1000)).chunks.length === 6 && (await rpc(ann, 'study_material_get', m1.id, -1, 0)).chunks.length === 1, 'the page size is kept within sensible limits');

section('8. Renaming and removing');
const ren = await rpc(ann, 'study_material_update', m1.id, 'Newton\'s laws', bio);
check(ren.title === 'Newton\'s laws' && ren.subjectId === bio, 'a document can be renamed and moved to another subject');
await expectFail(() => rpc(ann, 'study_material_update', m1.id, '', null), /give the document a name/, 'it can not be left without a name');
await expectFail(() => rpc(ann, 'study_material_update', m1.id, 'x', bobSubj), /not yours/, 'nor moved to someone else\'s subject');
await expectFail(() => rpc(bob, 'study_material_update', m1.id, 'mine now', null), /no longer exists/, 'nobody else can change it');
const del = await rpc(ann, 'study_material_delete', m1.id);
check(del.deleted === true && (await q(`select count(*)::int as n from public.study_chunks where material_id = $1`, [m1.id]))[0].n === 0, 'removing a document removes all its text');
check((await rpc(ann, 'study_material_delete', m1.id)).deleted === false && (await rpc(bob, 'study_material_delete', bioM.id)).deleted === false, 'removing it again, or someone else\'s, does nothing');
check((await rpc(ann, 'study_material_search', 'newton', null, null)).hits.every((h) => h.title !== 'Laws of motion'), 'and it is no longer found');

section('9. Limits');
const big = await rpc(ann, 'study_material_create', 'Huge', null, 'text', '', null, ref());
const block = (n) => Array.from({ length: n }, () => ({ text: 'a'.repeat(4000) }));
for (let i = 0; i < 5; i++) await rpc(ann, 'study_material_add_chunks', big.id, J(block(40)));
check((await rpc(ann, 'study_material_get', big.id, -1, 1)).material.charCount === 800000, 'a document can hold 800,000 letters');
await expectFail(() => rpc(ann, 'study_material_add_chunks', big.id, J([{ text: 'one more' }])), /too long/, 'one more piece is refused, in plain words');
check((await rpc(ann, 'study_material_get', big.id, -1, 1)).material.charCount === 800000, 'and nothing was added');
await rpc(ann, 'study_material_delete', big.id);
for (let i = 0; i < 5; i++) { const f = await rpc(ann, 'study_material_create', 'Fat ' + i, null, 'text', '', null, ref()); await db.query(`update public.study_materials set char_count = 799000 where id = $1`, [f.id]); }
const last = await rpc(ann, 'study_material_create', 'The straw', null, 'text', '', null, ref());
await expectFail(() => rpc(ann, 'study_material_add_chunks', last.id, J([{ text: 'a'.repeat(4000) }, { text: 'a'.repeat(4000) }])), /library is full/, 'the whole library is limited to 4,000,000 letters');
await db.query(`delete from public.study_materials where user_id = $1 and (title like 'Fat %' or title = 'The straw')`, [ann]);
const carol = await mkUser('carol');
for (let i = 0; i < 60; i++) await q(`insert into public.study_materials (user_id, title) select $1, 'd' || $2 where exists (select 1 from public.study_profiles where user_id = $1)`, [carol, i]).catch(() => null);
await rpc(carol, 'study_save_profile', J({ displayName: 'Carol' }), 1);
for (let i = 0; i < 60; i++) await q(`insert into public.study_materials (user_id, title) values ($1, $2)`, [carol, 'd' + i]);
await expectFail(() => rpc(carol, 'study_material_create', 'one too many', null, 'notes', '', null, ref()), /library is full \(60 documents\)/, 'at most 60 documents');
const dup = ref();
check((await rpc(ann, 'study_material_create', 'First', null, 'notes', '', null, dup)).id === (await rpc(ann, 'study_material_create', 'First', null, 'notes', '', null, dup)).id, 'the 60-document check never blocks a repeat of a request that already worked');

section('9b. Past papers for the server');
const pa = await add(ann, 'Paper A', Array.from({ length: 20 }, (_, i) => ({ page: 1 + Math.floor(i / 5), text: 'Question ' + i + ' of paper A about forces.' })), { kind: 'pyq' });
const pb = await add(ann, 'Paper B', [{ page: 1, text: 'Question 1 of paper B about light.' }], { kind: 'pyq' });
const pOpen = await rpc(ann, 'study_material_create', 'Unfinished paper', null, 'pyq', '', null, ref());
await rpc(ann, 'study_material_add_chunks', pOpen.id, J([{ text: 'secret unfinished question' }]));
const bobPaper = await add(bob, 'Bob paper', [{ page: 1, text: 'Bob private question.' }], { kind: 'pyq' });
const got2 = await svc('study_svc_papers', ann, [pb.id, pa.id, pOpen.id, bobPaper.id], 14);
check(got2.length === 2 && got2[0].title === 'Paper B' && got2[1].title === 'Paper A' && got2[0].n === 1 && got2[1].n === 2, 'the server gets the student\'s own finished papers, numbered 1, 2 in the order asked');
check(!JSON.stringify(got2).includes('secret unfinished') && !JSON.stringify(got2).includes('Bob private'), 'an unfinished paper, or another student\'s, is never included');
check(got2[1].chunks.length === 14 && got2[1].more === true && got2[0].more === false && got2[1].chunks[0].text.startsWith('Question 0'), 'only the start of a long paper is given (and it says there is more), in reading order');
check((await svc('study_svc_papers', ann, [pa.id], 3))[0].chunks.length === 3, 'the number of pieces per paper can be limited');
check((await svc('study_svc_papers', ann, null)).length === 0 && (await svc('study_svc_papers', ann, [ref()])).length === 0, 'no ids, or ids that do not exist, give nothing');
const many = [];
for (let i = 0; i < 10; i++) many.push((await add(ann, 'Many ' + i, [{ page: 1, text: 'q' + i }], { kind: 'pyq' })).id);
check((await svc('study_svc_papers', ann, many)).length === 8, 'at most 8 papers at once');
let denied2 = 0;
try { await rpc(ann, 'study_svc_papers', ann, [pa.id], 14); } catch (e) { if (/permission denied/.test(e.message)) denied2++; }
check(denied2 === 1, 'a student can not call it (only the server can)');
await db.query(`delete from public.study_materials where user_id = $1 and title like 'Many %'`, [ann]);

section('10. Erasing');
const keep = await rpc(ann, 'study_task_save', J({ clientRef: ref(), title: 'Keep me' }));
await rpc(ann, 'study_delete_my_data', 'library');
check((await q(`select count(*)::int as n from public.study_materials where user_id = $1`, [ann]))[0].n === 0 && (await q(`select count(*)::int as n from public.study_chunks where user_id = $1`, [ann]))[0].n === 0, 'erasing the library removes every document and all its text');
check((await rpc(ann, 'study_tasks_list', 'all')).tasks.some((t) => t.id === keep.id) && (await rpc(bob, 'study_materials_list')).materials.length === 2, 'but not the student\'s tasks, and not anyone else\'s documents');
await add(ann, 'Again', PHOTO);
await rpc(ann, 'study_delete_my_data', 'all');
check((await q(`select count(*)::int as n from public.study_materials where user_id = $1`, [ann]))[0].n === 0 && (await q(`select count(*)::int as n from public.study_chunks where user_id = $1`, [ann]))[0].n === 0, 'erasing everything removes the library too');
await expectFail(() => rpc(bob, 'study_delete_my_data', 'bananas'), /choice is not known/, 'an unknown erase choice is refused');
const orphan = await q(`select count(*)::int as n from public.study_chunks c where not exists (select 1 from public.study_materials m where m.id = c.material_id)`);
check(orphan[0].n === 0, 'no text is ever left without a document');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
