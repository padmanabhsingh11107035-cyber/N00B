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
      window.location.reload();
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
