// Tests that the computer players in Ludo really play: a match against three computers is played with a clock that runs 25 times faster, and
// the computers must never sit still (they used to freeze for a whole turn clock after throwing a 6 and getting a second throw: a forgotten
// timer made them act on an out-of-date picture of their own tokens). Pure logic (src/components/Games/ludo/services/networkAdapter.ts), bundled
// on the fly with esbuild: no browser needed.
//
// Usage: node scripts/supabase/test-ludo-bots.mjs
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { buildSync } from 'esbuild';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);

const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ludo-')), 'adapter.mjs');
buildSync({ entryPoints: [path.resolve('src/components/Games/ludo/services/networkAdapter.ts')], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' });

// the clock runs 25x faster, so a few seconds hold minutes of play
const SCALE = 25;
const realSetTimeout = globalThis.setTimeout, realSetInterval = globalThis.setInterval;
globalThis.setTimeout = (fn, ms, ...a) => realSetTimeout(fn, (ms || 0) / SCALE, ...a);
globalThis.setInterval = (fn, ms, ...a) => realSetInterval(fn, (ms || 0) / SCALE, ...a);
const { networkAdapter } = await import(pathToFileURL(out).href);
const colors = ['red', 'green', 'yellow', 'blue'];
const players = colors.map((c, i) => ({ id: i === 0 ? 'me' : `bot_${i}`, name: `P${i}`, avatar: '', color: c, isBot: i !== 0, botDifficulty: ['easy', 'medium', 'hard'][i - 1] || 'medium', isConnected: true, level: 1, xp: 0 }));

section('1. A whole match against three computers');
networkAdapter.setLocalPlayerId('me');
const moves = {};
networkAdapter.subscribe('token_moved', () => { const s = networkAdapter.getGameState(); const c = s?.currentTurnColor; if (c) moves[c] = (moves[c] || 0) + 1; });
let last = { key: '', at: Date.now(), bot: false };
const stalls = [];
networkAdapter.subscribe('state_updated', (s) => {
  const key = `${s.turnCount}|${s.currentTurnColor}|${s.diceRollStatus}`;
  if (key === last.key) return;
  const gap = (Date.now() - last.at) * SCALE;
  if (gap > 2500 && last.bot) stalls.push(`${Math.round(gap)}ms in ${last.key}`);
  last = { key, at: Date.now(), bot: !!s.players.find((p) => p.color === s.currentTurnColor)?.isBot };
});
networkAdapter.startLocalGame({ mode: 'vs_computer', players });
const human = realSetInterval(() => {                       // the person plays instantly, so only the computers can be slow
  const s = networkAdapter.getGameState();
  if (!s || s.status !== 'in_progress' || s.currentTurnColor !== 'red') return;
  if (s.diceRollStatus === 'waiting_roll') networkAdapter.rollDice();
  else if (s.diceRollStatus === 'waiting_move' && s.legalTokenIds.length) networkAdapter.moveToken(s.legalTokenIds[0]);
}, 4);
await new Promise((r) => realSetTimeout(r, 9000));
clearInterval(human);
const end = networkAdapter.getGameState();
check(stalls.length === 0, 'no computer ever sat still for more than 2.5 seconds', stalls.slice(0, 3).join(' | '));
check(['green', 'yellow', 'blue'].every((c) => (moves[c] || 0) >= 10), 'each computer made plenty of moves', JSON.stringify(moves));
check((end?.turnCount ?? 0) > 100 || end?.status === 'completed', 'the match moved on steadily', String(end?.turnCount));
networkAdapter.leaveRoom();

section('2. Leaving the match stops the computers');
networkAdapter.startLocalGame({ mode: 'vs_computer', players });
networkAdapter.leaveRoom();
const before = JSON.stringify(networkAdapter.getGameState());
await new Promise((r) => realSetTimeout(r, 300));
check(before === 'null' && networkAdapter.getGameState() === null, 'nothing keeps playing after leaving');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
