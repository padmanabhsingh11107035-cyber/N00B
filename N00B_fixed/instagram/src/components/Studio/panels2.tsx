import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlignCenterHorizontal, AlignCenterVertical, Download, FlipHorizontal2, FlipVertical2, Mic, Plus, Square, Trash2, Undo2, Upload } from 'lucide-react';
import { ASPECTS, Anim, AudioLayer, CaptionLayer, Cue, DrawLayer, Layer, MediaLayer, StickerLayer, TextLayer, TransitionType, clipLength, newCaptionLayer, uid } from './types';
import { SHAPES, SYSTEM_FONTS } from './render';
import { EMOJI_CATEGORIES } from './emoji';
import { fmtTime } from './assets';
import { VoiceRecorder } from './player';
import { Btn, Chips, ColorInput, Empty, Section, Slider } from './ui';
import type { StudioCtl } from './StudioApp';

const ANIMS: Array<{ id: Anim; label: string }> = [
  { id: 'none', label: 'None' }, { id: 'fade', label: 'Fade' }, { id: 'slide-up', label: 'Slide up' }, { id: 'slide-down', label: 'Slide down' },
  { id: 'slide-left', label: 'Slide left' }, { id: 'slide-right', label: 'Slide right' }, { id: 'zoom', label: 'Zoom' }, { id: 'pop', label: 'Pop' },
  { id: 'bounce', label: 'Bounce' }, { id: 'rotate', label: 'Spin' }, { id: 'shake', label: 'Shake' }, { id: 'typewriter', label: 'Typewriter' }
];

/** The things every layer has: how see-through it is, where it is, when it shows, how it comes and goes. */
export const LayerBasics: React.FC<{ ctl: StudioCtl; l: Layer }> = ({ ctl, l }) => {
  const set = (patch: Record<string, unknown>, key?: string) => ctl.updateLayer(l.id, patch, key || `${l.id}:${Object.keys(patch)[0]}`);
  const size = ASPECTS[ctl.project.aspect];
  const video = ctl.project.mode === 'video';
  const anims = ANIMS.filter((a) => a.id !== 'typewriter' || l.type === 'text');
  const isMain = l.type === 'media' && l.track === 'main';
  return (
    <>
      <Section title="Look">
        <Slider label="Opacity" value={Math.round(l.opacity * 100)} min={0} max={100} onChange={(v) => set({ opacity: v / 100 })} reset={100} unit="%" />
        {l.type !== 'audio' && l.type !== 'captions' && (
          <>
            <Slider label="Rotation" value={Math.round(l.rotation)} min={-180} max={180} onChange={(v) => set({ rotation: v })} reset={0} unit="°" />
            <div className="flex gap-2">
              <Btn className="flex-1" onClick={() => set({ x: size.w / 2 })} title="Centre across"><AlignCenterVertical className="w-4 h-4" />Centre</Btn>
              <Btn className="flex-1" onClick={() => set({ y: size.h / 2 })} title="Centre up and down"><AlignCenterHorizontal className="w-4 h-4" />Middle</Btn>
              <Btn aria-pressed={l.flipX} onClick={() => set({ flipX: !l.flipX })} aria-label="Flip left-right"><FlipHorizontal2 className="w-4 h-4" /></Btn>
              <Btn aria-pressed={l.flipY} onClick={() => set({ flipY: !l.flipY })} aria-label="Flip up-down"><FlipVertical2 className="w-4 h-4" /></Btn>
            </div>
          </>
        )}
      </Section>
      {video && l.type !== 'captions' && (
        <Section title="When it shows">
          {!isMain && <Slider label="Starts at" value={+l.start.toFixed(2)} min={0} max={Math.max(30, Math.ceil(ctl.duration + 10))} step={0.1} onChange={(v) => set({ start: v })} unit="s" />}
          {!(l.type === 'media' && ctl.assets.get(l.assetId)?.kind === 'video') && l.type !== 'audio' && (
            <Slider label="Stays for" value={+l.duration.toFixed(2)} min={0.2} max={Math.max(30, Math.ceil(ctl.duration + 10))} step={0.1} onChange={(v) => set({ duration: v })} unit="s" />
          )}
        </Section>
      )}
      {l.type !== 'audio' && l.type !== 'captions' && (
        <Section title="Animation">
          <div className="text-[11px] font-semibold text-zinc-300">Comes in</div>
          <Chips options={anims.map((a) => ({ id: a.id, label: a.label }))} value={l.animIn} onChange={(v) => set({ animIn: v })} />
          <div className="text-[11px] font-semibold text-zinc-300">Goes out</div>
          <Chips options={anims.filter((a) => a.id !== 'typewriter').map((a) => ({ id: a.id, label: a.label }))} value={l.animOut} onChange={(v) => set({ animOut: v })} />
          <Slider label="Speed of the move" value={+l.animDur.toFixed(2)} min={0.1} max={2} step={0.05} onChange={(v) => set({ animDur: v })} reset={0.5} unit="s" />
          {!video && <p className="text-[10px] text-zinc-500">Animations play in videos; a picture is saved without them.</p>}
        </Section>
      )}
    </>
  );
};

