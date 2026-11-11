import React, { useRef, useState } from 'react';
import { Camera, Check, ImagePlus, RotateCcw, X } from 'lucide-react';
import type { User } from '../../types';
import { resolveMedia } from '../../services/supabase';
import { updateFullProfile, uploadMediaFile } from '../../services/api';
import { compressImage } from '../../utils/mediaCompressor';

// The wide picture behind a profile photo. Everyone starts with a colour of their own (picked from their id, so it never changes by itself);
// the owner can choose another colour set, one flat colour, or a photo. The choice is kept inside the profile's `socialLinks.cover` text:
//   "g:<n>" a colour set, "c:#rrggbb" one colour, "i:<file key>" a photo. Nothing in the database had to change for it.

export const COVER_SETS: { name: string; css: string }[] = [
  { name: 'Dusk', css: 'linear-gradient(135deg,#6d28d9 0%,#db2777 55%,#f97316 100%)' },
  { name: 'Ocean', css: 'linear-gradient(135deg,#0284c7 0%,#4f46e5 55%,#9333ea 100%)' },
  { name: 'Lagoon', css: 'linear-gradient(135deg,#059669 0%,#0891b2 55%,#2563eb 100%)' },
  { name: 'Sunrise', css: 'linear-gradient(135deg,#e11d48 0%,#f97316 55%,#fbbf24 100%)' },
  { name: 'Meadow', css: 'linear-gradient(135deg,#15803d 0%,#65a30d 55%,#eab308 100%)' },
  { name: 'Midnight', css: 'linear-gradient(135deg,#1e1b4b 0%,#3730a3 55%,#0ea5e9 100%)' },
  { name: 'Berry', css: 'linear-gradient(135deg,#be185d 0%,#7e22ce 55%,#1d4ed8 100%)' },
  { name: 'Mint', css: 'linear-gradient(135deg,#10b981 0%,#38bdf8 55%,#818cf8 100%)' },
  { name: 'Peach', css: 'linear-gradient(135deg,#fb7185 0%,#f472b6 55%,#c084fc 100%)' },
  { name: 'Ember', css: 'linear-gradient(135deg,#b91c1c 0%,#ea580c 55%,#f59e0b 100%)' },
  { name: 'Forest', css: 'linear-gradient(135deg,#064e3b 0%,#047857 55%,#84cc16 100%)' },
  { name: 'Candy', css: 'linear-gradient(135deg,#e879f9 0%,#60a5fa 55%,#4ade80 100%)' }
];
export const COVER_COLOURS = ['#111827', '#7c3aed', '#2563eb', '#0891b2', '#059669', '#65a30d', '#f59e0b', '#ea580c', '#e11d48', '#db2777'];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** The saved cover text of a person ('' when they never chose one) */
export function coverValue(u?: Pick<User, 'socialLinks'> | null): string {
  const v = (u?.socialLinks as Record<string, unknown> | undefined)?.cover;
  return typeof v === 'string' ? v : '';
}

/** The CSS background of a person's cover */
export function coverBackground(u: Pick<User, 'id' | 'socialLinks'>, valueOverride?: string): React.CSSProperties {
  const v = valueOverride ?? coverValue(u);
  const glow = 'radial-gradient(120% 90% at 88% -10%, rgba(255,255,255,.30), transparent 55%)';
  if (v.startsWith('i:')) {
    return { backgroundImage: `url("${resolveMedia(v.slice(2))}")`, backgroundSize: 'cover', backgroundPosition: 'center' };
  }
  if (v.startsWith('c:') && /^#[0-9a-fA-F]{6}$/.test(v.slice(2))) {
    const c = v.slice(2);
    return { backgroundImage: `${glow}, linear-gradient(135deg, ${c} 0%, color-mix(in srgb, ${c} 55%, #000) 100%)` };
  }
  const n = v.startsWith('g:') ? parseInt(v.slice(2), 10) : NaN;
  const set = COVER_SETS[Number.isFinite(n) && n >= 0 && n < COVER_SETS.length ? n : hash(u.id || '') % COVER_SETS.length];
  return { backgroundImage: `${glow}, ${set.css}` };
}

