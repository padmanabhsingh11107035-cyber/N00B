// Tests the pure parts of the content protection: which key presses count as a screenshot shortcut, which elements count as
// protected media, and the attributes put on media. (What it does in a real browser is checked in the browser.)
// Pure logic (src/utils/contentProtection.ts): no database or browser needed.
//
// Usage: node scripts/supabase/test-protection.mjs
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const P = await import(pathToFileURL(path.resolve('src/utils/contentProtection.ts')).href);
const { isCaptureShortcut, mediaAttributes, isProtectedTarget, MEDIA_SELECTOR, PROTECTION_CSS } = P;

section('1. Screenshot shortcuts');
check(isCaptureShortcut({ key: 'PrintScreen', code: 'PrintScreen' }), 'PrintScreen');
check(isCaptureShortcut({ key: 'PrintScreen', code: 'PrintScreen', ctrlKey: true }) && isCaptureShortcut({ key: 'PrintScreen', code: 'PrintScreen', altKey: true }), '...also with Ctrl or Alt');
check(isCaptureShortcut({ key: 'Unidentified', code: 'PrintScreen' }), 'recognised by its key code even when the key name is odd');
check(isCaptureShortcut({ key: 'S', code: 'KeyS', metaKey: true, shiftKey: true }) && isCaptureShortcut({ key: 's', code: 'KeyS', metaKey: true, shiftKey: true }), 'Windows Snipping Tool (Win+Shift+S), either capital or small');
check(['Digit3', 'Digit4', 'Digit5'].every((code) => isCaptureShortcut({ key: '#', code, metaKey: true, shiftKey: true })), 'macOS Cmd+Shift+3, 4 and 5');
const notCapture = [
  ['a plain letter', { key: 's', code: 'KeyS' }], ['a capital S', { key: 'S', code: 'KeyS', shiftKey: true }], ['Ctrl+S (save)', { key: 's', code: 'KeyS', ctrlKey: true }],
  ['Win+S (search)', { key: 's', code: 'KeyS', metaKey: true }], ['Win+Shift+Left (move window)', { key: 'ArrowLeft', code: 'ArrowLeft', metaKey: true, shiftKey: true }],
  ['Cmd+3', { key: '3', code: 'Digit3', metaKey: true }], ['Shift+3', { key: '#', code: 'Digit3', shiftKey: true }], ['Ctrl+P', { key: 'p', code: 'KeyP', ctrlKey: true }],
  ['Enter', { key: 'Enter', code: 'Enter' }], ['nothing at all', {}]
];
for (const [name, ev] of notCapture) check(!isCaptureShortcut(ev), `${name}: NOT a screenshot shortcut (typing and everyday shortcuts are never blocked)`);

section('2. Which elements are protected media');
const el = (matches) => ({ closest: (sel) => (sel === MEDIA_SELECTOR && matches ? {} : null) });
check(MEDIA_SELECTOR.includes('img') && MEDIA_SELECTOR.includes('video') && MEDIA_SELECTOR.includes('canvas'), 'pictures, videos and canvases are covered');
check(isProtectedTarget(el(true)) === true && isProtectedTarget(el(false)) === false, 'media (or something inside it) yes, other things no');
check(isProtectedTarget(null) === false && isProtectedTarget(undefined) === false && isProtectedTarget({}) === false, 'nothing / an odd target: not protected, no crash');
check(isProtectedTarget({ closest: () => { throw new Error('x'); } }) === false, 'a target that misbehaves is treated as not protected, no crash');

section('3. What is put on media');
const v = mediaAttributes('VIDEO');
check(v.controlslist.includes('nodownload') && v.controlslist.includes('noremoteplayback') && 'disablepictureinpicture' in v && v.draggable === 'false', 'a video gets no download button, no casting, no picture-in-picture, no dragging');
const au = mediaAttributes('AUDIO');
check(au.controlslist.includes('nodownload') && au.controlslist.includes('noremoteplayback'), 'a voice note / audio track gets no download button and no casting either');
check(mediaAttributes('IMG').draggable === 'false' && mediaAttributes('canvas').draggable === 'false' && mediaAttributes('picture').draggable === 'false', 'pictures can not be dragged out');
check(Object.keys(mediaAttributes('DIV')).length === 0 && Object.keys(mediaAttributes('input')).length === 0, 'nothing else is touched (text boxes, buttons...)');
check(MEDIA_SELECTOR.includes('audio'), 'audio is one of the protected element types');

section('4. No watermark');
check(P.watermarkTile === undefined && P.watermarkDataUri === undefined, 'the watermark code is gone (nothing is drawn over the screen)');
check(!/watermark/i.test(PROTECTION_CSS), 'and the styles do not mention one');

section('5. Printing');
check(/@media print\s*\{[^}]*display:\s*none\s*!important/.test(PROTECTION_CSS), 'printing or "save as PDF" gives a blank page');
check(/user-drag:\s*none/.test(PROTECTION_CSS) && /-webkit-touch-callout:\s*none/.test(PROTECTION_CSS), 'no dragging media, and no long-press "save image" menu on iPhone');

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
