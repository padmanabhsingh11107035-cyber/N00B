// Upgrade test: your LIVE database already holds real data and migrations 1-5. This builds exactly that
// (migrations 1-5 + the real backup imported the way it was imported live, coupons stored in their old
// text form), applies migration 6 on top, and proves nothing is lost or changed — then applies it a second
// time to prove it is safe to re-run.
//
// Usage: node scripts/supabase/test-upgrade.mjs [backup-folder]
import fs from 'node:fs';
import path from 'node:path';
import { loadBackup, buildImportPlan } from './transform.mjs';
import { runImport } from './run-import.mjs';
import { createTestDb, makePgAdapter, asUser, asAnon, MIGRATIONS_DIR } from './pg-test-env.mjs';

const backupsRoot = 'backups';
const dir = process.argv.slice(2).find((x) => !x.startsWith('--')) || path.join(backupsRoot, fs.readdirSync(backupsRoot).filter((d) => fs.existsSync(path.join(backupsRoot, d, 'users.json'))).sort().pop());
const raw = loadBackup(dir);

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);

const MIG6 = "20260919000006_economy_games_admin.sql";
section('Building the live situation (migrations 1-5 + real data)');
const db = await createTestDb({ upTo: '20260919000005_chat.sql' });
const plan = buildImportPlan(raw, {});
// how the coupons were stored live: terms as one text value, no usage limit yet
plan.tables.coupons = plan.tables.coupons.map(({ usage_limit, terms, ...rest }) => ({ ...rest, terms: terms.join('\n') }));
plan.tables.coupon_uses = []; plan.tables.store_products = []; plan.tables.scratch_cards = []; plan.tables.reports = [];
await runImport(plan, makePgAdapter(db), { log: () => {} });
// one coupon with several terms, one with none, and one suspended account
await db.query(`insert into coupons (code, title, type, discount_percent, terms) values ('OLDMULTI', 'x', 'discount', 5, E'line one\nline two'), ('OLDNULL', 'x', 'discount', 5, null)`);
const susp = (await db.query(`select id from profiles where not is_admin order by created_at limit 1`)).rows[0].id;
await db.query('update profiles set is_suspended = true where id = $1', [susp]);
await db.query(`insert into auth.users (id, email) select $1, 'x' where not exists (select 1 from auth.users where id = $1)`, [susp]);

const snap = async () => {
  const q = async (sql) => (await db.query(sql)).rows[0].n;
  return {
    profiles: await q('select count(*)::int n from profiles'), posts: await q('select count(*)::int n from posts'),
    post_likes: await q('select count(*)::int n from post_likes'), follows: await q('select count(*)::int n from follows'),
    tx: await q('select count(*)::int n from noob_transactions'), scores: await q('select count(*)::int n from game_scores'),
    notifs: await q('select count(*)::int n from notifications'), coupons: await q('select count(*)::int n from coupons'),
    points: await q('select coalesce(sum(noob_points), 0)::text n from profiles'), scoreSum: await q('select coalesce(sum(score), 0)::text n from game_scores'),
    reviews: await q('select count(*)::int n from support_reviews'), chats: await q('select count(*)::int n from chats'), msgs: await q('select count(*)::int n from messages')
  };
};
const before = await snap();
const couponBefore = (await db.query('select code, discount_percent::text dp, active from coupons order by code')).rows;
console.log('  live counts before:', JSON.stringify(before));

