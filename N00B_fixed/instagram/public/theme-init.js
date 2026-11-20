/* Sets the colour theme (Dark / Light / System) before the page is drawn, so there is no flash of the wrong colours.
   The app itself (src/utils/theme.ts) takes over once it has loaded. Kept as a separate file because the site's
   security policy does not allow inline scripts. */
// "www.noobsocials.com" (or www.nooob.xyz) opens the same page without the "www": logins and installs belong to one exact address, so there
// must only be one. The path, the query and the #part are kept.
(function () {
  try {
    var l = window.location;
    var m = /^www\.(noobsocials\.com|nooob\.xyz)$/i.exec(l.hostname);
    if (m) l.replace(l.protocol + '//' + m[1].toLowerCase() + (l.port ? ':' + l.port : '') + l.pathname + l.search + l.hash);
  } catch (e) { /* stay where we are */ }
})();

(function () {
  try {
    var saved = localStorage.getItem('noob_theme');
    var pref = saved === 'dark' || saved === 'light' || saved === 'system' ? saved : 'dark';
    var dark = pref === 'dark' || (pref === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    var root = document.documentElement;
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    root.setAttribute('data-theme-pref', pref);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#0a0a0a' : '#ffffff');   // the strip above the app has the colour of the page: near-black in Dark, white in Light
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();

// Phones only (iPhone installed to the Home Screen, and the Android app): the page is drawn all the way up under the clock / camera (viewport-fit=cover), with NO bar of its own behind the clock,
// so everything that scrolls passes through that area. Top bars stop just below it (html.phone-edge in index.css; --sat is the height of that area).
// The Android app (Capacitor) sees viewport-fit=cover and stops padding the page itself. Light theme: the clock icons are switched to dark on Android; an iPhone cannot switch them, so there the page keeps the system's black strip in Light theme.
// Off switch: open the app with ?nocover=1 (back on with ?cover=1).
(function () {
  try {
    var q = window.location.search, root = document.documentElement;
    if (/[?&]nocover=1/.test(q)) localStorage.setItem('noob_nocover', '1');
    if (/[?&]cover=1/.test(q)) localStorage.removeItem('noob_nocover');
    if (localStorage.getItem('noob_nocover') === '1') return;
    var cap = window.Capacitor, native = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
    var ios = /iPhone|iPod/.test(navigator.userAgent) && navigator.standalone === true;
    var android = native && /Android/.test(navigator.userAgent);
    var phone = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) && Math.min(screen.width, screen.height) <= 820;
    if (!phone || !(ios || android)) return;
    var vp = document.querySelector('meta[name="viewport"]');
    if (vp && !/viewport-fit=cover/.test(vp.getAttribute('content') || '')) vp.setAttribute('content', (vp.getAttribute('content') || '') + ', viewport-fit=cover');
    var apply = function () {
      var light = root.getAttribute('data-theme') === 'light';
      if (ios) root.classList.add('phone-ios');   // an iPhone's installed app: its own spacing rules below
      root.classList.add('phone-edge');   // Dark AND Light, on iPhone too: with it only in Dark the Light pages were drawn under the clock with nothing holding them down, and switching mode made the whole page jump
      if (android) root.classList.add('phone-android');   // the Android app: its status strip is ours to colour, so an open chat keeps it as its own separate bar
      if (android) { try { cap.Plugins.SystemBars.setStyle({ style: light ? 'LIGHT' : 'DARK' }); } catch (e) { /* keeps the style from the app's settings */ } }
    };
    apply();
    new MutationObserver(apply).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  } catch (e) { /* the page just stays as it was */ }
})();

// The laptop / computer chat screen (see index.css): off with ?nodeskchat=1, on again with ?deskchat=1 (remembered on this computer).
(function () {
  try {
    var q = window.location.search;
    if (/[?&]nodeskchat=1/.test(q)) localStorage.setItem('noob_nodeskchat', '1');
    if (/[?&]deskchat=1/.test(q)) localStorage.removeItem('noob_nodeskchat');
    if (localStorage.getItem('noob_nodeskchat') === '1') document.documentElement.setAttribute('data-nodeskchat', '1');
  } catch (e) { /* stays on */ }
})();

// Reloading so the NEW version really arrives: a plain reload on an iPhone Home-Screen app can be answered with the saved page, so the page is asked for under a new address (?_r=time; the app removes it again).
function freshPage() {
  try { var u = new URL(window.location.href); u.searchParams.set('_r', String(Date.now())); window.location.replace(u.toString()); }
  catch (e) { window.location.reload(); }
}

// Stylesheet rescue. On some phones the app's main stylesheet is not applied (the page shows as plain text, giant pictures, no design) - e.g. when the phone or the network kept a wrong answer for that
// file's address. The stylesheet sets a marker (--noob-css in index.css); if the marker is missing shortly after the page loaded, or the stylesheet's link reports an error, the same file is asked for again
// under a new address (?cb=...), which no phone or network has a saved answer for. Done at most twice; if that does not help either, the page reloads once.
(function () {
  try {
    var KEY = 'noob_css_rescue';
    var ok = function () { try { return getComputedStyle(document.documentElement).getPropertyValue('--noob-css').replace(/\s/g, '') === '1'; } catch (e) { return true; } };
    var rescue = function () {
      var links = document.querySelectorAll('link[rel="stylesheet"][href*="/assets/"]');
      var n = Number(sessionStorage.getItem(KEY) || '0');
      if (!links.length) return;
      if (n >= 2) { return; }
      sessionStorage.setItem(KEY, String(n + 1));
      for (var i = 0; i < links.length; i++) {
        var old = links[i];
        var href = (old.getAttribute('href') || '').replace(/[?&]cb=\d+/, '');
        var fresh = document.createElement('link');
        fresh.rel = 'stylesheet';
        fresh.href = href + (href.indexOf('?') < 0 ? '?' : '&') + 'cb=' + Date.now() + i;
        document.head.appendChild(fresh);
      }
      window.setTimeout(function () { if (!ok()) rescue(); else sessionStorage.removeItem(KEY); }, 3500);
    };
    var check = function () { if (!ok()) rescue(); };
    window.addEventListener('load', function () { window.setTimeout(check, 600); });
    window.addEventListener('error', function (e) {
      var t = e && e.target;
      if (t && t.tagName && String(t.tagName).toUpperCase() === 'LINK' && /\/assets\/.*\.css/.test(String(t.href || ''))) window.setTimeout(check, 300);
    }, true);
  } catch (e) { /* nothing to rescue with */ }
})();

// Self-heal after an update. When a new version is published while the app is open (or kept in memory), the files the old page asks for no longer exist: the page then loses its stylesheet
// and shows up as plain unstyled text and giant pictures. If a file of the app (/assets/...) fails to load, the app reloads itself to get the new page: at most twice a minute, so it can never loop.
(function () {
  try {
    var KEY = 'noob_heal';
    var heal = function () {
      var now = Date.now();
      var at = Number(sessionStorage.getItem(KEY + '_t') || '0');
      var n = now - at > 60000 ? 0 : Number(sessionStorage.getItem(KEY) || '0');
      if (n >= 2) return;
      sessionStorage.setItem(KEY, String(n + 1));
      sessionStorage.setItem(KEY + '_t', String(now));
      freshPage();
    };
    window.addEventListener('error', function (e) {
      var t = e && e.target;
      if (!t || !t.tagName) return;
      var tag = String(t.tagName).toUpperCase();
      var url = String(t.href || t.src || '');
      if ((tag === 'LINK' || tag === 'SCRIPT') && /\/assets\//.test(url)) heal();
    }, true);
    window.addEventListener('vite:preloadError', heal);
  } catch (e) { /* nothing to heal with */ }
})();

// Stay current without reinstalling. An installed app (iPhone Home Screen, Android) can sit in the background for days on the page it loaded, and when a new version is published
// the files that old page needs are gone (it turns into plain unstyled text). So when the person comes BACK to the app (never while they are using it), it asks the site which
// main file is current; if that is not the one this page runs, the page reloads itself once to get the new version. No change, no reload; a failed question changes nothing.
(function () {
  try {
    var mainOf = function (html) { var m = /\/assets\/main-[A-Za-z0-9_-]+\.js/.exec(html); return m ? m[0] : ''; };
    var mine = function () {
      var s = document.querySelector('script[src*="/assets/main-"]');
      if (!s) return '';
      var src = s.getAttribute('src') || '';
      var m = /\/assets\/main-[A-Za-z0-9_-]+\.js/.exec(src);
      return m ? m[0] : '';
    };
    var current = mine();
    if (!current) return;   // dev server or a page without the built files: nothing to compare
    var leftAt = 0, busy = false;
    var check = function () {
      if (busy) return;
      busy = true;
      fetch('/?fresh=' + Date.now(), { cache: 'no-store', credentials: 'omit' })
        .then(function (r) { return r.ok ? r.text() : ''; })
        .then(function (html) {
          var live = mainOf(html);
          if (live && live !== current) {
            var n = Number(sessionStorage.getItem('noob_upd') || '0');
            if (n < 3) { sessionStorage.setItem('noob_upd', String(n + 1)); freshPage(); }
          }
        })
        .catch(function () { /* offline or a hiccup: try again next time */ })
        .then(function () { busy = false; });
    };
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') { leftAt = Date.now(); return; }
      if (leftAt && Date.now() - leftAt > 20000) check();   // back after more than 20 seconds away
    });
    window.addEventListener('pageshow', function (e) { if (e.persisted) check(); });   // restored from the phone's page memory
    window.setTimeout(function () { sessionStorage.removeItem('noob_upd'); }, 15000);   // a page that stayed up is not stuck in a loop
  } catch (e) { /* nothing to update with */ }
})();
