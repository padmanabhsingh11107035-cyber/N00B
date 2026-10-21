import React, { useEffect, useRef, useState } from 'react';
import { Copy, Eye, EyeOff, Lock, LockOpen, Magnet, Maximize2, Pause, Play, Scissors, SkipBack, Trash2, Volume2, VolumeX, ZoomIn, ZoomOut } from 'lucide-react';
import { Asset, AudioLayer, Layer, MediaLayer, mainClips } from './types';
import { fmtTime } from './assets';
import { useStrip } from './strips';
import { ASSET_DRAG } from './MediaPool';
import type { StudioCtl } from './StudioApp';

// The timeline, laid out like a professional editor: the video tracks (V1 is the story, clips one after another; V2 and up float above it) with real frames along each clip, the
// sound tracks with their waveforms, a ruler, a playhead, snapping, and a media pool you can drag from. Drag a clip to move it, its ends to trim it; click the ruler to jump.
const LABEL_W = 112;
const H_RULER = 26, H_OVER = 32, H_MAIN = 62, H_AUDIO = 38, H_CAP = 28;

const COLOR: Record<string, string> = { text: 'bg-sky-600/90', sticker: 'bg-amber-600/90', draw: 'bg-rose-600/90', media: 'bg-fuchsia-700/90', audio: 'bg-emerald-700/90', captions: 'bg-teal-600/90' };
const TAG: Record<string, string> = { text: 'T', sticker: '★', draw: '✎', media: '▣', audio: '♪', captions: 'CC' };

function Wave({ peaks, color = '#6ee7b7', dim = false }: { peaks: number[]; color?: string; dim?: boolean }) {
  return (
    <svg className={`absolute inset-0 w-full h-full ${dim ? 'opacity-25' : 'opacity-90'}`} viewBox={`0 0 ${Math.max(1, peaks.length)} 20`} preserveAspectRatio="none" aria-hidden="true">
      {peaks.map((p, i) => <rect key={i} x={i} y={10 - p * 9.5} width={0.75} height={Math.max(0.5, p * 19)} fill={color} />)}
    </svg>
  );
}

const peaksFor = (a: Asset | undefined, from: number, to: number): number[] | undefined => {
  if (!a?.peaks || a.duration <= 0) return undefined;
  const n = a.peaks.length;
  return a.peaks.slice(Math.max(0, Math.floor((from / a.duration) * n)), Math.min(n, Math.ceil((to / a.duration) * n)));
};

