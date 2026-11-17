// "NOOB keeps stopping" on Android: asking the phone-notification plugin to register in a build WITHOUT Firebase stops the whole app. The web app must ask first.
import fs from 'node:fs';
let passed = 0, failed = 0;
const check = (cond, label) => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label}`); } };
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const push = read('src/services/pushNotifications.ts'), java = read('android-overrides/PushGuardPlugin.java'), main = read('android-overrides/MainActivity.java'), wf = read('../../.github/workflows/android-build.yml');
check(/FIREBASE_FROM_BUILD = 281;/.test(push), 'builds before 281 (some made without Firebase) never register');
check(/registerPlugin<\{ hasFirebase[\s\S]*?\('PushGuard'\)/.test(push) && /\.value === true/.test(push) && /catch \{\s*return false;/.test(push), 'newer builds register only when the native check says Firebase is inside (a missing check also means no)');
check((push.match(/await buildOk\(\)/g) || []).length >= 4 && !/PushNotifications\.register\(\);[\s\S]{0,40}buildOk/.test(push), 'every register / unregister path goes through that check');
check(/@CapacitorPlugin\(name = "PushGuard"\)/.test(java) && /FirebaseApp/.test(java) && /catch \(Throwable/.test(java), 'the native check exists and can not itself fail the app');
check(/registerPlugin\(PushGuardPlugin\.class\)/.test(main) && /cp android-overrides\/PushGuardPlugin\.java/.test(wf), 'the build copies and registers it');
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
