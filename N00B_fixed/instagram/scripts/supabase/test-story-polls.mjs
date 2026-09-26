// Tests for migration 20260927000001: story polls keep real votes (they used to save nothing and show
// made-up 68%/32%), against a real Postgres (PGlite) holding the real backup.
import fs from 'node:fs';
import path from 'node:path';
import { loadBackup, buildImportPlan } from './transform.mjs';
import { runImport } from './run-import.mjs';
import { createTestDb, makePgAdapter, asUser, asAnon } from './pg-test-env.mjs';

const backupsRoot = 'backups';
const dir = process.argv.slice(2).find((a) => !a.startsWith('--')) || path.join(backupsRoot, fs.readdirSync(backupsRoot).filter((d) => fs.existsSync(path.join(backupsRoot, d, 'users.json'))).sort().pop());
const raw = loadBackup(dir);

let passed = 0;
let failed = 0;
const check = (cond, label, detail = '') => {
  if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); }
};
const expectFail = async (fn, pattern, label) => {
  try { await fn(); check(false, label, '(expected an error, but it succeeded)'); }
  catch (e) { check(pattern.test(e.message), label, `(got: ${e.message})`); }
};
const section = (t) => console.log(`\n${t}`);

const plan = buildImportPlan(raw, {});
const db = await createTestDb();
await runImport(plan, makePgAdapter(db), { log: () => {} });

const profByLegacy = Object.fromEntries((await db.query('select * from profiles')).rows.map((p) => [p.legacy_id, p]));
const idOf = (u) => profByLegacy[u.id].id;
const publicRaw = raw.users.filter((u) => u.accountType !== 'private' && !u.isAdmin);
const [a, b, c] = publicRaw.slice(0, 3).map(idOf);

const call = (uid, sql, params = []) => asUser(db, uid, async () => (await db.query(sql, params)).rows);
const rpc = async (uid, fn, ...args) => (await call(uid, `select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args))[0].r;
const rpcAnon = async (fn, ...args) => (await asAnon(db, async () => (await db.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).rows))[0].r;

const stickers = [
  { type: 'mention', x: 50, y: 20, data: { username: 'someone' } },
  { type: 'poll', x: 50, y: 50, data: { question: 'Kaisa laga app sab ko ??', options: ['Yes', 'No'] } },
  { type: 'poll', x: 50, y: 80, data: { question: 'Pick one', options: ['A', 'B', 'C'] } },
];
const story = (await rpc(a, 'create_story', 'stories/poll-test.jpg', 'image', JSON.stringify(stickers))).id;

// =====================================================================================
section('1. Fresh poll');
let res = await rpc(b, 'story_poll_results', story);
check(Object.keys(res).sort().join(',') === '1,2', 'results list only the two poll stickers (by position)', JSON.stringify(res));
check(JSON.stringify(res['1'].counts) === '[0,0]' && res['1'].total === 0 && res['1'].myVote === null, 'a fresh poll has zero votes and no vote of mine');

section('2. One vote is exactly 100% / 0%');
let v = await rpc(b, 'vote_story_poll', story, 1, 0);
check(v.success && JSON.stringify(v.poll.counts) === '[1,0]' && v.poll.total === 1 && v.poll.myVote === 0, 'voting "Yes" gives Yes 1, No 0 (not 68/32)', JSON.stringify(v));
check(JSON.stringify(v.poll.voters) === '[]', 'a viewer does not see who else voted');
res = await rpc(b, 'story_poll_results', story);
check(res['1'].myVote === 0 && res['1'].total === 1, 'the vote is saved: reopening the story shows it again');

section('3. Changing your vote, and several people');
v = await rpc(b, 'vote_story_poll', story, 1, 1);
check(JSON.stringify(v.poll.counts) === '[0,1]' && v.poll.total === 1, 'tapping the other option moves the vote (still one vote per person)');
await rpc(c, 'vote_story_poll', story, 1, 0);
await rpc(a, 'vote_story_poll', story, 1, 0);
res = await rpc(c, 'story_poll_results', story);
check(JSON.stringify(res['1'].counts) === '[2,1]' && res['1'].total === 3 && res['1'].myVote === 0, 'three people: Yes 2, No 1');
check(JSON.stringify(res['2'].counts) === '[0,0,0]', 'the other poll on the same story is counted separately');

section('4. The owner sees who voted');
res = await rpc(a, 'story_poll_results', story);
const voters = res['1'].voters;
check(Array.isArray(voters) && voters.length === 3 && voters.every((x) => typeof x.username === 'string' && typeof x.option === 'number'), 'owner gets the list of voters with their choice', JSON.stringify(voters));

section('5. Wrong input is refused');
await expectFail(() => rpc(b, 'vote_story_poll', story, 0, 0), /not found/i, 'a sticker that is not a poll');
await expectFail(() => rpc(b, 'vote_story_poll', story, 9, 0), /not found/i, 'a sticker position that does not exist');
await expectFail(() => rpc(b, 'vote_story_poll', story, 1, 2), /Choose one/i, 'an option past the end');
await expectFail(() => rpc(b, 'vote_story_poll', story, 1, -1), /Choose one/i, 'a negative option');
await expectFail(() => rpc(b, 'vote_story_poll', '00000000-0000-0000-0000-000000000000', 1, 0), /no longer available/i, 'a story that does not exist');
await expectFail(() => rpcAnon('vote_story_poll', story, 1, 0), /permission denied|log in/i, 'logged-out visitors cannot vote');
await expectFail(() => rpcAnon('story_poll_results', story), /permission denied|log in/i, 'logged-out visitors cannot read results');

section('6. Privacy');
await db.query('insert into blocks (blocker_id, blocked_id) values ($1, $2)', [a, c]);
await expectFail(() => rpc(c, 'story_poll_results', story), /cannot see/i, 'someone the owner blocked cannot read the results');
await expectFail(() => rpc(c, 'vote_story_poll', story, 1, 1), /cannot see/i, '...or vote');
await db.query('delete from blocks where blocker_id = $1 and blocked_id = $2', [a, c]);
await expectFail(() => call(b, 'select * from public.story_poll_votes'), /permission denied/i, 'nobody can read the votes table directly');
await expectFail(() => call(b, 'insert into public.story_poll_votes (story_id, sticker_index, user_id, option_index) values ($1, 1, $2, 0)', [story, b]), /permission denied/i, 'nobody can write the votes table directly');
await expectFail(() => call(b, 'select public.story_poll_json($1, 1, 2, true)', [story]), /permission denied/i, 'the inner results helper (which can list voters) is not callable directly');

section('7. Deleting the story removes its votes');
await db.query('delete from stories where id = $1', [story]);
const left = (await db.query('select count(*)::int as n from story_poll_votes where story_id = $1', [story])).rows[0].n;
check(left === 0, 'no orphaned votes');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
