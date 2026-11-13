// Copies the plain chat pictures, videos and voice notes from the public "media" bucket to the private "chatmedia" bucket (docs/PRIVATE-CHAT-MEDIA.md, phase B).
// Run by the OWNER in PowerShell, from the app folder. The two values are read from the environment and never printed or written anywhere:
//   $env:SUPABASE_URL = "https://abffssydapumuhwgzeck.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY = "<the service_role key>"
// Stages (no flag = --plan; only --delete-originals ever removes anything):
//   node scripts/migrate-chat-media.mjs --plan [--dir D:\noob-audit\chat-media]
//   node scripts/migrate-chat-media.mjs --copy [--force]
//   node scripts/migrate-chat-media.mjs --verify
//   node scripts/migrate-chat-media.mjs --delete-originals --i-have-a-backup [--dry-run]
// Files (plan / copy report / verify report / log) go to --dir (default ./chat-media-migration; put it on D: when C: is tight).
import fs from 'node:fs';
import path from 'node:path';
import { buildPlan, describePlan, runCopy, runVerify, runDeleteOriginals, chatKeyOf } from './supabase/chat-media-migration-core.mjs';

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const dir = path.resolve(val('--dir') || 'chat-media-migration');
const base = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const service = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!base || !service) { console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in this PowerShell window first (see the top of this file). They are never printed.'); process.exit(1); }
fs.mkdirSync(dir, { recursive: true });
const logFile = path.join(dir, 'migration.log');
const log = (line) => { const s = `${new Date().toISOString()} ${line}`; console.log(s); try { fs.appendFileSync(logFile, s + '\n'); } catch { /* the console line is enough */ } };

const H = { apikey: service, Authorization: `Bearer ${service}` };
const enc = (key) => key.split('/').map(encodeURIComponent).join('/');
async function api(method, p, body, extra = {}) {
  const res = await fetch(`${base}${p}`, { method, headers: { ...H, ...extra }, body });
  if (!res.ok) { const t = await res.text().catch(() => ''); throw new Error(`${method} ${p.split('?')[0].replace(/\/chat\/.*/, '/chat/...')} -> HTTP ${res.status} ${t.slice(0, 120).replace(service, '***')}`); }
  return res;
}
async function listBucket(bucket) {
  const out = [];
  for (let offset = 0; ; offset += 100) {
    const res = await api('POST', `/storage/v1/object/list/${bucket}`, JSON.stringify({ prefix: 'chat', limit: 100, offset, sortBy: { column: 'name', order: 'asc' } }), { 'Content-Type': 'application/json' });
    const rows = await res.json();
    for (const r of rows) if (r.id && r.name) out.push({ key: `chat/${r.name}`, size: Number(r.metadata?.size) || 0, type: r.metadata?.mimetype || '' });
    if (rows.length < 100) break;
  }
  return out;
}
const deps = {
  listMedia: () => listBucket('media'),
  listPrivate: async () => { try { return await listBucket('chatmedia'); } catch (e) { if (/HTTP (400|404)/.test(e.message)) throw new Error('The private bucket "chatmedia" does not exist yet: run supabase/migrations/20261114000002_chat_media_private_bucket.sql first.'); throw e; } },
  usageBytes: async () => Number((await (await api('POST', '/rest/v1/rpc/usage_probe', '{}', { 'Content-Type': 'application/json' })).json()).storage_bytes) || 0,
  download: async (bucket, key) => new Uint8Array(await (await api('GET', `/storage/v1/object/${bucket}/${enc(key)}`)).arrayBuffer()),
  upload: (bucket, key, bytes, type) => api('POST', `/storage/v1/object/${bucket}/${enc(key)}`, bytes, { 'Content-Type': type || 'application/octet-stream', 'x-upsert': 'false', 'cache-control': 'max-age=31536000' }),
  remove: (bucket, keys) => api('DELETE', `/storage/v1/object/${bucket}`, JSON.stringify({ prefixes: keys }), { 'Content-Type': 'application/json' }),
  referencedKeys: async () => {
    const keys = [];
    for (let from = 0; ; from += 1000) {
      const res = await api('GET', `/rest/v1/messages?select=media_url&media_url=not.is.null&order=created_at.asc`, undefined, { Range: `${from}-${from + 999}`, 'Range-Unit': 'items' });
      const rows = await res.json();
      for (const r of rows) { const k = chatKeyOf(r.media_url); if (k) keys.push(k); }
      if (rows.length < 1000) break;
    }
    return keys;
  },
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  now: () => new Date(),
  log
};
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const writeJson = (f, o) => fs.writeFileSync(f, JSON.stringify(o, null, 2));
const planFile = path.join(dir, 'plan.json'), copyFile = path.join(dir, 'copy-report.json'), verifyFile = path.join(dir, 'verify-report.json');

try {
  if (has('--copy')) {
    if (!fs.existsSync(planFile)) throw new Error('No plan yet: run --plan first.');
    const report = await runCopy(deps, readJson(planFile), { force: has('--force') });
    writeJson(copyFile, report);
    log(`copy done: ${report.copied.length} copied, ${report.skipped.length} already there, ${report.failed.length} failed${report.aborted ? ' - ' + report.aborted : ''}. Report: ${copyFile}`);
    process.exit(report.failed.length ? 2 : 0);
  } else if (has('--verify')) {
    if (!fs.existsSync(planFile)) throw new Error('No plan yet: run --plan first.');
    const report = await runVerify(deps, readJson(planFile));
    writeJson(verifyFile, report);
    log(`verify done: ${report.verified.length} identical, ${report.failed.length} problems. Report: ${verifyFile}`);
    process.exit(report.failed.length ? 2 : 0);
  } else if (has('--delete-originals')) {
    const reportPath = path.resolve(val('--report') || verifyFile);
    if (!fs.existsSync(reportPath)) throw new Error(`No verify report at ${reportPath}: run --verify first.`);
    const r = await runDeleteOriginals(deps, readJson(reportPath), { iHaveABackup: has('--i-have-a-backup'), dryRun: has('--dry-run') });
    log(has('--dry-run') ? `dry run: ${r.wouldDelete} original(s) would be deleted, none were.` : `deleted ${r.deleted} original(s).`);
  } else {
    const plan = await buildPlan(deps);
    writeJson(planFile, plan);
    console.log(describePlan(plan));
    log(`plan written: ${planFile} (nothing was changed)`);
  }
} catch (err) {
  log(`STOPPED: ${String(err && err.message || err).replace(service, '***')}`);
  process.exit(1);
}
