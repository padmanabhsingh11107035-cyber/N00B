import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, Flame, CheckCircle2, Crown, Upload, Heart, RefreshCw, Clock, Trophy, Trash2 } from 'lucide-react';
import { User, DailyChallenge, DailyChallengeEntry, DailyChampion } from '../../types';
import { AvatarMedia } from '../Common/AvatarMedia';
import { VerifiedBadge } from '../Common/VerifiedBadge';
import { formatRelativeTime } from '../../utils/formatTime';
import { can, isMainAdmin } from '../../adminAccess';
import { useResumeState } from '../../utils/useResumeState';
import { forceStripColour } from '../../utils/statusStrip';
import './dailyNoob.css';
import {
  fetchDailyChallenge,
  submitDailyChallengeEntry,
  voteDailyChallengeEntry,
  fetchDailyChallengeEntries,
  fetchDailyChampions,
  deleteDailyChallengeEntry,
  adminAssignDailyChallengeWinners,
  uploadMediaFile,
  fetchUserById
} from '../../services/api';

interface DailyNoobViewProps {
  currentUser: User;
  onClose: () => void;
  onNavigateToProfile?: (user: User) => void;
}

// Counts down to the next UTC midnight — the server settles "today" by its own current_date, which
// is UTC, so the countdown has to match that or it would lie about when voting actually closes.
const useMidnightCountdown = (): { label: string; frac: number } => {
  const [label, setLabel] = useState('');
  const [frac, setFrac] = useState(0);
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const nextMidnightUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
      const ms = Math.max(0, nextMidnightUtc - now.getTime());
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      setLabel(`${h}h ${m}m left`);
      setFrac(Math.min(1, Math.max(0, 1 - ms / 86400000)));
    };
    tick();
    const interval = setInterval(tick, 30000);
    return () => clearInterval(interval);
  }, []);
  return { label, frac };
};

