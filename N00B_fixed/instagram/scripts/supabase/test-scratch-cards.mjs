// Scratch Reveal: the engine maths, the database file, the wiring in the three-line menu, and that nothing of the tool it was drafted in is left anywhere.
// Usage: node --liftoff-only scripts/supabase/test-scratch-cards.mjs
import fs from 'node:fs';
import path from 'node:path';
import { calculateClearedPercentage, distanceBetween, interpolatePoints, shouldAutoReveal, SCRATCH_TOOLS, FOIL_CONFIGS } from '../../src/components/Scratch/scratchEngine.ts';

let passed = 0, failed = 0;
const check = (c, l) => { if (c) { passed++; console.log(`  ok   ${l}`); } else { failed++; console.log(`  FAIL ${l}`); } };
const read = (p) => fs.readFileSync(p, 'utf8').split('\r').join('');

// ---- the engine
check(distanceBetween({ x: 0, y: 0 }, { x: 3, y: 4 }) === 5, 'distance between two points');
const pts = interpolatePoints({ x: 0, y: 0 }, { x: 100, y: 0 }, 10);
check(pts.length >= 10 && pts[0].x === 0 && pts[pts.length - 1].x === 100, 'a fast stroke is filled in with points (no gaps in the scratch line)');
const opaque = new Uint8ClampedArray(10 * 10 * 4); for (let i = 3; i < opaque.length; i += 4) opaque[i] = 255;
check(calculateClearedPercentage({ data: opaque, width: 10, height: 10 }, 1, 30) === 0, 'a foil nobody touched is 0% cleared');
const half = new Uint8ClampedArray(opaque); for (let y = 0; y < 5; y++) for (let x = 0; x < 10; x++) half[(y * 10 + x) * 4 + 3] = 0;
check(calculateClearedPercentage({ data: half, width: 10, height: 10 }, 1, 30) === 50, 'half the foil gone is 50%');
check(shouldAutoReveal(12) && !shouldAutoReveal(11), 'the "a little scratching" threshold');
check(Object.keys(SCRATCH_TOOLS).sort().join() === 'coin,guitar_pick,key,magic_wand', 'four scratch edges: coin, key, magic wand, guitar pick');
check(Object.keys(FOIL_CONFIGS).sort().join() === 'doodle,gold,holographic,silver', 'four foils');

