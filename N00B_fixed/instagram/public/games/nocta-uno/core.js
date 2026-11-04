/* ===================================================================
   NOCTA — core rules engine (pure logic, no DOM)
   108 cards · 2–10 players · Skip · Reverse · Draw Two · Wild · Wild Draw Four
   =================================================================== */
(function (root) {
  'use strict';

  var COLORS = ['red', 'yellow', 'green', 'blue'];
  var uid = 0;

  /* ---------------- deck ---------------- */
  function buildDeck() {
    var d = [];
    COLORS.forEach(function (c) {
      d.push({ id: ++uid, color: c, kind: 'num', value: 0 });
      for (var v = 1; v <= 9; v++) {
        d.push({ id: ++uid, color: c, kind: 'num', value: v });
        d.push({ id: ++uid, color: c, kind: 'num', value: v });
      }
      ['skip', 'rev', 'draw2'].forEach(function (k) {
        d.push({ id: ++uid, color: c, kind: k });
        d.push({ id: ++uid, color: c, kind: k });
      });
    });
    for (var i = 0; i < 4; i++) {
      d.push({ id: ++uid, color: 'wild', kind: 'wild' });
      d.push({ id: ++uid, color: 'wild', kind: 'wild4' });
    }
    return d; // 108
  }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function top(G) { return G.discard[G.discard.length - 1]; }

  function points(card) {
    if (card.kind === 'num') return card.value;
    if (card.kind === 'wild' || card.kind === 'wild4') return 50;
    return 20;
  }
  function handPoints(p) { return p.hand.reduce(function (s, c) { return s + points(c); }, 0); }

  /* ---------------- helpers ---------------- */
  function stepFrom(G, i, k) {
    var n = G.players.length;
    k = (k === undefined) ? 1 : k;
    return ((i + G.dir * k) % n + n) % n;
  }
  function step(G, k) { return stepFrom(G, G.turn, k); }

  function drawOne(G, p) {
    if (G.deck.length === 0) {
      if (G.discard.length > 1) {
        var keep = G.discard.pop();
        G.deck = shuffle(G.discard.slice());
        G.discard = [keep];
        G.deck.forEach(function (c) { if (c.kind === 'wild' || c.kind === 'wild4') c.color = 'wild'; });
        G.reshuffles = (G.reshuffles || 0) + 1;
      } else {
        return null;
      }
    }
    var c = G.deck.pop();
    if (!c) return null;
    p.hand.push(c);
    return c;
  }

  function playerHasStack(G, pi, type) {
    return G.players[pi].hand.some(function (c) {
      return type === 'draw2' ? c.kind === 'draw2' : c.kind === 'wild4';
    });
  }

  function canPlay(G, card) {
    if (!card || G.phase === 'over') return false;
    var t = top(G);
    if (G.stackCount > 0) {
      return G.stackType === 'draw2' ? card.kind === 'draw2' : card.kind === 'wild4';
    }
    if (card.color === 'wild') return true;
    if (card.color === G.color) return true;
    if (card.kind === 'num' && t.kind === 'num' && card.value === t.value) return true;
    if (card.kind !== 'num' && card.kind === t.kind) return true;
    return false;
  }

  function legalCount(G, pi) {
    return G.players[pi].hand.filter(function (c) { return canPlay(G, c); }).length;
  }

  function sameIdentical(a, b) {
    return a.color === b.color && a.kind === b.kind && a.value === b.value;
  }

  /* ---------------- round / game ---------------- */
  function newRound(G) {
    G.deck = shuffle(buildDeck());
    G.discard = [];
    G.dir = 1;
    G.color = null;
    G.stackType = null;
    G.stackCount = 0;
    G.drawnCard = null;
    G.unoArmed = {};
    G.winner = null;
    G.phase = 'play';
    G.reshuffles = 0;

    G.players.forEach(function (p) { p.hand = []; });
    for (var r = 0; r < 7; r++) {
      for (var i = 0; i < G.players.length; i++) drawOne(G, G.players[0 + i]);
    }
    // starter: first number card, so no action-card ambiguity on the flip
    var idx = -1;
    for (var k = 0; k < G.deck.length; k++) {
      if (G.deck[k].kind === 'num') { idx = k; break; }
    }
    if (idx < 0) idx = G.deck.length - 1;
    var starter = G.deck.splice(idx, 1)[0];
    G.discard = [starter];
    G.color = starter.color;
    G.turn = Math.floor(Math.random() * G.players.length);
    return G;
  }

  function newGame(cfg) {
    var G = {
      round: 1,
      players: cfg.players.map(function (p) {
        return { name: p.name, isBot: !!p.isBot, hand: [], score: 0, id: uid++ };
      }),
      opts: { stack: cfg.stack !== false, jump: !!cfg.jump },
      deck: [], discard: [], color: null, dir: 1, turn: 0,
      stackType: null, stackCount: 0, drawnCard: null, unoArmed: {},
      phase: 'play', winner: null, roundScores: []
    };
    newRound(G);
    return G;
  }

  function endRound(G, ev) {
    var w = G.winner;
    var gained = 0;
    G.players.forEach(function (p, i) { if (i !== w) gained += handPoints(p); });
    G.players[w].score += gained;
    G.roundScores.push({ pi: w, gained: gained });
    G.phase = 'over';
    ev.push({ t: 'roundEnd', pi: w, gained: gained });
  }

  function finish(G, card, ev) {
    var n = G.players.length;
    var extra = 1;

    if (card.kind === 'skip') {
      extra = 2;
      ev.push({ t: 'skip', pi: stepFrom(G, G.turn, 1) });
    }
    if (card.kind === 'rev') {
      G.dir *= -1;
      ev.push({ t: 'rev', dir: G.dir });
      if (n === 2) extra = 2; // acts as Skip
    }
    if (card.kind === 'draw2' || card.kind === 'wild4') {
      var amt = card.kind === 'draw2' ? 2 : 4;
      var type = card.kind === 'draw2' ? 'draw2' : 'wild4';
      var pending = (G.stackCount || 0) + amt;
      var victim = stepFrom(G, G.turn, 1);
      var canStack = G.opts.stack && playerHasStack(G, victim, type);
      if (canStack) {
        G.stackCount = pending;
        G.stackType = type;
        G.turn = victim;
        ev.push({ t: 'stacked', pi: victim, total: pending, type: type });
        return;
      }
      G.stackCount = 0;
      G.stackType = null;
      for (var i = 0; i < pending; i++) drawOne(G, G.players[victim]);
      ev.push({ t: 'forced', pi: victim, n: pending });
      G.turn = stepFrom(G, victim, 1);
      ev.push({ t: 'turn', pi: G.turn });
      return;
    }
    G.turn = stepFrom(G, G.turn, extra);
    ev.push({ t: 'turn', pi: G.turn });
  }

  /* ---------------- actions ---------------- */
  function act(G, a) {
    var ev = [];
    var p, i, card;

    if (a.type === 'restartRound') {
      G.round++;
      newRound(G);
      ev.push({ t: 'turn', pi: G.turn });
      return { ok: true, ev: ev };
    }
    if (G.phase === 'over') return { ok: false, err: 'Round is over', ev: ev };

    if (a.type === 'uno') {
      G.unoArmed[G.turn] = true;
      ev.push({ t: 'uno', pi: G.turn });
      return { ok: true, ev: ev };
    }

    if (a.type === 'catch') {
      var ci = a.pi;
      if (G.players[ci] && G.players[ci].hand.length === 1 && !G.unoArmed[ci]) {
        drawOne(G, G.players[ci]); drawOne(G, G.players[ci]);
        ev.push({ t: 'caught', pi: ci, n: 2 });
      }
      return { ok: true, ev: ev };
    }

    if (a.type === 'play') {
      var pi = G.turn;
      if (a.jump && a.pi !== undefined) {
        if (!G.opts.jump) return { ok: false, err: 'Jump-in is off', ev: ev };
        pi = a.pi;
        p = G.players[pi];
        i = p.hand.findIndex(function (c) { return c.id === a.cardId; });
        if (i < 0) return { ok: false, err: 'Card not in hand', ev: ev };
        if (!sameIdentical(p.hand[i], top(G))) return { ok: false, err: 'Not an identical card', ev: ev };
        if (p.hand[i].color === 'wild') return { ok: false, err: 'Wild cards cannot jump in', ev: ev };
        G.turn = pi;
      } else {
        p = G.players[G.turn];
        i = p.hand.findIndex(function (c) { return c.id === a.cardId; });
        if (i < 0) return { ok: false, err: 'Card is not in your hand', ev: ev };
      }

      card = p.hand[i];
      if (!canPlay(G, card)) return { ok: false, err: 'That card does not match', ev: ev };
      if (G.drawnCard && !a.jump && G.drawnCard.id !== card.id) {
        return { ok: false, err: 'You may only play the card you just drew', ev: ev };
      }
      var isWild = (card.kind === 'wild' || card.kind === 'wild4');
      if (isWild && !a.color) {
        return { ok: false, err: 'Pick a colour', needColor: true, ev: ev };
      }

      p.hand.splice(i, 1);
      G.drawnCard = null;
      G.discard.push(card);
      if (!isWild) G.color = card.color;
      else G.color = a.color;

      ev.push({ t: 'play', pi: pi, card: card, color: G.color, jump: !!a.jump });

      if (p.hand.length === 1) {
        if (p.isBot) {
          if (Math.random() < 0.85) { G.unoArmed[pi] = true; ev.push({ t: 'uno', pi: pi }); }
          else ev.push({ t: 'unoWindow', pi: pi, bot: true });
        } else if (G.unoArmed[pi]) {
          ev.push({ t: 'unoSafe', pi: pi });
        } else {
          ev.push({ t: 'unoWindow', pi: pi, bot: false });
        }
      }
      if (p.hand.length === 0) {
        finish(G, card, ev);          // action cards still resolve for the table
        G.winner = pi;
        endRound(G, ev);
        return { ok: true, ev: ev };
      }

      finish(G, card, ev);
      return { ok: true, ev: ev };
    }

    if (a.type === 'draw') {
      p = G.players[G.turn];
      if (G.drawnCard) return { ok: false, err: 'You already drew a card', ev: ev };

      if (G.stackCount > 0) {
        var nDraw = G.stackCount;
        for (var d = 0; d < nDraw; d++) drawOne(G, p);
        var wasType = G.stackType;
        G.stackCount = 0; G.stackType = null;
        ev.push({ t: 'forced', pi: G.turn, n: nDraw, self: true, type: wasType });
        G.turn = stepFrom(G, G.turn, 1);
        ev.push({ t: 'turn', pi: G.turn });
        return { ok: true, ev: ev };
      }

      var c = drawOne(G, p);
      if (!c) {
        ev.push({ t: 'emptyDeck', pi: G.turn });
        G.turn = stepFrom(G, G.turn, 1);
        ev.push({ t: 'turn', pi: G.turn });
        return { ok: true, ev: ev };
      }
      ev.push({ t: 'draw', pi: G.turn, n: 1 });
      if (canPlay(G, c)) {
        G.drawnCard = c;
        ev.push({ t: 'drawnPlayable', pi: G.turn, card: c });
      } else {
        G.drawnCard = null;
        G.turn = stepFrom(G, G.turn, 1);
        ev.push({ t: 'turn', pi: G.turn });
      }
      return { ok: true, ev: ev };
    }

    if (a.type === 'pass') {
      if (!G.drawnCard) return { ok: false, err: 'Nothing to pass on', ev: ev };
      G.drawnCard = null;
      G.turn = stepFrom(G, G.turn, 1);
      ev.push({ t: 'pass', pi: G.turn });
      ev.push({ t: 'turn', pi: G.turn });
      return { ok: true, ev: ev };
    }

    return { ok: false, err: 'Unknown action', ev: ev };
  }

  /* ---------------- bot brain ---------------- */
  function botChoose(G) {
    var pi = G.turn, p = G.players[pi];
    var legal = p.hand.filter(function (c) { return canPlay(G, c); });
    if (!legal.length) return { type: 'draw' };

    var n = G.players.length;
    var next = G.players[stepFrom(G, pi, 1)];
    var pressure = next.hand.length <= 2;

    // colour histogram for wild choices
    var counts = { red: 0, yellow: 0, green: 0, blue: 0 };
    p.hand.forEach(function (c) { if (c.color !== 'wild') counts[c.color]++; });
    var bestColor = COLORS.slice().sort(function (a, b) { return counts[b] - counts[a]; })[0];

    function score(c) {
      var s = 0;
      if (c.kind === 'num') s = 10 + c.value * 0.1;
      if (c.kind === 'skip') s = 40;
      if (c.kind === 'rev') s = 35;
      if (c.kind === 'draw2') s = 55;
      if (c.kind === 'wild') s = 5;
      if (c.kind === 'wild4') s = 3;
      if (pressure && (c.kind === 'skip' || c.kind === 'draw2' || c.kind === 'wild4')) s += 45;
      if (p.hand.length <= 2 && c.color === 'wild') s -= 8;
      return s;
    }
    legal.sort(function (a, b) { return score(b) - score(a); });
    var pick = legal[0];
    return { type: 'play', cardId: pick.id, color: pick.color === 'wild' ? bestColor : undefined };
  }

  var Core = {
    COLORS: COLORS, buildDeck: buildDeck, shuffle: shuffle, canPlay: canPlay,
    legalCount: legalCount, newGame: newGame, newRound: newRound, act: act,
    top: top, points: points, handPoints: handPoints, botChoose: botChoose,
    stepFrom: stepFrom, playerHasStack: playerHasStack
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Core;
  root.NOCTA = Core;
})(typeof window !== 'undefined' ? window : globalThis);

