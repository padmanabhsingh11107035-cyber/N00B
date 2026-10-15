// A newer version of the app is applied by itself when the app is opened again after being away - and never when it could cost someone something
// (src/utils/appVersion.ts). Usage: node scripts/supabase/test-app-update.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const src = read('src/utils/appVersion.ts');
const tmp = path.join(fs.mkdtempSync(path.join(process.env.TEMP || '.', 'noob-upd-')), 'appVersion.ts');
fs.writeFileSync(tmp, src.replace("import { useEffect, useState } from 'react';", '').replace('declare const __BUILD_ID__: string;', 'const __BUILD_ID__ = "1";'));
const M = await import(pathToFileURL(tmp).href);
fs.rmSync(path.dirname(tmp), { recursive: true, force: true });

const base = { visible: true, awayMs: 60_000, editingText: false, mediaPlaying: false, alreadyTriedThisVersion: false };
section('1. When the app updates itself');
check(M.shouldAutoApplyUpdate(base) === true, 'opened again after a minute away: it updates');
check(M.shouldAutoApplyUpdate({ ...base, awayMs: M.AUTO_UPDATE_AFTER_AWAY_MS }) === true, 'the limit itself counts');
check(M.shouldAutoApplyUpdate({ ...base, awayMs: M.AUTO_UPDATE_AFTER_AWAY_MS - 1 }) === false, 'a quick glance away does not');
check(M.shouldAutoApplyUpdate({ ...base, awayMs: 0 }) === false, 'never while the app has simply been in front the whole time (the banner is shown instead)');
section('2. When it never does');
check(M.shouldAutoApplyUpdate({ ...base, visible: false }) === false, 'not while hidden');
check(M.shouldAutoApplyUpdate({ ...base, editingText: true }) === false, 'not while something is being typed (a message, a post, a comment)');
check(M.shouldAutoApplyUpdate({ ...base, mediaPlaying: true }) === false, 'not while a call, a live or a video is playing');
check(M.shouldAutoApplyUpdate({ ...base, alreadyTriedThisVersion: true }) === false, 'not twice for the same version (no reload loop if the server is slow)');
section('3. Wiring');
check(/shouldAutoApplyUpdate\(\{/.test(src) && /window\.location\.reload\(\)/.test(src) && /markTried\(latest\)/.test(src), 'the check reloads once, after marking the version as tried');
check(/setUpdateAvailable\(true\)/.test(src), 'the banner still appears in every case');
check(/hiddenAt = Date\.now\(\)/.test(src) && /void check\(away\)/.test(src), 'how long the app was away is measured when it comes back');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
