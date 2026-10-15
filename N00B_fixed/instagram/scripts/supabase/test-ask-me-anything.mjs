// Tests for migration 20261016000002: Ask Me Anything, on a REAL Postgres (PGlite) with every migration applied.
// The point of this feature is that the person who is asked never learns who asked, so most of what is checked here is that no answer from the database can carry the sender.
// Usage: node scripts/supabase/test-ask-me-anything.mjs
import { createTestDb, asUser, asAnon } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const expectFail = async (fn, pattern, label) => {
  try { await fn(); check(false, label, '(expected an error, but it succeeded)'); }
  catch (e) { check(pattern.test(e.message), label, `(got: ${e.message})`); }
};
const errorOf = async (fn) => { try { await fn(); return ''; } catch (e) { return e.message; } };
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
// every answer that goes to someone who is NOT a sender is kept, to check at the end that none of them names a sender
const received = [];
const rpcAs = (uid, record) => async (fn, ...args) => {
  const r = await asUser(db, uid, async () => (await db.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).rows[0].r);
  if (record) received.push(JSON.stringify(r));
  return r;
};
const rpcAnon = async (fn, ...args) => {
  const r = await asAnon(db, async () => (await db.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).rows[0].r);
  received.push(JSON.stringify(r));
  return r;
};
const age = (senderId, interval) => db.query(`update public.ask_questions set created_at = created_at - $2::interval where sender_id = $1`, [senderId, interval]);

const admin = await mkUser('noob');
const helper = await mkUser('helper_a');
const ann = await mkUser('ann_ask', { display_name: 'Ann Asked' });          // gets questions
const raj = await mkUser('raj_ask');                                          // gets questions
const bob = await mkUser('bob_sender');                                       // sends
const cat = await mkUser('cat_sender');
const dan = await mkUser('dan_sender');
const eve = await mkUser('eve_sender');
const susp = await mkUser('susp_ask', { is_suspended: true });
await db.query(`insert into public.admin_grants (user_id, permissions) values ($1, array['moderate_content'])`, [helper]);
const senders = [bob, cat, dan, eve];
const senderNames = ['bob_sender', 'cat_sender', 'dan_sender', 'eve_sender'];
const annR = rpcAs(ann, true), rajR = rpcAs(raj, true), adminR = rpcAs(admin, true), helperR = rpcAs(helper, true);
const bobS = rpcAs(bob, false), catS = rpcAs(cat, false), danS = rpcAs(dan, false), eveS = rpcAs(eve, false), suspS = rpcAs(susp, false);

section('1. The tables and helpers can not be touched from the app');
for (const t of ['ask_settings', 'ask_questions', 'ask_blocks', 'ask_bans']) {
  await expectFail(() => asAnon(db, () => db.query(`select * from public.${t}`)), /permission denied/i, `a visitor can not read ${t} directly`);
  await expectFail(() => asUser(db, ann, () => db.query(`select * from public.${t}`)), /permission denied/i, `a member can not read ${t} directly`);
}
await expectFail(() => asUser(db, bob, () => db.query(`insert into public.ask_questions (recipient_id, sender_id, body) values ($1, $2, 'x')`, [ann, bob])), /permission denied/i, 'a member can not write a question around the function');
await expectFail(() => asUser(db, ann, () => db.query(`select public.ask_q_json(q) from public.ask_questions q`)), /permission denied/i, 'the question builder is not callable from the app');
await expectFail(() => asAnon(db, () => db.query(`select public.fun_clean_text('x')`)), /permission denied/i, 'the text cleaner is not callable from the app');
const idx = (await db.query(`select indexname from pg_indexes where tablename = 'ask_questions'`)).rows.map((r) => r.indexname);
check(['ask_questions_inbox_idx', 'ask_questions_public_idx', 'ask_questions_sender_time_idx', 'ask_questions_pair_idx', 'ask_questions_sender_key_idx', 'ask_questions_reported_idx'].every((i) => idx.includes(i)), 'the inbox, the public answers, the limits, the retry key and the reports each have an index');

