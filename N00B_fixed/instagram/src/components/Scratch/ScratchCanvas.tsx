import React, { useCallback, useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { Sparkles, Trophy } from 'lucide-react';
import { calculateClearedPercentage, distanceBetween, interpolatePoints, scratchAudio, type ScratchTool } from './scratchEngine';
import type { FoilType } from './scratchData';

// The foil over a picture and the scratching of it. The picture lies under a canvas; a finger or mouse wipes the canvas away (destination-out). A little scratching wipes the
// whole foil away with a soft ring and a small celebration. Everything is drawn in the phone: the canvas is sharp on sharp screens (up to 2x), and a card that was opened
// before (or that you posted yourself) starts open.
const DOODLE_SRC = '/brand/doodle-white.webp';
const MAX_DPR = 2;

interface Props {
  imageSrc: string;
  foil: FoilType;
  tool: ScratchTool;
  brushMultiplier: number;
  soundEnabled: boolean;
  isPeeking: boolean;
  /** starts without foil (opened before, or your own card) */
  startOpen: boolean;
  resealTrigger: number;
  magicRevealTrigger: number;
  onPercentageChange: (pct: number) => void;
  /** the foil has just been scratched away by the person (not for a card that started open) */
  onRevealed?: () => void;
}

export const ScratchCanvas: React.FC<Props> = ({ imageSrc, foil, tool, brushMultiplier, soundEnabled, isPeeking, startOpen, resealTrigger, magicRevealTrigger, onPercentageChange, onRevealed }) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const wiping = useRef(false);
  const strokes = useRef(0);
  const last = useRef<{ x: number; y: number } | null>(null);
  const lastSample = useRef(0);
  const doodle = useRef<HTMLImageElement | null>(null);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const openRef = useRef(startOpen);          // the foil is gone
  const wasOpenAtStart = useRef(startOpen);
  const [open, setOpen] = useState(startOpen);
  const [pct, setPct] = useState(startOpen ? 100 : 0);
  const [dust, setDust] = useState<Array<{ id: number; x: number; y: number; color: string }>>([]);
  const [imageReady, setImageReady] = useState(false);
  const [banner, setBanner] = useState(false);

  const setOpenBoth = (v: boolean) => { openRef.current = v; setOpen(v); };

  useEffect(() => {
    const img = new Image();
    img.onload = () => { doodle.current = img; paintFoil(); };
    img.src = DOODLE_SRC;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const celebrate = useCallback(() => {
    try {
      confetti({ particleCount: 70, spread: 70, origin: { y: 0.6 }, colors: ['#ffffff', '#facc15', '#38bdf8', '#f43f5e', '#a855f7'], disableForReducedMotion: true });
    } catch { /* a celebration is never a reason to fail */ }
    if (soundEnabled) { scratchAudio.playChime(659.25); setTimeout(() => scratchAudio.playChime(880), 120); }
  }, [soundEnabled]);

  const paintFoil = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { w, h, dpr } = sizeRef.current;
    if (!w || !h) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, w, h);
    if (openRef.current) return;

    if (foil === 'doodle') {
      ctx.fillStyle = '#0d0d11';
      ctx.fillRect(0, 0, w, h);
      if (doodle.current && doodle.current.naturalWidth > 0) {
        try {
          ctx.save();
          ctx.globalAlpha = 0.55;
          const p = ctx.createPattern(doodle.current, 'repeat');
          if (p) { ctx.scale(0.62, 0.62); ctx.fillStyle = p; ctx.fillRect(0, 0, w / 0.62, h / 0.62); }
          ctx.restore();
        } catch { /* plain foil then */ }
      }
      const g = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, Math.max(w, h) * 0.7);
      g.addColorStop(0, 'rgba(0,0,0,0.05)'); g.addColorStop(1, 'rgba(0,0,0,0.5)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2.5; ctx.setLineDash([12, 8]);
      ctx.strokeRect(14, 14, w - 28, h - 28); ctx.setLineDash([]);
      const bw = Math.min(250, w - 44), bh = 86, bx = (w - bw) / 2, by = (h - bh) / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.92)'; ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.strokeRect(bx, by, bw, bh);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.font = '900 19px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillText('NOOB SOCIALS', w / 2, by + 36);
      ctx.font = '700 13px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillText('★ SCRATCH TO REVEAL ★', w / 2, by + 62);
    } else if (foil === 'silver') {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#6b7280'); g.addColorStop(0.3, '#d1d5db'); g.addColorStop(0.5, '#9ca3af'); g.addColorStop(0.7, '#f3f4f6'); g.addColorStop(1, '#4b5563');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1;
      for (let i = 0; i < h; i += 6) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(w, i); ctx.stroke(); }
      ctx.fillStyle = '#111827'; ctx.fillRect(w / 2 - 110, h / 2 - 38, 220, 76);
      ctx.strokeStyle = '#d1d5db'; ctx.lineWidth = 2; ctx.strokeRect(w / 2 - 110, h / 2 - 38, 220, 76);
      ctx.fillStyle = '#f3f4f6'; ctx.textAlign = 'center';
      ctx.font = '800 16px "Plus Jakarta Sans", system-ui, sans-serif'; ctx.fillText('SILVER CHROME FOIL', w / 2, h / 2 - 4);
      ctx.font = '600 12px "Plus Jakarta Sans", system-ui, sans-serif'; ctx.fillText('🪙 Scratch with coin or key', w / 2, h / 2 + 20);
    } else if (foil === 'gold') {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#ca8a04'); g.addColorStop(0.3, '#fef08a'); g.addColorStop(0.5, '#eab308'); g.addColorStop(0.8, '#fde047'); g.addColorStop(1, '#a16207');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      let seed = 7;
      const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };   // the same speckles every time the foil is drawn
      for (let i = 0; i < 150; i++) { ctx.beginPath(); ctx.arc(rnd() * w, rnd() * h, rnd() * 2 + 1, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#422006'; ctx.fillRect(w / 2 - 120, h / 2 - 40, 240, 80);
      ctx.strokeStyle = '#fef08a'; ctx.lineWidth = 3; ctx.strokeRect(w / 2 - 120, h / 2 - 40, 240, 80);
      ctx.fillStyle = '#fef08a'; ctx.textAlign = 'center';
      ctx.font = '900 18px "Plus Jakarta Sans", system-ui, sans-serif'; ctx.fillText('★ 24K GOLD VIP ★', w / 2, h / 2 - 4);
      ctx.font = '700 12px "Plus Jakarta Sans", system-ui, sans-serif'; ctx.fillText('EXCLUSIVE SCRATCH DROP', w / 2, h / 2 + 20);
    } else {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#ec4899'); g.addColorStop(0.25, '#8b5cf6'); g.addColorStop(0.5, '#06b6d4'); g.addColorStop(0.75, '#10b981'); g.addColorStop(1, '#f59e0b');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(w * 0.4, 0); ctx.lineTo(w * 0.6, 0); ctx.lineTo(0, h * 0.7); ctx.fill();
      ctx.fillStyle = '#0f172a'; ctx.fillRect(w / 2 - 110, h / 2 - 38, 220, 76);
      ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2; ctx.strokeRect(w / 2 - 110, h / 2 - 38, 220, 76);
      ctx.fillStyle = '#38bdf8'; ctx.textAlign = 'center';
      ctx.font = '900 17px "Plus Jakarta Sans", system-ui, sans-serif'; ctx.fillText('CYBER HOLOGRAM', w / 2, h / 2 - 4);
      ctx.fillStyle = '#f472b6'; ctx.font = '700 12px "Plus Jakarta Sans", system-ui, sans-serif'; ctx.fillText('✨ Holographic Mystery Drop', w / 2, h / 2 + 20);
    }
  }, [foil]);

  const resize = useCallback(() => {
    const canvas = canvasRef.current, box = boxRef.current;
    if (!canvas || !box) return;
    const r = box.getBoundingClientRect();
    const w = Math.round(r.width), h = Math.round(r.height);
    if (w < 10 || h < 10) return;
    const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    const cur = sizeRef.current;
    if (cur.w === w && cur.h === h && cur.dpr === dpr) return;
    // a card that is being scratched keeps its foil when the phone's address bar slides (a tiny change in height)
    if (canvas.width && Math.abs(cur.w - w) < 3 && Math.abs(cur.h - h) < 60 && !openRef.current && strokes.current > 0) return;
    sizeRef.current = { w, h, dpr };
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    paintFoil();
  }, [paintFoil]);

  useEffect(() => {
    resize();
    const t = window.setTimeout(resize, 60);
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && boxRef.current) { ro = new ResizeObserver(() => resize()); ro.observe(boxRef.current); }
    window.addEventListener('resize', resize);
    return () => { window.clearTimeout(t); ro?.disconnect(); window.removeEventListener('resize', resize); };
  }, [resize]);

  useEffect(() => { paintFoil(); }, [foil, paintFoil]);

  // Reseal: the foil comes back
  useEffect(() => {
    if (resealTrigger <= 0) return;
    wiping.current = false; strokes.current = 0; wasOpenAtStart.current = false;
    setOpenBoth(false); setBanner(false); setPct(0); onPercentageChange(0);
    paintFoil();
    if (soundEnabled) scratchAudio.playChime(440);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resealTrigger]);

  const finish = useCallback((byPerson: boolean) => {
    const canvas = canvasRef.current;
    if (canvas) { const c = canvas.getContext('2d'); if (c) { c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, canvas.width, canvas.height); } }
    setOpenBoth(true); setPct(100); onPercentageChange(100);
    wiping.current = false;
    if (byPerson) { celebrate(); onRevealed?.(); setBanner(true); window.setTimeout(() => setBanner(false), 3500); }
  }, [celebrate, onPercentageChange, onRevealed]);

  // a soft ring that grows from the middle and wipes the rest of the foil away
  const wipeAll = useCallback((byPerson = true) => {
    if (wiping.current || openRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) { finish(byPerson); return; }
    wiping.current = true;
    const { w, h, dpr } = sizeRef.current;
    const start = performance.now(), dur = 300, maxR = Math.hypot(w, h);
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath(); ctx.arc(w / 2, h / 2, Math.max(0.1, maxR * p), 0, Math.PI * 2); ctx.fill();
      if (p < 1) requestAnimationFrame(step); else finish(byPerson);
    };
    requestAnimationFrame(step);
  }, [finish]);

  useEffect(() => { if (magicRevealTrigger > 0) wipeAll(true); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [magicRevealTrigger]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const scratchAt = (ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) => {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    if (tool.shape === 'sharp') ctx.ellipse(x, y, radius * 0.7, radius * 1.5, Math.PI / 4, 0, Math.PI * 2);
    else if (tool.shape === 'brush') ctx.roundRect(x - radius, y - radius * 0.7, radius * 2, radius * 1.4, 8);
    else ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  };

  const sparkle = (x: number, y: number) => {
    const color = foil === 'gold' ? '#facc15' : foil === 'holographic' ? '#38bdf8' : '#ffffff';
    const add = Array.from({ length: 3 }, () => ({ id: Math.random(), x: x + (Math.random() * 24 - 12), y: y + (Math.random() * 24 - 12), color }));
    setDust((prev) => [...prev.slice(-9), ...add]);
  };

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (openRef.current || wiping.current) return;
    const canvas = canvasRef.current; const ctx = canvas?.getContext('2d', { willReadFrequently: true });
    if (!canvas || !ctx) return;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* fine */ }
    drawing.current = true; strokes.current += 1;
    const pt = point(e); last.current = pt;
    ctx.setTransform(sizeRef.current.dpr, 0, 0, sizeRef.current.dpr, 0, 0);
    scratchAt(ctx, pt.x, pt.y, tool.radius * brushMultiplier);
    if (soundEnabled) scratchAudio.startScratchSound(tool.soundPitch);
    sparkle(pt.x, pt.y);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !last.current || openRef.current || wiping.current) return;
    const canvas = canvasRef.current; const ctx = canvas?.getContext('2d', { willReadFrequently: true });
    if (!canvas || !ctx) return;
    const cur = point(e);
    const dist = distanceBetween(last.current, cur);
    const radius = tool.radius * brushMultiplier;
    ctx.setTransform(sizeRef.current.dpr, 0, 0, sizeRef.current.dpr, 0, 0);
    for (const p of interpolatePoints(last.current, cur, Math.max(3, radius * 0.35))) scratchAt(ctx, p.x, p.y, radius);
    if (soundEnabled) scratchAudio.updateScratchVelocity(dist);
    last.current = cur;
    if (Math.random() > 0.5) sparkle(cur.x, cur.y);
    const now = performance.now();
    if (now - lastSample.current > 90) {
      lastSample.current = now;
      try {
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const v = calculateClearedPercentage(img, 14, 30);
        setPct(v); onPercentageChange(v);
        if (v >= 3) wipeAll(true);          // "scratch a little and the foil goes away by itself"
      } catch { /* the picture is never blocked by a measuring problem */ }
    }
  };

  const up = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const was = drawing.current;
    drawing.current = false; last.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* fine */ }
    if (soundEnabled) scratchAudio.stopScratchSound();
    if (was && e.type === 'pointerup' && strokes.current >= 1 && !openRef.current && !wiping.current) wipeAll(true);
  };

  return (
    <div ref={boxRef} className="relative w-full aspect-[4/5] rounded-[22px] overflow-hidden bg-zinc-950 ring-1 ring-white/25 shadow-[0_18px_50px_-18px_rgba(0,0,0,0.9)] select-none" data-testid="scratch-card-container">
      {!imageReady && <div className="absolute inset-0 animate-pulse bg-zinc-900" aria-hidden="true" />}
      <img src={imageSrc} alt="" draggable={false} onLoad={() => setImageReady(true)} className="absolute inset-0 w-full h-full object-cover pointer-events-none" />
      <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/80 via-black/30 to-transparent pointer-events-none" />

      <canvas
        data-testid="scratch-canvas"
        ref={canvasRef}
        aria-label="Scratch foil"
        className={`absolute inset-0 w-full h-full z-10 transition-opacity duration-300 ${open ? 'pointer-events-none' : 'cursor-crosshair'} ${isPeeking ? 'opacity-20' : 'opacity-100'}`}
        style={{ touchAction: 'pan-y' }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      />

      <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden" aria-hidden="true">
        {dust.map((p) => <span key={p.id} className="absolute w-1.5 h-1.5 rounded-full animate-ping" style={{ left: p.x, top: p.y, backgroundColor: p.color }} />)}
      </div>

      {banner && open && (
        <div className="scratch-unlocked absolute top-3 inset-x-3 z-30 flex items-center justify-between px-3.5 py-2 rounded-2xl bg-black/80 ring-1 ring-white/30 backdrop-blur-md">
          <div className="flex items-center gap-2 min-w-0">
            <Trophy className="w-5 h-5 text-yellow-400 shrink-0" />
            <span className="text-[11px] font-black uppercase tracking-wide text-white truncate">Photo Unlocked! ({pct}%)</span>
          </div>
          <div className="hidden min-[440px]:flex items-center gap-1 text-[11px] font-bold text-yellow-300 shrink-0">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Community Verified</span>
          </div>
        </div>
      )}

      {isPeeking && (
        <div className="absolute top-3 inset-x-3 z-30 text-center py-2 bg-yellow-400 text-black font-black text-xs rounded-xl animate-pulse">
          👀 X-RAY PEEK ACTIVE (1.5s)
        </div>
      )}
    </div>
  );
};
