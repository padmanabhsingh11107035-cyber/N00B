// Tappable #hashtags + editing a caption after publishing (migration 20261112000001).
//   1. the hashtag rule, drawn for real (src/utils/hashtags.ts) and the linkify output (a #tag is a button, a # inside a web address is not);
//   2. the screens: Linkified, PostCard (Edit caption, owner only), ReelsView, HashtagPage, App.tsx (layer + ?tag= link), API;
//   3. the SQL on a REAL Postgres (PGlite) with every migration applied: who sees what, case-insensitive, and only the owner can edit.
// Usage: node --liftoff-only scripts/supabase/test-hashtags-edit.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildSync } from 'esbuild';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');

section('1. The hashtag rule (pure function)');
const out = path.resolve('node_modules/.cache-hashtags.mjs');
buildSync({ entryPoints: [path.resolve('src/utils/hashtags.ts')], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' });
const H = await import(pathToFileURL(out).href);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
check(same(H.extractHashtags('Loving #Robots and #cad_design today'), ['#robots', '#cad_design']), 'tags are found, lower-cased, with the # in front');
check(same(H.extractHashtags('#a1 #A1 #a1'), ['#a1']), 'repeats (also in another case) are one tag');
check(same(H.extractHashtags('see site.com/page#section and https://x.com/a#frag'), []), 'a # inside a web address is not a tag');
check(same(H.extractHashtags('mail me a#b and a&#b'), []), 'a # right after a letter, & or # is not a tag');
check(same(H.extractHashtags('#123 #_ #9to5'), ['#9to5']), 'a tag needs at least one letter (#123 and #_ are not tags)');
check(same(H.extractHashtags('(#hello) "#world," #end.'), ['#hello', '#world', '#end']), 'brackets, quotes and punctuation around a tag do not matter');
check(same(H.extractHashtags('#naïve #日本語 #привет'), ['#naïve', '#日本語', '#привет']), 'letters of any language work');
check(same(H.extractHashtags(Array.from({ length: 40 }, (_, i) => `#t${i}`).join(' ')).length, 30), 'at most 30 tags');
check(H.normalizeTag(' #Robots ') === 'robots' && H.isValidTag('#robots') && !H.isValidTag('#123') && !H.isValidTag('a b') && !H.isValidTag(''), 'normalizeTag / isValidTag');
const f = H.findHashtags('go #robots now');
check(f.length === 1 && 'go #robots now'.slice(f[0].start, f[0].end) === '#robots', 'findHashtags gives the exact place of "#tag" (not the space before it)');

section('2. linkify draws a #tag as a button (rendered for real)');
const lout = path.resolve('node_modules/.cache-linkified.mjs');
buildSync({ entryPoints: [path.resolve('src/components/Common/Linkified.tsx')], bundle: true, format: 'esm', platform: 'node', outfile: lout, logLevel: 'error', external: ['react', 'react-dom'], jsx: 'automatic' });
const { linkify } = await import(pathToFileURL(lout).href);
const { renderToStaticMarkup } = await import('react-dom/server');
const React = (await import('react')).default;
const html = renderToStaticMarkup(React.createElement('p', null, linkify('Hi #Robots, visit site.com/x#top or www.a.com #cad!')));
check((html.match(/data-testid="noob-hashtag"/g) || []).length === 2, 'two tags became buttons (#Robots and #cad)');
check(/<button[^>]*class="noob-link[^"]*"[^>]*data-tag="robots"[^>]*>#Robots<\/button>/.test(html) || /data-tag="robots"[^>]*>#Robots<\/button>/.test(html), 'the button shows the tag as typed and carries the lower-case tag');
check(/<a [^>]*href="https:\/\/site\.com\/x#top"/.test(html) && !/>#top</.test(html), 'a # inside a web address stays inside the link and is not a tag');
check(/<a [^>]*href="https:\/\/www\.a\.com"/.test(html), 'web addresses are still links');
check(renderToStaticMarkup(React.createElement('p', null, linkify('plain text 100% sure'))) === '<p>plain text 100% sure</p>', 'text without tags is returned as it was');

section('3. The screens are wired');
const lk = read('src/components/Common/Linkified.tsx');
check(/openHashtag\(h\.tag\)/.test(lk) && /stopPropagation/.test(lk) && /noob-link/.test(lk), 'Linkified: the tag button opens the hashtag page, stops the tap from also opening the post, uses noob-link');
const inapp = read('src/utils/inAppLinks.ts');
check(/export function openHashtag/.test(inapp) && /export function setHashtagHandler/.test(inapp), 'inAppLinks: a global opener for hashtags');
const app = read('src/App.tsx');
check(/kind: 'hashtag'/.test(app) && /setHashtagHandler\(openHashtagPage\)/.test(app) && /<HashtagPage/.test(app), 'App: the hashtag page is a layer on top of the page that is showing, with the way back');
check(/params\.get\('tag'\)/.test(app) && /searchParams\.delete\('tag'\)/.test(app) && /if \(!sharedTag \|\| !currentUser\) return/.test(app), 'App: the ?tag= link opens it once signed in, then the link is removed from the address bar');
check(/onCaptionEdited/.test(app) && /setPosts\(\(prev\) => prev\.map\(\(p\) => \(p\.id === d\.id/.test(app), 'App: an edited caption updates the lists at once');
const page = read('src/components/Explore/HashtagPage.tsx');
check(/fixed inset-0 edge-own/.test(page) && /calc\(var\(--sat, 0px\) \+ 12px\)/.test(page), 'HashtagPage: notch-safe (edge-own + header padding)');
check(/hashtag-skeleton/.test(page) && /hashtag-empty/.test(page) && /hashtag-error/.test(page) && /hashtag-sort-top/.test(page) && /hashtag-sort-new/.test(page), 'HashtagPage: skeleton, empty, error and the Newest / Most liked switch');
check(/onOpenPost\(post\)/.test(page) && /onOpenReel\(reel\)/.test(page), 'HashtagPage: a tile opens the post / reel');
const css = read('src/components/Explore/hashtag.css');
check(/#f8cb46/i.test(css) && /#0c831f/i.test(css) && /#121212/i.test(css) && /:root\[data-theme="light"\] \.ht-root/.test(css), 'hashtag.css: yellow band, green buttons, #121212 page, and a light theme');
const pc = read('src/components/Feed/PostCard.tsx');
check(/\{isOwner && \(\s*<button[^>]*\s*onClick=\{\(\) => \{\s*setShowEditCaption\(true\)/.test(pc) && /Edit caption/.test(pc), 'PostCard: "Edit caption" is in the menu for the owner only (not for an administrator)');
check(/linkify\(shownCaption/.test(pc), 'PostCard: the caption is drawn with tappable tags');
check(/aria-label="Post options"|title="Post options"/.test(pc) && /Delete Post/.test(pc), 'PostCard: the old menu items are still there');
const rv = read('src/components/Reels/ReelsView.tsx');
check(/\{isReelOwner && \(\s*<button[^>]*\s*onClick=\{\(\) => \{\s*setShowReelOptionsMenu\(false\);\s*setShowEditReelCaption\(true\)/.test(rv) && /updateReelCaption/.test(rv), 'ReelsView: "Edit caption" for the reel owner only');
const sheet = read('src/components/Common/EditCaptionSheet.tsx');
check(/edit-caption-count/.test(sheet) && /edit-caption-error/.test(sheet) && /edit-caption-save/.test(sheet) && /CAPTION_MAX/.test(sheet) && /Cancel/.test(sheet), 'EditCaptionSheet: counter, error text, Save and Cancel');
const api = read('src/services/supabaseApi.ts');
check(/'posts_by_hashtag'/.test(api) && /'reels_by_hashtag'/.test(api) && /'update_post_caption'/.test(api) && /'update_reel_caption'/.test(api) && /'hashtag_counts'/.test(api), 'API layer calls the five new functions');
const apiIdx = read('src/services/api.ts');
check(/fetchPostsByHashtag/.test(apiIdx) && /updatePostCaption/.test(apiIdx) && /updateReelCaption/.test(apiIdx), 'api.ts re-exports them');

section('4. The SQL file');
const sql = read('supabase/migrations/20261112000001_hashtags_and_edit_post.sql');
check(!/\bdrop\s+(table|column|function|index|policy)\b/i.test(sql) && !/\balter\s+table\b/i.test(sql) && !/\bdelete\s+from\b/i.test(sql) && !/\btruncate\b/i.test(sql), 'additive only: no drop, no alter table, no delete');
const defs = [...sql.matchAll(/create or replace function public\.(\w+)/g)].map((m) => m[1]);
check(defs.length === 6, `six new functions: ${defs.join(', ')}`);
check([...sql.matchAll(/security definer set search_path = public/g)].length >= 5, 'the callable ones are security definer with search_path = public');
check(!/grant execute[^;]*\bto anon\b/i.test(sql) && /revoke all on function public\.update_post_caption\(uuid, text\) from public, anon/.test(sql), 'granted to authenticated only');

section('5. The SQL on a real Postgres (every migration applied)');
const { createTestDb, asUser, asAnon } = await import('./pg-test-env.mjs');
const db = await createTestDb();
const mkUser = async (name, extra = '') => {
  const id = (await db.query('select gen_random_uuid() as id')).rows[0].id;
  await db.query(`insert into auth.users (id, email, encrypted_password) values ($1, $2, extensions.crypt('secret pass', extensions.gen_salt('bf')))`, [id, `${name}@users.nooob.xyz`]);
  if (!(await db.query('select 1 from public.profiles where id = $1', [id])).rows.length) await db.query('insert into public.profiles (id, username, display_name) values ($1, $2, $2)', [id, name]);
  return id;
};
const ann = await mkUser('ann'), bob = await mkUser('bob'), priv = await mkUser('priv'), blk = await mkUser('blk'), sus = await mkUser('sus');
await db.query(`update public.profiles set account_type = 'private' where id = $1`, [priv]);
await db.query(`update public.profiles set is_suspended = true where id = $1`, [sus]);
await db.query('insert into public.blocks (blocker_id, blocked_id) values ($1, $2)', [blk, bob]);
const mkPost = async (uid, caption, tags, extra = {}) => (await db.query(
  `insert into public.posts (user_id, caption, hashtags, is_archived, likes_count, scheduled_for) values ($1, $2, $3::text[], $4, $5, $6) returning id`,
  [uid, caption, tags, extra.archived || false, extra.likes || 0, extra.scheduled || null])).rows[0].id;
const mkReel = async (uid, caption, tags, likes = 0) => (await db.query(
  `insert into public.reels (user_id, video_url, caption, hashtags, likes_count) values ($1, 'reels/x.mp4', $2, $3::text[], $4) returning id`, [uid, caption, tags, likes])).rows[0].id;
const pOld = await mkPost(ann, 'old one', ['#Robots'], { likes: 1 });
await new Promise((r) => setTimeout(r, 15));
const pNew = await mkPost(ann, 'new one', ['robots', '#Fun'], { likes: 5 });
await new Promise((r) => setTimeout(r, 15));
const pMid = await mkPost(ann, 'liked most', ['#ROBOTS'], { likes: 9 });
const pArch = await mkPost(ann, 'archived', ['#robots'], { archived: true });
const pFuture = await mkPost(ann, 'later', ['#robots'], { scheduled: new Date(Date.now() + 86400000).toISOString() });
const pPriv = await mkPost(priv, 'private', ['#robots']);
const pBlk = await mkPost(blk, 'blocked me', ['#robots']);
const pSus = await mkPost(sus, 'suspended', ['#robots']);
const pOther = await mkPost(ann, 'other', ['#robotics']);
const rOne = await mkReel(ann, 'reel', ['#robots'], 3);
const rPriv = await mkReel(priv, 'reel private', ['#robots']);
const call = async (uid, sql, args = []) => asUser(db, uid, async () => (await db.query(sql, args)).rows[0]?.r);
const fail = async (uid, sql, args = []) => { try { await call(uid, sql, args); return null; } catch (e) { return e.message; } };
const ids = (list) => list.map((x) => x.id);

let list = await call(bob, `select public.posts_by_hashtag('robots') as r`);
check(same(ids(list), [pMid, pNew, pOld]), 'bob sees the visible posts, newest first (archived, scheduled, private, blocked and suspended ones are left out)');
check(same(ids(await call(bob, `select public.posts_by_hashtag('#RoBoTs') as r`)), [pMid, pNew, pOld]), 'case does not matter and a leading # is fine');
check(same(ids(await call(bob, `select public.posts_by_hashtag('robots', 60, 0, 'top') as r`)), [pMid, pNew, pOld]), '"top" puts the most liked first');
check(same(ids(await call(bob, `select public.posts_by_hashtag('robots', 1, 1) as r`)), [pNew]), 'limit and offset page through the list');
check(list[0].username === 'ann' && Array.isArray(list[0].slides) && 'likesCount' in list[0], 'same JSON shape as the feed (post_json)');
check((await call(bob, `select public.posts_by_hashtag('robot') as r`)).length === 0, 'a part of a tag does not match (only the whole tag)');
check(same(ids(await call(priv, `select public.posts_by_hashtag('robots') as r`)).slice().sort(), [pMid, pNew, pOld, pPriv, pBlk].slice().sort()), 'the owner of a private account sees their own post, and the public ones');
const annSees = ids(await call(ann, `select public.posts_by_hashtag('robots') as r`));
check(annSees.includes(pFuture) && !annSees.includes(pArch), 'an author sees their own scheduled post');
check(!ids(await call(bob, `select public.posts_by_hashtag('robots') as r`)).includes(pBlk), 'a post by somebody who blocked you is not shown');
const rl = await call(bob, `select public.reels_by_hashtag('robots') as r`);
check(same(ids(rl), [rOne]), 'reels: the visible reel only (the private account\'s is hidden)');
const cnt = await call(bob, `select public.hashtag_counts('robots') as r`);
check(cnt.posts === 3 && cnt.reels === 1, 'counts agree with what is shown');
check(/Not authenticated|permission denied/.test(await (async () => { try { await asAnon(db, async () => db.query(`select public.posts_by_hashtag('robots')`)); return ''; } catch (e) { return e.message; } })()), 'a signed-out visitor gets nothing');

section('6. Editing a caption');
const base = await mkPost(ann, 'Hello #Old tag #keep', ['#old', '#keep', '#manual']);
const edited = await call(ann, `select public.update_post_caption($1, $2) as r`, [base, 'Now about #New things and #keep, not #NEW']);
check(edited.caption === 'Now about #New things and #keep, not #NEW', 'the caption is saved');
check(same(edited.hashtags, ['#manual', '#new', '#keep']), 'tags follow the caption (#old went, #new came, no repeats) and the tag added by hand (#manual) is kept', JSON.stringify(edited.hashtags));
check(same(ids(await call(bob, `select public.posts_by_hashtag('new') as r`)), [base]) && (await call(bob, `select public.posts_by_hashtag('old') as r`)).length === 0, 'the hashtag pages follow at once');
check(/only edit your own/i.test(await fail(bob, `select public.update_post_caption($1, 'hacked') as r`, [base]) || ''), 'somebody else cannot edit it');
await db.query(`update public.profiles set is_admin = true where id = $1`, [bob]);
check(/only edit your own/i.test(await fail(bob, `select public.update_post_caption($1, 'hacked') as r`, [base]) || ''), 'not even an administrator can');
check((await db.query('select caption from public.posts where id = $1', [base])).rows[0].caption.startsWith('Now about'), 'and the caption stayed as the owner wrote it');
check(/2200/.test(await fail(ann, `select public.update_post_caption($1, $2) as r`, [base, 'x'.repeat(2201)]) || ''), 'more than 2200 characters is refused');
check((await call(ann, `select public.update_post_caption($1, $2) as r`, [base, 'y'.repeat(2200)])).caption.length === 2200, '2200 characters is fine');
const cleared = await call(ann, `select public.update_post_caption($1, '') as r`, [base]);
check(cleared.caption === '' && same(cleared.hashtags, ['#manual']), 'an empty caption is allowed; only the hand-added tag is left');
check(/Not authenticated|permission denied/.test(await (async () => { try { await asAnon(db, async () => db.query(`select public.update_post_caption($1, 'x')`, [base])); return ''; } catch (e) { return e.message; } })()), 'signed out: refused');
const rEd = await call(ann, `select public.update_reel_caption($1, 'A reel #Cats') as r`, [rOne]);
check(rEd.caption === 'A reel #Cats' && same(rEd.hashtags, ['#robots', '#cats']), 'reel caption saved; tags follow (the old #robots was not in the old caption, so it counts as added by hand and stays)', JSON.stringify(rEd.hashtags));
check(/only edit your own/i.test(await fail(bob, `select public.update_reel_caption($1, 'hacked') as r`, [rOne]) || ''), 'somebody else cannot edit a reel');
check(same((await call(ann, `select public.extract_hashtags('a #B c.com/x#y #b') as r`)), ['#b']), 'extract_hashtags in SQL follows the same rule');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
