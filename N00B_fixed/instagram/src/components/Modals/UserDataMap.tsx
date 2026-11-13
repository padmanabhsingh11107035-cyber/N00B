import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Minus, Plus, Scan } from 'lucide-react';
import { WORLD_BORDERS_PATH, WORLD_LAND_PATH } from '../../data/worldMapPath';
import { DotHash, MAP_H, MAP_W, agoShort, dateOnly, unproject, type Dot, type UserPlace } from '../../utils/userLocations';

// The green world map of the admin page "User data": pan (drag), zoom (wheel, pinch, + / -), double-click or double-tap to reset. The land is one inline SVG; the dots are drawn on a canvas
// on top (tiny, about 2 px: a ring = where the person signed up, filled = where they were last seen). Dots are never merged and carry no numbers; a spatial hash finds the dot under a
// finger. Zoomed in far, a faint graticule and a crosshair with a coordinate readout of the MAP appear (the readout is about the map, not about a user).
export type DotMode = 'signup' | 'last' | 'both';
interface View { k: number; tx: number; ty: number }
interface Picked { list: Dot[]; idx: number }

const MAX_K = 150, HIT_PX = 15, CROSS_ZOOM = 4;
const GRATICULE = (() => {
  let d = '';
  for (let lng = -180; lng <= 180; lng += 30) { const x = ((lng + 180) * MAP_W) / 360; d += `M${x} 0V${MAP_H}`; }
  for (let lat = -30; lat <= 60; lat += 30) { const y = ((84 - lat) * MAP_W) / 360; d += `M0 ${y}H${MAP_W}`; }
  return d;
})();
const DEG = MAP_W / 360;   // map units per degree
const STEPS = [30, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.01];

const clampView = (v: View, W: number, H: number, minK: number): View => {
  const k = Math.max(minK, Math.min(MAX_K, v.k));
  const mw = MAP_W * k, mh = MAP_H * k;
  const tx = mw <= W ? (W - mw) / 2 : Math.min(0, Math.max(W - mw, v.tx));
  const ty = mh <= H ? (H - mh) / 2 : Math.min(0, Math.max(H - mh, v.ty));
  return { k, tx, ty };
};