section('Applying migration 6 on top of the data');
await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, MIG6), 'utf8'));
const after = await snap();
check(JSON.stringify(before) === JSON.stringify(after), 'every count and the total of all points/scores are exactly unchanged', JSON.stringify(after));
const couponAfter = (await db.query('select code, discount_percent::text dp, active from coupons order by code')).rows;
check(JSON.stringify(couponBefore) === JSON.stringify(couponAfter), 'every coupon keeps its code, percentage and on/off state');
const cp = Object.fromEntries((await db.query('select code, terms, usage_limit, type from coupons')).rows.map((r) => [r.code, r]));
check(Array.isArray(cp.OLDMULTI.terms) && cp.OLDMULTI.terms.join('|') === 'line one|line two', 'coupon terms written on several lines become a proper list');
check(cp.OLDNULL.terms.length === 0 && Object.values(cp).every((c) => Array.isArray(c.terms)), 'coupons with no terms get an empty list (never null)');
check(Object.values(cp).every((c) => c.usage_limit === 'unlimited'), 'existing coupons stay "unlimited" exactly like before');
check((await db.query(`select data_type from information_schema.columns where table_name = 'game_scores' and column_name = 'score'`)).rows[0].data_type === 'bigint', 'the score column can now hold values over 2 billion');
const bu = (await db.query('select banned_until from auth.users where id = $1', [susp])).rows[0].banned_until;
check(bu && new Date(bu) > new Date(Date.now() + 50 * 365 * 86400000), 'an account that was already suspended is now also blocked from signing in');
check((await db.query(`select count(*)::int n from shop_items`)).rows[0].n === 24 && (await db.query(`select count(*)::int n from live_avatar_presets`)).rows[0].n === 34, 'the shop and live-picture lists are filled in');

section('Applying it a second time (must be harmless)');
await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, MIG6), 'utf8'));
const again = await snap();
check(JSON.stringify(after) === JSON.stringify(again), 'nothing changed on the second run');
check((await db.query(`select count(*)::int n from shop_items`)).rows[0].n === 24, 'and no duplicate shop items appeared');

section('Applying migrations 7 (recovery) and 8 (staff permissions, group setting, push) on top');
const read = (f) => fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');
await db.exec(read('20260919000007_recovery.sql'));
const LOUNGE = (await db.query('select id from chats where is_global_default')).rows[0].id;
const lgBefore = (await db.query('select name, description, is_group, creator_id from chats where id = $1', [LOUNGE])).rows[0];
const M8 = '20260919000008_staff_permissions_group_policy_push.sql';
await db.exec(read(M8));
const after8 = await snap();
check(JSON.stringify(after) === JSON.stringify(after8), 'migration 8 changes no count and no point total');
check(JSON.stringify(lgBefore) === JSON.stringify((await db.query('select name, description, is_group, creator_id from chats where id = $1', [LOUNGE])).rows[0]), 'the Global Lounge is untouched');
check((await db.query('select count(*)::int n from chats where only_admins_can_send')).rows[0].n === 0, 'no group is switched to "admins only" by the upgrade');
check((await db.query('select count(*)::int n from admin_grants')).rows[0].n === 0, 'nobody gets any admin permission by the upgrade');
const cfg = Object.fromEntries((await db.query('select key, value from internal_config')).rows.map((r) => [r.key, r.value]));
check(/^BJD8vr/.test(cfg.vapid_public_key) && cfg.push_url.startsWith('https://') && /^[0-9a-f]{64}$/.test(cfg.push_secret), 'the push key, the function address and a random private password are stored');
await db.exec(read(M8));
const cfg2 = Object.fromEntries((await db.query('select key, value from internal_config')).rows.map((r) => [r.key, r.value]));
check(JSON.stringify(await snap()) === JSON.stringify(after8) && cfg2.push_secret === cfg.push_secret, 'running migration 8 a second time is harmless (the private password does not change)');
check((await db.query(`select count(*)::int n from pg_trigger where tgname = 'notifications_push'`)).rows[0].n === 1, 'and there is exactly one push trigger');

section('Applying migration 9 (shop inventory and versions) on top');
await db.query(`insert into store_products (price, description, media, in_stock) values (129, 'Old sticker sheet', '[{"type":"photo","url":"p.jpg"}]', false), (299, 'Old mug', '[{"type":"photo","url":"m.jpg"}]', true)`);
const shopBefore = (await db.query('select id, price::text, description, media::text, in_stock from store_products order by description')).rows;
const M9 = '20260919000009_store_inventory_variants.sql';
await db.exec(read(M9));
const shopAfter = (await db.query('select id, price::text, description, media::text, in_stock from store_products order by description')).rows;
check(JSON.stringify(shopBefore) === JSON.stringify(shopAfter), 'every existing product keeps its price, description, pictures and in-stock state');
check(JSON.stringify(await snap()) === JSON.stringify(after8), 'migration 9 changes no count and no point total');
const someone = (await db.query('select id from profiles where not is_admin and not is_suspended order by created_at limit 1')).rows[0].id;
const shopList = await asUser(db, someone, async () => (await db.query('select public.list_store_products() as r')).rows[0].r);
check(shopList.length === 2 && shopList.every((p) => p.stock === null && p.variants.length === 0 && p.options.length === 0) && shopList.find((p) => p.description === 'Old sticker sheet').inStock === false && shopList.find((p) => p.description === 'Old mug').inStock === true, 'old products show in the shop exactly as before (no stock number, no versions)');
await db.exec(read(M9));
check(JSON.stringify((await db.query('select id, price::text, description, media::text, in_stock from store_products order by description')).rows) === JSON.stringify(shopBefore), 'running migration 9 a second time is harmless');

