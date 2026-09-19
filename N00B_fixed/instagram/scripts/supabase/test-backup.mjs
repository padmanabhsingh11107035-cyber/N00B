// Tests the backup logic with a stand-in Supabase client (no network, no keys): every row and file must be saved
// exactly, a wrong count or an error must make the backup report FAILED, and a tampered backup must be caught.
// Usage: node scripts/supabase/test-backup.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runBackup, verifyBackupFolder, listMedia } from './backup-core.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);

// ---- a stand-in database + storage
function fakeClient({ tables, files, breakTable = null, lieCount = null }) {
  const calls = [];
  return {
    calls,
    from: (t) => ({
      select: (_cols, opts) => ({
        range: async (a, b) => {
          calls.push(`${t}:${a}-${b}`);
          if (t === breakTable) return { data: null, error: { message: 'permission denied' } };
          const all = tables[t] || [];
          return { data: all.slice(a, b + 1), count: opts && opts.count ? (lieCount && lieCount[t] !== undefined ? lieCount[t] : all.length) : undefined, error: null };
        }
      })
    }),
    storage: {
      from: () => ({
        list: async (prefix, { limit, offset }) => {
          const entries = new Map();
          for (const key of Object.keys(files)) {
            if (prefix && !key.startsWith(prefix + '/')) continue;
            const rest = prefix ? key.slice(prefix.length + 1) : key;
            const [head, ...tail] = rest.split('/');
            if (tail.length) entries.set(head, { name: head, id: null, metadata: null });
            else entries.set(head, { name: head, id: 'x', metadata: { size: files[key].length } });
          }
          return { data: [...entries.values()].slice(offset, offset + limit), error: null };
        },
        download: async (key) => (files[key] === undefined ? { data: null, error: { message: 'not found' } } : { data: new Blob([files[key]]), error: null })
      })
    }
  };
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'noob-backup-'));

const bigTable = Array.from({ length: 2345 }, (_, i) => ({ id: i, text: `row ${i} with "quotes", ünïcode 🎉` }));
const tables = { profiles: [{ id: 'a', username: 'ana' }, { id: 'b', username: 'bob' }], posts: bigTable, empty_one: [] };
const files = { 'posts/a.jpg': 'JPEGDATA', 'avatars/b.png': 'PNGDATA-1234', 'stories/deep/er/c.mp4': 'V'.repeat(5000), 'top.txt': 'hi' };

section('1. A good backup');
let out = tmp();
let log = [];
let m = await runBackup({ client: fakeClient({ tables, files }), outDir: out, tables: ['profiles', 'posts', 'empty_one'], log: (s) => log.push(s) });
check(m.ok && m.problems.length === 0, 'the backup reports success');
check(m.tables.profiles.rows === 2 && m.tables.posts.rows === 2345 && m.tables.empty_one.rows === 0, 'the row counts are exact (including a table bigger than one page, and an empty one)');
const saved = JSON.parse(fs.readFileSync(path.join(out, 'tables', 'posts.json'), 'utf8'));
check(saved.length === 2345 && saved[2344].text === 'row 2344 with "quotes", ünïcode 🎉' && saved.every((r, i) => r.id === i), 'every row is saved in full, in order, with special characters intact');
check(m.media.files === 4 && m.media.bytes === 8 + 12 + 5000 + 2, 'all 4 files are saved (including ones in folders inside folders)');
check(fs.readFileSync(path.join(out, 'media', 'stories', 'deep', 'er', 'c.mp4'), 'utf8') === 'V'.repeat(5000) && fs.readFileSync(path.join(out, 'media', 'posts', 'a.jpg'), 'utf8') === 'JPEGDATA', 'file contents are byte-for-byte the same');
let v = verifyBackupFolder(out);
check(v.ok && v.problems.length === 0, 'the finished backup verifies against its own manifest');

section('2. It only ever READS');
const c2 = fakeClient({ tables, files });
await runBackup({ client: c2, outDir: tmp(), tables: ['profiles'], log: () => {}, withMedia: false });
check(c2.calls.every((c) => /^\w+:\d+-\d+$/.test(c)) && !('insert' in c2.from('x')) && !('delete' in c2.from('x')) && !('update' in c2.from('x')), 'the stand-in offered no way to write — and the backup did not need one');

section('3. Problems are never hidden');
m = await runBackup({ client: fakeClient({ tables, files, breakTable: 'posts' }), outDir: tmp(), tables: ['profiles', 'posts'], log: () => {}, withMedia: false });
check(!m.ok && m.problems.some((p) => /posts: permission denied/.test(p)) && m.tables.profiles.rows === 2, 'a table that can not be read makes the backup FAILED (other tables are still saved)');
m = await runBackup({ client: fakeClient({ tables, files, lieCount: { profiles: 5 } }), outDir: tmp(), tables: ['profiles'], log: () => {}, withMedia: false });
check(!m.ok && m.problems.some((p) => /saved 2 rows but the database reports 5/.test(p)), 'if the number of rows saved differs from what the database reports, it FAILS');
m = await runBackup({ client: fakeClient({ tables, files: { ...files } }), outDir: tmp(), tables: ['profiles'], log: () => {}, withMedia: true });
check(m.ok, '(control) a healthy run is still OK');
const c3 = fakeClient({ tables, files });
const origDownload = c3.storage.from().download;
c3.storage.from = () => ({ list: fakeClient({ tables, files }).storage.from().list, download: async (k) => (k === 'posts/a.jpg' ? { data: null, error: { message: 'boom' } } : origDownload(k)) });
m = await runBackup({ client: c3, outDir: tmp(), tables: ['profiles'], log: () => {} });
check(!m.ok && m.problems.some((p) => /posts\/a\.jpg/.test(p)) && m.media.missing.includes('posts/a.jpg'), 'a file that can not be downloaded makes the backup FAILED and is named');

section('4. Tampering and damage are detected later');
out = tmp();
await runBackup({ client: fakeClient({ tables, files }), outDir: out, tables: ['profiles', 'posts'], log: () => {}, withMedia: false });
fs.writeFileSync(path.join(out, 'tables', 'profiles.json'), '[]');
v = verifyBackupFolder(out);
check(!v.ok && v.problems.some((p) => /profiles: file changed/.test(p)), 'a table file that was edited afterwards is caught');
fs.rmSync(path.join(out, 'tables', 'posts.json'));
v = verifyBackupFolder(out);
check(!v.ok && v.problems.some((p) => /posts: file is missing/.test(p)), 'a deleted table file is caught');

section('5. Listing files');
const listed = await listMedia(fakeClient({ tables, files }));
check(listed.length === 4 && listed.map((f) => f.key).sort().join() === ['avatars/b.png', 'posts/a.jpg', 'stories/deep/er/c.mp4', 'top.txt'].join(), 'every file in every folder is found', JSON.stringify(listed));

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
