// Songs attached to posts and reels play by themselves, with sound (src/utils/songSound.ts, PostCard, ReelsView).
//
// The bug: a song attached to a post only played after tapping its little tag, and a reel never played its song at all (only its name was shown).
// This test plays a phone's rules against the real code: a fake media element that refuses sound outside a real tap, keeps its permission when its
// source changes, and pauses if it is un-muted outside a real tap.
//
// Usage: node scripts/supabase/test-song-autoplay.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- the phone
const phone = { inTap: false };
const notAllowed = () => Promise.reject(Object.assign(new Error('x'), { name: 'NotAllowedError' }));
class FakeVideo {
  constructor() { this.m = false; this.paused = true; this.unlocked = false; this._src = ''; this.attrs = {}; this.style = {}; this.loop = false; this.currentTime = 0; this.plays = 0; }
  get muted() { return this.m; }
  set muted(v) {
    if (this.m && !v && !this.paused && !this.unlocked && !phone.inTap) this.paused = true; // un-muting a silent autoplay outside a real tap pauses it
    this.m = v;
  }
  get src() { return this._src; }
  set src(v) { this._src = v; this.paused = true; this.currentTime = 0; }          // a new source stops it but keeps the element's permission
  setAttribute(k, v) { this.attrs[k] = v; }
  removeAttribute(k) { if (k === 'src') { this._src = ''; this.paused = true; } delete this.attrs[k]; }
  load() {}
  pause() { this.paused = true; }
  play() {
    this.plays++;
    if (!this._src) return Promise.reject(Object.assign(new Error('no source'), { name: 'NotSupportedError' }));
    if (!this.m && !this.unlocked && !phone.inTap) return notAllowed();
    if (!this.m && phone.inTap) this.unlocked = true;                               // the permission is given to this element
    this.paused = false;
    return Promise.resolve();
  }
  get heard() { return !this.paused && !this.m; }
}

let handlers = {};
let bodyChildren = [];
const fire = async (name) => {
  phone.inTap = ['touchend', 'pointerup', 'mousedown', 'click', 'keydown'].includes(name);
  try { for (const f of [...(handlers[name] || [])]) f(); } finally { phone.inTap = false; }
  await wait(10);
};
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
const fresh = async () => {
  handlers = {}; bodyChildren = []; store.clear();
  globalThis.document = {
    hidden: false,
    createElement: () => new FakeVideo(),
    body: { appendChild: (el) => bodyChildren.push(el) },
    addEventListener: (n, f) => { (handlers[n] ||= new Set()).add(f); },
    removeEventListener: (n, f) => { handlers[n]?.delete(f); }
  };
  const S = await import(pathToFileURL(path.resolve('src/utils/songSound.ts')).href + '?' + Math.random());
  S.resetSongSound();
  return S;
};
const player = () => bodyChildren[0];
const settle = () => wait(220);                // the coordinator waits ~120 ms so a quick scroll doesn't start every song it passes

section('1. Which post plays');
{
  const S = await fresh();
  const P = S.pickActive;
  check(P([['a', 0.9], ['b', 0.1]], null) === 'a', 'the post that fills the screen plays');
  check(P([['a', 0.3], ['b', 0.4]], null) === null, 'no post fills enough of the screen: nothing plays');
  check(P([['a', 0.6], ['b', 0.9]], 'a') === 'b', 'when the next post clearly takes over, its song takes over');
  check(P([['a', 0.6], ['b', 0.7]], 'a') === 'a', 'two posts about equally on screen: the playing one is kept (no flicker)');
  check(P([['a', 0.45], ['b', 0.3]], 'a') === 'a', 'the playing post keeps its song while it is still mostly there');
  check(P([['a', 0.3]], 'a') === null, 'it stops once the post has mostly gone');
  check(P([], null) === null && P([['a', 0]], null) === null, 'an empty page plays nothing');
}

