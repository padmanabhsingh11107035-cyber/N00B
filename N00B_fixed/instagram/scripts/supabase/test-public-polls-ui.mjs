// Public Polls, the app side (the database side is tested on a real Postgres in test-public-polls.mjs): the poll card, voting, the three results rules, creating, sharing as a link /
// Story / Post, reporting, removing, the lists, and a poll opened from a shared link. (Tried in a real browser too: voting, hidden and shown results, creating, the share panel,
// reporting, a poll opened from its link, and the visitor's view.) Usage: node scripts/supabase/test-public-polls-ui.mjs
import fs from 'node:fs';
import { percents } from '../../src/utils/pollMath.ts';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const page = read('src/components/Fun/PollsPage.tsx');
const api = read('src/services/supabaseApi.ts');
const apiIndex = read('src/services/api.ts');


section('1. The arithmetic');
check(percents([31, 24, 9, 5]).join() === '45,35,13,7' && percents([31, 24, 9, 5]).reduce((a, b) => a + b, 0) === 100, 'percentages add up to exactly 100 (largest remainder)', percents([31, 24, 9, 5]).join());
check(percents([1, 1, 1]).reduce((a, b) => a + b, 0) === 100 && percents([1, 1, 1]).join() === '34,33,33', 'three equal votes: 34, 33, 33');
check(percents([0, 0]).join() === '0,0' && percents([5]).join() === '100' && percents([2, 1]).join() === '67,33', 'no votes, one option, and 2:1 behave');

