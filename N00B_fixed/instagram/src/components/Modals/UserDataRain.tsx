import React, { useEffect, useRef } from 'react';

// Decorative "code rain" behind the User data map: falling hex / binary and drifting snippets of made-up source and log lines. It shows NO real data and is meant to look like what it is.
// Cost: about 25 frames a second, one letter per column per frame, no allocation. It stops when the tab is hidden and draws one still picture when the person asked for less motion.
const GLYPHS = '0123456789ABCDEF01{}[]<>/=;:+*#';
export const RAIN_SNIPPETS = [
  '0x7f3a', '0xDEADBEEF', '0b10110010', 'fn locate(user) -> Place', 'SELECT id, city FROM places LIMIT 50;', 'GET /rpc/locate 200 12ms', 'pkt seq=4411 ttl=57 ack',
  'if (!ok) panic!("no route")', 'struct Place { lat: f32, lng: f32 }', 'for (;;) { poll(fd); }', 'kernel: eth0 link up 1000Mbps', 'chmod 600 id_rsa', 'tail -f /var/log/edge.log',
  'let grid = cluster(dots, 22);', 'sha256:9b1f..e04c OK', 'tcp 10.0.0.7:443 ESTABLISHED', 'while true; do sleep 1; done', 'mov eax, [ebp-0x14]', '>>> render(map, zoom=3.2)', 'ssh -N -L 8443:edge:443'
];

export const reducedMotion = (): boolean => { try { return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

interface Drop { x: number; y: number; speed: number }
interface Line { text: string; x: number; y: number; vx: number; life: number }

export const UserDataRain: React.FC = () => {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d', { alpha: false });
    if (!canvas || !ctx) return;
    const still = reducedMotion();
    const FONT = 13, COL = 15;
    let w = 0, h = 0, raf = 0, last = 0, spawn = 0;
    let drops: Drop[] = [];
    const lines: Line[] = [];
    const size = () => {
      w = Math.max(1, Math.floor(canvas.clientWidth)); h = Math.max(1, Math.floor(canvas.clientHeight));
      canvas.width = w; canvas.height = h;
      ctx.fillStyle = '#020a05'; ctx.fillRect(0, 0, w, h);
      ctx.font = `${FONT}px ui-monospace, Menlo, Consolas, monospace`;
      drops = Array.from({ length: Math.ceil(w / COL) }, (_, i) => ({ x: i * COL, y: Math.random() * h, speed: 5 + Math.random() * 9 }));
      if (still) paintStill();
    };
    const glyph = () => GLYPHS[(Math.random() * GLYPHS.length) | 0];
    const paintStill = () => {
      ctx.fillStyle = '#020a05'; ctx.fillRect(0, 0, w, h);
      ctx.font = `${FONT}px ui-monospace, Menlo, Consolas, monospace`;
      for (const d of drops) {
        const len = 4 + ((d.speed | 0) % 9);
        for (let i = 0; i < len; i++) { ctx.fillStyle = `rgba(0,255,102,${0.12 + (i / len) * 0.6})`; ctx.fillText(glyph(), d.x, (d.y + i * (FONT + 1)) % h); }
      }
      ctx.fillStyle = 'rgba(0,255,102,0.55)';
      for (let i = 0; i < 6; i++) ctx.fillText(RAIN_SNIPPETS[(i * 3) % RAIN_SNIPPETS.length], 12 + ((i * 97) % Math.max(40, w - 220)), 40 + ((i * 131) % Math.max(60, h - 80)));
    };
    const draw = () => {
      ctx.fillStyle = 'rgba(2,10,5,0.11)'; ctx.fillRect(0, 0, w, h);
      ctx.font = `${FONT}px ui-monospace, Menlo, Consolas, monospace`;
      for (const d of drops) {
        ctx.fillStyle = 'rgba(190,255,215,0.9)'; ctx.fillText(glyph(), d.x, d.y);
        d.y += d.speed;
        if (d.y > h + 20 && Math.random() > 0.96) { d.y = -10; d.speed = 5 + Math.random() * 9; }
      }
      spawn++;
      if (spawn % 38 === 0 && lines.length < 6) lines.push({ text: RAIN_SNIPPETS[(Math.random() * RAIN_SNIPPETS.length) | 0], x: -120, y: 24 + Math.random() * Math.max(20, h - 48), vx: 0.6 + Math.random() * 1.6, life: 0 });
      for (let i = lines.length - 1; i >= 0; i--) {
        const l = lines[i];
        l.x += l.vx; l.life++;
        ctx.fillStyle = 'rgba(0,255,102,0.85)'; ctx.fillText(l.text, l.x, l.y);
        if (l.x > w + 40) lines.splice(i, 1);
      }
    };
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      if (t - last < 40) return;   // 25 frames a second at most
      last = t;
      draw();
    };
    const start = () => { if (!raf && !still && !document.hidden) raf = requestAnimationFrame(frame); };
    const stop = () => { if (raf) { cancelAnimationFrame(raf); raf = 0; } };
    const onVis = () => (document.hidden ? stop() : start());
    size();
    start();
    document.addEventListener('visibilitychange', onVis);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => size()) : null;
    ro?.observe(canvas);
    return () => { stop(); document.removeEventListener('visibilitychange', onVis); ro?.disconnect(); };
  }, []);
  return <canvas ref={ref} className="ud-rain" aria-hidden="true" data-testid="ud-rain" />;
};
