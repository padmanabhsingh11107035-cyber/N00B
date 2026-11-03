// NOOB score games: sends the player's score to NOOB (the Games page that shows this game answers, and saves it for the signed-in player) and shows the ranking.
// Use:  <script src="/games/_shared/noob-score.js" data-game="flappy20"></script>   then   NoobScore.submit(score)  when a round ends.
// A small round trophy button (top right) opens the board. It does nothing when the game is opened on its own, outside NOOB. No network of its own: it only talks to the page that shows it.
(function () {
  'use strict';
  var tag = document.currentScript;
  var GAME = (tag && tag.getAttribute('data-game')) || '';
  var inFrame = window.parent !== window;
  var panel, list, mine, button, status;
  function post(msg) { if (inFrame && GAME) window.parent.postMessage(Object.assign({ noobScore: GAME }, msg), window.location.origin); }
  function el(name, css, text) { var e = document.createElement(name); if (css) e.style.cssText = css; if (text != null) e.textContent = text; return e; }
  var FONT = "font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;";

  function build() {
    button = el('button', 'position:fixed;top:max(10px,env(safe-area-inset-top));right:10px;z-index:2147483000;width:42px;height:42px;border-radius:50%;border:2px solid rgba(255,255,255,.85);background:rgba(20,20,30,.78);color:#fff;font-size:20px;line-height:1;cursor:pointer;backdrop-filter:blur(6px);', '\uD83C\uDFC6');
    button.setAttribute('aria-label', 'Ranking');
    panel = el('div', 'position:fixed;inset:0;z-index:2147483001;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.6);padding:16px;' + FONT);
    var card = el('div', 'width:min(420px,100%);max-height:86vh;overflow:auto;border-radius:20px;background:#15151f;color:#fff;border:1px solid rgba(255,255,255,.18);padding:16px;');
    var head = el('div', 'display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;');
    head.appendChild(el('b', 'font-size:17px;', 'Ranking'));
    var close = el('button', 'border:0;background:rgba(255,255,255,.12);color:#fff;border-radius:999px;width:32px;height:32px;font-size:16px;cursor:pointer;', '\u2715');
    close.setAttribute('aria-label', 'Close');
    head.appendChild(close);
    status = el('div', 'font-size:13px;color:rgba(255,255,255,.6);padding:6px 2px;', '');
    list = el('div', '');
    mine = el('div', 'margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,.15);font-size:13px;color:#ffd24d;');
    card.appendChild(head); card.appendChild(status); card.appendChild(list); card.appendChild(mine);
    panel.appendChild(card);
    document.body.appendChild(button); document.body.appendChild(panel);
    button.addEventListener('click', function (e) { e.stopPropagation(); panel.style.display = 'flex'; status.textContent = 'Loading\u2026'; list.textContent = ''; mine.textContent = ''; post({ type: 'board-request' }); });
    close.addEventListener('click', function () { panel.style.display = 'none'; });
    panel.addEventListener('click', function (e) { if (e.target === panel) panel.style.display = 'none'; });
    ['pointerdown', 'touchstart', 'mousedown', 'keydown'].forEach(function (t) { panel.addEventListener(t, function (e) { e.stopPropagation(); }); button.addEventListener(t, function (e) { e.stopPropagation(); }); });
  }
  function render(b) {
    list.textContent = '';
    if (!b || !b.rows) { status.textContent = 'The ranking is not available right now.'; return; }
    status.textContent = b.rows.length ? '' : 'No scores yet. Be the first!';
    b.rows.forEach(function (r) {
      var row = el('div', 'display:flex;align-items:center;gap:10px;padding:7px 4px;border-radius:12px;' + (r.isMe ? 'background:rgba(255,210,77,.14);' : ''));
      row.appendChild(el('span', 'width:28px;text-align:right;font-weight:700;color:rgba(255,255,255,.7);', String(r.rank)));
      if (r.avatar && /^(\/|https:\/\/)/.test(r.avatar)) { var img = el('img', 'width:30px;height:30px;border-radius:50%;object-fit:cover;background:#333;'); img.alt = ''; img.src = r.avatar; row.appendChild(img); }
      else row.appendChild(el('span', 'width:30px;height:30px;border-radius:50%;background:#333;display:inline-block;'));
      var name = el('span', 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;', r.displayName || r.username);
      row.appendChild(name);
      row.appendChild(el('b', 'font-size:14px;font-variant-numeric:tabular-nums;', Number(r.best).toLocaleString()));
      list.appendChild(row);
    });
    mine.textContent = b.me ? 'Your best: ' + Number(b.me.best).toLocaleString() + ' (place ' + b.me.rank + ')' : 'You have no score yet.';
  }
  window.addEventListener('message', function (e) {
    if (e.source !== window.parent || e.origin !== window.location.origin) return;
    var d = e.data;
    if (!d || d.noobScore !== GAME) return;
    if (d.type === 'board' && panel) render(d.ok ? d.board : null);
    if (d.type === 'submitted' && typeof window.onNoobScoreSaved === 'function') window.onNoobScoreSaved(d);
  });
  window.NoobScore = {
    game: GAME,
    inNoob: inFrame,
    /** Send the score of a finished round (the best one is kept by NOOB). */
    submit: function (score) { if (typeof score === 'number' && isFinite(score) && score >= 0) post({ type: 'submit', score: Math.floor(score) }); },
    /** Ask for the board (the trophy button does it by itself). */
    board: function () { post({ type: 'board-request' }); },
  };
  if (inFrame && GAME) { if (document.body) build(); else document.addEventListener('DOMContentLoaded', build); }
})();
