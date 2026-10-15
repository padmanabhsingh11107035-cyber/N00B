import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, Share2, Send, Trash2, Flag, Ban, MessageCircleQuestion, Globe, Lock, Pencil, ChevronDown, Image as ImageIcon, ShieldCheck, Check, X, EyeOff } from 'lucide-react';
import {
  ASK_MAX_LENGTH,
  ASK_ANSWER_MAX_LENGTH,
  fetchAskProfile,
  sendAskQuestion,
  fetchAskInbox,
  answerAskQuestion,
  setAskAnswerPublic,
  deleteAskQuestion,
  reportAskQuestion,
  blockAskSender,
  fetchAskSettings,
  setAskEnabled,
  fetchAskPublicAnswers,
  fetchAskReports,
  dismissAskReport,
  removeAskQuestionAdmin,
  fetchFunCanManage,
  type AskProfile,
  type AskQuestion,
  type AskPublicAnswer,
  type AskReport
} from '../../services/api';
import { funShareUrl } from '../../utils/funRoutes';
import { VerifiedBadge } from '../Common/VerifiedBadge';
import { Card, EmptyState, ErrorState, SkeletonCards, LoginPrompt, BusyLabel, useToast, friendly, newKey, codePoints, timeAgo } from './funUi';
import { shareCardAsStory } from './shareCard';
import type { FunPageProps } from './types';

// Ask Me Anything. Two sides of one feature:
//   * /ask/<username>  - the page a friend opens from a link: a box, a "Send Anonymously" button, and the answers that person chose to publish.
//   * /ask             - my own dashboard: my link, the questions I received (privately), answering (and publishing an answer on my profile or as a Story), deleting, reporting,
//                        blocking a sender, and a switch to stop taking questions.
// Who asked is never in anything this page receives: the database keeps it in a private column that no function returns (see migration 20261016000002), so there is nothing here
// that could show it, store it or send it anywhere. What is promised in the words on this page is exactly that, and no more: anonymous TO THE PERSON WHO RECEIVES the question.

const REPORT_REASONS = ['Harassment or hate', 'Threat or danger', 'Spam or advertising', 'Something else'];
const PAGE_SIZE = 15;

const whenLabel = (iso: string): string => timeAgo(iso);

const PrivacyNote: React.FC<{ name?: string }> = ({ name }) => (
  <p className="text-[11px] leading-relaxed text-zinc-400">
    <Lock className="inline w-3 h-3 -mt-0.5 mr-1" aria-hidden="true" />
    {name ? `${name} will not see your name, username, picture or any account details next to your question.` : 'The person who asks is never shown to you: no name, username, picture or account details.'}{' '}
    This is anonymity for the person who receives the question. NOOB keeps a private record to prevent abuse and may act on reports, so please be kind.
  </p>
);

const Avatar: React.FC<{ src?: string; name: string; size?: string }> = ({ src, name, size = 'w-14 h-14' }) => (
  src ? <img src={src} alt="" referrerPolicy="no-referrer" className={`${size} rounded-full object-cover border border-zinc-700 shrink-0`} />
      : <div className={`${size} rounded-full border border-zinc-700 bg-zinc-800 flex items-center justify-center text-lg font-black shrink-0`} aria-hidden="true">{name.slice(0, 1).toUpperCase()}</div>
);

const copyOrShare = async (url: string, say: (t: string, k?: 'ok' | 'err') => void, title: string, text: string) => {
  try {
    if (navigator.share) { await navigator.share({ title, text, url }); return; }
    await navigator.clipboard.writeText(url);
    say('Link copied.', 'ok');
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return;
    say('Could not share. You can copy the link from the box.', 'err');
  }
};

