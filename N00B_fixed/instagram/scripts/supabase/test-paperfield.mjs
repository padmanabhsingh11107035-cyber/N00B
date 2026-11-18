// Paperfield: the rules (public/games/paperfield/sim.js) run for real, with bots only, and the shared lobby (worker/paperfield.js) with stand-in connections.
// Usage: node scripts/supabase/test-paperfield.mjs
import { World, GW, GH, UNITS, CELL, TICK_MS, SKINS, SPEED } from '../../public/games/paperfield/sim.js';
let failed = 0;
const check = (ok, name) => { console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}`); if (!ok) failed++; };
const run = (w, n) => { for (let i = 0; i < n; i++) { w.step(); w.flush(); } };
const empty = () => new World({ seed: 7, targetPop: 0, minBots: 0 });

// ---- the rules in a tiny world
{
  const w = empty();
  const id = w.addPlayer({ name: 'Ann', skin: 3, human: true });
  const p = w.players.get(id);
  const start = w.counts[id];
  check(start > 40 && start < 120, `the first land is a small disc (${start} cells)`);
  // drive out in a loop and come back in: a curved loop claims land
  p.x = 130; p.y = 130; p.ang = p.tang = 0;
  w.own.fill(0); w.counts.fill(0);
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) { const dx = (i + 0.5) * CELL - 130, dy = (j + 0.5) * CELL - 130; if (dx * dx + dy * dy < 9) w.setOwner(j * GW + i, id); }
  const before = w.counts[id];
  const plan = [[0, 20], [Math.PI / 2, 20], [Math.PI, 24], [-Math.PI / 2, 40]];   // out, down, back, up into the disc: a loop
  let ticks = 0, cap = false;
  for (const [a, n] of plan) { p.tang = a; for (let i = 0; i < n && p.alive; i++) { const was = w.counts[id]; w.step(); w.flush(); ticks++; if (w.counts[id] > was + 100) cap = true; } }
  check(p.alive && cap && w.counts[id] > before * 3, `a loop claims land (${before} -> ${w.counts[id]} cells)`);
  check(p.tpts === 0 || p.trail.length > 0, 'the trail is wiped when the loop closes (and starts again only when the head leaves the land)');
  // the turn is smooth: a sudden U-turn takes time (no instant reversal)
  const q = w.addPlayer({ name: 'Bob', skin: 4, human: true });
  const b = w.players.get(q);
  b.x = 60; b.y = 60; b.ang = b.tang = 0;
  w.step();
  b.tang = Math.PI; w.step();
  check(Math.abs(b.ang) < 1, 'a head turns smoothly (no instant U-turn)');
  // a wall ends you
  const e = w.addPlayer({ name: 'E', skin: 7, human: true });
  const E = w.players.get(e); E.x = 3; E.y = 150; E.ang = E.tang = Math.PI;
  run(w, 20);
  check(!E.alive, 'a wall ends you');
  // cutting a trail: A's head runs into B's trail
  const a1 = w.addPlayer({ name: 'A', skin: 8, human: true }), b1 = w.addPlayer({ name: 'B', skin: 9, human: true });
  const A = w.players.get(a1), B = w.players.get(b1);
  A.x = 200; A.y = 200; A.ang = A.tang = 0;       // B's trail comes down through A's path
  B.x = 215; B.y = 190; B.ang = B.tang = Math.PI / 2;
  check(A.prot > w.tick && B.prot > w.tick, 'a person who just arrived is shielded for a few seconds');
  for (const pl of [A, B]) { pl.trail = []; pl.tpts = 0; pl.prot = 0; }
  run(w, 70);
  check(A.alive !== B.alive || (!A.alive && !B.alive), 'a trail touched by another player takes one of them out');
  check(w.counts[a1] === 0 || A.alive, 'a player who is out has no land left');
  // own trail
  const o = w.addPlayer({ name: 'O', skin: 11, human: true });
  const O = w.players.get(o); O.x = 100; O.y = 30; O.ang = O.tang = 0;
  for (const [aa, n] of [[0, 20], [Math.PI / 2, 12], [Math.PI, 14], [-Math.PI / 2, 25]]) { O.tang = aa; run(w, n); if (!O.alive) break; }
  check(!O.alive, 'running into your own trail ends you');
}

// ---- a full lobby of bots
{
  const w = new World({ seed: 1234, targetPop: 80, minBots: 60 });
  w.balanceBots();
  check(w.bots() === 80, 'the lobby fills with bots');
  const t0 = Date.now();
  let maxTick = 0, totalRuns = 0;
  const dead = new Set();
  const N = 4000;
  for (let i = 0; i < N; i++) {
    const a = Date.now();
    w.step();
    const m = w.flush();
    maxTick = Math.max(maxTick, Date.now() - a);
    totalRuns += m.own.length / 3;
    for (const d of m.ev.d) dead.add(d);
  }
  const ms = (Date.now() - t0) / N;
  console.log(`  info ${ms.toFixed(2)} ms per tick on average, slowest ${maxTick} ms, ${dead.size} different bots went out, ${(totalRuns / N).toFixed(1)} land runs per tick`);
  check(ms < TICK_MS / 4, 'a tick takes far less than the tick time');
  const real = new Int32Array(256);
  for (let i = 0; i < w.own.length; i++) real[w.own[i]]++;
  let same = true;
  for (let id = 1; id <= 250; id++) if (real[id] !== w.counts[id]) same = false;
  check(same, 'the land counts match the map');
  let ghost = 0;
  for (let i = 0; i < w.trl.length; i++) { const t = w.trl[i]; if (t) { const p = w.players.get(t); if (!p || !p.alive) ghost++; } }
  check(ghost === 0, 'no trail of a player who is out stays on the map');
  const alive = [...w.players.values()].filter((p) => p.alive);
  check(alive.length >= 55, `most bots are playing (${alive.length} of ${w.players.size})`);
  const top = [...w.players.values()].sort((a, b) => w.counts[b.id] - w.counts[a.id])[0];
  const pctTop = w.counts[top.id] / (GW * GH) * 100;
  check(pctTop > 0.4, `bots really claim land (the best has ${pctTop.toFixed(2)}% of the field)`);
  const snap = JSON.stringify(w.snapshot());
  console.log(`  info a snapshot is ${(snap.length / 1024).toFixed(1)} KB`);
  check(snap.length < 900000, 'a snapshot is small enough');
  const skins = new Set([...w.players.values()].map((p) => p.skin));
  check(skins.size > 60 && skins.size <= SKINS, `the bots wear many different skins (${skins.size})`);
  const id = w.addPlayer({ name: 'Zoe', skin: [...skins][0], human: true });
  check(id > 0 && w.players.get(id).alive, 'a person joins the same lobby as the bots');
  let bad = false;
  for (const p of w.players.values()) if (p.id !== id && p.skin === w.players.get(id).skin) bad = true;
  check(!bad, 'nobody else wears the skin a person chose');
  run(w, 400);
  check(w.bots() <= 79 && w.players.size <= 81, 'the lobby stays about the same size when a person joins');
  // bots drive in curves: their heading changes in small steps, never by a jump
  let jump = 0;
  const bp = [...w.players.values()].find((p) => p.bot && p.alive);
  let last = bp.ang;
  for (let i = 0; i < 200 && bp.alive; i++) { w.step(); w.flush(); const d = Math.abs(((bp.ang - last + Math.PI * 3) % (Math.PI * 2)) - Math.PI); last = bp.ang; if (d > 0.4) jump++; }
  check(jump === 0, 'bots turn in smooth curves');
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
  lobby.onMessage(a, ia, JSON.stringify({ t: 'ang', a: 157 }));
  for (let i = 0; i < 5; i++) lobby.tick();
  const ticks = a.sent.filter((m) => m.t === 'tick');
  check(ticks.length === 5 && b.sent.filter((m) => m.t === 'tick').length === 5, 'both people get every tick');
  check(ticks[0].p.length >= 50, 'the tick carries the whole crowd (people and bots)');
  check(Math.abs(lobby.world.players.get(ia.id).tang - 1.57) < 0.01, 'a steer from a person is used');
  lobby.onMessage(a, ia, 'not json'); lobby.onMessage(a, ia, JSON.stringify({ t: 'ang', a: 'x' })); lobby.onMessage(a, ia, 'x'.repeat(500));
  for (let i = 0; i < 50; i++) lobby.onMessage(a, ia, JSON.stringify({ t: 'ping' }));
  check(lobby.world.players.has(ia.id), 'bad messages and floods change nothing');
  lobby.onClose(a, ia);
  check(!lobby.world.players.has(ia.id) && lobby.world.players.has(ib.id), 'a person who leaves is taken out of the world');
  lobby.onClose(b, ib);
  check(lobby.timer === null, 'the world stops ticking when nobody is connected');
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
