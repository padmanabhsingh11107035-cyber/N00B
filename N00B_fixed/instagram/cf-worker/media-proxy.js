// NOOB's Cloudflare Worker entry — handles /media/* itself (fetches the object from Supabase
// Storage once, then serves every later request for it straight from Cloudflare's own edge cache),
// and falls through to the static site (./dist, built by "npx vite build") for everything else.
//
// Why this exists: every photo/video used to be fetched directly from Supabase Storage on every
// single load, with no CDN layer in front of it — measured over 1 second just for response headers
// before any image bytes even started, on every request, because nothing was cached anywhere near
// the person loading it. This Worker caches each object at Cloudflare's edge the first time it's
// requested from a given location, so every later load (by anyone, not just the same visitor) is
// served from nearby instead of round-tripping to Supabase's origin again.
//
// Safe to cache "forever": every object this app uploads gets a unique key (folder/timestamp-random.ext,
// see uploadToStorage in src/services/supabaseApi.ts) and is never overwritten in place — a changed
// photo is a new key, not a new version of the old one — so a cached response can never go stale.

const MEDIA_ORIGIN = 'https://abffssydapumuhwgzeck.supabase.co/storage/v1/object/public/media';
const MEDIA_PREFIX = '/media/';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith(MEDIA_PREFIX) && (request.method === 'GET' || request.method === 'HEAD')) {
      return handleMedia(request, url, ctx);
    }
    return env.ASSETS.fetch(request);
  }
};

async function handleMedia(request, url, ctx) {
  const cache = caches.default;
  // Query strings/fragments never carry meaning for a storage object key, so they're dropped before
  // using the URL as a cache key — a stray "?x=1" must not create a separate, redundant cache entry.
  const cacheKey = new Request(url.origin + url.pathname, request);

  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const key = url.pathname.slice(MEDIA_PREFIX.length);
  if (!key) return new Response('Not found', { status: 404 });

  let originResponse;
  try {
    originResponse = await fetch(`${MEDIA_ORIGIN}/${key}`);
  } catch {
    return new Response('Media origin unreachable', { status: 502 });
  }

  if (!originResponse.ok) {
    // A 404/4xx from Supabase itself (a bad or deleted key) — passed through as-is, never cached,
    // so a since-fixed object isn't permanently remembered as missing.
    return originResponse;
  }

  const response = new Response(originResponse.body, originResponse);
  response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  response.headers.delete('Set-Cookie');
  // The cache write happens in the background (waitUntil) so the person who triggered it isn't
  // held up waiting for Cloudflare to finish storing the copy — they already have their response.
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
