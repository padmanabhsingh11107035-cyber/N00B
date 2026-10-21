// The website is plain files (see wrangler.jsonc). Only one kind of request comes here first: the two big files of Neon Alley, which are too large for a website file
// (25 MB each at most) and live in this repository's "game-data" release instead. They are handed out from the website's own address, 
// (their names carry a fingerprint, so they never change), and nothing else can be fetched through here.
const RELEASE = 'https://github.com/padmanabhsingh11107035-cyber/N00B/releases/download/game-data/';

/** address under /games/neon-alley/data/  ->  file in the release (the version is part of the name, so a changed file is a new address) */
const FILES = {
  // the engine, kept compressed (9 MB instead of 40 MB); the browser unpacks it by itself
  'engine-br.5b0faa32.wasm': { file: 'na-engine-5b0faa32.br', type: 'application/wasm', encoding: 'br' },
  // the game's pictures, music and scripts
  'data.e7565660.pck': { file: 'na-data-e7565660.pck', type: 'application/octet-stream' },
};

export default {
  /** @param {Request} request @param {{ ASSETS: { fetch: (r: Request) => Promise<Response> } }} env */
  async fetch(request, env) {
    const url = new URL(request.url);
    const name = url.pathname.startsWith('/games/neon-alley/data/') ? url.pathname.slice('/games/neon-alley/data/'.length) : '';
    const entry = Object.prototype.hasOwnProperty.call(FILES, name) ? FILES[name] : null;
    if (!entry || (request.method !== 'GET' && request.method !== 'HEAD')) return env.ASSETS.fetch(request);

    // streamed straight through (the release's own address is a short-lived redirect). The browser keeps the file for a year: the address changes when the file does.
    const upstream = await fetch(RELEASE + entry.file);
    if (!upstream.ok) return new Response('Game file unavailable', { status: 502, headers: { 'Cache-Control': 'no-store' } });
    const headers = new Headers({
      'Content-Type': entry.type,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    });
    // the file is already compressed: it is handed over as it is (without "manual" the runtime would compress it a second time)
    if (entry.encoding) headers.set('Content-Encoding', entry.encoding);
    const length = upstream.headers.get('Content-Length');
    if (length) headers.set('Content-Length', length);
    return new Response(request.method === 'HEAD' ? null : upstream.body, { status: 200, headers, encodeBody: entry.encoding ? 'manual' : 'automatic' });
  },
};
