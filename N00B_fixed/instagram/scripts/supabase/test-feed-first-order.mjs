// The first post of Home does not flash when the app opens: the order of the first posts is made once (in the render that first has them) and the effect keeps that same order;
// an older page that waits for its place is shown at the END, never at the front. Usage: node scripts/supabase/test-feed-first-order.mjs
import fs from 'node:fs';
let passed = 0, failed = 0;
const check = (cond, label) => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label}`); } };
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const f = read('src/components/Feed/FeedView.tsx');

check(/const firstOrderRef = useRef<string\[\] \| null>\(null\);/.test(f) && /else if \(posts\.length > 0 && !firstOrderRef\.current\) firstOrderRef\.current = buildFeedOrder\(posts, currentUser\.id\);/.test(f), 'the first order is made once, in the render that first has posts');
check(/prev\.length === 0 && firstOrderRef\.current \? firstOrderRef\.current/.test(f), 'the effect keeps that very order instead of making a second one');
check(/const shownOrder = feedOrder\.length === 0 && firstOrderRef\.current \? firstOrderRef\.current : feedOrder;/.test(f), 'the render uses the first order while the saved order is still empty');
check(/const notYetEnd = notYetOrdered\.filter\(\(p\) => appendedPostIds\?\.has\(p\.id\)\);/.test(f) && /\[\.\.\.notYetFront, \.\.\.orderedPosts, \.\.\.notYetEnd\]/.test(f), 'an older page that waits for its place goes to the end, only new posts wait at the front');
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
