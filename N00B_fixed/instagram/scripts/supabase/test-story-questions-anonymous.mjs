// Tests migration 20261018000001: the Question sticker on a story can be ANONYMOUS ("Send me anonymous messages"): the owner reads the answers with no name and no picture (left out
// by the database, not hidden by the app), while a normal question keeps showing who answered. Answers obey "Who can reply to your story" and "Limit interactions", and can not flood.
// On a REAL Postgres (PGlite) with every migration applied.
//
// Usage: node scripts/supabase/test-story-questions-anonymous.mjs
import { createTestDb, asUser, asAnon } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const expectFail = async (fn, pattern, label) => {
  try { await fn(); check(false, label, '(expected an error, but it succeeded)'); }
  catch (e) { check(pattern.test(e.message), label, `(got: ${e.message})`); }
};
const section = (t) => console.log(`\n${t}`);

const db = await createTestDb();
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const mkUser = async (name) => {
  const id = (await q(`select gen_random_uuid() as id`))[0].id;
  await q(`insert into auth.users (id, email, encrypted_password) values ($1, $2, 'x')`, [id, `${name}@users.nooob.xyz`]);
  if (!(await q(`select 1 from public.profiles where id = $1`, [id])).length) await q(`insert into public.profiles (id, username, display_name) values ($1, $2, $2)`, [id, name]);
  return id;
};
const call = (uid, sql, params = []) => asUser(db, uid, async () => (await db.query(sql, params)).rows);
const rpc = async (uid, fn, ...args) => (await call(uid, `select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args))[0].r;

const owner = await mkUser('owner');
const fan = await mkUser('fan');
const pal = await mkUser('pal');
await q(`insert into public.follows (follower_id, followee_id) values ($1, $2), ($2, $1) on conflict do nothing`, [fan, owner]);

const stickers = [
  { type: 'question', x: 50, y: 30, width: 62, data: { prompt: 'Send me anonymous messages', anonymous: true } },
  { type: 'question', x: 50, y: 60, width: 62, data: { prompt: 'Ask me anything' } },
  { type: 'text', x: 50, y: 80, data: { text: 'hi' } }
];
const story = (await rpc(owner, 'create_story', 'stories/q-test.jpg', 'image', JSON.stringify(stickers))).id;

section('1. An anonymous question hides who answered; a normal one does not');
check((await rpc(fan, 'answer_story_question', story, 0, 'you are great')).success, 'a viewer answers the anonymous question');
check((await rpc(fan, 'answer_story_question', story, 1, 'my favourite colour is blue')).success, 'and the normal one');
let res = await rpc(owner, 'story_question_results', story);
const anon = res['0'];
const open = res['1'];
check(anon.anonymous === true && anon.answers.length === 1 && anon.answers[0].answer === 'you are great', 'the owner reads the anonymous answer');
check(anon.answers[0].username === 'Anonymous' && anon.answers[0].avatar === '', 'with no name and no picture');
check(!JSON.stringify(anon).includes('fan'), 'nothing in what the database sends back says who it was (not the name, not an id)', JSON.stringify(anon));
check(open.anonymous === false && open.answers[0].username === 'fan', 'a normal question still shows @username');
check(Object.keys(res).sort().join(',') === '0,1', 'answers are listed only for the two question stickers, by position');

section('2. Only the owner reads them');
await expectFail(() => rpc(fan, 'story_question_results', story), /Only the story owner/, 'a viewer can not read the answers, not even their own');
let visitorDenied = false;
try { await asAnon(db, async () => (await db.query(`select public.story_question_results($1)`, [story])).rows); } catch (e) { visitorDenied = /permission denied/i.test(e.message); }
check(visitorDenied, 'a visitor can not call it');
let visitorStory = false;
try { await asAnon(db, async () => (await db.query(`select public.story_by_id($1)`, [story])).rows); } catch (e) { visitorStory = /permission denied/i.test(e.message); }
check(visitorStory, 'and a visitor can no longer ask for a story by its address');
check((await rpc(fan, 'story_by_id', story)) !== null, 'a logged-in viewer still can');

section('3. Not a question, an empty answer, too long');
await expectFail(() => rpc(fan, 'answer_story_question', story, 2, 'hello'), /not found/, 'a text sticker is not a question');
await expectFail(() => rpc(fan, 'answer_story_question', story, 0, '   '), /Write an answer/, 'an empty answer is refused');
await expectFail(() => rpc(fan, 'answer_story_question', story, 0, 'x'.repeat(501)), /under 500/, 'so is one over 500 characters');

section('4. No flooding');
await expectFail(() => rpc(fan, 'answer_story_question', story, 0, 'you are great'), /already sent that/, 'the same answer twice is refused');
for (const t of ['two', 'three', 'four', 'five']) await rpc(fan, 'answer_story_question', story, 0, t);
await expectFail(() => rpc(fan, 'answer_story_question', story, 0, 'six'), /already sent 5 answers/, 'a sixth answer from one person to one question is refused');
check((await rpc(owner, 'story_question_results', story))['0'].answers.length === 5, 'five answers are kept');
check((await rpc(pal, 'answer_story_question', story, 0, 'hello from pal')).success, 'someone else is not affected');

section('5. The owner’s choice of who may reply to a story');
await rpc(owner, 'set_my_settings', JSON.stringify({ 'msg.storyReplies': 'following' }));
await expectFail(() => rpc(pal, 'answer_story_question', story, 1, 'hi'), /Only people this account follows/, '"People you follow": someone the owner does not follow is refused');
await q(`insert into public.follows (follower_id, followee_id) values ($1, $2) on conflict do nothing`, [owner, pal]);
check((await rpc(pal, 'answer_story_question', story, 1, 'hi again')).success, 'and allowed once the owner follows them');
await rpc(owner, 'set_my_settings', JSON.stringify({ 'msg.storyReplies': 'off' }));
await expectFail(() => rpc(fan, 'answer_story_question', story, 1, 'anything'), /turned off replies/, '"Off": nobody can answer');
await rpc(owner, 'set_my_settings', JSON.stringify({ 'msg.storyReplies': 'everyone' }));
check((await rpc(fan, 'answer_story_question', story, 1, 'anything')).success, 'back to "Everyone": answers work again');
await rpc(owner, 'set_my_settings', JSON.stringify({ 'limit.until': new Date(Date.now() + 3600e3).toISOString(), 'limit.audience': 'non_followers' }));
await q(`delete from public.follows where follower_id = $1 and followee_id = $2`, [pal, owner]);
await expectFail(() => rpc(pal, 'answer_story_question', story, 1, 'limited'), /limited who can answer/, '"Limit interactions": a non-follower is refused for a while');

section('6. Old questions keep working');
const oldStory = (await rpc(owner, 'create_story', 'stories/q-old.jpg', 'image', JSON.stringify([{ type: 'question', x: 50, y: 50, data: { prompt: 'old style' } }]))).id;
await rpc(fan, 'answer_story_question', oldStory, 0, 'old answer');
const old = await rpc(owner, 'story_question_results', oldStory);
check(old['0'].anonymous === false && old['0'].answers[0].username === 'fan', 'a question made before this change shows names as before');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
