// THE SECURITY GATE: runs before every push (see .githooks/pre-push) and stops the push when a security check fails, so an update can never go live with a hole in it.
// The same checks run again on GitHub (.github/workflows/security.yml); this is the part that happens BEFORE anything is published.
//   node scripts/security-gate.mjs
// Emergency only (a real outage fix that cannot wait): SKIP_SECURITY_GATE=1 git push   - GitHub still runs every check afterwards and shows red if one fails.
import { spawnSync } from 'node:child_process';

if (process.env.SKIP_SECURITY_GATE === '1') { console.log('SECURITY GATE SKIPPED on request (SKIP_SECURITY_GATE=1). GitHub will still run every check.'); process.exit(0); }

const STEPS = [
  ['Database audit (row-level security, privileged functions)', ['node', 'scripts/security-audit-db.mjs']],
  ['A normal person cannot make themselves admin, verified or rich', ['node', '--liftoff-only', 'scripts/supabase/test-privilege-escalation-db.mjs']],
  ['Profile privacy and Live Lounge rules', ['node', '--liftoff-only', 'scripts/supabase/test-profile-privacy-lounge-db.mjs']],
  ['Ads rules', ['node', '--liftoff-only', 'scripts/supabase/test-ads-db.mjs']],
  ['Admin password re-check, admin email approval, new-device notice', ['node', '--liftoff-only', 'scripts/supabase/test-admin-security-db.mjs']],
  ['Security configuration (headers, links, workflows)', ['node', 'scripts/supabase/test-security-config.mjs']],
  ['Website packages with known problems', ['node', 'scripts/audit-packages.mjs']],
  ['TypeScript (no type errors anywhere)', ['npx', 'tsc', '--noEmit', '-p', '.']],
];

let failed = 0;
for (const [label, cmd] of STEPS) {
  const t0 = Date.now();
  const r = spawnSync(cmd[0], cmd.slice(1), { encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 64 * 1024 * 1024 });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  if (r.status === 0) { console.log(`  ok    ${label}  (${secs}s)`); continue; }
  failed++;
  console.log(`  FAIL  ${label}  (${secs}s)`);
  console.log(((r.stdout || '') + (r.stderr || '')).split('\n').slice(-25).map((l) => '        ' + l).join('\n'));
}
if (failed) { console.log(`\nSECURITY GATE: ${failed} check(s) failed. The push was stopped. Fix them, or ask for help.`); process.exit(1); }
console.log('\nSecurity gate passed: the update may go out.');
