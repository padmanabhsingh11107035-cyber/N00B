// Tests for migration 20261016000004: Public Polls, on a REAL Postgres (PGlite) with every migration applied.
// Usage: node scripts/supabase/test-public-polls.mjs
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
  await db.query(`update public.profiles set created_at = now() - interval '2 days' where id = $1`, [id]);   // old enough to create polls
  for (const [col, val] of Object.entries(patch)) await db.query(`update public.profiles set ${col} = $2 where id = $1`, [id, val]);
  return id;
};
const wire = [];
const rpc = async (uid, fn, ...args) => {
  const r = await asUser(db, uid, async () => (await db.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).rows[0].r);
  wire.push(JSON.stringify(r));
  return r;
};
const rpcAnon = async (fn, ...args) => {
  const r = await asAnon(db, async () => (await db.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).rows[0].r);
  wire.push(JSON.stringify(r));
  return r;
};
// let the 20-second guard pass between a person's polls
const settle = (uid) => db.query(`update public.polls set created_at = created_at - interval '1 minute' where creator_id = $1`, [uid]);
const endNow = (id) => db.query(`update public.polls set ends_at = now() - interval '1 minute' where id = $1`, [id]);
const mkPoll = async (uid, ...a) => { await settle(uid); return rpc(uid, 'poll_create', ...a); };
const optId = (poll, label) => poll.options.find((o) => o.label === label).id;

const admin = await mkUser('noob');
const helper = await mkUser('helper_p');
const ann = await mkUser('ann_poll');
const bob = await mkUser('bob_poll');
const cat = await mkUser('cat_poll');
const dan = await mkUser('dan_poll');
const eve = await mkUser('eve_poll');
const fay = await mkUser('fay_poll');
const newbie = await mkUser('newbie_poll');
await db.query(`update public.profiles set created_at = now() where id = $1`, [newbie]);
const susp = await mkUser('susp_poll', { is_suspended: true });
await db.query(`insert into public.admin_grants (user_id, permissions) values ($1, array['moderate_content'])`, [helper]);
const voters = [bob, cat, dan, eve, fay];

section('1. The tables and helpers can not be touched from the app');
for (const t of ['polls', 'poll_options', 'poll_votes', 'poll_reports']) {
  await expectFail(() => asAnon(db, () => db.query(`select * from public.${t}`)), /permission denied/i, `a visitor can not read ${t} directly`);
  await expectFail(() => asUser(db, ann, () => db.query(`select * from public.${t}`)), /permission denied/i, `a member can not read ${t} directly`);
}
await expectFail(() => asUser(db, ann, () => db.query(`select public.poll_json(p) from public.polls p`)), /permission denied/i, 'the poll builder is not callable from the app');
await expectFail(() => asUser(db, ann, () => db.query(`select public.poll_can_see(p) from public.polls p`)), /permission denied/i, 'nor the visibility check');
const idx = (await db.query(`select indexname from pg_indexes where tablename in ('polls', 'poll_votes', 'poll_reports')`)).rows.map((r) => r.indexname);
check(['polls_seq_idx', 'polls_ends_idx', 'polls_creator_idx', 'poll_votes_option_idx', 'poll_votes_user_idx', 'poll_reports_reporter_idx'].every((i) => idx.includes(i)), 'the lists, the counting and the limits each have an index');

