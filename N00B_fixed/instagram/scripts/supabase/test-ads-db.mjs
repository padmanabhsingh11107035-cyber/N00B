// NOOB Ads (migration 20261022000006): a business account applies for an ad (picture or video, for some days, on Reels / Feed / Home / all), the admin approves it with one switch
// per page, and the ad is shown only on those pages for as long as it runs. On a REAL Postgres (PGlite) with every migration applied.
// Usage: node --liftoff-only scripts/supabase/test-ads-db.mjs
import { createTestDb, asUser, asAnon } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const db = await createTestDb();
const mkUser = async (name) => {
  const id = (await db.query(`select gen_random_uuid() as id`)).rows[0].id;
  await db.query(`insert into auth.users (id, email, encrypted_password) values ($1, $2, extensions.crypt('secret pass', extensions.gen_salt('bf')))`, [id, `${name}@users.nooob.xyz`]);
  if (!(await db.query(`select 1 from public.profiles where id = $1`, [id])).rows.length) await db.query(`insert into public.profiles (id, username, display_name) values ($1, $2, $3)`, [id, name, name]);
  await db.query(`insert into public.profile_private (user_id, email, mobile_number) values ($1, $2, '9999900000') on conflict (user_id) do nothing`, [id, `${name}@example.com`]);
  return id;
};
const noob = await mkUser('noob'); await db.query(`update public.profiles set is_admin = true where id = $1`, [noob]);
const shop = await mkUser('shop'), cafe = await mkUser('cafe'), ann = await mkUser('ann');
await db.query(`update public.profiles set account_type = 'business', is_business = true, business_category = 'Food' where id in ($1, $2)`, [shop, cafe]);
await db.query(`update public.profile_private set business_email = 'owner@shop.in', business_phone = '+91 90000 11111' where user_id = $1`, [shop]);
const file = async (owner, name) => db.query(`insert into storage.objects (bucket_id, name, owner_id) values ('media', $1, $2)`, [name, owner]);
await file(shop, 'ads/1-poster.jpg'); await file(shop, 'ads/2-clip.mp4'); await file(shop, 'ads/3-more.jpg'); await file(shop, 'ads/4-x.jpg'); await file(cafe, 'ads/5-cafe.jpg');
const call = async (uid, sql, args = []) => asUser(db, uid, async () => (await db.query(sql, args)).rows[0]?.r);
const err = async (uid, sql, args = []) => { try { await call(uid, sql, args); return null; } catch (e) { return e.message; } };
const apply = (uid, over = {}) => call(uid, `select public.submit_ad_application($1::jsonb) as r`, [JSON.stringify({ mediaUrl: 'ads/1-poster.jpg', mediaType: 'image', durationDays: 7, pages: ['home'], title: 'Diwali sale', link: 'https://shop.in', ...over })]);
const applyErr = (uid, over) => err(uid, `select public.submit_ad_application($1::jsonb) as r`, [JSON.stringify({ mediaUrl: 'ads/1-poster.jpg', mediaType: 'image', durationDays: 7, pages: ['home'], ...over })]);
const active = async (uid, page) => call(uid, `select public.active_ads($1) as r`, [page]);
const review = (uid, id, action, pages = null, days = null, note = null) => call(uid, `select public.admin_review_ad($1, $2, $3::text[], $4, $5) as r`, [id, action, pages, days, note]);