section('2. A song post comes on screen, the phone has not allowed sound yet');
{
  const S = await fresh();
  S.reportSongVisibility('a', '/media/songs/a.mp3', 0.9);
  await settle();
  const v = player();
  const view = S.getFeedSongView();
  check(!!v && v.src === '/media/songs/a.mp3' && !v.paused, 'the song starts by itself (silently, because the phone refuses sound until a tap)');
  check(view.activeId === 'a' && view.blocked === true && view.soundOn === true, '"Tap for sound" is shown for that post');
  await fire('touchend');
  check(v.heard && S.getFeedSongView().blocked === false, 'the next real tap anywhere switches the sound on, and the song keeps playing');
  check(v.unlocked, 'the element now has the permission');
}

section('3. Scrolling to the next song post');
{
  const S = await fresh();
  S.reportSongVisibility('a', '/media/a.mp3', 0.9);
  await settle();
  await fire('click');
  const v = player();
  S.reportSongVisibility('a', '/media/a.mp3', 0.2);
  S.reportSongVisibility('b', '/media/b.mp3', 0.9);
  await settle();
  check(S.getFeedSongView().activeId === 'b' && v.src === '/media/b.mp3', 'the next post\'s song takes over');
  check(v.heard && S.getFeedSongView().blocked === false, 'with sound straight away, no new tap needed (the same element is reused)');
  S.reportSongVisibility('b', '/media/b.mp3', 0.1);
  await settle();
  check(S.getFeedSongView().activeId === null && v.paused, 'no post on screen: the song pauses');
  S.reportSongVisibility('b', '/media/b.mp3', 0.95);
  await settle();
  check(v.heard && S.getFeedSongView().activeId === 'b', 'coming back to it plays it again');
}

section('4. A quick scroll does not start every song it passes');
{
  const S = await fresh();
  S.reportSongVisibility('a', '/media/a.mp3', 0.9);
  S.reportSongVisibility('a', '/media/a.mp3', 0.1);
  S.reportSongVisibility('b', '/media/b.mp3', 0.9);
  S.reportSongVisibility('b', '/media/b.mp3', 0.1);
  S.reportSongVisibility('c', '/media/c.mp3', 0.95);
  await settle();
  check(player().src === '/media/c.mp3' && player().plays <= 3, 'only the post where the scroll stopped plays', String(player().plays));
}

section('5. A post leaves the page');
{
  const S = await fresh();
  S.reportSongVisibility('a', '/media/a.mp3', 0.9);
  await settle();
  S.forgetSong('a');
  check(S.getFeedSongView().activeId === null && player().paused, 'when the playing post goes away (the Feed closes), its song stops at once');
  check((handlers.touchend?.size || 0) === 0, 'and the tap listener is removed');
}

section('6. Quiet while something else makes sound');
{
  const S = await fresh();
  S.reportSongVisibility('a', '/media/a.mp3', 0.9);
  await settle();
  await fire('click');
  const v = player();
  const release = S.holdSongs();
  check(v.paused && S.getFeedSongView().activeId === null, 'a story / the full video page / the Music player opening pauses the song');
  S.reportSongVisibility('a', '/media/a.mp3', 0.9);
  await settle();
  check(v.paused, 'and it stays quiet while they play');
  release();
  await settle();
  check(v.heard && v.src === '/media/a.mp3', 'it comes back when they close');
  const r2 = S.holdSongs(); r2(); r2();
  check(S.songsHeld() === false, 'releasing twice is harmless');
}

section('7. The speaker button');
{
  const S = await fresh();
  S.reportSongVisibility('a', '/media/a.mp3', 0.9);
  await settle();
  await fire('click');
  const v = player();
  await wait(750);                // (a later tap, not the one that switched the sound on: see section 8)
  await fire('click');            // a real tap on the button: the tap listener runs first, then the button's own click
  const on = S.toggleFeedSound();
  check(on === false && v.muted && !v.paused, 'tapping the speaker turns the song\'s sound off (it keeps playing silently)');
  check(store.get('noob_song_sound') === 'off', 'the choice is kept on the device');
  S.reportSongVisibility('a', '/media/a.mp3', 0.2);
  S.reportSongVisibility('b', '/media/b.mp3', 0.9);
  await settle();
  check(v.muted && S.getFeedSongView().blocked === false, 'the next songs also start silent, without asking for a tap');
  phone.inTap = true;
  const on2 = S.toggleFeedSound();
  phone.inTap = false;
  await wait(10);
  check(on2 === true && v.heard && store.get('noob_song_sound') === 'on', 'tapping it again turns the sound back on');
}

