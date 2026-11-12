import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Maximize, Minus, Plus, Shield } from 'lucide-react';
import { ASPECTS, Layer, StickerLayer, Stroke, newDrawLayer } from './types';
import { boxOf, renderFrame } from './render';
import { sharedGL } from './gl';
import type { StudioCtl } from './StudioApp';

// The canvas: draws the project (render.ts) and lets you select, move, scale and rotate things on it (and draw on it).
const SNAP = 10;

export const Stage: React.FC<{ ctl: StudioCtl }> = ({ ctl }) => {
  const { project, assets, player } = ctl;
  const size = ASPECTS[project.aspect];
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [avail, setAvail] = useState({ w: 360, h: 480 });
  const [zoom, setZoom] = useState(1);
  const [guides, setGuides] = useState(false);
  const [snapLines, setSnapLines] = useState<{ v: boolean; h: boolean }>({ v: false, h: false });
  const [original, setOriginal] = useState(false);
  // view-level zoom gestures (the preview only: the project size and the export are never touched)
  const ptrs = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinch = useRef<null | { d0: number; z0: number; cx: number; cy: number; fx: number; fy: number }>(null);
  const tap = useRef<{ t: number; x: number; y: number; moved: boolean; downX: number; downY: number }>({ t: 0, x: 0, y: 0, moved: false, downX: 0, downY: 0 });
  const anchor = useRef<null | { fx: number; fy: number; cx: number; cy: number }>(null);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAvail({ w: Math.max(120, el.clientWidth - 16), h: Math.max(120, el.clientHeight - 16) }));
    ro.observe(el);
    setAvail({ w: Math.max(120, el.clientWidth - 16), h: Math.max(120, el.clientHeight - 16) });
    return () => ro.disconnect();
  }, []);

  const fit = Math.min(avail.w / size.w, avail.h / size.h);
  const cssW = Math.round(size.w * fit * zoom);
  const cssH = Math.round(size.h * fit * zoom);
  const s = cssW / size.w;                          // design px -> screen px
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const pixelW = Math.min(1080, Math.max(240, Math.round(cssW * dpr)));
  const k = pixelW / size.w;
  const MAX_ZOOM = 8;
  const z100 = Math.min(MAX_ZOOM, Math.max(1.25, 1 / fit));          // 1 design pixel = 1 screen pixel
  const z200 = Math.min(MAX_ZOOM, z100 * 2);
  const near = (a: number, b: number) => Math.abs(a - b) / b < 0.04;
  const cycleZoom = () => setZoom((z) => (near(z, 1) || z < 1 ? z100 : near(z, z100) ? z200 : 1));
  const toggleFit = () => setZoom((z) => (near(z, 1) ? z100 : 1));
  const zoomLabel = near(zoom, 1) ? '1x' : near(zoom, z100) ? '100%' : near(zoom, z200) ? '200%' : `${+zoom.toFixed(1)}x`;

  // keep the point under the fingers where it was while the preview grows or shrinks
  useLayoutEffect(() => {
    const a = anchor.current, c = canvasRef.current, w = wrapRef.current;
    if (!a || !c || !w) return;
    const r = c.getBoundingClientRect();
    w.scrollLeft += r.left + a.fx * r.width - a.cx;
    w.scrollTop += r.top + a.fy * r.height - a.cy;
  }, [cssW, cssH]);

  const draw = useCallback((t: number) => {
    const c = canvasRef.current;
    if (!c || ctl.exporting) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    renderFrame(ctx, { project: player.project, assets: player.assets, videoFor: player.videoFor, gl: sharedGL(), k, original }, t);
  }, [player, k, original, ctl.exporting]);

  // size the drawing surface, then draw (again) whenever the project, the playhead or the size changes
  useLayoutEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const w = Math.round(size.w * k), h = Math.round(size.h * k);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    draw(player.t);
  }, [project, assets, k, size.w, size.h, draw, player, ctl.assetVersion]);
  // (not while a video is being made: the export has taken over the player's frames and must keep them)
  useEffect(() => { if (ctl.exporting) return; player.onFrame = (t) => { ctl.onPlayheadTick(t); draw(t); }; }, [player, draw, ctl]);

  // ---- pointer work
  const toDesign = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * size.w, y: ((e.clientY - r.top) / r.height) * size.h };
  };

  const visibleAt = (l: Layer): boolean => {
    if (l.hidden || l.type === 'audio' || l.type === 'draw' || l.type === 'captions') return false;
    if (project.mode === 'photo') return true;
    return player.t >= l.start - 0.001 && player.t < l.start + l.duration;
  };

  const hit = (x: number, y: number): Layer | null => {
    // things on top first (last added first); the main clips are behind everything, so they are tried last
    const rev = [...project.layers].reverse();
    const isMain = (l: Layer) => l.type === 'media' && l.track === 'main';
    const order = [...rev.filter((l) => !isMain(l)), ...rev.filter(isMain)];
    for (const l of order) {
      if (!visibleAt(l) || l.locked) continue;
      const b = boxOf(assets, l);
      const dx = x - l.x, dy = y - l.y;
      const a = (-l.rotation * Math.PI) / 180;
      const lx = dx * Math.cos(a) - dy * Math.sin(a);
      const ly = dx * Math.sin(a) + dy * Math.cos(a);
      if (Math.abs(lx) <= b.w / 2 + 6 && Math.abs(ly) <= b.h / 2 + 6) return l;
    }
    return null;
  };

  const drag = useRef<null | { mode: 'move' | 'scale' | 'rotate' | 'draw' | 'pan'; id: string; sx: number; sy: number; lx: number; ly: number; scale0: number; dist0: number; rot0: number; ang0: number; stroke?: Stroke }>(null);

  const centroid = () => {
    const [a, b] = [...ptrs.current.values()];
    return { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) };
  };
  const onPtrDownCapture = (e: React.PointerEvent) => {
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    tap.current.moved = false; tap.current.downX = e.clientX; tap.current.downY = e.clientY;
    if (ptrs.current.size === 2) {
      drag.current = null; tap.current.moved = true; tap.current.t = 0; setSnapLines({ v: false, h: false });
      const c = centroid(); const r = canvasRef.current!.getBoundingClientRect();
      pinch.current = { d0: c.d, z0: zoom, cx: c.cx, cy: c.cy, fx: (c.cx - r.left) / r.width, fy: (c.cy - r.top) / r.height };
    }
  };
  const onPtrEnd = (e: React.PointerEvent) => {
    const wasOne = ptrs.current.size === 1 && !pinch.current;
    ptrs.current.delete(e.pointerId);
    if (ptrs.current.size < 2) { pinch.current = null; anchor.current = null; }
    if (wasOne && e.type === 'pointerup' && !tap.current.moved && ctl.tool !== 'draw' && (e.target as HTMLElement).tagName === 'CANVAS') {
      const now = Date.now(), tp = tap.current;
      if (now - tp.t < 320 && Math.hypot(e.clientX - tp.x, e.clientY - tp.y) < 32) { toggleFit(); tp.t = 0; }
      else { tp.t = now; tp.x = e.clientX; tp.y = e.clientY; }
    }
  };

  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (ptrs.current.size >= 2) return;                 // the second finger: pinch, not a new touch
    const p = toDesign(e);
    if (ctl.tool === 'draw') {
      let layer = ctl.selected?.type === 'draw' ? ctl.selected : (project.layers.find((l) => l.type === 'draw' && !l.locked) as typeof ctl.selected);
      let id = layer?.id;
      if (!layer || layer.type !== 'draw') {
        const nl = newDrawLayer(project, project.mode === 'video' ? player.t : 0, project.mode === 'video' ? Math.max(1, ctl.duration - player.t || 4) : 4);
        ctl.update((pr) => ({ ...pr, layers: [...pr.layers, nl] }));
        id = nl.id; ctl.select(nl.id);
      }
      const st: Stroke = { kind: ctl.brush.kind, points: [[p.x, p.y]], color: ctl.brush.color, size: ctl.brush.size, opacity: ctl.brush.kind === 'highlighter' ? Math.min(ctl.brush.opacity, 0.45) : ctl.brush.opacity };
      if (ctl.brush.kind === 'eraser') { eraseAt(id!, p.x, p.y); drag.current = { mode: 'draw', id: id!, sx: p.x, sy: p.y, lx: 0, ly: 0, scale0: 1, dist0: 0, rot0: 0, ang0: 0 }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); return; }
      drag.current = { mode: 'draw', id: id!, sx: p.x, sy: p.y, lx: 0, ly: 0, scale0: 1, dist0: 0, rot0: 0, ang0: 0, stroke: st };
      ctl.update((pr) => ({ ...pr, layers: pr.layers.map((l) => (l.id === id && l.type === 'draw' ? { ...l, strokes: [...l.strokes, st] } : l)) }), `${id}:stroke:live`);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }
    const l = hit(p.x, p.y);
    ctl.select(l ? l.id : null);
    if (l) {
      drag.current = { mode: 'move', id: l.id, sx: p.x, sy: p.y, lx: l.x, ly: l.y, scale0: l.scale, dist0: 0, rot0: l.rotation, ang0: 0 };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
  };

  const eraseAt = (id: string, x: number, y: number) => {
    ctl.update((pr) => ({
      ...pr,
      layers: pr.layers.map((l) => {
        if (l.id !== id || l.type !== 'draw') return l;
        const keep = l.strokes.filter((st) => !st.points.some(([px, py]) => Math.hypot(px - x, py - y) < ctl.brush.size * 1.2 + 14));
        return keep.length === l.strokes.length ? l : { ...l, strokes: keep };
      })
    }), `${id}:erase`);
  };

  const onMove = (e: React.PointerEvent) => {
    if (ptrs.current.has(e.pointerId)) {
      ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!tap.current.moved && Math.hypot(e.clientX - tap.current.downX, e.clientY - tap.current.downY) > 10) tap.current.moved = true;
    }
    const pz = pinch.current;
    if (pz && ptrs.current.size >= 2) {
      const c = centroid(); const w = wrapRef.current, cv = canvasRef.current;
      if (w && cv) {
        w.scrollLeft -= c.cx - pz.cx; w.scrollTop -= c.cy - pz.cy;          // two fingers also pan the zoomed preview
        const r = cv.getBoundingClientRect();
        anchor.current = { fx: (c.cx - r.left) / r.width, fy: (c.cy - r.top) / r.height, cx: c.cx, cy: c.cy };
        pz.cx = c.cx; pz.cy = c.cy;
        setZoom(Math.max(0.4, Math.min(MAX_ZOOM, +(pz.z0 * (c.d / pz.d0)).toFixed(3))));
      }
      return;
    }
    const d = drag.current;
    if (!d) return;
    const p = toDesign(e);
    if (d.mode === 'draw') {
      if (ctl.brush.kind === 'eraser') { eraseAt(d.id, p.x, p.y); return; }
      const st = d.stroke!;
      const pts = st.kind === 'pen' || st.kind === 'highlighter' ? [...st.points, [p.x, p.y] as [number, number]] : [st.points[0], [p.x, p.y] as [number, number]];
      d.stroke = { ...st, points: pts };
      ctl.update((pr) => ({ ...pr, layers: pr.layers.map((l) => (l.id === d.id && l.type === 'draw' ? { ...l, strokes: [...l.strokes.slice(0, -1), d.stroke!] } : l)) }), `${d.id}:stroke:live`);
      return;
    }
    if (d.mode === 'move') {
      let x = d.lx + (p.x - d.sx), y = d.ly + (p.y - d.sy);
      const v = Math.abs(x - size.w / 2) < SNAP, h = Math.abs(y - size.h / 2) < SNAP;
      if (v) x = size.w / 2;
      if (h) y = size.h / 2;
      setSnapLines({ v, h });
      ctl.updateLayer(d.id, { x, y }, `${d.id}:move`);
    } else if (d.mode === 'scale') {
      const l = project.layers.find((q) => q.id === d.id);
      if (!l) return;
      const dist = Math.hypot(p.x - l.x, p.y - l.y);
      ctl.updateLayer(d.id, { scale: Math.max(0.02, d.scale0 * (dist / Math.max(1, d.dist0))) }, `${d.id}:scale`);
    } else if (d.mode === 'rotate') {
      const l = project.layers.find((q) => q.id === d.id);
      if (!l) return;
      const ang = (Math.atan2(p.y - l.y, p.x - l.x) * 180) / Math.PI;
      let r = d.rot0 + (ang - d.ang0);
      if (Math.abs(((r % 90) + 90) % 90) < 3 || Math.abs(((r % 90) + 90) % 90 - 90) < 3) r = Math.round(r / 90) * 90;
      ctl.updateLayer(d.id, { rotation: r }, `${d.id}:rotate`);
    }
  };
  const onUp = (e: React.PointerEvent) => { onPtrEnd(e); drag.current = null; setSnapLines({ v: false, h: false }); };

  const startHandle = (e: React.PointerEvent, mode: 'scale' | 'rotate') => {
    e.stopPropagation();
    const l = ctl.selected;
    if (!l) return;
    const p = toDesign(e);
    drag.current = {
      mode, id: l.id, sx: p.x, sy: p.y, lx: l.x, ly: l.y, scale0: l.scale, rot0: l.rotation,
      dist0: Math.hypot(p.x - l.x, p.y - l.y), ang0: (Math.atan2(p.y - l.y, p.x - l.x) * 180) / Math.PI
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const sel = ctl.selected && visibleAt(ctl.selected) && ctl.tool !== 'draw' ? ctl.selected : null;
  const selBox = sel ? boxOf(assets, sel) : null;

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      <div ref={wrapRef} className="sx-stage-bg flex-1 min-h-0 overflow-auto flex p-2 overscroll-contain" onPointerDownCapture={onPtrDownCapture} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <div className="relative shrink-0 m-auto" style={{ width: cssW, height: cssH }}>
          <canvas
            ref={canvasRef}
            data-testid="studio-canvas"
            onPointerDown={onDown}
            className="sx-canvas block bg-black touch-none"
            style={{ width: cssW, height: cssH, cursor: ctl.tool === 'draw' ? 'crosshair' : 'default' }}
          />
          {project.layers.length === 0 && (
            <div className="sx-stage-empty absolute inset-0 pointer-events-none flex flex-col items-center justify-center text-center" data-testid="studio-empty">
              <strong>Your canvas is empty</strong>
              <span>Import a photo or a video to start.</span>
            </div>
          )}
          {/* the safe areas of Reels / Stories: where the app's own buttons and caption sit */}
          {guides && (
            <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
              <div className="absolute left-0 right-0 top-0 border-b border-dashed border-amber-300/70 bg-amber-300/10" style={{ height: '13%' }} />
              <div className="absolute left-0 right-0 bottom-0 border-t border-dashed border-amber-300/70 bg-amber-300/10" style={{ height: project.aspect === '9:16' ? '22%' : '12%' }} />
              <div className="absolute top-0 bottom-0 right-0 border-l border-dashed border-amber-300/50" style={{ width: '12%' }} />
              <div className="absolute inset-[6%] border border-dashed border-white/25 rounded" />
            </div>
          )}
          {snapLines.v && <div className="sx-snap absolute top-0 bottom-0 left-1/2 w-px pointer-events-none" />}
          {snapLines.h && <div className="sx-snap absolute left-0 right-0 top-1/2 h-px pointer-events-none" />}
          {sel && selBox && selBox.w > 0 && (
            <div
              className="sx-selbox absolute pointer-events-none"
              style={{ left: (sel.x - selBox.w / 2) * s, top: (sel.y - selBox.h / 2) * s, width: selBox.w * s, height: selBox.h * s, transform: `rotate(${sel.rotation}deg)`, }}
            >
              <span onPointerDown={(e) => startHandle(e, 'scale')} className="sx-handle pointer-events-auto absolute -right-3 -bottom-3 touch-none cursor-nwse-resize" aria-label="Resize" />
              <span onPointerDown={(e) => startHandle(e, 'scale')} className="sx-handle pointer-events-auto absolute -left-3 -top-3 touch-none cursor-nwse-resize" aria-label="Resize" />
              <span onPointerDown={(e) => startHandle(e, 'rotate')} className="sx-handle sx-handle-rot pointer-events-auto absolute left-1/2 -top-10 -translate-x-1/2 touch-none cursor-grab" aria-label="Rotate" />
              <span className="sx-stem absolute left-1/2 -top-4 w-px h-4" />
            </div>
          )}
        </div>
      </div>
      <div className="sx-zoombar absolute right-2 bottom-2 flex items-center">
        <button onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.2).toFixed(2)))} aria-label="Zoom out" className="sx-zb"><Minus className="w-4 h-4" /></button>
        <button onClick={() => setZoom(1)} aria-label="Fit to screen" className="sx-zb sx-zb-wide"><Maximize className="w-3.5 h-3.5" /><span>{Math.round(zoom * 100)}%</span></button>
        <button onClick={() => setZoom((z) => Math.min(MAX_ZOOM, +(z + 0.2).toFixed(2)))} aria-label="Zoom in" className="sx-zb"><Plus className="w-4 h-4" /></button>
        <button onClick={cycleZoom} aria-label={`Zoom ${zoomLabel}: tap to switch between fit, 100% and 200%`} title="Fit / 100% / 200%" data-testid="studio-zoom-chip" className="sx-zb sx-zb-chip"><span>{zoomLabel}</span></button>
        <button onClick={() => setGuides((g) => !g)} aria-label="Safe-area guides" aria-pressed={guides} className={`sx-zb ${guides ? 'is-on' : ''}`}><Shield className="w-4 h-4" /></button>
        <button
          onPointerDown={() => setOriginal(true)} onPointerUp={() => setOriginal(false)} onPointerLeave={() => setOriginal(false)} onPointerCancel={() => setOriginal(false)}
          aria-label="Hold to see the original" data-testid="studio-compare"
          className={`sx-zb sx-zb-wide touch-none ${original ? 'is-on' : ''}`}
        ><span>Original</span></button>
      </div>
    </div>
  );
};

export type { StickerLayer };
