import React, { useEffect, useRef, useState } from 'react';
import { reducedMotion } from './UserDataRain';

// The running-code windows of the admin page "User's data". EVERYTHING in here is decoration made up on the spot (random numbers, made-up addresses from the documentation ranges,
// a sample of source code): it reads nothing from the database, claims no real activity and is labelled "decorative feeds". One shared timer drives all windows (about 24 frames a second
// at most), only the windows that are on screen are touched, the timer stops when the browser tab is hidden, and with "reduce motion" the windows show one still picture.
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const rnd = (n: number) => (Math.random() * n) | 0;
const pick = <T,>(a: T[]): T => a[rnd(a.length)];
const hex = (n: number, w = 2) => n.toString(16).padStart(w, '0');
const ring = (arr: string[], line: string, max: number) => { arr.push(line); while (arr.length > max) arr.shift(); };
const div = (cls: string, html: string) => `<div${cls ? ` class="${cls}"` : ''}>${html}</div>`;

interface Feed { id: string; title: string; period: number; lines: number; make: () => () => string }

// ---- cyan: network scan, ping, traceroute
const HOSTS = ['edge-bom1', 'edge-del2', 'core-sin3', 'gw-fra1', 'cdn-lhr2', 'edge-dxb1', 'hop-nrt4', 'core-iad5'];
const netFeed = (): (() => string) => {
  const out: string[] = [];
  let ttl = 1;
  const next = () => {
    const r = rnd(5);
    if (r === 0) return `<b>${pick(['192.0.2', '198.51.100', '203.0.113'])}.${1 + rnd(250)}</b>  ${pick([22, 80, 443, 8080, 5432, 3000])}/tcp  <i>open</i>  ${pick(['ssh', 'http', 'https', 'pgsql', 'node'])}`;
    if (r === 1) return `PING 203.0.113.${1 + rnd(250)} ttl=${50 + rnd(14)} <b>${(4 + Math.random() * 40).toFixed(1)}ms</b>`;
    if (r === 2) { ttl = ttl % 12 + 1; return `${String(ttl).padStart(2, ' ')}  ${pick(HOSTS)}  <b>${(1 + Math.random() * 30).toFixed(1)}ms</b>`; }
    if (r === 3) return `scan 198.51.100.0/24 ${'.'.repeat(6 + rnd(8))} <i>ok</i>`;
    return `ARP 10.0.${rnd(9)}.${1 + rnd(250)} is-at ${hex(rnd(256))}:${hex(rnd(256))}:${hex(rnd(256))}`;
  };
  for (let i = 0; i < 7; i++) ring(out, div('', next()), 7);
  return () => { ring(out, div('', next()), 7); return out.join(''); };
};

// ---- magenta: packet hex dump with offsets
const hexFeed = (): (() => string) => {
  const out: string[] = [];
  let off = 0x0040 * rnd(60);
  const next = () => {
    const bytes: number[] = Array.from({ length: 8 }, () => rnd(256));
    const line = `<b>${hex(off & 0xffff, 4)}</b>  ${bytes.map((b, i) => (i === 3 ? `<i>${hex(b)}</i>` : hex(b))).join(' ')}`;
    off += 8;
    return div('', line);
  };
  for (let i = 0; i < 7; i++) ring(out, next(), 7);
  return () => { ring(out, next(), 7); return out.join(''); };
};

// ---- amber: process / thread table with CPU bars
const procFeed = (): (() => string) => {
  const names = ['edge-worker', 'map-render', 'tile-cache', 'ws-relay', 'db-pool', 'log-ship'];
  const rows = names.map((n, i) => ({ pid: 4100 + i * 37 + rnd(30), cpu: 5 + rnd(70), n }));
  const bar = (c: number) => { const f = Math.round(c / 12.5); return '█'.repeat(f) + '░'.repeat(8 - f); };
  const render = () => div('h', 'PID   CPU      NAME') + rows.map((r) => div('', `<b>${r.pid}</b> <i>${bar(r.cpu)}</i> ${String(r.cpu).padStart(2, ' ')}% ${r.n}`)).join('');
  return () => { for (let i = 0; i < 3; i++) { const r = pick(rows); r.cpu = Math.max(1, Math.min(99, r.cpu + rnd(31) - 15)); } return render(); };
};

// ---- red: signal ticker (decorative, rate-limited by its slow period)
const alertFeed = (): (() => string) => {
  const out: string[] = [];
  let lost: string | null = null;
  const t = () => new Date().toISOString().slice(11, 19);
  return () => {
    if (lost) { ring(out, div('', `${t()} <b>REACQUIRED</b> ${lost} +${(Math.random() * 1.4 + 0.2).toFixed(1)}s`), 7); lost = null; }
    else if (Math.random() < 0.7) { lost = `ch-${String(rnd(24)).padStart(2, '0')}`; ring(out, div('', `${t()} <b>SIGNAL LOST</b> ${lost}`), 7); }
    else ring(out, div('d', `${t()} link jitter ${3 + rnd(20)}ms`), 7);
    return out.join('');
  };
};

