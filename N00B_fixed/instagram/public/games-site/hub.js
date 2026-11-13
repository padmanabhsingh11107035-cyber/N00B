// NOOB Games hub (the page at the root of the separate games address). Plain script, no framework, no network except its own games.json and the games' own pages.
// It holds NO sign-in and no app code: a guest plays here, and "Sign up / Log in" only opens the app's own address.
(function () {
  'use strict';

  var APP_URL = 'https://noobsocials.com/';
  var KEY = 'noobGamesNotNowUntil';
  var WEEK = 7 * 24 * 3600 * 1000;

  // ---- the first-visit dialog: shown unless "Not now" was pressed less than 7 days ago. Storage can be blocked: then it is simply shown each time.
  function shouldPrompt(storage, now) {
    try {
      var until = Number(storage.getItem(KEY));
      return !(until > now);
    } catch (e) { return true; }
  }
  function rememberNotNow(storage, now) {
    try { storage.setItem(KEY, String(now + WEEK)); } catch (e) { /* blocked: the dialog just shows again next time */ }
  }

  // ---- guests have no ranking and earn nothing: the games ask their page (this one) for a ranking / an online room and wait for an answer. Each question gets an honest
  // "not available" so the game starts and plays; scores, levels and online messages are never answered or kept. Replies go to this page's own exact origin, never "*".
  function guestReply(d) {
    if (!d || typeof d !== 'object') return null;
    if (typeof d.noobScore === 'string' && d.type === 'board-request') return { noobScore: d.noobScore.slice(0, 60), type: 'board', ok: false, board: null };
    if (typeof d.noobGame === 'string' && d.type === 'board-request') return { noobGame: d.noobGame.slice(0, 60), type: 'board', ok: false, board: null };
    if (typeof d.noobMp === 'string' && d.type === 'join') return { noobMp: d.noobMp.slice(0, 60), type: 'error' };
    return null;
  }

  var api = { shouldPrompt: shouldPrompt, rememberNotNow: rememberNotNow, guestReply: guestReply, KEY: KEY, WEEK: WEEK, APP_URL: APP_URL };
  if (typeof window !== 'undefined') window.NoobGamesHub = api;

  if (typeof document === 'undefined' || !document.getElementById || !document.getElementById('grid')) return;   // loaded by a test: nothing to draw

  var $ = function (id) { return document.getElementById(id); };
  var grid = $('grid'), status = $('status'), home = $('home'), player = $('player'), stage = $('stage'), playTitle = $('playTitle');
  var overlay = $('overlay'), dialog = $('dialog'), notNow = $('dlgNotNow'), signup = $('dlgSignup'), fsBtn = $('fs');
  var games = [], frame = null, openId = '', lastFocus = null;

  function store() { try { return window.localStorage; } catch (e) { return null; } }

  // ---- the dialog (focus stays inside while it is open; Escape = Not now)
  function openDialog() {
    lastFocus = document.activeElement;
    overlay.hidden = false;
    signup.focus();
  }
  function closeDialog() {
    overlay.hidden = true;
    var s = store();
    if (s) rememberNotNow(s, Date.now());
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) { /* gone */ } }
  }
  notNow.addEventListener('click', closeDialog);
  overlay.addEventListener('click', function (e) { if (e.target === overlay) closeDialog(); });
  document.addEventListener('keydown', function (e) {
    if (overlay.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); closeDialog(); return; }
    if (e.key === 'Tab') {
      var items = [signup, notNow];
      var i = items.indexOf(document.activeElement);
      e.preventDefault();
      items[(i + (e.shiftKey ? -1 : 1) + items.length) % items.length].focus();
    }
  });

  // ---- the list
  function card(g) {
    var li = document.createElement('li');
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'card';
    b.setAttribute('aria-label', 'Play ' + g.title);
    var t;
    if (g.poster) { t = document.createElement('img'); t.src = g.poster; t.alt = ''; t.loading = 'lazy'; t.decoding = 'async'; t.className = 'thumb'; t.width = 320; t.height = 180; }
    else { t = document.createElement('div'); t.className = 'thumb none'; }
    var m = document.createElement('div'); m.className = 'meta';
    var n = document.createElement('span'); n.className = 'name'; n.textContent = g.title;
    var d = document.createElement('span'); d.className = 'desc'; d.textContent = g.description || '';
    var p = document.createElement('span'); p.className = 'play'; p.textContent = 'Play';
    m.appendChild(n); if (g.description) m.appendChild(d); m.appendChild(p);
    b.appendChild(t); b.appendChild(m);
    b.addEventListener('click', function () { openGame(g.id, true); });
    li.appendChild(b);
    return li;
  }

  // ---- a game, full screen under the line on top
  function openGame(id, push) {
    var g = games.filter(function (x) { return x.id === id; })[0];
    if (!g) { closeGame(false); return; }
    closeFrame();
    openId = id;
    playTitle.textContent = g.title;
    stage.className = 'stage' + (g.portrait ? '' : ' turn');
    var load = document.createElement('div'); load.className = 'loading'; load.textContent = 'Loading ' + g.title + '...';
    var f = document.createElement('iframe');
    f.title = g.title;
    f.setAttribute('allow', 'autoplay; fullscreen; gamepad');
    f.setAttribute('allowfullscreen', '');
    f.setAttribute('referrerpolicy', 'no-referrer');
    // boxed in: it can run and keep its own saves on this address (which holds no sign-in); it cannot send the visitor's page elsewhere
    f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-pointer-lock allow-popups');
    f.addEventListener('load', function () { load.className = 'loading gone'; });
    f.src = g.url;
    stage.textContent = '';
    stage.appendChild(f); stage.appendChild(load);
    frame = f;
    home.hidden = true; player.hidden = false;
    fsBtn.hidden = !(document.documentElement.requestFullscreen);
    document.title = g.title + ' - NOOB Games';
    if (push) { try { history.pushState({ game: id }, '', '#' + id); } catch (e) { /* the address stays; Back still works through the button */ } }
    try { f.focus(); } catch (e) { /* not focusable yet */ }
  }
  function closeFrame() {
    if (frame) { try { frame.src = 'about:blank'; } catch (e) { /* removed next */ } }
    stage.textContent = '';
    frame = null; openId = '';
  }
  function closeGame(fromHistory) {
    closeFrame();
    player.hidden = true; home.hidden = false;
    document.title = 'NOOB Games - play free in your browser';
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { /* nothing to undo */ }
    if (!fromHistory && /^#./.test(location.hash)) {
      // opened by us: step back; opened straight from a link with #game: just clear the address
      try { if (history.state && history.state.game) history.back(); else history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* the list is already shown */ }
    }
  }
  $('back').addEventListener('click', function () { closeGame(false); });
  window.addEventListener('popstate', function () {
    var id = location.hash.replace(/^#/, '');
    if (id && games.length) openGame(id, false); else closeGame(true);
  });
  fsBtn.addEventListener('click', function () {
    try { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); } catch (e) { /* not allowed here */ }
  });

  // ---- answers to the open game (only from its own frame, only from this exact origin)
  window.addEventListener('message', function (e) {
    if (!frame || e.source !== frame.contentWindow || e.origin !== window.location.origin) return;
    var r = guestReply(e.data);
    if (r) { try { frame.contentWindow.postMessage(r, window.location.origin); } catch (err) { /* the game went away */ } }
  });

  // ---- start
  var s0 = store();
  fetch('/games.json', { credentials: 'omit' }).then(function (r) { if (!r.ok) throw new Error('list'); return r.json(); }).then(function (j) {
    games = (j && j.games) || [];
    status.textContent = '';
    games.forEach(function (g) { grid.appendChild(card(g)); });
    var id = location.hash.replace(/^#/, '');
    if (id && games.some(function (g) { return g.id === id; })) openGame(id, false);
  }).catch(function () {
    status.textContent = 'The games could not be loaded. Check your connection and reload the page.';
  });
  if (!s0 || shouldPrompt(s0, Date.now())) openDialog();
})();
