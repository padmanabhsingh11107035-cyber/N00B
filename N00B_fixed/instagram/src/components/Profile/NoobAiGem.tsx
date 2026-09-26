import React, { useEffect, useRef } from 'react';

interface NoobAiGemProps {
  size?: number;
  // Sleeping: grey and slow (NOOB AI's computer is switched off).
  sleeping?: boolean;
}

// NOOB AI's 3D gem: a colourful faceted crystal rotating in 3D, drawn on a canvas (no libraries). The same design
// as the assistant's own screens (server/web/gem.js in N00B_fixed/noob-ai).
// An icosahedron, each face split into 4 on a sphere, each of those split into 3 around a point pulled outwards =
// 240 facets. Every frame: rotate, skip facets facing away, draw the rest back-to-front with simple lighting; each
// facet is a bold colour with a white outline and a smaller triangle of another colour inside.
type Vec = [number, number, number];
type Facet = { pts: [Vec, Vec, Vec]; n: Vec; outer: Vec; inner: Vec };

const PALETTE = ['#e6007e', '#00aeef', '#ffd200', '#6a2c91', '#2bb673', '#ef3b24', '#f7941d', '#23206b', '#ff5fa2', '#00c9b7'];
const norm = (a: Vec): Vec => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };
const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: Vec, k: number): Vec => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const rgb = (hex: string): Vec => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const LIGHT = norm([-0.45, 0.6, 0.9]);

function makeFacets(): Facet[] {
  const t = (1 + Math.sqrt(5)) / 2;
  const v = ([[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]] as Vec[]).map(norm);
  const ico = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2],
    [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5],
    [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  const faces: [Vec, Vec, Vec][] = [];
  for (const [i, j, k] of ico) {
    const a = v[i], b = v[j], c = v[k];
    const ab = norm(add(a, b)), bc = norm(add(b, c)), ca = norm(add(c, a));
    faces.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]);
  }
  let seed = 20260927;                                        // same colours every time
  const pick = () => (seed = (seed * 16807) % 2147483647) % PALETTE.length;
  const facets: Facet[] = [];
  for (const [a, b, c] of faces) {
    const tip = mul(norm(add(add(a, b), c)), 1.045);
    for (const [p, q] of [[a, b], [b, c], [c, a]] as [Vec, Vec][]) {
      let n = norm(cross(sub(q, p), sub(tip, p)));
      if (dot(n, mul(add(add(p, q), tip), 1 / 3)) < 0) n = mul(n, -1);
      const outer = pick();
      let inner = pick();
      if (inner === outer) inner = (inner + 3) % PALETTE.length;
      facets.push({ pts: [p, q, tip], n, outer: rgb(PALETTE[outer]), inner: rgb(PALETTE[inner]) });
    }
  }
  return facets;
}
const FACETS = makeFacets();

const CSS = `
.nai-gem{position:relative;flex:none}
.nai-gem canvas{position:relative;display:block;width:100%;height:100%;filter:drop-shadow(0 12px 16px rgba(106,44,145,.35))}
.nai-gem-halo{position:absolute;inset:-14%;border-radius:50%;pointer-events:none;background:conic-gradient(from 0deg,#00aeef,#6a2c91,#e6007e,#ffd200,#2bb673,#00aeef);filter:blur(26px);opacity:.35;animation:nai-gem-spin 10s linear infinite,nai-gem-glow 4s ease-in-out infinite}
.nai-gem.sleep canvas{filter:grayscale(1) brightness(1.1) drop-shadow(0 10px 14px rgba(15,23,42,.2))}
.nai-gem.sleep .nai-gem-halo{filter:blur(26px) grayscale(1);animation-duration:40s,8s}
@keyframes nai-gem-spin{to{transform:rotate(360deg)}}
@keyframes nai-gem-glow{0%,100%{opacity:.26}50%{opacity:.5}}
`;

export const NoobAiGem: React.FC<NoobAiGemProps> = ({ size = 200, sleeping = false }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sleepingRef = useRef(sleeping);
  sleepingRef.current = sleeping;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    let angleY = 0.6;
    let last = performance.now();
    let raf = 0;
    const shade = (c: Vec, light: number) => {
      const k = 0.7 + 0.3 * light;
      return `rgb(${Math.round(c[0] * k)},${Math.round(c[1] * k)},${Math.round(c[2] * k)})`;
    };
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (document.hidden) return;
      angleY += (sleepingRef.current ? 0.08 : 0.45) * dt;
      const t = now / 1000;
      const angleX = 0.38 * Math.sin(t * 0.37) + 0.25;
      const pulse = 1 + 0.015 * Math.sin(t * 1.6);
      const cy = Math.cos(angleY), sy = Math.sin(angleY), cx = Math.cos(angleX), sx = Math.sin(angleX);
      const rot = (p: Vec): Vec => {
        const x = p[0] * cy + p[2] * sy, z = -p[0] * sy + p[2] * cy;
        return [x, p[1] * cx - z * sx, p[1] * sx + z * cx];
      };
      const R = size * dpr * 0.42 * pulse, mid = (size * dpr) / 2, eye = 4.5;
      const project = (p: Vec) => { const k = eye / (eye - p[2]); return [mid + p[0] * R * k, mid - p[1] * R * k]; };
      const visible: { f: Facet; n: Vec; pts: Vec[]; depth: number }[] = [];
      for (const f of FACETS) {
        const n = rot(f.n);
        if (n[2] <= 0.02) continue;
        const pts = f.pts.map(rot);
        visible.push({ f, n, pts, depth: (pts[0][2] + pts[1][2] + pts[2][2]) / 3 });
      }
      visible.sort((a, b) => a.depth - b.depth);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.lineJoin = 'round';
      const line = Math.max(1, (size * dpr) / 150);
      for (const { f, n, pts } of visible) {
        const light = Math.max(0, dot(n, LIGHT));
        const [a, b, c] = pts.map(project);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.closePath();
        ctx.fillStyle = shade(f.outer, light);
        ctx.fill();
        ctx.lineWidth = line;
        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        ctx.stroke();
        const g = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3];
        const inset = (p: number[]) => [g[0] + (p[0] - g[0]) * 0.52, g[1] + (p[1] - g[1]) * 0.52];
        const [ia, ib, ic] = [inset(a), inset(b), inset(c)];
        ctx.beginPath(); ctx.moveTo(ia[0], ia[1]); ctx.lineTo(ib[0], ib[1]); ctx.lineTo(ic[0], ic[1]); ctx.closePath();
        ctx.fillStyle = shade(f.inner, light);
        ctx.fill();
        ctx.lineWidth = line * 0.7;
        ctx.stroke();
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [size]);

  return (
    <div className={`nai-gem${sleeping ? ' sleep' : ''}`} style={{ width: size, height: size }} aria-hidden="true">
      <style>{CSS}</style>
      <div className="nai-gem-halo" />
      <canvas ref={canvasRef} />
    </div>
  );
};