// ================================================================================================================================ a friend's page: ask someone
const AskSomeone: React.FC<FunPageProps & { username: string }> = ({ currentUser, username, onLogin, onOpenFeature, onOpenProfile }) => {
  const [profile, setProfile] = useState<AskProfile | null | undefined>(undefined);   // undefined: loading, null: no such person
  const [answers, setAnswers] = useState<AskPublicAnswer[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sentCount, setSentCount] = useState(0);
  const keyRef = useRef(newKey());
  const postingRef = useRef(false);
  const { say, toast } = useToast();
  const mine = !!currentUser && currentUser.username.toLowerCase() === username.toLowerCase();

  const load = useCallback(async () => {
    setError('');
    try {
      const [p, a] = await Promise.all([fetchAskProfile(username), fetchAskPublicAnswers(username, { limit: PAGE_SIZE })]);
      setProfile(p);
      setAnswers(a.answers);
      setHasMore(a.hasMore);
    } catch (e) {
      setError(friendly(e, 'Could not load this page. Please check your connection and try again.'));
    }
  }, [username]);
  useEffect(() => { setProfile(undefined); setSentCount(0); setText(''); void load(); }, [load]);

  const count = codePoints(text);
  const canSend = !sending && text.trim().length >= 2 && count <= ASK_MAX_LENGTH;

  const send = async () => {
    if (!currentUser) { say('Log in to send your question.', 'err'); onLogin?.(); return; }
    if (!canSend || postingRef.current || !profile) return;
    postingRef.current = true;
    setSending(true);
    try {
      await sendAskQuestion(profile.username, text, keyRef.current);
      setSentCount((n) => n + 1);
      setText('');
      keyRef.current = newKey();
      say('Sent anonymously.', 'ok');
    } catch (e) {
      say(friendly(e, 'Could not send your question. Please try again.'), 'err');
    } finally {
      postingRef.current = false;
      setSending(false);
    }
  };

  const loadMore = async () => {
    const last = answers[answers.length - 1];
    if (!last || loadingMore) return;
    setLoadingMore(true);
    try {
      const a = await fetchAskPublicAnswers(username, { limit: PAGE_SIZE, before: { answeredAt: last.answeredAt, id: last.id } });
      setAnswers((list) => { const seen = new Set(list.map((x) => x.id)); return [...list, ...a.answers.filter((x) => !seen.has(x.id))]; });
      setHasMore(a.hasMore);
    } catch (e) {
      say(friendly(e, 'Could not load more.'), 'err');
    } finally {
      setLoadingMore(false);
    }
  };

  if (error) return <ErrorState text={error} onRetry={() => void load()} />;
  if (profile === undefined) return <SkeletonCards count={2} label="Loading" />;
  if (profile === null) {
    return <EmptyState icon={<MessageCircleQuestion className="w-8 h-8" aria-hidden="true" />} title="We could not find that person" hint="Check the link, or ask them to send it again." action={<button type="button" onClick={() => onOpenFeature({ feature: 'ask' })} className="px-6 py-3 rounded-full bg-noob text-black text-sm font-extrabold cursor-pointer">Open my questions</button>} />;
  }

  const link = funShareUrl({ feature: 'ask', target: profile.username });
  return (
    <div className="space-y-5">
      <Card>
        <div className="flex items-center gap-3">
          <Avatar src={profile.avatar} name={profile.displayName} />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-base font-black truncate">{profile.displayName}{profile.isVerified && <VerifiedBadge size="xs" />}</p>
            <p className="text-xs text-zinc-400 truncate">@{profile.username}</p>
          </div>
        </div>

        {mine ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-zinc-300">This is your own question page. Share this link with friends so they can ask you anything.</p>
            <div className="flex gap-2">
              <input readOnly value={link} aria-label="Your question link" onFocus={(e) => e.currentTarget.select()} className="flex-1 min-w-0 h-11 rounded-xl bg-zinc-950 border border-zinc-700 px-3 text-xs" />
              <button type="button" onClick={() => void copyOrShare(link, say, 'Ask me anything', 'Ask me anything, anonymously')} className="shrink-0 h-11 px-4 rounded-full bg-noob text-black text-sm font-extrabold cursor-pointer">Share</button>
            </div>
            <button type="button" onClick={() => onOpenFeature({ feature: 'ask' })} className="w-full h-11 rounded-full border border-zinc-700 hover:border-zinc-50 text-sm font-bold cursor-pointer">Open my questions</button>
          </div>
        ) : !profile.enabled ? (
          <p className="mt-4 text-sm text-zinc-300 rounded-2xl border border-zinc-700 p-4 text-center">{profile.displayName} is not taking questions right now.</p>
        ) : sentCount > 0 ? (
          <div className="mt-4 text-center space-y-3" role="status">
            <div className="w-14 h-14 rounded-full bg-noob text-black mx-auto flex items-center justify-center"><Check className="w-7 h-7" aria-hidden="true" /></div>
            <p className="text-base font-black">Sent!</p>
            <p className="text-xs text-zinc-400">{profile.displayName} will see your question without knowing it was you.</p>
            <button type="button" onClick={() => setSentCount(0)} className="px-6 py-3 rounded-full border border-zinc-600 hover:border-zinc-50 text-sm font-bold cursor-pointer">Ask something else</button>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <label htmlFor="ask-text" className="sr-only">Your question for {profile.displayName}</label>
            <textarea
              id="ask-text"
              value={text}
              onChange={(e) => { const chars = Array.from(e.target.value); setText(chars.length > ASK_MAX_LENGTH ? chars.slice(0, ASK_MAX_LENGTH).join('') : e.target.value); }}
              rows={4}
              placeholder={`Ask ${profile.displayName} anything...`}
              className="w-full rounded-2xl bg-zinc-950 border border-zinc-700 focus:border-zinc-50 outline-none p-3.5 text-sm leading-relaxed resize-none"
            />
            <div className="flex items-center justify-between gap-3">
              <p className={`text-xs font-bold tabular-nums ${count >= ASK_MAX_LENGTH ? 'text-red-300' : 'text-zinc-400'}`} aria-live="polite">{count} / {ASK_MAX_LENGTH}</p>
              <button type="button" onClick={() => void send()} disabled={!!currentUser && !canSend} className="h-11 px-6 rounded-full bg-noob text-black text-sm font-extrabold flex items-center gap-2 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed">
                <BusyLabel busy={sending}><Send className="w-4 h-4" aria-hidden="true" />{currentUser ? 'Send Anonymously' : 'Log in to send'}</BusyLabel>
              </button>
            </div>
            <PrivacyNote name={profile.displayName} />
          </div>
        )}
      </Card>

      <section aria-label="Answered questions" className="space-y-3">
        <h2 className="text-sm font-black tracking-tight">Answered questions</h2>
        {answers.length === 0 ? (
          <p className="text-xs text-zinc-400 rounded-2xl border border-zinc-800 p-4 text-center">{profile.displayName} has not published any answers yet.</p>
        ) : (
          answers.map((a) => (
            <Card key={a.id}>
              <p className="text-sm font-black break-words [overflow-wrap:anywhere] whitespace-pre-wrap">{a.question}</p>
              <p className="mt-2 text-sm text-zinc-200 break-words [overflow-wrap:anywhere] whitespace-pre-wrap">{a.answer}</p>
              <p className="mt-2 text-[11px] text-zinc-500">{whenLabel(a.answeredAt)}</p>
            </Card>
          ))
        )}
        {hasMore && (
          <div className="flex justify-center">
            <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="px-6 py-3 rounded-full border border-zinc-600 hover:border-zinc-50 text-sm font-bold cursor-pointer disabled:opacity-60">
              <BusyLabel busy={loadingMore}><ChevronDown className="w-4 h-4" aria-hidden="true" /> Load more</BusyLabel>
            </button>
          </div>
        )}
        {!mine && (
          <button type="button" onClick={() => { const u = { id: profile.userId, username: profile.username, displayName: profile.displayName, avatar: profile.avatar } as unknown as Parameters<NonNullable<FunPageProps['onOpenProfile']>>[0]; onOpenProfile?.(u); }} className="w-full h-11 rounded-full border border-zinc-700 hover:border-zinc-50 text-sm font-bold cursor-pointer">View {profile.displayName}&apos;s profile</button>
        )}
      </section>
      {toast}
    </div>
  );
};

