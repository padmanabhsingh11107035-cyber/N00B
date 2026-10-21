import React, { useRef, useState } from 'react';
import { Copy, Pause, Play, Scissors, Trash2, ZoomIn, ZoomOut, SkipBack } from 'lucide-react';
import { AudioLayer, Layer, MediaLayer, mainClips } from './types';
import { fmtTime } from './assets';
import type { StudioCtl } from './StudioApp';

// The timeline: the story of the video (main track, clip after clip), what floats above it (text, stickers, drawings, overlay clips) and the sound. Drag a clip to move it, its
// ends to trim it; click the ruler to jump there.
const LABEL_W = 62;

const ICON: Record<string, string> = { text: 'T', sticker: '★', draw: '✎', media: '▣', audio: '♪', captions: 'CC' };
const COLOR: Record<string, string> = { text: 'bg-sky-500/80', sticker: 'bg-amber-500/80', draw: 'bg-rose-500/80', media: 'bg-fuchsia-500/80', audio: 'bg-emerald-500/80', captions: 'bg-teal-500/80' };

function Wave({ peaks }: { peaks: number[] }) {
  return (
    <svg className="absolute inset-0 w-full h-full opacity-70" viewBox={`0 0 ${peaks.length} 20`} preserveAspectRatio="none" aria-hidden="true">
      {peaks.map((p, i) => <rect key={i} x={i} y={10 - p * 9} width={0.7} height={Math.max(0.6, p * 18)} fill="#d1fae5" />)}
    </svg>
  );
}