section('2. The page of one person');
const pub = await rpcAnon('ask_profile_public', 'Ann_Ask');
check(pub && pub.userId === ann && pub.username === 'ann_ask' && pub.displayName === 'Ann Asked' && pub.enabled === true, 'a visitor can look up a person by username (any capitals) and sees whether they take questions', JSON.stringify(pub));
check(JSON.stringify(Object.keys(pub).sort()) === JSON.stringify(['avatar', 'displayName', 'enabled', 'isVerified', 'userId', 'username']), 'and only their public details');
check((await rpcAnon('ask_profile_public', 'nobody_here')) === null && (await rpcAnon('ask_profile_public', 'susp_ask')) === null && (await rpcAnon('ask_profile_public', '')) === null, 'an unknown, a suspended or an empty name gives nothing');

section('3. Sending a question');
await expectFail(() => asAnon(db, () => db.query(`select public.ask_send('ann_ask', 'Hello there?')`)), /permission denied|log in/i, 'a visitor who is not logged in can not send (the database refuses the call)');
await expectFail(() => suspS('ask_send', 'ann_ask', 'Hello there?'), /can not send/i, 'a suspended account can not send');
await expectFail(() => bobS('ask_send', 'bob_sender', 'Hello myself?'), /yourself/i, 'nobody can ask themselves');
await expectFail(() => bobS('ask_send', 'nobody_here', 'Hello?'), /not found/i, 'an unknown person is refused');
await expectFail(() => bobS('ask_send', 'ann_ask', ' x '), /first/i, 'a question that is too short is refused');
await expectFail(() => bobS('ask_send', 'ann_ask', 'q'.repeat(501)), /500 characters/i, 'a question over 500 characters is refused');
await expectFail(() => bobS('ask_send', 'ann_ask', 'See http://a.example and http://b.example'), /one link/i, 'more than one link is refused');
const sent = await bobS('ask_send', 'ann_ask', '  What is your ‮favourite​ song?  ', 'key-1');
check(JSON.stringify(sent) === JSON.stringify({ ok: true }), 'the sender gets only "ok" - not even the id of the question', JSON.stringify(sent));
const row = (await db.query(`select body, sender_id from public.ask_questions where recipient_id = $1`, [ann])).rows[0];
check(row.body === 'What is your favourite song?' && row.sender_id === bob, 'the text is tidied (hidden direction and zero-width characters removed); the private column does record who sent it, to stop abuse');
const dup = await bobS('ask_send', 'ann_ask', 'What is your favourite song?', 'key-1');
check(dup.duplicate === true && (await db.query(`select count(*)::int as n from public.ask_questions`)).rows[0].n === 1, 'a double tap with the same key sends once');
const alerts = (await db.query(`select actor_id, title, message, data from public.notifications where target_user_id = $1 and type = 'ask_question'`, [ann])).rows;
check(alerts.length === 1 && alerts[0].actor_id === null, 'the owner gets one alert, with no sender attached');
check(!JSON.stringify(alerts).match(/bob|sender|users\.nooob/i), 'and the alert names nobody');

section('4. What the owner sees');
const inbox = await annR('ask_inbox');
check(inbox.questions.length === 1 && inbox.questions[0].body === 'What is your favourite song?' && inbox.counts.new === 1 && inbox.counts.answered === 0, 'the owner sees the question, and how many are waiting');
check(JSON.stringify(Object.keys(inbox.questions[0]).sort()) === JSON.stringify(['answer', 'answerPublic', 'answeredAt', 'body', 'createdAt', 'id', 'reported']), 'each question has only: id, text, time, answer fields, and whether it was reported');
check(!JSON.stringify(inbox).includes(bob) && !/bob_sender|sender/i.test(JSON.stringify(inbox)), 'nothing about the sender is in it');
await expectFail(() => asAnon(db, () => db.query(`select public.ask_inbox()`)), /permission denied/i, 'a visitor can not open an inbox');
check((await rajR('ask_inbox')).questions.length === 0, 'someone else\'s inbox is empty: nobody sees another person\'s questions');