section('8. The tap that switches the sound on must not also switch it off');
{
  const S = await fresh();
  S.reportSongVisibility('a', '/media/a.mp3', 0.9);
  await settle();
  const v = player();
  phone.inTap = true;
  handlers.touchend && [...handlers.touchend].forEach((f) => f());   // the page-wide tap listener switches the sound on ...
  S.toggleFeedSound();                                               // ... and the speaker button's own click arrives right after
  phone.inTap = false;
  await wait(10);
  check(v.heard && S.getFeedSongView().soundOn === true, 'sound is on, not toggled straight back off');
}

section('9. The first tap anywhere wakes the element up (iPhone), so songs can start with sound by themselves');
{
  const S = await fresh();
  S.armSongPlayer();
  check(!player(), 'nothing is created until the first tap');
  await fire('touchend');
  check(!!player() && player().unlocked && player().paused, 'the first real tap plays a silent clip through the element and the element keeps the permission');
  check(!player().src, 'and leaves it empty');
  S.reportSongVisibility('a', '/media/a.mp3', 0.9);
  await settle();
  check(player().heard && S.getFeedSongView().blocked === false, 'so the first song post plays WITH sound without any further tap');
  const S2 = await fresh();
  S2.reportSongVisibility('a', '/media/a.mp3', 0.9);
  await settle();
  check(S2.getFeedSongView().blocked === true, 'without that tap the phone asks for one ("Tap for sound")');
  await fire('touchend'); await fire('touchend');
  const S3 = await fresh();
  S3.armSongPlayer();
  S3.reportSongVisibility('a', '/media/a.mp3', 0.9);
  await settle();
  await fire('touchend');
  check(player().src === '/media/a.mp3' && player().heard, 'a tap while a song is already loaded does not wipe it');
}

section('10. App in the background');
{
  const S = await fresh();
  S.reportSongVisibility('a', '/media/a.mp3', 0.9);
  await settle();
  await fire('click');
  const v = player();
  globalThis.document.hidden = true;
  await fire('visibilitychange');
  check(v.paused, 'leaving the app pauses the song');
  globalThis.document.hidden = false;
  await fire('visibilitychange');
  check(v.heard, 'coming back resumes it');
}

section('11. The reels page');
{
  const S = await fresh();
  const reelAudio = await import(pathToFileURL(path.resolve('src/utils/reelAudio.ts')).href);
  const video = new FakeVideo();
  video.src = '/media/reel.mp4';
  const song = S.loadSong('/media/songs/r.mp3');
  const rv = await reelAudio.playReel(video, false);
  const rs = await reelAudio.playReel(song, true);
  check(rv === 'silent' && video.muted && !video.paused, 'the picture plays silently');
  check(rs === 'silent' && song.src === '/media/songs/r.mp3' && !song.paused, 'the song plays in its place (silently until a tap on a phone that refuses)');
  phone.inTap = true;
  const on = await reelAudio.unmuteInTap(S.getSongPlayer());
  phone.inTap = false;
  check(on && song.heard && video.muted, 'a tap switches the SONG on while the picture stays silent');
  song.currentTime = 12;
  S.loadSong('/media/songs/r.mp3', true);
  check(song.currentTime === 0, 'when the reel loops, its song starts over');
  S.loadSong('/media/songs/next.mp3');
  check(song.src === '/media/songs/next.mp3' && song.unlocked, 'the next reel\'s song loads into the same element, which keeps its permission');
  S.stopSong();
  check(song.paused && !song.src && S.loadedSong() === '', 'leaving the reels stops the song');
  S.loadSong('/media/songs/x.mp3'); S.loadSong('/media/songs/x.mp3');
  check(S.loadedSong() === '/media/songs/x.mp3', 'loading the same song twice does not restart it');
}

