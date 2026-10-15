// A post keeps its display name (and verified tick) at the top and its @username only once, in front of the caption under the picture - the @username is no longer
// repeated under the name at the top. And the three-line menu scrolls without a scrollbar. Usage: node scripts/supabase/test-post-name-once.mjs
import fs from 'node:fs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const post = read('src/components/Feed/PostCard.tsx');
const feed = read('src/components/Feed/FeedView.tsx');
const css = read('src/index.css');

const header = post.slice(post.indexOf('<header'), post.indexOf('</header>'));

section('1. The top of a post');
check(/\{post\.displayName \|\| post\.username\}/.test(header) && /\{post\.isVerified && <VerifiedBadge size="sm" \/>\}/.test(header), 'the name and the verified tick are at the top, as they were');
check(!/@\{post\.username\}/.test(header), 'the @username is no longer repeated under the name');
check(/\{\(post\.location \|\| post\.category\) && \(\s*<div className="flex items-center gap-2 text-\[10px\] text-zinc-400">/.test(header), 'the line under the name is only drawn when there is a place or a category');
check(/\{post\.location && <span>•<\/span>\}/.test(header) && /\{post\.category\}/.test(header) && /\{post\.location\}/.test(header), 'place and category are still shown, separated by a dot only when both are there');
check(/@\{primaryTaggedUser\.username\}/.test(header), 'a co-authored post still shows its joint author line');
check(/onClick=\{\(\) => setShowFullscreenAvatar\(true\)\}/.test(header) && /id=\{`post-options-btn-\$\{post\.id\}`\}/.test(header), 'the picture and the options button are still in the header');

section('2. The username under the picture');
check(/<span onClick=\{\(\) => goToProfile\(post\.userId\)\} className="font-bold text-white mr-1\.5 cursor-pointer underline decoration-1 underline-offset-\[3px\] decoration-zinc-50\/70">\s*\{post\.username\}\s*<\/span>/.test(post), 'the username is in front of the caption, underlined, and opens the profile');
check((post.match(/@\{post\.username\}/g) || []).length === 0, 'nowhere in the card is the author\'s @username drawn a second time');

section('3. The three-line menu');
check(/className="space-y-1 h-full overflow-y-auto overscroll-contain pb-\[max\(1rem,env\(safe-area-inset-bottom\)\)\] no-scrollbar"/.test(feed), 'the menu list has no scrollbar while it scrolls');
check(/\.no-scrollbar::-webkit-scrollbar \{\s*display: none;/.test(css) && /scrollbar-width: none;/.test(css), 'the rule that hides it works in Safari / Chrome and Firefox');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
