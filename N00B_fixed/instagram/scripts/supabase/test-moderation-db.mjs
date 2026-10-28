// Migration 20261030000001: the AI moderator (NOOB Safety). On a REAL Postgres (PGlite) with every migration applied: what is watched, what is enforced, the strikes, the
// suspension, the notices, the e-mail queue, the administrator's page. The AI itself is replaced by verdicts handed to mod_apply (the Edge Function is tested separately).
// Usage: node --liftoff-only scripts/supabase/test-moderation-db.mjs
import fs from 'node:fs';
import { createTestDb, asUser } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const db = await createTestDb();
const SECRET = 'a-very-private-password';
await db.query(`insert into public.internal_config (key, value) values ('push_secret', $1) on conflict (key) do update set value = excluded.value`, [SECRET]);

const mkUser = async (name, email) => {
  const id = (await db.query(`select gen_random_uuid() as id`)).rows[0].id;
  await db.query(`insert into auth.users (id, email, encrypted_password) values ($1, $2, 'x')`, [id, `${name}@users.nooob.xyz`]);
  if (!(await db.query(`select 1 from public.profiles where id = $1`, [id])).rows.length) await db.query(`insert into public.profiles (id, username, display_name, bio) values ($1, $2, $2, 'hello there')`, [id, name]);
  if (email) await db.query(`insert into public.profile_private (user_id, email) values ($1, $2) on conflict (user_id) do update set email = excluded.email`, [id, email]);
  return id;
};
const admin = await mkUser('noob');
const ann = await mkUser('ann', 'ann@example.com');
const bob = await mkUser('bob', 'bob@example.com');
const cat = await mkUser('cat');   // no real e-mail address
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const one = async (sql, args = []) => (await q(sql, args))[0];
const rpc = (uid, fn, ...args) => asUser(db, uid, async () => (await db.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).rows[0].r);
const fails = async (fn, re, label) => { try { await fn(); check(false, label, 'did not fail'); } catch (e) { check(re.test(String(e.message || e)), label, String(e.message || e)); } };
const setMode = (mode, extra = {}) => rpc(admin, 'admin_moderation_set', mode, extra.strictness ?? null, extra.strikes ?? null, extra.window ?? null, extra.conf ?? null);

// a post by `uid`; returns { id, job }, with the job claimed (as the Edge Function does)
const newPost = async (uid, caption) => {
  const id = (await one(`insert into public.posts (user_id, caption) values ($1, $2) returning id`, [uid, caption])).id;
  return { id, job: (await one(`select * from public.moderation_jobs where kind = 'post' and target_id = $1`, [id])) };
};
const claim = async (jobId) => (await one(`select public.mod_claim($1, $2) as r`, [SECRET, jobId])).r;
const apply = async (jobId, v) => (await one(`select public.mod_apply($1, $2, $3::jsonb) as r`, [SECRET, jobId, JSON.stringify(v)])).r;
const V = (o) => ({ violation: true, severity: 'severe', category: 'harassment', confidence: 0.95, words: [], reason: 'it contains abusive language aimed at another person', mediaViolation: false, ...o });
const notices = async (uid) => q(`select title, message from public.notifications where target_user_id = $1 and type = 'admin_direct' order by created_at`, [uid]);

section('1. What is watched: only public things');
const trg = (await q(`select c.relname from pg_trigger t join pg_class c on c.oid = t.tgrelid where t.tgname like 'zz_moderate%' and not t.tgisinternal`)).map((r) => r.relname);
for (const t of ['posts', 'reels', 'comments', 'profiles']) check(trg.includes(t), `${t} is watched`);
for (const t of ['messages', 'chats', 'anon_messages', 'call_logs', 'live_lounge_room_chat']) check(!trg.includes(t), `${t} (private / not covered) is NOT watched`);
const sets = await one(`select * from public.moderation_settings`);
check(sets.mode === 'watch' && sets.strikes_to_suspend === 3 && sets.strike_window_days === 30 && Number(sets.min_confidence) === 0.85, 'it starts in WATCH mode: 3 warnings in 30 days, 85% sure');

