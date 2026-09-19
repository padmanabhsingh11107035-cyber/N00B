// Tests for supabase phase 3 (wallet, shop, coupons, Pro, verification, games, matchmaking, reports and the
// admin tools) on a REAL Postgres (PGlite) holding the real backup, as real signed-in users — including every
// way someone might try to cheat.
//
// Usage: node scripts/supabase/test-economy.mjs [backup-folder]
import fs from 'node:fs';
import path from 'node:path';
import { loadBackup, buildImportPlan } from './transform.mjs';
import { runImport } from './run-import.mjs';
import { createTestDb, makePgAdapter, asUser, asAnon } from './pg-test-env.mjs';

const backupsRoot = 'backups';
const dir = process.argv.slice(2).find((x) => !x.startsWith('--')) || path.join(backupsRoot, fs.readdirSync(backupsRoot).filter((d) => fs.existsSync(path.join(backupsRoot, d, 'users.json'))).sort().pop());
const raw = loadBackup(dir);

let passed = 0;
let failed = 0;
const check = (cond, label, detail = '') => {
  if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); }
};
const expectFail = async (fn, pattern, label) => {
  try { await fn(); check(false, label, '(expected an error, but it succeeded)'); }
  catch (e) { check(pattern.test(e.message), label, `(got: ${e.message})`); }
};
const section = (t) => console.log(`\n${t}`);

const plan = buildImportPlan(raw, {});
const db = await createTestDb();
const adapter = makePgAdapter(db);
await runImport(plan, adapter, { log: () => {} });

// ---- people, picked by role
const profByLegacy = Object.fromEntries((await db.query('select * from profiles')).rows.map((p) => [p.legacy_id, p]));
const idOf = (u) => profByLegacy[u.id].id;
const adminRaw = raw.users.find((u) => u.isAdmin);
const publicRaw = raw.users.filter((u) => u.accountType !== 'private' && !u.isAdmin);
const [aRaw, bRaw, cRaw, dRaw] = publicRaw.filter((u) => (u.password || '').length > 0);
const admin = idOf(adminRaw), a = idOf(aRaw), b = idOf(bRaw), c = idOf(cRaw), d = idOf(dRaw);
const ids = [a, b, c, d].map((x) => `'${x}'`).join(',');