export const Timeline: React.FC<{ ctl: StudioCtl }> = ({ ctl }) => {
  const { project, assets, player } = ctl;
  const [pps, setPps] = useState(70);                      // pixels per second
  const total = Math.max(ctl.duration, 4) + 3;
  const width = Math.max(total * pps, 300);
  const scroller = useRef<HTMLDivElement>(null);
  const drag = useRef<null | { kind: 'move' | 'left' | 'right' | 'playhead'; id: string; x0: number; layer: Layer; others?: number[] }>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);

  const main = mainClips(project);
  const overlays = project.layers.filter((l) => !(l.type === 'media' && l.track === 'main') && l.type !== 'audio' && l.type !== 'captions');
  const audios = project.layers.filter((l) => l.type === 'audio') as AudioLayer[];
  const captions = project.layers.filter((l) => l.type === 'captions');

  const timeAt = (clientX: number) => {
    const el = scroller.current!;
    const r = el.getBoundingClientRect();
    return Math.max(0, (clientX - r.left + el.scrollLeft - LABEL_W) / pps);
  };

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
    if (d.kind === 'move') {
      if (isMain) {
        const center = l.start + l.duration / 2 + dt;
        const idx = (d.others || []).filter((c, i) => main[i].id !== l.id && c < center).length;
        setDropAt(idx);
      } else ctl.updateLayer(l.id, { start: Math.max(0, l.start + dt) }, `${l.id}:move`);
    } else if (d.kind === 'left') {
      if (l.type === 'media' && ctl.assets.get(l.assetId)?.kind === 'video') {
        const trimIn = Math.max(0, Math.min(l.trimOut - 0.1, l.trimIn + dt * l.speed));
        ctl.updateLayer(l.id, isMain ? { trimIn } : { trimIn, start: Math.max(0, l.start + (trimIn - l.trimIn) / l.speed) }, `${l.id}:trim`);
      } else if (l.type === 'audio') {
        const trimIn = Math.max(0, l.trimIn + dt);
        ctl.updateLayer(l.id, { trimIn, start: Math.max(0, l.start + dt), duration: Math.max(0.2, l.duration - dt) }, `${l.id}:trim`);
      } else if (isMain) ctl.updateLayer(l.id, { duration: Math.max(0.3, l.duration - dt) }, `${l.id}:trim`);
      else ctl.updateLayer(l.id, { start: Math.max(0, l.start + dt), duration: Math.max(0.2, l.duration - dt) }, `${l.id}:trim`);
    } else if (d.kind === 'right') {
      if (l.type === 'media' && ctl.assets.get(l.assetId)?.kind === 'video') {
        const max = ctl.assets.get(l.assetId)!.duration;
        ctl.updateLayer(l.id, { trimOut: Math.max(l.trimIn + 0.1, Math.min(max, l.trimOut + dt * l.speed)) }, `${l.id}:trim`);
      } else if (l.type === 'audio') {
        const max = ctl.assets.get(l.assetId)?.duration ?? 3600;
        ctl.updateLayer(l.id, { duration: Math.max(0.2, Math.min(max - l.trimIn, l.duration + dt)) }, `${l.id}:trim`);
      } else ctl.updateLayer(l.id, { duration: Math.max(0.2, l.duration + dt) }, `${l.id}:trim`);
    }
  };

  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d && d.kind === 'move' && dropAt !== null) ctl.moveMain(d.id, dropAt);
    setDropAt(null);
  };

  const ticks: number[] = [];
  const step = pps >= 120 ? 1 : pps >= 55 ? 2 : pps >= 28 ? 5 : 10;
  for (let t = 0; t <= total; t += step) ticks.push(t);

  const block = (l: Layer, opts: { thumb?: string; peaks?: number[]; label?: string; tall?: boolean }) => {
    const sel = ctl.selectedId === l.id;
    const visualStart = l.type === 'media' && l.track === 'main' ? l.start : l.start;
    return (
      <div
        key={l.id}
        data-testid={`clip-${l.type}`}
        onPointerDown={(e) => begin(e, 'move', l)}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className={`absolute top-0.5 bottom-0.5 rounded-md overflow-hidden text-[10px] font-bold text-white border touch-none select-none ${COLOR[l.type] || 'bg-zinc-600'} ${sel ? 'border-white ring-2 ring-white/60 z-10' : 'border-black/40'} ${l.hidden ? 'opacity-40' : ''} ${l.locked ? 'cursor-not-allowed' : 'cursor-grab'}`}
        style={{ left: visualStart * pps, width: Math.max(14, l.duration * pps) }}
      >
        {opts.thumb && <div className="absolute inset-0 opacity-60" style={{ backgroundImage: `url(${opts.thumb})`, backgroundSize: 'auto 100%', backgroundRepeat: 'repeat-x' }} />}
        {opts.peaks && <Wave peaks={opts.peaks} />}
        <span className="relative px-1.5 py-0.5 block truncate drop-shadow">{opts.label}</span>
        {sel && !l.locked && (
          <>
            <span onPointerDown={(e) => begin(e, 'left', l)} onPointerMove={onMove} onPointerUp={onUp} className="absolute left-0 top-0 bottom-0 w-3 bg-white/80 cursor-ew-resize touch-none" aria-label="Trim start" />
            <span onPointerDown={(e) => begin(e, 'right', l)} onPointerMove={onMove} onPointerUp={onUp} className="absolute right-0 top-0 bottom-0 w-3 bg-white/80 cursor-ew-resize touch-none" aria-label="Trim end" />
          </>
        )}
      </div>
    );
  };

  const lane = (name: string, rows: number, children: React.ReactNode, testid: string) => (
    <div className="flex" data-testid={testid}>
      <div className="shrink-0 sticky left-0 z-20 bg-zinc-950 border-r border-zinc-800 text-[10px] font-bold text-zinc-400 flex items-center justify-center" style={{ width: LABEL_W }}>{name}</div>
      <div className="relative border-b border-zinc-800/80" style={{ width, height: Math.max(1, rows) * 34 }}>{children}</div>
    </div>
  );

  const sel = ctl.selected;
  const canSplit = !!sel && player.t > sel.start + 0.1 && player.t < sel.start + sel.duration - 0.1;

  return (
    <div className="shrink-0 bg-zinc-950 border-t border-zinc-800 flex flex-col" data-testid="studio-timeline">
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-zinc-800 overflow-x-auto">
        <button onClick={() => player.seek(0)} aria-label="Back to start" className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center"><SkipBack className="w-4 h-4" /></button>
        <button onClick={() => (player.playing ? player.pause() : player.play())} aria-label={ctl.playing ? 'Pause' : 'Play'} data-testid="studio-play" className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center">
          {ctl.playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
        </button>
        <span className="font-mono text-[11px] text-zinc-300 shrink-0 text-center whitespace-nowrap px-1" data-testid="studio-time">{fmtTime(ctl.time, true)} / {fmtTime(ctl.duration)}</span>
        <button onClick={ctl.split} disabled={!canSplit} aria-label="Split at the playhead" title="Split at the playhead" data-testid="studio-split" className="h-8 px-2 rounded-lg hover:bg-white/10 disabled:opacity-30 flex items-center gap-1 text-[11px] font-bold"><Scissors className="w-4 h-4" />Split</button>
        <button onClick={() => sel && ctl.duplicateLayer(sel.id)} disabled={!sel} aria-label="Duplicate" className="h-8 px-2 rounded-lg hover:bg-white/10 disabled:opacity-30 flex items-center gap-1 text-[11px] font-bold"><Copy className="w-4 h-4" />Copy</button>
        <button onClick={() => sel && ctl.removeLayer(sel.id)} disabled={!sel} aria-label="Delete" data-testid="studio-delete" className="h-8 px-2 rounded-lg hover:bg-white/10 disabled:opacity-30 flex items-center gap-1 text-[11px] font-bold text-rose-300"><Trash2 className="w-4 h-4" />Delete</button>
        <div className="ml-auto flex items-center gap-1 shrink-0">
          <button onClick={() => setPps((v) => Math.max(14, Math.round(v / 1.35)))} aria-label="Zoom timeline out" className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center"><ZoomOut className="w-4 h-4" /></button>
          <button onClick={() => setPps((v) => Math.min(320, Math.round(v * 1.35)))} aria-label="Zoom timeline in" className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center"><ZoomIn className="w-4 h-4" /></button>
        </div>
      </div>
      <div ref={scroller} className="relative overflow-auto max-h-[20vh] sm:max-h-[30vh]" onPointerMove={onMove} onPointerUp={onUp}>
        <div className="relative" style={{ width: width + LABEL_W }}>
          <div className="flex sticky top-0 z-30 bg-zinc-950">
            <div className="shrink-0 sticky left-0 z-30 bg-zinc-950 border-r border-zinc-800" style={{ width: LABEL_W, height: 22 }} />
            <div
              className="relative border-b border-zinc-800 cursor-pointer touch-none"
              style={{ width, height: 22 }}
              onPointerDown={(e) => { drag.current = { kind: 'playhead', id: '', x0: e.clientX, layer: project.layers[0] }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); player.seek(timeAt(e.clientX)); }}
              onPointerMove={onMove} onPointerUp={onUp} data-testid="studio-ruler"
            >
              {ticks.map((t) => <span key={t} className="absolute top-0 text-[9px] text-zinc-500 pl-1 border-l border-zinc-700 h-full" style={{ left: t * pps }}>{fmtTime(t)}</span>)}
            </div>
          </div>
          {lane('Video', 1, (
            <>
              {main.map((c) => {
                const a = assets.get(c.assetId);
                return (
                  <React.Fragment key={c.id}>
                    {block(c, { thumb: a?.thumb, label: `${a?.kind === 'video' ? '🎬' : '🖼️'} ${c.name}${c.speed !== 1 ? ` · ${c.speed}×` : ''}` })}
                    {c.transition.type !== 'cut' && main[0].id !== c.id && (
                      <button onClick={() => ctl.select(c.id)} title={`Transition: ${c.transition.type}`} aria-label={`Transition ${c.transition.type}`} className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-20 w-5 h-5 rounded-full bg-white text-black text-[10px] font-black flex items-center justify-center" style={{ left: c.start * pps }}>⇆</button>
                    )}
                  </React.Fragment>
                );
              })}
              {dropAt !== null && <div className="absolute top-0 bottom-0 w-1 bg-white z-30" style={{ left: ((dropAt === 0 ? 0 : main.filter((m) => m.id !== drag.current?.id)[dropAt - 1]?.start + (main.filter((m) => m.id !== drag.current?.id)[dropAt - 1]?.duration || 0))) * pps }} />}
              {main.length === 0 && <span className="absolute inset-0 flex items-center pl-3 text-[11px] text-zinc-500">Add a clip from Media</span>}
            </>
          ), 'lane-video')}
          {lane('Layers', Math.max(1, overlays.length), overlays.map((l, i) => (
            <div key={l.id} className="absolute left-0 right-0" style={{ top: i * 34, height: 34 }}>
              {block(l, { label: `${ICON[l.type] || ''} ${l.type === 'text' ? l.text.split('\n')[0] : l.type === 'sticker' ? l.content : l.name}`, thumb: l.type === 'media' ? assets.get(l.assetId)?.thumb : undefined })}
            </div>
          )), 'lane-layers')}
          {lane('Sound', Math.max(1, audios.length), audios.map((l, i) => (
            <div key={l.id} className="absolute left-0 right-0" style={{ top: i * 34, height: 34 }}>
              {block(l, { label: `${l.label === 'voice' ? '🎙️' : '♪'} ${l.name}`, peaks: assets.get(l.assetId)?.peaks?.slice(Math.floor((l.trimIn / Math.max(0.1, assets.get(l.assetId)?.duration || 1)) * 200), Math.ceil(((l.trimIn + l.duration) / Math.max(0.1, assets.get(l.assetId)?.duration || 1)) * 200)) })}
            </div>
          )), 'lane-sound')}
          {captions.length > 0 && lane('Captions', 1, <span className="absolute inset-0 flex items-center pl-3 text-[11px] text-teal-300">{(captions[0] as { cues: unknown[] }).cues.length} lines (edit them in Captions)</span>, 'lane-captions')}
          {/* the playhead */}
          <div className="absolute top-0 bottom-0 w-px bg-rose-500 z-40 pointer-events-none" style={{ left: LABEL_W + ctl.time * pps }}>
            <span className="absolute -top-0 -left-1.5 w-3 h-3 bg-rose-500 rotate-45" />
          </div>
        </div>
      </div>
    </div>
  );
};

export type { MediaLayer };
