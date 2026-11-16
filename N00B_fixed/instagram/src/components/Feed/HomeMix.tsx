import React, { useCallback, useEffect, useRef, useState } from 'react';
import { VenetianMask, Flag, Trash2, Check, BarChart3, Clock, Lock, Link2, Loader2, Send, X } from 'lucide-react';
import type { User } from '../../types';
import { isMainAdmin } from '../../adminAccess';
import {
  ANON_MAX_LENGTH,
  fetchAnonMessages,
  postAnonMessage,
  reportAnonMessage,
  adminRemoveAnonMessage,
  fetchPolls,
  fetchPoll,
  votePoll,
  removePoll,
  reportPoll,
  fetchFunCanManage,
  type AnonMessage,
  type Poll
} from '../../services/api';
import { funShareUrl } from '../../utils/funRoutes';
import { percents } from '../../utils/pollMath';
import { VerifiedBadge } from '../Common/VerifiedBadge';

// Anonymous thoughts and public polls live on the Home page now, mixed in between the posts (they used to be two pages of the three-line menu).
// An anonymous thought is still only {id, body, createdAt}: the database never sends who wrote it, so nothing here can show it. A poll always shows who made it.

export type MixItem = { kind: 'anon'; at: string; anon: AnonMessage } | { kind: 'poll'; at: string; poll: Poll };
export const mixKey = (i: MixItem): string => (i.kind === 'anon' ? 'anon-' + i.anon.id : 'poll-' + i.poll.id);
/** A new anonymous thought or poll was just made (the Create sheet): Home shows it at once. */
export const HOME_MIX_NEW_EVENT = 'noob-home-mix-new';
export const announceMixItem = (item: MixItem): void => { try { window.dispatchEvent(new CustomEvent(HOME_MIX_NEW_EVENT, { detail: item })); } catch { /* it shows after the next refresh */ } };

