// Inside the NOOB Games page this runs first, as a plain script of its own, so the page around the game still hears from it when the game's own code fails to load or start.
// ("hello" = this page loaded and runs scripts; "ready" is sent by the game itself once it is on screen; "error" = what went wrong.)
(function () {
  try {
    if (window.parent === window || !/[?&]embed\b/.test(location.search)) return;
    var tell = function (type, detail) {
      try { window.parent.postMessage({ type: 'helixfall:' + type, detail: detail }, location.origin); } catch (e) { /* the page around the game is gone */ }
    };
    window.__helixTell = tell;
    tell('hello', [
      typeof WebAssembly !== 'undefined' ? 'wasm' : 'NO-wasm',
      typeof OffscreenCanvas !== 'undefined' ? 'offscreen' : 'no-offscreen',
      (window.AudioContext || window.webkitAudioContext) ? 'audio' : 'no-audio',
      'ua=' + navigator.userAgent.slice(0, 120),
    ].join(' '));
    window.addEventListener('error', function (e) {
      var where = e.filename ? ' @ ' + String(e.filename).split('/').pop() + ':' + e.lineno + ':' + e.colno : '';
      tell('error', String(e.message || 'error') + where);
    });
    window.addEventListener('unhandledrejection', function (e) {
      var r = e.reason;
      tell('error', 'promise: ' + String((r && (r.stack || r.message)) || r).slice(0, 300));
    });
  } catch (e) { /* never let the reporter break the game */ }
})();
