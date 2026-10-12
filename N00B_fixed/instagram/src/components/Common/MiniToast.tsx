import React, { useEffect, useState } from 'react';

// A small message at the bottom of the screen (fires on the "noob-toast" window event, see utils/likeSync.ts). Disappears by itself.
export const MiniToast: React.FC = () => {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let timer: number | undefined;
    const show = (e: Event) => {
      setText(String((e as CustomEvent).detail || ''));
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setText(null), 3200);
    };
    window.addEventListener('noob-toast', show);
    return () => { window.removeEventListener('noob-toast', show); window.clearTimeout(timer); };
  }, []);
  if (!text) return null;
  return (
    <div className="fixed left-1/2 -translate-x-1/2 bottom-24 z-[300] px-4 py-2 rounded-full bg-zinc-900/95 border border-zinc-700 text-xs font-bold text-white shadow-xl max-w-[90vw] text-center pointer-events-none" role="status">
      {text}
    </div>
  );
};
