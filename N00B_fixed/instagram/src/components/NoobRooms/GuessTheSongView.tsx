import React, { useEffect, useRef, useState } from 'react';
import { X, Music2, Trophy, Play, Pause, Check, Plus, Trash2, Youtube, Bot, Users, Crown } from 'lucide-react';
import { User } from '../../types';
import type { SongGuessRound, SongGuessLeaderboardEntry } from '../../types';
import {
  fetchSongGuessRound,
  submitSongGuess,
  fetchSongGuessLeaderboard,
  subscribeToSongGuessRound,
  joinSongGuessPresence,
  adminAddSongGuessTrack,
  adminListSongGuessTracks,
  adminDeleteSongGuessTrack
} from '../../services/api';
import type { AdminSongGuessTrack, SongGuessPresenceEntry } from '../../services/api';
import { can } from '../../adminAccess';
import { AvatarMedia } from '../Common/AvatarMedia';
import { VerifiedBadge } from '../Common/VerifiedBadge';

// Pulls a video id out of any pasted YouTube URL form (watch?v=, youtu.be/, shorts/, embed/), or
// passes through a bare 11-character id typed directly.
function extractYoutubeId(input: string): string | null {
  const s = input.trim();
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtube\.com\/shorts\/|youtube\.com\/embed\/|youtu\.be\/)([A-Za-z0-9_-]{11})/,
    /^([A-Za-z0-9_-]{11})$/
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) return m[1];
  }
  return null;
}

// Loads the YouTube IFrame Player API script exactly once per page load.
let ytApiPromise: Promise<void> | null = null;
function loadYoutubeApi(): Promise<void> {
  if ((window as any).YT?.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve) => {
    const prevReady = (window as any).onYouTubeIframeAPIReady;
    (window as any).onYouTubeIframeAPIReady = () => { prevReady?.(); resolve(); };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  });
  return ytApiPromise;
}

interface GuessTheSongViewProps {
  currentUser: User;
  onClose: () => void;
}

