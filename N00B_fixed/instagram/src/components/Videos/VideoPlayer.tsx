import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, Volume2, VolumeX, Settings, Maximize, Minimize, RotateCcw, RotateCw, ChevronRight, ChevronLeft, Check, Loader2, FastForward, Rewind } from 'lucide-react';
import type { Rendition } from '../../utils/videoQuality';
import { buildOptions, chooseAuto, dataPerMinute, readNetwork, ORIGINAL_ID, autoLabel, type QualityOption } from '../../utils/videoQuality';
import { SPEEDS, bufferedShare, clamp, countdownLeft, formatClock, keyAction, seekTo, speedLabel, tapZone } from '../../utils/videoPlayerMath';

// A video player in the style of YouTube's: tap to show the controls, double-tap the left or right side to jump 10 seconds, a seek bar that shows how much is loaded, a mute button,
// a settings menu with Quality (Auto or a chosen one, with how much data each uses) and Playback speed, fullscreen (turning the phone to landscape), and "Up next" at the end.
// Full screen is landscape, as on YouTube: Android and computers use the browser's own full screen (and lock the phone to landscape); an iPhone cannot give a web page full screen
// (only the video itself, in a portrait player of Apple's), so there the player makes its own: it covers the whole screen and, while the phone is held upright, is turned on its side
// so the picture is the right way up the moment the phone is turned (with the phone's rotation lock off the page turns by itself and the player simply fills the screen).
// In full screen the player shows YouTube's layout: the title and a back arrow on top, 10-second jumps and play in the middle, the seek bar below.
// The person's choices (muted, quality, speed) are remembered.
const KEY_MUTED = 'noob_video_muted', KEY_QUALITY = 'noob_video_quality';
const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* not remembered: harmless */ } }
};

export interface VideoPlayerProps {
  src: string;
  renditions?: Rendition[];
  poster?: string;
  durationSeconds: number;
  autoPlay?: boolean;
  /** Called once when this video starts playing (the watch is counted and written in the history). */
  onPlay?: () => void;
  /** At the end: if given, "Up next" counts down and then calls onPlayNext (unless cancelled). */
  upNext?: { title: string } | null;
  onPlayNext?: () => void;
  /** shown on top while the player is full screen */
  title?: string;
  /** the frame takes the video's own shape (a tall video is shown tall, up to 45% of the screen) instead of always 16:9 */
  adaptive?: boolean;
  className?: string;
}

