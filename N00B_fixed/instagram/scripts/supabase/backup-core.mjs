// The logic of the Supabase backup, kept separate from HOW it connects so it can be tested with a stand-in client.
//
// Safety properties:
//   * READ-ONLY: it only ever selects / lists / downloads. It never writes to, or deletes from, the project.
//   * Every table is read completely (paged), then the number of rows saved is compared with the number the
//     database reports; ANY mismatch or error makes the whole backup report FAILED (and exit code 1).
//   * Every file is written next to a manifest (row counts, file sizes, SHA-256) so a backup can be verified later.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const TABLES = [
  'profiles', 'profile_private', 'push_subscriptions', 'follows', 'follow_requests', 'blocks', 'posts', 'post_slides', 'post_likes', 'post_saves', 'post_views',
  'reels', 'reel_likes', 'reel_saves', 'reel_views', 'comments', 'notifications', 'notification_reads', 'notification_clears', 'chats', 'chat_members', 'messages', 'chat_reviews',
  'game_scores', 'noob_transactions', 'coupons', 'coupon_uses', 'app_settings', 'support_reviews', 'legacy_import', 'stories', 'story_views', 'story_comments', 'highlights',
  'music_tracks', 'music_likes', 'custom_stickers', 'collections', 'collection_posts', 'shop_items', 'live_avatar_presets', 'store_products', 'scratch_cards', 'reports',
  'game_rooms', 'matchmaking_queue', 'user_game_state', 'recovery_attempts'
];
const PAGE = 1000;
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

export async function backupTable(client, table) {
  const first = await client.from(table).select('*', { count: 'exact' }).range(0, PAGE - 1);
  if (first.error) throw new Error(`${table}: ${first.error.message}`);
  const expected = first.count;
  let rows = first.data || [];
  while (rows.length < expected) {
    const next = await client.from(table).select('*').range(rows.length, rows.length + PAGE - 1);
    if (next.error) throw new Error(`${table}: ${next.error.message}`);
    if (!next.data || next.data.length === 0) break;
    rows = rows.concat(next.data);
  }
  if (rows.length !== expected) throw new Error(`${table}: saved ${rows.length} rows but the database reports ${expected}`);
  return rows;
}

// every file in the media bucket (folders are walked)
export async function listMedia(client, bucket = 'media') {
  const files = [];
  async function walk(prefix) {
    let offset = 0;
    for (;;) {
      const { data, error } = await client.storage.from(bucket).list(prefix, { limit: 1000, offset });
      if (error) throw new Error(`storage list "${prefix}": ${error.message}`);
      if (!data || data.length === 0) break;
      for (const item of data) {
        const full = prefix ? `${prefix}/${item.name}` : item.name;
        if (item.id === null || item.metadata === null || item.metadata === undefined) await walk(full); // a folder
        else files.push({ key: full, size: item.metadata.size ?? null });
      }
      if (data.length < 1000) break;
      offset += 1000;
    }
  }
  await walk('');
  return files;
}

export async function runBackup({ client, outDir, tables = TABLES, log = console.log, withMedia = true, bucket = 'media' }) {
  const problems = [];
  const manifest = { createdAt: new Date().toISOString(), tables: {}, media: { files: 0, bytes: 0, missing: [] } };
  fs.mkdirSync(path.join(outDir, 'tables'), { recursive: true });

  for (const t of tables) {
    try {
      const rows = await backupTable(client, t);
      const body = Buffer.from(JSON.stringify(rows, null, 1), 'utf8');
      fs.writeFileSync(path.join(outDir, 'tables', `${t}.json`), body);
      manifest.tables[t] = { rows: rows.length, bytes: body.length, sha256: sha256(body) };
      log(`  ${t.padEnd(22)} ${String(rows.length).padStart(6)} rows`);
    } catch (e) {
      problems.push(e.message);
      manifest.tables[t] = { error: e.message };
      log(`  ${t.padEnd(22)} FAILED: ${e.message}`);
    }
  }

  if (withMedia) {
    try {
      const files = await listMedia(client, bucket);
      log(`  media: ${files.length} file(s) in the "${bucket}" bucket`);
      for (const f of files) {
        const { data, error } = await client.storage.from(bucket).download(f.key);
        if (error || !data) { problems.push(`media ${f.key}: ${error?.message || 'no data'}`); manifest.media.missing.push(f.key); continue; }
        const buf = Buffer.from(await data.arrayBuffer());
        const dest = path.join(outDir, 'media', ...f.key.split('/'));
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, buf);
        manifest.media.files++; manifest.media.bytes += buf.length;
        if (f.size != null && Number(f.size) !== buf.length) problems.push(`media ${f.key}: expected ${f.size} bytes, saved ${buf.length}`);
      }
    } catch (e) {
      problems.push(`media: ${e.message}`);
    }
  }

  manifest.ok = problems.length === 0;
  manifest.problems = problems;
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}

// Re-reads a finished backup from disk and checks it against its own manifest (nothing is contacted).
export function verifyBackupFolder(outDir) {
  const problems = [];
  const manifest = JSON.parse(fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf8'));
  for (const [t, info] of Object.entries(manifest.tables)) {
    if (info.error) { problems.push(`${t}: was not saved (${info.error})`); continue; }
    const file = path.join(outDir, 'tables', `${t}.json`);
    if (!fs.existsSync(file)) { problems.push(`${t}: file is missing`); continue; }
    const buf = fs.readFileSync(file);
    if (sha256(buf) !== info.sha256) problems.push(`${t}: file changed since the backup was made`);
    else if (JSON.parse(buf.toString('utf8')).length !== info.rows) problems.push(`${t}: row count differs from the manifest`);
  }
  return { ok: problems.length === 0 && manifest.ok !== false, problems, manifest };
}
