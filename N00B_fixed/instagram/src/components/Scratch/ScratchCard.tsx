import React, { useEffect, useRef, useState } from 'react';
import { Bookmark, Check, Download, Eye, Flame, Heart, Link2, Loader2, MessageCircle, RefreshCw, Rocket, Skull, Sparkles, Tag, ThumbsUp, Trash2 } from 'lucide-react';
import { VerifiedBadge } from '../Common/VerifiedBadge';
import { siteOrigin, isNativeApp } from '../../utils/siteUrl';
import { ScratchCanvas } from './ScratchCanvas';
import { ago, deleteCard, failed, markRevealed, react, short, toggleSave, type ReactionKind, type ScratchCard as Card } from './scratchData';
import type { ScratchTool } from './scratchEngine';

// One scratch card of the feed: who posted it, its title and hint, the foil over the picture with the three small buttons (Peek, Reseal, Instant), and the reaction bar
// (heart, thumbs up, flame, rocket, skull), notes, save, copy link and download. Everything on it is real: it is saved on the server and seen by everybody.
const REACTIONS: Array<{ kind: ReactionKind; label: string; title: string; icon: React.ElementType; on: string; tint: string }> = [
  { kind: 'heart', label: 'React with Heart', title: 'Give Love', icon: Heart, on: 'bg-rose-500 text-white ring-rose-300/60', tint: 'text-rose-400' },
  { kind: 'thumb', label: 'React with Thumbs Up', title: 'Approve', icon: ThumbsUp, on: 'bg-emerald-400 text-black ring-emerald-200/60', tint: 'text-emerald-400' },
  { kind: 'flame', label: 'React with Lit Flame', title: 'Hot Reveal', icon: Flame, on: 'bg-amber-400 text-black ring-amber-200/60', tint: 'text-amber-400' },
  { kind: 'rocket', label: 'React with Rocket', title: 'To The Moon', icon: Rocket, on: 'bg-indigo-500 text-white ring-indigo-300/60', tint: 'text-indigo-300' },
  { kind: 'skull', label: 'React with Skull', title: 'Dead / Funny', icon: Skull, on: 'bg-zinc-200 text-black ring-white/60', tint: 'text-zinc-300' }
];

interface Props {
  card: Card;
  tool: ScratchTool;
  brushMultiplier: number;
  soundEnabled: boolean;
  onChange: (card: Card) => void;
  onDeleted: (id: string) => void;
  onOpenNotes: (card: Card) => void;
  onOpenProfile: (userId: string) => void;
  say: (text: string, tone?: 'good' | 'bad') => void;
}

