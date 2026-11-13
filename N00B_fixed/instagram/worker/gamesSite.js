// Which request goes where on the separate games address (docs/GAMES-ORIGIN.md). Pure functions, no Worker types, so scripts/supabase/test-games-site.mjs runs the real code.
// The games address is a public games site: the page at "/" is the small games hub (public/games-site/: plain files, no sign-in, no app code). The app itself is never served there.

/** hosts that serve only the games and the games hub (the separate games address; add a host here when it is created in Cloudflare) */
export const GAMES_HOSTS = new Set(['games.noobsocials.com']);

/** the hub's own files: address on the games host -> file in the website's files. "/" is asked for as the folder (".../index.html" would be answered with a redirect). */
const HUB = {
  '/': '/games-site/',
  '/index.html': '/games-site/',
  '/hub.css': '/games-site/hub.css',
  '/hub.js': '/games-site/hub.js',
  '/games.json': '/games-site/games.json',
  '/robots.txt': '/games-site/robots.txt',
};

/**
 * @param {string} hostname @param {string} pathname
 * @returns {{ kind: 'pass' } | { kind: 'hub', asset: string } | { kind: 'notfound' }}
 *   pass = handled as before (the main site, or a /games/* address); hub = answer with that file of the hub; notfound = 404.
 */
export function routeFor(hostname, pathname) {
  if (!GAMES_HOSTS.has(hostname)) {
    // on the app's address the hub's folder is not a page (it would otherwise be shown by the app's fallback)
    return pathname === '/games-site' || pathname.startsWith('/games-site/') ? { kind: 'notfound' } : { kind: 'pass' };
  }
  if (pathname.startsWith('/games/')) return { kind: 'pass' };
  if (Object.prototype.hasOwnProperty.call(HUB, pathname)) return { kind: 'hub', asset: HUB[pathname] };
  return { kind: 'notfound' };
}
