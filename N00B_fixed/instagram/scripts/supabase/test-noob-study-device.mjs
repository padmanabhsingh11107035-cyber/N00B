// Tests the parts of NOOB STUDY that run on the phone and have rules worth proving: the sketch board (points, limits, history, drawing), the look-and-sound
// choices (kept safely on the device), the alarm (every tune, volume, the spoken message), the weekly-test helpers and the administrator's graph maths.
// Pure logic with small stand-ins for the canvas, sound and speech: no browser or database needed.
//
// Usage: node scripts/supabase/test-noob-study-device.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const load = (p) => import(pathToFileURL(path.resolve(p)).href);

// ---- a temporary copy where the few relative imports are spelled with file endings (and the react hook is a plain stand-in)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noob-device-'));
process.on('exit', () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* the system's temp folder is cleaned anyway */ } });
const put = (name, fix = (s) => s) => fs.writeFileSync(path.join(tmp, name), fix(fs.readFileSync(path.join('src/utils', name), 'utf8')));
put('supportSpeech.ts');   // the tutor's voice speaks through the same engine as the support call
put('studyVoice.ts');
put('studyPrefs.ts', (s) => s.replace("import { useSyncExternalStore } from 'react';", 'const useSyncExternalStore = (sub, get) => get();'));
put('studyAlarm.ts', (s) => s.replace("from './studyVoice'", "from './studyVoice.ts'"));
const fresh = (name) => import(pathToFileURL(path.join(tmp, name)).href + '?v=' + Math.random());

// ---------------------------------------------------------------------------------------------------------------- the sketch board
const K = await load('src/utils/studySketch.ts');
section('1. Sketch board: adding points');
{
  const p = [];
  check(K.addPoint(p, 10.4, 20.6, 0) && p[0][0] === 10 && p[0][1] === 21, 'a point is stored as a whole number');
  check(K.addPoint(p, 10.9, 21.2) === false && p.length === 1, 'a still hand adds nothing (a point closer than 1.6 is skipped)');
  check(K.addPoint(p, 40, 60) && p.length === 2, 'a real movement is added');
  check(K.addPoint(p, -50, 99999) && p[2][0] === 0 && p[2][1] === K.SKETCH_H, 'a point off the page is held at the edge of the page');
  check(K.addPoint(p, NaN, 3) === false && K.addPoint(p, 3, Infinity) === false && p.length === 3, 'a broken number is never added');
}
section('2. Sketch board: what comes back from the database is checked');
{
  const raw = [
    { t: 'pen', c: '#112233', w: 6, p: [[1, 2], [3, 4]] },
    { t: 'weird', c: 'red; background:url(x)', w: 'abc', p: [[5, 5]] },
    { t: 'eraser', c: '#fff', w: 500, p: [[2000, -4], ['x', 1], [7, 8]] },
    { t: 'pen', c: '#000', w: 3, p: [] },
    null, 5, { p: 'no' }
  ];
  const out = K.cleanStrokes(raw);
  check(out.length === 3, 'a stroke with no points, a missing stroke and a damaged one are dropped, the rest stay', JSON.stringify(out).slice(0, 200));
  check(out[1].t === 'pen' && out[1].c === K.INK_DARK && out[1].w === 4, 'an unknown tool becomes the pen, a bad colour becomes dark ink (never anything that could be code), a bad width becomes 4');
  check(out[2].t === 'eraser' && out[2].w === 80 && out[2].p.length === 2 && out[2].p[0][0] === K.SKETCH_W && out[2].p[0][1] === 0, 'a huge width is held to 80, a bad point is dropped and an off-page point is held at the edge');
  check(K.cleanStrokes('nope').length === 0 && K.cleanStrokes(null).length === 0, 'something that is not a list gives an empty sketch, not a crash');
  const many = Array.from({ length: K.MAX_STROKES + 50 }, () => ({ t: 'pen', c: '#000', w: 3, p: [[1, 1]] }));
  check(K.cleanStrokes(many).length === K.MAX_STROKES, 'no more than the allowed number of lines is ever loaded');
}
section('3. Sketch board: how full it is (the same limits as the database)');
{
  check(K.MAX_STROKES === 3000 && K.MAX_BYTES === 300000, 'the limits are the database limits');
  const line = (n) => ({ t: 'pen', c: '#000000', w: 3, p: Array.from({ length: n }, (_, i) => [i, i]) });
  check(K.fullness([line(10)]).state === 'ok', 'a small sketch is fine');
  check(K.fullness(Array.from({ length: 2700 }, () => line(1))).state === 'near', 'at nine tenths of the lines it warns');
  check(K.fullness(Array.from({ length: 3000 }, () => line(1))).state === 'full', 'at the limit it is full');
  check(K.fullness([line(30000)]).state === 'full', 'a sketch too big in size is full even with one line');
  check(K.strokeBytes([line(5)]) === JSON.stringify([line(5)]).length, 'size is measured the way the database measures it');
}
section('4. Sketch board: undo and redo');
{
  const h = K.newHistory();
  const a = [], b = [{ t: 'pen', c: '#000', w: 3, p: [[1, 1]] }], c = [b[0], { t: 'pen', c: '#000', w: 3, p: [[2, 2]] }];
  K.pushHistory(h, a);                 // a -> b
  K.pushHistory(h, b);                 // b -> c
  check(K.undo(h, c) === b && K.undo(h, b) === a && K.undo(h, a) === null, 'undo goes back one step at a time and stops at the start');
  check(K.redo(h, a) === b && K.redo(h, b) === c && K.redo(h, c) === null, 'redo goes forward again and stops at the end');
  K.undo(h, c);
  K.pushHistory(h, b);
  check(h.future.length === 0, 'drawing something new after an undo clears what could be redone');
  const h2 = K.newHistory();
  for (let i = 0; i < K.MAX_HISTORY + 30; i++) K.pushHistory(h2, [{ t: 'pen', c: '#000', w: 3, p: [[i, i]] }]);
  check(h2.past.length === K.MAX_HISTORY, 'the history keeps the last ' + K.MAX_HISTORY + ' steps, so memory never grows without end');
}
section('5. Sketch board: pens, ink and paper');
{
  check(K.defaultInk('white') === K.INK_DARK && K.defaultInk('dark') === K.INK_LIGHT, 'dark ink on light paper, light ink on dark paper');
  check(K.inkFor(K.INK_DARK, 'dark') === K.INK_LIGHT && K.inkFor(K.INK_LIGHT, 'grid') === K.INK_DARK && K.inkFor('#d93a3a', 'dark') === '#d93a3a', 'changing paper changes only the plain ink; a colour the student picked stays');
  check(K.isPaper('grid') && K.isPaper('dark') && !K.isPaper('gold') && !K.isPaper(null), 'only the known papers are accepted');
  check(K.PAPERS.length === 2 && K.PAPERS[0].id === 'white' && K.PAPERS[1].id === 'dark', 'two boards to choose: white and black');
  check(K.normalizePaper('dark') === 'dark' && K.normalizePaper('white') === 'white' && K.normalizePaper('grid') === 'white' && K.normalizePaper('lined') === 'white' && K.normalizePaper(null) === 'white', 'a sketch saved on squared or lined paper opens on the white board');
  check(K.paperToWire('white') === 'light' && K.paperToWire('dark') === 'dark' && K.paperToWire('grid') === 'light' && K.normalizePaper('light') === 'white' && K.normalizePaper('lines') === 'white', 'the boards are saved under the names the database uses (light, dark) and read back as white and black');
  check(K.PEN_COLORS.length === 12 && new Set(K.PEN_COLORS).size === 12 && K.COLOR_NAMES.length === 12 && new Set(K.COLOR_NAMES).size === 12, 'twelve different colours, each with its own name');
  check(K.PEN_COLORS.includes(K.INK_DARK) && K.PEN_COLORS.includes(K.INK_LIGHT) && K.PEN_COLORS.includes(K.HIGHLIGHT_YELLOW), 'black, white and yellow are among them');
  check(K.PEN_WIDTHS.length === 4, 'four widths');
  check(K.PEN_COLORS.every((c) => /^#[0-9a-f]{6}$/i.test(c)), 'every pen colour is a plain colour code');
  const g = K.paperCss('grid'), l = K.paperCss('lined'), w = K.paperCss('white'), d = K.paperCss('dark');
  check(g.backgroundImage && g.backgroundSize === '4% 3.2%' && l.backgroundSize === '100% 4%' && !w.backgroundImage && w.backgroundColor === '#ffffff' && d.backgroundColor === '#000000', 'the white board is white, the black board is black, and old squared and lined paper still draw (in percentages, so they fit any width)');
}
section('6. Sketch board: drawing');
const fakeCtx = () => {
  const calls = [];
  const ctx = new Proxy({ calls }, {
    get: (t, k) => (k in t ? t[k] : (...a) => { calls.push([String(k), ...a]); }),
    set: (t, k, v) => { t[k] = v; calls.push(['set:' + String(k), v]); return true; }
  });
  return ctx;
};
{
  const ctx = fakeCtx();
  K.drawStroke(ctx, { t: 'pen', c: '#ff0000', w: 6, p: [[100, 100]] }, 1);
  const names = ctx.calls.map((c) => c[0]);
  check(names.includes('moveTo') && names.includes('lineTo') && names.includes('stroke'), 'a single tap is drawn as a dot');
  check(ctx.globalCompositeOperation === 'source-over' && ctx.strokeStyle === '#ff0000' && ctx.lineWidth === 6 && ctx.lineCap === 'round', 'a pen draws on top, in its colour and width, with round ends');
  const e = fakeCtx();
  K.drawStroke(e, { t: 'eraser', c: '#ff0000', w: 10, p: [[1, 1], [50, 50]] }, 1);
  check(e.globalCompositeOperation === 'destination-out' && Math.abs(e.lineWidth - 10 * K.ERASER_FACTOR) < 1e-9, 'the eraser really removes what is under it, and is wider than the pen');
  const s = fakeCtx();
  K.drawStroke(s, { t: 'pen', c: '#000', w: 4, p: [[0, 0], [10, 10], [20, 10], [30, 30]] }, 0.5);
  check(s.lineWidth === 2 && s.calls.filter((c) => c[0] === 'quadraticCurveTo').length === 2, 'a line is drawn as smooth curves, and everything scales with the size of the canvas');
  check(s.calls.some((c) => c[0] === 'save') && s.calls.some((c) => c[0] === 'restore'), 'drawing never leaves its settings behind for the next stroke');
  const t = fakeCtx();
  K.drawTail(t, { t: 'pen', c: '#000', w: 4, p: [[0, 0], [10, 10], [20, 10]] }, 1);
  check(t.calls.filter((c) => c[0] === 'stroke').length === 1, 'while drawing, only the newest piece is drawn');
  const all = fakeCtx();
  K.drawAll(all, [{ t: 'pen', c: '#000', w: 4, p: [[0, 0], [5, 5]] }, { t: 'pen', c: '#000', w: 4, p: [[9, 9]] }], 1);
  check(all.calls[0][0] === 'clearRect' && all.calls.filter((c) => c[0] === 'stroke').length === 2, 'redrawing clears the page first and then draws every line');
  const grid = fakeCtx(); K.drawPaper(grid, 'grid', 1);
  const lined = fakeCtx(); K.drawPaper(lined, 'lined', 1);
  const plain = fakeCtx(); K.drawPaper(plain, 'white', 1);
  const dark = fakeCtx(); K.drawPaper(dark, 'dark', 1);
  check(grid.calls.filter((c) => c[0] === 'stroke').length === 24 + 31, 'squared paper has its rule lines (24 up and down, 31 across)');
  check(lined.calls.filter((c) => c[0] === 'stroke').length === 24 && plain.calls.filter((c) => c[0] === 'stroke').length === 0, 'lined paper has 24 lines, plain paper none');
  check(dark.calls.some((c) => c[0] === 'fillRect') && dark.fillStyle === '#000000', 'the black board is filled black in the saved picture');
}

// ---------------------------------------------------------------------------------------------------------------- looks and sounds
section('6b. Sketch board: pen, sketch pen, highlighter and eraser');
{
  const pen = K.newStroke('pen', '#e53935', 6), sk = K.newStroke('sketch', '#e53935', 6), hl = K.newStroke('highlighter', '#fdd835', 6), er = K.newStroke('eraser', '#000000', 6);
  check(pen.t === 'pen' && pen.m === undefined && sk.t === 'pen' && sk.m === 's' && hl.t === 'pen' && hl.m === 'h' && er.t === 'eraser' && er.m === undefined, 'each tool makes its own kind of line; to the database every pen line is a "pen" and the eraser is an "eraser"');
  check(K.toolOf(pen) === 'pen' && K.toolOf(sk) === 'sketch' && K.toolOf(hl) === 'highlighter' && K.toolOf(er) === 'eraser', 'a saved line knows which tool made it');
  check(K.strokeWidth(pen) === 6 && K.strokeWidth(sk) === 12 && K.strokeWidth(hl) === 24 && Math.abs(K.strokeWidth(er) - 6 * K.ERASER_FACTOR) < 1e-9, 'a sketch pen is twice as thick as a pen, a highlighter four times, the eraser wider still');
  check(K.isTranslucent(hl) && !K.isTranslucent(pen) && !K.isTranslucent(sk) && !K.isTranslucent(er), 'only the highlighter is see-through');
  const hctx = fakeCtx(); K.drawStroke(hctx, { ...hl, p: [[10, 10], [50, 50], [90, 20]] }, 1);
  check(hctx.globalAlpha === K.HIGHLIGHT_ALPHA && hctx.globalCompositeOperation === 'source-over' && hctx.lineWidth === 24 && hctx.strokeStyle === '#fdd835', 'a highlighter draws wide, in its colour, and lets what is under it show through');
  const sctx = fakeCtx(); K.drawStroke(sctx, { ...sk, p: [[10, 10], [50, 50]] }, 1);
  check(sctx.globalAlpha === 1 && sctx.lineWidth === 12 && sctx.lineCap === 'round', 'a sketch pen is solid, thick and round-tipped');
  const octx = fakeCtx(); K.drawStroke(octx, { ...er, p: [[10, 10], [50, 50]] }, 1);
  check(octx.globalAlpha === 1 && octx.globalCompositeOperation === 'destination-out', 'the eraser is never see-through: it removes what is under it completely');
  const back = K.cleanStrokes(JSON.parse(JSON.stringify([{ ...hl, p: [[1, 1], [9, 9]] }, { ...sk, p: [[2, 2]] }, { ...pen, p: [[3, 3]] }, { ...er, m: 'h', p: [[4, 4]] }, { t: 'pen', c: '#000', w: 3, m: 'x', p: [[5, 5]] }])));
  check(back[0].m === 'h' && back[1].m === 's' && back[2].m === undefined && back[3].m === undefined && back[4].m === undefined, 'a saved sketch keeps which pen drew each line; an eraser can not be a highlighter and an unknown kind becomes a pen');
  check(K.cleanStrokes([{ t: 'pen', c: '#000', w: 3, p: [[1, 1]] }])[0].m === undefined, 'a sketch saved before these pens existed draws as plain pens');
  check(JSON.stringify([{ ...hl, p: [[1, 1]] }]).includes('"m":"h"') && JSON.stringify([{ ...pen, p: [[1, 1]] }]).includes('"m"') === false, 'a plain pen line costs no extra space in the saved sketch');
}

section('7. Looks and sounds: kept safely on this phone');
{
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); }, removeItem: (k) => { store.delete(k); } };
  const P = await fresh('studyPrefs.ts');
  const d = P.loadPrefs();
  check(d.theme === 'dark' && d.chat === 'calm' && d.alarm.sound === 'bell' && d.alarm.speak === true && d.aiVoice.name === null, 'with nothing saved, the usual choices are used');
  let ticks = 0; // a screen is told when a choice changes
  const next = P.savePrefs({ theme: 'dark', chat: 'ocean' });
  check(next.theme === 'dark' && next.chat === 'ocean' && JSON.parse(store.get('noob.study.prefs.v1')).theme === 'dark', 'a choice is applied at once and saved on the phone');
  P.savePrefs((p) => ({ alarm: { ...p.alarm, sound: 'chime', volume: 0.2 } }));
  check(P.loadPrefs().alarm.sound === 'chime' && P.loadPrefs().alarm.volume === 0.2 && P.loadPrefs().theme === 'dark', 'changing one thing keeps the others');
  const bad = P.cleanPrefs({ theme: 'neon', chat: 'x', aiVoice: { name: 123, rate: 99, pitch: -4 }, studyVoice: { name: 'A'.repeat(500), rate: 'fast' }, alarm: { sound: 'siren', volume: 7, speak: 'yes', voice: null } });
  check(bad.theme === 'dark' && bad.chat === 'calm', 'an unknown colour mode or chat theme becomes the usual one');
  check(bad.aiVoice.name === null && bad.aiVoice.rate === 1.6 && bad.aiVoice.pitch === 0.6, 'a voice speed or pitch outside the range is held at its limit; a name that is not text is ignored');
  check(bad.studyVoice.name === null && bad.studyVoice.rate === 0.9, 'a voice name that is far too long is ignored; a speed that is not a number is the usual one');
  check(bad.alarm.sound === 'bell' && bad.alarm.volume === 1 && bad.alarm.speak === true, 'an unknown alarm sound is the bell, a volume above 100% is held at 100%, a yes/no that is not a yes/no is the usual one');
  check(JSON.stringify(P.cleanPrefs(null)) === JSON.stringify(P.DEFAULT_PREFS) && JSON.stringify(P.cleanPrefs('text')) === JSON.stringify(P.DEFAULT_PREFS), 'damaged saved data gives the usual choices, never an error');
  store.set('noob.study.prefs.v1', '{not json');
  const P2 = await fresh('studyPrefs.ts');
  check(P2.loadPrefs().theme === 'dark', 'unreadable saved data gives the usual choices');
  globalThis.localStorage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  const P3 = await fresh('studyPrefs.ts');
  check(P3.loadPrefs().theme === 'dark' && P3.savePrefs({ theme: 'light' }).theme === 'light', 'a phone that blocks storage still lets the choice work until the app is closed');
  check(P3.resetPrefs().theme === 'dark', 'reset brings back the usual choices');
  check(P.effectiveTheme({ theme: 'light' }, true) === 'light' && P.effectiveTheme({ theme: 'dark' }, false) === 'dark' && P.effectiveTheme({ theme: 'system' }, true) === 'dark' && P.effectiveTheme({ theme: 'system' }, false) === 'light', '"like my phone" follows the phone; a chosen mode does not');
  check(P.CHAT_THEMES.length === 6 && P.CHAT_THEMES.every((c) => /^#[0-9a-f]{6}$/i.test(c.accent)) && P.ALARM_SOUNDS.length === 5, 'six chat themes and five alarm sounds');
  void ticks;
}

// ---------------------------------------------------------------------------------------------------------------- the alarm
section('8. Alarm: every tune');
const A = await fresh('studyAlarm.ts');
{
  const ids = ['bell', 'chime', 'beep', 'soft', 'digital'];
  check(ids.every((i) => Array.isArray(A.TUNES[i]) && A.TUNES[i].length > 0), 'all five tunes exist');
  check(ids.every((i) => A.TUNES[i].every((n) => n.f >= 200 && n.f <= 3000 && n.at >= 0 && n.len > 0.05)), 'every note is a pitch a phone can play, with a real length');
  check(ids.every((i) => A.tuneLength(i) > 0.5 && A.tuneLength(i) < 4), 'every tune is between half a second and four seconds, long enough to notice and short enough not to annoy');
}
section('9. Alarm: sound and a spoken message');
{
  const made = { osc: 0, gain: 0, started: 0, stopped: 0, ramps: [] };
  class FakeParam { setValueAtTime() {} exponentialRampToValueAtTime(v) { made.ramps.push(v); } }
  class FakeNode { constructor() { this.gain = new FakeParam(); this.frequency = {}; } connect() {} start() { made.started++; } stop() { made.stopped++; } }
  class FakeAudio { constructor() { this.currentTime = 0; this.state = 'running'; this.destination = {}; } createOscillator() { made.osc++; return new FakeNode(); } createGain() { made.gain++; return new FakeNode(); } resume() {} }
  globalThis.window = globalThis;
  globalThis.AudioContext = FakeAudio;
  const secs = A.playTune('bell', 0.7);
  check(made.osc === A.TUNES.bell.length && made.started === made.osc && made.stopped === made.osc, 'one note is played for each note of the tune, and each one is stopped');
  check(Math.abs(secs - A.tuneLength('bell')) < 1e-9, 'it says how long the tune lasts');
  check(made.ramps.every((v) => v > 0), 'volumes never reach zero exactly (that would make the sound engine throw)');
  made.ramps.length = 0;
  A.playTune('beep', 0);
  check(made.ramps.every((v) => v > 0 && v < 0.001 || v === 0.0001), 'at zero volume it is silent but still safe');
  made.ramps.length = 0;
  A.playTune('bell', 5);
  check(Math.max(...made.ramps) <= 0.6, 'a volume above 100% is held at 100% (it can not be louder than the phone allows)');
  delete globalThis.AudioContext;
  check(A.playTune('bell', 0.7) === 0, 'a phone with no sound engine stays quiet without an error');

  // speech
  const spoken = [];
  globalThis.AudioContext = FakeAudio;
  globalThis.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
  globalThis.speechSynthesis = { speak: (u) => { spoken.push(u); }, cancel: () => {}, getVoices: () => [{ name: 'Asha', lang: 'en-IN', localService: true }] };
  const timers = [];
  const realSet = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
  A.ringAlarm({ alarm: { sound: 'chime', volume: 0.5, speak: true, voice: { name: 'Asha', rate: 1.1, pitch: 1.2 } } }, 'Time is up. Well done!', 'en-IN');
  check(timers.length === 1 && Math.abs(timers[0].ms - (Math.round(A.tuneLength('chime') * 1000) + 200)) <= 1, 'the message is spoken after the tune has finished');
  timers[0].fn();
  check(spoken.length >= 1 && spoken[0].text.includes('Time is up') && spoken[0].rate === 1.1 && spoken[0].pitch === 1.2 && spoken[0].voice?.name === 'Asha', 'it speaks the message in the chosen voice, speed and pitch');
  timers.length = 0; spoken.length = 0;
  A.ringAlarm({ alarm: { sound: 'chime', volume: 0.5, speak: false, voice: { name: null, rate: 1, pitch: 1 } } }, 'Time is up.', 'en-IN');
  check(timers.length === 0, 'with the spoken message switched off, only the tune plays');
  A.ringAlarm({ alarm: { sound: 'chime', volume: 0.5, speak: true, voice: { name: null, rate: 1, pitch: 1 } } }, '', 'en-IN');
  check(timers.length === 0, 'no message, nothing to say');
  globalThis.setTimeout = realSet;
  delete globalThis.speechSynthesis; delete globalThis.SpeechSynthesisUtterance;
  const t2 = []; globalThis.setTimeout = (fn, ms) => { t2.push(ms); return 1; };
  A.ringAlarm({ alarm: { sound: 'bell', volume: 0.5, speak: true, voice: { name: null, rate: 1, pitch: 1 } } }, 'Hello', 'en-IN');
  check(t2.length === 0, 'a phone that can not speak just plays the tune');
  globalThis.setTimeout = realSet;
  delete globalThis.AudioContext; delete globalThis.window;
}

// ---------------------------------------------------------------------------------------------------------------- weekly-test helpers
section('10. Weekly tests: times, messages and the answers kept while taking a test');
{
  const T = await load('src/components/Study/pages/testsCommon.ts');
  const w = T.fmtWhen('2026-10-14T13:12:00Z', 'Asia/Kolkata');
  check(/Wed/.test(w) && /14/.test(w) && /Oct/.test(w) && /2026/.test(w) && /6:42\s?(pm|PM)/i.test(w), 'a test time is shown in the student\'s own time zone: ' + w);
  check(/1:12\s?(pm|PM)/i.test(T.fmtWhen('2026-10-14T13:12:00Z', 'UTC')), 'the same moment in another zone shows the other time');
  check(T.fmtWhen('2026-10-14T13:12:00Z', 'Not/AZone').length > 0 && T.fmtWhen('garbage') === '' && T.fmtWhen(null) === '', 'an unknown zone falls back to the phone\'s; a broken date shows nothing');
  check(T.testMessage(95) !== T.testMessage(75) && T.testMessage(75) !== T.testMessage(55) && T.testMessage(55) !== T.testMessage(10), 'there is a different, kind line for each band of marks');
  check(!/fail|bad|poor|stupid/i.test([95, 75, 55, 10].map(T.testMessage).join(' ')), 'none of the lines is unkind');
  const ss = new Map();
  globalThis.localStorage = { getItem: (k) => (ss.has(k) ? ss.get(k) : null), setItem: (k, v) => { ss.set(k, String(v)); }, removeItem: (k) => { ss.delete(k); } };
  check(T.loadDraft('t1', 3).join() === ',,' && T.loadDraft('t1', 3).every((x) => x === null), 'a new test starts with no answers');
  T.saveDraft('t1', [2, null, 0]);
  check(T.loadDraft('t1', 3).join('|') === '2||0', 'answers are kept while the test is open, so a refresh does not lose them');
  check(T.loadDraft('t1', 5).every((x) => x === null), 'saved answers for a different number of questions are not used');
  ss.set('noob.study.test.t2', JSON.stringify([9, 'x', -1, 1.5]));
  check(T.loadDraft('t2', 4).every((x) => x === null), 'nonsense saved answers become "not answered"');
  T.clearDraft('t1');
  check(T.loadDraft('t1', 3).every((x) => x === null), 'handing in clears the saved answers');
  globalThis.localStorage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } };
  check(T.loadDraft('t1', 2).length === 2 && (T.saveDraft('t1', [1, 1]), true) && (T.clearDraft('t1'), true), 'a phone that blocks storage never breaks the test');
}