// ---- violet: scrolling source listing, coloured by kind of word
const SRC = [
  '// tile cache, decorative sample', 'use std::collections::HashMap;', '', 'pub struct Tile { x: u32, y: u32, z: u8 }', '', 'impl Cache {', '  pub fn get(&self, t: &Tile) -> Option<&[u8]> {',
  '    let key = (t.z as u64) << 40 | (t.x as u64) << 20 | t.y as u64;', '    self.map.get(&key).map(|b| b.as_slice())', '  }', '', '  pub fn put(&mut self, t: Tile, bytes: Vec<u8>) {',
  '    if self.size + bytes.len() > 4096 {', '      self.evict_oldest();', '    }', '    self.map.insert(key_of(&t), bytes);', '  }', '}', '',
  'async function sync(feed: Feed): Promise<void> {', '  const res = await fetch("/api/ping", { cache: "no-store" });', '  if (!res.ok) throw new Error("retry in 30s");', '  for (const row of await res.json()) render(row, 12);', '}', ''
];
const KEYWORDS = /^(pub|fn|use|let|impl|struct|if|else|for|const|async|await|function|return|throw|new|as|mut|in)$/;
const highlight = (src: string): string => {
  if (/^\s*\/\//.test(src)) return `<em class="cm">${esc(src)}</em>`;
  return esc(src).replace(/(&quot;|"[^"]*")|(\b\d+\b)|(\b[A-Za-z_][A-Za-z0-9_]*\b)(\()?/g, (m, str, num, word, paren) => {
    if (str) return `<em class="st">${m}</em>`;
    if (num) return `<em class="nu">${m}</em>`;
    if (word && KEYWORDS.test(word)) return `<em class="kw">${word}</em>${paren || ''}`;
    if (word && paren) return `<em class="fn">${word}</em>(`;
    return m;
  });
};
const codeFeed = (): (() => string) => {
  let at = rnd(SRC.length);
  const out: string[] = [];
  const next = () => { const l = SRC[at % SRC.length]; at++; return div('', highlight(l) || '&nbsp;'); };
  for (let i = 0; i < 7; i++) ring(out, next(), 7);
  return () => { ring(out, next(), 7); return out.join(''); };
};

// ---- white-green: a decrypt / progress animation with hash text that resolves
const decryptFeed = (): (() => string) => {
  const HEXC = '0123456789abcdef';
  const mk = () => Array.from({ length: 24 }, () => HEXC[rnd(16)]).join('');
  let target = mk(), done = 0, hold = 0, pass = 1;
  return () => {
    if (done >= 24) { if (++hold > 14) { target = mk(); done = 0; hold = 0; pass++; } }
    else done = Math.min(24, done + 1 + rnd(2));
    const pct = Math.round((done / 24) * 100);
    const fill = Math.round((done / 24) * 18);
    const scramble = Array.from({ length: 24 - done }, () => HEXC[rnd(16)]).join('');
    return div('', `DECRYPT <b>[${'█'.repeat(fill)}${'░'.repeat(18 - fill)}]</b>`) +
      div('', `<b>${target.slice(0, done)}</b><i>${scramble}</i>`) +
      div('', `pass ${pass}  ${pct}%  ${done >= 24 ? '<b>OK</b>' : 'working'}`) +
      div('d', `key  ${HEXC[rnd(16)]}${HEXC[rnd(16)]}..${HEXC[rnd(16)]}${HEXC[rnd(16)]}  rounds 14`);
  };
};

const FEEDS: Feed[] = [
  { id: 'net', title: 'net-scan', period: 700, lines: 7, make: netFeed },
  { id: 'hex', title: 'packet-dump', period: 450, lines: 7, make: hexFeed },
  { id: 'proc', title: 'threads', period: 1100, lines: 7, make: procFeed },
  { id: 'alert', title: 'signal', period: 2300, lines: 7, make: alertFeed },
  { id: 'code', title: 'source.rs', period: 650, lines: 7, make: codeFeed },
  { id: 'dec', title: 'decrypt', period: 110, lines: 4, make: decryptFeed }
];