section('5. Limits');
await expectFail(() => bobS('ask_send', 'raj_ask', 'And yours?'), /wait a moment/i, 'a second question within 15 seconds is refused');
await age(bob, '1 minute');
await bobS('ask_send', 'raj_ask', 'And yours?');
check(true, 'after a pause it goes through');
await age(bob, '1 minute');
await expectFail(() => bobS('ask_send', 'ann_ask', 'What is your favourite song?'), /already asked/i, 'the same question to the same person within a day is refused');
for (let i = 0; i < 4; i++) { await bobS('ask_send', 'ann_ask', `A different question ${i}?`); await age(bob, '1 minute'); }
await expectFail(() => bobS('ask_send', 'ann_ask', 'One more please?'), /asked this person a lot/i, 'a sixth question to the same person in a day is refused');
const spammer = senders[1];
let ok = 0, hourly = 0;
for (let i = 0; i < 12; i++) {
  try { await catS('ask_send', i % 2 ? 'ann_ask' : 'raj_ask', `Question number ${i}?`); ok++; } catch (e) { if (/lot of questions just now/i.test(e.message)) hourly++; else throw e; }
  await age(spammer, '20 seconds');
}
check(ok === 10 && hourly === 2, 'after 10 in an hour the next are refused', `${ok} ok, ${hourly} refused`);
// a person who is being flooded is protected
const target = await mkUser('flooded_ask');
const crowd = await mkUser('crowd_ask');
for (let i = 0; i < 200; i++) await db.query(`insert into public.ask_questions (recipient_id, sender_id, body) values ($1, null, $2)`, [target, 'filler ' + i]);
await expectFail(() => danS('ask_send', 'flooded_ask', 'Anything?'), /a lot of questions right now/i, 'a person who got 200 questions in an hour is protected for a while');

section('6. Blocks, hiding and switching it off (all give the same answer)');
const blockedMsgs = [];
await db.query(`insert into public.blocks (blocker_id, blocked_id) values ($1, $2)`, [raj, dan]);                  // raj blocked dan on the platform
blockedMsgs.push(await errorOf(() => danS('ask_send', 'raj_ask', 'Hi Raj?')));
await db.query(`insert into public.profile_hides (owner_id, hidden_from_id) values ($1, $2)`, [raj, eve]);          // raj hid his profile from eve
blockedMsgs.push(await errorOf(() => eveS('ask_send', 'raj_ask', 'Hi Raj?')));
check(blockedMsgs.every((m) => /not available/i.test(m)) && new Set(blockedMsgs).size === 1, 'a platform block and a hidden profile both get the same plain "not available"', JSON.stringify(blockedMsgs));
await annR('ask_set_enabled', false);
check((await rpcAnon('ask_profile_public', 'ann_ask')).enabled === false, 'switching questions off shows on the person\'s page');
await expectFail(() => danS('ask_send', 'ann_ask', 'Are you there?'), /not taking questions/i, 'and nobody can send');
check((await annR('ask_my_settings')).enabled === false, 'the owner sees the switch off');
await annR('ask_set_enabled', true);
await danS('ask_send', 'ann_ask', 'Are you there now?');
check(true, 'switching it back on lets questions in again');

