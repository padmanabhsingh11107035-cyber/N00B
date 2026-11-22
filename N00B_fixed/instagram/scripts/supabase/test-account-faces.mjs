// "Switch account": every saved account shows its current profile picture and name (it used to be only a letter in a circle). Usage: node scripts/supabase/test-account-faces.mjs
import fs from 'node:fs';

let passed = 0, failed = 0;
const check = (cond, label) => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label}`); } };
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const m = read('src/components/Modals/SwitchAccountModal.tsx');

check(/const AccountFace: React\.FC<\{ avatar\?: string; username: string; size\?: number \}>/.test(m) && /<img src=\{avatar\} alt="" style=\{box\} className="rounded-full object-cover/.test(m) && /size = 40/.test(m), 'a round profile picture (40 px, bigger on the page)');
check(/onError=\{\(\) => setBroken\(true\)\}/.test(m) && /\{username\.slice\(0, 1\)\.toUpperCase\(\)\}/.test(m), 'with the first letter as the fallback: while there is no picture, or when it cannot be loaded');
check(/<AccountFace avatar=\{cardOf\(a\.id\)\?\.avatar\} username=\{a\.username\} size=\{48\} \/>/.test(m) && /<AccountFace avatar=\{l\.avatar\} username=\{l\.username\} size=\{48\} \/>/.test(m), 'used for the saved accounts and for "your other accounts"');
check(/a\.id === currentId \? fetchCurrentUser\(\) : fetchUserById\(a\.id\)/.test(m), 'the picture and name are asked for when the sheet opens: this account\'s own profile, the others\' public profile');
check(/\.then\(\(u\) => put\(a\.id, u\)\)\.catch\(\(\) => undefined\)/.test(m), 'each one is shown as soon as it arrives, and a failure changes nothing');
check(/const CARDS_KEY = 'noob\.accountCards\.v1';/.test(m) && /useState<Record<string, AccountCard>>\(readCards\)/.test(m) && /writeCards\(next\)/.test(m), 'the last answer is kept on this device, so next time the pictures are there at once and are refreshed');
check(/linked\.find\(\(x\) => x\.id === id\)/.test(m), '"your other accounts" can fill in a picture too');
check(/const nameOf = /.test(m) && /n !== username/.test(m), 'the name is shown next to the user name (not repeated when it is the same)');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
