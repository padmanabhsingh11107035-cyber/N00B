// LIKES MUST NEVER LOOK LOST. (Video of 2026-11-05: a reel was liked, the person went to Explore and opened the reel again, and the heart was empty: the like was kept inside the
// Reels page only, the app's own lists never heard of it.) The rules that stop this from happening again, for EVERY kind of content (posts, reels, videos, stories, comments):
//   1. every like button sends through sendLike (one at a time, in order, rolled back if refused), which writes the person's answer into the ledger (utils/likeLedger.ts);
//   2. every list the app shows is passed through the ledger (applyLikes), so no screen can show an older answer than another;
//   3. a like never makes a page start over (the Reels page restarted at its first reel whenever its list changed);
//   4. if somebody adds a NEW like button that does not follow rule 1, THIS TEST FAILS (it scans every file of the app).
// Usage: node scripts/supabase/test-likes-guard.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildSync } from 'esbuild';

let passed = 0, failed = 0;
const check = (cond, label) => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');

section('1. The ledger itself (drawn for real)');
const out = path.resolve('node_modules/.cache-like-ledger.mjs');
buildSync({ entryPoints: [path.resolve('src/utils/likeLedger.ts')], bundle: true, format: 'esm', platform: 'node', packages: 'external', outfile: out, logLevel: 'error' });
const L = await import(pathToFileURL(out).href);
const reel = { id: 'r1', isLiked: false, likesCount: 4 };
L._resetLedger();
check(L.applyLikes([reel], 'reel')[0] === reel, 'with nothing recorded a list is returned as it is (the very same object: nothing is drawn again for nothing)');
L.recordLike('reel:r1', true);
let shown = L.applyLikes([reel], 'reel')[0];
check(shown.isLiked === true && shown.likesCount === 5 && reel.isLiked === false, 'a like is shown on an older copy of the reel (count + 1), without touching the copy');
L.recordLike('reel:r1', true, 9);
check(L.applyLikes([reel], 'reel')[0].likesCount === 9, 'the server\'s own number replaces the guess');
check(L.applyLikes([{ id: 'r1', isLiked: true, likesCount: 9 }], 'reel')[0].likesCount === 9, 'a copy that already agrees is not changed');
check(L.applyLikes([{ id: 'r1', isLiked: true, likesCount: 3 }], 'post')[0].likesCount === 3, 'a post and a reel with the same id never mix (the key has the kind)');
L.recordLike('reel:r1', false);
check(L.applyLikes([{ id: 'r1', isLiked: true, likesCount: 9 }], 'reel')[0].isLiked === false && L.applyLikes([{ id: 'r1', isLiked: true, likesCount: 9 }], 'reel')[0].likesCount === 8, 'taking a like back is shown too (count - 1)');
L.forgetLike('reel:r1');
check(L.applyLikes([reel], 'reel')[0] === reel, 'a like the server refused is forgotten');
check(L.withLike({ isLiked: false, likesCount: 1 }, { isLiked: true, at: Date.now() - 16 * 60 * 1000 }).isLiked === false, 'an answer older than 15 minutes is no longer used (the server has the truth by then)');
check(L.withLike({ isLiked: true, likesCount: 0 }, { isLiked: false, at: Date.now() }).likesCount === 0, 'the count never goes below zero');

section('2. Every like goes through sendLike, which writes the ledger');
const sync = read('src/utils/likeSync.ts');
check(/recordLike\(key, want\)/.test(sync) && /recordLike\(key, res\.isLiked, Number\(res\.likesCount\) \|\| 0\)/.test(sync) && /forgetLike\(key\)/.test(sync), 'sendLike records the tap at once, the server\'s answer when it comes, and forgets a refused like');

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.(tsx?|jsx?)$/.test(e.name) ? [path.join(d, e.name)] : []));
const NAMES = ['toggleLikePost', 'toggleLikeReel', 'toggleLikeLongVideo', 'toggleStoryLike', 'toggleCommentLike', 'toggleLongVideoCommentLike', 'toggleLikeMusicTrack'];
const EXEMPT = [/src[\\/]services[\\/]/, /MusicPlayerContext/];   // the API layer itself; the music player keeps its own liked-songs list (not a feed of content)
const bypass = [];
for (const f of walk('src')) {
  if (EXEMPT.some((r) => r.test(f))) continue;
  const text = read(f);
  for (const name of NAMES) {
    const re = new RegExp(`\\b${name}\\(`, 'g');
    let m;
    while ((m = re.exec(text))) if (!/sendLike\(/.test(text.slice(Math.max(0, m.index - 500), m.index))) bypass.push(`${path.relative('.', f)}: ${name}`);
  }
}
check(bypass.length === 0, `no like button bypasses sendLike${bypass.length ? ' -> ' + bypass.join(', ') : ''}`);
const rpcLikes = [...read('src/services/supabaseApi.ts').matchAll(/rpc[^\n]*'(toggle_[a-z_]*like[a-z_]*)'/g)].map((m) => m[1]);
check(rpcLikes.length >= 5, 'the scan knows the like calls of the API layer (' + rpcLikes.join(', ') + ')');
const unknown = rpcLikes.filter((n) => !['toggle_like', 'toggle_post_like', 'toggle_reel_like', 'toggle_long_video_like', 'toggle_story_like', 'toggle_comment_like', 'toggle_long_video_comment_like', 'toggle_reel_comment_like', 'toggle_music_like', 'toggle_track_like', 'toggle_dislike', 'toggle_post_dislike', 'toggle_like_count', 'toggle_post_like_count'].includes(n));
check(unknown.length === 0, `every like call of the API layer is a known one (a NEW one has to be added here, and wired through sendLike)${unknown.length ? ' -> ' + unknown.join(', ') : ''}`);

section('3. Every list is shown through the ledger');
const app = read('src/App.tsx');
check(/applyLikes\(postsState, 'post'\)/.test(app) && /applyLikes\(reelsState, 'reel'\)/.test(app) && /applyLikes\(storiesState, 'story'\)/.test(app), 'the app\'s posts, reels and stories');
check(/applyLikes\(videosState, 'video'\)/.test(read('src/components/Videos/HomeVideoFeedView.tsx')), 'the long-video feed');
check(/applyLikes\(data, 'comment'\)/.test(read('src/components/Feed/CommentsSheet.tsx')) && /applyLikes\(data, 'comment'\)/.test(read('src/components/Videos/VideoCommentsSheet.tsx')), 'the comments of posts, reels and videos');

section('4. A like never restarts a page');
const reels = read('src/components/Reels/ReelsView.tsx');
check(/\[reelsKey, initialReelId\]/.test(reels) && /const reelsKey = reels\.map\(\(r\) => r\.id\)\.join\('\|'\)/.test(reels), 'the Reels page starts over only when the SET of reels changes');
check(/f\.isLiked !== r\.isLiked \|\| f\.likesCount !== r\.likesCount/.test(reels), 'a like in the app\'s list is copied into the page in place (same order, same reel)');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