section('2. Creating a poll');
await expectFail(() => asAnon(db, () => db.query(`select public.poll_create('Pizza or pasta?', array['Pizza', 'Pasta'], 60)`)), /permission denied|log in/i, 'a visitor can not create a poll');
await expectFail(() => rpc(susp, 'poll_create', 'Pizza or pasta?', ['Pizza', 'Pasta'], 60), /can not create/i, 'a suspended account can not');
await expectFail(() => rpc(newbie, 'poll_create', 'Pizza or pasta?', ['Pizza', 'Pasta'], 60), /first hour/i, 'an account less than an hour old can not');
await expectFail(() => rpc(ann, 'poll_create', 'Hm?', ['A', 'B'], 60), /at least 5/i, 'a question under 5 characters is refused');
await expectFail(() => rpc(ann, 'poll_create', 'q'.repeat(201), ['A', 'B'], 60), /200 characters/i, 'a question over 200 characters is refused');
await expectFail(() => rpc(ann, 'poll_create', 'Pizza or pasta?', ['Only one'], 60), /at least 2/i, 'a single option is refused');
await expectFail(() => rpc(ann, 'poll_create', 'Pizza or pasta?', null, 60), /at least 2/i, 'no options is refused');
await expectFail(() => rpc(ann, 'poll_create', 'Pizza or pasta?', ['1', '2', '3', '4', '5', '6', '7', '8', '9'], 60), /at most 8/i, 'nine options are refused');
await expectFail(() => rpc(ann, 'poll_create', 'Pizza or pasta?', ['Pizza', '  '], 60), /needs some text/i, 'a blank option is refused');
await expectFail(() => rpc(ann, 'poll_create', 'Pizza or pasta?', ['Pizza', 'PIZZA'], 60), /different/i, 'two options that are the same are refused');
await expectFail(() => rpc(ann, 'poll_create', 'Pizza or pasta?', ['Pizza', 'x'.repeat(81)], 60), /80 characters/i, 'an option over 80 characters is refused');
await expectFail(() => rpc(ann, 'poll_create', 'Pizza or pasta?', ['Pizza', 'Pasta'], 2), /5 minutes to 30 days/i, 'a poll shorter than 5 minutes is refused');
await expectFail(() => rpc(ann, 'poll_create', 'Pizza or pasta?', ['Pizza', 'Pasta'], 50000), /5 minutes to 30 days/i, 'a poll longer than 30 days is refused');
await expectFail(() => rpc(ann, 'poll_create', 'Pizza or pasta?', ['Pizza', 'Pasta'], null), /5 minutes to 30 days/i, 'no duration is refused');
await expectFail(() => rpc(ann, 'poll_create', 'Pizza or pasta?', ['Pizza', 'Pasta'], 60, 'secret'), /when the results/i, 'a results rule that does not exist is refused');
await expectFail(() => rpc(ann, 'poll_create', 'See http://a.example and http://b.example?', ['Pizza', 'Pasta'], 60), /one link/i, 'more than one link is refused');

const poll = await rpc(ann, 'poll_create', '  Pizza ‮or​ pasta?\n ', ['Pizza', '  Pasta  ', 'Neither'], 60);
check(poll.question === 'Pizza or pasta?' && poll.options.map((o) => o.label).join('|') === 'Pizza|Pasta|Neither', 'the poll is made: text tidied, options in order');
check(poll.status === 'active' && poll.ended === false && poll.isMine === true && poll.myVote === null, 'it is active, mine, and I have not voted');
check(poll.resultsVisibility === 'after_vote' && poll.resultsShown === false && poll.totalVotes === null && poll.options.every((o) => o.votes === null), 'by default the results are for people who voted, so not even the creator sees numbers yet');
check(Math.round((new Date(poll.endsAt) - new Date(poll.createdAt)) / 60000) === 60, 'it ends after the chosen time');
check(poll.creator.username === 'ann_poll' && JSON.stringify(Object.keys(poll.creator).sort()) === JSON.stringify(['avatar', 'displayName', 'isVerified', 'userId', 'username']), 'the creator is shown with public details only (polls are public, voters are not)');
await expectFail(() => rpc(ann, 'poll_create', 'Another poll, quickly?', ['A', 'B'], 60), /wait a moment/i, 'a second poll within 20 seconds is refused');
await settle(ann);
await expectFail(() => rpc(ann, 'poll_create', 'pizza OR pasta?', ['A', 'B'], 60), /already asked/i, 'the same question again within a day is refused');
await rpc(ann, 'poll_create', 'Second poll of the day?', ['A', 'B'], 60); await settle(ann);
await rpc(ann, 'poll_create', 'Third poll of the day?', ['A', 'B'], 60); await settle(ann);
await expectFail(() => rpc(ann, 'poll_create', 'Fourth poll of the day?', ['A', 'B'], 60), /up to 3 polls/i, 'a fourth poll in a day is refused');
const mgr = await mkPoll(helper, 'An official poll, yes or no?', ['Yes', 'No'], 120, 'always');
check(mgr.status === 'active', 'a manager can create one without the age and daily limits');

