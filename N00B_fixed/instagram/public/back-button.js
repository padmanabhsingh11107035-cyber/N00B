// "Back" on the plain pages (About, Privacy Policy, Terms, Delete your data): goes to the page the visitor came from when that was a page of this site; otherwise the link's
// own address (the home page) is followed. A separate file because the site's security rules do not allow scripts written inside a page.
(function () {
  var buttons = document.querySelectorAll('[data-back]');
  var sameSite = false;
  try { sameSite = !!document.referrer && new URL(document.referrer).origin === location.origin; } catch (e) { sameSite = false; }
  for (var i = 0; i < buttons.length; i++) {
    buttons[i].addEventListener('click', function (e) {
      if (sameSite && history.length > 1) { e.preventDefault(); history.back(); }
    });
  }
})();