section('7. Answering');
const q1 = (await annR('ask_inbox', 'new')).questions.find((q) => q.body === 'What is your favourite song?');
await expectFail(() => rajR('ask_answer', q1.id, 'Not mine to answer'), /no longer there/i, 'someone else can not answer it');
await expectFail(() => annR('ask_answer', q1.id, '   '), /first/i, 'an empty answer is refused');
await expectFail(() => annR('ask_answer', q1.id, 'a'.repeat(1001)), /1000 characters/i, 'an answer over 1000 characters is refused');
await expectFail(() => annR('ask_set_public', q1.id, true), /Answer the question first/i, 'a question that has no answer can not be published');
const a1 = await annR('ask_answer', q1.id, '  Anything by Queen ', false);
check(a1.answer === 'Anything by Queen' && a1.answerPublic === false && a1.answeredAt, 'the owner answers privately');
check((await rpcAnon('ask_public_answers', 'ann_ask')).answers.length === 0, 'a private answer is not on the profile');
const counts = (await annR('ask_inbox', 'all')).counts;
check(counts.answered === 1 && counts.new >= 1, 'the counts follow: one answered, the rest waiting');
check((await annR('ask_inbox', 'answered')).questions.length === 1 && (await annR('ask_inbox', 'new')).questions.every((q) => q.answer === null), 'the answered and waiting lists are separate');
const a2 = await annR('ask_set_public', q1.id, true);
check(a2.answerPublic === true, 'the owner publishes the answer on the profile');
const pubAns = await rpcAnon('ask_public_answers', 'ann_ask');
check(pubAns.answers.length === 1 && pubAns.answers[0].question === 'What is your favourite song?' && pubAns.answers[0].answer === 'Anything by Queen', 'a visitor sees the question and the answer');
check(JSON.stringify(Object.keys(pubAns.answers[0]).sort()) === JSON.stringify(['answer', 'answeredAt', 'id', 'question']), 'a published answer has only: id, question, answer, time');
check(!JSON.stringify(pubAns).includes(bob) && !/bob_sender/.test(JSON.stringify(pubAns)), 'and nothing about who asked');
const a3 = await annR('ask_answer', q1.id, 'Actually, Bohemian Rhapsody', true);
check(a3.answer === 'Actually, Bohemian Rhapsody' && (await rpcAnon('ask_public_answers', 'ann_ask')).answers[0].answer === 'Actually, Bohemian Rhapsody', 'answering again edits the answer, here and on the profile');
await annR('ask_set_public', q1.id, false);
check((await rpcAnon('ask_public_answers', 'ann_ask')).answers.length === 0, 'the owner can take it off the profile again');
await annR('ask_set_public', q1.id, true);

section('8. Private accounts');
await db.query(`update public.profiles set account_type = 'private' where id = $1`, [ann]);
check((await rpcAnon('ask_public_answers', 'ann_ask')).answers.length === 0, 'a private account\'s published answers are hidden from a visitor');
check((await bobS('ask_public_answers', 'ann_ask')).answers.length === 0, '... and from someone who does not follow');
await db.query(`insert into public.follows (follower_id, followee_id) values ($1, $2)`, [cat, ann]);
check((await catS('ask_public_answers', 'ann_ask')).answers.length === 1, '... but a follower sees them');
await db.query(`update public.profiles set account_type = 'public' where id = $1`, [ann]);

section('9. Deleting, reporting and blocking the sender');
const mine = (await annR('ask_inbox', 'new')).questions;
const toDelete = mine.find((q) => /different question 0/.test(q.body));
await expectFail(() => rajR('ask_delete', toDelete.id), /no longer there/i, 'someone else can not delete it');
await annR('ask_delete', toDelete.id);
check(!(await annR('ask_inbox', 'all')).questions.some((q) => q.id === toDelete.id), 'a deleted question leaves the inbox');
await expectFail(() => annR('ask_delete', toDelete.id), /no longer there/i, 'deleting twice is refused');
const toReport = mine.find((q) => /different question 1/.test(q.body));
await expectFail(() => rajR('ask_report', toReport.id, 'x'), /no longer there/i, 'someone else can not report it');
await annR('ask_report', toReport.id, 'Rude and threatening');
check((await annR('ask_inbox', 'new')).questions.find((q) => q.id === toReport.id).reported === true, 'a reported question is marked for its owner');
const toBlock = mine.find((q) => /different question 2/.test(q.body));
const blk = await annR('ask_block_sender', toBlock.id);
check(JSON.stringify(blk) === JSON.stringify({ ok: true }), 'blocking the sender answers only "ok"');
check(!(await annR('ask_inbox', 'all')).questions.some((q) => q.id === toBlock.id), 'and the question is gone');
await age(bob, '2 days');
await expectFail(() => bobS('ask_send', 'ann_ask', 'Can I ask again?'), /not available/i, 'that person can no longer ask this owner - with the same plain "not available"');
await bobS('ask_send', 'raj_ask', 'But I can still ask someone else?');
check(true, 'but can still ask other people');