export const UserDataFeeds: React.FC<{ open: boolean; onToggle: () => void }> = ({ open, onToggle }) => {
  const dock = useRef<HTMLDivElement | null>(null);
  const bodies = useRef<(HTMLDivElement | null)[]>([]);
  const [off, setOff] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const makers = FEEDS.map((f) => f.make());
    const still = reducedMotion();
    const paint = (i: number) => { const el = bodies.current[i]; if (el) el.innerHTML = makers[i](); };
    for (let i = 0; i < FEEDS.length; i++) { paint(i); if (still) for (let k = 0; k < 3; k++) paint(i); }   // a still picture is already "full"
    if (still) return;
    const due = FEEDS.map(() => 0);
    let raf = 0, last = 0, frames = 0, spent = 0;
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      if (t - last < 41) return;   // 24 frames a second at most
      last = t;
      const t0 = performance.now();
      for (let i = 0; i < FEEDS.length; i++) {
        if (t < due[i]) continue;
        const el = bodies.current[i];
        if (!el || el.offsetParent === null) { due[i] = t + 500; continue; }   // collapsed, or the strip is closed: no work at all
        due[i] = t + FEEDS[i].period;
        paint(i);
      }
      spent += performance.now() - t0; frames++;
      if (frames >= 30 && dock.current) { dock.current.dataset.fxMs = (spent / frames).toFixed(2); frames = 0; spent = 0; }
    };
    const start = () => { if (!raf && !document.hidden) raf = requestAnimationFrame(frame); };
    const stop = () => { if (raf) { cancelAnimationFrame(raf); raf = 0; } };
    const onVis = () => (document.hidden ? stop() : start());
    start();
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  return (
    <div ref={dock} className={`ud-dock${open ? ' open' : ''}`} data-testid="ud-dock">
      <button className="ud-dock-toggle" onClick={onToggle} aria-expanded={open} aria-label={open ? 'Hide the running code windows' : 'Show the running code windows'} data-testid="ud-dock-toggle">
        <span className="ud-leds" aria-hidden="true"><i /><i /><i /></span> {open ? 'v' : '>'} FEEDS <span className="ud-dim">decorative</span>
      </button>
      <div className="ud-tabs">
        {FEEDS.map((f, i) => (
          <section key={f.id} className={`ud-tab c-${f.id}${off[f.id] ? ' off' : ''}`} data-testid={`ud-tab-${f.id}`}>
            <button className="ud-tab-bar" onClick={() => setOff((o) => ({ ...o, [f.id]: !o[f.id] }))} aria-expanded={!off[f.id]} aria-label={`${f.title} window: ${off[f.id] ? 'show' : 'collapse'}`}>
              <span className="ud-dots3" aria-hidden="true"><i /><i /><i /></span>
              <span className="ud-tab-name">{f.title}</span>
              <span className="ud-led" aria-hidden="true" />
            </button>
            <div className="ud-tab-body" ref={(el) => { bodies.current[i] = el; }} aria-hidden="true" />
          </section>
        ))}
      </div>
    </div>
  );
};

// ---- a thin ticker under the header: UTC time, written straight into the page once a second (no re-render)
const TICKER = 'USER_DATA // MAP LINK STABLE // LOC SRC ip-geo (city level) // RENDER 24fps CAP // THIS FEED IS DECORATIVE // ';
export const UserDataTicker: React.FC = () => {
  const clock = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    const set = () => { if (clock.current) clock.current.textContent = new Date().toISOString().slice(11, 19); };
    set();
    const t = window.setInterval(() => { if (!document.hidden) set(); }, 1000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div className="ud-ticker" aria-hidden="true" data-testid="ud-ticker">
      <span className="ud-ticker-time">UTC <b ref={clock}>--:--:--</b></span>
      <span className="ud-ticker-run"><span>{TICKER.repeat(3)}</span></span>
    </div>
  );
};

// ---- typed boot lines at the start (they stay for a few seconds, then fade out)
const BOOT_LINES = ['> boot user_data.sys', '> link edge .......... ok', '> load world-110m ...... ok', '> geo source: ip-geo (approx)', '> feeds online (decorative)'];
export const UserDataBoot: React.FC = () => {
  const [typed, setTyped] = useState(() => (reducedMotion() ? BOOT_LINES.join('\n') : ''));
  const [gone, setGone] = useState(false);
  const full = BOOT_LINES.join('\n');
  useEffect(() => {
    if (typed.length >= full.length) { const t = window.setTimeout(() => setGone(true), 3200); return () => window.clearTimeout(t); }
    const t = window.setTimeout(() => setTyped(full.slice(0, typed.length + 1)), 22);
    return () => window.clearTimeout(t);
  }, [typed, full]);
  if (gone) return null;
  return <pre className="ud-bootlog" aria-hidden="true" data-testid="ud-bootlog">{typed}<span className="ud-cursor" /></pre>;
};
