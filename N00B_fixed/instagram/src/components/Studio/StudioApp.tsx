import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Captions, Crop, Download, Frame, ImagePlus, Keyboard, Layers, LayoutTemplate, Music, Palette, Pencil, Redo2, SlidersHorizontal, Smile, Sparkles, SquarePen, Type, Undo2, X } from 'lucide-react';
import {
  ASPECTS, Aspect, Asset, Layer, MediaLayer, Project, Stroke, clipLength, emptyProject, fitLayer, mainClips, newAudioLayer, newMediaLayer, newStickerLayer, newTextLayer, normalizeMain, projectDuration, uid
} from './types';
import { Player } from './player';
import { useHistory } from './history';
import { ImportError, importFile, releaseAsset } from './assets';
import { loadFonts } from './render';
import { releaseSharedGL } from './gl';
import { Stage } from './Stage';
import { Timeline } from './Timeline';
import { ExportDialog } from './ExportDialog';
import { AdjustPanel, CanvasPanel, CropPanel, FiltersPanel, LayersPanel, TemplatesPanel } from './panels';
import { MediaPanel } from './MediaPool';
import { ColorPanel } from './ColorPanel';
import { waveform } from './assets';
import { AudioPanel, CaptionsPanel, DrawPanel, PropsPanel, StickersPanel, TextPanel } from './panels2';

// NOOB Studio: the shell. It owns the project (with undo / redo), the imported files and the player, and gives every panel one controller object (StudioCtl) to work through.
export type ToolId = 'media' | 'canvas' | 'adjust' | 'color' | 'filters' | 'crop' | 'text' | 'stickers' | 'draw' | 'audio' | 'captions' | 'templates' | 'layers' | 'props';
export interface Brush { kind: Stroke['kind'] | 'eraser'; color: string; size: number; opacity: number }
export type Target = 'post' | 'story' | 'reel';

export interface StudioCtl {
  project: Project;
  assets: Map<string, Asset>;
  assetList: Asset[];
  assetVersion: number;
  player: Player;
  update: (fn: (p: Project) => Project, key?: string) => void;
  updateLayer: (id: string, patch: Record<string, unknown>, key?: string) => void;
  replaceProject: (p: Project) => void;
  selectedId: string | null;
  selected: Layer | null;
  select: (id: string | null) => void;
  tool: ToolId;
  setTool: (t: ToolId) => void;
  brush: Brush;
  setBrush: (b: Brush) => void;
  time: number;
  duration: number;
  playing: boolean;
  onPlayheadTick: (t: number) => void;
  exporting: boolean;
  setExporting: (v: boolean) => void;
  split: () => void;
  moveMain: (id: string, index: number) => void;
  duplicateLayer: (id: string) => void;
  removeLayer: (id: string) => void;
  moveLayer: (id: string, dir: 'up' | 'down' | 'front' | 'back') => void;
  addFiles: (files: File[], as?: 'audio') => Promise<Asset[]>;
  removeAsset: (id: string) => void;
  placeAsset: (a: Asset, as: 'main' | 'overlay' | 'audio', at?: number) => void;
  dropAsset: (id: string, lane: 'main' | 'overlay' | 'audio', time: number) => void;
  addText: (text: string, patch: Record<string, unknown>) => void;
  addSticker: (kind: 'emoji' | 'shape', content: string) => void;
  addImageSticker: (file: File) => Promise<void>;
  addVoice: (file: File, at: number) => Promise<void>;
  setMode: (m: 'photo' | 'video') => void;
  setAspect: (a: Aspect) => void;
  busy: string;
  notify: (msg: string, tone?: 'info' | 'error') => void;
  onUse?: (file: File, target: Target) => void;
}

export interface StudioProps {
  initialFiles?: File[];
  onClose: () => void;
  /** hand a finished file to the Post / Story / Reel screens (they open with it; nothing is published) */
  onUse?: (file: File, target: Target) => void;
}

