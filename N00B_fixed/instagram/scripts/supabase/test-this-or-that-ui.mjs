// This or That, the app side (the database side is tested on a real Postgres in test-this-or-that.mjs): what the page shows, how it votes, what a visitor sees, and what the
// managers can do. (The page was also tried in a real browser: voting, the results, the earlier questions, adding and removing, a phone width and Light mode.)
// Usage: node scripts/supabase/test-this-or-that-ui.mjs
import fs from 'node:fs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const page = read('src/components/Fun/ThisOrThatPage.tsx');
const api = read('src/services/supabaseApi.ts');
const apiIndex = read('src/services/api.ts');

section('1. The question card');
check(/<Choice side="a"/.test(page) && /<Choice side="b"/.test(page) && />OR<\/span>/.test(page), 'two large choices with OR between them');
check(/Today's question/.test(page) && /Latest question/.test(page) && /Previous questions/.test(page), 'today\'s question and the previous questions are separate sections');
check(/min-h-\[176px\]/.test(page) && /active:scale-\[0\.96\]/.test(page) && /hover:-translate-y-0\.5/.test(page), 'the choices are big, and react to a touch and a hover');
check(/\{emoji \|\| '.'\}/.test(page) && /text-5xl/.test(page), 'each choice shows its emoji large');

section('2. Voting and the results');
check(/disabled=\{disabled \|\| voted\}/.test(page) && /aria-pressed=\{mine\}/.test(page), 'once voted, the choices can not be pressed again, and the picked one is marked');
check(/replaceQuestion\(await voteTotQuestion\(q\.id, choice\)\)/.test(page), 'the numbers shown are the ones the database sends back with the vote, never worked out here');
check(/if \(!loggedIn\) \{ say\('Log in to vote\.', 'err'\); onLogin\?\.\(\); return; \}/.test(page), 'a visitor is asked to log in instead of voting');
check(/already voted/.test(page) && /void load\('quiet'\)/.test(page), 'if the database says the vote was already made (another screen), the page shows the real state');
check(/const split = \(a: number, total: number\): \[number, number\] =>[\s\S]{0,200}return \[pa, 100 - pa\];/.test(page), 'the two percentages always add up to 100');
check(/plural\(count, 'vote', 'votes'\)/.test(page) && /in total/.test(page), 'the number of votes for each side and the total are shown');
check(/transition-\[height\] duration-700 ease-out/.test(page) && /setTimeout\(\(\) => setRevealed\(true\), 40\)/.test(page), 'the result bars grow smoothly after voting');
check(/aria-live="polite"/.test(page) && /aria-label=\{voted \? `\$\{label\}: \$\{pct\}%/.test(page), 'the result is announced to screen readers');
check(!/setInterval\(\(\) => \{ if \(document\.visibilityState/.test(page) && !/RefreshCw|aria-label="Refresh"/.test(page), 'nothing reloads this page by itself or on request (no timer, no refresh button): only Home refreshes');

section('3. Earlier questions');
check(/fetchTotPrevious\(\{ limit: PAGE_SIZE, before: \{ day: last\.day, seq: last\.seq \} \}\)/.test(page) && /Load more/.test(page), 'earlier questions load a page at a time');
check(/const seen = new Set\(list\.map\(\(x\) => x\.id\)\)/.test(page), 'a question is never shown twice');
check(/<QuestionCard key=\{q\.id\} q=\{q\} pending=\{pending\}/.test(page), 'an earlier question can still be voted on');

section('4. Managers');
check(/fetchFunCanManage\(\)/.test(page) && /\{canManage && \(/.test(page), 'the add / remove tools are drawn only for someone the database says may manage');
check(/createTotQuestion\(\{ optionA: form\.optionA, optionB: form\.optionB, emojiA: form\.emojiA, emojiB: form\.emojiB, publishOn: form\.day \|\| undefined \}\)/.test(page) && /maxLength=\{40\}/.test(page) && /maxLength=\{8\}/.test(page), 'a question has two choices (40 characters), two emojis and an optional day');
check(/if \(armed !== q\.id\) \{/.test(page) && /Tap again/.test(page), 'removing needs a second tap');
check(/Coming up \(\{upcoming\.length\}\)/.test(page), 'managers see what is scheduled for the coming days');

section('5. States and safety');
check(/<SkeletonCards count=\{2\}/.test(page) && /<ErrorState/.test(page) && /No question yet/.test(page), 'loading placeholders, an error with "Try again", and an empty state');
check(/useToast/.test(page) && /Your vote is in!/.test(page), 'success and error notices');
check(!/dangerouslySetInnerHTML|innerHTML/.test(page), 'a choice is always drawn as text');
check(!/localStorage|sessionStorage/.test(page), 'nothing about a vote is kept in the browser: the database is the only record');
check(/navigator\.share/.test(page) && /clipboard\.writeText/.test(page) && /funShareUrl\(\{ feature: 'this-or-that' \}\)/.test(page), 'it can be shared (the phone\'s share sheet, or the link is copied)');

section('6. The API');
check(/rpc<TotQuestion \| null>\('tot_today'\)/.test(api) && /'tot_previous', \{ p_limit: opts\.limit \?\? 10, p_before_day: opts\.before\?\.day \?\? null, p_before_seq: opts\.before\?\.seq \?\? null \}/.test(api), 'reading goes through the database functions');
check(/'tot_vote', \{ p_question: questionId, p_choice: choice \}/.test(api) && !/\.from\('tot_/.test(api), 'a vote sends only the question and the side; the tables are never touched directly');
check(/'tot_admin_create'/.test(api) && /'tot_admin_remove'/.test(api) && /'tot_admin_list'/.test(api) && /'fun_can_manage'/.test(api), 'the manager calls exist');
check(/fetchTotToday,\s*fetchTotPrevious,\s*voteTotQuestion/.test(apiIndex) && /TotResults,\s*TotQuestion,\s*TotPage/.test(apiIndex), 'the API index exports them');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
