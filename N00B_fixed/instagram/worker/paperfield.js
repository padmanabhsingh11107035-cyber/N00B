// Paperfield's shared lobby: ONE Durable Object holds the big world (the rules are public/games/paperfield/sim.js, the same file the game uses offline).
// Everybody who opens the game connects here by WebSocket (/ws/paperfield, see worker/index.js): bots and people live in the same world.
// The world only ticks while somebody is connected (so it costs nothing when nobody plays); it is kept in memory only (nothing of it is stored).
import { World, TICK_MS } from '../public/games/paperfield/sim.js';

const MAX_SOCKETS = 120;
const ALLOWED_ORIGINS = new Set(['https://noobsocials.com', 'https://www.noobsocials.com', 'https://games.noobsocials.com']);

/** a connection is allowed from our own sites (and from nothing else in a browser); a request without an Origin is not a browser page */
export function originAllowed(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

export class PaperfieldLobby {
  constructor(state, env) {
    this.state = state;
    this.world = new World({ targetPop: 80, minBots: 50 });
    this.world.balanceBots();
    this.sockets = new Map();   // WebSocket -> { id: player id or 0, last: ms of the last message, n: messages in this second, at: second }
    this.timer = null;
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
    if (this.sockets.size >= MAX_SOCKETS) return new Response('The lobby is full', { status: 503 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    const info = { id: 0, n: 0, at: 0 };
    this.sockets.set(server, info);
    server.addEventListener('message', (e) => this.onMessage(server, info, e.data));
    server.addEventListener('close', () => this.onClose(server, info));
    server.addEventListener('error', () => this.onClose(server, info));
    // the live world behind the menu: whoever arrives sees it at once
    try { server.send(JSON.stringify(this.world.snapshot())); } catch (e) { /* closed already */ }
    if (!this.timer) this.timer = setInterval(() => this.tick(), TICK_MS);
    return new Response(null, { status: 101, webSocket: client });
  }

  onMessage(ws, info, data) {
    if (typeof data !== 'string' || data.length > 200) return;
    const sec = (Date.now() / 1000) | 0;
    if (info.at !== sec) { info.at = sec; info.n = 0; }
    if (++info.n > 30) return;   // at most 30 messages a second from one person
    let m;
    try { m = JSON.parse(data); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    const w = this.world;
    if (m.t === 'join') {
      const name = String(m.name == null ? '' : m.name).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16) || 'Player';
      const skin = Number.isInteger(m.skin) ? m.skin : 0;
      if (info.id && w.players.has(info.id)) {
        const p = w.players.get(info.id);
        if (!p.alive) w.respawn(info.id, name, skin);
      } else {
        info.id = w.addPlayer({ name, skin, human: true });
        if (!info.id) { this.send(ws, { t: 'full' }); return; }
      }
      this.send(ws, { t: 'you', id: info.id });
    } else if (m.t === 'dir') {
      if (info.id) w.turn(info.id, m.d | 0);
    } else if (m.t === 'ping') {
      this.send(ws, { t: 'pong', c: m.c });
    }
  }

  send(ws, obj) { try { ws.send(JSON.stringify(obj)); } catch (e) { /* the connection is gone: its close handler cleans up */ } }

  onClose(ws, info) {
    if (!this.sockets.has(ws)) return;
    this.sockets.delete(ws);
    if (info.id) this.world.removePlayer(info.id);
    try { ws.close(); } catch (e) { /* already closed */ }
    if (!this.sockets.size && this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  tick() {
    try {
      const w = this.world;
      w.step();
      const msg = w.flush();
      msg.hu = w.humans();
      const text = JSON.stringify(msg);
      for (const [ws, info] of this.sockets) {
        try { ws.send(text); } catch (e) { /* closed: handled by its close event */ }
        if (info.id && msg.ev.d.includes(info.id)) { const r = w.report(info.id); if (r) this.send(ws, r); }
      }
    } catch (e) {
      console.log('paperfield tick failed: ' + (e && e.message));
    }
  }
}
