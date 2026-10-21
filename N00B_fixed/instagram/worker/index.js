// The website is plain files (see wrangler.jsonc). Only one kind of request comes here first: the two big files of Neon Alley, which are too large for a website file
// (25 MB each at most) and live in this repository's "game-data" release instead. They are handed out from the website's own address, remembered by the edge for a year
// (their names carry a fingerprint, so they never change), and nothing else can be fetched through here.
const RELEASE = 'https://github.com/padmanabhsingh11107035-cyber/N00B/releases/download/game-data/';

/** address under /games/neon-alley/data/  ->  file in the release */
const FILES = {
  // the engine, kept compressed (8 MB instead of 39 MB); the browser unpacks it by itself
  'engine.wasm': { file: 'na-engine-5b0faa32.br', type: 'application/wasm', encoding: 'br' },
  // the game's pictures, music and scripts
  'data.pck': { file: 'na-data-e7565660.pck', type: 'application/octet-stream' },
};

export default {
  /** @param {Request} request @param {{ ASSETS: { fetch: (r: Request) => Promise<Response> } }} env @param {{ waitUntil: (p: Promise<unknown>) => void }} ctx */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const name = url.pathname.startsWith('/games/neon-alley/data/') ? url.pathname.slice('/games/neon-alley/data/'.length) : '';
    const entry = Object.prototype.hasOwnProperty.call(FILES, name) ? FILES[name] : null;
    if (!entry || (request.method !== 'GET' && request.method !== 'HEAD')) return env.ASSETS.fetch(request);

    // remembered by the edge under this site's own address (the release's address is a short-lived redirect, so it is never what gets remembered)
    const cache = caches.default;
    const key = new Request(url.origin + url.pathname, { method: 'GET' });
    let res = await cache.match(key);
    if (!res) {
      const upstream = await fetch(RELEASE + entry.file);
      if (!upstream.ok) return new Response('Game file unavailable', { status: 502, headers: { 'Cache-Control': 'no-store' } });
      const headers = new Headers({
        'Content-Type': entry.type,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      });
      if (entry.encoding) headers.set('Content-Encoding', entry.encoding);
      const length = upstream.headers.get('Content-Length');
      if (length) headers.set('Content-Length', length);
      res = new Response(upstream.body, { status: 200, headers });
      ctx.waitUntil(cache.put(key, res.clone()));
    }
    return request.method === 'HEAD' ? new Response(null, { status: 200, headers: res.headers }) : res;
  },
};
