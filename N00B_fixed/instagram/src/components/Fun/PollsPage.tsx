import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BarChart3, Plus, X, Trash2, Share2, Link2, Image as ImageIcon, FileImage, Flag, Check, ChevronDown, ArrowLeft, Clock, ShieldCheck, Lock } from 'lucide-react';
import {
  POLL_QUESTION_MAX,
  POLL_OPTION_MAX,
  POLL_MAX_OPTIONS,
  fetchPoll,
  fetchPolls,
  createPoll,
  votePoll,
  removePoll,
  reportPoll,
  fetchPollReports,
  dismissPollReports,
  fetchFunCanManage,
  type Poll,
  type PollReport,
  type PollResultsRule
} from '../../services/api';
import type { User } from '../../types';
import { funShareUrl } from '../../utils/funRoutes';
import { percents } from '../../utils/pollMath';
import { VerifiedBadge } from '../Common/VerifiedBadge';
import { Card, EmptyState, ErrorState, SkeletonCards, BusyLabel, useToast, friendly, timeAgo, codePoints } from './funUi';
import { shareCardAsStory, shareCardAsPost } from './shareCard';
import type { FunPageProps } from './types';

// Public Polls: ask the community a question with 2 to 8 options and a time limit. One vote per person (kept by the database); the results appear under the rule the creator chose
// (always, after you vote, or when the poll ends); a poll can be shared as a link, a Story or a Post, reported (three reports hide it until an administrator decides) and removed
// by its creator or an administrator. The numbers are always the database's - this page never adds a vote itself. Who voted for what is not in anything this page receives.

const PAGE_SIZE = 8;
const REPORT_REASONS = ['Offensive or hateful', 'Spam or advertising', 'Misleading or harmful', 'Something else'];
const DURATIONS = [
  { label: '1 hour', minutes: 60 },
  { label: '6 hours', minutes: 360 },
  { label: '24 hours', minutes: 1440 },
  { label: '3 days', minutes: 4320 },
  { label: '7 days', minutes: 10080 },
  { label: '30 days', minutes: 43200 }
];
const RESULT_RULES: ReadonlyArray<{ id: PollResultsRule; label: string; hint: string }> = [
  { id: 'after_vote', label: 'After people vote', hint: 'A voter sees the results at once' },
  { id: 'always', label: 'Always', hint: 'Everyone can see the numbers' },
  { id: 'after_end', label: 'When it ends', hint: 'Nobody sees numbers until then' }
];