section('2. The door is private');
const p0 = await newPost(ann, 'a lovely sunset');
check(p0.job && p0.job.status === 'pending', 'saving a post writes a job');
await fails(() => claim(p0.job.id).then(() => db.query(`select public.mod_claim('wrong', $1)`, [p0.job.id])), /Unauthorized/, 'a wrong password is refused');
await fails(() => db.query(`select public.mod_apply('wrong', $1, '{}'::jsonb)`, [p0.job.id]), /Unauthorized/, 'mod_apply refuses a wrong password too');
const c0 = await claim(p0.job.id);
check(c0.claimed === false, 'a job already claimed is not handed out twice');
const p1 = await newPost(ann, 'my day #sunset');
const c1 = await claim(p1.job.id);
check(c1.claimed === true && c1.kind === 'post' && c1.username === 'ann' && /my day/.test(c1.text) && c1.mode === 'watch', 'the claim hands over the text, the author and the mode');
const clean = await apply(p1.job.id, { violation: false, severity: 'none', confidence: 0.99 });
check(clean.clean === true && (await q(`select 1 from public.moderation_log`)).length === 0, 'clean content leaves NO trace in the log');
check((await one(`select status from public.moderation_jobs where id = $1`, [p1.job.id])).status === 'done', 'and the job is finished');

section('3. Watch mode: judged and written down, nothing touched, nobody told');
const w = await newPost(ann, 'you are trash');
await claim(w.job.id);
const wr = await apply(w.job.id, V({ words: ['trash'] }));
check(wr.applied === false && wr.watched === true, 'watch: not applied');
check((await q(`select 1 from public.posts where id = $1`, [w.id])).length === 1, 'the post is still there');
check((await notices(ann)).length === 0, 'no notice was sent');
const wl = await one(`select * from public.moderation_log where target_id = $1`, [w.id]);
check(wl && wl.applied === false && wl.action === 'deleted' && wl.strike_no === 0 && wl.email_status === 'none', 'the log says what it WOULD have done (no strike, no e-mail)');

section('4. Enforce: a severe post is deleted, the person gets a notice and an e-mail, a strike counts');
await setMode('enforce');
const e1 = await newPost(ann, 'something vile');
await claim(e1.job.id);
const er = await apply(e1.job.id, V());
check(er.applied === true && er.action === 'deleted' && er.strike === 1 && er.suspended === false, 'applied: deleted, warning 1');
check((await q(`select 1 from public.posts where id = $1`, [e1.id])).length === 0, 'the whole post is gone');
const n1 = await notices(ann);
check(n1.length === 1 && /removed/.test(n1[0].title) && /Warning 1 of 3/.test(n1[0].message) && /abusive language/.test(n1[0].message), 'an in-app notice with the reason and "Warning 1 of 3"');
const log1 = await one(`select * from public.moderation_log where target_id = $1`, [e1.id]);
check(log1.applied && log1.content === 'something vile' && log1.email_status === 'pending' && log1.strike_limit === 3, 'the log keeps what was written, and the e-mail is queued');
const mc = (await one(`select public.mod_email_claim($1, $2) as r`, [SECRET, log1.id])).r;
check(mc.claimed === true && mc.email === 'ann@example.com' && mc.action === 'deleted' && mc.strike === 1 && mc.snippet === 'something vile', 'the e-mail claim hands over address, reason, warning number and what was removed');
check((await one(`select public.mod_email_claim($1, $2) as r`, [SECRET, log1.id])).r.claimed === false, 'an e-mail is never claimed twice');
await db.query(`select public.mod_email_done($1, $2, false, 'smtp down')`, [SECRET, log1.id]);
check((await one(`select public.mod_email_claim($1, $2) as r`, [SECRET, log1.id])).r.claimed === true, 'a failed e-mail can be claimed again');
await db.query(`select public.mod_email_done($1, $2, true)`, [SECRET, log1.id]);
check((await one(`select email_status from public.moderation_log where id = $1`, [log1.id])).email_status === 'sent', 'and is marked sent');
const noMail = await newPost(cat, 'bad bad');
await claim(noMail.job.id);
await apply(noMail.job.id, V());
check((await one(`select email_status from public.moderation_log where target_id = $1`, [noMail.id])).email_status === 'skipped', 'an account without a real e-mail address is skipped, the notice still goes');
check((await notices(cat)).length === 1, 'the notice was sent anyway');