section('1. Who can apply, and for what');
check(/business account/i.test(await applyErr(ann, {}) || ''), 'an ordinary account cannot apply (business accounts only)');
check(/picture or a video/i.test(await applyErr(shop, { mediaType: 'audio' }) || ''), 'only a picture or a video');
check(/picture or video of your ad/i.test(await applyErr(shop, { mediaUrl: 'posts/1-a.jpg' }) || '') && /picture or video of your ad/i.test(await applyErr(shop, { mediaUrl: 'ads/../x.jpg' }) || ''), 'the file must be in the ads folder, with an ordinary name');
check(/not found/i.test(await applyErr(shop, { mediaUrl: 'ads/9-missing.jpg' }) || ''), 'a file that was never uploaded is refused');
check(/not found/i.test(await applyErr(shop, { mediaUrl: 'ads/5-cafe.jpg' }) || ''), 'and so is a file somebody else uploaded');
check(/how long/i.test(await applyErr(shop, { durationDays: 5 }) || '') && /how long/i.test(await applyErr(shop, { durationDays: null }) || ''), 'the time is one of the offered choices (1, 3, 7, 14 or 30 days)');
check(/where the ad should be shown/i.test(await applyErr(shop, { pages: [] }) || '') && /where the ad should be shown/i.test(await applyErr(shop, { pages: ['sidebar'] }) || ''), 'at least one page: Reels, Feed, Home or all');
check(/https/i.test(await applyErr(shop, { link: 'javascript:alert(1)' }) || ''), 'a link must be a web address');
const first = await apply(shop);
check(first.success === true && first.id, 'a business account\'s request is received');
const second = await apply(shop, { mediaUrl: 'ads/2-clip.mp4', mediaType: 'video', durationDays: 30, pages: ['all'], title: '', link: null });
const mine = await call(shop, `select public.my_ad_applications() as r`);
check(mine.length === 2 && mine.every((a) => a.status === 'pending'), 'it waits as "pending" and the sender sees it in their own list');
const vid = mine.find((a) => a.mediaType === 'video');
check(JSON.stringify(vid.requestedPages) === '["reels","feed","home"]' && vid.durationDays === 30, '"all" means Reels, Feed and Home');
check((await call(cafe, `select public.my_ad_applications() as r`)).length === 0, 'nobody else sees it');
await apply(shop, { mediaUrl: 'ads/3-more.jpg' });
check(/3 requests waiting/i.test(await applyErr(shop, { mediaUrl: 'ads/4-x.jpg' }) || ''), 'at most three requests wait at the same time');

section('2. The admin\'s list');
check(/Administrator|permission/i.test(await err(shop, `select public.admin_ad_applications() as r`) || ''), 'only the admin can read it');
check(/permission denied/i.test(await asAnon(db, async () => { try { await db.query(`select public.admin_ad_applications()`); return ''; } catch (e) { return e.message; } }) || ''), 'and nobody who is not logged in');
const list = await call(noob, `select public.admin_ad_applications() as r`);
check(list.pendingCount === 3 && list.rows.length === 3, 'it shows how many wait');
const row = list.rows.find((r) => r.id === first.id);
check(row.username === 'shop' && row.businessEmail === 'owner@shop.in' && row.businessPhone === '+91 90000 11111' && row.businessCategory === 'Food', 'with how to reach the advertiser (business e-mail and phone)');
check(JSON.stringify(row.requestedPages) === '["home"]' && row.durationDays === 7 && row.title === 'Diwali sale', 'what was asked for: pages, days, title');

section('3. Approving: one switch per page, and only those pages show it');
check(/not found/i.test(await review(noob, '00000000-0000-0000-0000-000000000000', 'approve', ['home']).then(() => '', (e) => e.message) || ''), 'an unknown request is refused');
check(/at least one page/i.test(await err(noob, `select public.admin_review_ad($1, 'approve', '{}'::text[], 7, null) as r`, [first.id]) || ''), 'approving needs at least one page switched on');
check(/Administrator|permission/i.test(await err(shop, `select public.admin_review_ad($1, 'approve', array['home']::text[], 7, null) as r`, [first.id]) || ''), 'only the admin can approve');
check((await active(ann, 'home')).length === 0, 'before approval nothing is shown');
const ok = await review(noob, first.id, 'approve', ['home', 'reels'], 3, 'Looks good');
check(ok.success && ok.ad.status === 'approved' && JSON.stringify(ok.ad.approvedPages) === '["reels","home"]' && ok.ad.adminNote === 'Looks good', 'approved with Home and Reels switched on (the admin chooses, not only the applicant)');
const ms = new Date(ok.ad.endsAt) - new Date(ok.ad.startsAt);
check(Math.abs(ms - 3 * 24 * 3600 * 1000) < 5000, 'it runs for the number of days the admin set (3), counted from now');
const home = await active(ann, 'home'), reels = await active(ann, 'reels'), feed = await active(ann, 'feed');
check(home.length === 1 && reels.length === 1 && feed.length === 0, 'it is shown on Home and Reels and NOT on Feed');
check(home[0].title === 'Diwali sale' && home[0].mediaType === 'image' && home[0].advertiser.username === 'shop' && home[0].link === 'https://shop.in', 'what a page gets: the picture, title, link and who it is from');
check(!JSON.stringify(home[0]).includes('owner@shop.in') && !JSON.stringify(home[0]).includes('9999900000') && !('status' in home[0]), 'and none of the advertiser\'s contact details');
check((await active(ann, 'sidebar')).length === 0, 'an unknown page gets nothing');
check(/permission denied/i.test(await asAnon(db, async () => { try { await db.query(`select public.active_ads('home')`); return ''; } catch (e) { return e.message; } }) || ''), 'a visitor who is not logged in gets no ads');
check(/already running/i.test(await err(noob, `select public.admin_review_ad($1, 'approve', array['feed']::text[], 7, null) as r`, [first.id]) || ''), 'a running ad cannot be approved again');