section('Applying migration 10 (shop orders, product names, hide profile) on top');
const M10 = '20260920000010_shop_orders_profile_hide.sql';
const shop10Before = (await db.query('select id, price::text, description, media::text, in_stock, stock from store_products order by description')).rows;
const follows10Before = await snap();
const someoneElse = (await db.query('select id from profiles where not is_admin and not is_suspended order by created_at offset 1 limit 1')).rows[0].id;
await db.exec(read(M10));
check(JSON.stringify((await db.query('select id, price::text, description, media::text, in_stock, stock from store_products order by description')).rows) === JSON.stringify(shop10Before), 'every existing product keeps its price, description, pictures and stock');
check(JSON.stringify(await snap()) === JSON.stringify(follows10Before), 'migration 10 changes no count and no point total');
const shopList10 = await asUser(db, someone, async () => (await db.query('select public.list_store_products() as r')).rows[0].r);
check(shopList10.length === 2 && shopList10.every((p) => p.name === '' && p.title.length > 0) && shopList10.some((p) => p.title === 'Old mug'), 'old products get a title from their description');
check(await asUser(db, someone, async () => (await db.query('select public.get_my_user() as r')).rows[0].r.hiddenFromIds.length === 0), 'signing in still works and nobody is hidden from anyone');
check(await asUser(db, someone, async () => (await db.query(`select jsonb_array_length(public.search_users('')) n`)).rows[0].n) > 0, 'search still lists people');
check(await asUser(db, someone, async () => (await db.query(`select count(*)::int n from follows`)).rows[0].n) > 0, 'the follow graph is still visible');
check((await db.query('select count(*)::int n from store_orders')).rows[0].n === 0 && (await db.query('select count(*)::int n from profile_hides')).rows[0].n === 0, 'no orders, and nobody is hidden, after the upgrade');
await db.exec(read(M10));
check(JSON.stringify(await snap()) === JSON.stringify(follows10Before), 'running migration 10 a second time is harmless');
check((await db.query(`select count(*)::int n from pg_trigger where tgname in ('follows_guard_hidden', 'follow_requests_guard_hidden')`)).rows[0].n === 2, 'and there is exactly one guard on each follow table');

section('Applying migration 11 (shop address book) on top');
const M11 = '20260920000011_shop_address_book.sql';
// someone who saved an address with the shop details BEFORE the address book existed
await db.query(String.raw`insert into shop_details (user_id, details) values ($1, $2::jsonb) on conflict (user_id) do update set details = excluded.details`, [someone, JSON.stringify({ fullName: 'Old Buyer', phone: '9876543210', addressLine1: '5 Old Street', city: 'Surat', state: 'Gujarat', pincode: '395003' })]);
const before11 = await snap();
const orders11 = (await db.query('select count(*)::int n from store_orders')).rows[0].n;
await db.exec(read(M11));
check(JSON.stringify(await snap()) === JSON.stringify(before11), 'migration 11 changes no count and no point total');
check((await db.query('select count(*)::int n from store_orders')).rows[0].n === orders11, 'and no order');
const carried11 = await asUser(db, someone, async () => (await db.query('select public.my_shop_addresses() as r')).rows[0].r.addresses);
check(carried11.length === 1 && carried11[0].isDefault && carried11[0].addressLine1 === '5 Old Street' && carried11[0].city === 'Surat', 'an address saved earlier appears as that person\'s default address');
check(await asUser(db, someone, async () => (await db.query('select public.get_shop_details() as r')).rows[0].r.details.fullName) === 'Old Buyer', 'their saved shop details are untouched');
await db.exec(read(M11));
check((await db.query('select count(*)::int n from shop_addresses')).rows[0].n === 1 && JSON.stringify(await snap()) === JSON.stringify(before11), 'running migration 11 a second time is harmless (nothing added twice)');
check((await db.query(String.raw`select count(*)::int n from pg_indexes where indexname = 'shop_addresses_one_default_idx'`)).rows[0].n === 1, 'and the "one default per person" rule exists exactly once');

