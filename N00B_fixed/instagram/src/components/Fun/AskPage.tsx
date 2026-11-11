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
  <p className="fx-lock">
    <Lock className="fx-ic" style={{ marginTop: 2 }} aria-hidden="true" />
    <span>
      {name ? `${name} will not see your name, username, picture or any account details next to your question.` : 'The person who asks is never shown to you: no name, username, picture or account details.'}{' '}
      This is anonymity for the person who receives the question. NOOB keeps a private record to prevent abuse and may act on reports, so please be kind.
    </span>
  </p>
);

const Avatar: React.FC<{ src?: string; name: string; size?: string }> = ({ src, name }) => (
  <span className="fx-ava">
    {src ? <img src={src} alt="" referrerPolicy="no-referrer" /> : <span aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>}
  </span>
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
    return <EmptyState icon={<MessageCircleQuestion className="w-8 h-8" aria-hidden="true" />} title="We could not find that person" hint="Check the link, or ask them to send it again." action={<button type="button" onClick={() => onOpenFeature({ feature: 'ask' })} className="fx-btn is-auto">Open my questions</button>} />;
  }

  const link = funShareUrl({ feature: 'ask', target: profile.username });
  return (
    <div className="fx-stack">
      <div className="fx-person">
        <Avatar src={profile.avatar} name={profile.displayName} />
        <div className="fx-grow">
          <p className="fx-person-name fx-trunc">{profile.displayName}{profile.isVerified && <VerifiedBadge size="xs" />}</p>
          <p className="fx-t13 fx-muted fx-trunc">@{profile.username}</p>
        </div>
      </div>

      {mine ? (
        <Card>
          <div className="fx-stack-sm">
            <p className="fx-t15 fx-muted">This is your own question page. Share this link with friends so they can ask you anything.</p>
            <div className="fx-linkbox">
              <input readOnly value={link} aria-label="Your question link" onFocus={(e) => e.currentTarget.select()} className="fx-input" />
              <button type="button" onClick={() => void copyOrShare(link, say, 'Ask me anything', 'Ask me anything, anonymously')} className="fx-btn is-auto shrink-0">Share</button>
            </div>
            <button type="button" onClick={() => onOpenFeature({ feature: 'ask' })} className="fx-btn-ghost">Open my questions</button>
          </div>
        </Card>
      ) : !profile.enabled ? (
        <p className="fx-empty-note">{profile.displayName} is not taking questions right now.</p>
      ) : sentCount > 0 ? (
        <Card>
          <div className="fx-sentbox" role="status">
            <div className="fx-sent"><Check className="w-6 h-6" aria-hidden="true" /></div>
            <p className="fx-sent-title">Sent!</p>
            <p className="fx-t13 fx-muted">{profile.displayName} will see your question without knowing it was you.</p>
            <button type="button" onClick={() => setSentCount(0)} className="fx-btn-ghost is-auto">Ask something else</button>
          </div>
        </Card>
      ) : (
        <div className="fx-stack-sm">
          <label htmlFor="ask-text" className="sr-only">Your question for {profile.displayName}</label>
          <div className="fx-composer">
            <textarea
              id="ask-text"
              value={text}
              onChange={(e) => { const chars = Array.from(e.target.value); setText(chars.length > ASK_MAX_LENGTH ? chars.slice(0, ASK_MAX_LENGTH).join('') : e.target.value); }}
              rows={4}
              placeholder={`Ask ${profile.displayName} anything...`}
            />
            <div className="fx-composer-foot">
              <p className="fx-count" style={count >= ASK_MAX_LENGTH ? { color: 'var(--fx-bad)' } : undefined} aria-live="polite">{count} / {ASK_MAX_LENGTH}</p>
              <button type="button" onClick={() => void send()} disabled={!!currentUser && !canSend} className="fx-btn is-auto">
                <BusyLabel busy={sending}><Send className="w-4 h-4" aria-hidden="true" />{currentUser ? 'Send Anonymously' : 'Log in to send'}</BusyLabel>
              </button>
            </div>
          </div>
          <PrivacyNote name={profile.displayName} />
        </div>
      )}

      <section aria-label="Answered questions" className="fx-section">
        <h2 className="fx-h2">Answered questions</h2>
        {answers.length === 0 ? (
          <p className="fx-empty-note">{profile.displayName} has not published any answers yet.</p>
        ) : (
          <div className="fx-list">
            {answers.map((a) => (
              <article key={a.id} className="fx-qa">
                <p className="fx-qa-q break-words [overflow-wrap:anywhere] whitespace-pre-wrap">{a.question}</p>
                <p className="fx-qa-a break-words [overflow-wrap:anywhere] whitespace-pre-wrap">{a.answer}</p>
                <p className="fx-meta">{whenLabel(a.answeredAt)}</p>
              </article>
            ))}
          </div>
        )}
        {hasMore && (
          <div className="fx-more">
            <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="fx-btn-ghost is-auto">
              <BusyLabel busy={loadingMore}><ChevronDown className="w-4 h-4" aria-hidden="true" /> Load more</BusyLabel>
            </button>
          </div>
        )}
        {!mine && (
          <button type="button" onClick={() => { const u = { id: profile.userId, username: profile.username, displayName: profile.displayName, avatar: profile.avatar } as unknown as Parameters<NonNullable<FunPageProps['onOpenProfile']>>[0]; onOpenProfile?.(u); }} className="fx-btn-ghost">View {profile.displayName}&apos;s profile</button>
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
    await shareCardAsStory({ eyebrow: 'Ask me anything', title: q.body, body: q.answer ?? undefined, link: { url: link, label: 'Ask me anything' } });
    say('Added to your Story.', 'ok');
  }, 'Could not add it to your Story.');

  const small = 'fx-act';
  return (
    <Card ariaLabel="Anonymous question">
      <p className="fx-meta">Anonymous · {whenLabel(q.createdAt)}{q.reported ? ' · reported' : ''}</p>
      <p className="fx-qtext break-words [overflow-wrap:anywhere] whitespace-pre-wrap">{q.body}</p>

      {q.answer && !editing && (
        <div className="fx-answer">
          <p className="fx-answer-head">
            <span>Your answer</span>
            <span className="fx-tag">{q.answerPublic ? <><Globe className="w-3 h-3" aria-hidden="true" /> On your profile</> : <><EyeOff className="w-3 h-3" aria-hidden="true" /> Only you</>}</span>
          </p>
          <p className="fx-answer-text break-words [overflow-wrap:anywhere] whitespace-pre-wrap">{q.answer}</p>
        </div>
      )}

      {editing && (
        <div className="fx-form">
          <label htmlFor={`ans-${q.id}`} className="sr-only">Your answer</label>
          <textarea id={`ans-${q.id}`} value={draft} onChange={(e) => { const chars = Array.from(e.target.value); setDraft(chars.length > ASK_ANSWER_MAX_LENGTH ? chars.slice(0, ASK_ANSWER_MAX_LENGTH).join('') : e.target.value); }} rows={3} placeholder="Write your answer..." autoFocus className="fx-input" />
          <label className="fx-check">
            <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
            <span>Publish this answer on my profile (without who asked)</span>
          </label>
          <div className="fx-acts">
            <button type="button" onClick={() => void saveAnswer()} disabled={busy || draft.trim().length === 0} className="fx-btn is-sm"><BusyLabel busy={busy}>{publish ? 'Answer and publish' : 'Save answer'}</BusyLabel></button>
            <button type="button" onClick={() => { setEditing(false); setDraft(q.answer ?? ''); setPublish(q.answerPublic); }} className="fx-btn-ghost is-auto is-sm">Cancel</button>
            <span className="fx-count" style={{ marginLeft: 'auto' }}>{codePoints(draft)} / {ASK_ANSWER_MAX_LENGTH}</span>
          </div>
        </div>
      )}

      {!editing && (
        <div className="fx-actions">
          <div className="fx-acts">
            <button type="button" onClick={() => { setDraft(q.answer ?? ''); setPublish(q.answerPublic); setEditing(true); }} className={`${small} is-primary`}><Pencil className="w-3.5 h-3.5" aria-hidden="true" />{q.answer ? 'Edit answer' : 'Answer'}</button>
            {q.answer && <button type="button" onClick={() => void togglePublic()} disabled={busy} className={small}>{q.answerPublic ? <><EyeOff className="w-3.5 h-3.5" aria-hidden="true" />Unpublish</> : <><Globe className="w-3.5 h-3.5" aria-hidden="true" />Publish</>}</button>}
            {q.answer && <button type="button" onClick={() => void story()} disabled={busy} className={small}><ImageIcon className="w-3.5 h-3.5" aria-hidden="true" />Share as Story</button>}
          </div>
          <div className="fx-acts is-quiet">
            <button type="button" onClick={del} disabled={busy} className={`${small} ${armed === 'delete' ? 'is-warn' : ''}`}><Trash2 className="w-3.5 h-3.5" aria-hidden="true" />{armed === 'delete' ? 'Tap again' : 'Delete'}</button>
            {!q.reported && <button type="button" onClick={() => setReporting((v) => !v)} aria-expanded={reporting} className={small}><Flag className="w-3.5 h-3.5" aria-hidden="true" />Report</button>}
            <button type="button" onClick={block} disabled={busy} className={`${small} ${armed === 'block' ? 'is-warn' : ''}`}><Ban className="w-3.5 h-3.5" aria-hidden="true" />{armed === 'block' ? 'Tap again to block' : 'Block sender'}</button>
          </div>
        </div>
      )}

      {reporting && !editing && (
        <div className="fx-subpanel" role="group" aria-label="Why are you reporting this question?">
          <p className="fx-t13 fx-muted">Why are you reporting it?</p>
          <div className="fx-acts">
            {REPORT_REASONS.map((r) => <button key={r} type="button" onClick={() => void report(r)} disabled={busy} className={small}>{r}</button>)}
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
  // (only the Home page refreshes (pull down there): no other page has a refresh button, a pull-down refresh or a timer that reloads it: a new question is in the notification, and shows here when the page is opened.)
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

  const tabCls = (_on: boolean) => 'fx-seg-btn';

  return (
    <div className="fx-stack">
      <div className="fx-card fx-linkcard">
        <p className="fx-card-title">Your question link</p>
        <p className="fx-t13 fx-muted">Anyone with this link can send you a question without you seeing who it is. Put it in your bio, a Story or a chat.</p>
        <div className="fx-linkbox">
          <input readOnly value={link} aria-label="Your question link" onFocus={(e) => e.currentTarget.select()} className="fx-input" />
          <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(link); say('Link copied.', 'ok'); } catch { say('Could not copy. Select the link and copy it.', 'err'); } }} aria-label="Copy link" className="fx-ib is-field"><Copy className="w-[18px] h-[18px]" aria-hidden="true" /></button>
          <button type="button" onClick={() => void copyOrShare(link, say, 'Ask me anything', 'Ask me anything, anonymously')} aria-label="Share link" className="fx-ib is-solid"><Share2 className="w-[18px] h-[18px]" aria-hidden="true" /></button>
        </div>
        <button
          type="button"
          onClick={async () => { try { await shareCardAsStory({ eyebrow: 'Ask me anything', title: 'Ask me anything, anonymously', body: 'Send me a question. I will never know who asked.', link: { url: link, label: 'Ask me anything' }, anonymousButton: true }); say('Added to your Story.', 'ok'); } catch (e) { say(friendly(e, 'Could not add it to your Story.'), 'err'); } }}
          className="fx-textbtn"
        ><ImageIcon className="w-4 h-4" aria-hidden="true" /> Put my link in a Story</button>
      </div>

      <div className="fx-card fx-switchrow">
        <div className="fx-grow">
          <p className="fx-card-title">Take anonymous questions</p>
          <p className="fx-t13 fx-muted">{enabled ? 'Your link is on. Switch off to stop new questions.' : 'Your link is off: nobody can send you new questions.'}</p>
        </div>
        <button type="button" role="switch" aria-checked={enabled} aria-label="Take anonymous questions" onClick={() => void toggleEnabled()} className="fx-switch"><span className="fx-knob" /></button>
      </div>

      <section aria-label="Your questions" className="fx-section">
        <div className="fx-seg" role="tablist" aria-label="Questions">
          <button type="button" role="tab" aria-selected={filter === 'new'} onClick={() => setFilter('new')} className={tabCls(filter === 'new')}>New ({counts.new})</button>
          <button type="button" role="tab" aria-selected={filter === 'answered'} onClick={() => setFilter('answered')} className={tabCls(filter === 'answered')}>Answered ({counts.answered})</button>
        </div>

        {status === 'loading' && <SkeletonCards count={2} label="Loading your questions" />}
        {status === 'error' && <ErrorState text={errorText} onRetry={() => void load('initial')} />}
        {status === 'ready' && items.length === 0 && (
          <EmptyState
            icon={<MessageCircleQuestion className="w-6 h-6" aria-hidden="true" />}
            title={filter === 'new' ? 'No new questions' : 'No answered questions yet'}
            hint={filter === 'new' ? 'Share your link and the questions will show up here, privately.' : 'Answer a question and it will be listed here.'}
          />
        )}
        {status === 'ready' && items.length > 0 && <div className="fx-list">{items.map((q) => <QuestionItem key={q.id} q={q} link={link} onChanged={changed} onRemoved={removed} say={say} />)}</div>}
        {status === 'ready' && hasMore && (
          <div className="fx-more">
            <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="fx-btn-ghost is-auto"><BusyLabel busy={loadingMore}><ChevronDown className="w-4 h-4" aria-hidden="true" /> Load more</BusyLabel></button>
          </div>
        )}
      </section>

      {canManage && reports.length > 0 && (
        <section aria-label="Reported questions" className="fx-manage">
          <div className="fx-manage-head">
            <h2 className="fx-h2"><ShieldCheck className="w-4 h-4" aria-hidden="true" /> Reported questions ({reports.length})</h2>
            <span className="fx-tag">Managers only</span>
          </div>
          {reports.map((r) => (
            <Card key={r.id}>
              <p className="fx-meta">To @{r.toUsername} · {whenLabel(r.reportedAt)}{r.reason ? ` · ${r.reason}` : ''}</p>
              <p className="fx-qtext break-words [overflow-wrap:anywhere] whitespace-pre-wrap">{r.body}</p>
              <div className="fx-actions">
                <div className="fx-acts">
                  <button type="button" onClick={() => void reportAction(r, 'dismiss')} className="fx-act"><Check className="w-3.5 h-3.5" aria-hidden="true" />Keep</button>
                  <button type="button" onClick={() => void reportAction(r, 'remove')} className="fx-act is-primary"><X className="w-3.5 h-3.5" aria-hidden="true" />Remove</button>
                  <button type="button" onClick={() => void reportAction(r, 'ban')} className={`fx-act ${armedReport === r.id ? 'is-warn' : ''}`}>{armedReport === r.id ? 'Tap again: remove and stop the sender' : 'Remove and stop the sender'}</button>
                </div>
              </div>
              <p className="fx-t11 fx-faint">You see the question and the reason, never who sent it.</p>
            </Card>
          ))}
        </section>
      )}

      <PrivacyNote />
      {toast}
    </div>
  );
};

const AskPage: React.FC<FunPageProps> = (props) => (props.target ? <AskSomeone {...props} username={props.target} /> : <Dashboard {...props} />);
export default AskPage;
