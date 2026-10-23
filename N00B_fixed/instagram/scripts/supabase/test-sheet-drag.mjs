// Bottom sheets (comments of a post / video / reel, Likes and views, Share, Create, Switch account, Followers you know):
//   * every sheet that shows the grey handle bar really can be dragged down to close (they were decoration only, or lost the drag): one shared behaviour, utils/sheetDrag.ts;
//   * there is no cross on a phone (the sheet is dragged down, or the page above it is tapped); a bigger screen, where the sheet is a window in the middle, keeps the cross;
//   * the comment sheets cover 45 % of the page, so the post / video / reel above stays in view, and sit right above the keyboard; the sheet itself fills the area under the
//     keyboard with its own colour, because a phone's keyboard is see-through glass and showed the bottom bar and the posts behind it;
//   * the bottom bar steps aside while the keyboard is open;
//   * a comment's time reads "5h ago", not the raw text "2026-10-23T19:54:26.87493+00:00" (Safari could not read the microseconds).
// Measured in a browser at 390 x 844 with the real sheets: the comments sheet is 380 px tall (45 %), bottom at 844; a slow 40 px pull follows the finger and springs back,
// a slow 220 px pull closes it; the Create and Followers sheets close the same way; no cross on a phone, a cross and a centred window at 1100 px.
// Usage: node scripts/supabase/test-sheet-drag.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const load = (p) => import(pathToFileURL(path.resolve(p)).href);

section('1. When a sheet closes');
const { shouldDismiss, pullOffset, DISMISS_PX, DISMISS_SPEED } = await load('src/utils/sheetDrag.ts');
check(shouldDismiss(0, 0, 400) === false && shouldDismiss(-50, 2, 400) === false, 'no pull, or a pull upwards, never closes');
check(shouldDismiss(30, 0.1, 400) === false && shouldDismiss(60, 0.2, 400) === false, 'a short, slow pull springs back');
check(shouldDismiss(DISMISS_PX, 0, 600) === true && shouldDismiss(140, 0.1, 600) === true, 'a long pull closes it');
check(shouldDismiss(80, 0.1, 200) === true && shouldDismiss(60, 0.1, 200) === false, 'a small sheet closes after a third of its height');
check(shouldDismiss(50, DISMISS_SPEED + 0.2, 600) === true && shouldDismiss(20, 2, 600) === false, 'a quick flick closes it, a twitch of a few pixels does not');
check(pullOffset(100) === 100 && pullOffset(-40) === -10, 'pulling up past the top is held back to a quarter');

section('2. A comment\'s time');
const { formatRelativeTime } = await load('src/utils/formatTime.ts');
const ago = new Date(Date.now() - (5 * 3600 + 1800) * 1000);   // five and a half hours ago
const micro = ago.toISOString().replace(/\.\d{3}Z$/, '.874930+00:00');
check(/^5h ago$/.test(formatRelativeTime(micro)), 'a database timestamp with microseconds reads "5h ago"', formatRelativeTime(micro));
check(/^5h ago$/.test(formatRelativeTime(ago.toISOString().replace(/\.\d{3}Z$/, '.87493+00:00'))), 'also with 5 digits (the exact text from the screenshot)');
check(formatRelativeTime('Just now') === 'Just now' && formatRelativeTime('3:45 PM') === '3:45 PM', 'older text values are still shown as they are');
for (const f of ['src/components/Feed/CommentsSheet.tsx', 'src/components/Videos/VideoCommentsSheet.tsx']) {
  const s = read(f);
  check(/formatRelativeTime\(c\.createdAt\)/.test(s) && !/\{c\.createdAt\}/.test(s), path.basename(f) + ' shows the time as "5h ago"');
}