// ---- the database file
const sql = read('supabase/migrations/20261105000001_scratch_cards.sql');
for (const t of ['scratch_posts', 'scratch_reactions', 'scratch_comments', 'scratch_saves', 'scratch_reveals']) {
  check(new RegExp(`alter table public\\.${t}\\s+enable row level security`).test(sql), `${t}: row level security on`);
}
check(/revoke all on public\.scratch_posts, public\.scratch_reactions, public\.scratch_comments, public\.scratch_saves, public\.scratch_reveals from public, anon, authenticated/.test(sql), 'no table can be read or written directly');
for (const f of ['scratch_feed', 'scratch_create', 'scratch_delete', 'scratch_react', 'scratch_save', 'scratch_reveal', 'scratch_comments', 'scratch_comment', 'scratch_comment_delete']) {
  check(new RegExp(`function public\\.${f}\\(`).test(sql), `function ${f} exists`);
}
check(/grant execute on function[\s\S]*to authenticated;/.test(sql) && /from public, anon;/.test(sql), 'only signed-in people may call the functions');
check(/security definer set search_path = public/.test(sql) && !/security invoker/.test(sql), 'every function runs with a fixed search path');
check(/can_view_author\(/.test(sql) && /blocks b/.test(sql), 'the same visibility rule as posts (blocked people, private accounts) and blocked people cannot read each other\'s notes');
check(/~ '\^posts\/\[A-Za-z0-9_\.\/-\]\+\$'/.test(sql) && /like '%\.\.%'/.test(sql), 'a card can only point at a picture of the posts/ folder (no ../)');
check(/>= 20 then/.test(sql) && />= 60 then/.test(sql), 'limits: 20 cards a day, 60 notes an hour');
check(/queue_media_trash\(v_row\.image_key/.test(sql), 'a deleted card sends its picture to the deletion queue');
check(!/drop table|drop function|truncate|alter table public\.(profiles|posts)\b/i.test(sql), 'purely additive: nothing existing is dropped or changed');

// ---- the screens
const data = read('src/components/Scratch/scratchData.ts');
check(/'scratch_feed'/.test(data) && /'scratch_react'/.test(data) && /'scratch_comment'/.test(data) && /'scratch_save'/.test(data) && /'scratch_create'/.test(data), 'the screens call the real server functions');
check(/uploadMediaFile\(file, 'posts'/.test(data), 'the picture is uploaded like any NOOB post picture');
check(!/localStorage[\s\S]{0,40}scratch_posts|INITIAL_POSTS|unsplash[\s\S]{0,40}authorAvatar/.test(data), 'no made-up posts in the code');
const page = read('src/components/Scratch/ScratchPage.tsx');
check(/aria-label="Back to the menu"/.test(page) && /onClick=\{onClose\}/.test(page), 'a back arrow takes the person back to the menu');
check(/NOOB SOCIALS: SCRATCH-TO-REVEAL ENGINE/.test(page) && /Swipe your finger or mouse over the foil to unveil secret photos/.test(page) && /No secret cards in this category yet!/.test(page), 'the original texts are kept');
check(/Escape/.test(page), 'Escape closes the page');
const card = read('src/components/Scratch/ScratchCard.tsx');
for (const k of ['heart', 'thumb', 'flame', 'rocket', 'skull']) check(card.includes(`kind: '${k}'`), `reaction ${k}`);
check(/Chalk Notes &amp; Clues/.test(read('src/components/Scratch/ScratchNotes.tsx')) && /Write a scratch clue or reaction\.\.\./.test(read('src/components/Scratch/ScratchNotes.tsx')), 'the notes sheet keeps its texts');
check(/Seal with Scratch Foil & Post/.test(read('src/components/Scratch/ScratchUpload.tsx')), 'the upload sheet keeps its texts');
const canvas = read('src/components/Scratch/ScratchCanvas.tsx');
check(/touchAction: 'pan-y'/.test(canvas) && /devicePixelRatio/.test(canvas), 'the foil lets the page scroll up and down, and is sharp on sharp screens');
check(/\/brand\/doodle-white\.webp/.test(canvas), 'the foil wears the NOOB doodle');

// ---- the menu
const feed = read('src/components/Feed/FeedView.tsx');
const prof = read('src/components/Profile/ProfileView.tsx');
check(/data-testid="profile-scratch"/.test(prof) && /useFeatureOn\('scratch'\)/.test(prof) && /<ScratchPage onClose=\{\(\) => setShowScratch\(false\)\}/.test(prof) && !/ScratchPage/.test(feed), 'Scratch Reveal is a button (with its icon) on the profile page and opens the page; it is no longer in the Home menu');
check(/key: 'scratch'/.test(read('src/utils/features.ts')), 'the administrator can switch the page off (Pages tab)');
check(/'scratch'/.test(read('src/components/Feed/MenuBanner.tsx')) && /scratch: \{ border/.test(read('src/components/Feed/MenuBanner.tsx')), 'the menu button has its own colours');
check(/images\.unsplash\.com/.test(read('public/_headers')), 'the preset pictures may be fetched (security policy)');

// ---- nothing of the drafting tool anywhere
const bad = /ai\s*studio|aistudio|google\s*ai|@google\/genai|gemini|ai\.studio|\.aistudio/i;
const walk = (d, out = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name === 'node_modules' || e.name === 'dist') continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p, out); else out.push(p); } return out; };
const roots = ['src/components/Scratch', '../scratch-reveal'].filter((p) => fs.existsSync(p));
const offenders = roots.flatMap((r) => walk(r)).filter((f) => /\.(tsx?|json|html|md|css|mjs|lock|example|gitignore)$/.test(f) || /\.env/.test(f)).filter((f) => bad.test(f) || bad.test(fs.readFileSync(f, 'utf8')));
check(offenders.length === 0, `no mention of the drafting tool in the Scratch code or its source copy ${offenders.slice(0, 3).join(', ')}`);
check(!fs.existsSync('../scratch-reveal/.aistudio') && !fs.existsSync('../scratch-reveal/public/assets/aistudio'), 'no tool folders in the source copy');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
