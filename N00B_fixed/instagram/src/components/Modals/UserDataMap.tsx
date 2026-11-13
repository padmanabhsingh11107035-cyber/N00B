import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Minus, Plus, Scan } from 'lucide-react';
import { WORLD_BORDERS_PATH, WORLD_LAND_PATH } from '../../data/worldMapPath';
import { MAP_H, MAP_W, agoShort, clusterDots, dateOnly, placeLabel, type Cluster, type Dot, type UserLocationRow } from '../../utils/userLocations';

// The green world map of the admin page "User data": pan (drag), zoom (wheel, pinch, + / -), double-click or double-tap to reset, yellow dots (ring = where the person signed up,
// filled = where they were last seen), dots that overlap are joined into one counted dot. The map is the real land outline from src/data/worldMapPath.ts, drawn as one inline SVG.
export type DotMode = 'signup' | 'last' | 'both';
interface View { k: number; tx: number; ty: number }
interface Picked { dots: Dot[]; mx: number; my: number }

const CELL = 20, MAX_K = 150, DAY = 86400000;
const GRATICULE = (() => {
  let d = '';
  for (let lng = -180; lng <= 180; lng += 30) { const x = ((lng + 180) * MAP_W) / 360; d += `M${x} 0V${MAP_H}`; }
  for (let lat = -30; lat <= 60; lat += 30) { const y = ((84 - lat) * MAP_W) / 360; d += `M0 ${y}H${MAP_W}`; }
  return d;
})();

const clampView = (v: View, W: number, H: number, minK: number): View => {
  const k = Math.max(minK, Math.min(MAX_K, v.k));
  const mw = MAP_W * k, mh = MAP_H * k;
  const tx = mw <= W ? (W - mw) / 2 : Math.min(0, Math.max(W - mw, v.tx));
  const ty = mh <= H ? (H - mh) / 2 : Math.min(0, Math.max(H - mh, v.ty));
  return { k, tx, ty };
};

