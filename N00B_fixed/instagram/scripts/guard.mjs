// THE GUARD: one command that checks everything that has broken before, in about a minute, for free (no database, no browser, no keys).
//   npm run guard
// It is also run by GitHub on every push (.github/workflows/guard.yml), which sends an e-mail when something is wrong, so a bug that comes back is caught within minutes of the
// change that caused it, not weeks later by a user. Each line below is a bug that happened once; the test next to it is the reason it can not come back unnoticed.
//
// To protect a new thing: write a test in scripts/supabase/ (see test-likes-guard.mjs) and add it to the list.
import { spawnSync } from 'node:child_process';

const CHECKS = [
  ['TypeScript (no type errors anywhere)', ['npx', 'tsc', '--noEmit', '-p', '.']],
  // things that were lost or looked lost
  ['Likes: never lost, on every kind of content', ['node', 'scripts/supabase/test-likes-guard.mjs']],
  // things that flashed, jumped or got cut
  ['No page flash; chat alerts only when away', ['node', 'scripts/supabase/test-no-flash-chat-quiet.mjs']],
  ['Phone menu: full screen and steady', ['node', 'scripts/supabase/test-nav-badges.mjs']],
  ['Menus: one list for phone and strip', ['node', 'scripts/supabase/test-side-menu-fit.mjs']],
  ['Coming back to the menu', ['node', 'scripts/supabase/test-menu-return.mjs']],
  ['Desktop / tablet layout', ['node', 'scripts/supabase/test-desktop-layout.mjs']],
  ['Bottom bar', ['node', 'scripts/supabase/test-bottom-nav-flat.mjs']],
  ['Reels page', ['node', 'scripts/supabase/test-reels-pager.mjs']],
  ['Light / dark theme', ['node', 'scripts/supabase/test-mono-theme.mjs']],
  ['Top strip and install bar', ['node', 'scripts/supabase/test-peek-install-strip.mjs']],
  // features the administrator controls
  ['Calculator lock', ['node', 'scripts/supabase/test-calc-lock.mjs']],
  ['Birthday gifts', ['node', 'scripts/supabase/test-birthday-gifts.mjs']],
  ['Page switches (admin)', ['node', 'scripts/supabase/test-music-page-hide-ui.mjs']],
  ['Settings hub', ['node', 'scripts/supabase/test-settings-hub-ui.mjs']],
  ['Scratch cards', ['node', 'scripts/supabase/test-scratch-cards.mjs']],
  ['Lenses', ['node', 'scripts/supabase/test-lenses.mjs']],
  ['Family map', ['node', 'scripts/supabase/test-family.mjs']],
];

const win = process.platform === 'win32';
let bad = 0;
for (const [name, cmd] of CHECKS) {
  const started = Date.now();
  const r = spawnSync(win && cmd[0] === 'npx' ? 'npx.cmd' : cmd[0], cmd.slice(1), { encoding: 'utf8', shell: win, maxBuffer: 64 * 1024 * 1024 });
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  if (r.status === 0) { console.log(`  ok    ${name}  (${secs}s)`); continue; }
  bad++;
  console.log(`  FAIL  ${name}  (${secs}s)`);
  const lines = `${r.stdout || ''}\n${r.stderr || ''}`.split('\n').filter((l) => /FAIL|error|Error/.test(l)).slice(0, 8);
  for (const l of lines) console.log(`          ${l.trim()}`);
}
console.log(bad ? `\n${bad} of ${CHECKS.length} checks FAILED: something that used to work is broken.` : `\nAll ${CHECKS.length} checks passed.`);
process.exit(bad ? 1 : 0);