const plural = (n: number, one: string, many: string): string => `${n.toLocaleString()} ${n === 1 ? one : many}`;
export function timeLeftLabel(endsAt: string, now = Date.now()): string {
  const ms = new Date(endsAt).getTime() - now;
  if (Number.isNaN(ms)) return '';
  if (ms <= 0) return `Ended ${timeAgo(endsAt)}`;
  const m = Math.ceil(ms / 60000);
  if (m < 60) return `Ends in ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `Ends in ${h} h${m % 60 && h < 6 ? ` ${m % 60} min` : ''}`;
  return `Ends in ${Math.floor(h / 24)} days`;
}

const asUser = (c: Poll['creator']): User => ({ id: c.userId, username: c.username, displayName: c.displayName, avatar: c.avatar } as unknown as User);

// ================================================================================================================================ one poll
const PollCard: React.FC<{
  poll: Poll;
  now: number;
  loggedIn: boolean;
  canManage: boolean;
  onLogin?: () => void;
  onChanged: (p: Poll) => void;
  onRemoved: (id: string) => void;
  onOpen?: (p: Poll) => void;
  onOpenProfile?: (u: User) => void;
  say: (t: string, k?: 'ok' | 'err') => void;
}> = ({ poll, now, loggedIn, canManage, onLogin, onChanged, onRemoved, onOpen, onOpenProfile, say }) => {
  const [picked, setPicked] = useState<string | null>(null);
  const [voting, setVoting] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const armTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(armTimer.current), []);
  useEffect(() => {
    if (!poll.resultsShown) { setRevealed(false); return; }
    const t = window.setTimeout(() => setRevealed(true), 40);
    return () => window.clearTimeout(t);
  }, [poll.resultsShown]);

  const active = poll.status === 'active' && new Date(poll.endsAt).getTime() > now;
  const voted = poll.myVote !== null;
  const interactive = active && !voted;
  const counts = poll.options.map((o) => o.votes ?? 0);
  const pcts = poll.resultsShown ? percents(counts) : counts.map(() => 0);
  const top = poll.resultsShown ? Math.max(...counts, 0) : 0;
  const link = funShareUrl({ feature: 'polls', target: poll.id });
  const canRemove = poll.isMine || canManage;

  const vote = async () => {
    if (!picked || voting) return;
    if (!loggedIn) { say('Log in to vote.', 'err'); onLogin?.(); return; }
    setVoting(true);
    try {
      onChanged(await votePoll(poll.id, picked));
      say('Your vote is in!', 'ok');
    } catch (e) {
      say(friendly(e, 'Could not send your vote. Please try again.'), 'err');
      if (e instanceof Error && /already voted|ended|not available/i.test(e.message)) { const fresh = await fetchPoll(poll.id).catch(() => null); if (fresh) onChanged(fresh); else onRemoved(poll.id); }
    } finally {
      setVoting(false);
    }
  };

  const remove = async () => {
    if (!armed) { setArmed(true); window.clearTimeout(armTimer.current); armTimer.current = window.setTimeout(() => setArmed(false), 3000); return; }
    setArmed(false);
    setBusy(true);
    try { await removePoll(poll.id); onRemoved(poll.id); say('Poll removed.', 'ok'); } catch (e) { say(friendly(e, 'Could not remove the poll.'), 'err'); } finally { setBusy(false); }
  };

  const report = async (reason: string) => {
    setBusy(true);
    try {
      const r = await reportPoll(poll.id, reason);
      setReporting(false);
      say('Reported. Thank you: the NOOB team will take a look.', 'ok');
      if (r.hidden) onRemoved(poll.id);
    } catch (e) {
      say(friendly(e, 'Could not send the report.'), 'err');
    } finally {
      setBusy(false);
    }
  };

  const shareLink = async () => {
    try {
      if (navigator.share) { await navigator.share({ title: 'Poll on NOOB SOCIALS', text: poll.question, url: link }); return; }
      await navigator.clipboard.writeText(link);
      say('Link copied.', 'ok');
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      say('Could not share. Use "Copy link" instead.', 'err');
    }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(link); say('Link copied.', 'ok'); } catch { say('Could not copy the link.', 'err'); } };
  const spec = { eyebrow: 'Public poll', title: poll.question, options: poll.options.map((o) => o.label), link: { url: link, label: 'Vote now' } };
  const toStory = async () => { if (!loggedIn) { onLogin?.(); return; } setBusy(true); try { await shareCardAsStory(spec); say('Added to your Story.', 'ok'); } catch (e) { say(friendly(e, 'Could not add it to your Story.'), 'err'); } finally { setBusy(false); } };
  const toPost = async () => { if (!loggedIn) { onLogin?.(); return; } setBusy(true); try { await shareCardAsPost(spec, `${poll.question}\n\nVote: ${link}`); say('Posted on your profile.', 'ok'); } catch (e) { say(friendly(e, 'Could not post it.'), 'err'); } finally { setBusy(false); } };

  const chip = poll.status === 'hidden' ? 'Hidden for review' : active ? timeLeftLabel(poll.endsAt, now) : poll.status === 'completed' ? `Completed · ${timeAgo(poll.endsAt)}` : `Expired · no votes`;
  const small = 'fx-act';

  return (
    <Card ariaLabel={`Poll: ${poll.question}`} className="fx-poll">
      <button type="button" onClick={() => onOpenProfile?.(asUser(poll.creator))} className="fx-poll-by text-left" aria-label={`Open ${poll.creator.displayName}'s profile`}>
        {poll.creator.avatar ? <img src={poll.creator.avatar} alt="" referrerPolicy="no-referrer" className="fx-pava" /> : <span className="fx-pava is-blank" aria-hidden="true" />}
        <span className="fx-grow">
          <span className="fx-by-name fx-trunc">{poll.creator.displayName}{poll.creator.isVerified && <VerifiedBadge size="xs" />}</span>
          <span className="block fx-t11 fx-muted fx-trunc">@{poll.creator.username} · {timeAgo(poll.createdAt)}</span>
        </span>
      </button>

      {onOpen ? (
        <button type="button" onClick={() => onOpen(poll)} className="fx-pq text-left break-words [overflow-wrap:anywhere]">{poll.question}</button>
      ) : (
        <h2 className="fx-pq break-words [overflow-wrap:anywhere]">{poll.question}</h2>
      )}

      <div className="fx-opts" role={interactive ? 'radiogroup' : undefined} aria-label={interactive ? 'Options' : undefined}>
        {poll.options.map((o, i) => {
          const mine = poll.myVote === o.id;
          const on = picked === o.id;
          const lead = counts[i] === top && top > 0;
          const inner = (
            <>
              {poll.resultsShown && <span aria-hidden="true" className={`fx-optbar transition-[width] duration-500 ease-out ${lead ? 'is-top' : ''}`} style={{ width: revealed ? `${pcts[i]}%` : '0%', transitionDelay: `${Math.min(i, 7) * 50}ms` }} />}
              <span className="fx-opt-main">
                {interactive ? <span className={`fx-radio ${on ? 'is-on' : ''}`} aria-hidden="true">{on && <Check className="w-3 h-3" />}</span> : mine ? <Check className="w-4 h-4 shrink-0 fx-mine-ic" aria-hidden="true" /> : null}
                <span className="fx-opt-label break-words [overflow-wrap:anywhere] min-w-0">{o.label}</span>
              </span>
              {poll.resultsShown && (
                <span className="fx-opt-num">
                  <span className="fx-opt-pct">{pcts[i]}%</span>
                  <span className="fx-opt-cnt">{plural(counts[i], 'vote', 'votes')}</span>
                </span>
              )}
            </>
          );
          const cls = `fx-opt ${on ? 'is-on' : ''} ${mine ? 'is-mine' : ''} ${lead ? 'is-lead' : ''}`;
          return interactive ? (
            <button key={o.id} type="button" role="radio" aria-checked={on} onClick={() => setPicked(o.id)} className={cls}>{inner}</button>
          ) : (
            <div key={o.id} className={cls} aria-label={poll.resultsShown ? `${o.label}: ${pcts[i]}% (${plural(counts[i], 'vote', 'votes')})${mine ? ', your vote' : ''}` : mine ? `${o.label}, your vote` : undefined}>{inner}</div>
          );
        })}
      </div>

      {interactive && (
        <button type="button" onClick={() => void vote()} disabled={!picked || voting} className="fx-btn">
          <BusyLabel busy={voting}>{loggedIn ? 'Vote' : 'Log in to vote'}</BusyLabel>
        </button>
      )}

      <div className="fx-poll-foot">
        <p aria-live="polite">
          {poll.resultsShown && poll.totalVotes !== null ? <><BarChart3 className="w-3.5 h-3.5" aria-hidden="true" />{plural(poll.totalVotes, 'vote', 'votes')} in total</> : voted ? <><Lock className="w-3.5 h-3.5" aria-hidden="true" />Your vote is in. The results appear when the poll ends.</> : poll.resultsVisibility === 'after_end' ? <><Lock className="w-3.5 h-3.5" aria-hidden="true" />The results appear when the poll ends.</> : <><Lock className="w-3.5 h-3.5" aria-hidden="true" />The results appear after you vote.</>}
        </p>
        <span className={`fx-time ${active ? 'is-live' : ''}`}><Clock className="w-3.5 h-3.5" aria-hidden="true" />{chip}</span>
      </div>

      <div className="fx-acts fx-poll-acts">
        <button type="button" onClick={() => setShareOpen((v) => !v)} aria-expanded={shareOpen} className={small}><Share2 className="w-3.5 h-3.5" aria-hidden="true" />Share</button>
        {canRemove && <button type="button" onClick={() => void remove()} disabled={busy} className={`${small} ${armed ? 'is-warn' : ''}`}><Trash2 className="w-3.5 h-3.5" aria-hidden="true" />{armed ? 'Tap again' : poll.isMine ? 'Remove' : 'Remove (admin)'}</button>}
        {!poll.isMine && <button type="button" onClick={() => (loggedIn ? setReporting((v) => !v) : onLogin?.())} aria-expanded={reporting} className={small}><Flag className="w-3.5 h-3.5" aria-hidden="true" />Report</button>}
      </div>

      {shareOpen && (
        <div className="fx-subpanel fx-acts" role="group" aria-label="Share this poll">
          <button type="button" onClick={() => void copy()} className={small}><Link2 className="w-3.5 h-3.5" aria-hidden="true" />Copy link</button>
          <button type="button" onClick={() => void shareLink()} className={small}><Share2 className="w-3.5 h-3.5" aria-hidden="true" />Send to friends</button>
          <button type="button" onClick={() => void toStory()} disabled={busy} className={small}><ImageIcon className="w-3.5 h-3.5" aria-hidden="true" />Add to my Story</button>
          <button type="button" onClick={() => void toPost()} disabled={busy} className={small}><FileImage className="w-3.5 h-3.5" aria-hidden="true" />Post on my profile</button>
        </div>
      )}
      {reporting && (
        <div className="fx-subpanel" role="group" aria-label="Why are you reporting this poll?">
          <p className="fx-t13 fx-muted">Why are you reporting it?</p>
          <div className="fx-acts">{REPORT_REASONS.map((r) => <button key={r} type="button" onClick={() => void report(r)} disabled={busy} className={small}>{r}</button>)}</div>
        </div>
      )}
    </Card>
  );
};