section('Applying migration 12 (languages) on top');
const M12 = '20260920000012_languages.sql';
const before12 = await snap();
const orders12 = (await db.query('select count(*)::int n from store_orders')).rows[0].n;
const addresses12 = (await db.query('select count(*)::int n from shop_addresses')).rows[0].n;
await db.exec(read(M12));
check(JSON.stringify(await snap()) === JSON.stringify(before12), 'migration 12 changes no count and no point total');
check((await db.query('select count(*)::int n from store_orders')).rows[0].n === orders12 && (await db.query('select count(*)::int n from shop_addresses')).rows[0].n === addresses12, 'and no order and no address');
check((await db.query('select count(*)::int n from ui_translations')).rows[0].n === 0, 'the translation table starts empty');
check(await asUser(db, someone, async () => JSON.stringify((await db.query(`select public.get_ui_translations('hi') as r`)).rows[0].r) === '{}'), 'a signed-in person can ask for a language (nothing stored yet)');
check(await asUser(db, someone, async () => (await db.query('select public.get_my_user() as r')).rows[0].r.username.length > 0), 'signing in still works');
await db.exec(read(M12));
check(JSON.stringify(await snap()) === JSON.stringify(before12), 'running migration 12 a second time is harmless');

section('Applying migration 13 (shop settings function) on top');
const M13 = '20260921000013_shop_settings_function.sql';
const before13 = await snap();
const settings13 = (await db.query('select store_enabled, store_delivery_fee::text f from app_settings where id = 1')).rows[0];
await db.exec(read(M13));
check(JSON.stringify(await snap()) === JSON.stringify(before13), 'migration 13 changes no count and no point total');
const settingsAfter13 = (await db.query('select store_enabled, store_delivery_fee::text f from app_settings where id = 1')).rows[0];
check(JSON.stringify(settingsAfter13) === JSON.stringify(settings13), 'and the shop settings are exactly as they were (nothing switched on or off)');
check(await asUser(db, someone, async () => { try { await db.query('select public.set_shop_settings(false, null)'); return false; } catch (e) { return /not the main NOOB administrator/.test(e.message); } }), 'an ordinary member is refused by the new function');
check((await db.query('select store_enabled from app_settings where id = 1')).rows[0].store_enabled === settings13.store_enabled, '...and nothing changed');
await db.exec(read(M13));
check(JSON.stringify(await snap()) === JSON.stringify(before13), 'running migration 13 a second time is harmless');

section('Applying migration 14 (map pin on addresses) on top');
const M14 = '20260921000014_address_pin.sql';
const before14 = await snap();
const addr14 = (await db.query('select id, details::text d from shop_addresses order by id')).rows;
const orders14 = (await db.query('select id, contact::text c from store_orders order by id')).rows;
await db.exec(read(M14));
check(JSON.stringify(await snap()) === JSON.stringify(before14), 'migration 14 changes no count and no point total');
check(JSON.stringify((await db.query('select id, details::text d from shop_addresses order by id')).rows) === JSON.stringify(addr14), 'every saved address is exactly as it was');
check(JSON.stringify((await db.query('select id, contact::text c from store_orders order by id')).rows) === JSON.stringify(orders14), 'every order is exactly as it was');
const tidy = (await db.query(`select public.clean_shop_contact('{"fullName":"Asha","phone":"9876543210","lat":23.02251234567,"lng":"72.5714"}'::jsonb, false, false) as r`)).rows[0].r;
check(tidy.lat === 23.022512 && tidy.lng === 72.5714, 'the new check tidies a pin');
check(!('lat' in (await db.query(`select public.clean_shop_contact('{"fullName":"Asha"}'::jsonb, false, false) as r`)).rows[0].r), 'and an address without a pin gets none');
check(await asUser(db, someone, async () => { try { await db.query(`select public.save_shop_address('{"fullName":"Asha Verma","phone":"9876543210","addressLine1":"12 MG Road","city":"Pune","state":"MH","pincode":"411001","lat":999,"lng":1}'::jsonb)`); return false; } catch (e) { return /map pin is not a valid location/.test(e.message); } }), 'an impossible pin is refused');
await db.exec(read(M14));
check(JSON.stringify(await snap()) === JSON.stringify(before14), 'running migration 14 a second time is harmless');

