// Read-only copy of every media file the backup points at (profile photos,
// post photos, reel videos/thumbnails, ...) from the Backblaze B2 bucket to
// a local folder. It only ever READS from B2 (GetObject) — never uploads,
// changes or deletes anything there.
//
// The list of files comes from <backup>/media-keys.json, which
// scripts/build-backup-report.mjs writes.
//
// Usage (PowerShell, from the instagram folder). Use a READ-ONLY B2
// application key limited to this bucket (B2 console -> Application Keys ->
// Add a New Application Key -> Type of Access: Read Only). Type the values
// into your own terminal; they are read from the environment and never
// printed or saved:
//
//   $env:B2_KEY_ID = "<keyID>"
//   $env:B2_APPLICATION_KEY = "<applicationKey>"
//   node scripts/backup-b2-media.mjs
//
// Optional: $env:B2_BUCKET_NAME, $env:B2_ENDPOINT (same defaults as the app),
// and a backup folder as the first argument.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

const keyId = process.env.B2_KEY_ID;
const applicationKey = process.env.B2_APPLICATION_KEY;
if (!keyId || !applicationKey) {
  console.error('B2_KEY_ID and B2_APPLICATION_KEY are not set. Set them in your terminal first (see usage at the top of this file).');
  process.exit(1);
}
const bucket = process.env.B2_BUCKET_NAME || 'noob-learning-media';
const endpoint = process.env.B2_ENDPOINT || 'https://s3.us-east-005.backblazeb2.com';

const backupsRoot = 'backups';
const dir = process.argv[2]
  || path.join(backupsRoot, fs.readdirSync(backupsRoot).filter(d => fs.existsSync(path.join(backupsRoot, d, 'media-keys.json'))).sort().pop() || '');
const listFile = path.join(dir, 'media-keys.json');
if (!fs.existsSync(listFile)) {
  console.error(`No media-keys.json in "${dir}". Run scripts/build-backup-report.mjs first.`);
  process.exit(1);
}
const keys = JSON.parse(fs.readFileSync(listFile, 'utf8'));
const mediaDir = path.join(dir, 'media');

// The region is part of the endpoint ("s3.<region>.backblazeb2.com"), so
// derive it — a bucket in another region then only needs B2_ENDPOINT set.
const region = process.env.B2_REGION
  || (endpoint.match(/s3\.([a-z0-9-]+)\.backblazeb2\.com/) || [])[1]
  || 'us-east-005';

const client = new S3Client({
  endpoint,
  region,
  forcePathStyle: true,
  credentials: { accessKeyId: keyId, secretAccessKey: applicationKey }
});

const manifest = [];
const failed = [];
let totalBytes = 0;

for (const [i, key] of keys.entries()) {
  const label = `[${i + 1}/${keys.length}] ${key}`;
  // Keys are always "folder/file"; refuse anything that could escape the folder.
  if (key.includes('..') || path.isAbsolute(key)) { failed.push({ key, error: 'unsafe key' }); console.log(`${label}  SKIPPED (unsafe name)`); continue; }
  const target = path.join(mediaDir, ...key.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  try {
    const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const hash = crypto.createHash('sha256');
    const tmp = `${target}.part`;
    await pipeline(res.Body, async function* (source) {
      for await (const chunk of source) { hash.update(chunk); yield chunk; }
    }, fs.createWriteStream(tmp));
    const bytes = fs.statSync(tmp).size;
    // The size B2 announced must match what actually landed on disk.
    if (res.ContentLength !== undefined && res.ContentLength !== bytes) throw new Error(`size mismatch (expected ${res.ContentLength}, got ${bytes})`);
    fs.renameSync(tmp, target);
    manifest.push({ key, bytes, sha256: hash.digest('hex'), contentType: res.ContentType || '' });
    totalBytes += bytes;
    console.log(`${label}  ok (${(bytes / 1024).toFixed(0)} KB)`);
  } catch (err) {
    failed.push({ key, error: err?.name || String(err) });
    console.log(`${label}  FAILED (${err?.name || err})`);
  }
}

fs.writeFileSync(path.join(dir, 'media-manifest.json'), JSON.stringify({ bucket, savedAt: new Date().toISOString(), files: manifest, failed }, null, 2));
console.log('');
console.log(`Done. ${manifest.length} of ${keys.length} files saved (${(totalBytes / 1024 / 1024).toFixed(1)} MB) in ${mediaDir}`);
if (failed.length) {
  console.log(`${failed.length} file(s) could NOT be saved — see media-manifest.json:`);
  failed.forEach(f => console.log(`  ${f.key}: ${f.error}`));
  process.exit(3);
}
