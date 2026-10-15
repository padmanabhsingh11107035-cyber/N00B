import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Share2, Plus, Trash2, Zap, CalendarClock, ChevronDown, X } from 'lucide-react';
import {
  fetchTotToday,
  fetchTotPrevious,
  voteTotQuestion,
  fetchFunCanManage,
  fetchTotAdmin,
  createTotQuestion,
  removeTotQuestion,
  type TotQuestion
} from '../../services/api';
import { funShareUrl } from '../../utils/funRoutes';
import { Card, EmptyState, ErrorState, SkeletonCards, BusyLabel, useToast, friendly } from './funUi';
import type { FunPageProps } from './types';

// This or That: one question a day with two big choices. Voting is one vote per person per question, kept by the database (a second vote is refused there, whatever this page
// does); the numbers come back only to someone who has voted, so nobody reads the result first and then follows the crowd. Earlier questions stay in a list and can still be
// voted on. The people who manage questions (the main administrator, or a helper with the "moderate content" permission) add and remove them here.

const PAGE_SIZE = 8;

/** today's date in India, YYYY-MM-DD (the day the questions follow) */
const indiaToday = (): string => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const dayLabel = (day: string): string => {
  const d = new Date(`${day}T00:00:00`);
  return Number.isNaN(d.getTime()) ? day : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};
const plural = (n: number, one: string, many: string): string => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/** the two percentages always add up to 100 */
const split = (a: number, total: number): [number, number] => {
  if (total <= 0) return [0, 0];
  const pa = Math.round((a / total) * 100);
  return [pa, 100 - pa];
};

const Choice: React.FC<{
  side: 'a' | 'b';
  q: TotQuestion;
  big: boolean;
  revealed: boolean;
  pending: 'a' | 'b' | null;
  disabled: boolean;
  onPick: () => void;
}> = ({ side, q, big, revealed, pending, disabled, onPick }) => {
  const label = side === 'a' ? q.optionA : q.optionB;
  const emoji = side === 'a' ? q.emojiA : q.emojiB;
  const res = q.results;
  const voted = q.myVote !== null;
  const mine = q.myVote === side;
  const [pa, pb] = res ? split(res.a, res.total) : [0, 0];
  const pct = side === 'a' ? pa : pb;
  const count = res ? (side === 'a' ? res.a : res.b) : 0;
  const lead = !!res && res.total > 0 && count > (side === 'a' ? res.b : res.a);
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled || voted}
      aria-label={voted ? `${label}: ${pct}% (${plural(count, 'vote', 'votes')})${mine ? ', your pick' : ''}` : `Vote ${label}`}
      aria-pressed={mine}
      className={`relative overflow-hidden rounded-2xl border flex flex-col items-center justify-center gap-1.5 text-center transition-all duration-200 ${big ? 'min-h-[176px] p-4' : 'min-h-[124px] p-3'} ${voted ? 'pt-9' : ''} ${
        voted
          ? `bg-zinc-950 cursor-default ${mine ? 'border-zinc-50 ring-2 ring-zinc-50' : 'border-zinc-700'}`
          : `bg-zinc-950 border-zinc-700 hover:border-zinc-50 hover:-translate-y-0.5 active:scale-[0.96] cursor-pointer ${pending === side ? 'scale-[0.97] border-zinc-50' : ''} disabled:opacity-70`
      }`}
    >
      {voted && <span aria-hidden="true" className="absolute inset-x-0 bottom-0 bg-noob/20 transition-[height] duration-700 ease-out" style={{ height: revealed ? `${pct}%` : '0%' }} />}
      {mine && (
        <span className="absolute top-2 left-2 z-10 inline-flex items-center gap-1 rounded-full bg-noob text-black text-[10px] font-black px-2 py-0.5">
          <Check className="w-3 h-3" aria-hidden="true" /> Your pick
        </span>
      )}
      <span className={`relative z-10 leading-none ${big ? 'text-5xl' : 'text-3xl'}`} aria-hidden="true">{emoji || '•'}</span>
      <span className={`relative z-10 font-black break-words max-w-full ${big ? 'text-lg' : 'text-sm'}`}>{label}</span>
      {voted && res && (
        <span className="relative z-10 flex flex-col items-center">
          <span className={`font-black tabular-nums ${big ? 'text-3xl' : 'text-xl'} ${lead ? '' : 'text-zinc-300'}`}>{pct}%</span>
          <span className="text-[11px] text-zinc-400 tabular-nums">{plural(count, 'vote', 'votes')}</span>
        </span>
      )}
    </button>
  );
};

