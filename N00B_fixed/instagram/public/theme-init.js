/* Sets the colour theme (Dark / Light / System) before the page is drawn, so there is no flash of the wrong colours.
   The app itself (src/utils/theme.ts) takes over once it has loaded. Kept as a separate file because the site's
   security policy does not allow inline scripts. */
(function () {
  try {
    var saved = localStorage.getItem('noob_theme');
    var pref = saved === 'dark' || saved === 'light' || saved === 'system' ? saved : 'system';
    var dark = pref === 'dark' || (pref === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    var root = document.documentElement;
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    root.setAttribute('data-theme-pref', pref);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', '#d97757');
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
