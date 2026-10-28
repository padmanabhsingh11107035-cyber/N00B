import React, { useEffect, useState } from 'react';
import { ChevronDown, Heart, Pause, Play, Repeat, Shuffle, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react';
import { useMusicPlayer } from '../../context/MusicPlayerContext';
import { coverTint, fallbackTint, tintGradient, type CoverTint } from '../../utils/coverColor';

// The full-screen player: the whole screen takes the colour of the cover, the sleeve sits in the middle with a vinyl record behind it (it turns while the song plays, the arm
// swings onto it), the name and the artist under it, and one glass card with shuffle, back, play / pause, next, repeat and the line that shows where the song is.
const mmss = (sec: number): string => {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

export const NowPlaying: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { currentTrack: track, isPlaying, progress, isMuted, shuffle, repeat, elapsedSec, totalSec, togglePlay, nextTrack, prevTrack, toggleMute, toggleLike, toggleShuffle, toggleRepeat, seekTo, playbackError } = useMusicPlayer();
  const [tint, setTint] = useState<CoverTint>(() => fallbackTint(track?.title || ''));

  useEffect(() => {
    if (!track) return;
    let alive = true;
    setTint(fallbackTint(track.title));
    void coverTint(track.coverUrl, track.title).then((t) => { if (alive) setTint(t); });
    return () => { alive = false; };
  }, [track?.id, track?.coverUrl]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!track) return null;
  const total = totalSec > 0 ? totalSec : (() => { const [m, s] = (track.duration || '0:0').split(':').map(Number); return (m || 0) * 60 + (s || 0); })();
  const pct = Number.isFinite(progress) ? progress : 0;

  return (
    <div
      data-noob-keep=""
      data-testid="now-playing"
      role="dialog"
      aria-modal="true"
      aria-label="Now playing"
      className="fixed inset-0 z-[110] overflow-y-auto text-white"
      style={{ background: tintGradient(tint), transition: 'background 700ms ease' }}
    >
      <div className="mx-auto w-full max-w-md min-h-full flex flex-col px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {/* the top: close, where it comes from, like */}
        <div className="flex items-center justify-between h-10">
          <button type="button" onClick={onClose} aria-label="Close the player" className="w-10 h-10 -ml-2 rounded-full flex items-center justify-center text-white/90 hover:text-white cursor-pointer active:scale-90 transition-transform">
            <ChevronDown className="w-7 h-7" />
          </button>
          <span className="text-[12px] font-semibold text-white/70 tracking-wide">NOOB Music</span>
          <div className="flex items-center -mr-2">
            <button type="button" onClick={toggleMute} aria-label={isMuted ? 'Unmute' : 'Mute'} className="w-10 h-10 rounded-full flex items-center justify-center text-white/80 hover:text-white cursor-pointer active:scale-90 transition-transform">
              {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
            <button type="button" onClick={() => void toggleLike(track.id)} aria-label={track.isLiked ? 'Unlike' : 'Like'} aria-pressed={!!track.isLiked} className="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer active:scale-90 transition-transform">
              <Heart className={`w-6 h-6 ${track.isLiked ? 'fill-white text-white' : 'text-white/85'}`} />
            </button>
          </div>
        </div>

        {/* the sleeve, with the record behind it and the arm over it */}
        <div className="relative mt-6 mx-auto w-[min(62vw,280px)] aspect-square" style={{ transform: 'translateX(-13%)' }}>
          <div className="absolute inset-0" style={{ transform: 'translateX(30%)' }}>
            <div className={`w-full h-full rounded-full music-vinyl ${isPlaying ? 'music-vinyl-playing' : ''}`} />
          </div>
          <img
            key={track.id}
            src={track.coverUrl}
            alt={track.title}
            draggable={false}
            className="relative w-full h-full rounded-[10px] object-cover bg-black/40 shadow-[0_24px_60px_rgba(0,0,0,.55)]"
          />
          <svg viewBox="0 0 40 120" className="absolute -top-3 -right-[21%] w-[13%] pointer-events-none" aria-hidden="true" style={{ transformOrigin: '50% 8%', transform: `rotate(${isPlaying ? 0 : -26}deg)`, transition: 'transform 600ms cubic-bezier(.3,.9,.3,1)' }}>
            <circle cx="20" cy="10" r="8" fill="#c9ccd1" stroke="rgba(0,0,0,.35)" strokeWidth="1.5" />
            <path d="M20 10 L20 92 L28 112" fill="none" stroke="#d7dade" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="22" y="104" width="12" height="14" rx="2" fill="#aeb2b8" transform="rotate(-12 28 111)" />
          </svg>
        </div>

        {/* the song */}
        <div className="mt-9 text-center px-2">
          <h2 className="text-[19px] font-bold leading-tight truncate" data-testid="now-title">{track.title}</h2>
          <p className="mt-1 text-[13px] text-white/60 truncate">{track.artist}</p>
        </div>

        <div className="flex-1 min-h-6" />

        {playbackError && (
          <p role="alert" className="mb-3 text-[12px] font-semibold text-center text-white bg-black/30 rounded-xl px-3 py-2">{playbackError}</p>
        )}

        {/* the controls: one glass card */}
        <div className="rounded-3xl bg-white/10 backdrop-blur-xl border border-white/10 px-4 pt-4 pb-3.5">
          <div className="flex items-center justify-between">
            <button type="button" onClick={toggleShuffle} aria-label="Shuffle" aria-pressed={shuffle} className={`w-11 h-11 rounded-full flex items-center justify-center cursor-pointer active:scale-90 transition ${shuffle ? 'text-white' : 'text-white/45'}`}>
              <Shuffle className="w-5 h-5" />
            </button>
            <button type="button" onClick={prevTrack} aria-label="Previous song" className="w-11 h-11 rounded-full flex items-center justify-center text-white cursor-pointer active:scale-90 transition-transform">
              <SkipBack className="w-6 h-6 fill-white" />
            </button>
            <button type="button" onClick={() => togglePlay(track)} aria-label={isPlaying ? 'Pause' : 'Play'} data-testid="now-play" className="w-14 h-14 rounded-2xl bg-white text-black flex items-center justify-center shadow-[0_8px_24px_rgba(0,0,0,.35)] cursor-pointer active:scale-95 transition-transform">
              {isPlaying ? <Pause className="w-6 h-6 fill-black" /> : <Play className="w-6 h-6 fill-black ml-0.5" />}
            </button>
            <button type="button" onClick={nextTrack} aria-label="Next song" className="w-11 h-11 rounded-full flex items-center justify-center text-white cursor-pointer active:scale-90 transition-transform">
              <SkipForward className="w-6 h-6 fill-white" />
            </button>
            <button type="button" onClick={toggleRepeat} aria-label="Repeat" aria-pressed={repeat} className={`w-11 h-11 rounded-full flex items-center justify-center cursor-pointer active:scale-90 transition ${repeat ? 'text-white' : 'text-white/45'}`}>
              <Repeat className="w-5 h-5" />
            </button>
          </div>
          <div className="mt-3">
            <input
              type="range"
              min={0}
              max={100}
              step={0.1}
              value={pct}
              onChange={(e) => seekTo(Number(e.target.value))}
              aria-label="Song position"
              className="music-range w-full"
              style={{ background: `linear-gradient(to right, rgba(255,255,255,.9) ${pct}%, rgba(255,255,255,.22) ${pct}%)` }}
            />
            <div className="mt-1.5 flex justify-between text-[11px] tabular-nums text-white/55">
              <span>{mmss(elapsedSec)}</span>
              <span>{mmss(total)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