const QuestionCard: React.FC<{
  q: TotQuestion;
  big?: boolean;
  title?: string;
  pending: { id: string; choice: 'a' | 'b' } | null;
  canManage: boolean;
  armed: boolean;
  onVote: (q: TotQuestion, choice: 'a' | 'b') => void;
  onRemove: (q: TotQuestion) => void;
}> = ({ q, big = false, title, pending, canManage, armed, onVote, onRemove }) => {
  const [revealed, setRevealed] = useState(false);
  const has = !!q.results;
  useEffect(() => {
    if (!has) { setRevealed(false); return; }
    const t = window.setTimeout(() => setRevealed(true), 40);
    return () => window.clearTimeout(t);
  }, [has]);
  const mineHere = pending && pending.id === q.id ? pending.choice : null;
  const busy = !!pending && pending.id === q.id;
  return (
    <Card ariaLabel={`${q.optionA} or ${q.optionB}`}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider rounded-full border border-zinc-700 px-2.5 py-1 text-zinc-200">
          {big && <Zap className="w-3 h-3" aria-hidden="true" />}
          {title ?? dayLabel(q.day)}
        </span>
        <span className="flex items-center gap-2">
          {big && <span className="text-[11px] text-zinc-400">{dayLabel(q.day)}</span>}
          {canManage && (
            <button type="button" onClick={() => onRemove(q)} aria-label={armed ? 'Tap again to remove this question' : 'Remove this question'} className={`h-7 px-2.5 rounded-full border text-[10px] font-bold flex items-center gap-1 cursor-pointer ${armed ? 'border-red-400 text-red-300' : 'border-zinc-700 text-zinc-400 hover:text-white'}`}>
              <Trash2 className="w-3 h-3" aria-hidden="true" /> {armed ? 'Tap again' : 'Remove'}
            </button>
          )}
        </span>
      </div>
      <div className="relative grid grid-cols-2 gap-3">
        <Choice side="a" q={q} big={big} revealed={revealed} pending={mineHere} disabled={busy} onPick={() => onVote(q, 'a')} />
        <Choice side="b" q={q} big={big} revealed={revealed} pending={mineHere} disabled={busy} onPick={() => onVote(q, 'b')} />
        <span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-zinc-950 border border-zinc-600 flex items-center justify-center text-[10px] font-black">OR</span>
      </div>
      <p className="mt-3 text-center text-[11px] text-zinc-400" aria-live="polite">
        {q.results
          ? `${plural(q.results.total, 'vote', 'votes')} in total`
          : 'Tap a side to vote and see what everyone chose.'}
      </p>
    </Card>
  );
};

