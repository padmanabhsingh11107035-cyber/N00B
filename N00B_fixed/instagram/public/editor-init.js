// The editor address (editor.noobsocials.com, or any address opened with ?editor=1) is NOOB Studio: its own name on the tab and the browser bar.
// A file of its own because the site's security policy (public/_headers) does not allow inline scripts. It must stay a plain script placed after the opening screen in index.html.
(function () {
  try {
    if (!/^editor\./i.test(location.hostname) && !/[?&]editor=1/.test(location.search)) return;
    window.__splashSeconds = 1;
    var splash = document.getElementById('noob-splash');
    if (splash) splash.className = 'logo';
    document.title = 'NOOB Studio';
    var set = function (sel, attr, val) { var el = document.querySelector(sel); if (el) el.setAttribute(attr, val); };
    set('meta[name="theme-color"]', 'content', '#09090b');
    set('meta[name="apple-mobile-web-app-title"]', 'content', 'NOOB Studio');
  } catch (e) { /* the normal page still works */ }
})();