export const DailyNoobView: React.FC<DailyNoobViewProps> = ({ currentUser, onClose, onNavigateToProfile }) => {
  const [tab, setTab] = useResumeState<'today' | 'hallOfFame'>(currentUser.id, 'daily', 'tab', 'today');
  const [challenge, setChallenge] = useState<DailyChallenge | null>(null);
  const [entries, setEntries] = useState<DailyChallengeEntry[]>([]);
  const [champions, setChampions] = useState<DailyChampion[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [caption, setCaption] = useResumeState(currentUser.id, 'daily', 'caption', '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { label: countdown, frac: dayFrac } = useMidnightCountdown();
  // the strip behind the phone's clock takes the page colour (dark or light), and is given back when the page is left
  useEffect(() => {
    const paint = () => forceStripColour(document.documentElement.getAttribute('data-theme') === 'light' ? '#fbf5ec' : '#0e0b0a');
    paint();
    const mo = new MutationObserver(paint);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => { mo.disconnect(); forceStripColour(null); };
  }, []);

  const load = async () => {
    setLoading(true);
    const c = await fetchDailyChallenge();
    setChallenge(c);
    if (c) setEntries(await fetchDailyChallengeEntries(c.challengeDate));
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (tab === 'hallOfFame' && champions.length === 0) fetchDailyChampions().then(setChampions);
  }, [tab, champions.length]);

  const handlePickFile = (file: File) => {
    setError('');
    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');
    if (!isVideo && !isImage) {
      setError('Pick a photo or a video.');
      return;
    }
    setPickedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleSubmit = async () => {
    if (!pickedFile) return;
    setSubmitting(true);
    setError('');
    try {
      const mediaType: 'image' | 'video' = pickedFile.type.startsWith('video/') ? 'video' : 'image';
      const uploaded = await uploadMediaFile(pickedFile, 'daily');
      const res = await submitDailyChallengeEntry({ mediaUrl: uploaded.url, mediaType, caption: caption.trim() });
      if (!res.success) throw new Error(res.error || 'Could not submit your entry.');
      setPickedFile(null);
      setPreviewUrl('');
      setCaption('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit your entry.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVote = async (entry: DailyChallengeEntry) => {
    if (entry.userId === currentUser.id) return;
    const prevVoteId = challenge?.myVoteEntryId;
    setChallenge((c) => (c ? { ...c, myVoteEntryId: entry.id } : c));
    setEntries((prev) =>
      prev.map((e) => {
        if (e.id === entry.id) return { ...e, votesCount: e.votesCount + 1 };
        if (e.id === prevVoteId) return { ...e, votesCount: Math.max(0, e.votesCount - 1) };
        return e;
      })
    );
    const res = await voteDailyChallengeEntry(entry.id);
    if (!res.success) {
      setError(res.error || 'Could not cast your vote.');
      await load();
    }
  };

  const isMasterAdmin = can(currentUser, 'moderate_content');

  // The NOOB admin can crown today's top three straight from the entries, instead of waiting for the votes: tap 1st / 2nd / 3rd under
  // an entry, then "Assign & pay out" (10,000 / 5,000 / 2,500 points; the day is then settled for good).
  const canCrown = isMainAdmin(currentUser);
  const [picks, setPicks] = useState<{ first?: string; second?: string; third?: string }>({});
  const [crowning, setCrowning] = useState(false);
  const rankOf = (userId: string): 1 | 2 | 3 | null => (picks.first === userId ? 1 : picks.second === userId ? 2 : picks.third === userId ? 3 : null);
  const togglePick = (userId: string, rank: 1 | 2 | 3) => {
    setPicks((prev) => {
      const next = { ...prev };
      // the same person can only hold one place, and a place only has one person
      (['first', 'second', 'third'] as const).forEach((k) => { if (next[k] === userId) delete next[k]; });
      const key = rank === 1 ? 'first' : rank === 2 ? 'second' : 'third';
      if (prev[key] !== userId) next[key] = userId;
      return next;
    });
  };
  const nameOf = (userId?: string) => entries.find((e) => e.userId === userId)?.username;
  const handleCrown = async () => {
    if (!challenge || !picks.first) return;
    const summary = `1st @${nameOf(picks.first)} (10,000 pts)` + (picks.second ? `
2nd @${nameOf(picks.second)} (5,000 pts)` : '') + (picks.third ? `
3rd @${nameOf(picks.third)} (2,500 pts)` : '');
    if (!confirm(`Pay out and close today's challenge?

${summary}

This cannot be undone.`)) return;
    setCrowning(true);
    setError('');
    const res = await adminAssignDailyChallengeWinners(challenge.challengeDate, picks.first, picks.second || null, picks.third || null);
    setCrowning(false);
    if (res.success) { setPicks({}); setChampions([]); await load(); }
    else setError(res.error || 'Could not assign the winners.');
  };

  const handleDelete = async (entry: DailyChallengeEntry) => {
    if (!confirm("Delete this entry? This can't be undone.")) return;
    const res = await deleteDailyChallengeEntry(entry.id);
    if (res.success) await load();
    else setError(res.error || 'Could not delete your entry.');
  };

  const leadId = entries.reduce<DailyChallengeEntry | null>((best, e) => (e.votesCount > 0 && (!best || e.votesCount > best.votesCount) ? e : best), null)?.id;
  const ringLen = 2 * Math.PI * 26;

  return (
    <div className="dn edge-own" data-noob-keep="1" role="dialog" aria-label="Daily NOOB" data-testid="daily-noob-page">
      <header className="dn-bar">
        <div className="dn-bar-in">
          <button type="button" onClick={onClose} className="dn-back" aria-label="Back" data-testid="daily-back"><ChevronLeft className="w-5 h-5" /></button>
          <div className="dn-brand">
            <span className="dn-flame" aria-hidden="true"><Flame className="w-5 h-5" /></span>
            <h1 className="dn-name min-w-0">Daily NOOB<small>One challenge a day</small></h1>
          </div>
        </div>
      </header>

      <div className="dn-segrow">
        <div>
          <div className="dn-seg" role="tablist" data-on={tab === 'hallOfFame' ? 'hall' : 'today'}>
            <i aria-hidden="true" />
            {([['today', 'Today'], ['hallOfFame', 'Hall of Fame']] as [typeof tab, string][]).map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="dn-scroll">
        {tab === 'today' ? (
          loading ? (
            <div className="dn-msg"><span className="dn-spin" aria-hidden="true" />Loading today's challenge</div>
          ) : !challenge ? (
            <div className="dn-msg">Could not load today's challenge. Try again shortly.</div>
          ) : (
            <div className="dn-col">
              <section className="dn-hero">
                <div className="dn-hero-top">
                  <span className="dn-kick">Today's NOOB</span>
                  <div className="dn-ring" role="img" aria-label={countdown}>
                    <svg viewBox="0 0 64 64" aria-hidden="true"><circle className="t" cx="32" cy="32" r="26" /><circle className="v" cx="32" cy="32" r="26" strokeDasharray={`${ringLen * (1 - dayFrac)} ${ringLen}`} /></svg>
                    <span>{countdown.replace(' left', '').replace(' ', '\n')}</span>
                  </div>
                </div>
                <p className="dn-prompt">{challenge.prompt}</p>
                <div className="dn-hero-foot">
                  <span className="dn-chip"><Clock className="w-3.5 h-3.5 shrink-0" /> {countdown}</span>
                  <span className="dn-chip"><b>{entries.length}</b> {entries.length === 1 ? 'entry' : 'entries'}</span>
                </div>
              </section>

              <div className="dn-prizes" aria-label="Prizes">
                {([[1, '10,000', '1st'], [2, '5,000', '2nd'], [3, '2,500', '3rd']] as const).map(([r, pts, w]) => (
                  <div key={r} className="dn-prize"><span className="dn-medal" data-r={r} aria-hidden="true">{r}</span><b>{pts}</b><span>{w} place</span></div>
                ))}
              </div>

              {error && <div className="dn-err" role="alert">{error}</div>}

              {!challenge.hasSubmitted ? (
                <div className="dn-form">
                  <input ref={fileInputRef} type="file" accept="image/*,video/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePickFile(f); e.target.value = ''; }} />
                  {previewUrl ? (
                    <div className="dn-pre">
                      {pickedFile?.type.startsWith('video/') ? <video src={previewUrl} controls /> : <img src={previewUrl} alt="Your entry" />}
                      <button type="button" onClick={() => fileInputRef.current?.click()}>Change</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="dn-drop" data-testid="daily-pick">
                      <span className="dn-drop-ico" aria-hidden="true"><Upload className="w-6 h-6" /></span>
                      <b>Enter today's challenge</b>
                      <span>Pick a photo or a video</span>
                    </button>
                  )}
                  {pickedFile && <input value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={200} placeholder="Add a caption (optional)" aria-label="Caption" className="dn-input" />}
                  {pickedFile && (
                    <button type="button" onClick={handleSubmit} disabled={submitting} className="dn-go">
                      {submitting ? <RefreshCw className="w-4 h-4 animate-spin shrink-0" /> : null}
                      <span className="block min-w-0 truncate">{submitting ? 'Entering' : 'Enter the challenge'}</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="dn-done"><CheckCircle2 className="w-6 h-6" /><span className="block min-w-0">You are in. Share the page, and let people vote before the day ends.</span></div>
              )}

              {canCrown && (picks.first || picks.second || picks.third) && (
                <div className="dn-crown">
                  <p>
                    {picks.first ? `1st @${nameOf(picks.first)}` : '1st: not chosen yet'}
                    {picks.second ? ` · 2nd @${nameOf(picks.second)}` : ''}
                    {picks.third ? ` · 3rd @${nameOf(picks.third)}` : ''}
                  </p>
                  <div className="dn-crown-row">
                    <button type="button" onClick={() => setPicks({})} className="dn-ghost">Clear</button>
                    <button type="button" onClick={handleCrown} disabled={!picks.first || crowning} className="dn-pay">{crowning ? 'Paying out' : 'Assign and pay out'}</button>
                  </div>
                  {!picks.first && <small>Choose a 1st place first. 2nd and 3rd are optional.</small>}
                </div>
              )}

              <div className="dn-h"><h2>Entries</h2><span>{entries.length}</span></div>
              {entries.length === 0 ? (
                <div className="dn-empty"><Flame className="w-7 h-7" />No entries yet. Be the first.</div>
              ) : (
                <div className="dn-grid">
                  {entries.map((entry) => {
                    const isMine = entry.userId === currentUser.id;
                    const didVote = challenge.myVoteEntryId === entry.id;
                    const pickRank = rankOf(entry.userId);
                    return (
                      <article key={entry.id} className="dn-entry" data-lead={leadId === entry.id ? '1' : undefined}>
                        <div className="dn-media">
                          {entry.mediaType === 'video' ? <video src={entry.mediaUrl} controls preload="metadata" /> : <img src={entry.mediaUrl} alt={entry.caption || `Entry by @${entry.username}`} loading="lazy" decoding="async" />}
                          {leadId === entry.id && <span className="dn-lead"><Crown className="w-3.5 h-3.5" /> Leading</span>}
                          {pickRank && <span className="dn-rank" data-r={pickRank}>{pickRank}</span>}
                        </div>
                        <div className="dn-meta">
                          <button type="button" onClick={() => { void fetchUserById(entry.userId).then((u) => u && onNavigateToProfile?.(u)); }} className="dn-who">
                            <AvatarMedia src={entry.userAvatar} alt={entry.username} className="dn-av" />
                            <span className="block min-w-0">
                              <span className="dn-un"><span className="block min-w-0 truncate">@{entry.username}</span>{entry.isVerified && <VerifiedBadge size="xs" />}</span>
                              {entry.caption && <span className="dn-cap block min-w-0 truncate">{entry.caption}</span>}
                            </span>
                          </button>
                          {(isMine || isMasterAdmin) && (
                            <button type="button" onClick={() => handleDelete(entry)} title="Delete this entry" aria-label="Delete this entry" className="dn-del"><Trash2 className="w-4 h-4" /></button>
                          )}
                          <button type="button" onClick={() => handleVote(entry)} disabled={isMine} aria-pressed={didVote} aria-label={`Vote, ${entry.votesCount} votes`} title={isMine ? "You can't vote for your own entry" : 'Vote for this entry'} className="dn-vote">
                            <Heart className={`w-4 h-4 ${didVote ? 'fill-current' : ''}`} /> {entry.votesCount}
                          </button>
                        </div>
                        {canCrown && (
                          <div className="dn-make">
                            <span>Make</span>
                            {([1, 2, 3] as const).map((rank) => (
                              <button key={rank} type="button" data-r={rank} aria-pressed={pickRank === rank} onClick={() => togglePick(entry.userId, rank)}>{rank === 1 ? '1st' : rank === 2 ? '2nd' : '3rd'}</button>
                            ))}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          )
        ) : (
          <div className="dn-col">
            {champions.length === 0 ? (
              <div className="dn-empty"><Trophy className="w-8 h-8" />No champions yet. Check back after today's challenge ends.</div>
            ) : (
              <div className="dn-champs">
                {champions.map((c, i) => (
                  <div key={c.challengeDate} className="dn-champ" data-first={i === 0 ? '1' : undefined}>
                    <div className="dn-champ-av">
                      <AvatarMedia src={c.userAvatar} alt={c.username} className="" />
                      <Crown className="dn-crownico w-5 h-5 fill-current" />
                    </div>
                    <div className="dn-champ-t">
                      <div className="dn-un"><span className="block min-w-0 truncate">@{c.username}</span>{c.isVerified && <VerifiedBadge size="xs" />}</div>
                      <p className="dn-champ-p">{c.prompt}</p>
                      <p className="dn-champ-m">{formatRelativeTime(c.challengeDate)} · {c.votesCount} votes</p>
                      {c.podium && c.podium.length > 1 && (
                        <div className="dn-pod">
                          {c.podium.filter((p) => p.rank > 1).map((p) => (
                            <span key={p.rank}><i data-r={p.rank}>{p.rank}</i><span className="block min-w-0 truncate">@{p.username}</span></span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
