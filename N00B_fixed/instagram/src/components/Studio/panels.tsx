import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff, FilePlus2, FlipHorizontal2, FlipVertical2, Lock, LockOpen, Copy, Trash2, ChevronUp, ChevronDown, RotateCw, Film, Image as ImageIcon, Music, Plus, X, Wand2 } from 'lucide-react';
import { ASPECTS, Adjust, Aspect, Asset, Layer, MediaLayer, NO_ADJUST, Project, fitLayer, mainClips } from './types';
import { FILTERS } from './filters';
import { sharedGL } from './gl';
import { COLLAGES, TEMPLATES, applyTemplate, collage } from './templates';
import { fmtSize, fmtTime } from './assets';
import { Btn, ColorInput, Chips, Empty, Section, Slider } from './ui';
import type { StudioCtl } from './StudioApp';

/** The picture or clip the colour / crop tools work on: the selected one, otherwise the first clip. */
export function mediaTarget(ctl: StudioCtl): MediaLayer | null {
  if (ctl.selected?.type === 'media') return ctl.selected;
  const first = mainClips(ctl.project)[0] || (ctl.project.layers.find((l) => l.type === 'media') as MediaLayer | undefined);
  return first || null;
}

const NeedMedia = () => <Empty>Add a photo or video first (Media tab), then come back here.</Empty>;

