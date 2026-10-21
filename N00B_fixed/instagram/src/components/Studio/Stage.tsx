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

  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
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
  const onUp = () => { drag.current = null; setSnapLines({ v: false, h: false }); };

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
      <div ref={wrapRef} className="flex-1 min-h-0 overflow-auto flex items-center justify-center bg-[radial-gradient(circle_at_center,#18181b,#09090b)]" onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <div className="relative shrink-0 m-2" style={{ width: cssW, height: cssH }}>
          <canvas
            ref={canvasRef}
            data-testid="studio-canvas"
            onPointerDown={onDown}
            className="block rounded-md shadow-[0_8px_40px_rgba(0,0,0,0.6)] bg-black touch-none"
            style={{ width: cssW, height: cssH, cursor: ctl.tool === 'draw' ? 'crosshair' : 'default' }}
          />
          {/* the safe areas of Reels / Stories: where the app's own buttons and caption sit */}
          {guides && (
            <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
              <div className="absolute left-0 right-0 top-0 border-b border-dashed border-amber-300/70 bg-amber-300/10" style={{ height: '13%' }} />
              <div className="absolute left-0 right-0 bottom-0 border-t border-dashed border-amber-300/70 bg-amber-300/10" style={{ height: project.aspect === '9:16' ? '22%' : '12%' }} />
              <div className="absolute top-0 bottom-0 right-0 border-l border-dashed border-amber-300/50" style={{ width: '12%' }} />
              <div className="absolute inset-[6%] border border-dashed border-white/25 rounded" />
            </div>
          )}
          {snapLines.v && <div className="absolute top-0 bottom-0 left-1/2 w-px bg-fuchsia-400 pointer-events-none" />}
          {snapLines.h && <div className="absolute left-0 right-0 top-1/2 h-px bg-fuchsia-400 pointer-events-none" />}
          {sel && selBox && selBox.w > 0 && (
            <div
              className="absolute pointer-events-none border-2 border-white/90 rounded-[3px]"
              style={{ left: (sel.x - selBox.w / 2) * s, top: (sel.y - selBox.h / 2) * s, width: selBox.w * s, height: selBox.h * s, transform: `rotate(${sel.rotation}deg)`, boxShadow: '0 0 0 1px rgba(0,0,0,0.5)' }}
            >
              <span onPointerDown={(e) => startHandle(e, 'scale')} className="pointer-events-auto absolute -right-3 -bottom-3 w-6 h-6 rounded-full bg-white border-2 border-fuchsia-500 touch-none cursor-nwse-resize" aria-label="Resize" />
              <span onPointerDown={(e) => startHandle(e, 'scale')} className="pointer-events-auto absolute -left-3 -top-3 w-6 h-6 rounded-full bg-white border-2 border-fuchsia-500 touch-none cursor-nwse-resize" aria-label="Resize" />
              <span onPointerDown={(e) => startHandle(e, 'rotate')} className="pointer-events-auto absolute left-1/2 -top-9 -translate-x-1/2 w-6 h-6 rounded-full bg-fuchsia-500 border-2 border-white touch-none cursor-grab" aria-label="Rotate" />
              <span className="absolute left-1/2 -top-3 w-px h-3 bg-white/80" />
            </div>
          )}
        </div>
      </div>
      <div className="absolute right-2 bottom-2 flex items-center gap-1 rounded-xl bg-black/70 border border-white/10 p-1">
        <button onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.2).toFixed(2)))} aria-label="Zoom out" className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center"><Minus className="w-4 h-4" /></button>
        <button onClick={() => setZoom(1)} aria-label="Fit to screen" className="h-8 px-2 rounded-lg hover:bg-white/10 text-[11px] font-bold flex items-center gap-1"><Maximize className="w-3.5 h-3.5" />{Math.round(zoom * 100)}%</button>
        <button onClick={() => setZoom((z) => Math.min(4, +(z + 0.2).toFixed(2)))} aria-label="Zoom in" className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center"><Plus className="w-4 h-4" /></button>
        <button onClick={() => setGuides((g) => !g)} aria-label="Safe-area guides" aria-pressed={guides} className={`w-8 h-8 rounded-lg flex items-center justify-center ${guides ? 'bg-amber-400/25 text-amber-300' : 'hover:bg-white/10'}`}><Shield className="w-4 h-4" /></button>
        <button
          onPointerDown={() => setOriginal(true)} onPointerUp={() => setOriginal(false)} onPointerLeave={() => setOriginal(false)} onPointerCancel={() => setOriginal(false)}
          aria-label="Hold to see the original" data-testid="studio-compare"
          className={`h-8 px-2 rounded-lg text-[11px] font-bold touch-none ${original ? 'bg-fuchsia-500 text-white' : 'hover:bg-white/10'}`}
        >Original</button>
      </div>
    </div>
  );
};

export type { StickerLayer };
