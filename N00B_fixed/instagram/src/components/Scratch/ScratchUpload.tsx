import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, Loader2, Sparkles, Upload, X } from 'lucide-react';
import { FOIL_CONFIGS } from './scratchEngine';
import { createCard, failed, FOIL_TYPES, type FoilType, type ScratchCard } from './scratchData';

// "Create Scratch Post": a picture, a title, a hint, a foil, and a category; the picture is uploaded like any NOOB post picture and sealed under foil for everybody else.
export const CATEGORIES = ['Secret Drops', 'Music & Nightlife', 'Fashion & Drops', 'Cute & Wholesome', 'Photography'];
const MAX_BYTES = 10 * 1024 * 1024;

const PRESETS = [
  { label: '🎨 Street Art', url: 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=1000&q=80', title: 'Street Graffiti Masterpiece 🎨', hint: 'Scratch to unveil the hidden alley mural' },
  { label: '🎮 Gaming Rig', url: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1000&q=80', title: 'Next-Gen Esports Rig Reveal 🎮', hint: 'Scratch to see the custom liquid cooled rig' },
  { label: '🧋 Boba Secret', url: 'https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=1000&q=80', title: 'Matcha Boba Secret Menu Item 🧋', hint: 'Scratch to reveal the signature drink recipe' }
];

interface Props {
  onClose: () => void;
  onPosted: (card: ScratchCard) => void;
}

export const ScratchUpload: React.FC<Props> = ({ onClose, onPosted }) => {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [hint, setHint] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [foil, setFoil] = useState<FoilType>('doodle');
  const [busy, setBusy] = useState(false);
  const [loadingPreset, setLoadingPreset] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [busy, onClose]);

  const take = (f: File) => {
    if (!/^image\//.test(f.type)) { setError('Please choose a picture (JPG, PNG or WebP).'); return; }
    if (f.size > MAX_BYTES) { setError('That picture is bigger than 10MB. Please choose a smaller one.'); return; }
    setError(''); setFile(f); setPreview(URL.createObjectURL(f));
  };

  const preset = async (p: typeof PRESETS[number]) => {
    if (busy || loadingPreset) return;
    setLoadingPreset(true); setError('');
    try {
      const res = await fetch(p.url);
      if (!res.ok) throw new Error('x');
      const blob = await res.blob();
      take(new File([blob], 'preset.jpg', { type: blob.type || 'image/jpeg' }));
      setTitle(p.title); setHint(p.hint);
    } catch { setError('That preset picture could not be loaded. Choose a photo from your phone instead.'); }
    setLoadingPreset(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || busy) return;
    setBusy(true); setError(''); setProgress(0);
    const r = await createCard(file, { title: title.trim() || 'My Mystery Scratch Post ✨', hint: hint.trim() || 'Scratch to reveal the secret photo!', category, foil }, setProgress);
    if (!failed(r)) { onPosted(r.card); onClose(); } else { setError(r.error); setBusy(false); }
  };

  return createPortal(
    <div className="fixed inset-0 z-[260] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm" onClick={() => { if (!busy) onClose(); }} role="dialog" aria-modal="true" aria-label="Create Scratch Post" data-testid="scratch-upload">
      <form onSubmit={submit} className="force-dark w-full sm:max-w-md max-h-[92dvh] flex flex-col rounded-t-[28px] sm:rounded-[28px] bg-zinc-950 ring-1 ring-white/20 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="shrink-0 flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-white/10">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 rounded-full bg-yellow-300 text-black flex items-center justify-center shrink-0"><Camera className="w-4 h-4" /></span>
            <div className="min-w-0">
              <h3 className="text-[14px] font-black text-white">Create Scratch Post</h3>
              <p className="text-[11px] text-zinc-400 font-semibold">Upload and seal with Noob foil</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close upload dialog" className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-zinc-200 flex items-center justify-center cursor-pointer disabled:opacity-40"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-4 space-y-4">
          <div role="button" tabIndex={0} onClick={() => input.current?.click()} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.current?.click(); } }}
            onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) take(f); }}
            className={`cursor-pointer rounded-2xl border-2 border-dashed p-4 text-center transition-all ${preview ? 'border-emerald-400/70 bg-emerald-950/20' : 'border-white/30 bg-white/[0.04] hover:border-white/70'}`}>
            <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) take(f); e.target.value = ''; }} data-testid="scratch-file" />
            {preview ? (
              <div className="space-y-2">
                <img src={preview} alt="Upload Preview" className="mx-auto max-h-48 rounded-xl object-contain" />
                <span className="text-[11px] font-semibold text-emerald-300 block">✓ Photo Loaded! Click to choose another</span>
              </div>
            ) : (
              <div className="py-6 flex flex-col items-center justify-center gap-2">
                <span className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white"><Upload className="w-5 h-5" /></span>
                <div className="text-[13px] font-black text-white">Drop photo or click to browse</div>
                <div className="text-[11px] font-semibold text-zinc-400">Supports JPG, PNG, WebP up to 10MB</div>
              </div>
            )}
          </div>

          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block mb-1.5">Or pick a mystery preset:</span>
            <div className="grid grid-cols-3 gap-2">
              {PRESETS.map((p) => (
                <button key={p.label} type="button" onClick={() => preset(p)} disabled={loadingPreset || busy}
                  className="p-2 rounded-xl bg-white/[0.06] ring-1 ring-white/15 hover:ring-white/50 text-center text-[11px] font-bold text-zinc-100 cursor-pointer disabled:opacity-50">{p.label}</button>
              ))}
            </div>
            {loadingPreset && <p className="mt-1.5 text-[11px] font-semibold text-zinc-400 flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" />Loading the preset…</p>}
          </div>

          <div>
            <label htmlFor="scratch-title" className="text-[10px] font-black uppercase tracking-wider text-zinc-300 block mb-1">Title / Catchphrase</label>
            <input id="scratch-title" type="text" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Secret Backstage Moment..."
              className="w-full h-11 rounded-xl bg-white/10 ring-1 ring-white/20 focus:ring-white/60 outline-none px-3.5 text-[13px] text-white placeholder:text-zinc-500" />
          </div>
          <div>
            <label htmlFor="scratch-hint" className="text-[10px] font-black uppercase tracking-wider text-zinc-300 block mb-1">Scratch Hint / Teaser</label>
            <input id="scratch-hint" type="text" value={hint} maxLength={120} onChange={(e) => setHint(e.target.value)} placeholder="e.g. Scratch the center for the surprise!"
              className="w-full h-11 rounded-xl bg-white/10 ring-1 ring-white/20 focus:ring-white/60 outline-none px-3.5 text-[13px] text-white placeholder:text-zinc-500" />
          </div>

          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-zinc-300 block mb-1.5">Foil</span>
            <div className="grid grid-cols-2 gap-2">
              {FOIL_TYPES.map((f) => (
                <button key={f} type="button" onClick={() => setFoil(f)} aria-pressed={foil === f}
                  className={`p-2.5 rounded-xl text-left ring-1 transition cursor-pointer ${foil === f ? 'bg-white text-black ring-white' : 'bg-white/[0.06] text-zinc-100 ring-white/15 hover:ring-white/50'}`}>
                  <span className="block text-[12px] font-black leading-tight">{FOIL_CONFIGS[f].name}</span>
                  <span className={`block text-[10px] font-semibold mt-0.5 ${foil === f ? 'text-zinc-700' : 'text-zinc-400'}`}>{FOIL_CONFIGS[f].badgeLabel}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-zinc-300 block mb-1.5">Category</span>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((c) => (
                <button key={c} type="button" onClick={() => setCategory(c)} aria-pressed={category === c}
                  className={`h-8 px-3 rounded-full text-[11px] font-black ring-1 transition cursor-pointer ${category === c ? 'bg-white text-black ring-white' : 'bg-white/[0.06] text-zinc-200 ring-white/15 hover:ring-white/50'}`}>{c}</button>
              ))}
            </div>
          </div>
          {error && <p className="text-[12px] font-semibold text-red-300" role="alert">{error}</p>}
        </div>

        <div className="shrink-0 px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-white/10">
          <button type="submit" disabled={!file || busy} data-testid="scratch-post"
            className="relative w-full h-12 rounded-2xl bg-yellow-300 text-black text-[13px] font-black flex items-center justify-center gap-2 disabled:opacity-45 active:scale-[0.99] transition cursor-pointer overflow-hidden shadow-[0_10px_28px_-10px_rgba(250,204,21,0.8)]">
            {busy && <span className="absolute inset-y-0 left-0 bg-yellow-100/70" style={{ width: `${Math.round(progress * 100)}%` }} aria-hidden="true" />}
            <span className="relative flex items-center gap-2">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}{busy ? 'Sealing…' : 'Seal with Scratch Foil & Post'}</span>
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
};