const newestFirst = (a: MixItem, b: MixItem): number => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0);
const friendly = (e: unknown, fallback: string): string => (e instanceof Error && e.message && !/^(TypeError|NetworkError|Failed to fetch)/i.test(e.message) ? e.message : fallback);
const ago = (iso: string, now = Date.now()): string => {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (Number.isNaN(s)) return '';
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};
const timeLeft = (endsAt: string, now: number): string => {
  const ms = new Date(endsAt).getTime() - now;
  if (Number.isNaN(ms) || ms <= 0) return 'Ended';
  const m = Math.ceil(ms / 60000);
  if (m < 60) return `${m} min left`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h} h left` : `${Math.floor(h / 24)} days left`;
};
const votesLabel = (n: number): string => `${n.toLocaleString()} ${n === 1 ? 'vote' : 'votes'}`;

/** The anonymous thoughts and the running polls for the Home page: loaded once, again when Home is refreshed (refreshKey), and added to when the person makes one. */
export function useHomeMix(anonOn: boolean, pollsOn: boolean, refreshKey: number) {
  const [items, setItems] = useState<MixItem[]>([]);
  useEffect(() => {
    let alive = true;
    void Promise.all([
      anonOn ? fetchAnonMessages({ limit: 20 }).then((r) => r.messages).catch(() => [] as AnonMessage[]) : Promise.resolve([] as AnonMessage[]),
      pollsOn ? fetchPolls({ tab: 'active', limit: 10 }).then((r) => r.polls).catch(() => [] as Poll[]) : Promise.resolve([] as Poll[])
    ]).then(([anon, polls]) => {
      if (!alive) return;
      setItems([...anon.map((m): MixItem => ({ kind: 'anon', at: m.createdAt, anon: m })), ...polls.map((p): MixItem => ({ kind: 'poll', at: p.createdAt, poll: p }))].sort(newestFirst));
    });
    return () => { alive = false; };
  }, [anonOn, pollsOn, refreshKey]);
  useEffect(() => {
    const onNew = (e: Event) => {
      const item = (e as CustomEvent<MixItem>).detail;
      if (!item || (item.kind === 'anon' && !anonOn) || (item.kind === 'poll' && !pollsOn)) return;
      setItems((prev) => [item, ...prev.filter((x) => mixKey(x) !== mixKey(item))]);
    };
    window.addEventListener(HOME_MIX_NEW_EVENT, onNew);
    return () => window.removeEventListener(HOME_MIX_NEW_EVENT, onNew);
  }, [anonOn, pollsOn]);
  const remove = useCallback((key: string) => setItems((prev) => prev.filter((x) => mixKey(x) !== key)), []);
  const updatePoll = useCallback((p: Poll) => setItems((prev) => prev.map((x) => (x.kind === 'poll' && x.poll.id === p.id ? { ...x, poll: p } : x))), []);
  return { items, remove, updatePoll };
}

const ANON_REASONS = ['Spam or advertising', 'Harassment or hate', 'Self-harm or danger', 'Something else'];
const POLL_REASONS = ['Offensive or hateful', 'Spam or advertising', 'Misleading or harmful', 'Something else'];

/** A small "tap twice" guard for removing something. */
function useArmed(): [boolean, () => boolean] {
  const [armed, setArmed] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const press = () => {
    if (armed) { setArmed(false); return true; }
    setArmed(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setArmed(false), 3000);
    return false;
  };
  return [armed, press];
}

const AnonCard: React.FC<{ m: AnonMessage; currentUser: User; onRemoved: () => void }> = ({ m, currentUser, onRemoved }) => {
  const admin = isMainAdmin(currentUser);
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [armed, press] = useArmed();
  const report = async (reason: string) => {
    setBusy(true);
    try {
      const r = await reportAnonMessage(m.id, reason);
      setReported(true); setReporting(false); setNote('Thank you. We will take a look.');
      if (r.hidden && !admin) onRemoved();
    } catch (e) { setNote(friendly(e, 'Could not send the report. Please try again.')); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!press()) return;
    setBusy(true);
    try { await adminRemoveAnonMessage(m.id, false); onRemoved(); } catch (e) { setNote(friendly(e, 'Could not remove it.')); } finally { setBusy(false); }
  };
  return (
    <article className="hm-card hm-anon" data-testid="home-anon-card" aria-label="Anonymous thought">
      <header className="hm-head">
        <span className="hm-ava" aria-hidden="true"><VenetianMask className="w-5 h-5" /></span>
        <span className="min-w-0 flex-1">
          <span className="hm-who">Anonymous</span>
          <span className="hm-sub">Thought · {ago(m.createdAt)}</span>
        </span>
        {admin
          ? <button type="button" onClick={() => void remove()} disabled={busy} className={`hm-act ${armed ? 'is-warn' : ''}`}><Trash2 className="w-3.5 h-3.5" aria-hidden="true" />{armed ? 'Tap again' : 'Remove'}</button>
          : reported
            ? <span className="hm-done"><Check className="w-3.5 h-3.5" aria-hidden="true" />Reported</span>
            : <button type="button" onClick={() => setReporting((v) => !v)} aria-expanded={reporting} aria-label="Report this thought" className="hm-ib"><Flag className="w-4 h-4" /></button>}
      </header>
      {/* drawn as plain text: nothing in it can run as HTML or script */}
      <p className="hm-body whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{m.body}</p>
      {reporting && (
        <div className="hm-panel" role="group" aria-label="Why are you reporting this thought?">
          <p className="hm-sub">Why is it a problem?</p>
          <div className="hm-acts">{ANON_REASONS.map((r) => <button key={r} type="button" disabled={busy} onClick={() => void report(r)} className="hm-act">{r}</button>)}</div>
        </div>
      )}
      {note && <p className="hm-note" role="status">{note}</p>}
    </article>
  );
};

const PollCard: React.FC<{ poll: Poll; canManage: boolean; onChanged: (p: Poll) => void; onRemoved: () => void; onOpenProfile?: (u: User) => void }> = ({ poll, canManage, onChanged, onRemoved, onOpenProfile }) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 60000); return () => window.clearInterval(t); }, []);
  const [picked, setPicked] = useState<string | null>(null);
  const [voting, setVoting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [note, setNote] = useState('');
  const [armed, press] = useArmed();
  const active = poll.status === 'active' && new Date(poll.endsAt).getTime() > now;
  const voted = poll.myVote !== null;
  const interactive = active && !voted;
  const counts = poll.options.map((o) => o.votes ?? 0);
  const pcts = poll.resultsShown ? percents(counts) : counts.map(() => 0);
  const top = poll.resultsShown ? Math.max(...counts, 0) : 0;
  const link = funShareUrl({ feature: 'polls', target: poll.id });

  const vote = async () => {
    if (!picked || voting) return;
    setVoting(true);
    try { onChanged(await votePoll(poll.id, picked)); setNote('Your vote is in!'); }
    catch (e) {
      setNote(friendly(e, 'Could not send your vote. Please try again.'));
      if (e instanceof Error && /already voted|ended|not available/i.test(e.message)) { const fresh = await fetchPoll(poll.id).catch(() => null); if (fresh) onChanged(fresh); else onRemoved(); }
    } finally { setVoting(false); }
  };
  const remove = async () => {
    if (!press()) return;
    setBusy(true);
    try { await removePoll(poll.id); onRemoved(); } catch (e) { setNote(friendly(e, 'Could not remove the poll.')); } finally { setBusy(false); }
  };
  const report = async (reason: string) => {
    setBusy(true);
    try { const r = await reportPoll(poll.id, reason); setReporting(false); setNote('Reported. Thank you: the NOOB team will take a look.'); if (r.hidden) onRemoved(); }
    catch (e) { setNote(friendly(e, 'Could not send the report.')); } finally { setBusy(false); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(link); setNote('Link copied.'); } catch { setNote('Could not copy the link.'); } };
  const c = poll.creator;

  return (
    <article className="hm-card hm-poll" data-testid="home-poll-card" aria-label={`Poll: ${poll.question}`}>
      <header className="hm-head">
        <button type="button" onClick={() => onOpenProfile?.({ id: c.userId, username: c.username, displayName: c.displayName, avatar: c.avatar } as unknown as User)} className="hm-by" aria-label={`Open ${c.displayName}'s profile`}>
          {c.avatar ? <img src={c.avatar} alt="" referrerPolicy="no-referrer" className="hm-ava is-pic" /> : <span className="hm-ava" aria-hidden="true" />}
          <span className="min-w-0 flex-1 text-left">
            <span className="hm-who">{c.displayName}{c.isVerified && <VerifiedBadge size="xs" />}</span>
            <span className="hm-sub">Poll · {ago(poll.createdAt, now)}</span>
          </span>
        </button>
        <span className={`hm-time ${active ? 'is-live' : ''}`}><Clock className="w-3.5 h-3.5" aria-hidden="true" />{timeLeft(poll.endsAt, now)}</span>
      </header>
      <h3 className="hm-q break-words [overflow-wrap:anywhere]">{poll.question}</h3>
      <div className="hm-opts" role={interactive ? 'radiogroup' : undefined} aria-label={interactive ? 'Options' : undefined}>
        {poll.options.map((o, i) => {
          const mine = poll.myVote === o.id;
          const on = picked === o.id;
          const inner = (
            <>
              {poll.resultsShown && <span aria-hidden="true" className={`hm-bar ${counts[i] === top && top > 0 ? 'is-top' : ''}`} style={{ width: `${pcts[i]}%` }} />}
              <span className="hm-opt-main">
                {interactive ? <span className={`hm-radio ${on ? 'is-on' : ''}`} aria-hidden="true">{on && <Check className="w-3 h-3" />}</span> : mine ? <Check className="w-4 h-4 shrink-0" aria-hidden="true" /> : null}
                <span className="min-w-0 break-words [overflow-wrap:anywhere]">{o.label}</span>
              </span>
              {poll.resultsShown && <span className="hm-pct">{pcts[i]}%</span>}
            </>
          );
          const cls = `hm-opt ${on ? 'is-on' : ''} ${mine ? 'is-mine' : ''}`;
          return interactive
            ? <button key={o.id} type="button" role="radio" aria-checked={on} onClick={() => setPicked(o.id)} className={cls}>{inner}</button>
            : <div key={o.id} className={cls} aria-label={poll.resultsShown ? `${o.label}: ${pcts[i]}% (${votesLabel(counts[i])})${mine ? ', your vote' : ''}` : mine ? `${o.label}, your vote` : undefined}>{inner}</div>;
        })}
      </div>
      {interactive && (
        <button type="button" onClick={() => void vote()} disabled={!picked || voting} className="hm-vote">
          {voting && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}Vote
        </button>
      )}
      <div className="hm-foot">
        <p className="hm-sub" aria-live="polite">
          {poll.resultsShown && poll.totalVotes !== null
            ? <><BarChart3 className="w-3.5 h-3.5" aria-hidden="true" />{votesLabel(poll.totalVotes)} in total</>
            : voted
              ? <><Lock className="w-3.5 h-3.5" aria-hidden="true" />Your vote is in. Results appear when the poll ends.</>
              : poll.resultsVisibility === 'after_end' ? 'Results appear when the poll ends.' : 'Vote to see the results.'}
        </p>
        <div className="hm-acts">
          <button type="button" onClick={() => void copy()} className="hm-act"><Link2 className="w-3.5 h-3.5" aria-hidden="true" />Copy link</button>
          {(poll.isMine || canManage) && <button type="button" onClick={() => void remove()} disabled={busy} className={`hm-act ${armed ? 'is-warn' : ''}`}><Trash2 className="w-3.5 h-3.5" aria-hidden="true" />{armed ? 'Tap again' : 'Remove'}</button>}
          {!poll.isMine && <button type="button" onClick={() => setReporting((v) => !v)} aria-expanded={reporting} className="hm-act"><Flag className="w-3.5 h-3.5" aria-hidden="true" />Report</button>}
        </div>
      </div>
      {reporting && (
        <div className="hm-panel" role="group" aria-label="Why are you reporting this poll?">
          <p className="hm-sub">Why are you reporting it?</p>
          <div className="hm-acts">{POLL_REASONS.map((r) => <button key={r} type="button" disabled={busy} onClick={() => void report(r)} className="hm-act">{r}</button>)}</div>
        </div>
      )}
      {note && <p className="hm-note" role="status">{note}</p>}
    </article>
  );
};