// ---------------------------------------------------------------- Text
export const TextPanel: React.FC<{ ctl: StudioCtl }> = ({ ctl }) => {
  const l = ctl.selected?.type === 'text' ? ctl.selected : null;
  const set = (patch: Partial<TextLayer>, key?: string) => l && ctl.updateLayer(l.id, patch as Record<string, unknown>, key || `${l.id}:${Object.keys(patch)[0]}`);
  return (
    <>
      <Section title="Add text">
        <div className="grid grid-cols-2 gap-2">
          <Btn tone="primary" onClick={() => ctl.addText('Your text', {})} data-testid="studio-add-text"><Plus className="w-4 h-4" />Text</Btn>
          <Btn onClick={() => ctl.addText('Title', { size: 150, font: 'Impact', stroke: 6, shadow: 0 })}>Big title</Btn>
          <Btn onClick={() => ctl.addText('A small caption', { size: 56, bold: false, bg: '#000000', bgOpacity: 0.55 })}>Caption</Btn>
          <Btn onClick={() => ctl.addText('Handwritten', { size: 120, font: 'Caveat', shadow: 0, stroke: 4 })}>Handwritten</Btn>
        </div>
      </Section>
      {!l && <Empty>Tap a text on the picture to change it, or add one above.</Empty>}
      {l && (
        <>
          <Section title="Words">
            <textarea value={l.text} onChange={(e) => set({ text: e.target.value.slice(0, 600) }, `${l.id}:text`)} rows={3} aria-label="Text" data-testid="studio-text-input" className="w-full bg-zinc-900 border border-zinc-700 rounded-xl p-2 text-[13px] text-white resize-none" />
            <Chips options={Object.keys(SYSTEM_FONTS).map((f) => ({ id: f, label: f }))} value={l.font} onChange={(f) => set({ font: f })} />
            <div className="flex gap-1.5">
              <Btn aria-pressed={l.bold} className={l.bold ? '!bg-fuchsia-500' : ''} onClick={() => set({ bold: !l.bold })}><b>B</b></Btn>
              <Btn aria-pressed={l.italic} className={l.italic ? '!bg-fuchsia-500' : ''} onClick={() => set({ italic: !l.italic })}><i>I</i></Btn>
              <Btn aria-pressed={l.underline} className={l.underline ? '!bg-fuchsia-500' : ''} onClick={() => set({ underline: !l.underline })}><u>U</u></Btn>
              {(['left', 'center', 'right'] as const).map((a) => <Btn key={a} className={`flex-1 ${l.align === a ? '!bg-fuchsia-500' : ''}`} onClick={() => set({ align: a })}>{a === 'left' ? '⇤' : a === 'center' ? '↔' : '⇥'}</Btn>)}
            </div>
            <Slider label="Size" value={Math.round(l.size)} min={16} max={400} onChange={(v) => set({ size: v })} reset={96} />
            <ColorInput label="Colour" value={l.color} onChange={(c) => set({ color: c }, `${l.id}:color`)} />
          </Section>
          <Section title="Style">
            <Slider label="Letter spacing" value={l.letter} min={-5} max={40} onChange={(v) => set({ letter: v })} reset={0} />
            <Slider label="Line height" value={l.lineHeight} min={0.8} max={2} step={0.05} onChange={(v) => set({ lineHeight: v })} reset={1.15} />
            <Slider label="Outline" value={l.stroke} min={0} max={30} onChange={(v) => set({ stroke: v })} reset={0} />
            {l.stroke > 0 && <ColorInput label="Outline colour" value={l.strokeColor} onChange={(c) => set({ strokeColor: c }, `${l.id}:sc`)} />}
            <Slider label="Shadow" value={l.shadow} min={0} max={60} onChange={(v) => set({ shadow: v })} reset={12} />
            <Slider label="Glow" value={l.glow} min={0} max={80} onChange={(v) => set({ glow: v })} reset={0} />
            <Slider label="Box behind the words" value={Math.round(l.bgOpacity * 100)} min={0} max={100} onChange={(v) => set({ bgOpacity: v / 100 })} reset={0} unit="%" />
            {l.bgOpacity > 0 && (
              <>
                <ColorInput label="Box colour" value={l.bg} onChange={(c) => set({ bg: c }, `${l.id}:bgc`)} />
                <Slider label="Box corners" value={l.bgRadius} min={0} max={120} onChange={(v) => set({ bgRadius: v })} reset={24} />
              </>
            )}
          </Section>
          <LayerBasics ctl={ctl} l={l} />
        </>
      )}
    </>
  );
};