type Menu = null | 'main' | 'quality' | 'speed';

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ src, renditions, poster, durationSeconds, autoPlay = true, onPlay, upNext, onPlayNext, title, adaptive = false, className = '' }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const resume = useRef<{ time: number; playing: boolean } | null>(null);
  const last = useRef({ time: 0, playing: false });   // where the video was, kept up to date, because changing the source resets it at once
  const playedOnce = useRef(false);
  const hideTimer = useRef<number | null>(null);
  const lastTap = useRef<{ at: number; zone: string } | null>(null);
  const menuRef = useRef<Menu>(null);   // read by the hide timer: the controls never hide while the settings menu is open

  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(durationSeconds || 0);
  const [, setLoaded] = useState(0);   // only to redraw the loaded part of the seek bar
  const [muted, setMuted] = useState(store.get(KEY_MUTED) === '1');
  const [volume, setVolume] = useState(1);
  const [rate, setRate] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const [menu, setMenu] = useState<Menu>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [pseudoFs, setPseudoFs] = useState(false);   // the iPhone's way of full screen (see the top of this file)
  const [vp, setVp] = useState(() => ({ w: typeof window === 'undefined' ? 0 : window.innerWidth, h: typeof window === 'undefined' ? 0 : window.innerHeight }));
  const [turnHint, setTurnHint] = useState(false);
  const [ratio, setRatio] = useState(16 / 9);
  const [choice, setChoice] = useState<string>(store.get(KEY_QUALITY) || 'auto');
  const [originalHeight, setOriginalHeight] = useState(0);
  const [originalBytes, setOriginalBytes] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [flash, setFlash] = useState<{ text: string; side: 'left' | 'right' | 'middle'; n: number } | null>(null);
  const [countdownStart, setCountdownStart] = useState<number | null>(null);
  const [, setTick] = useState(0);

  const options: QualityOption[] = useMemo(() => buildOptions(src, renditions, originalHeight, originalBytes), [src, renditions, originalHeight, originalBytes]);
  const active: QualityOption = useMemo(() => {
    if (choice !== 'auto') { const picked = options.find((o) => o.id === choice); if (picked) return picked; }
    return chooseAuto(options, readNetwork(), duration || durationSeconds);
  }, [choice, options, duration, durationSeconds]);

  // ------------------------------------------------------------------ the controls hide a few seconds after the last touch
  const poke = useCallback(() => {
    setShowControls(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => { if (videoRef.current && !videoRef.current.paused && !menuRef.current) setShowControls(false); }, 3500);
  }, []);
  useEffect(() => () => { if (hideTimer.current) window.clearTimeout(hideTimer.current); }, []);
  // opening or moving through the menu keeps the controls up; closing it starts the countdown to hide them again
  useEffect(() => { menuRef.current = menu; poke(); }, [menu, poke]);

  // ------------------------------------------------------------------ one source at a time; changing quality keeps the place and whether it was playing
  const activeUrl = active.url;
  const lastUrl = useRef(activeUrl);
  useEffect(() => {
    if (lastUrl.current === activeUrl) return;
    resume.current = { time: last.current.time, playing: last.current.playing };
    lastUrl.current = activeUrl;
    setBuffering(true);
    setFailed(false);
  }, [activeUrl]);

  const onLoadedMetadata = () => {
    const v = videoRef.current; if (!v) return;
    setDuration(Number.isFinite(v.duration) && v.duration > 0 ? v.duration : durationSeconds);
    if (active.id === ORIGINAL_ID && v.videoWidth) setOriginalHeight(Math.min(v.videoWidth, v.videoHeight));
    if (adaptive && v.videoWidth && v.videoHeight) setRatio(v.videoWidth / v.videoHeight);
    v.playbackRate = rate; v.muted = muted; v.volume = volume;
    if (resume.current) {
      const r = resume.current; resume.current = null;
      try { v.currentTime = r.time; } catch { /* not seekable yet */ }
      if (r.playing) void v.play().catch(() => undefined); else v.pause();
    }
  };

  // ------------------------------------------------------------------ actions
  const toggle = useCallback(() => {
    const v = videoRef.current; if (!v) return;
    if (v.paused || v.ended) void v.play().catch(() => { v.muted = true; setMuted(true); void v.play().catch(() => undefined); });
    else v.pause();
    poke();
  }, [poke]);
  const jump = useCallback((delta: number, side: 'left' | 'right') => {
    const v = videoRef.current; if (!v) return;
    v.currentTime = seekTo(v.currentTime, delta, v.duration);
    setFlash({ text: `${delta > 0 ? '+' : ''}${delta} s`, side, n: Date.now() });
    window.setTimeout(() => setFlash((f) => (f && Date.now() - f.n >= 600 ? null : f)), 650);
    poke();
  }, [poke]);
  const setMute = useCallback((next: boolean) => {
    const v = videoRef.current; if (v) v.muted = next;
    setMuted(next); store.set(KEY_MUTED, next ? '1' : '0');
    poke();
  }, [poke]);
  const changeVolume = (n: number) => {
    const v = videoRef.current; const x = clamp(n, 0, 1);
    if (v) { v.volume = x; if (x > 0 && v.muted) { v.muted = false; setMuted(false); } }
    setVolume(x);
  };
  const pickRate = (r: number) => { const v = videoRef.current; if (v) v.playbackRate = r; setRate(r); setMenu('main'); };
  const pickQuality = (id: string) => { setChoice(id); store.set(KEY_QUALITY, id); setMenu('main'); };

  const toggleFullscreen = useCallback(async () => {
    const w = wrapRef.current, v = videoRef.current as any; if (!w || !v) return;
    try {
      if (pseudoFs) {
        setPseudoFs(false);
      } else if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (w.requestFullscreen) {
        await w.requestFullscreen();
        // a wide video turns the phone to landscape while it is full screen
        if (v.videoWidth > v.videoHeight) { try { await (screen.orientation as any)?.lock?.('landscape'); } catch { /* not allowed here */ } }
      } else {
        // iPhone: no full screen for a page, only for the video in a portrait player of Apple's. The player makes its own, on its side.
        setVp({ w: window.innerWidth, h: window.innerHeight });
        setPseudoFs(true);
      }
    } catch { /* the browser refused */ }
  }, [pseudoFs]);
  useEffect(() => {
    const on = () => {
      const fs = !!document.fullscreenElement;
      setFullscreen(fs);
      if (!fs) { try { (screen.orientation as any)?.unlock?.(); } catch { /* nothing to undo */ } }
    };
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);

  // iPhone full screen: follow the screen's size (the address bar comes and goes, the phone turns), tell the person to turn the phone while it is upright, and let Escape leave
  useEffect(() => {
    if (!pseudoFs) { setTurnHint(false); return; }
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    on();
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPseudoFs(false); };
    window.addEventListener('keydown', onKey);
    setTurnHint(true);
    const t = window.setTimeout(() => setTurnHint(false), 4500);
    return () => { window.removeEventListener('resize', on); window.removeEventListener('orientationchange', on); window.removeEventListener('keydown', onKey); window.clearTimeout(t); };
  }, [pseudoFs]);
  const rotated = pseudoFs && vp.h > vp.w;   // held upright: the player is turned on its side
  const fsLike = fullscreen || pseudoFs;

  // the size of the file behind "original", looked up only when the menu is opened (so the quality list can say how much data each one uses)
  useEffect(() => {
    if (menu !== 'quality' || originalBytes !== null) return;
    let alive = true;
    void fetch(src, { method: 'HEAD' }).then((r) => { const n = Number(r.headers.get('content-length')); if (alive && n > 0) setOriginalBytes(n); }).catch(() => undefined);
    return () => { alive = false; };
  }, [menu, originalBytes, src]);

  // ------------------------------------------------------------------ taps
  const onSurfacePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-controls]')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    // turned on its side, the player's left-to-right is the screen's top-to-bottom
    const zone = rotated ? tapZone(e.clientY - rect.top, rect.height) : tapZone(e.clientX - rect.left, rect.width);
    const now = Date.now();
    const prev = lastTap.current;
    lastTap.current = { at: now, zone };
    if (menu) { setMenu(null); return; }
    if (prev && now - prev.at < 300 && prev.zone === zone && zone !== 'middle') { jump(zone === 'left' ? -10 : 10, zone); return; }
    if (e.pointerType === 'mouse') { toggle(); return; }              // a computer: a click plays or pauses
    if (showControls) { window.setTimeout(() => { if (lastTap.current && Date.now() - lastTap.current.at >= 290) { setShowControls(false); } }, 300); }
    else poke();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const a = keyAction(e.key); if (!a) return;
    e.preventDefault();
    const v = videoRef.current; if (!v) return;
    if (a === 'toggle') toggle();
    else if (a === 'back5') jump(-5, 'left');
    else if (a === 'forward5') jump(5, 'right');
    else if (a === 'back10') jump(-10, 'left');
    else if (a === 'forward10') jump(10, 'right');
    else if (a === 'mute') setMute(!v.muted);
    else if (a === 'fullscreen') void toggleFullscreen();
    else if (a === 'volumeUp') changeVolume(v.volume + 0.1);
    else if (a === 'volumeDown') changeVolume(v.volume - 0.1);
    else if (a === 'start') v.currentTime = 0;
    else if (a === 'end') v.currentTime = Math.max(0, (v.duration || 0) - 0.5);
    poke();
  };

  // ------------------------------------------------------------------ "Up next"
  useEffect(() => {
    if (countdownStart === null) return;
    const t = window.setInterval(() => {
      setTick((n) => n + 1);
      if (countdownLeft(countdownStart, Date.now()) <= 0) { window.clearInterval(t); setCountdownStart(null); onPlayNext?.(); }
    }, 250);
    return () => window.clearInterval(t);
  }, [countdownStart, onPlayNext]);

  const err = () => {
    // a lower-quality copy that cannot be played: back to the original; the original itself that cannot: a message
    if (active.id !== ORIGINAL_ID) { setChoice(ORIGINAL_ID); return; }
    setFailed(true); setBuffering(false);
  };

  const pct = duration > 0 ? (time / duration) * 100 : 0;
  const bufPct = bufferedShare(videoRef.current?.buffered, time, duration) * 100;
  const left = countdownStart !== null ? countdownLeft(countdownStart, Date.now()) : 0;

  return (
    <div
      ref={wrapRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onMouseMove={poke}
      style={pseudoFs
        ? (rotated
          ? { position: 'fixed', top: 0, left: 0, width: vp.h, height: vp.w, transformOrigin: 'top left', transform: `translateX(${vp.w}px) rotate(90deg)`, zIndex: 2147483000 }
          : { position: 'fixed', top: 0, left: 0, width: vp.w, height: vp.h, zIndex: 2147483000 })
        : (adaptive && !fullscreen ? { aspectRatio: String(ratio) } : undefined)}
      className={`${pseudoFs ? '' : 'relative'} bg-black text-white select-none outline-none ${fullscreen ? 'w-screen h-screen' : pseudoFs ? '' : adaptive ? 'w-full max-h-[45vh]' : 'w-full aspect-video'} ${pseudoFs ? '' : className}`}
      data-testid="video-player"
      data-fullscreen={fsLike ? (pseudoFs ? (rotated ? 'turned' : 'own') : 'browser') : undefined}
    >
      <video
        ref={videoRef}
        src={activeUrl}
        poster={poster}
        autoPlay={autoPlay}
        playsInline
        preload="auto"
        className="absolute inset-0 w-full h-full object-contain bg-black"
        data-quality={active.id}
        onLoadedMetadata={onLoadedMetadata}
        onPlay={() => { last.current.playing = true; setPlaying(true); if (!playedOnce.current) { playedOnce.current = true; onPlay?.(); } }}
        onPause={() => { last.current.playing = false; setPlaying(false); }}
        onEnded={() => { setPlaying(false); setShowControls(true); if (upNext && onPlayNext) setCountdownStart(Date.now()); }}
        onWaiting={() => setBuffering(true)}
        onPlaying={() => { setBuffering(false); setFailed(false); }}
        onCanPlay={() => setBuffering(false)}
        onTimeUpdate={(e) => { last.current.time = e.currentTarget.currentTime; setTime(e.currentTarget.currentTime); setLoaded(e.currentTarget.buffered.length); }}
        onVolumeChange={(e) => { setMuted(e.currentTarget.muted); setVolume(e.currentTarget.volume); }}
        onError={err}
      />

      {/* taps and double-taps */}
      <div className="absolute inset-0 z-10" onPointerUp={onSurfacePointerUp} data-testid="player-surface" />

      {buffering && !failed && <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none"><Loader2 className="w-10 h-10 animate-spin text-white/90" /></div>}
      {failed && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/80 text-center px-6" data-testid="player-error">
          <p className="text-sm font-bold">This video could not be played.</p>
          <button onClick={() => { setFailed(false); setBuffering(true); videoRef.current?.load(); }} className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white text-black text-xs font-black cursor-pointer"><RotateCcw className="w-3.5 h-3.5" /> Try again</button>
        </div>
      )}
      {flash && (
        <div className={`absolute top-1/2 -translate-y-1/2 z-20 pointer-events-none flex flex-col items-center gap-1 bg-white/15 backdrop-blur-sm rounded-full w-20 h-20 justify-center ${flash.side === 'left' ? 'left-[12%]' : 'right-[12%]'}`} data-testid="seek-flash">
          {flash.side === 'left' ? <Rewind className="w-6 h-6" /> : <FastForward className="w-6 h-6" />}<span className="text-[11px] font-black">{flash.text}</span>
        </div>
      )}

      {/* the big play button when it is paused */}
      {!playing && !buffering && !failed && countdownStart === null && !fsLike && (
        <button data-controls onClick={toggle} className="absolute inset-0 m-auto z-20 w-16 h-16 rounded-full bg-black/55 backdrop-blur-sm flex items-center justify-center cursor-pointer" aria-label="Play" data-testid="player-big-play"><Play className="w-8 h-8 fill-white" /></button>
      )}

      {/* Up next */}
      {countdownStart !== null && upNext && (
        <div data-controls className="absolute inset-0 z-30 bg-black/80 flex flex-col items-center justify-center gap-3 text-center px-6" data-testid="up-next">
          <p className="text-[11px] text-zinc-300 uppercase tracking-wider font-bold">Up next in {left}</p>
          <p className="text-sm font-black line-clamp-2 max-w-xs">{upNext.title}</p>
          <div className="flex gap-2">
            <button onClick={() => { setCountdownStart(null); onPlayNext?.(); }} className="px-4 py-2 rounded-full bg-white text-black text-xs font-black cursor-pointer">Play now</button>
            <button onClick={() => setCountdownStart(null)} className="px-4 py-2 rounded-full border border-white/40 text-xs font-bold cursor-pointer" data-testid="up-next-cancel">Cancel</button>
          </div>
        </div>
      )}

      {/* full screen, as on YouTube: a back arrow and the title on top, 10 seconds back / play / 10 seconds forward in the middle */}
      {fsLike && (
        <div data-controls className={`absolute inset-x-0 top-0 z-20 transition-opacity duration-200 ${showControls || !playing ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} style={rotated ? { paddingLeft: 'env(safe-area-inset-top)', paddingRight: 'env(safe-area-inset-bottom)' } : undefined} data-testid="player-fs-top">
          <div className="h-20 bg-gradient-to-b from-black/80 to-transparent absolute inset-x-0 top-0 pointer-events-none" />
          <div className="relative flex items-center gap-2 px-3 pt-3">
            <button onClick={() => void toggleFullscreen()} className="p-2 rounded-full bg-black/40 cursor-pointer" aria-label="Exit full screen" data-testid="player-fs-back"><ChevronLeft className="w-5 h-5" /></button>
            {title && <span className="text-sm font-bold truncate" data-testid="player-fs-title">{title}</span>}
          </div>
        </div>
      )}
      {fsLike && !buffering && !failed && countdownStart === null && (showControls || !playing) && (
        <div className="absolute inset-0 z-20 flex items-center justify-center gap-10 pointer-events-none" data-testid="player-fs-center">
          <button data-controls onClick={() => jump(-10, 'left')} className="pointer-events-auto relative w-12 h-12 rounded-full bg-black/45 flex items-center justify-center cursor-pointer" aria-label="Back 10 seconds"><RotateCcw className="w-7 h-7" /><span className="absolute text-[9px] font-black">10</span></button>
          <button data-controls onClick={toggle} className="pointer-events-auto w-16 h-16 rounded-full bg-black/55 flex items-center justify-center cursor-pointer" aria-label={playing ? 'Pause' : 'Play'} data-testid="player-fs-play">{playing ? <Pause className="w-8 h-8 fill-white" /> : <Play className="w-8 h-8 fill-white" />}</button>
          <button data-controls onClick={() => jump(10, 'right')} className="pointer-events-auto relative w-12 h-12 rounded-full bg-black/45 flex items-center justify-center cursor-pointer" aria-label="Forward 10 seconds"><RotateCw className="w-7 h-7" /><span className="absolute text-[9px] font-black">10</span></button>
        </div>
      )}
      {rotated && turnHint && (
        <div className="absolute top-16 inset-x-0 z-30 flex justify-center pointer-events-none" data-testid="turn-hint"><span className="px-3 py-1.5 rounded-full bg-white text-black text-xs font-black shadow-lg">Turn your phone sideways</span></div>
      )}

      {/* the controls */}
      <div data-controls className={`absolute inset-x-0 bottom-0 z-20 transition-opacity duration-200 ${showControls || !playing ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} data-testid="player-controls">
        <div className="h-16 bg-gradient-to-t from-black/85 to-transparent absolute inset-x-0 bottom-0 pointer-events-none" />
        <div className="relative px-3 pb-2 pt-6" style={rotated ? { paddingLeft: 'calc(0.75rem + env(safe-area-inset-top))', paddingRight: 'calc(0.75rem + env(safe-area-inset-bottom))' } : undefined}>
          <div className="relative h-5 flex items-center group" data-testid="player-seek">
            <div className="absolute inset-x-0 h-1 rounded-full bg-white/25 group-hover:h-1.5 transition-all">
              <div className="absolute inset-y-0 left-0 rounded-full bg-white/40" style={{ width: `${bufPct}%` }} />
              <div className="absolute inset-y-0 left-0 rounded-full bg-red-500" style={{ width: `${pct}%` }} data-testid="player-progress" />
              <div className="absolute top-1/2 -translate-y-1/2 -ml-1.5 w-3 h-3 rounded-full bg-red-500 shadow" style={{ left: `${pct}%` }} />
            </div>
            <input type="range" min={0} max={duration || 0} step={0.1} value={Math.min(time, duration || 0)} aria-label="Seek"
              onChange={(e) => { const v = videoRef.current; if (v) { v.currentTime = Number(e.target.value); setTime(Number(e.target.value)); } poke(); }}
              className="absolute inset-0 w-full opacity-0 cursor-pointer" />
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <button onClick={toggle} className="p-1.5 cursor-pointer" aria-label={playing ? 'Pause' : 'Play'} data-testid="player-play">{playing ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white" />}</button>
            <button onClick={() => setMute(!muted)} className="p-1.5 cursor-pointer" aria-label={muted ? 'Unmute' : 'Mute'} aria-pressed={muted} data-testid="player-mute">{muted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}</button>
            <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume} onChange={(e) => changeVolume(Number(e.target.value))} aria-label="Volume" className="hidden md:block w-20 accent-white" />
            <span className="text-[11px] font-semibold tabular-nums ml-1" data-testid="player-time">{formatClock(time)} / {formatClock(duration)}</span>
            <span className="flex-1" />
            <button onClick={() => setMenu(menu ? null : 'main')} className="p-1.5 cursor-pointer" aria-label="Settings" data-testid="player-settings"><Settings className="w-5 h-5" /></button>
            <button onClick={() => void toggleFullscreen()} className="p-1.5 cursor-pointer" aria-label={fsLike ? 'Exit full screen' : 'Full screen'} data-testid="player-fullscreen">{fsLike ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}</button>
          </div>
        </div>
      </div>

      {/* the settings menu: Quality and Playback speed */}
      {menu && (
        <div data-controls className="absolute right-2 bottom-14 z-30 w-60 max-h-[70%] overflow-y-auto rounded-2xl bg-zinc-900/97 border border-zinc-700 shadow-2xl text-xs py-1" role="menu" data-testid="player-menu">
          {menu === 'main' && (
            <>
              <button onClick={() => setMenu('quality')} className="w-full flex items-center justify-between px-3.5 py-2.5 hover:bg-white/10 cursor-pointer" data-testid="menu-quality"><span>Quality</span><span className="flex items-center gap-1 text-zinc-400">{choice === 'auto' ? autoLabel(active) : active.label}<ChevronRight className="w-4 h-4" /></span></button>
              <button onClick={() => setMenu('speed')} className="w-full flex items-center justify-between px-3.5 py-2.5 hover:bg-white/10 cursor-pointer" data-testid="menu-speed"><span>Playback speed</span><span className="flex items-center gap-1 text-zinc-400">{speedLabel(rate)}<ChevronRight className="w-4 h-4" /></span></button>
            </>
          )}
          {menu === 'quality' && (
            <>
              <button onClick={() => setMenu('main')} className="w-full flex items-center gap-1 px-3 py-2.5 border-b border-zinc-700 font-bold cursor-pointer"><ChevronLeft className="w-4 h-4" /> Quality</button>
              <button onClick={() => pickQuality('auto')} className="w-full flex items-center justify-between px-3.5 py-2.5 hover:bg-white/10 cursor-pointer text-left" data-testid="quality-auto">
                <span><span className="block font-semibold">{autoLabel(choice === 'auto' ? active : null)}</span><span className="block text-[10px] text-zinc-400">Chooses by your connection</span></span>{choice === 'auto' && <Check className="w-4 h-4 text-noob" />}
              </button>
              {options.map((o) => (
                <button key={o.id} onClick={() => pickQuality(o.id)} className="w-full flex items-center justify-between px-3.5 py-2.5 hover:bg-white/10 cursor-pointer text-left" data-testid={`quality-${o.id}`}>
                  <span><span className="block font-semibold">{o.label}</span><span className="block text-[10px] text-zinc-400">{dataPerMinute(o.bytes, duration || durationSeconds) || 'Data use not known'}</span></span>{choice === o.id && <Check className="w-4 h-4 text-noob" />}
                </button>
              ))}
              {options.length === 1 && <p className="px-3.5 py-2 text-[10px] text-zinc-500 leading-snug">This video has only one quality. Lower qualities are made for videos posted from now on.</p>}
            </>
          )}
          {menu === 'speed' && (
            <>
              <button onClick={() => setMenu('main')} className="w-full flex items-center gap-1 px-3 py-2.5 border-b border-zinc-700 font-bold cursor-pointer"><ChevronLeft className="w-4 h-4" /> Playback speed</button>
              {SPEEDS.map((r) => (
                <button key={r} onClick={() => pickRate(r)} className="w-full flex items-center justify-between px-3.5 py-2 hover:bg-white/10 cursor-pointer" data-testid={`speed-${r}`}><span>{speedLabel(r)}</span>{rate === r && <Check className="w-4 h-4 text-noob" />}</button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
};
