import React, { useEffect, useRef, useState } from 'react';
import { Maximize2 } from 'lucide-react';

// A game that lives on its own website (Neon Alley: Last Call, made with Manus) shown inside the game window.
// It is added to the page as soon as the game's page opens, out of sight, so the download (the first time it is big) is already running while the person looks at the pictures;
// pressing Play only brings it into view. The game shows its own loading bar. It is boxed in (no way to navigate or take over NOOB), and it brings its own music,
// so the Games page's arcade loop is stopped while it is open (see GamesView).
interface HostedGameFrameProps {
  url: string;
  title: string;
  /** false while the person is still on the game's page (loading in the background), true once Play was pressed. */
  visible: boolean;
}

export const HostedGameFrame: React.FC<HostedGameFrameProps> = ({ url, title, visible }) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);

  // The keyboard goes to the game as soon as it is brought into view.
  useEffect(() => { if (visible) frameRef.current?.focus(); }, [visible]);

  const goFullscreen = () => {
    const el = boxRef.current;
    if (el && el.requestFullscreen) void el.requestFullscreen().catch(() => undefined);
  };
  const canFullscreen = typeof document !== 'undefined' && !!document.fullscreenEnabled;

  return (
    <div className={visible ? 'space-y-2' : 'fixed left-[-10000px] top-0 w-[800px] h-[450px] opacity-0 pointer-events-none'} aria-hidden={!visible}>
      <div ref={boxRef} className="relative w-full overflow-hidden rounded-2xl bg-black" style={visible ? { height: 'clamp(300px, calc(100dvh - 200px), 720px)' } : { height: '100%' }}>
        <iframe
          ref={frameRef}
          title={title}
          src={url}
          allow="autoplay; fullscreen; gamepad"
          allowFullScreen
          referrerPolicy="no-referrer"
          // boxed in: it can run and keep its own saved data, but cannot navigate NOOB or open anything but pop-ups the person asked for
          sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-popups allow-fullscreen"
          onLoad={() => setLoaded(true)}
          className="block w-full h-full border-0 bg-black"
        />
        {visible && !loaded && (
          <div className="absolute inset-0 bg-black flex flex-col items-center justify-center gap-3 text-center px-6 pointer-events-none">
            <div className="w-9 h-9 rounded-full border-4 border-pink-400/30 border-t-pink-400 animate-spin" />
            <span className="text-sm font-black text-pink-300">Loading {title}…</span>
          </div>
        )}
        {visible && loaded && canFullscreen && (
          <button
            onClick={goFullscreen}
            aria-label="Full screen"
            className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 border border-white/20 text-white flex items-center justify-center cursor-pointer"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        )}
      </div>
      {visible && (
        <p className="text-center text-[10px] text-zinc-500">
          Tip: it plays best sideways. Stuck on loading?{' '}
          <a href={url} target="_blank" rel="noopener noreferrer" className="underline text-zinc-300">Open the game on its own</a>
        </p>
      )}
    </div>
  );
};
