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

// iPhone, installed from the Home Screen: the page is drawn all the way up under the clock (viewport-fit=cover), so the strip behind the clock is drawn by the page itself and always has the page's own colour.
// (Without this the phone paints that strip by itself and kept it black after a chat.) Everything that belongs to this lives under html.ios-cover in index.css. Off switch: open the app with ?nocover=1, on again with ?cover=1.
(function () {
  try {
    var q = window.location.search;
    if (/[?&]nocover=1/.test(q)) localStorage.setItem('noob_no_cover', '1');
    if (/[?&]cover=1/.test(q)) localStorage.removeItem('noob_no_cover');
    var ios = /iPhone|iPod/.test(navigator.userAgent) && navigator.standalone === true;
    if (!ios || localStorage.getItem('noob_no_cover') === '1') return;
    var vp = document.querySelector('meta[name="viewport"]');
    if (vp && !/viewport-fit=cover/.test(vp.getAttribute('content') || '')) vp.setAttribute('content', (vp.getAttribute('content') || '') + ', viewport-fit=cover');
    document.documentElement.classList.add('ios-cover');
  } catch (e) { /* the page just stays as it was */ }
})();
