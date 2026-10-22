import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, ImagePlus, Images, Loader2, Megaphone, Plus, Video, X } from 'lucide-react';
import type { User } from '../../types';
import { fetchMyAdApplications, submitAdApplication } from '../../services/api';
import { AD_DURATIONS, AD_MAX_PHOTOS, AD_WHERE_OPTIONS, durationText, mediaText, pagesText, statusText, type AdApplication, type AdMediaKind, type AdWhere } from '../../utils/ads';
import { safeExternalUrl } from '../../utils/safeUrl';

// "Apply for ads": a business account first says whether the ad is PHOTOS (1 to 10, they change by themselves, one every second) or ONE VIDEO, adds the files, says for how long and
// where (Reels, Feed, Home or all) and sends it, free. The NOOB team reads every request, contacts the advertiser and, once the admin approves it, the ad appears at the top of those
// pages. A person without a business account is told how to get one.
const field = 'w-full rounded-xl bg-zinc-900 border border-white/20 focus:border-white outline-none px-3 py-2.5 text-sm text-white placeholder:text-zinc-500';

interface Picked { id: string; file: File; url: string }
let pickedCounter = 0;

export const AdApplyModal: React.FC<{ currentUser: User; onClose: () => void }> = ({ currentUser, onClose }) => {
  const isBusiness = currentUser.accountType === 'business' || currentUser.isBusiness;
  const [kind, setKind] = useState<AdMediaKind | null>(null);
  const [items, setItems] = useState<Picked[]>([]);
  const [title, setTitle] = useState('');
  const [link, setLink] = useState('');
  const [days, setDays] = useState(7);
  const [where, setWhere] = useState<AdWhere>('all');
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [mine, setMine] = useState<AdApplication[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<Picked[]>([]);
  itemsRef.current = items;

  const reload = () => { void fetchMyAdApplications().then(setMine); };
  useEffect(() => { if (isBusiness) reload(); }, [isBusiness]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  useEffect(() => () => { itemsRef.current.forEach((p) => URL.revokeObjectURL(p.url)); }, []);

  const clearItems = () => { itemsRef.current.forEach((p) => URL.revokeObjectURL(p.url)); setItems([]); };
  const choose = (k: AdMediaKind) => {
    if (k === kind) return;
    clearItems(); setError(''); setKind(k);
  };
  const make = (f: File): Picked => ({ id: `p${++pickedCounter}`, file: f, url: URL.createObjectURL(f) });

  const pick = (list: FileList | null) => {
    const files = Array.from(list || []);
    if (!files.length || !kind) return;
    setError('');
    if (kind === 'video') {
      const f = files[0];
      if (!f.type.startsWith('video/')) { setError('Please choose a video.'); return; }
      clearItems(); setItems([make(f)]);
      return;
    }
    const photos = files.filter((f) => f.type.startsWith('image/'));
    if (photos.length < files.length) setError('Only photos can be added here. A video is a separate choice above.');
    const room = AD_MAX_PHOTOS - items.length;
    if (photos.length > room) setError(`You can add up to ${AD_MAX_PHOTOS} photos.`);
    const take = photos.slice(0, Math.max(0, room));
    if (take.length) setItems((cur) => [...cur, ...take.map(make)]);
  };
  const remove = (id: string) => {
    setItems((cur) => { const gone = cur.find((p) => p.id === id); if (gone) URL.revokeObjectURL(gone.url); return cur.filter((p) => p.id !== id); });
    setError('');
  };

  const send = async () => {
    if (sending) return;
    if (!kind) { setError('First choose if your ad is photos or a video.'); return; }
    if (!items.length) { setError(kind === 'video' ? 'Please add the video of your ad.' : 'Please add at least 1 photo.'); return; }
    const safe = link.trim() ? safeExternalUrl(link) : '';
    if (link.trim() && !safe) { setError('The link should be a web address like https://example.com (or leave it empty).'); return; }
    setError(''); setSending(true); setProgress(0);
    const res = await submitAdApplication({ kind, files: items.map((p) => p.file), where, durationDays: days, title, link: safe || '', onProgress: (p) => setProgress(p.fraction) });
    setSending(false);
    if (!res.success) { setError(res.error || 'Could not send your request. Please try again.'); return; }
    setSent(true); clearItems(); setTitle(''); setLink('');
    reload();
  };

  const kindCard = (k: AdMediaKind, label: string, hint: string, Icon: React.ElementType) => (
    <button key={k} role="radio" aria-checked={kind === k} onClick={() => choose(k)} data-testid={`ad-kind-${k}`}
      className={`text-left p-3 rounded-2xl border cursor-pointer ${kind === k ? 'bg-white text-black border-white' : 'bg-zinc-900 text-white border-white/25 hover:border-white'}`}>
      <Icon className="w-5 h-5 mb-1.5" />
      <span className="block text-sm font-black">{label}</span>
      <span className={`block text-[10px] leading-snug ${kind === k ? 'text-zinc-700' : 'text-zinc-400'}`}>{hint}</span>
    </button>
  );

  const view = (
    <div className="fixed inset-0 z-[160] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={onClose} data-testid="ad-apply">
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full sm:max-w-md max-h-[94dvh] overflow-y-auto no-scrollbar bg-zinc-950 border-t-2 sm:border-2 border-white/40 rounded-t-3xl sm:rounded-3xl shadow-2xl"
        role="dialog" aria-modal="true" aria-label="Apply for ads"
      >
        <div className="sticky top-0 z-10 bg-zinc-950/95 backdrop-blur px-5 pt-4 pb-3 flex items-center gap-3 border-b border-white/10">
          <span className="w-10 h-10 rounded-xl bg-white text-black flex items-center justify-center shrink-0"><Megaphone className="w-5 h-5" /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-black text-white leading-tight">Advertise on NOOB</h2>
            <p className="text-[11px] text-zinc-400">Apply for ads. It is free.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full bg-zinc-900 border border-white/20 text-zinc-200 cursor-pointer" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>

        {!isBusiness ? (
          <div className="px-5 py-6 space-y-3" data-testid="ad-not-business">
            <p className="text-sm font-bold text-white">Ads are for business accounts.</p>
            <p className="text-xs text-zinc-300 leading-relaxed">Open <span className="font-bold text-white">Edit profile</span> and switch your account to a <span className="font-bold text-white">business account</span>, then come back here to apply.</p>
            <button onClick={onClose} className="w-full py-3 rounded-2xl bg-white text-black text-sm font-black cursor-pointer">OK</button>
          </div>
        ) : sent ? (
          <div className="px-5 py-8 text-center space-y-3" data-testid="ad-sent">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
            <p className="text-base font-black text-white">We have received your files.</p>
            <p className="text-sm text-zinc-300">The NOOB team will contact you soon.</p>
            <button onClick={() => setSent(false)} className="w-full py-3 rounded-2xl bg-white text-black text-sm font-black cursor-pointer mt-2">OK</button>
          </div>
        ) : (
          <div className="px-5 py-4 space-y-5">
            <div>
              <p className="text-xs font-black text-white mb-2">1. Is your ad photos or a video?</p>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Photos or video">
                {kindCard('image', 'Photos', `1 to ${AD_MAX_PHOTOS} photos. They change by themselves, one every second.`, Images)}
                {kindCard('video', 'Video', 'One video. It plays again and again without sound.', Video)}
              </div>
            </div>

            <div>
              <p className="text-xs font-black text-white mb-2" data-testid="ad-files-title">
                {kind === 'image' ? `2. Your photos (${items.length} of ${AD_MAX_PHOTOS})` : kind === 'video' ? '2. Your video' : '2. Your files'}
              </p>
              <input ref={input} type="file" accept={kind === 'video' ? 'video/*' : 'image/*'} multiple={kind === 'image'} className="hidden"
                onChange={(e) => { pick(e.target.files); e.target.value = ''; }} data-testid="ad-file" />
              {kind === null && <p className="text-xs text-zinc-500 py-3">Choose photos or video above first.</p>}

              {kind === 'image' && (
                <>
                  <div className="grid grid-cols-3 gap-2" data-testid="ad-photos">
                    {items.map((p, n) => (
                      <div key={p.id} className="relative aspect-square rounded-xl overflow-hidden border border-white/25 bg-black" data-testid="ad-photo">
                        <img src={p.url} alt={`Photo ${n + 1}`} className="w-full h-full object-cover" />
                        <span className="absolute top-1 left-1 min-w-5 h-5 px-1 rounded-full bg-white text-black text-[10px] font-black flex items-center justify-center">{n + 1}</span>
                        <button onClick={() => remove(p.id)} className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/80 border border-white/40 text-white flex items-center justify-center cursor-pointer" aria-label={`Remove photo ${n + 1}`} data-testid="ad-photo-remove"><X className="w-3 h-3" /></button>
                      </div>
                    ))}
                    {items.length < AD_MAX_PHOTOS && (
                      <button onClick={() => input.current?.click()} className="aspect-square rounded-xl border-2 border-dashed border-white/35 hover:border-white text-zinc-300 flex flex-col items-center justify-center gap-1 cursor-pointer" data-testid="ad-add-photos">
                        {items.length ? <Plus className="w-6 h-6" /> : <ImagePlus className="w-6 h-6" />}
                        <span className="text-[10px] font-bold">{items.length ? 'Add more' : 'Add photos'}</span>
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-2">At least 1 and up to {AD_MAX_PHOTOS} photos. Each photo is shown for 1 second, then the next one comes by itself, in this order.</p>
                </>
              )}

              {kind === 'video' && (items[0] ? (
                <div className="relative rounded-2xl overflow-hidden border border-white/25 bg-black">
                  <video src={items[0].url} muted playsInline controls className="w-full max-h-56 object-contain" />
                  <button onClick={() => input.current?.click()} className="absolute bottom-2 right-2 px-3 py-1.5 rounded-full bg-white text-black text-[11px] font-black cursor-pointer">Change</button>
                </div>
              ) : (
                <button onClick={() => input.current?.click()} className="w-full py-8 rounded-2xl border-2 border-dashed border-white/35 hover:border-white text-zinc-300 flex flex-col items-center gap-2 cursor-pointer" data-testid="ad-add-video">
                  <ImagePlus className="w-7 h-7" />
                  <span className="text-xs font-bold">Choose your video</span>
                </button>
              ))}

              <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 80))} placeholder="A short line to show with it (optional)" className={`${field} mt-3`} data-testid="ad-title" />
              <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Website link (optional)" inputMode="url" className={`${field} mt-2`} data-testid="ad-link" />
            </div>

            <div>
              <p className="text-xs font-black text-white mb-2">3. How long should it be shown?</p>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="How long">
                {AD_DURATIONS.map((d) => (
                  <button key={d.days} role="radio" aria-checked={days === d.days} onClick={() => setDays(d.days)} data-testid={`ad-days-${d.days}`}
                    className={`px-4 py-2 rounded-full text-xs font-black border cursor-pointer ${days === d.days ? 'bg-white text-black border-white' : 'bg-zinc-900 text-zinc-200 border-white/25 hover:border-white'}`}>{d.label}</button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-black text-white mb-2">4. Where should it be shown?</p>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Where">
                {AD_WHERE_OPTIONS.map((o) => (
                  <button key={o.id} role="radio" aria-checked={where === o.id} onClick={() => setWhere(o.id)} data-testid={`ad-where-${o.id}`}
                    className={`text-left p-3 rounded-2xl border cursor-pointer ${where === o.id ? 'bg-white text-black border-white' : 'bg-zinc-900 text-white border-white/25 hover:border-white'}`}>
                    <span className="block text-sm font-black">{o.label}</span>
                    <span className={`block text-[10px] leading-snug ${where === o.id ? 'text-zinc-700' : 'text-zinc-400'}`}>{o.hint}</span>
                  </button>
                ))}
              </div>
            </div>

            {error && <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl p-3" role="alert" data-testid="ad-error">{error}</p>}
            <button onClick={() => void send()} disabled={sending} className="w-full py-3.5 rounded-2xl bg-white text-black text-sm font-black cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2" data-testid="ad-send">
              {sending ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending{progress > 0 && progress < 1 ? ` ${Math.round(progress * 100)}%` : '…'}</> : 'Send my request'}
            </button>
            <p className="text-[10px] text-zinc-500 text-center -mt-2">Free. The NOOB team reads every request and contacts you.</p>
          </div>
        )}

        {isBusiness && mine.length > 0 && (
          <div className="px-5 pb-6 pt-1" data-testid="ad-mine">
            <p className="text-xs font-black text-white mb-2">Your requests</p>
            <div className="space-y-2">
              {mine.map((a) => (
                <div key={a.id} className="flex items-center gap-3 p-2.5 rounded-2xl bg-zinc-900 border border-white/15">
                  <span className="relative w-16 h-10 shrink-0 rounded-lg overflow-hidden bg-black">
                    {a.mediaType === 'video' ? <video src={a.mediaUrl} muted playsInline preload="metadata" className="absolute inset-0 w-full h-full object-cover" /> : <img src={a.mediaUrl} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-bold text-white truncate">{a.title || mediaText(a)} · {durationText(a.durationDays)}{a.title ? ` · ${mediaText(a)}` : ''}</span>
                    <span className="block text-[10px] text-zinc-400 leading-snug">{statusText(a)}{a.status === 'pending' ? ` (asked for ${pagesText(a.requestedPages)})` : ''}</span>
                    {a.status === 'rejected' && a.adminNote && <span className="block text-[10px] text-amber-300 leading-snug">{a.adminNote}</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
  return typeof document === 'undefined' ? view : createPortal(view, document.body);
};
