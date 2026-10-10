import React, { useCallback, useEffect, useState } from 'react';
import { Lightbulb, Loader2, RefreshCw } from 'lucide-react';
import { closeAppSuggestion, deleteAppSuggestion, fetchAdminAppSuggestions, replyAppSuggestion } from '../../services/api';
import type { AdminSuggestion, SuggestionCategory, SuggestionStatus } from '../../services/api';

// Admin panel → "Suggestions": everything members send from the Suggestion Box in the home menu.
// Replying notifies the member (and shows the reply under their message in the Suggestion Box); "Mark solved" closes it.

type StatusFilter = SuggestionStatus | 'all';
type CategoryFilter = SuggestionCategory | 'all';

const CATEGORY_LABEL: Record<SuggestionCategory, string> = { suggestion: 'Suggestion', improvement: 'Improvement', issue: 'Issue' };
const CATEGORY_STYLE: Record<SuggestionCategory, string> = {
  suggestion: 'bg-amber-500/20 text-amber-300',
  improvement: 'bg-sky-500/20 text-sky-300',
  issue: 'bg-rose-500/20 text-rose-300'
};

interface Props {
  // Lets the tab show how many messages still need an answer.
  onOpenCountChange?: (count: number) => void;
}

export const AdminSuggestionsPanel: React.FC<Props> = ({ onOpenCountChange }) => {
  const [items, setItems] = useState<AdminSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>('open');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchAdminAppSuggestions();
    if (res.success) {
      setItems(res.items);
      setLoadError(null);
      onOpenCountChange?.(res.items.filter((s) => s.status === 'open').length);
    } else {
      setLoadError(res.error || 'Could not load the suggestion box.');
    }
    setLoading(false);
  }, [onOpenCountChange]);
  useEffect(() => { void load(); }, [load]);

  const act = async (id: string, run: () => Promise<{ success: boolean; error?: string }>, clearDraft = false) => {
    setBusyId(id);
    setActionError(null);
    const res = await run();
    if (res.success) {
      if (clearDraft) setDrafts((prev) => ({ ...prev, [id]: '' }));
      await load();
    } else {
      setActionError(res.error || 'That did not work. Please try again.');
    }
    setBusyId(null);
  };

  const inCategory = (s: AdminSuggestion) => category === 'all' || s.category === category;
  const countFor = (key: StatusFilter) => items.filter((s) => inCategory(s) && (key === 'all' || s.status === key)).length;
  const shown = items.filter((s) => inCategory(s) && (status === 'all' || s.status === status));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-white flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-amber-300" /> Suggestion Box
        </span>
        <button onClick={() => void load()} className="text-xs text-noob hover:underline flex items-center gap-1 cursor-pointer font-medium">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>
      <p className="text-[11px] text-zinc-500 leading-snug">
        Sent from the Suggestion Box in the home menu. Reply to send the person a notification, and mark it solved once it is dealt with.
      </p>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {([['open', 'Open'], ['replied', 'Replied'], ['closed', 'Solved'], ['all', 'All']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setStatus(key)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap cursor-pointer border ${
              status === key ? 'border-noob text-noob bg-noob/10' : 'border-zinc-800 text-zinc-400 hover:text-white'
            }`}
          >
            {label} ({countFor(key)})
          </button>
        ))}
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {([['all', 'Everything'], ['suggestion', 'Suggestions'], ['improvement', 'Improvements'], ['issue', 'Issues']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setCategory(key)}
            className={`px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap cursor-pointer border ${
              category === key ? 'border-zinc-500 text-white bg-zinc-800' : 'border-zinc-800 text-zinc-500 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {actionError && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">{actionError}</p>}

      {loading && items.length === 0 ? (
        <div className="py-10 text-center"><Loader2 className="w-6 h-6 animate-spin text-noob mx-auto" /></div>
      ) : loadError ? (
        <div className="py-10 text-center text-xs text-red-400">{loadError}</div>
      ) : shown.length === 0 ? (
        <div className="py-10 text-center text-xs text-zinc-500">
          {items.length === 0 ? 'Nobody has sent anything yet.' : 'Nothing here.'}
        </div>
      ) : (
        <div className="space-y-2">
          {shown.map((s) => (
            <div key={s.id} className="p-3 bg-zinc-900/60 rounded-2xl border border-zinc-800 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <img src={s.avatar || '/noob-logo.svg.jpeg'} alt={s.username} className="w-6 h-6 rounded-full object-cover shrink-0" />
                  <span className="text-xs font-bold text-white truncate">@{s.username}</span>
                  <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full shrink-0 ${CATEGORY_STYLE[s.category]}`}>
                    {CATEGORY_LABEL[s.category]}
                  </span>
                </div>
                <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full shrink-0 ${
                  s.status === 'closed' ? 'bg-zinc-800 text-zinc-400' : s.status === 'replied' ? 'bg-emerald-500/20 text-noob' : 'bg-amber-500/20 text-amber-300'
                }`}>
                  {s.status === 'closed' ? 'solved' : s.status}
                </span>
              </div>
              <p className="text-xs text-zinc-300 whitespace-pre-wrap break-words">{s.message}</p>
              <p className="text-[10px] text-zinc-600">{new Date(s.createdAt).toLocaleString()}</p>
              {s.adminReply && <p className="text-[11px] text-zinc-500"><span className="text-zinc-400 font-bold">Your reply: </span>{s.adminReply}</p>}
              {s.status !== 'closed' && (
                <div className="flex items-center gap-1.5">
                  <input
                    value={drafts[s.id] || ''}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [s.id]: e.target.value }))}
                    placeholder={s.adminReply ? 'Send another reply…' : 'Reply — they get a notification'}
                    maxLength={2000}
                    className="flex-1 min-w-0 bg-zinc-950 text-xs text-white px-2.5 py-1.5 rounded-lg border border-zinc-800 outline-none focus:border-amber-400"
                  />
                  <button
                    onClick={() => void act(s.id, () => replyAppSuggestion(s.id, (drafts[s.id] || '').trim()), true)}
                    disabled={busyId === s.id || !(drafts[s.id] || '').trim()}
                    className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-bold rounded-lg cursor-pointer disabled:opacity-40"
                  >
                    Reply
                  </button>
                  <button
                    onClick={() => void act(s.id, () => closeAppSuggestion(s.id))}
                    disabled={busyId === s.id}
                    className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-bold rounded-lg cursor-pointer disabled:opacity-40 whitespace-nowrap"
                  >
                    Mark solved
                  </button>
                </div>
              )}
              <div className="flex justify-end">
                <button
                  onClick={() => { if (window.confirm('Delete this message for good? This cannot be undone.')) void act(s.id, () => deleteAppSuggestion(s.id)); }}
                  disabled={busyId === s.id}
                  className="text-[10px] font-bold text-zinc-600 hover:text-red-400 cursor-pointer disabled:opacity-40"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
