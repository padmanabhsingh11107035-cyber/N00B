// Reels sound (src/utils/reelAudio.ts and src/components/Reels/ReelsView.tsx).
//
// The bug: on a phone every reel played silently until the person paused and tapped again. Cause: the sound was only ever asked for inside
// pointerdown / touchstart (which a phone does NOT accept as a real tap) and every reel was a new <video> that needed its own permission.
// This test plays the phone's rules against the real code: a fake video that refuses sound outside a real tap, pauses if it is un-muted outside a
// real tap, and keeps its permission when its source changes (like a real element does).
//
// Usage: node scripts/supabase/test-reels-audio.mjs
import fs from 'node:fs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');

const A = await import('../../src/utils/reelAudio.ts');
const view = read('src/components/Reels/ReelsView.tsx');
const src = read('src/utils/reelAudio.ts');

// A video element that follows the phone's rules.
class FakeVideo {
  constructor() { this.m = false; this.playing = false; this.unlocked = false; this.inTap = false; this.src = ''; this.plays = 0; this.refuseAll = false; }
  get muted() { return this.m; }
  set muted(v) {
    if (this.m && !v && this.playing && !this.unlocked && !this.inTap) this.playing = false; // un-muting a silent autoplay outside a real tap pauses it
    this.m = v;
  }
  play() {
    this.plays++;
    if (this.refuseAll) return Promise.reject(Object.assign(new Error('x'), { name: 'NotAllowedError' }));
    if (!this.m && !this.unlocked && !this.inTap) return Promise.reject(Object.assign(new Error('x'), { name: 'NotAllowedError' }));
    if (!this.m && this.inTap) this.unlocked = true; // permission is given to this element
    this.playing = true;
    return Promise.resolve();
  }
  setSrc(s) { this.src = s; this.playing = false; } // a new source keeps the element's permission
}
// a real tap: runs the code inside it, with the phone's "this is a real tap" flag on
const tap = async (v, fn) => { v.inTap = true; const r = fn(); v.inTap = false; return r; };

section('1. Which events count');
check(['touchend', 'pointerup', 'click', 'keydown'].every((e) => A.TAP_EVENTS.includes(e)), 'real taps listened to: touchend, pointerup, click, key press');
check(!A.TAP_EVENTS.includes('touchstart') && !A.TAP_EVENTS.includes('pointerdown'), 'touchstart and pointerdown are NOT used (a phone refuses sound inside them: this was the bug)');

section('2. The first reel, no tap yet (phone refuses sound)');
{
  const v = new FakeVideo();
  const r = await A.playReel(v, true);
  check(r === 'silent' && v.playing && v.muted, 'the reel still plays, silently, instead of sitting on a frozen frame', r);
  check(v.plays === 2, 'it asked for sound first, then fell back once');
}

section('3. The next real tap switches the sound on');
{
  const v = new FakeVideo();
  await A.playReel(v, true);
  const on = await tap(v, () => A.unmuteInTap(v));
  check(on === true && v.playing && !v.muted, 'a tap un-mutes it and it keeps playing');
  check(v.unlocked, 'and the element now has the permission');
}

section('4. After that every reel has sound by itself, with no tap');
{
  const v = new FakeVideo();
  await A.playReel(v, true);
  await tap(v, () => A.unmuteInTap(v));
  let all = true;
  for (let i = 0; i < 5; i++) { v.setSrc('reel' + i); const r = await A.playReel(v, true); if (!(r === 'sound' && v.playing && !v.muted)) all = false; }
  check(all, 'five reels in a row start with sound, outside any tap');
}

section('5. Why one shared element (what the old code did)');
{
  const first = new FakeVideo();
  await A.playReel(first, true);
  await tap(first, () => A.unmuteInTap(first));
  const second = new FakeVideo(); // a brand new element for the next reel, like the old code
  const r = await A.playReel(second, true);
  check(r === 'silent', 'a new element for each reel would be silent again (permission is per element)');
  check(/getReelPlayer\(\)/.test(view) && !/<video\s+key=\{currentReel\.id\}/.test(view), 'the reels page uses the one shared element, not a new <video> per reel');
}

section('6. Un-muting outside a real tap is never attempted on a silent playing reel');
{
  const v = new FakeVideo();
  await A.playReel(v, true);
  v.muted = false; // what the old code did on touchstart
  check(!v.playing, 'the phone pauses a silent reel that is un-muted outside a tap (the old "have to pause and tap again")');
  check(/onRealTap\(/.test(view) && !/addEventListener\(evt/.test(view) && !/'pointerdown'|'touchstart'/.test(view.split('Swipe (touch)')[0]), 'the page switches the sound on only from a real tap');
}

section('7. The person can mute');
{
  const v = new FakeVideo();
  const r = await A.playReel(v, false);
  check(r === 'silent' && v.muted && v.playing, 'with sound switched off the reel plays silently and nothing is asked');
  check(v.plays === 1, 'without a second attempt');
  const w = new FakeVideo(); w.refuseAll = true;
  check(await A.playReel(w, true) === 'failed', 'if the browser refuses even silent playback it says so (the broken-video path handles the rest)');
  const x = { muted: false, play: () => Promise.reject(Object.assign(new Error('x'), { name: 'AbortError' })) };
  check(await A.playReel(x, true) === 'aborted', 'a reel changed while starting is not treated as a failure');
}

section('8. Remembering the choice');
{
  const store = {};
  globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  check(A.getSoundPreference() === true, 'sound is ON by default');
  A.setSoundPreference(false);
  check(A.getSoundPreference() === false && store.noob_reels_sound === 'off', 'switching it off is remembered');
  A.setSoundPreference(true);
  check(A.getSoundPreference() === true, 'and back on');
  globalThis.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  A.setSoundPreference(false);
  check(A.getSoundPreference() === false, 'a phone that blocks storage still keeps the choice until the app is closed');
  delete globalThis.localStorage;
}

section('9. On the page');
check(/data-testid="reel-sound-button"/.test(view) && /Volume2/.test(view) && /VolumeX/.test(view), 'there is a visible sound button (there was none: nobody could turn the sound on or off)');
check(/Tap for sound/.test(view) && /data-testid="reel-tap-for-sound"/.test(view), 'while the sound is refused, "Tap for sound" says so');
check(/now - tapUnmutedAtRef\.current < 700\) return;\s*\/\/ this tap only switched the sound on/.test(view), 'the tap that switches the sound on does not also pause the reel');
check(/Date\.now\(\) - tapUnmutedAtRef\.current < 700\) return;\s*\/\/ this very tap already switched the sound on/.test(view), 'and tapping the sound button while "Tap for sound" shows does not switch it straight back off');
check(/playReel\(video, soundWantedRef\.current\)/.test(view), 'every reel (and every resume after a pause) asks for sound first');
check(!/setIsMuted|isMuted/.test(view), 'the old one-try-per-reel rescue is gone');
check(/releaseReelPlayer\(\)/.test(view), 'the player is stopped and removed when the reels page closes');
check(!/\(\?<[=!]/.test(src), 'no regex look-behind');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
