// Comment threads (migration 20261117000003): the list pages by thread, so a reply never arrives without its parent and a post with many replies never shows "no comments".
//   1. the SQL on a REAL Postgres (PGlite) with every migration applied;
//   2. the screens: the one comments sheet frame on every screen size (rises from the bottom, 30-50 % tall by the number of comments), a failed load says so instead of "no comments".
// Usage: node --liftoff-only scripts/supabase/test-comment-threads.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildSync } from 'esbuild';

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
const ann = await mkUser('ann'), bob = await mkUser('bob');
const post = (await db.query(`insert into public.posts (user_id, caption) values ($1, 'p') returning id`, [ann])).rows[0].id;
const at = (min) => new Date(Date.UTC(2026, 10, 1, 12, 0, 0) + min * 60000).toISOString();
const add = async (uid, text, parent, min, extra = '') => (await db.query(`insert into public.comments (post_id, user_id, text, parent_id, created_at) values ($1, $2, $3, $4, $5) returning id`, [post, uid, text, parent, at(min)])).rows[0].id;
// 25 top-level comments (oldest first), and 130 replies that are all NEWER than every top-level comment, all under the OLDEST one
const tops = [];
for (let i = 0; i < 25; i++) tops.push(await add(i % 2 ? ann : bob, `top ${i}`, null, i));
for (let i = 0; i < 130; i++) await add(bob, `reply ${i}`, tops[0], 100 + i);
const call = async (uid, sql, args = []) => asUser(db, uid, async () => (await db.query(sql, args)).rows[0]?.r);
const old = await call(bob, 'select public.post_comments_page($1, 100, 0) as r', [post]);
check(old.comments.every((c) => c.parentId), 'the OLD page of 100 is all replies: its parent comments are missing (the bug: the sheet showed "no comments")');
const p1 = await call(bob, 'select public.post_comments_threads($1, 20, 0) as r', [post]);
const top1 = p1.comments.filter((c) => !c.parentId);
check(top1.length === 20 && p1.topCount === 20 && p1.hasMore === true, 'the first page has 20 top-level comments and says there are more');
check(p1.comments.filter((c) => c.parentId).length === 0, 'the first 20 (newest) top-level comments have no replies, so none come along');
check(p1.total === 155, 'the total counts every comment (155)');
const p2 = await call(bob, 'select public.post_comments_threads($1, 20, 20) as r', [post]);
const top2 = p2.comments.filter((c) => !c.parentId);
check(top2.length === 5 && p2.hasMore === false && p2.topCount === 5, 'the second page has the last 5 threads and says there is no more');
const ids2 = new Set(top2.map((c) => c.id));
check(top2.some((c) => c.id === tops[0]) && p2.comments.filter((c) => c.parentId === tops[0]).length === 130, 'the oldest thread arrives WITH its 130 replies (a reply never comes without its parent)');
check(p2.comments.filter((c) => c.parentId).every((c) => ids2.has(c.parentId)), 'every reply on a page belongs to a top-level comment of the same page');
check(new Set([...top1, ...top2].map((c) => c.id)).size === 25, 'the two pages together hold every top-level comment once');
// pinned first
await db.query('update public.comments set is_pinned = true where id = $1', [tops[3]]);
const pp = await call(bob, 'select public.post_comments_threads($1, 20, 0) as r', [post]);
check(pp.comments[0].id === tops[3], 'a pinned comment comes first');
// hidden by moderation: only its writer sees it
await db.query(`update public.comments set hidden_reason = 'spam' where id = $1`, [tops[24]]);
const hb = await call(ann, 'select public.post_comments_threads($1, 50, 0) as r', [post]);   // somebody else
const ha = await call(bob, 'select public.post_comments_threads($1, 50, 0) as r', [post]);   // the writer of that comment
check(!hb.comments.some((c) => c.id === tops[24]) && hb.total === 154, 'a hidden comment is not shown to others (and not counted)');
check(ha.comments.some((c) => c.id === tops[24]) && ha.total === 155, 'its writer still sees it (and it counts for them)');
const anonTry = await asAnon(db, async () => { try { await db.query('select public.post_comments_threads($1, 20, 0)', [post]); return 'ran'; } catch (e) { return e.message; } });
check(/permission denied/i.test(anonTry), 'a logged-out visitor can not call it');
const empty = await call(bob, 'select public.post_comments_threads($1, 20, 0) as r', ['00000000-0000-0000-0000-000000000000']);
check(empty.comments.length === 0 && empty.hasMore === false && empty.total === 0, 'a post with no comments answers an empty page');
const reelOk = await call(bob, 'select public.reel_comments_threads($1, 20, 0) as r', ['00000000-0000-0000-0000-000000000000']);
check(Array.isArray(reelOk.comments) && reelOk.total === 0, 'the reel version works too');

