// Creating an account: the gender has three choices (Male, Female, Prefer not to say) and NONE is chosen until the person chooses.
// Usage: node scripts/supabase/test-signup-gender.mjs
import fs from 'node:fs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const auth = read('src/components/Auth/AuthView.tsx');
const oauth = read('src/components/Auth/CompleteOAuthProfile.tsx');

const list = (auth.match(/export const GENDER_OPTIONS = \[([\s\S]*?)\];/) || ['', ''])[1];
const ids = [...list.matchAll(/id: '([^']+)'/g)].map((m) => m[1]);
check(ids.join('|') === 'Male|Female|Prefer not to say', 'only Male, Female and Prefer not to say, in that order', ids.join('|'));
check(/const \[gender, setGender\] = useState\(''\);/.test(auth), 'the sign-up form starts with no gender chosen');
check(/const \[gender, setGender\] = useState\(''\);/.test(oauth), 'so does the details page after Google / Facebook');
check(/if \(!gender\) \{\s*\n\s*setErrorMessage\('Please choose your gender/.test(auth), 'sign-up will not go on until one is chosen');
check(/if \(!gender\) \{ setErrorMessage\('Please choose your gender/.test(oauth), 'nor will the details page');
check(/grid grid-cols-3 gap-1\.5/.test(auth), 'three buttons in one row');
check(!/useState\('Prefer not to say'\)/.test(auth) && !/useState\('Prefer not to say'\)/.test(oauth), '"Prefer not to say" is never chosen for anyone');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
