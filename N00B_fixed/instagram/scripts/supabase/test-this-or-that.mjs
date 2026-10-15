// Tests for migration 20261016000001: This or That, on a REAL Postgres (PGlite) with every migration applied.
// Usage: node scripts/supabase/test-this-or-that.mjs
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
const rpc = async (uid, fn, ...args) => asUser(db, uid, async () => (await db.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).rows[0].r);
const rpcAnon = async (fn, ...args) => asAnon(db, async () => (await db.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).rows[0].r);

const admin = await mkUser('noob');
const helper = await mkUser('helper_h');
const ann = await mkUser('ann_t');
const bob = await mkUser('bob_t');
const cat = await mkUser('cat_t');
const dan = await mkUser('dan_t');
const eve = await mkUser('eve_t');
const suspended = await mkUser('susp_t', { is_suspended: true });
await db.query(`insert into public.admin_grants (user_id, permissions) values ($1, array['moderate_content'])`, [helper]);
const today = (await db.query(`select public.fun_today() as d`)).rows[0].d;

section('1. The tables and helpers can not be touched from the app');
for (const t of ['tot_questions', 'tot_votes']) {
  await expectFail(() => asAnon(db, () => db.query(`select * from public.${t}`)), /permission denied/i, `a visitor can not read ${t} directly`);
  await expectFail(() => asUser(db, ann, () => db.query(`select * from public.${t}`)), /permission denied/i, `a member can not read ${t} directly`);
}
await expectFail(() => asUser(db, ann, () => db.query(`insert into public.tot_votes (question_id, user_id, choice) select id, $1, 'a' from public.tot_questions limit 1`, [ann])), /permission denied/i, 'a member can not write a vote around the function');
await expectFail(() => asUser(db, ann, () => db.query(`update public.tot_questions set option_a = 'x'`)), /permission denied/i, 'a member can not edit a question');
await expectFail(() => asAnon(db, () => db.query(`select public.fun_clean_text('x')`)), /permission denied/i, 'the text cleaner is not callable from the app');
await expectFail(() => asUser(db, ann, () => db.query(`select public.tot_json(q, true) from public.tot_questions q limit 1`)), /permission denied/i, 'the question builder is not callable from the app');
const idx = (await db.query(`select indexname from pg_indexes where tablename in ('tot_questions', 'tot_votes')`)).rows.map((r) => r.indexname);
check(idx.includes('tot_questions_day_idx') && idx.includes('tot_votes_question_idx') && idx.includes('tot_votes_user_idx'), 'the day list, the counting and the per-person limit each have an index');

section('2. The first questions');
const seeded = (await db.query(`select count(*)::int as n from public.tot_questions`)).rows[0].n;
check(seeded === 24, 'there are 24 questions to start with', String(seeded));
const t0 = await rpcAnon('tot_today');
check(t0.optionA === 'Love' && t0.optionB === 'Money' && t0.emojiA === '❤️' && t0.emojiB === '💰', 'today\'s question is Love or Money, with its emoji', JSON.stringify(t0));
check(t0.isToday === true && t0.myVote === null && t0.results === null, 'a visitor sees the question but no numbers (and has not voted)');
const memberView = await rpc(ann, 'tot_today');
check(memberView.results === null && memberView.myVote === null, 'a member who has not voted sees no numbers either');
check(JSON.stringify(Object.keys(t0).sort()) === JSON.stringify(['day', 'emojiA', 'emojiB', 'id', 'isToday', 'myVote', 'optionA', 'optionB', 'results', 'seq']), 'the answer holds only the question, the day and the numbers (when allowed)');
const future = (await db.query(`select count(*)::int as n from public.tot_questions where publish_on > public.fun_today()`)).rows[0].n;
check(future === 19, '19 are saved for the coming days', String(future));