// ---------------------------------------------------------------- Stickers
export const StickersPanel: React.FC<{ ctl: StudioCtl }> = ({ ctl }) => {
  const [cat, setCat] = useState(EMOJI_CATEGORIES[0].id);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'emoji' | 'shapes' | 'image'>('emoji');
  const file = useRef<HTMLInputElement>(null);
  const l = ctl.selected?.type === 'sticker' ? ctl.selected : null;
  const set = (patch: Partial<StickerLayer>, key?: string) => l && ctl.updateLayer(l.id, patch as Record<string, unknown>, key || `${l.id}:${Object.keys(patch)[0]}`);
  const items = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s) return EMOJI_CATEGORIES.flatMap((c) => c.items).filter((i) => i.k.includes(s) || i.e === s);
    return EMOJI_CATEGORIES.find((c) => c.id === cat)?.items || [];
  }, [cat, q]);
  return (
    <>
      <Section title="Stickers">
        <Chips options={[{ id: 'emoji', label: '😀 Emoji' }, { id: 'shapes', label: '⭐ Shapes' }, { id: 'image', label: '🖼️ Your picture' }]} value={tab} onChange={(t) => setTab(t as typeof tab)} />
        {tab === 'emoji' && (
          <>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search (love, fire, party…)" aria-label="Search emoji" className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-[12px] text-white" />
            {!q && <Chips options={EMOJI_CATEGORIES.map((c) => ({ id: c.id, label: c.label }))} value={cat} onChange={setCat} />}
            <div className="grid grid-cols-6 gap-1" data-testid="studio-emoji-grid">
              {items.map((i) => <button key={i.e + i.k} onClick={() => ctl.addSticker('emoji', i.e)} aria-label={`Add ${i.k}`} className="aspect-square rounded-lg hover:bg-white/10 text-[22px] flex items-center justify-center">{i.e}</button>)}
              {items.length === 0 && <p className="col-span-6 text-[11px] text-zinc-500">Nothing found.</p>}
            </div>
          </>
        )}
        {tab === 'shapes' && (
          <div className="grid grid-cols-4 gap-1.5">
            {SHAPES.map((s) => <button key={s} onClick={() => ctl.addSticker('shape', s)} className="rounded-xl bg-zinc-900 border border-zinc-700 hover:border-fuchsia-400 py-2 text-[10px] font-bold capitalize" data-testid={`shape-${s}`}>{s}</button>)}
          </div>
        )}
        {tab === 'image' && (
          <>
            <input ref={file} type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) await ctl.addImageSticker(f); }} />
            <Btn className="w-full" onClick={() => file.current?.click()}><Upload className="w-4 h-4" />Use a picture (logo, cut-out, PNG)</Btn>
            <p className="text-[10px] text-zinc-500">A GIF can be added too, but it stays still. Animated GIF / sticker search needs a provider key (GIPHY or Tenor) kept on a server, so it is not switched on.</p>
          </>
        )}
      </Section>
      {l && (
        <>
          <Section title="This sticker">
            <Slider label="Size" value={Math.round(l.size)} min={30} max={900} onChange={(v) => set({ size: v })} reset={260} />
            {l.kind === 'shape' && <ColorInput label="Colour" value={l.color} onChange={(c) => set({ color: c }, `${l.id}:color`)} />}
          </Section>
          <LayerBasics ctl={ctl} l={l} />
        </>
      )}
    </>
  );
};

