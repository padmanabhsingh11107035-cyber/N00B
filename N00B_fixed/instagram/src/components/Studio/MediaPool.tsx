import React, { useMemo, useRef, useState } from 'react';
import { Clapperboard, FilePlus2, FolderOpen, Image as ImageIcon, Layers as LayersIcon, Music, Plus, Search, Trash2 } from 'lucide-react';
import type { Asset } from './types';
import { COLLAGES, collage } from './templates';
import { fmtSize, fmtTime } from './assets';
import { Btn, Chips, Section, Slider } from './ui';
import type { StudioCtl } from './StudioApp';

// The media pool (the "bin" of a professional editor): everything imported, as thumbnails, in folders, ready to be dragged onto the timeline or added with a tap.
export const ASSET_DRAG = 'application/x-noob-studio-asset';

type Bin = 'all' | 'video' | 'image' | 'audio' | 'used' | 'unused';
const BINS: Array<{ id: Bin; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'all', label: 'All media', icon: FolderOpen },
  { id: 'video', label: 'Videos', icon: Clapperboard },
  { id: 'image', label: 'Photos', icon: ImageIcon },
  { id: 'audio', label: 'Sounds', icon: Music },
  { id: 'used', label: 'In project', icon: LayersIcon },
  { id: 'unused', label: 'Not used', icon: FilePlus2 }
];

