// NOOB opening animation (4 seconds), drawn live on a canvas, with its sound. It is the same animation as promo/opening.py (which makes the video of it): in the dark a pen draws NOOB,
// its two O's are eyes, like the logo; the letters fill in, the eyes look left and right, blink and look at you; the camera dives into the pupil, and the app opens out of it like an iris.
// Nothing is downloaded for the picture except opening-data.js (the outlines of N and B and the doodles, 13 KB) and this file; the sound is opening.mp3 (about 60 KB).
//
// It replaces the logo splash of index.html: it must stay a plain script placed after coaching-init.js and editor-init.js (those two keep their own opening screen: they set
// window.__splashSeconds, and then this script does nothing). It does nothing either when the device asks for reduced motion (the logo splash stays). While it plays, src/main.tsx leaves the
// splash alone (window.__noobOpening is set) and this script removes it at the end, so the app opens straight out of the animation (the burger loading screen only shows if the app is
// still loading by then).
(function () {
  'use strict';
  var D = window.__NOOB_OPENING_DATA;
  var splash = document.getElementById('noob-splash');
  if (!D || !splash || window.__noobOpening || window.__splashSeconds) return;
  try { if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return; } catch (e) { /* no media queries: play it */ }
  var canvas = document.createElement('canvas');
  var ctx = canvas.getContext && canvas.getContext('2d');
  if (!ctx || typeof Path2D === 'undefined') return;

  // ---------------------------------------------------------------- the same numbers as promo/opening.py (a 1080 x 1920 picture, y down)
  var W = 1080, H = 1920, T = 4.0, CX = W / 2, CY = H / 2;
  var CAP = 200, R = 102, GAP = 12, WN = 170, WB = 176;
  var X0 = CX - (WN + 4 * R + WB + 3 * GAP) / 2;
  var LET = { N: X0 + WN / 2, O1: X0 + WN + GAP + R, O2: X0 + WN + GAP + 2 * R + GAP + R, B: X0 + WN + GAP + 4 * R + 2 * GAP + WB / 2 };
  var LCY = CY, Z0X = CX, Z0Y = CY + 40;
  var S_END = 90, ZOOM_A = 2.28, ZOOM_B = 3.12, REVEAL_A = 3.10, REVEAL_B = 3.72;
  var STARTS = { N: 0.18, O1: 0.30, O2: 0.42, B: 0.54 }, FILLS = { N: 1.10, O1: 1.17, O2: 1.24, B: 1.31 };

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function prog(t, a, b) { return clamp((t - a) / (b - a), 0, 1); }
  function smooth(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }
  function outCubic(u) { u = clamp(u, 0, 1); return 1 - Math.pow(1 - u, 3); }
  function inOut(u) { u = clamp(u, 0, 1); return 0.5 * (1 - Math.cos(Math.PI * u)); }
  function outBack(u) { u = clamp(u, 0, 1); var k = 1.9; return 1 + (k + 1) * Math.pow(u - 1, 3) + k * Math.pow(u - 1, 2); }

  // ---------------------------------------------------------------- the shapes
  function toPts(flat) { var p = []; for (var i = 0; i + 1 < flat.length; i += 2) p.push([flat[i], flat[i + 1]]); return p; }
  var OUT = { N: D.N.map(toPts), B: D.B.map(toPts) };
  var DOODLES = D.doodles.map(function (d) { return { a: d.a, b: d.b, paths: d.paths.map(toPts) }; });
  // a closed outline, smoothed through the middles of its points (the letters are heavy and rounded, like the logo)
  function smoothPath(contours) {
    var path = new Path2D();
    contours.forEach(function (c) {
      var n = c.length;
      if (n < 3) return;
      path.moveTo((c[0][0] + c[1][0]) / 2, (c[0][1] + c[1][1]) / 2);
      for (var i = 1; i <= n; i++) {
        var p = c[i % n], q = c[(i + 1) % n];
        path.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
      }
      path.closePath();
    });
    return path;
  }
  var PATH = { N: smoothPath(OUT.N), B: smoothPath(OUT.B) };

  // ---------------------------------------------------------------- the camera and the screen
  var cw = 0, ch = 0, K = 1, offX = 0, offY = 0, vignette = null;
  var cam = { s: 1, A: 1, E: 0, F: 0 };
  function size() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(1, Math.round(window.innerWidth * dpr)), h = Math.max(1, Math.round(window.innerHeight * dpr));
    if (w !== cw || h !== ch) {
      cw = w; ch = h; canvas.width = w; canvas.height = h; vignette = null;
    }
    K = Math.min(cw, ch) / 1000;
    offX = cw / 2 - W / 2 * K;
    offY = ch / 2 - H / 2 * K;
  }
  function setCam(t) {
    var u = prog(t, ZOOM_A, ZOOM_B);
    var s = Math.exp(Math.log(S_END) * Math.pow(u, 2.3));
    var k = smooth(u * 1.15);
    var zx = Z0X + (LET.O2 - Z0X) * k, zy = Z0Y + (LCY - Z0Y) * k;
    var sh = t > 3.08 ? 16 * Math.exp(-(t - 3.08) * 14) : 0;
    var kx = Math.sin(t * 91) * sh, ky = Math.cos(t * 77) * sh;
    cam.s = s;
    cam.A = s * K;
    cam.E = (-zx * s + W / 2 + kx) * K + offX;
    cam.F = (-zy * s + H / 2 + ky) * K + offY;
  }
  function SX(x) { return cam.A * x + cam.E; }
  function SY(y) { return cam.A * y + cam.F; }

  // ---------------------------------------------------------------- what each letter is doing
  function letter(t, key) {
    var draw = inOut(prog(t, STARTS[key], STARTS[key] + 0.62));
    var fill = smooth(prog(t, FILLS[key], FILLS[key] + 0.2));
    var pop = t > FILLS[key] ? 1 + 0.07 * Math.sin(Math.PI * prog(t, FILLS[key], FILLS[key] + 0.28)) : 1;
    return { draw: draw, fill: fill, pop: pop };
  }
  // where the eyes look (in eye radii) and how open they are
  function gaze(t) {
    var gx = 0, blink = 1;
    if (t > 1.55) gx = -0.14 * smooth(prog(t, 1.55, 1.68));
    if (t > 1.82) gx = -0.14 + 0.28 * smooth(prog(t, 1.82, 1.96));
    if (t > 2.06) gx = 0.14 * (1 - smooth(prog(t, 2.06, 2.20)));
    if (t > 1.98 && t < 2.14) blink = Math.abs(Math.cos(Math.PI * prog(t, 1.98, 2.14))) * 0.88 + 0.12;
    return { gx: gx, gy: 0, blink: blink, open: outBack(prog(t, 1.30, 1.52)) };
  }

  function glow(px, alpha) {
    if (px > 0) { ctx.shadowBlur = px; ctx.shadowColor = 'rgba(255,255,255,' + alpha + ')'; }
    else { ctx.shadowBlur = 0; ctx.shadowColor = 'rgba(0,0,0,0)'; }
  }
  function poly(pts, n) {
    ctx.moveTo(SX(pts[0][0]), SY(pts[0][1]));
    for (var i = 1; i < n; i++) ctx.lineTo(SX(pts[i][0]), SY(pts[i][1]));
  }
  function sparkle(x, y, size) {
    if (size < 1) return;
    ctx.fillStyle = '#fff';
    for (var q = 0; q < 2; q++) {
      var dx = q ? 0 : size, dy = q ? size : 0;
      ctx.beginPath();
      ctx.moveTo(x - dx, y - dy);
      ctx.lineTo(x + dy * 0.12, y - dx * 0.12);
      ctx.lineTo(x + dx, y + dy);
      ctx.lineTo(x - dy * 0.12, y + dx * 0.12);
      ctx.closePath();
      ctx.fill();
    }
    ctx.beginPath(); ctx.arc(x, y, size * 0.14, 0, Math.PI * 2); ctx.fill();
  }

  // ---------------------------------------------------------------- one frame of the world (white on black)
  function world(t) {
    var s = cam.s;
    var st = { N: letter(t, 'N'), O1: letter(t, 'O1'), O2: letter(t, 'O2'), B: letter(t, 'B') };
    var eyes = gaze(t);
    var pen = 1 - smooth(prog(t, 1.18, 1.5));
    var halo = t < 1.6 ? 44 * K : 0;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // the pen: outlines drawn on, with a bright tip
    if (pen > 0) {
      var tips = [];
      glow(halo, 0.9);
      ctx.strokeStyle = 'rgba(255,255,255,' + pen + ')'; ctx.lineWidth = 5 * K;
      ['N', 'B'].forEach(function (key) {
        var d = st[key].draw;
        if (d <= 0) return;
        ctx.beginPath();
        OUT[key].forEach(function (c) {
          var n = Math.max(2, Math.floor(c.length * d));
          poly(c, Math.min(n, c.length));
          if (d < 1) tips.push([SX(c[Math.min(n, c.length) - 1][0]), SY(c[Math.min(n, c.length) - 1][1])]);
        });
        ctx.stroke();
      });
      ['O1', 'O2'].forEach(function (key) {
        var d = st[key].draw;
        if (d <= 0) return;
        var cx = SX(LET[key]), cy = SY(LCY), r = R * s * K, a0 = -Math.PI / 2, a1 = a0 + Math.PI * 2 * d;
        ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1); ctx.stroke();
        if (d < 1) tips.push([cx + Math.cos(a1) * r, cy + Math.sin(a1) * r]);
      });
      ctx.fillStyle = '#fff';
      tips.forEach(function (p) { ctx.beginPath(); ctx.arc(p[0], p[1], 9 * K, 0, Math.PI * 2); ctx.fill(); });
      glow(0, 0);
    }

    // the doodles around the word, drawn by hand, gone before the dive
    if (t < 2.4) {
      var dFade = 1 - smooth(prog(t, 2.0, 2.3));
      if (dFade > 0) {
        ctx.strokeStyle = 'rgba(255,255,255,' + dFade + ')'; ctx.lineWidth = 5 * K * Math.min(s, 2.5);
        glow(halo, 0.9);
        DOODLES.forEach(function (dd) {
          var u = outCubic(prog(t, dd.a, dd.b));
          if (u <= 0) return;
          var total = 0, i;
          for (i = 0; i < dd.paths.length; i++) total += dd.paths[i].length;
          var budget = u * total;
          ctx.beginPath();
          for (i = 0; i < dd.paths.length && budget > 1; i++) {
            var p = dd.paths[i], n = Math.min(p.length, Math.floor(budget));
            budget -= p.length;
            if (n >= 2) poly(p, n);
          }
          ctx.stroke();
        });
        glow(0, 0);
      }
    }

    // the letters and the eyes, white, with a soft glow that grows as the camera dives
    var bloom = 0.30 + 0.5 * smooth(prog(t, ZOOM_A, ZOOM_B));
    var shine = t > 1.1 && s < 3 ? 76 * K : 0;
    ['N', 'B'].forEach(function (key) {
      var L = st[key];
      if (L.fill <= 0) return;
      var wd = key === 'N' ? WN : WB, cx = LET[key];
      var l = SX(cx - wd / 2 * 1.1), r = SX(cx + wd / 2 * 1.1), tp = SY(LCY - CAP / 2 * 1.1), bt = SY(LCY + CAP / 2 * 1.1);
      if (r < -50 || l > cw + 50 || bt < -50 || tp > ch + 50) return;
      var k = L.pop * s;
      ctx.setTransform(cam.A, 0, 0, cam.A, cam.E, cam.F);
      ctx.translate(cx, LCY); ctx.scale(L.pop, L.pop); ctx.translate(-cx, -LCY);
      if (L.fill < 1) {   // the fill wipes in from the left, with a soft edge
        var edge = cx - wd / 2 + wd * L.fill * 1.15, ramp = 40 * Math.max(k, 1) / k;
        var g = ctx.createLinearGradient(edge - ramp, 0, edge, 0);
        g.addColorStop(0, '#fff'); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
      } else ctx.fillStyle = '#fff';
      glow(shine, bloom);
      ctx.fill(PATH[key], 'evenodd');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      glow(0, 0);
    });
    ['O1', 'O2'].forEach(function (key) {
      var L = st[key];
      if (L.fill <= 0) return;
      var cx = SX(LET[key]), cy = SY(LCY), r = R * L.pop * s * K;
      if (cx + r < -50 || cx - r > cw + 50 || cy + r < -50 || cy - r > ch + 50) return;
      ctx.fillStyle = 'rgba(255,255,255,' + Math.min(1, L.fill * 1.4) + ')';
      glow(shine, bloom);
      ctx.beginPath(); ctx.arc(cx, cy, L.fill < 1 ? r * (0.2 + 0.8 * L.fill) : r, 0, Math.PI * 2); ctx.fill();
      glow(0, 0);
      if (L.fill >= 0.6 && eyes.open > 0) {   // the eye: a big black pupil with a white glint at its upper right
        var rp = R * 0.64 * s * L.pop * eyes.open * K;
        var px = cx + eyes.gx * R * s * L.pop * K, py = cy + eyes.gy * R * s * L.pop * K;
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.ellipse(px, py, Math.max(rp, 0.01), Math.max(rp * (eyes.blink < 0.999 ? eyes.blink : 1), 0.01), 0, 0, Math.PI * 2); ctx.fill();
        if (eyes.blink > 0.6) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px + rp * 0.34, py - rp * 0.36, rp * 0.20, 0, Math.PI * 2); ctx.fill(); }
      }
    });

    // a sparkle as each letter fills
    [['N', 1.12], ['O1', 1.19], ['O2', 1.26], ['B', 1.33]].forEach(function (e) {
      var u = prog(t, e[1], e[1] + 0.30);
      if (u > 0 && u < 1) sparkle(SX(LET[e[0]] + 40), SY(LCY - CAP / 2 - 52), 62 * K * Math.pow(Math.sin(Math.PI * u), 0.8));
    });
  }

  // the corners are a little darker
  function drawVignette() {
    if (!vignette) {
      var d = Math.hypot(cw, ch) / 2;
      vignette = ctx.createRadialGradient(cw / 2, ch / 2, d * 0.35, cw / 2, ch / 2, d);
      vignette.addColorStop(0, 'rgba(0,0,0,0)'); vignette.addColorStop(1, 'rgba(0,0,0,0.38)');
    }
    ctx.fillStyle = vignette; ctx.fillRect(0, 0, cw, ch);
  }

  // the app opens out of the pupil like an iris: a growing hole in the picture, with a bright ring on its edge
  function iris(t) {
    if (t < REVEAL_A) return;
    var ur = outCubic(prog(t, REVEAL_A, REVEAL_B));
    var rad = ur * Math.hypot(cw, ch) * 0.6;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(cw / 2, ch / 2, rad, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    if (ur > 0 && ur < 1) {
      ctx.strokeStyle = 'rgba(255,255,255,' + Math.pow(1 - ur, 0.7) + ')'; ctx.lineWidth = 8 * K;
      glow(60 * K, 1);
      ctx.beginPath(); ctx.arc(cw / 2, ch / 2, rad, 0, Math.PI * 2); ctx.stroke();
      glow(0, 0);
    }
  }

  function drawFrame(t) {
    size();
    setCam(t);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    glow(0, 0);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cw, ch);
    world(t);
    drawVignette();
    iris(t);
  }

  // ---------------------------------------------------------------- run
  var t0 = performance.now(), raf = 0, over = false;
  function finish() {
    over = true;
    disarm();
    if (splash.parentNode) splash.parentNode.removeChild(splash);
  }
  function tick() {
    if (over) return;
    if (!splash.parentNode) { over = true; disarm(); return; }
    var t = (performance.now() - t0) / 1000;
    if (t >= T) { finish(); return; }
    drawFrame(t);
    raf = requestAnimationFrame(tick);
  }

  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;display:block';
  window.__noobOpening = {
    duration: T,
    renderAt: function (t) { drawFrame(t); },
    stop: function () { over = true; cancelAnimationFrame(raf); }
  };
  try {
    drawFrame(0);
    splash.appendChild(canvas);
    splash.style.background = 'transparent';
    var logo = splash.querySelector('img');
    if (logo) logo.style.display = 'none';
  } catch (e) { window.__noobOpening = undefined; return; }

  // The sound. A laptop, an installed Android app and the NOOB app for Android let a page make a sound on its own, so it plays from the first moment. An iPhone (and a phone's
  // browser tab) refuses until the person has touched the screen: then the picture plays on, a small "Tap for sound" shows, and the first touch starts the sound at the place the
  // picture has reached (what is left of the 4 seconds is heard: the dive, the boom, the sparkle). Nothing else on the page happens with that touch.
  var sound = null, armed = false, pill = null, pillTimer = 0;
  var GESTURES = ['touchend', 'pointerup', 'click', 'keydown'];
  function startSound() {
    var t = (performance.now() - t0) / 1000;
    if (!sound || t > T - 0.4) return Promise.resolve();
    try { if (t > 0.25 && sound.readyState >= 1) sound.currentTime = t; } catch (e) { /* plays from the start */ }
    var p = sound.play();
    return p && p.then ? p : Promise.resolve();
  }
  function disarm() {
    if (!armed && !pill) return;
    armed = false;
    GESTURES.forEach(function (n) { document.removeEventListener(n, unlock, true); });
    window.clearTimeout(pillTimer);
    if (pill && pill.parentNode) pill.parentNode.removeChild(pill);
    pill = null;
  }
  function unlock() {
    if (!armed || over) return;
    startSound().then(disarm, function () { /* still refused: try again at the next touch */ });
  }
  function blocked() {
    if (over || armed) return;
    armed = true;
    GESTURES.forEach(function (n) { document.addEventListener(n, unlock, true); });
    try {
      pill = document.createElement('div');
      pill.setAttribute('aria-hidden', 'true');
      pill.style.cssText = 'position:absolute;left:50%;bottom:calc(34px + env(safe-area-inset-bottom, 0px));transform:translateX(-50%);display:flex;align-items:center;gap:8px;padding:10px 18px;border-radius:999px;'
        + 'background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.3);color:#fff;font:600 14px/1 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;letter-spacing:.02em;pointer-events:none;opacity:0;transition:opacity .4s ease;white-space:nowrap';
      pill.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span>Tap for sound</span>';
      splash.appendChild(pill);
      pillTimer = window.setTimeout(function () { if (pill) pill.style.opacity = '1'; }, 60);
    } catch (e) { pill = null; }
  }
  try {
    sound = new Audio('/opening/opening.mp3?v=2');
    sound.preload = 'auto';
    sound.volume = 0.9;
    startSound().then(undefined, blocked);
  } catch (e) { sound = null; }

  raf = requestAnimationFrame(tick);
  // a page that is not being drawn (a tab in the background) gets no animation frames: the splash must still go, so the app is never left behind it
  window.setTimeout(function () { if (!over) finish(); }, (T + 0.5) * 1000);
})();
