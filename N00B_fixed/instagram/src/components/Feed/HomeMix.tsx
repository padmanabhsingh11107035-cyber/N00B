import { createPortal } from 'react-dom';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { VenetianMask, Flag, Trash2, Check, BarChart3, Clock, Lock, Loader2, Send, X, ImagePlus, Heart, MessageCircle, Share2, Repeat2, Bookmark } from 'lucide-react';
import type { User } from '../../types';
import { isMainAdmin } from '../../adminAccess';
import {
  ANON_MAX_LENGTH,
  fetchAnonMessages,
  postAnonMessage,
  postAnonPost,
  uploadMediaFile,
  reportAnonMessage,
  adminRemoveAnonMessage,
  fetchPolls,
  fetchLongVideos,
  fetchLiveStreams,
  fetchPoll,
  votePoll,
  removePoll,
  reportPoll,
  fetchFunCanManage,
  MIX_COMMENT_MAX,
  fetchMixStats,
  setMixLike,
  setMixSave,
  setMixRepost,
  fetchMixComments,
  addMixComment,
  removeMixComment,
  type AnonMessage,
  type Poll,
  type MixKind,
  type MixStat,
  type MixComment
} from '../../services/api';
import { resolveMedia } from '../../services/supabase';
import type { LiveStreamSummary } from '../../services/supabaseApi';
import type { LongVideo } from '../../types';
import { formatRelativeTime } from '../../utils/formatTime';
import { formatCompactCount } from '../../utils/repostBatcher';
import { funShareUrl } from '../../utils/funRoutes';
import { siteOrigin } from '../../utils/siteUrl';
import { percents } from '../../utils/pollMath';
import { VerifiedBadge } from '../Common/VerifiedBadge';
import { FEATURED_POSTS, type FeaturedPost } from '../../data/featuredPosts';

// the 3D viewer pulls in the 3D engine: fetched only when a 3D post is on the screen
const ModelBox3D = React.lazy(() => import('../Featured/ModelBox3D'));
import { useCommentsBox } from '../../utils/useVisualViewport';

// Anonymous thoughts and public polls live on the Home page now, mixed in between the posts (they used to be two pages of the three-line menu).
// An anonymous thought is still only {id, body, createdAt}: the database never sends who wrote it, so nothing here can show it. A poll always shows who made it.

export type MixItem = { kind: 'anon'; at: string; anon: AnonMessage } | { kind: 'poll'; at: string; poll: Poll } | { kind: 'video'; at: string; video: LongVideo } | { kind: 'live'; at: string; stream: LiveStreamSummary } | { kind: 'featured'; at: string; featured: FeaturedPost };
export const mixKey = (i: MixItem): string => (i.kind === 'anon' ? 'anon-' + i.anon.id : i.kind === 'poll' ? 'poll-' + i.poll.id : i.kind === 'video' ? 'video-' + i.video.id : i.kind === 'featured' ? 'featured-' + i.featured.id : 'live-' + i.stream.id);
function shuffled<T>(list: T[]): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
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

// Likes, comment counts and whether I liked it: fetched once for all the cards (one call per kind) and kept here, so every card draws from the same numbers.
const NO_STAT: MixStat = { likes: 0, comments: 0, liked: false, reposts: 0, saved: false, reposted: false };
const statStore = new Map<string, MixStat>();
const statListeners = new Set<() => void>();
const statKey = (k: MixKind, id: string): string => `${k}:${id}`;
function putStat(k: MixKind, id: string, s: MixStat): void { statStore.set(statKey(k, id), s); statListeners.forEach((l) => l()); }
function useStat(k: MixKind, id: string): MixStat {
  const [, tick] = useState(0);
  useEffect(() => { const l = () => tick((n) => n + 1); statListeners.add(l); return () => { statListeners.delete(l); }; }, []);
  return statStore.get(statKey(k, id)) ?? NO_STAT;
}
export function loadStats(k: MixKind, ids: string[]): void {
  void fetchMixStats(k, ids).then((m) => { Object.entries(m).forEach(([id, s]) => statStore.set(statKey(k, id), s)); statListeners.forEach((l) => l()); }).catch(() => undefined);
}