section('4. Changing and ending a running ad');
await review(noob, first.id, 'pages', ['feed', 'home']);
check((await active(ann, 'feed')).length === 1 && (await active(ann, 'reels')).length === 0, 'the admin can switch pages on and off while it runs (Feed on, Reels off)');
check(/at least one page/i.test(await err(noob, `select public.admin_review_ad($1, 'pages', '{}'::text[], null, null) as r`, [first.id]) || ''), 'but not all of them off (stop it instead)');
await review(noob, first.id, 'stop');
check((await active(ann, 'home')).length === 0 && (await call(shop, `select public.my_ad_applications() as r`)).find((a) => a.id === first.id).status === 'ended', 'stopping ends it at once');
check(/not running/i.test(await err(noob, `select public.admin_review_ad($1, 'stop', null, null, null) as r`, [second.id]) || ''), 'a request that is not running cannot be stopped');

section('5. Time runs out by itself');
await review(noob, second.id, 'approve', ['reels', 'feed', 'home'], 1);
check((await active(ann, 'feed')).length === 1, 'a new approval is shown');
await db.query(`update public.ad_applications set ends_at = now() - interval '1 minute' where id = $1`, [second.id]);
check((await active(ann, 'feed')).length === 0, 'when the days are over it is no longer shown');
check((await call(shop, `select public.my_ad_applications() as r`)).find((a) => a.id === second.id).status === 'ended', 'and it is listed as ended');
const ended = await call(noob, `select public.admin_ad_applications('ended') as r`);
const liveNow = await call(noob, `select public.admin_ad_applications('live') as r`);
check(ended.rows.some((r) => r.id === second.id) && !liveNow.rows.some((r) => r.id === second.id), 'the admin\'s "Ended" and "Live" lists agree');

section('6. Saying no, and an advertiser who is suspended');
const third = (await call(shop, `select public.my_ad_applications() as r`)).find((a) => a.status === 'pending');
const no = await review(noob, third.id, 'reject', null, null, 'Please send a clearer picture');
check(no.ad.status === 'rejected' && no.ad.adminNote === 'Please send a clearer picture' && JSON.stringify(no.ad.approvedPages) === '[]', 'a rejection keeps the admin\'s reason, and shows nothing');
check((await call(shop, `select public.my_ad_applications() as r`)).find((a) => a.id === third.id).adminNote === 'Please send a clearer picture', 'the advertiser can read the reason');
const c1 = await call(cafe, `select public.submit_ad_application($1::jsonb) as r`, [JSON.stringify({ mediaUrl: 'ads/5-cafe.jpg', mediaType: 'image', durationDays: 14, pages: ['feed'] })]);
await review(noob, c1.id, 'approve', ['feed']);
check((await active(ann, 'feed')).length === 1, 'another advertiser\'s ad shows');
await db.query(`update public.profiles set is_suspended = true where id = $1`, [cafe]);
check((await active(ann, 'feed')).length === 0, 'an advertiser who gets suspended disappears from the pages');
check(/Stop it first/i.test(await err(noob, `select public.admin_review_ad($1, 'reject', null, null, null) as r`, [c1.id]) || ''), 'a running ad cannot be rejected, only stopped');

section('7. Closed doors');
check(/permission denied/i.test(await err(shop, `select * from public.ad_applications`) || ''), 'the table cannot be read or written directly, only through the functions');
check(/permission denied/i.test(await err(shop, `insert into public.ad_applications (user_id, media_url, media_type, duration_days, requested_pages) values ('${shop}', 'ads/1-poster.jpg', 'image', 7, array['home'])`) || ''), 'not even by the advertiser');
check((await db.query(`select policyname from pg_policies where tablename = 'storage.objects' or (schemaname = 'storage' and policyname = 'media_upload')`)).rows.length >= 1 && /'ads'/.test((await db.query(`select qual, with_check from pg_policies where schemaname='storage' and policyname='media_upload'`)).rows[0].with_check), 'people may upload into the ads folder');