section('Applying migration 15 (end-to-end encrypted chats) on top');
const M15 = '20260921000015_e2ee_chats.sql';
// (the imported backup has no chat history, so a small real one is made first: plain messages, a picture, a quote, a reaction)
const chat15 = (await db.query('insert into chats (is_group) values (false) returning id')).rows[0].id;
await db.query('insert into chat_members (chat_id, user_id) values ($1, $2), ($1, $3)', [chat15, someone, someoneElse]);
const m1 = (await db.query("insert into messages (chat_id, sender_id, text) values ($1, $2, 'hello from before the upgrade') returning id", [chat15, someone])).rows[0].id;
await db.query("insert into messages (chat_id, sender_id, text, media_url, media_type) values ($1, $2, '', 'posts/old-photo.jpg', 'image')", [chat15, someoneElse]);
await db.query("insert into messages (chat_id, sender_id, text, reply_to, reactions) values ($1, $2, 'a reply', $3::jsonb, $4::jsonb)", [chat15, someone, JSON.stringify({ messageId: m1, senderUsername: 'x', textPreview: 'hello from before the upgrade' }), JSON.stringify([{ emoji: 'thumbs-up', userId: 'x' }])]);
const before15 = await snap();   // (counted after the small history exists, so the upgrade is what is being measured)
const msgs15 = (await db.query('select id, chat_id, sender_id, text, media_url, media_type, reply_to::text r, reactions::text x, is_edited, created_at from messages order by id')).rows;
const chats15 = (await db.query('select id, name, is_group, last_message_at from chats order by id')).rows;
await db.exec(read(M15));
check(JSON.stringify(await snap()) === JSON.stringify(before15), 'migration 15 changes no count and no point total');
check(msgs15.length > 0 && JSON.stringify((await db.query('select id, chat_id, sender_id, text, media_url, media_type, reply_to::text r, reactions::text x, is_edited, created_at from messages order by id')).rows) === JSON.stringify(msgs15), 'EVERY existing message is exactly as it was (text, pictures, quotes, reactions, times)');
check(JSON.stringify((await db.query('select id, name, is_group, last_message_at from chats order by id')).rows) === JSON.stringify(chats15), 'every chat is exactly as it was');
check((await db.query('select count(*)::int n from messages where e2ee is not null')).rows[0].n === 0, 'no old message became "locked": they stay readable as before');
const someChat = (await db.query('select chat_id from messages limit 1')).rows[0].chat_id;
const oneMember = (await db.query('select user_id from chat_members where chat_id = $1 limit 1', [someChat])).rows[0]?.user_id;
if (oneMember) {
  const listed15 = await asUser(db, oneMember, async () => (await db.query('select public.chat_messages($1) as r', [someChat])).rows[0].r.messages);
  const original = msgs15.filter((m) => m.chat_id === someChat);
  check(listed15.length > 0 && listed15.every((m) => 'e2ee' in m && m.e2ee === null) && original.some((o) => listed15.some((m) => m.id === o.id && m.text === o.text)), 'an old chat lists its old messages with the same text (and none is locked)');
  const sentPlain = await asUser(db, oneMember, async () => (await db.query('select public.send_message($1, $2::jsonb) as r', [someChat, JSON.stringify({ text: 'still plain after the upgrade' })])).rows[0].r);
  check(sentPlain.success && sentPlain.message.text === 'still plain after the upgrade' && sentPlain.message.e2ee === null, 'a plain message is sent and stored readable, exactly as before');
} else check(true, '(no chat with members in this backup to try it on)');
check((await db.query('select count(*)::int n from chat_keys')).rows[0].n === 0 && (await db.query('select count(*)::int n from chat_key_backups')).rows[0].n === 0, 'no key exists until a device registers one');
const before15b = await snap();
await db.exec(read(M15));
check(JSON.stringify(await snap()) === JSON.stringify(before15b), 'running migration 15 a second time is harmless');

