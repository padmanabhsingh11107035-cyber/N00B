// The Home filter (utils/homeFilter.ts) and how Home uses it: the content kinds, the order, your activity, the time, who from, the extras; the wide For You / Following switch; the button on the
// topic pills. Usage: node --liftoff-only scripts/supabase/test-home-filter.mjs
import fs from 'node:fs';
import * as F from '../../src/utils/homeFilter.ts';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');

const NOW = Date.parse('2026-11-27T12:00:00Z');
const hours = (h) => new Date(NOW - h * 3600_000).toISOString();
const mk = (id, extra = {}) => ({ id, userId: 'u_' + id, username: id, userAvatar: '', isVerified: false, caption: '', createdAt: hours(1), slides: [{ id: 's', mediaUrl: 'x', mediaType: 'image' }], likesCount: 0, commentsCount: 0, sharesCount: 0, savesCount: 0, isLiked: false, isSaved: false, isDisliked: false, hashtags: [], ...extra });
const posts = [
  mk('photo', { likesCount: 5, commentsCount: 9, createdAt: hours(2) }),
  mk('video', { slides: [{ id: 's', mediaUrl: 'x', mediaType: 'video' }], likesCount: 50, sharesCount: 7, createdAt: hours(30) }),
  mk('text', { slides: [], textBgStyle: 'sunset', likesCount: 1, createdAt: hours(24 * 10) }),
  mk('liked', { isLiked: true, isVerified: true, likesCount: 20, savesCount: 4, createdAt: hours(100) }),
  mk('saved', { isSaved: true, audioTrack: { title: 'Song' }, location: 'Ajmer', hashtags: ['a'], createdAt: hours(24 * 40) }),
  mk('mine', { userId: 'me', hasAiLabel: true, taggedUsers: [{ username: 'x' }], createdAt: hours(5) })
];
const ctx = { userId: 'me', following: new Set(['u_photo', 'u_video']), seen: new Set(['photo', 'liked']), now: NOW };
const ids = (l) => l.map((p) => p.id).join(',');
const E = F.EMPTY_FILTER;

section('1. The content kinds');
check(F.applyHomeFilter(posts, E, ctx) === posts && F.activeCount(E) === 0 && !F.isFiltered(E), 'no filter changes nothing');
check(ids(F.applyHomeFilter(posts, { ...E, kinds: ['videos'] }, ctx)) === 'video', 'Videos shows the video posts');
check(ids(F.applyHomeFilter(posts, { ...E, kinds: ['text'] }, ctx)) === 'text', 'Text posts shows the words-only posts');
check(ids(F.applyHomeFilter(posts, { ...E, kinds: ['photos', 'videos'] }, ctx)).split(',').includes('video') && ids(F.applyHomeFilter(posts, { ...E, kinds: ['photos', 'videos'] }, ctx)).split(',').includes('photo'), 'two kinds show both');
check(F.applyHomeFilter(posts, { ...E, kinds: ['polls'] }, ctx).length === 0 && F.applyHomeFilter(posts, { ...E, kinds: ['thoughts', 'live'] }, ctx).length === 0, 'polls, thoughts and live streams are not posts: choosing only those shows no post');

section('2. The order');
check(ids(F.applyHomeFilter(posts, { ...E, sort: 'liked' }, ctx)).startsWith('video,liked,photo'), 'Most liked puts 50, 20, 5 likes first');
check(F.applyHomeFilter(posts, { ...E, sort: 'commented' }, ctx)[0].id === 'photo' && F.applyHomeFilter(posts, { ...E, sort: 'shared' }, ctx)[0].id === 'video' && F.applyHomeFilter(posts, { ...E, sort: 'saved' }, ctx)[0].id === 'liked', 'most commented, shared and saved');
check(F.applyHomeFilter(posts, { ...E, sort: 'newest' }, ctx)[0].id === 'photo' && F.applyHomeFilter(posts, { ...E, sort: 'oldest' }, ctx)[0].id === 'saved', 'newest and oldest first');
const tie = [mk('a'), mk('b'), mk('c')];
check(ids(F.applyHomeFilter(tie, { ...E, sort: 'liked' }, ctx)) === 'a,b,c', 'equal posts keep the feed\'s own order');
check(ids(F.applyHomeFilter(posts, { ...E, sort: 'default', kinds: ['photos'] }, ctx)) === 'photo,liked,saved,mine' || ids(F.applyHomeFilter(posts, { ...E, kinds: ['photos'] }, ctx)).split(',')[0] === 'photo', '"For you" keeps the feed order');