export const UserDataMap: React.FC<{ dots: Dot[]; mode: DotMode; fx: boolean; children?: React.ReactNode }> = ({ dots, mode, fx, children }) => {
  const wrap = useRef<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const crossV = useRef<HTMLDivElement | null>(null);
  const crossH = useRef<HTMLDivElement | null>(null);
  const readout = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setViewState] = useState<View>({ k: 1, tx: 0, ty: 0 });
  const viewRef = useRef(view);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [hover, setHover] = useState<Dot | null>(null);
  const [dragging, setDragging] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const raf = useRef(0);
  const pending = useRef<View | null>(null);
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const minKOf = (s: { w: number; h: number }) => Math.max(0.05, Math.min(s.w / MAP_W, s.h / MAP_H));

  const atHome = useRef(true);      // the view is still the first one (not moved by a person): it follows resizes and new data
  const centreX = useRef(638);      // map x of the middle of the dots, so a narrow phone screen opens on where the people are
  // The first view: the whole world when the box is wide; on a narrow phone screen the world would be a thin strip, so it fills the height and opens on the middle of the dots (drag to see the rest)
  const homeOf = (s: { w: number; h: number }): View => {
    const contain = minKOf(s);
    if (s.w / Math.max(1, s.h) >= 1.25) return { k: contain, tx: 0, ty: 0 };
    const k = Math.max(contain, s.h / MAP_H);
    return { k, tx: s.w / 2 - centreX.current * k, ty: 0 };
  };
  const setView = useCallback((v: View, instant = false, home = false) => {
    atHome.current = home;
    const s = sizeRef.current;
    const c = clampView(v, s.w, s.h, minKOf(s));
    viewRef.current = c;
    if (instant) { pending.current = null; setViewState(c); return; }
    pending.current = c;
    if (!raf.current) raf.current = requestAnimationFrame(() => { raf.current = 0; if (pending.current) setViewState(pending.current); pending.current = null; });
  }, []);
  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current); }, []);

  const reset = useCallback(() => { setView(homeOf(sizeRef.current), true, true); setPicked(null); setHover(null); }, [setView]);   // eslint-disable-line react-hooks/exhaustive-deps
  const showWorld = () => { setView({ k: minKOf(sizeRef.current), tx: 0, ty: 0 }, true); setPicked(null); setHover(null); };

  // size of the box: the whole world fits at first
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth, h = el.clientHeight;
      const prev = sizeRef.current;
      sizeRef.current = { w, h };
      setSize({ w, h });
      const c = clampView(atHome.current || prev.w === 0 ? homeOf({ w, h }) : viewRef.current, w, h, minKOf({ w, h }));
      viewRef.current = c; setViewState(c);
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    window.addEventListener('resize', measure);
    return () => { ro?.disconnect(); window.removeEventListener('resize', measure); };
  }, []);

  // new data: the first view opens on where the people are
  useEffect(() => {
    const xs = dots.map((d) => d.x).sort((a, b) => a - b);
    if (xs.length) centreX.current = xs[Math.floor(xs.length / 2)];
    if (atHome.current && sizeRef.current.w) { const c = clampView(homeOf(sizeRef.current), sizeRef.current.w, sizeRef.current.h, minKOf(sizeRef.current)); viewRef.current = c; setViewState(c); }
  }, [dots]);   // eslint-disable-line react-hooks/exhaustive-deps

  // "last seen" times in the tooltips keep up with the clock (once a minute, and not while the tab is hidden)
  useEffect(() => { const t = window.setInterval(() => { if (!document.hidden) setNow(Date.now()); }, 60000); return () => window.clearInterval(t); }, []);

  // ---- what is shown, and how to find a dot near a point
  const shown = useMemo(() => dots.filter((d) => mode === 'both' || d.kind === mode), [dots, mode]);
  const hash = useMemo(() => new DotHash(shown), [shown]);
  const zoomedIn = view.k >= minKOf(size) * CROSS_ZOOM;
  const hitAt = (px: number, py: number): Dot[] => {
    const v = viewRef.current;
    return hash.near((px - v.tx) / v.k, (py - v.ty) / v.k, HIT_PX / v.k);
  };

  // ---- the dots (canvas): tiny, crisp, a barely visible glow; nothing is merged
  useEffect(() => {
    const cv = canvas.current;
    if (!cv || !size.w) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = size.w, H = size.h;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const { k, tx, ty } = view;
    // faint graticule once zoomed in far (lines every 10 / 5 / 1 ... degrees, whichever keeps them about 80 px apart)
    if (k >= minKOf(size) * CROSS_ZOOM) {
      const step = STEPS.find((s) => s * DEG * k <= 140 && s * DEG * k >= 40) ?? STEPS[STEPS.length - 1];
      const lng0 = Math.floor(((-tx / k) / DEG - 180) / step) * step, lng1 = ((W - tx) / k) / DEG - 180;
      const lat1 = 84 - (-ty / k) / DEG, lat0 = 84 - ((H - ty) / k) / DEG;
      ctx.beginPath();
      for (let g = lng0; g <= lng1 + step; g += step) { const x = Math.round((g + 180) * DEG * k + tx) + 0.5; ctx.moveTo(x, 0); ctx.lineTo(x, H); }
      for (let g = Math.floor(lat0 / step) * step; g <= lat1 + step; g += step) { const y = Math.round((84 - g) * DEG * k + ty) + 0.5; ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.strokeStyle = 'rgba(0,255,102,0.24)'; ctx.lineWidth = 1; ctx.stroke();
    }
    const rings: number[] = [], fills: number[] = [];
    for (const d of shown) {
      const sx = d.x * k + tx, sy = d.y * k + ty;
      if (sx < -6 || sy < -6 || sx > W + 6 || sy > H + 6) continue;
      (d.kind === 'signup' ? rings : fills).push(sx, sy);
    }
    // glow: one soft disc under every dot, drawn in two paths
    ctx.fillStyle = 'rgba(255,214,10,0.10)';
    ctx.beginPath(); for (let i = 0; i < rings.length; i += 2) { ctx.moveTo(rings[i] + 4.4, rings[i + 1]); ctx.arc(rings[i], rings[i + 1], 4.4, 0, 6.2832); }
    for (let i = 0; i < fills.length; i += 2) { ctx.moveTo(fills[i] + 4, fills[i + 1]); ctx.arc(fills[i], fills[i + 1], 4, 0, 6.2832); }
    ctx.fill();
    ctx.strokeStyle = '#FFD60A'; ctx.lineWidth = 0.9;
    ctx.beginPath(); for (let i = 0; i < rings.length; i += 2) { ctx.moveTo(rings[i] + 2.2, rings[i + 1]); ctx.arc(rings[i], rings[i + 1], 2.2, 0, 6.2832); }
    ctx.stroke();
    ctx.fillStyle = '#FFD60A';
    ctx.beginPath(); for (let i = 0; i < fills.length; i += 2) { ctx.moveTo(fills[i] + 1.9, fills[i + 1]); ctx.arc(fills[i], fills[i + 1], 1.9, 0, 6.2832); }
    ctx.fill();
    // the chosen person: a thin green ring round each of that person's dots, joined by a dotted line
    const cur = picked?.list[picked.idx];
    if (cur) {
      const own = shown.filter((d) => d.row.id === cur.row.id);
      ctx.strokeStyle = '#00ff66'; ctx.lineWidth = 1;
      for (const d of own) { ctx.beginPath(); ctx.arc(d.x * k + tx, d.y * k + ty, d === cur ? 7 : 5, 0, 6.2832); ctx.stroke(); }
      if (own.length === 2) { ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(own[0].x * k + tx, own[0].y * k + ty); ctx.lineTo(own[1].x * k + tx, own[1].y * k + ty); ctx.stroke(); ctx.setLineDash([]); }
    }
  }, [view, size, shown, picked]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ---- the crosshair and its readout (written straight into the page, no re-render per move)
  const crossAt = (px: number, py: number) => {
    const v = viewRef.current;
    const on = v.k >= minKOf(sizeRef.current) * CROSS_ZOOM;
    if (crossV.current) { crossV.current.style.display = on ? 'block' : 'none'; crossV.current.style.transform = `translateX(${px}px)`; }
    if (crossH.current) { crossH.current.style.display = on ? 'block' : 'none'; crossH.current.style.transform = `translateY(${py}px)`; }
    if (readout.current) {
      readout.current.style.display = on ? 'block' : 'none';
      if (on) { const g = unproject((px - v.tx) / v.k, (py - v.ty) / v.k); readout.current.textContent = `MAP  LAT ${g.lat.toFixed(3)}  LNG ${g.lng.toFixed(3)}`; }
    }
  };
  useEffect(() => { if (!zoomedIn) crossAt(-10, -10); }, [zoomedIn]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ---- gestures
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean; d0: number; k0: number; cx: number; cy: number } | null>(null);
  const lastTap = useRef({ t: 0, x: 0, y: 0 });
  const hoverKey = useRef('');
  const rel = (e: { clientX: number; clientY: number }) => { const r = wrap.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const isUi = (t: EventTarget | null) => !!(t as Element | null)?.closest?.('[data-ud-ui]');

  const onPointerDown = (e: React.PointerEvent) => {
    if (isUi(e.target)) return;
    const p = rel(e);
    crossAt(p.x, p.y);
    pointers.current.set(e.pointerId, p);
    const v = viewRef.current;
    if (pointers.current.size === 1) gesture.current = { x: p.x, y: p.y, tx: v.tx, ty: v.ty, moved: false, d0: 0, k0: v.k, cx: 0, cy: 0 };
    else if (pointers.current.size === 2 && gesture.current) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { ...gesture.current, moved: true, d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, k0: v.k, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, tx: v.tx, ty: v.ty };
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const p = rel(e);
    crossAt(p.x, p.y);
    const g = gesture.current;
    if (!g || !pointers.current.has(e.pointerId)) {
      // a mouse moving over the map: the dot under it shows its card (touch needs a tap)
      if (e.pointerType === 'mouse' && !picked && !isUi(e.target)) {
        const near = hitAt(p.x, p.y)[0] ?? null;
        const key = near ? near.key : '';
        if (key !== hoverKey.current) { hoverKey.current = key; setHover(near); }
      }
      return;
    }
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const k = Math.max(0.01, Math.min(MAX_K, g.k0 * (d / g.d0)));
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      setView({ k, tx: cx - (g.cx - g.tx) * (k / g.k0), ty: cy - (g.cy - g.ty) * (k / g.k0) });
      return;
    }
    const dx = p.x - g.x, dy = p.y - g.y;
    if (!g.moved && Math.hypot(dx, dy) < 5) return;
    if (!g.moved) { g.moved = true; setDragging(true); try { wrap.current?.setPointerCapture(e.pointerId); } catch { /* not important */ } setHover(null); hoverKey.current = ''; }
    setView({ k: viewRef.current.k, tx: g.tx + dx, ty: g.ty + dy });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    const had = pointers.current.delete(e.pointerId);
    if (!had) return;
    if (pointers.current.size === 0) {
      setDragging(false);
      if (g && !g.moved) {
        const p = rel(e), t = Date.now();
        const found = hitAt(p.x, p.y);
        if (found.length) { setPicked({ list: found, idx: 0 }); setHover(null); hoverKey.current = ''; lastTap.current = { t: 0, x: 0, y: 0 }; }
        else {
          const dbl = t - lastTap.current.t < 320 && Math.hypot(p.x - lastTap.current.x, p.y - lastTap.current.y) < 28;
          lastTap.current = { t: dbl ? 0 : t, x: p.x, y: p.y };
          if (dbl) reset(); else setPicked(null);
        }
      }
      gesture.current = null;
    } else if (pointers.current.size === 1 && g) {
      const [rest] = [...pointers.current.values()];
      const v = viewRef.current;
      gesture.current = { ...g, x: rest.x, y: rest.y, tx: v.tx, ty: v.ty, moved: true };
    }
  };

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = viewRef.current;
      // Two fingers on a touchpad, or the wheel: SLIDE the map (like scrolling). Zoom is pinch on a touchpad, Ctrl / Cmd + wheel, the + - buttons, or the + - keys.
      if (!(e.ctrlKey || e.metaKey)) { setView({ k: v.k, tx: v.tx - e.deltaX * (e.deltaMode === 1 ? 16 : 1), ty: v.ty - e.deltaY * (e.deltaMode === 1 ? 16 : 1) }); return; }
      const r = el.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      const k = Math.max(0.01, Math.min(MAX_K, v.k * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016))));
      setView({ k, tx: px - (px - v.tx) * (k / v.k), ty: py - (py - v.ty) * (k / v.k) });
    };
    try { el.focus({ preventScroll: true }); } catch { /* the keys work after the first click */ }   // so the keyboard slides the map as soon as the page opens
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [setView]);

  // the keyboard: arrows slide the map, PageUp / PageDown slide it a screen, + and - zoom, 0 or Home shows it all again
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const s = sizeRef.current, v = viewRef.current;
    const step = e.shiftKey ? 240 : 80;
    const slide = (dx: number, dy: number) => { e.preventDefault(); setView({ k: v.k, tx: v.tx + dx, ty: v.ty + dy }); };
    switch (e.key) {
      case 'ArrowLeft': slide(step, 0); break;
      case 'ArrowRight': slide(-step, 0); break;
      case 'ArrowUp': slide(0, step); break;
      case 'ArrowDown': slide(0, -step); break;
      case 'PageUp': slide(0, s.h * 0.85); break;
      case 'PageDown': slide(0, -s.h * 0.85); break;
      case '+': case '=': e.preventDefault(); zoomBy(1.5); break;
      case '-': case '_': e.preventDefault(); zoomBy(1 / 1.5); break;
      case '0': case 'Home': e.preventDefault(); reset(); break;
      case 'Escape': setPicked(null); setHover(null); hoverKey.current = ''; break;
      default: break;
    }
  };

  const zoomBy = (f: number) => { const s = sizeRef.current, v = viewRef.current; const px = s.w / 2, py = s.h / 2; const k = Math.max(0.01, Math.min(MAX_K, v.k * f)); setView({ k, tx: px - (px - v.tx) * (k / v.k), ty: py - (py - v.ty) * (k / v.k) }, true); };
  const fitData = () => {
    const vis = shown;
    const s = sizeRef.current;
    if (!vis.length) { reset(); return; }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const d of vis) { x0 = Math.min(x0, d.x); x1 = Math.max(x1, d.x); y0 = Math.min(y0, d.y); y1 = Math.max(y1, d.y); }
    const bw = Math.max(x1 - x0, 0.3), bh = Math.max(y1 - y0, 0.15), pad = 40;
    const k = Math.min(MAX_K, Math.max(minKOf(s), Math.min((s.w - pad * 2) / bw, (s.h - pad * 2) / bh)), 24);
    setView({ k, tx: s.w / 2 - ((x0 + x1) / 2) * k, ty: s.h / 2 - ((y0 + y1) / 2) * k }, true);
  };

  const cur = picked ? picked.list[picked.idx] : hover;
  const tipPos = cur ? { x: cur.x * view.k + view.tx, y: cur.y * view.k + view.ty } : null;

  return (
    <div ref={wrap} className={`ud-mapwrap${dragging ? ' drag' : ''}`} data-testid="ud-map" tabIndex={0} onKeyDown={onKeyDown}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      onDoubleClick={(e) => { if (!isUi(e.target) && !hitAt(rel(e).x, rel(e).y).length) reset(); }} onPointerLeave={() => { setHover(null); hoverKey.current = ''; }}>
      {size.w > 0 && (
        <svg className="ud-svg" width={size.w} height={size.h} viewBox={`0 0 ${size.w} ${size.h}`} role="img" aria-label="World map with a tiny yellow dot for each place a user signed up or was last seen">
          <g transform={`translate(${view.tx} ${view.ty}) scale(${view.k})`}>
            <path className="ud-grid" d={GRATICULE} vectorEffect="non-scaling-stroke" />
            <path className="ud-land" d={WORLD_LAND_PATH} vectorEffect="non-scaling-stroke" />
            <path className="ud-border" d={WORLD_BORDERS_PATH} vectorEffect="non-scaling-stroke" />
          </g>
        </svg>
      )}
      <canvas ref={canvas} className="ud-dots" style={{ width: size.w, height: size.h }} aria-hidden="true" data-testid="ud-dots" />
      {fx && <div className="ud-radar" aria-hidden="true" />}
      <div ref={crossV} className="ud-cross v" aria-hidden="true" />
      <div ref={crossH} className="ud-cross h" aria-hidden="true" />
      <div ref={readout} className="ud-readout" aria-hidden="true" data-testid="ud-readout" />
      {cur && tipPos && size.w > 0 && (
        <Tip at={tipPos} box={size} dot={cur} count={picked ? picked.list.length : 0} index={picked ? picked.idx : 0} now={now} pinned={!!picked}
          onNext={() => setPicked((p) => (p ? { ...p, idx: (p.idx + 1) % p.list.length } : p))}
          onClose={() => { setPicked(null); setHover(null); hoverKey.current = ''; }} />
      )}
      <div className="ud-tools" data-ud-ui="1">
        <button className="ud-btn" onClick={() => zoomBy(1.8)} aria-label="Zoom in" title="Zoom in"><Plus size={18} /></button>
        <button className="ud-btn" onClick={() => zoomBy(1 / 1.8)} aria-label="Zoom out" title="Zoom out"><Minus size={18} /></button>
        <button className="ud-btn" onClick={fitData} aria-label="Zoom to the dots" title="Zoom to the dots"><Scan size={18} /></button>
        <button className="ud-btn" onClick={showWorld} aria-label="Show the whole world" title="Show the whole world"><Maximize2 size={17} /></button>
      </div>
      {children}
    </div>
  );
};