export const ScratchCardView: React.FC<Props> = ({ card, tool, brushMultiplier, soundEnabled, onChange, onDeleted, onOpenNotes, onOpenProfile, say }) => {
  const [pct, setPct] = useState(card.revealed || card.isMine ? 100 : 0);
  const [resealCount, setResealCount] = useState(0);
  const [magicCount, setMagicCount] = useState(0);
  const [peeking, setPeeking] = useState(false);
  const [busy, setBusy] = useState<string>('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);
  const peekTimer = useRef<number | undefined>(undefined);
  const cardRef = useRef(card);
  cardRef.current = card;
  useEffect(() => () => window.clearTimeout(peekTimer.current), []);

  const startOpen = card.revealed || card.isMine;
  const unveiled = pct >= 100;

  const peek = () => {
    window.clearTimeout(peekTimer.current);
    setPeeking(true);
    peekTimer.current = window.setTimeout(() => setPeeking(false), 1500);
  };

  const onRevealed = async () => {
    const r = await markRevealed(card.id);
    if (!failed(r)) onChange({ ...cardRef.current, scratchers: r.card.scratchers, revealed: true });
  };

  const tap = async (kind: ReactionKind) => {
    if (busy) return;
    setBusy(kind);
    // shown at once, corrected by the server's answer
    const had = card.mine.includes(kind);
    const optimistic: Card = { ...card, mine: had ? card.mine.filter((k) => k !== kind) : [...card.mine, kind], counts: { ...card.counts, [kind]: Math.max(0, card.counts[kind] + (had ? -1 : 1)) } };
    onChange(optimistic);
    const r = await react(card.id, kind);
    if (!failed(r)) onChange(r.card); else { onChange(card); say(r.error, 'bad'); }
    setBusy('');
  };

  const save = async () => {
    if (busy) return;
    setBusy('save');
    const r = await toggleSave(card.id);
    if (!failed(r)) { onChange(r.card); say(r.card.saved ? 'Saved to your Scratchbook.' : 'Removed from your Scratchbook.', 'good'); } else say(r.error, 'bad');
    setBusy('');
  };

  const share = async () => {
    const url = `${siteOrigin()}/`;
    const text = `${card.title} — scratch to reveal on NOOB`;
    try {
      if (navigator.share) { await navigator.share({ title: card.title, text, url }); return; }
    } catch { return; }
    try { await navigator.clipboard.writeText(`${text}\n${url}`); setCopied(true); window.setTimeout(() => setCopied(false), 1800); say('Link copied. Share it with your friends.', 'good'); }
    catch { say('Copying is not available here.', 'bad'); }
  };

  // Download the picture. A browser saves it as a file. Inside the Android app a plain "download" does nothing, so there the phone's own share sheet opens with the picture (Save to Photos / Files / send it), and if that is not there the picture opens so it can be held and saved.
  const download = async () => {
    const name = `noob-scratch-${card.id.slice(0, 8)}.jpg`;
    let blob: Blob | null = null;
    try { const res = await fetch(card.imageSrc); if (res.ok) blob = await res.blob(); } catch { blob = null; }
    if (blob) {
      try {
        const file = new File([blob], name, { type: blob.type || 'image/jpeg' });
        const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
        if (isNativeApp() && navigator.share && nav.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: card.title }); return; }
      } catch (e) { if ((e as { name?: string })?.name === 'AbortError') return; }
      if (!isNativeApp()) {
        try {
          const a = document.createElement('a');
          const url = URL.createObjectURL(blob);
          a.href = url; a.download = name;
          document.body.appendChild(a); a.click(); a.remove();
          window.setTimeout(() => URL.revokeObjectURL(url), 4000);
          say('Saved to your downloads.', 'good');
          return;
        } catch { /* fall through to opening the picture */ }
      }
    }
    say('Opening the picture: hold it, then choose Download image.', 'good');
    const abs = /^https?:/i.test(card.imageSrc) ? card.imageSrc : siteOrigin() + (card.imageSrc.startsWith('/') ? '' : '/') + card.imageSrc;
    try {
      if (isNativeApp()) { const { Browser } = await import('@capacitor/browser'); await Browser.open({ url: abs }); return; }
    } catch { /* use the normal way below */ }
    window.open(abs, '_blank', 'noopener');
  };

  const remove = async () => {
    if (!confirmDelete) { setConfirmDelete(true); window.setTimeout(() => setConfirmDelete(false), 3500); return; }
    setBusy('delete');
    const r = await deleteCard(card.id);
    if (!failed(r)) { onDeleted(card.id); say('Card deleted.', 'good'); } else { say(r.error, 'bad'); setBusy(''); }
  };

  return (
    <article className="scratch-card force-dark relative w-full rounded-[28px] p-3.5 sm:p-4 mb-6 bg-gradient-to-b from-zinc-900/90 to-zinc-950/95 ring-1 ring-white/15 shadow-[0_24px_60px_-28px_rgba(0,0,0,0.95)] backdrop-blur-xl" data-testid="scratch-card">
      <div className="flex items-center justify-between gap-2 mb-3">
        <button type="button" onClick={() => onOpenProfile(card.userId)} className="flex items-center gap-3 min-w-0 text-left cursor-pointer" aria-label={`Open ${card.displayName}'s profile`}>
          <img src={card.avatar} alt="" className="w-10 h-10 rounded-full object-cover ring-2 ring-white/70 shrink-0 bg-zinc-800" loading="lazy" />
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 min-w-0">
              <span className="text-[14px] font-black text-white truncate">{card.displayName}</span>
              {card.isVerified && <VerifiedBadge size="xs" />}
            </span>
            <span className="flex items-center gap-1.5 text-[11px] text-zinc-400 font-semibold min-w-0">
              <span className="truncate">@{card.username}</span><span>•</span><span className="shrink-0">{ago(card.createdAt)}</span>
            </span>
          </span>
        </button>
        <div className="flex items-center gap-1.5 shrink-0">
          {unveiled && <span className="hidden min-[380px]:flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-400/15 ring-1 ring-emerald-300/50 text-[10px] font-black text-emerald-300"><Sparkles className="w-3 h-3" />Revealed</span>}
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/70 ring-1 ring-white/25 text-[11px] font-bold text-zinc-200 max-w-[120px]"><Tag className="w-3 h-3 text-yellow-300 shrink-0" /><span className="truncate">{card.category}</span></span>
          {card.isMine && (
            <button type="button" onClick={remove} disabled={busy === 'delete'} aria-label={confirmDelete ? 'Tap again to delete this card' : 'Delete this card'} title={confirmDelete ? 'Tap again to delete' : 'Delete'}
              className={`h-8 min-w-8 px-2 rounded-full flex items-center justify-center gap-1 cursor-pointer text-[11px] font-black transition-colors ${confirmDelete ? 'bg-red-500 text-white' : 'bg-white/10 text-zinc-300 hover:bg-white/20'}`}>
              {busy === 'delete' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}{confirmDelete && <span>Delete?</span>}
            </button>
          )}
        </div>
      </div>

      <div className="mb-3">
        <h3 className="text-[17px] leading-snug font-black text-white break-words">{card.title}</h3>
        <p className="mt-0.5 text-[12px] text-yellow-300 font-semibold break-words">💡 {card.hint || 'Scratch to reveal the secret photo!'}</p>
      </div>

      <div className="w-full flex items-center justify-between min-[440px]:justify-between justify-end gap-2 mb-2.5">
        <div className="hidden min-[440px]:flex items-center gap-1.5 text-[12px] font-semibold text-zinc-300 min-w-0">
          <span className="text-yellow-400">★</span>
          <span className="truncate block">{unveiled ? 'Photo Revealed! · 100% Unveiled' : 'Scratch a little to unveil'}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button type="button" aria-label={`X-Ray Peek ${card.title}`} title="Sneak peek through foil for 1.5s" onClick={peek} disabled={unveiled}
            className="h-8 px-2.5 rounded-full bg-black/70 ring-1 ring-white/30 text-[11px] font-black text-cyan-300 hover:ring-white/70 active:scale-95 transition disabled:opacity-35 flex items-center gap-1 cursor-pointer"><Eye className="w-3.5 h-3.5" /><span>Peek</span></button>
          <button type="button" aria-label={`Reseal foil on ${card.title}`} title="Re-seal foil to scratch again" onClick={() => { setResealCount((n) => n + 1); setPct(0); }}
            className="h-8 px-2.5 rounded-full bg-black/70 ring-1 ring-white/30 text-[11px] font-black text-zinc-100 hover:ring-white/70 active:scale-95 transition flex items-center gap-1 cursor-pointer"><RefreshCw className="w-3.5 h-3.5" /><span>Reseal</span></button>
          <button type="button" aria-label={`Instant reveal ${card.title}`} title="Instant full scratch reveal" onClick={() => setMagicCount((n) => n + 1)} disabled={unveiled}
            className="h-8 px-3 rounded-full bg-yellow-300 text-black text-[11px] font-black active:scale-95 transition disabled:opacity-35 flex items-center gap-1 cursor-pointer shadow-[0_6px_18px_-6px_rgba(250,204,21,0.8)]"><Sparkles className="w-3.5 h-3.5" /><span>Instant</span></button>
        </div>
      </div>

      <ScratchCanvas
        imageSrc={card.imageSrc}
        foil={card.foil}
        tool={tool}
        brushMultiplier={brushMultiplier}
        soundEnabled={soundEnabled}
        isPeeking={peeking}
        startOpen={startOpen}
        resealTrigger={resealCount}
        magicRevealTrigger={magicCount}
        onPercentageChange={setPct}
        onRevealed={onRevealed}
      />

      {card.scratchers > 0 && <p className="mt-2 text-[11px] font-semibold text-zinc-400 text-center" data-testid="scratch-count">{short(card.scratchers)} {card.scratchers === 1 ? 'person has' : 'people have'} scratched this card</p>}

      <div className="mt-3 space-y-2.5">
        <div className="grid grid-cols-5 gap-1.5" role="group" aria-label="Reactions">
          {REACTIONS.map(({ kind, label, title, icon: Icon, on, tint }) => {
            const active = card.mine.includes(kind);
            return (
              <button key={kind} type="button" onClick={() => tap(kind)} aria-label={label} aria-pressed={active} title={title} data-testid={`scratch-react-${kind}`}
                className={`h-10 rounded-2xl flex items-center justify-center gap-1 ring-1 text-[11px] font-black transition active:scale-95 cursor-pointer ${active ? on : 'bg-black/60 text-zinc-200 ring-white/15 hover:ring-white/45'}`}>
                <Icon className={`w-4 h-4 shrink-0 ${active ? 'fill-current' : tint}`} />
                <span className="leading-none">{short(card.counts[kind])}</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => onOpenNotes(card)} aria-label="Open Scratch Comments Drawer" title="View and leave chalk notes" data-testid="scratch-open-notes"
            className="flex-1 min-w-0 h-11 px-3.5 rounded-2xl bg-white/10 hover:bg-white/15 ring-1 ring-white/20 text-white flex items-center justify-center gap-2 text-[12px] font-black active:scale-[0.99] transition cursor-pointer">
            <MessageCircle className="w-4 h-4 shrink-0" /><span className="truncate">{card.comments > 0 ? `${short(card.comments)} ${card.comments === 1 ? 'note' : 'notes'}` : 'Leave a chalk note'}</span>
          </button>
          <button type="button" onClick={save} aria-label={card.saved ? 'Remove from Saved Cards' : 'Save to Scratchbook'} aria-pressed={card.saved} title="Save card" data-testid="scratch-save"
            className={`w-11 h-11 rounded-2xl flex items-center justify-center ring-1 transition active:scale-95 cursor-pointer ${card.saved ? 'bg-yellow-300 text-black ring-yellow-100/70' : 'bg-white/10 text-zinc-200 ring-white/20 hover:bg-white/15'}`}>
            {busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bookmark className={`w-4 h-4 ${card.saved ? 'fill-current' : ''}`} />}
          </button>
          <button type="button" onClick={share} aria-label="Share Scratch Card Link" title="Copy link"
            className="w-11 h-11 rounded-2xl flex items-center justify-center bg-white/10 text-zinc-200 ring-1 ring-white/20 hover:bg-white/15 active:scale-95 transition cursor-pointer">
            {copied ? <Check className="w-4 h-4 text-emerald-300" /> : <Link2 className="w-4 h-4" />}
          </button>
          <button type="button" onClick={download} aria-label="Download Scratch Card Image" title="Download photo" disabled={!unveiled}
            className="w-11 h-11 rounded-2xl flex items-center justify-center bg-white/10 text-zinc-200 ring-1 ring-white/20 hover:bg-white/15 active:scale-95 transition cursor-pointer disabled:opacity-35">
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>
    </article>
  );
};