// ================================================================================================================================ one received question
const QuestionItem: React.FC<{
  q: AskQuestion;
  link: string;
  onChanged: (q: AskQuestion) => void;
  onRemoved: (id: string) => void;
  say: (t: string, k?: 'ok' | 'err') => void;
}> = ({ q, link, onChanged, onRemoved, say }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(q.answer ?? '');
  const [publish, setPublish] = useState(q.answerPublic);
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState<'delete' | 'block' | null>(null);
  const [reporting, setReporting] = useState(false);
  const armTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(armTimer.current), []);
  const arm = (what: 'delete' | 'block') => { setArmed(what); window.clearTimeout(armTimer.current); armTimer.current = window.setTimeout(() => setArmed(null), 3000); };

  const run = async (fn: () => Promise<void>, fallback: string) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } catch (e) { say(friendly(e, fallback), 'err'); } finally { setBusy(false); }
  };

  const saveAnswer = () => run(async () => {
    const saved = await answerAskQuestion(q.id, draft, publish);
    onChanged(saved);
    setEditing(false);
    say(saved.answerPublic ? 'Answer published on your profile.' : 'Answer saved. Only you can see it.', 'ok');
  }, 'Could not save your answer.');

  const togglePublic = () => run(async () => {
    const saved = await setAskAnswerPublic(q.id, !q.answerPublic);
    onChanged(saved);
    say(saved.answerPublic ? 'Published on your profile.' : 'Taken off your profile.', 'ok');
  }, 'Could not change that.');

  const del = () => {
    if (armed !== 'delete') { arm('delete'); return; }
    setArmed(null);
    void run(async () => { await deleteAskQuestion(q.id); onRemoved(q.id); say('Question deleted.', 'ok'); }, 'Could not delete it.');
  };
  const block = () => {
    if (armed !== 'block') { arm('block'); return; }
    setArmed(null);
    void run(async () => { await blockAskSender(q.id); onRemoved(q.id); say('Sender blocked. You will not learn who it was, and they can not ask you again.', 'ok'); }, 'Could not block the sender.');
  };
  const report = (reason: string) => run(async () => {
    await reportAskQuestion(q.id, reason);
    onChanged({ ...q, reported: true });
    setReporting(false);
    say('Reported. Thank you: the NOOB team will take a look.', 'ok');
  }, 'Could not send the report.');

  const story = () => run(async () => {
    await shareCardAsStory({ eyebrow: 'Ask me anything', title: q.body, body: q.answer ?? undefined, footer: link });
    say('Added to your Story.', 'ok');
  }, 'Could not add it to your Story.');

  const small = 'h-8 px-3 rounded-full border text-[11px] font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors';
  return (
    <Card ariaLabel="Anonymous question">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full border border-zinc-700 flex items-center justify-center shrink-0 text-zinc-300" aria-hidden="true"><MessageCircleQuestion className="w-[18px] h-[18px]" /></div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-zinc-500">Anonymous · {whenLabel(q.createdAt)}{q.reported ? ' · reported' : ''}</p>
          <p className="mt-1 text-sm font-bold break-words [overflow-wrap:anywhere] whitespace-pre-wrap">{q.body}</p>
        </div>
      </div>

      {q.answer && !editing && (
        <div className="mt-3 rounded-2xl bg-zinc-950 border border-zinc-800 p-3.5">
          <p className="text-sm text-zinc-200 break-words [overflow-wrap:anywhere] whitespace-pre-wrap">{q.answer}</p>
          <p className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
            {q.answerPublic ? <><Globe className="w-3 h-3" aria-hidden="true" /> On your profile</> : <><EyeOff className="w-3 h-3" aria-hidden="true" /> Only you</>}
          </p>
        </div>
      )}

      {editing && (
        <div className="mt-3 space-y-2.5">
          <label htmlFor={`ans-${q.id}`} className="sr-only">Your answer</label>
          <textarea id={`ans-${q.id}`} value={draft} onChange={(e) => { const chars = Array.from(e.target.value); setDraft(chars.length > ASK_ANSWER_MAX_LENGTH ? chars.slice(0, ASK_ANSWER_MAX_LENGTH).join('') : e.target.value); }} rows={3} placeholder="Write your answer..." autoFocus className="w-full rounded-2xl bg-zinc-950 border border-zinc-700 focus:border-zinc-50 outline-none p-3 text-sm leading-relaxed resize-none" />
          <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
            <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} className="w-4 h-4 accent-current" />
            Publish this answer on my profile (without who asked)
          </label>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void saveAnswer()} disabled={busy || draft.trim().length === 0} className="h-10 px-5 rounded-full bg-noob text-black text-sm font-extrabold cursor-pointer disabled:opacity-50"><BusyLabel busy={busy}>{publish ? 'Answer and publish' : 'Save answer'}</BusyLabel></button>
            <button type="button" onClick={() => { setEditing(false); setDraft(q.answer ?? ''); setPublish(q.answerPublic); }} className="h-10 px-4 rounded-full border border-zinc-700 text-sm font-bold cursor-pointer">Cancel</button>
            <span className="ml-auto text-[11px] tabular-nums text-zinc-500">{codePoints(draft)} / {ASK_ANSWER_MAX_LENGTH}</span>
          </div>
        </div>
      )}

      {!editing && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => { setDraft(q.answer ?? ''); setPublish(q.answerPublic); setEditing(true); }} className={`${small} bg-noob text-black border-zinc-50`}><Pencil className="w-3 h-3" aria-hidden="true" />{q.answer ? 'Edit answer' : 'Answer'}</button>
          {q.answer && <button type="button" onClick={() => void togglePublic()} disabled={busy} className={`${small} border-zinc-700 text-zinc-200 hover:border-zinc-50`}>{q.answerPublic ? <><EyeOff className="w-3 h-3" aria-hidden="true" />Unpublish</> : <><Globe className="w-3 h-3" aria-hidden="true" />Publish</>}</button>}
          {q.answer && <button type="button" onClick={() => void story()} disabled={busy} className={`${small} border-zinc-700 text-zinc-200 hover:border-zinc-50`}><ImageIcon className="w-3 h-3" aria-hidden="true" />Share as Story</button>}
          <button type="button" onClick={del} disabled={busy} className={`${small} ${armed === 'delete' ? 'border-red-400 text-red-300' : 'border-zinc-700 text-zinc-300 hover:border-zinc-50'}`}><Trash2 className="w-3 h-3" aria-hidden="true" />{armed === 'delete' ? 'Tap again' : 'Delete'}</button>
          {!q.reported && <button type="button" onClick={() => setReporting((v) => !v)} aria-expanded={reporting} className={`${small} border-zinc-700 text-zinc-300 hover:border-zinc-50`}><Flag className="w-3 h-3" aria-hidden="true" />Report</button>}
          <button type="button" onClick={block} disabled={busy} className={`${small} ${armed === 'block' ? 'border-red-400 text-red-300' : 'border-zinc-700 text-zinc-300 hover:border-zinc-50'}`}><Ban className="w-3 h-3" aria-hidden="true" />{armed === 'block' ? 'Tap again to block' : 'Block sender'}</button>
        </div>
      )}

      {reporting && !editing && (
        <div className="mt-2.5 rounded-2xl border border-zinc-700 p-3 space-y-2" role="group" aria-label="Why are you reporting this question?">
          <p className="text-xs text-zinc-300">Why are you reporting it?</p>
          <div className="flex flex-wrap gap-2">
            {REPORT_REASONS.map((r) => <button key={r} type="button" onClick={() => void report(r)} disabled={busy} className="h-8 px-3 rounded-full border border-zinc-600 hover:border-zinc-50 text-[11px] font-bold cursor-pointer disabled:opacity-50">{r}</button>)}
          </div>
        </div>
      )}
    </Card>
  );
};

