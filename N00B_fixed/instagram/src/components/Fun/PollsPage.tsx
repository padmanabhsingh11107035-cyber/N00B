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
const REFRESH_MS = 12_000;
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
  const spec = { eyebrow: 'Public poll', title: poll.question, options: poll.options.map((o) => o.label), footer: `Vote: ${link}` };
  const toStory = async () => { if (!loggedIn) { onLogin?.(); return; } setBusy(true); try { await shareCardAsStory(spec); say('Added to your Story.', 'ok'); } catch (e) { say(friendly(e, 'Could not add it to your Story.'), 'err'); } finally { setBusy(false); } };
  const toPost = async () => { if (!loggedIn) { onLogin?.(); return; } setBusy(true); try { await shareCardAsPost(spec, `${poll.question}\n\nVote: ${link}`); say('Posted on your profile.', 'ok'); } catch (e) { say(friendly(e, 'Could not post it.'), 'err'); } finally { setBusy(false); } };

  const chip = poll.status === 'hidden' ? 'Hidden for review' : active ? timeLeftLabel(poll.endsAt, now) : poll.status === 'completed' ? `Completed · ${timeAgo(poll.endsAt)}` : `Expired · no votes`;
  const small = 'h-8 px-3 rounded-full border text-[11px] font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors';

  return (
    <Card ariaLabel={`Poll: ${poll.question}`}>
      <div className="flex items-center gap-2.5">
        <button type="button" onClick={() => onOpenProfile?.(asUser(poll.creator))} className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer" aria-label={`Open ${poll.creator.displayName}'s profile`}>
          {poll.creator.avatar ? <img src={poll.creator.avatar} alt="" referrerPolicy="no-referrer" className="w-9 h-9 rounded-full object-cover border border-zinc-700 shrink-0" /> : <div className="w-9 h-9 rounded-full border border-zinc-700 bg-zinc-800 shrink-0" aria-hidden="true" />}
          <span className="min-w-0">
            <span className="flex items-center gap-1 text-xs font-black truncate">{poll.creator.displayName}{poll.creator.isVerified && <VerifiedBadge size="xs" />}</span>
            <span className="block text-[10px] text-zinc-500 truncate">@{poll.creator.username} · {timeAgo(poll.createdAt)}</span>
          </span>
        </button>
        <span className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wide rounded-full border px-2.5 py-1 ${active ? 'border-zinc-50 text-zinc-50' : 'border-zinc-700 text-zinc-400'}`}><Clock className="w-3 h-3" aria-hidden="true" />{chip}</span>
      </div>

      {onOpen ? (
        <button type="button" onClick={() => onOpen(poll)} className="mt-3 block w-full text-left text-base font-black leading-snug break-words [overflow-wrap:anywhere] cursor-pointer hover:underline underline-offset-[3px]">{poll.question}</button>
      ) : (
        <h2 className="mt-3 text-lg font-black leading-snug break-words [overflow-wrap:anywhere]">{poll.question}</h2>
      )}

      <div className="mt-3 space-y-2" role={interactive ? 'radiogroup' : undefined} aria-label={interactive ? 'Options' : undefined}>
        {poll.options.map((o, i) => {
          const mine = poll.myVote === o.id;
          const on = picked === o.id;
          const inner = (
            <>
              {poll.resultsShown && <span aria-hidden="true" className={`absolute inset-y-0 left-0 transition-[width] duration-700 ease-out ${counts[i] === top && top > 0 ? 'bg-noob/25' : 'bg-noob/10'}`} style={{ width: revealed ? `${pcts[i]}%` : '0%' }} />}
              <span className="relative z-10 flex items-center gap-2 min-w-0">
                {interactive ? <span className={`w-4 h-4 rounded-full border shrink-0 flex items-center justify-center ${on ? 'bg-noob border-zinc-50 text-black' : 'border-zinc-500'}`} aria-hidden="true">{on && <Check className="w-3 h-3" />}</span> : mine ? <Check className="w-4 h-4 shrink-0" aria-hidden="true" /> : null}
                <span className="text-sm font-bold break-words [overflow-wrap:anywhere] min-w-0">{o.label}</span>
              </span>
              {poll.resultsShown && (
                <span className="relative z-10 shrink-0 text-right leading-tight">
                  <span className="block text-sm font-black tabular-nums">{pcts[i]}%</span>
                  <span className="block text-[10px] text-zinc-400 tabular-nums">{plural(counts[i], 'vote', 'votes')}</span>
                </span>
              )}
            </>
          );
          const cls = `relative overflow-hidden w-full rounded-2xl border px-3.5 py-3 flex items-center justify-between gap-3 text-left transition-colors ${mine ? 'border-zinc-50' : on ? 'border-zinc-50' : 'border-zinc-700'} ${interactive ? 'cursor-pointer hover:border-zinc-50 active:scale-[0.99]' : ''}`;
          return interactive ? (
            <button key={o.id} type="button" role="radio" aria-checked={on} onClick={() => setPicked(o.id)} className={cls}>{inner}</button>
          ) : (
            <div key={o.id} className={cls} aria-label={poll.resultsShown ? `${o.label}: ${pcts[i]}% (${plural(counts[i], 'vote', 'votes')})${mine ? ', your vote' : ''}` : mine ? `${o.label}, your vote` : undefined}>{inner}</div>
          );
        })}
      </div>

      {interactive && (
        <button type="button" onClick={() => void vote()} disabled={!picked || voting} className="mt-3 w-full h-11 rounded-full bg-noob text-black text-sm font-extrabold cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed">
          <BusyLabel busy={voting}>{loggedIn ? 'Vote' : 'Log in to vote'}</BusyLabel>
        </button>
      )}

      <p className="mt-2.5 text-[11px] text-zinc-400 flex items-center gap-1.5" aria-live="polite">
        {poll.resultsShown && poll.totalVotes !== null ? <><BarChart3 className="w-3 h-3" aria-hidden="true" />{plural(poll.totalVotes, 'vote', 'votes')} in total</> : voted ? <><Lock className="w-3 h-3" aria-hidden="true" />Your vote is in. The results appear when the poll ends.</> : poll.resultsVisibility === 'after_end' ? <><Lock className="w-3 h-3" aria-hidden="true" />The results appear when the poll ends.</> : <><Lock className="w-3 h-3" aria-hidden="true" />The results appear after you vote.</>}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => setShareOpen((v) => !v)} aria-expanded={shareOpen} className={`${small} border-zinc-700 text-zinc-200 hover:border-zinc-50`}><Share2 className="w-3 h-3" aria-hidden="true" />Share</button>
        {canRemove && <button type="button" onClick={() => void remove()} disabled={busy} className={`${small} ${armed ? 'border-red-400 text-red-300' : 'border-zinc-700 text-zinc-300 hover:border-zinc-50'}`}><Trash2 className="w-3 h-3" aria-hidden="true" />{armed ? 'Tap again' : poll.isMine ? 'Remove' : 'Remove (admin)'}</button>}
        {!poll.isMine && <button type="button" onClick={() => (loggedIn ? setReporting((v) => !v) : onLogin?.())} aria-expanded={reporting} className={`${small} border-zinc-700 text-zinc-300 hover:border-zinc-50`}><Flag className="w-3 h-3" aria-hidden="true" />Report</button>}
      </div>

      {shareOpen && (
        <div className="mt-2.5 flex flex-wrap gap-2 rounded-2xl border border-zinc-800 p-2.5" role="group" aria-label="Share this poll">
          <button type="button" onClick={() => void copy()} className={`${small} border-zinc-600 hover:border-zinc-50`}><Link2 className="w-3 h-3" aria-hidden="true" />Copy link</button>
          <button type="button" onClick={() => void shareLink()} className={`${small} border-zinc-600 hover:border-zinc-50`}><Share2 className="w-3 h-3" aria-hidden="true" />Send to friends</button>
          <button type="button" onClick={() => void toStory()} disabled={busy} className={`${small} border-zinc-600 hover:border-zinc-50`}><ImageIcon className="w-3 h-3" aria-hidden="true" />Add to my Story</button>
          <button type="button" onClick={() => void toPost()} disabled={busy} className={`${small} border-zinc-600 hover:border-zinc-50`}><FileImage className="w-3 h-3" aria-hidden="true" />Post on my profile</button>
        </div>
      )}
      {reporting && (
        <div className="mt-2.5 rounded-2xl border border-zinc-700 p-3 space-y-2" role="group" aria-label="Why are you reporting this poll?">
          <p className="text-xs text-zinc-300">Why are you reporting it?</p>
          <div className="flex flex-wrap gap-2">{REPORT_REASONS.map((r) => <button key={r} type="button" onClick={() => void report(r)} disabled={busy} className="h-8 px-3 rounded-full border border-zinc-600 hover:border-zinc-50 text-[11px] font-bold cursor-pointer disabled:opacity-50">{r}</button>)}</div>
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
  const inputCls = 'w-full h-11 rounded-xl bg-zinc-950 border border-zinc-700 focus:border-zinc-50 outline-none px-3 text-sm';
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
    <Card ariaLabel="Create a poll">
      <form onSubmit={submit} className="space-y-3.5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-black">Create a poll</h2>
          <button type="button" onClick={onCancel} aria-label="Close" className="w-8 h-8 rounded-full border border-zinc-700 hover:border-zinc-50 flex items-center justify-center cursor-pointer"><X className="w-4 h-4" aria-hidden="true" /></button>
        </div>
        <div>
          <label htmlFor="poll-q" className="text-xs font-bold text-zinc-300">Your question</label>
          <textarea id="poll-q" value={question} onChange={(e) => { const c = Array.from(e.target.value); setQuestion(c.length > POLL_QUESTION_MAX ? c.slice(0, POLL_QUESTION_MAX).join('') : e.target.value); }} rows={2} placeholder="What do you want to ask?" className="mt-1.5 w-full rounded-xl bg-zinc-950 border border-zinc-700 focus:border-zinc-50 outline-none p-3 text-sm resize-none" />
          <p className="text-right text-[11px] tabular-nums text-zinc-500">{codePoints(question)} / {POLL_QUESTION_MAX}</p>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-bold text-zinc-300">Options (2 to {POLL_MAX_OPTIONS})</p>
          {options.map((o, i) => (
            <div key={i} className="flex gap-2">
              <input aria-label={`Option ${i + 1}`} value={o} maxLength={POLL_OPTION_MAX} onChange={(e) => setOptions((list) => list.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Option ${i + 1}`} className={inputCls} />
              {options.length > 2 && <button type="button" onClick={() => setOptions((list) => list.filter((_, j) => j !== i))} aria-label={`Remove option ${i + 1}`} className="shrink-0 w-11 h-11 rounded-xl border border-zinc-700 hover:border-red-400 flex items-center justify-center cursor-pointer"><X className="w-4 h-4" aria-hidden="true" /></button>}
            </div>
          ))}
          {options.length < POLL_MAX_OPTIONS && <button type="button" onClick={() => setOptions((list) => [...list, ''])} className="h-10 px-4 rounded-full border border-dashed border-zinc-600 hover:border-zinc-50 text-xs font-bold flex items-center gap-1.5 cursor-pointer"><Plus className="w-3.5 h-3.5" aria-hidden="true" />Add an option</button>}
        </div>
        <div>
          <p className="text-xs font-bold text-zinc-300" id="poll-dur">How long should it run?</p>
          <div className="mt-1.5 flex flex-wrap gap-2" role="radiogroup" aria-labelledby="poll-dur">
            {DURATIONS.map((d) => <button key={d.minutes} type="button" role="radio" aria-checked={minutes === d.minutes} onClick={() => setMinutes(d.minutes)} className={`h-9 px-3.5 rounded-full border text-xs font-bold cursor-pointer transition-colors ${minutes === d.minutes ? 'bg-noob text-black border-zinc-50' : 'border-zinc-700 text-zinc-300 hover:border-zinc-50'}`}>{d.label}</button>)}
          </div>
        </div>
        <div>
          <p className="text-xs font-bold text-zinc-300" id="poll-res">When are the results shown?</p>
          <div className="mt-1.5 grid grid-cols-3 gap-2" role="radiogroup" aria-labelledby="poll-res">
            {RESULT_RULES.map((r) => <button key={r.id} type="button" role="radio" aria-checked={results === r.id} onClick={() => setResults(r.id)} className={`rounded-2xl border p-2.5 text-center cursor-pointer transition-colors ${results === r.id ? 'bg-noob text-black border-zinc-50' : 'bg-zinc-950 border-zinc-700 hover:border-zinc-50'}`}><span className="block text-xs font-black">{r.label}</span><span className={`block text-[10px] leading-tight mt-0.5 ${results === r.id ? 'text-black/70' : 'text-zinc-500'}`}>{r.hint}</span></button>)}
          </div>
        </div>
        <button type="submit" disabled={!ready} className="w-full h-12 rounded-full bg-noob text-black text-sm font-extrabold cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"><BusyLabel busy={saving}>Create poll</BusyLabel></button>
        <p className="text-[11px] text-zinc-500 text-center">Polls are public. Everyone sees your name on it, but nobody sees who voted for what.</p>
      </form>
    </Card>
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
  useEffect(() => {
    if (!target) return;
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') void loadSingle(); }, REFRESH_MS);
    return () => window.clearInterval(t);
  }, [target, loadSingle]);

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
  useEffect(() => {
    if (target) return;
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') void load('quiet'); }, REFRESH_MS);
    return () => window.clearInterval(t);
  }, [target, load]);

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
      <div className="space-y-4">
        <button type="button" onClick={() => onOpenFeature({ feature: 'polls' })} className="h-9 pl-2.5 pr-4 rounded-full border border-zinc-700 hover:border-zinc-50 text-xs font-bold flex items-center gap-1.5 cursor-pointer"><ArrowLeft className="w-4 h-4" aria-hidden="true" />All polls</button>
        {single === undefined && <SkeletonCards count={1} label="Loading the poll" />}
        {single === null && <EmptyState icon={<BarChart3 className="w-8 h-8" aria-hidden="true" />} title="This poll is not available" hint="It may have been removed, or the link is not right." />}
        {single && <PollCard poll={single} {...cardProps} />}
        {toast}
      </div>
    );
  }

  const tabCls = (on: boolean) => `flex-1 h-10 rounded-full border text-xs font-bold cursor-pointer transition-all ${on ? 'bg-noob text-black border-zinc-50' : 'border-zinc-700 text-zinc-300 hover:border-zinc-50'}`;
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <p className="flex-1 text-xs text-zinc-400 leading-relaxed">Ask the community, vote once, and watch the results arrive.</p>
        <button type="button" onClick={() => (loggedIn ? setCreating((v) => !v) : (say('Log in to create a poll.', 'err'), onLogin?.()))} aria-expanded={creating} className="shrink-0 h-10 px-4 rounded-full bg-noob text-black text-xs font-extrabold flex items-center gap-1.5 cursor-pointer hover:scale-[1.02] active:scale-95 transition-transform"><Plus className="w-4 h-4" aria-hidden="true" />Create poll</button>
      </div>

      {creating && <CreateForm say={say} onCancel={() => setCreating(false)} onCreated={(p) => { setCreating(false); setTab('mine'); setItems((l) => [p, ...l]); void load('initial'); }} />}

      <div className="flex gap-2" role="tablist" aria-label="Polls">
        <button type="button" role="tab" aria-selected={tab === 'active'} onClick={() => setTab('active')} className={tabCls(tab === 'active')}>Active</button>
        <button type="button" role="tab" aria-selected={tab === 'ended'} onClick={() => setTab('ended')} className={tabCls(tab === 'ended')}>Ended</button>
        <button type="button" role="tab" aria-selected={tab === 'mine'} onClick={() => (loggedIn ? setTab('mine') : (say('Log in to see your polls.', 'err'), onLogin?.()))} className={tabCls(tab === 'mine')}>My polls</button>
      </div>

      {status === 'loading' && <SkeletonCards count={2} label="Loading polls" />}
      {status === 'error' && <ErrorState text={errorText} onRetry={() => void load('initial')} />}
      {status === 'ready' && items.length === 0 && (
        <EmptyState
          icon={<BarChart3 className="w-8 h-8" aria-hidden="true" />}
          title={tab === 'active' ? 'No active polls right now' : tab === 'ended' ? 'No finished polls yet' : 'You have not made a poll yet'}
          hint={tab === 'mine' ? 'Ask the community something. It takes a minute.' : 'Be the first: create a poll and share it with friends.'}
          action={<button type="button" onClick={() => (loggedIn ? setCreating(true) : onLogin?.())} className="px-6 py-3 rounded-full bg-noob text-black text-sm font-extrabold cursor-pointer">Create poll</button>}
        />
      )}
      {status === 'ready' && items.map((p) => <PollCard key={p.id} poll={p} {...cardProps} onOpen={openPoll} />)}
      {status === 'ready' && hasMore && (
        <div className="flex justify-center">
          <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="px-6 py-3 rounded-full border border-zinc-600 hover:border-zinc-50 text-sm font-bold cursor-pointer disabled:opacity-60"><BusyLabel busy={loadingMore}><ChevronDown className="w-4 h-4" aria-hidden="true" /> Load more</BusyLabel></button>
        </div>
      )}

      {canManage && reports.length > 0 && (
        <section aria-label="Reported polls" className="space-y-3">
          <h2 className="flex items-center gap-1.5 text-sm font-black"><ShieldCheck className="w-4 h-4" aria-hidden="true" /> Reported polls ({reports.length})</h2>
          {reports.map((r) => (
            <div key={r.poll.id} className="space-y-1.5">
              <p className="text-[11px] text-zinc-400 px-1">{plural(r.reportCount, 'report', 'reports')}{r.reasons.length ? `: ${r.reasons.join(' · ')}` : ''}</p>
              <PollCard poll={r.poll} {...cardProps} />
              <button type="button" onClick={async () => { try { await dismissPollReports(r.poll.id); setReports((l) => l.filter((x) => x.poll.id !== r.poll.id)); say('Reports cleared. The poll stays.', 'ok'); void load('quiet'); } catch (e) { say(friendly(e, 'That did not work.'), 'err'); } }} className="w-full h-9 rounded-full border border-zinc-600 hover:border-zinc-50 text-xs font-bold cursor-pointer">This poll is fine: clear the reports</button>
            </div>
          ))}
        </section>
      )}
      {toast}
    </div>
  );
};

export default PollsPage;
