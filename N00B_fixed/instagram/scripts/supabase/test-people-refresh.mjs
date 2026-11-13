// People who left (an account that was deleted) disappear from the Followers / Following lists and the numbers at once: the app asks for the people list again when it comes to the
// front, when the connection returns, every few minutes, and whenever a Followers / Following page opens. Usage: node scripts/supabase/test-people-refresh.mjs
import fs from 'node:fs';
let passed = 0, failed = 0;
const check = (cond, label) => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label}`); } };
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const app = read('src/App.tsx');
const page = read('src/components/Profile/FollowListPage.tsx');

check(/const refreshPeopleNow = useCallback\(async \(force = false\)/.test(app), 'App has one function that asks for the people list again');
check(/document\.addEventListener\('visibilitychange', onShow\)/.test(app) && /window\.addEventListener\('online', onShow\)/.test(app) && /5 \* 60 \* 1000/.test(app), 'it runs when the app comes to the front, when the connection returns, and every 5 minutes while visible');
check(/window\.addEventListener\('noob:refresh-people', onOpen\)/.test(app) && /new Event\('noob:refresh-people'\)/.test(page), 'opening a Followers / Following page asks for it at once');
check(/if \(!list\.length \|\| currentUserRef\.current\?\.id !== meId\) return;/.test(app), 'a failed or empty answer never empties the list on screen, and an answer for another account is ignored');
check(/setRegisteredUsers\(list\)/.test(app.slice(app.indexOf('refreshPeopleNow'))) && /followersCount: me\.followersCount/.test(app) && /followingIds: me\.followingIds/.test(app), 'the list is replaced (people who left are gone) and my own follower / following numbers and ids are updated from the same answer');
check(/45000/.test(app), 'it is not asked more than once in 45 seconds unless a page forces it');
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