/** The frames along a clip: each tile shows the frame from that moment of the (trimmed) clip. */
const Film: React.FC<{ asset: Asset | undefined; clip: MediaLayer; widthPx: number; heightPx: number }> = ({ asset, clip, widthPx, heightPx }) => {
  const frames = useStrip(asset);
  if (!asset) return null;
  const aspect = asset.width > 0 && asset.height > 0 ? asset.width / asset.height : 16 / 9;
  const tw = Math.max(30, Math.min(140, Math.round(heightPx * aspect)));
  const n = Math.max(1, Math.ceil(widthPx / tw));
  const isVideo = asset.kind === 'video';
  return (
    <div className="absolute inset-0 flex overflow-hidden" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => {
        let src = asset.thumb;
        if (isVideo && frames.length) {
          const t = clip.trimIn + ((i + 0.5) / n) * (clip.trimOut - clip.trimIn);
          src = frames[Math.max(0, Math.min(frames.length - 1, Math.floor((t / Math.max(0.1, asset.duration)) * frames.length)))] || asset.thumb;
        }
        return <div key={i} className="shrink-0 h-full border-r border-black/40" style={{ width: tw, backgroundImage: src ? `url(${src})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center' }} />;
      })}
    </div>
  );
};

export const Timeline: React.FC<{ ctl: StudioCtl }> = ({ ctl }) => {
  const { project, assets, player } = ctl;
  const [pps, setPps] = useState(70);                      // pixels per second
  const [snapOn, setSnapOn] = useState(true);
  const [snapAt, setSnapAt] = useState<number | null>(null);
  const total = Math.max(ctl.duration, 4) + 3;
  const width = Math.max(total * pps, 300);
  const scroller = useRef<HTMLDivElement>(null);
  const drag = useRef<null | { kind: 'move' | 'left' | 'right' | 'playhead'; id: string; x0: number; layer: Layer; others?: number[] }>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [dropX, setDropX] = useState<number | null>(null);

  const main = mainClips(project);
  const overlays = project.layers.filter((l) => !(l.type === 'media' && l.track === 'main') && l.type !== 'audio' && l.type !== 'captions');
  const audios = project.layers.filter((l) => l.type === 'audio') as AudioLayer[];
  const captions = project.layers.filter((l) => l.type === 'captions');

  const timeAt = (clientX: number) => {
    const el = scroller.current!;
    const r = el.getBoundingClientRect();
    return Math.max(0, (clientX - r.left + el.scrollLeft - LABEL_W) / pps);
  };

  // while playing, the view follows the playhead
  useEffect(() => {
    const el = scroller.current;
    if (!el || !ctl.playing) return;
    const x = LABEL_W + ctl.time * pps;
    if (x > el.scrollLeft + el.clientWidth - 48 || x < el.scrollLeft + LABEL_W) el.scrollLeft = Math.max(0, x - LABEL_W - 80);
  }, [ctl.time, ctl.playing, pps]);

  const snapTime = (t: number, id: string): number => {
    if (!snapOn) { return t; }
    const th = 8 / pps;
    let best = t, bd = th;
    const cand = [0, player.t];
    for (const x of project.layers) if (x.id !== id && x.type !== 'captions') cand.push(x.start, x.start + x.duration);
    for (const c of cand) { const d = Math.abs(c - t); if (d < bd) { bd = d; best = c; } }
    return best;
  };
  const snapped = (before: number, after: number) => (Math.abs(after - before) > 1e-9 ? after : null);

  const begin = (e: React.PointerEvent, kind: 'move' | 'left' | 'right', layer: Layer) => {
    e.stopPropagation();
    ctl.select(layer.id);
    if (layer.locked) return;
    drag.current = { kind, id: layer.id, x0: e.clientX, layer, others: kind === 'move' && layer.type === 'media' && layer.track === 'main' ? main.map((m) => m.start + m.duration / 2) : undefined };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.kind === 'playhead') { player.seek(timeAt(e.clientX)); return; }
    const dt = (e.clientX - d.x0) / pps;
    const l = d.layer;
    const isMain = l.type === 'media' && l.track === 'main';
    const isVideoClip = l.type === 'media' && ctl.assets.get(l.assetId)?.kind === 'video';
    let sn: number | null = null;
    if (d.kind === 'move') {
      if (isMain) {
        const center = l.start + l.duration / 2 + dt;
        const idx = (d.others || []).filter((c, i) => main[i].id !== l.id && c < center).length;
        setDropAt(idx);
      } else {
        const want = Math.max(0, l.start + dt);
        const sa = snapTime(want, l.id);
        const sb = snapTime(want + l.duration, l.id) - l.duration;
        let pick = want;
        if (Math.abs(sa - want) > 1e-9) { pick = sa; sn = sa; } else if (Math.abs(sb - want) > 1e-9) { pick = sb; sn = sb + l.duration; }
        ctl.updateLayer(l.id, { start: Math.max(0, pick) }, `${l.id}:move`);
      }
    } else if (d.kind === 'left') {
      if (isVideoClip && l.type === 'media') {
        const trimIn = Math.max(0, Math.min(l.trimOut - 0.1, l.trimIn + dt * l.speed));
        ctl.updateLayer(l.id, isMain ? { trimIn } : { trimIn, start: Math.max(0, l.start + (trimIn - l.trimIn) / l.speed) }, `${l.id}:trim`);
      } else if (l.type === 'audio') {
        const trimIn = Math.max(0, l.trimIn + dt);
        ctl.updateLayer(l.id, { trimIn, start: Math.max(0, l.start + dt), duration: Math.max(0.2, l.duration - dt) }, `${l.id}:trim`);
      } else if (isMain) ctl.updateLayer(l.id, { duration: Math.max(0.3, l.duration - dt) }, `${l.id}:trim`);
      else {
        const s0 = Math.max(0, l.start + dt);
        const s1 = snapTime(s0, l.id);
        sn = snapped(s0, s1);
        const end = l.start + l.duration;
        ctl.updateLayer(l.id, { start: Math.min(s1, end - 0.2), duration: Math.max(0.2, end - Math.min(s1, end - 0.2)) }, `${l.id}:trim`);
      }
    } else if (d.kind === 'right') {
      if (isVideoClip && l.type === 'media') {
        const max = ctl.assets.get(l.assetId)!.duration;
        ctl.updateLayer(l.id, { trimOut: Math.max(l.trimIn + 0.1, Math.min(max, l.trimOut + dt * l.speed)) }, `${l.id}:trim`);
      } else if (l.type === 'audio') {
        const max = ctl.assets.get(l.assetId)?.duration ?? 3600;
        ctl.updateLayer(l.id, { duration: Math.max(0.2, Math.min(max - l.trimIn, l.duration + dt)) }, `${l.id}:trim`);
      } else if (isMain) ctl.updateLayer(l.id, { duration: Math.max(0.2, l.duration + dt) }, `${l.id}:trim`);
      else {
        const e0 = l.start + l.duration + dt;
        const e1 = snapTime(e0, l.id);
        sn = snapped(e0, e1);
        ctl.updateLayer(l.id, { duration: Math.max(0.2, e1 - l.start) }, `${l.id}:trim`);
      }
    }
    setSnapAt(sn);
  };

  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d && d.kind === 'move' && dropAt !== null) ctl.moveMain(d.id, dropAt);
    setDropAt(null);
    setSnapAt(null);
  };

  // dropping a file from the media pool onto a track
  const overDrop = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes(ASSET_DRAG)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDropX(timeAt(e.clientX));
  };
  const doDrop = (e: React.DragEvent, lane: 'main' | 'overlay' | 'audio') => {
    const id = e.dataTransfer.getData(ASSET_DRAG);
    setDropX(null);
    if (!id) return;
    e.preventDefault();
    ctl.dropAsset(id, lane, timeAt(e.clientX));
  };

  const ticks: number[] = [];
  const step = pps >= 200 ? 0.5 : pps >= 120 ? 1 : pps >= 55 ? 2 : pps >= 28 ? 5 : 10;
  for (let t = 0; t <= total; t += step) ticks.push(+t.toFixed(2));
  const minor = step / 5;

  const block = (l: Layer, h: number, kids?: React.ReactNode, label?: React.ReactNode) => {
    const sel = ctl.selectedId === l.id;
    return (
      <div
        key={l.id}
        data-testid={`clip-${l.type}`}
        onPointerDown={(e) => begin(e, 'move', l)}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className={`absolute top-0.5 rounded-[5px] overflow-hidden text-[10px] font-bold text-white border touch-none select-none ${COLOR[l.type] || 'bg-zinc-600'} ${sel ? 'border-white ring-2 ring-white/70 z-10' : 'border-black/50'} ${l.hidden ? 'opacity-40' : ''} ${l.locked ? 'cursor-not-allowed' : 'cursor-grab'}`}
        style={{ left: l.start * pps, width: Math.max(16, l.duration * pps), height: h - 4 }}
      >
        {kids}
        <span className="relative block px-1.5 py-px truncate drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)] bg-gradient-to-b from-black/55 to-transparent">{label}</span>
        {sel && !l.locked && (
          <>
            <span onPointerDown={(e) => begin(e, 'left', l)} onPointerMove={onMove} onPointerUp={onUp} className="absolute left-0 top-0 bottom-0 w-2.5 bg-white/90 hover:bg-fuchsia-300 cursor-ew-resize touch-none rounded-l-[4px]" aria-label="Trim start" />
            <span onPointerDown={(e) => begin(e, 'right', l)} onPointerMove={onMove} onPointerUp={onUp} className="absolute right-0 top-0 bottom-0 w-2.5 bg-white/90 hover:bg-fuchsia-300 cursor-ew-resize touch-none rounded-r-[4px]" aria-label="Trim end" />
          </>
        )}
      </div>
    );
  };

  const toggle = (on: boolean, Icon: React.ComponentType<{ className?: string }>, IconOff: React.ComponentType<{ className?: string }>, label: string, fn: () => void) => (
    <button onClick={(e) => { e.stopPropagation(); fn(); }} aria-label={label} aria-pressed={on} title={label} className={`w-[22px] h-[22px] rounded flex items-center justify-center ${on ? 'text-amber-300 bg-white/10' : 'text-zinc-400 hover:text-white hover:bg-white/10'}`}>
      {on ? <IconOff className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
    </button>
  );

  /** One row: the header (name and switches) that stays in view while scrolling sideways, and the track. */
  const row = (key: string, h: number, head: React.ReactNode, track: React.ReactNode, lane?: 'main' | 'overlay' | 'audio', testid?: string, selected = false) => (
    <div key={key} className="flex" data-testid={testid}>
      <div className={`shrink-0 sticky left-0 z-20 border-r border-b border-zinc-800 px-1.5 flex flex-col justify-center gap-0.5 ${selected ? 'bg-zinc-800' : 'bg-zinc-950'}`} style={{ width: LABEL_W, height: h }}>{head}</div>
      <div
        className="relative border-b border-zinc-800/80 bg-[repeating-linear-gradient(90deg,transparent_0,transparent_69px,rgba(255,255,255,0.025)_69px,rgba(255,255,255,0.025)_70px)]"
        style={{ width, height: h }}
        onDragOver={lane ? overDrop : undefined} onDragLeave={() => setDropX(null)} onDrop={lane ? (e) => doDrop(e, lane) : undefined}
      >{track}</div>
    </div>
  );

  const head = (tag: string, name: string, switches: React.ReactNode, color = 'bg-zinc-600') => (
    <>
      <div className="flex items-center gap-1 min-w-0"><span className={`shrink-0 min-w-[22px] px-1 h-4 rounded text-[9px] font-black flex items-center justify-center ${color}`}>{tag}</span><span className="text-[10px] font-semibold text-zinc-300 truncate" title={name}>{name}</span></div>
      <div className="flex items-center gap-0.5">{switches}</div>
    </>
  );

  const allMain = (patch: (l: MediaLayer) => Partial<MediaLayer>) => ctl.update((p) => ({ ...p, layers: p.layers.map((l) => (l.type === 'media' && l.track === 'main' ? { ...l, ...patch(l) } : l)) }));
  const mainHidden = main.length > 0 && main.every((c) => c.hidden);
  const mainLocked = main.length > 0 && main.every((c) => c.locked);
  const mainMuted = main.length > 0 && main.every((c) => c.muted);

  const sel = ctl.selected;
  const canSplit = !!sel && player.t > sel.start + 0.1 && player.t < sel.start + sel.duration - 0.1;
  const fit = () => { const el = scroller.current; if (el) setPps(Math.max(14, Math.min(320, Math.round((el.clientWidth - LABEL_W - 24) / Math.max(1, ctl.duration))))); if (el) el.scrollLeft = 0; };
  const zoomPos = Math.round((Math.log(pps / 14) / Math.log(320 / 14)) * 100);

  const overRows = [...overlays].reverse();

  return (
    <div className="studio-timeline shrink-0 bg-zinc-950 border-t border-zinc-800 flex flex-col" data-testid="studio-timeline">
      <div className="flex items-center gap-1 px-2 py-1 border-b border-zinc-800 overflow-x-auto no-scrollbar">
        <button onClick={() => player.seek(0)} aria-label="Back to start" className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center shrink-0"><SkipBack className="w-4 h-4" /></button>
        <button onClick={() => (player.playing ? player.pause() : player.play())} aria-label={ctl.playing ? 'Pause' : 'Play'} data-testid="studio-play" className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center shrink-0">
          {ctl.playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
        </button>
        <span className="font-mono text-[12px] text-fuchsia-200 shrink-0 text-center whitespace-nowrap px-2 py-1 rounded bg-black/50 border border-zinc-800" data-testid="studio-time">{fmtTime(ctl.time, true)} / {fmtTime(ctl.duration)}</span>
        <span className="w-px h-5 bg-zinc-800 mx-1 shrink-0" />
        <button onClick={ctl.split} disabled={!canSplit} aria-label="Split at the playhead" title="Split at the playhead (S)" data-testid="studio-split" className="h-8 px-2 rounded-lg hover:bg-white/10 disabled:opacity-30 flex items-center gap-1 text-[11px] font-bold shrink-0"><Scissors className="w-4 h-4" />Split</button>
        <button onClick={() => sel && ctl.duplicateLayer(sel.id)} disabled={!sel} aria-label="Duplicate" className="h-8 px-2 rounded-lg hover:bg-white/10 disabled:opacity-30 flex items-center gap-1 text-[11px] font-bold shrink-0"><Copy className="w-4 h-4" />Copy</button>
        <button onClick={() => sel && ctl.removeLayer(sel.id)} disabled={!sel} aria-label="Delete" data-testid="studio-delete" className="h-8 px-2 rounded-lg hover:bg-white/10 disabled:opacity-30 flex items-center gap-1 text-[11px] font-bold text-rose-300 shrink-0"><Trash2 className="w-4 h-4" />Delete</button>
        <div className="ml-auto flex items-center gap-1 shrink-0">
          <button onClick={() => setSnapOn((v) => !v)} aria-pressed={snapOn} aria-label="Snap to the playhead and to other clips" title="Snap to the playhead and to other clips" data-testid="studio-snap" className={`w-8 h-8 rounded-lg flex items-center justify-center ${snapOn ? 'bg-amber-400/20 text-amber-300' : 'hover:bg-white/10 text-zinc-400'}`}><Magnet className="w-4 h-4" /></button>
          <button onClick={fit} aria-label="Fit the whole video in view" title="Fit the whole video in view" className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center"><Maximize2 className="w-4 h-4" /></button>
          <button onClick={() => setPps((v) => Math.max(14, Math.round(v / 1.35)))} aria-label="Zoom timeline out" className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center"><ZoomOut className="w-4 h-4" /></button>
          <input type="range" min={0} max={100} value={Math.max(0, Math.min(100, zoomPos))} onChange={(e) => setPps(Math.round(14 * Math.pow(320 / 14, parseInt(e.target.value, 10) / 100)))} aria-label="Timeline zoom" className="w-20 accent-fuchsia-500 hidden sm:block" />
          <button onClick={() => setPps((v) => Math.min(320, Math.round(v * 1.35)))} aria-label="Zoom timeline in" className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center"><ZoomIn className="w-4 h-4" /></button>
        </div>
      </div>
      <div ref={scroller} className="relative overflow-auto max-h-[22vh] lg:max-h-[min(36vh,340px)]" onPointerMove={onMove} onPointerUp={onUp}>
        <div className="relative" style={{ width: width + LABEL_W }}>
          <div className="flex sticky top-0 z-30 bg-zinc-950">
            <div className="shrink-0 sticky left-0 z-30 bg-zinc-950 border-r border-b border-zinc-800 text-[9px] font-bold text-zinc-500 flex items-center justify-center" style={{ width: LABEL_W, height: H_RULER }}>TRACKS</div>
            <div
              className="relative border-b border-zinc-800 cursor-pointer touch-none bg-zinc-900/70"
              style={{ width, height: H_RULER }}
              onPointerDown={(e) => { drag.current = { kind: 'playhead', id: '', x0: e.clientX, layer: project.layers[0] }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); player.seek(timeAt(e.clientX)); }}
              onPointerMove={onMove} onPointerUp={onUp} data-testid="studio-ruler"
            >
              {ticks.map((t) => (
                <React.Fragment key={t}>
                  <span className="absolute top-0 text-[9px] font-mono text-zinc-400 pl-1 border-l border-zinc-600 h-full" style={{ left: t * pps }}>{fmtTime(t)}</span>
                  {[1, 2, 3, 4].map((m) => <span key={m} className="absolute bottom-0 w-px h-1.5 bg-zinc-700" style={{ left: (t + m * minor) * pps }} />)}
                </React.Fragment>
              ))}
            </div>
          </div>

          {overRows.map((l, i) => {
            const a = l.type === 'media' ? assets.get(l.assetId) : undefined;
            const n = overRows.length - i + 1;
            const tag = l.type === 'media' ? `V${n}` : TAG[l.type];
            const name = l.type === 'text' ? l.text.split('\n')[0] || 'Text' : l.type === 'sticker' ? l.content : l.name;
            return row(l.id, H_OVER, head(tag, name, (
              <>
                {toggle(!!l.hidden, Eye, EyeOff, l.hidden ? 'Show' : 'Hide', () => ctl.updateLayer(l.id, { hidden: !l.hidden }))}
                {toggle(!!l.locked, LockOpen, Lock, l.locked ? 'Unlock' : 'Lock', () => ctl.updateLayer(l.id, { locked: !l.locked }))}
                {l.type === 'media' && a?.kind === 'video' && toggle(!!l.muted, Volume2, VolumeX, l.muted ? 'Sound on' : 'Mute', () => ctl.updateLayer(l.id, { muted: !l.muted }))}
              </>
            ), COLOR[l.type]), (
              block(l, H_OVER, l.type === 'media' ? <Film asset={a} clip={l} widthPx={Math.max(16, l.duration * pps)} heightPx={H_OVER - 4} /> : undefined, `${TAG[l.type] || ''} ${name}`)
            ), 'overlay', i === 0 ? 'lane-layers' : undefined, ctl.selectedId === l.id);
          })}
          {overRows.length === 0 && row('empty-layers', 24, head('V2+', 'Text, stickers', null), <span className="absolute inset-0 flex items-center pl-3 text-[10px] text-zinc-600">Text, stickers, drawings and overlay clips appear here</span>, 'overlay', 'lane-layers')}

          {row('main', H_MAIN, head('V1', 'Video', (
            <>
              {toggle(mainHidden, Eye, EyeOff, mainHidden ? 'Show video' : 'Hide video', () => allMain(() => ({ hidden: !mainHidden })))}
              {toggle(mainLocked, LockOpen, Lock, mainLocked ? 'Unlock video' : 'Lock video', () => allMain(() => ({ locked: !mainLocked })))}
              {toggle(mainMuted, Volume2, VolumeX, mainMuted ? 'Sound of the clips on' : 'Mute the clips', () => allMain(() => ({ muted: !mainMuted })))}
            </>
          ), 'bg-fuchsia-700'), (
            <>
              {main.map((c) => {
                const a = assets.get(c.assetId);
                const w = Math.max(16, c.duration * pps);
                const wave = a?.kind === 'video' ? peaksFor(a, c.trimIn, c.trimOut) : undefined;
                return (
                  <React.Fragment key={c.id}>
                    {block(c, H_MAIN, (
                      <>
                        <div className="absolute left-0 right-0 top-0" style={{ height: wave ? H_MAIN - 4 - 20 : H_MAIN - 4 }}><Film asset={a} clip={c} widthPx={w} heightPx={wave ? H_MAIN - 4 - 20 : H_MAIN - 4} /></div>
                        {wave && <div className="absolute left-0 right-0 bottom-0 h-5 bg-emerald-950/90 border-t border-black/50"><Wave peaks={wave} dim={!!c.muted} /></div>}
                      </>
                    ), <>{a?.kind === 'video' ? '🎬' : '🖼️'} {c.name}{c.speed !== 1 ? ` · ${c.speed}×` : ''} <span className="font-mono font-normal opacity-80">{fmtTime(c.duration, true)}</span></>)}
                    {c.transition.type !== 'cut' && main[0].id !== c.id && (
                      <button onClick={() => ctl.select(c.id)} title={`Transition: ${c.transition.type}`} aria-label={`Transition ${c.transition.type}`} className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-20 w-5 h-5 rounded-full bg-white text-black text-[10px] font-black flex items-center justify-center shadow" style={{ left: c.start * pps }}>⇆</button>
                    )}
                  </React.Fragment>
                );
              })}
              {dropAt !== null && <div className="absolute top-0 bottom-0 w-1 bg-white z-30" style={{ left: ((dropAt === 0 ? 0 : main.filter((m) => m.id !== drag.current?.id)[dropAt - 1]?.start + (main.filter((m) => m.id !== drag.current?.id)[dropAt - 1]?.duration || 0))) * pps }} />}
              {main.length === 0 && <span className="absolute inset-0 flex items-center pl-3 text-[11px] text-zinc-500">Drag a clip here from the Media tab</span>}
            </>
          ), 'main', 'lane-video')}

          {audios.map((l, i) => {
            const a = assets.get(l.assetId);
            return row(l.id, H_AUDIO, head(`A${i + 1}`, l.name, (
              <>
                {toggle(!!l.hidden, Eye, EyeOff, l.hidden ? 'Show' : 'Hide', () => ctl.updateLayer(l.id, { hidden: !l.hidden }))}
                {toggle(!!l.locked, LockOpen, Lock, l.locked ? 'Unlock' : 'Lock', () => ctl.updateLayer(l.id, { locked: !l.locked }))}
                {toggle(!!l.muted, Volume2, VolumeX, l.muted ? 'Sound on' : 'Mute', () => ctl.updateLayer(l.id, { muted: !l.muted }))}
              </>
            ), 'bg-emerald-700'), block(l, H_AUDIO, (a?.peaks ? <div className="absolute inset-x-0 bottom-0 top-3"><Wave peaks={peaksFor(a, l.trimIn, l.trimIn + l.duration) || []} dim={!!l.muted} /></div> : undefined), `${l.label === 'voice' ? '🎙️' : '♪'} ${l.name}`), 'audio', i === 0 ? 'lane-sound' : undefined, ctl.selectedId === l.id);
          })}
          {audios.length === 0 && row('empty-audio', 24, head('A1', 'Sound', null, 'bg-emerald-700'), <span className="absolute inset-0 flex items-center pl-3 text-[10px] text-zinc-600">Music and voice-overs appear here: drop a sound, or use the Sound tab</span>, 'audio', 'lane-sound')}
          {captions.length > 0 && row('captions', H_CAP, head('CC', 'Captions', null, 'bg-teal-600'), <span className="absolute inset-0 flex items-center pl-3 text-[11px] text-teal-300">{(captions[0] as { cues: unknown[] }).cues.length} lines (edit them in Captions)</span>, undefined, 'lane-captions')}

          {/* where a dragged file would land, a snap guide, and the playhead */}
          {dropX !== null && <div className="absolute top-0 bottom-0 w-0.5 bg-fuchsia-400 z-30 pointer-events-none" style={{ left: LABEL_W + dropX * pps }} />}
          {snapAt !== null && <div className="absolute top-0 bottom-0 w-px bg-amber-300 z-30 pointer-events-none" style={{ left: LABEL_W + snapAt * pps }} />}
          <div className="absolute top-0 bottom-0 w-px bg-rose-500 z-40 pointer-events-none" style={{ left: LABEL_W + ctl.time * pps }}>
            <span className="absolute top-0 -left-[7px] w-3.5 h-3.5 bg-rose-500 [clip-path:polygon(0_0,100%_0,100%_55%,50%_100%,0_55%)]" />
          </div>
        </div>
      </div>
    </div>
  );
};

export type { MediaLayer };