/** The anonymous thoughts and the running polls for the Home page: loaded once, again when Home is refreshed (refreshKey), and added to when the person makes one. */
export function useHomeMix(anonOn: boolean, pollsOn: boolean, refreshKey: number, videosOn = false, liveOn = false, featuredOn = false) {
  const [items, setItems] = useState<MixItem[]>([]);
  const [slots, setSlots] = useState<number[]>([]);   // after which posts each item is shown: uneven gaps, new every load
  useEffect(() => {
    let alive = true;
    void Promise.all([
      anonOn ? fetchAnonMessages({ limit: 20 }).then((r) => r.messages).catch(() => [] as AnonMessage[]) : Promise.resolve([] as AnonMessage[]),
      pollsOn ? fetchPolls({ tab: 'active', limit: 10 }).then((r) => r.polls).catch(() => [] as Poll[]) : Promise.resolve([] as Poll[]),
      videosOn ? fetchLongVideos().then((l) => l.slice().sort(() => Math.random() - 0.5).slice(0, 8)).catch(() => [] as LongVideo[]) : Promise.resolve([] as LongVideo[]),
      liveOn ? fetchLiveStreams().then((r) => (r.success ? r.streams : [])).catch(() => [] as LiveStreamSummary[]) : Promise.resolve([] as LiveStreamSummary[])
    ]).then(([anon, polls, videos, lives]) => {
      if (!alive) return;
      // thoughts and polls are shuffled together, so each refresh of Home brings them in a different order
      setItems(shuffled([
        ...anon.map((m): MixItem => ({ kind: 'anon', at: m.createdAt, anon: m })),
        ...polls.map((p): MixItem => ({ kind: 'poll', at: p.createdAt, poll: p })),
        ...videos.map((v): MixItem => ({ kind: 'video', at: v.createdAt, video: v })),
        ...lives.map((st): MixItem => ({ kind: 'live', at: st.startedAt, stream: st })),
        ...(featuredOn ? FEATURED_POSTS.map((f): MixItem => ({ kind: 'featured', at: f.at, featured: f })) : [])
      ]));
      let at = Math.floor(Math.random() * 3);   // the first one comes after the 1st, 2nd or 3rd post
      const next: number[] = [];
      for (let n = 0; n < anon.length + polls.length + videos.length + lives.length + (featuredOn ? FEATURED_POSTS.length : 0); n++) { next.push(at); at += 2 + Math.floor(Math.random() * 3); }   // then 2 to 4 posts between them
      setSlots(next);
      loadStats('anon', anon.map((m) => m.id));
      loadStats('poll', polls.map((p) => p.id));
      if (featuredOn) loadStats('featured', FEATURED_POSTS.map((f) => f.id));
    });
    return () => { alive = false; };
  }, [anonOn, pollsOn, videosOn, liveOn, featuredOn, refreshKey]);
  useEffect(() => {
    const onNew = (e: Event) => {
      const item = (e as CustomEvent<MixItem>).detail;
      if (!item || (item.kind === 'anon' && !anonOn) || (item.kind === 'poll' && !pollsOn) || (item.kind === 'video' && !videosOn) || (item.kind === 'live' && !liveOn) || (item.kind === 'featured' && !featuredOn)) return;
      setItems((prev) => [item, ...prev.filter((x) => mixKey(x) !== mixKey(item))]);
    };
    window.addEventListener(HOME_MIX_NEW_EVENT, onNew);
    return () => window.removeEventListener(HOME_MIX_NEW_EVENT, onNew);
  }, [anonOn, pollsOn, videosOn, liveOn]);
  const remove = useCallback((key: string) => setItems((prev) => prev.filter((x) => mixKey(x) !== key)), []);
  const updatePoll = useCallback((p: Poll) => setItems((prev) => prev.map((x) => (x.kind === 'poll' && x.poll.id === p.id ? { ...x, poll: p } : x))), []);
  return { items, slots, remove, updatePoll };
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

/** The pictures of an anonymous post, in order (an older post has one, kept in mediaKey). */
export const anonPicKeys = (m: AnonMessage): string[] => (m.mediaKeys && m.mediaKeys.length ? m.mediaKeys : m.mediaKey ? [m.mediaKey] : []);
export const ANON_MAX_PICS = 10;

// The pictures of an anonymous post: one is shown plain; several are swiped sideways, with "2 / 5" in the corner and dots underneath.
const AnonPics: React.FC<{ keys: string[] }> = ({ keys }) => {
  const [at, setAt] = useState(0);
  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
    if (i !== at) setAt(Math.min(keys.length - 1, Math.max(0, i)));
  };
  if (keys.length === 1) return <img src={resolveMedia(keys[0])} alt="" loading="lazy" decoding="async" className="hm-pic" data-testid="home-anon-pic" />;
  return (
    <div className="hm-pics-wrap" data-testid="home-anon-pics">
      <div className="hm-pics" onScroll={onScroll}>
        {keys.map((k) => <img key={k} src={resolveMedia(k)} alt="" loading="lazy" decoding="async" className="hm-pic" data-testid="home-anon-pic" />)}
      </div>
      <span className="hm-pics-n" aria-hidden="true">{at + 1} / {keys.length}</span>
      <div className="hm-dots" aria-hidden="true">{keys.map((k, i) => <i key={k} className={i === at ? 'is-on' : ''} />)}</div>
    </div>
  );
};

