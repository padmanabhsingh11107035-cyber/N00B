// A post shows its author's name ONCE (in front of the caption under the picture), not also at the top; and the three-line menu scrolls without a scrollbar.
// Usage: node scripts/supabase/test-post-name-once.mjs
import fs from 'node:fs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const post = read('src/components/Feed/PostCard.tsx');
const feed = read('src/components/Feed/FeedView.tsx');

const headerStart = post.indexOf('<header');
const headerEnd = post.indexOf('</header>');
const header = post.slice(headerStart, headerEnd);

section('1. The top of a post');
check(/\{primaryTaggedUser \? \(\s*<div>\s*<div className="flex items-center gap-1\.5 flex-wrap">/.test(header), 'the name / @handle block is only drawn for a post with a co-author (its joint author line has no other place)');
check(/\) : \(post\.location \|\| post\.category\) \? \(\s*<div className="flex items-center gap-2 text-\[11px\] text-zinc-400">/.test(header), 'any other post shows only its place and category at the top, when it has them');
check(/\) : null\}/.test(header), 'and nothing else (the picture and the options button stay)');
const plainBranch = header.slice(header.indexOf(') : (post.location || post.category) ? ('));
check(!/post\.username|post\.displayName|VerifiedBadge|@\{/.test(plainBranch), 'the branch every ordinary post uses never mentions the username, display name, @handle or verified tick');
check(/onClick=\{\(\) => setShowFullscreenAvatar\(true\)\}/.test(header) && /id=\{`post-options-btn-\$\{post\.id\}`\}/.test(header), 'the picture and the options button are still in the header');

section('2. The name under the picture');
check(/<span onClick=\{\(\) => goToProfile\(post\.userId\)\} className="mr-1\.5 cursor-pointer">\s*<span className="font-bold text-white underline decoration-1 underline-offset-\[3px\] decoration-zinc-50\/70">\{post\.username\}<\/span>/.test(post), 'the username is there, underlined, and opens the profile');
check(/\{post\.isVerified && !primaryTaggedUser && <VerifiedBadge size="xs" className="ml-1 -mt-0\.5" \/>\}/.test(post), 'a verified account keeps its tick, now beside that name (a co-authored post keeps it in its header)');

section('3. The three-line menu');
check(/className="space-y-1 h-full overflow-y-auto overscroll-contain pb-\[max\(1rem,env\(safe-area-inset-bottom\)\)\] no-scrollbar"/.test(feed), 'the menu list has no scrollbar while it scrolls');
check(/\.no-scrollbar::-webkit-scrollbar \{\s*display: none;/.test(read('src/index.css')) && /scrollbar-width: none;/.test(read('src/index.css')), 'the rule that hides it works in Safari / Chrome and Firefox');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
