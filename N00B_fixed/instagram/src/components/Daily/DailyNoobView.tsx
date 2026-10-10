import React, { useEffect, useRef, useState } from 'react';
import { X, Crown, Upload, Image as ImageIcon, Video as VideoIcon, Heart, RefreshCw, Clock, Trophy, Trash2 } from 'lucide-react';
import { User, DailyChallenge, DailyChallengeEntry, DailyChampion } from '../../types';
import { AvatarMedia } from '../Common/AvatarMedia';
import { VerifiedBadge } from '../Common/VerifiedBadge';
import { formatRelativeTime } from '../../utils/formatTime';
import { can } from '../../adminAccess';
import { useResumeState } from '../../utils/useResumeState';
import {
  fetchDailyChallenge,
  submitDailyChallengeEntry,
  voteDailyChallengeEntry,
  fetchDailyChallengeEntries,
  fetchDailyChampions,
  deleteDailyChallengeEntry,
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
const useMidnightCountdown = (): string => {
  const [label, setLabel] = useState('');
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const nextMidnightUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
      const ms = Math.max(0, nextMidnightUtc - now.getTime());
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      setLabel(`${h}h ${m}m left`);
    };
    tick();
    const interval = setInterval(tick, 30000);
    return () => clearInterval(interval);
  }, []);
  return label;
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
  const countdown = useMidnightCountdown();

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

  const handleDelete = async (entry: DailyChallengeEntry) => {
    if (!confirm("Delete this entry? This can't be undone.")) return;
    const res = await deleteDailyChallengeEntry(entry.id);
    if (res.success) await load();
    else setError(res.error || 'Could not delete your entry.');
  };

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col">
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-zinc-800/80 bg-zinc-950/95 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <h1 className="text-base font-black italic tracking-tighter text-white">🔥 Daily NOOB</h1>
        </div>
        <button onClick={onClose} className="p-1.5 text-zinc-400 hover:text-white rounded-full hover:bg-zinc-900 cursor-pointer">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="shrink-0 flex gap-2 px-4 py-2.5 border-b border-zinc-800/80">
        {([
          ['today', "Today's Challenge"],
          ['hallOfFame', 'Hall of Fame']
        ] as [typeof tab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-bold transition-colors cursor-pointer ${
              tab === key ? 'bg-white text-black' : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'today' ? (
          loading ? (
            <div className="py-16 flex items-center justify-center text-zinc-500 text-xs">Loading today's challenge…</div>
          ) : !challenge ? (
            <div className="py-16 flex items-center justify-center text-zinc-500 text-xs">Could not load today's challenge. Try again shortly.</div>
          ) : (
            <div className="max-w-2xl mx-auto px-4 py-4 space-y-5">
              <div className="rounded-2xl bg-gradient-to-br from-noob/15 via-zinc-900/80 to-zinc-950 border border-noob/40 p-4">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[10px] font-extrabold text-noob tracking-widest uppercase">Today's NOOB</span>
                  <span className="flex items-center gap-1 text-[10px] text-zinc-400 font-semibold">
                    <Clock className="w-3 h-3" /> {countdown}
                  </span>
                </div>
                <p className="text-white text-sm font-bold leading-snug">{challenge.prompt}</p>
                <p className="text-[11px] text-zinc-400 mt-2">{entries.length} {entries.length === 1 ? 'entry' : 'entries'} so far</p>
              </div>

              {error && <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-[11px] text-red-400">{error}</div>}

              {!challenge.hasSubmitted && (
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*"
                    className="sr-only"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePickFile(f); e.target.value = ''; }}
                  />
                  {previewUrl ? (
                    <div className="relative rounded-xl overflow-hidden bg-black border border-zinc-800">
                      {pickedFile?.type.startsWith('video/') ? (
                        <video src={previewUrl} controls className="w-full max-h-64" />
                      ) : (
                        <img src={previewUrl} alt="Your entry" className="w-full max-h-64 object-cover" />
                      )}
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="absolute top-2 right-2 text-[11px] font-bold text-white bg-black/70 px-2.5 py-1 rounded-full cursor-pointer"
                      >
                        Change
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full flex flex-col items-center justify-center gap-2 py-8 rounded-xl border-2 border-dashed border-zinc-700 text-zinc-400 hover:border-noob/50 hover:text-noob transition-colors cursor-pointer"
                    >
                      <Upload className="w-6 h-6" />
                      <span className="text-xs font-semibold">Tap to enter a photo or video</span>
                    </button>
                  )}
                  {pickedFile && (
                    <input
                      value={caption}
                      onChange={(e) => setCaption(e.target.value)}
                      maxLength={200}
                      placeholder="Add a caption (optional)"
                      className="w-full bg-black rounded-xl border border-zinc-700 px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-noob"
                    />
                  )}
                  {pickedFile && (
                    <button
                      onClick={handleSubmit}
                      disabled={submitting}
                      className="w-full py-3 rounded-xl bg-noob text-black font-bold text-sm disabled:opacity-40 cursor-pointer flex items-center justify-center gap-2"
                    >
                      {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
                      {submitting ? 'Entering…' : 'Enter the Challenge'}
                    </button>
                  )}
                </div>
              )}

              <div className="space-y-3">
                {entries.length === 0 ? (
                  <div className="py-10 text-center text-zinc-500 text-xs">No entries yet — be the first!</div>
                ) : (
                  entries.map((entry) => {
                    const isMine = entry.userId === currentUser.id;
                    const didVote = challenge.myVoteEntryId === entry.id;
                    return (
                      <div key={entry.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
                        <div className="relative w-full aspect-video bg-black">
                          {entry.mediaType === 'video' ? (
                            <video src={entry.mediaUrl} controls className="w-full h-full object-cover" />
                          ) : (
                            <img src={entry.mediaUrl} alt={entry.caption} className="w-full h-full object-cover" />
                          )}
                        </div>
                        <div className="p-3 flex items-center justify-between gap-2">
                          <button
                            onClick={() => { void fetchUserById(entry.userId).then((u) => u && onNavigateToProfile?.(u)); }}
                            className="flex items-center gap-2 min-w-0 cursor-pointer"
                          >
                            <AvatarMedia src={entry.userAvatar} alt={entry.username} className="w-8 h-8 rounded-full object-cover shrink-0" />
                            <div className="min-w-0 text-left">
                              <div className="flex items-center gap-1">
                                <span className="text-xs font-bold text-white truncate">@{entry.username}</span>
                                {entry.isVerified && <VerifiedBadge size="xs" />}
                              </div>
                              {entry.caption && <p className="text-[11px] text-zinc-400 truncate">{entry.caption}</p>}
                            </div>
                          </button>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {(isMine || isMasterAdmin) && (
                              <button
                                onClick={() => handleDelete(entry)}
                                title="Delete this entry"
                                className="p-1.5 text-zinc-500 hover:text-red-400 rounded-full hover:bg-zinc-900 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => handleVote(entry)}
                              disabled={isMine}
                              title={isMine ? "You can't vote for your own entry" : 'Vote for this entry'}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${
                                didVote ? 'bg-red-500/15 text-red-400 border border-red-500/40' : 'bg-zinc-900 text-zinc-300 border border-zinc-800'
                              }`}
                            >
                              <Heart className={`w-3.5 h-3.5 ${didVote ? 'fill-current' : ''}`} /> {entry.votesCount}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )
        ) : (
          <div className="max-w-2xl mx-auto px-4 py-4 space-y-3">
            {champions.length === 0 ? (
              <div className="py-16 flex flex-col items-center gap-2 text-center text-zinc-500">
                <Trophy className="w-8 h-8 text-zinc-700" />
                <p className="text-xs">No champions crowned yet — check back after today's challenge ends.</p>
              </div>
            ) : (
              champions.map((c) => (
                <div key={c.challengeDate} className="flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3">
                  <div className="relative shrink-0">
                    <AvatarMedia src={c.userAvatar} alt={c.username} className="w-11 h-11 rounded-full object-cover border-2 border-amber-400/60" />
                    <Crown className="w-4 h-4 text-amber-400 absolute -top-1.5 -right-1.5 fill-amber-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-bold text-white truncate">@{c.username}</span>
                      {c.isVerified && <VerifiedBadge size="xs" />}
                    </div>
                    <p className="text-[11px] text-zinc-400 truncate">{c.prompt}</p>
                    <p className="text-[10px] text-zinc-500 mt-0.5">{formatRelativeTime(c.challengeDate)} • {c.votesCount} votes</p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