section('3. Voting');
await expectFail(() => asAnon(db, () => db.query(`select public.poll_vote($1, $2)`, [poll.id, poll.options[0].id])), /permission denied|log in/i, 'a visitor can not vote');
await expectFail(() => rpc(susp, 'poll_vote', poll.id, poll.options[0].id), /can not vote/i, 'a suspended account can not vote');
const other = await mkPoll(helper, 'A different poll altogether?', ['Red', 'Blue'], 60, 'always');
await expectFail(() => rpc(bob, 'poll_vote', poll.id, other.options[0].id), /options of this poll/i, 'an option of another poll is refused');
await expectFail(() => rpc(bob, 'poll_vote', '00000000-0000-4000-8000-000000000000', poll.options[0].id), /not available/i, 'a poll that does not exist is refused');
await expectFail(() => db.query(`insert into public.poll_votes (poll_id, user_id, option_id) values ($1, $2, $3)`, [poll.id, bob, other.options[0].id]), /foreign key|violates/i, 'even around the function, the database will not count a vote for an option of another poll');
const v1 = await rpc(bob, 'poll_vote', poll.id, optId(poll, 'Pizza'));
check(v1.myVote === optId(poll, 'Pizza') && v1.resultsShown === true && v1.totalVotes === 1 && v1.options.find((o) => o.label === 'Pizza').votes === 1, 'the first vote is counted, and the numbers come back with it', JSON.stringify(v1.options));
await expectFail(() => rpc(bob, 'poll_vote', poll.id, optId(poll, 'Pizza')), /already voted/i, 'the same person can not vote again (same option)');
await expectFail(() => rpc(bob, 'poll_vote', poll.id, optId(poll, 'Pasta')), /already voted/i, 'nor change sides by voting again');
check((await db.query(`select count(*)::int as n, min(option_id::text) as o from public.poll_votes where poll_id = $1 and user_id = $2`, [poll.id, bob])).rows[0].n === 1, 'the database holds exactly one vote for him');
const [r1, r2] = await Promise.allSettled([rpc(cat, 'poll_vote', poll.id, optId(poll, 'Pasta')), rpc(cat, 'poll_vote', poll.id, optId(poll, 'Pasta'))]);
check([r1, r2].filter((r) => r.status === 'fulfilled').length === 1, 'two taps at once give exactly one vote');
await rpc(dan, 'poll_vote', poll.id, optId(poll, 'Pasta'));
await rpc(eve, 'poll_vote', poll.id, optId(poll, 'Pizza'));
const last = await rpc(fay, 'poll_vote', poll.id, optId(poll, 'Neither'));
const counts = Object.fromEntries(last.options.map((o) => [o.label, o.votes]));
check(counts.Pizza === 2 && counts.Pasta === 2 && counts.Neither === 1 && last.totalVotes === 5, 'five voters: 2, 2 and 1, total 5', JSON.stringify(counts));
check((await db.query(`select count(*)::int as n from public.poll_votes where poll_id = $1`, [poll.id])).rows[0].n === 5, 'the database agrees: 5 votes, one per person');

section('4. When the results are shown');
check((await rpcAnon('poll_get', poll.id)).resultsShown === false && (await rpcAnon('poll_get', poll.id)).options.every((o) => o.votes === null), 'a visitor sees no numbers for a poll whose rule is "after you vote"');
check((await rpc(ann, 'poll_get', poll.id)).resultsShown === false, 'and neither does its creator, until they vote');
check((await rpc(bob, 'poll_get', poll.id)).totalVotes === 5, 'someone who voted sees them');
const seen = await rpc(helper, 'poll_get', poll.id);
check(seen.resultsShown === true && seen.totalVotes === 5, 'a manager can always look');
const open = await rpcAnon('poll_get', mgr.id);
check(open.resultsShown === true && open.totalVotes === 0 && open.resultsVisibility === 'always', 'a poll set to "always" shows its numbers to everybody, even before any vote');
await settle(helper);
const sealed = await mkPoll(helper, 'Results at the end, please?', ['Left', 'Right'], 60, 'after_end');
await rpc(bob, 'poll_vote', sealed.id, optId(sealed, 'Left'));
const sealedAfterVote = await rpc(bob, 'poll_get', sealed.id);
check(sealedAfterVote.resultsShown === false && sealedAfterVote.myVote === optId(sealed, 'Left') && sealedAfterVote.options.every((o) => o.votes === null), '"when it ends": even someone who voted sees no numbers while it runs');
check((await rpc(helper, 'poll_get', sealed.id)).resultsShown === true, '(only a manager can look, to moderate)');
await endNow(sealed.id);
const sealedEnded = await rpcAnon('poll_get', sealed.id);
check(sealedEnded.ended === true && sealedEnded.resultsShown === true && sealedEnded.totalVotes === 1 && sealedEnded.status === 'completed', 'when it has ended everybody sees the results, and it is "completed"');
check(JSON.stringify(Object.keys(sealedEnded.options[0]).sort()) === JSON.stringify(['id', 'label', 'position', 'votes']), 'each option has only its text, its position and its count');