// Global, single-round, no-voice guessing game: a clip plays, 4 title options are shown, first
// answer per round locks in, correct = +1 point. Lazy-advance-on-read, same pattern as Daily NOOB —
// whichever client's local countdown reaches zero first is the one that triggers the next round via
// get_song_guess_round(); everyone else just receives it over the realtime UPDATE on that one row.
export const GuessTheSongView: React.FC<GuessTheSongViewProps> = ({ currentUser, onClose }) => {
  const [round, setRound] = useState<SongGuessRound | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [playing, setPlaying] = useState(false);
  // Pro (the game's host persona) plays the clip first and keeps the options hidden until it's
  // done — guessing from the title list before you've even heard the song defeats the point.
  const [optionsRevealed, setOptionsRevealed] = useState(false);
  const [error, setError] = useState('');
  const [leaderboard, setLeaderboard] = useState<SongGuessLeaderboardEntry[]>([]);
  const [showAdmin, setShowAdmin] = useState(false);
  const [presence, setPresence] = useState<Record<string, SongGuessPresenceEntry>>({});
  const [secondsLeft, setSecondsLeft] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ytContainerRef = useRef<HTMLDivElement | null>(null);
  const ytPlayerRef = useRef<any>(null);
  const ytPauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ytReady, setYtReady] = useState(false);
  const isAdmin = can(currentUser, 'moderate_content');

  const load = async () => {
    const r = await fetchSongGuessRound();
    setRound(r);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    const unsub = subscribeToSongGuessRound(() => void load());
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Schedules exactly one local re-check right when this round's timer runs out — whichever open
  // client gets there first is the one whose call actually advances the shared round.
  useEffect(() => {
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    if (!round?.phaseEndsAt) return;
    const ms = Math.max(500, new Date(round.phaseEndsAt).getTime() - Date.now() + 300);
    advanceTimerRef.current = setTimeout(() => void load(), ms);
    return () => { if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current); };
  }, [round?.roundNumber, round?.phaseEndsAt]);

  // Who else currently has this screen open — a plain presence channel, nothing ever written to a
  // table, gone the instant this view closes.
  useEffect(() => {
    const stop = joinSongGuessPresence(
      { id: currentUser.id, username: currentUser.username, avatar: currentUser.avatar || '', isVerified: currentUser.isVerified },
      setPresence
    );
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A purely visual, once-a-second countdown of this round's remaining time — the actual advance is
  // still driven by the single setTimeout above, this is just so the screen shows it ticking down.
  useEffect(() => {
    if (!round?.phaseEndsAt) { setSecondsLeft(0); return; }
    const endsAt = new Date(round.phaseEndsAt).getTime();
    const tick = () => setSecondsLeft(Math.max(0, Math.round((endsAt - Date.now()) / 1000)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [round?.phaseEndsAt]);

  // Keeps the inline Top 3 card fresh — right when a new round starts, and right after this device
  // answers (since a correct guess changes standings immediately).
  useEffect(() => {
    void fetchSongGuessLeaderboard(3).then(setLeaderboard);
  }, [round?.roundNumber, !!round?.myAnswer]);

  useEffect(() => {
    setPlaying(false);
    setOptionsRevealed(false);
    audioRef.current?.pause();
    if (ytPauseTimerRef.current) clearTimeout(ytPauseTimerRef.current);
  }, [round?.roundNumber]);

  // Builds (and tears down) a hidden YouTube player for the current round's track. Kept off-screen —
  // the actual video usually shows the title/artist as on-screen graphics, which would hand out the
  // answer — the visible "Playing from YouTube" button below is what the user actually sees.
  useEffect(() => {
    if (!round?.youtubeVideoId) { setYtReady(false); return; }
    let cancelled = false;
    setYtReady(false);
    void loadYoutubeApi().then(() => {
      if (cancelled || !ytContainerRef.current) return;
      ytPlayerRef.current?.destroy?.();
      ytPlayerRef.current = new (window as any).YT.Player(ytContainerRef.current, {
        width: 2, height: 2,
        videoId: round.youtubeVideoId,
        playerVars: { controls: 0, disablekb: 1, modestbranding: 1, rel: 0, fs: 0, iv_load_policy: 3, playsinline: 1 },
        events: { onReady: () => { if (!cancelled) setYtReady(true); } }
      });
    });
    return () => {
      cancelled = true;
      ytPlayerRef.current?.destroy?.();
      ytPlayerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round?.roundNumber, round?.youtubeVideoId]);

  const handlePlay = () => {
    if (round?.youtubeVideoId) {
      const player = ytPlayerRef.current;
      if (!player || !ytReady) return;
      if (ytPauseTimerRef.current) clearTimeout(ytPauseTimerRef.current);
      player.seekTo(round.clipStartSeconds || 0, true);
      player.playVideo();
      setPlaying(true);
      setOptionsRevealed(false);
      ytPauseTimerRef.current = window.setTimeout(() => { player.pauseVideo(); setPlaying(false); setOptionsRevealed(true); }, (round.clipLengthSeconds || 10) * 1000);
      return;
    }
    if (!round?.clipUrl) return;
    const audio = audioRef.current;
    if (!audio) return;
    const start = () => {
      audio.currentTime = round.clipStartSeconds || 0;
      void audio.play();
      setPlaying(true);
      setOptionsRevealed(false);
      window.setTimeout(() => { audio.pause(); setPlaying(false); setOptionsRevealed(true); }, (round.clipLengthSeconds || 10) * 1000);
    };
    if (audio.readyState >= 1) start();
    else audio.addEventListener('loadedmetadata', start, { once: true });
  };

  const handleGuess = async (index: number) => {
    if (!round || round.myAnswer || submitting) return;
    setSubmitting(true);
    const res = await submitSongGuess(round.roundNumber, index);
    setSubmitting(false);
    if (!res.success) { setError(res.error || 'Could not submit your guess.'); return; }
    void load();
  };

  const liveCount = Object.keys(presence).length;
  const ROUND_SECONDS = 20; // matches the backend's phase_ends_at = now() + interval '20 seconds'
  const timerPct = Math.max(0, Math.min(100, (secondsLeft / ROUND_SECONDS) * 100));

  const RANK_STYLE = ['from-amber-400 to-yellow-500 text-black', 'from-zinc-300 to-zinc-400 text-black', 'from-amber-700 to-orange-800 text-white'];
  const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-b from-purple-950/30 via-zinc-950 to-zinc-950 flex flex-col">
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-zinc-800/80 bg-zinc-950/95 backdrop-blur-xl">
        <h1 className="text-base font-black italic tracking-tighter text-white flex items-center gap-2">
          <Music2 className="w-4.5 h-4.5 text-purple-400" /> Guess the Song
        </h1>
        <div className="flex items-center gap-1.5">
          {isAdmin && (
            <button onClick={() => setShowAdmin(true)} className="p-1.5 text-zinc-400 hover:text-white rounded-full hover:bg-zinc-900 cursor-pointer" title="Manage songs">
              <Plus className="w-4.5 h-4.5" />
            </button>
          )}
          {liveCount > 0 && (
            <span className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {liveCount} live
            </span>
          )}
          <button onClick={onClose} className="p-1.5 text-zinc-400 hover:text-white rounded-full hover:bg-zinc-900 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6 flex flex-col items-center">
        {loading ? (
          <div className="py-16 text-center text-zinc-500 text-xs">Loading…</div>
        ) : !round || !round.tracksReady ? (
          <div className="py-16 flex flex-col items-center gap-2 text-center text-zinc-500 max-w-xs">
            <Music2 className="w-8 h-8 text-zinc-700" />
            <p className="text-xs">Not enough songs have been added yet — check back soon.</p>
          </div>
        ) : (
          <div className="w-full max-w-sm space-y-5">
            <div className="text-center">
              <p className="text-[11px] text-zinc-500">Your score</p>
              <p className="text-2xl font-black text-[#00FF66]">{round.myScore}</p>
            </div>

            {/* Live players — who else currently has this screen open */}
            {liveCount > 0 && (
              <div className="flex items-center justify-center gap-2.5">
                <div className="flex -space-x-2.5">
                  {Object.values(presence)
                    .slice(0, 5)
                    .map((p: SongGuessPresenceEntry) => (
                      <AvatarMedia
                        key={p.userId}
                        src={p.avatar}
                        alt={p.username}
                        className="w-6 h-6 rounded-full object-cover border-2 border-zinc-950 shrink-0"
                      />
                    ))}
                </div>
                <p className="text-[11px] text-zinc-400 flex items-center gap-1">
                  <Users className="w-3 h-3" /> {liveCount} playing now
                </p>
              </div>
            )}

            {/* Pro — the host persona, with a round countdown along the bottom edge */}
            <div className="relative rounded-3xl border border-fuchsia-500/20 bg-gradient-to-br from-fuchsia-500/10 via-zinc-900/60 to-purple-900/10 p-4 overflow-hidden">
              <div className="flex items-center gap-2.5">
                <div className="relative shrink-0">
                  {playing && <div className="absolute inset-0 rounded-full bg-fuchsia-500/30 animate-ping" />}
                  <div className="relative w-10 h-10 rounded-full bg-gradient-to-br from-fuchsia-500 to-purple-600 flex items-center justify-center shadow-[0_0_14px_rgba(217,70,239,0.4)]">
                    <Bot className="w-5 h-5 text-white" />
                  </div>
                </div>
                <p className="text-xs text-zinc-300 text-left">
                  <span className="font-black text-fuchsia-300">Pro</span>{' '}
                  {round.myAnswer
                    ? 'Next song coming up…'
                    : playing
                    ? `is playing ${round.clipLengthSeconds}s of the track…`
                    : optionsRevealed
                    ? 'Alright — who sang it? Take your pick!'
                    : 'is ready to play a clip. Tap below to start.'}
                </p>
              </div>
              {secondsLeft > 0 && (
                <div className="mt-3 h-1 rounded-full bg-zinc-800 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-fuchsia-500 to-purple-500 transition-all duration-1000 ease-linear" style={{ width: `${timerPct}%` }} />
                </div>
              )}
            </div>

            {round.youtubeVideoId && (
              <div className="flex items-center justify-center gap-1.5 text-[10px] text-zinc-500">
                <Youtube className="w-3.5 h-3.5 text-red-500 shrink-0" />
                Audio streamed via YouTube — full credit to the original artists & YouTube
              </div>
            )}

            {round.youtubeVideoId ? (
              <>
                <div className="absolute w-px h-px overflow-hidden opacity-0 pointer-events-none" aria-hidden>
                  <div ref={ytContainerRef} />
                </div>
                <button
                  onClick={handlePlay}
                  disabled={!ytReady}
                  className="w-full flex items-center justify-center gap-2 py-5 rounded-3xl bg-gradient-to-br from-red-500/20 to-purple-500/5 border border-red-500/30 text-red-200 font-bold cursor-pointer disabled:opacity-50"
                >
                  {playing ? <Pause className="w-6 h-6" /> : <Youtube className="w-6 h-6" />}
                  {playing ? 'Playing from YouTube…' : ytReady ? `Play ${round.clipLengthSeconds}s clip` : 'Loading…'}
                </button>
              </>
            ) : (
              <>
                <audio ref={audioRef} src={round.clipUrl || undefined} preload="metadata" />
                <button
                  onClick={handlePlay}
                  className="w-full flex items-center justify-center gap-2 py-5 rounded-3xl bg-gradient-to-br from-purple-500/20 to-purple-500/5 border border-purple-500/30 text-purple-200 font-bold cursor-pointer"
                >
                  {playing ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
                  {playing ? 'Playing…' : `Play ${round.clipLengthSeconds}s clip`}
                </button>
              </>
            )}

            {(optionsRevealed || round.myAnswer) ? (
              <div className="space-y-2">
                {round.options.map((opt, i) => {
                  const isMyChoice = round.myAnswer?.chosenIndex === i;
                  const answered = !!round.myAnswer;
                  const isRevealedCorrect = answered && round.revealedTitle === opt;
                  return (
                    <button
                      key={i}
                      onClick={() => void handleGuess(i)}
                      disabled={answered || submitting}
                      className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border text-left text-sm font-bold cursor-pointer disabled:cursor-default transition-colors ${
                        answered
                          ? isRevealedCorrect
                            ? 'bg-[#00FF66]/15 border-[#00FF66]/50 text-[#00FF66]'
                            : isMyChoice
                            ? 'bg-red-500/15 border-red-500/50 text-red-300'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-500'
                          : 'bg-zinc-900 border-zinc-800 text-white hover:border-purple-500/50'
                      }`}
                    >
                      <span
                        className={`w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-black shrink-0 ${
                          answered && isRevealedCorrect ? 'bg-[#00FF66] text-black' : answered && isMyChoice ? 'bg-red-400 text-black' : 'bg-zinc-800 text-zinc-400'
                        }`}
                      >
                        {OPTION_LETTERS[i]}
                      </span>
                      <span className="flex-1">{opt}</span>
                      {isRevealedCorrect && <Check className="w-4 h-4 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-center text-[11px] text-zinc-600">Pro will show the 4 options once the clip finishes.</p>
            )}

            {round.myAnswer && (
              <p className="text-center text-xs text-zinc-400">
                {round.myAnswer.isCorrect ? '🎉 Correct! +1,000,000 NOOB Points credited instantly.' : `Not quite — it was "${round.revealedTitle}".`} Next song coming up…
              </p>
            )}
            {error && <p className="text-center text-[11px] text-red-400">{error}</p>}

            {/* Top 3 leaderboard — always visible, not hidden behind a tap */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-3.5 space-y-2.5">
              <h2 className="text-xs font-bold text-white flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5 text-amber-400" /> Top 3
              </h2>
              {leaderboard.length === 0 ? (
                <p className="text-center text-[11px] text-zinc-500 py-3">No one has scored yet — be the first!</p>
              ) : (
                <div className="space-y-1.5">
                  {leaderboard.map((e, i) => (
                    <div key={e.userId} className={`flex items-center gap-2.5 p-2 rounded-xl ${e.userId === currentUser.id ? 'bg-[#00FF66]/10 border border-[#00FF66]/30' : 'bg-zinc-900/60'}`}>
                      <span className={`w-5 h-5 rounded-full bg-gradient-to-br ${RANK_STYLE[i] || 'from-zinc-700 to-zinc-800 text-zinc-300'} flex items-center justify-center text-[10px] font-black shrink-0`}>
                        {i === 0 ? <Crown className="w-3 h-3" /> : i + 1}
                      </span>
                      <AvatarMedia src={e.avatar} alt={e.username} className="w-7 h-7 rounded-full object-cover shrink-0" />
                      <span className="flex-1 text-xs font-bold text-white truncate flex items-center gap-1">
                        @{e.username} {e.isVerified && <VerifiedBadge size="xs" />}
                      </span>
                      <span className="text-xs font-black text-[#00FF66]">{e.points}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showAdmin && <AdminSongManager onClose={() => setShowAdmin(false)} />}
    </div>
  );
};

const AdminSongManager: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [tracks, setTracks] = useState<AdminSongGuessTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [youtubeLink, setYoutubeLink] = useState('');
  const [clipStart, setClipStart] = useState(0);
  const [clipLength, setClipLength] = useState(10);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => { adminListSongGuessTracks().then((t) => { setTracks(t); setLoading(false); }); };
  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    const videoId = extractYoutubeId(youtubeLink);
    if (!title.trim() || !videoId) { setError('Add a title and a valid YouTube link.'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await adminAddSongGuessTrack(title.trim(), artist.trim(), videoId, clipStart, clipLength);
      if (!res.success) { setError(res.error || 'Could not add that song.'); return; }
      setTitle(''); setArtist(''); setYoutubeLink(''); setClipStart(0); setClipLength(10);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that song.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this song from the guessing pool?')) return;
    await adminDeleteSongGuessTrack(id);
    setTracks((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <div className="fixed inset-0 z-[95] bg-zinc-950 flex flex-col">
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-zinc-800/80">
        <h2 className="text-sm font-bold text-white">Manage songs ({tracks.length})</h2>
        <button onClick={onClose} className="text-zinc-400 hover:text-white cursor-pointer"><X className="w-5 h-5" /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 max-w-md mx-auto w-full">
        <div className="space-y-2 p-3.5 rounded-2xl border border-zinc-800 bg-zinc-900/40">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Song title" className="w-full bg-black rounded-xl border border-zinc-700 px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#00FF66]" />
          <input value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="Artist (optional)" className="w-full bg-black rounded-xl border border-zinc-700 px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#00FF66]" />
          <input value={youtubeLink} onChange={(e) => setYoutubeLink(e.target.value)} placeholder="YouTube link (youtube.com/watch?v=... or youtu.be/...)" className="w-full bg-black rounded-xl border border-zinc-700 px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#00FF66]" />
          <div className="flex gap-2">
            <label className="flex-1 text-[10px] text-zinc-400">
              Clip starts at (s)
              <input type="number" min={0} value={clipStart} onChange={(e) => setClipStart(Math.max(0, Number(e.target.value) || 0))} className="w-full mt-1 bg-black rounded-xl border border-zinc-700 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#00FF66]" />
            </label>
            <label className="flex-1 text-[10px] text-zinc-400">
              Clip length (s)
              <input type="number" min={1} value={clipLength} onChange={(e) => setClipLength(Math.max(1, Number(e.target.value) || 5))} className="w-full mt-1 bg-black rounded-xl border border-zinc-700 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#00FF66]" />
            </label>
          </div>
          {error && <p className="text-[11px] text-red-400">{error}</p>}
          <button onClick={handleAdd} disabled={saving} className="w-full py-2.5 rounded-xl bg-[#00FF66] text-black font-bold text-xs disabled:opacity-40 cursor-pointer">
            {saving ? 'Adding…' : 'Add song'}
          </button>
          <p className="text-[10px] text-zinc-500">Paste the YouTube video's link — need at least 4 songs in the pool for the game to start.</p>
        </div>

        {loading ? (
          <p className="text-center text-xs text-zinc-500 py-6">Loading…</p>
        ) : (
          <div className="space-y-1.5">
            {tracks.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-zinc-900/60">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate flex items-center gap-1">
                    {t.youtubeVideoId && <Youtube className="w-3 h-3 text-red-400 shrink-0" />} {t.title}
                  </p>
                  <p className="text-[10px] text-zinc-500 truncate">{t.artist || 'Unknown artist'} • {t.clipStartSeconds}s–{t.clipStartSeconds + t.clipLengthSeconds}s</p>
                </div>
                <button onClick={() => void handleDelete(t.id)} className="p-1.5 text-zinc-500 hover:text-red-400 rounded-full hover:bg-zinc-900 cursor-pointer shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
