/* ===================================================================
   NOCTA — interface layer
   =================================================================== */
(function () {
  'use strict';
  var C = window.NOCTA;
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  /* extra polish css injected here so the head stays clean */
  var extra = document.createElement('style');
  extra.textContent = `
  @keyframes cardDrop{0%{opacity:0;transform:translateY(-46px) rotate(16deg) scale(.7)}70%{opacity:1;transform:translateY(4px) rotate(-3deg) scale(1.04)}100%{transform:none}}
  .card.drop{animation:cardDrop .42s cubic-bezier(.2,.9,.2,1) both}
  @keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-7px)}40%{transform:translateX(7px)}60%{transform:translateX(-4px)}80%{transform:translateX(4px)}}
  .shake{animation:shake .34s}
  .card.illegal-pulse{animation:shake .34s}
  .catch-btn{background:linear-gradient(135deg,#ff9a52,#e4262f);color:#fff;border-color:transparent;animation:bob 1.1s infinite}
  `;
  document.head.appendChild(extra);

  var NAMES = ['You', 'Maya', 'Zane', 'Priya', 'Kofi', 'Lena', 'Marco', 'Aiko', 'Dev', 'Nina'];
  var AV = [
    'linear-gradient(135deg,#ffd977,#ff8a3d)',
    'linear-gradient(135deg,#8ee6ff,#2f7ce0)',
    'linear-gradient(135deg,#c4b5fd,#7c3aed)',
    'linear-gradient(135deg,#86efac,#0f9d58)',
    'linear-gradient(135deg,#fda4af,#e4262f)',
    'linear-gradient(135deg,#fde68a,#d97706)',
    'linear-gradient(135deg,#a5f3fc,#0891b2)',
    'linear-gradient(135deg,#f0abfc,#a21caf)',
    'linear-gradient(135deg,#bef264,#65a30d)',
    'linear-gradient(135deg,#fdba74,#c2410c)'
  ];
  var COLOR_HEX = { red: '#e4262f', yellow: '#f5c518', green: '#1fa84b', blue: '#1f6fd4', wild: '#1a1c2e' };

  var S = {
    mode: 'solo', count: 4, seats: [], G: null, netView: null,
    net: { role: null, peer: null, conns: [], conn: null, seat: 0, code: null, ready: false },
    busy: false, catchPi: null, catchTimer: null,
    sound: true, opts: { stack: true, jump: true }, LOG: []
  };

  /* ---------------- sound ---------------- */
  var actx = null;
  function sfx(type) {
    if (!S.sound) return;
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      var t = actx.currentTime;
      var map = {
        play: [520, 0.055, 'triangle', 0.16],
        draw: [220, 0.07, 'sine', 0.12],
        err: [130, 0.13, 'sawtooth', 0.1],
        uno: [880, 0.09, 'square', 0.13],
        win: [660, 0.5, 'triangle', 0.16],
        click: [400, 0.03, 'sine', 0.07],
        bad: [170, 0.24, 'square', 0.11]
      };
      var m = map[type] || map.click;
      var o = actx.createOscillator(), g = actx.createGain();
      o.type = m[2]; o.frequency.setValueAtTime(m[0], t);
      if (type === 'win') o.frequency.exponentialRampToValueAtTime(1320, t + 0.45);
      if (type === 'bad') o.frequency.exponentialRampToValueAtTime(90, t + 0.22);
      g.gain.setValueAtTime(m[3], t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + m[1]);
      o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + m[1] + 0.02);
    } catch (e) { /* audio not available */ }
  }

  /* ---------------- toast ---------------- */
  function toast(msg, kind) {
    var el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(function () { el.style.transition = 'opacity .3s, transform .3s'; el.style.opacity = '0'; el.style.transform = 'translateY(-10px)'; }, 1900);
    setTimeout(function () { el.remove(); }, 2300);
  }

  /* ---------------- log ---------------- */
  function pushLog(html) {
    S.LOG.push(html);
    if (S.LOG.length > 60) S.LOG.shift();
    renderLog();
  }
  function renderLog() {
    var body = $('#logBody');
    body.innerHTML = S.LOG.slice(-12).map(function (h) { return '<div>' + h + '</div>'; }).join('');
  }

  /* ---------------- card element ---------------- */
  function svgSkip(c) {
    return '<svg viewBox="0 0 24 24" width="62%" height="62%" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><circle cx="12" cy="12" r="8.2"/><path d="M6.4 17.6 17.6 6.4"/></svg>';
  }
  function svgRev(c) {
    return '<svg viewBox="0 0 24 24" width="66%" height="66%" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 8h9l-2.6-2.8M17 16H8l2.6 2.8"/><path d="M16 8v3M8 16v-3"/></svg>';
  }

  function cardEl(card, opts) {
    opts = opts || {};
    var el = document.createElement('div');
    el.className = 'card';
    if (card.color === 'wild') el.classList.add('wild');
    if (card.kind === 'wild4') el.classList.add('wild4');
    if (opts.size) el.style.setProperty('--cw', opts.size + 'px');

    var inner = '';
    if (card.color === 'wild') {
      inner += '<div class="quad"><i></i><i></i><i></i><i></i></div>';
    } else {
      el.style.setProperty('--c', COLOR_HEX[card.color]);
      inner += '<div class="oval"></div>';
    }

    var face = '', corner = '';
    if (card.kind === 'num') { face = String(card.value); corner = String(card.value); }
    else if (card.kind === 'skip') { face = '<span class="skipc">' + svgSkip() + '</span>'; corner = '⊘'; }
    else if (card.kind === 'rev') { face = '<span class="rev">' + svgRev() + '</span>'; corner = '⇄'; }
    else if (card.kind === 'draw2') { face = '<span class="draw">+<small>2</small></span>'; corner = '+2'; }
    else if (card.kind === 'wild') { face = 'WILD'; corner = 'W'; }
    else if (card.kind === 'wild4') { face = '<span class="draw">+<small>4</small></span>'; corner = '+4'; }

    inner += '<div class="face">' + face + '</div>';
    if (corner) inner += '<div class="corner tl">' + corner + '</div><div class="corner br">' + corner + '</div>';
    inner += '<div class="gloss"></div>';
    el.innerHTML = inner;
    if (opts.deal) { el.classList.add('dealt'); el.style.animationDelay = (opts.deal * 35) + 'ms'; }
    return el;
  }

  /* ---------------- setup screen ---------------- */
  function setMode(m) {
    S.mode = m;
    $$('.mode').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.mode === m)); });
    $('#onlineBlock').style.display = m === 'online' ? '' : 'none';
    // seat roles
    S.seats = S.seats.map(function (s, i) {
      if (m === 'solo') return { name: s.name, isBot: i > 0 };
      if (m === 'pass') return { name: s.name, isBot: false };
      return { name: s.name, isBot: false };
    });
    renderSeats();
    if (m === 'online' && !window.Peer) loadPeer();
  }

  function setCount(n, silent) {
    n = Math.max(2, Math.min(10, n));
    S.count = n;
    while (S.seats.length < n) {
      var i = S.seats.length;
      S.seats.push({ name: NAMES[i] || ('Player ' + (i + 1)), isBot: S.mode === 'solo' && i > 0 });
    }
    S.seats.length = n;
    $('#countOut').innerHTML = n + '<small>players</small>';
    $('#countRange').value = n;
    $('#countRange').style.setProperty('--p', ((n - 2) / 8 * 100) + '%');
    $('#minus').disabled = n <= 2;
    $('#plus').disabled = n >= 10;
    renderSeats();
    if (!silent) sfx('click');
  }

  function renderSeats() {
    var wrap = $('#seats');
    wrap.innerHTML = '';
    S.seats.forEach(function (seat, i) {
      var row = document.createElement('div');
      row.className = 'seat' + (i === 0 ? ' you' : '');
      row.style.animationDelay = (i * 30) + 'ms';
      var idx = '<div class="idx">' + (i + 1) + '</div>';

      var input = document.createElement('input');
      input.type = 'text'; input.maxLength = 14; input.value = seat.name;
      input.placeholder = 'Player name';
      input.addEventListener('input', function () { seat.name = input.value.slice(0, 14); });

      var tog = document.createElement('div');
      tog.className = 'tog';
      var bH = document.createElement('button');
      bH.textContent = 'Human'; bH.setAttribute('aria-pressed', String(!seat.isBot));
      var bB = document.createElement('button');
      bB.textContent = 'Bot'; bB.dataset.bot = 'true'; bB.setAttribute('aria-pressed', String(seat.isBot));
      bH.onclick = function () {
        if (i === 0) return;
        seat.isBot = false; renderSeats(); sfx('click');
      };
      bB.onclick = function () {
        if (i === 0) { toast('Seat 1 is always you', 'warn'); return; }
        seat.isBot = true; renderSeats(); sfx('click');
      };
      if (S.mode === 'online') { bH.disabled = true; bB.disabled = true; }
      tog.appendChild(bH); tog.appendChild(bB);

      row.innerHTML = idx;
      row.appendChild(input);
      row.appendChild(tog);
      wrap.appendChild(row);
    });
  }

  /* ---------------- start ---------------- */
  function startGame() {
    S.LOG = [];
    if (S.mode === 'online') { toast('Create or join a room first', 'warn'); return; }
    var cfg = {
      players: S.seats.map(function (s) { return { name: s.name || 'Player', isBot: s.isBot }; }),
      stack: S.opts.stack, jump: S.opts.jump
    };
    S.G = C.newGame(cfg);
    $('#setup').classList.add('hidden');
    $('#table').classList.remove('hidden');
    $('#modeLabel').textContent = S.mode === 'solo' ? 'SOLO' : 'PASS & PLAY';
    $('#log').classList.remove('collapsed');
    pushLog('New game · <b>' + cfg.players.length + ' players</b> · ' + S.G.players[S.G.turn].name + ' starts');
    render();
    botTick();
    sfx('play');
  }

  /* ---------------- view model ---------------- */
  function buildViewLocal() {
    var G = S.G;
    var seat = S.mode === 'solo' ? 0 : G.turn;
    return {
      round: G.round, phase: G.phase, color: G.color, dir: G.dir, deck: G.deck.length,
      stack: G.stackCount, stackType: G.stackType, top: C.top(G), turn: G.turn, seat: seat,
      players: G.players.map(function (p) { return { name: p.name, count: p.hand.length, score: p.score, isBot: p.isBot }; }),
      hand: G.players[seat] ? G.players[seat].hand : [],
      drawnId: (G.drawnCard && seat === G.turn) ? G.drawnCard.id : null,
      lastDiscard: G.discard.slice(-2)
    };
  }
  function view() {
    if (S.mode === 'online' && S.net.role === 'client') return S.netView;
    if (S.mode === 'online' && S.net.role === 'host') return snapshotFor(0);
    return buildViewLocal();
  }

  function canPlayIn(v, card) {
    if (!card || v.phase === 'over') return false;
    if (v.stack > 0) return v.stackType === 'draw2' ? card.kind === 'draw2' : card.kind === 'wild4';
    if (card.color === 'wild') return true;
    if (card.color === v.color) return true;
    if (card.kind === 'num' && v.top && v.top.kind === 'num' && card.value === v.top.value) return true;
    if (card.kind !== 'num' && v.top && card.kind === v.top.kind) return true;
    return false;
  }

  /* ---------------- render ---------------- */
  function render() {
    var v = view();
    if (!v) return;
    var G = S.G;
    var mySeat = v.seat;
    var myTurn = v.turn === mySeat && v.phase !== 'over';

    $('#roundLabel').textContent = 'Round ' + v.round;
    $('#deckCount').textContent = v.deck;

    // discard
    var d = $('#discard');
    d.innerHTML = '';
    var top = v.top;
    if (top) {
      var ce = cardEl(top, {});
      ce.style.setProperty('--cw', '100%');
      ce.classList.add('drop');
      d.appendChild(ce);
    }
    var orb = $('#colorOrb');
    orb.style.setProperty('--c', COLOR_HEX[v.color] || '#444');
    $('#colorName').textContent = v.color || '—';
    orb.style.display = v.color ? '' : 'none';

    // opponents
    var opp = $('#opponents');
    opp.innerHTML = '';
    var n = v.players.length;
    for (var k = 1; k <= n - 1; k++) {
      var i = (mySeat + k) % n;
      var p = v.players[i];
      var el = document.createElement('div');
      el.className = 'opp' + (v.turn === i ? ' active' : '') + (p.count === 0 ? ' out' : '');
      var ini = (p.name || '?').trim().charAt(0).toUpperCase() || '?';
      var mini = '';
      var show = Math.min(p.count, 5);
      for (var m = 0; m < show; m++) mini += '<i></i>';
      el.innerHTML =
        '<div class="av" style="background:' + AV[i % AV.length] + '">' + ini + '</div>' +
        '<div class="cnt">' + p.count + '</div>' +
        (p.count === 1 ? '<div class="uno-tag">UNO</div>' : '') +
        '<div class="nm">' + escapeHtml(p.name) + '</div>' +
        (p.isBot ? '<div class="bot-tag">bot</div>' : '') +
        '<div class="minicards">' + mini + '</div>';
      if (p.count > 0 && !p.isBot && S.mode !== 'pass' && v.turn === i) {
        var cbtn = document.createElement('button');
        cbtn.className = 'btn btn-sm catch-btn';
        cbtn.textContent = 'Catch';
        cbtn.style.cssText = 'position:absolute;bottom:-6px;left:50%;transform:translateX(-50%);font-size:.55rem;padding:.15rem .4rem';
        cbtn.onclick = function () { submit({ type: 'catch', pi: i }); };
        if (p.count === 1) el.appendChild(cbtn);
      }
      opp.appendChild(el);
    }

    // turn banner
    var tb = $('#turnText');
    if (v.phase === 'over') tb.textContent = 'Round complete';
    else if (myTurn) tb.textContent = S.mode === 'pass' ? (escapeHtml(v.players[mySeat].name) + ' — your turn') : 'Your turn';
    else tb.textContent = escapeHtml(v.players[v.turn].name) + ' is thinking…';

    // draw pile state
    var dp = $('#drawPile');
    dp.classList.toggle('can', myTurn && !v.drawnId);
    dp.classList.toggle('disabled', !myTurn || !!v.drawnId);

    // you row
    $('#youAv').style.background = AV[mySeat % AV.length];
    $('#youAv').textContent = (v.players[mySeat].name || '?').charAt(0).toUpperCase();
    $('#youName').textContent = S.mode === 'pass' ? (v.players[mySeat].name + ' (you)') : v.players[mySeat].name;
    $('#youCount').textContent = v.hand.length + (v.hand.length === 1 ? ' card' : ' cards');

    // hand
    renderHand(v, myTurn);

    // buttons
    $('#passBtn').disabled = !myTurn || !v.drawnId;
    var unoBtn = $('#unoBtn');
    unoBtn.style.display = (myTurn && v.hand.length === 2) ? '' : 'none';

    renderLog();
  }

  function renderHand(v, myTurn) {
    var hand = $('#hand');
    hand.innerHTML = '';
    var playable = 0;
    v.hand.forEach(function (card, idx) {
      var ok = canPlayIn(v, card) && myTurn && (!v.drawnId || v.drawnId === card.id);
      if (ok) playable++;
      var el = cardEl(card, { deal: idx });
      el.style.zIndex = String(10 + idx);
      el.classList.add(ok ? 'playable' : 'unplayable');
      if (v.drawnId && v.drawnId === card.id) el.classList.add('justdrawn');
      if (ok) el.onclick = function () { onCard(card); };
      hand.appendChild(el);
    });
    requestAnimationFrame(function () { layoutHand(); });
  }

  function layoutHand() {
    var hand = $('#hand');
    var cards = Array.prototype.slice.call(hand.children);
    if (cards.length < 2) return;
    var cw = cards[0].offsetWidth || 88;
    var avail = hand.clientWidth - 8;
    var total = cw * cards.length;
    var ovl = total > avail ? Math.min(cw * 0.7, (total - avail) / (cards.length - 1)) : 0;
    for (var i = 1; i < cards.length; i++) cards[i].style.marginLeft = (-ovl) + 'px';
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  /* ---------------- interactions ---------------- */
  function onCard(card) {
    if (card.color === 'wild') {
      pickColor().then(function (color) {
        if (!color) return;
        submit({ type: 'play', cardId: card.id, color: color });
      });
      return;
    }
    submit({ type: 'play', cardId: card.id });
  }

  var colorResolve = null;
  function pickColor() {
    $('#colorModal').classList.remove('hidden');
    return new Promise(function (res) { colorResolve = res; });
  }
  $$('.color-pick').forEach(function (b) {
    b.onclick = function () {
      $('#colorModal').classList.add('hidden');
      if (colorResolve) { colorResolve(b.dataset.color); colorResolve = null; }
      sfx('click');
    };
  });

  function submit(action) {
    if (S.mode === 'online' && S.net.role === 'client') {
      if (S.net.conn && S.net.conn.open) S.net.conn.send({ t: 'act', a: action });
      else toast('Connection lost', 'warn');
      return null;
    }
    var r = C.act(S.G, action);
    if (!r.ok) {
      toast(r.err || 'Not allowed', 'warn');
      sfx('bad');
      var h = $('#hand'); if (h) { h.classList.add('shake'); setTimeout(function () { h.classList.remove('shake'); }, 360); }
      return r;
    }
    afterAction(r.ev);
    if (S.mode === 'online' && S.net.role === 'host') broadcast();
    return r;
  }

  function afterAction(ev) {
    ev.forEach(function (e) {
      var nm = function (i) { return '<b>' + escapeHtml(S.G.players[i].name) + '</b>'; };
      switch (e.t) {
        case 'play':
          sfx('play');
          if (e.jump) pushLog(nm(e.pi) + ' jumped in with ' + cardName(e.card));
          else pushLog(nm(e.pi) + ' played ' + cardName(e.card));
          if (e.color && (e.card.kind === 'wild' || e.card.kind === 'wild4')) pushLog('Colour is now <b>' + e.color + '</b>');
          break;
        case 'draw': pushLog(nm(e.pi) + ' drew a card'); sfx('draw'); break;
        case 'forced': pushLog(nm(e.pi) + ' drew <b>' + e.n + '</b> cards' + (e.self ? ' (took the pile)' : '')); sfx('draw'); break;
        case 'stacked': pushLog('Stack grows — ' + nm(e.pi) + ' must answer or draw <b>' + e.total + '</b>'); break;
        case 'skip': pushLog(nm(e.pi) + ' is skipped'); break;
        case 'rev': pushLog('Direction reversed'); break;
        case 'uno': pushLog(nm(e.pi) + ' shouts <b>UNO!</b>'); sfx('uno'); break;
        case 'unoWindow':
          S.catchPi = e.pi;
          if (!e.bot) {
            toast('They forgot UNO — catch them!', 'warn');
            setTimeout(function () {
              if (S.catchPi === e.pi) {
                submit({ type: 'catch', pi: e.pi });
                S.catchPi = null;
              }
            }, 3600);
          } else {
            setTimeout(function () { S.catchPi = null; }, 3200);
          }
          break;
        case 'caught': pushLog(nm(e.pi) + ' got caught — draws <b>2</b>'); sfx('bad'); break;
        case 'unoSafe': pushLog(nm(e.pi) + ' called UNO in time'); break;
        case 'drawnPlayable': pushLog('You drew a playable card'); break;
        case 'pass': break;
        case 'roundEnd':
          sfx('win');
          pushLog('<b>' + escapeHtml(S.G.players[e.pi].name) + '</b> wins the round · +' + e.gained);
          break;
      }
    });
    render();
    if (S.G && S.G.phase === 'over') { showRoundEnd(); return; }
    botTick();
  }

  function cardName(c) {
    if (c.kind === 'num') return '<b>' + c.color + ' ' + c.value + '</b>';
    var m = { skip: 'Skip', rev: 'Reverse', draw2: 'Draw Two', wild: 'Wild', wild4: 'Wild Draw Four' };
    return '<b>' + (c.color === 'wild' ? m[c.kind] : c.color + ' ' + m[c.kind]) + '</b>';
  }

  /* ---------------- bots ---------------- */
  function botTick() {
    if (S.mode === 'online' && S.net.role === 'client') return;
    var G = S.G;
    if (!G || G.phase === 'over') return;
    var p = G.players[G.turn];
    if (!p.isBot) return;
    var delay = 620 + Math.random() * 380;
    setTimeout(function () {
      if (!S.G || S.G.phase === 'over' || S.G.turn !== G.turn) return;
      var bot = S.G.players[S.G.turn];
      if (!bot.isBot) return;
      var act;
      if (S.G.drawnCard) {
        act = canPlayIn(buildViewLocal(), S.G.drawnCard) ? { type: 'play', cardId: S.G.drawnCard.id } : { type: 'pass' };
      } else {
        act = C.botChoose(S.G);
      }
      submit(act);
    }, delay);
  }

  /* ---------------- round end ---------------- */
  function showRoundEnd() {
    var G = S.G;
    var w = G.winner;
    var v = view();
    $('#roundTitle').textContent = (v.players[w].name) + ' wins round ' + G.round;
    $('#roundSub').textContent = '+' + G.roundScores[G.roundScores.length - 1].gained + ' points';
    var list = $('#scoreList');
    list.innerHTML = '';
    var order = G.players.map(function (p, i) { return { i: i, p: p }; })
      .sort(function (a, b) { return b.p.score - a.p.score; });
    order.forEach(function (o) {
      var row = document.createElement('div');
      row.className = 'score-row' + (o.i === w ? ' win' : '');
      row.innerHTML = '<span class="p">' + (o.i === w ? '👑 ' : '') + escapeHtml(o.p.name) + '</span>' +
        '<span style="color:var(--dim);font-size:.72rem">' + o.p.hand.length + ' left</span>' +
        '<span class="v">' + o.p.score + '</span>';
      list.appendChild(row);
    });
    $('#roundModal').classList.remove('hidden');
    confetti();
    if (Math.random() < 0.35 && S.mode !== 'online') { /* keep going */ }
  }

  function confetti() {
    var wrap = $('#confetti');
    var cols = ['#ffd977', '#ff8a3d', '#e4262f', '#1fa84b', '#1f6fd4', '#c4b5fd'];
    for (var i = 0; i < 50; i++) {
      var p = document.createElement('i');
      p.style.left = Math.random() * 100 + 'vw';
      p.style.top = '-20px';
      p.style.background = cols[i % cols.length];
      p.style.animationDuration = (1.7 + Math.random() * 1.6) + 's';
      p.style.animationDelay = (Math.random() * 0.6) + 's';
      p.style.opacity = 0.85;
      wrap.appendChild(p);
      (function (node) { setTimeout(function () { node.remove(); }, 4200); })(p);
    }
  }

  /* ---------------- networking ---------------- */
  function loadPeer() { return Promise.reject(new Error('Online rooms are not available here')); }

  function randCode(n) {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', out = '';
    for (var i = 0; i < n; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }

  function broadcast() {
    if (!S.G) return;
    S.net.conns.forEach(function (c) {
      if (c.conn.open) c.conn.send({ t: 'state', v: snapshotFor(c.seat), log: S.LOG.slice(-10) });
    });
    render();
  }

  function snapshotFor(seat) {
    var G = S.G;
    return {
      round: G.round, phase: G.phase, color: G.color, dir: G.dir, deck: G.deck.length,
      stack: G.stackCount, stackType: G.stackType, top: C.top(G), turn: G.turn, seat: seat,
      players: G.players.map(function (p) { return { name: p.name, count: p.hand.length, score: p.score, isBot: p.isBot }; }),
      hand: G.players[seat] ? G.players[seat].hand : [],
      drawnId: (G.drawnCard && seat === G.turn) ? G.drawnCard.id : null
    };
  }

  function createRoom() {
    loadPeer().then(function (Peer) {
      var code = randCode(6);
      var peer = new Peer('nocta-8f2-' + code, { debug: 0 });
      S.net = { role: 'host', peer: peer, conns: [], conn: null, seat: 0, code: code };
      $('#createRoom').disabled = true;
      $('#roomStatus').textContent = 'Starting room…';
      peer.on('open', function () {
        $('#roomCode').textContent = code;
        $('#roomCodeWrap').classList.remove('hidden');
        $('#roomStatus').innerHTML = 'Room is live. Share the code <b>' + code + '</b>.';
        $('#waitCode').textContent = code;
        $('#onlineWaitModal').classList.remove('hidden');
      });
      peer.on('error', function (e) {
        $('#roomStatus').textContent = 'Room error: ' + e.type + '. Try again.';
        $('#createRoom').disabled = false;
        S.net.role = null;
      });
      peer.on('connection', function (conn) {
        if (S.net.conns.length >= 9) { conn.close(); return; }
        var seat = S.net.conns.length + 1;
        conn.on('open', function () {
          S.net.conns.push({ conn: conn, seat: seat });
          if (S.G) { conn.send({ t: 'state', v: snapshotFor(seat), log: S.LOG.slice(-10) }); }
          else conn.send({ t: 'lobby', n: S.net.conns.length + 1 });
          updateWait();
        });
        conn.on('data', function (d) {
          if (!S.G) return;
          if (d.t === 'act') {
            if (S.G.turn !== seat) return;
            var r = C.act(S.G, d.a);
            if (!r.ok) { conn.send({ t: 'err', m: r.err }); return; }
            afterAction(r.ev);
            broadcast();
          }
        });
        conn.on('close', function () {
          S.net.conns = S.net.conns.filter(function (c) { return c.conn !== conn; });
          updateWait();
        });
      });
    }).catch(function () {
      $('#roomStatus').textContent = 'Online play needs an internet connection to load PeerJS. Solo and pass-and-play work offline.';
    });
  }

  function updateWait() {
    var n = S.net.conns.length + (S.net.role === 'host' ? 1 : 0);
    $('#waitCount').textContent = n + ' player' + (n === 1 ? '' : 's') + ' connected';
    $('#hostStartBtn').disabled = n < 2;
  }

  function joinRoom() {
    var code = ($('#joinCode').value || '').trim().toUpperCase();
    if (code.length !== 6) { toast('Enter the 6-character code', 'warn'); return; }
    $('#joinStatus').textContent = 'Connecting…';
    loadPeer().then(function (Peer) {
      var peer = new Peer({ debug: 0 });
      S.net = { role: 'client', peer: peer, conns: [], conn: null, seat: -1, code: code };
      peer.on('open', function () {
        var conn = peer.connect('nocta-8f2-' + code, { reliable: true });
        S.net.conn = conn;
        conn.on('open', function () {
          $('#joinStatus').innerHTML = 'Connected. Waiting for the host to start…';
        });
        conn.on('data', function (d) {
          if (d.t === 'state') {
            S.netView = d.v;
            S.net.seat = d.v.seat;
            if (S.LOG.length === 0 && d.log) S.LOG = d.log.slice();
            if ($('#table').classList.contains('hidden')) {
              $('#setup').classList.add('hidden');
              $('#table').classList.remove('hidden');
              $('#modeLabel').textContent = 'ONLINE';
              $('#log').classList.remove('collapsed');
            }
            render();
          }
          if (d.t === 'err') toast(d.m || 'Not allowed', 'warn');
          if (d.t === 'lobby') $('#joinStatus').textContent = 'Connected · waiting for host';
        });
        conn.on('close', function () { toast('Host disconnected', 'warn'); });
        conn.on('error', function () { $('#joinStatus').textContent = 'Connection failed. Check the code.'; });
      });
      peer.on('error', function (e) {
        $('#joinStatus').textContent = 'Could not connect (' + e.type + '). Check the code and try again.';
      });
    }).catch(function () {
      $('#joinStatus').textContent = 'Online play needs an internet connection to load PeerJS.';
    });
  }

  function hostStart() {
    var n = S.net.conns.length + 1;
    if (n < 2) { toast('Need at least 2 players', 'warn'); return; }
    var players = [{ name: S.seats[0].name || 'Host', isBot: false }];
    S.net.conns.forEach(function (c, i) {
      players.push({ name: S.seats[i + 1] ? (S.seats[i + 1].name || ('Player ' + (i + 2))) : ('Player ' + (i + 2)), isBot: false });
    });
    while (players.length < n) players.push({ name: 'Player', isBot: false });
    S.LOG = [];
    S.G = C.newGame({ players: players, stack: S.opts.stack, jump: S.opts.jump });
    $('#onlineWaitModal').classList.add('hidden');
    $('#setup').classList.add('hidden');
    $('#table').classList.remove('hidden');
    $('#modeLabel').textContent = 'ONLINE';
    $('#log').classList.remove('collapsed');
    pushLog('Room started · <b>' + n + ' players</b>');
    render();
    broadcast();
    botTick();
  }

  /* ---------------- wiring ---------------- */
  $$('.mode').forEach(function (b) {
    b.onclick = function () {
      $$('.mode').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
      b.setAttribute('aria-pressed', 'true');
      setMode(b.dataset.mode);
      sfx('click');
    };
  });
  $('#minus').onclick = function () { setCount(S.count - 1); };
  $('#plus').onclick = function () { setCount(S.count + 1); };
  $('#countRange').oninput = function (e) { setCount(parseInt(e.target.value, 10), true); };
  $('#quickDuel').onclick = function () { setCount(2); };
  $('#quickParty').onclick = function () { setCount(10); };
  $('#startBtn').onclick = function () { startGame(); };
  $('#createRoom').onclick = function () { createRoom(); };
  $('#joinRoom').onclick = function () { joinRoom(); };
  $('#hostStartBtn').onclick = hostStart;
  $('#cancelRoomBtn').onclick = function () {
    $('#onlineWaitModal').classList.add('hidden');
    if (S.net.peer) { try { S.net.peer.destroy(); } catch (e) {} }
    S.net = { role: null, peer: null, conns: [], conn: null, seat: 0, code: null };
    $('#createRoom').disabled = false;
    $('#roomCodeWrap').classList.add('hidden');
    $('#roomStatus').textContent = '';
  };

  $('#drawPile').onclick = function () {
    if (this.classList.contains('disabled')) return;
    var v = view();
    if (v.turn !== v.seat) return;
    submit({ type: 'draw' });
  };
  $('#passBtn').onclick = function () { submit({ type: 'pass' }); };
  $('#unoBtn').onclick = function () { submit({ type: 'uno' }); sfx('uno'); };

  $('#soundBtn').onclick = function () {
    S.sound = !S.sound;
    this.style.opacity = S.sound ? '1' : '.45';
    if (S.sound) sfx('click');
  };
  $('#menuBtn').onclick = function () { $('#menuModal').classList.remove('hidden'); };
  $('#resumeBtn').onclick = function () { $('#menuModal').classList.add('hidden'); };
  $('#quitBtn').onclick = function () {
    $('#menuModal').classList.add('hidden');
    $('#roundModal').classList.add('hidden');
    $('#table').classList.add('hidden');
    $('#setup').classList.remove('hidden');
    if (S.net.peer) { try { S.net.peer.destroy(); } catch (e) {} }
    S.net = { role: null, peer: null, conns: [], conn: null, seat: 0, code: null };
  };
  $('#restartBtn').onclick = function () {
    $('#menuModal').classList.add('hidden');
    if (S.mode === 'online' && S.net.role === 'client') { toast('Only the host can restart', 'warn'); return; }
    var cfg = { players: S.G.players.map(function (p) { return { name: p.name, isBot: p.isBot }; }), stack: S.opts.stack, jump: S.opts.jump };
    S.G = C.newGame(cfg); S.LOG = [];
    pushLog('New game');
    render(); botTick();
    if (S.mode === 'online') broadcast();
  };
  $('#nextRoundBtn').onclick = function () {
    $('#roundModal').classList.add('hidden');
    if (S.mode === 'online' && S.net.role === 'client') { toast('Waiting for the host', ''); return; }
    C.act(S.G, { type: 'restartRound' });
    pushLog('Round ' + S.G.round + ' begins');
    render(); botTick();
    if (S.mode === 'online') broadcast();
  };
  $('#backToSetupBtn').onclick = function () {
    $('#roundModal').classList.add('hidden');
    $('#table').classList.add('hidden');
    $('#setup').classList.remove('hidden');
  };
  $('#rulesBtn').onclick = function () { $('#rulesModal').classList.remove('hidden'); };
  $('#rulesBtn2').onclick = function () { $('#rulesModal').classList.remove('hidden'); };
  $('#closeRules').onclick = function () { $('#rulesModal').classList.add('hidden'); };
  $('#log').onclick = function () { this.classList.toggle('collapsed'); };
  $('#optSound').onchange = function () { S.sound = this.checked; $('#soundBtn').style.opacity = S.sound ? '1' : '.45'; };
  $('#optStack').onchange = function () { S.opts.stack = this.checked; };
  $('#optJump').onchange = function () { S.opts.jump = this.checked; };
  window.addEventListener('resize', function () { layoutHand(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { $('#menuModal').classList.add('hidden'); }
    if (e.key === 'd' || e.key === 'D') { var dp = $('#drawPile'); if (dp && !dp.classList.contains('disabled')) dp.click(); }
    if (e.key === 'u' || e.key === 'U') { var ub = $('#unoBtn'); if (ub && ub.style.display !== 'none') ub.click(); }
  });

  /* boot */
  setCount(4, true);
  setMode('solo');
  if (location.hash === '#demo') {
    setCount(4, true);
    S.seats[1].name = 'Maya'; S.seats[2].name = 'Zane'; S.seats[3].name = 'Priya';
    startGame();
    setTimeout(function () {
      if (!S.G) return;
      var c = S.G.players[0].hand.filter(function (x) { return C.canPlay(S.G, x); })[0];
      if (c) submit({ type: 'play', cardId: c.id, color: c.color === 'wild' ? 'red' : undefined });
    }, 250);
  }
})();

