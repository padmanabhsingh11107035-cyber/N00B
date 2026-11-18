// Which request goes where on the NOOB AI address (ai.noobsocials.com). Pure functions, no Worker types, so scripts/supabase/test-ai-site.mjs runs the real code.
//   * The public pages (home, features, how it works, languages, safety, privacy, FAQ, install, about, contact) and their files are plain files of the website (public/ai-site/, built by
//     scripts/build-ai-site.mjs). They are answered here, so they stay online even when the computer that runs NOOB AI is switched off, and search engines can always read them.
//   * Every other address (the sign-in page, the app, its data, its own files) goes straight through to NOOB AI itself, unchanged.
//   * Somebody who is already signed in to NOOB AI (it has a session cookie) opening "/" goes through to the app, which sends them to it, so the installed home-screen app opens the app as before.
// On every other address the folder /ai-site/ is a 404, so these pages exist only on the NOOB AI address.

/** hosts that show the NOOB AI site (add a host here when it is created in Cloudflare) */
export const AI_HOSTS = new Set(['ai.noobsocials.com']);

/** public page address -> file of the website (a page is asked for without ".html"; the home page as a folder) */
export const AI_PAGES = {
  '/': '/ai-site/',
  '/features': '/ai-site/features',
  '/how-it-works': '/ai-site/how-it-works',
  '/languages': '/ai-site/languages',
  '/safety': '/ai-site/safety',
  '/privacy': '/ai-site/privacy',
  '/faq': '/ai-site/faq',
  '/install': '/ai-site/install',
  '/about': '/ai-site/about',
  '/contact': '/ai-site/contact',
};

/** the site's own files */
export const AI_FILES = {
  '/site.css': '/ai-site/site.css',
  '/logo.png': '/ai-site/logo.png',
  '/favicon.png': '/ai-site/favicon.png',
  '/og-image.png': '/ai-site/og-image.png',
  '/robots.txt': '/ai-site/robots.txt',
  '/sitemap.xml': '/ai-site/sitemap.xml',
};

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/**
 * @param {string} hostname @param {string} pathname @param {string} [cookie] the request's Cookie header
 * @returns {{ kind: 'pass' } | { kind: 'asset', asset: string } | { kind: 'proxy' } | { kind: 'notfound' }}
 *   pass = not for this module (every other address); asset = answer with that file; proxy = send the request on to NOOB AI; notfound = 404.
 */
export function aiRoute(hostname, pathname, cookie = '') {
  const inFolder = pathname === '/ai-site' || pathname.startsWith('/ai-site/');
  if (!AI_HOSTS.has(hostname)) return inFolder ? { kind: 'notfound' } : { kind: 'pass' };
  if (inFolder) return { kind: 'notfound' };
  // "/features/" is the same page as "/features"
  const p = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  if (p === '/' && /(?:^|;\s*)session=/.test(cookie)) return { kind: 'proxy' };   // signed in: the app sends them to the app
  if (has(AI_PAGES, p)) return { kind: 'asset', asset: AI_PAGES[p] };
  if (has(AI_FILES, p)) return { kind: 'asset', asset: AI_FILES[p] };
  return { kind: 'proxy' };
}

/** the answer when NOOB AI itself is not reachable (its computer is off, or its connection is down) */
export function sleepingPage(wantsJson) {
  if (wantsJson) {
    return new Response(JSON.stringify({ error: 'NOOB AI is taking a short break. Please try again in a little while.' }), {
      status: 503, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'retry-after': '120' },
    });
  }
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>NOOB AI is taking a short break</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#1c1b19;color:#f3efe8;font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;text-align:center;padding:24px}main{max-width:420px}h1{font-size:26px;margin:0 0 12px}p{color:#b9b3a8;margin:0 0 22px}a{display:inline-block;background:#e0794f;color:#1c1b19;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:999px}img{border-radius:20px;margin-bottom:20px}</style></head>
<body><main><img src="/logo.png" alt="" width="84" height="84"><h1>NOOB AI is taking a short break</h1><p>Its server is switched off or under maintenance right now. Please try again in a little while.</p><a href="/">Back to NOOB AI</a></main></body></html>`;
  return new Response(html, { status: 503, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'retry-after': '120', 'x-content-type-options': 'nosniff' } });
}

/** a status that means "the computer behind the address did not answer" (Cloudflare's own 520 to 530). NOOB AI's own 5xx answers (for example its maintenance message) are passed on untouched. */
export const isUnreachable = (status) => status >= 520 && status <= 530;
