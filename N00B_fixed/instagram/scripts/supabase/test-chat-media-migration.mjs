// The copy-to-private-bucket tool (scripts/migrate-chat-media.mjs): its logic (scripts/supabase/chat-media-migration-core.mjs) tested with a fake storage. The point of these tests is
// safety: nothing is overwritten, a copy is verified byte for byte, the free-plan room is respected, and the ONLY stage that removes anything refuses unless every rule is met.
// Usage: node scripts/supabase/test-chat-media-migration.mjs
import fs from 'node:fs';
import * as C from './chat-media-migration-core.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const bytes = (s) => new TextEncoder().encode(s);
const expectThrow = async (fn, re, label) => { try { await fn(); check(false, label, '(no error)'); } catch (e) { check(re.test(e.message), label, `(got: ${e.message})`); } };
const MB = 1048576;

function world({ usage = 300 * MB, corruptUpload = false, failUpload = () => false } = {}) {
  const media = new Map([
    ['chat/1.jpg', bytes('one')], ['chat/2.mp4', bytes('two-two')], ['chat/3.m4a', bytes('three')],
    ['chat/4.sealed', bytes('ciphertext')], ['chat/5.jpg', bytes('five')]
  ]);
  const priv = new Map();
  const log = [], removed = [], uploads = [];
  const sizes = { 'chat/1.jpg': 3, 'chat/2.mp4': 7, 'chat/3.m4a': 5, 'chat/4.sealed': 10, 'chat/5.jpg': 4 };
  let messageRefs = ['chat/1.jpg', '/m/chat/2.mp4', 'https://x.supabase.co/storage/v1/object/public/media/chat/3.m4a?x=1', 'posts/zzz.jpg', 'chat/4.sealed'];
  const deps = {
    listMedia: async () => [...media].map(([key, b]) => ({ key, size: b.length, type: 'image/jpeg' })),
    listPrivate: async () => [...priv].map(([key, b]) => ({ key, size: b.length })),
    usageBytes: async () => usage,
    download: async (bucket, key) => { const m = bucket === 'media' ? media : priv; if (!m.has(key)) throw new Error(`404 ${bucket}/${key}`); return m.get(key); },
    upload: async (bucket, key, b) => {
      if (bucket !== 'chatmedia') throw new Error('only the private bucket is ever written');
      if (priv.has(key)) throw new Error('would overwrite');
      if (failUpload(key)) throw new Error('503');
      uploads.push(key); priv.set(key, corruptUpload ? bytes('garbage') : b);
    },
    remove: async (bucket, keys) => { removed.push([bucket, ...keys]); for (const k of keys) (bucket === 'media' ? media : priv).delete(k); },
    referencedKeys: async () => messageRefs,
    sleep: async () => undefined, now: () => new Date('2026-11-14T10:00:00Z'), log: (l) => log.push(l)
  };
  return { deps, media, priv, log, removed, uploads, setRefs: (r) => { messageRefs = r; }, sizes };
}

section('1. Plan: reads only');
let w = world();
const plan = await C.buildPlan(w.deps);
check(plan.count === 4 && plan.bytes === 3 + 7 + 5 + 4 && plan.skippedSealed === 1 && plan.files.every((f) => !f.key.endsWith('.sealed')), 'the plan lists the 4 plain chat files and leaves the locked one alone');
check(plan.toCopy === 4 && plan.usageAfterCopyBytes === 300 * MB + 19 && plan.safeCopyBytes === Math.floor(0.8 * 1024 * MB) - 300 * MB, 'it counts what is to be copied and the safe room (to 80% of 1 GB)');
check(w.uploads.length === 0 && w.removed.length === 0, 'planning changes nothing');
check(/Plain chat files in "media": 4/.test(C.describePlan(plan)), 'and it can be written out in words');

section('2. Copy');
let rep = await C.runCopy(w.deps, plan, { delayMs: 0 });
check(rep.copied.length === 4 && rep.failed.length === 0 && w.priv.size === 4, 'every plain file is copied under the same name');
check(!w.priv.has('chat/4.sealed') && w.media.size === 5, 'the locked file is not copied and no original was touched');
check(rep.copied.every((c) => c.sha256.length === 64), 'each copy was checked by its sha-256');
const again = await C.runCopy(w.deps, plan, { delayMs: 0 });
check(again.copied.length === 0 && again.skipped.length === 4 && w.uploads.length === 4, 'run again: resumable, copies nothing twice');

w = world({ corruptUpload: true });
rep = await C.runCopy(w.deps, await C.buildPlan(w.deps), { delayMs: 0, maxConsecutive: 99, minSample: 99 });
check(rep.copied.length === 0 && rep.failed.length === 4 && /does not match/.test(rep.failed[0].error), 'a copy whose bytes differ is reported as failed, never as copied');
w = world({ failUpload: (k) => k === 'chat/2.mp4' });
rep = await C.runCopy(w.deps, await C.buildPlan(w.deps), { delayMs: 0 });
check(rep.copied.length === 3 && rep.failed.length === 1 && rep.failed[0].key === 'chat/2.mp4', 'one failed file does not stop the others');
w = world({ failUpload: () => true });
rep = await C.runCopy(w.deps, await C.buildPlan(w.deps), { delayMs: 0, maxConsecutive: 2 });
check(rep.aborted && rep.failed.length === 2, 'it stops by itself when files keep failing');
w = world();
const p2 = await C.buildPlan(w.deps);
w.priv.set('chat/1.jpg', bytes('DIFFERENT-OLDER-FILE'));
rep = await C.runCopy(w.deps, p2, { delayMs: 0 });
check(rep.failed.some((f) => f.key === 'chat/1.jpg' && /not overwritten/.test(f.error)) && String(w.priv.get('chat/1.jpg').length) === '20', 'a different file already in the private bucket is never overwritten');

