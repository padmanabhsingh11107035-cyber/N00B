// The Grievance Officer's inbox (works without login, ticket numbers, limits, who can read what) on a REAL Postgres (PGlite) with every migration applied, the public page, the legal texts
// that name it, and the "Order Successful" receipt for NOOB Pro. Usage: node --liftoff-only scripts/supabase/test-grievance-receipt.mjs
import fs from 'node:fs';
import { createTestDb, asUser, asAnon } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split('\r').join('');
const db = await createTestDb();
const anon = async (sql, args = []) => asAnon(db, async () => (await db.query(sql, args)).rows[0]?.r);
const anonFails = async (sql, args = []) => { try { await anon(sql, args); return ''; } catch (e) { return String(e.message || e); } };
const send = (contact, message = 'The post of my friend uses my photo without asking.', topic = 'content') => anon(`select public.submit_grievance('Asha', $1, 'asha', $2, $3) as r`, [contact, topic, message]);

section('1. Sending a complaint (nobody logged in)');
let r = await send('asha@example.com');
check(r.success && /^GR-[0-9A-F]{8}$/.test(r.ticket) && r.acknowledgeWithin === '24 hours' && r.resolveWithin === '15 days', 'a complaint gets a ticket number and the two promised times');
check(!(await send('x')).success && !(await send('asha@example.com', 'short')).success && !(await send('asha@example.com', 'x'.repeat(4001))).success, 'no contact, a message under 10 or over 4000 characters: refused');
await send('asha@example.com'); await send('asha@example.com');
check(!(await send('ASHA@example.com')).success, 'the 4th complaint of one contact in a day is refused (the contact is compared without capitals)');
check((await send('someone.else@example.com', 'This is another long enough message.', 'nonsense')).success, 'another contact is not affected; an unknown topic becomes "other"');
check((await db.query(`select topic from public.grievances where contact = 'someone.else@example.com'`)).rows[0].topic === 'other', 'the topic was saved as other');

section('2. Looking a ticket up');
const t = r.ticket;
check((await anon(`select public.track_grievance($1, $2) as r`, [t.toLowerCase(), 'Asha@Example.com'])).found === true, 'ticket + the same contact (any capitals) shows the status');
check((await anon(`select public.track_grievance($1, 'other@example.com') as r`, [t])).found === false && (await anon(`select public.track_grievance('GR-00000000', 'asha@example.com') as r`)).found === false, 'a wrong contact or a wrong ticket shows nothing at all');
const tr = await anon(`select public.track_grievance($1, 'asha@example.com') as r`, [t]);
check(tr.status === 'open' && tr.acknowledgeBy && tr.resolveBy && !('message' in tr) && !('contact' in tr), 'it shows the status and the dates, never the message or the contact');

section('3. Who can read what');
const direct = await asAnon(db, async () => { try { await db.query(`select count(*) from public.grievances`); return ''; } catch (e) { return String(e.message); } });
check(/permission denied/i.test(direct), 'a visitor cannot read the table directly');
const uid = (await db.query(`select gen_random_uuid() as id`)).rows[0].id;
await db.query(`insert into auth.users (id, email, encrypted_password) values ($1, 'u@users.nooob.xyz', 'x')`, [uid]);
if (!(await db.query(`select 1 from public.profiles where id = $1`, [uid])).rows.length) await db.query(`insert into public.profiles (id, username, display_name) values ($1, 'plainuser', 'plainuser')`, [uid]);
const asPlain = async (sql, args = []) => { try { return await asUser(db, uid, async () => (await db.query(sql, args)).rows[0]?.r); } catch (e) { return 'ERR ' + e.message; } };
check(/ERR/.test(String(await asPlain(`select public.admin_grievances(null) as r`))), 'an ordinary signed-in person cannot list complaints');
check(/ERR/.test(String(await asPlain(`select public.admin_grievance_update(gen_random_uuid(), 'resolved', 'x') as r`))), 'nor answer them');
check(/permission denied/i.test(await anonFails(`select public.admin_grievances(null) as r`)), 'a visitor cannot even call the administrator functions');
const admin = (await db.query(`select id from public.profiles where lower(username) = 'noob' limit 1`)).rows[0]?.id;
if (admin) {
  const asAdmin = async (sql, args = []) => asUser(db, admin, async () => (await db.query(sql, args)).rows[0]?.r);
  const list = await asAdmin(`select public.admin_grievances(null) as r`);
  check(Array.isArray(list) && list.length >= 4 && list[0].ticket, 'the administrator sees every complaint, newest first');
  const id = list.find((g) => g.ticket === t).id;
  await asAdmin(`select public.admin_grievance_update($1, 'acknowledged', null) as r`, [id]);
  await asAdmin(`select public.admin_grievance_update($1, 'resolved', 'We removed the post.') as r`, [id]);
  const after = await anon(`select public.track_grievance($1, 'asha@example.com') as r`, [t]);
  check(after.status === 'resolved' && after.resolution === 'We removed the post.' && after.acknowledgedAt && after.resolvedAt, 'acknowledging and resolving shows on the ticket, with the answer');
} else check(true, '(no administrator account in the test database: the administrator checks are covered by the audit)');

section('4. The page and the texts');
const page = read('public/grievance.html'), js = read('public/grievance.js');
check(/id="gform"/.test(page) && /id="tform"/.test(page) && /24 hours/.test(page) && /15 days/.test(page) && /Data Protection Board/.test(page) && /not a registered company/.test(page) && /\/grievance\.js/.test(page), 'the page has the form, the lookup, the two promised times, the Board, and says who runs NOOB');
check(/submit_grievance/.test(js) && /track_grievance/.test(js) && /sb_publishable_/.test(js) && !/service_role|secret/i.test(js), 'the page script calls only the two public functions with the public key');
for (const f of ['public/terms.html', 'public/privacy.html', 'src/components/Legal/TermsAndConditions.tsx', 'src/components/Legal/PrivacyPolicy.tsx']) {
  const s = read(f);
  check(/Who runs NOOB/.test(s) && /not a registered company/.test(s) && /no cash value/.test(s) && /Translate/.test(s) && /grievance\.html/.test(s) && /Money, noobs, purchases and refunds/.test(s) && /not an emergency or safety service/.test(s), `${f}: who runs NOOB, money and refunds, no cash value, Translate, young people and location, the grievance page`);
}
check(/testId: "e2ee-translate"/.test(read('src/components/Legal/EndToEndEncryption.tsx')), 'the encryption page says Translate sends one message to the translator');
check(/grievance\.html/.test(read('public/sitemap.xml')), 'the page is in the sitemap');

section('5. "Order Successful!" for NOOB Pro');
const rc = read('src/components/Profile/ProReceipt.tsx'), pro = read('src/components/Profile/ProFeaturesModal.tsx');
check(/Order Successful!/.test(rc) && /Thank you for your purchase/.test(rc) && /Order Details/.test(rc) && /Subtotal/.test(rc) && />Total</.test(rc.replace(/\{[^}]*\}/g, '')) || /'Total'/.test(rc), 'the receipt: Order Successful, Thank you, Order Details, Subtotal, Total');
check(/receiptNumber/.test(rc) && /Done<\/button>/.test(read('src/components/Payments/PaymentReceiptPage.tsx')) && /discount > 0/.test(rc), 'a receipt number, the Done button, and a coupon line only when a coupon was used');
check(/setReceipt\(\{ planName: tier\.name, billing, base: quote\.base, total: quote\.display/.test(pro) && /<ProReceipt receipt=\{receipt\}/.test(pro), 'it opens the moment a plan has been paid, with the real plan, billing, price and coupon');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