section('8. Photos: 1 to 10 of them, or one video (migration 20261022000007)');
const bakery = await mkUser('bakery'), deli = await mkUser('deli');
await db.query(`update public.profiles set account_type = 'business', is_business = true where id in ($1, $2)`, [bakery, deli]);
const photos = Array.from({ length: 11 }, (_, n) => `ads/p${n + 1}-bake.jpg`);
for (const name of photos) await file(bakery, name);
await file(bakery, 'ads/v1-bake.mp4'); await file(bakery, 'ads/v2-bake.mp4'); await file(deli, 'ads/d1-deli.jpg');
const send = (uid, over) => call(uid, `select public.submit_ad_application($1::jsonb) as r`, [JSON.stringify({ mediaType: 'image', durationDays: 7, pages: ['home'], ...over })]);
const sendErr = (uid, over) => err(uid, `select public.submit_ad_application($1::jsonb) as r`, [JSON.stringify({ mediaType: 'image', durationDays: 7, pages: ['home'], ...over })]);
check(/picture or video of your ad/i.test(await sendErr(bakery, { mediaUrls: [] }) || ''), 'at least 1 photo is needed');
check(/up to 10 photos/i.test(await sendErr(bakery, { mediaUrls: photos }) || ''), 'more than 10 photos is refused');
check(/one video/i.test(await sendErr(bakery, { mediaType: 'video', mediaUrls: ['ads/v1-bake.mp4', 'ads/v2-bake.mp4'] }) || ''), 'a video ad has one video');
check(/twice/i.test(await sendErr(bakery, { mediaUrls: ['ads/p1-bake.jpg', 'ads/p1-bake.jpg'] }) || ''), 'the same photo cannot be added twice');
check(/not found/i.test(await sendErr(bakery, { mediaUrls: ['ads/p1-bake.jpg', 'ads/d1-deli.jpg'] }) || ''), 'every photo must be one the sender uploaded');
check(/picture or video of your ad/i.test(await sendErr(bakery, { mediaUrls: ['ads/p1-bake.jpg', 'posts/x.jpg'] }) || ''), 'every photo must be in the ads folder');
const three = await send(bakery, { mediaUrls: ['ads/p3-bake.jpg', 'ads/p1-bake.jpg', 'ads/p2-bake.jpg'], title: 'Fresh bread' });
const ten = await send(bakery, { mediaUrls: photos.slice(0, 10) });
check(three.success && ten.success, '3 photos and 10 photos are both received');
const vid1 = await send(bakery, { mediaType: 'video', mediaUrls: ['ads/v1-bake.mp4'], pages: ['feed'] });
const mineB = await call(bakery, `select public.my_ad_applications() as r`);
const r3 = mineB.find((a) => a.id === three.id);
check(JSON.stringify(r3.mediaUrls) === '["ads/p3-bake.jpg","ads/p1-bake.jpg","ads/p2-bake.jpg"]' && r3.mediaUrl === 'ads/p3-bake.jpg', 'the photos keep the order the sender chose, the first one is the cover');
check(mineB.find((a) => a.id === ten.id).mediaUrls.length === 10 && mineB.find((a) => a.id === vid1.id).mediaUrls.length === 1, 'ten photos stay ten; a video is one file');
const adminList = await call(noob, `select public.admin_ad_applications('pending') as r`);
check(JSON.stringify(adminList.rows.find((r) => r.id === three.id).mediaUrls) === JSON.stringify(r3.mediaUrls), 'the admin sees all the photos');
await review(noob, three.id, 'approve', ['home']);
const shown = (await active(ann, 'home')).find((a) => a.id === three.id);
check(shown && JSON.stringify(shown.mediaUrls) === '["ads/p3-bake.jpg","ads/p1-bake.jpg","ads/p2-bake.jpg"]' && shown.mediaType === 'image' && !JSON.stringify(shown).includes('9999900000'), 'the page gets every photo in order, and no contact details');
const old = await call(deli, `select public.submit_ad_application($1::jsonb) as r`, [JSON.stringify({ mediaUrl: 'ads/d1-deli.jpg', mediaType: 'image', durationDays: 3, pages: ['feed'] })]);
check(old.success && JSON.stringify((await call(deli, `select public.my_ad_applications() as r`))[0].mediaUrls) === '["ads/d1-deli.jpg"]', 'an older copy of the app, which sends one file, still works');
check(/ad_media_list/.test(await db.query(`update public.ad_applications set media_urls = '{}' where id = $1`, [three.id]).then(() => '', (e) => e.message) || ''), 'the database itself refuses an ad without a file');
check(/ad_media_list/.test(await db.query(`update public.ad_applications set media_urls = $2 where id = $1`, [three.id, photos]).then(() => '', (e) => e.message) || ''), 'and an ad with 11 files');
check(/ad_media_list/.test(await db.query(`update public.ad_applications set media_urls = array['ads/v1-bake.mp4','ads/v2-bake.mp4'], media_url = 'ads/v1-bake.mp4', media_type = 'video' where id = $1`, [vid1.id]).then(() => '', (e) => e.message) || ''), 'and a video ad with two files');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
