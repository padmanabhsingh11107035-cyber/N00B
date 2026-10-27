import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, CheckSquare, Phone, PhoneIncoming, PhoneMissed, PhoneOff, Square, Trash2, X } from 'lucide-react';
import { supabase } from '../../services/supabase';
import { callLine, groupByDay, type CallLogRow } from '../../utils/callLogs';

// Calls (Messages page > the call icon): every call that ended, was missed or was declined, newest first, grouped by day. A full page of its own (nothing of the page behind it shows), with "<"
// to go back. "Select" picks lines to delete, "Delete all" clears the list; a line disappears at once and comes back only if the server could not delete it.
export interface CallLogChat { id: string; name: string; avatar: string }

interface Props {
  chats: Record<string, CallLogChat>;
  currentUserId: string;
  onClose: () => void;
  onOpenChat: (chatId: string) => void;
}

const rpc = async <T,>(fn: string, args?: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.rpc(fn, args as never);
  if (error) throw new Error(error.message);
  return data as T;
};

export const CallLogsPage: React.FC<Props> = ({ chats, currentUserId, onClose, onOpenChat }) => {
  const [rows, setRows] = useState<CallLogRow[] | null>(null);
  const [error, setError] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirmAll, setConfirmAll] = useState(false);

  const load = useCallback(async () => {
    try { setRows((await rpc<CallLogRow[]>('my_call_logs', { p_limit: 300 })) || []); setError(''); }
    catch (e) { setRows([]); setError(/function|does not exist|schema cache/i.test(String((e as Error).message)) ? 'Call logs are not switched on yet. Try again in a little while.' : 'Could not load your calls. Check your connection.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // the page is a layer of its own: Back (the phone's too) closes it
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const remove = async (ids: string[] | null) => {
    const before = rows || [];
    const gone = ids ? new Set(ids) : null;
    setRows(gone ? before.filter((r) => !gone.has(r.id)) : []);   // at once
    setPicked(new Set()); setSelecting(false); setConfirmAll(false);
    try { await rpc<number>('delete_my_call_logs', { p_ids: ids }); }
    catch { setRows(before); setError('Could not delete. The calls were put back.'); }
  };
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const groups = useMemo(() => groupByDay(rows || []), [rows]);

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-zinc-950 text-white overscroll-none" data-testid="call-logs-page">
      <header className="msg-head force-dark shrink-0 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-6">
        <div className="flex items-center gap-2.5 max-w-2xl mx-auto w-full">
          <button type="button" onClick={onClose} aria-label="Back" data-testid="call-logs-back" className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer"><ChevronLeft className="w-6 h-6" /></button>
          <h1 className="text-2xl font-black tracking-tight">Calls</h1>
          <div className="ml-auto flex items-center gap-2">
            {selecting ? (
              <>
                <button type="button" disabled={picked.size === 0} onClick={() => void remove([...picked])} data-testid="call-logs-delete-selected" className="h-10 px-3.5 rounded-full bg-red-500/90 disabled:opacity-40 text-white text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"><Trash2 className="w-4 h-4" />Delete{picked.size ? ` (${picked.size})` : ''}</button>
                <button type="button" onClick={() => { setSelecting(false); setPicked(new Set()); }} aria-label="Cancel" className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer"><X className="w-5 h-5" /></button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => setSelecting(true)} disabled={!rows?.length} data-testid="call-logs-select" className="h-10 px-3.5 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-40 text-xs font-extrabold cursor-pointer">Select</button>
                <button type="button" onClick={() => setConfirmAll(true)} disabled={!rows?.length} aria-label="Delete all calls" title="Delete all" data-testid="call-logs-delete-all" className="w-10 h-10 rounded-full bg-white/10 hover:bg-red-500/80 disabled:opacity-40 flex items-center justify-center cursor-pointer"><Trash2 className="w-5 h-5" /></button>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="msg-sheet relative -mt-4 flex-1 min-h-0 rounded-t-[30px] overflow-y-auto overscroll-contain">
        <div className="max-w-2xl mx-auto w-full pb-24">
          {error && <p className="m-4 px-4 py-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-semibold">{error}</p>}
          {rows === null && <p className="p-10 text-center text-sm text-zinc-500">Loading…</p>}
          {rows && rows.length === 0 && !error && (
            <div className="p-12 text-center text-zinc-500 space-y-2" data-testid="call-logs-empty">
              <Phone className="w-10 h-10 mx-auto opacity-40" /><p className="text-sm font-bold text-zinc-300">No calls yet</p><p className="text-xs">Calls you make, miss or decline show up here.</p>
            </div>
          )}
          {groups.map((g) => (
            <section key={g.day}>
              <h2 className="px-5 pt-5 pb-1.5 text-[11px] font-black uppercase tracking-wider text-zinc-500">{g.label}</h2>
              {g.rows.map((r) => {
                const chat = chats[r.chatId];
                const line = callLine(r, currentUserId);
                const Icon = line.tone === 'bad' ? PhoneMissed : line.incoming ? PhoneIncoming : r.kind === 'declined' ? PhoneOff : Phone;
                const on = picked.has(r.id);
                return (
                  <button key={r.id} type="button" data-testid="call-log-row" onClick={() => (selecting ? toggle(r.id) : chat && onOpenChat(r.chatId))}
                    className={`w-full flex items-center gap-3.5 px-5 py-3 text-left cursor-pointer hover:bg-white/5 ${on ? 'bg-emerald-400/10' : ''}`}>
                    {selecting && (on ? <CheckSquare className="w-5 h-5 text-emerald-300 shrink-0" /> : <Square className="w-5 h-5 text-zinc-600 shrink-0" />)}
                    <img src={chat?.avatar || '/noob-logo-circle.png'} alt="" className="w-12 h-12 rounded-full object-cover ring-1 ring-white/10 shrink-0" />
                    <span className="flex-1 min-w-0">
                      <span className={`block text-[15px] font-bold truncate ${line.tone === 'bad' ? 'text-red-400' : 'text-white'}`}>{chat?.name || 'A chat'}</span>
                      <span className={`flex items-center gap-1.5 text-xs ${line.tone === 'bad' ? 'text-red-400/90' : 'text-zinc-400'}`}><Icon className="w-3.5 h-3.5 shrink-0" />{line.text}</span>
                    </span>
                    <span className="text-[11px] text-zinc-500 shrink-0">{new Date(r.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>
                  </button>
                );
              })}
            </section>
          ))}
        </div>
      </div>

      {confirmAll && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-5 bg-black/70" role="dialog" aria-modal="true">
          <div className="w-full max-w-xs rounded-[28px] bg-zinc-900 border border-white/10 p-5 text-center space-y-3">
            <p className="text-base font-black">Delete all calls?</p>
            <p className="text-xs text-zinc-400">This clears your call list. It does not delete any chat, and other people keep their own list.</p>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setConfirmAll(false)} className="flex-1 py-2.5 rounded-full border border-white/20 text-sm font-bold cursor-pointer">Cancel</button>
              <button type="button" onClick={() => void remove(null)} data-testid="call-logs-confirm-all" className="flex-1 py-2.5 rounded-full bg-red-500 text-white text-sm font-extrabold cursor-pointer">Delete all</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
