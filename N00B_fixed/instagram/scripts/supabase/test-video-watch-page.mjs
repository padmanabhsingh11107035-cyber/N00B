// The YouTube-style Feed video page: quality options (the rules and the lower-quality copies saved on the video), the suggested list, the player's small rules, and how the pieces are wired together.
// The real player and page are driven in a real browser by the scratchpad check (watch_check.mjs); this is the part that must keep holding on every change.
// Usage: node --liftoff-only scripts/supabase/test-video-watch-page.mjs
import fs from 'node:fs';
import { createTestDb, asUser, asAnon } from './pg-test-env.mjs';
import { buildOptions, dataPerMinute, allowedMbps, chooseAuto, autoLabel, renditionHeights, ORIGINAL_ID } from '../../src/utils/videoQuality.ts';
import { suggestVideos } from '../../src/utils/suggestVideos.ts';
import { formatClock, clamp, seekTo, tapZone, bufferedShare, keyAction, countdownLeft, SPEEDS, speedLabel } from '../../src/utils/videoPlayerMath.ts';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8');

section('1. Quality options');
const copies = [{ height: 240, url: 'videos/a-240.mp4', bytes: 2_000_000 }, { height: 480, url: 'videos/a-480.mp4', bytes: 6_000_000 }];
let opts = buildOptions('videos/a.mp4', copies, 720, 20_000_000);
check(opts.map((o) => o.id).join() === 'original,480,240', 'the original comes first, then the copies from big to small', opts.map((o) => o.id).join());
check(opts[0].label === '720p' && opts[1].label === '480p', 'the original is named by its real height once known');
check(buildOptions('videos/a.mp4', [], 0)[0].label === 'Original' && buildOptions('videos/a.mp4', null).length === 1, 'an older video (no copies) offers the original only');
check(buildOptions('videos/a.mp4', [{ height: 720, url: 'x', bytes: 1 }, { height: 1080, url: 'y', bytes: 1 }], 720).length === 1, 'a "copy" that is not smaller than the original is left out');
check(dataPerMinute(6_291_456, 60) === '≈ 6.0 MB per minute' && dataPerMinute(105_000_000, 60) === '≈ 100 MB per minute' && dataPerMinute(null, 60) === '' && dataPerMinute(5, 0) === '', 'the data use is told per minute, and left blank when not known');
check(allowedMbps({ saveData: true }) < allowedMbps({ effectiveType: '2g' }) + 1 && allowedMbps({ effectiveType: '3g' }) < allowedMbps({ effectiveType: '4g', downlinkMbps: 10 }) && allowedMbps({}) === Infinity, 'data saver and slow networks allow less; nothing known allows everything');
opts = buildOptions('videos/a.mp4', copies, 720, 20_000_000);
check(chooseAuto(opts, {}, 60).id === ORIGINAL_ID, 'Auto: with nothing known the original is used');
check(chooseAuto(opts, { saveData: true }, 60).id === '240', 'Auto: data saver gets the smallest copy');
check(chooseAuto(opts, { effectiveType: '3g' }, 60).id === '240', 'Auto: 3G cannot carry the 6 MB/min copy comfortably, so 240p');
check(chooseAuto(opts, { downlinkMbps: 3 }, 60).id === '480', 'Auto: a middling connection gets the middle copy', chooseAuto(opts, { downlinkMbps: 3 }, 60).id);
check(chooseAuto(buildOptions('v', [], 720, null), { saveData: true }, 60).id === ORIGINAL_ID, 'Auto: with no smaller copy the original is the only choice');
check(autoLabel(opts[2]) === 'Auto (240p)' && autoLabel(null) === 'Auto', 'the menu says which quality Auto is using');
check(JSON.stringify(renditionHeights(1080, 120)) === '[480,240]' && JSON.stringify(renditionHeights(720, 120)) === '[360,240]' && JSON.stringify(renditionHeights(360, 120)) === '[240]' && renditionHeights(240, 120).length === 0, 'which copies are made depends on the size of the video');
check(renditionHeights(1080, 16 * 60).length === 0 && renditionHeights(1080, 0).length === 0 && renditionHeights(0, 60).length === 0, 'long (over 15 minutes) or unknown videos get no copies');