section('3. Every sheet with a handle can be dragged, and has no cross on a phone');
const sheets = {
  'src/components/Feed/CommentsSheet.tsx': { drag: 'drag', cross: true },
  'src/components/Videos/VideoCommentsSheet.tsx': { drag: 'drag', cross: true },
  'src/components/Reels/ReelsView.tsx': { drag: 'commentsDrag', cross: true },
  'src/components/Common/LikesViewsSheet.tsx': { drag: 'drag', cross: true },
  'src/components/Common/SharePostSheet.tsx': { drag: 'drag', cross: true },
  'src/components/PostCreation/CreateChooser.tsx': { drag: 'drag', cross: true },
  'src/components/Modals/SwitchAccountModal.tsx': { drag: 'drag', cross: false },
  'src/components/Profile/MutualFollowersSheet.tsx': { drag: 'drag', cross: false },
};
for (const [f, o] of Object.entries(sheets)) {
  const s = read(f);
  const d = o.drag;
  check(new RegExp(`const ${d} = useSheetDrag\\(`).test(s) && new RegExp(`ref=\\{${d}\\.sheetRef\\}`).test(s) && new RegExp(`ref=\\{${d}\\.backdropRef\\}`).test(s) && new RegExp(`<SheetGrip drag=\\{${d}\\}`).test(s), path.basename(f) + ': the handle and the title row drag the sheet, and the shade behind fades with it');
  const closeButtons = [...s.matchAll(/aria-label="Close"/g)].map((m) => s.slice(Math.max(0, m.index - 220), m.index + 220));   // the text around each cross button (it may be on several lines)
  const closeInSheet = o.cross ? closeButtons.every((b) => /CLOSE_X_CLASS/.test(b)) && closeButtons.length >= 1 : closeButtons.length === 0;
  check(closeInSheet, o.cross ? path.basename(f) + ': the cross shows only on a bigger screen' : path.basename(f) + ': no cross, the sheet is dragged down', closeButtons.join(' | ').slice(0, 200));
}
// the grey bar exists only inside SheetGrip: no other handle bar that does nothing
const walk = (d, out = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p, out); else if (p.endsWith('.tsx')) out.push(p); } return out; };
const loose = walk('src').filter((f) => !f.endsWith('SheetGrip.tsx')).filter((f) => /\bw-10 h-1(\.5)? rounded-full\b/.test(read(f)));
check(loose.length === 0, 'no handle bar anywhere else in the app that does nothing', loose.join(', '));
const grip = read('src/components/Common/SheetGrip.tsx');
check(/gripProps/.test(grip) && /CLOSE_X_CLASS = 'hidden sm:inline-flex'/.test(grip), 'the handle component carries the drag, and the cross is hidden on a phone');
const drag = read('src/utils/sheetDrag.ts');
check(/touchAction: 'none'/.test(drag) && /setPointerCapture/.test(drag) && /DRAG_START_PX/.test(drag), 'it uses pointer events with touch-action none, and only starts after a few pixels so a tap on a button in the title row is still a tap');

section('4. The comment sheets: 45 % of the page, above the keyboard, nothing behind the keyboard');
for (const f of ['src/components/Feed/CommentsSheet.tsx', 'src/components/Videos/VideoCommentsSheet.tsx', 'src/components/Reels/ReelsView.tsx']) {
  const s = read(f);
  check(/useSheetBox\(0\.45\)/.test(s) && /rounded-t-3xl/.test(s), path.basename(f) + ': 45 % of the page, rounded top');
}
const comments = read('src/components/Feed/CommentsSheet.tsx') + read('src/components/Videos/VideoCommentsSheet.tsx');
check(!/Enter line breaks as needed/.test(comments) && (comments.match(/'Add a comment\.\.\.'/g) || []).length === 2, 'the comment box says "Add a comment..." (the long text was cut off: "Add a comment (Enter line")');
const vv = read('src/utils/useVisualViewport.ts');
check(/paddingBottom: kb \|\| 'env\(safe-area-inset-bottom\)'/.test(vv) && /top: top \+ visible - height, height: height \+ kb/.test(vv), 'the sheet ends at the bottom of the PAGE (not the keyboard) and keeps its own colour under the keyboard');
const nav = read('src/components/Navigation/FloatingNavBar.tsx');
check(/useKeyboardOpen\(\)/.test(nav) && /keyboardOpen \? 'hidden' : ''/.test(nav), 'the bottom bar steps aside while the keyboard is open');
const share = read('src/components/Common/SharePostSheet.tsx');
check(/useKeyboardMetrics\(\)/.test(share) && /paddingBottom: kbm\.keyboard \|\| undefined/.test(share), 'the Share sheet (it has a search box) also fills the area under the keyboard');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