const ThisOrThatPage: React.FC<FunPageProps> = ({ currentUser, onLogin }) => {
  const [today, setToday] = useState<TotQuestion | null>(null);
  const [previous, setPrevious] = useState<TotQuestion[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorText, setErrorText] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [pending, setPending] = useState<{ id: string; choice: 'a' | 'b' } | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [armed, setArmed] = useState<string | null>(null);
  const [upcoming, setUpcoming] = useState<TotQuestion[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ optionA: '', optionB: '', emojiA: '', emojiB: '', day: '' });
  const [saving, setSaving] = useState(false);
  const { say, toast } = useToast();
  const loadId = useRef(0);
  const armTimer = useRef<number | undefined>(undefined);
  const loggedIn = !!currentUser;
  useEffect(() => () => window.clearTimeout(armTimer.current), []);

  // (only the Home page refreshes (pull down there): no other page has a refresh button, a pull-down refresh or a timer that reloads it.)
  const load = useCallback(async (mode: 'initial' | 'quiet') => {
    const id = ++loadId.current;
    if (mode === 'initial') setStatus('loading');
    try {
      const [t, p] = await Promise.all([fetchTotToday(), fetchTotPrevious({ limit: PAGE_SIZE })]);
      if (id !== loadId.current) return;
      setToday(t);
      setPrevious(p.questions);
      setHasMore(p.hasMore);
      setStatus('ready');
    } catch (e) {
      if (id !== loadId.current) return;
      if (mode === 'initial') { setErrorText(friendly(e, 'Could not load the questions. Please check your connection and try again.')); setStatus('error'); }
    }
  }, []);

  useEffect(() => { void load('initial'); }, [load]);

  // managers: who they are, and the questions that are still to come
  const loadUpcoming = useCallback(async () => {
    try {
      const res = await fetchTotAdmin({ limit: 60 });
      const day = indiaToday();
      setUpcoming(res.questions.filter((q) => q.day > day).sort((a, b) => (a.day === b.day ? a.seq - b.seq : a.day < b.day ? -1 : 1)));
    } catch { /* the list is a convenience */ }
  }, []);
  useEffect(() => {
    if (!currentUser) { setCanManage(false); return; }
    let alive = true;
    void fetchFunCanManage().then((ok) => { if (alive) { setCanManage(ok); if (ok) void loadUpcoming(); } });
    return () => { alive = false; };
  }, [currentUser?.id, loadUpcoming]);

  const replaceQuestion = (updated: TotQuestion) => {
    setToday((t) => (t && t.id === updated.id ? updated : t));
    setPrevious((list) => list.map((q) => (q.id === updated.id ? updated : q)));
  };

  const vote = async (q: TotQuestion, choice: 'a' | 'b') => {
    if (q.myVote) return;
    if (!loggedIn) { say('Log in to vote.', 'err'); onLogin?.(); return; }
    if (pending) return;
    setPending({ id: q.id, choice });
    try {
      replaceQuestion(await voteTotQuestion(q.id, choice));
      say('Your vote is in!', 'ok');
    } catch (e) {
      say(friendly(e, 'Could not send your vote. Please try again.'), 'err');
      if (e instanceof Error && /already voted/i.test(e.message)) void load('quiet');   // someone voted from another screen: show the truth
    } finally {
      setPending(null);
    }
  };

  const loadMore = async () => {
    const last = previous[previous.length - 1];
    if (!last || loadingMore) return;
    setLoadingMore(true);
    try {
      const p = await fetchTotPrevious({ limit: PAGE_SIZE, before: { day: last.day, seq: last.seq } });
      setPrevious((list) => { const seen = new Set(list.map((x) => x.id)); return [...list, ...p.questions.filter((x) => !seen.has(x.id))]; });
      setHasMore(p.hasMore);
    } catch (e) {
      say(friendly(e, 'Could not load more questions.'), 'err');
    } finally {
      setLoadingMore(false);
    }
  };

  const share = async () => {
    const url = funShareUrl({ feature: 'this-or-that' });
    try {
      if (navigator.share) { await navigator.share({ title: 'This or That on NOOB SOCIALS', text: 'Pick a side on NOOB SOCIALS!', url }); return; }
      await navigator.clipboard.writeText(url);
      say('Link copied.', 'ok');
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      say('Could not share. You can copy the address from the top of the page.', 'err');
    }
  };

  const remove = async (q: TotQuestion) => {
    if (armed !== q.id) {
      setArmed(q.id);
      window.clearTimeout(armTimer.current);
      armTimer.current = window.setTimeout(() => setArmed(null), 3000);
      return;
    }
    setArmed(null);
    try {
      await removeTotQuestion(q.id);
      say('Question removed.', 'ok');
      setUpcoming((list) => list.filter((x) => x.id !== q.id));
      void load('quiet');
    } catch (e) {
      say(friendly(e, 'That did not work. Please try again.'), 'err');
    }
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await createTotQuestion({ optionA: form.optionA, optionB: form.optionB, emojiA: form.emojiA, emojiB: form.emojiB, publishOn: form.day || undefined });
      say('Question added.', 'ok');
      setForm({ optionA: '', optionB: '', emojiA: '', emojiB: '', day: '' });
      setShowForm(false);
      void load('quiet');
      void loadUpcoming();
    } catch (err) {
      say(friendly(err, 'Could not add the question.'), 'err');
    } finally {
      setSaving(false);
    }
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const inputCls = 'w-full h-11 rounded-xl bg-zinc-950 border border-zinc-700 focus:border-zinc-50 outline-none px-3 text-sm';

  return (
    <div className="space-y-5">
      {/* the intro: what this is, plus share */}
      <div className="flex items-center gap-2">
        <p className="flex-1 text-xs text-zinc-400 leading-relaxed">One question a day. Pick a side, then see how everyone voted. You can vote once on each question.</p>
        <button type="button" onClick={() => void share()} aria-label="Share This or That" className="shrink-0 w-9 h-9 rounded-full border border-zinc-700 hover:border-zinc-50 flex items-center justify-center cursor-pointer">
          <Share2 className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {status === 'loading' && <SkeletonCards count={2} label="Loading questions" />}
      {status === 'error' && <ErrorState text={errorText} onRetry={() => void load('initial')} />}

      {status === 'ready' && (
        <>
          {today ? (
            <section aria-label="Today's question" className="space-y-2">
              <QuestionCard q={today} big title={today.isToday ? "Today's question" : 'Latest question'} pending={pending} canManage={canManage} armed={armed === today.id} onVote={vote} onRemove={remove} />
              {!loggedIn && !today.myVote && (
                <p className="text-center text-xs text-zinc-400">
                  <button type="button" onClick={() => onLogin?.()} className="underline underline-offset-[3px] font-bold text-zinc-200 cursor-pointer">Log in</button> to vote and see the results.
                </p>
              )}
            </section>
          ) : (
            <EmptyState icon={<Zap className="w-8 h-8" aria-hidden="true" />} title="No question yet" hint="A new This or That appears here every day." />
          )}

          {canManage && (
            <section aria-label="Manage questions" className="space-y-3">
              <button type="button" onClick={() => setShowForm((v) => !v)} aria-expanded={showForm} className="w-full h-11 rounded-full border border-zinc-700 hover:border-zinc-50 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer">
                {showForm ? <X className="w-4 h-4" aria-hidden="true" /> : <Plus className="w-4 h-4" aria-hidden="true" />}
                {showForm ? 'Close' : 'Add a question'}
              </button>
              {showForm && (
                <Card>
                  <form onSubmit={create} className="space-y-3">
                    <div className="grid grid-cols-[3.25rem_1fr] gap-2">
                      <input aria-label="Emoji for the first choice" value={form.emojiA} onChange={set('emojiA')} maxLength={8} placeholder={'😀'} className={`${inputCls} text-center`} />
                      <input aria-label="First choice" value={form.optionA} onChange={set('optionA')} maxLength={40} required placeholder="First choice" className={inputCls} />
                      <input aria-label="Emoji for the second choice" value={form.emojiB} onChange={set('emojiB')} maxLength={8} placeholder={'😎'} className={`${inputCls} text-center`} />
                      <input aria-label="Second choice" value={form.optionB} onChange={set('optionB')} maxLength={40} required placeholder="Second choice" className={inputCls} />
                    </div>
                    <label className="block text-xs text-zinc-400">
                      Show it on (leave empty for today)
                      <input type="date" value={form.day} onChange={set('day')} className={`${inputCls} mt-1`} />
                    </label>
                    <button type="submit" disabled={saving || !form.optionA.trim() || !form.optionB.trim()} className="w-full h-11 rounded-full bg-noob text-black text-sm font-extrabold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                      <BusyLabel busy={saving}>Add question</BusyLabel>
                    </button>
                  </form>
                </Card>
              )}
              {upcoming.length > 0 && (
                <div className="space-y-2">
                  <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-zinc-400"><CalendarClock className="w-3.5 h-3.5" aria-hidden="true" /> Coming up ({upcoming.length})</p>
                  {upcoming.slice(0, 5).map((q) => (
                    <div key={q.id} className="no-doodle rounded-2xl bg-zinc-900 border border-zinc-800 px-3.5 py-2.5 flex items-center gap-3">
                      <span className="text-[11px] text-zinc-400 shrink-0 w-20">{dayLabel(q.day)}</span>
                      <span className="flex-1 min-w-0 truncate text-sm font-bold">{q.emojiA} {q.optionA} <span className="text-zinc-500 font-normal">or</span> {q.emojiB} {q.optionB}</span>
                      <button type="button" onClick={() => void remove(q)} aria-label={armed === q.id ? 'Tap again to remove' : `Remove ${q.optionA} or ${q.optionB}`} className={`shrink-0 h-7 px-2.5 rounded-full border text-[10px] font-bold cursor-pointer ${armed === q.id ? 'border-red-400 text-red-300' : 'border-zinc-700 text-zinc-400 hover:text-white'}`}>{armed === q.id ? 'Tap again' : 'Remove'}</button>
                    </div>
                  ))}
                  {upcoming.length > 5 && <p className="text-[11px] text-zinc-500 text-center">and {upcoming.length - 5} more scheduled</p>}
                </div>
              )}
            </section>
          )}

          {previous.length > 0 && (
            <section aria-label="Previous questions" className="space-y-3">
              <h2 className="text-sm font-black tracking-tight">Previous questions</h2>
              {previous.map((q) => (
                <QuestionCard key={q.id} q={q} pending={pending} canManage={canManage} armed={armed === q.id} onVote={vote} onRemove={remove} />
              ))}
              {hasMore && (
                <div className="flex justify-center pt-1">
                  <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="px-6 py-3 rounded-full border border-zinc-600 hover:border-zinc-50 text-sm font-bold cursor-pointer disabled:opacity-60 flex items-center gap-2">
                    <BusyLabel busy={loadingMore}>{loadingMore ? 'Loading' : <><ChevronDown className="w-4 h-4" aria-hidden="true" /> Load more</>}</BusyLabel>
                  </button>
                </div>
              )}
            </section>
          )}
        </>
      )}
      {toast}
    </div>
  );
};

export default ThisOrThatPage;