// ---------------------------------------------------------------- Draw
export const DrawPanel: React.FC<{ ctl: StudioCtl }> = ({ ctl }) => {
  const b = ctl.brush;
  const layer = (ctl.selected?.type === 'draw' ? ctl.selected : ctl.project.layers.find((l) => l.type === 'draw')) as DrawLayer | undefined;
  return (
    <>
      <Section title="Brush">
        <Chips
          options={[{ id: 'pen', label: '✏️ Pen' }, { id: 'highlighter', label: '🖍️ Highlighter' }, { id: 'line', label: '╱ Line' }, { id: 'arrow', label: '➜ Arrow' }, { id: 'rect', label: '▭ Box' }, { id: 'ellipse', label: '◯ Oval' }, { id: 'eraser', label: '🧽 Eraser' }]}
          value={b.kind} onChange={(k) => ctl.setBrush({ ...b, kind: k as typeof b.kind })}
        />
        {b.kind !== 'eraser' && <ColorInput label="Colour" value={b.color} onChange={(c) => ctl.setBrush({ ...b, color: c })} />}
        <Slider label="Thickness" value={b.size} min={2} max={120} onChange={(v) => ctl.setBrush({ ...b, size: v })} reset={14} />
        {b.kind !== 'eraser' && <Slider label="Opacity" value={Math.round(b.opacity * 100)} min={10} max={100} onChange={(v) => ctl.setBrush({ ...b, opacity: v / 100 })} reset={100} unit="%" />}
        <p className="text-[11px] text-zinc-400">Draw straight on the picture. Switch to another tool to move things again.</p>
      </Section>
      <Section title="This drawing">
        <div className="flex gap-2">
          <Btn className="flex-1" disabled={!layer || layer.strokes.length === 0} onClick={() => layer && ctl.update((p) => ({ ...p, layers: p.layers.map((x) => (x.id === layer.id && x.type === 'draw' ? { ...x, strokes: x.strokes.slice(0, -1) } : x)) }))}><Undo2 className="w-4 h-4" />Last stroke</Btn>
          <Btn tone="danger" className="flex-1" disabled={!layer || layer.strokes.length === 0} onClick={() => layer && ctl.update((p) => ({ ...p, layers: p.layers.map((x) => (x.id === layer.id && x.type === 'draw' ? { ...x, strokes: [] } : x)) }))}><Trash2 className="w-4 h-4" />Clear</Btn>
        </div>
        <p className="text-[10px] text-zinc-500">{layer ? `${layer.strokes.length} stroke${layer.strokes.length === 1 ? '' : 's'}` : 'Nothing drawn yet.'} Clearing can be undone (Ctrl+Z).</p>
      </Section>
      {layer && ctl.selected?.id === layer.id && <LayerBasics ctl={ctl} l={layer} />}
    </>
  );
};