export const ProfileCover: React.FC<{ user: User; isOwn: boolean; onUpdated: (u: User) => void }> = ({ user, isOwn, onUpdated }) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);   // what is shown while the choice is being saved
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [custom, setCustom] = useState('#7c3aed');
  const fileRef = useRef<HTMLInputElement>(null);
  const shown = draft ?? coverValue(user);

  const save = async (value: string) => {
    setBusy(true); setError(''); setDraft(value);
    try {
      const next: Record<string, string | undefined> = { ...(user.socialLinks as Record<string, string | undefined> | undefined) };
      if (value) next.cover = value; else delete next.cover;
      const res = await updateFullProfile({ socialLinks: next } as Partial<User>);
      if (res.success && res.user) onUpdated(res.user);
      else { setError('Could not save. Try again.'); setDraft(null); }
    } catch {
      setError('Could not save. Try again.'); setDraft(null);
    } finally { setBusy(false); }
  };

  const pickPhoto = async (file: File | undefined) => {
    if (!file || !file.type.startsWith('image/')) return;
    setBusy(true); setError('');
    try {
      const small = await compressImage(file, 1400, 700, 0.82);
      const res = await uploadMediaFile(small, 'avatars', { skipCompress: true });
      if (!res.objectKey) throw new Error('no key');
      await save(`i:${res.objectKey}`);
    } catch { setError('The photo could not be uploaded.'); setBusy(false); }
  };

  return (
    <div className="relative -mx-4 sm:mx-0 sm:rounded-3xl overflow-hidden h-[148px] sm:h-[190px]" style={coverBackground(user, shown)} data-testid="profile-cover">
      {isOwn && (
        <button type="button" onClick={() => setOpen(true)} data-testid="profile-cover-edit" aria-label="Change cover"
          className="absolute right-3 bottom-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5 text-xs font-bold text-white cursor-pointer active:scale-95 transition-transform">
          <Camera className="w-4 h-4" /> Edit cover
        </button>
      )}
      {open && (
        <div data-noob-sheet="1" className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-t-3xl bg-zinc-900 text-white p-5 pb-8 max-h-[85dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="cover-sheet">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-extrabold">Your cover</h3>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="p-1.5 rounded-full hover:bg-white/10 cursor-pointer"><X className="w-5 h-5" /></button>
            </div>
            <div className="h-24 rounded-2xl mb-4" style={coverBackground(user, shown)} />
            <p className="text-xs font-bold uppercase tracking-wide text-zinc-400 mb-2">Colour sets</p>
            <div className="grid grid-cols-6 gap-2 mb-4">
              {COVER_SETS.map((s, i) => (
                <button key={s.name} type="button" disabled={busy} title={s.name} aria-label={s.name} onClick={() => save(`g:${i}`)}
                  className={`h-11 rounded-xl cursor-pointer active:scale-90 transition-transform ${shown === `g:${i}` ? 'ring-2 ring-white' : ''}`} style={{ backgroundImage: s.css }} />
              ))}
            </div>
            <p className="text-xs font-bold uppercase tracking-wide text-zinc-400 mb-2">One colour</p>
            <div className="flex flex-wrap items-center gap-2 mb-4">
              {COVER_COLOURS.map((c) => (
                <button key={c} type="button" disabled={busy} aria-label={c} onClick={() => save(`c:${c}`)}
                  className={`w-9 h-9 rounded-full cursor-pointer active:scale-90 transition-transform ${shown === `c:${c}` ? 'ring-2 ring-white ring-offset-2 ring-offset-zinc-900' : ''}`} style={{ background: c }} />
              ))}
              <label className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 h-9 text-xs font-bold cursor-pointer">
                <input type="color" value={custom} onChange={(e) => setCustom(e.target.value)} className="w-5 h-5 bg-transparent border-0 p-0 cursor-pointer" aria-label="Pick any colour" />
                Any colour
                <button type="button" disabled={busy} onClick={() => save(`c:${custom}`)} aria-label="Use this colour" className="ml-1 rounded-full bg-white text-black p-0.5 cursor-pointer"><Check className="w-4 h-4" /></button>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} data-testid="cover-photo"
                className="flex items-center justify-center gap-2 rounded-xl bg-white/10 hover:bg-white/15 py-3 text-sm font-bold cursor-pointer active:scale-[0.98]"><ImagePlus className="w-4 h-4" /> Use a photo</button>
              <button type="button" disabled={busy} onClick={() => save('')}
                className="flex items-center justify-center gap-2 rounded-xl bg-white/10 hover:bg-white/15 py-3 text-sm font-bold cursor-pointer active:scale-[0.98]"><RotateCcw className="w-4 h-4" /> My own colour</button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { void pickPhoto(e.target.files?.[0]); e.target.value = ''; }} />
            {busy && <p className="mt-3 text-center text-xs text-zinc-400">Saving…</p>}
            {error && <p className="mt-3 text-center text-xs text-rose-400" role="alert">{error}</p>}
          </div>
        </div>
      )}
    </div>
  );
};
