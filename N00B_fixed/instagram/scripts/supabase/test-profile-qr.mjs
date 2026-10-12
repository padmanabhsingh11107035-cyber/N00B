// Tests what the QR Scanner page accepts: a NOOB profile QR code (a link with ?profile=name) or a bare @name; anything else is refused.
// Pure logic (src/utils/profileQr.ts): no database or browser needed.
//
// Usage: node scripts/supabase/test-profile-qr.mjs
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const { parseProfileQr } = await import(pathToFileURL(path.resolve('src/utils/profileQr.ts')).href);

check(parseProfileQr('https://nooob.xyz/?profile=ann') === 'ann', 'the profile link on nooob.xyz');
check(parseProfileQr('https://nooob.xyz/?profile=Ann.Lee_9') === 'ann.lee_9', 'dots and underscores are fine, and the name is lower-cased');
check(parseProfileQr('http://localhost:3000/?profile=bob&x=1') === 'bob', 'any address, other parameters ignored');
check(parseProfileQr('https://nooob.xyz/?profile=%40ann') === 'ann', 'a leading @ is dropped');
check(parseProfileQr('@ann') === 'ann', 'a bare @name');
check(parseProfileQr('  https://nooob.xyz/?profile=ann  ') === 'ann', 'spaces around it');
check(parseProfileQr('https://example.com/') === null && parseProfileQr('https://nooob.xyz/?post=123') === null, 'a link without a profile is refused');
check(parseProfileQr('hello') === null && parseProfileQr('ann') === null, 'plain text is refused (it could be anything)');
check(parseProfileQr('https://nooob.xyz/?profile=a b') === null && parseProfileQr('https://nooob.xyz/?profile=') === null, 'an invalid or empty name is refused');
check(parseProfileQr('https://nooob.xyz/?profile=' + 'a'.repeat(31)) === null, 'a name that is too long is refused');
check(parseProfileQr('') === null && parseProfileQr(null) === null && parseProfileQr(undefined) === null, 'nothing is refused, no crash');
check(parseProfileQr('x'.repeat(700)) === null, 'a huge code is refused');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
