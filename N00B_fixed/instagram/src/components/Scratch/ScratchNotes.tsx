import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, MessageCircle, Send, Trash2, X } from 'lucide-react';
import { VerifiedBadge } from '../Common/VerifiedBadge';
import { addNote, ago, deleteNote, failed, loadNotes, type ScratchCard, type ScratchNote } from './scratchData';

// The "Chalk Notes & Clues" sheet of one card: the notes people left (newest first), and a box to leave one. Real: saved on the server.
interface Props {
  card: ScratchCard;
  onClose: () => void;
  /** the card changed (its note count) */
  onCard: (card: ScratchCard) => void;
}

export const ScratchNotes: React.FC<Props> = ({ card, onClose, onCard }) => {
  const [notes, setNotes] = useState<ScratchNote[] | null>(null);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const r = await loadNotes(card.id);
    if (!failed(r)) { setNotes(r.notes); setError(''); } else { setNotes((n) => n ?? []); setError(r.error); }
  }, [card.id]);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    const r = await addNote(card.id, body);
    if (!failed(r)) { setText(''); onCard(r.card); await load(); listRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); inputRef.current?.focus(); }
    else setError(r.error);
    setSending(false);
  };

  const remove = async (n: ScratchNote) => {
    const before = notes;
    setNotes((list) => (list ? list.filter((x) => x.id !== n.id) : list));
    const r = await deleteNote(n.id);
    if (!failed(r)) onCard({ ...card, comments: Math.max(0, card.comments - 1) });
    else { setNotes(before); setError(r.error); }
  };

  return createPortal(
    <div className="fixed inset-0 z-[260] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal="true" aria-label="Chalk Notes & Clues" data-testid="scratch-notes">
      <div className="force-dark w-full sm:max-w-lg max-h-[85dvh] sm:max-h-[78dvh] flex flex-col rounded-t-[28px] sm:rounded-[28px] bg-zinc-950 ring-1 ring-white/20 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="shrink-0 flex items-center justify-between gap-3 px-4 pt-4 pb-3 border-b border-white/10">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-cyan-300/15 ring-1 ring-cyan-300/40 flex items-center justify-center shrink-0"><MessageCircle className="w-4 h-4 text-cyan-300" /></span>
            <div className="min-w-0">
              <h3 className="text-[14px] font-black text-white truncate">Chalk Notes &amp; Clues</h3>
              <p className="text-[11px] text-zinc-400 font-semibold">{card.comments} community notes on this scratch reveal</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close comments drawer" className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-zinc-200 flex items-center justify-center cursor-pointer active:scale-95"><X className="w-4 h-4" /></button>
        </div>

        <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-3">
          {notes === null ? (
            <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 text-zinc-400 animate-spin" /></div>
          ) : notes.length === 0 ? (
            <div className="text-center py-8"><p className="text-sm font-semibold text-zinc-400">No notes yet! Be the first to leave a doodle clue.</p></div>
          ) : notes.map((n) => (
            <div key={n.id} className="flex gap-3" data-testid="scratch-note">
              <img src={n.avatar} alt="" className="w-8 h-8 rounded-full object-cover ring-1 ring-white/40 shrink-0 bg-zinc-800" loading="lazy" />
              <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md bg-white/[0.07] ring-1 ring-white/10 px-3 py-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[12px] font-black text-white truncate">{n.displayName}</span>
                  {n.isVerified && <VerifiedBadge size="xs" />}
                  <span className="text-[10px] font-semibold text-zinc-500 shrink-0">{ago(n.createdAt)}</span>
                  {n.canDelete && <button type="button" onClick={() => remove(n)} aria-label="Delete this note" className="ml-auto p-1 -mr-1 text-zinc-500 hover:text-red-400 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>}
                </div>
                <p className="mt-0.5 text-[13px] text-zinc-100 break-words whitespace-pre-wrap">{n.body}</p>
              </div>
            </div>
          ))}
        </div>

        {error && <p className="shrink-0 px-4 pb-1 text-[11px] font-semibold text-red-300" role="alert">{error}</p>}
        <form onSubmit={send} className="shrink-0 flex items-center gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-white/10 bg-zinc-950">
          <input ref={inputRef} value={text} onChange={(e) => setText(e.target.value.slice(0, 300))} placeholder="Write a scratch clue or reaction..." maxLength={300} data-testid="scratch-note-input"
            className="flex-1 min-w-0 h-11 rounded-full bg-white/10 ring-1 ring-white/20 focus:ring-white/60 outline-none px-4 text-[13px] text-white placeholder:text-zinc-500" />
          <button type="submit" disabled={!text.trim() || sending} aria-label="Submit chalk note" data-testid="scratch-note-send"
            className="h-11 px-4 rounded-full bg-white text-black text-[12px] font-black flex items-center gap-1.5 disabled:opacity-40 active:scale-95 transition cursor-pointer">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}<span>Post</span>
          </button>
        </form>
      </div>
    </div>,
    document.body
  );
};
