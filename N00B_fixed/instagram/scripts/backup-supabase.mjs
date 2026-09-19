// Saves a complete copy of NOOB's Supabase data (every table + every photo/video/audio file) onto THIS computer.
// READ-ONLY: it never changes or deletes anything in the project. Run it whenever you like (weekly is a good habit),
// and keep the resulting folder somewhere safe (a second drive, cloud storage). The `backups/` folder is
// git-ignored on purpose: it contains private details (emails, phone numbers) and must never be committed.
//
// Uses the project's SECRET key (Settings → API Keys → Secret keys) — type it only into your own PowerShell:
//   $env:SUPABASE_URL = "https://<ref>.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY = "sb_secret_..."
//   node scripts/backup-supabase.mjs            (add --no-media to skip the files)
//   node scripts/backup-supabase.mjs --verify backups/supabase-<date>    (re-check an existing backup, no internet needed)
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { runBackup, verifyBackupFolder } from './supabase/backup-core.mjs';

const args = process.argv.slice(2);
const verifyIdx = args.indexOf('--verify');
if (verifyIdx >= 0) {
  const dir = args[verifyIdx + 1];
  const r = verifyBackupFolder(dir);
  console.log(r.ok ? `\nBACKUP OK: ${dir} matches its manifest (${Object.keys(r.manifest.tables).length} tables, ${r.manifest.media.files} media files).` : `\nBACKUP PROBLEMS:\n - ${r.problems.join('\n - ')}`);
  process.exit(r.ok ? 0 : 1);
}

const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first (see the top of this file).'); process.exit(1); }
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = path.join('backups', `supabase-${stamp}`);
console.log(`Saving a copy of the NOOB data to ${outDir}\n`);
const manifest = await runBackup({ client, outDir, withMedia: !args.includes('--no-media') });
const check = verifyBackupFolder(outDir);
const totalRows = Object.values(manifest.tables).reduce((s, t) => s + (t.rows || 0), 0);
console.log(`\n${manifest.ok && check.ok ? 'BACKUP COMPLETE' : 'BACKUP FAILED'}: ${totalRows} rows in ${Object.keys(manifest.tables).length} tables, ${manifest.media.files} media files (${(manifest.media.bytes / 1048576).toFixed(1)} MB).`);
for (const p of [...manifest.problems, ...check.problems]) console.log(` - ${p}`);
console.log(`Folder: ${path.resolve(outDir)}`);
process.exitCode = manifest.ok && check.ok ? 0 : 1;
setTimeout(() => process.exit(process.exitCode), 300);
