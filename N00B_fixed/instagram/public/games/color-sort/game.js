// Color Sort: a pouring puzzle. Tap a bottle (it lifts), then tap where its top colour should go. A pour needs an empty bottle or the same colour on top; the big tube on the left holds
// ten units, a bottle four. The puzzle is solved when no bottle or tube holds more than one colour. Every level was won by the solver in color-sort/ before it was shipped (levels.js).
// The rules are in rules.js; this file draws the bottles as one svg that scales to fit the screen, animates the pours and plays the sounds (made here, no sound files).
(function () {
  'use strict';
  var R = window.ColorSortRules;
  var LEVELS = window.COLOR_SORT_LEVELS;
  if (!R || !LEVELS || !LEVELS.length) return;

  var NS = 'http://www.w3.org/2000/svg';
  var COLOURS = ['#2e86ee', '#38a84a', '#2b2b32', '#f2782f', '#eef1f6', '#8b5cf6'];   // blue, green, black, orange, white, purple
  var U = 30;                          // the height of one unit of liquid
  var BW = 64, BH = 170, BASE = 164;   // a bottle: its box, and the line its liquid stands on
  var TW = 84, TH = 358, TBASE = 350;  // the big tube
  var GAPX = 16, GAPY = 34, GUTTER = 30, TOP = 34, LIFT = 18;
  var BOTTLE_PATH = 'M18 6H46V28C46 40 60 44 60 64V150Q60 166 44 166H20Q4 166 4 150V64C4 44 18 40 18 28Z';
  var TUBE_PATH = 'M8 10H76V338Q76 354 60 354H24Q8 354 8 338Z';
  var reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var Q = reduced ? 0.01 : 1;          // 1 = animations at full length

  var $ = function (id) { return document.getElementById(id); };
  var scene = $('scene'), stage = $('stage');
  var elLevel = $('level'), elMoves = $('moves'), btnUndo = $('undo'), btnRestart = $('restart'), btnSound = $('sound');
  var hint = $('hint'), toastEl = $('toast'), winEl = $('win');

  // ------------------------------------------------------------------ saved things (a private window or blocked storage just means nothing is remembered)
  function read(key) { try { return window.localStorage.getItem(key); } catch (e) { return null; } }
  function write(key, value) { try { window.localStorage.setItem(key, value); } catch (e) { /* nothing is remembered */ } }

  // ------------------------------------------------------------------ the game
  var levelNo = Math.max(1, parseInt(read('noob_colorsort_level') || '1', 10) || 1);
  var state = [], history = [], moves = 0, sel = null, busy = false, solved = false;
  var soundOn = read('noob_colorsort_sound') !== '0';
  var els = [], sceneW = 0, sceneH = 0, vignetteKey = '';

  function levelData(n) {
    var lap = Math.floor((n - 1) / LEVELS.length), rows = LEVELS[(n - 1) % LEVELS.length];
    if (!lap) return rows;
    return rows.map(function (b) { return b.split('').map(function (d) { return String((Number(d) + lap) % COLOURS.length); }).join(''); });   // a second time round the colours are shifted
  }

  function load(n) {
    levelNo = n;
    state = R.fromLevel(levelData(n));
    history = [];
    moves = 0; sel = null; busy = false; solved = false;
    winEl.hidden = true;
    build();
    hud();
  }

  function hud() {
    elLevel.textContent = String(levelNo);
    elMoves.textContent = String(moves);
    btnUndo.disabled = !history.length || busy;
  }

  // ------------------------------------------------------------------ the picture
  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  var defs = el('defs', {}, scene);
  el('clipPath', { id: 'cb' }, defs).appendChild(el('path', { d: BOTTLE_PATH }));
  el('clipPath', { id: 'ct' }, defs).appendChild(el('path', { d: TUBE_PATH }));
  [['shadeB', 4, 60], ['shadeT', 8, 76]].forEach(function (g) {
    var lg = el('linearGradient', { id: g[0], gradientUnits: 'userSpaceOnUse', x1: g[1], x2: g[2], y1: 0, y2: 0 }, defs);
    [[0, '#fff', .38], [.22, '#fff', .12], [.55, '#000', 0], [1, '#000', .24]].forEach(function (s) { el('stop', { offset: s[0], 'stop-color': s[1], 'stop-opacity': s[2] }, lg); });
  });
  // the glass of a bottle and of the tube (drawn over the liquid)
  var glassB = el('g', { id: 'glassB' }, defs);
  el('path', { d: BOTTLE_PATH, fill: 'rgba(190,215,245,.16)', stroke: '#8aa8cc', 'stroke-width': 2.4, 'stroke-linejoin': 'round' }, glassB);
  el('rect', { x: 15, y: 2, width: 34, height: 7, rx: 3.5, fill: '#fff', stroke: '#8aa8cc', 'stroke-width': 2 }, glassB);
  el('path', { d: 'M11 74V146', stroke: 'rgba(255,255,255,.85)', 'stroke-width': 5, 'stroke-linecap': 'round', fill: 'none' }, glassB);
  el('path', { d: 'M52 78V132', stroke: 'rgba(255,255,255,.55)', 'stroke-width': 3, 'stroke-linecap': 'round', fill: 'none' }, glassB);
  el('path', { d: 'M23 12V30', stroke: 'rgba(255,255,255,.8)', 'stroke-width': 3, 'stroke-linecap': 'round', fill: 'none' }, glassB);
  var glassT = el('g', { id: 'glassT' }, defs);
  el('path', { d: TUBE_PATH, fill: 'rgba(190,215,245,.16)', stroke: '#8aa8cc', 'stroke-width': 2.4, 'stroke-linejoin': 'round' }, glassT);
  el('rect', { x: 4, y: 4, width: 76, height: 9, rx: 4.5, fill: '#fff', stroke: '#8aa8cc', 'stroke-width': 2 }, glassT);
  el('path', { d: 'M17 40V330', stroke: 'rgba(255,255,255,.85)', 'stroke-width': 6, 'stroke-linecap': 'round', fill: 'none' }, glassT);
  el('path', { d: 'M68 50V250', stroke: 'rgba(255,255,255,.55)', 'stroke-width': 3.5, 'stroke-linecap': 'round', fill: 'none' }, glassT);
  var world = el('g', {}, scene);
  var fly = el('g', {}, scene);

  /** where the bottles go, for a number of rows: the scene's size and the places */
  function arrange(nb, rows) {
    var cols = Math.ceil(nb / rows);
    var gridW = cols * BW + (cols - 1) * GAPX, gridH = rows * BH + (rows - 1) * GAPY;
    var innerH = Math.max(TH, gridH);
    var spots = [{ x: 0, y: TOP + (innerH - TH) / 2 }];
    for (var i = 0; i < nb; i++) spots.push({ x: TW + GUTTER + (i % cols) * (BW + GAPX), y: TOP + (innerH - gridH) / 2 + Math.floor(i / cols) * (BH + GAPY) });
    return { w: TW + GUTTER + gridW, h: innerH + TOP + 8, spots: spots };
  }

  /** the bottles in as many rows as fit the screen best (the tube stays on the left) */
  function fitLayout(nb) {
    var aw = Math.max(120, stage.clientWidth - 16), ah = Math.max(120, stage.clientHeight - 8), all = [], top = 0;
    for (var rows = 1; rows <= 6; rows++) {
      if (Math.ceil(nb / rows) < 2 && nb > 1) continue;
      var lay = arrange(nb, rows);
      lay.scale = Math.min(aw / lay.w, ah / lay.h, 1.35);
      lay.rows = rows;
      all.push(lay);
      if (lay.scale > top) top = lay.scale;
    }
    // the fewest rows that still keep the bottles nearly as big as they can be (24 bottles: 6 across and 4 down on a phone, 8 across and 3 down on a wide screen)
    for (var i = 0; i < all.length; i++) if (all[i].scale >= top * 0.82) return all[i];
    return all[0];
  }

  function build() {
    var nb = state.length - 1;
    var lay = fitLayout(nb);
    sceneW = lay.w; sceneH = lay.h;
    scene.setAttribute('viewBox', '0 0 ' + lay.w + ' ' + lay.h);
    scene.setAttribute('width', String(Math.round(lay.w * lay.scale)));
    scene.setAttribute('height', String(Math.round(lay.h * lay.scale)));
    while (world.firstChild) world.removeChild(world.firstChild);
    while (fly.firstChild) fly.removeChild(fly.firstChild);
    els = [];
    for (var i = 0; i <= nb; i++) {
      var tube = i === 0, spot = lay.spots[i];
      var g = el('g', { 'class': 'ct', 'data-i': i }, world);
      el('ellipse', { cx: tube ? 42 : 32, cy: tube ? TH - 4 : BH - 3, rx: tube ? 40 : 28, ry: 5, fill: 'rgba(60,80,120,.10)' }, g);
      var liq = el('g', { 'clip-path': 'url(#' + (tube ? 'ct' : 'cb') + ')' }, g);
      var liqIn = el('g', {}, liq);
      el('use', { href: '#' + (tube ? 'glassT' : 'glassB') }, g);
      el('rect', { 'class': 'hit', x: tube ? 0 : -2, y: tube ? 0 : -6, width: tube ? TW : BW + 4, height: tube ? TH : BH + 8 }, g);
      els.push({ g: g, liqIn: liqIn, x: spot.x, y: spot.y, mx: tube ? 42 : 32, my: tube ? 9 : 8, cx: tube ? 42 : 32, cy: tube ? 190 : 105, w: tube ? TW : BW, tilt: 0 });
      g.addEventListener('pointerdown', onDown);
      pose(i, 0, 0, 0);
    }
    renderAll();
    if (sel !== null) pose(sel, 0, -LIFT, 0);
  }

  function runsOf(stack) {
    var out = [];
    for (var i = 0; i < stack.length; i++) {
      if (out.length && out[out.length - 1].c === stack[i]) out[out.length - 1].h++;
      else out.push({ c: stack[i], h: 1 });
    }
    return out;
  }

  function drawLiquid(i, runs, tilt) {
    var c = els[i], tube = i === 0, base = tube ? TBASE : BASE, y = base, s = '';
    for (var r = 0; r < runs.length; r++) {
      var h = runs[r].h * U;
      y -= h;
      s += '<rect x="-40" y="' + y.toFixed(2) + '" width="170" height="' + (h + 0.8).toFixed(2) + '" fill="' + COLOURS[runs[r].c] + '"/>';
      if (r) s += '<rect x="-40" y="' + (y + h - 0.6).toFixed(2) + '" width="170" height="1.2" fill="rgba(0,0,0,.14)"/>';
    }
    if (runs.length) {
      s += '<rect x="-40" y="' + y.toFixed(2) + '" width="170" height="' + (base - y).toFixed(2) + '" fill="url(#' + (tube ? 'shadeT' : 'shadeB') + ')"/>';
      s += '<ellipse cx="' + c.cx + '" cy="' + y.toFixed(2) + '" rx="' + (tube ? 30 : 24) + '" ry="5" fill="rgba(255,255,255,.3)"/>';
    }
    c.liqIn.innerHTML = s;
    if (tilt) c.liqIn.setAttribute('transform', 'rotate(' + (-tilt).toFixed(2) + ' ' + c.cx + ' ' + c.cy + ')');
    else c.liqIn.removeAttribute('transform');
  }

  function renderAll() { for (var i = 0; i < els.length; i++) drawLiquid(i, runsOf(state[i]), els[i].tilt); }

  function pose(i, dx, dy, ang) {
    var c = els[i];
    c.tilt = ang;
    c.g.setAttribute('transform', 'translate(' + (c.x + dx).toFixed(2) + ' ' + (c.y + dy).toFixed(2) + ')' + (ang ? ' rotate(' + ang.toFixed(2) + ' ' + c.mx + ' ' + c.my + ')' : ''));
  }

  function resortWorld() { for (var i = 0; i < els.length; i++) world.appendChild(els[i].g); }

  // ------------------------------------------------------------------ animation helpers
  function ease(p) { return p * p * (3 - 2 * p); }
  function lerp(a, b, p) { return a + (b - a) * p; }
  /** runs fn(p) for p from 0 to 1 over `ms`; it always finishes (a page that gets no animation frames is finished by a timer) */
  function tween(ms, fn) {
    return new Promise(function (resolve) {
      var t0 = performance.now(), done = false;
      function finish() { if (done) return; done = true; fn(1); resolve(); }
      function frame(now) {
        if (done) return;
        var p = Math.min(1, (now - t0) / ms);
        if (p >= 1) { finish(); return; }
        fn(p);
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
      window.setTimeout(finish, ms + 250);
    });
  }

  function select(i) { sel = i; sfx('pick'); tween(120 * Q, function (p) { pose(i, 0, -LIFT * ease(p), 0); }); }
  function deselect() {
    var i = sel; sel = null;
    if (i !== null) tween(120 * Q, function (p) { pose(i, 0, -LIFT * (1 - ease(p)), 0); });
  }
  function shake(i) {
    var base = sel === i ? -LIFT : 0;
    return tween(260 * Q, function (p) { pose(i, Math.sin(p * Math.PI * 6) * 5 * (1 - p), base, 0); });
  }

  /** one pour: the bottle swings over the target, the colour runs out of it, it swings back */
  function pourAnim(from, to) {
    busy = true; hideHint(); btnUndo.disabled = true;
    var a = els[from], b = els[to];
    var before = state, after = R.pour(state, from, to);
    var k = R.amount(state, from, to), colour = state[from][state[from].length - 1];
    history.push(before);
    sel = null;
    var dir = b.x + b.mx >= a.x + a.mx ? 1 : -1;
    if (Math.abs(b.x - a.x) < 1) dir = a.x + BW / 2 > sceneW / 2 ? -1 : 1;
    var ang = 64 * dir;
    var dxP = b.x + b.mx - dir * 6 - (a.x + a.mx), dyP = b.y + b.my - 50 - (a.y + a.my);
    var stream = el('rect', { rx: 3.2, fill: COLOURS[colour], opacity: 0 }, fly);
    fly.appendChild(a.g);
    sfx('pour');
    return tween(300 * Q, function (p) {
      var e = ease(p);
      pose(from, dxP * e, lerp(-LIFT, dyP, e), ang * e);
      drawLiquid(from, runsOf(before[from]), a.tilt);
    }).then(function () {
      return tween(640 * Q, function (p) {
        var t = ang + dir * 14 * p;
        pose(from, dxP, dyP, t);
        var ra = runsOf(before[from]), top = ra[ra.length - 1];
        top.h -= k * p;
        if (top.h < 0.001) ra.pop();
        drawLiquid(from, ra, t);
        var rb = runsOf(before[to]);
        if (rb.length && rb[rb.length - 1].c === colour) rb[rb.length - 1].h += k * p; else if (p > 0) rb.push({ c: colour, h: k * p });
        drawLiquid(to, rb, 0);
        var th = t * Math.PI / 180, lipX = a.x + dxP + a.mx + 14 * dir * Math.cos(th), lipY = a.y + dyP + a.my + 14 * dir * Math.sin(th);
        var surface = b.y + (to === 0 ? TBASE : BASE) - (before[to].length + k * p) * U;
        var y0 = p > 0.9 ? lerp(lipY, surface, (p - 0.9) / 0.1) : lipY;
        stream.setAttribute('x', (lipX - 3.5).toFixed(2)); stream.setAttribute('width', '7');
        stream.setAttribute('y', y0.toFixed(2)); stream.setAttribute('height', Math.max(0, surface - y0).toFixed(2));
        stream.setAttribute('opacity', String(Math.min(1, p / 0.08)));
      });
    }).then(function () {
      fly.removeChild(stream);
      state = after; moves++;
      drawLiquid(to, runsOf(state[to]), 0);
      drawLiquid(from, runsOf(state[from]), els[from].tilt);
      hud();
      var tiltNow = els[from].tilt;
      return tween(300 * Q, function (p) {
        var e = ease(p);
        pose(from, dxP * (1 - e), dyP * (1 - e), tiltNow * (1 - e));
        drawLiquid(from, runsOf(state[from]), els[from].tilt);
      });
    }).then(function () {
      resortWorld();
      pose(from, 0, 0, 0);
      drawLiquid(from, runsOf(state[from]), 0);
      busy = false;
      hud();
      if (R.isSolved(state)) won();
      else if (!R.hasMoves(state)) { toast('No moves left. Try Undo or start again.'); btnUndo.classList.add('nudge'); window.setTimeout(function () { btnUndo.classList.remove('nudge'); }, 1100); }
    });
  }

  // ------------------------------------------------------------------ input
  function onDown(ev) {
    ev.preventDefault();
    var g = ev.currentTarget;
    tap(Number(g.getAttribute('data-i')));
  }

  function tap(i) {
    unlockAudio();
    if (busy || solved || i < 0 || i >= els.length) return;
    if (sel === null) {
      if (!state[i].length) { sfx('no'); shake(i); return; }
      select(i);
      return;
    }
    if (sel === i) { deselect(); return; }
    if (R.canPour(state, sel, i)) { pourAnim(sel, i); return; }
    sfx('no');
    var old = sel;
    if (state[i].length) { sel = null; tween(120 * Q, function (p) { pose(old, 0, -LIFT * (1 - ease(p)), 0); }); select(i); }
    else shake(old).then(deselect);
  }

  function undo() {
    if (busy || !history.length) return;
    state = history.pop();
    moves = Math.max(0, moves - 1);
    sel = null; solved = false; winEl.hidden = true;
    for (var i = 0; i < els.length; i++) pose(i, 0, 0, 0);
    renderAll(); hud(); sfx('pick');
  }

  function restart() {
    if (busy) return;
    load(levelNo);
  }

  btnUndo.addEventListener('click', undo);
  btnRestart.addEventListener('click', restart);
  btnSound.addEventListener('click', function () {
    soundOn = !soundOn;
    write('noob_colorsort_sound', soundOn ? '1' : '0');
    btnSound.classList.toggle('off', !soundOn);
    unlockAudio(); sfx('pick');
  });
  $('next').addEventListener('click', function () { load(levelNo + 1); });
  $('again').addEventListener('click', function () { load(levelNo); });
  window.addEventListener('keydown', function (e) {
    if (e.key === 'z' || e.key === 'Z' || e.key === 'Backspace') undo();
    else if (e.key === 'r' || e.key === 'R') restart();
  });

  // ------------------------------------------------------------------ the end of a level
  function won() {
    solved = true;
    write('noob_colorsort_level', String(levelNo + 1));
    sfx('win');
    confetti();
    $('winText').textContent = 'Level ' + levelNo + ' done in ' + moves + (moves === 1 ? ' pour.' : ' pours.');
    window.setTimeout(function () { winEl.hidden = false; }, reduced ? 0 : 750);
  }

  function confetti() {
    if (reduced) return;
    var box = $('confetti');
    for (var i = 0; i < 46; i++) {
      var p = document.createElement('i');
      p.style.left = (Math.random() * 100).toFixed(1) + '%';
      p.style.background = COLOURS[i % COLOURS.length === 4 ? 0 : i % COLOURS.length];
      p.style.setProperty('--dx', ((Math.random() - 0.5) * 160).toFixed(0) + 'px');
      p.style.setProperty('--rot', ((Math.random() - 0.5) * 900).toFixed(0) + 'deg');
      p.style.animationDuration = (1.3 + Math.random() * 1.1).toFixed(2) + 's';
      p.style.animationDelay = (Math.random() * 0.35).toFixed(2) + 's';
      box.appendChild(p);
    }
    window.setTimeout(function () { box.innerHTML = ''; }, 3200);
  }

  var toastTimer = 0;
  function toast(text) {
    toastEl.textContent = text;
    toastEl.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { toastEl.classList.remove('show'); }, 2600);
  }
  function hideHint() { hint.classList.add('gone'); }

  // ------------------------------------------------------------------ sound (made here: no sound files)
  var ac = null;
  function unlockAudio() {
    if (!soundOn) return;
    try {
      if (!ac) { var AC = window.AudioContext || window.webkitAudioContext; if (AC) ac = new AC(); }
      if (ac && ac.state === 'suspended') ac.resume();
    } catch (e) { ac = null; }
  }
  function blip(f0, f1, dur, vol, type, at) {
    var t = ac.currentTime + (at || 0), o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(ac.destination);
    o.start(t); o.stop(t + dur + 0.03);
  }
  function sfx(name) {
    if (!soundOn || !ac || ac.state !== 'running') return;
    try {
      if (name === 'pick') blip(520, 760, 0.07, 0.07, 'sine');
      else if (name === 'no') blip(200, 130, 0.16, 0.08, 'triangle');
      else if (name === 'win') [523.3, 659.3, 784, 1046.5].forEach(function (f, i) { blip(f, f * 1.002, 0.34, 0.09, 'triangle', i * 0.1); });
      else if (name === 'pour') {
        // water running into a bottle: a little noise through a filter, rising as the bottle fills, with a few glugs
        var n = Math.floor(ac.sampleRate * 0.7), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
        for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
        var src = ac.createBufferSource(); src.buffer = buf;
        var bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 3.2;
        var t = ac.currentTime + 0.28;
        bp.frequency.setValueAtTime(420, t); bp.frequency.exponentialRampToValueAtTime(1500, t + 0.62);
        var g = ac.createGain();
        g.gain.setValueAtTime(0.0001, t);
        for (var k = 0; k < 7; k++) { g.gain.linearRampToValueAtTime(0.16, t + k * 0.09 + 0.03); g.gain.linearRampToValueAtTime(0.06, t + k * 0.09 + 0.07); }
        g.gain.linearRampToValueAtTime(0.0001, t + 0.68);
        src.connect(bp); bp.connect(g); g.connect(ac.destination);
        src.start(t); src.stop(t + 0.7);
      }
    } catch (e) { /* silent */ }
  }

  // ------------------------------------------------------------------ start
  btnSound.classList.toggle('off', !soundOn);
  var resizeTimer = 0;
  function refit() {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(function () { if (busy) { refit(); return; } build(); }, 120);
  }
  window.addEventListener('resize', refit);
  if (window.ResizeObserver) new ResizeObserver(refit).observe(stage);
  load(levelNo);

  // for the tests and for looking at a position
  window.__colorSort = {
    tap: tap, undo: undo, restart: restart,
    next: function () { load(levelNo + 1); },
    goto: function (n) { load(n); },
    get state() { return state; }, get level() { return levelNo; }, get moves() { return moves; }, get busy() { return busy; }, get solved() { return solved; },
  };
})();
