// NOOB Lenses (the camera with face filters): the maths, every lens drawn on a pretend canvas (so a typo can not hide until someone opens it), the NOOB tag, the security rules of the
// page, and where the feature opens from. Nothing here needs a camera or a browser. Usage: node scripts/supabase/test-lenses.mjs
import fs from 'node:fs';
import path from 'node:path';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// a pretend canvas: every call works and answers with another pretend object (lets the lenses run in Node without drawing anything)
const fake = () => new Proxy(function () {}, { get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'getImageData' ? (_x, _y, w, h) => ({ data: new Uint8ClampedArray(Math.max(0, w * h * 4)), width: w, height: h }) : fake()), apply: () => fake(), set: () => true });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => fake() }) };

const M = await import('../../src/lenses/faceMath.ts');
const X = await import('../../src/lenses/exportPhoto.ts');
const R = await import('../../src/lenses/frame.ts');
const C = await import('../../src/lenses/catalog.ts');
const S = await import('../../src/lenses/scene.ts');

section('1. From the face finder\'s points to a face');
// 478 points, all in the middle, then the ones that matter put where a real face has them (picture 1 x 1, the face a little to the right)
const points = (dx = 0.1, tiltB = 0) => {
  const L = Array.from({ length: 478 }, () => ({ x: 0.5 + dx, y: 0.5, z: 0 }));
  const set = (ids, x, y) => ids.forEach((i) => { L[i] = { x: x + dx, y, z: 0 }; });
  set([33, 133, 159, 145], 0.4, 0.4); set([362, 263, 386, 374], 0.6, 0.4 + tiltB);
  set([10], 0.5, 0.25); set([152], 0.5, 0.75); set([234], 0.3, 0.45); set([454], 0.7, 0.45); set([1], 0.5, 0.5);
  set([105], 0.4, 0.34); set([334], 0.6, 0.34); set([13], 0.5, 0.62); set([14], 0.5, 0.64); set([61], 0.44, 0.63); set([291], 0.56, 0.63);
  set([33], 0.36, 0.4); set([133], 0.44, 0.4); set([362], 0.56, 0.4 + tiltB); set([263], 0.64, 0.4 + tiltB);   // the corners of the eyes (an eye is 0.4 wide)
  set([2], 0.5, 0.55); set([0], 0.5, 0.6); set([127], 0.28, 0.42); set([356], 0.72, 0.42);                    // under the nose, the lip's edge, the temples
  return L;
};
const f = M.faceFromLandmarks(points(), 1, false);
check(f && near(f.u, 0.2) && near(f.cx, 0.6) && near(f.cy, 0.4) && near(f.roll, 0), 'the eyes give the middle (the spot between them), the size and the tilt');
check(f && near(f.top, -0.75) && near(f.chin, 1.75) && near(f.halfW, 1.0) && near(f.nose.y, 0.5) && near(f.mouthW, 0.6), 'forehead, chin, face width, nose and mouth are measured in eye distances');
check(f && near(f.base, 0.75) && near(f.lipTop, 1.0) && near(f.temple, 1.1) && near(f.eyeW, 0.4) && near(f.lipUp, 1.1) && near(f.lipLow, 1.2), 'under the nose, the lip, the temples, the width of an eye and the inner lips are measured too');
check(f && f.skull < f.hair && f.hair < f.top && near(f.hair, -0.75 - 0.31 * (2.5 / 2.79), 1e-3) && near(f.skull, -0.75 - 0.64 * (2.5 / 2.79), 1e-3), "the hairline and the top of the head are worked out from this face's own length (the finder's forehead point is lower than the hairline)");
const mir = M.faceFromLandmarks(points(), 1, true);
check(mir && near(mir.cx, 0.4) && near(mir.u, f.u), 'a mirror picture (the front camera) puts the face on the other side, the same size');
const tilt = M.faceFromLandmarks(points(0.1, 0.05), 1, false);
check(tilt && tilt.roll > 0.2 && tilt.roll < 0.3, 'the right eye lower than the left = clockwise tilt (positive)');
const wide = M.faceFromLandmarks(points(0.1, 0.05), 2, false);
check(wide && near(wide.u, Math.hypot(0.2, 0.025)) && near(wide.cy, 0.425) && wide.roll < tilt.roll, 'a wider-than-tall picture: distances are measured in widths, positions in fractions of each side');
const cheeks = points(); cheeks[1] = { x: 0.7, y: 0.5, z: 0 };
check(M.faceFromLandmarks(cheeks, 1, false).yaw > 0.4 && near(f.yaw, 0), 'a nose to the right of the middle = a face turned to the right of the screen');
const shaped = M.faceFromLandmarks(points(), 1, true, { jawOpen: 0.5, mouthSmileLeft: 0.4, mouthSmileRight: 0.4, eyeBlinkLeft: 0.9, eyeBlinkRight: 0.1 });
const shapedFlip = M.faceFromLandmarks(points(), 1, false, { eyeBlinkLeft: 0.9, eyeBlinkRight: 0.1 });
check(shaped && shaped.mouthOpen > 0.5 && shaped.smile > 0.4 && near(shaped.blinkL, 0.9) && near(shapedFlip.blinkL, 0.1), 'expressions come from the finder\'s scores; in a mirror the person\'s left eye is on the left of the screen');
check(M.faceFromLandmarks([], 1, false) === null && M.faceFromLandmarks(points(), 0, false) === null, 'no points, or no picture size = no face (never a crash)');