// ---- like / comment / share (the bar under every thought and poll) ---------------------------------------------------------------------------------------
const countText = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K` : String(n));

/** Share through the phone's own share sheet; where there is none, copy the link. Returns a short message for the card. */
async function shareItem(title: string, text: string, url: string): Promise<string> {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') { await navigator.share({ title, text, url }); return ''; }
  } catch (e) { if (e instanceof Error && e.name === 'AbortError') return ''; }
  try { await navigator.clipboard.writeText(url); return 'Link copied.'; } catch { return 'Could not share or copy the link.'; }
}

const MixBar: React.FC<{ kind: MixKind; id: string; title: string; text: string; url: string; canManage: boolean; onNote: (s: string) => void; /** NOOB's featured posts also get Repost and Save */ extras?: boolean }> = ({ kind, id, title, text, url, canManage, onNote, extras }) => {
  const stat = useStat(kind, id);
  const [open, setOpen] = useState(false);
  const busy = useRef(false);
  const toggleLike = async () => {
    if (busy.current) return;
    busy.current = true;
    const before = stat;
    const on = !before.liked;
    putStat(kind, id, { ...before, liked: on, likes: Math.max(0, before.likes + (on ? 1 : -1)) });   // shows at once; put back if it fails
    try { const r = await setMixLike(kind, id, on); putStat(kind, id, { ...statStore.get(statKey(kind, id)) ?? before, liked: r.liked, likes: r.likes }); }
    catch (e) { putStat(kind, id, before); onNote(friendly(e, 'Could not like it. Please try again.')); }
    finally { busy.current = false; }
  };
  const toggleExtra = async (what: 'repost' | 'save') => {
    if (busy.current) return;
    busy.current = true;
    const before = stat;
    const on = what === 'repost' ? !before.reposted : !before.saved;
    putStat(kind, id, what === 'repost' ? { ...before, reposted: on, reposts: Math.max(0, (before.reposts || 0) + (on ? 1 : -1)) } : { ...before, saved: on });
    try {
      if (what === 'repost') { const r = await setMixRepost(kind, id, on); putStat(kind, id, { ...statStore.get(statKey(kind, id)) ?? before, reposted: r.on, reposts: r.reposts }); onNote(r.on ? 'Reposted.' : 'Repost removed.'); }
      else { const r = await setMixSave(kind, id, on); putStat(kind, id, { ...statStore.get(statKey(kind, id)) ?? before, saved: r }); onNote(r ? 'Saved.' : 'Removed from saved.'); }
    } catch (e) { putStat(kind, id, before); onNote(friendly(e, what === 'repost' ? 'Could not repost it. Please try again.' : 'Could not save it. Please try again.')); }
    finally { busy.current = false; }
  };
  return (
    <>
      <div className="hm-bar-row" data-testid="home-mix-bar">
        <button type="button" onClick={() => void toggleLike()} aria-pressed={stat.liked} aria-label={stat.liked ? 'Unlike' : 'Like'} className={`hm-ab ${stat.liked ? 'is-liked' : ''}`} data-testid="home-mix-like">
          <Heart className="w-[19px] h-[19px]" fill={stat.liked ? 'currentColor' : 'none'} aria-hidden="true" /><span>{countText(stat.likes)}</span>
        </button>
        <button type="button" onClick={() => setOpen(true)} aria-label="Comments" className="hm-ab" data-testid="home-mix-comment">
          <MessageCircle className="w-[19px] h-[19px]" aria-hidden="true" /><span>{countText(stat.comments)}</span>
        </button>
        <button type="button" onClick={() => void shareItem(title, text, url).then((m) => { if (m) onNote(m); })} aria-label="Share" className="hm-ab" data-testid="home-mix-share">
          <Share2 className="w-[19px] h-[19px]" aria-hidden="true" /><span>Share</span>
        </button>
        {extras && (
          <>
            <button type="button" onClick={() => void toggleExtra('repost')} aria-pressed={!!stat.reposted} aria-label={stat.reposted ? 'Undo repost' : 'Repost'} className={`hm-ab ${stat.reposted ? 'is-on' : ''}`} data-testid="home-mix-repost">
              <Repeat2 className="w-[19px] h-[19px]" aria-hidden="true" /><span>{countText(stat.reposts || 0)}</span>
            </button>
            <button type="button" onClick={() => void toggleExtra('save')} aria-pressed={!!stat.saved} aria-label={stat.saved ? 'Unsave' : 'Save'} className={`hm-ab hm-ab-end ${stat.saved ? 'is-on' : ''}`} data-testid="home-mix-save">
              <Bookmark className="w-[19px] h-[19px]" fill={stat.saved ? 'currentColor' : 'none'} aria-hidden="true" />
            </button>
          </>
        )}
      </div>
      {open && createPortal(<MixComments kind={kind} id={id} title={title} canManage={canManage} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
};

const MixComments: React.FC<{ kind: MixKind; id: string; title: string; canManage: boolean; onClose: () => void }> = ({ kind, id, title, canManage, onClose }) => {
  const [list, setList] = useState<MixComment[]>([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const sendingRef = useRef(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const box = useCommentsBox(loading ? 3 : list.length);   // the same bottom sheet as every other comments sheet: 30-50 % of the page by the number of comments
  const bump = (d: number) => { const s = statStore.get(statKey(kind, id)) ?? NO_STAT; putStat(kind, id, { ...s, comments: Math.max(0, s.comments + d) }); };
  useEffect(() => {
    let alive = true;
    void fetchMixComments(kind, id).then((r) => { if (alive) { setList(r.comments); setMore(r.hasMore); } }).catch((e) => { if (alive) setError(friendly(e, 'Could not load the comments.')); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [kind, id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const loadMore = async () => {
    const last = list[list.length - 1];
    if (!last) return;
    try { const r = await fetchMixComments(kind, id, { at: last.createdAt, id: last.id }); setList((p) => [...p, ...r.comments.filter((c) => !p.some((x) => x.id === c.id))]); setMore(r.hasMore); }
    catch (e) { setError(friendly(e, 'Could not load more.')); }
  };
  const send = async () => {
    const body = text.trim();
    if (!body || sendingRef.current) return;
    sendingRef.current = true; setSending(true); setError('');
    try {
      const c = await addMixComment(kind, id, body);
      setList((p) => [...p, c]); setText(''); bump(1);
      window.setTimeout(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; }, 30);
    } catch (e) { setError(friendly(e, 'Could not send your comment. Please try again.')); }
    finally { sendingRef.current = false; setSending(false); }
  };
  const del = async (c: MixComment) => {
    try { await removeMixComment(c.id); setList((p) => p.filter((x) => x.id !== c.id)); bump(-1); }
    catch (e) { setError(friendly(e, 'Could not remove the comment.')); }
  };
  return (
    <div className="hm-scrim cmt-wrap" data-noob-keep="1" role="dialog" aria-modal="true" aria-label={`Comments on ${title}`} onClick={onClose}>
      <div className="hm-sheet hm-cm cmt-sheet" style={box.style} data-testid="home-mix-comments" onClick={(e) => e.stopPropagation()}>
        <div className="hm-sheet-head">
          <h2><MessageCircle className="w-5 h-5" aria-hidden="true" />Comments</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="hm-ib" data-no-hit="1"><X className="w-5 h-5" /></button>
        </div>
        <div ref={listRef} className="hm-cm-list">
          {loading && <p className="hm-sub"><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />Loading…</p>}
          {!loading && list.length === 0 && <p className="hm-sub" data-testid="home-mix-no-comments">No comments yet. Be the first.</p>}
          {list.map((c) => (
            <div key={c.id} className="hm-c" data-testid="home-mix-comment-row">
              {c.user.avatar ? <img src={c.user.avatar} alt="" referrerPolicy="no-referrer" className="hm-ava is-pic hm-c-ava" /> : <span className="hm-ava hm-c-ava" aria-hidden="true" />}
              <div className="min-w-0 flex-1">
                <p className="hm-c-who"><span>{c.user.displayName}</span>{c.user.isVerified && <VerifiedBadge size="xs" />}<span className="hm-sub">{ago(c.createdAt)}</span></p>
                <p className="hm-c-body whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{c.body}</p>
              </div>
              {(c.mine || canManage) && <button type="button" onClick={() => void del(c)} aria-label="Remove this comment" className="hm-ib" data-no-hit="1"><Trash2 className="w-4 h-4" /></button>}
            </div>
          ))}
          {more && <button type="button" onClick={() => void loadMore()} className="hm-act">Show more comments</button>}
        </div>
        <p role="alert" className="hm-err">{error}</p>
        <form className="hm-cm-form" onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <label htmlFor="hm-cm-text" className="sr-only">Write a comment</label>
          <input id="hm-cm-text" value={text} onChange={(e) => { setText(Array.from(e.target.value).slice(0, MIX_COMMENT_MAX).join('')); if (error) setError(''); }} placeholder="Add a comment…" autoComplete="off" enterKeyHint="send" className="hm-cm-input" data-testid="home-mix-comment-input" />
          <button type="submit" disabled={sending || !text.trim()} aria-label="Send the comment" className="hm-cm-send" data-testid="home-mix-comment-send">{sending ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Send className="w-4 h-4" aria-hidden="true" />}</button>
        </form>
      </div>
    </div>
  );
};

export const AnonCard: React.FC<{ m: AnonMessage; currentUser: User | null; canManage: boolean; onRemoved: () => void }> = ({ m, currentUser, canManage, onRemoved }) => {
  const admin = isMainAdmin(currentUser);
  const pics = anonPicKeys(m);
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
          <span className="hm-sub">{pics.length ? 'Post' : 'Thought'} · {ago(m.createdAt)}</span>
        </span>
        {admin
          ? <button type="button" onClick={() => void remove()} disabled={busy} className={`hm-act ${armed ? 'is-warn' : ''}`}><Trash2 className="w-3.5 h-3.5" aria-hidden="true" />{armed ? 'Tap again' : 'Remove'}</button>
          : reported
            ? <span className="hm-done"><Check className="w-3.5 h-3.5" aria-hidden="true" />Reported</span>
            : <button type="button" onClick={() => setReporting((v) => !v)} aria-expanded={reporting} aria-label="Report this thought" className="hm-ib"><Flag className="w-4 h-4" /></button>}
      </header>
      {/* drawn as plain text: nothing in it can run as HTML or script */}
      {pics.length > 0 && <AnonPics keys={pics} />}
      {m.body && <p className="hm-body whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{m.body}</p>}
      <MixBar kind="anon" id={m.id} title="An anonymous thought on NOOB" text={m.body ? m.body.slice(0, 140) : 'An anonymous post on NOOB'} url={funShareUrl({ feature: 'thought', target: m.id })} canManage={admin || canManage} onNote={setNote} />
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
      <MixBar kind="poll" id={poll.id} title={`Poll: ${poll.question}`} text={poll.question} url={link} canManage={poll.isMine || canManage} onNote={setNote} />
      <div className="hm-foot">
        <p className="hm-sub" aria-live="polite">
          {poll.resultsShown && poll.totalVotes !== null
            ? <><BarChart3 className="w-3.5 h-3.5" aria-hidden="true" />{votesLabel(poll.totalVotes)} in total</>
            : voted
              ? <><Lock className="w-3.5 h-3.5" aria-hidden="true" />Your vote is in. Results appear when the poll ends.</>
              : poll.resultsVisibility === 'after_end' ? 'Results appear when the poll ends.' : 'Vote to see the results.'}
        </p>
        <div className="hm-acts">
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

// A long video between the posts: its picture with the length in a corner, then the title and who posted it. Tapping it opens the player.
const VideoMixCard: React.FC<{ video: LongVideo; onOpen: (id: string) => void; onOpenProfile?: (u: User) => void }> = ({ video, onOpen, onOpenProfile }) => {
  const mins = Math.floor((video.durationSeconds || 0) / 60), secs = Math.floor((video.durationSeconds || 0) % 60);
  return (
    <article className="hm-card hm-vid" data-testid="home-video-card" aria-label={`Video: ${video.title}`}>
      <button type="button" className="hm-vid-media" onClick={() => onOpen(video.id)} aria-label={`Play ${video.title}`}>
        {video.thumbnailUrl ? <img src={resolveMedia(video.thumbnailUrl)} alt="" loading="lazy" decoding="async" /> : <video src={resolveMedia(video.videoUrl)} muted playsInline preload="metadata" />}
        <span className="hm-vid-tag" data-testid="home-video-tag">Video</span>
        <span className="hm-vid-time">{mins}:{String(secs).padStart(2, '0')}</span>
      </button>
      <div className="hm-vid-info">
        <button type="button" className="hm-vid-ava" onClick={() => onOpenProfile?.({ id: video.userId, username: video.username, displayName: video.username, avatar: video.userAvatar } as unknown as User)} aria-label={`Open ${video.username}'s profile`}>
          {video.userAvatar ? <img src={resolveMedia(video.userAvatar)} alt="" referrerPolicy="no-referrer" /> : <span />}
        </button>
        <button type="button" className="hm-vid-txt" onClick={() => onOpen(video.id)}>
          <b>{video.title}</b>
          <small>@{video.username} · {formatCompactCount(video.viewsCount || 0)} views · {formatRelativeTime(video.createdAt)}</small>
        </button>
      </div>
    </article>
  );
};

