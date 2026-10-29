// Brick Escape: the rules, with nothing of the screen in them (game.js draws; generate-levels.mjs and the tests run these same functions).
//
// A level is a tray of W x H cells. Bricks lie in it: a brick covers w x h cells and has a colour. The tray has DOORS in its walls, each with a colour: a door is `n` cells wide and
// sits at cell `p` of one side ('t'op, 'b'ottom, 'l'eft, 'r'ight). A brick slides in a straight line, any number of cells, as far as the walls and the other bricks let it.
// A brick LEAVES the tray when it is slid out through a door of its own colour: it must lie inside the door's width, and nothing may be in the way up to the wall.
// The level is won when no brick is left. One slide (of any length) or one leaving is one move.
(function (root) {
  'use strict';
  var DX = { u: 0, d: 0, l: -1, r: 1 }, DY = { u: -1, d: 1, l: 0, r: 0 };
  var DIRS = ['u', 'd', 'l', 'r'];
  var SIDE = { u: 't', d: 'b', l: 'l', r: 'r' };   // the wall a brick leaves through when it is slid in that direction

  /** the board as a list of cells holding the number of the brick on them (-1 = empty) */
  function grid(level, bricks) {
    var g = new Array(level.w * level.h), i, x, y;
    for (i = 0; i < g.length; i++) g[i] = -1;
    for (i = 0; i < bricks.length; i++) {
      var b = bricks[i];
      for (y = b.y; y < b.y + b.h; y++) for (x = b.x; x < b.x + b.w; x++) g[y * level.w + x] = i;
    }
    return g;
  }

  /** how many cells brick i can slide in a direction before the wall or another brick stops it */
  function room(level, bricks, i, dir, g) {
    g = g || grid(level, bricks);
    var b = bricks[i], n = 0, k;
    for (;;) {
      var step = n + 1, free = true;
      if (DX[dir]) {
        var x = DX[dir] > 0 ? b.x + b.w - 1 + step : b.x - step;
        if (x < 0 || x >= level.w) break;
        for (k = b.y; k < b.y + b.h; k++) if (g[k * level.w + x] !== -1) { free = false; break; }
      } else {
        var y = DY[dir] > 0 ? b.y + b.h - 1 + step : b.y - step;
        if (y < 0 || y >= level.h) break;
        for (k = b.x; k < b.x + b.w; k++) if (g[y * level.w + k] !== -1) { free = false; break; }
      }
      if (!free) break;
      n++;
    }
    return n;
  }

  /** the number of cells between a brick and the wall in a direction */
  function toWall(level, b, dir) {
    return dir === 'u' ? b.y : dir === 'd' ? level.h - (b.y + b.h) : dir === 'l' ? b.x : level.w - (b.x + b.w);
  }

  /** the door brick i can leave through when it is slid in `dir` (or null): same colour, inside the door's width, a free way up to the wall */
  function doorFor(level, bricks, i, dir, g, r) {
    var b = bricks[i], side = SIDE[dir], across = DX[dir] ? [b.y, b.h] : [b.x, b.w];
    for (var k = 0; k < level.doors.length; k++) {
      var d = level.doors[k];
      if (d.s !== side || d.c !== b.c) continue;
      if (across[0] >= d.p && across[0] + across[1] <= d.p + d.n) {
        if ((r === undefined ? room(level, bricks, i, dir, g) : r) >= toWall(level, b, dir)) return d;
      }
    }
    return null;
  }

  // bricks are never changed after they are made: a move makes a new list that shares the bricks that did not move
  function slide(bricks, i, dir, k) {
    var b = bricks[i], out = bricks.slice();
    out[i] = { x: b.x + DX[dir] * k, y: b.y + DY[dir] * k, w: b.w, h: b.h, c: b.c };
    return out;
  }
  function leave(bricks, i) { var out = bricks.slice(); out.splice(i, 1); return out; }
  function isWon(bricks) { return bricks.length === 0; }

  /** every move there is: [{ i, dir, k, exit }] (k cells; exit: the brick goes out through its door) */
  function moves(level, bricks) {
    var out = [], g = grid(level, bricks);
    for (var i = 0; i < bricks.length; i++) {
      for (var d = 0; d < 4; d++) {
        var dir = DIRS[d], r = room(level, bricks, i, dir, g);
        if (doorFor(level, bricks, i, dir, g, r)) out.push({ i: i, dir: dir, k: toWall(level, bricks[i], dir), exit: true });
        for (var k = 1; k <= r; k++) out.push({ i: i, dir: dir, k: k, exit: false });
      }
    }
    return out;
  }

  function apply(bricks, m) { return m.exit ? leave(bricks, m.i) : slide(bricks, m.i, m.dir, m.k); }

  /** bricks of the same colour and size are the same: two boards that differ only in which of them is which are one state */
  function key(bricks) {
    var codes = [];
    for (var i = 0; i < bricks.length; i++) {
      var b = bricks[i];
      codes.push(String.fromCharCode(((b.c * 4 + b.w - 1) * 4 + b.h - 1) * 256 + b.y * 16 + b.x));
    }
    return codes.sort().join('');
  }

  /**
   * The shortest way to win: { ok, moves: [{ x, y, w, h, dir, k, exit }], states } (a move names the brick by where it lies before the move), or { ok: false, capped: true } when the
   * search would need more than opt.cap boards or opt.ms milliseconds. opt.bricks: start from this board instead of the level's.
   * It is A* search. A board is kept as one number per cell (0 = empty, else the kind of brick on it: colour + size), so two boards that differ only in which of two equal bricks is
   * which are one board. The guess of what is still needed is safe (never too high): every brick needs 1 move to leave, 2 when it does not yet lie inside the width of a door of its
   * colour (it has to line up first); a move changes only one brick, so the guess falls by at most 1 per move, and the first way found to the empty tray is a shortest one.
   */
  function solve(level, opt) {
    opt = opt || {};
    var cap = opt.cap || 400000, until = opt.ms ? Date.now() + opt.ms : 0;
    var start = opt.bricks || level.bricks;
    if (!start.length) return { ok: true, moves: [], states: 1 };
    var W = level.w, H = level.h, N = W * H, kinds = [], ids = {}, i, d, x, y;
    function kindOf(b) {
      var id = b.c + ':' + b.w + 'x' + b.h;
      if (ids[id] === undefined) { kinds.push({ c: b.c, w: b.w, h: b.h }); ids[id] = kinds.length; }
      return ids[id];
    }
    var first = new Uint8Array(N);
    for (i = 0; i < start.length; i++) {
      var sb = start[i], kid = kindOf(sb);
      for (y = sb.y; y < sb.y + sb.h; y++) for (x = sb.x; x < sb.x + sb.w; x++) first[y * W + x] = kid;
    }
    // for every kind and direction: at which cell across the wall may a brick of that kind leave
    var out = kinds.map(function (kd) {
      return DIRS.map(function (dir) {
        var vertical = dir === 'u' || dir === 'd', ok = new Uint8Array((vertical ? W : H) + 1), size = vertical ? kd.w : kd.h;
        level.doors.forEach(function (dr) {
          if (dr.s !== SIDE[dir] || dr.c !== kd.c) return;
          for (var p = dr.p; p + size <= dr.p + dr.n; p++) ok[p] = 1;
        });
        return ok;
      });
    });
    // for every kind and place: the fewest moves that brick still needs (1: it lies inside the width of a door of its colour, 2: it has to line up first)
    var need = kinds.map(function (kd) {
      var t = new Uint8Array(N);
      for (var yy = 0; yy + kd.h <= H; yy++) for (var xx = 0; xx + kd.w <= W; xx++) {
        t[yy * W + xx] = level.doors.some(function (dr) {
          if (dr.c !== kd.c) return false;
          return dr.s === 't' || dr.s === 'b' ? xx >= dr.p && xx + kd.w <= dr.p + dr.n : yy >= dr.p && yy + kd.h <= dr.p + dr.n;
        }) ? 1 : 2;
      }
      return t;
    });
    var h0 = 0;
    for (i = 0; i < start.length; i++) h0 += need[kindOf(start[i]) - 1][start[i].y * W + start[i].x];
    function keyOf(cells) { return String.fromCharCode.apply(null, cells); }
    var nodes = [{ cells: first, left: start.length, g: 0, h: h0, key: keyOf(first), parent: -1, move: null }];
    var best = new Map(), open = [], at0;
    best.set(nodes[0].key, 0);
    open[h0] = [0];
    var claimed = new Uint8Array(N), pops = 0;
    for (var f = h0; f < open.length; ) {
      var bucket = open[f];
      if (!bucket || !bucket.length) { f++; continue; }
      var head = bucket.pop(), cur = nodes[head], cells = cur.cells;
      if (best.get(cur.key) < cur.g) continue;   // a shorter way to this board was found meanwhile
      if (cur.left === 0) {
        var path = [], p = head;
        while (nodes[p].parent !== -1) { path.push(nodes[p].move); p = nodes[p].parent; }
        return { ok: true, moves: path.reverse(), states: nodes.length };
      }
      if (nodes.length > cap || (until && (++pops & 127) === 0 && Date.now() > until)) return { ok: false, capped: true, states: nodes.length };
      claimed.fill(0);
      for (var at = 0; at < N; at++) {
        if (!cells[at] || claimed[at]) continue;
        var id = cells[at], kd = kinds[id - 1], bx = at % W, by = (at / W) | 0, bw = kd.w, bh = kd.h, hb = need[id - 1][by * W + bx];
        for (y = by; y < by + bh; y++) for (x = bx; x < bx + bw; x++) claimed[y * W + x] = 1;
        for (d = 0; d < 4; d++) {
          var dir = DIRS[d], ddx = DX[dir], ddy = DY[dir], n = 0, wall = toWall(level, { x: bx, y: by, w: bw, h: bh }, dir);
          while (n < wall) {   // how far it can slide: the next row or column must be free
            var step = n + 1, free = true, k2;
            if (ddx) {
              var col = ddx > 0 ? bx + bw - 1 + step : bx - step;
              for (k2 = by; k2 < by + bh; k2++) if (cells[k2 * W + col]) { free = false; break; }
            } else {
              var row = ddy > 0 ? by + bh - 1 + step : by - step;
              for (k2 = bx; k2 < bx + bw; k2++) if (cells[row * W + k2]) { free = false; break; }
            }
            if (!free) break;
            n++;
          }
          var leaves = n === wall && out[id - 1][d][ddx ? by : bx] === 1;
          for (var k = leaves ? 0 : 1; k <= n; k++) {   // k = 0 stands for "leaves"
            var gone = k === 0, next = new Uint8Array(cells);
            for (y = by; y < by + bh; y++) for (x = bx; x < bx + bw; x++) next[y * W + x] = 0;
            var nx = bx + ddx * k, ny = by + ddy * k;
            if (!gone) for (y = ny; y < ny + bh; y++) for (x = nx; x < nx + bw; x++) next[y * W + x] = id;
            var nk = keyOf(next), ng = cur.g + 1, nh = gone ? cur.h - hb : cur.h - hb + need[id - 1][ny * W + nx];
            if (best.has(nk) && best.get(nk) <= ng) continue;
            best.set(nk, ng);
            nodes.push({ cells: next, left: gone ? cur.left - 1 : cur.left, g: ng, h: nh, key: nk, parent: head, move: { x: bx, y: by, w: bw, h: bh, dir: dir, k: gone ? wall : k, exit: gone } });
            var fn = ng + nh;
            (open[fn] || (open[fn] = [])).push(nodes.length - 1);
            if (fn < f) f = fn;
          }
        }
      }
    }
    return { ok: false, capped: false, states: nodes.length };   // every board was looked at: this one can not be won
  }

  /** which brick a move names: the one lying exactly there (or -1) */
  function find(bricks, x, y, w, h) {
    for (var i = 0; i < bricks.length; i++) if (bricks[i].x === x && bricks[i].y === y && bricks[i].w === w && bricks[i].h === h) return i;
    return -1;
  }

  /** plays a list of moves from the level's start; returns the boards after each move, or null when a move is not allowed */
  function replay(level, list, from) {
    var bricks = from || level.bricks, boards = [];
    for (var n = 0; n < list.length; n++) {
      var m = list[n], i = find(bricks, m.x, m.y, m.w, m.h);
      if (i < 0) return null;
      var g = grid(level, bricks), r = room(level, bricks, i, m.dir, g);
      if (m.exit) { if (!doorFor(level, bricks, i, m.dir, g, r)) return null; bricks = leave(bricks, i); }
      else { if (m.k < 1 || m.k > r) return null; bricks = slide(bricks, i, m.dir, m.k); }
      boards.push(bricks);
    }
    return boards;
  }

  /** a level is sound when every brick lies inside the tray, none overlap, every door lies on its wall without overlapping another and every brick has a door it could leave by */
  function check(level) {
    var problems = [];
    var w = level.w, h = level.h, g = [], i, k;
    for (i = 0; i < w * h; i++) g.push(-1);
    level.bricks.forEach(function (b, n) {
      if (b.x < 0 || b.y < 0 || b.x + b.w > w || b.y + b.h > h) { problems.push('brick ' + n + ' sticks out of the tray'); return; }
      for (var y = b.y; y < b.y + b.h; y++) for (var x = b.x; x < b.x + b.w; x++) { if (g[y * w + x] !== -1) problems.push('brick ' + n + ' overlaps brick ' + g[y * w + x]); g[y * w + x] = n; }
    });
    var used = {};
    level.doors.forEach(function (d, n) {
      var len = d.s === 't' || d.s === 'b' ? w : h;
      if (d.p < 0 || d.n < 1 || d.p + d.n > len) problems.push('door ' + n + ' does not fit its wall');
      for (k = d.p; k < d.p + d.n; k++) { var id = d.s + k; if (used[id]) problems.push('door ' + n + ' overlaps another door'); used[id] = true; }
    });
    level.bricks.forEach(function (b, n) {
      var can = level.doors.some(function (d) {
        if (d.c !== b.c) return false;
        return d.s === 't' || d.s === 'b' ? b.w <= d.n : b.h <= d.n;
      });
      if (!can) problems.push('brick ' + n + ' has no door it fits through');
    });
    return problems;
  }

  /** 1 to 3 stars from the number of moves and the shortest way (par) */
  function stars(moves, par) { return moves <= par ? 3 : moves <= Math.ceil(par * 1.5) + 1 ? 2 : 1; }

  var api = { DIRS: DIRS, grid: grid, room: room, toWall: toWall, doorFor: doorFor, slide: slide, leave: leave, isWon: isWon, moves: moves, apply: apply, key: key, solve: solve, find: find, replay: replay, check: check, stars: stars };
  root.BrickEscapeRules = api;
})(typeof window !== 'undefined' ? window : globalThis);
