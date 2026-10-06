import React, { useEffect, useRef, useState } from 'react';
import { X, Music2, Trophy, Play, Pause, Check, Plus, Trash2 } from 'lucide-react';
import { User } from '../../types';
import type { SongGuessRound, SongGuessLeaderboardEntry } from '../../types';
import {
  fetchSongGuessRound,
  submitSongGuess,
  fetchSongGuessLeaderboard,
  subscribeToSongGuessRound,
  adminAddSongGuessTrack,
  adminListSongGuessTracks,
  adminDeleteSongGuessTrack,
  uploadMediaFile
} from '../../services/api';
import type { AdminSongGuessTrack } from '../../services/api';
import { can } from '../../adminAccess';
import { AvatarMedia } from '../Common/AvatarMedia';
import { VerifiedBadge } from '../Common/VerifiedBadge';

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
  const [error, setError] = useState('');
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboard, setLeaderboard] = useState<SongGuessLeaderboardEntry[]>([]);
  const [showAdmin, setShowAdmin] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  useEffect(() => {
    setPlaying(false);
    audioRef.current?.pause();
  }, [round?.roundNumber]);

  const handlePlay = () => {
    if (!round?.clipUrl) return;
    const audio = audioRef.current;
    if (!audio) return;
    const start = () => {
      audio.currentTime = round.clipStartSeconds || 0;
      void audio.play();
      setPlaying(true);
      window.setTimeout(() => { audio.pause(); setPlaying(false); }, (round.clipLengthSeconds || 5) * 1000);
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

  const openLeaderboard = async () => {
    setShowLeaderboard(true);
    setLeaderboard(await fetchSongGuessLeaderboard(3));
  };

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col">
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
          <button onClick={() => void openLeaderboard()} className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-bold cursor-pointer">
            <Trophy className="w-3.5 h-3.5" /> Top 3
          </button>
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

            <audio ref={audioRef} src={round.clipUrl || undefined} preload="metadata" />
            <button
              onClick={handlePlay}
              className="w-full flex items-center justify-center gap-2 py-5 rounded-3xl bg-gradient-to-br from-purple-500/20 to-purple-500/5 border border-purple-500/30 text-purple-200 font-bold cursor-pointer"
            >
              {playing ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
              {playing ? 'Playing…' : `Play ${round.clipLengthSeconds}s clip`}
            </button>

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
                    className={`w-full flex items-center justify-between gap-2 p-3.5 rounded-2xl border text-left text-sm font-bold cursor-pointer disabled:cursor-default transition-colors ${
                      answered
                        ? isRevealedCorrect
                          ? 'bg-[#00FF66]/15 border-[#00FF66]/50 text-[#00FF66]'
                          : isMyChoice
                          ? 'bg-red-500/15 border-red-500/50 text-red-300'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-500'
                        : 'bg-zinc-900 border-zinc-800 text-white hover:border-purple-500/50'
                    }`}
                  >
                    {opt}
                    {isRevealedCorrect && <Check className="w-4 h-4 shrink-0" />}
                  </button>
                );
              })}
            </div>

            {round.myAnswer && (
              <p className="text-center text-xs text-zinc-400">
                {round.myAnswer.isCorrect ? '🎉 Correct! +1 point.' : `Not quite — it was "${round.revealedTitle}".`} Next song coming up…
              </p>
            )}
            {error && <p className="text-center text-[11px] text-red-400">{error}</p>}
          </div>
        )}
      </div>

      {showLeaderboard && (
        <div className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={() => setShowLeaderboard(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full sm:max-w-xs bg-zinc-950 border border-zinc-800 rounded-t-3xl sm:rounded-3xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white flex items-center gap-1.5"><Trophy className="w-4 h-4 text-amber-400" /> Top 3</h2>
              <button onClick={() => setShowLeaderboard(false)} className="text-zinc-400 hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            {leaderboard.length === 0 ? (
              <p className="text-center text-xs text-zinc-500 py-6">No one has scored yet — be the first!</p>
            ) : (
              <div className="space-y-2">
                {leaderboard.map((e, i) => (
                  <div key={e.userId} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-zinc-900/60">
                    <span className="text-sm font-black text-zinc-500 w-4 shrink-0">{i + 1}</span>
                    <AvatarMedia src={e.avatar} alt={e.username} className="w-8 h-8 rounded-full object-cover shrink-0" />
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

      {showAdmin && <AdminSongManager onClose={() => setShowAdmin(false)} />}
    </div>
  );
};

const AdminSongManager: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [tracks, setTracks] = useState<AdminSongGuessTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [clipStart, setClipStart] = useState(0);
  const [clipLength, setClipLength] = useState(5);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => { adminListSongGuessTracks().then((t) => { setTracks(t); setLoading(false); }); };
  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!title.trim() || !file) { setError('Add a title and an audio file.'); return; }
    setSaving(true);
    setError('');
    try {
      const uploaded = await uploadMediaFile(file, 'songs');
      const res = await adminAddSongGuessTrack(title.trim(), artist.trim(), uploaded.objectKey || uploaded.url, clipStart, clipLength);
      if (!res.success) { setError(res.error || 'Could not add that song.'); return; }
      setTitle(''); setArtist(''); setFile(null); setClipStart(0); setClipLength(5);
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
          <input type="file" accept="audio/*" onChange={(e) => setFile(e.target.files?.[0] || null)} className="w-full text-xs text-zinc-400" />
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
          <p className="text-[10px] text-zinc-500">Need at least 4 songs in the pool for the game to start.</p>
        </div>

        {loading ? (
          <p className="text-center text-xs text-zinc-500 py-6">Loading…</p>
        ) : (
          <div className="space-y-1.5">
            {tracks.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-zinc-900/60">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate">{t.title}</p>
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