// A live stream that is on right now.
const LiveMixCard: React.FC<{ stream: LiveStreamSummary; onOpen: (s: LiveStreamSummary) => void }> = ({ stream, onOpen }) => (
  <article className="hm-card hm-live" data-testid="home-live-card" aria-label={`Live: ${stream.title || stream.host.username}`}>
    <button type="button" className="hm-live-box" onClick={() => onOpen(stream)}>
      <span className="hm-live-badge"><i />LIVE</span>
      {stream.host.avatar ? <img src={resolveMedia(stream.host.avatar)} alt="" referrerPolicy="no-referrer" /> : <span className="hm-live-ph" />}
      <span className="hm-live-txt"><b>{stream.title || `${stream.host.displayName || stream.host.username} is live`}</b><small>@{stream.host.username} · {stream.viewerCount.toLocaleString()} watching</small></span>
      <span className="hm-live-go">Watch</span>
    </button>
  </article>
);

// NOOB's own post on Home: a 3D model (curved box, turns by itself, drag to turn it) or a picture. Posted by NOOB only: the list is data/featuredPosts.ts. Like, comment, share, repost, save.
const FeaturedCard: React.FC<{ post: FeaturedPost }> = ({ post }) => {
  const [note, setNote] = useState('');
  return (
    <article className="hm-card hm-feat" data-testid="home-featured-card" aria-label={`NOOB: ${post.title}`}>
      <header className="hm-head">
        <img className="hm-ava is-pic" src="/noob-logo-circle.png" alt="" width={40} height={40} draggable={false} />
        <span className="min-w-0 flex-1">
          <span className="hm-who">NOOB<VerifiedBadge size="xs" /></span>
          <span className="hm-sub">{post.type === 'model' ? '3D model' : 'Picture'} · {ago(post.at)}</span>
        </span>
      </header>
      <div className={`hm-feat-media ${post.type === 'model' ? 'is-model' : 'is-image'}`}>
        {post.type === 'model' && post.build
          ? <React.Suspense fallback={<div className="hm-feat-wait">Loading 3D model…</div>}><ModelBox3D build={post.build} name={post.title} /></React.Suspense>
          : post.image ? <img src={post.image} alt={post.alt || post.title} loading="lazy" draggable={false} /> : null}
      </div>
      <p className="hm-body whitespace-pre-wrap break-words [overflow-wrap:anywhere]"><b>{post.title}</b> {post.caption}</p>
      <MixBar kind="featured" id={post.id} title={`NOOB: ${post.title}`} text={post.caption.slice(0, 140)} url={siteOrigin() + '/'} canManage={false} onNote={setNote} extras />
      {note && <p className="hm-note" role="status">{note}</p>}
    </article>
  );
};