section('3. Voting');
await expectFail(() => rpcAnon('tot_vote', t0.id, 'a'), /permission denied|log in/i, 'a visitor who is not logged in can not vote (the database refuses the call itself)');
await expectFail(() => rpc(suspended, 'tot_vote', t0.id, 'a'), /can not vote/i, 'a suspended account can not vote');
await expectFail(() => rpc(ann, 'tot_vote', t0.id, 'c'), /Pick one/i, 'a choice other than a or b is refused');
await expectFail(() => rpc(ann, 'tot_vote', t0.id, null), /Pick one/i, 'no choice is refused');
await expectFail(() => rpc(ann, 'tot_vote', '00000000-0000-4000-8000-000000000000', 'a'), /not available/i, 'a question that does not exist is refused');
const v1 = await rpc(ann, 'tot_vote', t0.id, 'a');
check(v1.myVote === 'a' && v1.results.a === 1 && v1.results.b === 0 && v1.results.total === 1, 'the first vote is counted and the numbers come back with it', JSON.stringify(v1));
await expectFail(() => rpc(ann, 'tot_vote', t0.id, 'a'), /already voted/i, 'the same person can not vote again (same choice)');
await expectFail(() => rpc(ann, 'tot_vote', t0.id, 'b'), /already voted/i, 'nor change sides by voting again');
const rows1 = (await db.query(`select count(*)::int as n, min(choice) as c from public.tot_votes where user_id = $1 and question_id = $2`, [ann, t0.id])).rows[0];
check(rows1.n === 1 && rows1.c === 'a', 'the database holds exactly one vote for her, still "a"');
// two quick taps from the same person at the same moment
const [r1, r2] = await Promise.allSettled([rpc(bob, 'tot_vote', t0.id, 'b'), rpc(bob, 'tot_vote', t0.id, 'b')]);
check([r1, r2].filter((r) => r.status === 'fulfilled').length === 1 && [r1, r2].filter((r) => r.status === 'rejected').length === 1, 'two taps at once give exactly one vote and one refusal');
await rpc(cat, 'tot_vote', t0.id, 'a');
await rpc(dan, 'tot_vote', t0.id, 'b');
const lastVote = await rpc(eve, 'tot_vote', t0.id, 'a');
check(lastVote.results.a === 3 && lastVote.results.b === 2 && lastVote.results.total === 5, 'with five voters the numbers are 3 and 2, total 5', JSON.stringify(lastVote.results));
const dbTotal = (await db.query(`select count(*)::int as n from public.tot_votes where question_id = $1`, [t0.id])).rows[0].n;
check(dbTotal === 5, 'the database agrees: 5 votes, one per person');

section('4. Who sees the numbers');
const anonAfter = await rpcAnon('tot_today');
check(anonAfter.results === null && anonAfter.myVote === null, 'a visitor still sees no numbers, however many have voted');
const annAfter = await rpc(ann, 'tot_today');
check(annAfter.myVote === 'a' && annAfter.results.total === 5, 'someone who voted sees their own vote and the numbers');
const fay = await mkUser('fay_t');
check((await rpc(fay, 'tot_today')).results === null, 'a member who has not voted still sees nothing');
check(JSON.stringify(await rpc(fay, 'tot_today')).includes(ann) === false, 'nobody\'s vote is tied to a name in any answer');

section('5. Earlier questions');
const prev = await rpcAnon('tot_previous', 2);
check(prev.questions.length === 2 && prev.hasMore === true, 'the earlier questions come two at a time, with "more" when there are more', JSON.stringify(prev.hasMore));
check(prev.questions[0].optionA === 'Night' && prev.questions[1].optionA === 'Android', 'newest first: Night or Day, then Android or iPhone');
check(prev.questions.every((q) => q.isToday === false && q.results === null && q.myVote === null), 'for a visitor each carries no numbers');
const last = prev.questions[1];
const prev2 = await rpcAnon('tot_previous', 2, last.day, last.seq);
check(prev2.questions.length === 2 && prev2.hasMore === false && prev2.questions[0].optionA === 'Gaming' && prev2.questions[1].optionA === 'Introvert', 'the next page continues from where the last one ended and then stops');
check(![...prev.questions, ...prev2.questions].some((q) => q.id === t0.id), 'today\'s question is not repeated in the list');
check(![...prev.questions, ...prev2.questions].some((q) => q.day > today), 'questions for later days are not in it');
const pv = await rpc(ann, 'tot_vote', prev.questions[0].id, 'b');
check(pv.results.total === 1 && pv.myVote === 'b', 'an earlier question can still be voted on, once');
check((await rpc(ann, 'tot_previous', 5)).questions.find((q) => q.id === prev.questions[0].id).myVote === 'b', 'and the list then shows her vote and the numbers');

section('6. Questions of later days, and removed ones');
const futureQ = (await db.query(`select id from public.tot_questions where publish_on = public.fun_today() + 1`)).rows[0].id;
await expectFail(() => rpc(ann, 'tot_vote', futureQ, 'a'), /not available/i, 'a question for tomorrow can not be voted on today');
check((await rpcAnon('tot_today')).id === t0.id, 'and it does not become today\'s question');
const sneaky = await db.query(`insert into public.tot_questions (option_a, option_b, publish_on) values ('Old', 'New', public.fun_today() - 30) returning id`);
check((await rpc(ann, 'tot_previous', 30)).questions.some((q) => q.id === sneaky.rows[0].id), 'an old question appears in the list');
await db.query(`update public.tot_questions set removed_at = now() where id = $1`, [sneaky.rows[0].id]);
await expectFail(() => rpc(ann, 'tot_vote', sneaky.rows[0].id, 'a'), /not available/i, 'a removed question can not be voted on');
check(!(await rpc(ann, 'tot_previous', 30)).questions.some((q) => q.id === sneaky.rows[0].id), 'and has left the list');

