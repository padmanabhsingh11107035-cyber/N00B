// The "A new NOOB is ready" box of the Android app: it takes people straight into the Google Play app.
// Usage: node --liftoff-only scripts/supabase/test-update-box.mjs
import fs from 'node:fs';

let passed = 0, failed = 0;
const check = (cond, label) => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label}`); } };
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');

const gate = read('src/components/Common/AppUpdateGate.tsx'), main = read('src/main.tsx');
const cfg = JSON.parse(read('public/app-version.json'));
check(/<AppUpdateGate \/>/.test(main), 'the box is mounted when the app starts');
check(/PLAY_APP_URL = 'market:\/\/details\?id=com\.noob\.social'/.test(gate) && /window\.location\.href = PLAY_APP_URL/.test(gate), 'Update opens the Google Play app straight on NOOB\'s page');
check(/document\.visibilityState !== 'visible'\) return;/.test(gate) && /Browser\.open\(\{ url: PLAY_URL \}\)/.test(gate), 'only if the phone did not leave NOOB, the same page opens on the web (no dead button)');
check(/mine < latest/.test(gate) && /Later/.test(gate) && /DAY/.test(gate), 'an older app gets the box with Update and Later; Later asks again the next day');
check(/mine < min/.test(gate) && /Update NOOB to continue/.test(gate), 'an app older than the minimum is stopped with a full-screen Update');
check(/isNativeApp\(\)/.test(gate) && /catch \{ \/\* offline or no file: nobody is blocked \*\/ \}/.test(gate), 'the website shows nothing, and a failed check never blocks anybody');
check(Number.isFinite(cfg?.android?.latestBuild) && cfg.android.latestBuild >= 305 && cfg.android.minBuild < cfg.android.latestBuild, 'the newest build number is 305 or more (an older app is asked to update), nobody is forced');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
