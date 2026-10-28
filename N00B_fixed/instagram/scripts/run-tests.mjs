// Runs every test of "npm run test:supabase" ONE BY ONE (Windows can not start the single very long "a && b && c ..." line: "The command line is too long").
// It reads the same list from package.json, so a new test only has to be registered there. Keeps going after a failure and lists every failed test at the end.
// Usage: node scripts/run-tests.mjs [text]     (only tests whose file name contains the text)
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const filter = (process.argv[2] || '').toLowerCase();
const line = JSON.parse(fs.readFileSync('package.json', 'utf8')).scripts['test:supabase'] || '';
const steps = line.split('&&').map((s) => s.trim()).filter(Boolean).filter((s) => !filter || s.toLowerCase().includes(filter));
const failed = [];
const started = Date.now();
for (const [i, step] of steps.entries()) {
  const parts = step.split(/\s+/);
  const args = parts[0] === 'node' ? parts.slice(1) : null;
  if (!args) { console.log(`skip (not a node command): ${step}`); continue; }
  const t0 = Date.now();
  const res = spawnSync(process.execPath, ['--max-old-space-size=3000', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const out = `${res.stdout || ''}${res.stderr || ''}`;
  const summary = out.split('\n').filter((l) => /\d+ passed|\d+ checks? |\bFAIL\b/i.test(l)).slice(-3).join(' | ');
  const ok = res.status === 0;
  console.log(`${ok ? 'ok  ' : 'FAIL'} [${i + 1}/${steps.length}] ${args[args.length - 1]} (${Math.round((Date.now() - t0) / 1000)}s) ${summary.slice(0, 160)}`);
  if (!ok) { failed.push(args[args.length - 1]); console.log(out.split('\n').filter((l) => /FAIL|Error|error/.test(l)).slice(0, 8).join('\n')); }
}
console.log(`\n${steps.length - failed.length}/${steps.length} test files passed in ${Math.round((Date.now() - started) / 60000)} min${failed.length ? `\nFAILED: ${failed.join(', ')}` : ''}`);
process.exit(failed.length ? 1 : 0);
