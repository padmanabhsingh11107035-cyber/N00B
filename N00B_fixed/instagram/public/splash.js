// The opening screen of NOOB: a full yellow screen with the NOOB logo (index.html draws it; this file runs in the head, before the first paint, and times it).
// A separate file because the site's security policy does not allow scripts written inside the page.
//  * While it shows, the page background and the browser's theme colour (the strip behind the clock / notch / camera and the bar at the bottom) are yellow too, so no black or white
//    band can show above or below it (html.ns-on, see index.html).
//  * It stays at least MIN_MS (so it is seen), then goes as soon as the app says it is ready (window.__noobSplash.ready(), called by src/main.tsx and App.tsx), and never longer
//    than MAX_MS (1.8 s: if the app is still loading by then the splash fades out and the loading screen, NoobStackLoader, shows by itself). Then it disappears in FADE_MS (60 ms: a longer fade shows the page through a yellow wash), the page background and theme colour are put back, and "noob-splash-end" is sent (src/utils/statusStrip.ts paints the strip again).
//  * NOOB Studio's address (editor-init.js) calls cancel(): it keeps its own black screen, handled by src/main.tsx.
(function () {
  'use strict';
  var YELLOW = '#F8CB46', MIN_MS = 1100, MAX_MS = 1800, FADE_MS = 60;
  var root = document.documentElement;
  var meta = document.querySelector('meta[name="theme-color"]');
  var before = meta ? meta.getAttribute('content') : null;
  var start = Date.now(), isReady = false, done = false, minTimer = 0, maxTimer = 0;
  var api = window.__noobSplash = { active: true, ready: ready, cancel: cancel };

  root.classList.add('ns-on');
  if (!meta && document.head) { meta = document.createElement('meta'); meta.setAttribute('name', 'theme-color'); document.head.appendChild(meta); }
  if (meta) meta.setAttribute('content', YELLOW);

  function restore() {
    root.classList.remove('ns-on');
    if (meta) { if (before) meta.setAttribute('content', before); else if (meta.parentNode) meta.parentNode.removeChild(meta); }
    var base = document.getElementById('noob-splash-base');
    if (base && base.parentNode) base.parentNode.removeChild(base);
    api.active = false;
    try { window.dispatchEvent(new Event('noob-splash-end')); } catch (e) { /* old browser: the strip repaints on its next check */ }
  }
  function finish() {
    if (done) return;
    done = true;
    window.clearTimeout(minTimer); window.clearTimeout(maxTimer);
    var el = document.getElementById('noob-splash');
    if (!el) { restore(); return; }
    el.style.opacity = '0';
    el.style.pointerEvents = 'none';
    window.setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); restore(); }, FADE_MS + 20);
  }
  function check() {
    if (done) return;
    if (isReady && Date.now() - start >= MIN_MS) finish();
  }
  function ready() {
    isReady = true;
    var wait = MIN_MS - (Date.now() - start);
    if (wait <= 0) finish(); else { window.clearTimeout(minTimer); minTimer = window.setTimeout(check, wait + 5); }
  }
  function cancel() {
    if (done) return;
    done = true;
    window.clearTimeout(minTimer); window.clearTimeout(maxTimer);
    restore();
  }
  maxTimer = window.setTimeout(finish, MAX_MS);
})();