const TOOLS: Array<{ id: ToolId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'media', label: 'Media', icon: ImagePlus },
  { id: 'canvas', label: 'Canvas', icon: Frame },
  { id: 'adjust', label: 'Adjust', icon: SlidersHorizontal },
  { id: 'color', label: 'Color', icon: Palette },
  { id: 'filters', label: 'Filters', icon: Sparkles },
  { id: 'crop', label: 'Crop', icon: Crop },
  { id: 'text', label: 'Text', icon: Type },
  { id: 'stickers', label: 'Stickers', icon: Smile },
  { id: 'draw', label: 'Draw', icon: Pencil },
  { id: 'audio', label: 'Sound', icon: Music },
  { id: 'captions', label: 'Captions', icon: Captions },
  { id: 'templates', label: 'Templates', icon: LayoutTemplate },
  { id: 'layers', label: 'Layers', icon: Layers },
  { id: 'props', label: 'Edit', icon: SquarePen }
];

const SHORTCUTS: Array<[string, string]> = [
  ['Ctrl + Z / Ctrl + Shift + Z', 'Undo / redo'], ['Space', 'Play / pause (video)'], ['S', 'Split at the playhead'], ['Delete', 'Delete the selected thing'],
  ['Ctrl + D', 'Duplicate'], ['Arrow keys', 'Nudge 1 px (Shift: 10 px)'], ['Esc', 'Deselect'], ['Ctrl + E', 'Export'], ['?', 'This list']
];

function useMedia(q: string): boolean {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return m;
}

/** Video clips are as long as their trimmed, sped-up part; the main track is laid out one clip after another. Run after every change. */
function finalize(p: Project, assets: Map<string, Asset>): Project {
  let changed = false;
  const layers = p.layers.map((l) => {
    if (l.type === 'media' && assets.get(l.assetId)?.kind === 'video') {
      const d = clipLength(l);
      if (Math.abs(d - l.duration) > 1e-6) { changed = true; return { ...l, duration: d }; }
    }
    return l;
  });
  const q = changed ? { ...p, layers } : p;
  const n = normalizeMain(q);
  return n.layers.every((l, i) => l === q.layers[i] || l.start === q.layers[i].start) ? q : n;
}

/** Put a main-track clip at a position in the story (0 = first): the clips are given their order and normalizeMain lays them out one after another. */
function reorderMain(p: Project, id: string, index: number): Project {
  const clips = mainClips(p);
  const me = clips.find((c) => c.id === id);
  if (!me) return p;
  const order = clips.filter((c) => c.id !== id);
  order.splice(Math.max(0, Math.min(order.length, index)), 0, me);
  const pos = new Map(order.map((c, i) => [c.id, i]));
  return { ...p, layers: p.layers.map((l) => (l.type === 'media' && l.track === 'main' ? { ...l, start: pos.get(l.id) ?? l.start } : l)) };
}

function closestAspect(w: number, h: number): Aspect {
  const r = w / h;
  let best: Aspect = '4:5', diff = Infinity;
  for (const k of Object.keys(ASPECTS) as Aspect[]) { const d = Math.abs(Math.log(ASPECTS[k].w / ASPECTS[k].h / r)); if (d < diff) { diff = d; best = k; } }
  return best;
}