section('12. The preference');
{
  const S = await fresh();
  check(S.getSongSoundPreference() === true, 'sound is on until the person turns it off');
  S.setSongSoundPreference(false);
  check(S.getSongSoundPreference() === false, 'a choice to turn it off is remembered');
  S.setSongSoundPreference(true);
  check(S.getSongSoundPreference() === true, 'and turning it back on');
}

section('13. Wired into the screens');
{
  const post = read('src/components/Feed/PostCard.tsx');
  const reels = read('src/components/Reels/ReelsView.tsx');
  const feed = read('src/components/Feed/FeedView.tsx');
  const story = read('src/components/Stories/StoryViewerModal.tsx');
  const app = read('src/App.tsx');
  const api = read('src/services/supabaseApi.ts');
  check(/reportSongVisibility\(post\.id, songUrl,/.test(post) && /forgetSong\(post\.id\)/.test(post), 'every post with a song tells the player how much of it is on screen, and leaves when it goes');
  check(!/new Audio\(/.test(post), 'a post no longer needs a tap on its tag to start (no per-post audio, the shared player plays)');
  check(/data-testid="post-sound-button"/.test(post) && /data-testid="post-tap-for-sound"/.test(post) && /data-testid="post-song-tag"/.test(post), 'speaker button, "Tap for sound" hint and the song tag are on the post');
  check(/onDoubleClick=\{\(e\) => e\.stopPropagation\(\)\}/.test(post), 'double-tapping the speaker does not like the post');
  check(/holdSongs\(\)/.test(post) && /onVolumeChange/.test(post), 'a post\'s own video being un-muted silences its song');
  check(/useSyncExternalStore\(subscribeFeedSong, getFeedSongView, getFeedSongView\)/.test(post), 'the post shows live state of the song player');
  check(/audioTrack\?\.audioUrl/.test(reels) && /loadSong\(songUrl\)/.test(reels) && /playReel\(song, soundWantedRef\.current\)/.test(reels), 'a reel plays the song attached to it');
  check(/playReel\(video, false\)/.test(reels), '... while its picture plays silently');
  check(/songUrlRef\.current \? getSongPlayer\(\) : videoRef\.current/.test(reels) && /songUrlRef\.current \? getSongPlayer\(\) : video;/.test(reels), 'the tap for sound and the speaker button control the song of a song reel');
  check(/addEventListener\('timeupdate', onTime\)/.test(reels) && /loadSong\(songUrlRef\.current, true\)/.test(reels), 'the song starts over each time the video loops');
  check(/result === 'failed'[\s\S]{0,160}startVideoSound/.test(reels), 'a song that cannot be played falls back to the video\'s own sound');
  check(/stopSong\(\);\s*\n\s*video\.removeEventListener\('waiting'/.test(reels), 'leaving the reels stops the song');
  check(/holdSongs\(\)/.test(feed) && /musicPlaying/.test(feed) && /watchVideoPost/.test(feed), 'the Feed songs stay quiet during the full video page and the Music player');
  check(/useEffect\(\(\) => holdSongs\(\), \[\]\)/.test(story), 'and while a story is open');
  check(/armSongPlayer\(\)/.test(app), 'the first tap in the app wakes the song player up');
  check(/audioTrack: mapAudioTrack\(p\.audioTrack\)/.test(api) && /audioTrack: mapAudioTrack\(r\.audioTrack\)/.test(api), 'posts and reels: the song address works inside the Android app');
  check(/p_audio: storedAudioTrack\(postData\.audioTrack\)/.test(api) && /p_audio: storedAudioTrack\(reelData\.audioTrack\)/.test(api), 'a new post / reel saves the song address without the website\'s name in it');
  const song = read('src/utils/songSound.ts');
  check(!/data:audio|data:video/.test(song), 'the silent clip is a blob: address (a data: address is refused by the page\'s security rules)');
  check(/media-src 'self' blob: https:/.test(read('public/_headers')), 'the security rules allow blob: and https: media');
  check(!/\(\?<[=!]/.test(song), 'no regex look-behind');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
