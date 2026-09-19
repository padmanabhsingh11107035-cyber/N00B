// Uploads the backed-up media (backups/<stamp>/media/**) into your Supabase Storage bucket "media",
// keeping every file's key exactly as the data refers to it ("posts/123-abc.jpg" ...).
// It only ADDS files: a file that is already there is left alone, nothing is overwritten or deleted.
// Afterwards it fetches each file back through its public address and checks the size matches.
//
//   $env:SUPABASE_URL = "https://<project-ref>.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY = "<secret key>"      # typed into YOUR terminal, never shared
//   node scripts/upload-media-to-supabase.mjs
//
// Run the media-storage migration first (it creates the "media" bucket).
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !secret) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not set. Set them in your terminal first (see the top of this file).');
  process.exit(1);
}
let host;
try { host = new URL(url).host; } catch { console.error('SUPABASE_URL is not a valid URL.'); process.exit(1); }
if (!/^([a-z0-9]{10,}\.supabase\.(co|in)|localhost(:\d+)?|127\.0\.0\.1(:\d+)?)$/.test(host)) {
  console.error(`SUPABASE_URL host "${host}" does not look like a Supabase project. Aborting.`);
  process.exit(1);
}

const backupsRoot = 'backups';
const dir = process.argv.slice(2).find((a) => !a.startsWith('--'))
  || path.join(backupsRoot, fs.readdirSync(backupsRoot).filter((d) => fs.existsSync(path.join(backupsRoot, d, 'media'))).sort().pop() || '');
const mediaDir = path.join(dir, 'media');
if (!fs.existsSync(mediaDir)) { console.error(`No media folder at "${mediaDir}". Run scripts/backup-b2-media.mjs first.`); process.exit(1); }

const TYPES = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', avif: 'image/avif',
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', m4v: 'video/x-m4v',
  mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg'
};

function* walk(base, rel = '') {
  for (const entry of fs.readdirSync(path.join(base, rel), { withFileTypes: true })) {
    const next = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) yield* walk(base, next);
    else if (!entry.name.endsWith('.part')) yield next;
  }
}

const sb = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
const files = [...walk(mediaDir)];
console.log(`Uploading ${files.length} file(s) from ${mediaDir} to ${host} ...`);

const result = { uploaded: 0, alreadyThere: 0, failed: [], verified: 0, mismatched: [] };
for (const [i, key] of files.entries()) {
  const buffer = fs.readFileSync(path.join(mediaDir, ...key.split('/')));
  const ext = key.split('.').pop().toLowerCase();
  const label = `[${i + 1}/${files.length}] ${key}`;
  const { error } = await sb.storage.from('media').upload(key, buffer, { contentType: TYPES[ext] || 'application/octet-stream', cacheControl: '31536000', upsert: false });
  if (error) {
    const already = /already exists|duplicate/i.test(error.message || '') || String(error.statusCode) === '409';
    if (already) { result.alreadyThere++; console.log(`${label}  already there`); }
    else { result.failed.push({ key, error: error.message }); console.log(`${label}  FAILED (${error.message})`); continue; }
  } else {
    result.uploaded++;
    console.log(`${label}  uploaded (${(buffer.length / 1024).toFixed(0)} KB)`);
  }
  // prove it is really reachable, exactly the way the website will fetch it
  try {
    const res = await fetch(`${url}/storage/v1/object/public/media/${key.split('/').map(encodeURIComponent).join('/')}`);
    const size = Buffer.from(await res.arrayBuffer()).length;
    if (res.ok && size === buffer.length) result.verified++;
    else result.mismatched.push({ key, status: res.status, size });
  } catch (e) {
    result.mismatched.push({ key, status: 'network', size: 0 });
  }
}

console.log('');
console.log(`Done. ${result.uploaded} uploaded, ${result.alreadyThere} were already there, ${result.failed.length} failed.`);
console.log(`Checked through the public address: ${result.verified} of ${files.length} match in size.`);
if (result.failed.length) { console.log('Failed uploads:'); result.failed.forEach((f) => console.log(`  ${f.key}: ${f.error}`)); }
if (result.mismatched.length) { console.log('Not reachable / wrong size:'); result.mismatched.forEach((m) => console.log(`  ${m.key} (status ${m.status}, ${m.size} bytes)`)); }
// (set the code instead of calling process.exit — exiting with network connections still closing makes Node on Windows print a scary assertion)
process.exitCode = result.failed.length || result.mismatched.length ? 3 : 0;