export const UserDataMap: React.FC<{
  dots: Dot[]; mode: DotMode; focus: { userId: string; nonce: number } | null; onPick: (userId: string | null) => void; children?: React.ReactNode;
}> = ({ dots, mode, focus, onPick, children }) => {
  const wrap = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setViewState] = useState<View>({ k: 1, tx: 0, ty: 0 });
  const viewRef = useRef(view);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [hover, setHover] = useState<Picked | null>(null);
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

  const reset = useCallback(() => { setView(homeOf(sizeRef.current), true, true); setPicked(null); setHover(null); onPick(null); }, [setView, onPick]);   // eslint-disable-line react-hooks/exhaustive-deps
  const showWorld = () => { setView({ k: minKOf(sizeRef.current), tx: 0, ty: 0 }, true); setPicked(null); setHover(null); onPick(null); };

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

  // ---- gestures
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean; d0: number; k0: number; cx: number; cy: number; t0: number } | null>(null);
  const lastTap = useRef({ t: 0, x: 0, y: 0 });
  const rel = (e: { clientX: number; clientY: number }) => { const r = wrap.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const isHit = (t: EventTarget | null) => !!(t as Element | null)?.closest?.('[data-hit],[data-ud-ui]');

  const onPointerDown = (e: React.PointerEvent) => {
    if (isHit(e.target)) return;
    const p = rel(e);
    pointers.current.set(e.pointerId, p);
    const v = viewRef.current;
    if (pointers.current.size === 1) gesture.current = { x: p.x, y: p.y, tx: v.tx, ty: v.ty, moved: false, d0: 0, k0: v.k, cx: 0, cy: 0, t0: Date.now() };
    else if (pointers.current.size === 2 && gesture.current) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { ...gesture.current, moved: true, d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, k0: v.k, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, tx: v.tx, ty: v.ty };
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g || !pointers.current.has(e.pointerId)) return;
    const p = rel(e);
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
    if (!g.moved) { g.moved = true; setDragging(true); try { wrap.current?.setPointerCapture(e.pointerId); } catch { /* not important */ } setHover(null); }
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
        const dbl = t - lastTap.current.t < 320 && Math.hypot(p.x - lastTap.current.x, p.y - lastTap.current.y) < 28;
        lastTap.current = { t: dbl ? 0 : t, x: p.x, y: p.y };
        if (dbl) reset(); else { setPicked(null); onPick(null); }
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
      const r = el.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      const v = viewRef.current;
      const k = Math.max(0.01, Math.min(MAX_K, v.k * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016))));
      setView({ k, tx: px - (px - v.tx) * (k / v.k), ty: py - (py - v.ty) * (k / v.k) });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [setView]);

  const zoomBy = (f: number) => { const s = sizeRef.current, v = viewRef.current; const px = s.w / 2, py = s.h / 2; const k = Math.max(0.01, Math.min(MAX_K, v.k * f)); setView({ k, tx: px - (px - v.tx) * (k / v.k), ty: py - (py - v.ty) * (k / v.k) }, true); };
  const fitData = () => {
    const vis = dots.filter((d) => mode === 'both' || d.kind === mode);
    const s = sizeRef.current;
    if (!vis.length) { reset(); return; }
    zoomToDots(vis, s, 40);
  };
  function zoomToDots(list: Dot[], s: { w: number; h: number }, pad: number) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const d of list) { x0 = Math.min(x0, d.x); x1 = Math.max(x1, d.x); y0 = Math.min(y0, d.y); y1 = Math.max(y1, d.y); }
    const bw = Math.max(x1 - x0, 0.3), bh = Math.max(y1 - y0, 0.15);
    const k = Math.min(MAX_K, Math.max(minKOf(s), Math.min((s.w - pad * 2) / bw, (s.h - pad * 2) / bh)), 24);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    setView({ k, tx: s.w / 2 - cx * k, ty: s.h / 2 - cy * k }, true);
  }

  // ---- what is shown
  const shown = useMemo(() => dots.filter((d) => mode === 'both' || d.kind === mode), [dots, mode]);
  const clusters = useMemo<Cluster[]>(() => clusterDots(shown, view, CELL).filter((c) => c.x > -20 && c.y > -20 && c.x < size.w + 20 && c.y < size.h + 20), [shown, view, size.w, size.h]);
  const pulsing = useMemo(() => {
    const set = new Set<string>();
    for (const d of shown) if (d.kind === 'last' && set.size < 40) { const at = Date.parse(d.row.last?.at || ''); if (Number.isFinite(at) && now - at < DAY) set.add(d.key); }
    return set;
  }, [shown, now]);

  // a person was chosen in the list: go there
  useEffect(() => {
    if (!focus) return;
    const own = dots.filter((d) => d.row.id === focus.userId);
    const want = own.find((d) => (mode === 'both' ? d.kind === 'last' : d.kind === mode)) ?? own[0];
    if (!want) { setPicked(null); return; }
    const s = sizeRef.current;
    const k = Math.min(MAX_K, Math.max(viewRef.current.k, minKOf(s) * 8, 14));
    setView({ k, tx: s.w / 2 - want.x * k, ty: s.h / 2 - want.y * k }, true);
    setPicked({ dots: [want], mx: want.x, my: want.y });
  }, [focus?.nonce]);   // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (c: Cluster) => {
    const dts = c.dots;
    const mx = dts.reduce((n, d) => n + d.x, 0) / dts.length, my = dts.reduce((n, d) => n + d.y, 0) / dts.length;
    setPicked({ dots: dts, mx, my });
    setHover(null);
    onPick(new Set(dts.map((d) => d.row.id)).size === 1 ? dts[0].row.id : null);
  };

  const tipFor = picked ?? hover;
  const tipPos = tipFor ? { x: tipFor.mx * view.k + view.tx, y: tipFor.my * view.k + view.ty } : null;
  const linkFor = picked && picked.dots.length === 1 ? dots.filter((d) => d.row.id === picked.dots[0].row.id) : [];

  return (
    <div ref={wrap} className={`ud-mapwrap${dragging ? ' drag' : ''}`} data-testid="ud-map"
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      onDoubleClick={(e) => { if (!isHit(e.target)) reset(); }} onPointerLeave={() => setHover(null)}>
      {size.w > 0 && (
        <svg className="ud-svg" width={size.w} height={size.h} viewBox={`0 0 ${size.w} ${size.h}`} role="img" aria-label="World map with a yellow dot for each place a user signed up or was last seen">
          <g transform={`translate(${view.tx} ${view.ty}) scale(${view.k})`}>
            <path className="ud-grid" d={GRATICULE} vectorEffect="non-scaling-stroke" />
            <path className="ud-land" d={WORLD_LAND_PATH} vectorEffect="non-scaling-stroke" />
            <path className="ud-border" d={WORLD_BORDERS_PATH} vectorEffect="non-scaling-stroke" />
          </g>
          {linkFor.length === 2 && (() => {
            const [a, b] = linkFor;
            return <line className="ud-link" x1={a.x * view.k + view.tx} y1={a.y * view.k + view.ty} x2={b.x * view.k + view.tx} y2={b.y * view.k + view.ty} />;
          })()}
          {clusters.map((c) => {
            const users = c.dots.length > 1 ? new Set(c.dots.map((d) => d.row.id)).size : 1;
            const many = users > 1;   // one person's ring and dot in the same spot are not a crowd
            const isSel = !!picked && picked.dots.some((p) => c.dots.includes(p));
            const r = many ? Math.min(15, 8 + Math.log2(users) * 1.8) : c.dots.length > 1 ? 6.5 : 3.6;
            const hasRing = c.dots.some((d) => d.kind === 'signup'), hasFill = c.dots.some((d) => d.kind === 'last');
            return (
              <g key={c.key} data-hit="1" onClick={(e) => { e.stopPropagation(); pick(c); }}
                onPointerEnter={(e) => { if (e.pointerType === 'mouse' && !picked) setHover({ dots: c.dots, mx: (c.x - view.tx) / view.k, my: (c.y - view.ty) / view.k }); }}
                onPointerLeave={() => setHover(null)}>
                <circle className="ud-hit" data-hit="1" cx={c.x} cy={c.y} r={Math.max(r + 6, 13)} />
                {!many && c.dots.some((d) => pulsing.has(d.key)) && <circle className="ud-halo" cx={c.x} cy={c.y} r={4} />}
                {many ? (
                  <>
                    <circle className="ud-cl" cx={c.x} cy={c.y} r={r} />
                    <text className="ud-cl-n" x={c.x} y={c.y}>{users > 99 ? '99+' : users}</text>
                  </>
                ) : (
                  <>
                    {hasRing && <circle className="ud-dot-ring" cx={c.x} cy={c.y} r={hasFill ? 6.5 : 3.4} />}
                    {hasFill && <circle className="ud-dot-fill" cx={c.x} cy={c.y} r={3.6} />}
                  </>
                )}
                {isSel && <circle className="ud-sel" cx={c.x} cy={c.y} r={r + 5} />}
              </g>
            );
          })}
        </svg>
      )}
      {tipFor && tipPos && size.w > 0 && (
        <Tip at={tipPos} box={size} sel={tipFor} pinned={!!picked} now={now}
          onClose={() => { setPicked(null); setHover(null); onPick(null); }}
          onZoom={() => { zoomToDots(tipFor.dots, sizeRef.current, 70); setPicked(null); setHover(null); }} />
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

const Tip: React.FC<{ at: { x: number; y: number }; box: { w: number; h: number }; sel: Picked; pinned: boolean; now: number; onClose: () => void; onZoom: () => void }> = ({ at, box, sel, pinned, now, onClose, onZoom }) => {
  const W = Math.min(268, box.w - 16);
  const people: UserLocationRow[] = Array.from(new Map<string, UserLocationRow>(sel.dots.map((d) => [d.row.id, d.row] as [string, UserLocationRow])).values());
  const many = people.length > 1;
  const H = many ? 190 : 156;
  let left = at.x + 14, top = at.y + 14;
  if (left + W > box.w - 8) left = at.x - W - 14;
  if (left < 8) left = 8;
  if (top + H > box.h - 8) top = at.y - H - 14;
  if (top < 8) top = 8;
  const row: UserLocationRow = sel.dots[0].row;
  return (
    <div className="ud-tip" style={{ left, top }} role="dialog" aria-label="User location" data-ud-ui="1" data-hit="1" data-testid="ud-tip" onPointerDown={(e) => e.stopPropagation()}>
      {many ? (
        <>
          <div className="h">&gt; {people.length} users here</div>
          <ul>
            {people.slice(0, 6).map((r) => (
              <li key={r.id}>@{r.username || '?'} <span style={{ color: 'var(--ud-muted)' }}>{placeLabel(r.last ?? r.signup)} {r.last?.at ? agoShort(r.last.at, now) : 'signup'}</span></li>
            ))}
            {people.length > 6 && <li style={{ color: 'var(--ud-muted)' }}>+ {people.length - 6} more</li>}
          </ul>
          <div className="row"><button className="ud-btn" onClick={onZoom} data-ud-ui="1">Zoom in</button>{pinned && <button className="ud-btn" onClick={onClose} data-ud-ui="1">Close</button>}</div>
        </>
      ) : (
        <>
          <div className="h">&gt; @{row.username || '?'}</div>
          <dl>
            <dt>name</dt><dd>{row.displayName || '-'}</dd>
            <dt>made</dt><dd>created {dateOnly(row.createdAt)}</dd>
            <dt>signup</dt><dd className={sel.dots[0].kind === 'signup' ? 'y' : undefined}>{row.signup ? placeLabel(row.signup) : 'unknown'}</dd>
            <dt>seen</dt><dd className={sel.dots[0].kind === 'last' ? 'y' : undefined}>{row.last?.at ? `last seen ${agoText(row.last.at, now)} @ ${placeLabel(row.last)}` : 'unknown'}</dd>
          </dl>
          {pinned && <div className="row"><button className="ud-btn" onClick={onClose} data-ud-ui="1">Close</button></div>}
        </>
      )}
    </div>
  );
};
