import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Trash2, Image as ImageIcon, ChevronDown, ChevronLeft, Users, Globe, Lock, Clock } from 'lucide-react';
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
import './fun.css';
import './mood.css';

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
  p.avatar ? <img src={p.avatar} alt="" referrerPolicy="no-referrer" className="md-ava" />
           : <div className="md-ava is-letter" aria-hidden="true">{p.displayName.slice(0, 1).toUpperCase()}</div>
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
    <div className="fx-stack-sm">
      {kind === 'community' && (
        <div className="md-chips no-scrollbar" role="group" aria-label="Filter by mood">
          <button type="button" onClick={() => setFilter(null)} aria-pressed={filter === null} className="md-chip">All</button>
          {MOODS.map((m) => (
            <button key={m.id} type="button" onClick={() => setFilter(m.id)} aria-pressed={filter === m.id} aria-label={m.label} className="md-chip"><span aria-hidden="true">{m.emoji}</span>{m.label}</button>
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
      {status === 'ready' && items.length > 0 && (
        <div className="md-list">
          {items.map((p) => {
            const info = moodInfo(p.mood);
            return (
              <button key={p.userId} type="button" onClick={() => onOpenProfile?.(asUser(p))} className="md-person">
                <PersonAvatar p={p} />
                <span className="md-person-main">
                  <span className="md-person-name"><span className="md-trunc">{p.displayName}</span>{p.isVerified && <VerifiedBadge size="xs" />}</span>
                  <span className="md-person-sub md-trunc">@{p.username} · {timeAgo(p.updatedAt)}</span>
                  {p.note && <span className="md-person-note">{p.note}</span>}
                </span>
                <span className="md-person-mood" aria-label={info.label}>
                  <span className="md-person-emoji" aria-hidden="true">{info.emoji}</span>
                  <span className="md-person-label">{info.label}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
      {status === 'ready' && hasMore && (
        <div className="fx-more">
          <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="fx-btn-ghost is-auto"><BusyLabel busy={loadingMore}><ChevronDown className="w-4 h-4" aria-hidden="true" /> Load more</BusyLabel></button>
        </div>
      )}
      {toast}
    </div>
  );
};

export interface MoodClassicProps extends FunPageProps { onBack?: () => void }

const MoodClassic: React.FC<MoodClassicProps> = ({ currentUser, onLogin, onOpenProfile, onBack }) => {
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
  const showDock = !!currentUser && loaded && !loadError;

  return (
    <div className="fx-root md-root md-classic edge-own z-[96]" role="region" aria-label="Mood Status">
      <div className="md-bar">
        <div className="md-bar-row">
          {onBack ? (
            <button type="button" aria-label="Go back" onClick={onBack} className="md-back"><ChevronLeft className="w-6 h-6" aria-hidden="true" /></button>
          ) : <span className="md-back-gap" />}
          <div className="md-bar-text">
            <h1 className="md-bar-title">Mood Status</h1>
            <p className="md-bar-sub">Tell people how you feel today</p>
          </div>
        </div>
      </div>
      <div className="fx-wrap">
        <div className={`md-body${showDock ? ' has-dock' : ''}`}>
          {!currentUser ? (
            <LoginPrompt what="share how you feel and see the moods of your friends" onLogin={onLogin} />
          ) : (
            <>
              {loadError && <ErrorState text={loadError} onRetry={() => void loadMine()} />}
              {!loaded && !loadError && <SkeletonCards count={1} label="Loading your mood" />}

              {loaded && info && mine && (
                <Card ariaLabel="Your mood">
                  <div className="md-mine">
                    <div className="md-mine-tile" aria-hidden="true">{info.emoji}</div>
                    <div className="md-mine-main">
                      <p className="md-eyebrow">Your mood right now</p>
                      <p className="md-mine-label">{info.label}</p>
                      {mine.note && <p className="md-mine-note">{mine.note}</p>}
                    </div>
                  </div>
                  <div className="md-meta">
                    <span className="md-meta-chip"><Lock className="w-3.5 h-3.5" aria-hidden="true" />Seen by: {visLabel}</span>
                    <span className="md-meta-chip"><Clock className="w-3.5 h-3.5" aria-hidden="true" />{expiryText(mine.expiresAt)}</span>
                    <span className="md-meta-plain">Updated {timeAgo(mine.updatedAt)}</span>
                  </div>
                  <div className="fx-acts md-acts">
                    {mine.visibility !== 'only_me' && (
                      <button type="button" onClick={() => void story()} disabled={sharing} className="fx-act"><BusyLabel busy={sharing}><ImageIcon className="w-4 h-4" aria-hidden="true" />Share as Story</BusyLabel></button>
                    )}
                    <button type="button" onClick={() => void remove()} disabled={removing} className="fx-act is-warn"><BusyLabel busy={removing}><Trash2 className="w-4 h-4" aria-hidden="true" />Remove my mood</BusyLabel></button>
                  </div>
                </Card>
              )}

              {loaded && (
                <Card ariaLabel="Pick your mood">
                  <div>
                    <h2 className="fx-card-title">{mine ? 'Change your mood' : 'How are you feeling?'}</h2>
                    <p className="md-hint">Nothing is shared until you press the button below.</p>
                  </div>
                  <div className="md-grid" role="radiogroup" aria-label="Mood">
                    {MOODS.map((m) => {
                      const on = pick === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          onClick={() => setPick(m.id)}
                          className="md-tile"
                        >
                          <span className="md-tile-emoji" aria-hidden="true">{m.emoji}</span>
                          <span className="md-tile-label">{m.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="fx-field">
                    <label htmlFor="mood-note" className="fx-label">Add a short note (optional)</label>
                    <input
                      id="mood-note"
                      value={note}
                      onChange={(e) => { const chars = Array.from(e.target.value); setNote(chars.length > MOOD_NOTE_MAX ? chars.slice(0, MOOD_NOTE_MAX).join('') : e.target.value); }}
                      placeholder="What is on your mind?"
                      className="fx-input"
                    />
                    <p className="fx-count" aria-live="polite">{count} / {MOOD_NOTE_MAX}</p>
                  </div>

                  <div className="fx-field">
                    <p className="fx-label" id="mood-who">Who can see it</p>
                    <div className="fx-rules" role="radiogroup" aria-labelledby="mood-who">
                      {VISIBILITY_OPTIONS.map((v) => {
                        const on = visibility === v.id;
                        return (
                          <button key={v.id} type="button" role="radio" aria-checked={on} onClick={() => setVisibility(v.id)} className="fx-rule">
                            <span className="fx-rule-t">{v.label}</span>
                            <small>{v.hint}</small>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="fx-field">
                    <p className="fx-label">How long it stays</p>
                    <div className="md-pills" role="radiogroup" aria-label="How long it stays">
                      {EXPIRY_OPTIONS.map((o) => {
                        const on = expireHours === o.hours;
                        return <button key={String(o.hours)} type="button" role="radio" aria-checked={on} onClick={() => setExpireHours(o.hours)} className="fx-pill">{o.label}</button>;
                      })}
                    </div>
                  </div>
                </Card>
              )}

              <section aria-label="Moods" className="fx-section">
                <h2 className="fx-h2">Moods around you</h2>
                <div className="fx-seg" role="tablist" aria-label="Whose moods">
                  <button type="button" role="tab" aria-selected={tab === 'friends'} onClick={() => setTab('friends')} className="fx-seg-btn">People I follow</button>
                  <button type="button" role="tab" aria-selected={tab === 'community'} onClick={() => setTab('community')} className="fx-seg-btn">Community</button>
                </div>
                <MoodList key={tab} kind={tab} onOpenProfile={onOpenProfile} refreshKey={refreshKey} />
              </section>
            </>
          )}
        </div>
      </div>

      {showDock && (
        <div className="md-dock">
          <div className="fx-wrap">
            <button type="button" onClick={() => void save()} disabled={!changed || saving} className="fx-btn">
              <BusyLabel busy={saving}>{mine ? 'Update my mood' : 'Share my mood'}</BusyLabel>
            </button>
          </div>
        </div>
      )}
      {toast}
    </div>
  );
};

export default MoodClassic;