section('5. Words only: a mild word is taken out of a comment / caption, severe comments are deleted whole');
const host = (await newPost(bob, 'a normal post')).id;
await db.query(`delete from public.moderation_jobs`);
const cm = (await one(`insert into public.comments (post_id, user_id, text) values ($1, $2, 'what a stupid idiot move man') returning id`, [host, ann])).id;
const cj = await one(`select * from public.moderation_jobs where kind = 'comment' and target_id = $1`, [cm]);
await claim(cj.id);
const cr = await apply(cj.id, V({ severity: 'mild', words: ['stupid', 'idiot'] }));
check(cr.applied && cr.action === 'words_removed', 'a mild comment: only the words are removed');
check((await one(`select text from public.comments where id = $1`, [cm])).text === 'what a move man', 'the comment stays, without the words');
const cm2 = (await one(`insert into public.comments (post_id, user_id, text) values ($1, $2, 'i will find you and kill you') returning id`, [host, bob])).id;
const cj2 = await one(`select * from public.moderation_jobs where kind = 'comment' and target_id = $1`, [cm2]);
await claim(cj2.id);
const cr2 = await apply(cj2.id, V({ severity: 'severe', category: 'violence' }));
check(cr2.action === 'deleted' && (await q(`select 1 from public.comments where id = $1`, [cm2])).length === 0, 'a severe comment is deleted whole');
const cm3 = (await one(`insert into public.comments (post_id, user_id, text) values ($1, $2, 'stupid') returning id`, [host, bob])).id;
const cj3 = await one(`select * from public.moderation_jobs where kind = 'comment' and target_id = $1`, [cm3]);
await claim(cj3.id);
check((await apply(cj3.id, V({ severity: 'mild', words: ['stupid'] }))).action === 'deleted', 'a comment that would be empty without its words is deleted');
const cap = await newPost(cat, 'nice stupid day');
await claim(cap.job.id);
await apply(cap.job.id, V({ severity: 'mild', words: ['stupid'] }));
check((await one(`select caption from public.posts where id = $1`, [cap.id])).caption === 'nice day', 'a caption keeps its post, without the word');
const pic = await newPost(cat, 'looks fine in words');
await claim(pic.job.id);
const picr = await apply(pic.job.id, V({ violation: false, severity: 'mild', mediaViolation: true, words: [], category: 'sexual' }));
check(picr.action === 'deleted' && (await q(`select 1 from public.posts where id = $1`, [pic.id])).length === 0, 'a picture that breaks the rules deletes the whole post');

section('6. Not sure: only the administrator is told (in the log)');
const unsure = await newPost(bob, 'maybe rude, maybe a joke');
await claim(unsure.job.id);
const ur = await apply(unsure.job.id, V({ confidence: 0.7 }));
check(ur.applied === false && ur.flagged === true, '70% sure: flagged');
const bobNotices = (await notices(bob)).length;
check((await q(`select 1 from public.posts where id = $1`, [unsure.id])).length === 1 && bobNotices === (await notices(bob)).length && !(await notices(bob)).some((n) => /unsure|maybe/i.test(n.message)), 'nothing touched, the person is not told');
check((await one(`select action, applied, strike_no from public.moderation_log where target_id = $1`, [unsure.id])).action === 'flagged', 'it sits in the log as "flagged"');
const vague = await newPost(bob, 'meh');
await claim(vague.job.id);
const vr = await apply(vague.job.id, V({ confidence: 0.4 }));
check(vr.flagged === false && (await q(`select 1 from public.moderation_log where target_id = $1`, [vague.id])).length === 0, 'below 60%: not even logged');

section('7. Strikes and suspension');
await db.query(`delete from public.moderation_log where user_id = $1`, [bob]);
let last;
for (let i = 1; i <= 3; i++) {
  const p = await newPost(bob, `rude thing ${i}`);
  await claim(p.job.id);
  last = await apply(p.job.id, V());
  check(last.strike === i, `warning ${i}`);
}
check(last.suspended === true, 'the 3rd warning suspends the account');
const bp = await one(`select p.is_suspended, pp.suspended_reason from public.profiles p join public.profile_private pp on pp.user_id = p.id where p.id = $1`, [bob]);
check(bp.is_suspended === true && /NOOB Safety/.test(bp.suspended_reason) && /3 violations/.test(bp.suspended_reason), 'suspended, with the reason on record');
check((await one(`select banned_until from auth.users where id = $1`, [bob])).banned_until !== null, 'and signing in is blocked');
const bn = await notices(bob);
check(bn.some((n) => /suspended/i.test(n.title)), 'a suspension notice was sent too');
check((await one(`select suspended from public.moderation_log where user_id = $1 and strike_no = 3`, [bob])).suspended === true, 'the log marks the warning that suspended');
const crit = await newPost(ann, 'very serious');
await db.query(`delete from public.moderation_log where user_id = $1`, [ann]);
await claim(crit.job.id);
const critr = await apply(crit.job.id, V({ severity: 'critical', category: 'sexual', confidence: 0.97 }));
check(critr.suspended === true && critr.strike === 1, 'a critical violation suspends at once, at warning 1');