export const HomeMixCard: React.FC<{ item: MixItem; currentUser: User; canManage: boolean; onRemoved: (key: string) => void; onPollChanged: (p: Poll) => void; onOpenProfile?: (u: User) => void; onOpenVideo?: (id: string) => void; onOpenLive?: (s: LiveStreamSummary) => void }> = ({ item, currentUser, canManage, onRemoved, onPollChanged, onOpenProfile, onOpenVideo, onOpenLive }) =>
  item.kind === 'anon'
    ? <AnonCard m={item.anon} currentUser={currentUser} canManage={canManage} onRemoved={() => onRemoved(mixKey(item))} />
    : item.kind === 'video'
    ? <VideoMixCard video={item.video} onOpen={(id) => onOpenVideo?.(id)} onOpenProfile={onOpenProfile} />
    : item.kind === 'featured'
    ? <FeaturedCard post={item.featured} />
    : item.kind === 'live'
    ? <LiveMixCard stream={item.stream} onOpen={(st) => onOpenLive?.(st)} />
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
  // up to ten pictures (no video); each keeps its own preview address, and the file key it got once it was uploaded (so a second try does not upload it again)
  const [photos, setPhotos] = useState<{ file: File; url: string }[]>([]);
  const uploaded = useRef(new Map<File, string>());
  const photosRef = useRef(photos);
  photosRef.current = photos;
  const fileRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => () => { photosRef.current.forEach((p) => URL.revokeObjectURL(p.url)); }, []);
  const pickPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosen: File[] = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    if (chosen.length === 0) return;
    const pictures = chosen.filter((f) => f.type.startsWith('image/'));
    const room = ANON_MAX_PICS - photos.length;
    setError(pictures.length < chosen.length ? 'Only pictures can be added (no videos).' : pictures.length > room ? `A post can have at most ${ANON_MAX_PICS} pictures.` : '');
    if (room <= 0) return;
    setPhotos((prev) => [...prev, ...pictures.slice(0, room).map((file) => ({ file, url: URL.createObjectURL(file) }))]);
  };
  const dropPhoto = (i: number) => setPhotos((prev) => { const gone = prev[i]; if (gone) URL.revokeObjectURL(gone.url); return prev.filter((_, j) => j !== i); });
  const [sent, setSent] = useState(0);
  const canPublish = !posting && (text.trim().length > 0 || photos.length > 0) && count <= ANON_MAX_LENGTH;
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
      let made: AnonMessage;
      if (photos.length > 0) {
        // each picture goes up under a file name of a time and random letters: nothing in it says who uploaded it
        const keys: string[] = [];
        for (let i = 0; i < photos.length; i++) {
          setSent(i);
          const f = photos[i].file;
          let key = uploaded.current.get(f);
          if (!key) { key = (await uploadMediaFile(f, 'posts')).objectKey; uploaded.current.set(f, key); }
          keys.push(key);
        }
        try { made = await postAnonPost(text, keys, keyRef.current); }
        catch (e) { throw /anon_post_create|schema cache|does not exist/i.test(e instanceof Error ? e.message : '') ? new Error(keys.length > 1 ? 'Several pictures in one anonymous post are not switched on yet. Please share one picture, or try again later.' : 'Anonymous pictures are not switched on yet. Please try again later, or share the words alone.') : e; }
      } else {
        made = await postAnonMessage(text, keyRef.current);
      }
      announceMixItem({ kind: 'anon', at: made.createdAt, anon: made });
      keyRef.current = newKey();
      onClose();
    } catch (e) {
      setError(friendly(e, 'Could not publish right now. Please check your connection and try again.'));
    } finally { postingRef.current = false; setPosting(false); }
  };
  return (
    <div className="hm-scrim" data-noob-keep="1" role="dialog" aria-modal="true" aria-label="Share a thought anonymously" onClick={() => { if (!posting) onClose(); }}>
      <div className="hm-sheet" data-testid="anon-composer" onClick={(e) => e.stopPropagation()}>
        <div className="hm-sheet-head">
          <h2><VenetianMask className="w-5 h-5" aria-hidden="true" />Share anonymously</h2>
          <button type="button" onClick={() => { if (!posting) onClose(); }} aria-label="Close" className="hm-ib" data-no-hit="1"><X className="w-5 h-5" /></button>
        </div>
        <label htmlFor="hm-anon-text" className="sr-only">Your anonymous thought</label>
        <textarea id="hm-anon-text" value={text} onChange={(e) => onType(e.target.value)} placeholder="Say what is on your mind…" rows={4} autoFocus className="hm-field" />
        {photos.length > 0 && (
          <div className="hm-prevs" data-testid="anon-photo-preview">
            {photos.map((p, i) => (
              <div key={p.url} className="hm-prev">
                <img src={p.url} alt={`Picture ${i + 1} of ${photos.length}`} />
                <button type="button" onClick={() => dropPhoto(i)} disabled={posting} aria-label={`Remove picture ${i + 1}`} className="hm-ib" data-no-hit="1"><X className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={pickPhoto} data-testid="anon-photo-input" />
        {photos.length < ANON_MAX_PICS && (
          <button type="button" onClick={() => fileRef.current?.click()} disabled={posting} className="hm-act hm-add" data-testid="anon-add-photo"><ImagePlus className="w-4 h-4" aria-hidden="true" />{photos.length ? `Add more pictures (${photos.length} of ${ANON_MAX_PICS})` : 'Add pictures'}</button>
        )}
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
          {posting ? (photos.length ? `Uploading ${Math.min(sent + 1, photos.length)} of ${photos.length}…` : 'Publishing…') : 'Publish anonymously'}
        </button>
      </div>
    </div>
  );
};