// ---------------------------------------------------------------- Audio
export const AudioPanel: React.FC<{ ctl: StudioCtl }> = ({ ctl }) => {
  const input = useRef<HTMLInputElement>(null);
  const rec = useRef<VoiceRecorder | null>(null);
  const [recording, setRecording] = useState(false);
  const [secs, setSecs] = useState(0);
  const audios = ctl.project.layers.filter((l) => l.type === 'audio') as AudioLayer[];
  const videoAssets = ctl.assetList.filter((a) => a.kind === 'video');
  useEffect(() => {
    if (!recording) return;
    const id = window.setInterval(() => setSecs(Math.round((performance.now() - (rec.current?.startedAt || performance.now())) / 1000)), 250);
    return () => window.clearInterval(id);
  }, [recording]);
  useEffect(() => () => rec.current?.cancel(), []);
  const startRec = async () => {
    if (!VoiceRecorder.supported()) { ctl.notify('This browser cannot record from the microphone.', 'error'); return; }
    try {
      ctl.player.pause();
      rec.current = new VoiceRecorder();
      await rec.current.start();
      setSecs(0); setRecording(true);
      ctl.player.play();
    } catch {
      rec.current = null;
      ctl.notify('The microphone is blocked. Allow it for this site in the browser settings, then try again.', 'error');
    }
  };
  const stopRec = async () => {
    const at = Math.max(0, ctl.player.t - secs);
    ctl.player.pause();
    setRecording(false);
    const f = await rec.current?.stop();
    rec.current = null;
    if (!f) { ctl.notify('Nothing was recorded.', 'error'); return; }
    await ctl.addVoice(f, at);
  };
  const sel = ctl.selected?.type === 'audio' ? ctl.selected : null;
  const set = (patch: Partial<AudioLayer>, key?: string) => sel && ctl.updateLayer(sel.id, patch as Record<string, unknown>, key || `${sel.id}:${Object.keys(patch)[0]}`);
  return (
    <>
      <Section title="Sound">
        <input ref={input} type="file" accept="audio/*" multiple className="hidden" onChange={(e) => { const fs = Array.from(e.target.files || []); e.target.value = ''; void ctl.addFiles(fs, 'audio'); }} />
        <Btn className="w-full" onClick={() => input.current?.click()} data-testid="studio-add-audio"><Plus className="w-4 h-4" />Add music or a sound from this device</Btn>
        {!recording ? (
          <Btn className="w-full" onClick={startRec}><Mic className="w-4 h-4" />Record a voice-over</Btn>
        ) : (
          <Btn tone="danger" className="w-full animate-pulse" onClick={stopRec}><Square className="w-4 h-4" />Stop recording ({fmtTime(secs)})</Btn>
        )}
        <p className="text-[10px] text-zinc-500">The video plays while you speak. Recordings and music stay on this device. Sound only exists in video projects.</p>
      </Section>
      {videoAssets.length > 0 && (
        <Section title="Take the sound out of a video">
          {videoAssets.map((a) => <Btn key={a.id} className="w-full !justify-start" onClick={() => ctl.placeAsset(a, 'audio')}>🎵 <span className="truncate">{a.name}</span></Btn>)}
        </Section>
      )}
      <Section title={`On the timeline (${audios.length})`}>
        {audios.length === 0 && <p className="text-[11px] text-zinc-500">No sound yet.</p>}
        {audios.map((a) => (
          <button key={a.id} onClick={() => ctl.select(a.id)} className={`w-full text-left rounded-xl border px-2 py-1.5 text-[11px] flex items-center gap-2 ${ctl.selectedId === a.id ? 'border-fuchsia-400 bg-fuchsia-500/10' : 'border-zinc-800 bg-zinc-900'}`}>
            <span>{a.label === 'voice' ? '🎙️' : '♪'}</span><span className="flex-1 truncate font-semibold">{a.name}</span><span className="text-zinc-500">{fmtTime(a.start)}–{fmtTime(a.start + a.duration)}</span>
          </button>
        ))}
      </Section>
      {sel && (
        <Section title="This sound">
          <Slider label="Volume" value={Math.round(sel.volume * 100)} min={0} max={200} onChange={(v) => set({ volume: v / 100 })} reset={100} unit="%" />
          <Slider label="Fade in" value={sel.fadeIn} min={0} max={Math.max(0.5, Math.min(10, sel.duration))} step={0.1} onChange={(v) => set({ fadeIn: v })} reset={0} unit="s" />
          <Slider label="Fade out" value={sel.fadeOut} min={0} max={Math.max(0.5, Math.min(10, sel.duration))} step={0.1} onChange={(v) => set({ fadeOut: v })} reset={0} unit="s" />
          <Slider label="Starts at" value={+sel.start.toFixed(2)} min={0} max={Math.max(30, Math.ceil(ctl.duration + 10))} step={0.1} onChange={(v) => set({ start: v })} unit="s" />
          <Slider label="Starts inside the sound at" value={+sel.trimIn.toFixed(2)} min={0} max={Math.max(0.1, (ctl.assets.get(sel.assetId)?.duration || 1) - 0.2)} step={0.1} onChange={(v) => set({ trimIn: v })} unit="s" />
        </Section>
      )}
    </>
  );
};

// ---------------------------------------------------------------- Captions
const pad = (n: number, w = 2) => String(Math.floor(n)).padStart(w, '0');
const srtTime = (s: number) => { const ms = Math.round(s * 1000); return `${pad(ms / 3600000)}:${pad((ms % 3600000) / 60000)}:${pad((ms % 60000) / 1000)},${pad(ms % 1000, 3)}`; };
const readTime = (t: string): number | null => {
  const m = t.trim().match(/^(?:(\d+):)?(\d+):(\d+)[,.](\d{1,3})$/);
  if (!m) return null;
  return (Number(m[1] || 0) * 3600) + Number(m[2]) * 60 + Number(m[3]) + Number(m[4].padEnd(3, '0')) / 1000;
};
export function parseSrt(text: string): Cue[] {
  const cues: Cue[] = [];
  for (const block of text.replace(/\r/g, '').split(/\n{2,}/)) {
    const lines = block.split('\n').map((x) => x.trim()).filter(Boolean);
    const i = lines.findIndex((x) => x.includes('-->'));
    if (i < 0) continue;
    const [a, b] = lines[i].split('-->');
    const start = readTime(a), end = readTime((b || '').trim().split(/\s+/)[0] || '');
    if (start === null || end === null || end <= start) continue;
    const t = lines.slice(i + 1).join(' ').replace(/<[^>]+>/g, '').slice(0, 300);
    if (t) cues.push({ id: uid('c'), start, end, text: t });
  }
  return cues;
}
export const toSrt = (cues: Cue[]): string => [...cues].sort((a, b) => a.start - b.start).map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join('\n');