section('2. Smoothing');
const sm = new M.FaceSmoother();
const jitter = [];
let last;
for (let i = 0; i < 40; i++) { const g = { ...f, cx: 0.6 + (i % 2 ? 0.004 : -0.004) }; last = sm.update([g], i / 30)[0]; jitter.push(last.cx); }
const tail = jitter.slice(-10), spread = Math.max(...tail) - Math.min(...tail);
check(spread < 0.004, 'a face that only shakes a little stays still on the screen', String(spread));
const sm2 = new M.FaceSmoother();
sm2.update([f], 0);
let fast = f;
for (let i = 1; i <= 6; i++) fast = sm2.update([{ ...f, cx: 0.6 + 0.03 * i }], i / 30)[0];
check(fast.cx > 0.73, 'a quick move is followed within a few pictures (no lagging behind)', String(fast.cx));
const sm3 = new M.FaceSmoother(0.3);
sm3.update([f], 0);
const fading = sm3.update([], 0.15);
check(fading.length === 1 && fading[0].seen > 0.4 && fading[0].seen < 0.6, 'a lost face fades out over a moment instead of vanishing');
check(sm3.update([], 0.5).length === 0, 'and is gone after it');
const two = new M.FaceSmoother();
const out = two.update([{ ...f, cx: 0.8 }, { ...f, cx: 0.2 }], 0);
check(out.length === 2 && out[0].cx < out[1].cx, 'two faces are given left to right');
check(near(M.scaleFace(f, 1000, 500).cx, 600) && near(M.scaleFace(f, 1000, 500).cy, 200) && near(M.scaleFace(f, 1000, 500).u, 200), 'a face is turned into pixels of the picture it is drawn on');