const call = (uid, sql, params = []) => asUser(db, uid, async () => (await db.query(sql, params)).rows);
const rpc = async (uid, fn, ...args) => (await call(uid, `select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args))[0].r;
const n = async (sql, params = []) => (await db.query(sql, params)).rows[0].n;
const pts = async (u) => Number((await db.query('select noob_points::text p from profiles where id = $1', [u])).rows[0].p);
const setPts = (u, v) => db.query('update profiles set noob_points = $2 where id = $1', [u, v]);
const txs = async (u) => (await db.query('select amount::text amount, reason, balance_after::text balance_after from noob_transactions where user_id = $1 order by created_at, id', [u])).rows;
const resetPeople = async () => {
  await db.query(`update profiles set noob_points = 0, pro_tier = null, pro_billing = null, pro_auto_renew = false, pro_renews_at = null,
                  is_verified = false, verification_tier = null, purchased_item_ids = '{}', is_suspended = false, games_played_count = 0, games_won_count = 0
                  where id in (${ids})`);
  await db.query(`delete from follows where follower_id in (${ids}) or followee_id in (${ids})`);
  await db.query(`delete from blocks where blocker_id in (${ids}) or blocked_id in (${ids})`);
  await db.query(`delete from noob_transactions where user_id in (${ids})`);
  await db.query(`delete from notifications where target_user_id in (${ids})`);
  await db.query(`delete from game_scores where user_id in (${ids})`);
  await db.query('delete from user_game_state');
  await db.query('delete from game_rooms'); await db.query('delete from matchmaking_queue');
};
// real bcrypt hashes for the two people whose passwords are checked
await db.query(`update auth.users set encrypted_password = extensions.crypt('secret-pw', extensions.gen_salt('bf')) where id in ('${a}', '${b}')`);
await resetPeople();
const adminName = (await db.query('select username from profiles where id = $1', [admin])).rows[0].username;

// =====================================================================================
section('1. Sending points to a friend');
await setPts(a, 5000); await setPts(b, 100);
const t1 = await rpc(a, 'wallet_transfer', b, 1000, '  thanks for the help  ');
check(t1.success && t1.message.includes('1,000 points') && t1.user.noobPoints === 4000, 'a transfer moves the points and answers with the sender\'s new balance');
check((await pts(a)) === 4000 && (await pts(b)) === 1100, 'the sender lost 1,000 and the friend gained 1,000');
const ta = await txs(a), tb = await txs(b);
check(ta.length === 1 && ta[0].amount === '-1000' && ta[0].reason.startsWith('Sent to @') && ta[0].reason.endsWith(': thanks for the help') && ta[0].balance_after === '4000', 'the sender\'s wallet history has the line');
check(tb.length === 1 && tb[0].amount === '1000' && tb[0].reason.startsWith('Received from @') && tb[0].balance_after === '1100', 'so does the friend\'s');
const nt = (await db.query(`select * from notifications where type = 'points_transfer' and target_user_id = $1`, [b])).rows;
check(nt.length === 1 && nt[0].actor_id === a && nt[0].title === '💰 NOOB Points Received' && nt[0].message.includes('1,000 NOOB Points: "thanks for the help"'), 'the friend gets a notification');
await expectFail(() => rpc(a, 'wallet_transfer', b, 999999), /Insufficient NOOB Points/, 'you cannot send more than you have');
await expectFail(() => rpc(a, 'wallet_transfer', a, 10), /cannot send points to yourself/, 'you cannot send points to yourself');
await expectFail(() => rpc(a, 'wallet_transfer', b, 0), /valid whole number/, 'zero is refused');
await expectFail(() => rpc(a, 'wallet_transfer', b, -50), /valid whole number/, 'a negative amount (stealing) is refused');
await expectFail(() => rpc(a, 'wallet_transfer', '00000000-0000-0000-0000-000000000001', 5), /Recipient account not found/, 'an unknown recipient is refused');
await expectFail(() => rpc(a, 'wallet_transfer', null, 5), /Choose someone/, 'no recipient is refused');
check((await rpc(a, 'wallet_transfer', b, 1.9)).message.includes('1 points'), 'a fractional amount is rounded down');
check((await pts(a)) === 3999 && (await pts(b)) === 1101, 'balances are exact after that');
check((await rpc(a, 'wallet_transfer', b, 1, 'x'.repeat(300))).success && (await txs(a)).at(-1).reason.length <= 'Sent to @'.length + 60 + 2 + 140, 'a very long note is cut to 140 characters');
await expectFail(() => asAnon(db, () => db.query('select public.wallet_transfer($1, 5, null)', [b])), /permission denied/, 'a logged-out visitor can not send points');
await db.query('update profiles set is_suspended = true where id = $1', [a]);
await expectFail(() => rpc(a, 'wallet_transfer', b, 5), /Unauthorized/, 'a suspended account can not send points');
await db.query('update profiles set is_suspended = false where id = $1', [a]);
await expectFail(() => call(a, 'update profiles set noob_points = 999999999 where id = $1', [a]), /protected profile fields/, 'points can not be edited straight in the table');
check((await call(a, 'select count(*)::int n from noob_transactions where user_id = $1', [a]))[0].n === (await txs(a)).length, 'the wallet history is readable by its owner');
await expectFail(() => call(a, `insert into noob_transactions (user_id, amount, reason) values ($1, 1000000, 'gift')`, [a]), /permission denied/, 'nobody can write wallet history themselves');

// =====================================================================================
section('2. The sticker / GIF / emoji shop');
await resetPeople(); await setPts(a, 5000);
const cat = await rpc(a, 'shop_catalog');
check(cat.catalog.length === 24 && cat.catalog[0].id === 'shop_fire_king' && cat.catalog[0].price === 1000 && cat.catalog[8].assetUrl && cat.catalog[0].assetUrl === undefined && cat.ownedItemIds.length === 0, 'the catalogue has the 24 items in order (GIF packs carry their animation link)');
const buy = await rpc(a, 'purchase_shop_item', 'shop_fire_king');
check(buy.success && buy.item.name === 'Fire King' && buy.user.noobPoints === 4000 && buy.user.purchasedItemIds.includes('shop_fire_king'), 'buying deducts the price and gives the item');
check((await txs(a)).at(-1).reason === 'Bought "Fire King" from the Sticker Shop', 'the wallet history says what was bought');
await expectFail(() => rpc(a, 'purchase_shop_item', 'shop_fire_king'), /already own/, 'you can not buy the same thing twice');
await expectFail(() => rpc(a, 'purchase_shop_item', 'shop_legend_noob_god'), /Insufficient NOOB Points\. You have 4,000, but NOOB God Mode costs 10,000\./, 'not enough points is refused with the exact amounts');
await expectFail(() => rpc(a, 'purchase_shop_item', 'nope'), /Item not found/, 'an unknown item is refused');
check((await rpc(a, 'shop_catalog')).ownedItemIds.join() === 'shop_fire_king', 'the catalogue reports what you own');
check((await pts(a)) === 4000, 'nothing was charged for the refused purchases');
await expectFail(() => call(a, `update profiles set purchased_item_ids = array['shop_legend_noob_god'] where id = $1`, [a]), /protected profile fields/, 'items can not be handed out through the table');

// =====================================================================================
section('3. Coupons');
const c1 = await rpc(admin, 'create_coupon', { title: 'Summer Sale', discountPercent: 25, terms: 'Once per person\n\n  Ends soon  \r\n', usageLimit: 'once' });
check(c1.success && c1.coupon.code === 'SUMMERSALE25' && c1.coupon.discountPercent === 25 && c1.coupon.usageLimit === 'once' && c1.coupon.terms.join('|') === 'Once per person|Ends soon' && c1.coupon.active && c1.coupon.usedCount === 0 && c1.coupon.targetUsername === null, 'the admin creates a coupon; the code is made from the title; terms are tidied');
const c1b = await rpc(admin, 'create_coupon', { title: 'Summer Sale', discountPercent: 25 });
check(c1b.coupon.code !== c1.coupon.code && c1b.coupon.code.startsWith('SUMMERSALE25') && c1b.coupon.usageLimit === 'unlimited', 'the same title again gets a different, unique code (and defaults to unlimited use)');
await expectFail(() => rpc(a, 'create_coupon', { title: 'Free money', discountPercent: 100 }), /Only the NOOB admin/, 'an ordinary user can not create coupons');
await expectFail(() => rpc(admin, 'create_coupon', { title: '  ', discountPercent: 10 }), /title is required/, 'a title is required');
for (const bad of [0, -5, 101, 'abc', null]) await expectFail(() => rpc(admin, 'create_coupon', { title: 'Bad', discountPercent: bad }), /between 1 and 100/, `a discount of ${JSON.stringify(bad)} is refused`);
await expectFail(() => rpc(admin, 'create_coupon', { title: 'V', type: 'verification' }), /must target one specific user/, 'a verification coupon must name a person');
await expectFail(() => rpc(admin, 'create_coupon', { title: 'V', discountPercent: 10, targetUsername: 'nobody_here_xyz' }), /No account found for @nobody_here_xyz/, 'an unknown target is refused');
const aName = (await db.query('select username from profiles where id = $1', [a])).rows[0].username;
const cT = await rpc(admin, 'create_coupon', { title: 'Just for you', discountPercent: 50, targetUsername: '@' + aName.toUpperCase() });
check(cT.coupon.targetUsername === aName, 'a coupon can be made for one person (with or without the @, any capitals)');
const mine = await rpc(a, 'my_coupons');
check(mine.some((x) => x.id === cT.coupon.id) && mine.some((x) => x.id === c1.coupon.id) && mine.every((x) => x.active), 'that person sees the global coupons and their own');
check(!(await rpc(b, 'my_coupons')).some((x) => x.id === cT.coupon.id), 'somebody else does not see it');
check(!(await rpc(b, 'my_coupons', true)).some((x) => x.id === cT.coupon.id), '...even when asking for the admin "manage" view');
check((await rpc(admin, 'my_coupons', true)).some((x) => x.id === cT.coupon.id), 'the admin\'s manage view lists every coupon');
check((await rpc(a, 'redeem_coupon_code', ' summersale25 ')).coupon.code === 'SUMMERSALE25', 'a typed code works in any capitals, with spaces around it');
await expectFail(() => rpc(b, 'redeem_coupon_code', cT.coupon.code), /invalid, expired, or not available/, 'someone else can not use a coupon made for another person');
await expectFail(() => rpc(a, 'redeem_coupon_code', 'NOSUCHCODE'), /invalid, expired/, 'an unknown code is refused');
await expectFail(() => rpc(a, 'redeem_coupon_code', ''), /invalid, expired/, 'an empty code is refused');
await expectFail(() => rpc(admin, 'delete_coupon', '00000000-0000-0000-0000-000000000001'), /Coupon not found/, 'deleting an unknown coupon is refused');
await expectFail(() => rpc(a, 'delete_coupon', c1b.coupon.id), /Only the NOOB admin/, 'an ordinary user can not retire coupons');
await rpc(admin, 'delete_coupon', c1b.coupon.id);
await expectFail(() => rpc(a, 'redeem_coupon_code', c1b.coupon.code), /invalid, expired/, 'a retired coupon no longer works');
check(!(await rpc(a, 'my_coupons')).some((x) => x.id === c1b.coupon.id), '...and disappears from the wallet');
await expectFail(() => call(a, `insert into coupons (code, title, discount_percent) values ('HACK100', 'x', 100)`), /row-level security|permission denied/, 'nobody can write coupons straight into the table');
await expectFail(() => call(a, 'select * from coupon_uses'), /permission denied/, 'the "who used a coupon" list is not readable by browsers');

// =====================================================================================
section('4. NOOB Pro');
await resetPeople(); await setPts(a, 100_000_000_000);
await expectFail(() => rpc(a, 'upgrade_pro', 'constructor'), /Unknown Pro tier/, 'a made-up tier name is refused');
await expectFail(() => rpc(a, 'upgrade_pro', 'toString'), /Unknown Pro tier/, 'so is another inherited-looking name');
await expectFail(() => rpc(b, 'upgrade_pro', 'starter'), /Insufficient NOOB Points\. You have 0 points, but 5,000,000,000 points are required/, 'no points, no Pro');
const up1 = await rpc(a, 'upgrade_pro', 'starter', 'monthly');
check(up1.success && up1.user.proTier === 'starter' && up1.user.proBilling === 'monthly' && up1.user.proAutoRenew === true && up1.user.noobPoints === 95_000_000_000, 'monthly Pro costs 5 billion and turns on auto-renew by default');
const renew1 = (await db.query('select pro_renews_at from profiles where id = $1', [a])).rows[0].pro_renews_at;
check(Math.abs(new Date(renew1).getTime() - Date.now() - 30 * 86400000) < 60000, 'it renews in 30 days');
check((await txs(a)).at(-1).reason === 'NOOB Pro (starter, monthly)', 'the wallet history says so');
const up2 = await rpc(a, 'upgrade_pro', 'plus', 'yearly', null, false);
check(up2.user.proTier === 'plus' && up2.user.proAutoRenew === false && up2.user.noobPoints === 95_000_000_000 - Math.round(7_500_000_000 * 12 * 0.83), 'yearly Pro is 12 months with a 17% discount, and auto-renew can be off');
const renew2 = (await db.query('select pro_renews_at from profiles where id = $1', [a])).rows[0].pro_renews_at;
check(Math.abs(new Date(renew2).getTime() - Date.now() - 365 * 86400000) < 60000, 'a year runs 365 days');
// coupons on Pro
await resetPeople(); await setPts(a, 100_000_000_000);
const upC = await rpc(a, 'upgrade_pro', 'starter', 'monthly', 'summersale25');
check(upC.user.noobPoints === 100_000_000_000 - 3_750_000_000 && (await txs(a)).at(-1).reason === 'NOOB Pro (starter, monthly) — 25% off: SUMMERSALE25', 'a coupon takes 25% off (5B becomes 3.75B) and is named in the history');
check((await rpc(a, 'my_coupons')).find((x) => x.id === c1.coupon.id).usedByMe === true, 'a single-use coupon is now marked as used by you');
await expectFail(() => rpc(a, 'redeem_coupon_code', c1.coupon.code), /invalid, expired/, 'you can not use a single-use coupon a second time');
const usedBefore = await pts(a);
const upNoCoupon = await rpc(a, 'upgrade_pro', 'starter', 'monthly', 'summersale25');
check(usedBefore - upNoCoupon.user.noobPoints === 5_000_000_000, 'trying it again just charges full price (the coupon is not applied twice)');
await setPts(b, 100_000_000_000);
check((await rpc(b, 'upgrade_pro', 'starter', 'monthly', 'summersale25')).user.noobPoints === 100_000_000_000 - 3_750_000_000, 'but a single-use global coupon still works for a different person');
check((await rpc(a, 'toggle_pro_auto_renew', false)).proAutoRenew === false && (await db.query('select pro_auto_renew from profiles where id = $1', [a])).rows[0].pro_auto_renew === false, 'auto-renew can be turned off');
await expectFail(() => rpc(c, 'toggle_pro_auto_renew', true), /do not have an active NOOB Pro/, 'without Pro there is nothing to toggle');
await expectFail(() => call(a, `update profiles set pro_tier = 'ultimate' where id = $1`, [a]), /protected profile fields/, 'Pro can not be switched on through the table');
// the hourly renewal job
await resetPeople();
await db.query(`update profiles set pro_tier = 'starter', pro_billing = 'monthly', pro_auto_renew = true, pro_renews_at = now() - interval '1 hour', noob_points = 6000000000 where id = $1`, [a]);
await db.query(`update profiles set pro_tier = 'starter', pro_billing = 'monthly', pro_auto_renew = true, pro_renews_at = now() - interval '1 hour', noob_points = 100 where id = $1`, [b]);
await db.query(`update profiles set pro_tier = 'pro', pro_billing = 'monthly', pro_auto_renew = false, pro_renews_at = now() - interval '1 hour', noob_points = 99000000000 where id = $1`, [c]);
await db.query(`update profiles set pro_tier = 'pro', pro_billing = 'monthly', pro_auto_renew = true, pro_renews_at = now() + interval '5 days', noob_points = 99000000000 where id = $1`, [d]);
check((await db.query('select public.run_pro_renewals() n')).rows[0].n === 3, 'the hourly job looks at exactly the three subscriptions that are due');
const ra = (await db.query('select pro_tier, pro_renews_at, noob_points::text p from profiles where id = $1', [a])).rows[0];
check(ra.pro_tier === 'starter' && ra.p === '1000000000' && new Date(ra.pro_renews_at) > new Date(), 'auto-renew with enough points: billed 5 billion and extended');
check((await txs(a)).at(-1).reason === 'NOOB Pro renewal (starter, monthly)' && (await db.query(`select 1 from notifications where target_user_id = $1 and title = '✅ NOOB Pro Renewed'`, [a])).rows.length === 1, 'and the wallet history and a notification say so');
const rb = (await db.query('select pro_tier, pro_renews_at, pro_auto_renew from profiles where id = $1', [b])).rows[0];
check(rb.pro_tier === null && rb.pro_renews_at === null && rb.pro_auto_renew === false && (await pts(b)) === 100, 'auto-renew with too few points: Pro ends and nothing is charged');
check((await db.query(`select message from notifications where target_user_id = $1 and title = '⚠️ NOOB Pro Discontinued'`, [b])).rows[0].message.includes('5,000,000,000'), 'and the notification names the price');
check((await db.query('select pro_tier from profiles where id = $1', [c])).rows[0].pro_tier === null && (await pts(c)) === 99000000000 && (await db.query(`select 1 from notifications where target_user_id = $1 and title = '👋 NOOB Pro Ended'`, [c])).rows.length === 1, 'auto-renew off: Pro just ends, with a friendly notice');
check((await db.query('select pro_tier from profiles where id = $1', [d])).rows[0].pro_tier === 'pro', 'a subscription that is not due yet is left alone');
check((await db.query('select public.run_pro_renewals() n')).rows[0].n === 0, 'running the job again does nothing more');
await expectFail(() => rpc(a, 'run_pro_renewals'), /permission denied/, 'a browser can not run the renewal job');

// =====================================================================================
section('5. The verification badge');
await resetPeople(); await setPts(a, 10_000_000_000_000); await setPts(b, 6_000_000_000);
await expectFail(() => rpc(a, 'verify_account', 'wrong-pw', 'points_monthly'), /Invalid password/, 'the wrong password is refused');
await expectFail(() => rpc(a, 'verify_account', '', 'points_monthly'), /Password is required/, 'no password is refused');
await expectFail(() => rpc(a, 'verify_account', 'secret-pw', 'card'), /Invalid verification method/, 'paying by card is not an option');
await expectFail(() => rpc(b, 'verify_account', 'secret-pw', 'points_permanent'), /Insufficient NOOB Points\. You have 6,000,000,000, but 10,000,000,000,000 points are required for permanent verification/, 'not enough points for the permanent badge');
check((await pts(b)) === 6_000_000_000, 'nothing was charged for the refusals');
const vb = await rpc(b, 'verify_account', 'secret-pw', 'points_monthly');
check(vb.success && vb.user.isVerified === true && vb.user.verificationTier === 'premium' && vb.user.noobPoints === 1_000_000_000 && vb.message.includes('now officially verified'), 'the monthly badge costs 5 billion and verifies the account');
check((await txs(b)).at(-1).reason === 'Monthly verification badge', 'the wallet history says so');
await expectFail(() => rpc(b, 'verify_account', 'secret-pw', 'points_monthly'), /already verified/, 'you can not pay twice for the badge');
const dc = await rpc(admin, 'create_coupon', { title: 'Badge deal', discountPercent: 50 });
const va = await rpc(a, 'verify_account', 'secret-pw', 'points_permanent', null, dc.coupon.code);
check(va.user.isVerified && va.user.noobPoints === 10_000_000_000_000 - 5_000_000_000_000 && (await txs(a)).at(-1).reason === 'Permanent verification badge (50% off: ' + dc.coupon.code + ')', 'a discount coupon halves the permanent price');
await db.query(`update profiles set is_verified = false, verification_tier = null where id in ('${a}', '${b}')`);
await expectFail(() => call(a, `update profiles set is_verified = true where id = $1`, [a]), /protected profile fields/, 'the badge can not be switched on through the table');
// verification coupons
const vc = await rpc(admin, 'create_coupon', { title: 'Free badge', type: 'verification', targetUsername: aName });
check(vc.coupon.type === 'verification' && vc.coupon.discountPercent === 100 && vc.coupon.usageLimit === 'once' && vc.coupon.code === 'FREEBADGEVERIFY', 'a verification coupon is single-use, 100%, and made for one person');
check(!(await rpc(b, 'my_coupons')).some((x) => x.id === vc.coupon.id), 'nobody else sees it');
await expectFail(() => rpc(b, 'redeem_coupon_code', vc.coupon.code), /invalid, expired/, 'it is not a discount code, so redeem refuses it');
await expectFail(() => rpc(b, 'verify_account', 'secret-pw', 'coupon', vc.coupon.code), /Invalid or expired verification coupon/, 'someone else can not use it');
await expectFail(() => rpc(a, 'verify_account', 'secret-pw', 'coupon', 'WRONGCODE'), /Invalid or expired verification coupon/, 'a wrong code is refused');
const vca = await rpc(a, 'verify_account', 'secret-pw', 'coupon', ' freebadgeverify ');
check(vca.user.isVerified && vca.user.noobPoints === 5_000_000_000_000, 'the right person verifies for free, without spending points');
check((await db.query('select active from coupons where id = $1', [vc.coupon.id])).rows[0].active === false, 'and the coupon is used up');
await db.query(`update profiles set is_verified = false where id = $1`, [a]);
await expectFail(() => rpc(a, 'verify_account', 'secret-pw', 'coupon', 'FREEBADGEVERIFY'), /Invalid or expired verification coupon/, 'it can not be used a second time');

// =====================================================================================
section('6. Live profile pictures (a Pro perk)');
await resetPeople();
const presets = await rpc(a, 'live_avatar_presets_list');
check(presets.presets.length === 34 && presets.presets[0].id === 'neon_pulse' && presets.presets[0].url === '/live-avatars/neon-pulse.svg', 'the 34 presets are listed in order');
await expectFail(() => rpc(a, 'apply_live_avatar', 'neon_pulse'), /NOOB Pro feature/, 'free accounts are refused');
await db.query(`update profiles set pro_tier = 'starter' where id = $1`, [a]);
const la = await rpc(a, 'apply_live_avatar', 'aurora_wave');
check(la.user.avatar === '/live-avatars/aurora-wave.svg' && la.user.isLiveAvatar === true, 'a Pro account can pick a preset');
check((await rpc(a, 'apply_live_avatar', null, '  avatars/mine.svg ')).user.avatar === 'avatars/mine.svg', 'or use their own animated picture');
await expectFail(() => rpc(a, 'apply_live_avatar', 'nope'), /Unknown preset/, 'an unknown preset is refused');
await expectFail(() => rpc(a, 'apply_live_avatar'), /Choose a preset/, 'choosing nothing is refused');

// =====================================================================================
section('7. Birthday scratch cards');
await resetPeople();
await db.query(`update profile_private set date_of_birth = (current_date - interval '20 years')::date where user_id = $1`, [a]);
await db.query(`update profile_private set date_of_birth = (current_date - interval '30 years' + interval '1 day')::date where user_id = $1`, [b]);
await db.query(`insert into follows (follower_id, followee_id) values ($1, $2), ($3, $2)`, [b, a, c]);
await db.query(`update profiles set extra = extra - 'lastBirthdayWishedYear' where id in (${ids})`);
const bday = (await db.query('select public.run_birthday_check() n')).rows[0].n;
check(bday >= 1, 'the hourly job finds today\'s birthdays');
const card = (await db.query('select * from scratch_cards where user_id = $1', [a])).rows;
check(card.length === 1 && card[0].is_revealed === false && ['points', 'shop_item', 'coupon'].includes(card[0].gift.type), 'the birthday person gets one scratch card');
check((await db.query('select count(*)::int n from scratch_cards where user_id = $1', [b])).rows[0].n === 0, 'someone whose birthday is tomorrow gets none');
const wish = (await rpc(a, 'my_notifications')).notifications.find((x) => x.type === 'birthday_wish');
check(wish && wish.title === '🎂 Happy Birthday!' && wish.scratchCardId === card[0].id && wish.senderUsername, 'they get a "Happy Birthday" notification that links to the card');
const alertB = (await rpc(b, 'my_notifications')).notifications.find((x) => x.type === 'birthday_follower_alert');
check(alertB && alertB.message.includes(`@${aName}'s birthday`) && alertB.actorId === a, 'a follower is told it is their birthday');
check(!(await rpc(d, 'my_notifications')).notifications.some((x) => x.type === 'birthday_follower_alert'), 'a non-follower is not');
check((await db.query('select public.run_birthday_check() n')).rows[0].n === 0 && (await db.query('select count(*)::int n from scratch_cards where user_id = $1', [a])).rows[0].n === 1, 'running the job again the same year does nothing');
await expectFail(() => rpc(b, 'reveal_scratch_card', card[0].id), /not yours/, 'someone else can not scratch it');
await expectFail(() => rpc(a, 'reveal_scratch_card', '00000000-0000-0000-0000-000000000001'), /Scratch card not found/, 'an unknown card is refused');
await expectFail(() => call(a, `insert into scratch_cards (user_id, gift) values ($1, '{"type":"points","value":100000000}')`, [a]), /permission denied/, 'nobody can print themselves a scratch card');
await expectFail(() => call(a, `update scratch_cards set gift = '{"type":"points","value":100000000}' where user_id = $1`, [a]), /permission denied/, 'nor edit the prize');
check((await call(b, 'select * from scratch_cards')).length === 0 && (await call(a, 'select * from scratch_cards')).length === 1, 'each person can only see their own cards');
// reveal each kind of prize
const setGift = (g) => db.query(`update scratch_cards set gift = $2::jsonb, is_revealed = false where id = $1`, [card[0].id, JSON.stringify(g)]);
await setPts(a, 0);
await setGift({ type: 'points', value: 700, label: '700 NOOB Points' });
const r1 = await rpc(a, 'reveal_scratch_card', card[0].id);
check(r1.success && r1.gift.value === 700 && r1.user.noobPoints === 700 && (await txs(a)).at(-1).reason === '🎂 Birthday gift: 700 NOOB Points', 'a points gift is added to the wallet');
const r1b = await rpc(a, 'reveal_scratch_card', card[0].id);
check(r1b.alreadyRevealed === true && (await pts(a)) === 700, 'scratching again shows the same prize and pays nothing more');
await setGift({ type: 'shop_item', value: 'shop_gg_ez', label: 'GG EZ' });
check((await rpc(a, 'reveal_scratch_card', card[0].id)).user.purchasedItemIds.includes('shop_gg_ez'), 'a shop-item gift is added to what you own');
await setGift({ type: 'shop_item', value: 'shop_gg_ez', label: 'GG EZ' });
const r3 = await rpc(a, 'reveal_scratch_card', card[0].id);
check(r3.user.noobPoints === 2700 && (await txs(a)).at(-1).reason.includes('already owned'), 'a shop item you already own is turned into 2,000 points');
await setGift({ type: 'coupon', value: 30, label: '30% Off NOOB Pro / Verification' });
await rpc(a, 'reveal_scratch_card', card[0].id);
const bc = (await rpc(a, 'my_coupons')).find((x) => x.code.startsWith('BDAY30'));
check(bc && bc.discountPercent === 30 && bc.usageLimit === 'once' && bc.targetUsername === aName && bc.terms.length === 2, 'a coupon gift creates a single-use 30% coupon just for them');
check(!(await rpc(b, 'my_coupons')).some((x) => x.code.startsWith('BDAY30')), 'nobody else sees it');
// the gift pool
const kinds = new Set(); let allOk = true;
for (let i = 0; i < 400; i++) { const g = (await db.query('select public.pick_birthday_gift() g')).rows[0].g; kinds.add(g.type); if (!g.label || g.value === undefined) allOk = false; }
check(allOk && kinds.has('points') && kinds.has('shop_item') && kinds.has('coupon'), 'the random gift picker produces points, shop items and coupons, always with a label');
await expectFail(() => rpc(a, 'run_birthday_check'), /permission denied/, 'a browser can not run the birthday job');

// =====================================================================================
section('8. Playing games and earning points');
await resetPeople(); await setPts(a, 1000);
const win = await rpc(a, 'record_match', 'snake', 'Neon Snake', 'win', 'Bot');
check(win.success && win.earnedPoints === 10_000_000 && win.totalNoobPoints === 10_001_000 && win.result === 'win' && win.user.gamesPlayedCount === 1 && win.user.gamesWonCount === 1, 'a win pays 10 million points');
const tie = await rpc(a, 'record_match', 'snake', 'Neon Snake', 'tie');
check(tie.earnedPoints === 5_000_000 && tie.user.gamesPlayedCount === 2 && tie.user.gamesWonCount === 1, 'a tie pays 5 million and does not count as a win');
const loss = await rpc(a, 'record_match', 'snake', 'Neon Snake', 'loss', 'Rival');
check(loss.earnedPoints === 0 && loss.totalNoobPoints === 15_001_000 && loss.user.gamesPlayedCount === 3, 'a loss pays nothing');
const gs = (await db.query('select game_id, game_title, score::text score, points_awarded::text pa, result, opponent from game_scores where user_id = $1 order by created_at, id', [a])).rows;
check(gs.length === 3 && gs[0].score === '10000000' && gs[0].opponent === 'Bot' && gs[2].opponent === 'Rival' && gs[1].result === 'tie', 'each match is written to the scores list');
check((await txs(a)).map((t) => t.reason).join('|') === 'Won Neon Snake match|Tied Neon Snake match', 'wins and ties (but not zero-point losses) appear in the wallet history');
await expectFail(() => rpc(a, 'record_match', 'snake', 'x', 'super-win'), /Invalid result/, 'a made-up result is refused');
await expectFail(() => rpc(a, 'record_match', '', 'x', 'win'), /gameId is required/, 'a missing game is refused');
await expectFail(() => asAnon(db, () => db.query(`select public.record_match('snake','x','win')`)), /permission denied/, 'a logged-out visitor can not record matches');
await expectFail(() => call(a, `insert into game_scores (user_id, game_id, score) values ($1, 'snake', 999999999)`, [a]), /permission denied/, 'scores can not be written straight into the table');
// rate limit
await resetPeople();
for (let i = 0; i < 20; i++) await rpc(a, 'record_match', 'snake', 'Neon Snake', 'loss');
await expectFail(() => rpc(a, 'record_match', 'snake', 'Neon Snake', 'win'), /Too many requests/, 'the 21st result in a minute is refused (no points-minting loops)');
// survival
await resetPeople();
const sv = await rpc(a, 'submit_survival_score', 'runner', 'Endless Runner', 42.9);
check(sv.earnedPoints === 42_000_000 && sv.survivalSeconds === 42 && sv.user.noobPoints === 42_000_000 && sv.user.gamesPlayedCount === 1, 'a survival run pays 1 million per whole second');
const svMax = await rpc(a, 'submit_survival_score', 'runner', 'Endless Runner', 999999);
check(svMax.survivalSeconds === 3600 && svMax.earnedPoints === 3_600_000_000 && svMax.totalNoobPoints === 3_642_000_000, 'a run is capped at one hour (3.6 billion — larger than a normal integer, stored fine)');
check((await db.query('select score::text s from game_scores where user_id = $1 order by score desc limit 1', [a])).rows[0].s === '3600000000', 'the score list holds the big number exactly');
for (const bad of [0, -3, 0.5, null]) await expectFail(() => rpc(a, 'submit_survival_score', 'runner', 'Endless Runner', bad), /Invalid survival time/, `${bad} seconds is refused`);
// chess
await resetPeople(); await setPts(a, 1234); await setPts(b, 5678);
await expectFail(() => rpc(a, 'record_match', 'chess_blitz', 'Chess Blitz', 'win', 'Bot', true), /No active Chess Blitz round/, 'a chess win can not be claimed without starting a round');
check((await pts(a)) === 1234, '...and nothing was paid');
const cs = await rpc(a, 'start_chess_round');
check(cs.success === true && cs.isPro === undefined, 'starting a round works for a free account');
const cw = await rpc(a, 'record_match', 'chess_blitz', 'Chess Blitz', 'win', 'Bot', true);
check(cw.earnedPoints === 50_000_000 && cw.totalNoobPoints === 50_001_234, 'a chess win against the bot pays 50 million');
await expectFail(() => rpc(a, 'record_match', 'chess_blitz', 'Chess Blitz', 'win', 'Bot', true), /No active Chess Blitz round/, 'the same round can not be paid twice');
const cs2 = await rpc(a, 'start_chess_round');
check(cs2.success === false && /once a week on the free plan/.test(cs2.error) && new Date(cs2.nextAvailableAt) > new Date(Date.now() + 6 * 86400000), 'a second round in the same week is refused, with the date it opens again');
await rpc(b, 'start_chess_round');
const cl = await rpc(b, 'record_match', 'chess_blitz', 'Chess Blitz', 'loss', 'Bot', true);
check(cl.earnedPoints === -5678 && cl.totalNoobPoints === 0 && (await txs(b)).at(-1).reason === 'Lost Chess Blitz — balance wiped', 'a chess loss against the bot wipes the whole balance');
await rpc(c, 'start_chess_round');
check((await rpc(c, 'record_match', 'chess_blitz', 'Chess Blitz', 'tie', 'Bot', true)).earnedPoints === 5_000_000, 'a chess tie pays 5 million');
await rpc(d, 'start_chess_round');
check((await rpc(d, 'record_match', 'chess_blitz', 'Chess Blitz', 'win', 'Friend', false)).earnedPoints === 10_000_000, 'chess NOT against the bot pays like any other game');
await db.query(`update user_game_state set last_chess_blitz_at = now() - interval '8 days' where user_id = $1`, [a]);
check((await rpc(a, 'start_chess_round')).success === true, 'a week later the free account can play again');
// pro: 4 a week
await resetPeople(); await db.query(`update profiles set pro_tier = 'pro' where id = $1`, [a]);
const proRounds = [];
for (let i = 0; i < 4; i++) proRounds.push((await rpc(a, 'start_chess_round')).success);
const p5 = await rpc(a, 'start_chess_round');
check(proRounds.every(Boolean) && (await rpc(a, 'start_chess_round')).isPro === undefined, '(setup) four Pro rounds start');
check(p5.success === false && /4 rounds a week, even on NOOB Pro/.test(p5.error) && p5.nextAvailableAt, 'the fifth Pro round in a week is refused');
await expectFail(() => call(a, `select * from user_game_state`), /permission denied/, 'the chess limits table is not readable by browsers');

// =====================================================================================
section('9. The leaderboard');
await resetPeople();
await setPts(a, 900_000_000_000_000); await setPts(b, 800); await setPts(c, 700);
await db.query('update profiles set is_ai = true where id = $1', [d]); await setPts(d, 999_999_999_999_999_999n);
const lb = await rpc(b, 'game_leaderboard');
check(lb.leaderboard.length === 10 && lb.leaderboard.every((e, i) => e.rank === i + 1) && lb.leaderboard.every((e, i, arr) => i === 0 || arr[i - 1].noobPoints >= e.noobPoints), 'the top 10 are ranked by points');
check(!lb.leaderboard.some((e) => e.userId === d), 'AI accounts are not on the leaderboard');
check(lb.leaderboard[0].userId === a && lb.leaderboard[0].noobPoints === 900_000_000_000_000 && lb.leaderboard[0].displayName && 'gamesWon' in lb.leaderboard[0] && 'isVerified' in lb.leaderboard[0] && !('email' in lb.leaderboard[0]), 'each entry has only public details');
const higher = (await db.query('select count(*)::int n from profiles where not is_ai and noob_points > 800')).rows[0].n;
check(lb.currentUserPoints === 800 && lb.currentUserRank === higher + 1, 'you see your own points and rank');
await expectFail(() => asAnon(db, () => db.query('select public.game_leaderboard()')), /permission denied/, 'a logged-out visitor can not see it');

// =====================================================================================
section('10. Two-player matches (friend rooms)');
await resetPeople(); await setPts(a, 0); await setPts(b, 0);
const rm = await rpc(a, 'join_game_room', 'ROOM1', 'snake', 'Neon Snake');
check(rm.success && rm.room.status === 'waiting' && rm.room.players.length === 1 && rm.room.players[0].userId === a && rm.room.players[0].username === aName && rm.room.resultsSubmittedBy.length === 0 && rm.room.board === null, 'the first person creates the room and waits');
check((await rpc(a, 'join_game_room', 'ROOM1', 'snake')).room.players.length === 1, 'joining your own room again changes nothing');
const rm2 = await rpc(b, 'join_game_room', 'ROOM1', 'snake');
check(rm2.room.status === 'ready' && rm2.room.players.length === 2 && rm2.room.players[1].userId === b, 'the friend joins and the match is ready');
await expectFail(() => rpc(c, 'join_game_room', 'ROOM1', 'snake'), /already full/, 'a third person is refused');
await expectFail(() => rpc(c, 'get_game_room', 'ROOM1'), /not part of this match/, 'a stranger can not look into the room');
await expectFail(() => rpc(a, 'get_game_room', 'NOPE'), /not found or has expired/, 'an unknown room is refused');
await expectFail(() => rpc(a, 'join_game_room', '', 'snake'), /Room code and gameId are required/, 'a missing code is refused');
await expectFail(() => rpc(c, 'submit_game_room_result', 'ROOM1', 'win'), /not part of this match/, 'a stranger can not report a result');
await expectFail(() => rpc(a, 'submit_game_room_result', 'ROOM1', 'amazing'), /Invalid result/, 'a made-up result is refused');
const s1 = await rpc(a, 'submit_game_room_result', 'ROOM1', 'win');
check(s1.room.status === 'ready' && s1.room.resultsSubmittedBy.length === 1 && s1.room.outcome === null, 'one result alone does not finish the match');
await rpc(a, 'submit_game_room_result', 'ROOM1', 'loss');
check((await rpc(a, 'get_game_room', 'ROOM1')).room.resultsSubmittedBy.length === 1, 'sending a second, different result does not change the first');
const s2 = await rpc(b, 'submit_game_room_result', 'ROOM1', 'loss');
check(s2.room.status === 'finished' && s2.room.outcome.results[a] === 'win' && s2.room.outcome.results[b] === 'loss' && s2.room.outcome.points[a] === 10_000_000 && s2.room.outcome.points[b] === 0, 'when both have reported, whoever did better wins (win beats loss)');
check((await pts(a)) === 10_000_000 && (await pts(b)) === 0 && s2.yourTotalPoints === 0, 'the winner is paid once');
check((await txs(a)).at(-1).reason === 'Won Neon Snake vs @' + (await db.query('select username from profiles where id = $1', [b])).rows[0].username, 'the history names the opponent');
await rpc(a, 'submit_game_room_result', 'ROOM1', 'win');
check((await pts(a)) === 10_000_000, 'reporting again after the match is over pays nothing more');
check((await db.query('select games_played_count, games_won_count from profiles where id = $1', [a])).rows[0].games_won_count === 1 && (await db.query('select count(*)::int n from game_scores where user_id = $1', [a])).rows[0].n === 1, 'the match counts once');
await rpc(a, 'join_game_room', 'ROOM2', 'quiz'); await rpc(b, 'join_game_room', 'ROOM2', 'quiz');
await rpc(a, 'submit_game_room_result', 'ROOM2', 'win'); const tieRoom = await rpc(b, 'submit_game_room_result', 'ROOM2', 'win');
check(tieRoom.room.outcome.results[a] === 'tie' && tieRoom.room.outcome.points[a] === 5_000_000 && tieRoom.room.outcome.points[b] === 5_000_000, 'equal results are a tie: 5 million each');
// chess room stakes
await resetPeople(); await setPts(a, 4000); await setPts(b, 9000);
await rpc(a, 'start_chess_round'); await rpc(b, 'start_chess_round');
await rpc(a, 'join_game_room', 'CH1', 'chess_blitz', 'Chess Blitz'); await rpc(b, 'join_game_room', 'CH1', 'chess_blitz', 'Chess Blitz');
await rpc(a, 'submit_game_room_result', 'CH1', 'win'); const chessDone = await rpc(b, 'submit_game_room_result', 'CH1', 'loss');
check(chessDone.room.outcome.points[a] === 50_000_000 && chessDone.room.outcome.points[b] === -9000 && (await pts(a)) === 50_004_000 && (await pts(b)) === 0, 'a matched chess game has the real stakes: 50 million to the winner, the loser\'s balance wiped');
await resetPeople(); await setPts(a, 4000); await setPts(b, 9000);
await rpc(a, 'join_game_room', 'CH2', 'chess_blitz', 'Chess Blitz'); await rpc(b, 'join_game_room', 'CH2', 'chess_blitz', 'Chess Blitz');
await rpc(a, 'submit_game_room_result', 'CH2', 'win'); await rpc(b, 'submit_game_room_result', 'CH2', 'loss');
check((await pts(a)) === 10_004_000 && (await pts(b)) === 9000, 'without having started a round, the chess stakes do NOT apply (no skipping the weekly limit)');
await expectFail(() => call(a, 'select * from game_rooms'), /permission denied/, 'the rooms table is not readable directly');
await expectFail(() => call(a, `update game_rooms set status = 'finished' where code = 'CH2'`), /permission denied/, 'nor editable');

// =====================================================================================
section('11. Live Tic Tac Toe on a shared board');
await resetPeople(); await setPts(a, 0); await setPts(b, 0);
await rpc(a, 'join_game_room', 'TT1', 'tictactoe', 'Tic Tac Toe');
await expectFail(() => rpc(a, 'submit_game_room_move', 'TT1', 0), /Waiting for an opponent/, 'you can not move before someone joins');
const ttj = await rpc(b, 'join_game_room', 'TT1', 'tictactoe');
check(ttj.room.board.length === 9 && ttj.room.board.every((x) => x === null) && ttj.room.turn === a, 'when the second player joins the board is empty and the first player starts');
await expectFail(() => rpc(a, 'submit_game_room_result', 'TT1', 'win'), /uses live moves/, 'a live game can not be settled by reporting a result');
await expectFail(() => rpc(b, 'submit_game_room_move', 'TT1', 0), /not your turn/, 'you can not move out of turn');
await expectFail(() => rpc(c, 'submit_game_room_move', 'TT1', 0), /not part of this match/, 'a stranger can not move');
await expectFail(() => rpc(a, 'submit_game_room_move', 'TT1', 9), /Invalid move/, 'a cell off the board is refused');
await expectFail(() => rpc(a, 'submit_game_room_move', 'TT1', -1), /Invalid move/, 'so is a negative cell');
const m1 = await rpc(a, 'submit_game_room_move', 'TT1', 0);
check(m1.room.board[0] === 'X' && m1.room.turn === b, 'the first move puts an X and passes the turn');
await expectFail(() => rpc(b, 'submit_game_room_move', 'TT1', 0), /already taken/, 'you can not take an occupied cell');
await rpc(b, 'submit_game_room_move', 'TT1', 3); await rpc(a, 'submit_game_room_move', 'TT1', 1); await rpc(b, 'submit_game_room_move', 'TT1', 4);
const won = await rpc(a, 'submit_game_room_move', 'TT1', 2);
check(won.room.status === 'finished' && won.room.outcome.results[a] === 'win' && won.room.outcome.results[b] === 'loss' && won.yourTotalPoints === 10_000_000, 'three in a row wins and pays the winner 10 million');
await expectFail(() => rpc(b, 'submit_game_room_move', 'TT1', 5), /already ended/, 'no moves after the game is over');
check((await pts(b)) === 0 && (await db.query('select games_played_count from profiles where id = $1', [b])).rows[0].games_played_count === 1, 'the loser is paid nothing but the game counts');
await rpc(a, 'join_game_room', 'TT2', 'tictactoe'); await rpc(b, 'join_game_room', 'TT2', 'tictactoe');
const order = [[a, 0], [b, 1], [a, 2], [b, 4], [a, 3], [b, 5], [a, 7], [b, 6]];
for (const [u, i] of order) await rpc(u, 'submit_game_room_move', 'TT2', i);
const drawn = await rpc(a, 'submit_game_room_move', 'TT2', 8);
check(drawn.room.status === 'finished' && drawn.room.outcome.results[a] === 'tie' && drawn.room.outcome.points[b] === 5_000_000, 'a full board with no line is a tie: 5 million each');
await rpc(a, 'join_game_room', 'TT3', 'tictactoe'); await rpc(b, 'join_game_room', 'TT3', 'tictactoe');
for (const [u, i] of [[a, 0], [b, 3], [a, 1], [b, 4]]) await rpc(u, 'submit_game_room_move', 'TT3', i);
const bw = await rpc(a, 'submit_game_room_move', 'TT3', 8); // a: 0,1,8 no line
const bwin = await rpc(b, 'submit_game_room_move', 'TT3', 5); // b: 3,4,5 wins as O
check(bwin.room.outcome.results[b] === 'win' && bwin.room.outcome.results[a] === 'loss', 'the second player (O) can win too');
await rpc(a, 'join_game_room', 'SN1', 'snake'); await rpc(b, 'join_game_room', 'SN1', 'snake');
await expectFail(() => rpc(a, 'submit_game_room_move', 'SN1', 0), /does not support live sync/, 'other games have no live board');

// =====================================================================================
section('12. Finding an opponent (matchmaking)');
await resetPeople();
const mm1 = await rpc(a, 'join_matchmaking', 'tictactoe', 'Tic Tac Toe');
check(mm1.success && mm1.matched === false && !mm1.room, 'the first player waits');
check((await rpc(a, 'matchmaking_status')).matched === false, 'still waiting');
const mm2 = await rpc(b, 'join_matchmaking', 'tictactoe', 'Tic Tac Toe');
check(mm2.matched === true && mm2.room.status === 'ready' && mm2.room.code.startsWith('MM-') && mm2.room.players[0].userId === a && mm2.room.players[1].userId === b && mm2.room.board.length === 9 && mm2.room.turn === a, 'the second player is matched straight away; the waiting player goes first');
const st1 = await rpc(a, 'matchmaking_status');
check(st1.matched === true && st1.room.code === mm2.room.code, 'the first player finds out on their next check');
check((await rpc(a, 'matchmaking_status')).matched === false && (await rpc(b, 'matchmaking_status')).matched === false, 'and the queue is empty afterwards');
check((await rpc(a, 'get_game_room', mm2.room.code)).room.players.length === 2, 'both can open the room');
await rpc(a, 'join_matchmaking', 'quiz', 'Quiz');
const otherGame = await rpc(b, 'join_matchmaking', 'snake', 'Snake');
check(otherGame.matched === false, 'people waiting for different games are not paired');
await rpc(c, 'join_matchmaking', 'snake'); // pairs with b
check((await rpc(b, 'matchmaking_status')).matched === true, '(setup) b and c were paired for snake');
await rpc(a, 'join_matchmaking', 'quiz'); // re-joining replaces a's old entry
check((await db.query('select count(*)::int n from matchmaking_queue where user_id = $1', [a])).rows[0].n === 1, 'joining again replaces your old place in the queue');
await rpc(a, 'cancel_matchmaking');
check((await db.query('select count(*)::int n from matchmaking_queue')).rows[0].n === 0 && (await rpc(a, 'cancel_matchmaking')).success, 'cancelling leaves the queue');
await rpc(a, 'join_matchmaking', 'quiz');
await db.query(`update matchmaking_queue set joined_at = now() - interval '2 minutes'`);
check((await rpc(b, 'join_matchmaking', 'quiz')).matched === false, 'someone who has been waiting over a minute is dropped, not matched');
await db.query(`update game_rooms set created_at = now() - interval '31 minutes'`);
await rpc(c, 'join_game_room', 'FRESH', 'snake');
check((await db.query('select count(*)::int n from game_rooms')).rows[0].n === 1, 'old rooms (over 30 minutes) are cleaned up');
await expectFail(() => rpc(a, 'cleanup_stale_games'), /permission denied/, 'a browser can not run the clean-up');
await expectFail(() => call(a, 'select * from matchmaking_queue'), /permission denied/, 'the queue is not readable directly');

// =====================================================================================
section('13. Game invites in chat');
await resetPeople();
const inv = await rpc(a, 'send_game_invite', b, 'tictactoe', 'Tic Tac Toe', 'ROOM-INV');
check(inv.success && inv.message === 'Invite sent to chat!' && inv.invite.mediaType === 'game_invite' && inv.invite.gameInvite.roomCode === 'ROOM-INV' && inv.invite.gameInvite.fromUsername === aName && inv.invite.senderId === a, 'an invite lands in the friend\'s chat as a game card');
check((await rpc(b, 'chat_messages', inv.chatId)).messages.some((m) => m.id === inv.invite.id), 'the friend can read it in that chat');
const inv2 = await rpc(a, 'send_game_invite', b, 'tictactoe', 'Tic Tac Toe', 'ROOM-INV');
check(inv2.message === 'Invite already sent' && inv2.invite.id === inv.invite.id && inv2.chatId === inv.chatId, 'a double-tap does not post it twice');
const inv3 = await rpc(a, 'send_game_invite', b, 'tictactoe', 'Tic Tac Toe');
check(inv3.invite.gameInvite.roomCode.startsWith('room_tictactoe_') && inv3.chatId === inv.chatId, 'without a room code one is made up, in the same chat');
await expectFail(() => rpc(a, 'send_game_invite', '00000000-0000-0000-0000-000000000001', 'x', 'y'), /Target user not found/, 'an unknown target is refused');
await rpc(b, 'block_user', a);
await expectFail(() => rpc(a, 'send_game_invite', b, 'chess', 'Chess', 'R2'), /./, 'you can not invite someone who blocked you');

// =====================================================================================
section('14. Safety reports');
await resetPeople();
await db.query(`insert into follows (follower_id, followee_id) values ($1, $2), ($2, $1)`, [a, b]);
const rep = await rpc(a, 'submit_report', '@' + (await db.query('select username from profiles where id = $1', [b])).rows[0].username.toUpperCase(), 'Spam', '  sends junk  ');
check(rep.success && rep.report.targetUserId === b && rep.report.reason === 'Spam' && rep.report.details === 'sends junk' && rep.report.status === 'pending_review' && rep.report.reporterUsername === aName && rep.message.includes('has been blocked'), 'a report is filed against the person');
check((await db.query('select 1 from blocks where blocker_id = $1 and blocked_id = $2', [a, b])).rows.length === 1 && (await db.query('select count(*)::int n from follows where (follower_id = $1 and followee_id = $2) or (follower_id = $2 and followee_id = $1)', [a, b])).rows[0].n === 0, 'reporting also blocks them (and ends any follow)');
const rep2 = await rpc(a, 'submit_report', b);
check(rep2.report.reason === 'Cyber Bullying & Harassment' && rep2.report.details === 'Report submitted via Trust & Safety', 'a report by id, with no reason, gets the standard wording');
await expectFail(() => rpc(a, 'submit_report', aName), /cannot report or block your own account/, 'you can not report yourself');
await expectFail(() => rpc(a, 'submit_report', 'nobody_xyz_zzz'), /Account not found/, 'an unknown account is refused');
await expectFail(() => rpc(a, 'submit_report', '  '), /User ID or @username is required/, 'an empty name is refused');
await expectFail(() => call(a, 'select * from reports'), /permission denied/, 'reports are not readable by browsers');
await expectFail(() => rpc(a, 'admin_reports'), /Administrator privileges required/, 'an ordinary user can not open the report list');
const ar = await rpc(admin, 'admin_reports');
check(ar.success && ar.reports.length === 2 && ar.reports[0].targetUsername && ar.reports[0].reporterUsername === aName && ar.reports[0].targetAvatar, 'the admin sees every report, newest first');
await expectFail(() => rpc(a, 'admin_report_action', rep.reportId, 'resolved', false), /Administrator privileges/, 'an ordinary user can not act on a report');
const act1 = await rpc(admin, 'admin_report_action', rep2.reportId, 'dismissed', false);
check(act1.success && act1.report.status === 'dismissed' && act1.report.reviewedBy === adminName && act1.message.includes('dismissed'), 'the admin can dismiss a report');
const act2 = await rpc(admin, 'admin_report_action', rep.reportId, 'resolved', true);
const tgt = (await db.query('select p.is_suspended, pp.suspended_reason, u.banned_until from profiles p join profile_private pp on pp.user_id = p.id join auth.users u on u.id = p.id where p.id = $1', [b])).rows[0];
check(act2.report.status === 'resolved' && tgt.is_suspended === true && tgt.suspended_reason === 'Account suspended following safety report: Spam' && tgt.banned_until, '"Suspend & resolve" suspends the reported account and blocks its sign-in');
check((await rpc(admin, 'admin_report_action', rep.reportId)).report.status === 'resolved', 'the default action is "resolved"');
await expectFail(() => rpc(admin, 'admin_report_action', '00000000-0000-0000-0000-000000000001', 'resolved'), /Report not found/, 'an unknown report is refused');
await db.query(`update profiles set is_suspended = false where id = $1`, [b]); await db.query('update auth.users set banned_until = null where id = $1', [b]);

// =====================================================================================
section('15. Admin tools');
await resetPeople(); await setPts(a, 500);
await expectFail(() => rpc(a, 'admin_users_list'), /Administrator privileges required/, 'an ordinary user can not list accounts');
const lst = await rpc(admin, 'admin_users_list');
const la0 = lst.users.find((u) => u.id === a);
check(lst.success && lst.users.length === raw.users.length && la0.email !== undefined && la0.mobileNumber !== undefined && la0.isSuspended === false && la0.noobPoints === 500 && !JSON.stringify(lst).includes('encrypted_password') && !('password' in la0), 'the admin sees every account with contact details (never passwords)');
// suspend
await expectFail(() => rpc(a, 'admin_suspend_user', b, 'x', true), /permission to suspend accounts/, 'an ordinary user can not suspend anyone');
await expectFail(() => rpc(admin, 'admin_suspend_user', adminName, 'x', true), /cannot be suspended/, 'the main admin can not be suspended');
await expectFail(() => rpc(admin, 'admin_suspend_user', 'zzz_nobody', 'x', true), /Target account not found/, 'an unknown account is refused');
await expectFail(() => rpc(admin, 'admin_suspend_user', '', 'x', true), /Target user ID or username is required/, 'no target is refused');
const sus = await rpc(admin, 'admin_suspend_user', aName.toUpperCase(), '  spamming  ', true);
const sus1 = (await db.query('select p.is_suspended, pp.suspended_reason, (u.banned_until > now() + interval \'50 years\') as banned from profiles p join profile_private pp on pp.user_id = p.id join auth.users u on u.id = p.id where p.id = $1', [a])).rows[0];
check(sus.success && sus.user.isSuspended === true && sus1.is_suspended && sus1.suspended_reason === 'spamming' && sus1.banned === true, 'suspending (by name, any capitals) flags the account, records the reason and stops sign-in');
check((await db.query(`select message from notifications where target_user_id = $1 and title = '⚠️ Account Suspended'`, [a])).rows[0].message.endsWith('Reason: spamming'), 'the person is told why');
await expectFail(() => rpc(a, 'wallet_transfer', b, 1), /Unauthorized/, 'a suspended account can no longer act');
const uns = await rpc(admin, 'admin_suspend_user', a, null, false);
const uns1 = (await db.query('select p.is_suspended, pp.suspended_reason, u.banned_until from profiles p join profile_private pp on pp.user_id = p.id join auth.users u on u.id = p.id where p.id = $1', [a])).rows[0];
check(uns.message.includes('unsuspended') && uns1.is_suspended === false && uns1.suspended_reason === null && uns1.banned_until === null, 'unsuspending restores everything');
check((await db.query(`select 1 from notifications where target_user_id = $1 and title = '✅ Account Restored'`, [a])).rows.length === 1, 'and tells them');
await db.query('update profiles set is_suspended = true where id = $1', [a]);
await expectFail(() => call(a, `update profiles set is_suspended = false where id = $1`, [a]), /protected profile fields/, 'nobody can un-suspend themselves through the table');
await db.query('update profiles set is_suspended = false where id = $1', [a]);
await expectFail(() => call(admin, `update profiles set is_suspended = true where id = $1`, [b]), /protected profile fields/, 'even the admin\'s browser can not flip flags through the table — only the function does');
// adjust points
await setPts(a, 5000);
await expectFail(() => rpc(a, 'admin_adjust_points', a, 999), /permission to adjust point balances/, 'an ordinary user can not adjust balances');
const adj1 = await rpc(admin, 'admin_adjust_points', a, 1234.6, null, '  fixing a bug ');
check(adj1.success && adj1.user.noobPoints === 1235 && adj1.message.includes('1,235') && (await txs(a)).at(-1).reason === 'fixing a bug' && (await txs(a)).at(-1).amount === '-3765', '"set to" replaces the balance and is logged with the admin\'s reason');
const adj2 = await rpc(admin, 'admin_adjust_points', a, null, -100000);
check(adj2.user.noobPoints === 0, 'a change below zero stops at zero');
const adj3 = await rpc(admin, 'admin_adjust_points', a, null, 50);
check(adj3.user.noobPoints === 50 && (await txs(a)).at(-1).reason.includes('Balance corrected by NOOB Admin (0 → 50)'), '"add" adds and writes the default reason');
await expectFail(() => rpc(admin, 'admin_adjust_points', a), /Provide either setTo or delta/, 'neither value is refused');
await expectFail(() => rpc(admin, 'admin_adjust_points', '00000000-0000-0000-0000-000000000001', 5), /Target account not found/, 'an unknown account is refused');
check((await db.query(`select message from notifications where target_user_id = $1 and title = '⚠️ Balance Adjusted'`, [a])).rows.length === 3, 'each adjustment sends the person a notice');
// broadcast
const bc0 = await rpc(admin, 'admin_send_notification', 'all', ' Maintenance ', ' Tonight at 9 ');
check(bc0.success && bc0.message.includes('All Users'), 'a broadcast is sent to everyone');
const seenB = (await rpc(b, 'my_notifications')).notifications.find((x) => x.title === 'Maintenance');
check(seenB && seenB.type === 'admin_broadcast' && seenB.targetUserId === 'all' && seenB.message === 'Tonight at 9', 'everyone sees it (trimmed)');
await rpc(admin, 'admin_send_notification', '@' + aName, 'Hello', 'Just you');
check((await rpc(a, 'my_notifications')).notifications.some((x) => x.title === 'Hello' && x.type === 'admin_direct') && !(await rpc(b, 'my_notifications')).notifications.some((x) => x.title === 'Hello'), 'a direct notice reaches only that person');
await expectFail(() => rpc(admin, 'admin_send_notification', 'all', '', 'x'), /title and message are required/, 'a notice needs a title');
await expectFail(() => rpc(admin, 'admin_send_notification', 'zzz_nobody', 'a', 'b'), /User "@zzz_nobody" was not found/, 'an unknown person is refused');
await expectFail(() => rpc(a, 'admin_send_notification', 'all', 'a', 'b'), /permission to send notifications/, 'an ordinary user can not broadcast');
// delete
await expectFail(() => rpc(a, 'admin_delete_user', b), /permission to delete accounts/, 'an ordinary user can not delete accounts');
await expectFail(() => rpc(admin, 'admin_delete_user', adminName), /cannot be deleted/, 'the main admin can not be deleted');
await expectFail(() => rpc(admin, 'admin_delete_user', 'zzz_nobody'), /Target account not found/, 'an unknown account is refused');
const before = await n('select count(*)::int n from profiles');
const postsOfD = await n('select count(*)::int n from posts where user_id = $1', [d]);
const del = await rpc(admin, 'admin_delete_user', d);
check(del.success && del.message.includes('permanently deleted') && (await n('select count(*)::int n from profiles')) === before - 1 && (await n('select count(*)::int n from auth.users where id = $1', [d])) === 0 && (await n('select count(*)::int n from posts where user_id = $1', [d])) === 0, `deleting an account removes the login, the profile and everything they made (${postsOfD} posts)`);

// =====================================================================================
section('16. Support ratings');
await db.query('delete from support_reviews');
check((await rpc(b, 'support_rating_summary')).count === 0 && (await rpc(b, 'support_rating_summary')).average === null, 'with no ratings there is no average');
const sr1 = await rpc(b, 'submit_support_review', 5, 'great');
check(sr1.success && sr1.average === 5 && sr1.count === 1, 'the first rating');
const sr2 = await rpc(c, 'submit_support_review', 4, null);
check(sr2.average === 4.5 && sr2.count === 2 && (await rpc(a, 'support_rating_summary')).average === 4.5, 'the average is shared by everyone');
for (const bad of [0, 6, null, -1]) await expectFail(() => rpc(b, 'submit_support_review', bad), /rating must be a number from 1 to 5/, `a rating of ${bad} is refused`);
check((await rpc(b, 'submit_support_review', 3.6)).count === 3 && (await db.query('select max(rating) m from support_reviews')).rows[0].m === 5, 'a fractional rating is rounded');

// =====================================================================================
section('17. Finding friends from contacts');
await db.query(`update profile_private set mobile_number = '98765-43210', country_code = '+91' where user_id = $1`, [c]);
await db.query(`update profile_private set mobile_number = '(555) 010 9999' where user_id = $1`, [b]);
const mc = await rpc(a, 'match_contacts', ['+91 98765 43210', '12', 'garbage', '0000000']);
check(mc.length === 1 && mc[0].id === c && mc[0].username && !JSON.stringify(mc).includes('98765') && 'followersCount' in mc[0] && mc[0].isFollowing === false, 'a phone number in any format finds the member — and the number is never sent back');
check((await rpc(c, 'match_contacts', ['9876543210'])).length === 0, 'you never find yourself');
check((await rpc(a, 'match_contacts', ['+1 555-010-9999'])).length === 1, 'formatting characters are ignored');
check((await rpc(a, 'match_contacts', [])).length === 0 && (await rpc(a, 'match_contacts', null)).length === 0, 'an empty list finds nobody');
await expectFail(() => asAnon(db, () => db.query(`select public.match_contacts(array['1234567'])`)), /permission denied/, 'a logged-out visitor can not check numbers');

// =====================================================================================
section('18. Screenshot alerts');
await db.query('delete from notifications');
const post = (await db.query('select id, user_id from posts where user_id <> $1 limit 1', [a])).rows[0];
await rpc(a, 'screenshot_alert', 'post', post.id);
const sa = (await db.query(`select * from notifications where type = 'screenshot_alert' and target_user_id = $1`, [post.user_id])).rows;
check(sa.length === 1 && sa[0].title === '📸 Screenshot Detected' && sa[0].message === `@${aName} took a screenshot of your post.` && sa[0].actor_id === a, 'the owner of a post is told');
await rpc(a, 'screenshot_alert', 'profile', a);
check((await n(`select count(*)::int n from notifications where type = 'screenshot_alert' and target_user_id = $1`, [a])) === 0, 'you are never told about your own screenshots');
await rpc(a, 'screenshot_alert', 'profile', c);
check((await n(`select count(*)::int n from notifications where type = 'screenshot_alert' and target_user_id = $1`, [c])) === 1, 'a profile owner is told');
await expectFail(() => rpc(a, 'screenshot_alert', 'post', '00000000-0000-0000-0000-000000000001'), /Post not found/, 'an unknown post is refused');
await expectFail(() => rpc(a, 'screenshot_alert', 'video', post.id), /Unknown contentType/, 'an unknown kind is refused');
const abChat = (await rpc(a, 'create_chat', [c])).chat;
await rpc(a, 'screenshot_alert', 'chat', abChat.id);
check((await n(`select count(*)::int n from notifications where type = 'screenshot_alert' and target_user_id = $1 and message like '%chat%'`, [c])) === 1, 'the other person in a chat is told');
await expectFail(() => rpc(b, 'screenshot_alert', 'chat', abChat.id), /not a participant/, 'a stranger can not trigger alerts for a chat they are not in');
const LOUNGE = (await db.query('select id from chats where is_global_default')).rows[0].id;
await rpc(a, 'screenshot_alert', 'chat', LOUNGE);
check((await n(`select count(*)::int n from notifications where type = 'screenshot_alert'`)) === 3, 'the public lounge does not spam its 20 members');

// =====================================================================================
section('19. Push registration');
check((await rpc(a, 'register_push_token', 'tok1')).success && (await rpc(a, 'register_push_token', 'tok1')).success && (await rpc(a, 'register_push_token', 'tok2')).success, 'device tokens are saved');
check((await db.query('select push_tokens from profile_private where user_id = $1', [a])).rows[0].push_tokens.sort().join() === 'tok1,tok2', 'each token is stored once');
await expectFail(() => rpc(a, 'register_push_token', ' '), /Push token is required/, 'an empty token is refused');
check((await rpc(a, 'save_push_subscription', { endpoint: 'https://push.example/1', keys: { p256dh: 'x', auth: 'y' } })).success, 'a browser push subscription is saved');
check((await rpc(a, 'save_push_subscription', { endpoint: 'https://push.example/2' })).success && (await n('select count(*)::int n from push_subscriptions where user_id = $1', [a])) === 1, 'a newer one replaces it');
await expectFail(() => rpc(a, 'save_push_subscription', { keys: {} }), /valid push subscription/, 'a subscription without an endpoint is refused');
check((await call(b, 'select * from push_subscriptions')).length === 0, 'nobody else can read your subscription');
check((await rpc(a, 'remove_push_subscription')).success && (await n('select count(*)::int n from push_subscriptions where user_id = $1', [a])) === 0, 'and it can be removed');
check((await rpc(a, 'get_vapid_public_key')) === 'BJD8vrncNsY8azuccm06W6rB5DKz6OcBqbegOUj5N-ZzAmYW_PgUddPNCQVnoR4lUf9r4f2z5orkhPLfIf6i2r8', 'the public push key is already set, and everyone can read it');
await db.query(`update internal_config set value = 'BPUBLICKEY123' where key = 'vapid_public_key'`);
check((await rpc(a, 'get_vapid_public_key')) === 'BPUBLICKEY123', 'it is read from the private settings table (which a data import can never overwrite)');

// =====================================================================================
section('20. The physical-goods store');
const prod = await rpc(admin, 'create_store_product', { price: 499.5, description: '  A cool T-shirt ', media: [{ type: 'photo', url: 'products/a.jpg' }, { type: 'video', url: 'products/b.mp4' }, { type: 'weird', url: 'products/c.jpg' }], inStock: false });
check(prod.success && prod.product.price === 499.5 && prod.product.description === 'A cool T-shirt' && prod.product.media.length === 3 && prod.product.media[2].type === 'photo' && prod.product.inStock === false, 'the admin adds a product (odd media types become photos)');
check((await rpc(b, 'list_store_products')).length === 1 && (await rpc(b, 'list_store_products'))[0].id === prod.product.id, 'everyone can browse the products');
await expectFail(() => rpc(a, 'create_store_product', { price: 5, description: 'x', media: [{ type: 'photo', url: 'p' }] }), /Only the NOOB admin account can add products/, 'an ordinary user can not add products');
await expectFail(() => rpc(admin, 'create_store_product', { price: 0, description: 'x', media: [{ type: 'photo', url: 'p' }] }), /valid price/, 'a zero price is refused');
await expectFail(() => rpc(admin, 'create_store_product', { price: '5', description: 'x', media: [{ type: 'photo', url: 'p' }] }), /valid price/, 'a price that is text is refused');
await expectFail(() => rpc(admin, 'create_store_product', { description: 'x', media: [{ type: 'photo', url: 'p' }] }), /valid price/, 'a missing price is refused');
await expectFail(() => rpc(admin, 'create_store_product', { price: 5, description: ' ', media: [{ type: 'photo', url: 'p' }] }), /description is required/, 'a description is required');
await expectFail(() => rpc(admin, 'create_store_product', { price: 5, description: 'x', media: [] }), /at least one photo or video/, 'at least one picture is required');
await expectFail(() => rpc(admin, 'create_store_product', { price: 5, description: 'x' }), /at least one photo or video/, 'a missing picture list is refused');
await expectFail(() => rpc(admin, 'create_store_product', { price: 5, description: 'x', media: Array.from({ length: 11 }, () => ({ type: 'photo', url: 'p' })) }), /at most 10 photos/, 'more than 10 photos is refused');
await expectFail(() => rpc(admin, 'create_store_product', { price: 5, description: 'x', media: Array.from({ length: 11 }, () => ({ type: 'video', url: 'p' })) }), /at most 10 videos/, 'more than 10 videos is refused');
await expectFail(() => call(a, `insert into store_products (price, description) values (1, 'x')`), /permission denied/, 'nobody can write products straight into the table');
await expectFail(() => rpc(a, 'delete_store_product', prod.product.id), /Only the NOOB admin account can manage products/, 'an ordinary user can not delete products');
await expectFail(() => rpc(admin, 'delete_store_product', '00000000-0000-0000-0000-000000000001'), /Product not found/, 'an unknown product is refused');
check((await rpc(admin, 'delete_store_product', prod.product.id)).success && (await rpc(b, 'list_store_products')).length === 0, 'the admin can remove a product');

// =====================================================================================
section('21. A creator\'s own insights');
const ins = (await rpc(a, 'my_insights')).insights;
check(['accountsReached', 'accountsEngaged', 'totalFollowers', 'profileActivity', 'skipRate', 'shareRate', 'likeRate', 'saveRate', 'repostRate', 'commentRate'].every((k) => typeof ins[k] === 'number') && ins.reachHistory.length === 7 && ins.reachHistory.every((x) => x.date && typeof x.value === 'number') && Array.isArray(ins.audienceDemographics), 'the insights have every number the dashboard shows, and a 7-day reach chart');
const someOwner = (await db.query(`select p.user_id id from posts p join post_likes l on l.post_id = p.id group by p.user_id order by count(*) desc limit 1`)).rows[0];
if (someOwner) {
  await db.query(`insert into post_views (post_id, user_id) select p.id, $2 from posts p where p.user_id = $1 on conflict do nothing`, [someOwner.id, b]);
  const i2 = (await rpc(someOwner.id, 'my_insights')).insights;
  check(i2.accountsReached >= 1 && i2.accountsEngaged >= 1 && i2.likeRate > 0 && i2.reachHistory.reduce((s, x) => s + x.value, 0) >= 1, 'a creator with likes and views sees real numbers');
}

// =====================================================================================
section('22. Who can call what');
const internal = [
  ['apply_points', `('${a}', 1000000, 'x')`], ['find_eligible_coupon', `('SUMMERSALE25', '${a}')`], ['consume_coupon', `('${c1.coupon.id}', '${a}')`],
  ['pick_birthday_gift', '()'], ['run_birthday_check', '()'], ['run_pro_renewals', '()'], ['cleanup_stale_games', '()'],
  ['finalize_room_outcome', `('X', '{}'::jsonb)`], ['set_suspension', `('${a}', true, 'x')`], ['game_player_json', `('${a}')`],
  ['noob_admin_id', '()'], ['acting_user', '()'], ['require_master_admin', `('x')`], ['award_points', `('${a}', 1000000, 'x')`], ['notify_user', `('${a}', 'x', null, 'x')`]
];
for (const [fn, args] of internal) await expectFail(() => call(a, `select public.${fn}${args}`), /permission denied/, `a browser can not call the internal ${fn}()`);
const G0 = '00000000-0000-0000-0000-000000000001';
const publicFns = {
  wallet_transfer: `('${b}', 5, null)`, record_match: `('snake', 'x', 'win')`, submit_survival_score: `('runner', 'x', 5)`,
  upgrade_pro: `('starter')`, verify_account: `('pw', 'points_monthly')`, purchase_shop_item: `('shop_fire_king')`,
  reveal_scratch_card: `('${G0}')`, admin_adjust_points: `('${a}', 5)`, admin_users_list: '()', game_leaderboard: '()',
  admin_delete_user: `('${a}')`, admin_suspend_user: `('${a}')`, admin_send_notification: `('all', 'x', 'y')`, admin_reports: '()',
  admin_report_action: `('${G0}')`, create_coupon: `('{}'::jsonb)`, my_coupons: '()', redeem_coupon_code: `('X')`,
  start_chess_round: '()', join_game_room: `('C', 'g')`, submit_game_room_move: `('C', 1)`, join_matchmaking: `('g')`,
  send_game_invite: `('${b}', 'g', 't')`, submit_report: `('x')`, submit_support_review: '(5)', screenshot_alert: `('post', '${G0}')`,
  register_push_token: `('t')`, create_store_product: `('{}'::jsonb)`, my_insights: '()', apply_live_avatar: `('neon_pulse')`,
  toggle_pro_auto_renew: '(true)', shop_catalog: '()', list_store_products: '()'
};
const anonBlocked = [];
for (const [fn, args] of Object.entries(publicFns)) {
  try { await asAnon(db, () => db.query(`select public.${fn}${args}`)); } catch (e) { if (/permission denied/.test(e.message)) anonBlocked.push(fn); else console.log(`     (${fn}: ${e.message})`); }
}
check(anonBlocked.length === Object.keys(publicFns).length, `a logged-out visitor is refused by all ${Object.keys(publicFns).length} money, game, shop and admin functions`);
for (const t of ['coupon_uses', 'reports', 'game_rooms', 'matchmaking_queue', 'user_game_state']) await expectFail(() => asAnon(db, () => db.query(`select * from public.${t}`)), /permission denied/, `a logged-out visitor can not read ${t}`);
check((await asAnon(db, async () => { try { await db.query('select * from public.shop_items'); return false; } catch (e) { return /permission denied/.test(e.message); } })), 'nor the shop list');
check((await call(a, 'select count(*)::int n from shop_items'))[0].n === 24 && (await call(a, 'select count(*)::int n from live_avatar_presets'))[0].n === 34, 'signed-in people can read the shop and preset lists');
await expectFail(() => call(a, `insert into shop_items (id, name, type, content, price, category, sort) values ('x', 'x', 'emoji', 'x', 1, 'x', 99)`), /permission denied/, 'but nobody can edit the shop list');
await expectFail(() => call(a, `update shop_items set price = 1`), /permission denied/, 'or its prices');

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