// ---------------------------------------------------------------------------------------------------------------- the administrator's graph maths
section('11. Administrator graphs: totals, trend and the spreadsheet file');
{
  const M = await load('src/utils/adminAnalyticsMath.ts');
  const day = (n, i) => ({ d: `2026-10-${String(i + 1).padStart(2, '0')}`, n });
  check(M.sumSeries([day(2, 0), day(3, 1), day(5, 2)]) === 10 && M.sumSeries([]) === 0 && M.sumSeries([{ d: 'x', n: 'junk' }]) === 0, 'a series adds up; nothing or junk adds up to zero');
  const up = [1, 1, 1, 1, 4, 4, 4, 4].map(day.bind(null)).map((p, i) => ({ d: p.d, n: [1, 1, 1, 1, 4, 4, 4, 4][i] }));
  check(M.trend(up) === 300, 'the trend compares the second half with the first (1+1+1+1 then 4+4+4+4 is up 300%)');
  check(M.trend([4, 4, 1, 1].map(day)) === -75 && M.trend([2, 2, 2, 2].map(day)) === 0, 'it can fall, and it can stay the same');
  check(M.trend([0, 0, 3, 3].map(day)) === null && M.trend([0, 0, 0, 0].map(day)) === 0 && M.trend([1, 2].map(day)) === null, 'from nothing to something there is no percentage; too few days has no trend');
  const o = { days: 3, generatedAt: '', totals: {}, breakdowns: {}, series: {
    users: [day(1, 0), day(2, 1), day(3, 2)], posts: [day(0, 0), day(0, 1), day(7, 2)], reels: [], stories: [], messages: [], comments: [], orders: [], games: [], reports: [], signIns: [], active: []
  } };
  const csv = M.toCsv(o).split('\n');
  check(csv[0].startsWith('date,users,posts,reels') && csv.length === 4 && csv[1].startsWith('2026-10-01,1,0') && csv[3].startsWith('2026-10-03,3,7'), 'the file has a header and one row for each day, and a missing day counts as 0');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
