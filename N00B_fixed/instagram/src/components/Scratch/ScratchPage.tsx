import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Bookmark, Check, CircleHelp, Coins, Disc, Eye, Key, Loader2, Plus, RefreshCw, Share2, Sparkles, Upload, Volume2, VolumeX, Wand2, X } from 'lucide-react';
import { siteOrigin } from '../../utils/siteUrl';
import { fetchUserById } from '../../services/supabaseApi';
import type { User } from '../../types';
import { ScratchCardView } from './ScratchCard';
import { ScratchNotes } from './ScratchNotes';
import { ScratchUpload } from './ScratchUpload';
import { failed, loadFeed, type ScratchCard } from './scratchData';
import { SCRATCH_TOOLS, type ScratchTool } from './scratchEngine';

// NOOB Scratch Reveal: a page of its own, opened from the three-line menu on Home. People post a picture sealed under scratch foil and everybody else scratches it away.
// The arrow at the top left takes the person back to where they came from. The feed, the reactions, the notes and the saved cards are real (see scratchData.ts).
const FILTERS = ['All', 'Music', 'Fashion', 'Cute', 'Photography'];
const PAGE = 12;
const TOOL_KEY = 'noob_scratch_tool';
const SOUND_KEY = 'noob_scratch_sound';

const TOOL_BUTTONS: Array<{ id: string; label: string; title: string; icon: React.ElementType; on: string; shape: string }> = [
  { id: 'coin', label: 'Select Lucky Coin Edge', title: 'Lucky Coin (Wide)', icon: Coins, on: 'bg-amber-300 text-black', shape: 'rounded-xl' },
  { id: 'key', label: 'Select Brass Car Key Edge', title: 'Car Key (Sharp)', icon: Key, on: 'bg-cyan-300 text-black', shape: 'rounded-xl' },
  { id: 'magic_wand', label: 'Select Magic Wand Edge', title: 'Magic Wand (Sparkle)', icon: Wand2, on: 'bg-purple-300 text-black', shape: 'rounded-xl' },
  { id: 'guitar_pick', label: 'Select Celluloid Guitar Pick Edge', title: 'Guitar Pick (Smooth)', icon: Disc, on: 'bg-pink-300 text-black', shape: 'rounded-xl' }
];

const read = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* not remembered */ } };

interface Props {
  onClose: () => void;
  /** open somebody's profile (the app's own) */
  onNavigateToProfile?: (user: User) => void;
}

