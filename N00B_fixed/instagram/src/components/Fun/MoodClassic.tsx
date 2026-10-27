import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Trash2, Image as ImageIcon, ChevronDown, Users, Globe, Lock, Clock } from 'lucide-react';
import {
  setMyMood,
  clearMyMood,
  fetchMyMood,
  fetchFriendMoods,
  fetchCommunityMoods,
  type MoodStatus,
  type MoodPerson
} from '../../services/api';
import type { User } from '../../types';
import { MOODS, moodInfo, VISIBILITY_OPTIONS, EXPIRY_OPTIONS, MOOD_NOTE_MAX, type MoodId, type MoodVisibility } from '../../utils/moods';
import { VerifiedBadge } from '../Common/VerifiedBadge';
import { Card, EmptyState, ErrorState, SkeletonCards, LoginPrompt, BusyLabel, useToast, friendly, codePoints, timeAgo } from './funUi';
import { shareCardAsStory } from './shareCard';
import type { FunPageProps } from './types';

// Mood Status: pick how you feel, add a short note, choose who can see it (everyone, followers, only you), and let it clear itself after 24 hours if you like. Nothing is shared
// until the "Share my mood" button is pressed, and the database decides who sees what (see migration 20261016000003): a mood that is "only me" never leaves your own screen, one
// for followers is shown only to the people who noob you, and an expired one is gone for everybody. The lists below show the moods of the people you noob, and the moods
// people chose to share with everyone.

const PAGE_SIZE = 15;

const expiryText = (iso?: string | null): string => {
  if (!iso) return 'Stays until you change it';
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms) || ms <= 0) return 'Clearing now';
  const h = Math.ceil(ms / 3_600_000);
  return h <= 1 ? 'Clears within the hour' : `Clears in ${h} hours`;
};

const asUser = (p: MoodPerson): User => ({ id: p.userId, username: p.username, displayName: p.displayName, avatar: p.avatar } as unknown as User);

const PersonAvatar: React.FC<{ p: MoodPerson }> = ({ p }) => (
  p.avatar ? <img src={p.avatar} alt="" referrerPolicy="no-referrer" className="w-11 h-11 rounded-full object-cover border border-zinc-700 shrink-0" />
           : <div className="w-11 h-11 rounded-full border border-zinc-700 bg-zinc-800 flex items-center justify-center font-black shrink-0" aria-hidden="true">{p.displayName.slice(0, 1).toUpperCase()}</div>
);

