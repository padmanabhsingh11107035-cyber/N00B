// NOOB Buddy Booth (a photo with a buddy standing next to you, moving stickers as optional filters, a premium frame): the buddies and stickers drawn on a recording canvas (so a typo can
// not hide until someone opens them, and every moving one repeats exactly after one loop), the picture put together, the gestures, the camera's error words, the NOOB wordmark, and where the
// feature opens from. Nothing here needs a camera or a browser. Usage: node scripts/supabase/test-booth.mjs
import fs from 'node:fs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const count = (s, re) => (s.match(re) || []).length;

// a recording canvas: every call and every setting is written down (numbers rounded), so two drawings can be compared line by line
function recorder(prefix = '') {
  const log = [];
  let gid = 0;
  const state = { globalAlpha: 1 };
  const fmt = (v) => {
    if (typeof v === 'number') return String(Math.round(v * 1000) / 1000 + 0);
    if (typeof v === 'string') return JSON.stringify(v.replace(/-?\d+\.\d{4,}/g, (m) => String(Math.round(parseFloat(m) * 1000) / 1000 + 0)));   // numbers inside colour words are rounded too
    if (Array.isArray(v)) return `[${v.map(fmt).join(',')}]`;
    if (v && v.__rec) return `<${v.__rec}>`;
    if (v && typeof v === 'object') return '<obj>';
    return String(v);
  };
  const grad = () => { const id = ++gid; return new Proxy({ __rec: 'g' + id }, { get: (t, k) => (k === '__rec' ? t.__rec : (...a) => { log.push(`${prefix}g${id}.${String(k)}(${a.map(fmt).join(',')})`); }) }); };
  const ctx = new Proxy({}, {
    get: (_t, k) => {
      if (k === 'measureText') return (s) => ({ width: String(s).length * 7 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return (...a) => { log.push(`${prefix}${String(k)}(${a.map(fmt).join(',')})`); return grad(); };
      if (k === 'canvas') return { width: 100, height: 100 };
      if (typeof k === 'string' && k in state) return state[k];
      return (...a) => { log.push(`${prefix}${String(k)}(${a.map(fmt).join(',')})`); };
    },
    set: (_t, k, v) => { state[k] = v; log.push(`${prefix}${String(k)}=${fmt(v)}`); return true; }
  });
  return { ctx, log };
}
// two drawings are the same when every line is the same word-for-word and every number in it agrees (a number may differ by the last digit that was rounded)
const NUM = /-?\d+(?:\.\d+)?(?:e-?\d+)?/g;
const sameLine = (x, y) => {
  if (x === y) return true;
  if (x.replace(NUM, '#') !== y.replace(NUM, '#')) return false;
  const p = x.match(NUM) || [], q = y.match(NUM) || [];
  return p.length === q.length && p.every((v, i) => Math.abs(parseFloat(v) - parseFloat(q[i])) <= 0.0015);
};
const same = (a, b) => a.length === b.length && a.every((x, i) => sameLine(x, b[i]));

const K = await import('../../src/booth/kit.ts');
const CAT = await import('../../src/booth/catalog.ts');
const FR = await import('../../src/booth/frames.ts');
const SC = await import('../../src/booth/scene.ts');
const GE = await import('../../src/booth/gestures.ts');
const CA = await import('../../src/booth/camera.ts');
const ME = await import('../../src/booth/media.ts');
const PARTS = await import('../../src/booth/buddies/parts.ts');
const kitAt = (t, sil = false) => ({ t, ph: (t / K.LOOP) * K.TAU, sil, out: 6 });

section('1. The buddies and the stickers: who is in the booth');
const { BUDDIES, STICKERS, FIELDS, PACKS } = CAT;
check(BUDDIES.length === 14 && STICKERS.length === 46, 'fourteen buddies and the forty-six stickers that were already there', `${BUDDIES.length} / ${STICKERS.length}`);
const ids = [...BUDDIES, ...STICKERS].map((d) => d.id);
check(new Set(ids).size === ids.length && ids.every((i) => /^[a-z]{2}-[a-z0-9]+$/.test(i)), 'every id is its own (and looks like pp-heart / bd-bunby)');
check(BUDDIES.every((b) => b.pack === 'buddy' && b.outline === false && !b.text && b.buddy && typeof b.draw === 'function'), 'a buddy is drawn in colour only (no white sticker edge), is never text, and says what it is');
check(STICKERS.every((s) => s.pack !== 'buddy' && !s.buddy), 'the stickers stay stickers: none of them is a buddy');
check(BUDDIES.every((b) => b.id.startsWith('bd-') && b.name.length >= 3 && b.name.length <= 8 && new Set(BUDDIES.map((x) => x.name)).size === BUDDIES.length), 'each buddy has a short name of its own');
check(BUDDIES.every((b) => b.buddy.tagline && b.buddy.tagline.length <= 20 && b.buddy.size >= 0.4 && b.buddy.size <= 0.6 && /^#[0-9a-f]{6}$/i.test(b.buddy.accent) && b.bw >= 55 && b.bw <= 100 && b.bh >= 90 && b.bh <= 100), 'a short line under the name, a first size, a colour, and a touch area that fits it');
check(FIELDS.map((f) => f.id).join() === 'kpop,kdrama,movies,anime,cute,fun' && FIELDS.every((f) => CAT.buddiesIn(f.id).length >= 2) && FIELDS.reduce((n, f) => n + CAT.buddiesIn(f.id).length, 0) === BUDDIES.length, 'six fields (K-Pop, K-Drama, Movies, Anime, Cute, Fun), at least two buddies in each, and every buddy belongs to one');
check(PACKS.length === 6 && CAT.stickerById('bd-bunby').name === 'Bunby' && CAT.stickerById('kd-saranghae').name === 'Saranghae' && CAT.stickerById('nope') === undefined, 'one lookup finds a buddy or a sticker');
check(CAT.searchBuddies('').length === 14 && CAT.searchBuddies('dragon').map((b) => b.name).join() === 'Ember' && CAT.searchBuddies('robot').map((b) => b.name).join() === 'Bolt' && CAT.searchBuddies('ninja').some((b) => b.name === 'Kuro') && CAT.searchBuddies('bts').every((b) => b.buddy.field === 'kpop') && CAT.searchBuddies('zzzz').length === 0, 'the search knows names, kinds and the words of a field');
check(CAT.searchBuddies('cat').map((b) => b.name).sort().join() === 'Cleo,Kuro' && CAT.searchBuddies('anime').length === 3 && CAT.searchBuddies('drama').length === 2, 'cat, anime and drama lead to the right buddies');
check(CAT.searchStickers('bts').length > 0 && CAT.searchStickers('bunby').length === 0, 'the sticker search does not list buddies');

section('2. Every buddy and sticker is drawn, moves, and repeats exactly after one loop');
const times = [0, 0.37, 1.1, 1.9, 2.6, K.LOOP - 0.01];
let drawErr = '';
for (const d of [...BUDDIES, ...STICKERS]) {
  for (const sil of d.buddy ? [false] : [true, false]) {
    let most = 0;
    for (const t of times) {
      const r = recorder();
      try { d.draw(r.ctx, kitAt(t, sil)); } catch (e) { drawErr = `${d.id} at ${t}: ${e.message}`; }
      most = Math.max(most, r.log.length);
    }
    if (most < 10) drawErr = `${d.id} drew almost nothing`;   // (some stickers show their moving part only for a moment of the loop)
  }
}
check(!drawErr, 'all 60 are drawn at six moments of the loop without a mistake', drawErr);
const loopBad = [];
for (const d of [...BUDDIES, ...STICKERS]) {
  // the end of the loop is the start of the loop (a saved video starts again without a jump); a sticker is also the same one whole loop later at any moment
  for (const t0 of d.buddy ? [0] : [0, 0.45, 1.7]) {
    for (const sil of d.buddy ? [false] : [true, false]) {
      const a = recorder(), b = recorder();
      d.draw(a.ctx, kitAt(t0, sil)); d.draw(b.ctx, kitAt(t0 + K.LOOP, sil));
      if (!same(a.log, b.log)) loopBad.push(`${d.id}@${t0}`);
    }
  }
}
check(loopBad.length === 0, 'at the end of the loop it looks exactly as at the start (a saved video starts again without a jump)', loopBad.slice(0, 6).join(' '));
const moveBad = [];
for (const d of [...BUDDIES, ...STICKERS]) {
  const seen = new Set();
  for (let i = 0; i < 12; i++) { const r = recorder(); d.draw(r.ctx, kitAt(i * 0.25)); seen.add(r.log.join('\n')); }
  if (seen.size < 2) moveBad.push(d.id);
}
check(moveBad.length === 0, 'every one moves (twelve moments of the loop are never all the same picture)', moveBad.join(' '));
const buddyMove = BUDDIES.filter((b) => { const seen = new Set(); for (let i = 0; i < 12; i++) { const r = recorder(); b.draw(r.ctx, kitAt(i * 0.25)); seen.add(r.log.join('\n')); } return seen.size < 3; });
check(buddyMove.length === 0, 'a buddy is always alive: it looks different from one moment to the next (hops, sways, waves, blinks)', buddyMove.map((b) => b.id).join(' '));
const detBad = [];
for (const d of [...BUDDIES, ...STICKERS]) { const a = recorder(), b = recorder(); d.draw(a.ctx, kitAt(0.9)); d.draw(b.ctx, kitAt(0.9)); if (!same(a.log, b.log)) detBad.push(d.id); }
check(detBad.length === 0, 'the same moment is always drawn the same way (nothing is left to chance)', detBad.join(' '));
const shadowBad = BUDDIES.filter((b) => { const r = recorder(); b.draw(r.ctx, kitAt(0.6)); const i = r.log.indexOf(`translate(0,${PARTS.GROUND})`); return i < 0 || r.log[i + 1] !== 'scale(1,0.2)' || !r.log[i + 2].startsWith('createRadialGradient(0,0,0,0,0,'); });
check(shadowBad.length === 0, 'every buddy puts a soft shadow on the ground where it stands', shadowBad.map((b) => b.id).join(' '));
check(PARTS.GROUND === 93 && near(SC.FEET, 0.465), 'the ground is 93 units below the middle of the box (0.465 of its width)');
check(near(PARTS.blinkOf(kitAt(0)), 0) && near(PARTS.blinkOf(kitAt(K.LOOP)), 0) && PARTS.blinkOf(kitAt(0.4 * K.LOOP + 0.085)) > 0.99 && near(PARTS.hopOf(kitAt(0), 3), 0) && near(PARTS.hopOf(kitAt(K.LOOP), 3), 0) && near(PARTS.hopOf(kitAt(0.5), 2), PARTS.hopOf(kitAt(0.5 + K.LOOP), 2)), 'one blink and a whole number of hops in every loop');

section('3. Frames and the NOOB wordmark');
check(FR.FRAMES.length === 5 && FR.FRAMES.every((f) => FR.frameById(f.id) === f) && FR.frameById('zzz') === FR.FRAMES[0], 'five frames, found by their id');
const boxBad = [];
for (const f of FR.FRAMES) for (const sh of SC.SHAPES) {
  const win = FR.windowOf(f, sh.w, sh.h), b = FR.wordmarkBox(f, sh.w, sh.h, win);
  const inStrip = b.y >= win.y + win.h && b.y + b.h <= sh.h && b.x >= sh.w / 2 && b.x + b.w <= sh.w - f.m * sh.w + 1 && Math.abs(b.x + b.w - (sh.w - f.m * sh.w)) <= 1;
  if (!inStrip) boxBad.push(`${f.id}/${sh.id}`);
}
check(boxBad.length === 0, 'in every frame and shape the wordmark sits on the bottom strip, at the right, in line with the photo\'s right edge', boxBad.join(' '));
{
  const scr = recorder('S:');
  FR.setCanvasFactory((w, h) => ({ width: w, height: h, style: {}, getContext: () => scr.ctx }));
  const main = recorder();
  const f = FR.frameById('pearl'), win = FR.windowOf(f, 1080, 1350), logo = { width: 640, height: 207 };
  FR.drawTag(main.ctx, f, 1080, 1350, win, logo);
  check(main.log.some((l) => l.startsWith('drawImage(')) && scr.log.some((l) => l.startsWith('S:drawImage(')) && scr.log.some((l) => l.includes('globalCompositeOperation="source-in"')), 'the wordmark is tinted to the colour of the frame (white letters kept only where the logo is) and drawn once');
  const n1 = scr.log.length;
  FR.drawTag(main.ctx, f, 1080, 1350, win, logo);
  check(scr.log.slice(n1).some((l) => l.startsWith('S:clearRect(')) && scr.log.slice(n1).some((l) => l.startsWith('S:drawImage(')), 'it is tinted again for every picture, never kept (a phone may empty a canvas it is not looking at)');
  const plain = recorder();
  FR.drawTag(plain.ctx, f, 1080, 1350, win, null);
  check(plain.log.some((l) => l.startsWith('fillText("NOOB"')), 'no logo file = the letters N O O B are written instead (the tag is never missing)');
}

section('4. Putting a picture together');
const photo = { img: { width: 400, height: 300 }, w: 400, h: 300 };
const base = (over = {}) => ({ shape: '4:5', frame: 'pearl', photo, zoom: 1, panX: 0, panY: 0, stickers: [], mirror: false, tag: true, ...over });
const bud = (uid, id = 'bd-bunby', over = {}) => ({ uid, id, x: 0.3, y: 0.6, s: 0.5, r: 0, flip: false, ...over });
const stk = (uid, id = 'kd-saranghae', over = {}) => ({ uid, id, x: 0.5, y: 0.4, s: 0.3, r: 0.1, flip: false, ...over });
check(SC.SHAPES.map((s) => `${s.w}x${s.h}`).join() === '1080x1350,1080x1080,1080x1920' && SC.shapeById('x') === SC.SHAPES[0], 'three shapes: 4:5, square and 9:16');
const l1 = SC.addPlaced([stk(1), stk(2)], bud(3));
check(l1.map((p) => p.uid).join() === '3,1,2', 'a new buddy stands behind the stickers');
const l2 = SC.addPlaced(l1, bud(4, 'bd-cleo'));
check(l2.map((p) => p.uid).join() === '3,4,1,2' && SC.addPlaced(l2, stk(5)).map((p) => p.uid).join() === '3,4,1,2,5', 'the buddies stay together at the back and a new sticker goes on top');
check(SC.toFront(l2, 3).map((p) => p.uid).join() === '4,3,1,2' && SC.toFront(l2, 1).map((p) => p.uid).join() === '3,4,2,1' && SC.toFront(l2, 99).length === 4, '"bring to front" moves a buddy to the front of the buddies and a sticker to the front of everything');
check(SC.isBuddy('bd-ember') && !SC.isBuddy('kd-oppa') && !SC.isBuddy('nope'), 'a buddy is told from a sticker by what it is');
check(SC.sizeLimits('bd-bunby').min === 0.2 && SC.sizeLimits('bd-bunby').max === 1.2 && SC.sizeLimits('pp-heart').min === SC.MIN_SIZE && SC.MAX_BUDDIES === 3 && SC.MAX_STICKERS === 24, 'size limits and how many fit on one picture (3 buddies, 24 stickers)');
const spotBad = [];
for (const sh of SC.SHAPES) for (const f of FR.FRAMES) for (const side of [-1, 1]) for (const b of BUDDIES) {
  const sp = SC.startSpot(b.id, sh.id, f.id, side), win = FR.windowOf(f, sh.w, sh.h), feet = sp.y * sh.h + SC.FEET * sp.s * sh.w, left = sp.x * sh.w - sp.s * sh.w * 0.5, right = sp.x * sh.w + sp.s * sh.w * 0.5;
  if (!(feet <= win.y + win.h && feet >= win.y + win.h * 0.85 && left >= win.x - sp.s * sh.w * 0.12 && right <= win.x + win.w + sp.s * sh.w * 0.12 && sp.s === b.buddy.size)) spotBad.push(`${b.id}/${sh.id}/${f.id}/${side}`);
}
check(spotBad.length === 0, 'a buddy first stands with its feet on the floor of the photo (just above the frame), on the left or the right, in every shape and frame', spotBad.slice(0, 4).join(' '));
{
  const a = { shape: '4:5', frame: 'pearl' }, spot = SC.startSpot('bd-coco', '4:5', 'pearl', -1), list = [{ uid: 1, id: 'bd-coco', ...spot, r: 0, flip: false }, stk(2)];
  const out = SC.reflow(list, a, { shape: '9:16', frame: 'neon' });
  const wa = FR.windowOf(FR.frameById('pearl'), 1080, 1350), wb = FR.windowOf(FR.frameById('neon'), 1080, 1920);
  const rel = (p, W, H, win) => [(p.x * W - win.x) / win.w, (p.y * H - win.y) / win.h, (p.s * W) / win.w];
  const ra = rel(list[0], 1080, 1350, wa), rb = rel(out[0], 1080, 1920, wb), rs = rel(out[1], 1080, 1920, wb), rs0 = rel(list[1], 1080, 1350, wa);
  check(ra.every((v, i) => near(v, rb[i], 1e-9)) && rs0.every((v, i) => near(v, rs[i], 1e-9)), 'a change of shape or frame keeps every buddy and sticker at the same place inside the photo, and the same size next to it');
  const back = SC.reflow(out, { shape: '9:16', frame: 'neon' }, a);
  check(back.every((p, i) => near(p.x, list[i].x, 1e-9) && near(p.y, list[i].y, 1e-9) && near(p.s, list[i].s, 1e-9)), 'and back again: nothing drifts');
}
{
  const g = SC.guideSpot([bud(1, 'bd-bunby', { x: 0.28 })], '4:5', 'pearl'), h = SC.guideSpot([bud(1, 'bd-bunby', { x: 0.72 })], '4:5', 'pearl');
  check(g && g.cx > 0.5 && h && h.cx < 0.5 && SC.guideSpot([stk(1)], '4:5', 'pearl') === null && SC.guideSpot([], '4:5', 'pearl') === null, 'the "stand here" box is on the side the buddy is not on, and there is none without a buddy');
}
// the name tag
{
  const rc = recorder(), win = FR.windowOf(FR.frameById('pearl'), 1080, 1350);
  check(SC.nameTagOf(rc.ctx, [stk(1)], 1080, 1350, win) === null && SC.nameTagOf(rc.ctx, [], 1080, 1350, win) === null, 'no buddy, no name tag');
  const t1 = SC.nameTagOf(rc.ctx, [bud(1)], 1080, 1350, win), t2 = SC.nameTagOf(rc.ctx, [bud(1), bud(2, 'bd-cleo')], 1080, 1350, win), t3 = SC.nameTagOf(rc.ctx, [bud(1), bud(2, 'bd-cleo'), bud(3, 'bd-coco')], 1080, 1350, win);
  check(t1.name === 'Bunby' && t1.top === 'NOOB Buddy' && t2.name === 'Bunby & Cleo' && t3.name === 'Bunby, Cleo +1', 'the tag says "NOOB Buddy" and the name (or two names, or two and "+1")');
  let out = 0;
  for (let x = 0; x <= 1.0001; x += 0.125) for (let y = 0; y <= 1.0001; y += 0.125) for (const s of [0.2, 0.5, 1.1]) for (const fr of FR.FRAMES) for (const sh of SC.SHAPES) {
    const w = FR.windowOf(fr, sh.w, sh.h), t = SC.nameTagOf(rc.ctx, [bud(1, 'bd-onigi', { x, y, s })], sh.w, sh.h, w);
    if (t.x - t.w / 2 < w.x - 0.5 || t.x + t.w / 2 > w.x + w.w + 0.5 || t.y - t.h / 2 < w.y - 0.5 || t.y + t.h / 2 > w.y + w.h + 0.5) out++;
  }
  check(out === 0, 'wherever the buddy is put, its name tag stays inside the photo');
  const up = SC.nameTagOf(rc.ctx, [bud(1, 'bd-bunby', { x: 0.3, y: 0.5, s: 0.4 })], 1080, 1350, win), low = SC.nameTagOf(rc.ctx, [bud(1, 'bd-bunby', { x: 0.3, y: 0.2, s: 0.5 })], 1080, 1350, win);
  check(up.y < 0.5 * 1350 && low.y > 0.2 * 1350, 'the tag is above the head, or under the feet when there is no room above');
}
// the whole picture
{
  const scr = recorder('S:');
  FR.setCanvasFactory((w, h) => ({ width: w, height: h, style: {}, getContext: () => scr.ctx }));
  const logo = { width: 640, height: 207 };
  const draw = (sc, o = {}) => { const r = recorder(); SC.renderScene(r.ctx, sc, 1080, 1350, { t: 0.7, logo, ...o }); return r.log; };
  let renderErr = '';
  for (const f of FR.FRAMES) for (const sh of SC.SHAPES) for (const withBuddy of [false, true]) {
    try { const r = recorder(); SC.renderScene(r.ctx, base({ frame: f.id, shape: sh.id, stickers: withBuddy ? [bud(1), bud(2, 'bd-kitsu', { x: 0.7, flip: true }), stk(3)] : [stk(3)] }), sh.w, sh.h, { t: 1.2, logo }); } catch (e) { renderErr = `${f.id}/${sh.id}: ${e.message}`; }
  }
  check(!renderErr, 'the picture is made in every frame and shape, with and without a buddy', renderErr);
  const withB = draw(base({ stickers: [bud(1), stk(2)] })), noB = draw(base({ stickers: [stk(2)] }));
  const lastText = (log) => log.map((l, i) => [l, i]).filter(([l]) => l.startsWith('fillText(')).map(([, i]) => i).pop() ?? -1;
  const imgs = withB.map((l, i) => [l, i]).filter(([l]) => l.startsWith('drawImage(')).map(([, i]) => i);
  check(withB.some((l) => l.startsWith('fillText("Bunby"')) && withB.some((l) => l.startsWith('fillText("NOOB Buddy"')) && withB.some((l) => l.startsWith('fillText("#NOOBbuddies"')), 'with a buddy: its name tag and the line "#NOOBbuddies" are written');
  check(!noB.some((l) => l.includes('NOOB Buddy') || l.includes('#NOOBbuddies')), 'with stickers only: no name tag and no line of words (a picture without a buddy stays as it was)');
  check(!draw(base({ tag: false, stickers: [bud(1)] })).some((l) => l.startsWith('fillText("NOOB Buddy"')) && draw(base({ tag: false, stickers: [bud(1)] })).some((l) => l.startsWith('fillText("#NOOBbuddies"')), 'the name tag can be switched off');
  const lastImg = imgs[imgs.length - 1];
  check(lastImg > lastText(withB) && withB.slice(lastImg + 1).every((l) => l === 'restore()' || l === 'save()' || l.startsWith('setTransform(')), 'the NOOB wordmark is the last thing drawn: nothing can cover it');
  check(draw(base({ mirror: true })).some((l) => l === 'scale(-1,1)') && !draw(base({ mirror: false })).some((l) => l === 'scale(-1,1)'), 'a selfie photo is shown as in a mirror');
  const plainLen = draw(base({ stickers: [bud(1)] })).length;
  check(draw(base({ stickers: [bud(1)] }), { guide: { cx: 0.72, fy: 0.94, hh: 0.62 } }).length > plainLen + 15, 'the "stand here" box is drawn only when it is asked for (never in a saved picture)');
  check(draw(base({ stickers: [bud(1)] }), { selected: 1, guides: true }).length > draw(base({ stickers: [bud(1)] }), { selected: 1 }).length + 20 && draw(base({ stickers: [bud(1)] }), { selected: 1 }).length === plainLen, 'the handles of the picked one are drawn only in the live preview');
  const flatColours = (log) => new Set(log.filter((l) => /^(fillStyle|strokeStyle)=/.test(l)).map((l) => l.split('=')[1].replace(/"/g, '')));
  const guideOnly = draw(base({ photo: null, stickers: [] }), { guide: { cx: 0.72, fy: 0.94, hh: 0.62 }, selected: null });
  check(guideOnly.some((l) => l === 'strokeStyle="#111184"') && guideOnly.some((l) => l === 'fillStyle="#ffffff"'), 'the "stand here" box is flat white with a dark-blue line round it (no shadow, no see-through)');
  check(!draw(base({ stickers: [bud(1)] }), { selected: 1, guides: true, unit: 2 }).slice(plainLen).some((l) => /shadow|rgba/.test(l)), 'and the handles of the picked one are flat too: white discs with dark-blue marks (no shadow, no see-through)');
  void flatColours;
  check(draw(base({ photo: null })).some((l) => l.includes('"#1a1424"')), 'no photo yet: a dark window (never a crash)');
}
check(near(SC.handleRadius(1000, 2), 22) && near(SC.handleRadius(360), 11) && near(SC.handleRadius(720), 22), 'a handle is 11 screen pixels wide, on any picture size');

section('5. Fingers and the mouse on the picture');
{
  const W = 1000, H = 1250, b = bud(1, 'bd-bunby', { x: 0.4, y: 0.6, s: 0.5 });
  check(GE.hitSticker(b, 400, 750, W, H) && !GE.hitSticker(b, 40, 40, W, H) && GE.pickTop([stk(2, 'kd-oppa', { x: 0.4, y: 0.6, s: 0.4, r: 0 }), b].reverse(), 400, 750, W, H) === 2, 'a touch picks the one on top (the last drawn)');
  check(GE.pickTop(SC.addPlaced([stk(2, 'kd-oppa', { x: 0.4, y: 0.6, s: 0.4, r: 0 })], b), 400, 750, W, H) === 2 && GE.pickTop([b], 900, 100, W, H) === null, 'stickers lie over buddies, so a touch where both are picks the sticker; empty places pick nothing');
  const h = SC.handlesOf(b, W, H);
  check(GE.pickHandle(b, h.br.x + 3, h.br.y - 3, W, H, false, 2) === 'turn' && GE.pickHandle(b, h.tl.x, h.tl.y, W, H, false, 2) === 'del' && GE.pickHandle(b, h.br.x + 30, h.br.y, W, H, false, 2) === null && GE.pickHandle(b, h.br.x + 30, h.br.y, W, H, true, 2) === 'turn', 'the delete and resize handles are found; a finger has a wider target than a mouse');
  const start = { x: h.br.x, y: h.br.y }, c0 = { x: b.x * W, y: b.y * H };
  const grow = GE.dragHandle(b, start, { x: c0.x + (start.x - c0.x) * 1.5, y: c0.y + (start.y - c0.y) * 1.5 }, W, H);
  const turn = GE.dragHandle(b, start, { x: c0.x - (start.y - c0.y), y: c0.y + (start.x - c0.x) }, W, H);
  const sticker = stk(5, 'pp-heart', { x: 0.4, y: 0.6, s: 0.3, r: 0 }), sh = SC.handlesOf(sticker, W, H), sc0 = { x: sticker.x * W, y: sticker.y * H };
  const turnS = GE.dragHandle(sticker, { x: sh.br.x, y: sh.br.y }, { x: sc0.x - (sh.br.y - sc0.y), y: sc0.y + (sh.br.x - sc0.x) }, W, H);
  check(near(grow.s, 0.75, 1e-9) && grow.r === 0 && turn.r === 0 && near(turnS.r, Math.PI / 2, 1e-9), 'dragging the corner makes a buddy bigger or smaller but never turns it (it stands on the ground); a sticker turns and resizes');
  const tiny = GE.dragHandle(b, start, { x: c0.x, y: c0.y }, W, H), huge = GE.dragHandle(b, start, { x: c0.x + 1e6, y: c0.y + 1e6 }, W, H);
  check(tiny.s === 0.2 && huge.s === 1.2 && GE.dragHandle(sticker, { x: sh.br.x, y: sh.br.y }, { x: sc0.x + 1e6, y: sc0.y }, W, H).s === SC.MAX_SIZE, 'a buddy is never smaller than 0.2 or larger than 1.2 of the picture, a sticker never larger than 1.3');
  const pa = { x: 300, y: 500 }, pb = { x: 500, y: 500 }, pc = { x: 250, y: 560 }, pd = { x: 650, y: 560 };
  const pb1 = GE.pinched(b, pa, pb, pc, pd, W, H), ps1 = GE.pinched(sticker, pa, pb, pc, { x: 450, y: 700 }, W, H);
  check(near(pb1.s, 1.0, 1e-9) && pb1.r === 0 && near(pb1.x, 0.45, 1e-9) && near(pb1.y, 0.6 + 60 / H, 1e-9) && near(ps1.s, 0.3 * (Math.hypot(200, 140) / 200), 1e-9) && near(ps1.r, Math.atan2(140, 200), 1e-9), 'two fingers: a buddy is resized and moved (never turned), a sticker is turned too');
  const m1 = GE.moved(b, 5000, -5000, W, H);
  check(m1.x === 1 && m1.y === 0 && GE.moved(b, 100, 0, W, H).x > b.x, 'a buddy can be dragged anywhere on the picture but its middle never leaves it');
  const win = FR.windowOf(FR.frameById('pearl'), 800, 1000), big = { img: {}, w: 2000, h: 1000 };
  const p1 = GE.panned(big, win, 1, 0, 0, 100, 50);
  check(p1.panX > 0 && near(p1.panY, 0) && GE.panned({ img: {}, w: 800, h: 1000 }, win, 1, 0, 0, 100, 100).panX === 0, 'the photo moves with the finger, and only in the direction it is wider than its window');
  check(GE.zoomed(1, 10) === 4 && GE.zoomed(2, 0.1) === 1 && near(GE.zoomed(1, 1.5), 1.5), 'zoom stays between 1 and 4');
  const rect = SC.photoRect(big, win, 1, 0, 0), rect2 = SC.photoRect(big, win, 1, 1, 0), rect3 = SC.photoRect(big, win, 2, -1, -1);
  check(near(rect.h, win.h) && near(rect.x + rect.w / 2, win.x + win.w / 2) && near(rect2.x, win.x) && rect3.x <= win.x + 1e-6 && rect3.x + rect3.w >= win.x + win.w - 1e-6 && rect3.y <= win.y + 1e-6 && rect3.y + rect3.h >= win.y + win.h - 1e-6, 'the photo always fills its window (cut at the edges), at any zoom or pan');
  check(near(GE.toLocal(b, b.x * W, b.y * H, W, H).x, 0) && near(GE.toLocal(b, b.x * W + 100, b.y * H, W, H).x, 40) && near(GE.toLocal({ ...b, flip: true }, b.x * W + 100, b.y * H, W, H).x, -40), "a point of the picture is turned into the sticker's own units (and mirrored when it is mirrored)");
}

section('6. The camera');
check(CA.cameraProblem({ name: 'NotAllowedError' }) === 'denied' && CA.cameraProblem({ name: 'SecurityError' }) === 'denied' && CA.cameraProblem({ name: 'NotFoundError' }) === 'nocam' && CA.cameraProblem({ name: 'OverconstrainedError' }) === 'nocam' && CA.cameraProblem({ name: 'AbortError' }) === 'failed' && CA.cameraProblem(null) === 'failed' && CA.cameraProblem('x') === 'failed', 'what went wrong with the camera is told in four ways: blocked, none found, not secure, could not start');
check(CA.cameraSupported() === false && CA.cameraSize(true).height > CA.cameraSize(true).width && CA.cameraSize(false).width > CA.cameraSize(false).height, 'a page without a camera is told so; a phone held upright asks for a tall picture');
check((await CA.countCameras()) === 1, 'when the cameras can not be counted there is one (the switch button is then not shown)');
{
  let stopped = 0;
  CA.stopStream({ getTracks: () => [{ stop: () => { stopped++; } }, { stop: () => { stopped++; } }] });
  CA.stopStream(null);
  check(stopped === 2, 'letting the camera go stops every track (the camera light goes out)');
}

section('7. Getting a photo in and a picture out');
check(/^NOOB-buddy-20261029-143005\.jpg$/.test(ME.fileName('jpg', new Date(2026, 9, 29, 14, 30, 5))) && ME.fileName('mp4', new Date(2026, 0, 2, 3, 4, 5)) === 'NOOB-buddy-20260102-030405.mp4', 'the file is called NOOB-buddy-<date>-<time>');
check(ME.videoMime() === null && ME.canRecord() === false && ME.VIDEO_WIDTH === 720 && ME.VIDEO_FPS === 30, 'a browser that can not record has no "Moving" version (the button is not shown)');
{
  const bad = await ME.loadPhoto(new File(['hello'], 'notes.txt', { type: 'text/plain' })).then(() => '', (e) => e.message);
  const huge = await ME.loadPhoto({ type: 'image/jpeg', name: 'a.jpg', size: 41 * 1024 * 1024 }).then(() => '', (e) => e.message);
  check(/choose a picture/i.test(bad) && /too big/i.test(huge), 'a file that is not a picture, or is over 40 MB, is refused with a plain sentence');
}
check(ME.MAX_PHOTO_BYTES === 40 * 1024 * 1024 && typeof ME.makePicture === 'function' && typeof ME.makeVideo === 'function' && typeof ME.snapshot === 'function', 'the picture is made at full size, the moving one at 720 pixels, and the camera can be snapshotted');
check(ME.snapshot({ videoWidth: 0, videoHeight: 0, readyState: 4 }) === null && ME.snapshot({ videoWidth: 640, videoHeight: 480, readyState: 1 }) === null, 'a camera that has no picture yet gives no snapshot');

section('8. Where the feature opens from, and what it may touch');
const features = read('src/utils/features.ts'), app = read('src/App.tsx'), profile = read('src/components/Profile/ProfileView.tsx');
const booth = read('src/components/Booth/BuddyBooth.tsx'), sheet = read('src/components/Booth/ResultSheet.tsx'), host = read('src/components/Booth/BoothHost.tsx'), store = read('src/components/Booth/boothStore.ts'), css = read('src/components/Booth/booth.css');
check(/key: 'booth', label: 'Buddy Booth'/.test(features), 'the administrator can switch it off (Admin > Pages > Buddy Booth)');
check(/import \{ BoothHost \} from '\.\/components\/Booth\/BoothHost'/.test(app) && /<BoothHost onUse=\{\(file, target\) => \{\s*closeBooth\(\);/.test(app) && /if \(featuresOff\.has\('booth'\)\) closeBooth\(\);/.test(app), 'the app draws the booth once, closes it when it is switched off, and hands the finished picture to the Story / Post / Reel creator');
check(/useFeatureOn\('booth'\)/.test(profile) && /data-testid="profile-buddy-booth"/.test(profile) && /\{isOwnProfile && boothOn && \(/.test(profile) && /onClick=\{openBooth\}/.test(profile) && /preloadBooth/.test(profile) && /aria-label="Buddy Booth: take a photo with a buddy"/.test(profile), 'the button is on your own profile, next to the menu, only while the page is on, and it loads the booth when touched');
check(/React\.lazy\(\(\) => import\('\.\/BuddyBooth'\)\)/.test(host) && /import\('\.\/BuddyBooth'\)/.test(store) && /export type BoothTarget = 'post' \| 'story' \| 'reel'/.test(host), 'the booth\'s code is only fetched when it is opened');
check(!/\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon|supabase|dangerouslySetInnerHTML|innerHTML|eval\(|new Function/.test(booth + sheet + read('src/booth/camera.ts') + read('src/booth/media.ts') + read('src/booth/scene.ts') + read('src/booth/frames.ts')), 'the booth sends nothing anywhere: no network call, no storage call, no HTML from text');
check(/stopStream\(stream\)/.test(booth) && /return \(\) => \{ cancelled = true; stopStream\(stream\);/.test(booth) && /capture="environment"/.test(booth) && /accept="image\/\*"/.test(booth), 'the camera is let go when it is not needed, and the phone\'s own camera app is the way out when the page has no camera');
check(/URL\.revokeObjectURL/.test(sheet) && /role="dialog" aria-modal="true"/.test(booth) && /role="dialog" aria-modal="true"/.test(sheet) && /Touch and hold the picture/.test(sheet), 'the finished picture frees its memory, and tells how to save it with a long touch');
check(/<Thumb id=/.test(booth) && !/setInterval/.test(booth) && /window\.setInterval\(tick, 83\)/.test(read('src/components/Booth/Thumb.tsx')) && /IntersectionObserver/.test(read('src/components/Booth/Thumb.tsx')), 'all the small moving pictures share one clock and only the ones on the screen are drawn');
const cssRules = css.split('\n').filter((l) => l.includes('{') && !/^\s/.test(l) && !l.startsWith('@') && !l.startsWith('/*'));
check(cssRules.length > 60 && cssRules.every((l) => l.slice(0, l.indexOf('{')).split(',').every((sel) => sel.trim().startsWith('.bb-'))), 'every style of the booth starts with bb- (nothing else in the app is touched)');
check(/camera=\(self\)/.test(read('public/_headers')), 'the site\'s own pages may use the camera');
check(/test-booth\.mjs/.test(read('package.json')), 'this test is part of the test chain');

section('9. One flat colour: #111184');
{
  const colours = new Set([...css.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g)].map((m) => m[0].toLowerCase()));
  check([...colours].every((x) => x === '#111184' || x === '#fff') && colours.has('#111184') && colours.has('#fff'), 'the page uses only #111184 and white (no other colour anywhere in booth.css)', [...colours].join(' '));
  // (two resets are fine: the search box turns the app's own input shadow off, and the placeholder is made fully white)
  const cssBody = css.replace(/box-shadow: none( !important)?;/g, '').replace(/opacity: 1;/g, '');
  check(!/gradient\(|box-shadow|text-shadow|drop-shadow|backdrop-filter|filter:|opacity|background-image|url\(|mask|blur/i.test(cssBody), 'no gradients, patterns, pictures, shadows, blurs or see-through layers in the page');
  check(/\.bb-root \{[^}]*background: #111184;/.test(css) && /\.bb-sheet-back \{[^}]*background: #111184;/.test(css) && /\.bb-tray \{[^}]*background: #111184;/.test(css) && /\.bb-dock \{[^}]*background: #111184;/.test(css) && /\.bb-open \{[^}]*background: #111184;/.test(css), 'the page, the trays, the dock, the finished-picture sheet and the opening are all #111184');
  check(!/linear-gradient|radial-gradient|boxShadow|--ac/.test(booth + sheet) && /background: f\.swatch\[1\]/.test(booth), 'no colour comes from the code of the page either: each frame is shown as one flat colour');
}

section('10. The opening art (4 seconds) and the address /booth');
{
  const OP = await import('../../src/booth/opening.ts');
  const ROUTES = await import('../../src/utils/routes.ts');
  const sizes = [[375, 812], [320, 640], [1280, 800], [800, 1280], [412, 915], [1920, 1080]];
  check(OP.OPENING_SECONDS === 4 && OP.PAGE_BLUE === '#111184' && OP.OPENING_BUDDIES.length === 4 && OP.SHOT_TIMES.length === 4 && OP.SHOT_TIMES.every((s, i) => s >= 0.5 && s < 3.2 && (i === 0 || s > OP.SHOT_TIMES[i - 1])) && OP.OPENING_BUDDIES.every((id) => SC.isBuddy(id)), 'the opening lasts 4 seconds and takes four photos, one after another, of four buddies');
  const bad = [];
  for (const [W, H] of sizes) {
    const L = OP.openingLayout(W, H);
    const inside = L.cards.every((p) => p.x >= 0 && p.y >= L.titleY + L.titleSize * 0.5 && p.x + L.cw <= W && p.y + L.ch <= H) && L.titleY - L.titleSize / 2 >= 0 && L.cards[0].y + L.ch <= L.cards[2].y && L.cards[0].x + L.cw <= L.cards[1].x;
    if (!inside) bad.push(`${W}x${H}`);
  }
  check(bad.length === 0, 'on every screen size the words and the four cards fit, in the middle, without touching', bad.join(' '));
  let errs = '';
  const sprites = [];
  const stub = (c, id, cx, cy, size, rot, flip, t) => { sprites.push(id); };
  const colourSet = new Set();
  for (const [W, H] of sizes) for (let t = 0; t <= 4.2; t += 0.05) {
    const r = recorder();
    try { OP.drawOpening(r.ctx, W, H, t, stub); } catch (e) { errs = `${W}x${H}@${t.toFixed(2)}: ${e.message}`; }
    for (const l of r.log) if (/^(fillStyle|strokeStyle)=/.test(l)) colourSet.add(l.split('=')[1].replace(/"/g, ''));
  }
  check(!errs, 'the opening is drawn at every moment, on every screen size, without a mistake', errs);
  check([...colourSet].every((x) => x === '#111184' || x === '#ffffff') && colourSet.size === 2, 'the art itself is flat: only #111184 and white (the buddies bring their own colours)', [...colourSet].join(' '));
  const at = (t, W = 375, H = 812) => { const r = recorder(), got = []; OP.drawOpening(r.ctx, W, H, t, (c, id) => got.push(id)); return { log: r.log, got }; };
  check(at(0.5).got.length === 0 && at(1.2).got.join() === 'bd-bunby' && at(1.8).got.join() === 'bd-bunby,bd-kitsu' && at(3.2).got.join() === OP.OPENING_BUDDIES.join(), 'the buddies pop into their cards one by one, each after its own flash');
  check(at(4).got.length === 0 && at(4).log.includes('fillRect(0,0,375,812)') && !at(4).log.some((l) => l.startsWith('fillText(') || l === 'fillStyle="#ffffff"') && at(2).log.filter((l) => l.startsWith('fillText(')).length >= 10, 'at 4 seconds only the page colour is left (the art has gone), and the words are there before that');
  const flash = (t) => at(t).log.some((l) => l === 'fillRect(0,0,375,812)' && true) && at(t).log.filter((l) => l === 'fillStyle="#ffffff"').length > 0;
  const fullFlash = (t) => { const L = at(t).log; const i = L.lastIndexOf('fillRect(0,0,375,812)'); return i > 1 && L[i - 1] === 'fillStyle="#ffffff"'; };
  check(fullFlash(3.55) && !fullFlash(3.4) && !fullFlash(3.75), 'one last flash of the whole screen (a picture of all four), gone again in a blink');
  void flash;
  const lift = (t) => { const L = at(t).log.find((l) => /^translate\(0,-?[\d.]+\)$/.test(l) && l !== 'translate(0,0)'); return L ? parseFloat(L.slice(12, -1)) : 0; };
  check(lift(3.5) === 0 && lift(3.8) < 0 && lift(3.95) < lift(3.8), 'at the end everything slides away upwards, faster and faster, into the first screen');
  check(ROUTES.isKnownPath('/booth') && ROUTES.isKnownPath('/booth/') && !ROUTES.isKnownPath('/booths') && ROUTES.isKnownPath('/studio'), 'the address /booth is a real page of the site (not "page not found")');
  const store = read('src/components/Booth/boothStore.ts');
  check(/\^\\\/booth\\\/\?\$\/i\.test\(window\.location\.pathname\)\) openBooth\(\)/.test(app) && /replaceState\(null, '', '\/'\)/.test(store) && /closeBooth = \(\): void => \{ set\(false\);/.test(store), 'opening /booth opens the booth (after the login if there is none yet), and closing it takes /booth out of the address bar');
  check(/const \[opening, setOpening\] = useState\(\(\) =>/.test(booth) && /prefers-reduced-motion: reduce/.test(booth) && /if \(screen === 'pick' && opening\)/.test(booth) && /onPointerDown=\{onDone\}/.test(read('src/components/Booth/BoothOpening.tsx')) && /if \(result \|\| opening\) return;/.test(booth), 'the opening plays when the booth opens, a tap or a key skips it, and a phone set to less motion goes straight in');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
