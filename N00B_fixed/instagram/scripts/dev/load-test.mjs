// A small, polite load test of the NOOB website's own files (what Cloudflare serves: the pages, the scripts, the pictures). It does NOT touch the database (Supabase): nothing here logs in, reads
// or writes anything, and the paths that start the Worker (/m/, /media/, /__geo) are never asked for. Only run it against your own site.
//   node scripts/dev/load-test.mjs [https://noobsocials.com]
// It is bounded on purpose: at most 40 requests at once, at most 2000 requests in all, and it stops by itself when the site starts refusing (429 / 403 / 5xx) so it can never become an attack.
import { performance } from 'node:perf_hooks';

const base = (process.argv[2] || 'https://noobsocials.com').replace(/\/$/, '');
const LEVELS = [5, 10, 20, 40], PER_LEVEL = 450, MAX_TOTAL = 2000, STOP_AFTER_REFUSALS = 12;
const UA = 'NOOB-owner-load-test/1.0 (run by the site owner)';
if (/(\/m\/|\/media\/|__geo)/.test(base)) { console.error('Not that address.'); process.exit(1); }

const pct = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };
const get = async (path) => {
  const t0 = performance.now();
  try {
    const res = await fetch(base + path, { headers: { 'user-agent': UA, 'accept-encoding': 'gzip, br' }, redirect: 'follow' });
    const buf = await res.arrayBuffer();
    return { path, ms: performance.now() - t0, status: res.status, bytes: buf.byteLength, cache: res.headers.get('cf-cache-status') || '-', text: res.headers.get('content-type')?.startsWith('text/html') ? new TextDecoder().decode(buf) : '' };
  } catch (e) {
    return { path, ms: performance.now() - t0, status: 0, bytes: 0, cache: '-', err: String(e?.cause?.code || e?.message || e), text: '' };
  }
};
const line = (s) => console.log(s);

// ---- what to ask for: the pages and a few real files of the current build
const home = await get('/'), booth = await get('/booth');
const asset = (html, re) => (html.match(re) || [])[0];
const mainJs = asset(home.text, /\/assets\/main-[\w-]+\.js/), boothCss = asset(booth.text, /\/assets\/[\w-]+\.css/), boothChunk = asset(booth.text, /\/assets\/BuddyBooth-[\w-]+\.js/) || asset(booth.text, /\/assets\/booth-[\w-]+\.js/);
const mix = [['/', 35], ['/booth', 15], ['/version.json', 15], [boothCss || '/favicon-48.png', 20], [boothChunk || '/favicon-192.png', 10], ['/brand/noob-wordmark.png', 5]];
const total = mix.reduce((n, [, w]) => n + w, 0);
const pick = () => { let r = Math.random() * total; for (const [p, w] of mix) { if ((r -= w) < 0) return p; } return mix[0][0]; };
line(`site ${base}\nmix ${mix.map(([p, w]) => `${w}% ${p}`).join(' | ')}`);

// ---- 1. one visitor, one request at a time
line('\n1. One visitor at a time (8 requests each; ms = whole answer)');
for (const p of [...new Set(mix.map(([x]) => x))].concat(mainJs ? [mainJs] : [])) {
  const n = p === mainJs ? 3 : 8, r = [];
  for (let i = 0; i < n; i++) r.push(await get(p));
  const ok = r.filter((x) => x.status === 200);
  line(`  ${p.padEnd(34)} ${String(ok.length + '/' + n).padEnd(5)} median ${pct(ok.map((x) => x.ms), 50).toFixed(0).padStart(4)} ms  worst ${Math.max(...r.map((x) => x.ms)).toFixed(0).padStart(4)} ms  ${(ok[0]?.bytes / 1024 || 0).toFixed(0).padStart(5)} KB  cache ${[...new Set(r.map((x) => x.cache))].join(',')}`);
}

// ---- 2. more and more visitors at once (each visitor asks, waits for the answer, asks again)
line('\n2. More and more visitors at once');
let sent = 0, refused = 0, stopped = '';
const all = [];
for (const level of LEVELS) {
  if (stopped || sent >= MAX_TOTAL) break;
  const res = [], t0 = performance.now();
  let issued = 0, streak = 0;
  const worker = async () => {
    while (!stopped && issued < PER_LEVEL && sent < MAX_TOTAL) {
      issued++; sent++;
      const r = await get(pick()); res.push(r); all.push(r);
      if (r.status === 0 || r.status === 429 || r.status === 403 || r.status >= 500) { streak++; refused++; if (streak >= STOP_AFTER_REFUSALS) stopped = `stopped at ${level} visitors: the site started refusing (${r.status || r.err})`; } else streak = 0;
    }
  };
  await Promise.all(Array.from({ length: level }, worker));
  const secs = (performance.now() - t0) / 1000, ms = res.map((x) => x.ms), bad = res.filter((x) => x.status !== 200);
  const codes = res.reduce((m, x) => ((m[x.status] = (m[x.status] || 0) + 1), m), {});
  line(`  ${String(level).padStart(2)} at once: ${String(res.length).padStart(4)} requests in ${secs.toFixed(1).padStart(4)} s = ${(res.length / secs).toFixed(0).padStart(4)} per second | p50 ${pct(ms, 50).toFixed(0)} ms, p95 ${pct(ms, 95).toFixed(0)} ms, p99 ${pct(ms, 99).toFixed(0)} ms, worst ${Math.max(...ms).toFixed(0)} ms | not 200: ${bad.length} ${JSON.stringify(codes)}`);
  await new Promise((r) => setTimeout(r, 1500));
}
if (stopped) line('  ' + stopped);

// ---- 3. a crowd that arrives in the same second (40 visitors open the home address together)
if (!stopped) {
  line('\n3. A crowd in the same second: 40 visitors open the home address together');
  const t0 = performance.now();
  const r = await Promise.all(Array.from({ length: 40 }, () => get('/')));
  const ms = r.map((x) => x.ms);
  line(`  all 40 answered in ${(performance.now() - t0).toFixed(0)} ms | p50 ${pct(ms, 50).toFixed(0)} ms, p95 ${pct(ms, 95).toFixed(0)} ms, worst ${Math.max(...ms).toFixed(0)} ms | not 200: ${r.filter((x) => x.status !== 200).length}`);
}
const ms = all.map((x) => x.ms);
line(`\nTotal ${sent + 40} requests, ${all.filter((x) => x.status === 200).length}/${all.length} answered 200 in phase 2 (${refused} refused), p95 ${pct(ms, 95).toFixed(0)} ms.`);