export const StudioApp: React.FC<StudioProps> = ({ initialFiles, onClose, onUse }) => {
  const [initial] = useState(() => emptyProject('4:5'));
  const hist = useHistory(initial);
  const project = hist.project;
  const assetsRef = useRef(new Map<string, Asset>());
  const hiddenAssets = useRef(new Set<string>());
  const [assetVersion, setAssetVersion] = useState(0);
  const bump = useCallback(() => setAssetVersion((v) => v + 1), []);
  const [player] = useState(() => new Player(initial, assetsRef.current));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setToolState] = useState<ToolId>('media');
  const [panelOpen, setPanelOpen] = useState(true);
  const [brush, setBrush] = useState<Brush>({ kind: 'pen', color: '#ff4d6d', size: 14, opacity: 1 });
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState<{ msg: string; tone: 'info' | 'error' } | null>(null);
  const xl = useMedia('(min-width: 1280px)');

  const projectRef = useRef(project);
  projectRef.current = project;

  // the player follows the project; done while rendering so the stage's first draw already sees the new project
  const seen = useRef<{ p: Project; v: number } | null>(null);
  if (!seen.current || seen.current.p !== project || seen.current.v !== assetVersion) {
    seen.current = { p: project, v: assetVersion };
    player.setProject(project, assetsRef.current);
  }

  const duration = projectDuration(project);
  const selected = useMemo(() => project.layers.find((l) => l.id === selectedId) || null, [project, selectedId]);

  const notify = useCallback((msg: string, tone: 'info' | 'error' = 'info') => setToast({ msg, tone }), []);
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), toast.tone === 'error' ? 8000 : 4500);
    return () => window.clearTimeout(id);
  }, [toast]);

  const update = useCallback((fn: (p: Project) => Project, key?: string) => hist.update((p) => finalize(fn(p), assetsRef.current), key), [hist.update]);
  const updateLayer = useCallback((id: string, patch: Record<string, unknown>, key?: string) => {
    update((p) => ({ ...p, layers: p.layers.map((l) => (l.id === id ? ({ ...l, ...patch } as Layer) : l)) }), key);
  }, [update]);

  const setTool = useCallback((t: ToolId) => { setToolState(t); setPanelOpen(true); }, []);
  const select = useCallback((id: string | null) => {
    setSelectedId(id);
    const l = id ? projectRef.current.layers.find((x) => x.id === id) : null;
    if (!l) return;
    setToolState((t) => {
      if (t === 'layers' || t === 'props') return t;
      if (l.type === 'text') return 'text';
      if (l.type === 'sticker') return 'stickers';
      if (l.type === 'audio') return 'audio';
      if (l.type === 'media' && ['text', 'stickers', 'draw', 'audio', 'captions'].includes(t)) return 'props';
      return t;
    });
  }, []);

  // ---- playing
  const lastTick = useRef(0);
  const onPlayheadTick = useCallback((t: number) => {
    const now = performance.now();
    if (!player.playing || now - lastTick.current > 90) { lastTick.current = now; setTime(t); }
  }, [player]);
  useEffect(() => { player.onState = () => setPlaying(player.playing); }, [player]);
  useEffect(() => { if (player.t > duration) player.seek(duration); }, [duration, player]);

  // fonts used by text load before the next draw
  const fontsKey = project.layers.filter((l) => l.type === 'text' || l.type === 'captions').map((l) => (l as { font: string }).font).join('|');
  useEffect(() => { void loadFonts(projectRef.current).then(bump); }, [fontsKey, bump]);

  // ---- files
  const assetList = useMemo(() => [...assetsRef.current.values()].filter((a) => !hiddenAssets.current.has(a.id)), [assetVersion]);

  const place = useCallback((a: Asset, as: 'main' | 'overlay' | 'audio', p0: Project, at?: number): Project => {
    let p = p0;
    if (as === 'audio') {
      if (a.duration <= 0) return p;
      const start = at ?? (p.mode === 'video' ? player.t : 0);
      const contentEnd = p.layers.reduce((m, l) => (l.type === 'audio' || l.type === 'captions' ? m : Math.max(m, l.start + l.duration)), 0);
      const layer = newAudioLayer(a, start, 'music');
      if (contentEnd > start + 0.5) layer.duration = Math.min(a.duration, contentEnd - start);
      return { ...p, mode: 'video', layers: [...p.layers, layer] };
    }
    if (a.kind === 'audio') return p;
    const firstEver = p.layers.every((l) => l.type !== 'media');
    if (a.kind === 'video' && p.mode === 'photo') p = { ...p, mode: 'video' };
    if (firstEver && p.layers.length === 0) p = { ...p, aspect: closestAspect(a.width, a.height) };
    const hasMain = p.layers.some((l) => l.type === 'media' && l.track === 'main');
    const track: 'main' | 'overlay' = as === 'main' && (p.mode === 'video' || !hasMain) ? 'main' : 'overlay';
    const start = track === 'main' ? Math.max(0, ...mainClips(p).map((c) => c.start + c.duration)) : at ?? (p.mode === 'video' ? player.t : 0);
    const layer = newMediaLayer(a, p, track, start);
    const q = { ...p, layers: [...p.layers, layer] };
    // dropped at a moment of the story: it goes in front of the clips that begin after that moment
    if (track === 'main' && at !== undefined) return reorderMain(q, layer.id, mainClips(p).filter((c) => c.start + c.duration / 2 < at).length);
    return q;
  }, [player]);

  const placeAsset = useCallback((a: Asset, as: 'main' | 'overlay' | 'audio', at?: number) => {
    if (as === 'audio' && a.duration <= 0) { notify('That file has no sound to use.', 'error'); return; }
    const before = projectRef.current;
    if (as === 'audio' && before.mode === 'photo') notify('Sound needs a timeline, so the project switched to Video.', 'info');
    if (a.kind === 'video' && as !== 'audio' && before.mode === 'photo') notify('A video needs a timeline, so the project switched to Video.', 'info');
    const id = uid();
    update((p) => {
      const q = place(a, as, p, at);
      const added = q.layers.find((l) => !p.layers.some((x) => x.id === l.id));
      if (added && q !== p) (added as { id: string }).id = id;
      return q;
    });
    setSelectedId(id);
    if (as !== 'audio') setToolState((t) => (t === 'media' ? 'adjust' : t));
  }, [notify, place, update]);

  const addFiles = useCallback(async (files: File[], as?: 'audio'): Promise<Asset[]> => {
    const list = files.slice(0, 40);
    if (files.length > 40) notify('Only the first 40 files were added at once.', 'info');
    const added: Asset[] = [];
    for (let i = 0; i < list.length; i++) {
      setBusy(`Reading ${i + 1} of ${list.length}: ${list[i].name.slice(0, 30)}…`);
      try {
        const a = await importFile(list[i]);
        assetsRef.current.set(a.id, a);
        added.push(a);
        // the loudness outline of a video's own sound, worked out in the background (the timeline draws it under the clip)
        if (a.kind === 'video' && list[i].size < 60 * 1024 * 1024) void waveform(list[i]).then((peaks) => { a.peaks = peaks; bump(); }).catch(() => undefined);
      } catch (e) {
        notify(e instanceof ImportError ? e.message : `"${list[i].name.slice(0, 40)}" could not be opened. It may be damaged or in a format this browser cannot read.`, 'error');
      }
    }
    setBusy('');
    bump();
    if (as === 'audio') { added.filter((a) => a.kind === 'audio').forEach((a) => placeAsset(a, 'audio')); return added; }
    const cur = projectRef.current;
    const visual = added.filter((a) => a.kind !== 'audio');
    if (cur.layers.length === 0 && visual.length > 0) {
      // an empty project starts with what was just added: every file one after another for a video, the first one for a picture
      const anyVideo = visual.some((a) => a.kind === 'video');
      if (anyVideo || cur.mode === 'video') visual.forEach((a) => placeAsset(a, 'main'));
      else placeAsset(visual[0], 'main');
    }
    if (added.length > 0) notify(`${added.length} file${added.length === 1 ? '' : 's'} added. They stay on this device.`, 'info');
    return added;
  }, [bump, notify, placeAsset]);

  const removeAsset = useCallback((id: string) => {
    const used = projectRef.current.layers.some((l) => (l.type === 'media' || l.type === 'audio') && l.assetId === id) || projectRef.current.layers.some((l) => l.type === 'sticker' && l.kind === 'image' && l.content === id);
    if (used) { notify('That file is used in your project. Delete it from the timeline or layers first.', 'error'); return; }
    hiddenAssets.current.add(id);
    bump();
  }, [bump, notify]);

  const dropAsset = useCallback((id: string, lane: 'main' | 'overlay' | 'audio', time: number) => {
    const a = assetsRef.current.get(id);
    if (!a) return;
    if (lane === 'audio' && a.kind === 'image') { notify('A picture has no sound. Drop it on a video track.', 'error'); return; }
    if (lane !== 'audio' && a.kind === 'audio') { notify('That is a sound. Drop it on a sound track.', 'error'); return; }
    placeAsset(a, lane, Math.max(0, time));
  }, [notify, placeAsset]);

  const mountedFiles = useRef(false);
  useEffect(() => {
    if (mountedFiles.current) return;
    mountedFiles.current = true;
    if (initialFiles && initialFiles.length > 0) void addFiles(initialFiles);
  }, [initialFiles, addFiles]);

  // ---- layers
  const addAt = useCallback((layer: Layer) => { update((p) => ({ ...p, layers: [...p.layers, layer] })); setSelectedId(layer.id); }, [update]);
  const addText = useCallback((text: string, patch: Record<string, unknown>) => {
    const p = projectRef.current;
    addAt({ ...newTextLayer(p, text, p.mode === 'video' ? player.t : 0), ...patch } as Layer);
    setToolState('text');
  }, [addAt, player]);
  const addSticker = useCallback((kind: 'emoji' | 'shape', content: string) => {
    const p = projectRef.current;
    addAt(newStickerLayer(p, kind, content, p.mode === 'video' ? player.t : 0));
  }, [addAt, player]);
  const addImageSticker = useCallback(async (file: File) => {
    const [a] = await addFiles([file], undefined).catch(() => [] as Asset[]);
    if (!a) return;
    if (a.kind !== 'image') { notify('Pick a picture file for a sticker.', 'error'); return; }
    const p = projectRef.current;
    const s = newStickerLayer(p, 'image', a.id, p.mode === 'video' ? player.t : 0);
    s.name = a.name;
    // an automatic project start with this picture would also have added it as the main picture; a sticker goes on top of whatever is there
    update((q) => ({ ...q, layers: [...q.layers.filter((l) => !(l.type === 'media' && l.assetId === a.id && q.layers.length === 1)), s] }));
    setSelectedId(s.id);
  }, [addFiles, notify, player, update]);
  const addVoice = useCallback(async (file: File, at: number) => {
    const [a] = await addFiles([file]);
    if (!a || a.kind !== 'audio') return;
    const l = newAudioLayer(a, Math.max(0, at), 'voice');
    update((p) => ({ ...p, mode: 'video', layers: [...p.layers, l] }));
    setSelectedId(l.id);
  }, [addFiles, update]);

  const removeLayer = useCallback((id: string) => { update((p) => ({ ...p, layers: p.layers.filter((l) => l.id !== id) })); setSelectedId((s) => (s === id ? null : s)); }, [update]);
  const duplicateLayer = useCallback((id: string) => {
    const p = projectRef.current;
    const l = p.layers.find((x) => x.id === id);
    if (!l) return;
    const copy = { ...l, id: uid(), name: l.name } as Layer;
    if (l.type === 'draw') (copy as typeof l).strokes = l.strokes.map((s) => ({ ...s, points: s.points.map((pt) => [...pt] as [number, number]) }));
    if (l.type === 'captions') (copy as typeof l).cues = l.cues.map((c) => ({ ...c, id: uid('c') }));
    if (l.type === 'media' && l.track === 'main') copy.start = l.start + l.duration + 0.001;
    else if (p.mode === 'video') copy.start = l.start + Math.min(0.5, l.duration);
    else if (l.type !== 'audio') { copy.x += 40; copy.y += 40; }
    update((q) => { const i = q.layers.findIndex((x) => x.id === id); const layers = [...q.layers]; layers.splice(i + 1, 0, copy); return { ...q, layers }; });
    setSelectedId(copy.id);
  }, [update]);
  const moveLayer = useCallback((id: string, dir: 'up' | 'down' | 'front' | 'back') => {
    update((p) => {
      const i = p.layers.findIndex((l) => l.id === id);
      if (i < 0) return p;
      const layers = [...p.layers];
      const [it] = layers.splice(i, 1);
      const j = dir === 'up' ? Math.min(layers.length, i + 1) : dir === 'down' ? Math.max(0, i - 1) : dir === 'front' ? layers.length : 0;
      layers.splice(j, 0, it);
      return { ...p, layers };
    });
  }, [update]);
  const moveMain = useCallback((id: string, index: number) => update((p) => reorderMain(p, id, index)), [update]);

  const split = useCallback(() => {
    const p = projectRef.current;
    const t = player.t;
    const target = p.layers.find((l) => l.id === selectedId) || mainClips(p).find((c) => t > c.start && t < c.start + c.duration);
    if (!target || target.type === 'captions' || t <= target.start + 0.05 || t >= target.start + target.duration - 0.05) { notify('Move the playhead inside the clip you want to cut.', 'info'); return; }
    const r = t - target.start;
    const second = { ...target, id: uid() } as Layer;
    let first: Layer = target;
    if (target.type === 'media') {
      const isVideo = assetsRef.current.get(target.assetId)?.kind === 'video';
      const m = second as MediaLayer;
      m.transition = { type: 'cut', duration: 0.5 };
      if (isVideo) {
        const cut = target.trimIn + r * target.speed;
        first = { ...target, trimOut: cut, fadeOut: 0 };
        m.trimIn = cut; m.fadeIn = 0;
      } else { first = { ...target, duration: r, fadeOut: 0 }; m.duration = target.duration - r; m.fadeIn = 0; }
      m.start = target.track === 'main' ? t : t;
    } else if (target.type === 'audio') {
      first = { ...target, duration: r, fadeOut: 0 };
      (second as typeof target).trimIn = target.trimIn + r; second.start = t; second.duration = target.duration - r; (second as typeof target).fadeIn = 0;
    } else {
      first = { ...target, duration: r };
      second.start = t; second.duration = target.duration - r;
    }
    update((q) => { const i = q.layers.findIndex((x) => x.id === target.id); const layers = [...q.layers]; layers.splice(i, 1, first, second); return { ...q, layers }; });
    setSelectedId(second.id);
  }, [notify, player, selectedId, update]);

  const replaceProject = useCallback((p: Project) => { hist.replace(finalize(p, assetsRef.current)); setSelectedId(null); player.seek(0); }, [hist.replace, player]);
  const setMode = useCallback((m: 'photo' | 'video') => update((p) => (p.mode === m ? p : { ...p, mode: m })), [update]);
  const setAspect = useCallback((a: Aspect) => update((p) => {
    if (p.aspect === a) return p;
    const o = ASPECTS[p.aspect], n = ASPECTS[a];
    const kx = n.w / o.w, ky = n.h / o.h, ks = Math.min(kx, ky);
    const np = { ...p, aspect: a };
    return {
      ...np,
      layers: p.layers.map((l): Layer => {
        if (l.type === 'media' && l.track === 'main') { const as = assetsRef.current.get(l.assetId); return as ? fitLayer(l, as, np, l.fit) : l; }
        if (l.type === 'draw') return { ...l, x: n.w / 2, y: n.h / 2, strokes: l.strokes.map((s) => ({ ...s, size: s.size * ks, points: s.points.map(([x, y]) => [x * kx, y * ky] as [number, number]) })) };
        if (l.type === 'captions') return { ...l, x: n.w / 2, y: n.h / 2 };
        if (l.type === 'audio') return l;
        return { ...l, x: l.x * kx, y: l.y * ky, scale: l.scale * ks };
      })
    };
  }), [update]);

  // ---- keyboard
  const ctl: StudioCtl = {
    project, assets: assetsRef.current, assetList, assetVersion, player, update, updateLayer, replaceProject, selectedId, selected, select, tool, setTool, brush, setBrush,
    time, duration, playing, onPlayheadTick, exporting, setExporting, split, moveMain, duplicateLayer, removeLayer, moveLayer, addFiles, removeAsset, placeAsset, dropAsset,
    addText, addSticker, addImageSticker, addVoice, setMode, setAspect, busy, notify, onUse
  };
  const ctlRef = useRef(ctl);
  ctlRef.current = ctl;
  const histRef = useRef(hist);
  histRef.current = hist;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) {
        if (!((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && el.tagName !== 'TEXTAREA' && !(el as HTMLInputElement).type?.match(/text|number/))) return;
      }
      const c = ctlRef.current;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? histRef.current.redo() : histRef.current.undo(); return; }
      if (mod && k === 'y') { e.preventDefault(); histRef.current.redo(); return; }
      if (mod && k === 'd') { e.preventDefault(); if (c.selectedId) c.duplicateLayer(c.selectedId); return; }
      if (mod && k === 'e') { e.preventDefault(); setShowExport(true); return; }
      if (mod || e.altKey) return;
      if (k === '?') { setShowKeys((v) => !v); return; }
      if (k === 'escape') { c.select(null); setShowKeys(false); return; }
      if ((k === 'delete' || k === 'backspace') && c.selectedId) { e.preventDefault(); c.removeLayer(c.selectedId); return; }
      if (k === ' ' && c.project.mode === 'video') { e.preventDefault(); c.player.playing ? c.player.pause() : c.player.play(); return; }
      if (k === 's' && c.project.mode === 'video') { c.split(); return; }
      if (k.startsWith('arrow') && c.selected && c.selected.type !== 'audio' && c.selected.type !== 'captions' && !c.selected.locked) {
        e.preventDefault();
        const d = e.shiftKey ? 10 : 1;
        const dx = k === 'arrowleft' ? -d : k === 'arrowright' ? d : 0;
        const dy = k === 'arrowup' ? -d : k === 'arrowdown' ? d : 0;
        c.updateLayer(c.selected.id, { x: c.selected.x + dx, y: c.selected.y + dy }, `${c.selected.id}:nudge`);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => { if (histRef.current.changed) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, []);

  // everything the editor holds is let go when it closes
  useEffect(() => () => {
    player.destroy();
    assetsRef.current.forEach(releaseAsset);
    assetsRef.current.clear();
    releaseSharedGL();
  }, [player]);

  const close = () => {
    if (hist.changed && !window.confirm('Close NOOB Studio? Your edits are not saved anywhere and will be lost.')) return;
    onClose();
  };

  const visibleTools = TOOLS.filter((t) => !(t.id === 'props' && xl));
  const panel = (() => {
    switch (tool) {
      case 'media': return <MediaPanel ctl={ctl} />;
      case 'canvas': return <CanvasPanel ctl={ctl} />;
      case 'adjust': return <AdjustPanel ctl={ctl} />;
      case 'color': return <ColorPanel ctl={ctl} />;
      case 'filters': return <FiltersPanel ctl={ctl} />;
      case 'crop': return <CropPanel ctl={ctl} />;
      case 'text': return <TextPanel ctl={ctl} />;
      case 'stickers': return <StickersPanel ctl={ctl} />;
      case 'draw': return <DrawPanel ctl={ctl} />;
      case 'audio': return <AudioPanel ctl={ctl} />;
      case 'captions': return <CaptionsPanel ctl={ctl} />;
      case 'templates': return <TemplatesPanel ctl={ctl} />;
      case 'layers': return <LayersPanel ctl={ctl} />;
      default: return <PropsPanel ctl={ctl} />;
    }
  })();

  return (
    <div className="studio-root force-dark fixed inset-0 z-[10000] flex flex-col bg-zinc-950 text-white select-none" data-testid="noob-studio" role="application" aria-label="NOOB Studio">
      <header className="shrink-0 flex items-center gap-1.5 px-2 py-2 border-b border-zinc-800 bg-zinc-950">
        <button onClick={close} aria-label="Close NOOB Studio" data-testid="studio-close" className="w-10 h-10 rounded-xl hover:bg-white/10 flex items-center justify-center"><X className="w-5 h-5" /></button>
        <div className="min-w-0 flex items-center gap-2">
          <span className="hidden sm:block text-[13px] font-black tracking-tight bg-gradient-to-r from-fuchsia-400 to-sky-300 bg-clip-text text-transparent">NOOB Studio</span>
          <input
            value={project.name} maxLength={60} aria-label="Project name"
            onChange={(e) => update((p) => ({ ...p, name: e.target.value }), 'name')}
            className="min-w-0 w-28 sm:w-44 bg-transparent border border-transparent hover:border-zinc-700 focus:border-fuchsia-400 rounded-lg px-2 py-1 text-[13px] font-semibold text-white outline-none"
          />
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={hist.undo} disabled={!hist.canUndo} aria-label="Undo" data-testid="studio-undo" className="w-10 h-10 rounded-xl hover:bg-white/10 disabled:opacity-30 flex items-center justify-center"><Undo2 className="w-5 h-5" /></button>
          <button onClick={hist.redo} disabled={!hist.canRedo} aria-label="Redo" data-testid="studio-redo" className="w-10 h-10 rounded-xl hover:bg-white/10 disabled:opacity-30 flex items-center justify-center"><Redo2 className="w-5 h-5" /></button>
          <button onClick={() => setShowKeys((v) => !v)} aria-label="Keyboard shortcuts" className="hidden sm:flex w-10 h-10 rounded-xl hover:bg-white/10 items-center justify-center"><Keyboard className="w-5 h-5" /></button>
          <button
            onClick={() => setShowExport(true)} disabled={project.layers.filter((l) => l.type === 'media' || l.type === 'text' || l.type === 'sticker').length === 0}
            data-testid="studio-export-open" className="h-10 px-3 rounded-xl bg-fuchsia-500 hover:bg-fuchsia-400 disabled:opacity-40 text-[13px] font-black flex items-center gap-1.5"
          ><Download className="w-4 h-4" />Export</button>
        </div>
      </header>

      <div className="studio-grid" style={{ ['--studio-panel-w' as string]: tool === 'media' ? '460px' : '320px' }}>
        <nav className="studio-nav order-4 shrink-0 flex lg:flex-col overflow-x-auto lg:overflow-y-auto border-t lg:border-t-0 lg:border-r border-zinc-800 bg-zinc-950" aria-label="Tools">
          {visibleTools.map((t) => {
            const Icon = t.icon;
            const active = tool === t.id;
            return (
              <button
                key={t.id} data-testid={`tool-${t.id}`} aria-pressed={active}
                onClick={() => (active ? setPanelOpen((o) => !o) : setTool(t.id))}
                className={`shrink-0 flex flex-col items-center justify-center gap-0.5 px-3 py-2 lg:px-1 lg:py-2.5 min-w-[62px] ${active ? 'text-fuchsia-300 bg-fuchsia-500/10' : 'text-zinc-400 hover:text-white'}`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-bold leading-none">{t.label}</span>
              </button>
            );
          })}
        </nav>

        <section className={`studio-panel order-3 shrink-0 h-[28vh] lg:h-auto overflow-y-auto border-t lg:border-t-0 lg:border-r border-zinc-800 bg-zinc-950 ${panelOpen ? '' : 'hidden lg:block'}`} data-testid="studio-panel" aria-label={`${tool} tools`}>
          {panel}
        </section>

        <main className="studio-stage order-1 relative min-h-0 min-w-0 flex flex-col flex-1">
          <Stage ctl={ctl} />
          {busy && <div className="absolute left-1/2 -translate-x-1/2 top-3 px-3 py-1.5 rounded-full bg-zinc-800 border border-zinc-700 text-[12px] font-bold z-20" role="status">{busy}</div>}
        </main>

        {project.mode === 'video' && <div className="studio-tl order-2 min-w-0"><Timeline ctl={ctl} /></div>}

        {xl && (
          <aside className="studio-props order-5 w-[290px] overflow-y-auto border-l border-zinc-800 bg-zinc-950" aria-label="Properties">
            <div className="px-3 pt-3 text-[11px] font-black uppercase tracking-wider text-zinc-500">Selected</div>
            <PropsPanel ctl={ctl} />
          </aside>
        )}
      </div>

      {toast && (
        <div className={`absolute left-1/2 -translate-x-1/2 bottom-24 lg:bottom-6 max-w-[92vw] px-4 py-2.5 rounded-2xl text-[12px] font-semibold shadow-xl z-30 ${toast.tone === 'error' ? 'bg-rose-600 text-white' : 'bg-zinc-800 border border-zinc-600 text-white'}`} role={toast.tone === 'error' ? 'alert' : 'status'} onClick={() => setToast(null)} data-testid="studio-toast">
          {toast.msg}
        </div>
      )}
      {showKeys && (
        <div className="absolute inset-0 z-40 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowKeys(false)}>
          <div className="w-full max-w-sm rounded-3xl bg-zinc-900 border border-zinc-700 p-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-[14px] font-black mb-2">Keyboard shortcuts</h2>
            {SHORTCUTS.map(([k, d]) => <div key={k} className="flex justify-between gap-3 py-1 text-[12px] border-b border-zinc-800"><kbd className="font-mono text-fuchsia-300">{k}</kbd><span className="text-zinc-300 text-right">{d}</span></div>)}
          </div>
        </div>
      )}
      {showExport && <ExportDialog ctl={ctl} onClose={() => setShowExport(false)} />}
    </div>
  );
};

export default StudioApp;