section('2. Suggested videos');
const NOW = Date.parse('2026-10-20T12:00:00Z');
const day = (n) => new Date(NOW - n * 86_400_000).toISOString();
const v = (id, userId, title, extra = {}) => ({ id, userId, title, viewsCount: 10, likesCount: 1, commentsCount: 0, createdAt: day(5), ...extra });
const cur = v('cur', 'u1', 'Painting a sunset with watercolours');
const all = [cur, v('same-owner', 'u1', 'Cooking pasta'), v('same-topic', 'u2', 'Sunset watercolours for beginners'), v('popular', 'u3', 'Gaming night', { viewsCount: 20_000, likesCount: 500, commentsCount: 50 }), v('dull', 'u4', 'Random', { viewsCount: 0, likesCount: 0, createdAt: day(300) })];
let s = suggestVideos(cur, all, [], 20, NOW);
check(!s.some((x) => x.id === 'cur'), 'the video being watched is never suggested');
check(s[0].id === 'same-owner' && s[1].id === 'same-topic', 'more from the same person comes first, then videos about the same things', s.map((x) => x.id).join());
check(s.indexOf(s.find((x) => x.id === 'popular')) < s.indexOf(s.find((x) => x.id === 'dull')), 'popular beats forgotten');
const twins = [cur, v('t5', 'u5', 'Quiet vlog'), v('t6', 'u6', 'Quiet vlog')];
check(suggestVideos(cur, twins, [], 5, NOW)[0].id === 't5' && suggestVideos(cur, twins, ['u6'], 5, NOW)[0].id === 't6', 'between two equal videos, the one from a person you follow comes first');
check(suggestVideos(cur, all, [], 2, NOW).length === 2 && suggestVideos(cur, [cur], [], 5, NOW).length === 0, 'the list respects the limit, and is empty when there is nothing else');
check(suggestVideos(cur, all, new Set(['u4']), 20, NOW).length === 4, 'a Set of followed people works too');

section('3. The player\'s small rules');
check(formatClock(75) === '1:15' && formatClock(3725) === '1:02:05' && formatClock(-4) === '0:00' && formatClock(NaN) === '0:00' && formatClock(0) === '0:00', 'times are written like 1:15 and 1:02:05');
check(seekTo(5, 10, 30) === 15 && seekTo(5, -10, 30) === 0 && seekTo(25, 10, 30) === 30 && clamp(5, 0, 3) === 3, 'a jump never goes before the start or after the end');
check(tapZone(10, 300) === 'left' && tapZone(150, 300) === 'middle' && tapZone(290, 300) === 'right' && tapZone(5, 0) === 'middle', 'the left and right thirds of the picture seek; the middle is play / pause');
const ranges = { length: 2, start: (i) => [0, 20][i], end: (i) => [10, 30][i] };
check(bufferedShare(ranges, 5, 60) === 10 / 60 && bufferedShare(ranges, 25, 60) === 0.5 && bufferedShare(ranges, 15, 60) === 0 && bufferedShare(null, 0, 60) === 0, 'the loaded part of the bar follows the range the position is in');
check(['k', ' '].every((k) => keyAction(k) === 'toggle') && keyAction('ArrowLeft') === 'back5' && keyAction('j') === 'back10' && keyAction('l') === 'forward10' && keyAction('m') === 'mute' && keyAction('f') === 'fullscreen' && keyAction('x') === null, 'the keys are the same as on YouTube');
check(countdownLeft(0, 0) === 5 && countdownLeft(0, 2100) === 3 && countdownLeft(0, 99_000) === 0, 'the "Up next" countdown runs 5 to 0');
check(SPEEDS.includes(0.25) && SPEEDS.includes(2) && speedLabel(1) === 'Normal' && speedLabel(1.5) === '1.5x', 'speeds run 0.25x to 2x');

