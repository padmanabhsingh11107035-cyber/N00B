// A solver for Color Sort (used to make the levels and by the tests: it proves that every shipped level can be won). It plays the game's own rules (instagram/public/games/color-sort/rules.js),
// always looking at the position that is least mixed first (greedy best-first search), and gives back the list of pours, or null when it ran out of its budget.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const RULES_FILE = path.resolve(here, '../instagram/public/games/color-sort/rules.js');

export function loadRules(file = RULES_FILE) {
  const sandbox = {};
  vm.createContext(sandbox);
  sandbox.globalThis = sandbox;
  vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox);
  return sandbox.ColorSortRules;
}

const R = loadRules();

/** how mixed a position is: for every bottle the colour changes inside it, plus one for a bottle that holds more than one colour; a part-filled single-colour bottle still has work to do */
function mixed(state) {
  let h = 0;
  for (let i = 0; i < state.length; i++) {
    const c = state[i];
    let changes = 0;
    for (let k = 1; k < c.length; k++) if (c[k] !== c[k - 1]) changes++;
    h += changes ? changes + 1 : (c.length && !R.isCapped(c) ? 1 : 0);
  }
  return h;
}

/** the same position whichever way the bottles are lined up */
function keyOf(state) {
  return state.map((c) => c.join('')).sort().join(',');
}

class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(n) {
    const a = this.a; a.push(n);
    let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (a[p].f <= a[i].f) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top;
  }
}

/** @returns {Array<[number, number]> | null} the pours that win the game from this position */
export function solve(start, maxNodes = 200000, maxMs = 4000) {
  const t0 = Date.now();
  if (R.isSolved(start)) return [];
  const heap = new Heap();
  const seen = new Set([keyOf(start)]);
  heap.push({ state: start, parent: null, move: null, g: 0, f: mixed(start) * 100 });
  let nodes = 0;
  while (heap.size && nodes < maxNodes) {
    const node = heap.pop();
    nodes++;
    if ((nodes & 127) === 0 && Date.now() - t0 > maxMs) return null;
    const s = node.state;
    for (let i = 0; i < s.length; i++) {
      if (!s[i].length) continue;
      const fromMono = R.isMono(s[i]);
      for (let j = 0; j < s.length; j++) {
        if (i === j || !R.canPour(s, i, j)) continue;
        if (fromMono && !s[j].length) continue;           // moving a single-colour bottle into an empty one changes nothing
        const next = R.pour(s, i, j);
        const key = keyOf(next);
        if (seen.has(key)) continue;
        seen.add(key);
        const child = { state: next, parent: node, move: [i, j], g: node.g + 1, f: 0 };
        if (R.isSolved(next)) {
          const moves = [];
          for (let n = child; n.parent; n = n.parent) moves.push(n.move);
          return moves.reverse();
        }
        child.f = mixed(next) * 100 + child.g;
        heap.push(child);
      }
    }
  }
  return null;
}

/** play a list of pours and say whether it ends solved (so a solution is checked by the game's own rules, not trusted) */
export function replay(start, moves) {
  let s = start;
  for (const [i, j] of moves) { s = R.pour(s, i, j); if (!s) return false; }
  return R.isSolved(s);
}

export { R as rules };