export const CaptionsPanel: React.FC<{ ctl: StudioCtl }> = ({ ctl }) => {
  const layer = ctl.project.layers.find((l) => l.type === 'captions') as CaptionLayer | undefined;
  const file = useRef<HTMLInputElement>(null);
  const [script, setScript] = useState('');
  if (ctl.project.mode !== 'video') return <Empty>Captions are for videos. Switch the project to Video in the Canvas tab.</Empty>;
  const ensure = (fn: (c: CaptionLayer) => CaptionLayer) => ctl.update((p) => {
    const cur = p.layers.find((l) => l.type === 'captions') as CaptionLayer | undefined;
    const base = cur || newCaptionLayer(p);
    const next = fn(base);
    return { ...p, layers: cur ? p.layers.map((l) => (l.id === cur.id ? next : l)) : [...p.layers, next] };
  });
  const setCue = (id: string, patch: Partial<Cue>, _key?: string) => ensure((c) => ({ ...c, cues: c.cues.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  const style = (patch: Partial<CaptionLayer>, key?: string) => ctl.update((p) => ({ ...p, layers: p.layers.map((l) => (l.type === 'captions' ? { ...l, ...patch } : l)) }), key || `cap:${Object.keys(patch)[0]}`);
  const cues = layer ? [...layer.cues].sort((a, b) => a.start - b.start) : [];
  const dur = Math.max(1, ctl.duration);
  const addCue = () => ensure((c) => ({ ...c, cues: [...c.cues, { id: uid('c'), start: ctl.player.t, end: Math.min(ctl.player.t + 2.5, Math.max(ctl.player.t + 0.5, dur)), text: 'New line' }] }));
  const spread = () => {
    const lines = script.split(/\n+/).map((x) => x.trim()).filter(Boolean);
    if (lines.length === 0) return;
    const per = dur / lines.length;
    ensure((c) => ({ ...c, cues: lines.map((t, i) => ({ id: uid('c'), start: +(i * per).toFixed(2), end: +((i + 1) * per - 0.05).toFixed(2), text: t.slice(0, 300) })) }));
    ctl.notify(`${lines.length} caption line${lines.length === 1 ? '' : 's'} spread over the video. Fix the timing of each below.`, 'info');
  };
  const loadSrt = async (f: File) => {
    const text = await f.text();
    const parsed = parseSrt(text);
    if (parsed.length === 0) { ctl.notify('No captions found in that file. It should be an .srt file.', 'error'); return; }
    ensure((c) => ({ ...c, cues: parsed }));
    ctl.notify(`${parsed.length} caption lines loaded.`, 'info');
  };
  const saveSrt = () => {
    const blob = new Blob([toSrt(cues)], { type: 'application/x-subrip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'captions.srt'; document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  };
  return (
    <>
      <Section title="Captions">
        <div className="flex gap-2">
          <Btn tone="primary" className="flex-1" onClick={addCue} data-testid="studio-add-cue"><Plus className="w-4 h-4" />Line at playhead</Btn>
        </div>
        <input ref={file} type="file" accept=".srt,text/plain" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void loadSrt(f); }} />
        <div className="flex gap-2">
          <Btn className="flex-1" onClick={() => file.current?.click()}><Upload className="w-4 h-4" />Open .srt</Btn>
          <Btn className="flex-1" disabled={cues.length === 0} onClick={saveSrt}><Download className="w-4 h-4" />Save .srt</Btn>
        </div>
        <textarea value={script} onChange={(e) => setScript(e.target.value)} rows={3} placeholder="Paste your script, one caption per line, and press the button to spread it over the video." aria-label="Script" className="w-full bg-zinc-900 border border-zinc-700 rounded-xl p-2 text-[12px] text-white resize-none" />
        <Btn className="w-full" disabled={!script.trim()} onClick={spread}>Spread the script over the video</Btn>
        <p className="text-[10px] text-zinc-500">Writing captions from the speech automatically needs a speech-to-text service, which is not switched on. You type them, paste a script or open an .srt file.</p>
      </Section>
      <Section title={`Lines (${cues.length})`}>
        {cues.length === 0 && <p className="text-[11px] text-zinc-500">No lines yet.</p>}
        {cues.map((c) => (
          <div key={c.id} className="rounded-xl bg-zinc-900 border border-zinc-800 p-2 space-y-1.5" data-testid="studio-cue">
            <input value={c.text} onChange={(e) => setCue(c.id, { text: e.target.value.slice(0, 300) }, `${c.id}:t`)} aria-label="Caption text" className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1 text-[12px] text-white" />
            <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
              <input type="number" step={0.1} min={0} value={+c.start.toFixed(2)} onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v >= 0) setCue(c.id, { start: v, end: Math.max(c.end, v + 0.2) }); }} aria-label="Starts at" className="w-16 bg-zinc-950 border border-zinc-700 rounded px-1 py-0.5 text-white" />
              to
              <input type="number" step={0.1} min={0} value={+c.end.toFixed(2)} onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v > c.start) setCue(c.id, { end: v }); }} aria-label="Ends at" className="w-16 bg-zinc-950 border border-zinc-700 rounded px-1 py-0.5 text-white" />
              s
              <button onClick={() => ctl.player.seek(c.start)} className="ml-auto text-fuchsia-300 font-bold">Go</button>
              <button aria-label="Delete line" onClick={() => ensure((x) => ({ ...x, cues: x.cues.filter((y) => y.id !== c.id) }))} className="text-rose-300"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        ))}
      </Section>
      {layer && (
        <Section title="Look">
          <Chips options={Object.keys(SYSTEM_FONTS).map((f) => ({ id: f, label: f }))} value={layer.font} onChange={(f) => style({ font: f })} />
          <Slider label="Size" value={layer.size} min={24} max={160} onChange={(v) => style({ size: v })} reset={64} />
          <Slider label="Height on the screen" value={Math.round(layer.y01 * 100)} min={5} max={95} onChange={(v) => style({ y01: v / 100 })} reset={78} unit="%" />
          <ColorInput label="Text colour" value={layer.color} onChange={(c) => style({ color: c }, 'cap:color')} />
          <Slider label="Box behind" value={Math.round(layer.bgOpacity * 100)} min={0} max={100} onChange={(v) => style({ bgOpacity: v / 100 })} reset={55} unit="%" />
          <Slider label="Outline" value={layer.stroke} min={0} max={12} onChange={(v) => style({ stroke: v })} reset={0} />
          <label className="flex items-center justify-between text-[12px] font-semibold">Bold<input type="checkbox" checked={layer.bold} onChange={(e) => style({ bold: e.target.checked })} className="w-5 h-5 accent-fuchsia-500" /></label>
          <Btn tone="danger" className="w-full" onClick={() => ctl.removeLayer(layer.id)}>Remove all captions</Btn>
        </Section>
      )}
    </>
  );
};