// ---------------------------------------------------------------- Media
export const MediaPanel: React.FC<{ ctl: StudioCtl }> = ({ ctl }) => {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const images = ctl.assetList.filter((a) => a.kind === 'image');
  const [layout, setLayout] = useState('grid4');
  const [gap, setGap] = useState(12);
  const [round, setRound] = useState(0);
  return (
    <div onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); void ctl.addFiles(Array.from(e.dataTransfer.files)); }}>
      <Section title="Import">
        <input ref={input} type="file" multiple accept="image/*,video/*,audio/*" className="hidden" data-testid="studio-file-input" onChange={(e) => { void ctl.addFiles(Array.from(e.target.files || [])); e.target.value = ''; }} />
        <button onClick={() => input.current?.click()} className={`w-full py-6 rounded-xl border-2 border-dashed flex flex-col items-center gap-1 text-[12px] font-bold ${over ? 'border-fuchsia-400 bg-fuchsia-500/10' : 'border-zinc-600 hover:border-zinc-400'}`}>
          <FilePlus2 className="w-6 h-6 text-fuchsia-300" />
          Add photos, videos or sounds
          <span className="text-[10px] font-normal text-zinc-400">or drop them here · everything stays on this device</span>
        </button>
        {ctl.busy && <div className="text-[11px] text-fuchsia-300 animate-pulse">{ctl.busy}</div>}
      </Section>
      <Section title={`Your files (${ctl.assetList.length})`}>
        {ctl.assetList.length === 0 && <p className="text-[11px] text-zinc-500">Nothing yet.</p>}
        <div className="grid grid-cols-2 gap-2">
          {ctl.assetList.map((a) => (
            <div key={a.id} className="rounded-xl bg-zinc-900 border border-zinc-800 overflow-hidden" data-testid="studio-asset">
              <div className="relative aspect-video bg-black flex items-center justify-center">
                {a.thumb ? <img src={a.thumb} alt="" className="w-full h-full object-cover" /> : <Music className="w-8 h-8 text-emerald-300" />}
                <span className="absolute top-1 left-1 px-1 rounded bg-black/70 text-[9px] font-bold">{a.kind === 'video' ? <Film className="w-3 h-3 inline" /> : a.kind === 'image' ? <ImageIcon className="w-3 h-3 inline" /> : <Music className="w-3 h-3 inline" />}</span>
                <button onClick={() => ctl.removeAsset(a.id)} aria-label={`Remove ${a.name}`} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 hover:bg-rose-600 flex items-center justify-center"><X className="w-3 h-3" /></button>
              </div>
              <div className="p-1.5">
                <div className="text-[10px] font-bold truncate" title={a.name}>{a.name}</div>
                <div className="text-[9px] text-zinc-500">{a.kind === 'audio' ? '' : `${a.width}×${a.height} · `}{a.duration ? `${fmtTime(a.duration)} · ` : ''}{fmtSize(a.size)}</div>
                <div className="flex gap-1 mt-1">
                  {a.kind !== 'audio' && <Btn className="flex-1 !py-1 !px-1.5 !text-[10px]" onClick={() => ctl.placeAsset(a, ctl.project.mode === 'video' ? 'main' : (ctl.project.layers.some((l) => l.type === 'media' && l.track === 'main') ? 'overlay' : 'main'))}><Plus className="w-3 h-3" />{ctl.project.mode === 'video' ? 'Clip' : 'Add'}</Btn>}
                  {a.kind !== 'audio' && ctl.project.mode === 'video' && <Btn className="flex-1 !py-1 !px-1.5 !text-[10px]" onClick={() => ctl.placeAsset(a, 'overlay')}>Overlay</Btn>}
                  {a.kind === 'audio' && <Btn className="flex-1 !py-1 !text-[10px]" onClick={() => ctl.placeAsset(a, 'audio')}><Plus className="w-3 h-3" />Music</Btn>}
                  {a.kind === 'video' && <Btn className="!py-1 !px-1.5 !text-[10px]" title="Use this video's sound as music" onClick={() => ctl.placeAsset(a, 'audio')}><Music className="w-3 h-3" /></Btn>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>
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

// ---------------------------------------------------------------- Canvas (size and background)
export const CanvasPanel: React.FC<{ ctl: StudioCtl }> = ({ ctl }) => {
  const p = ctl.project;
  return (
    <>
      <Section title="Project">
        <Chips options={[{ id: 'photo', label: '🖼️ Photo' }, { id: 'video', label: '🎬 Video (timeline)' }]} value={p.mode} onChange={(m) => ctl.setMode(m as 'photo' | 'video')} />
        <p className="text-[11px] text-zinc-500">{p.mode === 'photo' ? 'One picture, with text, stickers and drawings on it. Exports a JPEG, PNG or WebP.' : 'Clips on a timeline with transitions and sound. Exports a video.'}</p>
      </Section>
      <Section title="Shape of the canvas">
        <div className="grid grid-cols-3 gap-1.5">
          {(Object.keys(ASPECTS) as Aspect[]).map((a) => (
            <button key={a} onClick={() => ctl.setAspect(a)} aria-pressed={p.aspect === a} data-testid={`aspect-${a}`} className={`rounded-xl border px-1 py-2 flex flex-col items-center gap-1 ${p.aspect === a ? 'border-fuchsia-300 bg-fuchsia-500/20' : 'border-zinc-700 bg-zinc-900 hover:border-zinc-500'}`}>
              <span className="border border-zinc-300 rounded-sm bg-zinc-700" style={{ width: 22 * (ASPECTS[a].w / Math.max(ASPECTS[a].w, ASPECTS[a].h)) + 6, height: 22 * (ASPECTS[a].h / Math.max(ASPECTS[a].w, ASPECTS[a].h)) + 6 }} />
              <span className="text-[11px] font-black">{a}</span>
              <span className="text-[9px] text-zinc-400 text-center leading-tight">{ASPECTS[a].hint}</span>
            </button>
          ))}
        </div>
      </Section>
      <Section title="Background">
        <ColorInput label="Colour" value={p.bgColor} onChange={(c) => ctl.update((q) => ({ ...q, bgColor: c }), 'bg')} />
        <label className="flex items-center justify-between text-[12px] font-semibold">
          Blurred copy of the picture behind it
          <input type="checkbox" checked={p.bgBlur} onChange={(e) => ctl.update((q) => ({ ...q, bgBlur: e.target.checked }))} className="w-5 h-5 accent-fuchsia-500" />
        </label>
        <p className="text-[11px] text-zinc-500">Shows where the picture does not fill the canvas.</p>
      </Section>
    </>
  );
};

// ---------------------------------------------------------------- Adjust
const GROUPS: Array<{ title: string; items: Array<[keyof Adjust, string, number, number]> }> = [
  { title: 'Light', items: [['exposure', 'Exposure', -100, 100], ['brightness', 'Brightness', -100, 100], ['contrast', 'Contrast', -100, 100], ['highlights', 'Highlights', -100, 100], ['shadows', 'Shadows', -100, 100]] },
  { title: 'Colour', items: [['saturation', 'Saturation', -100, 100], ['vibrance', 'Vibrance', -100, 100], ['temperature', 'Temperature', -100, 100], ['tint', 'Tint', -100, 100], ['hue', 'Hue', -100, 100]] },
  { title: 'Effects', items: [['fade', 'Fade', 0, 100], ['vignette', 'Vignette', 0, 100], ['grain', 'Grain', 0, 100], ['sharpness', 'Sharpness', 0, 100], ['blur', 'Blur', 0, 40]] }
];

export const AdjustPanel: React.FC<{ ctl: StudioCtl }> = ({ ctl }) => {
  const t = mediaTarget(ctl);
  if (!t) return <NeedMedia />;
  const set = (k: keyof Adjust, v: number) => ctl.updateLayer(t.id, { adjust: { ...t.adjust, [k]: v } }, `${t.id}:adj:${k}`);
  return (
    <>
      <div className="px-3 pt-2 text-[11px] text-zinc-400">Editing: <b className="text-white">{t.name}</b>. Hold <b>Original</b> under the picture to compare.</div>
      {GROUPS.map((g) => (
        <Section key={g.title} title={g.title}>
          {g.items.map(([k, label, min, max]) => <Slider key={k} label={label} value={t.adjust[k]} min={min} max={max} step={k === 'blur' ? 0.5 : 1} onChange={(v) => set(k, v)} reset={0} testId={`adj-${k}`} />)}
        </Section>
      ))}
      <div className="p-3"><Btn className="w-full" onClick={() => ctl.updateLayer(t.id, { adjust: { ...NO_ADJUST } })} data-testid="adj-reset-all">Reset all adjustments</Btn></div>
    </>
  );
};

// ---------------------------------------------------------------- Filters
const thumbCache = new Map<string, string>();
function loadImg(src: string): Promise<HTMLImageElement> { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }

export const FiltersPanel: React.FC<{ ctl: StudioCtl }> = ({ ctl }) => {
  const t = mediaTarget(ctl);
  const asset = t ? ctl.assets.get(t.assetId) : undefined;
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  useEffect(() => {
    let dead = false;
    (async () => {
      const gl = sharedGL();
      if (!asset?.thumb || !gl) return;
      const img = await loadImg(asset.thumb).catch(() => null);
      if (!img || dead) return;
      const out: Record<string, string> = {};
      for (const f of FILTERS) {
        const key = `${asset.id}:${f.id}`;
        if (!thumbCache.has(key)) {
          const r = gl.process(img, 84, 104, { crop: { x: 0, y: 0, w: 1, h: 1 }, adjust: { ...NO_ADJUST }, filter: f.id, filterAmount: 100 });
          const c = document.createElement('canvas'); c.width = 84; c.height = 104;
          c.getContext('2d')!.drawImage(r.canvas, r.sx, r.sy, r.sw, r.sh, 0, 0, 84, 104);
          thumbCache.set(key, c.toDataURL('image/jpeg', 0.7));
        }
        out[f.id] = thumbCache.get(key)!;
      }
      if (!dead) setThumbs(out);
    })();
    return () => { dead = true; };
  }, [asset?.id, asset?.thumb]);
  if (!t) return <NeedMedia />;
  return (
    <>
      <Section title="Filters">
        <div className="grid grid-cols-3 gap-2">
          {FILTERS.map((f) => (
            <button key={f.id} onClick={() => ctl.updateLayer(t.id, { filter: f.id })} aria-pressed={t.filter === f.id} data-testid={`filter-${f.id}`} className={`rounded-xl overflow-hidden border-2 text-center ${t.filter === f.id ? 'border-fuchsia-400' : 'border-zinc-800 hover:border-zinc-600'}`}>
              <div className="aspect-[4/5] bg-zinc-800">{thumbs[f.id] && <img src={thumbs[f.id]} alt="" className="w-full h-full object-cover" />}</div>
              <div className="text-[10px] font-bold py-1 truncate px-1">{f.name}</div>
            </button>
          ))}
        </div>
      </Section>
      <Section title="Strength">
        <Slider label="Filter strength" value={t.filterAmount} min={0} max={100} onChange={(v) => ctl.updateLayer(t.id, { filterAmount: v }, `${t.id}:famt`)} reset={100} unit="%" />
        <p className="text-[11px] text-zinc-500">A filter replaces the one before it. Your own adjustments (Adjust tab) are added on top.</p>
      </Section>
    </>
  );
};

// ---------------------------------------------------------------- Crop & transform
const CROPS: Array<[string, number | null]> = [['Original', null], ['1:1', 1], ['4:5', 4 / 5], ['5:4', 5 / 4], ['9:16', 9 / 16], ['16:9', 16 / 9], ['4:3', 4 / 3], ['3:4', 3 / 4]];

export const CropPanel: React.FC<{ ctl: StudioCtl }> = ({ ctl }) => {
  const t = mediaTarget(ctl);
  const asset = t ? ctl.assets.get(t.assetId) : undefined;
  if (!t || !asset) return <NeedMedia />;
  const refit = (patch: Partial<MediaLayer>, key?: string) => ctl.update((p) => ({ ...p, layers: p.layers.map((l) => (l.id === t.id && l.type === 'media' ? fitLayer({ ...l, ...patch }, asset, p, l.fit) : l)) }), key);
  const ratio = (r: number | null) => {
    if (r === null) return refit({ crop: { x: 0, y: 0, w: 1, h: 1 } });
    const ra = asset.width / asset.height;
    refit({ crop: ra > r ? { w: r / ra, h: 1, x: (1 - r / ra) / 2, y: 0 } : { w: 1, h: ra / r, x: 0, y: (1 - ra / r) / 2 } });
  };
  const c = t.crop;
  const setCrop = (patch: Partial<MediaLayer['crop']>) => {
    const n = { ...c, ...patch };
    n.w = Math.max(0.05, Math.min(1, n.w)); n.h = Math.max(0.05, Math.min(1, n.h));
    n.x = Math.max(0, Math.min(1 - n.w, n.x)); n.y = Math.max(0, Math.min(1 - n.h, n.y));
    refit({ crop: n }, `${t.id}:crop`);
  };
  const base = Math.min(ASPECTS[ctl.project.aspect].w / (asset.width * c.w), ASPECTS[ctl.project.aspect].h / (asset.height * c.h));
  return (
    <>
      <Section title="Crop to a shape">
        <Chips options={CROPS.map(([label]) => ({ id: label, label }))} value="" onChange={(id) => ratio(CROPS.find(([l]) => l === id)![1])} />
      </Section>
      <Section title="Free crop">
        <Slider label="Left" value={Math.round(c.x * 100)} min={0} max={95} onChange={(v) => setCrop({ x: v / 100 })} reset={0} unit="%" />
        <Slider label="Top" value={Math.round(c.y * 100)} min={0} max={95} onChange={(v) => setCrop({ y: v / 100 })} reset={0} unit="%" />
        <Slider label="Width" value={Math.round(c.w * 100)} min={5} max={100} onChange={(v) => setCrop({ w: v / 100 })} reset={100} unit="%" />
        <Slider label="Height" value={Math.round(c.h * 100)} min={5} max={100} onChange={(v) => setCrop({ h: v / 100 })} reset={100} unit="%" />
      </Section>
      <Section title="Rotate & flip">
        <div className="flex gap-2">
          <Btn className="flex-1" onClick={() => ctl.updateLayer(t.id, { rotation: ((t.rotation + 90 + 180) % 360) - 180 })}><RotateCw className="w-4 h-4" />90°</Btn>
          <Btn className="flex-1" onClick={() => ctl.updateLayer(t.id, { flipX: !t.flipX })} aria-pressed={t.flipX}><FlipHorizontal2 className="w-4 h-4" />Flip</Btn>
          <Btn className="flex-1" onClick={() => ctl.updateLayer(t.id, { flipY: !t.flipY })} aria-pressed={t.flipY}><FlipVertical2 className="w-4 h-4" />Flip</Btn>
        </div>
        <Slider label="Straighten / rotate" value={Math.round(t.rotation * 10) / 10} min={-180} max={180} step={0.5} onChange={(v) => ctl.updateLayer(t.id, { rotation: v }, `${t.id}:rot`)} reset={0} unit="°" />
      </Section>
      <Section title="Size and position">
        <div className="flex gap-2">
          <Btn className="flex-1" onClick={() => ctl.update((p) => ({ ...p, layers: p.layers.map((l) => (l.id === t.id && l.type === 'media' ? fitLayer(l, asset, p, 'contain') : l)) }))}>Fit</Btn>
          <Btn className="flex-1" onClick={() => ctl.update((p) => ({ ...p, layers: p.layers.map((l) => (l.id === t.id && l.type === 'media' ? fitLayer(l, asset, p, 'cover') : l)) }))}>Fill</Btn>
          <Btn className="flex-1" onClick={() => ctl.updateLayer(t.id, { x: ASPECTS[ctl.project.aspect].w / 2, y: ASPECTS[ctl.project.aspect].h / 2 })}>Centre</Btn>
        </div>
        <Slider label="Zoom" value={Math.round((t.scale / base) * 100)} min={10} max={500} onChange={(v) => ctl.updateLayer(t.id, { scale: (v / 100) * base }, `${t.id}:zoom`)} reset={100} unit="%" />
        <Slider label="Rounded corners" value={t.radius} min={0} max={300} onChange={(v) => ctl.updateLayer(t.id, { radius: v }, `${t.id}:radius`)} reset={0} unit="px" />
      </Section>
    </>
  );
};

// ---------------------------------------------------------------- Templates
export const TemplatesPanel: React.FC<{ ctl: StudioCtl }> = ({ ctl }) => {
  const images = ctl.assetList.filter((a) => a.kind === 'image');
  return (
    <Section title="Start from a template">
      <p className="text-[11px] text-zinc-400">A template builds a real project you can change layer by layer (undo brings your old one back). Frames are filled with the photos you imported.</p>
      <div className="grid grid-cols-2 gap-2">
        {TEMPLATES.map((t) => (
          <button key={t.id} onClick={() => { ctl.replaceProject(applyTemplate(t, images)); if (t.needsImages > images.length) ctl.notify(`This template uses ${t.needsImages} photo${t.needsImages > 1 ? 's' : ''}: import them in Media and apply it again.`, 'info'); }} data-testid={`tpl-${t.id}`} className="rounded-xl bg-zinc-900 border border-zinc-800 hover:border-fuchsia-400 p-2 text-left">
            <div className="text-2xl">{t.emoji}</div>
            <div className="text-[12px] font-black">{t.name}</div>
            <div className="text-[10px] text-zinc-400">{t.hint} · {t.aspect}{t.needsImages ? ` · ${t.needsImages} photo${t.needsImages > 1 ? 's' : ''}` : ''}</div>
          </button>
        ))}
      </div>
    </Section>
  );
};

// ---------------------------------------------------------------- Layers
const LAYER_NAMES: Record<string, string> = { media: 'Picture / clip', text: 'Text', sticker: 'Sticker', draw: 'Drawing', audio: 'Sound', captions: 'Captions' };

export const LayersPanel: React.FC<{ ctl: StudioCtl }> = ({ ctl }) => {
  const list = [...ctl.project.layers].reverse();
  const [renaming, setRenaming] = useState<string | null>(null);
  if (list.length === 0) return <Empty>No layers yet. Everything you add (pictures, text, stickers, drawings, sound) shows up here.</Empty>;
  return (
    <div className="p-2 space-y-1.5" data-testid="studio-layers">
      {list.map((l) => (
        <div key={l.id} onClick={() => ctl.select(l.id)} className={`rounded-xl border px-2 py-1.5 flex items-center gap-1.5 text-[11px] cursor-pointer ${ctl.selectedId === l.id ? 'border-fuchsia-400 bg-fuchsia-500/10' : 'border-zinc-800 bg-zinc-900 hover:border-zinc-600'}`}>
          <span className="w-5 text-center shrink-0 text-zinc-400">{l.type === 'text' ? 'T' : l.type === 'sticker' ? '★' : l.type === 'draw' ? '✎' : l.type === 'audio' ? '♪' : l.type === 'captions' ? 'CC' : '▣'}</span>
          {renaming === l.id ? (
            <input autoFocus defaultValue={l.name} onClick={(e) => e.stopPropagation()} onBlur={(e) => { ctl.updateLayer(l.id, { name: e.target.value.slice(0, 40) || l.name }); setRenaming(null); }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} className="flex-1 min-w-0 bg-zinc-800 rounded px-1 text-white" />
          ) : (
            <span className="flex-1 min-w-0 truncate font-semibold" onDoubleClick={() => setRenaming(l.id)} title="Double-click to rename">{l.type === 'text' ? l.text.split('\n')[0] || LAYER_NAMES.text : l.name || LAYER_NAMES[l.type]}</span>
          )}
          <button aria-label={l.hidden ? 'Show' : 'Hide'} onClick={(e) => { e.stopPropagation(); ctl.updateLayer(l.id, { hidden: !l.hidden }); }} className="w-6 h-6 flex items-center justify-center text-zinc-400 hover:text-white">{l.hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}</button>
          <button aria-label={l.locked ? 'Unlock' : 'Lock'} onClick={(e) => { e.stopPropagation(); ctl.updateLayer(l.id, { locked: !l.locked }); }} className="w-6 h-6 flex items-center justify-center text-zinc-400 hover:text-white">{l.locked ? <Lock className="w-3.5 h-3.5" /> : <LockOpen className="w-3.5 h-3.5" />}</button>
          <button aria-label="Bring forward" onClick={(e) => { e.stopPropagation(); ctl.moveLayer(l.id, 'up'); }} className="w-6 h-6 flex items-center justify-center text-zinc-400 hover:text-white"><ChevronUp className="w-4 h-4" /></button>
          <button aria-label="Send back" onClick={(e) => { e.stopPropagation(); ctl.moveLayer(l.id, 'down'); }} className="w-6 h-6 flex items-center justify-center text-zinc-400 hover:text-white"><ChevronDown className="w-4 h-4" /></button>
          <button aria-label="Duplicate" onClick={(e) => { e.stopPropagation(); ctl.duplicateLayer(l.id); }} className="w-6 h-6 flex items-center justify-center text-zinc-400 hover:text-white"><Copy className="w-3.5 h-3.5" /></button>
          <button aria-label="Delete" onClick={(e) => { e.stopPropagation(); ctl.removeLayer(l.id); }} className="w-6 h-6 flex items-center justify-center text-rose-300 hover:text-rose-200"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      ))}
      <div className="flex gap-2 pt-1">
        <Btn className="flex-1 !text-[11px]" onClick={() => ctl.selected && ctl.moveLayer(ctl.selected.id, 'front')} disabled={!ctl.selected}>To front</Btn>
        <Btn className="flex-1 !text-[11px]" onClick={() => ctl.selected && ctl.moveLayer(ctl.selected.id, 'back')} disabled={!ctl.selected}>To back</Btn>
      </div>
    </div>
  );
};

export const useMemoList = <T,>(v: T[]): T[] => useMemo(() => v, [v]);
export type { Layer, Project, Asset };
export { Wand2 };