section('7. Voting very fast');
const spammer = await mkUser('spam_t');
const ids = [];
for (let i = 0; i < 62; i++) ids.push((await db.query(`insert into public.tot_questions (option_a, option_b, publish_on) values ($1, 'B', public.fun_today() - 40) returning id`, ['Q' + i])).rows[0].id);
let ok = 0, refused = 0;
for (const id of ids) { try { await rpc(spammer, 'tot_vote', id, 'a'); ok++; } catch (e) { if (/very fast/i.test(e.message)) refused++; else throw e; } }
check(ok === 60 && refused === 2, 'after 60 votes in an hour the next ones are refused', `${ok} ok, ${refused} refused`);

section('8. Adding and removing questions');
await expectFail(() => rpc(ann, 'tot_admin_create', 'Left', 'Right'), /permission/i, 'an ordinary member can not add a question');
await expectFail(() => rpcAnon('tot_admin_create', 'Left', 'Right'), /permission/i, 'a visitor can not add a question');
await expectFail(() => rpc(ann, 'tot_admin_list'), /permission/i, 'an ordinary member can not list the hidden ones');
check((await rpc(ann, 'fun_can_manage')) === false && (await rpc(admin, 'fun_can_manage')) === true && (await rpc(helper, 'fun_can_manage')) === true, 'the app can ask whether someone may manage: no for a member, yes for the admin and for a helper with the permission');
await expectFail(() => rpc(admin, 'tot_admin_create', '   ', 'Right'), /need some text/i, 'an empty choice is refused');
await expectFail(() => rpc(admin, 'tot_admin_create', 'Same', 'same'), /different/i, 'two identical choices are refused');
await expectFail(() => rpc(admin, 'tot_admin_create', 'x'.repeat(41), 'Right'), /40 characters/i, 'a choice over 40 characters is refused');
await expectFail(() => rpc(admin, 'tot_admin_create', 'Left', 'Right', 'x'.repeat(9), ''), /too long/i, 'an over-long emoji is refused');
await expectFail(() => rpc(admin, 'tot_admin_create', 'Left', 'Right', '', '', new Date(Date.now() + 400 * 86400e3).toISOString().slice(0, 10)), /too far ahead/i, 'a day more than a year ahead is refused');
const made = await rpc(helper, 'tot_admin_create', '  Sun ​ ', 'Moon', '☀️', '🌙');
check(made.optionA === 'Sun' && made.emojiA === '☀️' && made.isToday === true && made.results.total === 0, 'a helper with the permission adds one for today (text tidied, no hidden characters)', JSON.stringify(made));
check((await rpcAnon('tot_today')).id === made.id, 'the newest question of the day becomes today\'s question');
const scheduledDay = new Date(Date.now() + 3 * 86400e3).toISOString().slice(0, 10);
const sched = await rpc(admin, 'tot_admin_create', 'Hot', 'Cold', '', '', scheduledDay);
check(sched.isToday === false, 'one scheduled for a later day is not today\'s');
check((await rpc(admin, 'tot_admin_list', 50)).questions.some((q) => q.id === sched.id), 'a manager sees it in the full list');
check(!(await rpcAnon('tot_previous', 50)).questions.some((q) => q.id === sched.id), 'a visitor does not');
const adminSees = (await rpc(admin, 'tot_admin_list', 50)).questions.find((q) => q.id === t0.id);
check(adminSees.results.total === 5, 'a manager always sees the numbers');
const adminPage = await rpc(admin, 'tot_admin_list', 5);
check(adminPage.questions.length === 5 && adminPage.hasMore === true, 'the manager\'s list is paged');
await expectFail(() => rpc(ann, 'tot_admin_remove', made.id), /permission/i, 'an ordinary member can not remove a question');
await rpc(helper, 'tot_admin_remove', made.id);
check((await rpcAnon('tot_today')).id === t0.id, 'removing today\'s question brings the previous one back as today\'s');
await expectFail(() => rpc(helper, 'tot_admin_remove', made.id), /no longer there/i, 'removing it twice is refused');
const log = (await db.query(`select action from public.admin_audit_log where action like 'this_or_that_%' order by created_at, action`)).rows.map((r) => r.action);
check(log.filter((a) => a === 'this_or_that_created').length === 2 && log.filter((a) => a === 'this_or_that_removed').length === 1, 'each addition and removal is written to the audit log', log.join(','));

section('9. An account that is deleted');
const gone = await mkUser('gone_t');
await rpc(gone, 'tot_vote', t0.id, 'b');
const before = (await rpcAnon('tot_today')).id && (await rpc(ann, 'tot_today')).results.total;
await db.query(`delete from public.profiles where id = $1`, [gone]);
await db.query(`delete from auth.users where id = $1`, [gone]);
const after = (await rpc(ann, 'tot_today')).results.total;
check(before === 6 && after === 5, 'a deleted account\'s vote goes with it, and the total follows', `${before} -> ${after}`);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