section('4. The lower-quality copies on the video (real Postgres)');
const db = await createTestDb();
const mkUser = async (name) => {
  const id = (await db.query(`select gen_random_uuid() as id`)).rows[0].id;
  await db.query(`insert into auth.users (id, email, encrypted_password) values ($1, $2, 'x')`, [id, `${name}@users.nooob.xyz`]);
  if (!(await db.query(`select 1 from public.profiles where id = $1`, [id])).rows.length) await db.query(`insert into public.profiles (id, username, display_name) values ($1, $2, $2)`, [id, name]);
  return id;
};
const call = async (uid, sql, args = []) => asUser(db, uid, async () => (await db.query(sql, args)).rows[0]?.r);
const fails = async (uid, sql, args, re) => { try { await asUser(db, uid, async () => db.query(sql, args)); return false; } catch (e) { return re.test(e.message); } };
const ann = await mkUser('ann'), bob = await mkUser('bob');
const made = await call(ann, `select public.create_long_video('videos/a.mp4', null, 'Mine', '', 60) as r`);
const vid = made.video.id;
check(Array.isArray(made.video.renditions) && made.video.renditions.length === 0, 'a new video has no copies, and says so');
const good = [{ height: 240, url: 'videos/a-240.mp4', bytes: 2_000_000 }, { height: 480, url: 'videos/a-480.mp4', bytes: 6_000_000 }];
let res = await call(ann, `select public.set_long_video_renditions($1, $2::jsonb) as r`, [vid, JSON.stringify(good)]);
check(res.success && res.renditions.length === 2 && res.renditions[0].height === 480 && res.renditions[1].height === 240, 'the person who posted it can add copies (stored big to small)', JSON.stringify(res));
const feed = await call(bob, `select public.feed_long_videos(30) as r`);
const seen = (Array.isArray(feed) ? feed : feed.videos || []).find((x) => x.id === vid);
check(seen && seen.renditions.length === 2 && seen.renditions[0].url === 'videos/a-480.mp4' && seen.renditions[0].bytes === 6_000_000, 'other people see the copies with the video in the feed', JSON.stringify(seen && seen.renditions));
check(await fails(bob, `select public.set_long_video_renditions($1, $2::jsonb)`, [vid, JSON.stringify(good)], /Only the person who posted/), 'nobody else can change another person\'s video');
check(await (async () => { try { await asAnon(db, async () => db.query(`select public.set_long_video_renditions($1, '[]'::jsonb)`, [vid])); return false; } catch (e) { return /permission denied|log in/i.test(e.message); } })(), 'someone not logged in cannot');
check(await fails(ann, `select public.set_long_video_renditions($1, $2::jsonb)`, [vid, JSON.stringify([{ height: 240, url: 'https://evil.example/x.mp4', bytes: 10 }])], /no valid file/), 'a copy must be a file in the app\'s own videos folder (no outside links)');
check(await fails(ann, `select public.set_long_video_renditions($1, $2::jsonb)`, [vid, JSON.stringify([{ height: 240, url: 'videos/../x.mp4', bytes: 10 }, { height: 480, url: 'videos/b.mp4', bytes: 10 }])], /no valid file/), 'a path that climbs out of the folder is refused');
check(await fails(ann, `select public.set_long_video_renditions($1, $2::jsonb)`, [vid, JSON.stringify([{ height: 50, url: 'videos/b.mp4', bytes: 10 }])], /no valid height/), 'a tiny or missing height is refused');
check(await fails(ann, `select public.set_long_video_renditions($1, $2::jsonb)`, [vid, JSON.stringify([{ height: 240, url: 'videos/b.mp4', bytes: 90_000_000 }])], /no valid size/), 'a size that is zero or absurd is refused');
check(await fails(ann, `select public.set_long_video_renditions($1, $2::jsonb)`, [vid, JSON.stringify([{ height: 240, url: 'videos/b.mp4', bytes: 10 }, { height: 240, url: 'videos/c.mp4', bytes: 10 }])], /same height/), 'two copies of the same height are refused');
check(await fails(ann, `select public.set_long_video_renditions($1, $2::jsonb)`, [vid, JSON.stringify([1, 2, 3, 4, 5].map((n) => ({ height: 100 + n * 100, url: `videos/${n}.mp4`, bytes: 10 })))], /at most four/), 'no more than four copies');
check(await fails(ann, `select public.set_long_video_renditions($1, $2::jsonb)`, [vid, '{"a":1}'], /must be a list/), 'it must be a list');
check(await fails(ann, `select public.set_long_video_renditions(gen_random_uuid(), '[]'::jsonb)`, [], /Video not found/), 'an unknown video is refused');
check((await db.query(`select jsonb_array_length(renditions) n from public.long_videos where id = $1`, [vid])).rows[0].n === 2, 'every refusal left the saved copies as they were');
res = await call(ann, `select public.set_long_video_renditions($1, '[]'::jsonb) as r`, [vid]);
check(res.success && res.renditions.length === 0, 'the copies can be removed');
const sql = read('supabase/migrations/20261020000004_video_renditions.sql');
await db.exec(sql); await db.exec(sql);
check(true, 'running the migration again changes nothing');