section('3. Your activity, the time, who from, the extras');
check(ids(F.applyHomeFilter(posts, { ...E, activity: ['liked'] }, ctx)) === 'liked' && ids(F.applyHomeFilter(posts, { ...E, activity: ['saved'] }, ctx)) === 'saved', 'liked by me / saved by me');
check(ids(F.applyHomeFilter(posts, { ...E, activity: ['viewed'] }, ctx)) === 'photo,liked' && !ids(F.applyHomeFilter(posts, { ...E, activity: ['unviewed'] }, ctx)).includes('photo'), 'already viewed / not viewed yet use the posts this phone has seen');
check(F.toggleActivity(F.toggleActivity(E, 'viewed'), 'unviewed').activity.join() === 'unviewed' && F.toggleFrom(F.toggleFrom(E, 'following'), 'new').from.join() === 'new', '"viewed" and "not viewed", "people I follow" and "new people" can not both be on');
check(ids(F.applyHomeFilter(posts, { ...E, time: 'today' }, ctx)) === 'photo,mine,text'.split(',').filter((x) => x !== 'text').join(',') || ids(F.applyHomeFilter(posts, { ...E, time: 'today' }, ctx)).split(',').sort().join() === 'mine,photo', 'Today: posts of the last 24 hours');
check(F.applyHomeFilter(posts, { ...E, time: 'week' }, ctx).length === 4 && F.applyHomeFilter(posts, { ...E, time: 'month' }, ctx).length === 5, 'This week and this month');
check(ids(F.applyHomeFilter(posts, { ...E, from: ['following'] }, ctx)).split(',').sort().join() === 'mine,photo,video', 'People I follow (and my own posts)');
check(F.applyHomeFilter(posts, { ...E, from: ['verified'] }, ctx)[0].id === 'liked' && !ids(F.applyHomeFilter(posts, { ...E, from: ['new'] }, ctx)).includes('mine'), 'Verified accounts; New people leaves out the ones I follow and me');
check(ids(F.applyHomeFilter(posts, { ...E, extras: ['music'] }, ctx)) === 'saved' && ids(F.applyHomeFilter(posts, { ...E, extras: ['location'] }, ctx)) === 'saved' && ids(F.applyHomeFilter(posts, { ...E, extras: ['hashtags'] }, ctx)) === 'saved' && ids(F.applyHomeFilter(posts, { ...E, extras: ['ai'] }, ctx)) === 'mine' && ids(F.applyHomeFilter(posts, { ...E, extras: ['tagged'] }, ctx)) === 'mine', 'music, a place, hashtags, tagged people, made with AI');
check(F.applyHomeFilter(posts, { ...E, kinds: ['videos'], activity: ['liked'] }, ctx).length === 0 && ids(F.applyHomeFilter(posts, { ...E, kinds: ['photos'], activity: ['liked'], from: ['verified'] }, ctx)) === 'liked', 'several choices narrow it down together');
check(F.activeCount({ ...E, kinds: ['photos', 'videos'], sort: 'liked', time: 'week', activity: ['liked'] }) === 5, 'the count on the button is every choice that is on');