// ================================================================================================================================ the form that makes a poll
const CreateForm: React.FC<{ onCreated: (p: Poll) => void; onCancel: () => void; say: (t: string, k?: 'ok' | 'err') => void }> = ({ onCreated, onCancel, say }) => {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [minutes, setMinutes] = useState(1440);
  const [results, setResults] = useState<PollResultsRule>('after_vote');
  const [saving, setSaving] = useState(false);
  const inputCls = 'fx-input';
  const filled = options.map((o) => o.trim()).filter(Boolean);
  const ready = question.trim().length >= 5 && filled.length >= 2 && !saving;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setSaving(true);
    try {
      const made = await createPoll({ question, options: filled, durationMinutes: minutes, results });
      say('Your poll is live!', 'ok');
      onCreated(made);
    } catch (err) {
      say(friendly(err, 'Could not create the poll. Please try again.'), 'err');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fx-sheet-wrap">
      <div className="fx-scrim" onClick={onCancel} aria-hidden="true" />
      <div className="fx-sheet" role="dialog" aria-modal="true" aria-label="Create a poll">
        <div className="fx-sheet-grab" aria-hidden="true" />
        <form onSubmit={submit} className="fx-sheet-form">
          <div className="fx-sheet-head">
            <h2 className="fx-sheet-title">Create a poll</h2>
            <button type="button" onClick={onCancel} aria-label="Close" className="fx-ib is-quiet"><X className="w-5 h-5" aria-hidden="true" /></button>
          </div>
          <div className="fx-field">
            <label htmlFor="poll-q" className="fx-label">Your question</label>
            <textarea id="poll-q" value={question} onChange={(e) => { const c = Array.from(e.target.value); setQuestion(c.length > POLL_QUESTION_MAX ? c.slice(0, POLL_QUESTION_MAX).join('') : e.target.value); }} rows={2} placeholder="What do you want to ask?" className="fx-input" />
            <p className="fx-count">{codePoints(question)} / {POLL_QUESTION_MAX}</p>
          </div>
          <div className="fx-field">
            <p className="fx-label">Options (2 to {POLL_MAX_OPTIONS})</p>
            {options.map((o, i) => (
              <div key={i} className="fx-optrow">
                <input aria-label={`Option ${i + 1}`} value={o} maxLength={POLL_OPTION_MAX} onChange={(e) => setOptions((list) => list.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Option ${i + 1}`} className={inputCls} />
                {options.length > 2 && <button type="button" onClick={() => setOptions((list) => list.filter((_, j) => j !== i))} aria-label={`Remove option ${i + 1}`} className="fx-ib is-field shrink-0"><X className="w-4 h-4" aria-hidden="true" /></button>}
              </div>
            ))}
            {options.length < POLL_MAX_OPTIONS && <button type="button" onClick={() => setOptions((list) => [...list, ''])} className="fx-textbtn"><Plus className="w-4 h-4" aria-hidden="true" />Add an option</button>}
          </div>
          <div className="fx-field">
            <p className="fx-label" id="poll-dur">How long should it run?</p>
            <div className="fx-chips" role="radiogroup" aria-labelledby="poll-dur">
              {DURATIONS.map((d) => <button key={d.minutes} type="button" role="radio" aria-checked={minutes === d.minutes} onClick={() => setMinutes(d.minutes)} className="fx-pill">{d.label}</button>)}
            </div>
          </div>
          <div className="fx-field">
            <p className="fx-label" id="poll-res">When are the results shown?</p>
            <div className="fx-rules" role="radiogroup" aria-labelledby="poll-res">
              {RESULT_RULES.map((r) => <button key={r.id} type="button" role="radio" aria-checked={results === r.id} onClick={() => setResults(r.id)} className="fx-rule"><span className="fx-rule-t">{r.label}</span><small>{r.hint}</small></button>)}
            </div>
          </div>
          <p className="fx-t11 fx-faint">Polls are public. Everyone sees your name on it, but nobody sees who voted for what.</p>
          <div className="fx-sheet-foot">
            <button type="submit" disabled={!ready} className="fx-btn"><BusyLabel busy={saving}>Create poll</BusyLabel></button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ================================================================================================================================ the page
const PollsPage: React.FC<FunPageProps> = ({ currentUser, target, onLogin, onOpenProfile, onOpenFeature }) => {
  const [tab, setTab] = useState<'active' | 'ended' | 'mine'>('active');
  const [items, setItems] = useState<Poll[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorText, setErrorText] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [creating, setCreating] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [reports, setReports] = useState<PollReport[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [single, setSingle] = useState<Poll | null | undefined>(undefined);   // the poll of /polls/<id>: undefined loading, null not available
  const { say, toast } = useToast();
  const loadId = useRef(0);
  const loggedIn = !!currentUser;

  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(t); }, []);
  useEffect(() => {
    if (!currentUser) { setCanManage(false); return; }
    let alive = true;
    void fetchFunCanManage().then((ok) => { if (alive && ok) { setCanManage(true); void fetchPollReports().then((r) => { if (alive) setReports(r); }).catch(() => undefined); } });
    return () => { alive = false; };
  }, [currentUser?.id]);

  // ---- one poll (a shared link)
  const loadSingle = useCallback(async () => {
    if (!target) return;
    try { setSingle(await fetchPoll(target)); } catch (e) { setSingle((s) => (s === undefined ? null : s)); }
  }, [target]);
  useEffect(() => { setSingle(undefined); if (target) void loadSingle(); }, [target, loadSingle]);

  // ---- the lists
  const load = useCallback(async (mode: 'initial' | 'quiet') => {
    if (target) return;
    const id = ++loadId.current;
    if (mode === 'initial') setStatus('loading');
    try {
      const page = await fetchPolls({ tab, limit: PAGE_SIZE });
      if (id !== loadId.current) return;
      if (mode === 'quiet') {
        // bring in the newest numbers without moving anything on the page
        setItems((prev) => prev.map((p) => page.polls.find((f) => f.id === p.id) ?? p));
      } else {
        setItems(page.polls);
        setHasMore(page.hasMore);
        setStatus('ready');
      }
    } catch (e) {
      if (id !== loadId.current) return;
      if (mode === 'initial') { setErrorText(friendly(e, 'Could not load the polls. Please check your connection and try again.')); setStatus('error'); }
    }
  }, [tab, target]);
  useEffect(() => { void load('initial'); }, [load]);
  // (only the Home page refreshes (pull down there): no other page has a refresh button, a pull-down refresh or a timer that reloads it: a poll's numbers come back with your vote, and are fresh whenever the page is opened.)

  const changed = (p: Poll) => { setItems((list) => list.map((x) => (x.id === p.id ? p : x))); setSingle((s) => (s && s.id === p.id ? p : s)); };
  const removed = (id: string) => { setItems((list) => list.filter((x) => x.id !== id)); setSingle((s) => (s && s.id === id ? null : s)); setReports((r) => r.filter((x) => x.poll.id !== id)); };

  const loadMore = async () => {
    const last = items[items.length - 1];
    if (!last || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchPolls({ tab, limit: PAGE_SIZE, before: { time: last.endsAt, seq: last.seq } });
      setItems((list) => { const seen = new Set(list.map((x) => x.id)); return [...list, ...page.polls.filter((x) => !seen.has(x.id))]; });
      setHasMore(page.hasMore);
    } catch (e) {
      say(friendly(e, 'Could not load more polls.'), 'err');
    } finally {
      setLoadingMore(false);
    }
  };

  const openPoll = (p: Poll) => onOpenFeature({ feature: 'polls', target: p.id });
  const cardProps = { now, loggedIn, canManage, onLogin, onChanged: changed, onRemoved: removed, onOpenProfile, say };

  if (target) {
    return (
      <div className="fx-stack">
        <button type="button" onClick={() => onOpenFeature({ feature: 'polls' })} className="fx-textbtn"><ArrowLeft className="w-4 h-4" aria-hidden="true" />All polls</button>
        {single === undefined && <SkeletonCards count={1} label="Loading the poll" />}
        {single === null && <EmptyState icon={<BarChart3 className="w-6 h-6" aria-hidden="true" />} title="This poll is not available" hint="It may have been removed, or the link is not right." />}
        {single && <PollCard poll={single} {...cardProps} />}
        {toast}
      </div>
    );
  }

  const tabCls = (_on: boolean) => 'fx-seg-btn';
  return (
    <div className="fx-stack">
      <div className="fx-seg" role="tablist" aria-label="Polls">
        <button type="button" role="tab" aria-selected={tab === 'active'} onClick={() => setTab('active')} className={tabCls(tab === 'active')}>Active</button>
        <button type="button" role="tab" aria-selected={tab === 'ended'} onClick={() => setTab('ended')} className={tabCls(tab === 'ended')}>Ended</button>
        <button type="button" role="tab" aria-selected={tab === 'mine'} onClick={() => (loggedIn ? setTab('mine') : (say('Log in to see your polls.', 'err'), onLogin?.()))} className={tabCls(tab === 'mine')}>My polls</button>
      </div>
      <p className="fx-intro">Ask the community, vote once, and watch the results arrive.</p>

      {creating && <CreateForm say={say} onCancel={() => setCreating(false)} onCreated={(p) => { setCreating(false); setTab('mine'); setItems((l) => [p, ...l]); void load('initial'); }} />}

      {status === 'loading' && <SkeletonCards count={2} label="Loading polls" />}
      {status === 'error' && <ErrorState text={errorText} onRetry={() => void load('initial')} />}
      {status === 'ready' && items.length === 0 && (
        <EmptyState
          icon={<BarChart3 className="w-6 h-6" aria-hidden="true" />}
          title={tab === 'active' ? 'No active polls right now' : tab === 'ended' ? 'No finished polls yet' : 'You have not made a poll yet'}
          hint={tab === 'mine' ? 'Ask the community something. It takes a minute.' : 'Be the first: create a poll and share it with friends.'}
        />
      )}
      {status === 'ready' && items.length > 0 && <div className="fx-list">{items.map((p) => <PollCard key={p.id} poll={p} {...cardProps} onOpen={openPoll} />)}</div>}
      {status === 'ready' && hasMore && (
        <div className="fx-more">
          <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="fx-btn-ghost is-auto"><BusyLabel busy={loadingMore}><ChevronDown className="w-4 h-4" aria-hidden="true" /> Load more</BusyLabel></button>
        </div>
      )}

      {canManage && reports.length > 0 && (
        <section aria-label="Reported polls" className="fx-manage">
          <div className="fx-manage-head">
            <h2 className="fx-h2"><ShieldCheck className="w-4 h-4" aria-hidden="true" /> Reported polls ({reports.length})</h2>
            <span className="fx-tag">Managers only</span>
          </div>
          {reports.map((r) => (
            <div key={r.poll.id} className="fx-reported">
              <p className="fx-t11 fx-muted">{plural(r.reportCount, 'report', 'reports')}{r.reasons.length ? `: ${r.reasons.join(' · ')}` : ''}</p>
              <PollCard poll={r.poll} {...cardProps} />
              <button type="button" onClick={async () => { try { await dismissPollReports(r.poll.id); setReports((l) => l.filter((x) => x.poll.id !== r.poll.id)); say('Reports cleared. The poll stays.', 'ok'); void load('quiet'); } catch (e) { say(friendly(e, 'That did not work.'), 'err'); } }} className="fx-btn-ghost">This poll is fine: clear the reports</button>
            </div>
          ))}
        </section>
      )}

      {!creating && (
        <div className="fx-fab-wrap">
          <button type="button" onClick={() => (loggedIn ? setCreating(true) : (say('Log in to create a poll.', 'err'), onLogin?.()))} aria-expanded={creating} className="fx-fab"><Plus className="w-5 h-5" aria-hidden="true" />Create poll</button>
        </div>
      )}
      {toast}
    </div>
  );
};

export default PollsPage;
