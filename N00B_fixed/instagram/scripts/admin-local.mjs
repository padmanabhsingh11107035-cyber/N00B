#!/usr/bin/env node
// NOOB admin panel on THIS computer, for when the website is down, locked, or broken by a bad update.
//
//   npm run admin:local            (or double-click Start-Admin-Panel.cmd)
//   then open  http://127.0.0.1:5757   and log in with the admin account: the admin console opens by itself, exactly as on the website.
//   and        http://127.0.0.1:5757/__noob/status   says in plain words what is working and what is not, and why.
//
// What this is: a tiny web server that only this computer can reach (127.0.0.1, other devices on the network can not), which serves the already built copy of the app
// (the "dist" folder; it is built first when it is missing). The app then talks to NOOB's database directly, so anything that stops the WEBSITE (Cloudflare down, a broken
// update, the maintenance lock, a wrong page switch) does not stop this. Nothing secret is in it: the admin still has to log in with the admin password.
//
// What it can NOT do: if the database service itself is switched off by its host (the "restricted: exceed_cached_egress_quota" message), nothing can read the data until
// that is lifted, from the website or from here. The status page says so, and shows the host's own reason.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4',
  '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.webmanifest': 'application/manifest+json', '.map': 'application/json'
};

// ---- what the build knows (the same two public values the website was built with)
export function readBuildEnv(dir = root) {
  const out = {};
  for (const name of ['.env.production', '.env.local', '.env']) {
    try {
      for (const line of fs.readFileSync(path.join(dir, name), 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*(VITE_SUPABASE_URL|VITE_SUPABASE_PUBLISHABLE_KEY)\s*=\s*"?([^"\r\n]*)"?\s*$/);
        if (m && !out[m[1]]) out[m[1]] = m[2].trim();
      }
    } catch { /* that file is not there */ }
  }
  return out;
}

const RESTRICTED = /service for this project is restricted|exceed_[a-z_]*quota|project is restricted/i;

