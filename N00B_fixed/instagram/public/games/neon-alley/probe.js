// Tells the page around the game (when it is shown in the Games window) that this page loaded or failed, so the window never sits on a blank frame.
(function () {
  try {
    if (window.parent === window) return;
    var tell = function (type, detail) { try { window.parent.postMessage({ type: 'neonalley:' + type, detail: detail }, location.origin); } catch (e) { /* nobody listening */ } };
    tell('hello', '');
    window.addEventListener('error', function (e) { tell('error', String(e.message || 'error')); });
  } catch (e) { /* never let this break the game */ }
})();