// ---------------------------------------------------------------- Edit (properties of the selected thing)
const TRANSITIONS: Array<{ id: TransitionType; label: string }> = [
  { id: 'cut', label: 'None' }, { id: 'fade', label: 'Fade' }, { id: 'dissolve', label: 'Dissolve / crossfade' }, { id: 'slide', label: 'Slide' },
  { id: 'zoom', label: 'Zoom' }, { id: 'wipe', label: 'Wipe' }, { id: 'blur', label: 'Blur' }
];
const SPEEDS = [0.25, 0.5, 1, 1.5, 2, 4];

export const PropsPanel: React.FC<{ ctl: StudioCtl }> = ({ ctl }) => {
  const l = ctl.selected;
  if (!l) return <Empty>Tap something on the picture or the timeline to change it here.</Empty>;
  const set = (patch: Record<string, unknown>, key?: string) => ctl.updateLayer(l.id, patch, key || `${l.id}:${Object.keys(patch)[0]}`);
  if (l.type === 'media') return <ClipProps ctl={ctl} l={l} set={set} />;
  if (l.type === 'audio') {
    return (
      <>
        <Section title={l.name}>
          <Slider label="Volume" value={Math.round(l.volume * 100)} min={0} max={200} onChange={(v) => set({ volume: v / 100 })} reset={100} unit="%" />
          <Slider label="Fade in" value={l.fadeIn} min={0} max={Math.max(0.5, Math.min(10, l.duration))} step={0.1} onChange={(v) => set({ fadeIn: v })} reset={0} unit="s" />
          <Slider label="Fade out" value={l.fadeOut} min={0} max={Math.max(0.5, Math.min(10, l.duration))} step={0.1} onChange={(v) => set({ fadeOut: v })} reset={0} unit="s" />
        </Section>
        <LayerBasics ctl={ctl} l={l} />
      </>
    );
  }
  if (l.type === 'captions') return <Empty>Edit the captions in the Captions tab.</Empty>;
  return (
    <>
      <Section title={l.type === 'text' ? 'Text' : l.type === 'sticker' ? 'Sticker' : 'Drawing'}>
        <p className="text-[11px] text-zinc-400">{l.type === 'text' ? 'Change the words and style in the Text tab.' : l.type === 'sticker' ? 'Change the size and colour in the Stickers tab.' : 'Draw more in the Draw tab.'}</p>
        <Slider label="Size" value={+l.scale.toFixed(2)} min={0.1} max={6} step={0.05} onChange={(v) => set({ scale: v })} reset={1} unit="×" />
      </Section>
      <LayerBasics ctl={ctl} l={l} />
    </>
  );
};