section('2. The poll card');
check(/role=\{interactive \? 'radiogroup' : undefined\}/.test(page) && /role="radio" aria-checked=\{on\}/.test(page), 'options are radio buttons while you can still vote');
check(/votePoll\(poll\.id, picked\)/.test(page) && /disabled=\{!picked \|\| voting\}/.test(page), 'you pick an option, then press Vote (a vote is final, so it is a deliberate second step)');
check(/if \(!loggedIn\) \{ say\('Log in to vote\.', 'err'\); onLogin\?\.\(\); return; \}/.test(page) && /Log in to vote/.test(page), 'a visitor can look and pick, and is asked to log in to vote');
check(/onChanged\(await votePoll\(poll\.id, picked\)\)/.test(page), 'the numbers shown are the ones the database sends back with the vote, never worked out here');
check(/already voted\|ended\|not available/.test(page) && /fetchPoll\(poll\.id\)/.test(page), 'if the database says the vote was already made or the poll ended, the page shows the real state');
check(/poll\.resultsShown && \(/.test(page) && /transition-\[width\] duration-700 ease-out/.test(page), 'result bars appear only when the database says the results may be shown, and grow smoothly');
check(/The results appear after you vote\./.test(page) && /The results appear when the poll ends\./.test(page) && /Your vote is in\. The results appear when the poll ends\./.test(page), 'a poll whose results are hidden says when they will appear');
check(/plural\(poll\.totalVotes, 'vote', 'votes'\)/.test(page) && /plural\(counts\[i\], 'vote', 'votes'\)/.test(page), 'the number of votes for each option and the total are shown');
check(/timeLeftLabel\(poll\.endsAt, now\)/.test(page) && /setInterval\(\(\) => setNow\(Date\.now\(\)\), 30_000\)/.test(page), 'the time left is shown and counts down');
check(/Completed ·/.test(page) && /Expired · no votes/.test(page) && /Hidden for review/.test(page), 'active, completed, expired and hidden polls are told apart');
check(/aria-label=\{poll\.resultsShown \? `\$\{o\.label\}: \$\{pcts\[i\]\}%/.test(page) && /aria-live="polite"/.test(page), 'results are announced to screen readers');

section('3. Creating a poll');
check(/Create poll/.test(page) && /POLL_QUESTION_MAX/.test(page) && /POLL_MAX_OPTIONS/.test(page) && /Add an option/.test(page), 'a form with a question, 2 to 8 options, and a way to add and remove them');
check(/DURATIONS = \[/.test(page) && /43200/.test(page) && /'1 hour'/.test(page) && /'30 days'/.test(page), 'a time limit from 1 hour to 30 days');
check(/RESULT_RULES/.test(page) && /'after_vote'/.test(page) && /'always'/.test(page) && /'after_end'/.test(page), 'the creator chooses when the results are shown');
check(/disabled=\{!ready\}/.test(page) && /question\.trim\(\)\.length >= 5 && filled\.length >= 2/.test(page), 'the button is off until there is a question and two options');
check(/createPoll\(\{ question, options: filled, durationMinutes: minutes, results \}\)/.test(page) && /Your poll is live!/.test(page), 'it creates the poll through the database, and says so');
check(/Everyone sees your name on it, but nobody sees who voted for what\./.test(page), 'it says what is public and what is not');

section('4. Sharing, reporting and removing');
check(/shareCardAsStory\(spec\)/.test(page) && /shareCardAsPost\(spec, /.test(page) && /Add to my Story/.test(page) && /Post on my profile/.test(page), 'a poll can be shared as a Story and as a Post');
check(/navigator\.share/.test(page) && /clipboard\.writeText\(link\)/.test(page) && /funShareUrl\(\{ feature: 'polls', target: poll\.id \}\)/.test(page), 'and as a link: the phone\'s share sheet, or copied');
check(/reportPoll\(poll\.id, reason\)/.test(page) && /REPORT_REASONS/.test(page) && /if \(r\.hidden\) onRemoved\(poll\.id\)/.test(page), 'a poll can be reported with a reason (and leaves the list if it was hidden by that report)');
check(/\{!poll\.isMine && <button/.test(page), 'you do not see a Report button on your own poll');
check(/const canRemove = poll\.isMine \|\| canManage/.test(page) && /if \(!armed\)/.test(page) && /Tap again/.test(page), 'the creator or a manager can remove a poll, with a second tap');
check(/fetchFunCanManage\(\)/.test(page) && /fetchPollReports\(\)/.test(page) && /This poll is fine: clear the reports/.test(page), 'managers see reported polls, why, and can clear the reports');

section('5. The lists');
check(/'active'/.test(page) && /'ended'/.test(page) && /'mine'/.test(page) && /Active<\/button>/.test(page) && /Ended<\/button>/.test(page) && /My polls<\/button>/.test(page), 'Active, Ended and My polls');
check(/fetchPolls\(\{ tab, limit: PAGE_SIZE, before: \{ time: last\.endsAt, seq: last\.seq \} \}\)/.test(page) && /Load more/.test(page), 'a page at a time');
check(!/REFRESH_MS/.test(page) && !/setInterval\(\(\) => \{ if \(document\.visibilityState/.test(page), 'nothing reloads the poll pages by themselves: a vote brings the numbers back at once, and the page is fresh when opened (only Home refreshes)');
check(/<SkeletonCards/.test(page) && /<ErrorState/.test(page) && /<EmptyState/.test(page), 'loading placeholders, an error with "Try again", and empty states');
check(/target\) \{\s*return \(/.test(page) && /fetchPoll\(target\)/.test(page) && /This poll is not available/.test(page) && /All polls/.test(page), 'a poll opened from its link (/polls/<id>) shows that one poll, or says it is not available');

section('6. Safety');
check(!/dangerouslySetInnerHTML|innerHTML/.test(page), 'a question or an option is always drawn as text');
check(!/localStorage|sessionStorage/.test(page), 'no vote is kept in the browser: the database is the only record');
check(!/voters|voterId|whoVoted/i.test(page), 'nothing on the page knows who voted');

section('7. The API');
check(/'poll_vote', \{ p_poll: pollId, p_option: optionId \}/.test(api) && /'poll_create'/.test(api) && /'poll_list'/.test(api) && /'poll_report'/.test(api) && /'poll_remove'/.test(api) && !/\.from\('poll_/.test(api), 'every call goes through a database function; the tables are never touched directly');
check(/createPoll,\s*votePoll,\s*removePoll,\s*reportPoll/.test(apiIndex) && /Poll,\s*PollOption,\s*PollCreator/.test(apiIndex), 'the API index exports them');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
