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
  const track = voted && res ? (
    <span className="fx-track" aria-hidden="true"><i className="transition-[width] duration-500 ease-out" style={{ width: revealed ? `${pct}%` : '0%' }} /></span>
  ) : null;
  const pick = mine ? (
    <span className="fx-pick">
      <Check className="w-3 h-3" aria-hidden="true" /> Your pick
    </span>
  ) : null;
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled || voted}
      data-side={side}
      aria-label={voted ? `${label}: ${pct}% (${plural(count, 'vote', 'votes')})${mine ? ', your pick' : ''}` : `Vote ${label}`}
      aria-pressed={mine}
      className={`fx-choice ${big ? 'is-big min-h-[176px]' : 'is-row'} ${voted ? `is-voted ${mine ? 'is-mine' : ''} ${lead ? 'is-lead' : ''}` : 'hover:-translate-y-0.5 active:scale-[0.96]'} ${!voted && pending === side ? 'is-pending' : ''}`}
    >
      {big ? (
        <>
          <span className="fx-choice-top">
            <span className="fx-emo" aria-hidden="true">{emoji || ''}</span>
            {pick}
          </span>
          <span className="fx-lab break-words max-w-full">{label}</span>
          {voted && res && (
            <span className="fx-res">
              <span className="fx-pct">{pct}%</span>
              <span className="fx-cnt">{plural(count, 'vote', 'votes')}</span>
            </span>
          )}
          {track}
        </>
      ) : (
        <>
          <span className="fx-row-top">
            <span className="fx-emo" aria-hidden="true">{emoji || ''}</span>
            <span className="fx-lab break-words min-w-0">{label}</span>
            {pick}
            {voted && res && <span className="fx-pct">{pct}%</span>}
          </span>
          {voted && res && (
            <>
              {track}
              <span className="fx-cnt">{plural(count, 'vote', 'votes')}</span>
            </>
          )}
        </>
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
  const removeBtn = canManage ? (
    <button type="button" onClick={() => onRemove(q)} aria-label={armed ? 'Tap again to remove this question' : 'Remove this question'} className={`fx-act ${armed ? 'is-warn' : ''}`}>
      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" /> {armed ? 'Tap again' : 'Remove'}
    </button>
  ) : null;
  const inner = (
    <>
      <div className="fx-duel-head">
        <span className={big ? 'fx-kicker' : 'fx-day'}>{title ?? dayLabel(q.day)}</span>
        {big && <span className="fx-day">{dayLabel(q.day)}</span>}
      </div>
      <div className={`fx-duel ${has ? 'is-done' : ''}`}>
        <Choice side="a" q={q} big={big} revealed={revealed} pending={mineHere} disabled={busy} onPick={() => onVote(q, 'a')} />
        <Choice side="b" q={q} big={big} revealed={revealed} pending={mineHere} disabled={busy} onPick={() => onVote(q, 'b')} />
        <span aria-hidden="true" className="fx-vs">or</span>
      </div>
      <div className="fx-duel-foot">
        <p aria-live="polite">
          {q.results
            ? `${plural(q.results.total, 'vote', 'votes')} in total`
            : big ? 'Tap a side to vote and see what everyone chose.' : 'Tap a side to vote.'}
        </p>
        {removeBtn}
      </div>
    </>
  );
  return big ? (
    <div aria-label={`${q.optionA} or ${q.optionB}`} className="fx-hero">{inner}</div>
  ) : (
    <Card ariaLabel={`${q.optionA} or ${q.optionB}`} className="fx-tcard">{inner}</Card>
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
  const inputCls = 'fx-input';

  return (
    <div className="fx-stack">
      {status === 'loading' && <SkeletonCards count={2} label="Loading questions" />}
      {status === 'error' && <ErrorState text={errorText} onRetry={() => void load('initial')} />}

      {status === 'ready' && (
        <>
          <div className="fx-section-head">
            <p className="fx-intro">One question a day. Pick a side, then see how everyone voted. You can vote once on each question.</p>
            <button type="button" onClick={() => void share()} aria-label="Share This or That" className="fx-ib is-quiet">
              <Share2 className="w-[18px] h-[18px]" aria-hidden="true" />
            </button>
          </div>

          {today ? (
            <section aria-label="Today's question" className="fx-section">
              <QuestionCard q={today} big title={today.isToday ? "Today's question" : 'Latest question'} pending={pending} canManage={canManage} armed={armed === today.id} onVote={vote} onRemove={remove} />
              {!loggedIn && !today.myVote && (
                <p className="fx-t13 fx-muted">
                  <button type="button" onClick={() => onLogin?.()} className="fx-link">Log in</button> to vote and see the results.
                </p>
              )}
            </section>
          ) : (
            <EmptyState icon={<Zap className="w-6 h-6" aria-hidden="true" />} title="No question yet" hint="A new This or That appears here every day." />
          )}

          {previous.length > 0 && (
            <section aria-label="Previous questions" className="fx-section">
              <h2 className="fx-h2">Previous days</h2>
              <div className="fx-list">
                {previous.map((q) => (
                  <QuestionCard key={q.id} q={q} pending={pending} canManage={canManage} armed={armed === q.id} onVote={vote} onRemove={remove} />
                ))}
              </div>
              {hasMore && (
                <div className="fx-more">
                  <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="fx-btn-ghost is-auto">
                    <BusyLabel busy={loadingMore}>{loadingMore ? 'Loading' : <><ChevronDown className="w-4 h-4" aria-hidden="true" /> Load more</>}</BusyLabel>
                  </button>
                </div>
              )}
            </section>
          )}

          {canManage && (
            <section aria-label="Manage questions" className="fx-manage">
              <div className="fx-manage-head">
                <h2 className="fx-h2">Manage questions</h2>
                <span className="fx-tag">Managers only</span>
              </div>
              <button type="button" onClick={() => setShowForm((v) => !v)} aria-expanded={showForm} className="fx-btn-ghost">
                {showForm ? <X className="w-4 h-4" aria-hidden="true" /> : <Plus className="w-4 h-4" aria-hidden="true" />}
                {showForm ? 'Close' : 'Add a question'}
              </button>
              {showForm && (
                <form onSubmit={create} className="fx-form">
                  <div className="fx-pair">
                    <input aria-label="Emoji for the first choice" value={form.emojiA} onChange={set('emojiA')} maxLength={8} placeholder={'😀'} className={`${inputCls} text-center`} />
                    <input aria-label="First choice" value={form.optionA} onChange={set('optionA')} maxLength={40} required placeholder="First choice" className={inputCls} />
                    <input aria-label="Emoji for the second choice" value={form.emojiB} onChange={set('emojiB')} maxLength={8} placeholder={'😎'} className={`${inputCls} text-center`} />
                    <input aria-label="Second choice" value={form.optionB} onChange={set('optionB')} maxLength={40} required placeholder="Second choice" className={inputCls} />
                  </div>
                  <label className="fx-label">
                    Show it on (leave empty for today)
                    <input type="date" value={form.day} onChange={set('day')} className={inputCls} style={{ marginTop: 8 }} />
                  </label>
                  <button type="submit" disabled={saving || !form.optionA.trim() || !form.optionB.trim()} className="fx-btn">
                    <BusyLabel busy={saving}>Add question</BusyLabel>
                  </button>
                </form>
              )}
              {upcoming.length > 0 && (
                <div className="fx-upcoming-list">
                  <p className="fx-sublabel"><CalendarClock className="w-3.5 h-3.5" aria-hidden="true" /> Coming up ({upcoming.length})</p>
                  {upcoming.slice(0, 5).map((q) => (
                    <div key={q.id} className="fx-upcoming">
                      <span className="fx-grow">
                        <span className="fx-day block">{dayLabel(q.day)}</span>
                        <span className="block fx-trunc fx-t13 fx-bold">{q.emojiA} {q.optionA} <span className="fx-faint" style={{ fontWeight: 400 }}>or</span> {q.emojiB} {q.optionB}</span>
                      </span>
                      <button type="button" onClick={() => void remove(q)} aria-label={armed === q.id ? 'Tap again to remove' : `Remove ${q.optionA} or ${q.optionB}`} className={`fx-act shrink-0 ${armed === q.id ? 'is-warn' : ''}`}>{armed === q.id ? 'Tap again' : 'Remove'}</button>
                    </div>
                  ))}
                  {upcoming.length > 5 && <p className="fx-t11 fx-faint">and {upcoming.length - 5} more scheduled</p>}
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
