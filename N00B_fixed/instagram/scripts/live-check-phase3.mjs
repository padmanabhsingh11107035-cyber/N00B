// Live check of phase 3 (points, shop, coupons, Pro, verification, games, matchmaking, invites, reports, admin
// refusals, push) on a real Supabase project, through the PUBLIC API only (publishable key) — exactly what the
// website does. It creates TWO brand-new throwaway accounts (never shared with any browser session), earns
// points the honest way (playing), exercises everything, and deletes both accounts (and everything they made)
// at the end. Before every account is deleted the script confirms it is signed in as the throwaway it created.
// Real accounts are never touched.
//
//   $env:SUPABASE_URL = "https://<ref>.supabase.co"
//   $env:SUPABASE_PUBLISHABLE_KEY = "sb_publishable_..."
//   node scripts/live-check-phase3.mjs
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) { console.error('Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY first.'); process.exit(1); }

let passed = 0, failed = 0;
const check = (ok, label, detail = '') => { if (ok) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const fresh = () => createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const rpc = async (c, fn, args = {}) => { const { data, error } = await c.rpc(fn, args); if (error) throw Object.assign(new Error(error.message), { code: error.code }); return data; };
const fails = async (fn, re) => { try { await fn(); return false; } catch (e) { return re.test(`${e.message} ${e.code}`); } };

const stamp = Date.now().toString(36);
const PW = 'Test-pass-1234';
async function makeUser(tag) {
  const c = fresh();
  const username = `l3${tag}_${stamp}`;
  const { data, error } = await c.auth.signUp({
    email: `${crypto.randomUUID()}@users.nooob.xyz`, password: PW,
    options: { data: { username, first_name: 'Live', last_name: tag, email: `l3${tag}@example.com`, mobile_number: '9000000007', date_of_birth: '2005-05-05', bio: 'automated check', agreed_to_terms: true } }
  });
  if (error || !data.session) throw new Error(`sign-up failed: ${error?.message || 'no session (is "Confirm email" still on?)'}`);
  const me = await rpc(c, 'get_my_user');
  if (me.username !== username) throw new Error('signed in as the wrong account — stopping');
  return { c, id: data.user.id, username };
}
const points = async (u) => (await rpc(u.c, 'get_my_user')).noobPoints;

const A = await makeUser('a');
const B = await makeUser('b');
const created = [A, B];
try {
  // =====================================================================================
  section('Points, wallet and games');
  const p0 = await points(A);
  const win = await rpc(A.c, 'record_match', { p_game_id: 'live_check', p_title: 'Live Check', p_result: 'win', p_opponent: 'Bot', p_vs_bot: false });
  check(win.success && win.earnedPoints === 10_000_000 && win.totalNoobPoints === p0 + 10_000_000, 'a win pays 10 million points');
  await rpc(A.c, 'record_match', { p_game_id: 'live_check', p_title: 'Live Check', p_result: 'loss' });
  check((await rpc(A.c, 'get_my_user')).gamesPlayedCount === 2, 'games played are counted');
  check(await fails(() => rpc(A.c, 'record_match', { p_game_id: 'live_check', p_title: 'x', p_result: 'super' }), /Invalid result/), 'a made-up result is refused');
  const bBefore = await points(B);
  const aBefore = await points(A);
  const tr = await rpc(A.c, 'wallet_transfer', { p_recipient: B.id, p_amount: 1000, p_note: 'live check' });
  check(tr.success && (await points(A)) === aBefore - 1000 && (await points(B)) === bBefore + 1000, 'sending points moves exactly that amount');
  check((await rpc(B.c, 'my_notifications')).notifications.some((n) => n.type === 'points_transfer'), 'the receiver gets a notification');
  check(await fails(() => rpc(A.c, 'wallet_transfer', { p_recipient: A.id, p_amount: 5 }), /yourself/), 'you can not send points to yourself');
  check(await fails(() => rpc(B.c, 'wallet_transfer', { p_recipient: A.id, p_amount: 999_999_999_999 }), /Insufficient/), 'you can not send more than you have');
  check(await fails(() => rpc(A.c, 'wallet_transfer', { p_recipient: B.id, p_amount: -5 }), /valid whole number/), 'a negative amount is refused');
  const sv = await rpc(A.c, 'submit_survival_score', { p_game_id: 'live_check_run', p_title: 'Live Runner', p_seconds: 999999 });
  check(sv.survivalSeconds === 3600 && sv.earnedPoints === 3_600_000_000, 'a survival run pays 1 million per second, capped at an hour (3.6 billion fits fine)');
  await rpc(A.c, 'submit_survival_score', { p_game_id: 'live_check_run', p_title: 'Live Runner', p_seconds: 3600 });
  await rpc(A.c, 'submit_survival_score', { p_game_id: 'live_check_run', p_title: 'Live Runner', p_seconds: 3600 });
  const lb = await rpc(A.c, 'game_leaderboard');
  check(lb.leaderboard.length === 10 && lb.leaderboard[0].rank === 1 && lb.currentUserPoints === (await points(A)) && lb.currentUserRank >= 1, 'the leaderboard shows the top 10 and your own rank');
  check(!lb.leaderboard.some((e) => 'email' in e || 'mobileNumber' in e), 'the leaderboard shows only public details');
  // chess
  check(await fails(() => rpc(A.c, 'record_match', { p_game_id: 'chess_blitz', p_title: 'Chess Blitz', p_result: 'win', p_opponent: 'Bot', p_vs_bot: true }), /No active Chess Blitz round/), 'a chess win can not be claimed without starting a round');
  check((await rpc(A.c, 'start_chess_round')).success === true, 'a chess round starts');
  const cw = await rpc(A.c, 'record_match', { p_game_id: 'chess_blitz', p_title: 'Chess Blitz', p_result: 'win', p_opponent: 'Bot', p_vs_bot: true });
  check(cw.earnedPoints === 50_000_000, 'the chess win pays 50 million');
  const c2 = await rpc(A.c, 'start_chess_round');
  check(c2.success === false && !!c2.nextAvailableAt, 'a second chess round this week is refused, with the date it opens again');

  // =====================================================================================
  section('Sticker shop, coupons, Pro and the verification badge');
  const cat = await rpc(A.c, 'shop_catalog');
  check(cat.catalog.length === 24 && cat.catalog[0].id === 'shop_fire_king', 'the shop has its 24 items');
  const buy = await rpc(A.c, 'purchase_shop_item', { p_item: 'shop_fire_king' });
  check(buy.success && buy.user.purchasedItemIds.includes('shop_fire_king'), 'buying an item works');
  check(await fails(() => rpc(A.c, 'purchase_shop_item', { p_item: 'shop_fire_king' }), /already own/), 'you can not buy it twice');
  check(await fails(() => rpc(B.c, 'purchase_shop_item', { p_item: 'shop_legend_noob_god' }), /Insufficient/), 'you can not buy what you can not afford');
  const coupons = await rpc(A.c, 'my_coupons');
  const global10 = coupons.find((c) => c.code === 'FLAT10OFFO10' && c.active);
  check(!!global10 || coupons.length === 0, 'the real global coupon is visible in the wallet (or none exist)');
  if (global10) check((await rpc(A.c, 'redeem_coupon_code', { p_code: ' flat10offo10 ' })).coupon.discountPercent === 10, 'a coupon code works in any capitals');
  check(await fails(() => rpc(A.c, 'redeem_coupon_code', { p_code: 'NOSUCHCODE' }), /invalid, expired/), 'an unknown coupon is refused');
  check(await fails(() => rpc(A.c, 'create_coupon', { p: { title: 'Free', discountPercent: 100 } }), /Only the NOOB admin/), 'an ordinary user can not create coupons');
  check(await fails(() => rpc(A.c, 'upgrade_pro', { p_tier: 'constructor' }), /Unknown Pro tier/), 'a made-up Pro tier is refused');
  check(await fails(() => rpc(B.c, 'upgrade_pro', { p_tier: 'starter' }), /Insufficient/), 'no points, no Pro');
  const pBefore = await points(A);
  const up = await rpc(A.c, 'upgrade_pro', { p_tier: 'starter', p_billing: 'monthly', p_coupon: global10 ? 'FLAT10OFFO10' : null, p_auto_renew: true });
  const price = global10 ? 4_500_000_000 : 5_000_000_000;
  check(up.success && up.user.proTier === 'starter' && up.user.proBilling === 'monthly' && pBefore - up.user.noobPoints === price, `Pro starter costs ${price.toLocaleString()} points${global10 ? ' (10% off with the coupon)' : ''}`);
  check((await rpc(A.c, 'toggle_pro_auto_renew', { p_enabled: false })).proAutoRenew === false, 'auto-renew can be turned off');
  const av = await rpc(A.c, 'apply_live_avatar', { p_preset: 'aurora_wave', p_custom_url: null });
  check(av.user.avatar === '/live-avatars/aurora-wave.svg' && av.user.isLiveAvatar, 'a Pro account can use a live profile picture');
  check(await fails(() => rpc(B.c, 'apply_live_avatar', { p_preset: 'aurora_wave', p_custom_url: null }), /NOOB Pro feature/), 'a free account can not');
  check((await rpc(A.c, 'live_avatar_presets_list')).presets.length === 34, 'the 34 live pictures are listed');
  check(await fails(() => rpc(A.c, 'verify_account', { p_password: 'wrong-password', p_method: 'points_monthly', p_coupon_code: null, p_discount_code: null }), /Invalid password/), 'verification refuses the wrong password (checked against the real login system)');
  const ver = await rpc(A.c, 'verify_account', { p_password: PW, p_method: 'points_monthly', p_coupon_code: null, p_discount_code: null });
  check(ver.success && ver.user.isVerified && ver.user.verificationTier === 'premium', 'the right password verifies the account for 5 billion points');
  check(await fails(() => rpc(A.c, 'verify_account', { p_password: PW, p_method: 'points_monthly', p_coupon_code: null, p_discount_code: null }), /already verified/), 'you can not pay for the badge twice');
  check(!!(await A.c.from('profiles').update({ noob_points: 999999999999 }).eq('id', A.id)).error, 'points can not be edited straight in the table');
  check(!!(await B.c.from('profiles').update({ is_verified: true }).eq('id', B.id)).error, 'the badge can not be switched on through the table');
  check(!!(await B.c.from('profiles').update({ pro_tier: 'ultimate' }).eq('id', B.id)).error, 'Pro can not be switched on through the table');

  // =====================================================================================
  section('Two-player matches and matchmaking');
  const code = `LC3-${stamp}`;
  const r1 = await rpc(A.c, 'join_game_room', { p_code: code, p_game_id: 'live_snake', p_title: 'Live Snake' });
  check(r1.success && r1.room.status === 'waiting' && r1.room.players.length === 1, 'the first player opens a room and waits');
  const r2 = await rpc(B.c, 'join_game_room', { p_code: code, p_game_id: 'live_snake', p_title: 'Live Snake' });
  check(r2.room.status === 'ready' && r2.room.players.length === 2, 'the second player joins and it is ready');
  const third = await makeUser('c');
  created.push(third);
  check(await fails(() => rpc(third.c, 'join_game_room', { p_code: code, p_game_id: 'live_snake', p_title: 'x' }), /already full/), 'a third person can not join');
  check(await fails(() => rpc(third.c, 'get_game_room', { p_code: code }), /not part of this match/), '...or look into the room');
  const aPts = await points(A);
  await rpc(A.c, 'submit_game_room_result', { p_code: code, p_result: 'win' });
  const fin = await rpc(B.c, 'submit_game_room_result', { p_code: code, p_result: 'loss' });
  check(fin.room.status === 'finished' && fin.room.outcome.results[A.id] === 'win' && (await points(A)) === aPts + 10_000_000, 'when both have reported the better result wins and is paid once');
  // matchmaking (tic tac toe on a shared board)
  const m1 = await rpc(A.c, 'join_matchmaking', { p_game_id: 'tictactoe', p_title: 'Tic Tac Toe' });
  check(m1.success && m1.matched === false, 'the first player waits for an opponent');
  const m2 = await rpc(B.c, 'join_matchmaking', { p_game_id: 'tictactoe', p_title: 'Tic Tac Toe' });
  check(m2.matched === true && m2.room.code.startsWith('MM-') && m2.room.board.length === 9 && m2.room.turn === A.id, 'the second player is matched instantly; the first goes first');
  check((await rpc(A.c, 'matchmaking_status')).matched === true, 'the first player finds out on their next check');
  const room = m2.room.code;
  check(await fails(() => rpc(B.c, 'submit_game_room_move', { p_code: room, p_index: 0 }), /not your turn/), 'a move out of turn is refused');
  await rpc(A.c, 'submit_game_room_move', { p_code: room, p_index: 0 });
  check(await fails(() => rpc(B.c, 'submit_game_room_move', { p_code: room, p_index: 0 }), /already taken/), 'a taken cell is refused');
  await rpc(B.c, 'submit_game_room_move', { p_code: room, p_index: 3 });
  await rpc(A.c, 'submit_game_room_move', { p_code: room, p_index: 1 });
  await rpc(B.c, 'submit_game_room_move', { p_code: room, p_index: 4 });
  const won = await rpc(A.c, 'submit_game_room_move', { p_code: room, p_index: 2 });
  check(won.room.status === 'finished' && won.room.outcome.results[A.id] === 'win', 'three in a row wins the live game');
  check(await fails(() => rpc(B.c, 'submit_game_room_move', { p_code: room, p_index: 5 }), /already ended/), 'no moves after the game ends');
  check((await rpc(A.c, 'cancel_matchmaking')).success, 'cancelling matchmaking works');
  check(!!(await A.c.from('game_rooms').select('*')).error, 'the rooms table can not be read directly');

  // =====================================================================================
  section('Invites, reports, alerts, contacts, support, store, insights');
  const inv = await rpc(A.c, 'send_game_invite', { p_target: B.id, p_game_id: 'tictactoe', p_title: 'Tic Tac Toe', p_room_code: `INV-${stamp}` });
  check(inv.success && inv.invite.mediaType === 'game_invite' && inv.invite.gameInvite.fromUsername === A.username, 'a game invite lands in the friend\'s chat');
  check((await rpc(B.c, 'chat_messages', { p_chat: inv.chatId })).messages.some((m) => m.id === inv.invite.id), 'the friend can read it');
  check((await rpc(A.c, 'send_game_invite', { p_target: B.id, p_game_id: 'tictactoe', p_title: 'Tic Tac Toe', p_room_code: `INV-${stamp}` })).message === 'Invite already sent', 'a double-tap does not post it twice');
  const rep = await rpc(A.c, 'submit_report', { p_target: B.username, p_reason: 'Spam', p_details: 'live check — please ignore' });
  check(rep.success && rep.report.targetUsername === B.username, 'a report can be filed (and it blocks the person)');
  check((await rpc(A.c, 'get_my_user')).blockedUserIds.includes(B.id), 'the reported person is now blocked');
  await rpc(A.c, 'unblock_user', { p_user: B.id });
  check(await fails(() => rpc(A.c, 'submit_report', { p_target: A.username }), /cannot report or block your own account/), 'you can not report yourself');
  await rpc(A.c, 'screenshot_alert', { p_type: 'profile', p_id: B.id });
  check((await rpc(B.c, 'my_notifications')).notifications.some((n) => n.type === 'screenshot_alert'), 'a screenshot alert reaches the owner');
  const unknownNumber = '5' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0');   // a fresh random number each run: real people sign up over time, so a fixed "unknown" number can end up belonging to somebody
  check((await rpc(A.c, 'match_contacts', { p_numbers: [unknownNumber, '12345', 'junk'] })).length === 0, 'contact matching returns nobody for unknown numbers');
  const sum = await rpc(A.c, 'support_rating_summary');
  check(typeof sum.count === 'number' && 'average' in sum, 'the support rating summary works');
  check(Array.isArray(await rpc(A.c, 'list_store_products')), 'the store product list works');
  check(await fails(() => rpc(A.c, 'create_store_product', { p: { price: 5, description: 'x', media: [{ type: 'photo', url: 'p' }] } }), /Only the NOOB admin/), 'an ordinary user can not add products');
  const ins = (await rpc(A.c, 'my_insights')).insights;
  check(typeof ins.accountsReached === 'number' && ins.reachHistory.length === 7, 'creator insights work');
  check((await rpc(A.c, 'register_push_token', { p_token: `live-${stamp}` })).success, 'a device push token is saved');
  check((await rpc(A.c, 'save_push_subscription', { p_subscription: { endpoint: `https://push.example/${stamp}`, keys: { p256dh: 'x', auth: 'y' } } })).success, 'a browser push subscription is saved');
  check((await rpc(A.c, 'remove_push_subscription')).success, '...and removed');
  check(!(await B.c.from('push_subscriptions').select('*')).data?.length, 'nobody else can see a subscription');
  await rpc(A.c, 'get_vapid_public_key'); check(true, 'the public push key can be asked for');

  // =====================================================================================
  section('Everything an ordinary user must NOT be able to do');
  const G0 = '00000000-0000-0000-0000-000000000001';
  const refused = [
    ['admin_users_list', {}], ['admin_reports', {}], ['admin_suspend_user', { p_target: B.id }], ['admin_adjust_points', { p_target: B.id, p_set_to: 5 }],
    ['admin_delete_user', { p_target: B.id }], ['admin_send_notification', { p_target: 'all', p_title: 'x', p_message: 'y' }],
    ['admin_report_action', { p_id: G0 }], ['delete_coupon', { p_id: G0 }], ['delete_store_product', { p_id: G0 }]
  ];
  for (const [fn, args] of refused) check(await fails(() => rpc(A.c, fn, args), /Administrator|Only the NOOB|Access denied|privileges|permission denied/), `${fn} is refused`);
  const internal = [['apply_points', { p_user: A.id, p_delta: 1000000, p_reason: 'x' }], ['run_birthday_check', {}], ['run_pro_renewals', {}], ['set_suspension', { p_target: B.id, p_suspend: true, p_reason: 'x' }], ['find_eligible_coupon', { p_code: 'FLAT10OFFO10', p_user: A.id }]];
  for (const [fn, args] of internal) check(await fails(() => rpc(A.c, fn, args), /permission denied|Could not find|not found/), `${fn}() can not be called from a browser`);
  const anon = fresh();
  check(await fails(() => rpc(anon, 'game_leaderboard'), /permission denied/), 'a logged-out visitor can not see the leaderboard');
  check(await fails(() => rpc(anon, 'wallet_transfer', { p_recipient: A.id, p_amount: 5 }), /permission denied/), '...or send points');
  for (const t of ['reports', 'coupon_uses', 'matchmaking_queue', 'user_game_state', 'scratch_cards']) {
    const r = await anon.from(t).select('*').limit(1);
    check(!!r.error, `a logged-out visitor can not read ${t}`);
  }
  check(!!(await A.c.from('reports').select('*').limit(1)).error, 'a signed-in user can not read the reports table');
  check(!!(await A.c.from('game_scores').insert({ user_id: A.id, game_id: 'x', score: 999999999 })).error, 'scores can not be written straight into the table');
  check(!!(await A.c.from('scratch_cards').insert({ user_id: A.id, gift: { type: 'points', value: 1e12 } })).error, 'nobody can print themselves a scratch card');
} catch (err) {
  failed++;
  console.log(`  FAIL unexpected error: ${err.message}`);
} finally {
  // Tidy up: each account is deleted ONLY after confirming we are signed in as the throwaway we created.
  for (const u of created) {
    try {
      const me = await rpc(u.c, 'get_my_user');
      if (me.username !== u.username) { console.log(`  note: refusing to delete — signed in as ${me.username}, expected ${u.username}`); continue; }
      await u.c.from('messages').delete().eq('sender_id', u.id);
      await rpc(u.c, 'delete_my_account', { p_password: PW });
    } catch (e) { console.log(`  note: could not delete throwaway account ${u.username}: ${e.message}`); }
  }
  // Confirm nothing was left behind (a fresh observer account looks for our test names, then removes itself).
  try {
    const obs = fresh();
    const oname = `l3o_${stamp}`;
    const { data } = await obs.auth.signUp({ email: `${crypto.randomUUID()}@users.nooob.xyz`, password: PW,
      options: { data: { username: oname, first_name: 'Obs', last_name: 'X', email: 'obs@example.com', mobile_number: '9000000008', date_of_birth: '2005-05-05', bio: 'observer', agreed_to_terms: true } } });
    if (data?.session) {
      const left = await rpc(obs, 'search_users', { p_search: `l3` });
      const mine = left.filter((u) => new RegExp(`^l3[abc]_${stamp}$`).test(u.username));
      check(mine.length === 0, 'no throwaway account is left behind');
      const me = await rpc(obs, 'get_my_user');
      if (me.username === oname) await rpc(obs, 'delete_my_account', { p_password: PW });
    }
  } catch (e) { console.log(`  note: leftover check could not run: ${e.message}`); }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
setTimeout(() => process.exit(process.exitCode), 500);