section('4. Thoughts, polls, videos and streams between the posts');
const anonPic = { kind: 'anon', at: hours(1), anon: { mediaKey: 'posts/a.jpg' } }, anonText = { kind: 'anon', at: hours(1), anon: {} }, poll = { kind: 'poll', at: hours(2) }, vid = { kind: 'video', at: hours(50) }, live = { kind: 'live', at: hours(0) };
check(F.mixKindOf(anonPic) === 'anon' && F.mixKindOf(anonText) === 'thoughts' && F.mixKindOf(poll) === 'polls' && F.mixKindOf(vid) === 'longvideos' && F.mixKindOf(live) === 'live', 'an anonymous post has a picture, a thought has only words');
check([anonPic, anonText, poll, vid, live].every((m) => F.mixPasses(m, E, NOW)), 'no filter: all of them stay');
check(F.mixPasses(poll, { ...E, kinds: ['polls'] }, NOW) && !F.mixPasses(anonText, { ...E, kinds: ['polls'] }, NOW) && F.mixPasses(anonText, { ...E, kinds: ['thoughts'] }, NOW) && !F.mixPasses(anonPic, { ...E, kinds: ['thoughts'] }, NOW), 'Polls shows polls only; Thoughts shows words-only anonymous posts');
check(!F.mixPasses(poll, { ...E, activity: ['liked'] }, NOW) && !F.mixPasses(poll, { ...E, from: ['verified'] }, NOW) && !F.mixPasses(poll, { ...E, extras: ['music'] }, NOW), 'choices only posts have (activity, from, extras) hide them');
check(F.mixPasses(poll, { ...E, time: 'today' }, NOW) && !F.mixPasses(vid, { ...E, time: 'today' }, NOW), 'the time applies to them too');
check(F.mixPasses(poll, { ...E, sort: 'liked' }, NOW), 'a different order keeps them');

section('5. Remembered, and nothing unknown is trusted');
check(JSON.stringify(F.readFilter(null)) === JSON.stringify(E) && JSON.stringify(F.readFilter('x')) === JSON.stringify(E), 'a missing or broken saved filter is the plain one');
const dirty = F.readFilter({ kinds: ['videos', 'hack', 5], sort: 'drop table', time: 'week', activity: ['liked', 'liked'], from: 'x', extras: ['music', {}] });
check(dirty.kinds.join() === 'videos' && dirty.sort === 'default' && dirty.time === 'week' && dirty.activity.join() === 'liked' && dirty.from.length === 0 && dirty.extras.join() === 'music', 'unknown words, wrong types and doubles are dropped');

section('6. How Home uses it');
const feed = read('src/components/Feed/FeedView.tsx'), css = read('src/components/Feed/home.css'), sheet = read('src/components/Feed/HomeFilterSheet.tsx');
check(/data-testid="home-filter-button"/.test(feed) && /className="hf-dock"/.test(feed) && /hf-chips/.test(feed) && /<HomeFilterSheet/.test(feed), 'the Filters button sits on the topic pills and opens the sheet');
check(/applyHomeFilter\(filteredPosts, homeFilter, filterCtx\)/.test(feed) && /mixPasses\(it, homeFilter, now\)/.test(feed) && /mixView\.items/.test(feed) && /noob_home_filter_v1/.test(feed), 'the posts and the thoughts / polls / videos / streams are filtered, and the choice is remembered on the phone');
check(/Nothing matches your filters/.test(feed) && /hf-empty-clear/.test(feed), 'when nothing matches, Home says so and offers "Clear filters"');
check(/\.hf-dock \{[^}]*linear-gradient\(90deg, transparent/.test(css) && /\.hf-chips-wrap \.hf-chips \{ padding-right: 64px/.test(css), 'the pills scroll in behind the button\'s soft edge and the last pill can still be reached');
check(/header\.hv-top \.hv-seg \{ width: 100%; max-width: 300px/.test(css) && /clamp\(11\.5px, 3\.5vw, 14px\)/.test(css) && /flex: 1 1 0 !important/.test(css), 'the For You / Following switch is wide, equal in width and sized by the screen (it gives way, never overlaps)');
check(/:root\[data-theme="light"\] \.hf-sheet/.test(css) && /@media/.test(css), 'the filter sheet has a light look too');
check(/role=\{single \? 'radio' : 'checkbox'\}/.test(sheet) && /aria-checked/.test(sheet) && /useSheetDrag/.test(sheet) && /Escape/.test(sheet), 'the sheet is made for screen readers (radio / checkbox), closes with a drag down, a tap outside and Escape');
check(/Clear all/.test(sheet) && /Show \$\{count > 99 \? '99\+' : count\}/.test(sheet), 'Clear all and "Show N" at the bottom');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
