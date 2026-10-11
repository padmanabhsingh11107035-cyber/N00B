// Tests migration 20261011000003: receipts for NOOB Pro / the verification badge, the "about to end" and "ended" emails, and friends
// paying for NOOB Pro (the whole price, or just the missing points), on a REAL Postgres (PGlite) with every migration applied.
//
// Usage: node scripts/supabase/test-email-receipts-pro-friend-pay.mjs
import { createTestDb, asUser } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const expectFail = async (fn, pattern, label) => {
  try { await fn(); check(false, label, '(expected an error, but it succeeded)'); }
  catch (e) { check(pattern.test(e.message), label, `(got: ${e.message})`); }
};
const section = (t) => console.log(`\n${t}`);

const db = await createTestDb();
const mkUser = async (name, { points = 0, email = null, password = 'pw123456' } = {}) => {
  const id = (await db.query(`select gen_random_uuid() as id`)).rows[0].id;
  await db.query(`insert into auth.users (id, email, encrypted_password) values ($1, $2, extensions.crypt($3, extensions.gen_salt('bf')))`, [id, `${name}@users.nooob.xyz`, password]);
  const has = (await db.query(`select 1 from public.profiles where id = $1`, [id])).rows.length;
  if (!has) await db.query(`insert into public.profiles (id, username, display_name) values ($1, $2, $2)`, [id, name]);
  await db.query(`update public.profiles set noob_points = $2 where id = $1`, [id, points]);
  if (email) await db.query(`insert into public.profile_private (user_id, email) values ($1, $2) on conflict (user_id) do update set email = excluded.email`, [id, email]);
  return id;
};
const call = (uid, sql, params = []) => asUser(db, uid, async () => (await db.query(sql, params)).rows);
const rpc = async (uid, fn, ...args) => (await call(uid, `select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args))[0].r;
const pts = async (id) => BigInt((await db.query(`select noob_points from public.profiles where id = $1`, [id])).rows[0].noob_points);
const mails = async (id, kind) => (await db.query(`select * from public.email_outbox where user_id = $1 ${kind ? 'and kind = $2' : ''} order by created_at`, kind ? [id, kind] : [id])).rows;
const secret = (await db.query(`select value from public.internal_config where key = 'push_secret'`)).rows[0].value;

const STARTER = 5_000_000_000n;     // price of the Starter plan, monthly

// ============================================================================================================ 1. receipts
section('1. Buying NOOB Pro yourself sends a receipt');
const ann = await mkUser('ann', { points: 200_000_000_000, email: 'ann@example.com' });
await rpc(ann, 'upgrade_pro', 'starter', 'monthly', null, true);
check((await pts(ann)) === 200_000_000_000n - STARTER, 'the points were taken as before');
let ev = await mails(ann, 'pro_upgraded');
check(ev.length === 1 && ev[0].status === 'pending', 'one "pro_upgraded" email is waiting to be sent');
let pl = ev[0].payload;
check(pl.planName === 'Starter' && pl.billing === 'monthly' && pl.pricePaid === '5,000,000,000' && pl.walletAfter === '195,000,000,000', 'it carries the plan, the price and the balance after', JSON.stringify(pl));
check(pl.perks.length === 3 && pl.common.length === 3 && pl.method === 'wallet' && pl.autoRenew === true && !!pl.renewsAt, 'and what the plan includes, how it was paid and when it renews');
await rpc(ann, 'upgrade_pro', 'pro', 'yearly', null, false);
pl = (await mails(ann, 'pro_upgraded'))[1].payload;
check(pl.planName === 'Pro' && pl.perks.length === 3 + 2 + 2 && pl.billing === 'yearly' && pl.autoRenew === false, 'a higher plan lists everything from the plans below it too', JSON.stringify(pl.perks));

section('2. The verification badge sends a receipt');
const vic = await mkUser('vic', { points: 6_000_000_000, email: 'vic@example.com' });
await rpc(vic, 'verify_account', 'pw123456', 'points_monthly');
ev = await mails(vic, 'verified_badge');
check(ev.length === 1 && ev[0].payload.pricePaid === '5,000,000,000' && ev[0].payload.permanent === false && ev[0].payload.walletAfter === '1,000,000,000', 'monthly badge: price, balance and "not permanent"', JSON.stringify(ev[0]?.payload));
await expectFail(() => rpc(vic, 'verify_account', 'pw123456', 'points_monthly'), /already verified/, 'a second purchase is still refused');

// ============================================================================================================ 3. renewals
section('3. Renewal: receipt, or the "ended" email with the reason');
const rich = await mkUser('rich', { points: 20_000_000_000, email: 'rich@example.com' });
await rpc(rich, 'upgrade_pro', 'starter', 'monthly', null, true);
const poor = await mkUser('poor', { points: 5_000_000_000, email: 'poor@example.com' });
await rpc(poor, 'upgrade_pro', 'starter', 'monthly', null, true);          // leaves them with 0
const off = await mkUser('off', { points: 5_000_000_000, email: 'off@example.com' });
await rpc(off, 'upgrade_pro', 'starter', 'monthly', null, false);
await db.query(`update public.profiles set pro_renews_at = now() - interval '1 minute' where id = any($1)`, [[rich, poor, off]]);
await db.query(`select public.run_pro_renewals()`);
check((await mails(rich, 'pro_upgraded')).some((m) => m.payload.method === 'renewal') && (await pts(rich)) === 10_000_000_000n, 'a renewal sends a receipt and takes the points');
const ended = await mails(poor, 'pro_ended');
check(ended.length === 1 && ended[0].payload.reason === 'insufficient_points' && ended[0].payload.shortfall === '5,000,000,000' && ended[0].payload.balance === '0', 'not enough points: "ended" email with the reason and what was missing', JSON.stringify(ended[0]?.payload));
check(ended[0].payload.tier === 'starter' && ended[0].payload.billing === 'monthly', 'it says which plan to pay for (the button opens exactly that one)');
const ended2 = await mails(off, 'pro_ended');
check(ended2.length === 1 && ended2[0].payload.reason === 'auto_renew_off', 'reloading turned off: "ended" email says so');
check((await db.query(`select pro_tier from public.profiles where id = $1`, [poor])).rows[0].pro_tier === null, 'and the plan really ended');

// ============================================================================================================ 4. warnings
section('4. "Pro is about to end" warnings');
const w1 = await mkUser('w1', { points: 5_000_000_000, email: 'w1@example.com' });   // will have 0 left, reload on -> cannot renew
await rpc(w1, 'upgrade_pro', 'starter', 'monthly', null, true);
const w2 = await mkUser('w2', { points: 10_000_000_000, email: 'w2@example.com' });  // enough to renew
await rpc(w2, 'upgrade_pro', 'starter', 'monthly', null, true);
const w3 = await mkUser('w3', { points: 5_000_000_000, email: 'w3@example.com' });   // reload off
await rpc(w3, 'upgrade_pro', 'starter', 'monthly', null, false);
await db.query(`update public.profiles set pro_renews_at = now() + interval '2 days' where id = any($1)`, [[w1, w2, w3]]);
await db.query(`select public.run_pro_expiry_warnings()`);
const warn1 = await mails(w1, 'pro_expiring');
check(warn1.length === 1 && warn1[0].payload.shortfall === '5,000,000,000' && warn1[0].payload.autoRenew === true && warn1[0].payload.daysLeft === 2, 'cannot renew: warned with the live balance and the shortfall', JSON.stringify(warn1[0]?.payload));
check((await mails(w3, 'pro_expiring')).length === 1 && (await mails(w3, 'pro_expiring'))[0].payload.autoRenew === false, 'reloading off: warned too');
check((await mails(w2, 'pro_expiring')).length === 0, 'enough points and reloading on: nothing to warn about (it renews by itself)');
await db.query(`select public.run_pro_expiry_warnings()`);
check((await mails(w1, 'pro_expiring')).length === 1, 'running again does not warn twice');
await db.query(`update public.profiles set pro_renews_at = now() + interval '20 hours' where id = $1`, [w1]);
await db.query(`select public.run_pro_expiry_warnings()`);
check((await mails(w1, 'pro_expiring')).length === 2, 'one more warning on the last day');
await db.query(`select public.run_pro_expiry_warnings()`);
check((await mails(w1, 'pro_expiring')).length === 2, '...and only one');

// ============================================================================================================ 5. sending
section('5. Handing emails to the sender');
const mail = (await mails(ann, 'pro_upgraded'))[0];
await expectFail(() => db.query(`select public.email_claim('wrong', $1)`, [mail.id]), /Unauthorized/, 'a wrong password is refused');
const c1 = (await db.query(`select public.email_claim($1, $2) as r`, [secret, mail.id])).rows[0].r;
check(c1.claimed && c1.email === 'ann@example.com' && c1.kind === 'pro_upgraded' && c1.username === 'ann', 'a real address is handed over with the content');
const c2 = (await db.query(`select public.email_claim($1, $2) as r`, [secret, mail.id])).rows[0].r;
check(c2.claimed === false, 'the same email cannot be claimed twice at once');
await db.query(`select public.email_done($1, $2, false, 'smtp down')`, [secret, mail.id]);
check((await db.query(`select status, last_error from public.email_outbox where id = $1`, [mail.id])).rows[0].status === 'pending', 'a failed send goes back to waiting');
check((await db.query(`select public.email_claim($1, $2) as r`, [secret, mail.id])).rows[0].r.claimed === true, 'and can be claimed again');
await db.query(`select public.email_done($1, $2, true)`, [secret, mail.id]);
check((await db.query(`select status from public.email_outbox where id = $1`, [mail.id])).rows[0].status === 'sent', 'a successful send is marked sent');
const nobody = await mkUser('nobody', { points: 5_000_000_000 });
await rpc(nobody, 'upgrade_pro', 'starter', 'monthly', null, true);
const nm = (await mails(nobody, 'pro_upgraded'))[0];
const cn = (await db.query(`select public.email_claim($1, $2) as r`, [secret, nm.id])).rows[0].r;
check(cn.claimed === false && cn.skipped === true, 'an account with no real email address is skipped, not retried forever');
for (let i = 0; i < 5; i++) { await db.query(`update public.email_outbox set status='pending' where id=$1`, [mail.id]); await db.query(`select public.email_claim($1, $2)`, [secret, mail.id]); await db.query(`select public.email_done($1, $2, false, 'x')`, [secret, mail.id]); }
check((await db.query(`select status from public.email_outbox where id = $1`, [mail.id])).rows[0].status === 'failed', 'after 5 failed tries it is marked failed');

// ============================================================================================================ 6. friends pay
section('6. A friend pays the whole price');
const rita = await mkUser('rita', { points: 0, email: 'rita@example.com' });
const paul = await mkUser('paul', { points: 30_000_000_000, email: 'paul@example.com', password: 'paulpass1' });
const req = await rpc(rita, 'request_pro_payment', paul, 'starter', 'monthly', 'full', true);
check(req.success && BigInt(req.amount) === STARTER && BigInt(req.ownPart) === 0n, 'rita asks paul for the whole Starter price');
await expectFail(() => rpc(rita, 'request_pro_payment', paul, 'plus', 'monthly', 'full', true), /pending NOOB Pro request/, 'only one open request at a time');
let list = await rpc(paul, 'my_payment_requests');
check(list.length === 1 && list[0].planName === 'Starter' && list[0].purchaseType === 'pro' && BigInt(list[0].amount) === STARTER, 'paul sees it, with the plan details');
check((await rpc(rita, 'my_sent_payment_requests')).length === 1, 'rita sees her own open request');
await expectFail(() => rpc(paul, 'respond_payment_request', req.requestId, true, 'wrong-password'), /Incorrect password/, 'paul must confirm with his password');
check((await pts(paul)) === 30_000_000_000n, 'a wrong password takes nothing');
await rpc(paul, 'respond_payment_request', req.requestId, true, 'paulpass1');
check((await pts(paul)) === 30_000_000_000n - STARTER && (await pts(rita)) === 0n, 'paul pays, rita pays nothing');
check((await db.query(`select pro_tier, pro_billing from public.profiles where id = $1`, [rita])).rows[0].pro_tier === 'starter', 'rita\'s NOOB Pro started at once');
const rr = (await mails(rita, 'pro_upgraded'))[0];
check(rr.payload.method === 'friend' && rr.payload.paidBy.username === 'paul' && rr.payload.paidBy.amount === '5,000,000,000', 'rita\'s receipt says who paid and how much', JSON.stringify(rr.payload));
const pg = (await mails(paul, 'pro_gift_receipt'))[0];
check(pg && pg.payload.friend === 'rita' && pg.payload.partial === false && pg.payload.amount === '5,000,000,000', 'paul gets a receipt too');

section('7. A friend pays only the missing points');
const tom = await mkUser('tom', { points: 3_000_000_000, email: 'tom@example.com' });
await expectFail(() => rpc(ann, 'request_pro_payment', paul, 'starter', 'monthly', 'topup', true), /already have enough/, 'asking for the missing part when you already have enough is refused');
const treq = await rpc(tom, 'request_pro_payment', paul, 'starter', 'monthly', 'topup', true);
check(BigInt(treq.amount) === 2_000_000_000n && BigInt(treq.ownPart) === 3_000_000_000n, 'tom has 3 of the 5 billion, so paul is asked for 2 billion');
list = await rpc(paul, 'my_payment_requests');
check(list.some((x) => x.purchaseType === 'pro_topup' && BigInt(x.requesterPays) === 3_000_000_000n), 'paul sees how much tom adds himself');
const paulBefore = await pts(paul);
await rpc(paul, 'respond_payment_request', treq.requestId, true, 'paulpass1');
check((await pts(paul)) === paulBefore - 2_000_000_000n && (await pts(tom)) === 0n, 'paul pays 2 billion and tom\'s own 3 billion are taken at the same moment');
check((await db.query(`select pro_tier from public.profiles where id = $1`, [tom])).rows[0].pro_tier === 'starter', 'and the plan started by itself');
const tr = (await mails(tom, 'pro_upgraded'))[0];
check(tr.payload.method === 'friend_topup' && tr.payload.ownShare === '3,000,000,000' && tr.payload.paidBy.amount === '2,000,000,000', 'tom\'s receipt shows both parts');

section('8. Safety');
const sam = await mkUser('sam', { points: 3_000_000_000, email: 'sam@example.com' });
const sreq = await rpc(sam, 'request_pro_payment', paul, 'starter', 'monthly', 'topup', true);
await db.query(`update public.profiles set noob_points = 1000 where id = $1`, [sam]);            // sam spent his points meanwhile
const paulB2 = await pts(paul);
await expectFail(() => rpc(paul, 'respond_payment_request', sreq.requestId, true, 'paulpass1'), /balance changed/, 'if the requester\'s own part is no longer there, nothing is paid');
check((await pts(paul)) === paulB2 && (await pts(sam)) === 1000n, 'nobody was charged');
check((await rpc(sam, 'cancel_payment_request', sreq.requestId)).success, 'the requester can cancel a waiting request');
check((await rpc(paul, 'my_payment_requests')).every((x) => x.id !== sreq.requestId), 'a cancelled request disappears for the friend');
const lee = await mkUser('lee', { points: 0, email: 'lee@example.com' });
const lreq = await rpc(lee, 'request_pro_payment', paul, 'starter', 'monthly', 'full', true);
await db.query(`update public.payment_requests set expires_at = now() - interval '1 minute' where id = $1`, [lreq.requestId]);
await expectFail(() => rpc(paul, 'respond_payment_request', lreq.requestId, true, 'paulpass1'), /expired/, 'an expired request cannot be paid');
const joe = await mkUser('joe', { points: 0 });
await expectFail(() => rpc(joe, 'request_pro_payment', joe, 'starter', 'monthly', 'full', true), /Choose a friend/, 'you cannot ask yourself');
await expectFail(() => rpc(joe, 'request_pro_payment', paul, 'gold', 'monthly', 'full', true), /Unknown Pro plan/, 'an unknown plan is refused');
await expectFail(() => rpc(rita, 'request_pro_payment', paul, 'starter', 'monthly', 'full', true), /already have this plan/, 'asking for a plan you already have is refused');
const dec = await rpc(joe, 'request_pro_payment', paul, 'starter', 'monthly', 'full', true);
check((await rpc(paul, 'respond_payment_request', dec.requestId, false)).approved === false, 'the friend can decline');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