// ================================================================================================================================ my own dashboard
const Dashboard: React.FC<FunPageProps> = ({ currentUser, onLogin }) => {
  const [filter, setFilter] = useState<'new' | 'answered'>('new');
  const [items, setItems] = useState<AskQuestion[]>([]);
  const [counts, setCounts] = useState({ new: 0, answered: 0 });
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorText, setErrorText] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [username, setUsername] = useState(currentUser?.username ?? '');
  const [canManage, setCanManage] = useState(false);
  const [reports, setReports] = useState<AskReport[]>([]);
  const [armedReport, setArmedReport] = useState<string | null>(null);
  const { say, toast } = useToast();
  const loadId = useRef(0);
  const link = username ? funShareUrl({ feature: 'ask', target: username }) : '';

  const load = useCallback(async (mode: 'initial' | 'quiet') => {
    const id = ++loadId.current;
    if (mode === 'initial') setStatus('loading');
    try {
      const page = await fetchAskInbox({ filter, limit: PAGE_SIZE });
      if (id !== loadId.current) return;
      setItems(page.questions);
      setCounts(page.counts);
      setHasMore(page.hasMore);
      setStatus('ready');
    } catch (e) {
      if (id !== loadId.current) return;
      if (mode === 'initial') { setErrorText(friendly(e, 'Could not load your questions. Please check your connection and try again.')); setStatus('error'); }
    }
  }, [filter]);

  useEffect(() => { if (currentUser) void load('initial'); }, [currentUser?.id, load]);
  // new questions arrive while the page is open: look again every minute while it is in front
  useEffect(() => {
    if (!currentUser) return;
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') void load('quiet'); }, 60_000);
    return () => window.clearInterval(t);
  }, [currentUser?.id, load]);

  useEffect(() => {
    if (!currentUser) return;
    let alive = true;
    void fetchAskSettings().then((s) => { if (alive) { setEnabled(s.enabled); setUsername(s.username); } }).catch(() => undefined);
    void fetchFunCanManage().then((ok) => { if (alive && ok) { setCanManage(true); void fetchAskReports().then((r) => { if (alive) setReports(r); }).catch(() => undefined); } });
    return () => { alive = false; };
  }, [currentUser?.id]);

  if (!currentUser) return <LoginPrompt what="get anonymous questions and see the ones you received" onLogin={onLogin} />;

  const toggleEnabled = async () => {
    const next = !enabled;
    setEnabled(next);
    try { setEnabled(await setAskEnabled(next)); say(next ? 'Questions are on.' : 'Questions are off. Nobody can send you new ones.', 'ok'); }
    catch (e) { setEnabled(!next); say(friendly(e, 'Could not change that.'), 'err'); }
  };

  const changed = (q: AskQuestion) => {
    setItems((list) => {
      const stays = filter === 'new' ? q.answeredAt === null : q.answeredAt !== null;
      return stays ? list.map((x) => (x.id === q.id ? q : x)) : list.filter((x) => x.id !== q.id);
    });
    void load('quiet');
  };
  const removed = (id: string) => { setItems((list) => list.filter((x) => x.id !== id)); void load('quiet'); };

  const loadMore = async () => {
    const last = items[items.length - 1];
    if (!last || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchAskInbox({ filter, limit: PAGE_SIZE, before: { createdAt: last.createdAt, id: last.id } });
      setItems((list) => { const seen = new Set(list.map((x) => x.id)); return [...list, ...page.questions.filter((x) => !seen.has(x.id))]; });
      setHasMore(page.hasMore);
    } catch (e) {
      say(friendly(e, 'Could not load more.'), 'err');
    } finally {
      setLoadingMore(false);
    }
  };

  const reportAction = async (r: AskReport, kind: 'dismiss' | 'remove' | 'ban') => {
    if (kind === 'ban' && armedReport !== r.id) { setArmedReport(r.id); window.setTimeout(() => setArmedReport((x) => (x === r.id ? null : x)), 3000); return; }
    setArmedReport(null);
    try {
      if (kind === 'dismiss') await dismissAskReport(r.id); else await removeAskQuestionAdmin(r.id, kind === 'ban');
      setReports((list) => list.filter((x) => x.id !== r.id));
      say(kind === 'dismiss' ? 'Report cleared.' : kind === 'ban' ? 'Removed. The sender can no longer ask anyone.' : 'Question removed.', 'ok');
    } catch (e) {
      say(friendly(e, 'That did not work. Please try again.'), 'err');
    }
  };

  const tabCls = (on: boolean) => `flex-1 h-10 rounded-full border text-xs font-bold cursor-pointer transition-all ${on ? 'bg-noob text-black border-zinc-50' : 'border-zinc-700 text-zinc-300 hover:border-zinc-50'}`;

  return (
    <div className="space-y-5">
      <Card>
        <p className="text-sm font-black">Your question link</p>
        <p className="mt-1 text-xs text-zinc-400">Anyone with this link can send you a question without you seeing who it is. Put it in your bio, a Story or a chat.</p>
        <div className="mt-3 flex gap-2">
          <input readOnly value={link} aria-label="Your question link" onFocus={(e) => e.currentTarget.select()} className="flex-1 min-w-0 h-11 rounded-xl bg-zinc-950 border border-zinc-700 px-3 text-xs" />
          <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(link); say('Link copied.', 'ok'); } catch { say('Could not copy. Select the link and copy it.', 'err'); } }} aria-label="Copy link" className="shrink-0 w-11 h-11 rounded-full border border-zinc-700 hover:border-zinc-50 flex items-center justify-center cursor-pointer"><Copy className="w-4 h-4" aria-hidden="true" /></button>
          <button type="button" onClick={() => void copyOrShare(link, say, 'Ask me anything', 'Ask me anything, anonymously')} aria-label="Share link" className="shrink-0 w-11 h-11 rounded-full bg-noob text-black flex items-center justify-center cursor-pointer"><Share2 className="w-4 h-4" aria-hidden="true" /></button>
        </div>
        <button
          type="button"
          onClick={async () => { try { await shareCardAsStory({ eyebrow: 'Ask me anything', title: 'Ask me anything, anonymously', body: 'Send me a question. I will never know who asked.', footer: link }); say('Added to your Story.', 'ok'); } catch (e) { say(friendly(e, 'Could not add it to your Story.'), 'err'); } }}
          className="mt-2.5 w-full h-10 rounded-full border border-zinc-700 hover:border-zinc-50 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
        ><ImageIcon className="w-3.5 h-3.5" aria-hidden="true" /> Put my link in a Story</button>
        <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-zinc-800 px-3.5 py-3">
          <div className="min-w-0">
            <p className="text-sm font-bold">Take anonymous questions</p>
            <p className="text-[11px] text-zinc-400">{enabled ? 'Your link is on. Switch off to stop new questions.' : 'Your link is off: nobody can send you new questions.'}</p>
          </div>
          <button type="button" role="switch" aria-checked={enabled} aria-label="Take anonymous questions" onClick={() => void toggleEnabled()} className={`relative shrink-0 w-12 h-7 rounded-full border transition-colors cursor-pointer ${enabled ? 'bg-noob border-zinc-50' : 'bg-zinc-800 border-zinc-600'}`}>
            <span className={`absolute top-0.5 w-6 h-6 rounded-full transition-all ${enabled ? 'left-[22px] bg-black' : 'left-0.5 bg-zinc-400'}`} />
          </button>
        </div>
      </Card>

      <section aria-label="Your questions" className="space-y-3">
        <div className="flex gap-2" role="tablist" aria-label="Questions">
          <button type="button" role="tab" aria-selected={filter === 'new'} onClick={() => setFilter('new')} className={tabCls(filter === 'new')}>New ({counts.new})</button>
          <button type="button" role="tab" aria-selected={filter === 'answered'} onClick={() => setFilter('answered')} className={tabCls(filter === 'answered')}>Answered ({counts.answered})</button>
        </div>

        {status === 'loading' && <SkeletonCards count={2} label="Loading your questions" />}
        {status === 'error' && <ErrorState text={errorText} onRetry={() => void load('initial')} />}
        {status === 'ready' && items.length === 0 && (
          <EmptyState
            icon={<MessageCircleQuestion className="w-8 h-8" aria-hidden="true" />}
            title={filter === 'new' ? 'No new questions' : 'No answered questions yet'}
            hint={filter === 'new' ? 'Share your link and the questions will show up here, privately.' : 'Answer a question and it will be listed here.'}
          />
        )}
        {status === 'ready' && items.map((q) => <QuestionItem key={q.id} q={q} link={link} onChanged={changed} onRemoved={removed} say={say} />)}
        {status === 'ready' && hasMore && (
          <div className="flex justify-center">
            <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="px-6 py-3 rounded-full border border-zinc-600 hover:border-zinc-50 text-sm font-bold cursor-pointer disabled:opacity-60"><BusyLabel busy={loadingMore}><ChevronDown className="w-4 h-4" aria-hidden="true" /> Load more</BusyLabel></button>
          </div>
        )}
      </section>

      {canManage && reports.length > 0 && (
        <section aria-label="Reported questions" className="space-y-3">
          <h2 className="flex items-center gap-1.5 text-sm font-black"><ShieldCheck className="w-4 h-4" aria-hidden="true" /> Reported questions ({reports.length})</h2>
          {reports.map((r) => (
            <Card key={r.id}>
              <p className="text-[11px] text-zinc-500">To @{r.toUsername} · {whenLabel(r.reportedAt)}{r.reason ? ` · ${r.reason}` : ''}</p>
              <p className="mt-1 text-sm font-bold break-words [overflow-wrap:anywhere] whitespace-pre-wrap">{r.body}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => void reportAction(r, 'dismiss')} className="h-8 px-3 rounded-full border border-zinc-600 text-[11px] font-bold cursor-pointer"><Check className="inline w-3 h-3 mr-1" aria-hidden="true" />Keep</button>
                <button type="button" onClick={() => void reportAction(r, 'remove')} className="h-8 px-3 rounded-full bg-noob text-black text-[11px] font-bold cursor-pointer"><X className="inline w-3 h-3 mr-1" aria-hidden="true" />Remove</button>
                <button type="button" onClick={() => void reportAction(r, 'ban')} className={`h-8 px-3 rounded-full border text-[11px] font-bold cursor-pointer ${armedReport === r.id ? 'border-red-400 text-red-300' : 'border-zinc-600 text-zinc-300'}`}>{armedReport === r.id ? 'Tap again: remove and stop the sender' : 'Remove and stop the sender'}</button>
              </div>
              <p className="mt-2 text-[10px] text-zinc-500">You see the question and the reason, never who sent it.</p>
            </Card>
          ))}
        </section>
      )}

      <Card><PrivacyNote /></Card>
      {toast}
    </div>
  );
};

const AskPage: React.FC<FunPageProps> = (props) => (props.target ? <AskSomeone {...props} username={props.target} /> : <Dashboard {...props} />);
export default AskPage;
