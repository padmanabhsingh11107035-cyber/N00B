// Names and other texts that ran off the screen. On a profile, "Followed by @noob.auditor and @rid_..." was cut at the screen edge (the button around it sized itself to the text, so the
// text could not shrink); the same kind of mistake is fixed in the other places that showed a name next to buttons (Ask card, post header, story header, new chat list, leaderboard, support bar).
// The fix was measured in a browser at phone width (390 px): the line ended 104 px past the card before, and ends inside it now (wrapping to two lines). scripts/lint-text-fit.mjs finds the mistake
// everywhere in src/ and must report nothing.
// Usage: node scripts/supabase/test-text-fit.mjs
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');

section('1. The "Followed by" line on a profile');
const pv = read('src/components/Profile/ProfileView.tsx');
const line = /<button\s+onClick=\{\(\) => setShowMutualFollowersSheet\(true\)\}\s+className="([^"]*)"\s+data-testid="mutual-followers-line"[\s\S]*?<p className="([^"]*)">\s*Followed by/.exec(pv);
check(!!line, 'the line is found');
check(/max-w-full/.test(line?.[1] || '') && /min-w-0/.test(line?.[1] || ''), 'its button can not grow wider than the card (max-w-full min-w-0)', line?.[1]);
check(/min-w-0/.test(line?.[2] || '') && /break-words/.test(line?.[2] || '') && !/truncate/.test(line?.[2] || ''), 'the text wraps onto a second line instead of running off the screen', line?.[2]);
check(/<span className="text-xs text-zinc-400 font-medium truncate min-w-0">@\{targetUser\.username\}<\/span>/.test(pv), 'the @username in the bar above a profile shrinks instead of pushing the bar wider');
check(/<h2 className="[^"]*min-w-0 break-words \[overflow-wrap:anywhere\]">\{targetUser\.displayName \|\| targetUser\.username\}<\/h2>/.test(pv), 'a long display name beside the picture wraps');

section('2. The Ask card, the post header, the story header');
const fun = read('src/components/Profile/ProfileFunCards.tsx');
check(/line-clamp-2[^"]*">Ask \{name\} anything/.test(fun) && !/truncate">Ask \{name\} anything/.test(fun), 'the Ask card shows the whole name on up to two lines (it was cut to "Ask Vansh Varan...")');
const post = read('src/components/Feed/PostCard.tsx');
check(/<div className="flex items-center gap-2\.5 min-w-0">\s*\{\/\* Dual Overlapping Avatars Container \*\/\}/.test(post) && /<div className="min-w-0">\s*<div className="flex items-center gap-1\.5 flex-wrap">/.test(post), 'the name block of a post can shrink');
check(/<div className="relative shrink-0 ml-2">\s*<button\s+id=\{`post-options-btn-/.test(post), 'the three dots of a post stay on screen');
const sv = read('src/components/Stories/StoryViewerModal.tsx');
check(/text-sm font-semibold text-white tracking-tight truncate">\{story\.username\}/.test(sv) && /flex items-center gap-2 shrink-0 ml-2">\s*<button\s+onClick=\{\(\) => setIsMuted/.test(sv), 'a long username in a story shrinks and the sound / close buttons stay on screen');

section('3. Lists with a button on the right');
const chat = read('src/components/Chat/ChatView.tsx');
check(/<span className="truncate">\{u\.displayName \|\| u\.username\}<\/span>/.test(chat) && /className="shrink-0 ml-2 px-3\.5 py-1\.5 bg-noob\/15/.test(chat), 'new chat list: the name shrinks, the Chat button stays');
const games = read('src/components/Games/GamesView.tsx');
check(/text-xs font-bold text-white truncate">\s*\{player\.displayName \|\| player\.username\}/.test(games) && /text-right shrink-0 ml-2/.test(games), 'leaderboard: the name shrinks, the points stay');
const supCss = read('src/components/Support/supportDesk.css');
check(/\.sd-title \{ min-width: 0; flex: 1;/.test(supCss) && /\.sd-title strong \{[^}]*overflow: hidden; text-overflow: ellipsis/.test(supCss) && /\.sd-row-tx \{ min-width: 0; flex: 1; \}/.test(supCss) && /\.sd-txn-tx \{ min-width: 0; flex: 1; \}/.test(supCss), 'support: the title of the bar, the topic rows and the payment rows shrink (...) and the buttons beside them stay');

section('4. The scan finds nothing left in src/');
let out = '';
try { out = execFileSync(process.execPath, ['scripts/lint-text-fit.mjs'], { encoding: 'utf8' }); } catch (e) { out = String(e.stdout || e.message); }
check(/^0 place\(s\)/m.test(out), 'no text that can not shrink is left (a truncating text inside a box that can not shrink)', out.split('\n').slice(0, 6).join(' | '));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
