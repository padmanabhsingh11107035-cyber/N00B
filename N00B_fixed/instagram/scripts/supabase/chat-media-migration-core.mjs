// The logic of scripts/migrate-chat-media.mjs, with every outside thing (Supabase, the disk, the clock) handed in, so it can be tested with fakes
// (scripts/supabase/test-chat-media-migration.mjs). Nothing here talks to a network by itself.
//
// The four stages (docs/PRIVATE-CHAT-MEDIA.md):
//   plan             lists the plain chat files in the "media" bucket (never the locked *.sealed ones), counts them and their bytes, and checks the free-plan room. Changes nothing.
//   copy             COPIES each file to the private "chatmedia" bucket under the same name; verifies size and sha-256 of the uploaded copy against the original. Resumable. Changes no original.
//   verify           re-reads both copies of every planned file and writes a report. Changes nothing.
//   delete-originals the only stage that removes anything, and only originals whose verified copy is still identical, and only with a report + --i-have-a-backup.
import { createHash } from 'node:crypto';
import { LIMITS } from './usage-core.mjs';

export const FREE_STORAGE_LIMIT = LIMITS.storage_bytes;
export const COPY_MAX_USAGE = 0.8;

/** "chat/123-abc.jpg" when this stored value (a bare key, /m/<key>, /media/<key>, a full address, with ?query) is a plain chat file; else null. Same rules as the database's chat_media_key_of. */
export function chatKeyOf(value) {
  let v = String(value ?? '').trim();
  if (!v || /^(data|blob):/i.test(v) || v.startsWith('pending:')) return null;
  v = v.replace(/[?#].*$/, '').replace(/^https?:\/\/[^/]+\//i, '/');
  v = v.replace(/^\/(storage\/v1\/object\/(public|authenticated|sign)\/(media|chatmedia)|m|media)\//, '').replace(/^\/+/, '');
  v = v.replace(/%40/g, '@').replace(/%2B/gi, '+').replace(/%3D/gi, '=');
  return /^chat\/[A-Za-z0-9._~@+=-]{1,160}$/.test(v) ? v : null;
}
export const isPlainChatKey = (key) => !!chatKeyOf(key) && !key.endsWith('.sealed');

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const mb = (b) => `${(b / 1048576).toFixed(1)} MB`;

/**
 * deps: {
 *   listMedia(): [{ key, size, type }]          every file under chat/ in the media bucket
 *   listPrivate(): [{ key, size }]              every file under chat/ in the chatmedia bucket
 *   usageBytes(): number                         total bytes of ALL stored files now (usage_probe)
 *   download(bucket, key): Uint8Array
 *   upload(bucket, key, bytes, type): void       must NOT overwrite
 *   remove(bucket, keys): void
 *   referencedKeys(): string[]                   every stored message value that points at a chat file (any form)
 *   sleep(ms), now(): Date, log(line)
 * }
 */

export async function buildPlan(deps) {
  const all = await deps.listMedia();
  const files = all.filter((f) => isPlainChatKey(f.key)).map((f) => ({ key: f.key, size: Number(f.size) || 0, type: f.type || '' }));
  const sealed = all.length - files.length;
  const priv = new Map((await deps.listPrivate()).map((f) => [f.key, Number(f.size) || 0]));
  const todo = files.filter((f) => priv.get(f.key) !== f.size);
  const usage = await deps.usageBytes();
  const bytes = files.reduce((a, f) => a + f.size, 0);
  const todoBytes = todo.reduce((a, f) => a + f.size, 0);
  const afterCopy = usage + todoBytes;
  return {
    stage: 'plan', createdAt: deps.now().toISOString(),
    count: files.length, bytes, alreadyCopied: files.length - todo.length, toCopy: todo.length, toCopyBytes: todoBytes,
    skippedSealed: sealed, usageBytes: usage, limitBytes: FREE_STORAGE_LIMIT,
    usageAfterCopyBytes: afterCopy, usageAfterCopyPct: +(100 * afterCopy / FREE_STORAGE_LIMIT).toFixed(1),
    safeCopyBytes: Math.max(0, Math.floor(COPY_MAX_USAGE * FREE_STORAGE_LIMIT) - usage),
    files
  };
}

export function describePlan(plan) {
  return [
    `Plain chat files in "media": ${plan.count} (${mb(plan.bytes)}); locked files left alone: ${plan.skippedSealed}`,
    `Already copied: ${plan.alreadyCopied}; still to copy: ${plan.toCopy} (${mb(plan.toCopyBytes)})`,
    `Storage now: ${mb(plan.usageBytes)} of ${mb(plan.limitBytes)}. After copying: ${mb(plan.usageAfterCopyBytes)} (${plan.usageAfterCopyPct}%). Safe room to copy (to 80%): ${mb(plan.safeCopyBytes)}`
  ].join('\n');
}

export async function runCopy(deps, plan, opts = {}) {
  const { force = false, delayMs = 150, minSample = 10, maxErrorRate = 0.2, maxConsecutive = 5 } = opts;
  if (!plan || plan.stage !== 'plan' || !Array.isArray(plan.files)) throw new Error('Not a plan file. Run --plan first.');
  const usage = await deps.usageBytes();
  const priv = new Map((await deps.listPrivate()).map((f) => [f.key, Number(f.size) || 0]));
  const todo = plan.files.filter((f) => isPlainChatKey(f.key) && priv.get(f.key) !== f.size);
  const need = todo.reduce((a, f) => a + f.size, 0);
  if (!force && usage + need > COPY_MAX_USAGE * FREE_STORAGE_LIMIT) {
    throw new Error(`Refusing to copy: storage is ${mb(usage)} now, copying ${mb(need)} more would reach ${mb(usage + need)}, over ${Math.round(COPY_MAX_USAGE * 100)}% of the free ${mb(FREE_STORAGE_LIMIT)}. Free some space, copy in smaller parts, or use --force if you accept the risk.`);
  }
  const report = { stage: 'copy', startedAt: deps.now().toISOString(), copied: [], skipped: [], failed: [], aborted: null };
  let attempts = 0, consecutive = 0;
  for (const f of plan.files) {
    if (!isPlainChatKey(f.key)) continue;
    if (priv.get(f.key) === f.size) { report.skipped.push(f.key); continue; }
    attempts++;
    try {
      const original = await deps.download('media', f.key);
      if (original.length !== f.size) throw new Error(`original is ${original.length} bytes, the plan said ${f.size}`);
      const want = sha256(original);
      if (priv.has(f.key)) throw new Error('a different file with this name is already in chatmedia (not overwritten)');
      await deps.upload('chatmedia', f.key, original, f.type || 'application/octet-stream');
      const back = await deps.download('chatmedia', f.key);
      if (back.length !== original.length || sha256(back) !== want) throw new Error('the uploaded copy does not match the original');
      report.copied.push({ key: f.key, size: f.size, sha256: want });
      priv.set(f.key, f.size);
      consecutive = 0;
      deps.log(`copied ${f.key} (${f.size} bytes)`);
    } catch (err) {
      report.failed.push({ key: f.key, error: String(err && err.message || err).slice(0, 200) });
      consecutive++;
      deps.log(`FAILED ${f.key}: ${String(err && err.message || err).slice(0, 200)}`);
      if (consecutive >= maxConsecutive || (attempts >= minSample && report.failed.length / attempts > maxErrorRate)) {
        report.aborted = `stopped after ${report.failed.length} failures in ${attempts} tries`;
        deps.log(report.aborted);
        break;
      }
    }
    if (delayMs) await deps.sleep(delayMs);
  }
  report.finishedAt = deps.now().toISOString();
  return report;
}

export async function runVerify(deps, plan) {
  if (!plan || plan.stage !== 'plan' || !Array.isArray(plan.files)) throw new Error('Not a plan file. Run --plan first.');
  const report = { stage: 'verify', createdAt: deps.now().toISOString(), verified: [], failed: [] };
  for (const f of plan.files) {
    if (!isPlainChatKey(f.key)) continue;
    try {
      const a = await deps.download('media', f.key);
      const b = await deps.download('chatmedia', f.key);
      if (a.length !== b.length || sha256(a) !== sha256(b)) throw new Error('copy differs from original');
      report.verified.push({ key: f.key, size: a.length, sha256: sha256(a) });
    } catch (err) {
      report.failed.push({ key: f.key, error: String(err && err.message || err).slice(0, 200) });
    }
  }
  return report;
}

/** returns { deleted, refused? }. Throws (and removes nothing) when a rule is not met. */
export async function runDeleteOriginals(deps, report, { iHaveABackup = false, dryRun = false, batch = 50 } = {}) {
  if (!iHaveABackup) throw new Error('Refusing: add --i-have-a-backup once the media files are backed up (docs/BACKUP.md). Nothing was deleted.');
  if (!report || report.stage !== 'verify' || !Array.isArray(report.verified)) throw new Error('Refusing: needs the report written by --verify (--report <file>). Nothing was deleted.');
  if (report.failed && report.failed.length) throw new Error(`Refusing: the report lists ${report.failed.length} file(s) that did not verify. Fix them and run --verify again. Nothing was deleted.`);
  const verified = new Map(report.verified.filter((v) => isPlainChatKey(v.key)).map((v) => [v.key, v]));
  const priv = new Map((await deps.listPrivate()).map((f) => [f.key, Number(f.size) || 0]));
  const media = new Map((await deps.listMedia()).map((f) => [f.key, Number(f.size) || 0]));
  // a message that still points at a chat file whose original exists but whose private copy does not: the originals would be the only copy
  const loose = [...new Set((await deps.referencedKeys()).map(chatKeyOf).filter((k) => k && !k.endsWith('.sealed')))].filter((k) => media.has(k) && !priv.has(k));
  if (loose.length) throw new Error(`Refusing: ${loose.length} file(s) still referenced by messages are not in chatmedia (first: ${loose[0]}). Run --plan and --copy again. Nothing was deleted.`);
  // each original is re-checked right now against the verified copy
  const safe = [];
  for (const [key, v] of verified) {
    if (!media.has(key)) continue;                                    // already gone
    if (priv.get(key) !== v.size || media.get(key) !== v.size) { deps.log(`SKIP ${key}: sizes changed since the report`); continue; }
    const copy = await deps.download('chatmedia', key);
    if (copy.length !== v.size || sha256(copy) !== v.sha256) { deps.log(`SKIP ${key}: the private copy no longer matches the report`); continue; }
    safe.push(key);
  }
  const bytes = safe.reduce((a, k) => a + (verified.get(k).size || 0), 0);
  deps.log(`Will delete ${safe.length} original file(s) from "media" (${mb(bytes)}); each has a verified identical copy in "chatmedia".`);
  for (const k of safe.slice(0, 20)) deps.log(`  ${k}`);
  if (safe.length > 20) deps.log(`  ... and ${safe.length - 20} more`);
  if (dryRun) return { deleted: 0, wouldDelete: safe.length };
  let deleted = 0;
  for (let i = 0; i < safe.length; i += batch) {
    const part = safe.slice(i, i + batch);
    await deps.remove('media', part);
    deleted += part.length;
    deps.log(`deleted ${deleted}/${safe.length}`);
  }
  return { deleted, wouldDelete: safe.length };
}