section('5. Ended polls');
await expectFail(() => rpc(ann, 'poll_vote', sealed.id, optId(sealed, 'Right')), /has ended/i, 'a vote after the end time is refused');
await settle(ann);
const empty = await mkPoll(helper, 'A poll nobody votes in?', ['Yes', 'No'], 60);
await endNow(empty.id);
check((await rpcAnon('poll_get', empty.id)).status === 'expired', 'one that ended with no votes is "expired"');

section('6. The lists');
const act = await rpcAnon('poll_list', 'active', 3);
check(act.polls.length === 3 && act.hasMore === true && act.polls.every((p) => p.status === 'active'), 'active polls come three at a time, with "more"', act.polls.map((p) => p.status).join());
check(act.polls[0].seq > act.polls[1].seq && act.polls[1].seq > act.polls[2].seq, 'newest first');
const act2 = await rpcAnon('poll_list', 'active', 3, null, act.polls[2].seq);
check(!act2.polls.some((p) => act.polls.some((q) => q.id === p.id)), 'the next page has no repeats');
check(act.polls.every((p) => p.resultsShown === false || p.resultsVisibility === 'always'), 'a visitor\'s list carries no numbers unless the poll\'s rule shows them');
const ended = await rpcAnon('poll_list', 'ended', 10);
check(ended.polls.length === 2 && ended.polls.every((p) => p.ended), 'ended polls are listed apart: completed and expired');
check(ended.polls.map((p) => p.status).sort().join() === 'completed,expired', 'both kinds appear', ended.polls.map((p) => p.status).join());
const pg = await rpcAnon('poll_list', 'ended', 1);
const pg2 = await rpcAnon('poll_list', 'ended', 1, pg.polls[0].endsAt, pg.polls[0].seq);
check(pg.polls.length === 1 && pg.hasMore === true && pg2.polls.length === 1 && pg2.polls[0].id !== pg.polls[0].id && pg2.hasMore === false, 'ended polls page too (by end time)');
await expectFail(() => rpcAnon('poll_list', 'mine'), /permission denied|log in/i, 'a visitor has no "my polls"');
const mineList = await rpc(ann, 'poll_list', 'mine', 10);
check(mineList.polls.length === 3 && mineList.polls.every((p) => p.isMine), 'my polls are the three I made');
check((await rpc(bob, 'poll_list', 'mine')).polls.length === 0, 'someone else\'s are not in mine');

section('7. Removing');
await expectFail(() => rpc(bob, 'poll_remove', poll.id), /only remove your own/i, 'another member can not remove a poll');
await expectFail(() => rpcAnon('poll_remove', poll.id), /permission denied|log in/i, 'a visitor can not');
const toRemove = await rpc(ann, 'poll_list', 'mine', 10);
const mine3 = toRemove.polls.find((p) => p.question === 'Third poll of the day?');
await rpc(ann, 'poll_remove', mine3.id);
check((await rpcAnon('poll_get', mine3.id)) === null && !(await rpc(ann, 'poll_list', 'mine', 10)).polls.some((p) => p.id === mine3.id), 'the creator removes their own poll: it is gone for everybody');
await expectFail(() => rpc(bob, 'poll_vote', mine3.id, mine3.options[0].id), /not available/i, 'and can not be voted on');
await expectFail(() => rpc(ann, 'poll_remove', mine3.id), /no longer there/i, 'removing it twice is refused');
const mine2 = toRemove.polls.find((p) => p.question === 'Second poll of the day?');
await rpc(admin, 'poll_remove', mine2.id);
check((await rpcAnon('poll_get', mine2.id)) === null && (await rpc(helper, 'poll_get', mine2.id)) !== null, 'an administrator can remove anybody\'s poll (managers can still see it)');
const log = (await db.query(`select action, target_id from public.admin_audit_log where action = 'poll_removed'`)).rows;
check(log.length === 1 && log[0].target_id === ann, 'and it is written to the audit log');