const agoText = (iso: string | null | undefined, now: number) => { const a = agoShort(iso, now); return a === 'now' ? 'just now' : a === '?' ? 'unknown' : `${a} ago`; };

const Tip: React.FC<{ at: { x: number; y: number }; box: { w: number; h: number }; dot: Dot; count: number; index: number; now: number; pinned: boolean; onNext: () => void; onClose: () => void }> = ({ at, box, dot, count, index, now, pinned, onNext, onClose }) => {
  const W = Math.min(262, box.w - 16);
  const H = 214;
  let left = at.x + 14, top = at.y + 14;
  if (left + W > box.w - 8) left = at.x - W - 14;
  if (left < 8) left = 8;
  if (top + H > box.h - 8) top = at.y - H - 14;
  if (top < 8) top = 8;
  const row = dot.row;
  const pl: UserPlace | null = dot.kind === 'last' ? row.last : row.signup;
  const geo = dot.src === 'ip-geo' && dot.lat !== null && dot.lng !== null;
  return (
    <div className="ud-tip" style={{ left, top }} role="dialog" aria-label="User location" data-ud-ui="1" data-testid="ud-tip" onPointerDown={(e) => e.stopPropagation()}>
      <div className="h">&gt; @{row.username || '?'} <span className="k">{dot.kind === 'signup' ? 'signed up' : 'last seen'}</span></div>
      <dl>
        <dt>place</dt><dd className="y">{dot.label}</dd>
        <dt>geo</dt><dd>{geo ? `${dot.lat!.toFixed(3)}, ${dot.lng!.toFixed(3)}` : 'n/a (place name only)'}</dd>
        <dt>ip</dt><dd>{pl?.ip || 'n/a'}</dd>
        <dt>device</dt><dd>{[pl?.platform, pl?.device].filter(Boolean).join(' / ') || 'n/a'}</dd>
        <dt>made</dt><dd>{dateOnly(row.createdAt)}</dd>
        <dt>seen</dt><dd>{agoText(row.last?.at, now)}</dd>
      </dl>
      <div className="src">{geo ? 'LOC SRC ip-geo ±city' : 'LOC SRC place-name'}</div>
      {pinned && (
        <div className="row">
          {count > 1 && <button className="ud-btn" onClick={onNext} data-ud-ui="1">Next {index + 1}/{count}</button>}
          <button className="ud-btn" onClick={onClose} data-ud-ui="1">Close</button>
        </div>
      )}
    </div>
  );
};
