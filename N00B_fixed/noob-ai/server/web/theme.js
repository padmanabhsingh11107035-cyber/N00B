/* NOOB colour theme: Dark / Light / System.
   Loaded first in every page's <head> so the right colours are set before anything is drawn (no flash).
   The choice is remembered per device. "System" (the default) follows the device's own light/dark setting
   and changes with it, live. */
(function () {
  var KEY = "noob_ai_theme";
  var BG = { light: "#faf9f5", dark: "#262624" };
  var query = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  var inMemory = "system"; // used only when the browser blocks storage
  var followed = null;     // set while NOOB AI is shown inside the NOOB app: the app tells it which theme the app is showing

  function preference() {
    try {
      var saved = localStorage.getItem(KEY);
      return saved === "dark" || saved === "light" ? saved : "system";
    } catch (e) {
      return inMemory;
    }
  }

  function apply() {
    var pref = followed || preference();
    var dark = pref === "dark" || (pref === "system" && !!query && query.matches);
    var root = document.documentElement;
    root.setAttribute("data-theme", dark ? "dark" : "light");
    root.setAttribute("data-theme-pref", pref);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.content = dark ? BG.dark : BG.light;
  }

  apply();
  if (query) {
    if (query.addEventListener) query.addEventListener("change", apply);
    else if (query.addListener) query.addListener(apply);
  }
  // Inside the NOOB app (an iframe): follow the app's own light / dark choice instead of only the phone's setting. Only NOOB's own
  // addresses are listened to, and the choice is not saved here (the Colour theme card on this site still works when opened on its own).
  var NOOB_ORIGINS = ["https://nooob.xyz", "https://www.nooob.xyz", "https://noobsocials.com", "https://www.noobsocials.com", "http://localhost:3000", "http://localhost:5173"];
  window.addEventListener("message", function (e) {
    if (NOOB_ORIGINS.indexOf(e.origin) < 0 || !e.data || e.data.type !== "noob-theme") return;
    followed = e.data.theme === "light" ? "light" : "dark";
    apply();
  });
  // another open tab changed it
  window.addEventListener("storage", function (e) {
    if (e.key === KEY) apply();
  });

  window.NoobTheme = {
    get: preference,
    set: function (choice) {
      inMemory = choice === "dark" || choice === "light" ? choice : "system";
      try {
        if (choice === "dark" || choice === "light") localStorage.setItem(KEY, choice);
        else localStorage.removeItem(KEY);
      } catch (e) {
        /* storage blocked: kept in memory for this page only */
      }
      apply();
    }
  };
})();
