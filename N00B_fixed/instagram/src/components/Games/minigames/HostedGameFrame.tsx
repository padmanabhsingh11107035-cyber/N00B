import React, { useEffect, useRef, useState } from 'react';
import { Maximize2, X } from 'lucide-react';
import { brickEscapeLeaderboard, brickEscapeLevelDone, colorSortLeaderboard, colorSortLevelDone } from '../../../services/api';

// A game that is a page of its own (Neon Alley: Last Call, served from this site's /games/neon-alley/) shown inside the game window.
// It is added to the page as soon as the game's page opens, out of sight, so the download (the first time it is big) is already running while the person looks at the pictures;
// pressing Play only brings it into view. The game shows its own loading bar. It is boxed in (it cannot navigate NOOB away), and it brings its own music,
// so the Games page's arcade loop is stopped while it is open (see GamesView).
//
// Full screen: the game is made for a wide screen with its on-screen buttons at the sides. On a phone Play goes straight to full screen, and when the phone is held upright the
// game is turned sideways to fill the screen (turn the phone and it straightens by itself). Real full screen and a landscape lock are asked for too, where the phone allows it.
interface HostedGameFrameProps {
  url: string;
  title: string;
  /** false while the person is still on the game's page (loading in the background), true once Play was pressed. */
  visible: boolean;
  /** true: the frame is only created when Play is pressed (a big game whose files were already fetched quietly), instead of being kept out of sight from the start. */
  lazy?: boolean;
  /** true: the game is made to be held upright (a puzzle): full screen on a phone, but it is never turned on its side and the screen is not locked sideways. */
  portrait?: boolean;
  /** 'color-sort' / 'brick-escape': the game reports the levels a player clears and asks for the ranking; this page (which knows who is signed in) answers. */
  ranking?: 'color-sort' | 'brick-escape';
}

const useUpright = (): boolean => {
  const [upright, setUpright] = useState(() => typeof window !== 'undefined' && window.innerHeight > window.innerWidth);
  useEffect(() => {
    const update = () => setUpright(window.innerHeight > window.innerWidth);
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => { window.removeEventListener('resize', update); window.removeEventListener('orientationchange', update); };
  }, []);
  return upright;
};

export const HostedGameFrame: React.FC<HostedGameFrameProps> = ({ url, title, visible, lazy, portrait, ranking }) => {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [full, setFull] = useState(false);
  const upright = useUpright();

  const enterFull = () => {
    setFull(true);
    // where the phone allows it: really full screen, and held sideways
    try {
      const root = document.documentElement;
      if (root.requestFullscreen && !document.fullscreenElement) {
        void root.requestFullscreen().then(() => (portrait ? undefined : (screen.orientation as unknown as { lock?: (o: string) => Promise<void> })?.lock?.('landscape'))).catch(() => undefined);
      }
    } catch { /* not allowed here: the game still fills the screen */ }
  };
  const exitFull = () => {
    setFull(false);
    try {
      (screen.orientation as unknown as { unlock?: () => void })?.unlock?.();
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    } catch { /* nothing to undo */ }
  };

  // The game and this page talk by messages, only to and from this one frame on this same site: the game says "level N was cleared" and "send me the ranking".
  useEffect(() => {
    if (!ranking) return;
    const onMessage = async (e: MessageEvent) => {
      const win = frameRef.current?.contentWindow;
      if (!win || e.source !== win || e.origin !== window.location.origin) return;
      const d = e.data as { noobGame?: string; type?: string; level?: unknown } | null;
      if (!d || d.noobGame !== ranking) return;
      if (d.type === 'level-done' && typeof d.level === 'number' && Number.isInteger(d.level)) {
        await (ranking === 'color-sort' ? colorSortLevelDone : brickEscapeLevelDone)(d.level);
      } else if (d.type === 'board-request') {
        const board = await (ranking === 'color-sort' ? colorSortLeaderboard : brickEscapeLeaderboard)();
        win.postMessage({ noobGame: ranking, type: 'board', ok: !!board, board }, window.location.origin);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [ranking]);

  // The keyboard goes to the game as soon as it is brought into view; on a phone Play goes straight to full screen.
  useEffect(() => {
    if (!visible) return;
    frameRef.current?.focus();
    if (window.matchMedia?.('(pointer: coarse)').matches) enterFull();
    return () => { exitFull(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') exitFull(); };
    const onFs = () => { if (!document.fullscreenElement) setFull(false); };
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFs);
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('fullscreenchange', onFs); };
  }, [full]);

  // upright phone in full screen: the game is laid on its side and fills the screen
  const rotated = full && upright && !portrait;
  const boxStyle: React.CSSProperties = !visible
    ? { height: '100%' }
    : full
    ? rotated
      ? { position: 'fixed', top: 0, left: 0, width: '100dvh', height: '100dvw', transformOrigin: 'top left', transform: 'translateX(100dvw) rotate(90deg)', zIndex: 80 }
      : { position: 'fixed', inset: 0, zIndex: 80 }
    : { height: 'clamp(300px, calc(100dvh - 230px), 720px)' };

  return (
    <div className={visible ? 'space-y-2' : 'fixed left-[-10000px] top-0 w-[800px] h-[450px] opacity-0 pointer-events-none'} aria-hidden={!visible}>
      <div className="relative w-full overflow-hidden rounded-2xl bg-black" style={boxStyle}>
        {(visible || !lazy) && <iframe
          ref={frameRef}
          title={title}
          src={url}
          allow="autoplay; fullscreen; gamepad"
          allowFullScreen
          referrerPolicy="no-referrer"
          // boxed in: it can run and keep its own saved data, but cannot navigate NOOB away
          sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-popups"
          onLoad={() => setLoaded(true)}
          className="block w-full h-full border-0 bg-black"
        />}
        {visible && !loaded && (
          <div className="absolute inset-0 bg-black flex flex-col items-center justify-center gap-3 text-center px-6 pointer-events-none">
            <div className="w-9 h-9 rounded-full border-4 border-pink-400/30 border-t-pink-400 animate-spin" />
            <span className="text-sm font-black text-pink-300">Loading {title}…</span>
          </div>
        )}
        {visible && full && (
          <button
            onClick={exitFull}
            aria-label="Leave full screen"
            className="absolute top-1 left-1/2 -translate-x-1/2 h-6 px-2.5 rounded-full bg-black/55 border border-white/25 text-white/80 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
          >
            <X className="w-3 h-3" /> Exit
          </button>
        )}
      </div>
      {visible && !full && (
        <div className="flex items-center justify-between gap-2 px-1">
          <p className="text-[10px] text-zinc-500">
            Stuck on loading?{' '}
            <a href={url} target="_blank" rel="noopener noreferrer" className="underline text-zinc-300">Open the game on its own</a>
          </p>
          <button
            onClick={enterFull}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-pink-500/20 border border-pink-400/40 text-pink-200 text-[11px] font-bold cursor-pointer"
          >
            <Maximize2 className="w-3.5 h-3.5" /> Full screen
          </button>
        </div>
      )}
    </div>
  );
};
