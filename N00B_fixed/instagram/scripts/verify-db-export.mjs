// Re-checks a "noob-supabase-db" export folder (the full read-only copy of the database) against its own manifest. Nothing is contacted, nothing is changed.
//   node scripts/verify-db-export.mjs D:\NOOB-backups\supabase-db-2026-10-28T07-23-45
// It checks, for every table and schema file: the file exists, its SHA-256 matches, the JSON holds exactly the number of rows the manifest says, and the MD5 of the file is
// the very MD5 PostgreSQL itself computed when it produced the text (so the file on disk is byte-for-byte what the database sent). It also compares the saved row counts
// with the counts taken right after the export, and lists any file in the folder that the manifest does not know.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const dir = process.argv[2];
if (!dir || !fs.existsSync(path.join(dir, 'manifest.json'))) { console.error('Usage: node scripts/verify-db-export.mjs <export folder>'); process.exit(2); }
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
const hash = (algo, buf) => crypto.createHash(algo).update(buf).digest('hex');
const problems = [];
let rows = 0, files = 0, bytes = 0, withDbMd5 = 0;

for (const [kind, group] of [['tables', manifest.tables], ['schema', manifest.schema]]) {
  for (const [name, info] of Object.entries(group || {})) {
    const file = path.join(dir, kind, `${name}.json`);
    if (!fs.existsSync(file)) { problems.push(`${kind}/${name}: file is missing`); continue; }
    const buf = fs.readFileSync(file);
    files++; bytes += buf.length;
    if (buf.length !== info.bytes) problems.push(`${kind}/${name}: ${buf.length} bytes on disk, manifest says ${info.bytes}`);
    if (hash('sha256', buf) !== info.sha256) problems.push(`${kind}/${name}: SHA-256 differs from the manifest`);
    if (info.dbMd5) { withDbMd5++; if (hash('md5', buf) !== info.dbMd5) problems.push(`${kind}/${name}: not identical to what the database produced (MD5)`); }
    let parsed;
    try { parsed = JSON.parse(buf.toString('utf8')); } catch (e) { problems.push(`${kind}/${name}: not valid JSON`); continue; }
    if (!Array.isArray(parsed) || parsed.length !== info.rows) problems.push(`${kind}/${name}: ${Array.isArray(parsed) ? parsed.length : 'not an array'} rows in the file, manifest says ${info.rows}`);
    if (kind === 'tables') {
      rows += info.rows;
      const live = manifest.liveCountsAfter?.[name];
      if (live != null && live !== info.rows && !/cron\./.test(name)) problems.push(`${name}: the database had ${live} rows right after the export but ${info.rows} were saved`);
    }
  }
}
const known = new Set([...Object.keys(manifest.tables || {}).map((n) => `tables/${n}.json`), ...Object.keys(manifest.schema || {}).map((n) => `schema/${n}.json`), 'manifest.json', 'README-RESTORE.txt']);
const walk = (d, base = '') => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name), `${base}${e.name}/`) : [`${base}${e.name}`]);
for (const f of walk(dir)) if (!known.has(f)) problems.push(`${f}: a file the manifest does not know about`);

const userTables = Object.keys(manifest.tables).filter((n) => n.startsWith('public.'));
console.log(`${Object.keys(manifest.tables).length} tables (${userTables.length} in public), ${rows} rows, ${files} files checked, ${(bytes / 1048576).toFixed(1)} MB, ${withDbMd5} files matched to the database's own MD5`);
if (manifest.changedWhileExporting?.length) console.log(`changed while exporting (scheduler log only): ${manifest.changedWhileExporting.join('; ')}`);
if (manifest.skipped?.length) console.log(`deliberately not saved: ${manifest.skipped.join('; ')}`);
if (manifest.media?.pending) console.log(`media: ${manifest.media.pending}`);
console.log(problems.length ? `\nEXPORT PROBLEMS:\n - ${problems.join('\n - ')}` : '\nEXPORT OK: every file matches its manifest and the database.');
process.exit(problems.length ? 1 : 0);