export const ScratchPage: React.FC<Props> = ({ onClose, onNavigateToProfile }) => {
  const [cards, setCards] = useState<ScratchCard[] | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('All');
  const [savedOnly, setSavedOnly] = useState(false);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [toolId, setToolId] = useState(() => (read(TOOL_KEY) && SCRATCH_TOOLS[read(TOOL_KEY) as string] ? (read(TOOL_KEY) as string) : 'coin'));
  const [sound, setSound] = useState(() => read(SOUND_KEY) !== 'off');
  const [notesFor, setNotesFor] = useState<ScratchCard | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: 'good' | 'bad' } | null>(null);
  const [copied, setCopied] = useState(false);
  const seq = useRef(0);
  const toastTimer = useRef<number | undefined>(undefined);
  const tool: ScratchTool = SCRATCH_TOOLS[toolId] || SCRATCH_TOOLS.coin;

  const say = useCallback((text: string, tone: 'good' | 'bad' = 'good') => {
    setToast({ text, tone });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setError('');
    const r = await loadFeed({ category: filter, saved: savedOnly, limit: PAGE });
    if (mine !== seq.current) return;
    if (!failed(r)) { setCards(r.cards); setMore(r.cards.length >= PAGE); } else { setCards((c) => c ?? []); setError(r.error); }
  }, [filter, savedOnly]);

  useEffect(() => { setCards(null); void load(); }, [load]);

  const loadMore = async () => {
    if (!cards || !cards.length || loadingMore) return;
    setLoadingMore(true);
    const r = await loadFeed({ category: filter, saved: savedOnly, before: cards[cards.length - 1].createdAt, limit: PAGE });
    if (!failed(r)) {
      setCards((cur) => { const have = new Set((cur || []).map((c) => c.id)); return [...(cur || []), ...r.cards.filter((c) => !have.has(c.id))]; });
      setMore(r.cards.length >= PAGE);
    } else say(r.error, 'bad');
    setLoadingMore(false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !notesFor && !uploadOpen && !helpOpen) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, notesFor, uploadOpen, helpOpen]);

  const update = useCallback((next: ScratchCard) => {
    setCards((list) => (list ? list.map((c) => (c.id === next.id ? next : c)) : list));
    setNotesFor((n) => (n && n.id === next.id ? next : n));
    if (savedOnly && !next.saved) setCards((list) => (list ? list.filter((c) => c.id !== next.id) : list));
  }, [savedOnly]);

  const openProfile = async (userId: string) => {
    if (!onNavigateToProfile) return;
    const u = await fetchUserById(userId);
    if (u) { onNavigateToProfile(u); onClose(); } else say('That profile could not be opened.', 'bad');
  };

  const shareFeed = async () => {
    const url = `${siteOrigin()}/`;
    try { if (navigator.share) { await navigator.share({ title: 'NOOB Scratch Reveal', text: 'Scratch to reveal secret photos on NOOB', url }); return; } } catch { return; }
    try { await navigator.clipboard.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 2000); say('Feed link copied! Share with your friends.', 'good'); }
    catch { say('Copying is not available here.', 'bad'); }
  };

  const shown = useMemo(() => cards || [], [cards]);

  return (
    <div className="scratch-page force-dark fixed inset-0 z-[205] text-white flex flex-col" role="dialog" aria-label="Scratch Reveal" data-testid="scratch-page"
      style={{ backgroundColor: '#08080a', backgroundImage: 'linear-gradient(rgba(8,8,10,0.82), rgba(8,8,10,0.82)), url(/brand/doodle-white.webp)', backgroundSize: 'auto, 480px auto' }}>
      <header className="shrink-0 px-3 sm:px-4 pt-[max(0.6rem,env(safe-area-inset-top))] pb-2.5 border-b border-white/10 bg-black/45 backdrop-blur-xl">
        <div className="max-w-2xl mx-auto flex items-center gap-2.5">
          <button type="button" onClick={onClose} aria-label="Back to the menu" title="Back" data-testid="scratch-back"
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 ring-1 ring-white/15 flex items-center justify-center cursor-pointer active:scale-95 transition shrink-0"><ArrowLeft className="w-5 h-5" /></button>
          <div className="min-w-0 flex-1">
            <h1 className="text-[11px] sm:text-[13px] font-black tracking-wide uppercase leading-tight flex items-start gap-1.5"><span className="text-amber-300 text-base leading-none shrink-0">✦</span><span>NOOB SOCIALS: SCRATCH-TO-REVEAL ENGINE</span></h1>
            <p className="text-[10px] sm:text-[11px] text-zinc-300 font-semibold mt-0.5 leading-snug">Swipe your finger or mouse over the foil to unveil secret photos</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button type="button" aria-label={sound ? 'Mute scratch sounds' : 'Enable scratch sounds'} title={sound ? 'Mute scratch sound FX' : 'Enable scratch sound FX'} aria-pressed={sound} onClick={() => { setSound((s) => { write(SOUND_KEY, s ? 'off' : 'on'); return !s; }); }}
              className="w-9 h-9 rounded-full bg-white/10 ring-1 ring-white/15 flex items-center justify-center cursor-pointer active:scale-95 transition">{sound ? <Volume2 className="w-4 h-4 text-emerald-300" /> : <VolumeX className="w-4 h-4 text-zinc-500" />}</button>
            <button type="button" aria-label="Share Feed" title="Share Feed" onClick={shareFeed} className="hidden min-[400px]:flex w-9 h-9 rounded-full bg-white/10 ring-1 ring-white/15 items-center justify-center cursor-pointer active:scale-95 transition">{copied ? <Check className="w-4 h-4 text-emerald-300" /> : <Share2 className="w-4 h-4" />}</button>
            <button type="button" aria-label="Upload New Mystery Photo" title="Post a new scratch photo card" onClick={() => setUploadOpen(true)} data-testid="scratch-add"
              className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center cursor-pointer active:scale-95 transition shadow-[0_6px_18px_-6px_rgba(255,255,255,0.7)]"><Plus className="w-5 h-5 stroke-[2.6]" /></button>
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <main className="w-full max-w-2xl mx-auto px-3 sm:px-4 pt-3 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
          <div className="mb-4 flex flex-col gap-2.5 select-none">
            <nav aria-label="Feed filter" className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 no-scrollbar">
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400 whitespace-nowrap mr-0.5">FEED:</span>
              {FILTERS.map((c) => (
                <button key={c} type="button" aria-label={`Filter by ${c}`} aria-pressed={filter === c && !savedOnly} onClick={() => { setSavedOnly(false); setFilter(c); }}
                  className={`h-8 px-3.5 rounded-full text-[11px] font-black uppercase whitespace-nowrap transition active:scale-95 cursor-pointer ring-1 ${filter === c && !savedOnly ? 'bg-white text-black ring-white' : 'bg-white/[0.07] text-zinc-200 ring-white/15 hover:ring-white/50'}`}>{c}</button>
              ))}
              <button type="button" aria-label="Show my saved cards" aria-pressed={savedOnly} onClick={() => setSavedOnly((s) => !s)} data-testid="scratch-saved-filter"
                className={`h-8 px-3 rounded-full text-[11px] font-black uppercase whitespace-nowrap flex items-center gap-1 transition active:scale-95 cursor-pointer ring-1 ${savedOnly ? 'bg-yellow-300 text-black ring-yellow-100' : 'bg-white/[0.07] text-zinc-200 ring-white/15 hover:ring-white/50'}`}><Bookmark className={`w-3 h-3 ${savedOnly ? 'fill-current' : ''}`} />Saved</button>
            </nav>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 bg-white/[0.06] ring-1 ring-white/15 rounded-2xl px-2 py-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400 mx-1">EDGE:</span>
                {TOOL_BUTTONS.map(({ id, label, title, icon: Icon, on, shape }) => (
                  <button key={id} type="button" aria-label={label} title={title} aria-pressed={toolId === id} onClick={() => { setToolId(id); write(TOOL_KEY, id); }}
                    className={`w-8 h-8 ${shape} flex items-center justify-center transition active:scale-95 cursor-pointer ${toolId === id ? on : 'bg-black/50 text-zinc-400 hover:text-white ring-1 ring-white/10'}`}><Icon className="w-4 h-4" /></button>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => setHelpOpen(true)} aria-label="How Scratch Reveal works" title="How it works" className="w-9 h-9 rounded-full bg-white/[0.07] ring-1 ring-white/15 flex items-center justify-center cursor-pointer active:scale-95"><CircleHelp className="w-4 h-4 text-zinc-300" /></button>
                <button type="button" onClick={() => { setCards(null); void load(); }} aria-label="Refresh the feed" title="Refresh" className="w-9 h-9 rounded-full bg-white/[0.07] ring-1 ring-white/15 flex items-center justify-center cursor-pointer active:scale-95"><RefreshCw className="w-4 h-4 text-zinc-300" /></button>
              </div>
            </div>
          </div>

          {cards === null ? (
            <div className="space-y-6" aria-busy="true" aria-label="Loading cards">
              {[0, 1].map((i) => <div key={i} className="rounded-[28px] ring-1 ring-white/10 bg-white/[0.04] p-4"><div className="h-10 w-2/3 rounded-xl bg-white/10 animate-pulse mb-3" /><div className="aspect-[4/5] rounded-[22px] bg-white/10 animate-pulse" /></div>)}
            </div>
          ) : error && shown.length === 0 ? (
            <div className="text-center py-12 px-6 rounded-[28px] bg-white/[0.05] ring-1 ring-white/15">
              <p className="text-sm font-black mb-1">The cards could not be loaded</p>
              <p className="text-xs text-zinc-400 font-semibold mb-4">{error}</p>
              <button type="button" onClick={() => { setCards(null); void load(); }} className="h-10 px-5 rounded-full bg-white text-black text-xs font-black cursor-pointer active:scale-95">Try again</button>
            </div>
          ) : shown.length === 0 ? (
            <div className="text-center py-12 px-6 rounded-[28px] bg-white/[0.05] ring-1 ring-white/15" data-testid="scratch-empty">
              <p className="text-sm font-black mb-1">{savedOnly ? 'No saved cards yet' : 'No secret cards in this category yet!'}</p>
              <p className="text-xs text-zinc-400 font-semibold mb-4">{savedOnly ? 'Tap the bookmark on a card to keep it here.' : 'Be the first to upload and seal a photo with mystery foil.'}</p>
              {!savedOnly && <button type="button" onClick={() => setUploadOpen(true)} className="h-10 px-5 rounded-full bg-yellow-300 text-black text-xs font-black cursor-pointer active:scale-95 inline-flex items-center gap-1.5"><Upload className="w-3.5 h-3.5" />+ Post a Scratch Card</button>}
            </div>
          ) : (
            <section aria-label="Scratch card feed">
              {shown.map((c) => (
                <ScratchCardView key={c.id} card={c} tool={tool} brushMultiplier={1} soundEnabled={sound} onChange={update}
                  onDeleted={(id) => setCards((l) => (l ? l.filter((x) => x.id !== id) : l))} onOpenNotes={setNotesFor} onOpenProfile={openProfile} say={say} />
              ))}
              {more && (
                <div className="flex justify-center pt-1 pb-4">
                  <button type="button" onClick={loadMore} disabled={loadingMore} className="h-11 px-6 rounded-full bg-white/10 ring-1 ring-white/25 text-xs font-black flex items-center gap-2 cursor-pointer active:scale-95 disabled:opacity-60">
                    {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}{loadingMore ? 'Loading…' : 'More cards'}
                  </button>
                </div>
              )}
            </section>
          )}
        </main>
      </div>

      {toast && (
        <div role="status" className={`fixed left-1/2 -translate-x-1/2 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-[300] px-4 py-2.5 rounded-full text-xs font-black shadow-2xl ring-1 max-w-[90vw] text-center ${toast.tone === 'good' ? 'bg-emerald-400 text-black ring-emerald-100/60' : 'bg-red-500 text-white ring-red-200/50'}`}>{toast.text}</div>
      )}

      {notesFor && <ScratchNotes card={notesFor} onClose={() => setNotesFor(null)} onCard={update} />}
      {uploadOpen && <ScratchUpload onClose={() => setUploadOpen(false)} onPosted={(c) => { setSavedOnly(false); setFilter('All'); setCards((l) => [c, ...(l || [])]); say('Your scratch card is live!', 'good'); }} />}
      {helpOpen && (
        <div className="fixed inset-0 z-[260] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm" onClick={() => setHelpOpen(false)} role="dialog" aria-modal="true" aria-label="How Scratch Reveal Works">
          <div className="force-dark w-full sm:max-w-md rounded-t-[28px] sm:rounded-[28px] bg-zinc-950 ring-1 ring-white/20 shadow-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-white/10">
              <div><h3 className="text-[14px] font-black">How Scratch Reveal Works</h3><p className="text-[11px] text-zinc-400 font-semibold">Tactile photo mystery cards</p></div>
              <button type="button" onClick={() => setHelpOpen(false)} aria-label="Close help" className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className="py-4 space-y-2.5 text-xs text-zinc-200">
              {[
                { icon: Coins, tint: 'text-amber-400', head: '1. Drag to Scratch', body: 'Swipe across the card with your finger or mouse. Choose between Lucky Coin, Car Key, Guitar Pick, or Magic Wand.' },
                { icon: Sparkles, tint: 'text-yellow-300', head: '2. Unlock Milestone at 72%', body: 'Scratching past 72% unlocks the full photo with celebratory confetti and verified post status!' },
                { icon: Eye, tint: 'text-cyan-300', head: '3. X-Ray Sneak Peek', body: 'Need a spoiler? Hit X-Ray Peek to temporarily make the foil translucent for 1.5 seconds.' },
                { icon: Upload, tint: 'text-emerald-400', head: '4. Upload & Foil Any Photo', body: 'Click the Upload button to seal any picture with signature Noob Socials doodle foil!' }
              ].map(({ icon: Icon, tint, head, body }) => (
                <div key={head} className="flex items-start gap-3 p-3 rounded-2xl bg-white/[0.05] ring-1 ring-white/10"><Icon className={`w-5 h-5 shrink-0 mt-0.5 ${tint}`} /><div><strong className="text-white block text-[12px] font-black">{head}</strong><span className="font-medium leading-snug">{body}</span></div></div>
              ))}
            </div>
            <button type="button" onClick={() => setHelpOpen(false)} className="w-full h-12 rounded-2xl bg-white text-black text-[13px] font-black active:scale-[0.99] cursor-pointer">Got It, Let's Scratch!</button>
          </div>
        </div>
      )}
    </div>
  );
};
