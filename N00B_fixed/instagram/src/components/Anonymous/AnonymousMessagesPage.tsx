import React, { useCallback, useEffect, useRef, useState } from 'react';
import { VenetianMask, X, Flag, RefreshCw, Send, Trash2, ShieldCheck, Loader2, Check, AlertCircle, Ban } from 'lucide-react';
import type { User } from '../../types';
import { isMainAdmin } from '../../adminAccess';
import {
  ANON_MAX_LENGTH,
  fetchAnonMessages,
  postAnonMessage,
  reportAnonMessage,
  fetchAnonMessagesAdmin,
  adminRemoveAnonMessage,
  adminDismissAnonMessageReports,
  type AnonMessage,
  type AnonAdminMessage
} from '../../services/api';

// Anonymous Messages: a public feed of plain-text messages that show no author - an anonymous icon, the word "Anonymous", the date and time, and the text.
//
// What this page knows about a message is {id, body, createdAt} and nothing else: the database never sends an author, a username, a picture or an e-mail (see migration
// 20261015000002), so none of it can end up in this page, its state or its network traffic. A message is always drawn as TEXT (never as HTML), so nothing a person types
// can run as a script. Reading needs no account; sharing and reporting do. The main administrator additionally sees report counts and can remove a message (and block its
// author without learning who it is) or clear its reports.

type Item = AnonMessage & Partial<Pick<AnonAdminMessage, 'hidden' | 'reportCount' | 'reasons'>>;

interface Props {
  /** null for a visitor who is not logged in (they can read; the page asks them to log in to share or report) */
  currentUser: User | null;
  onClose: () => void;
  /** a visitor who is not logged in taps "Log in to share" */
  onLogin?: () => void;
}

const REASONS = ['Spam or advertising', 'Harassment or hate', 'Self-harm or danger', 'Something else'];
const PAGE_SIZE = 20;
const REFRESH_MS = 60_000;

const newKey = (): string => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);
const codePoints = (s: string): number => Array.from(s).length;
const whenLabel = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};
const newestFirst = (a: Item, b: Item): number => (a.createdAt === b.createdAt ? (a.id < b.id ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1);
const dedupe = (list: Item[]): Item[] => { const seen = new Set<string>(); return list.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true))); };
const friendly = (e: unknown, fallback: string): string => (e instanceof Error && e.message && !/^(TypeError|NetworkError|Failed to fetch)/i.test(e.message) ? e.message : fallback);