section('8. Nobody is judged by mistake');
const ap = await newPost(admin, 'anything the admin writes');
check(!ap.job, 'the administrator is never judged (no job)');
await setMode('off');
const off = await newPost(cat, 'while it is off');
check(!off.job, 'with the moderator OFF no job is written');
await setMode('enforce');
const gone = await newPost(cat, 'deleted before the AI looked');
await db.query(`delete from public.posts where id = $1`, [gone.id]);
check((await claim(gone.job.id)).claimed === false, 'content deleted before it was judged is skipped');
const mid = await newPost(cat, 'owner deletes it while the AI thinks');
await claim(mid.job.id);
await db.query(`delete from public.posts where id = $1`, [mid.id]);
check((await apply(mid.job.id, V())).gone === true && (await q(`select 1 from public.moderation_log where target_id = $1`, [mid.id])).length === 0, 'deleted while being judged: no strike, no log');
const tiny = await newPost(cat, ' ');
check((await claim(tiny.job.id)).claimed === false, 'empty text is not sent to the AI');

section('9. The AI is down: nothing is punished, it is tried again');
const dn = await newPost(cat, 'waiting for the AI');
await claim(dn.job.id);
await db.query(`select public.mod_fail($1, $2, 'groq 429')`, [SECRET, dn.job.id]);
check((await one(`select status, attempts from public.moderation_jobs where id = $1`, [dn.job.id])).status === 'pending', 'a failed attempt goes back to waiting');
for (let i = 0; i < 4; i++) { await claim(dn.job.id); await db.query(`select public.mod_fail($1, $2, 'groq 429')`, [SECRET, dn.job.id]); }
check((await one(`select status from public.moderation_jobs where id = $1`, [dn.job.id])).status === 'failed', 'after 5 tries it is marked failed (and nobody was punished)');
check((await q(`select 1 from public.posts where id = $1`, [dn.id])).length === 1, 'the post is untouched');

section('10. Bio and display name');
const bioU = await mkUser('dan', 'dan@example.com');
await db.query(`delete from public.moderation_jobs`);
await db.query(`update public.profiles set bio = 'i am a stupid fan', display_name = 'Stupid Dan' where id = $1`, [bioU]);
const bj = await one(`select * from public.moderation_jobs where kind = 'bio' and user_id = $1`, [bioU]);
const nj = await one(`select * from public.moderation_jobs where kind = 'name' and user_id = $1`, [bioU]);
check(bj && nj, 'changing the bio and the display name writes a job each');
await claim(bj.id); await apply(bj.id, V({ severity: 'mild', words: ['stupid'] }));
check((await one(`select bio from public.profiles where id = $1`, [bioU])).bio === 'i am a fan', 'the word is taken out of the bio');
await claim(nj.id); await apply(nj.id, V({ severity: 'severe', words: [] }));
check((await one(`select display_name from public.profiles where id = $1`, [bioU])).display_name === 'dan', 'an offensive display name becomes the username');

section('11. Words are taken out whole, in any case');
const strip = async (t, w) => (await one(`select public.mod_strip_words($1, $2::text[]) as r`, [t, w])).r;
check(await strip('This class is great', ['ass']) === 'This class is great', 'a bad word inside a normal word ("class") is left alone');
check(await strip('you ASS, and an Ass.', ['ass']) === 'you , and an .', 'any case, with punctuation');
check(await strip('a.b is (bad) here', ['a.b', '(bad)']) === 'is here' || (await strip('a.b is (bad) here', ['a.b', '(bad)'])) === 'is  here'.replace('  ', ' '), 'symbols in a word are matched literally');
check(await strip('hello', []) === 'hello' && await strip(null, ['x']) === '', 'no words / no text: safe');