const ClipProps: React.FC<{ ctl: StudioCtl; l: MediaLayer; set: (patch: Record<string, unknown>, key?: string) => void }> = ({ ctl, l, set }) => {
  const a = ctl.assets.get(l.assetId);
  const isVideo = a?.kind === 'video';
  const main = l.track === 'main';
  const first = main && ctl.project.layers.filter((x) => x.type === 'media' && x.track === 'main').sort((p, q) => p.start - q.start)[0]?.id === l.id;
  const video = ctl.project.mode === 'video';
  return (
    <>
      <Section title={l.name}>
        <p className="text-[10px] text-zinc-500">{main ? 'On the main track' : 'Floating above the main track'}{isVideo ? ` · ${fmtTime(clipLength(l), true)} long` : ''}</p>
        {!main && <Btn onClick={() => ctl.updateLayer(l.id, { track: 'main' })}>Move to the main track</Btn>}
        {main && video && <Btn onClick={() => ctl.updateLayer(l.id, { track: 'overlay' })}>Float above (picture in picture)</Btn>}
      </Section>
      {isVideo && video && (
        <Section title="Video clip">
          <div className="text-[11px] font-semibold text-zinc-300">Speed</div>
          <Chips options={SPEEDS.map((s) => ({ id: String(s), label: `${s}×` }))} value={String(l.speed)} onChange={(v) => set({ speed: parseFloat(v) })} />
          <Slider label="Custom speed" value={l.speed} min={0.1} max={8} step={0.05} onChange={(v) => set({ speed: v }, `${l.id}:speed`)} reset={1} unit="×" />
          <Slider label="Starts at (in the file)" value={+l.trimIn.toFixed(2)} min={0} max={Math.max(0.1, l.trimOut - 0.1)} step={0.05} onChange={(v) => set({ trimIn: v }, `${l.id}:trim`)} unit="s" />
          <Slider label="Ends at (in the file)" value={+l.trimOut.toFixed(2)} min={Math.min(l.trimIn + 0.1, a?.duration || 1)} max={a?.duration || l.trimOut} step={0.05} onChange={(v) => set({ trimOut: v }, `${l.id}:trim`)} unit="s" />
          <Slider label="Sound volume" value={Math.round(l.volume * 100)} min={0} max={200} onChange={(v) => set({ volume: v / 100 })} reset={100} unit="%" />
        </Section>
      )}
      {video && (
        <Section title="Fade">
          <Slider label="Fade in" value={l.fadeIn} min={0} max={Math.max(0.5, Math.min(5, l.duration / 2))} step={0.1} onChange={(v) => set({ fadeIn: v })} reset={0} unit="s" />
          <Slider label="Fade out" value={l.fadeOut} min={0} max={Math.max(0.5, Math.min(5, l.duration / 2))} step={0.1} onChange={(v) => set({ fadeOut: v })} reset={0} unit="s" />
        </Section>
      )}
      {main && video && !first && (
        <Section title="Transition from the clip before">
          <Chips options={TRANSITIONS} value={l.transition.type} onChange={(t) => set({ transition: { ...l.transition, type: t as TransitionType } })} />
          {l.transition.type !== 'cut' && <Slider label="Length" value={l.transition.duration} min={0.2} max={2} step={0.1} onChange={(v) => set({ transition: { ...l.transition, duration: v } }, `${l.id}:tdur`)} reset={0.5} unit="s" />}
        </Section>
      )}
      {a?.kind === 'image' && video && main && (
        <Section title="Picture">
          <Slider label="Shows for" value={+l.duration.toFixed(1)} min={0.5} max={30} step={0.1} onChange={(v) => set({ duration: v }, `${l.id}:dur`)} reset={3} unit="s" />
        </Section>
      )}
      <LayerBasics ctl={ctl} l={l} />
    </>
  );
};

export type { Layer };
