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
    if (meta) meta.setAttribute('content', dark ? '#0a0a0a' : '#ffffff');
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