section('2. The sheet: 30-50 % of the page by the number of comments, from the bottom, on every screen');
const out = path.resolve('node_modules/.cache-commentsbox.mjs');
buildSync({ entryPoints: [path.resolve('src/utils/useVisualViewport.ts')], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error', external: ['react'] });
const V = await import(pathToFileURL(out).href);
const near = (a, b) => Math.abs(a - b) < 0.011;
check([0, 2, 6, 50].every((n) => near(V.commentsFraction(n, 812), 0.5)), 'the sheet covers 50 % of the page, whatever the number of comments')
check(V.commentsFraction(0, 1400) === 0.5 && V.commentsFraction(3, 1400) === 0.5, 'a tall screen (a tablet, a computer) is 50 % too')
check(V.commentsFraction(-5, 800) === 0.5 && V.commentsFraction(NaN, 800) === 0.5, 'nonsense counts stay at 50 %')
const vv = read('src/utils/useVisualViewport.ts'), css = read('src/polish.css'), pcs = read('src/components/Feed/CommentsSheet.tsx'), vcs = read('src/components/Videos/VideoCommentsSheet.tsx'), rv = read('src/components/Reels/ReelsView.tsx'), api = read('src/services/supabaseApi.ts');
check(/const wide = window\.innerWidth >= 640;/.test(vv) && /wide \? '0 -18px 50px/.test(vv) && /transition: `top \.32s/.test(vv), 'on a wide screen it is the same bottom sheet (no keyboard, no dark side bands) and its height eases between sizes');
check(/\.cmt-sheet \{ animation: cmt-rise[^}]*backwards/.test(css) && /@keyframes cmt-rise \{ from \{ transform: translateY\(100%\)/.test(css) && /prefers-reduced-motion: reduce\) \{ \.cmt-sheet/.test(css), 'it rises from the bottom (and stays still for people who ask for less motion); the drag-to-close can still move it');
for (const [name, src] of [['posts', pcs], ['videos', vcs], ['reels', rv]]) {
  check(/useCommentsBox\(/.test(src) && /cmt-sheet relative/.test(src) && !/sm:h-\[80vh\]/.test(src.slice(src.indexOf('cmt-sheet') - 200, src.indexOf('cmt-sheet') + 300)) && /closeAnimated/.test(src) && /data-testid="comments-error"/.test(src) && /data-testid="comments-retry"/.test(src), name + ': the shared sheet (bottom, 30-50 %, slides away when closed) and a "could not be loaded" with Try again');
}
check(/failed: true/.test(api) && /if \(page\.failed\)/.test(pcs) && /if \(page\.failed\) \{ setReelCommentsError\(true\)/.test(rv) && /fetchLongVideoComments\(video\.id, true\)/.test(vcs), 'a list that did not arrive is never shown as "no comments yet"');
check(/\[showComments, currentReel\?\.id, reelCommentsReload\]/.test(rv), 'the reel comments reload for another reel, not each time the reel object is renewed (a like count)');
check(/post_comments_threads/.test(api) && /reel_comments_threads/.test(api) && /if \(page\.comments\.length > 0\) shortCache\.set/.test(api) && /withRetry\(load\)/.test(api), 'the app asks for threads, tries twice, and does not remember an empty answer');
fs.rmSync(out, { force: true });

section('3. The look: calm and soft, the whole width on a wide screen, and no clash with the Create sheet (cs-sheet)');
const cssFiles = [];
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = d + '/' + e.name; if (e.isDirectory()) walk(p); else if (p.endsWith('.css')) cssFiles.push(p); } };
walk('src');
const definers = cssFiles.filter((f) => /\.cmt-(sheet|backdrop|row)\b/.test(read(f)));
check(definers.every((f) => /polish\.css$|home\.css$/.test(f)), 'the cmt- classes are only defined in polish.css (and home.css), nowhere else');
const usesOld = [pcs, vcs, rv, read('src/components/Feed/HomeMix.tsx')].some((src) => /\bcs-(sheet|backdrop|row)\b/.test(src));
check(!usesOld, 'the comment sheets do not use cs-sheet / cs-row (those belong to the Create sheet: they once turned the comments yellow, 70 % tall and narrow)');
check(!/@keyframes cs-(rise|fade)/.test(css), 'polish.css does not redefine the Create sheet\'s animations');
const soft = css.slice(css.lastIndexOf('/*', css.indexOf('the comments sheet, soft and calm'))).replace(/\/\*[\s\S]*?\*\//g, '');   // the rules only, without the comment above them
check(/@layer base \{/.test(soft) && /--cmt-bg: #16161b/.test(soft) && /--cmt-bg: #ffffff/.test(soft) && !/#F8CB46|#f6c945|yellow/i.test(soft), 'a charcoal sheet (white in Light mode), set in the theme layer so it wins in both, and no yellow');
check(/@media \(min-width: 640px\) \{\s*html body \.cmt-sheet \{ max-width: none !important/.test(soft) && /@media \(min-width: 900px\)[\s\S]*calc\(\(100% - 860px\) \/ 2\)/.test(soft), 'on a tablet, laptop or computer the sheet spans the whole width, its content in a readable middle column');
check(/border-radius: 9999px !important/.test(soft) && /linear-gradient\(135deg, #7c5cff/.test(soft), 'a pill text box and a round gradient send button, like the anonymous comments');
check([pcs, vcs].every((src) => /<SheetGrip drag=\{drag\} alwaysBar>/.test(src)) && /commentsDrag\} className="-mx-4 px-4" alwaysBar/.test(rv), 'the grab bar shows on every screen size');

check(/\.cmt-wrap:has\(\.cmt-sheet :is\(form:focus-within, textarea:focus, input:focus\)\) \{ background-color: #16161b !important/.test(soft) && /body\.light \.cmt-wrap:has[^{]*\{ background-color: #ffffff !important/.test(soft), 'while somebody types, the whole screen behind the sheet (also under the keyboard) is the sheet colour, dark and light');
check([pcs, vcs, rv, read('src/components/Feed/HomeMix.tsx')].every((src) => /cmt-wrap/.test(src)) && [pcs, vcs, rv].every((src) => /cmt-wrap fixed inset-0[^>]*data-noob-sheet="1"/.test(src)), 'every comment sheet frame is a cmt-wrap (the three full-screen ones are sheets, so the clock gap rule does not move them)');
const idx = read('src/index.css');
check(/html\.sd-open \.rp-backdrop, html\.sd-open \.rp-backdrop \* \{ visibility: visible; \}/.test(idx), 'the Report a problem sheet is shown above the Customer Support page (that page hides everything else with visibility)');

check(/useCommentsLock\(\);/.test(vv) && /addEventListener\('touchmove', stopPageTouch, \{ passive: false \}\)/.test(vv) && /classList\.add\('cmt-lock'\)/.test(vv), 'while a comments sheet is open the page behind is locked (every sheet uses useCommentsBox): touches outside the comment list do nothing, like YouTube');
check(/html\.cmt-lock, html\.cmt-lock body \{ overflow: hidden !important/.test(css) && /\.cmt-sheet textarea, html body \.cmt-sheet input \{ font-size: 16px/.test(css), 'the page does not scroll behind the sheet, and the text box is 16 px so the iPhone does not zoom the page when it is tapped');
const pv2 = read('src/components/Profile/ProfilePostViewer.tsx');
check(/data-noob-keep="1"/.test(pv2) && /\+ 2px\)/.test(pv2), 'the profile post viewer is left alone by the automatic gap rules (a photo post got the clock gap twice), its Back bar sits just under the clock');
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
