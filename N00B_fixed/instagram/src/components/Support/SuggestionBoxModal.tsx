import React, { useCallback, useEffect, useState } from 'react';
import { Bug, CheckCircle2, Lightbulb, Loader2, Send, Sparkles, X } from 'lucide-react';
import { fetchMyAppSuggestions, submitAppSuggestion } from '../../services/api';
import type { MySuggestion, SuggestionCategory } from '../../services/api';
import { formatRelativeTime } from '../../utils/formatTime';

// The Suggestion Box (home menu): a member sends a suggestion, an improvement idea or an issue, and sees NOOB's reply to
// their earlier messages here. The NOOB administrator reads and answers them in the admin panel's "Suggestions" tab.

const CATEGORIES: Array<{ id: SuggestionCategory; label: string; hint: string; Icon: React.FC<{ className?: string }>; tone: string; active: string }> = [
  { id: 'suggestion', label: 'Suggestion', hint: 'A new idea or feature', Icon: Lightbulb, tone: 'text-amber-300', active: 'border-amber-400 bg-amber-500/10' },
  { id: 'improvement', label: 'Improvement', hint: 'Make something better', Icon: Sparkles, tone: 'text-sky-300', active: 'border-sky-400 bg-sky-500/10' },
  { id: 'issue', label: 'Issue', hint: 'Something is not working', Icon: Bug, tone: 'text-rose-300', active: 'border-rose-400 bg-rose-500/10' }
];

const MAX = 2000;

interface Props {
  onClose: () => void;
}

export const SuggestionBoxModal: React.FC<Props> = ({ onClose }) => {
  const [category, setCategory] = useState<SuggestionCategory>('suggestion');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [mine, setMine] = useState<MySuggestion[] | null>(null);

  const load = useCallback(async () => {
    const res = await fetchMyAppSuggestions();
    setMine(res.success ? res.items : []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = message.trim();
    if (text.length < 5) { setError('Please write a little more (at least 5 characters).'); return; }
    setSending(true);
    setError(null);
    setSent(false);
    const res = await submitAppSuggestion(category, text);
    setSending(false);
    if (!res.success) { setError(res.error || 'Could not send that right now. Please try again.'); return; }
    setMessage('');
    setSent(true);
    void load();
  };

  const catOf = (id: SuggestionCategory) => CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[0];

  return (
    <div className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="p-4 bg-zinc-900/80 border-b border-zinc-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
              <Lightbulb className="w-4.5 h-4.5 text-amber-300" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-black text-white leading-tight">Suggestion Box</h2>
              <p className="text-[11px] text-zinc-400 leading-tight">Tell us what to add, improve or fix</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-white cursor-pointer">
            <X className="w-4.5 h-4.5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <form onSubmit={send} className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategory(c.id)}
                  className={`p-2.5 rounded-2xl border text-left cursor-pointer transition-colors ${category === c.id ? c.active : 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-700'}`}
                >
                  <c.Icon className={`w-4 h-4 ${c.tone}`} />
                  <span className="text-xs font-bold text-white block mt-1">{c.label}</span>
                  <span className="text-[10px] text-zinc-500 block leading-tight">{c.hint}</span>
                </button>
              ))}
            </div>

            <div>
              <textarea
                value={message}
                onChange={(e) => { setMessage(e.target.value.slice(0, MAX)); setSent(false); }}
                rows={5}
                maxLength={MAX}
                placeholder={category === 'issue' ? 'What went wrong? Where in the app, and what did you expect?' : category === 'improvement' ? 'What should work better, and how?' : 'What would you like to see in NOOB?'}
                className="w-full bg-zinc-900 text-sm text-white px-3.5 py-3 rounded-2xl border border-zinc-800 focus:border-noob outline-none resize-none placeholder:text-zinc-600"
              />
              <p className="text-[10px] text-zinc-600 text-right mt-1">{message.length}/{MAX}</p>
            </div>

            {error && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">{error}</p>}
            {sent && (
              <p className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-3 py-2 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" /> Thank you! NOOB reads every message and will reply here if needed.
              </p>
            )}

            <button
              type="submit"
              disabled={sending || message.trim().length < 5}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-noob to-noob-strong text-white font-black text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {sending ? 'Sending…' : 'Send to NOOB'}
            </button>
          </form>

          <div className="space-y-2">
            <p className="text-[11px] font-bold text-zinc-300">Your messages</p>
            {mine === null ? (
              <div className="py-4 text-center"><Loader2 className="w-5 h-5 animate-spin text-noob mx-auto" /></div>
            ) : mine.length === 0 ? (
              <p className="text-[11px] text-zinc-500">Nothing sent yet.</p>
            ) : (
              mine.map((s) => {
                const c = catOf(s.category);
                return (
                  <div key={s.id} className="p-3 bg-zinc-900/60 rounded-2xl border border-zinc-800 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-[10px] font-black uppercase flex items-center gap-1 ${c.tone}`}><c.Icon className="w-3 h-3" /> {c.label}</span>
                      <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full ${
                        s.status === 'closed' ? 'bg-zinc-800 text-zinc-400' : s.status === 'replied' ? 'bg-emerald-500/20 text-noob' : 'bg-amber-500/20 text-amber-300'
                      }`}>
                        {s.status === 'closed' ? 'solved' : s.status === 'replied' ? 'replied' : 'sent'}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-300 whitespace-pre-wrap break-words">{s.message}</p>
                    <p className="text-[10px] text-zinc-600">{formatRelativeTime(s.createdAt)}</p>
                    {s.adminReply && (
                      <div className="mt-1 p-2.5 rounded-xl bg-noob/10 border border-noob/25">
                        <p className="text-[10px] font-black text-noob uppercase">NOOB replied</p>
                        <p className="text-xs text-zinc-200 whitespace-pre-wrap break-words mt-0.5">{s.adminReply}</p>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
