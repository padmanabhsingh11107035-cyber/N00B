// Paperfield: the rules (public/games/paperfield/sim.js) run for real, with bots only. Usage: node scripts/supabase/test-paperfield.mjs
import { World, W, H, TICK_MS, SKINS } from '../../public/games/paperfield/sim.js';
let failed = 0;
const check = (ok, name) => { console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}`); if (!ok) failed++; };

// ---- a tiny world to test the rules
{
  const w = new World({ seed: 7, targetPop: 0, minBots: 0 });
  const id = w.addPlayer({ name: 'Ann', skin: 3, human: true });
  const p = w.players.get(id);
  check(w.counts[id] === 25, 'the first land is a 5 x 5 square');
  // walk out 4 cells, turn twice, come back: the loop closes and claims what it encloses
  p.x = 100; p.y = 100;
  for (let y = 98; y <= 102; y++) for (let x = 98; x <= 102; x++) w.setOwner(y * W + x, id);
  w.counts[id] = 25;
  p.dir = 1;
  const before = w.counts[id];
  const moves = [1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 0, 0, 0, 0, 0];
  p.x = 102; p.y = 100;
  for (const d of moves) { w.turn(id, d); w.step(); }
  check(w.counts[id] > before + 5, `closing a loop claims land (${before} -> ${w.counts[id]})`);
  check(w.trl.every((v) => v === 0), 'the trail is gone after the loop closes');
  // own-trail death
  const q = w.addPlayer({ name: 'Bob', skin: 4, human: true });
  const b = w.players.get(q);
  b.x = 200; b.y = 200; b.dir = 1;
  for (let y = 198; y <= 202; y++) for (let x = 198; x <= 202; x++) w.setOwner(y * W + x, q);
  b.x = 202;
  for (const d of [1, 1, 1, 2, 3, 3, 0]) { w.turn(q, d); w.step(); }
  check(!b.alive, 'running into your own trail ends you');
  check(w.counts[q] === 0, 'a player who is out has no land left');
  // cutting someone's trail
  const c1 = w.addPlayer({ name: 'C', skin: 5, human: true }), c2 = w.addPlayer({ name: 'D', skin: 6, human: true });
  const A = w.players.get(c1), B = w.players.get(c2);
  for (const [pp, cx, cy] of [[A, 50, 50], [B, 56, 46]]) {
    for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 2; x <= cx + 2; x++) w.setOwner(y * W + x, pp.id);
    pp.x = cx; pp.y = cy;
  }
  A.dir = 1; B.dir = 2;
  for (let i = 0; i < 12; i++) w.step();
  check(A.alive !== B.alive || (!A.alive && !B.alive), 'a trail crossed by another player takes one of them out');
  // the wall
  const e = w.addPlayer({ name: 'E', skin: 7, human: true });
  const E = w.players.get(e); E.x = 1; E.y = 150; E.dir = 3;
  for (let y = 148; y <= 152; y++) for (let x = 0; x <= 3; x++) w.setOwner(y * W + x, e);
  for (let i = 0; i < 4; i++) w.step();
  check(!E.alive, 'a wall ends you');
}

// ---- a full lobby of bots
{
  const w = new World({ seed: 1234, targetPop: 80, minBots: 60 });
  w.balanceBots();
  check(w.bots() === 80, 'the lobby fills with bots');
  const t0 = Date.now();
  let maxTick = 0, captures = 0, peak = 0;
  const dead = new Set();
  for (let i = 0; i < 3000; i++) {
    const a = Date.now();
    w.step();
    const m = w.flush();
    maxTick = Math.max(maxTick, Date.now() - a);
    for (const r of m.own) captures++;
    for (const d of m.ev.d) dead.add(d);
  }
  const ms = (Date.now() - t0) / 3000;
  console.log(`  info ${ms.toFixed(2)} ms per tick on average, slowest ${maxTick} ms, ${dead.size} different bots went out`);
  check(ms < TICK_MS / 4, 'a tick takes far less than the tick time');
  // the counts must match the real map
  const real = new Int32Array(256);
  for (let i = 0; i < w.own.length; i++) real[w.own[i]]++;
  let same = true;
  for (let id = 1; id <= 250; id++) if (real[id] !== w.counts[id]) same = false;
  check(same, 'the land counts match the map');
  // a trail cell belongs to an alive player
  let ghost = 0;
  for (let i = 0; i < w.trl.length; i++) { const t = w.trl[i]; if (t) { const p = w.players.get(t); if (!p || !p.alive) ghost++; } }
  check(ghost === 0, 'no trail of a player who is out stays on the map');
  const alive = [...w.players.values()].filter((p) => p.alive);
  check(alive.length >= 60, `most bots are playing (${alive.length} of ${w.players.size})`);
  const top = [...w.players.values()].sort((a, b) => w.counts[b.id] - w.counts[a.id])[0];
  check(w.counts[top.id] > 200, `bots really claim land (best has ${w.counts[top.id]} cells)`);
  // a snapshot is small and complete
  const snap = JSON.stringify(w.snapshot());
  console.log(`  info a snapshot is ${(snap.length / 1024).toFixed(1)} KB`);
  check(snap.length < 400000, 'a snapshot is small');
  // skins
  const skins = new Set([...w.players.values()].map((p) => p.skin));
  check(skins.size > 60 && skins.size <= SKINS, `the bots wear many different skins (${skins.size})`);
  // a person joins the same lobby
  const id = w.addPlayer({ name: 'Zoe', skin: [...skins][0], human: true });
  check(id > 0 && w.players.get(id).alive, 'a person joins the same lobby as the bots');
  let bad = false;
  for (const p of w.players.values()) if (p.id !== id && p.skin === w.players.get(id).skin) bad = true;
  check(!bad, 'nobody else wears the skin a person chose');
  // bots make room
  for (let i = 0; i < 200; i++) { w.step(); w.flush(); }
  check(w.bots() <= 79 && w.players.size <= 81, 'the lobby stays about the same size when a person joins');
}
// ---- the shared lobby on the server (the Durable Object, run here with stand-in connections)
{
  const { PaperfieldLobby, originAllowed } = await import('../../worker/paperfield.js');
  check(originAllowed('https://noobsocials.com') && originAllowed('https://games.noobsocials.com') && !originAllowed('https://evil.example') && !originAllowed(''), 'only our own pages may connect');
  const lobby = new PaperfieldLobby({}, {});
  const mk = () => { const sent = []; return { sent, send: (t) => sent.push(JSON.parse(t)), close() {} }; };
  const a = mk(), b = mk();
  const ia = { id: 0, n: 0, at: 0 }, ib = { id: 0, n: 0, at: 0 };
  lobby.sockets.set(a, ia); lobby.sockets.set(b, ib);
  lobby.onMessage(a, ia, JSON.stringify({ t: 'join', name: 'Ann<script>', skin: 12 }));
  lobby.onMessage(b, ib, JSON.stringify({ t: 'join', name: 'Ben', skin: 12 }));
  check(a.sent.some((m) => m.t === 'you' && m.id === ia.id) && ia.id && ib.id && ia.id !== ib.id, 'two people join the same world');
  check(lobby.world.players.get(ia.id).name === 'Annscript', 'a name is cleaned');
  lobby.onMessage(a, ia, JSON.stringify({ t: 'dir', d: 2 }));
  for (let i = 0; i < 5; i++) lobby.tick();
  const ticks = a.sent.filter((m) => m.t === 'tick');
  check(ticks.length === 5 && b.sent.filter((m) => m.t === 'tick').length === 5, 'both people get every tick');
  check(ticks[0].p.length >= 50, 'the tick carries the whole crowd (people and bots)');
  check(lobby.world.players.get(ia.id).dir === 2, 'a turn from a person is used');
  lobby.onMessage(a, ia, 'not json'); lobby.onMessage(a, ia, JSON.stringify({ t: 'dir', d: 99 })); lobby.onMessage(a, ia, 'x'.repeat(500));
  for (let i = 0; i < 50; i++) lobby.onMessage(a, ia, JSON.stringify({ t: 'ping' }));
  check(lobby.world.players.has(ia.id), 'bad messages and floods change nothing');
  lobby.onClose(a, ia);
  check(!lobby.world.players.has(ia.id) && lobby.world.players.has(ib.id), 'a person who leaves is taken out of the world');
  lobby.onClose(b, ib);
  check(lobby.timer === null, 'the world stops ticking when nobody is connected');
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
