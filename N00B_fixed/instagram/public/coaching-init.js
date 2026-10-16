// The coaching address (coaching.nooob.xyz, or any address opened with ?coaching=1) is NOOB STUDY: its own logo on the opening screen (3 seconds), its own name and icon.
// This used to be written inside index.html, but the site's security policy (public/_headers) does not allow inline scripts, so the browser blocked it and the
// coaching address never got its own look. As a file of its own it is allowed. It must stay a plain script placed after the opening screen in index.html.
(function () {
  try {
    if (!/^coaching\./i.test(location.hostname) && !/[?&]coaching=1/.test(location.search)) return;
    window.__splashSeconds = 3;
    var img = document.querySelector('#noob-splash img');
    if (img) { img.src = '/noob-study-logo.svg'; img.setAttribute('width', '260'); img.setAttribute('height', '260'); img.style.cssText = 'width:min(62vw,260px);height:auto;aspect-ratio:1/1;border-radius:0;object-fit:contain'; }
    document.title = 'NOOB STUDY';
    var set = function (sel, attr, val) { var el = document.querySelector(sel); if (el) el.setAttribute(attr, val); };
    set('link[rel="manifest"]', 'href', '/manifest-study.json');
    set('link[rel="icon"]', 'href', '/noob-study-logo-192.png');
    set('link[rel="apple-touch-icon"]', 'href', '/noob-study-logo-512.png');
    set('meta[name="theme-color"]', 'content', '#000000');
    set('meta[name="apple-mobile-web-app-title"]', 'content', 'NOOB STUDY');
  } catch (e) { /* the normal page still works */ }
})();
    
