import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Heart, Pause, Play, Repeat, Shuffle, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react';
import { useMusicPlayer } from '../../context/MusicPlayerContext';
import { coverTint, fallbackTint, tintGlow, tintGradient, type CoverTint } from '../../utils/coverColor';

/** Keys: A, W, left arrow and "," = the song before; D, S, right arrow and "." = the next song (not while someone is typing). */
export function useSongKeys(enabled: boolean, handlers?: { next: () => void; prev: () => void }): void {
  const player = useMusicPlayer();
  const nextTrack = handlers?.next ?? player.nextTrack, prevTrack = handlers?.prev ?? player.prevTrack;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (['a', 'w', 'arrowleft', ','].includes(k)) { e.preventDefault(); prevTrack(); }
      else if (['d', 's', 'arrowright', '.'].includes(k)) { e.preventDefault(); nextTrack(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, nextTrack, prevTrack]);
}

// The full-screen player: the whole screen takes the colour of the cover, the sleeve sits in the middle with a vinyl record behind it (it turns while the song plays, the arm
// swings onto it), the name and the artist under it, and one glass card with shuffle, back, play / pause, next, repeat and the line that shows where the song is.
const mmss = (sec: number): string => {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

export const NowPlaying: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { tracks, currentTrack: track, isPlaying, progress, isMuted, shuffle, repeat, elapsedSec, totalSec, togglePlay, playTrack, toggleMute, toggleLike, toggleShuffle, toggleRepeat, seekTo, playbackError } = useMusicPlayer();
  const [tint, setTint] = useState<CoverTint>(() => fallbackTint(track?.title || ''));
  const calm = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // The songs are a row of pages: the one before, this one, the next one. A finger drags the whole row, so the next song is seen coming in (nothing plays yet); on letting go the row
  // settles on the nearer page and only then does that song start. The same slide is used by the back / next buttons and the keys.
  const pager = useRef<HTMLDivElement>(null);
  const [dx, setDx] = useState(0);
  const [anim, setAnim] = useState(false);
  const drag = useRef<{ x: number; y: number; id: number; on: boolean; lastX: number; lastT: number; vx: number } | null>(null);
  const busy = useRef(false);
  const nextPick = useRef(-1);
  const idx = track ? tracks.findIndex((t) => t.id === track.id) : -1;
  const many = tracks.length > 1 && idx >= 0;
  if (many && shuffle && (nextPick.current < 0 || nextPick.current === idx || nextPick.current >= tracks.length)) {
    do { nextPick.current = Math.floor(Math.random() * tracks.length); } while (nextPick.current === idx);
  }
  const before = many ? tracks[(idx - 1 + tracks.length) % tracks.length] : null;
  const after = many ? tracks[shuffle ? nextPick.current : (idx + 1) % tracks.length] : null;

  const SETTLE_MS = 330;
  const commit = (dir: 1 | -1) => {
    const target = dir === 1 ? after : before;
    if (!many || !target || busy.current) return;
    busy.current = true;
    const w = pager.current?.offsetWidth || window.innerWidth;
    setAnim(!calm);
    setDx(-dir * w);
    window.setTimeout(() => {
      setAnim(false);
      setDx(0);
      nextPick.current = -1;
      busy.current = false;
      playTrack(target);
    }, calm ? 0 : SETTLE_MS);
  };
  const snapBack = () => { setAnim(!calm); setDx(0); window.setTimeout(() => setAnim(false), SETTLE_MS); };
  const goNext = () => commit(1);
  const goPrev = () => commit(-1);

  const onDown = (e: React.PointerEvent) => {
    if (busy.current || (e.target as HTMLElement).closest('button, input, a')) return;
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId, on: false, lastX: e.clientX, lastT: performance.now(), vx: 0 };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const mx = e.clientX - d.x, my = e.clientY - d.y;
    if (!d.on) {
      if (Math.abs(mx) > 8 && Math.abs(mx) > Math.abs(my) * 1.3) { d.on = true; try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* fine without */ } }
      else return;
    }
    const now = performance.now();
    if (now > d.lastT) d.vx = 0.7 * d.vx + 0.3 * ((e.clientX - d.lastX) / (now - d.lastT));
    d.lastX = e.clientX; d.lastT = now;
    setAnim(false);
    // with no song to go to on a side, the page only gives a little (like pulling past the end of a list)
    const blocked = !many || (mx < 0 ? !after : !before);
    setDx(blocked ? mx * 0.25 : mx);
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId || !d.on) return;
    const mx = e.clientX - d.x, w = pager.current?.offsetWidth || window.innerWidth;
    const flick = Math.abs(d.vx) > 0.45 && Math.abs(mx) > 24;
    if (many && (mx < -w * 0.22 || (flick && d.vx < 0 && mx < 0))) commit(1);
    else if (many && (mx > w * 0.22 || (flick && d.vx > 0 && mx > 0))) commit(-1);
    else snapBack();
  };

  useEffect(() => {
    if (!track) return;
    let alive = true;
    setTint(fallbackTint(track.title));
    void coverTint(track.coverUrl, track.title).then((t) => { if (alive) setTint(t); });
    return () => { alive = false; };
  }, [track?.id, track?.coverUrl]);

  useSongKeys(true, { next: goNext, prev: goPrev });
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
      className="fixed inset-0 z-[110] overflow-y-auto text-white touch-pan-y"
      style={{ background: tintGradient(tint), transition: 'background 700ms ease' }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={() => { drag.current = null; snapBack(); }}
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

        {/* the songs: the one before, this one, the next one, side by side (a finger drags them all); the arm stays where it is and lands on the record while a song plays */}
        <div ref={pager} className="relative -mx-5 mt-6 overflow-hidden" data-testid="now-pager">
          <div className="grid">
            {([[-1, before], [0, track], [1, after]] as const).map(([k, t]) => t && (
              <div
                key={k}
                aria-hidden={k !== 0}
                className="[grid-area:1/1] flex flex-col items-center"
                style={{ transform: `translateX(calc(${k * 100}% + ${dx}px))`, transition: anim ? `transform ${SETTLE_MS}ms cubic-bezier(.22,.9,.3,1)` : 'none', willChange: 'transform' }}
              >
                <div className="relative w-[min(62vw,280px)] aspect-square" style={{ transform: 'translateX(-13%)' }}>
                  {k === 0 && <div aria-hidden="true" className="absolute -inset-[18%] rounded-full pointer-events-none" style={{ background: `radial-gradient(closest-side, ${tintGlow(tint)}, transparent 72%)`, filter: 'blur(14px)' }} />}
                  <div className="absolute inset-0" style={{ transform: 'translateX(30%)' }}>
                    <div className={`w-full h-full rounded-full music-vinyl ${k === 0 && isPlaying ? 'music-vinyl-playing' : ''}`} />
                  </div>
                  <img
                    src={t.coverUrl}
                    alt={k === 0 ? t.title : ''}
                    draggable={false}
                    className="relative w-full h-full rounded-[10px] object-cover bg-black/40 shadow-[0_28px_70px_rgba(0,0,0,.7)] ring-1 ring-white/10"
                  />
                </div>
                <div className="mt-9 text-center px-7 w-full">
                  <h2 className="text-[20px] font-bold tracking-tight leading-tight truncate" data-testid={k === 0 ? 'now-title' : undefined}>{t.title}</h2>
                  <p className="mt-1 text-[12px] font-medium uppercase tracking-[0.16em] text-white/50 truncate">{t.artist}</p>
                </div>
              </div>
            ))}
          </div>
          {/* the tonearm: its foot is fixed beside the record; it swings in and rests on the grooves while the song plays, and lifts away when it stops or a page is dragged */}
          <div className="absolute inset-x-0 top-0 flex justify-center pointer-events-none" aria-hidden="true">
            <div className="relative w-[min(62vw,280px)] aspect-square" style={{ transform: 'translateX(-13%)' }}>
              <svg
                viewBox="0 0 24 140"
                data-testid="tonearm"
                className="absolute"
                style={{ left: '136%', top: '-7.1%', width: '9.5%', height: '66%', transformOrigin: '50% 7.14%', transform: `translateX(-50%) rotate(${isPlaying && !dx ? 38 : 4}deg)`, transition: 'transform 900ms cubic-bezier(.35,.8,.25,1)', filter: 'drop-shadow(0 6px 6px rgba(0,0,0,.45))' }}
              >
                <defs>
                  <linearGradient id="arm-metal" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stopColor="#9aa0a8" /><stop offset=".45" stopColor="#f2f4f7" /><stop offset="1" stopColor="#8b9199" /></linearGradient>
                </defs>
                <rect x="6.5" y="0" width="11" height="9" rx="3" fill="#3a3d43" />
                <circle cx="12" cy="10" r="8.2" fill="#1d1f23" stroke="#4b4f56" strokeWidth="1.2" />
                <circle cx="12" cy="10" r="4" fill="url(#arm-metal)" />
                <rect x="10.2" y="14" width="3.6" height="104" rx="1.8" fill="url(#arm-metal)" />
                <g transform="rotate(-9 12 118)">
                  <rect x="6.5" y="116" width="11" height="17" rx="2.5" fill="#24262b" stroke="#50545b" strokeWidth="1" />
                  <rect x="9.5" y="131" width="5" height="6" rx="1" fill="#d9a441" />
                </g>
              </svg>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-6" />

        {playbackError && (
          <p role="alert" className="mb-3 text-[12px] font-semibold text-center text-white bg-black/30 rounded-xl px-3 py-2">{playbackError}</p>
        )}

        {/* the controls: one glass card */}
        <div className="rounded-3xl bg-black/30 backdrop-blur-2xl border border-white/[0.09] shadow-[0_20px_50px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)] px-4 pt-4 pb-3.5">
          <div className="flex items-center justify-between">
            <button type="button" onClick={toggleShuffle} aria-label="Shuffle" aria-pressed={shuffle} className={`w-11 h-11 rounded-full flex items-center justify-center cursor-pointer active:scale-90 transition ${shuffle ? 'text-white' : 'text-white/45'}`}>
              <Shuffle className="w-5 h-5" />
            </button>
            <button type="button" onClick={goPrev} aria-label="Previous song" className="w-11 h-11 rounded-full flex items-center justify-center text-white cursor-pointer active:scale-90 transition-transform">
              <SkipBack className="w-6 h-6 fill-white" />
            </button>
            <button type="button" onClick={() => togglePlay(track)} aria-label={isPlaying ? 'Pause' : 'Play'} data-testid="now-play" className="w-14 h-14 rounded-2xl bg-white text-black flex items-center justify-center shadow-[0_8px_24px_rgba(0,0,0,.35)] cursor-pointer active:scale-95 transition-transform">
              {isPlaying ? <Pause className="w-6 h-6 fill-black" /> : <Play className="w-6 h-6 fill-black ml-0.5" />}
            </button>
            <button type="button" onClick={goNext} aria-label="Next song" className="w-11 h-11 rounded-full flex items-center justify-center text-white cursor-pointer active:scale-90 transition-transform">
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
