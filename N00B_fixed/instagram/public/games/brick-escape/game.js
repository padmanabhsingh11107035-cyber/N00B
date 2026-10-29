// Brick Escape: draws the tray, takes the finger, and keeps the progress. The rules are in rules.js, the levels in levels.js (made and checked by the solver).
(function () {
  'use strict';
  var R = window.BrickEscapeRules, RAW = window.BRICK_ESCAPE_LEVELS || [];
  function $(id) { return document.getElementById(id); }
  var STORE = 'brick-escape:v1', ASPECT = 1.5, GAP = 4;
  var ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20 3.5 9.5h5.2V4h6.6v5.5h5.2z"/></svg>';   // points down; rotated for the other ways

  // ---------------------------------------------------------------- what is remembered: how far the person has come, the stars, the sound
  var saved = { unlocked: 1, stars: {}, sound: true };
  function read(key) { try { return window.localStorage.getItem(key); } catch (e) { return null; } }
  function write(key, value) { try { window.localStorage.setItem(key, value); } catch (e) { /* nothing is remembered */ } }
  try {
    var j = JSON.parse(read(STORE) || 'null');
    if (j && typeof j === 'object') {
      saved.unlocked = Math.max(1, Math.min(RAW.length || 1, (j.unlocked | 0) || 1));
      saved.stars = j.stars && typeof j.stars === 'object' ? j.stars : {};
      saved.sound = j.sound !== false;
    }
  } catch (e) { /* a fresh start */ }
  function persist() { write(STORE, JSON.stringify(saved)); }

  // ---------------------------------------------------------------- sound (made here, no files) and a little buzz
  var ac = null;
  function tone(f, dur, type, vol, to, delay) {
    if (!saved.sound) return;
    try {
      if (!ac) { var AC = window.AudioContext || window.webkitAudioContext; if (AC) ac = new AC(); }
      if (!ac) return;
      if (ac.state === 'suspended') ac.resume();
      var t = ac.currentTime + (delay || 0), o = ac.createOscillator(), g = ac.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
      if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.08, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
    } catch (e) { /* no sound on this phone */ }
  }
  var SFX = {
    pick: function () { tone(540, 0.06, 'triangle', 0.05); },
    slide: function () { tone(230, 0.13, 'sine', 0.1, 150); tone(90, 0.1, 'triangle', 0.05, 60, 0.02); },
    nope: function () { tone(150, 0.1, 'square', 0.035, 110); },
    exit: function () { tone(420, 0.14, 'triangle', 0.08, 880); tone(1040, 0.1, 'sine', 0.05, 1500, 0.09); },
    win: function () { [523, 659, 784, 1046].forEach(function (f, n) { tone(f, 0.22, 'triangle', 0.08, 0, n * 0.11); }); tone(1318, 0.4, 'sine', 0.06, 0, 0.5); }
  };
  function sfx(name) { if (SFX[name]) SFX[name](); }
  function buzz(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* not on this phone */ } }

  // ---------------------------------------------------------------- the level being played
  var level = null, idx = 0, bricks = [], els = [], trail = [], moves = 0, solAt = 0, busy = false, done = false;
  var geo = { cw: 60, ch: 90, wall: 18 };
  var tray = $('tray'), floor = $('floor'), stage = $('stage'), doorEls = [];

  function unpack(raw) {
    return {
      w: raw.w, h: raw.h, par: raw.par,
      doors: raw.doors.map(function (d) { return { s: d[0], p: d[1], n: d[2], c: d[3] }; }),
      bricks: raw.bricks.map(function (b) { return { x: b[0], y: b[1], w: b[2], h: b[3], c: b[4] }; }),
      sol: raw.sol.map(function (m) { return { x: m[0], y: m[1], w: m[2], h: m[3], dir: m[4], k: m[5], exit: !!m[6] }; })
    };
  }

  var TIPS = {
    1: 'Drag the brick down to its door.',
    2: 'Every colour has its own door: pink to pink, cream to cream.',
    3: 'Something is in the way. Slide it aside first.',
    4: 'A big brick needs a wide door of its colour.',
    5: 'Tap a brick to see which ways it can go. A quick flick sends it all the way.'
  };

  // ---------------------------------------------------------------- size: the tray is as big as the screen allows
  function layout() {
    var r = stage.getBoundingClientRect(), W = level.w, H = level.h;
    var cw = Math.min((r.width - 26) / (W + 0.7), ((r.height - 30) / ASPECT) / (H + 0.7));
    cw = Math.max(26, Math.min(88, Math.floor(cw)));
    var ch = Math.round(cw * ASPECT), wall = Math.max(12, Math.round(cw * 0.3));
    geo = { cw: cw, ch: ch, wall: wall };
    tray.style.setProperty('--cw', cw + 'px'); tray.style.setProperty('--ch', ch + 'px'); tray.style.setProperty('--wall', wall + 'px');
    tray.style.width = W * cw + wall * 2 + 'px'; tray.style.height = H * ch + wall * 2 + 'px';
    floor.style.width = W * cw + 'px'; floor.style.height = H * ch + 'px';
    var out = Math.round(cw * 0.18);
    doorEls.forEach(function (el, n) {
      var d = level.doors[n], tw = W * cw + wall * 2, th = H * ch + wall * 2, x, y, w, h;
      if (d.s === 't' || d.s === 'b') { x = wall + d.p * cw + 3; w = d.n * cw - 6; h = wall + out; y = d.s === 't' ? -out : th - wall; }
      else { y = wall + d.p * ch + 3; h = d.n * ch - 6; w = wall + out; x = d.s === 'l' ? -out : tw - wall; }
      el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.width = w + 'px'; el.style.height = h + 'px';
    });
  }

  function put(el, b, ox, oy) {
    el.style.width = b.w * geo.cw - GAP + 'px'; el.style.height = b.h * geo.ch - GAP + 'px';
    el.style.translate = geo.wall + (b.x + (ox || 0)) * geo.cw + GAP / 2 + 'px ' + (geo.wall + (b.y + (oy || 0)) * geo.ch + GAP / 2) + 'px';
  }

  function buildDoors() {
    doorEls.forEach(function (el) { el.remove(); });
    doorEls = level.doors.map(function (d) {
      var el = document.createElement('div');
      el.className = 'door ' + d.s + ' k' + d.c;
      el.innerHTML = ARROW;
      tray.appendChild(el);
      return el;
    });
  }

  function render(pop) {
    els.forEach(function (el) { el.remove(); });
    els = bricks.map(function (b, n) {
      var el = document.createElement('div');
      el.className = 'brick k' + b.c + (pop ? ' pop' : '');
      el.style.setProperty('--bw', b.w); el.style.setProperty('--bh', b.h); el.style.setProperty('--n', n);
      put(el, b);
      tray.appendChild(el);
      return el;
    });
    lights();
  }

  /** a door glows while some brick could leave through it right now */
  function lights() {
    var on = {};
    var g = R.grid(level, bricks);
    for (var i = 0; i < bricks.length; i++) for (var d = 0; d < 4; d++) {
      var door = R.doorFor(level, bricks, i, R.DIRS[d], g);
      if (door) on[level.doors.indexOf(door)] = true;
    }
    doorEls.forEach(function (el, n) { el.classList.toggle('live', !!on[n]); });
  }

  // ---------------------------------------------------------------- the numbers on top
  function setMoves(n, bump) {
    var b = $('moves'); b.textContent = n;
    if (bump) { b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }
    $('undo').disabled = !trail.length || busy || done;
  }

  function startLevel(i) {
    idx = Math.max(0, Math.min(RAW.length - 1, i));
    level = unpack(RAW[idx]);
    bricks = level.bricks.slice(); trail = []; moves = 0; solAt = 0; busy = false; done = false;
    $('win').hidden = true; $('menu').hidden = true;
    $('level').textContent = idx + 1; $('par').textContent = level.par;
    $('tip').textContent = TIPS[idx + 1] || '';
    tray.classList.remove('enter'); void tray.offsetWidth; tray.classList.add('enter');
    buildDoors(); layout(); render(true); setMoves(0);
    clearHint();
  }

  // ---------------------------------------------------------------- the finger
  var drag = null;
  function soft(off, lo, hi) { return off > hi ? hi + (off - hi) * 0.12 : off < lo ? lo + (off - lo) * 0.12 : off; }

  tray.addEventListener('pointerdown', function (e) {
    if (busy || done || drag) return;
    var el = e.target.closest ? e.target.closest('.brick') : null;
    var i = el ? els.indexOf(el) : -1;
    if (i < 0) return;
    e.preventDefault();
    var g = R.grid(level, bricks), room = {}, door = {};
    R.DIRS.forEach(function (d) { room[d] = R.room(level, bricks, i, d, g); door[d] = R.doorFor(level, bricks, i, d, g, room[d]); });
    drag = { i: i, el: el, id: e.pointerId, sx: e.clientX, sy: e.clientY, axis: '', off: 0, room: room, door: door, pos: 'r', neg: 'l', hits: false, last: [{ t: e.timeStamp, p: 0 }] };
    try { el.setPointerCapture(e.pointerId); } catch (x) { /* the finger is followed anyway */ }
    el.style.transition = 'none';
    el.classList.add('grab'); el.classList.remove('hint');
    clearHint();
  });

  tray.addEventListener('pointermove', function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    var dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (!drag.axis) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 7) return;
      drag.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
    }
    var horiz = drag.axis === 'x', px = horiz ? dx : dy, unit = horiz ? geo.cw : geo.ch;
    var neg = horiz ? 'l' : 'u', pos = horiz ? 'r' : 'd', b = bricks[drag.i], size = horiz ? b.w : b.h;
    var hi = drag.room[pos] + (drag.door[pos] ? size + 0.9 : 0), lo = -(drag.room[neg] + (drag.door[neg] ? size + 0.9 : 0));
    var off = soft(px / unit, lo, hi);
    drag.off = off; drag.pos = pos; drag.neg = neg;
    drag.last.push({ t: e.timeStamp, p: px });
    while (drag.last.length > 1 && e.timeStamp - drag.last[0].t > 90) drag.last.shift();
    put(drag.el, b, horiz ? off : 0, horiz ? 0 : off);
    var room = off >= 0 ? drag.room[pos] : drag.room[neg];
    if (!drag.hits && Math.abs(off) > room + 0.28 && !(off >= 0 ? drag.door[pos] : drag.door[neg])) { drag.hits = true; sfx('nope'); buzz(10); }
  });

  function release(e) {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    var d = drag; drag = null;
    d.el.classList.remove('grab');
    if (!d.axis) { peek(d.i); return; }   // a tap
    var b = bricks[d.i], first = d.last[0], end = d.last[d.last.length - 1];
    var held = e && e.timeStamp - end.t > 70;   // the finger rested before it let go: that is not a flick
    var vel = !held && end.t > first.t ? (end.p - first.p) / (end.t - first.t) : 0;
    var dir = d.off >= 0 ? d.pos : d.neg, toward = d.off >= 0 ? vel : -vel, mag = Math.abs(d.off);
    var r = d.room[dir], door = d.door[dir], flick = toward > 0.9 && mag >= 0.12;
    var leaves = !!door && (mag >= r + 0.35 || flick);
    var k = leaves || flick ? r : Math.min(r, Math.round(mag));
    if (!leaves && k < 1) { glide(d.el, b); return; }
    commit(d.i, dir, k, leaves);
  }
  tray.addEventListener('pointerup', release);
  tray.addEventListener('pointercancel', release);

  /** the brick settles on its cell */
  function glide(el, b) {
    el.style.transition = 'translate .17s cubic-bezier(.2, 1.15, .3, 1)';
    put(el, b);
    window.setTimeout(function () { el.style.transition = ''; }, 200);
  }

  /** a tap: little arrows show which ways the brick can go */
  function peek(i) {
    var el = els[i], g = R.grid(level, bricks), any = false;
    sfx('pick');
    R.DIRS.forEach(function (d) {
      var r = R.room(level, bricks, i, d, g), door = R.doorFor(level, bricks, i, d, g, r);
      if (r < 1 && !door) return;
      any = true;
      var c = document.createElement('span');
      c.className = 'chev ' + d; c.innerHTML = ARROW;
      el.appendChild(c);
      window.setTimeout(function () { if (c.parentNode) c.parentNode.removeChild(c); }, 950);
    });
    if (!any) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); sfx('nope'); buzz(10); toast('This one is stuck for now. Move another brick first.'); }
  }

  // ---------------------------------------------------------------- a move
  function commit(i, dir, k, leaves) {
    var b = bricks[i], el = els[i], want = solAt >= 0 ? level.sol[solAt] : null;
    trail.push({ bricks: bricks, solAt: solAt });
    solAt = want && want.x === b.x && want.y === b.y && want.w === b.w && want.h === b.h && want.dir === dir && want.exit === leaves && (leaves || want.k === k) ? solAt + 1 : -1;
    moves++;
    if (leaves) { goOut(i, dir); setMoves(moves, true); return; }
    bricks = R.slide(bricks, i, dir, k);
    glide(el, bricks[i]);
    sfx('slide'); buzz(8);
    lights(); setMoves(moves, true);
  }

  function goOut(i, dir) {
    var b = bricks[i], el = els[i], horiz = dir === 'l' || dir === 'r';
    var far = R.toWall(level, b, dir) + (horiz ? b.w : b.h) + 0.7, sign = dir === 'l' || dir === 'u' ? -1 : 1;
    busy = true;
    var door = null;
    level.doors.forEach(function (d, n) { if (d.c === b.c && d.s === (dir === 'u' ? 't' : dir === 'd' ? 'b' : dir === 'l' ? 'l' : 'r') && (horiz ? b.y : b.x) >= d.p && (horiz ? b.y + b.h : b.x + b.w) <= d.p + d.n) door = doorEls[n]; });
    el.style.transition = 'translate .36s cubic-bezier(.45, 0, .75, .55)';
    put(el, b, horiz ? sign * far : 0, horiz ? 0 : sign * far);
    sfx('exit'); buzz(16);
    window.setTimeout(function () { sparks(door || el, b.c); }, 170);
    bricks = R.leave(bricks, i); els.splice(i, 1);
    window.setTimeout(function () { el.classList.add('gone'); }, 250);
    window.setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
      busy = false;
      if (!bricks.length) win(); else { lights(); setMoves(moves); }
    }, 480);
  }

  var COLOURS = ['#ff5a9c', '#f2f0ff', '#ffc21f', '#35b4ff', '#2fdc9f', '#a070ff'];
  function sparks(at, c) {
    var r = at.getBoundingClientRect(), fx = $('fx'), n = 12;
    for (var s = 0; s < n; s++) {
      var p = document.createElement('i'), a = (Math.PI * 2 * s) / n + Math.random() * 0.5, d = 26 + Math.random() * 38;
      p.className = 'p'; p.style.setProperty('--c', COLOURS[c % COLOURS.length]);
      p.style.left = r.left + r.width / 2 - 4 + 'px'; p.style.top = r.top + r.height / 2 - 4 + 'px';
      p.style.setProperty('--dx', Math.cos(a) * d + 'px'); p.style.setProperty('--dy', Math.sin(a) * d + 'px');
      fx.appendChild(p);
      window.setTimeout((function (q) { return function () { if (q.parentNode) q.parentNode.removeChild(q); }; })(p), 700);
    }
  }

  function undo() {
    if (busy || done || !trail.length) return;
    var t = trail.pop();
    bricks = t.bricks; solAt = t.solAt; moves = Math.max(0, moves - 1);
    render(false); setMoves(moves);
    sfx('pick');
  }
  function restart() { if (busy) return; sfx('pick'); startLevel(idx); }

  // ---------------------------------------------------------------- the hint: the next move of the shortest way (found again from here when the person left the known way)
  var hintTimer = 0;
  function clearHint() {
    window.clearTimeout(hintTimer);
    els.forEach(function (el) { el.classList.remove('hint'); var a = el.querySelector('.hintArrow'); if (a) a.remove(); });
  }
  function hint() {
    if (busy || done) return;
    clearHint();
    var m = solAt >= 0 && level.sol[solAt] ? level.sol[solAt] : null;
    if (!m) {
      var s = R.solve(level, { bricks: bricks, cap: 120000, ms: 450 });
      if (!s.ok || !s.moves.length) { toast('I can not see the way from here. Try Undo.'); sfx('nope'); return; }
      m = s.moves[0];
    }
    var i = R.find(bricks, m.x, m.y, m.w, m.h);
    if (i < 0) { toast('Try Undo, then ask again.'); return; }
    var a = document.createElement('span');
    a.className = 'hintArrow'; a.innerHTML = ARROW;
    a.style.transform = 'rotate(' + (m.dir === 'u' ? 180 : m.dir === 'l' ? 90 : m.dir === 'r' ? -90 : 0) + 'deg)';
    els[i].classList.add('hint'); els[i].appendChild(a);
    sfx('pick');
    hintTimer = window.setTimeout(clearHint, 2800);
  }

  // ---------------------------------------------------------------- cleared
  function confetti() {
    var fx = $('fx');
    for (var n = 0; n < 70; n++) {
      var p = document.createElement('i');
      p.className = 'f'; p.style.setProperty('--c', COLOURS[n % COLOURS.length]);
      p.style.left = Math.random() * 100 + 'vw'; p.style.setProperty('--dx', (Math.random() - 0.5) * 160 + 'px'); p.style.setProperty('--r', (Math.random() * 900 - 450) + 'deg'); p.style.setProperty('--t', 1.4 + Math.random() * 1.3 + 's');
      p.style.animationDelay = Math.random() * 0.45 + 's';
      fx.appendChild(p);
      window.setTimeout((function (q) { return function () { if (q.parentNode) q.parentNode.removeChild(q); }; })(p), 3400);
    }
  }
  function win() {
    done = true; setMoves(moves);
    var st = R.stars(moves, level.par), n = idx + 1;
    if (st > (saved.stars[n] | 0)) saved.stars[n] = st;
    if (n + 1 > saved.unlocked && n < RAW.length) saved.unlocked = n + 1;
    persist();
    tell({ type: 'level-done', level: n });
    sfx('win'); buzz([20, 40, 30]); confetti();
    var last = n >= RAW.length;
    $('winTitle').textContent = last ? 'All ' + RAW.length + ' levels cleared!' : 'Level ' + n + ' cleared!';
    $('winText').textContent = moves + (moves === 1 ? ' move' : ' moves') + ' · the shortest way is ' + level.par + (st === 3 ? '. Perfect!' : '.');
    Array.prototype.forEach.call($('stars').children, function (el, s) { el.style.setProperty('--s', s); el.className = s < st ? 'on' : 'off'; });
    $('next').style.display = last ? 'none' : '';
    window.setTimeout(function () { $('win').hidden = false; }, 260);
  }

  // ---------------------------------------------------------------- the level list
  function openMenu() {
    var grid = $('grid');
    grid.textContent = '';
    for (var n = 1; n <= RAW.length; n++) {
      var b = document.createElement('button'), s = saved.stars[n] | 0;
      b.type = 'button'; b.className = 'tile' + (n === idx + 1 ? ' now' : ''); b.disabled = n > saved.unlocked;
      b.textContent = n;
      var small = document.createElement('small');
      for (var k = 0; k < 3; k++) { var i = document.createElement('i'); if (k < s) i.className = 'on'; small.appendChild(i); }
      b.appendChild(small);
      b.addEventListener('click', (function (to) { return function () { sfx('pick'); startLevel(to - 1); }; })(n));
      grid.appendChild(b);
    }
    $('menu').hidden = false;
  }

  // ---------------------------------------------------------------- a short message
  var toastTimer = 0;
  function toast(text) {
    var t = $('toast');
    t.textContent = text; t.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { t.classList.remove('show'); }, 2300);
  }

  // ---------------------------------------------------------------- the ranking: this game tells the page "level N was cleared" and asks for the board (messages go only to and from the page that shows it, on this same site)
  var boardEl = $('board'), boardList = $('boardList'), boardMe = $('boardMe'), boardWait = 0;
  function tell(msg) {
    msg.noobGame = 'brick-escape';
    try { window.parent.postMessage(msg, window.location.origin); } catch (e) { /* nobody listens: the game is still fully playable */ }
  }
  function boardNote(text) { boardList.textContent = ''; var li = document.createElement('li'); li.className = 'empty'; li.textContent = text; boardList.appendChild(li); boardMe.textContent = ''; }
  function showBoard(data) {
    window.clearTimeout(boardWait);
    var rows = data && data.entries;
    if (!rows) { boardNote('The ranking is not available right now.'); return; }
    boardList.textContent = '';
    if (!rows.length) { boardNote('Nobody is on the board yet. Clear a level to be the first!'); return; }
    rows.forEach(function (row) {
      var li = document.createElement('li');
      if (row.isMe) li.className = 'me';
      var rank = document.createElement('b'); rank.textContent = row.rank;
      var img = document.createElement('img'); img.alt = ''; if (row.avatar && /^(https?:|data:image\/|\/)/i.test(row.avatar)) img.src = row.avatar;
      var name = document.createElement('span'); name.textContent = row.displayName || row.username || 'Player';
      var lv = document.createElement('em'); lv.textContent = 'Level ' + row.level;
      li.appendChild(rank); li.appendChild(img); li.appendChild(name); li.appendChild(lv);
      boardList.appendChild(li);
    });
    boardMe.textContent = data.me ? 'You are number ' + data.me.rank + ' of ' + data.total + ', at level ' + data.me.level + '.' : 'Clear a level to get on the board.';
  }
  function openBoard() {
    boardEl.hidden = false;
    boardNote('Loading the ranking…');
    tell({ type: 'board-request' });
    window.clearTimeout(boardWait);
    boardWait = window.setTimeout(function () { boardNote('The ranking is not available right now.'); }, 8000);
  }
  window.addEventListener('message', function (e) {
    if (e.origin !== window.location.origin || e.source !== window.parent) return;
    var d = e.data;
    if (d && d.noobGame === 'brick-escape' && d.type === 'board' && !boardEl.hidden) showBoard(d.ok ? d.board : null);
  });

  // ---------------------------------------------------------------- buttons
  $('undo').addEventListener('click', undo);
  $('restart').addEventListener('click', restart);
  $('hint').addEventListener('click', hint);
  $('levels').addEventListener('click', function () { sfx('pick'); openMenu(); });
  $('menuClose').addEventListener('click', function () { $('menu').hidden = true; });
  $('menu').addEventListener('pointerdown', function (e) { if (e.target === $('menu')) $('menu').hidden = true; });
  $('rank').addEventListener('click', function () { sfx('pick'); openBoard(); });
  $('boardClose').addEventListener('click', function () { boardEl.hidden = true; });
  boardEl.addEventListener('pointerdown', function (e) { if (e.target === boardEl) boardEl.hidden = true; });
  $('next').addEventListener('click', function () { sfx('pick'); startLevel(idx + 1); });
  $('again').addEventListener('click', function () { sfx('pick'); startLevel(idx); });
  var soundBtn = $('sound');
  function paintSound() { soundBtn.classList.toggle('off', !saved.sound); }
  soundBtn.addEventListener('click', function () { saved.sound = !saved.sound; persist(); paintSound(); if (saved.sound) sfx('pick'); });
  paintSound();

  var resizing = 0;
  function relayout() {
    window.clearTimeout(resizing);
    resizing = window.setTimeout(function () { if (!level) return; layout(); els.forEach(function (el, n) { el.style.transition = 'none'; put(el, bricks[n]); }); }, 60);
  }
  window.addEventListener('resize', relayout);
  if (window.ResizeObserver) new window.ResizeObserver(relayout).observe(stage);

  if (RAW.length) startLevel(saved.unlocked - 1);
})();