section('3. The free-plan room');
w = world({ usage: 800 * MB });
const bigPlan = { ...(await C.buildPlan(w.deps)) };
bigPlan.files = bigPlan.files.map((f) => ({ ...f, size: f.size })); 
const heavy = world({ usage: Math.floor(0.8 * 1024 * MB) - 5 });
await expectThrow(() => C.runCopy(heavy.deps, { ...bigPlan, files: bigPlan.files }, { delayMs: 0 }), /Refusing to copy/, 'copying that would pass 80% of the free 1 GB is refused before anything is written');
check(heavy.uploads.length === 0, '...nothing was written');
rep = await C.runCopy(heavy.deps, bigPlan, { delayMs: 0, force: true });
check(rep.copied.length === 4, '--force overrides it');
await expectThrow(() => C.runCopy(w.deps, { stage: 'verify' }, {}), /Not a plan file/, 'only a plan file is accepted');

section('4. Verify');
w = world();
const p3 = await C.buildPlan(w.deps);
await C.runCopy(w.deps, p3, { delayMs: 0 });
let ver = await C.runVerify(w.deps, p3);
check(ver.verified.length === 4 && ver.failed.length === 0, 'identical copies verify');
w.priv.set('chat/3.m4a', bytes('bitrot'));
ver = await C.runVerify(w.deps, p3);
check(ver.verified.length === 3 && ver.failed.length === 1 && ver.failed[0].key === 'chat/3.m4a', 'a copy that differs is caught');
w.priv.delete('chat/5.jpg');
ver = await C.runVerify(w.deps, p3);
check(ver.failed.some((f) => f.key === 'chat/5.jpg'), 'a missing copy is caught');

section('5. Deleting originals: every gate');
w = world();
const p4 = await C.buildPlan(w.deps);
await C.runCopy(w.deps, p4, { delayMs: 0 });
const good = await C.runVerify(w.deps, p4);
await expectThrow(() => C.runDeleteOriginals(w.deps, good, {}), /--i-have-a-backup/, 'refuses without --i-have-a-backup');
await expectThrow(() => C.runDeleteOriginals(w.deps, p4, { iHaveABackup: true }), /report written by --verify/, 'refuses with anything but a verify report (a plan or a copy report is not enough)');
await expectThrow(() => C.runDeleteOriginals(w.deps, null, { iHaveABackup: true }), /report/, 'refuses with no report');
await expectThrow(() => C.runDeleteOriginals(w.deps, { ...good, failed: [{ key: 'chat/1.jpg', error: 'x' }] }, { iHaveABackup: true }), /did not verify/, 'refuses when the report lists a failure');
check(w.removed.length === 0 && w.media.size === 5, 'none of those refusals removed anything');

w.setRefs(['chat/1.jpg', 'chat/2.mp4', 'chat/9-not-copied.jpg']);
w.media.set('chat/9-not-copied.jpg', bytes('nine'));
await expectThrow(() => C.runDeleteOriginals(w.deps, good, { iHaveABackup: true }), /still referenced by messages are not in chatmedia/, 'refuses while a message still points at a file that has no private copy');
check(w.removed.length === 0, '...and removes nothing');
w.media.delete('chat/9-not-copied.jpg');
w.setRefs(['chat/1.jpg', 'chat/gone-for-good.jpg', 'posts/p.jpg']);
const dry = await C.runDeleteOriginals(w.deps, good, { iHaveABackup: true, dryRun: true });
check(dry.deleted === 0 && dry.wouldDelete === 4 && w.removed.length === 0 && w.log.some((l) => /Will delete 4 original/.test(l)), 'a dry run prints what it would delete and deletes nothing (a message pointing at a file that exists nowhere does not block it)');

w.priv.set('chat/2.mp4', bytes('tampered'));     // the private copy changed after the report
w.priv.set('chat/3.m4a', bytes('three'));        // fine
const res = await C.runDeleteOriginals(w.deps, good, { iHaveABackup: true, batch: 2 });
check(res.deleted === 3 && w.media.has('chat/2.mp4') && !w.media.has('chat/1.jpg') && !w.media.has('chat/3.m4a') && !w.media.has('chat/5.jpg'), 'only originals whose private copy is STILL identical to the report are deleted (the tampered one is kept)');
check(w.media.has('chat/4.sealed') && w.removed.every((r) => r[0] === 'media') && w.removed.every((r) => r.slice(1).every((k) => !k.endsWith('.sealed'))), 'the locked file is never deleted, and nothing is ever removed from the private bucket');
check(w.removed.length === 2 && w.removed[0].length === 3, 'deletes in small batches');
check(w.priv.size === 4, 'every private copy is still there');

section('6. The command line tool');
const cli = fs.readFileSync('scripts/migrate-chat-media.mjs', 'utf8');
check(/else \{\s*\n\s*const plan = await buildPlan/.test(cli), 'with no flag it only makes the plan');
check((cli.match(/deps\.remove|runDeleteOriginals/g) || []).length >= 1 && !/remove\(\s*'chatmedia'/.test(cli) && /--delete-originals/.test(cli) && /--i-have-a-backup/.test(cli), 'removal exists only behind --delete-originals + --i-have-a-backup, and only for the public bucket');
check(/x-upsert': 'false'/.test(cli), 'uploads never overwrite');
check(!/console\.(log|error)\([^)]*service\b[^)]*\)/.test(cli.replace(/replace\(service, '\*\*\*'\)/g, '')) && /never printed/.test(cli), 'the service key is read from the environment and never printed');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
