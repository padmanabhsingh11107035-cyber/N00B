// The import orchestration, kept separate from WHERE the rows go so the exact
// same code path can be tested against a local Postgres and then run against
// the real Supabase project through a thin adapter.
//
// Safety properties:
//   * Refuses to run against a database that already has profiles unless
//     `resume` is set — an import must never land on top of live data.
//   * Only ever INSERTS MISSING rows (ON CONFLICT DO NOTHING); it never
//     overwrites or deletes an existing row, so a re-run after an interruption
//     is safe. The single-row app_settings table is the one deliberate exception.
//   * Verifies afterwards that every table holds at least as many rows as were
//     planned and that the trigger-maintained counters match the real data.

// [table, conflict columns, overwrite?] in dependency order.
export const TABLE_ORDER = [
  ['profiles', 'id'], ['profile_private', 'user_id'], ['push_subscriptions', 'user_id'],
  ['follows', 'follower_id,followee_id'], ['follow_requests', 'requester_id,target_id'], ['blocks', 'blocker_id,blocked_id'],
  ['posts', 'id'], ['post_slides', 'id'], ['post_likes', 'post_id,user_id'], ['post_saves', 'post_id,user_id'], ['post_views', 'post_id,user_id'],
  ['reels', 'id'], ['reel_likes', 'reel_id,user_id'], ['reel_saves', 'reel_id,user_id'], ['reel_views', 'reel_id,user_id'],
  ['comments', 'id'],
  ['chats', 'id'], ['chat_members', 'chat_id,user_id'], ['messages', 'id'],
  ['notifications', 'id'], ['notification_reads', 'notification_id,user_id'],
  ['game_scores', 'id'], ['noob_transactions', 'id'], ['coupons', 'id'],
  ['app_settings', 'id', true], ['support_reviews', 'id'], ['legacy_import', 'key']
];
const BATCH = 200;

export async function runImport(plan, adapter, { resume = false, log = () => {} } = {}) {
  const existing = await adapter.count('profiles');
  if (existing > 0 && !resume) {
    throw new Error(`The database already has ${existing} profile(s). Refusing to import on top of existing data. If this is a re-run of an interrupted import, run again with --resume.`);
  }

  const auth = { created: 0, existing: 0, tempPassword: [] };
  const tempLegacyIds = new Set();
  for (const u of plan.authUsers) {
    const result = await adapter.createAuthUser(u);
    if (result === 'exists') { auth.existing++; continue; }
    auth.created++;
    // The old password was refused by the project's password rules, so the account
    // got a random one. Flag the profile so the app can make that person reset it.
    if (result === 'created_temp_password') {
      auth.tempPassword.push(u.user_metadata.username);
      tempLegacyIds.add(u.user_metadata.legacy_id);
    }
  }
  for (const p of plan.tables.profiles) {
    if (tempLegacyIds.has(p.legacy_id)) p.extra = { ...p.extra, needs_password_reset: true };
  }
  log(`login accounts: ${auth.created} created, ${auth.existing} already existed`);

  for (const [table, conflict, overwrite] of TABLE_ORDER) {
    const rows = plan.tables[table] || [];
    if (!rows.length) continue;
    for (let i = 0; i < rows.length; i += BATCH) {
      await adapter.insertMissing(table, rows.slice(i, i + BATCH), conflict, { overwrite: !!overwrite });
    }
    log(`${table}: ${rows.length} row(s) sent`);
  }
  return { auth, verification: await verifyImport(plan, adapter) };
}

export async function verifyImport(plan, adapter) {
  const problems = [];
  const authCount = await adapter.authUserCount();
  if (authCount < plan.authUsers.length) problems.push(`login accounts: expected at least ${plan.authUsers.length}, found ${authCount}`);
  for (const [table] of TABLE_ORDER) {
    const planned = (plan.tables[table] || []).length;
    if (!planned) continue;
    const actual = await adapter.count(table);
    if (actual < planned) problems.push(`${table}: expected at least ${planned} row(s), found ${actual}`);
  }
  // counters are maintained by database triggers — they must equal the real relationships
  const tally = (rows, key) => rows.reduce((m, r) => m.set(r[key], (m.get(r[key]) || 0) + 1), new Map());
  const followers = tally(plan.tables.follows, 'followee_id');
  const following = tally(plan.tables.follows, 'follower_id');
  const posts = tally(plan.tables.posts, 'user_id');
  for (const c of await adapter.profileCounters()) {
    if (!plan.tables.profiles.some((p) => p.id === c.id)) continue;
    if (c.followers_count !== (followers.get(c.id) || 0)) problems.push(`followers_count wrong for ${c.username}: ${c.followers_count} vs ${followers.get(c.id) || 0}`);
    if (c.following_count !== (following.get(c.id) || 0)) problems.push(`following_count wrong for ${c.username}: ${c.following_count} vs ${following.get(c.id) || 0}`);
    if (c.posts_count !== (posts.get(c.id) || 0)) problems.push(`posts_count wrong for ${c.username}: ${c.posts_count} vs ${posts.get(c.id) || 0}`);
  }
  return { ok: problems.length === 0, problems };
}
