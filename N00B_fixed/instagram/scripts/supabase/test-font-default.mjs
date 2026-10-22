// The app starts in the bold sans for everybody: "Serif text" is off by default, and on every device where it was on only because it used to be the default it is switched off
// once; whoever turns it on again afterwards keeps it. Usage: node scripts/supabase/test-font-default.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); }, removeItem: (k) => { store.delete(k); } };
const start = async (tag) => import(`${pathToFileURL(path.resolve('src/utils/devicePrefs.ts')).href}?${tag}`);

section('1. A brand new device');
let m = await start('fresh');
check(m.DEFAULT_DEVICE_PREFS.serifText === false && m.getDevicePrefs().serifText === false, 'it starts in the bold sans (serif off)');

section('2. A device that had the serif on, only because it was the default');
store.clear();
store.set('noob.devicePrefs.v1', JSON.stringify({ textSize: 'large', serifText: true, boldText: true }));
m = await start('old');
check(m.getDevicePrefs().serifText === false, 'the serif is switched off once');
check(m.getDevicePrefs().textSize === 'large' && m.getDevicePrefs().boldText === true, 'nothing else the person chose is touched');
check(JSON.parse(store.get('noob.devicePrefs.v1')).serifText === false && store.get('noob.fontReset.v1') === '1', 'and it is saved, with a marker so it happens only once');

section('3. Afterwards the person decides');
m.setDevicePrefs({ serifText: true });
check(m.getDevicePrefs().serifText === true, 'turning "Serif text" on works');
m = await start('later');
check(m.getDevicePrefs().serifText === true, 'and it is still on the next time the app starts (the reset does not run again)');

section('4. The words in Settings');
const page = read('src/components/Settings/pages/app.tsx'), css = read('src/index.css');
check(/Off by default: NOOB uses the bold sans/.test(page) && !/Turn off for the rounded look/.test(page), 'Settings says it is off by default');
check(/"Serif text" \(off by default/.test(css), 'the style sheet says so too');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