export const AnonymousMessagesPage: React.FC<Props> = ({ currentUser, onClose, onLogin }) => {
  const isAdmin = !!currentUser && isMainAdmin(currentUser);
  const loggedIn = !!currentUser;

  const [items, setItems] = useState<Item[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorText, setErrorText] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [onlyReported, setOnlyReported] = useState(false);
  const [toast, setToast] = useState<{ text: string; kind: 'ok' | 'err' } | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const loadId = useRef(0);
  const busyMore = useRef(false);
  const busyRefresh = useRef(false);
  const toastTimer = useRef<number | undefined>(undefined);

  const say = useCallback((text: string, kind: 'ok' | 'err' = 'ok') => {
    setToast({ text, kind });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3400);
  }, []);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const fetchPage = useCallback(
    (before?: { createdAt: string; id: string }) => (isAdmin ? fetchAnonMessagesAdmin({ limit: PAGE_SIZE, onlyReported, before }) : fetchAnonMessages({ limit: PAGE_SIZE, before })),
    [isAdmin, onlyReported]
  );

  // The first page. "initial" shows the loading skeleton; "refresh" / "quiet" keep what is on screen and only bring in what is new (and drop what was removed).
  const loadFirst = useCallback(async (mode: 'initial' | 'refresh' | 'quiet') => {
    const my = ++loadId.current;
    if (mode === 'initial') { setStatus('loading'); setItems([]); setHasMore(false); }
    if (mode === 'refresh') setRefreshing(true);
    try {
      const res = await fetchPage();
      if (my !== loadId.current) return;
      const fresh = res.messages as Item[];
      setItems((prev) => {
        if (mode === 'initial' || prev.length === 0) return dedupe(fresh);
        const ids = new Set(fresh.map((m) => m.id));
        const last = fresh[fresh.length - 1];
        // the older pages that were already loaded stay (they are older than everything just fetched)
        const tail = last ? prev.filter((m) => !ids.has(m.id) && newestFirst(m, last) > 0) : [];
        return dedupe([...fresh, ...tail]);
      });
      setHasMore((prevMore) => (mode === 'initial' ? res.hasMore : res.hasMore || prevMore));
      setStatus('ready');
    } catch (e) {
      if (my !== loadId.current) return;
      if (mode === 'initial') { setErrorText(friendly(e, 'Could not load the messages. Please check your connection and try again.')); setStatus('error'); }
      else if (mode === 'refresh') say(friendly(e, 'Could not refresh right now.'), 'err');
    } finally {
      if (my === loadId.current) setRefreshing(false);
    }
  }, [fetchPage, say]);

  const loadMore = useCallback(async () => {
    if (busyMore.current || !hasMore || items.length === 0) return;
    busyMore.current = true;
    setLoadingMore(true);
    const my = loadId.current;
    try {
      const last = items[items.length - 1];
      const res = await fetchPage({ createdAt: last.createdAt, id: last.id });
      if (my !== loadId.current) return;
      setItems((prev) => dedupe([...prev, ...(res.messages as Item[])]));
      setHasMore(res.hasMore);
    } catch (e) {
      say(friendly(e, 'Could not load more messages.'), 'err');
    } finally {
      busyMore.current = false;
      setLoadingMore(false);
    }
  }, [fetchPage, hasMore, items, say]);

  // first load, and again when the administrator flips "reported only"
  useEffect(() => { void loadFirst('initial'); }, [loadFirst]);

  // the feed keeps itself fresh: every minute while the page is in front and nothing is being typed
  const [composerOpen, setComposerOpen] = useState(false);
  const [reporting, setReporting] = useState<Item | null>(null);
  const idle = !composerOpen && !reporting;
  useEffect(() => {
    if (!idle) return;
    const t = window.setInterval(() => { if (document.visibilityState === 'visible' && !busyRefresh.current) void loadFirst('quiet'); }, REFRESH_MS);
    return () => window.clearInterval(t);
  }, [idle, loadFirst]);

  const refreshNow = async () => {
    if (busyRefresh.current) return;
    busyRefresh.current = true;
    await loadFirst('refresh');
    busyRefresh.current = false;
  };

  // ---- the composer -------------------------------------------------------------------------------------------------------------------------------------
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const [composerError, setComposerError] = useState('');
  const postingRef = useRef(false);
  const keyRef = useRef(newKey());
  const count = codePoints(text);
  const canPublish = !posting && text.trim().length > 0 && count <= ANON_MAX_LENGTH;

  const openComposer = () => {
    if (!loggedIn) { onLogin?.(); return; }
    setComposerError('');
    setComposerOpen(true);
  };
  const onType = (v: string) => {
    const chars = Array.from(v);
    setText(chars.length > ANON_MAX_LENGTH ? chars.slice(0, ANON_MAX_LENGTH).join('') : v);
    if (composerError) setComposerError('');
  };
  const publish = async () => {
    if (postingRef.current) return;                                   // a double tap can not send it twice
    if (text.trim().length === 0) { setComposerError('Write a message first.'); return; }
    if (count > ANON_MAX_LENGTH) { setComposerError(`Messages can be at most ${ANON_MAX_LENGTH} characters.`); return; }
    postingRef.current = true;
    setPosting(true);
    setComposerError('');
    try {
      const made = await postAnonMessage(text, keyRef.current);
      setItems((prev) => dedupe([made as Item, ...prev]).sort(newestFirst));
      if (status !== 'ready') setStatus('ready');
      setText('');
      keyRef.current = newKey();
      setComposerOpen(false);
      say('Published anonymously.', 'ok');
      scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setComposerError(friendly(e, 'Could not publish right now. Please check your connection and try again.'));
    } finally {
      postingRef.current = false;
      setPosting(false);
    }
  };
  useEffect(() => {
    if (!composerOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !postingRef.current) setComposerOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [composerOpen]);

  // ---- reporting ----------------------------------------------------------------------------------------------------------------------------------------
  const [reason, setReason] = useState(REASONS[0]);
  const [sendingReport, setSendingReport] = useState(false);
  const [reported, setReported] = useState<Set<string>>(() => new Set());
  const startReport = (m: Item) => {
    if (!loggedIn) { say('Please log in to report a message.', 'err'); return; }
    setReason(REASONS[0]);
    setReporting(m);
  };
  const sendReport = async () => {
    if (!reporting || sendingReport) return;
    setSendingReport(true);
    const id = reporting.id;
    try {
      const res = await reportAnonMessage(id, reason);
      setReported((prev) => new Set(prev).add(id));
      if (res.hidden && !isAdmin) setItems((prev) => prev.filter((m) => m.id !== id));
      setReporting(null);
      say('Thank you. We will take a look.', 'ok');
    } catch (e) {
      say(friendly(e, 'Could not send the report. Please try again.'), 'err');
    } finally {
      setSendingReport(false);
    }
  };

  // ---- the administrator --------------------------------------------------------------------------------------------------------------------------------
  const [armed, setArmed] = useState<string | null>(null);            // "id:remove" / "id:block": the second tap confirms
  const [adminBusy, setAdminBusy] = useState<string | null>(null);
  const armTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(armTimer.current), []);
  const adminAct = async (m: Item, kind: 'remove' | 'block' | 'keep') => {
    const tag = `${m.id}:${kind}`;
    if (kind !== 'keep' && armed !== tag) {
      setArmed(tag);
      window.clearTimeout(armTimer.current);
      armTimer.current = window.setTimeout(() => setArmed(null), 4000);
      return;
    }
    setArmed(null);
    setAdminBusy(m.id);
    try {
      if (kind === 'keep') { await adminDismissAnonMessageReports(m.id); setItems((prev) => prev.map((x) => (x.id === m.id ? { ...x, reportCount: 0, hidden: false, reasons: [] } : x))); say('Reports cleared. The message stays.', 'ok'); }
      else { await adminRemoveAnonMessage(m.id, kind === 'block'); setItems((prev) => prev.filter((x) => x.id !== m.id)); say(kind === 'block' ? 'Message removed and its author can no longer share.' : 'Message removed.', 'ok'); }
    } catch (e) {
      say(friendly(e, 'That did not work. Please try again.'), 'err');
    } finally {
      setAdminBusy(null);
    }
  };

  const mask = (cls = 'w-5 h-5') => <VenetianMask className={cls} aria-hidden="true" />;

  return (
    <div ref={scrollRef} className="fixed inset-0 z-[96] overflow-y-auto overscroll-contain bg-page doodle-wallpaper-feed text-white" role="region" aria-label="Anonymous Messages">
      {/* header */}
      <div className="sticky top-0 z-10 bg-zinc-900 border-b border-zinc-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-noob text-black flex items-center justify-center shrink-0">{mask('w-[18px] h-[18px]')}</div>
          <div className="min-w-0 flex-1">
            <h1 className="text-base leading-tight truncate">Anonymous Messages</h1>
            <p className="text-[11px] text-zinc-400 truncate">Your words, without your name.</p>
          </div>
          <button type="button" onClick={refreshNow} disabled={refreshing} aria-label="Refresh messages" className="w-8 h-8 rounded-full border border-zinc-700 hover:border-zinc-50 flex items-center justify-center cursor-pointer disabled:opacity-60">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button type="button" onClick={onClose} aria-label="Close Anonymous Messages" className="w-8 h-8 rounded-full border border-zinc-700 hover:border-zinc-50 flex items-center justify-center cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-5 pb-28">
        {/* share */}
        <div className="rounded-3xl bg-zinc-900 border border-zinc-800 p-4 sm:p-5 mb-5">
          <button type="button" onClick={openComposer} className="w-full py-3.5 rounded-full bg-noob text-black font-extrabold text-sm flex items-center justify-center gap-2 cursor-pointer hover:scale-[1.01] active:scale-[0.99] transition-transform">
            {mask('w-4.5 h-4.5')}
            <span>{loggedIn ? 'Share Anonymously' : 'Log in to share anonymously'}</span>
          </button>
          <p className="mt-3 text-[11px] leading-relaxed text-zinc-400 text-center">
            Messages are public. Others never see your name, username or picture next to what you share.
          </p>
        </div>

        {isAdmin && (
          <div className="mb-4 flex items-center gap-2" role="group" aria-label="Moderation filter">
            <ShieldCheck className="w-4 h-4 text-zinc-300" aria-hidden="true" />
            <button type="button" onClick={() => setOnlyReported(false)} aria-pressed={!onlyReported} className={`px-3 py-1.5 rounded-full text-xs font-bold border cursor-pointer ${!onlyReported ? 'bg-noob text-black border-zinc-50' : 'border-zinc-700 text-zinc-300'}`}>All messages</button>
            <button type="button" onClick={() => setOnlyReported(true)} aria-pressed={onlyReported} className={`px-3 py-1.5 rounded-full text-xs font-bold border cursor-pointer ${onlyReported ? 'bg-noob text-black border-zinc-50' : 'border-zinc-700 text-zinc-300'}`}>Reported only</button>
          </div>
        )}

        {/* the feed */}
        {status === 'loading' && (
          <div className="space-y-3" role="status" aria-label="Loading messages">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="no-doodle rounded-3xl bg-zinc-900 border border-zinc-800 p-4 animate-pulse">
                <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-full bg-zinc-800" /><div className="space-y-2"><div className="h-3 w-24 rounded bg-zinc-800" /><div className="h-2.5 w-32 rounded bg-zinc-800" /></div></div>
                <div className="mt-4 space-y-2"><div className="h-3 w-full rounded bg-zinc-800" /><div className="h-3 w-4/5 rounded bg-zinc-800" /></div>
              </div>
            ))}
          </div>
        )}

        {status === 'error' && (
          <div className="rounded-3xl bg-zinc-900 border border-zinc-800 p-6 text-center" role="alert">
            <AlertCircle className="w-8 h-8 mx-auto text-red-400" aria-hidden="true" />
            <p className="mt-3 text-sm text-zinc-300">{errorText}</p>
            <button type="button" onClick={() => void loadFirst('initial')} className="mt-4 px-5 py-2.5 rounded-full bg-noob text-black text-sm font-bold cursor-pointer">Try again</button>
          </div>
        )}

        {status === 'ready' && items.length === 0 && (
          <div className="rounded-3xl bg-zinc-900 border border-zinc-800 p-8 text-center">
            <div className="w-16 h-16 rounded-full border border-zinc-700 mx-auto flex items-center justify-center text-zinc-300">{mask('w-8 h-8')}</div>
            <p className="mt-4 text-base font-bold">{onlyReported ? 'No reported messages.' : 'No anonymous messages yet. Be the first to share!'}</p>
            {!onlyReported && (
              <button type="button" onClick={openComposer} className="mt-5 px-6 py-3 rounded-full bg-noob text-black text-sm font-extrabold cursor-pointer">{loggedIn ? 'Share Anonymously' : 'Log in to share'}</button>
            )}
          </div>
        )}

        {status === 'ready' && items.length > 0 && (
          <ul className="space-y-3">
            {items.map((m) => (
              <li key={m.id}>
                <article className="no-doodle rounded-3xl bg-zinc-900 border border-zinc-800 p-4 sm:p-5" aria-label="Anonymous message">
                  <header className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full border border-zinc-600 text-zinc-100 flex items-center justify-center shrink-0">{mask('w-5 h-5')}</div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-extrabold leading-tight">Anonymous</p>
                      <time dateTime={m.createdAt} className="text-[11px] text-zinc-400">{whenLabel(m.createdAt)}</time>
                    </div>
                    {!isAdmin && (
                      reported.has(m.id)
                        ? <span className="text-[11px] font-bold text-zinc-400 flex items-center gap-1"><Check className="w-3.5 h-3.5" aria-hidden="true" />Reported</span>
                        : <button type="button" onClick={() => startReport(m)} aria-label="Report this message" className="w-9 h-9 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center cursor-pointer"><Flag className="w-4 h-4" /></button>
                    )}
                  </header>
                  {/* the text is drawn as plain text: nothing in it can run as HTML or script */}
                  <p className="mt-3 text-[15px] leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{m.body}</p>

                  {isAdmin && (
                    <div className="mt-3 pt-3 border-t border-zinc-800 space-y-2">
                      <div className="flex items-center gap-2 text-[11px] text-zinc-300 flex-wrap">
                        <span className={`px-2 py-0.5 rounded-full border ${m.reportCount ? 'border-red-400 text-red-300' : 'border-zinc-700 text-zinc-400'}`}>{m.reportCount || 0} report{m.reportCount === 1 ? '' : 's'}</span>
                        {m.hidden && <span className="px-2 py-0.5 rounded-full border border-amber-400 text-amber-300 flex items-center gap-1"><Ban className="w-3 h-3" aria-hidden="true" />hidden from everyone until you decide</span>}
                        {(m.reasons || []).map((r, i) => <span key={i} className="text-zinc-400">“{r}”</span>)}
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        {(m.reportCount || 0) > 0 && (
                          <button type="button" disabled={adminBusy === m.id} onClick={() => void adminAct(m, 'keep')} className="px-3 py-1.5 rounded-full border border-zinc-600 text-xs font-bold cursor-pointer disabled:opacity-50">Keep (clear reports)</button>
                        )}
                        <button type="button" disabled={adminBusy === m.id} onClick={() => void adminAct(m, 'remove')} className="px-3 py-1.5 rounded-full bg-noob text-black text-xs font-bold cursor-pointer disabled:opacity-50 flex items-center gap-1.5">
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />{armed === `${m.id}:remove` ? 'Tap again to remove' : 'Remove'}
                        </button>
                        <button type="button" disabled={adminBusy === m.id} onClick={() => void adminAct(m, 'block')} className="px-3 py-1.5 rounded-full border border-red-400 text-red-300 text-xs font-bold cursor-pointer disabled:opacity-50">
                          {armed === `${m.id}:block` ? 'Tap again: remove and block author' : 'Remove and block author'}
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              </li>
            ))}
          </ul>
        )}

        {status === 'ready' && hasMore && (
          <div className="mt-5 flex justify-center">
            <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="px-6 py-3 rounded-full border border-zinc-600 hover:border-zinc-50 text-sm font-bold cursor-pointer disabled:opacity-60 flex items-center gap-2">
              {loadingMore && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}
        {status === 'ready' && items.length > 0 && !hasMore && <p className="mt-6 text-center text-[11px] text-zinc-500">That is everything for now.</p>}
      </div>

      {/* the composer */}
      {composerOpen && (
        <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75" onClick={() => { if (!posting) setComposerOpen(false); }} role="dialog" aria-modal="true" aria-label="Share anonymously">
          <div className="w-full sm:max-w-lg max-h-[94vh] overflow-y-auto bg-zinc-900 border border-zinc-800 rounded-t-3xl sm:rounded-3xl p-5 sm:p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-noob text-black flex items-center justify-center shrink-0">{mask('w-5 h-5')}</div>
              <h2 className="text-lg flex-1">Share Anonymously</h2>
              <button type="button" onClick={() => { if (!posting) setComposerOpen(false); }} aria-label="Close" className="w-9 h-9 rounded-full hover:bg-zinc-800 flex items-center justify-center cursor-pointer"><X className="w-4 h-4" /></button>
            </div>

            <div className="mt-4 rounded-2xl border border-zinc-700 p-3 text-[12px] leading-relaxed text-zinc-300">
              <p><strong className="text-white">This message will be public.</strong> Everyone can read it, and it is shown with the word “Anonymous” — never your name, username or picture.</p>
              <p className="mt-1.5 text-zinc-400">Anonymous means what other people can see. NOOB still knows that a message came from an account, so that the community can be kept safe.</p>
            </div>

            <label htmlFor="anon-text" className="sr-only">Your anonymous message</label>
            <textarea
              id="anon-text"
              value={text}
              onChange={(e) => onType(e.target.value)}
              placeholder="Say what is on your mind…"
              rows={6}
              autoFocus
              className="mt-4 w-full bg-zinc-950 border border-zinc-700 focus:border-zinc-50 rounded-2xl px-4 py-3 text-[15px] leading-relaxed outline-none resize-y min-h-[140px]"
              aria-describedby="anon-count anon-error"
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              <p id="anon-error" role="alert" className="text-xs text-red-300 min-h-[1rem]">{composerError}</p>
              <p id="anon-count" aria-live="polite" className={`text-xs font-bold tabular-nums shrink-0 ${count >= ANON_MAX_LENGTH ? 'text-red-300' : count > ANON_MAX_LENGTH * 0.9 ? 'text-amber-300' : 'text-zinc-400'}`}>{count} / {ANON_MAX_LENGTH}</p>
            </div>

            <div className="mt-4 flex gap-3">
              <button type="button" onClick={() => setComposerOpen(false)} disabled={posting} className="px-5 py-3 rounded-full border border-zinc-600 text-sm font-bold cursor-pointer disabled:opacity-50">Cancel</button>
              <button type="button" onClick={() => void publish()} disabled={!canPublish} className="flex-1 py-3 rounded-full bg-noob text-black text-sm font-extrabold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed">
                {posting ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Send className="w-4 h-4" aria-hidden="true" />}
                {posting ? 'Publishing…' : 'Publish Anonymously'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* report a message */}
      {reporting && (
        <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75" onClick={() => { if (!sendingReport) setReporting(null); }} role="dialog" aria-modal="true" aria-label="Report this message">
          <div className="w-full sm:max-w-sm bg-zinc-900 border border-zinc-800 rounded-t-3xl sm:rounded-3xl p-5 sm:p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg">Report this message</h2>
            <p className="mt-1 text-xs text-zinc-400">Why is it a problem? Messages that several people report are hidden until an administrator has looked at them.</p>
            <div className="mt-4 space-y-2" role="radiogroup" aria-label="Reason">
              {REASONS.map((r) => (
                <label key={r} className={`flex items-center gap-3 px-4 py-3 rounded-2xl border cursor-pointer text-sm ${reason === r ? 'border-zinc-50 bg-zinc-800' : 'border-zinc-700'}`}>
                  <input type="radio" name="anon-reason" checked={reason === r} onChange={() => setReason(r)} className="accent-white" />
                  {r}
                </label>
              ))}
            </div>
            <div className="mt-5 flex gap-3">
              <button type="button" onClick={() => setReporting(null)} disabled={sendingReport} className="px-5 py-3 rounded-full border border-zinc-600 text-sm font-bold cursor-pointer disabled:opacity-50">Cancel</button>
              <button type="button" onClick={() => void sendReport()} disabled={sendingReport} className="flex-1 py-3 rounded-full bg-noob text-black text-sm font-extrabold cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2">
                {sendingReport && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}Send report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* a short message at the bottom: success or error */}
      {toast && (
        <div role="status" aria-live="polite" className={`fixed left-1/2 -translate-x-1/2 bottom-8 z-[120] max-w-[92vw] px-4 py-2.5 rounded-full text-xs font-bold shadow-xl border ${toast.kind === 'ok' ? 'bg-noob text-black border-zinc-50' : 'bg-zinc-900 text-red-300 border-red-400'}`}>
          {toast.text}
        </div>
      )}
    </div>
  );
};

export default AnonymousMessagesPage;