/** Whether this person may remove other people's polls (asked once per page load). */
let canManagePromise: Promise<boolean> | null = null;
export function useCanManagePolls(enabled: boolean): boolean {
  const [can, setCan] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    canManagePromise = canManagePromise || fetchFunCanManage();
    void canManagePromise.then((v) => { if (alive) setCan(v); });
    return () => { alive = false; };
  }, [enabled]);
  return can;
}

export const HomeMixCard: React.FC<{ item: MixItem; currentUser: User; canManage: boolean; onRemoved: (key: string) => void; onPollChanged: (p: Poll) => void; onOpenProfile?: (u: User) => void }> = ({ item, currentUser, canManage, onRemoved, onPollChanged, onOpenProfile }) =>
  item.kind === 'anon'
    ? <AnonCard m={item.anon} currentUser={currentUser} onRemoved={() => onRemoved(mixKey(item))} />
    : <PollCard poll={item.poll} canManage={canManage} onChanged={onPollChanged} onRemoved={() => onRemoved(mixKey(item))} onOpenProfile={onOpenProfile} />;

// ---- writing an anonymous thought (opened from the Create sheet) ----------------------------------------------------------------------------------------
const newKey = (): string => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);

export const AnonComposer: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');
  const postingRef = useRef(false);
  const keyRef = useRef(newKey());
  const count = Array.from(text).length;
  const canPublish = !posting && text.trim().length > 0 && count <= ANON_MAX_LENGTH;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !postingRef.current) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const onType = (v: string) => { const chars = Array.from(v); setText(chars.length > ANON_MAX_LENGTH ? chars.slice(0, ANON_MAX_LENGTH).join('') : v); if (error) setError(''); };
  const publish = async () => {
    if (postingRef.current || !canPublish) return;   // a double tap can not send it twice
    postingRef.current = true; setPosting(true); setError('');
    try {
      const made = await postAnonMessage(text, keyRef.current);
      announceMixItem({ kind: 'anon', at: made.createdAt, anon: made });
      onClose();
    } catch (e) {
      setError(friendly(e, 'Could not publish right now. Please check your connection and try again.'));
    } finally { postingRef.current = false; setPosting(false); }
  };
  return (
    <div className="hm-scrim" data-noob-keep="1" role="dialog" aria-modal="true" aria-label="Share a thought anonymously" onClick={() => { if (!posting) onClose(); }}>
      <div className="hm-sheet" data-testid="anon-composer" onClick={(e) => e.stopPropagation()}>
        <div className="hm-sheet-head">
          <h2><VenetianMask className="w-5 h-5" aria-hidden="true" />Anonymous thought</h2>
          <button type="button" onClick={() => { if (!posting) onClose(); }} aria-label="Close" className="hm-ib" data-no-hit="1"><X className="w-5 h-5" /></button>
        </div>
        <label htmlFor="hm-anon-text" className="sr-only">Your anonymous thought</label>
        <textarea id="hm-anon-text" value={text} onChange={(e) => onType(e.target.value)} placeholder="Say what is on your mind…" rows={5} autoFocus className="hm-field" />
        <div className="hm-count-row">
          <p role="alert" className="hm-err">{error}</p>
          <p aria-live="polite" className="hm-sub">{count} / {ANON_MAX_LENGTH}</p>
        </div>
        <div className="hm-callout">
          <p><strong>It will be public, on the Home page.</strong> It is shown with the word “Anonymous”, never your name, username or picture.</p>
          <p>Anonymous means what other people can see. NOOB still knows that a thought came from an account, so that the community can be kept safe.</p>
        </div>
        <button type="button" onClick={() => void publish()} disabled={!canPublish} className="hm-vote" data-testid="anon-publish">
          {posting ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Send className="w-4 h-4" aria-hidden="true" />}
          {posting ? 'Publishing…' : 'Publish anonymously'}
        </button>
      </div>
    </div>
  );
};