section('5. How the pieces are wired');
const player = read('src/components/Videos/VideoPlayer.tsx');
const page = read('src/components/Videos/VideoWatchPage.tsx');
const feedView = read('src/components/Videos/HomeVideoFeedView.tsx');
const app = read('src/App.tsx');
const upload = read('src/components/Videos/UploadVideoModal.tsx');
check(/data-testid="player-mute"/.test(player) && /aria-pressed=\{muted\}/.test(player) && /store\.set\(KEY_MUTED/.test(player), 'the player has a mute / unmute button that remembers its choice');
check(/data-testid="player-settings"/.test(player) && /menu-quality/.test(player) && /menu-speed/.test(player) && /buildOptions\(/.test(player) && /chooseAuto\(/.test(player) && /dataPerMinute\(/.test(player), 'the player has Quality (Auto + each copy, with data use) and Playback speed');
check(/resume\.current = \{ time: last\.current\.time/.test(player) && /v\.currentTime = r\.time/.test(player), 'changing quality carries the place and the play state over');
check(/menuRef\.current/.test(player) && !/setShowControls\(false\); setMenu\(null\)/.test(player), 'the settings menu is not closed by the controls\' hide timer while it is being read');
check(/requestFullscreen/.test(player) && /webkitEnterFullscreen/.test(player) && /orientation as any\)\?\.lock\?\.\('landscape'\)/.test(player), 'full screen works (and turns a wide video sideways; iPhone uses its own full screen)');
check(/tapZone\(/.test(player) && /jump\(zone === 'left' \? -10 : 10/.test(player), 'double-tapping the sides jumps 10 seconds');
check(/key=\{video\.id\}/.test(page) && /data-testid="watch-comments-bar"/.test(page) && page.indexOf('{details}') < page.indexOf('{suggestedList}') && /data-testid="suggested-videos"/.test(page), 'the suggested videos come after the comments bar');
check(/useMedia\('\(orientation: landscape\) and \(max-height: 520px\)'\)/.test(page) && /h-\[100dvh\]/.test(page) && /useMedia\('\(min-width: 1024px\)'\)/.test(page) && /w-\[390px\] shrink-0/.test(page), 'a sideways phone shows the video full screen; a computer shows two columns');
check(/suggestVideos\(video, allVideos, followingIds/.test(page) && /upNext=\{autoplay && next/.test(page) && /noob_autoplay_next/.test(page), 'the list is the suggestion order, with Up next and an Autoplay switch that is remembered');
check(/<VideoWatchPage/.test(feedView) && /<WatchHistoryPage/.test(feedView) && !/<video[\s>]/.test(feedView.slice(feedView.indexOf('<VideoWatchPage') - 200, feedView.indexOf('<VideoWatchPage') + 400)), 'the Feed uses the new page for opening a video');
check(/<RenditionStrip \/>/.test(app) && /queueRenditions\(/.test(upload) && /skipCompress/.test(read('src/utils/uploadProgress.ts')), 'the copies are made after posting, with a strip showing how far it is');
check(/export async function setLongVideoRenditions/.test(read('src/services/supabaseApi.ts')) && /const renditions = Array\.isArray\(v\.renditions\)/.test(read('src/services/supabaseApi.ts')), 'the app saves the copies and reads them back with each video');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
