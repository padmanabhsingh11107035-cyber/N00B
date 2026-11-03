// App icon for NOOB Pro members: the rule (the Pro icon only while a plan that chose it runs; it goes back by itself when the plan ends), the settings page, and the Android pieces that really
// change the icon on the home screen (built by the Android workflow). Usage: node --liftoff-only scripts/supabase/test-app-icon.mjs
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
let passed = 0, failed = 0;
const check = (c, l, d = '') => { if (c) { passed++; console.log(`  ok   ${l}`); } else { failed++; console.log(`  FAIL ${l} ${d}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split('\r').join('');
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const A = await import('../../src/utils/appIcon.ts');

section('1. The rule');
check(A.getIconChoice() === 'default', 'the normal icon until a choice is made');
check(A.wantedIcon('plus', 'pro') === 'pro' && A.wantedIcon('elite', 'pro') === 'pro', 'a running plan that chose the Pro icon shows it (any plan)');
check(A.wantedIcon(undefined, 'pro') === 'default' && A.wantedIcon(null, 'pro') === 'default' && A.wantedIcon('', 'pro') === 'default', 'when the plan ends, the normal icon comes back, whatever was chosen');
check(A.wantedIcon('plus', 'default') === 'default', 'a member who keeps the normal icon keeps it');
A.setIconChoice('pro');
check(A.getIconChoice() === 'pro' && A.wantedIcon('plus') === 'pro' && A.wantedIcon(undefined) === 'default', 'the choice is kept on the phone; a renewed plan shows the Pro icon again without asking');
check(A.canChangeHomeIcon() === false, 'a website or installed web app can not change its home screen icon (only the Android app can)');

section('2. The settings page');
const page = read('src/components/Settings/pages/appicon.tsx'), reg = read('src/components/Settings/registry.ts'), app = read('src/App.tsx');
check(/const isPro = !!ctx\.currentUser\.proTier/.test(page) && /if \(!isPro && id === 'pro'\) return;/.test(page) && /disabled=\{locked\}/.test(page), 'the Pro icon can only be chosen with a NOOB Pro plan');
check(/Get NOOB Pro/.test(page) && /ctx\.actions\.openPro/.test(page) && /can\\u2019t change its own icon|can.t change its own icon/.test(page), 'without a plan it points to NOOB Pro, and it says honestly where the icon can really change');
check(/id: 'app-icon'/.test(reg) && /'app-icon': AppIconPage/.test(read('src/components/Settings/pages/index.tsx')), 'it is a row in Settings and activity (profile, three dots)');
check(/applyAppIcon\(currentUser\.proTier\)/.test(app) && /\[currentUser\?\.proTier\]/.test(app), 'the app checks the plan at every start and whenever it changes');
check(fs.existsSync('public/app-icons/default.png') && fs.existsSync('public/app-icons/pro.png'), 'both icons are there (public/app-icons/pro.png is the one to replace with the final logo)');

section('3. The Android app');
const wf = read('../../.github/workflows/android-build.yml'), java = read('android-overrides/AppIconPlugin.java'), main = read('android-overrides/MainActivity.java'), py = read('android-overrides/add-icon-aliases.py');
check(/@CapacitorPlugin\(name = "AppIcon"\)/.test(java) && /com\.noob\.social\.IconDefault/.test(java) && /com\.noob\.social\.IconPro/.test(java) && /COMPONENT_ENABLED_STATE_DISABLED/.test(java) && /DONT_KILL_APP/.test(java), 'the plugin turns one launcher entry on and the other off, without closing the app');
check(/registerPlugin\(AppIconPlugin\.class\);\s*super\.onCreate/.test(main), 'it is registered before the app starts');
check(/add-icon-aliases\.py/.test(wf) && /AppIconPlugin\.java/.test(wf) && /grep -q 'IconPro'/.test(wf) && /grep -q 'IconDefault'/.test(wf), 'the Android build adds the plugin and the two entries, and stops if they did not get in');
check(['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'].every((d) => fs.existsSync(`android-overrides/icons/mipmap-${d}/ic_launcher_pro.png`) && fs.existsSync(`android-overrides/icons/mipmap-${d}/ic_launcher_pro_round.png`)), 'the Pro icon exists in every size');
const sample = `<manifest><application><activity android:name=".MainActivity"><intent-filter><action android:name="android.intent.action.MAIN" /><category android:name="android.intent.category.LAUNCHER" /></intent-filter></activity></application></manifest>`;
fs.writeFileSync('android-overrides/.sample-manifest.xml', sample);
let out = '';
try { execFileSync('python', ['-I', 'android-overrides/add-icon-aliases.py', 'android-overrides/.sample-manifest.xml']); out = fs.readFileSync('android-overrides/.sample-manifest.xml', 'utf8'); } catch (e) { out = 'ERR ' + e.message; }
fs.rmSync('android-overrides/.sample-manifest.xml', { force: true });
check((out.match(/android.intent.category.LAUNCHER/g) || []).length === 2 && /android:name="\.IconDefault"[^>]*android:enabled="true"/.test(out) && /android:name="\.IconPro"[^>]*android:enabled="false"/.test(out) && /ic_launcher_pro_round/.test(out), 'the manifest script leaves exactly two launcher entries: the normal one on, the Pro one off');
let refused = false; try { execFileSync('python', ['-I', 'android-overrides/add-icon-aliases.py', 'android-overrides/README.md'], { stdio: 'pipe' }); } catch { refused = true; }
check(refused && /sys\.exit/.test(py), 'a manifest without a single launcher entry is refused (a build can never ship without a launcher)');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