export const MediaPanel: React.FC<{ ctl: StudioCtl }> = ({ ctl }) => {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [bin, setBin] = useState<Bin>('all');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [layout, setLayout] = useState('grid4');
  const [gap, setGap] = useState(12);
  const [round, setRound] = useState(0);

  const used = useMemo(() => {
    const s = new Set<string>();
    for (const l of ctl.project.layers) { if (l.type === 'media' || l.type === 'audio') s.add(l.assetId); else if (l.type === 'sticker' && l.kind === 'image') s.add(l.content); }
    return s;
  }, [ctl.project.layers]);
  const counts: Record<Bin, number> = {
    all: ctl.assetList.length, video: ctl.assetList.filter((a) => a.kind === 'video').length, image: ctl.assetList.filter((a) => a.kind === 'image').length,
    audio: ctl.assetList.filter((a) => a.kind === 'audio').length, used: ctl.assetList.filter((a) => used.has(a.id)).length, unused: ctl.assetList.filter((a) => !used.has(a.id)).length
  };
  const shown = ctl.assetList.filter((a) => {
    if (q.trim() && !a.name.toLowerCase().includes(q.trim().toLowerCase())) return false;
    if (bin === 'all') return true;
    if (bin === 'used') return used.has(a.id);
    if (bin === 'unused') return !used.has(a.id);
    return a.kind === bin;
  });
  const sel = ctl.assetList.find((a) => a.id === picked) || null;
  const images = ctl.assetList.filter((a) => a.kind === 'image');
  const video = ctl.project.mode === 'video';

  const addDefault = (a: Asset) => {
    if (a.kind === 'audio') ctl.placeAsset(a, 'audio');
    else ctl.placeAsset(a, video ? 'main' : ctl.project.layers.some((l) => l.type === 'media' && l.track === 'main') ? 'overlay' : 'main');
  };

  return (
    <div
      className="min-h-full flex flex-col"
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); setOver(false); void ctl.addFiles(Array.from(e.dataTransfer.files)); } }}
    >
      <div className="px-3 py-2 border-b border-zinc-800 flex items-center gap-2">
        <input ref={input} type="file" multiple accept="image/*,video/*,audio/*" className="hidden" data-testid="studio-file-input" onChange={(e) => { void ctl.addFiles(Array.from(e.target.files || [])); e.target.value = ''; }} />
        <Btn tone="primary" className="!py-1.5" onClick={() => input.current?.click()} data-testid="studio-import"><Plus className="w-4 h-4" />Import</Btn>
        <div className="relative flex-1 min-w-0">
          <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search media" aria-label="Search media" className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-7 pr-2 py-1.5 text-[12px] text-white" />
        </div>
      </div>
      {ctl.busy && <div className="px-3 py-1 text-[11px] text-fuchsia-300 animate-pulse">{ctl.busy}</div>}

      <div className="flex-1 min-h-0 flex">
        <nav className="w-[92px] shrink-0 border-r border-zinc-800 py-1.5" aria-label="Folders">
          {BINS.map((b) => {
            const Icon = b.icon;
            return (
              <button key={b.id} onClick={() => setBin(b.id)} aria-pressed={bin === b.id} data-testid={`bin-${b.id}`} className={`w-full flex items-center gap-1.5 px-2 py-1.5 text-left text-[11px] font-semibold ${bin === b.id ? 'bg-fuchsia-500/20 text-white' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}>
                <Icon className="w-3.5 h-3.5 shrink-0" /><span className="truncate flex-1">{b.label}</span><span className="text-[9px] text-zinc-500">{counts[b.id]}</span>
              </button>
            );
          })}
        </nav>
        <div className={`flex-1 min-w-0 p-2 ${over ? 'bg-fuchsia-500/10 outline outline-2 -outline-offset-2 outline-fuchsia-400' : ''}`}>
          {ctl.assetList.length === 0 ? (
            <button onClick={() => input.current?.click()} className="w-full py-8 rounded-xl border-2 border-dashed border-zinc-600 hover:border-zinc-400 flex flex-col items-center gap-1 text-[12px] font-bold">
              <FilePlus2 className="w-7 h-7 text-fuchsia-300" />
              Add photos, videos or sounds
              <span className="text-[10px] font-normal text-zinc-400 px-2 text-center">or drop them here · everything stays on this device</span>
            </button>
          ) : shown.length === 0 ? (
            <p className="text-[11px] text-zinc-500 p-3">Nothing in this folder.</p>
          ) : (
            <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(104px,1fr))]" data-testid="studio-pool">
              {shown.map((a) => (
                <div
                  key={a.id} data-testid="studio-asset" draggable
                  onDragStart={(e) => { e.dataTransfer.setData(ASSET_DRAG, a.id); e.dataTransfer.effectAllowed = 'copy'; setPicked(a.id); }}
                  onClick={() => setPicked(a.id)} onDoubleClick={() => addDefault(a)}
                  className={`group relative rounded-lg overflow-hidden bg-zinc-900 border cursor-grab active:cursor-grabbing ${picked === a.id ? 'border-fuchsia-400 ring-1 ring-fuchsia-400' : 'border-zinc-800 hover:border-zinc-600'}`}
                >
                  <div className="relative aspect-video bg-black flex items-center justify-center">
                    {a.thumb ? <img src={a.thumb} alt="" draggable={false} className="w-full h-full object-cover" /> : <Music className="w-7 h-7 text-emerald-300" />}
                    {a.kind === 'audio' && a.peaks && (
                      <svg className="absolute inset-x-1 bottom-1 h-5 opacity-80" viewBox={`0 0 ${a.peaks.length} 20`} preserveAspectRatio="none" aria-hidden="true">{a.peaks.map((p, i) => <rect key={i} x={i} y={10 - p * 9} width={0.7} height={Math.max(0.6, p * 18)} fill="#6ee7b7" />)}</svg>
                    )}
                    <span className="absolute bottom-0.5 right-0.5 px-1 rounded bg-black/75 text-[9px] font-mono">{a.kind === 'image' ? 'IMG' : fmtTime(a.duration)}</span>
                    {used.has(a.id) && <span className="absolute top-0.5 left-0.5 px-1 rounded bg-emerald-500 text-black text-[9px] font-black" title="In the project">✓</span>}
                    <button
                      onClick={(e) => { e.stopPropagation(); addDefault(a); }} aria-label={`Add ${a.name} to the project`} data-testid="asset-add"
                      className="absolute bottom-0.5 left-0.5 w-6 h-6 rounded-md bg-fuchsia-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100"
                    ><Plus className="w-4 h-4" /></button>
                    <button
                      onClick={(e) => { e.stopPropagation(); ctl.removeAsset(a.id); }} aria-label={`Remove ${a.name} from the pool`}
                      className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 hover:bg-rose-600 flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100"
                    ><Trash2 className="w-3 h-3" /></button>
                  </div>
                  <div className="px-1.5 py-1 text-[10px] font-semibold truncate" title={a.name}>{a.name}</div>
                </div>
              ))}
            </div>
          )}
          {sel && (
            <div className="mt-2 rounded-lg bg-zinc-900 border border-zinc-800 p-2 text-[10px] text-zinc-400 space-y-1.5" data-testid="asset-detail">
              <div className="text-[11px] font-bold text-white truncate">{sel.name}</div>
              <div>{sel.kind === 'audio' ? 'Sound' : sel.kind === 'video' ? 'Video' : 'Photo'}{sel.kind !== 'audio' ? ` · ${sel.width}×${sel.height}` : ''}{sel.duration ? ` · ${fmtTime(sel.duration, true)}` : ''} · {fmtSize(sel.size)}</div>
              <div className="flex gap-1.5 flex-wrap">
                {sel.kind !== 'audio' && <Btn className="!py-1 !px-2 !text-[10px]" onClick={() => ctl.placeAsset(sel, video ? 'main' : ctl.project.layers.some((l) => l.type === 'media' && l.track === 'main') ? 'overlay' : 'main')}><Plus className="w-3 h-3" />{video ? 'To timeline' : 'Add'}</Btn>}
                {sel.kind !== 'audio' && video && <Btn className="!py-1 !px-2 !text-[10px]" onClick={() => ctl.placeAsset(sel, 'overlay')}>Overlay</Btn>}
                {sel.kind !== 'image' && <Btn className="!py-1 !px-2 !text-[10px]" onClick={() => ctl.placeAsset(sel, 'audio')} title="Use the sound of this file"><Music className="w-3 h-3" />{sel.kind === 'video' ? 'Sound only' : 'As music'}</Btn>}
              </div>
              <div className="text-zinc-500">Drag a thumbnail onto the timeline, or double-click it.</div>
            </div>
          )}
        </div>
      </div>

      <Section title="Collage">
        {images.length < 2 ? <p className="text-[11px] text-zinc-500">Import two or more photos to make a collage.</p> : (
          <>
            <Chips options={COLLAGES.map((c) => ({ id: c.id, label: c.name }))} value={layout} onChange={setLayout} />
            <Slider label="Spacing" value={gap} min={0} max={60} onChange={setGap} reset={12} unit="px" />
            <Slider label="Rounded corners" value={round} min={0} max={80} onChange={setRound} reset={0} unit="px" />
            <Btn tone="primary" className="w-full" onClick={() => ctl.update((p) => collage(p, images, layout, gap, round))} data-testid="studio-collage">Make the collage</Btn>
          </>
        )}
      </Section>
    </div>
  );
};