section('3. The lens list');
const ids = C.LENSES.map((l) => l.id);
check(C.LENSES.length === 33 && new Set(ids).size === 33, 'thirty-three lenses, none twice');
check(['bts', 'blackpink', 'idol'].every((i) => ids.includes(i)) && ['strawhat', 'swordsman', 'saiyan', 'dragonballs', 'ninja', 'animeeyes', 'kawaii', 'sakura', 'manga', 'cartoon'].every((i) => ids.includes(i)), 'the K-pop (BTS, Blackpink, stage) and anime (One Piece, Dragon Ball, Naruto style, eyes, kawaii, sakura, manga, drawing look) lenses are there');
check(C.GROUPS.map((g) => g.id).join() === 'all,fun,kpop,anime,looks' && C.lensesIn('kpop').map((l) => l.id).join() === 'none,bts,blackpink,idol' && C.lensesIn('all').length === 33 && C.lensesIn('anime').length === 11 && C.lensesIn('looks')[0].id === 'none', 'groups: All, Fun, K-Pop, Anime, Looks ("Normal" first in each)');
const find = (q) => C.LENSES.filter((l) => C.lensMatches(l, q)).map((l) => l.id);
check(find('one piece').join() === 'strawhat,swordsman' && find('dragon ball').join() === 'saiyan,dragonballs' && find('bts').join() === 'bts' && find('blackpink').join() === 'blackpink' && find('k-pop').join() === 'bts,blackpink,idol' && find('naruto').join() === 'ninja' && find('  ').length === 33, 'the search finds lenses by the words people use (One Piece, Dragon Ball, BTS, Blackpink, K-pop, Naruto)');
check(C.lensById(C.DEFAULT_LENS).id === C.DEFAULT_LENS && C.lensById('nonsense').id === 'none', 'the one it opens with exists; an unknown name is "Normal"');
check(C.LENSES.every((l) => l.name.length >= 3 && l.name.length <= 12 && /^#[0-9a-f]{6}$/i.test(l.color) && ['fun', 'kpop', 'anime', 'looks'].includes(l.group)), 'every lens has a short name, a group and a colour for its glow');
check(C.LENSES.filter((l) => l.kind === 'face').every((l) => l.face || l.base) && C.LENSES.filter((l) => l.kind === 'look').every((l) => l.id === 'none' || l.base), 'every lens does something');

section('4. Every lens draws, on every kind of face, without a single error');
const faces = [
  { ...M.MANNEQUIN, cx: 0.5, cy: 0.45, u: 0.2 },
  { ...M.MANNEQUIN, cx: 0.3, cy: 0.5, u: 0.08, roll: 0.9, yaw: 1, mouthOpen: 1, smile: 1, browUp: 1, blinkL: 1, blinkR: 1 },
  { ...M.MANNEQUIN, cx: 0.7, cy: 0.4, u: 0.3, roll: -0.9, yaw: -1, mouthOpen: 0, smile: 0, seen: 0.4 }
];
let drawn = 0, broke = '';
for (const lens of C.LENSES) {
  for (const t of [0, 0.37, 2.2, 91.3]) {
    try { S.renderScene(fake(), 540, 960, {}, 720, 1280, t > 1, faces, lens, t); S.renderScene(fake(), 960, 540, {}, 640, 640, false, [], lens, t); drawn += 2; }
    catch (e) { broke = `${lens.id}: ${e && e.message}`; }
  }
}
check(!broke && drawn === C.LENSES.length * 8, 'all lenses x faces x moments x with / without a face', broke);

section('4b. The shape of the picture');
check(R.RATIOS.length === 8 && R.RATIOS[0].id === 'orig' && ['9:16', '4:5', '1:1', '3:4', '2:3', '4:3', '16:9'].every((id) => R.RATIOS.some((r) => r.id === id && near(r.ar, Number(id.split(':')[0]) / Number(id.split(':')[1])))), 'the shapes: as the camera gives it, 9:16, 4:5, 1:1, 3:4, 2:3, 4:3 and 16:9');
check(/Stories/.test(R.ratioById('9:16').apps) && /TikTok/.test(R.ratioById('9:16').apps) && /Instagram/.test(R.ratioById('4:5').apps) && /YouTube/.test(R.ratioById('16:9').apps) && R.ratioById('nonsense').id === 'orig', 'each says which apps it is for; an unknown shape is "as the camera gives it"');
const size = (o, w, h) => o.w === w && o.h === h;
check(size(R.outputSize(1080, 1440, 0, 1080, 1920), 1080, 1440) && size(R.outputSize(1080, 1440, 4 / 5, 1080, 1920), 1080, 1350) && size(R.outputSize(1080, 1440, 1, 1080, 1920), 1080, 1080) && size(R.outputSize(1080, 1440, 9 / 16, 1080, 1920), 810, 1440), 'a 3:4 camera picture: kept, or cut to 4:5, square or 9:16 (the biggest of that shape that fits, never stretched)');
check(size(R.outputSize(1920, 1080, 9 / 16, 1080, 1920), 608, 1080) && size(R.outputSize(1280, 720, 1, 1080, 1920), 720, 720) && size(R.outputSize(720, 1280, 16 / 9, 1080, 1920), 720, 405), 'a wide camera picture can be cut to portrait or square, a tall one to landscape');
check(size(R.outputSize(4000, 3000, 0, 1080, 1920), 1440, 1080) && size(R.outputSize(3000, 4000, 0, 1080, 1920), 1080, 1440) && size(R.outputSize(2160, 3840, 9 / 16, 1080, 1920), 1080, 1920), 'a big camera picture is made smaller, to 1080 x 1920 at most');
const cr = R.coverRect(1080, 1440, 810, 1440), cr2 = R.coverRect(1080, 1440, 1080, 1080), cr3 = R.coverRect(1080, 1440, 1080, 1440);
check(near(cr.dh, 1440) && near(cr.dw, 1080) && near(cr.dx, -135) && near(cr.dy, 0), 'cut at the sides: the middle is kept');
check(near(cr2.dw, 1080) && near(cr2.dh, 1440) && near(cr2.dx, 0) && near(cr2.dy, -360 * 0.45), 'cut at the top and bottom: a little more of the top is kept (a head is near the top)');
check(near(cr3.dx, 0) && near(cr3.dy, 0) && near(cr3.dw, 1080), "no cut when the shape is the camera's own");
const pf = M.placeFace({ ...M.MANNEQUIN, cx: 0.5, cy: 0.5, u: 0.2 }, cr);
check(near(pf.cx, -135 + 0.5 * 1080) && near(pf.cy, 720) && near(pf.u, 216), 'a face is placed on the cut picture where it really is');
const m = M.MANNEQUIN;
check(m.skull < m.hair && m.hair < m.top && m.top < m.brow && m.brow < 0 && 0 < m.nose.y && m.nose.y < m.base && m.base < m.lipTop && m.lipTop < m.lipUp && m.lipUp < m.lipLow && m.lipLow < m.chin && m.halfW > 1.1 && m.temple > 1.1, "the pretend face has the proportions of Google's average face (forehead point -0.9, nose 0.6, mouth 1.1, chin 1.9)");

section('5. The NOOB tag and the saved file');
const sizes = [[720, 1280], [1080, 1920], [1280, 720], [640, 640], [4000, 3000], [320, 480]];
check(sizes.every(([w, h]) => { const b = X.tagBox(w, h); return b.x + b.w + b.margin === w && b.y + b.h + b.margin === h && b.x > w / 2 && b.y > h / 2; }), 'the tag sits in the bottom right corner of every picture size');
check(sizes.every(([w, h]) => { const b = X.tagBox(w, h), s = Math.min(w, h); return b.w >= s * 0.2 && b.w <= s * 0.4 && b.logoW + 2 * b.pad <= b.w && b.logoH + 2 * b.pad <= b.h; }), 'it is big enough to read, small enough to stay out of the way, and holds the logo');
check(/^NOOB-devil-20261028-143005\.jpg$/.test(X.photoName('devil', new Date(2026, 9, 28, 14, 30, 5))), 'the file is named NOOB-<lens>-<date>-<time>.jpg');
const exp = read('src/lenses/exportPhoto.ts');
check(/export function drawTag/.test(exp) && /\/brand\/noob-wordmark\.png/.test(exp) && fs.existsSync('public/brand/noob-wordmark.png'), 'the tag is the NOOB logo, burned into the picture itself');
const app = read('src/lenses/LensApp.tsx');
check(/drawTag\(c, o\.w, o\.h, logoRef\.current\);\s*try \{\s*const blob = await canvasToBlob\(cv\)/.test(app) && /outputSize\(sw, sh, ratioById\(ratioRef\.current\)\.ar, EXPORT_SHORT, EXPORT_LONG\)/.test(app), 'the picture is cut to the chosen shape and the tag is drawn before the file is made: no picture leaves without it');
check(/nav\.share\(\{ files: \[file\] \}\)/.test(exp) && /canShare/.test(exp) && /files: \[file\]/.test(exp) && /a\.download = file\.name/.test(exp), 'a picture can be shared to other apps (the share sheet) or saved as a file');

section('6. Nothing leaves the device');
const dir = 'src/lenses';
const all = fs.readdirSync(dir).filter((x) => /\.(ts|tsx)$/.test(x)).map((x) => [x, read(path.join(dir, x))]);
const forbidden = [/\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /WebSocket/, /supabase/i, /localStorage|sessionStorage|indexedDB/, /\/api\//, /FormData/];
for (const [name, src] of all) {
  const code = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const hit = forbidden.find((re) => re.test(code));
  check(!hit, `${name}: no network, storage or upload code`, hit ? String(hit) : '');
}
check(/URL\.revokeObjectURL/.test(app) && /stream\?\.getTracks\(\)\.forEach\(\(t\) => t\.stop\(\)\)/.test(app), 'the camera is switched off when the page closes or the picture is taken, and picture addresses are let go');
check(/getUserMedia/.test(app) && /audio: false/.test(app), 'only the camera is asked for (never the microphone)');

section('7. The page and its security rules');
check(fs.existsSync('lenses.html') && /src="\/src\/lenses\/main\.tsx"/.test(read('lenses.html')) && !/from '\.\.\/App/.test(read('src/lenses/main.tsx')), 'it is a page of its own: the app is not loaded');
const vite = read('vite.config.ts');
check(/lenses: path\.resolve\(__dirname, 'lenses\.html'\)/.test(vite) && /\^\\\/lenses/.test(vite), 'it is built with the app, and /lenses opens it while developing');
const headers = read('public/_headers');
const blocks = headers.split(/\n(?=\/)/);
const main = blocks.find((b) => b.startsWith('/*')) || '', page = blocks.find((b) => b.startsWith('/lenses\n')) || '', pageHtml = blocks.find((b) => b.startsWith('/lenses.html\n')) || '';
check(!/wasm-unsafe-eval/.test(main), 'the rest of the website does NOT get WebAssembly');
check(/'wasm-unsafe-eval'/.test(page) && !/'unsafe-eval'/.test(page) && !/'unsafe-inline'[^;]*script/.test(page.split('script-src')[1]?.split(';')[0] || ''), '/lenses may compile WebAssembly (the face finder), and nothing else beyond the usual');
check(/connect-src 'self';/.test(page) && /frame-src 'none'/.test(page) && /frame-ancestors 'self'/.test(page) && /X-Frame-Options: SAMEORIGIN/.test(page) && /! Content-Security-Policy/.test(page), '... with no network but its own files, no frames inside it, and only this site may show it in a frame');
check(page.split('Content-Security-Policy:')[1] === pageHtml.split('Content-Security-Policy:')[1], 'the rule is the same for /lenses.html');
check(/Permissions-Policy: camera=\(self\)/.test(main), 'the camera is allowed for this site');
check(fs.existsSync('public/lenses/mediapipe/vision_wasm_internal.wasm') && fs.statSync('public/lenses/mediapipe/vision_wasm_internal.wasm').size > 5e6 && fs.existsSync('public/lenses/mediapipe/vision_wasm_internal.js'), 'the face finder\'s program is a file of this website');
const model = fs.readFileSync('public/lenses/face_landmarker.task');
check(model.length > 3e6 && model.length < 6e6 && model.subarray(0, 8).includes(Buffer.from('PK')), 'and so is its model (3.7 MB, an Apache-2.0 file from Google)');
check(/"@mediapipe\/tasks-vision": "0\.10\.35"/.test(read('package.json')) && fs.readFileSync('node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.wasm').equals(fs.readFileSync('public/lenses/mediapipe/vision_wasm_internal.wasm')), 'the finder\'s library is pinned (0.10.35) and its program file is the very one that version came with');

section('8. Where it opens from');
const feed = read('src/components/Feed/FeedView.tsx'), chooser = read('src/components/PostCreation/CreateChooser.tsx'), appTsx = read('src/App.tsx'), host = read('src/components/Lenses/LensHost.tsx'), feats = read('src/utils/features.ts');
check(/data-testid="menu-lenses"/.test(feed) && /featOn\('lenses'\) && \(/.test(feed) && /openLenses\(\)/.test(feed), 'the Home menu has a NOOB Lenses button (only while the page is on)');
check(/kind: 'lenses'/.test(chooser) && /kind === 'lenses'\) \{ if \(featOn\('lenses'\)\) openLenses\(\); \}/.test(appTsx), 'the Create sheet has "Lenses"');
check(/key: 'lenses'/.test(feats) && /closeLenses\(\)/.test(appTsx), 'the administrator can switch it off (Admin > Pages)');
check(/<LensHost onUse=/.test(appTsx), 'it is drawn once, by LensHost, in the app');
check(/src="\/lenses\?embed=1"/.test(host) && /allow="camera"/.test(host) && /e\.origin !== window\.location\.origin/.test(host), 'the app shows /lenses in a frame, allows its camera, and listens only to this site');
const handoff = appTsx.slice(appTsx.indexOf('<LensHost onUse='), appTsx.indexOf('<LensHost onUse=') + 330);
check(/setStudioStoryFile\(file\)/.test(handoff) && /setStudioFile\(file\)/.test(handoff) && !/upload|publish|insert/i.test(handoff), 'a finished picture only opens the Post / Story creator with it: nothing is published from the camera');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
