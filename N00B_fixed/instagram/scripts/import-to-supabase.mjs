// Loads a MongoDB backup (scripts/backup-mongo.mjs) into a Supabase project.
//
//   DRY RUN (default) — touches nothing, needs no keys. Reads the backup,
//   works out exactly what would be imported, saves the profile photo that
//   lived inside the database as a real file, and prints a report:
//
//       node scripts/import-to-supabase.mjs
//
//   REAL IMPORT — needs the project URL and the SECRET (service_role) key.
//   Type both into your own terminal; they are read from the environment and
//   never printed or saved:
//
//       $env:SUPABASE_URL = "https://<project-ref>.supabase.co"
//       $env:SUPABASE_SERVICE_ROLE_KEY = "<secret key>"
//       node scripts/import-to-supabase.mjs --apply
//
// Options:
//   --backup <folder>   which backup to use (default: newest in ./backups)
//   --with-chats        also import private chats and their messages
//                       (the Global Lounge is always included)
//   --resume            continue an interrupted import; only adds what's missing
//   --yes               skip the "type IMPORT" confirmation
//
// Safety: it only ADDS rows, never overwrites or deletes; it refuses to run on
// a project that already has profiles (unless --resume); and it verifies the
// counts afterwards. Run the database migration in supabase/migrations first.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { loadBackup, buildImportPlan } from './supabase/transform.mjs';
import { runImport } from './supabase/run-import.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);

const backupsRoot = 'backups';
const dir = option('--backup')
  || path.join(backupsRoot, fs.existsSync(backupsRoot) ? (fs.readdirSync(backupsRoot).filter((d) => fs.existsSync(path.join(backupsRoot, d, 'users.json'))).sort().pop() || '') : '');
if (!fs.existsSync(path.join(dir, 'users.json'))) {
  console.error(`No backup found at "${dir}". Run scripts/backup-mongo.mjs first.`);
  process.exit(1);
}

const plan = buildImportPlan(loadBackup(dir), { withChats: flag('--with-chats') });

// Photos that were stored inside the database become real files next to the
// other backed-up media, ready to upload to whichever file storage is chosen.
for (const f of plan.inlineFiles) {
  const target = path.join(dir, 'media', ...f.key.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, f.buffer);
}

const { counts, warnings, skipped } = plan.report;
console.log(`Backup: ${dir}`);
console.log('\nWhat will be imported:');
console.log(`  login accounts        ${plan.authUsers.length}`);
for (const [table, n] of Object.entries(counts)) if (n) console.log(`  ${table.padEnd(21)} ${n}`);
if (plan.inlineFiles.length) console.log(`\nSaved ${plan.inlineFiles.length} photo(s) that lived inside the database as real file(s) in ${path.join(dir, 'media')}`);
if (warnings.length) { console.log('\nNotes:'); warnings.forEach((w) => console.log(`  - ${w}`)); }
if (skipped.length) { console.log('\nSkipped (nothing to attach them to):'); skipped.forEach((s) => console.log(`  - ${s}`)); }

if (!flag('--apply')) {
  console.log('\nDRY RUN — nothing was sent anywhere. Add --apply to do the real import.');
  process.exit(0);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('\nSUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not set. Set them in your terminal first (see the top of this file).');
  process.exit(1);
}
let host;
try { host = new URL(url).host; } catch { console.error('\nSUPABASE_URL is not a valid URL.'); process.exit(1); }
if (!/^[a-z0-9]{10,}\.supabase\.(co|in)$/.test(host)) {
  console.error(`\nSUPABASE_URL host "${host}" doesn't look like a Supabase project (expected <project-ref>.supabase.co). Aborting.`);
  process.exit(1);
}

if (!flag('--yes')) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`\nThis will ADD the data above to the Supabase project ${host}. Type IMPORT to continue: `);
  rl.close();
  if (answer.trim() !== 'IMPORT') { console.log('Cancelled. Nothing was changed.'); process.exit(0); }
}

const { makeSupabaseAdapter } = await import('./supabase/supabase-adapter.mjs');
const adapter = makeSupabaseAdapter(url, key);
try {
  const { auth, verification } = await runImport(plan, adapter, { resume: flag('--resume'), log: (m) => console.log(`  ${m}`) });
  console.log(`\nLogin accounts: ${auth.created} created, ${auth.existing} already existed.`);
  if (auth.tempPassword.length) {
    console.log(`These account(s) could NOT keep their old password (Supabase refused it, e.g. too short) and were given a random one: ${auth.tempPassword.join(', ')}`);
    console.log('They are flagged for a password reset — those people will need to set a new password.');
  }
  if (verification.ok) console.log('VERIFIED: every table has all its rows and every counter matches the real data.');
  else { console.log('\nVERIFICATION FOUND PROBLEMS:'); verification.problems.forEach((p) => console.log(`  - ${p}`)); process.exit(3); }
} catch (err) {
  console.error(`\nImport stopped: ${err.message}`);
  console.error('Nothing was overwritten or deleted. Fix the problem and run again with --resume.');
  process.exit(2);
}
