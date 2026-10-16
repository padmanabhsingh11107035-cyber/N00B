// Tests migration 20261018000002: a story with the "Send me anonymous messages" button (or an anonymous Question sticker) is NOT saved to highlights; every other story still is,
// and anonymous-message pages that were already auto-saved are taken out (the rest of the highlight stays). On a REAL Postgres (PGlite) with every migration applied.
//
// Usage: node scripts/supabase/test-anon-story-no-highlight.mjs
import { createTestDb, asUser, asAnon } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
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
const highlightItems = async (uid) => (await q(`select coalesce(sum(jsonb_array_length(items)), 0)::int as n from public.highlights where user_id = $1`, [uid]))[0].n;
const post = (uid, url, stickers) => rpc(uid, 'create_story', url, 'image', JSON.stringify(stickers));

const owner = await mkUser('owner');

section('1. Which stories count');
const test = async (stickers) => (await q(`select public.story_has_anonymous_button($1::jsonb) as r`, [JSON.stringify(stickers)]))[0].r;
check(await test([{ type: 'anon_messages', x: 50, y: 70 }]), 'the button counts');
check(await test([{ type: 'text', data: { text: 'hi' } }, { type: 'anon_messages' }]), 'also among other stickers');
check(await test([{ type: 'question', data: { prompt: 'Tell me a secret', anonymous: true } }]), 'an anonymous Question sticker counts');
check(!(await test([{ type: 'question', data: { prompt: 'Ask me anything' } }])), 'a normal Question does not');
check(!(await test([{ type: 'poll', data: { question: 'a or b' } }, { type: 'text', data: { text: 'hi' } }])), 'nor a poll or text');
check(!(await test([])) && !(await test(null)) && !(await test({ not: 'a list' })), 'nothing / not a list does not');
let denied = false;
try { await asAnon(db, async () => (await db.query(`select public.story_has_anonymous_button('[]'::jsonb)`)).rows); } catch (e) { denied = /permission denied/i.test(e.message); }
check(denied, 'and a visitor can not call it');

section('2. Posting');
await post(owner, 'stories/own-1.jpg', [{ type: 'text', x: 50, y: 50, data: { text: 'my own story' } }]);
check(await highlightItems(owner) === 1, 'a normal story is saved to the day’s highlight, as before');
const anonStory = await post(owner, 'stories/anon-1.jpg', [{ type: 'anon_messages', x: 50, y: 70, width: 74, data: { label: 'Send me anonymous messages' } }]);
check(await highlightItems(owner) === 1, 'a story with the "Send me anonymous messages" button is NOT saved');
check(!!anonStory.id && (await q(`select 1 from public.stories where id = $1`, [anonStory.id])).length === 1, 'but the story itself is posted and shows for 24 hours');
await post(owner, 'stories/anon-2.jpg', [{ type: 'question', x: 50, y: 40, data: { prompt: 'Tell me a secret', anonymous: true } }]);
check(await highlightItems(owner) === 1, 'neither is a story with an anonymous question');
await post(owner, 'stories/own-2.jpg', [{ type: 'question', x: 50, y: 40, data: { prompt: 'Ask me anything' } }, { type: 'text', data: { text: 'x' } }]);
check(await highlightItems(owner) === 2, 'a normal question story is still saved');
check((await q(`select count(*)::int as n from public.highlights where user_id = $1`, [owner]))[0].n === 1, 'both of the saved ones sit in the same day highlight');

section('3. Repairing what was already saved');
const other = await mkUser('other');
// Put the OLD behaviour in place: an anonymous page and a normal page already sitting in a highlight, and a highlight that holds only an anonymous page.
const now = new Date().toISOString();
const item = (id, stickers) => ({ id, mediaUrl: `stories/${id}.jpg`, mediaType: 'image', stickers, createdAt: now });
await q(`insert into public.highlights (user_id, title, cover_url, day_key, items) values ($1, 'mixed', 'c', '2026-01-01', $2::jsonb), ($1, 'only anon', 'c', '2026-01-02', $3::jsonb), ($1, 'empty before', 'c', '2026-01-03', '[]'::jsonb)`, [
  other,
  JSON.stringify([item('a1', [{ type: 'anon_messages' }]), item('n1', [{ type: 'text', data: { text: 'keep' } }]), item('a2', [{ type: 'question', data: { prompt: 'x', anonymous: true } }])]),
  JSON.stringify([item('a3', [{ type: 'anon_messages' }])])
]);
// Run the repair step of the migration again (it is written to be safe to run twice).
const sql = (await import('node:fs')).readFileSync('supabase/migrations/20261018000002_anon_story_no_highlight.sql', 'utf8');
const repair = sql.slice(sql.indexOf('-- 3. One-time repair'));
await db.exec(repair);
const rows = await q(`select title, jsonb_array_length(items)::int as n, items from public.highlights where user_id = $1 order by day_key`, [other]);
check(rows.length === 2 && rows[0].title === 'mixed' && rows[0].n === 1 && rows[0].items[0].id === 'n1', 'the anonymous pages leave a highlight, the normal page stays');
check(!rows.some((r) => r.title === 'only anon'), 'a highlight that held only an anonymous page is removed');
check(rows.some((r) => r.title === 'empty before'), 'an already-empty highlight is left alone (the repair removes only what it emptied)');
await db.exec(repair);
check((await q(`select count(*)::int as n from public.highlights where user_id = $1`, [other]))[0].n === 2, 'running the repair twice changes nothing more');
check((await q(`select count(*)::int as n from public.highlights where user_id = $1`, [owner]))[0].n === 1, 'other people’s highlights are untouched');

section('4. Deleting still works');
const del = await post(owner, 'stories/own-3.jpg', [{ type: 'text', data: { text: 'to delete' } }]);
const before = await highlightItems(owner);
await rpc(owner, 'delete_story', del.id);
check(await highlightItems(owner) === before - 1, 'deleting a normal story still removes it from its highlight');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