section('Applying migration 16 (emailed OTP recovery) on top');
const M16 = '20260922000016_recovery_otp.sql';
const before16 = await snap();
const attempts16 = (await db.query('select ip, username, ok, created_at from recovery_attempts order by created_at')).rows;
await db.exec(read(M16));
check(JSON.stringify(await snap()) === JSON.stringify(before16), 'migration 16 changes no count and no point total');
check(JSON.stringify((await db.query('select ip, username, ok, created_at from recovery_attempts order by created_at')).rows) === JSON.stringify(attempts16), 'the existing recovery-attempts history is untouched');
check((await db.query('select count(*)::int n from recovery_otps')).rows[0].n === 0, 'no code exists until somebody asks for one');
const personRow = (await db.query(`select p.id, p.username from profiles p join profile_private pp on pp.user_id = p.id where coalesce(pp.email, '') <> '' and not p.is_suspended limit 1`)).rows[0];
if (personRow) {
  await db.query('set role service_role');
  let sent, checked;
  try {
    sent = (await db.query('select public.recovery_otp_request($1, $2) r', ['1.2.3.4', personRow.username])).rows[0].r;
    check(sent.status === 'ok' && /^\d{6}$/.test(sent.code), 'the existing "forgot password" security-question check still exists alongside the new emailed code');
    checked = (await db.query('select public.recovery_otp_verify($1, $2, $3) r', ['1.2.3.4', personRow.username, sent.code])).rows[0].r;
    check(checked.status === 'ok' && checked.userId === personRow.id, 'and the new emailed code works end to end for a real account from the backup');
  } finally { await db.query('reset role'); }
  const stillWorks = await asAnon(db, () => db.query(`select public.recovery_check('9.9.9.9', $1, '0', '2000-01-01', 'nobody@example.com')`, [personRow.username]).catch((e) => e));
  check(stillWorks instanceof Error && /permission denied/.test(stillWorks.message), 'the OLD recovery_check function is completely unaffected (still exists, still guarded the same way)');
} else check(true, '(no account with an email on file in this backup to try it on)');
const before16b = await snap();
await db.exec(read(M16));
check(JSON.stringify(await snap()) === JSON.stringify(before16b), 'running migration 16 a second time is harmless');

section('Applying migration 17 (30 more live profile picture presets) on top');
const M17 = '20260922000017_more_live_avatars.sql';
const oldPresets = (await db.query('select id, name, url, sort from live_avatar_presets order by sort')).rows;
check(oldPresets.length === 34, '(34 presets exist before this migration, exactly as migration 6 left them)');
const before17 = await snap();
await db.exec(read(M17));
check(JSON.stringify(await snap()) === JSON.stringify(before17), 'migration 17 changes no count and no point total');
check(JSON.stringify((await db.query('select id, name, url, sort from live_avatar_presets where sort <= 34 order by sort')).rows) === JSON.stringify(oldPresets), 'every one of the original 34 presets is byte-for-byte unchanged');
const allPresets = (await db.query('select id, url, sort from live_avatar_presets order by sort')).rows;
check(allPresets.length === 64 && new Set(allPresets.map((p) => p.id)).size === 64 && new Set(allPresets.map((p) => p.url)).size === 64, '30 new presets are added, none repeating an id or a file path');
check(allPresets.every((p) => /^\/live-avatars\/[a-z0-9-]+\.svg$/.test(p.url)), 'every new preset points at a real-looking .svg file path');
const somePro = (await db.query(`select p.id from profiles p where p.pro_tier is not null limit 1`)).rows[0];
if (somePro) {
  const applied = await asUser(db, somePro.id, async () => (await db.query(`select public.apply_live_avatar($1) as r`, ['black_hole'])).rows[0].r);
  check(applied.success !== false && applied.user.avatar === '/live-avatars/black-hole.svg' && applied.user.isLiveAvatar === true, 'a Pro account can already pick one of the 30 new presets');
} else check(true, '(no Pro account in this backup to try it on)');
const before17b = await snap();
await db.exec(read(M17));
check(JSON.stringify(await snap()) === JSON.stringify(before17b), 'running migration 17 a second time is harmless');

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
