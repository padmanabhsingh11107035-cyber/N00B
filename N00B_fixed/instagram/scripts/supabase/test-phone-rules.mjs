// A mobile number must have the right number of digits for the country picked on the sign-up form (src/utils/phoneRules.ts).
// Checks: every country the form offers has a rule, each rule's lengths, what the box keeps while typing/pasting, and the error sentence.
// Usage: node scripts/supabase/test-phone-rules.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const P = await import(pathToFileURL(path.resolve('src/utils/phoneRules.ts')).href);

section('1. Every country on the sign-up form has its own rule');
const auth = read('src/components/Auth/AuthView.tsx');
const labels = [...auth.matchAll(/fullLabel: '([^']+)'/g)].map((m) => m[1]);
check(labels.length === 21, 'the form offers 21 countries', String(labels.length));
for (const l of labels) {
  const r = P.phoneRuleFor(l);
  check(r.dial && r.min >= 8 && r.max <= 12 && r.min <= r.max && !(r.min === 7 && r.max === 15), `${l}: ${P.phoneLengthText(r)}`);
}

section('2. Exact lengths');
const lab = (n) => labels.find((l) => l.includes(`(+${n})`));
for (const [dial, digits] of [['91', 10], ['1', 10], ['44', 10], ['61', 9], ['33', 9], ['81', 10], ['55', 11], ['971', 9], ['65', 8], ['27', 9], ['34', 9], ['7', 10], ['52', 10], ['234', 10], ['966', 9]]) {
  const good = '9'.repeat(digits), short = '9'.repeat(digits - 1), long = '9'.repeat(digits + 1);
  check(P.phoneProblem(good, lab(dial)) === null && P.phoneProblem(short, lab(dial)) !== null && P.phoneProblem(long, lab(dial)) !== null, `+${dial}: ${digits} digits is accepted, ${digits - 1} and ${digits + 1} are not`);
}
section('3. Countries with more than one real length take a range');
for (const [dial, min, max] of [['49', 10, 11], ['64', 8, 10], ['39', 9, 10], ['82', 9, 10], ['62', 9, 12]]) {
  check(P.phoneProblem('9'.repeat(min), lab(dial)) === null && P.phoneProblem('9'.repeat(max), lab(dial)) === null && P.phoneProblem('9'.repeat(min - 1), lab(dial)) !== null && P.phoneProblem('9'.repeat(max + 1), lab(dial)) !== null, `+${dial}: ${min} to ${max} digits`);
}

section('4. What the box keeps');
const IN = P.phoneRuleFor('🇮🇳 India (+91)');
check(P.cleanPhoneInput('98240 04927', IN) === '9824004927', 'spaces are removed');
check(P.cleanPhoneInput('98-24a00(49)27', IN) === '9824004927', 'letters and signs are removed');
check(P.cleanPhoneInput('+91 98240 04927', IN) === '9824004927', 'a pasted +91 is dropped');
check(P.cleanPhoneInput('098240 04927', IN) === '9824004927', 'a leading 0 is dropped when the number is too long');
check(P.cleanPhoneInput('9124004927', IN) === '9124004927', 'a real number that starts with 91 is left alone');
check(P.cleanPhoneInput('98240049271234', IN) === '9824004927', 'extra digits are cut');
check(P.cleanPhoneInput('', IN) === '' && P.cleanPhoneInput(null, IN) === '', 'empty stays empty');
check(P.cleanPhoneInput('+971 50 123 4567', P.phoneRuleFor('🇦🇪 UAE (+971)')) === '501234567', 'a pasted +971 number keeps its 9 digits');

section('5. The sentence shown');
const msg = P.phoneProblem('12345', '🇮🇳 India (+91)');
check(/India/.test(msg) && /exactly 10 digits/.test(msg) && /You entered 5/.test(msg), 'India, 5 digits typed', msg);
check(/Germany/.test(P.phoneProblem('1', lab('49'))) && /10 or 11 digits/.test(P.phoneProblem('1', lab('49'))), 'Germany names its range');
check(P.phoneProblem('9824004927', '🇮🇳 India (+91)') === null, 'a right number gives no message');

section('6. Both sign-up forms use it');
const oauth = read('src/components/Auth/CompleteOAuthProfile.tsx');
check(/phoneProblem\(mobileNumber, countryCode\)/.test(auth) && /phoneProblem\(mobileNumber, countryCode\)/.test(oauth), 'both forms refuse a wrong length when you tap Create / Continue');
check(/cleanPhoneInput\(e\.target\.value, phoneRuleFor\(countryCode\)\)/.test(auth) && /cleanPhoneInput\(e\.target\.value, phoneRuleFor\(countryCode\)\)/.test(oauth), 'both boxes keep only digits and the right length while typing');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