section('12. The administrator\'s page');
await fails(() => rpc(ann, 'admin_moderation_overview'), /administrator/i, 'a normal person can not open it');
await fails(() => rpc(ann, 'admin_moderation_log', 'all', 10), /administrator/i, 'nor read the log');
await fails(() => rpc(ann, 'admin_moderation_set', 'off', null, null, null, null), /administrator/i, 'nor change it');
const ov = await rpc(admin, 'admin_moderation_overview');
check(ov.settings.mode === 'enforce' && ov.counts.removed24h >= 3 && ov.counts.suspended7d >= 1 && ov.counts.wordsRemoved24h >= 1, 'the overview shows mode and counts');
const rows = (await rpc(admin, 'admin_moderation_log', 'all', 100)).rows;
check(rows.length > 5 && rows.every((r) => r.username && r.reason && 'applied' in r), 'the log lists who, what, why and whether it was applied');
check((await rpc(admin, 'admin_moderation_log', 'flagged', 50)).rows.every((r) => r.action === 'flagged'), 'the "flagged" filter works');
check((await rpc(admin, 'admin_moderation_log', 'suspended', 50)).rows.every((r) => r.suspended), 'the "suspended" filter works');
check((await rpc(admin, 'admin_moderation_log', 'watched', 50)).rows.every((r) => !r.applied && r.action !== 'flagged'), 'the "watch only" filter works');
const set2 = await rpc(admin, 'admin_moderation_set', 'watch', 'strict', 5, 14, 0.9);
check(set2.settings.mode === 'watch' && set2.settings.strictness === 'strict' && set2.settings.strikesToSuspend === 5 && set2.settings.strikeWindowDays === 14 && Number(set2.settings.minConfidence) === 0.9, 'settings change');
const set3 = await rpc(admin, 'admin_moderation_set', null, null, 500, 9999, 0.1);
check(set3.settings.strikesToSuspend === 20 && set3.settings.strikeWindowDays === 365 && Number(set3.settings.minConfidence) === 0.6, 'and are kept inside safe limits');
await fails(() => rpc(admin, 'admin_moderation_set', 'sometimes', null, null, null, null), /Mode must be/, 'a made-up mode is refused');
await rpc(admin, 'admin_moderation_set', 'enforce', 'standard', 3, 30, 0.85);

section('13. Withdrawing a warning');
const target = rows.find((r) => r.applied && r.strikeNo > 0 && r.username === 'cat');
const before = (await one(`select count(*)::int n from public.moderation_log where user_id = $1 and applied and not forgiven`, [cat])).n;
const fg = await rpc(admin, 'admin_moderation_forgive', target.id);
check(fg.success === true, 'the administrator withdraws a warning');
check((await one(`select count(*)::int n from public.moderation_log where user_id = $1 and applied and not forgiven`, [cat])).n === before - 1, 'it no longer counts');
check((await notices(cat)).some((n) => /withdrawn/i.test(n.title)), 'the person is told');
check((await rpc(admin, 'admin_moderation_forgive', target.id)).success === false, 'it can not be withdrawn twice');
await fails(() => rpc(ann, 'admin_moderation_forgive', target.id), /administrator/i, 'a normal person can not withdraw one');

section('14. Retry job and the Edge Function files');
check((await one(`select public.retry_moderation() as n`)).n === 0, 'the retry job runs (nothing to send in the test database)');
const fn = fs.readFileSync('supabase/functions/moderator/index.ts', 'utf8');
check(/mod_claim/.test(fn) && /mod_apply/.test(fn) && /mod_fail/.test(fn) && /mod_email_claim/.test(fn) && /is_master_admin/.test(fn), 'the function uses the database doors and checks the administrator for test / health');
const panel = fs.readFileSync('src/components/Modals/AdminModerationPanel.tsx', 'utf8');
const modal = fs.readFileSync('src/components/Modals/AdminControlModal.tsx', 'utf8');
check(/activeTab === 'moderation' && main/.test(modal) && /AdminModerationPanel/.test(modal) && /\{main && \(\s*<button\s+onClick=\{\(\) => setActiveTab\('moderation'\)\}/.test(modal), 'the Moderator tab is for the main administrator only');
check(/mod-mode-/.test(panel), 'the page has the Off / Watch / Enforce switch');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
