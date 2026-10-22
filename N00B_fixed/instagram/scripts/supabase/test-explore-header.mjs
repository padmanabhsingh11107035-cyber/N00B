// The top of the Explore page on a phone: the search line says something that fits, and the three tabs (Post, Suggested, Reel) always fit the width, show their whole word and
// never slide sideways under a finger. Usage: node scripts/supabase/test-explore-header.mjs
import fs from 'node:fs';

let passed = 0, failed = 0;
const check = (cond, label) => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label}`); } };
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const src = read('src/components/Explore/ExploreView.tsx');

check(/placeholder="Search anything"/.test(src) && /aria-label="Search people, handles, bios, posts and reels"/.test(src), 'the search line is short enough to read in full ("Search anything"); the long description stays for screen readers');
check(!/Search registered people, handles, bios/.test(src.split('placeholder=')[1].slice(0, 80)), 'the long placeholder that was cut off ("Search registered peop") is gone');
const tabs = (src.match(/data-testid="explore-tabs">\s*<div className="([^"]*)"/) || [])[1] || '';
check(/\bgrid\b/.test(tabs) && /grid-cols-\[1fr_1\.4fr_1fr\]/.test(tabs) && /\bw-full\b/.test(tabs), 'the three tabs share the width of the screen (the middle one a little wider)');
check(!/data-testid="explore-tabs"/.test(src.slice(src.indexOf('data-testid="explore-tabs"') - 160, src.indexOf('data-testid="explore-tabs"'))) || !/overflow-x-auto/.test(src.slice(src.indexOf('data-testid="explore-tabs"') - 160, src.indexOf('data-testid="explore-tabs"') + 400)), 'the row of tabs is not a sideways scroller any more, so it stays still when touched');
check(!/shrink-0 w-max min-w-full/.test(src), 'and it is not wider than the screen');
check((src.match(/min-w-0 justify-center whitespace-nowrap px-1\.5 py-1\.5/g) || []).length === 3, 'each tab may shrink to its column');
check(/<span className="truncate">Post<\/span>/.test(src) && /<span className="truncate">Suggested<\/span>/.test(src) && /<span className="truncate">Reel<\/span>/.test(src), 'the words are short: Post, Suggested, Reel (the old "Suggested users for u" did not fit)');
check(!/Suggested users for u/.test(src), 'and the cut-off wording is gone');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