section('10. The people who handle reports');
await expectFail(() => annR('ask_admin_reports'), /permission/i, 'an ordinary member can not see the reports');
await expectFail(() => rpcAnon('ask_admin_reports'), /permission/i, 'a visitor can not');
const reports = await adminR('ask_admin_reports');
check(reports.reports.length === 1 && reports.reports[0].body === toReport.body && reports.reports[0].reason === 'Rude and threatening' && reports.reports[0].toUsername === 'ann_ask', 'an administrator sees the text, the reason and who it was addressed to');
check(JSON.stringify(Object.keys(reports.reports[0]).sort()) === JSON.stringify(['body', 'createdAt', 'id', 'reason', 'reportedAt', 'toUsername']), 'and nothing about who sent it');
check((await helperR('ask_admin_reports')).reports.length === 1, 'a helper with the "moderate content" permission sees them too');
await expectFail(() => annR('ask_admin_remove', toReport.id, true), /permission/i, 'an ordinary member can not remove a question as an administrator');
const removed = await adminR('ask_admin_remove', toReport.id, true);
check(JSON.stringify(removed) === JSON.stringify({ ok: true }), 'removing it (and stopping its sender) answers only "ok"');
check((await adminR('ask_admin_reports')).reports.length === 0 && !(await annR('ask_inbox', 'all')).questions.some((q) => q.id === toReport.id), 'the report and the question are gone');
await age(bob, '2 days');
await expectFail(() => bobS('ask_send', 'raj_ask', 'Another one?'), /no longer send/i, 'the sender can no longer ask anyone');
const other = (await rajR('ask_inbox', 'new')).questions[0];
await expectFail(() => adminR('ask_admin_dismiss', other.id), /no longer there/i, 'dismissing something that was not reported is refused');
await rajR('ask_report', other.id, 'meh');
await adminR('ask_admin_dismiss', other.id);
check((await adminR('ask_admin_reports')).reports.length === 0, 'an administrator can also decide a report is fine: it is cleared');
const log = (await db.query(`select action, target_id, details from public.admin_audit_log where action like 'ask_%' order by created_at`)).rows;
check(log.length === 2 && log[0].action === 'ask_question_removed' && log[1].action === 'ask_report_dismissed', 'each decision is written to the audit log', log.map((l) => l.action).join(','));
check(!JSON.stringify(log).includes(bob) && !/bob_sender/.test(JSON.stringify(log)) && log[0].target_id === ann, 'and the log names the person who was asked, never the sender');

section('11. An account that is deleted');
const leaver = await mkUser('leaver_ask');
await age(leaver, '1 day');
await rpcAs(leaver, false)('ask_send', 'raj_ask', 'A parting question?');
const before = (await db.query(`select count(*)::int as n from public.ask_questions where recipient_id = $1 and sender_id = $2`, [raj, leaver])).rows[0].n;
await db.query(`delete from public.profiles where id = $1`, [leaver]);
await db.query(`delete from auth.users where id = $1`, [leaver]);
const after = (await db.query(`select count(*)::int as n, count(sender_id)::int as with_sender from public.ask_questions where body = 'A parting question?'`)).rows[0];
check(before === 1 && after.n === 1 && after.with_sender === 0, 'the question stays when its sender leaves, with no sender at all');
const ownerLeaves = await mkUser('owner_leaves');
await rpcAs(eve, false)('ask_send', 'owner_leaves', 'Hello owner?').catch(() => null);
await db.query(`delete from public.profiles where id = $1`, [ownerLeaves]);
await db.query(`delete from auth.users where id = $1`, [ownerLeaves]);
check((await db.query(`select count(*)::int as n from public.ask_questions where recipient_id = $1`, [ownerLeaves])).rows[0].n === 0, 'when the owner leaves, the questions to them go with them');

section('12. Nothing that anyone but a sender received names a sender');
const wire = received.join('\n');
const leaks = [...senders, ...senderNames].filter((s) => wire.includes(s));
check(received.length > 30 && leaks.length === 0, `across ${received.length} answers received by owners, visitors and administrators, no sender id or username appears`, leaks.join(','));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
