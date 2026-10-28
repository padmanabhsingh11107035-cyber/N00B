// The checker of the full database export (scripts/verify-db-export.mjs): a good export passes, and every kind of damage is named.
// Usage: node scripts/supabase/test-db-export-verify.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const hash = (algo, s) => crypto.createHash(algo).update(s).digest('hex');

function makeExport({ tamper = null } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'noob-dbexport-'));
  fs.mkdirSync(path.join(dir, 'tables')); fs.mkdirSync(path.join(dir, 'schema'));
  const data = {
    'public.profiles': [{ id: 'a', username: 'ana' }, { id: 'b', username: 'bob' }],
    'public.messages': Array.from({ length: 50 }, (_, i) => ({ id: i, text: `hello ${i} ünï 🎉` })),
    'public.empty_table': [],
    'auth.users': [{ id: 'a', email: 'ana@example.com', encrypted_password: '$2a$10$xxxx' }]
  };
  const manifest = { createdAt: new Date().toISOString(), tables: {}, schema: {}, liveCountsAfter: {}, changedWhileExporting: [], skipped: ['auth.sessions (3 rows) - login tokens, deliberately not saved'], media: { files: 0, bytes: 0, missing: [], pending: 'later' }, ok: true, problems: [] };
  for (const [name, rows] of Object.entries(data)) {
    const text = JSON.stringify(rows);
    fs.writeFileSync(path.join(dir, 'tables', `${name}.json`), text);
    manifest.tables[name] = { rows: rows.length, bytes: Buffer.byteLength(text), sha256: hash('sha256', text), dbMd5: rows.length ? hash('md5', text) : null };
    manifest.liveCountsAfter[name] = rows.length;
  }
  const cols = JSON.stringify([{ table_name: 'profiles', column_name: 'id' }]);
  fs.writeFileSync(path.join(dir, 'schema', 'columns.json'), cols);
  manifest.schema.columns = { rows: 1, bytes: Buffer.byteLength(cols), sha256: hash('sha256', cols), dbMd5: hash('md5', cols) };
  fs.writeFileSync(path.join(dir, 'README-RESTORE.txt'), 'read me');
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  if (tamper) tamper(dir, manifest);
  return dir;
}
const run = (dir) => { const r = spawnSync(process.execPath, ['scripts/verify-db-export.mjs', dir], { encoding: 'utf8' }); return { code: r.status, out: `${r.stdout}${r.stderr}` }; };

section('1. A good export');
let r = run(makeExport());
check(r.code === 0 && /EXPORT OK/.test(r.out) && /4 tables \(3 in public\), 53 rows/.test(r.out), 'passes, and counts the tables and rows', r.out);
check(/deliberately not saved: auth\.sessions/.test(r.out) && /media: later/.test(r.out), 'it tells what was left out on purpose and that the media are still to come');

section('2. Damage is found');
r = run(makeExport({ tamper: (d) => fs.writeFileSync(path.join(d, 'tables', 'public.profiles.json'), JSON.stringify([{ id: 'a', username: 'EVIL' }, { id: 'b', username: 'bob' }])) }));
check(r.code === 1 && /public\.profiles: SHA-256 differs/.test(r.out), 'a changed table file is caught');
r = run(makeExport({ tamper: (d) => fs.rmSync(path.join(d, 'tables', 'public.messages.json')) }));
check(r.code === 1 && /public\.messages: file is missing/.test(r.out), 'a missing table file is caught');
r = run(makeExport({ tamper: (d, m) => { m.tables['public.messages'].rows = 49; fs.writeFileSync(path.join(d, 'manifest.json'), JSON.stringify(m)); } }));
check(r.code === 1 && /50 rows in the file, manifest says 49/.test(r.out), 'a row count that differs from the manifest is caught');
r = run(makeExport({ tamper: (d, m) => { m.tables['public.profiles'].dbMd5 = 'f'.repeat(32); fs.writeFileSync(path.join(d, 'manifest.json'), JSON.stringify(m)); } }));
check(r.code === 1 && /public\.profiles: not identical to what the database produced/.test(r.out), 'a file that is not what the database sent (its own MD5) is caught');
r = run(makeExport({ tamper: (d, m) => { m.liveCountsAfter['public.messages'] = 51; fs.writeFileSync(path.join(d, 'manifest.json'), JSON.stringify(m)); } }));
check(r.code === 1 && /public\.messages: the database had 51 rows right after the export but 50 were saved/.test(r.out), 'rows that appeared in the database during the export are reported (a user table must not differ)');
r = run(makeExport({ tamper: (d, m) => { m.tables['cron.job_run_details'] = { rows: 0, bytes: 2, sha256: hash('sha256', '[]'), dbMd5: null }; m.liveCountsAfter['cron.job_run_details'] = 9; fs.mkdirSync(path.join(d, 'tables'), { recursive: true }); fs.writeFileSync(path.join(d, 'tables', 'cron.job_run_details.json'), '[]'); fs.writeFileSync(path.join(d, 'manifest.json'), JSON.stringify(m)); } }));
check(r.code === 0, 'the scheduler log (cron) may grow while exporting: that is not an error', r.out);
r = run(makeExport({ tamper: (d) => fs.writeFileSync(path.join(d, 'tables', 'public.stray.json'), '[]') }));
check(r.code === 1 && /public\.stray\.json\.json|tables\/public\.stray\.json: a file the manifest does not know about/.test(r.out), 'a file nobody listed is reported');

section('3. It never writes');
const src = fs.readFileSync('scripts/verify-db-export.mjs', 'utf8');
check(!/writeFileSync|rmSync|unlinkSync|appendFileSync|rmdirSync|renameSync|fetch\(|createClient/.test(src), 'the checker only reads files: no write, delete, rename or network call in it');

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
