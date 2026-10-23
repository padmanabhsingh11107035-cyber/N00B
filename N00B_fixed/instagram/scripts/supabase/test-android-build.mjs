// The Android app is built from scratch on GitHub (the generated android/ folder is not kept): every special thing about it must be written down in files that ARE kept. Usage: node scripts/supabase/test-android-build.mjs
import fs from 'node:fs';

let passed = 0, failed = 0;
const check = (cond, label) => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label}`); } };
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const wf = read('../../.github/workflows/android-build.yml');

check(/cp android-overrides\/MainActivity\.java/.test(wf) && /cp android-overrides\/AppUpdaterPlugin\.java/.test(wf), 'the secure window and the in-app updater are copied in');
check(/android\.permission\.REQUEST_INSTALL_PACKAGES/.test(wf) && /grep -q REQUEST_INSTALL_PACKAGES/.test(wf), 'the install permission is added and checked');
check(/android\.permission\.CAMERA/.test(wf) && /android\.permission\.RECORD_AUDIO/.test(wf) && /android\.hardware\.camera/.test(wf) && /android\.hardware\.microphone/.test(wf), 'camera and microphone permissions (and the two optional features) are added, so Go Live and Live Lounge work in the app');
check(/grep -q android\.permission\.CAMERA/.test(wf) && /grep -q android\.permission\.RECORD_AUDIO/.test(wf), 'a build that lost one of them fails instead of shipping without it');
check(/capacitor-assets generate --android --iconBackgroundColor '#000000'/.test(wf), 'the launcher icon has a black background (the logo is white on black)');
for (const f of ['MainActivity.java', 'AppUpdaterPlugin.java', 'debug.keystore', 'README.md']) check(fs.existsSync(`android-overrides/${f}`), `android-overrides/${f} is kept`);
for (const f of ['capacitor.config.json', 'resources/icon.png', 'resources/splash.png']) check(fs.existsSync(f), `${f} is kept`);
const cfg = JSON.parse(read('capacitor.config.json'));
check(cfg.appId === 'com.noob.social' && cfg.appName === 'NOOB', 'the app id and name come from capacitor.config.json');
const readme = read('android-overrides/README.md');
check(/CAMERA/.test(readme) && /RECORD_AUDIO/.test(readme) && /Native parts/.test(readme), 'the notes list what the workflow adds');
check(/\.claude\/\*\n!\.claude\/launch\.json/.test(read('.gitignore')) && /\.claude\/\*\n!\.claude\/launch\.json/.test(read('../../.gitignore')), 'the preview shortcuts are shared, personal tool settings stay private');
check(fs.existsSync('../../.claude/launch.json') && fs.existsSync('.claude/launch.json'), 'both preview shortcut files exist');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
