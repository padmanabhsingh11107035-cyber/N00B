import React, { useCallback, useEffect, useRef, useState } from 'react';
import { VenetianMask, X, Flag, Send, Trash2, ShieldCheck, Loader2, Check, AlertCircle, Ban } from 'lucide-react';
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
import './anon.css';

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

const newKey = (): string => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);
const codePoints = (s: string): number => Array.from(s).length;
const whenLabel = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};
const newestFirst = (a: Item, b: Item): number => (a.createdAt === b.createdAt ? (a.id < b.id ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1);
const dedupe = (list: Item[]): Item[] => { const seen = new Set<string>(); return list.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true))); };
// one of three muted tones for each message, taken from its id (only decoration: nothing about the author)
const toneOf = (id: string): number => { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 997; return h % 3; };
const friendly = (e: unknown, fallback: string): string => (e instanceof Error && e.message && !/^(TypeError|NetworkError|Failed to fetch)/i.test(e.message) ? e.message : fallback);

export const AnonymousMessagesPage: React.FC<Props> = ({ currentUser, onClose, onLogin }) => {
  const isAdmin = !!currentUser && isMainAdmin(currentUser);
  const loggedIn = !!currentUser;

  const [items, setItems] = useState<Item[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorText, setErrorText] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [onlyReported, setOnlyReported] = useState(false);
  const [toast, setToast] = useState<{ text: string; kind: 'ok' | 'err' } | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const loadId = useRef(0);
  const busyMore = useRef(false);
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

  // The first page. "initial" shows the loading skeleton; "quiet" keeps what is on screen and only brings in what is new (and drops what was removed). Nothing reloads this page
  // by itself or on request: only the Home page refreshes (pull down there): no other page has a refresh button, a pull-down refresh or a timer that reloads it.
  const loadFirst = useCallback(async (mode: 'initial' | 'quiet') => {
    const my = ++loadId.current;
    if (mode === 'initial') { setStatus('loading'); setItems([]); setHasMore(false); }
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
    }
  }, [fetchPage]);

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

  const [composerOpen, setComposerOpen] = useState(false);
  const [reporting, setReporting] = useState<Item | null>(null);

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
    <div ref={scrollRef} className="anon-root fixed inset-0 edge-own z-[96] overflow-y-auto overscroll-contain" role="region" aria-label="Anonymous Messages">
      {/* header: painted all the way up under the clock and the camera */}
      <div className="anon-head">
        <div className="anon-head-in">
          <button type="button" onClick={onClose} aria-label="Close Anonymous Messages" className="anon-icon-btn">
            <X className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="anon-title">Anonymous Messages</h1>
            <p className="anon-sub">Your words, without your name.</p>
          </div>
        </div>
      </div>

      <div className="anon-main">
        <section className="anon-intro" aria-label="About this page">
          <p className="lead">Share a thought with everyone. Others see the word Anonymous, never your name, username or picture.</p>
        </section>

        {isAdmin && (
          <section className="anon-mod" aria-label="Moderation">
            <div className="anon-mod-head"><ShieldCheck className="w-4 h-4" aria-hidden="true" /><span>Moderation</span></div>
            <div className="anon-filter" role="group" aria-label="Moderation filter">
              <button type="button" onClick={() => setOnlyReported(false)} aria-pressed={!onlyReported} className="anon-chip">All messages</button>
              <button type="button" onClick={() => setOnlyReported(true)} aria-pressed={onlyReported} className="anon-chip">Reported only</button>
            </div>
          </section>
        )}

        {status === 'ready' && items.length > 0 && <div className="anon-section-title">Latest messages</div>}

        {/* the feed */}
        {status === 'loading' && (
          <div className="anon-list" role="status" aria-label="Loading messages">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="anon-skel no-doodle animate-pulse">
                <div className="space-y-2"><i style={{ height: 14, width: '100%' }} /><i style={{ height: 14, width: '78%' }} /></div>
                <div className="mt-4"><i style={{ height: 10, width: 120 }} /></div>
              </div>
            ))}
          </div>
        )}

        {status === 'error' && (
          <div className="anon-card" role="alert">
            <AlertCircle className="w-7 h-7" style={{ color: 'var(--a-danger)' }} aria-hidden="true" />
            <p className="t">{errorText}</p>
            <button type="button" onClick={() => void loadFirst('initial')} className="anon-btn">Try again</button>
          </div>
        )}

        {status === 'ready' && items.length === 0 && (
          <div className="anon-card">
            <div className="big">{mask('w-7 h-7')}</div>
            <p className="t">{onlyReported ? 'No reported messages.' : 'No anonymous messages yet. Be the first to share!'}</p>
          </div>
        )}

        {status === 'ready' && items.length > 0 && (
          <ul className="anon-list">
            {items.map((m) => (
              <li key={m.id}>
                <article className="anon-msg no-doodle" data-tone={toneOf(m.id)} aria-label="Anonymous message">
                  {/* the text is drawn as plain text: nothing in it can run as HTML or script */}
                  <p className="anon-body whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{m.body}</p>
                  <footer className="anon-msg-foot">
                    <p className="anon-meta">
                      {mask('w-4 h-4')}
                      <span className="anon-who">Anonymous</span>
                      <span aria-hidden="true">·</span>
                      <time dateTime={m.createdAt} className="anon-when">{whenLabel(m.createdAt)}</time>
                    </p>
                    {isAdmin && <span className={`anon-tag ${m.reportCount ? 'bad' : ''}`}>{m.reportCount || 0} report{m.reportCount === 1 ? '' : 's'}</span>}
                    {!isAdmin && (
                      reported.has(m.id)
                        ? <span className="anon-reported"><Check className="w-3.5 h-3.5" aria-hidden="true" />Reported</span>
                        : <button type="button" onClick={() => startReport(m)} aria-label="Report this message" className="anon-flag"><Flag className="w-4 h-4" /></button>
                    )}
                  </footer>

                  {isAdmin && (
                    <div className="anon-admin">
                      {(m.hidden || (m.reasons || []).length > 0) && <div className="anon-tags">
                        {m.hidden && <span className="anon-tag warn"><Ban className="w-3 h-3" aria-hidden="true" />hidden from everyone until you decide</span>}
                        {(m.reasons || []).map((r, i) => <span key={i} className="anon-reason-tag">“{r}”</span>)}
                      </div>}
                      <div className="anon-btnrow">
                        {(m.reportCount || 0) > 0 && (
                          <button type="button" disabled={adminBusy === m.id} onClick={() => void adminAct(m, 'keep')} aria-label="Keep the message and clear its reports" className="anon-btn">Keep</button>
                        )}
                        <button type="button" disabled={adminBusy === m.id} onClick={() => void adminAct(m, 'remove')} aria-label={armed === `${m.id}:remove` ? 'Tap again to remove this message' : 'Remove this message'} className="anon-btn solid">
                          <Trash2 className="w-4 h-4" aria-hidden="true" />{armed === `${m.id}:remove` ? 'Tap again' : 'Remove'}
                        </button>
                        <button type="button" disabled={adminBusy === m.id} onClick={() => void adminAct(m, 'block')} aria-label={armed === `${m.id}:block` ? 'Tap again to remove the message and block its author' : 'Remove the message and block its author'} className="anon-btn danger">
                          <Ban className="w-4 h-4" aria-hidden="true" />{armed === `${m.id}:block` ? 'Tap again' : 'Block author'}
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
          <div className="anon-more">
            <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="anon-btn">
              {loadingMore && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}
        {status === 'ready' && items.length > 0 && !hasMore && <p className="anon-end">That is everything for now.</p>}
      </div>

      {/* the one primary action, within thumb reach */}
      <div className="anon-dock">
        <button type="button" onClick={openComposer} className="anon-cta">
          <Send className="w-[18px] h-[18px]" aria-hidden="true" />
          <span>{loggedIn ? 'Share Anonymously' : 'Log in to share anonymously'}</span>
        </button>
      </div>

      {/* the composer */}
      {composerOpen && (
        <div className="anon-scrim" onClick={() => { if (!posting) setComposerOpen(false); }} role="dialog" aria-modal="true" aria-label="Share anonymously">
          <div className="anon-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="anon-grab" aria-hidden="true" />
            <div className="anon-sheet-head">
              <h2>Share Anonymously</h2>
              <button type="button" onClick={() => { if (!posting) setComposerOpen(false); }} aria-label="Close" className="anon-icon-btn"><X className="w-5 h-5" /></button>
            </div>

            <label htmlFor="anon-text" className="sr-only">Your anonymous message</label>
            <textarea
              id="anon-text"
              value={text}
              onChange={(e) => onType(e.target.value)}
              placeholder="Say what is on your mind…"
              rows={5}
              autoFocus
              className="anon-field"
              aria-describedby="anon-count anon-error"
            />
            <div className="anon-count-row">
              <p id="anon-error" role="alert" className="anon-err">{composerError}</p>
              <p id="anon-count" aria-live="polite" className={`anon-count ${count >= ANON_MAX_LENGTH ? 'full' : count > ANON_MAX_LENGTH * 0.9 ? 'warn' : ''}`}>{count} / {ANON_MAX_LENGTH}</p>
            </div>
            <div className={`anon-meter ${count >= ANON_MAX_LENGTH ? 'full' : count > ANON_MAX_LENGTH * 0.9 ? 'warn' : ''}`} aria-hidden="true"><i style={{ width: `${Math.min(100, (count / ANON_MAX_LENGTH) * 100)}%` }} /></div>

            <div className="anon-callout">
              <p><strong>This message will be public.</strong> It is shown with the word “Anonymous”, never your name, username or picture.</p>
              <p>Anonymous means what other people can see. NOOB still knows that a message came from an account, so that the community can be kept safe.</p>
            </div>

            <div className="anon-sheet-actions">
              <button type="button" onClick={() => setComposerOpen(false)} disabled={posting} className="anon-btn">Cancel</button>
              <button type="button" onClick={() => void publish()} disabled={!canPublish} className="anon-btn solid">
                {posting ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Send className="w-4 h-4" aria-hidden="true" />}
                {posting ? 'Publishing…' : 'Publish Anonymously'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* report a message */}
      {reporting && (
        <div className="anon-scrim" onClick={() => { if (!sendingReport) setReporting(null); }} role="dialog" aria-modal="true" aria-label="Report this message">
          <div className="anon-sheet is-sm" onClick={(e) => e.stopPropagation()}>
            <div className="anon-grab" aria-hidden="true" />
            <h2 className="anon-sheet-title">Report this message</h2>
            <p className="anon-small">Why is it a problem? Messages that several people report are hidden until an administrator has looked at them.</p>
            <div className="anon-reasons" role="radiogroup" aria-label="Reason">
              {REASONS.map((r) => (
                <label key={r} className={`anon-reason ${reason === r ? 'on' : ''}`}>
                  <input type="radio" name="anon-reason" checked={reason === r} onChange={() => setReason(r)} />
                  {r}
                </label>
              ))}
            </div>
            <div className="anon-sheet-actions">
              <button type="button" onClick={() => setReporting(null)} disabled={sendingReport} className="anon-btn">Cancel</button>
              <button type="button" onClick={() => void sendReport()} disabled={sendingReport} className="anon-btn solid">
                {sendingReport && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}Send report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* a short message at the bottom: success or error */}
      {toast && (
        <div role="status" aria-live="polite" className={`anon-toast ${toast.kind === 'ok' ? '' : 'err'}`}>
          {toast.text}
        </div>
      )}
    </div>
  );
};

export default AnonymousMessagesPage;
