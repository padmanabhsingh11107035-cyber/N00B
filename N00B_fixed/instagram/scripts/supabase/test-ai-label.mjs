// The "AI info" label on posts (migration 20261117000002).
//   1. the detector (src/utils/aiDetect.ts) on made-up file bytes: IPTC marker, C2PA + a tool, a generator tag, Stable Diffusion settings; and plain files that must NOT be flagged;
//   2. the screens: the switch in the creator (detected = locked on), the label on the post card (tap says why), createPost sets it right after publishing;
//   3. the SQL on a REAL Postgres (PGlite) with every migration applied: only the author labels, 'detected' wins, a stranger / a blocked person / logged-out visitors get nothing.
// Usage: node --liftoff-only scripts/supabase/test-ai-label.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildSync } from 'esbuild';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');

section('1. The detector (pure function, made-up file bytes)');
const out = path.resolve('node_modules/.cache-aidetect.mjs');
buildSync({ entryPoints: [path.resolve('src/utils/aiDetect.ts')], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' });
const D = await import(pathToFileURL(out).href);
check(!!D.detectAiSignals('xx<Iptc4xmpExt:DigitalSourceType>http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia</Iptc4xmpExt:DigitalSourceType>xx'), 'the IPTC "trained algorithmic media" marker is found');
check(!!D.detectAiSignals('compositeWithTrainedAlgorithmicMedia'), 'the IPTC "edited with AI" marker is found');
check(!!D.detectAiSignals('jumbf c2pa.claim ... Adobe Firefly ... c2pa.actions'), 'Content Credentials that name an AI tool are found');
check(D.detectAiSignals('jumbf c2pa.claim made with a Canon EOS R5 camera c2pa.hash.data') === null, 'Content Credentials from an ordinary camera are NOT flagged');
check(!!D.detectAiSignals('tEXt Software Midjourney v6'), 'a known generator in the tags is found');
check(!!D.detectAiSignals('parameters\u0000a cat, Steps: 30, Sampler: Euler a, CFG scale: 7, Seed: 12345'), 'Stable Diffusion settings in a PNG are found');
check(D.detectAiSignals('JFIF Exif Canon EOS R5 2026:11:17 ordinary holiday photo') === null && D.detectAiSignals('') === null, 'an ordinary photo, and an empty file, are NOT flagged');
check(D.detectAiSignals('a diffusion of light, my gemini zodiac sign, steps: 3') === null, 'ordinary words (diffusion, gemini, steps) are NOT flagged');
const mk = (text, type) => new File([new TextEncoder().encode(text)], 'x', { type });
check(!!(await D.detectAiMedia(mk('..trainedAlgorithmicMedia..', 'image/jpeg'))), 'a picture file with the marker is detected');
check((await D.detectAiMedia(mk('..trainedAlgorithmicMedia..', 'text/plain'))) === null, 'only pictures and videos are looked at');
const big = new Uint8Array(1024 * 1024 + 2000); big.set(new TextEncoder().encode('trainedAlgorithmicMedia'), big.length - 600);
check(!!(await D.detectAiMedia(new File([big], 'v.mp4', { type: 'video/mp4' }))), 'the end of a video is read too (its tags are often there)');
check((await D.detectAiMedia(new File([big], 'p.jpg', { type: 'image/jpeg' }))) === null, 'a picture is read only at its start');

section('2. The screens');
const modal = read('src/components/PostCreation/PostCreationModal.tsx'), card = read('src/components/Feed/PostCard.tsx'), api = read('src/services/supabaseApi.ts');
check(/detectAiMedia\(f\)/.test(modal) && /setAiDetected\(true\); setHasAiLabel\(true\)/.test(modal), 'picking files looks for a marker (in the original file) and turns the label on');
check(/if \(aiDetected && !on\) return;/.test(modal) && /aiSource: aiDetected \? 'detected' : 'creator'/.test(modal), 'a detected label can not be switched off, and the post says why it has it');
check(/data-testid="post-ai-info"/.test(card) && /AI info/.test(card) && /fetchPostAiInfo\(post\.id\)/.test(card), 'the post shows "AI info"; tapping it says why (asked only then)');
check(/post_ai_label_set/.test(api) && /post_ai_info/.test(api) && /try \{ await rpc\('post_ai_label_set'/.test(api), 'createPost switches the label on right after publishing; a failure never loses the post');

section('3. The SQL on a real Postgres');
const { createTestDb, asUser, asAnon } = await import('./pg-test-env.mjs');
const db = await createTestDb();
const mkUser = async (name) => {
  const id = (await db.query('select gen_random_uuid() as id')).rows[0].id;
  await db.query(`insert into auth.users (id, email, encrypted_password) values ($1, $2, extensions.crypt('secret pass', extensions.gen_salt('bf')))`, [id, `${name}@users.nooob.xyz`]);
  if (!(await db.query('select 1 from public.profiles where id = $1', [id])).rows.length) await db.query('insert into public.profiles (id, username, display_name) values ($1, $2, $2)', [id, name]);
  return id;
};
const ann = await mkUser('ann'), bob = await mkUser('bob'), cat = await mkUser('cat');
await db.query('insert into public.blocks (blocker_id, blocked_id) values ($1, $2)', [ann, cat]);
const mkPost = async (uid) => (await db.query(`insert into public.posts (user_id, caption) values ($1, 'p') returning id`, [uid])).rows[0].id;
const call = async (uid, sql, args = []) => asUser(db, uid, async () => (await db.query(sql, args)).rows[0]?.r);
const fail = async (uid, sql, args = []) => { try { await call(uid, sql, args); return null; } catch (e) { return e.message; } };
const p1 = await mkPost(ann), p2 = await mkPost(ann);
check(/only label your own/i.test((await fail(bob, 'select public.post_ai_label_set($1, $2) as r', [p1, 'creator'])) || ''), 'somebody else can not label my post');
check((await call(ann, 'select public.post_ai_label_set($1, $2) as r', [p1, 'creator'])).source === 'creator', 'the author labels their own post (creator)');
check((await db.query('select has_ai_label from public.posts where id = $1', [p1])).rows[0].has_ai_label === true, 'the post now carries has_ai_label');
check((await call(ann, 'select public.post_ai_label_set($1, $2) as r', [p1, 'detected'])).source === 'detected', 'a detected marker upgrades it to "detected"');
check((await call(ann, 'select public.post_ai_label_set($1, $2) as r', [p1, 'creator'])).source === 'detected', 'and a later "creator" can not downgrade it');
check((await call(bob, 'select public.post_ai_info($1) as r', [p1])).source === 'detected', 'a stranger who may see the post learns why it has the label');
check((await call(bob, 'select public.post_ai_info($1) as r', [p2])) == null, 'a post without the label answers nothing');
check((await call(cat, 'select public.post_ai_info($1) as r', [p1])) == null, 'a person the author blocked gets nothing');
const anonTry = await asAnon(db, async () => { try { await db.query('select public.post_ai_info($1)', [p1]); return 'ran'; } catch (e) { return e.message; } });
check(/permission denied/i.test(anonTry), 'a logged-out visitor can not call it');
const direct = await asUser(db, bob, async () => { try { await db.query('select * from public.post_ai_source'); return 'read'; } catch (e) { return e.message; } });
check(/permission denied/i.test(direct), 'the source table can not be read directly');

console.log(`\n${passed} passed, ${failed} failed`);
fs.rmSync(out, { force: true });
process.exit(failed ? 1 : 0);