const MoodList: React.FC<{ kind: 'friends' | 'community'; onOpenProfile?: (u: User) => void; refreshKey: number }> = ({ kind, onOpenProfile, refreshKey }) => {
  const [items, setItems] = useState<MoodPerson[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorText, setErrorText] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState<MoodId | null>(null);
  const loadId = useRef(0);
  const { say, toast } = useToast();

  const fetchPage = useCallback((before?: { updatedAt: string; userId: string }) => (
    kind === 'friends' ? fetchFriendMoods({ limit: PAGE_SIZE, before }) : fetchCommunityMoods({ limit: PAGE_SIZE, before, mood: filter ?? undefined })
  ), [kind, filter]);

  const load = useCallback(async () => {
    const id = ++loadId.current;
    setStatus('loading');
    try {
      const page = await fetchPage();
      if (id !== loadId.current) return;
      setItems(page.moods);
      setHasMore(page.hasMore);
      setStatus('ready');
    } catch (e) {
      if (id !== loadId.current) return;
      setErrorText(friendly(e, 'Could not load the moods. Please check your connection and try again.'));
      setStatus('error');
    }
  }, [fetchPage]);
  useEffect(() => { void load(); }, [load, refreshKey]);

  const loadMore = async () => {
    const last = items[items.length - 1];
    if (!last || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchPage({ updatedAt: last.updatedAt, userId: last.userId });
      setItems((list) => { const seen = new Set(list.map((x) => x.userId)); return [...list, ...page.moods.filter((x) => !seen.has(x.userId))]; });
      setHasMore(page.hasMore);
    } catch (e) {
      say(friendly(e, 'Could not load more.'), 'err');
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="space-y-3">
      {kind === 'community' && (
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1" role="group" aria-label="Filter by mood">
          <button type="button" onClick={() => setFilter(null)} aria-pressed={filter === null} className={`shrink-0 h-8 px-3 rounded-full border text-[11px] font-bold cursor-pointer ${filter === null ? 'bg-noob text-black border-zinc-50' : 'border-zinc-700 text-zinc-300'}`}>All</button>
          {MOODS.map((m) => (
            <button key={m.id} type="button" onClick={() => setFilter(m.id)} aria-pressed={filter === m.id} aria-label={m.label} className={`shrink-0 h-8 px-3 rounded-full border text-[11px] font-bold cursor-pointer flex items-center gap-1 ${filter === m.id ? 'bg-noob text-black border-zinc-50' : 'border-zinc-700 text-zinc-300'}`}><span aria-hidden="true">{m.emoji}</span>{m.label}</button>
          ))}
        </div>
      )}
      {status === 'loading' && <SkeletonCards count={2} label="Loading moods" />}
      {status === 'error' && <ErrorState text={errorText} onRetry={() => void load()} />}
      {status === 'ready' && items.length === 0 && (
        <EmptyState
          icon={kind === 'friends' ? <Users className="w-8 h-8" aria-hidden="true" /> : <Globe className="w-8 h-8" aria-hidden="true" />}
          title={kind === 'friends' ? 'No moods from the people you noob' : 'No community moods right now'}
          hint={kind === 'friends' ? 'When someone you noob shares how they feel with their followers, it shows up here.' : 'Moods shared with everyone show up here and clear after a day.'}
        />
      )}
      {status === 'ready' && items.map((p) => {
        const info = moodInfo(p.mood);
        return (
          <button key={p.userId} type="button" onClick={() => onOpenProfile?.(asUser(p))} className="no-doodle w-full text-left rounded-3xl bg-zinc-900 border border-zinc-800 hover:border-zinc-50 p-3.5 flex items-center gap-3 cursor-pointer transition-colors">
            <PersonAvatar p={p} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-sm font-black truncate">{p.displayName}{p.isVerified && <VerifiedBadge size="xs" />}</span>
              <span className="block text-[11px] text-zinc-500 truncate">@{p.username} · {timeAgo(p.updatedAt)}</span>
              {p.note && <span className="mt-1 block text-xs text-zinc-300 break-words [overflow-wrap:anywhere]">{p.note}</span>}
            </span>
            <span className="shrink-0 flex flex-col items-center gap-0.5 px-2" aria-label={info.label}>
              <span className="text-3xl leading-none" aria-hidden="true">{info.emoji}</span>
              <span className="text-[10px] font-bold text-zinc-400">{info.label}</span>
            </span>
          </button>
        );
      })}
      {status === 'ready' && hasMore && (
        <div className="flex justify-center">
          <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="px-6 py-3 rounded-full border border-zinc-600 hover:border-zinc-50 text-sm font-bold cursor-pointer disabled:opacity-60"><BusyLabel busy={loadingMore}><ChevronDown className="w-4 h-4" aria-hidden="true" /> Load more</BusyLabel></button>
        </div>
      )}
      {toast}
    </div>
  );
};

const MoodClassic: React.FC<FunPageProps> = ({ currentUser, onLogin, onOpenProfile }) => {
  const [mine, setMine] = useState<MoodStatus | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [pick, setPick] = useState<MoodId | null>(null);
  const [note, setNote] = useState('');
  const [visibility, setVisibility] = useState<MoodVisibility>('followers');
  const [expireHours, setExpireHours] = useState<number | null>(24);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [tab, setTab] = useState<'friends' | 'community'>('friends');
  const [refreshKey, setRefreshKey] = useState(0);
  const { say, toast } = useToast();

  const fill = (m: MoodStatus | null) => {
    setMine(m);
    if (m) { setPick(m.mood as MoodId); setNote(m.note); setVisibility(m.visibility ?? 'followers'); setExpireHours(m.expiresAt ? 24 : null); }
  };

  const loadMine = useCallback(async () => {
    setLoadError('');
    try { fill(await fetchMyMood()); setLoaded(true); }
    catch (e) { setLoadError(friendly(e, 'Could not load your mood. Please check your connection and try again.')); }
  }, []);
  useEffect(() => { if (currentUser) void loadMine(); else setLoaded(true); }, [currentUser?.id, loadMine]);

  const save = async () => {
    if (!pick || saving) return;
    setSaving(true);
    try {
      const saved = await setMyMood({ mood: pick, note, visibility, expireHours });
      fill(saved);
      setRefreshKey((k) => k + 1);
      say(visibility === 'only_me' ? 'Saved. Only you can see this mood.' : 'Your mood is shared.', 'ok');
    } catch (e) {
      say(friendly(e, 'Could not update your mood. Please try again.'), 'err');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (removing) return;
    setRemoving(true);
    try {
      await clearMyMood();
      setMine(null);
      setPick(null);
      setNote('');
      setRefreshKey((k) => k + 1);
      say('Your mood was removed.', 'ok');
    } catch (e) {
      say(friendly(e, 'Could not remove your mood.'), 'err');
    } finally {
      setRemoving(false);
    }
  };

  const story = async () => {
    if (!mine || !currentUser || sharing) return;
    const info = moodInfo(mine.mood);
    setSharing(true);
    try {
      await shareCardAsStory({ eyebrow: 'Mood', title: `${info.emoji} Feeling ${info.label.toLowerCase()}`, body: mine.note || undefined, footer: `@${currentUser.username} on NOOB SOCIALS` });
      say('Added to your Story.', 'ok');
    } catch (e) {
      say(friendly(e, 'Could not add it to your Story.'), 'err');
    } finally {
      setSharing(false);
    }
  };

  const changed = !!pick && (!mine || mine.mood !== pick || mine.note !== note.trim() || (mine.visibility ?? 'followers') !== visibility || (!!mine.expiresAt) !== (expireHours !== null));
  const count = codePoints(note);
  const info = mine ? moodInfo(mine.mood) : null;
  const visLabel = mine ? VISIBILITY_OPTIONS.find((v) => v.id === (mine.visibility ?? 'followers'))?.label : '';

  return (
    <div className="space-y-6">
      {!currentUser ? (
        <LoginPrompt what="share how you feel and see the moods of your friends" onLogin={onLogin} />
      ) : (
        <>
          {loadError && <ErrorState text={loadError} onRetry={() => void loadMine()} />}
          {!loaded && !loadError && <SkeletonCards count={1} label="Loading your mood" />}

          {loaded && info && mine && (
            <Card ariaLabel="Your mood">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl border border-zinc-700 bg-zinc-950 flex items-center justify-center text-4xl shrink-0" aria-hidden="true">{info.emoji}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Your mood right now</p>
                  <p className="text-lg font-black">{info.label}</p>
                  {mine.note && <p className="text-sm text-zinc-300 break-words [overflow-wrap:anywhere]">{mine.note}</p>}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-400">
                <span className="inline-flex items-center gap-1"><Lock className="w-3 h-3" aria-hidden="true" />Seen by: {visLabel}</span>
                <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" aria-hidden="true" />{expiryText(mine.expiresAt)}</span>
                <span>Updated {timeAgo(mine.updatedAt)}</span>
              </div>
              <div className="mt-3 flex gap-2">
                {mine.visibility !== 'only_me' && (
                  <button type="button" onClick={() => void story()} disabled={sharing} className="h-9 px-4 rounded-full border border-zinc-700 hover:border-zinc-50 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-60"><BusyLabel busy={sharing}><ImageIcon className="w-3.5 h-3.5" aria-hidden="true" />Share as Story</BusyLabel></button>
                )}
                <button type="button" onClick={() => void remove()} disabled={removing} className="h-9 px-4 rounded-full border border-zinc-700 hover:border-red-400 hover:text-red-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-60"><BusyLabel busy={removing}><Trash2 className="w-3.5 h-3.5" aria-hidden="true" />Remove my mood</BusyLabel></button>
              </div>
            </Card>
          )}

          {loaded && (
            <Card ariaLabel="Pick your mood">
              <h2 className="text-sm font-black">{mine ? 'Change your mood' : 'How are you feeling?'}</h2>
              <p className="mt-0.5 text-xs text-zinc-400">Nothing is shared until you press the button below.</p>
              <div className="mt-3 grid grid-cols-4 gap-2" role="radiogroup" aria-label="Mood">
                {MOODS.map((m) => {
                  const on = pick === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setPick(m.id)}
                      className={`aspect-square rounded-2xl border flex flex-col items-center justify-center gap-1 cursor-pointer transition-all duration-150 active:scale-95 ${on ? 'bg-noob text-black border-zinc-50 scale-105 shadow-lg' : 'bg-zinc-950 border-zinc-700 hover:border-zinc-50 hover:-translate-y-0.5'}`}
                    >
                      <span className="text-3xl leading-none" aria-hidden="true">{m.emoji}</span>
                      <span className="text-[10px] font-bold">{m.label}</span>
                    </button>
                  );
                })}
              </div>

              <label htmlFor="mood-note" className="mt-4 block text-xs font-bold text-zinc-300">Add a short note (optional)</label>
              <input
                id="mood-note"
                value={note}
                onChange={(e) => { const chars = Array.from(e.target.value); setNote(chars.length > MOOD_NOTE_MAX ? chars.slice(0, MOOD_NOTE_MAX).join('') : e.target.value); }}
                placeholder="What is on your mind?"
                className="mt-1.5 w-full h-11 rounded-xl bg-zinc-950 border border-zinc-700 focus:border-zinc-50 outline-none px-3 text-sm"
              />
              <p className="mt-1 text-right text-[11px] tabular-nums text-zinc-500" aria-live="polite">{count} / {MOOD_NOTE_MAX}</p>

              <p className="mt-2 text-xs font-bold text-zinc-300" id="mood-who">Who can see it</p>
              <div className="mt-1.5 grid grid-cols-3 gap-2" role="radiogroup" aria-labelledby="mood-who">
                {VISIBILITY_OPTIONS.map((v) => {
                  const on = visibility === v.id;
                  return (
                    <button key={v.id} type="button" role="radio" aria-checked={on} onClick={() => setVisibility(v.id)} className={`rounded-2xl border p-2.5 text-center cursor-pointer transition-colors ${on ? 'bg-noob text-black border-zinc-50' : 'bg-zinc-950 border-zinc-700 hover:border-zinc-50'}`}>
                      <span className="block text-xs font-black">{v.label}</span>
                      <span className={`block text-[10px] leading-tight mt-0.5 ${on ? 'text-black/70' : 'text-zinc-500'}`}>{v.hint}</span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 flex gap-2" role="radiogroup" aria-label="How long it stays">
                {EXPIRY_OPTIONS.map((o) => {
                  const on = expireHours === o.hours;
                  return <button key={String(o.hours)} type="button" role="radio" aria-checked={on} onClick={() => setExpireHours(o.hours)} className={`flex-1 h-10 rounded-full border text-[11px] font-bold cursor-pointer transition-colors ${on ? 'bg-noob text-black border-zinc-50' : 'border-zinc-700 text-zinc-300 hover:border-zinc-50'}`}>{o.label}</button>;
                })}
              </div>

              <button type="button" onClick={() => void save()} disabled={!changed || saving} className="mt-4 w-full h-12 rounded-full bg-noob text-black text-sm font-extrabold cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed hover:scale-[1.01] active:scale-[0.99] transition-transform">
                <BusyLabel busy={saving}>{mine ? 'Update my mood' : 'Share my mood'}</BusyLabel>
              </button>
            </Card>
          )}

          <section aria-label="Moods" className="space-y-3">
            <div className="flex gap-2" role="tablist" aria-label="Whose moods">
              <button type="button" role="tab" aria-selected={tab === 'friends'} onClick={() => setTab('friends')} className={`flex-1 h-10 rounded-full border text-xs font-bold cursor-pointer transition-all ${tab === 'friends' ? 'bg-noob text-black border-zinc-50' : 'border-zinc-700 text-zinc-300 hover:border-zinc-50'}`}>People I follow</button>
              <button type="button" role="tab" aria-selected={tab === 'community'} onClick={() => setTab('community')} className={`flex-1 h-10 rounded-full border text-xs font-bold cursor-pointer transition-all ${tab === 'community' ? 'bg-noob text-black border-zinc-50' : 'border-zinc-700 text-zinc-300 hover:border-zinc-50'}`}>Community</button>
            </div>
            <MoodList key={tab} kind={tab} onOpenProfile={onOpenProfile} refreshKey={refreshKey} />
          </section>
        </>
      )}
      {toast}
    </div>
  );
};

export default MoodClassic;
