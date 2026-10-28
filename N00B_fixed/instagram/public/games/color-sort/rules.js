// Color Sort: the rules, with nothing of the screen in them (game.js draws; tools/solver.mjs and the tests run these same functions).
//
// A bottle is a list of colour numbers, bottom first, one number per unit of liquid. Every bottle holds 4 units, and every colour in a level is exactly 4 units, so a colour can end up
// filling one bottle completely. A pour takes the whole top run of one colour out of a bottle and puts as much of it as fits into another: that bottle has to be empty, or have the same
// colour on top. A bottle that is full of one colour is CAPPED: it is finished, it can not be poured out of and nothing can be poured into it.
// The level is won when every bottle that holds anything is capped (each colour sits alone in its own full bottle).
(function (root) {
  'use strict';
  var BOTTLE_CAP = 4;

  /** the colour on top of a bottle and how many units of it sit together there ({ color: -1, n: 0 } when it is empty) */
  function topRun(c) {
    if (!c.length) return { color: -1, n: 0 };
    var color = c[c.length - 1], n = 0;
    for (var i = c.length - 1; i >= 0 && c[i] === color; i--) n++;
    return { color: color, n: n };
  }

  function isMono(c) {
    for (var i = 1; i < c.length; i++) if (c[i] !== c[0]) return false;
    return true;
  }

  /** full of one colour: finished, locked */
  function isCapped(c) { return c.length === BOTTLE_CAP && isMono(c); }

  /** how many units would move if `from` were poured into `to` (0 when that is not allowed) */
  function amount(state, from, to) {
    if (from === to) return 0;
    var a = state[from], b = state[to];
    if (!a.length || isCapped(a) || isCapped(b)) return 0;
    var t = topRun(a);
    if (b.length && b[b.length - 1] !== t.color) return 0;
    return Math.min(t.n, BOTTLE_CAP - b.length);
  }

  function canPour(state, from, to) { return amount(state, from, to) > 0; }

  /** a new state with the pour done (the old one is left as it was) */
  function pour(state, from, to) {
    var k = amount(state, from, to);
    if (!k) return null;
    var color = state[from][state[from].length - 1];
    var next = state.slice();
    next[from] = state[from].slice(0, state[from].length - k);
    var add = state[to].slice();
    for (var i = 0; i < k; i++) add.push(color);
    next[to] = add;
    return next;
  }

  /** won: every bottle is empty or capped */
  function isSolved(state) {
    for (var i = 0; i < state.length; i++) if (state[i].length && !isCapped(state[i])) return false;
    return true;
  }

  function cappedCount(state) {
    var n = 0;
    for (var i = 0; i < state.length; i++) if (isCapped(state[i])) n++;
    return n;
  }

  function hasMoves(state) {
    for (var i = 0; i < state.length; i++) for (var j = 0; j < state.length; j++) if (canPour(state, i, j)) return true;
    return false;
  }

  /** a level is a list of strings, one per bottle (colour k is the character with code 48 + k, bottom to top; "" is an empty bottle) */
  function fromLevel(level) {
    var state = [];
    for (var i = 0; i < level.length; i++) {
      var c = [];
      for (var k = 0; k < level[i].length; k++) c.push(level[i].charCodeAt(k) - 48);
      state.push(c);
    }
    return state;
  }

  function copy(state) { return state.map(function (c) { return c.slice(); }); }

  var api = { BOTTLE_CAP: BOTTLE_CAP, topRun: topRun, amount: amount, canPour: canPour, pour: pour, isMono: isMono, isCapped: isCapped, isSolved: isSolved, cappedCount: cappedCount, hasMoves: hasMoves, fromLevel: fromLevel, copy: copy };
  root.ColorSortRules = api;
})(typeof window !== 'undefined' ? window : globalThis);