// ---- one plain-words check of everything the admin cares about
export async function checkEverything({ env, fetchImpl = fetch, site = 'https://noobsocials.com' }) {
  const ask = async (url, init = {}) => {
    try {
      const res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(8000), cache: 'no-store' });
      let text = '';
      try { text = await res.text(); } catch { /* no body */ }
      return { ok: res.ok, status: res.status, text };
    } catch (e) {
      return { ok: false, status: 0, text: String((e && e.message) || e) };
    }
  };
  const url = env.VITE_SUPABASE_URL, key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const checks = [];

  if (!url || !key) {
    checks.push({ id: 'database', name: 'NOOB database service (Supabase)', state: 'unknown', say: 'This copy does not know the database address (no .env.production in the project folder).', fix: 'Copy .env.production next to package.json, then try again.' });
  } else {
    const r = await ask(`${url}/auth/v1/health`, { headers: { apikey: key } });
    if (r.ok) {
      checks.push({ id: 'database', name: 'NOOB database service (Supabase)', state: 'ok', say: 'Answering normally. The admin panel on this computer will work.' });
    } else if (r.status === 402 || RESTRICTED.test(r.text)) {
      let reason = '';
      try { reason = JSON.parse(r.text).message || ''; } catch { reason = r.text.slice(0, 300); }
      checks.push({
        id: 'database', name: 'NOOB database service (Supabase)', state: 'restricted',
        say: 'SWITCHED OFF by its host. Nothing can read or write NOOB data until this is lifted, from the website or from this computer.',
        detail: reason,
        fix: 'Open the Supabase dashboard for this project, go to Billing / Usage, and either upgrade the plan or remove the spend cap (the message above says which allowance ran out). It comes back by itself a minute or two after that, and nobody loses anything or has to log in again.'
      });
    } else if (r.status === 0) {
      checks.push({ id: 'database', name: 'NOOB database service (Supabase)', state: 'unreachable', say: 'Not reachable from this computer.', detail: r.text.slice(0, 200), fix: 'Check this computer\'s internet connection, then reload this page.' });
    } else {
      checks.push({ id: 'database', name: 'NOOB database service (Supabase)', state: 'down', say: `Answered with an error (${r.status}).`, detail: r.text.slice(0, 200), fix: 'Check the Supabase status page; if it says all is well, wait a minute and reload.' });
    }
  }

  const s = await ask(`${site}/version.json`);
  checks.push(s.ok
    ? { id: 'website', name: `The website (${site.replace(/^https?:\/\//, '')})`, state: 'ok', say: 'Serving the app.' }
    : { id: 'website', name: `The website (${site.replace(/^https?:\/\//, '')})`, state: s.status ? 'down' : 'unreachable', say: s.status ? `Answered with an error (${s.status}).` : 'Not reachable from this computer.', fix: 'You do not need it for this panel: this computer serves its own copy of the app.' });

  const overall = checks.some((c) => c.state === 'restricted') ? 'restricted'
    : checks.find((c) => c.id === 'database')?.state === 'ok' ? 'database-ok' : 'database-not-ok';
  return { checkedAt: new Date().toISOString(), overall, checks };
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function statusPage(result, port) {
  const color = { ok: '#3ddc84', restricted: '#ff5c5c', down: '#ff5c5c', unreachable: '#ffb84d', unknown: '#ffb84d' };
  const label = { ok: 'WORKING', restricted: 'SWITCHED OFF', down: 'DOWN', unreachable: 'CAN NOT REACH', unknown: 'UNKNOWN' };
  const head = result.overall === 'database-ok'
    ? '<b style="color:#3ddc84">Good news:</b> the database is working, so the admin panel on this computer will work even if the website does not.'
    : result.overall === 'restricted'
      ? '<b style="color:#ff5c5c">The database service is switched off by its host.</b> That is why NOOB is down for everybody. It is not a bug, and nothing is lost.'
      : '<b style="color:#ffb84d">The database does not answer.</b> The admin panel can not work until it does.';
  const cards = result.checks.map((c) => `
    <section style="border:1px solid #2a2a2e;border-radius:16px;padding:16px 18px;margin:12px 0;background:#121214">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:center"><b>${esc(c.name)}</b>
        <span style="font-size:11px;font-weight:800;letter-spacing:.06em;padding:3px 9px;border-radius:99px;background:${color[c.state] || '#888'}22;color:${color[c.state] || '#888'}">${label[c.state] || esc(c.state)}</span></div>
      <p style="margin:8px 0 0;color:#cfcfd4">${esc(c.say)}</p>
      ${c.detail ? `<p style="margin:8px 0 0;font-size:12px;color:#8e8e96;word-break:break-word"><i>${esc(c.detail)}</i></p>` : ''}
      ${c.fix ? `<p style="margin:10px 0 0;font-size:13px;color:#e8e8ec"><b>What to do:</b> ${esc(c.fix)}</p>` : ''}
    </section>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>NOOB status</title><meta name="robots" content="noindex"><meta http-equiv="refresh" content="20"></head>
<body style="margin:0;background:#0a0a0a;color:#fff;font:15px/1.5 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif">
<main style="max-width:640px;margin:0 auto;padding:28px 18px 48px">
  <h1 style="margin:0 0 6px;font-size:24px">NOOB status</h1>
  <p style="margin:0 0 14px;color:#9a9aa2;font-size:13px">Checked ${esc(new Date(result.checkedAt).toLocaleString())}. This page checks again by itself every 20 seconds.</p>
  <p style="margin:0 0 6px">${head}</p>
  ${cards}
  <p style="margin:22px 0 0"><a href="/" style="display:inline-block;background:#fff;color:#000;font-weight:800;text-decoration:none;padding:12px 22px;border-radius:99px">Open the admin panel</a>
  <span style="color:#77777c;font-size:12px;margin-left:10px">127.0.0.1:${esc(port)} (only this computer can open it)</span></p>
</main></body></html>`;
}

export function createAdminServer({ dist, env, fetchImpl = fetch, port = 5757 }) {
  const distRoot = path.resolve(dist);
  const allowedHost = (h) => /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(String(h || ''));

  return http.createServer(async (req, res) => {
    const send = (code, body, type = 'text/plain; charset=utf-8', extra = {}) => {
      res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', ...extra });
      res.end(body);
    };
    // A web page on the internet can make a browser send a request to 127.0.0.1 under its own name (DNS rebinding): only this computer's own names are served.
    if (!allowedHost(req.headers.host)) return send(403, 'Forbidden');
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, 'Method not allowed');

    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url || '/', 'http://127.0.0.1').pathname); } catch { return send(400, 'Bad request'); }

    if (pathname === '/__noob/status' || pathname === '/__noob/status.json') {
      const result = await checkEverything({ env, fetchImpl });
      return pathname.endsWith('.json') ? send(200, JSON.stringify(result), 'application/json; charset=utf-8') : send(200, statusPage(result, port), 'text/html; charset=utf-8');
    }

    // a file of the built app, or (for any page address of the app) its start page
    let file = path.join(distRoot, pathname === '/' ? 'index.html' : pathname);
    const inside = path.resolve(file);
    if (inside !== distRoot && !inside.startsWith(distRoot + path.sep)) return send(403, 'Forbidden');
    let st = null;
    try { st = fs.statSync(inside); } catch { /* not a file */ }
    if (st && st.isDirectory()) { file = path.join(inside, 'index.html'); try { st = fs.statSync(file); } catch { st = null; } }
    else file = inside;
    if (!st || !st.isFile()) {
      if (path.extname(pathname)) return send(404, 'Not found');   // a missing picture or script is a real 404; a page address gets the app
      file = path.join(distRoot, 'index.html');
      try { st = fs.statSync(file); } catch { return send(503, 'The built app is missing. Run: npm run build'); }
    }
    const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
    // The service worker of the website would keep an old copy of the app on this address: it is never given here.
    if (path.basename(file) === 'sw.js') return send(200, 'self.addEventListener("install",()=>self.skipWaiting());self.addEventListener("activate",e=>e.waitUntil(self.registration.unregister()));', 'text/javascript; charset=utf-8');
    res.writeHead(200, { 'content-type': type, 'content-length': st.size, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

// ---- run it
const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const port = Number(process.env.NOOB_ADMIN_PORT || 5757);
  const dist = path.resolve(process.env.NOOB_DIST || path.join(root, 'dist'));
  if (!fs.existsSync(path.join(dist, 'index.html'))) {
    console.log('The built app is not here yet: building it now (a minute or two, once)...');
    const b = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', 'build'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
    if (b.status !== 0 || !fs.existsSync(path.join(dist, 'index.html'))) {
      console.error('\nThe build did not finish. Free some disk space and run this again.');
      process.exit(1);
    }
  }
  const env = readBuildEnv();
  const server = createAdminServer({ dist, env, port });
  server.on('error', (e) => {
    console.error(e && e.code === 'EADDRINUSE' ? `\nPort ${port} is already used (is the admin panel already open?). Open http://127.0.0.1:${port} or set NOOB_ADMIN_PORT to another number.` : `\n${e && e.message}`);
    process.exit(1);
  });
  server.listen(port, '127.0.0.1', async () => {
    const first = await checkEverything({ env });
    console.log(`\nNOOB admin panel (this computer only)\n  Admin panel:  http://127.0.0.1:${port}\n  Status page:  http://127.0.0.1:${port}/__noob/status\n`);
    for (const c of first.checks) console.log(`  [${c.state.toUpperCase().padEnd(10)}] ${c.name}: ${c.say}${c.detail ? '\n               ' + c.detail : ''}`);
    console.log('\nLeave this window open while you use it. Close it (or press Ctrl+C) to stop.');
  });
}
