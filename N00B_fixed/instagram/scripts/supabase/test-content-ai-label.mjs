// "AI info" label on reels and stories (migration 20261118000002).
//   1. the SQL on a REAL Postgres (PGlite): only the owner labels, 'detected' wins, strangers / blocked people / visitors get nothing, the label goes when the content goes;
//   2. the screens: reel and story show the label, the creators have the switch, publishing switches it on.
// Usage: node --liftoff-only scripts/supabase/test-content-ai-label.mjs
import fs from 'node:fs';
let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');

section('1. The SQL on a real Postgres');
const { createTestDb, asUser, asAnon } = await import('./pg-test-env.mjs');
const db = await createTestDb();
const mkUser = async (name) => {
  const id = (await db.query('select gen_random_uuid() as id')).rows[0].id;
  await db.query(`insert into auth.users (id, email, encrypted_password) values ($1, $2, extensions.crypt('secret pass', extensions.gen_salt('bf')))`, [id, `${name}@users.nooob.xyz`]);
  if (!(await db.query('select 1 from public.profiles where id = $1', [id])).rows.length) await db.query('insert into public.profiles (id, username, display_name) values ($1, $2, $2)', [id, name]);
  return id;
};
const ann = await mkUser('ann'), bob = await mkUser('bob'), cat = await mkUser('cat');
await db.query('insert into public.blocks (blocker_id, blocked_id) values ($1, $2)', [ann, cat]);
const reel = (await db.query(`insert into public.reels (user_id, video_url) values ($1, 'x.mp4') returning id`, [ann])).rows[0].id;
const reel2 = (await db.query(`insert into public.reels (user_id, video_url) values ($1, 'y.mp4') returning id`, [ann])).rows[0].id;
const story = (await db.query(`insert into public.stories (user_id, media_url) values ($1, 'z.jpg') returning id`, [ann])).rows[0].id;
const call = async (uid, sql, args = []) => asUser(db, uid, async () => (await db.query(sql, args)).rows[0]?.r);
const fail = async (uid, sql, args = []) => { try { await call(uid, sql, args); return null; } catch (e) { return e.message; } };
check(/only label your own/i.test((await fail(bob, 'select public.content_ai_label_set($1, $2, $3) as r', ['reel', reel, 'creator'])) || ''), 'somebody else can not label my reel');
check((await call(ann, 'select public.content_ai_label_set($1, $2, $3) as r', ['reel', reel, 'creator'])).source === 'creator', 'the owner labels their reel (creator)');
check((await call(ann, 'select public.content_ai_label_set($1, $2, $3) as r', ['reel', reel, 'detected'])).source === 'detected' && (await call(ann, 'select public.content_ai_label_set($1, $2, $3) as r', ['reel', reel, 'creator'])).source === 'detected', 'a detected marker wins and a later "creator" can not downgrade it');
check((await call(ann, 'select public.content_ai_label_set($1, $2, $3) as r', ['story', story, 'creator'])).source === 'creator', 'a story can be labelled too');
check(/nothing to label/i.test((await fail(ann, 'select public.content_ai_label_set($1, $2, $3) as r', ['post', reel, 'creator'])) || ''), 'only reels and stories go through here');
const seen = await call(bob, 'select public.content_ai_labels($1, $2) as r', ['reel', [reel, reel2]]);
check(seen.length === 1 && seen[0].id === reel && seen[0].source === 'detected', 'a stranger who may see the reel learns which of the asked reels carry the label (and why)');
check((await call(bob, 'select public.content_ai_labels($1, $2) as r', ['story', [story]])).length === 1, 'and the story');
check((await call(cat, 'select public.content_ai_labels($1, $2) as r', ['reel', [reel]])).length === 0, 'a person the owner blocked gets nothing');
const anonTry = await asAnon(db, async () => { try { await db.query('select public.content_ai_labels($1, $2)', ['reel', [reel]]); return 'ran'; } catch (e) { return e.message; } });
check(/permission denied/i.test(anonTry), 'a logged-out visitor can not ask');
const direct = await asUser(db, bob, async () => { try { await db.query('select * from public.content_ai_source'); return 'read'; } catch (e) { return e.message; } });
check(/permission denied/i.test(direct), 'the table can not be read directly');
await db.query('delete from public.reels where id = $1', [reel]);
check((await db.query(`select count(*)::int as n from public.content_ai_source where kind = 'reel'`)).rows[0].n === 0, 'when the reel is deleted its label goes with it');

section('2. The screens');
const api = read('src/services/supabaseApi.ts'), badge = read('src/components/Common/ContentAiBadge.tsx'), rv = read('src/components/Reels/ReelsView.tsx'), sv = read('src/components/Stories/StoryViewerModal.tsx');
const cs = read('src/components/Stories/CreateStoryModal.tsx'), pc = read('src/components/PostCreation/PostCreationModal.tsx'), css = read('src/components/Reels/reels.css');
check(/rpc\('content_ai_label_set'/.test(api) && /'content_ai_labels'/.test(api) && /await setContentAiLabel\('reel', reel\.id/.test(api) && /await setContentAiLabel\('story', story\.id/.test(api), 'publishing a reel / story switches its label on right after (a failure never loses it)');
check(/window\.setTimeout\(flush, 40\)/.test(badge) && /slice\(i, i \+ 100\)|ids\.slice\(0, 100\)/.test(badge + api) && /data-testid=\{`\$\{kind\}-ai-info`\}/.test(badge), 'the badge asks for many ids in one request and remembers the answers');
check(/<ContentAiBadge kind="reel" id=\{reel\.id\}/.test(rv) && /<ContentAiBadge kind="story" id=\{story\.id\}/.test(sv), 'Reels and the story viewer show it');
check(/detectAiMedia\(file\)/.test(cs) && /data-testid="story-ai-label"/.test(cs) && /hasAiLabel: aiLabel/.test(cs), 'the story creator finds markers in the original picture and has the switch');
check(/data-testid="reel-ai-switch"/.test(pc) && /hasAiLabel,\s*aiSource: aiDetected \? 'detected' : 'creator'\s*\}/.test(pc), 'the reel creator has the switch and sends the label');
check(!/rv-commenting|shrunkVideoHeight|commentingRef/.test(rv), 'Reels: the video stays as it is when the comments open (it does not shrink)');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
