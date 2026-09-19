// What can a completely logged-out visitor holding the PUBLIC key see, call or change? It tries EVERYTHING:
// every database function the migrations define, every table (read and write), and file uploads.
// Nothing here can change data: a call only "succeeds" if the database wrongly lets a stranger in.
//
//   $env:SUPABASE_URL = "https://<ref>.supabase.co"
//   $env:SUPABASE_PUBLISHABLE_KEY = "sb_publishable_..."
//   node scripts/live-check-exposure.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) { console.error('Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY first.'); process.exit(1); }
let passed = 0, failed = 0;
const check = (ok, label, detail = '') => { if (ok) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const c = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

// every function the database defines (read from the migration files)
const dir = 'supabase/migrations';
const fnNames = [...new Set(fs.readdirSync(dir).filter((f) => f.endsWith('.sql'))
  .flatMap((f) => [...fs.readFileSync(path.join(dir, f), 'utf8').matchAll(/create or replace function public\.([a-z_0-9]+)\(/g)].map((m) => m[1])))].sort();
const allowed = new Set(['check_signup', 'resolve_login_email', 'username_taken']);

console.log('\nEvery database function, called by a logged-out visitor');
const ran = [];
for (const f of fnNames.filter((n) => !allowed.has(n))) {
  const r = await c.rpc(f, {});
  if (!r.error) ran.push(f); // it RAN for a stranger — that would be a leak
}
console.log(`  (${fnNames.length} functions defined; ${fnNames.length - allowed.size} tried as a visitor, ${allowed.size} are the allowed sign-up / login helpers)`);
check(ran.length === 0, 'not one of them runs for a logged-out visitor', 'RAN: ' + ran.join(', '));

console.log('\nEvery table, read and written by a logged-out visitor');
const tables = ['profiles', 'profile_private', 'push_subscriptions', 'follows', 'follow_requests', 'blocks', 'posts', 'post_slides', 'post_likes', 'post_saves', 'post_views',
  'reels', 'reel_likes', 'reel_saves', 'reel_views', 'comments', 'notifications', 'notification_reads', 'notification_clears', 'chats', 'chat_members', 'messages', 'chat_reviews',
  'game_scores', 'noob_transactions', 'coupons', 'coupon_uses', 'app_settings', 'support_reviews', 'legacy_import', 'stories', 'story_views', 'story_comments', 'highlights',
  'music_tracks', 'music_likes', 'custom_stickers', 'collections', 'collection_posts', 'shop_items', 'live_avatar_presets', 'store_products', 'scratch_cards', 'reports',
  'game_rooms', 'matchmaking_queue', 'user_game_state', 'recovery_attempts'];
const leaks = [], writes = [];
for (const t of tables) {
  const r = await c.from(t).select('*').limit(1);
  if (!r.error && (r.data || []).length > 0) leaks.push(t);
  const w = await c.from(t).insert({}).select();
  if (!w.error) writes.push(t);
}
check(leaks.length === 0, `none of the ${tables.length} tables returns a single row`, `LEAKS: ${leaks.join(', ')}`);
check(writes.length === 0, 'and none accepts a write', `WRITES ACCEPTED: ${writes.join(', ')}`);

console.log('\nFiles (photos and videos)');
const list = await c.storage.from('media').list('', { limit: 5 });
console.log(`  (listing the media bucket as a visitor: ${list.error ? 'refused' : (list.data || []).length + ' entries'})`);
const up = await c.storage.from('media').upload(`posts/exposure-test-${Date.now()}.txt`, new Blob(['x']), { contentType: 'text/plain' });
check(!!up.error, 'a logged-out visitor can not upload files');
const del = await c.storage.from('media').remove(['posts/does-not-exist.jpg']);
check(!del.data || del.data.length === 0, 'nor delete files');

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
setTimeout(() => process.exit(process.exitCode), 300);