section('8. Reports');
const target = await mkPoll(helper, 'A poll somebody dislikes?', ['Yes', 'No'], 600, 'always'); await settle(helper);
await expectFail(() => rpc(helper, 'poll_report', target.id, 'x'), /own poll/i, 'a creator can not report their own poll');
await expectFail(() => rpcAnon('poll_report', target.id, 'x'), /permission denied|log in/i, 'a visitor can not report');
const rep1 = await rpc(bob, 'poll_report', target.id, 'Offensive');
await rpc(bob, 'poll_report', target.id, 'Offensive again');
check(rep1.hidden === false && (await db.query(`select count(*)::int as n from public.poll_reports where poll_id = $1`, [target.id])).rows[0].n === 1, 'one person reporting twice counts once');
await rpc(cat, 'poll_report', target.id, 'Spam');
check((await rpcAnon('poll_get', target.id)) !== null, 'two reports do not hide it');
const rep3 = await rpc(dan, 'poll_report', target.id, 'Hate');
check(rep3.hidden === true, 'the third report hides it');
check((await rpcAnon('poll_get', target.id)) === null && !(await rpcAnon('poll_list', 'active', 30)).polls.some((p) => p.id === target.id), 'a hidden poll is gone from the lists and from a visitor');
await expectFail(() => rpc(eve, 'poll_vote', target.id, target.options[0].id), /not available/i, 'and can not be voted on');
check((await rpc(helper, 'poll_get', target.id)).status === 'hidden', 'its creator and the managers still see it, marked hidden');
const reports = await rpc(admin, 'poll_admin_reports');
check(reports.reports.length === 1 && reports.reports[0].reportCount === 3 && reports.reports[0].poll.id === target.id && reports.reports[0].reasons.length === 3, 'an administrator sees the reported poll, how many reports, and why');
await expectFail(() => rpc(bob, 'poll_admin_reports'), /permission/i, 'an ordinary member can not');
await expectFail(() => rpc(bob, 'poll_admin_dismiss', target.id), /permission/i, 'nor clear reports');
await rpc(helper, 'poll_admin_dismiss', target.id);
check((await rpcAnon('poll_get', target.id)) !== null && (await rpc(admin, 'poll_admin_reports')).reports.length === 0, 'clearing the reports shows the poll again');
check((await db.query(`select count(*)::int as n from public.admin_audit_log where action = 'poll_report_dismissed'`)).rows[0].n === 1, 'the decision is in the audit log');

section('9. Nobody learns who voted for what');
const text = wire.join('\n');
check(voters.every((v) => !text.includes(v)) && !/bob_poll|cat_poll|dan_poll|eve_poll|fay_poll/.test(text.replace(/"username":"[a-z_]+"/g, '')), 'across every answer, no voter\'s id appears (and no voter\'s name, except as a poll\'s creator)');

section('10. Accounts that are deleted');
const leaver = await mkUser('leaver_poll');
const leaversPoll = await rpc(leaver, 'poll_create', 'A poll from someone who leaves?', ['Yes', 'No'], 60, 'always');
await rpc(bob, 'poll_vote', leaversPoll.id, optId(leaversPoll, 'Yes'));
await db.query(`delete from public.profiles where id = $1`, [leaver]);
await db.query(`delete from auth.users where id = $1`, [leaver]);
check((await db.query(`select count(*)::int as n from public.polls where id = $1`, [leaversPoll.id])).rows[0].n === 0 && (await db.query(`select count(*)::int as n from public.poll_votes where poll_id = $1`, [leaversPoll.id])).rows[0].n === 0, 'when a creator leaves, their poll and its votes go with them');
const goneVoter = await mkUser('gone_voter');
await rpc(goneVoter, 'poll_vote', mgr.id, mgr.options[0].id);
const before = (await rpcAnon('poll_get', mgr.id)).totalVotes;
await db.query(`delete from public.profiles where id = $1`, [goneVoter]);
await db.query(`delete from auth.users where id = $1`, [goneVoter]);
check((await rpcAnon('poll_get', mgr.id)).totalVotes === before - 1, 'when a voter leaves, their vote goes and the total follows');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
