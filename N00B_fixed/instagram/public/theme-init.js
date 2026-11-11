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
      if (ios) root.classList.toggle('phone-edge', !light);
      else root.classList.add('phone-edge');
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
