// "NOOB is taking a short break": the page that stands alone when NOOB cannot start. Two places use this file (a separate file because the site's security rules do not allow scripts written
// inside a page):
//  * index.html loads it first. If the app has not started 25 seconds later, or one of its files fails to load (the server is down, a new version is half-way up), it shows the page
//    below over everything (no blank screen, no browser error page) and keeps checking; the moment NOOB answers again it opens by itself. main.tsx sets window.__noobBooted when the app starts.
//  * public/app-down.html (the page the service worker shows when a page cannot be fetched at all) loads it for the same checking and the Try again button.
(function () {
  var shown = false;
  var page = document.querySelector('[data-noob-down]');

  function back() {
    var down = location.pathname === '/app-down' || location.pathname === '/app-down.html';
    if (down) { location.replace('/'); return; }
    // never in a loop: at most one automatic reload every 30 seconds (a slow connection must be left to finish loading)
    try {
      var last = Number(sessionStorage.getItem('noob_guard_reload') || 0);
      if (Date.now() - last < 30000) return;
      sessionStorage.setItem('noob_guard_reload', String(Date.now()));
    } catch (e) { /* storage is off: reload anyway */ }
    location.reload();
  }
  function check() {
    try {
      fetch('/version.json', { cache: 'no-store' }).then(function (r) { if (r && r.ok) back(); }).catch(function () { /* still down */ });
    } catch (e) { /* old browser: the button still works */ }
  }
  function watch() {
    window.setInterval(check, 10000);
    window.addEventListener('online', check);
  }

  function show() {
    if (shown || window.__noobBooted) return;
    shown = true;
    var splash = document.getElementById('noob-splash');
    if (splash && splash.parentNode) splash.parentNode.removeChild(splash);
    var o = document.createElement('div');
    o.setAttribute('role', 'alert');
    o.setAttribute('data-noob-down-overlay', '');
    o.style.cssText = 'position:fixed;inset:0;z-index:2147483600;background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;text-align:center;overflow:auto';
    o.innerHTML =
      '<div style="width:100%;max-width:360px;border:1px solid rgba(255,255,255,.16);border-radius:28px;padding:30px 22px 24px;background:#101012">' +
      '<img src="/noob-logo-circle.png" alt="NOOB" width="88" height="88" style="width:88px;height:88px;border-radius:50%;object-fit:cover;border:1px solid rgba(255,255,255,.22)">' +
      '<div aria-hidden="true" style="margin-top:14px;font-size:54px;font-weight:900;letter-spacing:-.02em">BRB</div>' +
      '<h1 style="margin:6px 0 0;font-size:21px;font-weight:900">NOOB is taking a short break</h1>' +
      '<p style="margin:10px auto 0;max-width:300px;font-size:14px;line-height:1.55;color:#b8b8bd">We cannot reach NOOB right now. This is usually over in a minute or two. Your account and everything you posted are safe.</p>' +
      '<button type="button" style="margin-top:18px;width:100%;padding:13px 24px;border:0;border-radius:999px;background:#fff;color:#000;font-weight:800;font-size:15px;cursor:pointer">Try again</button>' +
      '<div style="font-size:11px;color:#77777c;margin-top:12px">NOOB opens again by itself as soon as it is back.</div>' +
      '</div>';
    document.body.appendChild(o);
    var btn = o.querySelector('button');
    if (btn) btn.addEventListener('click', function () { location.reload(); });
    // the app did start after all (a very slow connection): the page goes away by itself
    var gone = window.setInterval(function () {
      if (window.__noobBooted) { if (o.parentNode) o.parentNode.removeChild(o); window.clearInterval(gone); }
    }, 1000);
    watch();
  }

  if (page) {
    var retry = document.getElementById('noob-down-retry');
    if (retry) retry.addEventListener('click', back);
    watch();
    return;
  }

  // one of the app's own files failed to load: the server is down or the new version is not all there yet
  window.addEventListener('error', function (e) {
    var t = e && e.target;
    if (t && t.tagName === 'SCRIPT' && /\/assets\//.test(t.src || '')) show();
  }, true);
  window.addEventListener('unhandledrejection', function (e) {
    var m = String((e && e.reason && (e.reason.message || e.reason)) || '');
    if (/Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(m) && !window.__noobBooted) show();
  });
  // or the app simply never started
  window.setTimeout(show, 25000);
})();
